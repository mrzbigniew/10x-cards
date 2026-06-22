---
date: 2026-06-22T00:00:00+02:00
researcher: Claude Sonnet 4.6 (Zbigniew Jędraczka)
git_commit: 00d3eb958a90c3cd8e842dad2e1497773a6fad46
branch: main
repository: 10x-cards
topic: "Jak głęboko subdomeny Core są rozsmarowane po warstwach kodu?"
tags: [research, architecture, core-domain, layer-spread, ai-generation, spaced-repetition]
status: complete
last_updated: 2026-06-22
last_updated_by: Claude Sonnet 4.6
---

# Research: Rozsmarowanie subdomen Core po warstwach

**Date**: 2026-06-22  
**Git Commit**: `00d3eb958a90c3cd8e842dad2e1497773a6fad46`  
**Branch**: main  
**Repository**: mrzbigniew/10x-cards

## Research Question

Jak głęboko dwie subdomeny **Core** (AI Flashcard Generation + Spaced Repetition Session)
są dziś rozsmarowane po warstwach kodu? Gdzie żyje logika domenowa, a gdzie wycieka
poza właściwą warstwę?

---

## Summary

Obie subdomeny Core dotykają łącznie **5 warstw** (API, service, schema, hook, DB),
ale ich profil rozsmarowania jest diametralnie różny:

| Subdomena                     | Warstwa "ciężka"          | Główny problem                                         | Czystość ogólna            |
| ----------------------------- | ------------------------- | ------------------------------------------------------ | -------------------------- |
| **AI Flashcard Generation**   | Hook (`useGeneration.ts`) | Logika domenowa propozycji wycieka do warstwy UI-state | **Średnia** — 8 przecieków |
| **Spaced Repetition Session** | Service (`sr.ts`)         | Logika kolejkowania "Again" w hooku — szara strefa     | **Dobra** — 1 szara strefa |

Kluczowy kontrast: SR Session ma algorytm FSRS czysty w serwisie, logika domenowa nie
wycieka do hooka. Generation Session ma odwrotnie — serwis jest w miarę czysty, ale hook
(`useGeneration.ts`) zawiera reguły biznesowe, które powinny być testowalną logiką
poza Reactem.

---

## Detailed Findings

### Subdomena 1: AI Flashcard Generation

**Pliki bezpośrednio zaangażowane: 9 produkcyjnych + 2 testowe**

```
src/pages/api/generate.ts           ← API endpoint
src/lib/services/generation.ts      ← serwis generowania
src/lib/schemas/generation.ts       ← Zod schemas (wejście + wyjście + deck save)
src/components/hooks/useGeneration.ts ← hook sesji generowania
src/components/generation/GenerationFlow.tsx
src/components/generation/ProposalRow.tsx
src/components/generation/ProposalList.tsx
src/components/generation/SaveDeckForm.tsx
src/components/generation/TextInputForm.tsx
src/test/generation.test.ts
src/test/useGeneration.test.ts
```

**Pliki cross-layer (nieowning, ale dotykające):**

```
src/pages/api/decks.ts              ← przyjmuje AI-generated cards
src/lib/services/decks.ts           ← wstawia z source:"ai"
```

#### Warstwa API (`src/pages/api/generate.ts`)

**Ocena: ✓ Czysta delegacja**

- Endpoint POST `/api/generate`: auth check → Zod validate → delegate to `generateProposals()` → return
- Brak logiki biznesowej; poprawny wzorzec
- Jedyną odpowiedzialnością jest HTTP boundary

#### Warstwa Service (`src/lib/services/generation.ts`, 74 linie)

**Ocena: ⚠ Pomieszane odpowiedzialności (4 przecieki)**

Serwis robi zbyt wiele:

**Przeciek #1 — tight coupling do OpenAI/OpenRouter (linia 34-37)**

```typescript
const client = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
});
```

Brak abstrakcji providera. Zamiana na inny model = modyfikacja serwisu domenowego.

**Przeciek #2 — prompt engineering jako stała w serwisie (linie 8-18)**

```typescript
const SYSTEM_PROMPT = `You are a flashcard expert...
Rules:
- Generate between 5 and 15 flashcards
...`;
```

Reguła domenowa ("5–15 kart") zakopana w stringu serwisu; nie jest łatwa do testu
ani do zmiany bez modyfikacji serwisu.

**Przeciek #3 — polskie komunikaty błędów wmieszane w logikę (linie 51, 58, 63, 67)**

```typescript
throw new GenerationError("Generowanie AI nie jest skonfigurowane...");
throw new GenerationError("Żądanie do AI nie powiodło się: " + message);
throw new GenerationError("AI zwróciło nieprawidłową odpowiedź...");
```

i18n strings w kodzie domenowym zamiast w osobnym module wiadomości.

**Przeciek #4 — parsowanie JSON + walidacja Zod + sprawdzenie długości sprzężone (linie 54-72)**

```typescript
let parsed: unknown;
try { parsed = JSON.parse(content); } catch { ... }
const result = z.array(ProposalSchema).safeParse(parsed);
if (!result.success) { ... }
if (result.data.length === 0) { ... }
```

Trzy odrębne kroki (parse, validate, check) bez wyodrębnienia do pomocniczej funkcji.

#### Warstwa Schema (`src/lib/schemas/generation.ts`, 34 linie)

**Ocena: ⚠ Błędna organizacja (nie przeciek logiki)**

Plik zawiera schemas niezwiązane z generowaniem:

```typescript
// Linie 17-26: POWINNY BYĆ W schemas/decks.ts
export const NewDeckSaveSchema = z.object({ ... });
export const ExistingDeckSaveSchema = z.object({ ... });
export const SaveDeckRequestSchema = z.union([...]);
```

`ProposalSchema` jest używany w dwóch miejscach: serwisie (walidacja odpowiedzi AI)
i API `/api/decks` (walidacja body save). Funkcjonalnie OK, organizacyjnie mylące.

#### Warstwa Hook (`src/components/hooks/useGeneration.ts`, 128 linii)

**Ocena: ✗ GŁÓWNY PROBLEM — logika domenowa w warstwie UI-state (4 przecieki)**

To jest największy problem architektury subdomenowej Generation. Hook zawiera:

**Przeciek #5 — reguły cyklu życia propozycji (linie 65-70)**

```typescript
const bulkAccept = useCallback(() => {
  setProposals((prev) => prev.map((p) => (p.status === "pending" ? { ...p, status: "accepted" as const } : p)));
}, []);
```

Reguła "bulk accept zmienia tylko `pending`, nie `editing`" to niezmiennik domenowy
(R-4 z domain distillation). Nie można go przetestować bez mockowania React.

**Przeciek #6 — orkiestracja zapisu z filtrowaniem (linie 73-106)**

```typescript
const accepted = proposals
  .filter((p) => p.status === "accepted")
  .map((p) => ({
    front: p.editedFront ?? p.front,
    back: p.editedBack ?? p.back,
  }));
```

Reguła "tylko accepted, z edytowaną treścią" to logika domenowa (wymieniona w
domain distillation jako egzekwowany niezmiennik agregatu GenerationSession).
Linia `p.editedFront ?? p.front` decyduje, który wariant karty trafia do DB.

**Przeciek #7 — dispatch custom eventu jako side-effect (linia 98)**

```typescript
window.dispatchEvent(new CustomEvent("deck-saved"));
```

Sprzęga hook z systemem odświeżania listy decków. Trudny do testu; należy zwracać
`deckId` i pozwolić komponentowi obsłużyć zdarzenie.

**Skutek testowania**: `useGeneration.test.ts` testuje `bulkAccept`/`bulkReject`
jako zachowanie hooka — w praktyce to testy reguł domenowych opakowane w React.
Przepisanie na czysty serwis domenowy pozwoliłoby na testy jednostkowe bez renderera.

#### Warstwa DB (`supabase/migrations/`)

**Ocena: ✓ Minimalna i poprawna**

Generation subdomen nie ma własnych tabel. Jedyny ślad to:

- kolumna `source text NOT NULL CHECK (source IN ('ai', 'manual'))` w tabeli `cards`
- trigger `after_card_insert` auto-tworzy `card_sr_state` dla każdej nowej karty
  (dotyczy też kart generowanych AI)

Brak AI-specyficznych metadanych (model, prompt version, confidence) — świadome uproszczenie.

---

### Subdomena 2: Spaced Repetition Session

**Pliki bezpośrednio zaangażowane: 15 plików w 5 warstwach**

```
src/pages/api/decks/[id]/review.ts           ← GET: load due cards
src/pages/api/decks/[id]/review/[cardId].ts  ← POST: submit rating
src/lib/services/sr.ts                       ← FSRS core (133 linie)
src/lib/services/cards.ts                    ← reset SR operations
src/lib/schemas/review.ts                    ← DueQuerySchema + SubmitRatingSchema
src/components/hooks/useReviewSession.ts     ← queue management (112 linii)
src/components/ReviewModal.tsx
src/components/ReviewSession.tsx
src/components/RatingButtons.tsx
supabase/migrations/20260526220447_initial_schema.sql
supabase/migrations/20260602000000_review_session.sql
supabase/migrations/20260607000001_review_logs_deny_update_delete.sql
src/test/sr.test.ts
src/test/useReviewSession.test.ts
src/test/access-control.test.ts
```

#### Warstwa API (`src/pages/api/decks/[id]/review*.ts`)

**Ocena: ✓ Czysta delegacja**

- GET: auth → `DueQuerySchema.safeParse(url.searchParams)` → `loadDueCards()` → return
- POST: auth → `SubmitRatingSchema.safeParse(body)` → `applyRating()` → return `{sr}`
- Zero logiki biznesowej w API routes

#### Warstwa Service (`src/lib/services/sr.ts`, 133 linie)

**Ocena: ✓ Wzorcowa implementacja — rdzeń domenowy tutaj**

Pełny przepływ FSRS zamknięty w serwisie:

**`loadDueCards()` (linie 69-92)**

```typescript
const { data, error } = await supabase
  .from("card_sr_state")
  .select("*, cards!inner(id, front, back)")
  .eq("user_id", userId)
  .lte("due", dueBefore)
  .eq("cards.deck_id", deckId)
  .order("due");
```

Zapytanie posortowane wg `due` (rosnąco). Wczytuje karty z najdawniej zaplanowanymi
jako pierwsze — poprawna kolejność dla sesji.

**`applyRating()` (linie 94-132) — jedno miejsce wywołania ts-fsrs**

```typescript
const card = rowToFsrsCard(srRow);          // DB row → ts-fsrs Card
const result = scheduler.next(card, now, rating); // ← ts-fsrs tutaj, i tylko tutaj
const update = fsrsCardToDbUpdate(result.card);   // ts-fsrs Card → DB row
await supabase.from("card_sr_state").update(update)...
await supabase.from("review_logs").insert(reviewLogToDbInsert(result.log,...))
```

Czysta pipeline: load → transform → algorytm → transform back → persist + log.

**ts-fsrs jest importowane WYŁĄCZNIE w `sr.ts` (linia 1)**. Zero przecieków do hooka,
API ani komponentów.

#### Warstwa Schema (`src/lib/schemas/review.ts`, 10 linii)

**Ocena: ✓ Minimalna i poprawna**

```typescript
export const DueQuerySchema = z.object({ due_before: z.iso.datetime() });
export const SubmitRatingSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});
```

Walidacja tylko na granicach API. Serwis operuje na surowych typach.

#### Warstwa Hook (`src/components/hooks/useReviewSession.ts`, 112 linii)

**Ocena: ⚠ Szara strefa — logika kolejkowania (1 borderline case)**

Hook zarządza stanem kolejki sesji. Kluczowy fragment (linie 67-81):

```typescript
if (rating === 1) {
  // "Again" → przesuń kartę na koniec kolejki z nowym SR state
  setQueue((q) => {
    const [head, ...rest] = q;
    return [...rest, { ...head, sr: { ...head.sr, ...data.sr } }];
  });
  setAgainCount((n) => n + 1);
} else {
  // Rating 2/3/4 → usuń kartę z kolejki
  if (!reviewedIds.current.has(current.id)) {
    reviewedIds.current.add(current.id);
    setReviewedCount((n) => n + 1);
  }
  setQueue((q) => q.slice(1));
}
```

**Analiza szarej strefy**:

- Reguła "Again → koniec kolejki" to domenowy protokół sesji SR, nie czysty UI-state
- FSRS nie określa kolejkowania w ramach sesji (to decyzja implementacyjna)
- Hook testuje tę logikę jako wymaganie funkcjonalne (`useReviewSession.test.ts:86-120`)
- Brak synchronizacji stanu kolejki z serwerem — sesja jest efemeryczna

**Werdykt**: Akceptowalne dla MVP single-session. Problem pojawi się przy multi-device
sync lub persistencji sesji (wtedy kolejkowanie musi przenieść się do serwisu).

**Co JEST poprawnie w hooku**:

- Obliczanie `endOfDay` dla `dueBefore` (UI concern, nie domenowy) ✓
- Zarządzanie `submitting` flag (UI guard) ✓
- Deduplikacja `reviewedCount` przez `reviewedIds.current` Set ✓

#### Warstwa DB (`supabase/migrations/`)

**Ocena: ✓ Kompletna i poprawna, z jednym open item**

**Tabela `card_sr_state`** (`initial_schema.sql:56-87`):

- Schema 1:1 z typem `Card` z ts-fsrs
- Trigger `after_card_insert` auto-inicjuje stan SR dla każdej nowej karty
- Indeksy na `user_id` + `due` dla zapytania due-cards

**Tabela `review_logs`** (`review_session.sql:6-31`):

- Append-only audit trail; schema odpowiada `ts-fsrs.ReviewLog`
- Ograniczenia CHECK na `rating ∈ {1,2,3,4}` i `state ∈ {0,1,2,3}`

**Open item — zakomentowane policies** (`20260607000001_review_logs_deny_update_delete.sql`):

```sql
-- CREATE POLICY IF NOT EXISTS "review_logs: deny update" ON review_logs FOR UPDATE USING (false);
-- CREATE POLICY IF NOT EXISTS "review_logs: deny delete" ON review_logs FOR DELETE USING (false);
```

Policies istnieją, ale są zakomentowane (R-1 z domain distillation). Aktualnie
append-only jest wymuszone implicite (brak endpointów DELETE/UPDATE). Odkomentowanie
= defense-in-depth bez kosztu.

---

## Architecture Insights

### Wzorzec "czysta delegacja API"

Obie subdomeny Core mają API routes jako cienką warstwę HTTP:
`auth check → Zod validate → delegate to service → return JSON`

Żadna reguła biznesowa nie żyje w API routes. To wzorzec do zachowania.

### Kontrast: service vs. hook jako "właściciel domeny"

|                               | AI Generation        | SR Session         |
| ----------------------------- | -------------------- | ------------------ |
| Algorytm                      | Serwis (OpenAI call) | Serwis (ts-fsrs) ✓ |
| Reguły cyklu życia encji      | **Hook** ✗           | Serwis ✓           |
| Stan sesji                    | Hook (efemeryczny)   | Hook (efemeryczny) |
| Testowalność reguł domenowych | Wymaga React mock    | Czyste unit testy  |

SR Session jest architektonicznie dojrzalsza. Generation Session ma dług techniczny
w warstwie hookowej.

### Izolacja biblioteki zewnętrznej

`ts-fsrs` importowane WYŁĄCZNIE w `src/lib/services/sr.ts:1`. Zero wycieku do hook,
API, komponentów. Wzorcowa izolacja zewnętrznej zależności.

`openai` (SDK) nie jest tak dobrze izolowane — klient jest tworzony inline w serwisie
przy każdym wywołaniu, bez abstrakcji.

---

## Code References

| Plik                                                                    | Linie  | Co tam jest                                                    |
| ----------------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| `src/pages/api/generate.ts`                                             | 1-34   | API endpoint generowania — czysta delegacja                    |
| `src/lib/services/generation.ts`                                        | 8-18   | SYSTEM_PROMPT jako stała (przeciek #2)                         |
| `src/lib/services/generation.ts`                                        | 27-73  | `generateProposals()` — 4 odpowiedzialności                    |
| `src/lib/schemas/generation.ts`                                         | 17-26  | Deck save schemas (powinny być w schemas/decks.ts)             |
| `src/components/hooks/useGeneration.ts`                                 | 65-70  | `bulkAccept`/`bulkReject` — reguły domenowe w hooku            |
| `src/components/hooks/useGeneration.ts`                                 | 73-106 | `saveProposals()` — orkiestracja z filtrowaniem                |
| `src/components/hooks/useGeneration.ts`                                 | 98     | `window.dispatchEvent("deck-saved")` — side-effect coupling    |
| `src/pages/api/decks/[id]/review.ts`                                    | 1-37   | GET due cards — czysta delegacja                               |
| `src/pages/api/decks/[id]/review/[cardId].ts`                           | 1-43   | POST rating — czysta delegacja                                 |
| `src/lib/services/sr.ts`                                                | 1      | `import { fsrs, ... } from "ts-fsrs"` — jedyne miejsce importu |
| `src/lib/services/sr.ts`                                                | 94-132 | `applyRating()` — pełna pipeline FSRS                          |
| `src/lib/services/sr.ts`                                                | 114    | `scheduler.next(card, now, rating)` — jedyne wywołanie FSRS    |
| `src/components/hooks/useReviewSession.ts`                              | 67-81  | Queue re-queueing logic (szara strefa)                         |
| `supabase/migrations/20260526220447_initial_schema.sql`                 | 56-87  | `card_sr_state` tabela                                         |
| `supabase/migrations/20260526220447_initial_schema.sql`                 | 89-105 | Trigger auto-init SR state                                     |
| `supabase/migrations/20260607000001_review_logs_deny_update_delete.sql` | 1-2    | Zakomentowane append-only policies (R-1)                       |

---

## Mapa rozsmarowania (wizualna)

```
WARSTWA           AI GENERATION              SR SESSION
─────────────────────────────────────────────────────────
pages/api/        generate.ts ✓              review.ts ✓
                                             review/[cardId].ts ✓

lib/services/     generation.ts ⚠           sr.ts ✓✓✓
                  (4 mixed resp.)            cards.ts ✓ (reset)

lib/schemas/      generation.ts ⚠           review.ts ✓
                  (deck schemas misplaced)

components/hooks/ useGeneration.ts ✗✗       useReviewSession.ts ⚠
                  (domain logic leaked)      (queue logic: gray area)

supabase/         cards.source column ✓      card_sr_state ✓
migrations/       trigger auto-SR ✓          review_logs ✓
                                             [zakomento. policies] ⚠

LEGENDA: ✓ = czyste   ⚠ = szara strefa / organizacja   ✗ = przeciek
```

---

## Ranking problemów (priorytet do refaktoru)

| #      | Problem                                        | Plik                           | Typ          | Wpływ                                     |
| ------ | ---------------------------------------------- | ------------------------------ | ------------ | ----------------------------------------- |
| **P1** | Logika domenowa propozycji w hooku             | `useGeneration.ts:65-106`      | Przeciek     | Reguły niemożliwe do unit-testu bez React |
| **P2** | Deck-save schemas w pliku generation           | `schemas/generation.ts:17-26`  | Organizacja  | Mylące przy szukaniu schemas dla decks    |
| **P3** | Zakomentowane append-only policies             | `20260607000001...sql:1-2`     | Security gap | Brak DB-level ochrony review_logs         |
| **P4** | OpenAI klient tworzony inline, brak abstrakcji | `services/generation.ts:34-37` | Coupling     | Trudna zamiana providera                  |
| **P5** | Queue re-queueing w hooku                      | `useReviewSession.ts:67-81`    | Szara strefa | Problem tylko przy multi-device sync      |

---

## Open Questions

1. **Czy sesja generowania powinna być persystowana?** (Open Question #6 z PRD).
   Dziś brak tabeli `generation_drafts`; zamknięcie zakładki = utrata przeglądu.
   Jeśli tak → logika filtrowania propozycji z hooka musi trafić do serwisu.

2. **Czy kolejka sesji SR powinna być server-side?** Dziś hook zarządza kolejką
   w pamięci. Jeśli wymagany będzie multi-device lub interrupted-session recovery
   → przeniesienie kolejkowania do serwisu stanie się konieczne.

3. **Odkomentowanie policies append-only dla `review_logs`?** Koszt: 2 linie SQL.
   Zysk: DB-level gwarancja niezmiennika, audit-proof historia ocen.
   Zalecane jako natychmiastowe, niskie-ryzyko usprawnienie.

---

## Historical Context

Brak wcześniejszych zmian w `context/changes/` lub `context/archive/` bezpośrednio
dotyczących architektury warstw Core. Dokument źródłowy:
`context/domain/01-domain-distillation.md` identyfikuje R-1 (zakomentowane policies),
R-2 (brak persystencji sesji), R-4 (bulkAccept ignoruje "editing") jako znane
rozbieżności — research potwierdza je z konkretnymi file:line referencjami.
