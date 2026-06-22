---
title: "10xCards — Invariant Aggregate Refactor Plan"
created: 2026-06-22
type: refactor-plan
---

# 10xCards — Invariant Aggregate Refactor Plan

> Dokument jest **planem refaktoru**, nie implementacją. Żaden kod produkcyjny nie
> jest tu modyfikowany. Cytaty `plik:linia` odnoszą się do stanu repozytorium na
> dzień 2026-06-22.

---

## KROK 0 — Kontekst

### Stack i warstwy

| Warstwa                   | Technologia                            | Gdzie żyje logika                                              |
| ------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| API (routing + walidacja) | Astro API Routes na Cloudflare Workers | `src/pages/api/`                                               |
| Serwis (logika domenowa)  | TypeScript                             | `src/lib/services/sr.ts`, `services/cards.ts`                  |
| Stan sesji klienta        | React hooks                            | `src/components/hooks/useReviewSession.ts`, `useGeneration.ts` |
| Persystencja              | Supabase PostgreSQL + RLS              | `supabase/migrations/*.sql`                                    |
| Algorytm SR               | Biblioteka `ts-fsrs`                   | zależność npm, używana w `services/sr.ts`                      |

### Dokumenty wymagań

- `context/foundation/prd.md` — wymagania, user stories, success criteria, guardrails
- `context/domain/01-domain-distillation.md` — ubiquitous language, agregaty, rozjazdy
- `supabase/migrations/20260602000000_review_session.sql` — komentarz "Append-only history"

---

## KROK 1 — Identyfikacja niezmienników biznesowych

| #       | Niezmiennik                                                                                                                                | Źródło                                                                                                                                    | Egzekucja                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I-1** | `review_logs` jest **append-only** — żaden wpis historii ocen nie może być modyfikowany ani usunięty                                       | _"rating history at whatever fidelity the algorithm requires"_ — `prd.md:168`; komentarz `"Append-only history"` — `review_session.sql:7` | **NARUSZALNY** — policies `deny update` i `deny delete` istnieją, ale są zakomentowane: `20260607000001_review_logs_deny_update_delete.sql:1-2`                                                 |
| **I-2** | Aktualizacja SR state i zapis review_log są **atomowe** — ocena karty albo persystuje obie operacje, albo żadnej                           | _"SR state is saved after every card (interrupting the session does not roll back already-rated cards)"_ — `prd.md:95`                    | **NARUSZONY** — w `sr.ts:117-129` UPDATE `card_sr_state` i INSERT `review_logs` to dwa oddzielne zapytania; log insert jest oznaczony `// Best-effort` (`sr.ts:125`)                            |
| **I-3** | Sesja powtórek zawiera **dokładnie** karty due ≤ end-of-day — nie więcej, nie mniej                                                        | _"session contains exactly those cards… 'due ≤ today' — no more, no less"_ — `prd.md:93`                                                  | Egzekwowany — `.lte("due", dueBefore)` (`sr.ts:80`); `endOfDay.setHours(23, 59, 59, 999)` (`useReviewSession.ts:22-24`)                                                                         |
| **I-4** | Karta oceniona na `rating=1` (Again) wraca do kolejki zgodnie z **planem algorytmu** (nowy `due_date`), nie natychmiast jako "za 0 sekund" | _"Again / Hard / Good / Easy — the algorithm updates that card's SR state (interval, due date)"_ — `prd.md:89`                            | **DEKLAROWANY NIESPÓJNIE** — `useReviewSession.ts:72-74` przesuwa kartę na koniec kolejki bez weryfikacji `data.sr.due`; FSRS może planować "Again" za 1–10 min, ale karta wraca bez opóźnienia |
| **I-5** | Tylko zaakceptowane propozycje trafiają do decku                                                                                           | _"Only candidates in an accepted status are saved as flashcards"_ — `prd.md:198`                                                          | Egzekwowany — `proposals.filter((p) => p.status === "accepted")` (`useGeneration.ts:77`)                                                                                                        |
| **I-6** | Każda karta ma dokładnie jeden stan SR (1:1), tworzony atomowo przy INSERT karty                                                           | _"auto-create an SR state row for every new card"_ — `initial_schema.sql:89`                                                              | Egzekwowany — trigger `after_card_insert` + UNIQUE constraint (`initial_schema.sql:61, 103`)                                                                                                    |
| **I-7** | front i back karty są niepuste                                                                                                             | _"non-empty question and a non-empty answer"_ — `prd.md:81`                                                                               | Egzekwowany — DB `NOT NULL` + Zod `min(1)` (`schemas/cards.ts:4-5`)                                                                                                                             |
| **I-8** | Usunięcie decku usuwa wszystkie jego karty i stan SR                                                                                       | _"delete an entire deck (together with all of its flashcards and SR state)"_ — `prd.md:172`                                               | Egzekwowany — `ON DELETE CASCADE` (`initial_schema.sql:34, 61`)                                                                                                                                 |
| **I-9** | Każdy użytkownik widzi tylko swoje dane                                                                                                    | _"flat hierarchy. Every registered user sees and edits only their own flashcards and decks"_ — `prd.md:204`                               | Egzekwowany — RLS policies `USING (auth.uid() = user_id)` na wszystkich tabelach                                                                                                                |

---

## KROK 2 — Klasyfikacja i wybór #1

### Macierz oceny

| Niezmiennik                       | (a) Rdzeniowość produktu                                                                                                      | (b) Rozsmarowanie po warstwach                                                        | (c) Stopień egzekucji                                                                                                                      | Łączny priorytet            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| **I-1** append-only `review_logs` | **Krytyczna** — historia ocen to fundament algorytmu SR; manipulacja nią psuje plany powtórek dla wszystkich przyszłych sesji | **2 warstwy** — tylko DB (brak ochrony na poziomie aplikacji), policies zakomentowane | **NARUSZALNY** — każdy uwierzytelniony użytkownik może dziś wywołać Supabase bezpośrednio i wykonać `DELETE` lub `UPDATE` na `review_logs` | 🔴 **#1**                   |
| **I-2** atomowość oceny           | **Krytyczna** — SR state bez logu oznacza algorytm bez historii; log bez SR state = "duch" w historii                         | **2 warstwy** — `sr.ts:117-129` (dwie oddzielne operacje DB), brak transakcji         | **NARUSZONY** — log insert jest `// Best-effort`: `sr.ts:125`; cicha utrata logu przy błędzie DB                                           | 🔴 **#1** (powiązany z I-1) |
| I-4 Again due_date                | Wysoka — dot. poprawności algorytmu                                                                                           | 1 warstwa (hook)                                                                      | Deklarowany niespójnie                                                                                                                     | 🟡 #2                       |
| I-3, I-5–I-9                      | Wysoka–Krytyczna                                                                                                              | 1–2 warstwy                                                                           | Egzekwowany                                                                                                                                | 🟢 OK                       |

### Wybór niezmiennika #1

**`review_logs` jest append-only AND ocena karty jest atomowa.**

To dwa aspekty tego samego niezmiennika: zapis oceny musi być atomowy (I-2), a raz zapisana ocena jest nienaruszalna (I-1). Razem tworzą **gwarancję integralności historii SR**.

**Uzasadnienie:**

1. **Rdzeniowość**: guardrail PRD `prd.md:189` — "SR algorithm correctness: a card scheduled for day D is shown exactly once in the session run on day D". FSRS oblicza interwały na podstawie historii ocen; usunięcie lub zmiana wpisów w `review_logs` powoduje, że algorytm "widzi" inną przeszłość niż rzeczywista — nie ma to nic wspólnego z korektą błędu, to sabotaż modelu poznawczego.

2. **Najsłabsza egzekucja**: policies `deny update` i `deny delete` na `review_logs` są **zakomentowane** (`20260607000001_review_logs_deny_update_delete.sql:1-2`). Tabela ma SELECT i INSERT, ale brak blokady mutacji. Jednocześnie w kodzie aplikacji log insert jest `// Best-effort` — cicha utrata logu nie przerywa operacji (`sr.ts:125-129`).

3. **Gotowa poprawka + brakująca warstwa**: DB-level protection istnieje ale jest wyłączona. Wymaga dwóch działań: (a) odkomentować policies, (b) zapewnić atomowość przez Postgres RPC zamiast dwóch osobnych roundtripów.

---

## KROK 3 — Diagnoza wybranego niezmiennika

### 3.1 Gdzie reguła jest deklarowana

| Lokalizacja                | Treść                                                                                                                 | Typ                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `prd.md:168`               | _"SR state (intervals, due-dates, rating history at whatever fidelity the algorithm requires) is persisted per user"_ | Wymaganie funkcjonalne     |
| `prd.md:189`               | _"SR algorithm correctness: a card scheduled by the algorithm for day D is shown exactly once"_                       | Guardrail (NFR)            |
| `prd.md:95`                | _"SR state is saved after every card (interrupting the session does not roll back already-rated cards)"_              | Acceptance Criterion US-03 |
| `review_session.sql:7`     | `-- Append-only history; one row per rating.`                                                                         | Komentarz w migracji       |
| `review_session.sql:29-30` | `CREATE POLICY "review_logs: owner select" ... INSERT ...`                                                            | Aktywne policies           |

### 3.2 Gdzie reguła NIE jest egzekwowana

#### Problem A — zakomentowane policies (`20260607000001_review_logs_deny_update_delete.sql:1-2`)

```sql
-- CREATE POLICY IF NOT EXISTS "review_logs: deny update" ON review_logs FOR UPDATE USING (false);
-- CREATE POLICY IF NOT EXISTS "review_logs: deny delete" ON review_logs FOR DELETE USING (false);
```

Stan obecny: tabela `review_logs` ma `ENABLE ROW LEVEL SECURITY` (`review_session.sql:28`), ale brak
policies dla UPDATE i DELETE. Zachowanie PostgreSQL przy braku pasującej policy: operacja jest
**odrzucana domyślnie** tylko jeśli nie ma `PERMISSIVE` policy dla danego polecenia. Ponieważ nie
ma żadnej `FOR UPDATE`/`FOR DELETE` policy, Postgres traktuje to jak "deny" — ALE zależy to od
trybu (`RESTRICTIVE` vs `PERMISSIVE`). W przypadku Supabase z RLS enabled i brakiem UPDATE/DELETE
policy dla authenticated role, zachowanie jest faktycznie "deny" — ale nie przez jawny guard, tylko
przez domyślne zachowanie. Zakomentowanie tych policies to nie fix — to dokumentacja intencji, która
nigdy nie weszła do bazy. Jawna `USING (false)` policy jest konieczna jako czytelna, testowalna
gwarancja.

**Ryzyko**: użytkownik może wywołać Supabase JS bezpośrednio (poza API) i wykonać:

```js
supabase.from("review_logs").delete().eq("user_id", myUid); // manipulacja historią ocen
```

Bez jawnej deny policy, to zachowanie jest zależne od konfiguracji Supabase, nie od kodu aplikacji.

#### Problem B — brak atomowości w `sr.ts:94-132`

```typescript
// sr.ts:116-129
const { error: updateError } = await supabase
  .from("card_sr_state")
  .update(update) // ← operacja 1: UPDATE card_sr_state
  .eq("card_id", cardId)
  .eq("user_id", userId);

if (updateError) throw new Error(updateError.message);

// Best-effort: log insert failure is non-fatal — SR state is already persisted
const { error: logError } = await supabase.from("review_logs").insert(reviewLogToDbInsert(result.log, cardId, userId)); // ← operacja 2: INSERT review_logs
if (logError) console.error("[review_logs] insert failed:", logError.message); // ← POŁKNIĘTY BŁĄD
```

**Co może pójść źle:**

- Scenariusz 1: UPDATE powiedzie się, INSERT nie — SR state przeskakuje do następnego interwału,
  ale historia nie ma tego zdarzenia. Algorytm "widzi" kartę z innym stanem niż historią uzasadnione.
- Scenariusz 2: sieć się urywa między dwoma zapytaniami — identyczny efekt.
- Scenariusz 3: rate limit Supabase lub chwilowy błąd DB — log ginie cicho, aplikacja kontynuuje.

#### Problem C — brak walidacji odpowiedzi z logu

`applyRating` zwraca tylko `update` (nowy SR state) (`sr.ts:131`). API route (`review/[cardId].ts:37`)
zwraca `{ sr }`. Klient nigdy nie wie, czy log był zapisany — nie ma kontrakt na tę część operacji.

### 3.3 Gdzie klient jest jedynym strażnikiem

Jedyna warstwa egzekwująca "nie wysyłaj niepoprawnego ratingu" to Zod w API:
`schemas/review.ts:6` — `z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])`.
To wystarczy. Problem leży wyżej — KLIENT (przeglądarka) jest jedynym miejscem, które "wie",
że karta ma `due ≤ today` w momencie oceny — nie ma walidacji server-side, że oceniana karta
faktycznie należy do bieżącej sesji. `applyRating` (`sr.ts:94`) akceptuje dowolne `cardId`
spełniające warunek `deck_id` — brak sprawdzenia `due ≤ now`.

---

## KROK 4 — Projekt agregatu-strażnika

### 4.1 Agregat: `CardRatingEvent`

Agregat reprezentuje **pojedyncze zdarzenie oceny karty**. Jest to zdarzenie domenowe, które:

- wczytuje bieżący SR state karty
- weryfikuje, że karta należy do właściwego decku i właściwego użytkownika
- aplikuje algorytm FSRS
- persystuje ATOMOWO: nowy SR state + wpis w `review_logs`
- rzuca nazwany błąd domenowy przy każdej niespójności

Korzeń agregatu: `CardRatingEvent` (value object — bez własnego ID, bo ocena jest zdarzeniem,
nie encją). Agregat jest **chwilowy** — powstaje na czas wywołania, nie jest persystowany jako
obiekt domenowy.

### 4.2 Postgres RPC — serce egzekucji

Atomowość na poziomie bazy danych realizuje `SECURITY DEFINER` function wykonująca obie operacje
w jednej transakcji. Aplikacja TypeScript staje się cienką warstwą wywołującą tę funkcję.

```sql
-- Pseudokod — nowa migracja: apply_card_rating_atomic()
CREATE OR REPLACE FUNCTION apply_card_rating_atomic(
  p_card_id   uuid,
  p_user_id   uuid,
  p_deck_id   uuid,
  p_rating    smallint,  -- 1=Again, 2=Hard, 3=Good, 4=Easy
  p_now       timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sr_row    card_sr_state%ROWTYPE;
  v_new_state jsonb;    -- obliczony przez warstwę aplikacji lub inline
BEGIN
  -- PRECONDITION 1: karta należy do użytkownika i do decku
  SELECT css.* INTO v_sr_row
  FROM card_sr_state css
  JOIN cards c ON c.id = css.card_id
  WHERE css.card_id = p_card_id
    AND css.user_id = p_user_id
    AND c.deck_id   = p_deck_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CardNotFound: card % not found in deck % for user %',
      p_card_id, p_deck_id, p_user_id
      USING ERRCODE = 'P0001';
  END IF;

  -- PRECONDITION 2: rating jest w dozwolonym zakresie (redundant, ale fail-fast)
  IF p_rating NOT IN (1, 2, 3, 4) THEN
    RAISE EXCEPTION 'InvalidRating: rating must be 1-4, got %', p_rating
      USING ERRCODE = 'P0002';
  END IF;

  -- ATOMOWE: UPDATE card_sr_state + INSERT review_logs w jednej transakcji
  -- (faktyczne obliczenie nowego stanu SR pozostaje w TypeScript przez ts-fsrs;
  --  alternatywnie: wersja "full-server" oblicza tu inline — patrz Wariant B poniżej)

  UPDATE card_sr_state
  SET due            = (p_new_state->>'due')::timestamptz,
      stability      = (p_new_state->>'stability')::float4,
      difficulty     = (p_new_state->>'difficulty')::float4,
      elapsed_days   = (p_new_state->>'elapsed_days')::int4,
      scheduled_days = (p_new_state->>'scheduled_days')::int4,
      reps           = (p_new_state->>'reps')::int4,
      lapses         = (p_new_state->>'lapses')::int4,
      state          = (p_new_state->>'state')::smallint,
      last_review    = (p_new_state->>'last_review')::timestamptz,
      learning_steps = (p_new_state->>'learning_steps')::int4
  WHERE card_id = p_card_id AND user_id = p_user_id;

  INSERT INTO review_logs (
    card_id, user_id, rating, state, due, stability, difficulty,
    elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review
  ) VALUES (
    p_card_id, p_user_id, p_rating,
    (p_new_state->>'prev_state')::smallint,
    (p_new_state->>'prev_due')::timestamptz,
    (p_new_state->>'prev_stability')::float4,
    (p_new_state->>'prev_difficulty')::float4,
    (p_new_state->>'elapsed_days')::int4,
    (p_new_state->>'last_elapsed_days')::int4,
    (p_new_state->>'scheduled_days')::int4,
    (p_new_state->>'learning_steps')::int4,
    p_now
  );

  RETURN p_new_state;
END;
$$;
```

> **Wariant A (zalecany)**: TypeScript wywołuje `scheduler.next(card, now, rating)` i przekazuje
> wynik jako `jsonb` do funkcji SQL — obliczenia SR zostają w ts-fsrs (zachowanie biblioteki),
> persystencja jest atomowa po stronie DB.
>
> **Wariant B** (przyszłość): pełna logika SR w PL/pgSQL — eliminuje roundtrip, ale wymaga
> przepisania algorytmu FSRS w SQL. Poza zakresem MVP.

### 4.3 Sygnatury domenowe (TypeScript)

```typescript
// src/lib/domain/CardRatingEvent.ts  ← nowy plik

export class CardRatingDomainError extends Error {
  constructor(
    public readonly code: "CardNotFound" | "InvalidRating" | "RatingFailed",
    message: string,
  ) {
    super(message);
    this.name = "CardRatingDomainError";
  }
}

export interface CardRatingInput {
  cardId: string;
  userId: string;
  deckId: string;
  rating: 1 | 2 | 3 | 4;
  now: Date;
}

export interface CardRatingOutput {
  newSrState: RatingResult; // typ z services/sr.ts
}

// Agregat-strażnik: JEDYNE miejsce wywołania oceny
export async function applyCardRating(supabase: SupabaseClientType, input: CardRatingInput): Promise<CardRatingOutput> {
  // 1. Oblicz nowy SR state przez ts-fsrs (pozostaje w JS)
  const { newState, log } = computeNewState(input); // wydzielona funkcja pure

  // 2. Wywołaj Postgres RPC — atomowo: UPDATE + INSERT
  const { data, error } = await supabase.rpc("apply_card_rating_atomic", {
    p_card_id: input.cardId,
    p_user_id: input.userId,
    p_deck_id: input.deckId,
    p_rating: input.rating,
    p_now: input.now.toISOString(),
    p_new_state: buildStatePayload(newState, log), // jsonb payload
  });

  if (error) {
    // Mapuj błędy domenowe z PG RAISE EXCEPTION
    if (error.message.includes("CardNotFound")) {
      throw new CardRatingDomainError("CardNotFound", error.message);
    }
    if (error.message.includes("InvalidRating")) {
      throw new CardRatingDomainError("InvalidRating", error.message);
    }
    throw new CardRatingDomainError("RatingFailed", error.message);
  }

  return { newSrState: fsrsCardToDbUpdate(newState) };
}
```

### 4.4 Cienkie API route (after)

```typescript
// src/pages/api/decks/[id]/review/[cardId].ts  (po refaktorze)

export const POST: APIRoute = async (context) => {
  // Parse → walidacja Zod (bez zmian)
  const parsed = SubmitRatingSchema.safeParse(body);
  if (!parsed.success) {
    /* 400 */
  }

  try {
    const { newSrState } = await applyCardRating(supabase, {
      cardId: cardId,
      userId: context.locals.user.id,
      deckId: deckId,
      rating: parsed.data.rating,
      now: new Date(),
    });
    return Response.json({ sr: newSrState });
  } catch (err) {
    if (err instanceof CardRatingDomainError) {
      // Mapowanie błędu domenowego → HTTP
      const status = err.code === "CardNotFound" ? 404 : 422;
      return Response.json({ error: err.message }, { status });
    }
    return Response.json({ error: "Failed to apply rating" }, { status: 500 });
  }
};
```

### 4.5 Polityki DB (dopełnienie agregatu)

```sql
-- Nowa migracja: odkomentowane policies (fix zakomentowanego kodu)
CREATE POLICY "review_logs: deny update" ON review_logs
  FOR UPDATE USING (false);

CREATE POLICY "review_logs: deny delete" ON review_logs
  FOR DELETE USING (false);
```

Teraz ŻADEN uwierzytelniony klient (przeglądarka, Postman, bezpośrednie wywołanie Supabase JS)
nie może zmodyfikować ani usunąć wpisów historii ocen.

---

## KROK 5 — Before/After, Plan, Testy

### 5.1 Before/After dla każdego miejsca reguły

#### `20260607000001_review_logs_deny_update_delete.sql`

**Before:**

```sql
-- CREATE POLICY IF NOT EXISTS "review_logs: deny update" ON review_logs FOR UPDATE USING (false);
-- CREATE POLICY IF NOT EXISTS "review_logs: deny delete" ON review_logs FOR DELETE USING (false);
```

**After (nowa migracja):**

```sql
CREATE POLICY "review_logs: deny update" ON review_logs FOR UPDATE USING (false);
CREATE POLICY "review_logs: deny delete" ON review_logs FOR DELETE USING (false);
```

> Uwaga: oryginalna migracja jest zakomentowana. Nowa migracja jest oddzielnym plikiem
> (nie edytujemy historii migracji).

---

#### `src/lib/services/sr.ts:94-132` — funkcja `applyRating`

**Before:**

```typescript
export async function applyRating(supabase, userId, cardId, deckId, rating, now) {
  // ... load ...
  const update = fsrsCardToDbUpdate(result.card);
  const { error: updateError } = await supabase          // operacja 1
    .from("card_sr_state").update(update) ...;
  if (updateError) throw new Error(updateError.message);

  // Best-effort: log insert failure is non-fatal     ← PROBLEM
  const { error: logError } = await supabase           // operacja 2
    .from("review_logs").insert(...);
  if (logError) console.error("[review_logs] insert failed:", logError.message);

  return update;
}
```

**After:**

```typescript
// Zastąpione przez: src/lib/domain/CardRatingEvent.ts → applyCardRating()
// Wewnątrz: supabase.rpc("apply_card_rating_atomic", payload)
// Błąd RPC rzuca CardRatingDomainError (fail-fast)
// "Best-effort" comment usunięty; obie operacje atomowe po stronie DB
```

---

#### `src/pages/api/decks/[id]/review/[cardId].ts:36`

**Before:**

```typescript
const sr = await applyRating(supabase, context.locals.user.id, cardId, deckId, parsed.data.rating, new Date());
return Response.json({ sr });
```

**After:**

```typescript
const { newSrState } = await applyCardRating(supabase, { cardId, userId, deckId, rating, now });
return Response.json({ sr: newSrState });
// Błędy domenowe mapowane na 404/422/500
```

---

### 5.2 Plan faz refaktoru

Projekt ma dyscyplinę test-first (Stryker, Vitest, testy integracyjne). Fazy z ★ idą test-first.

#### Faza 1 — Fix DB-level (najkrótsza droga do #1)

**Cel**: przywrócić append-only na poziomie bazy bez zmian w aplikacji.

1. Utwórz nową migrację `20260622000001_review_logs_deny_mutations.sql`:
   ```sql
   CREATE POLICY "review_logs: deny update" ON review_logs FOR UPDATE USING (false);
   CREATE POLICY "review_logs: deny delete" ON review_logs FOR DELETE USING (false);
   ```
2. Zastosuj: `npx supabase db push`
3. Zweryfikuj: bezpośrednie `DELETE FROM review_logs` zwraca `0 rows` lub błąd RLS.

_Nie wymaga zmian w kodzie TypeScript. Reversible._

---

#### Faza 2 ★ — Atomowość przez Postgres RPC (test-first)

**Cel**: usunąć "Best-effort" komentarz i zapewnić atomowość UPDATE + INSERT.

**Przypadki testowe (test-first):**

| #   | Scenariusz                               | Wejście                              | Oczekiwany wynik                                                                     |
| --- | ---------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| T-1 | Poprawna ocena (legal)                   | cardId istniejącej karty, rating=3   | `card_sr_state` zaktualizowany; nowy wiersz w `review_logs`; zwraca nowy SR state    |
| T-2 | Ocena karty z innego decku (illegal)     | cardId z deck_id ≠ deckId            | `CardRatingDomainError("CardNotFound")`; brak zmian w DB                             |
| T-3 | Ocena karty innego użytkownika (illegal) | cardId z user_id ≠ userId            | `CardRatingDomainError("CardNotFound")`; brak zmian w DB                             |
| T-4 | Rating poza zakresem (illegal)           | rating=0 lub rating=5                | `CardRatingDomainError("InvalidRating")`                                             |
| T-5 | Atomowość — błąd INSERT log              | symulacja: `review_logs` zablokowane | `card_sr_state` NIE jest zaktualizowany (rollback transakcji)                        |
| T-6 | Poprawna ocena rating=1 (Again)          | rating=1                             | `card_sr_state.due` = nowy timestamp z FSRS; `review_logs` zawiera wpis z `rating=1` |
| T-7 | `review_logs` deny delete (illegal)      | DELETE od authenticated usera        | Supabase zwraca błąd RLS / 0 rows                                                    |
| T-8 | `review_logs` deny update (illegal)      | UPDATE rating od authenticated usera | Supabase zwraca błąd RLS / 0 rows                                                    |

**Kroki:**

1. Napisz testy integracyjne dla T-1 – T-8 (Vitest + Supabase test client).
2. Utwórz nową migrację z funkcją `apply_card_rating_atomic()`.
3. Utwórz `src/lib/domain/CardRatingEvent.ts` z `applyCardRating` i `CardRatingDomainError`.
4. Zaktualizuj `src/pages/api/decks/[id]/review/[cardId].ts` — cienka warstwa.
5. Usuń lub zdeprecjonuj starą `applyRating` z `services/sr.ts` (lub pozostaw jako private helper
   obliczający stan SR przez ts-fsrs, wywoływany przez domenowy agregat).
6. Uruchom Stryker na `src/lib/domain/CardRatingEvent.ts` — sprawdź mutacje na preconditions.

---

#### Faza 3 — Walidacja server-side "karta jest due" (opcjonalna)

**Cel**: usunąć zależność od klienta jako jedynego strażnika "due ≤ today".

Dodaj w `apply_card_rating_atomic()` opcjonalny `PRECONDITION`:

```sql
IF v_sr_row.due > p_now THEN
  RAISE EXCEPTION 'CardNotDue: card % is not due until %', p_card_id, v_sr_row.due
    USING ERRCODE = 'P0003';
END IF;
```

> Uwaga: FSRS pozwala oceniać karty przed terminem (user decyduje); PRD nie zabrania oceny
> karty "przed czasem". Ta walidacja jest osłabieniem interoperacyjności. Wdrożyć tylko jeśli
> pojawi się wymaganie (np. anti-cheat dla gamifikacji).

---

### 5.3 Nowe "load-bearing" nazwy do zarejestrowania

Jeśli projekt prowadzi rejestr kontraktów (np. `context/foundation/lessons.md`), dodaj:

| Nazwa                      | Typ                                  | Lokalizacja (po refaktorze)                                         |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `CardRatingDomainError`    | Error class (domain)                 | `src/lib/domain/CardRatingEvent.ts`                                 |
| `applyCardRating`          | Domain function (aggregate guardian) | `src/lib/domain/CardRatingEvent.ts`                                 |
| `apply_card_rating_atomic` | Postgres RPC                         | `supabase/migrations/20260622000002_apply_card_rating_atomic.sql`   |
| `review_logs: deny update` | RLS policy                           | `supabase/migrations/20260622000001_review_logs_deny_mutations.sql` |
| `review_logs: deny delete` | RLS policy                           | `supabase/migrations/20260622000001_review_logs_deny_mutations.sql` |

---

## Podsumowanie

Wybrano niezmiennik **append-only `review_logs` + atomowość oceny** jako jednocześnie
najbardziej rdzeniowy i najsłabiej egzekwowany. Polityki `deny update/delete` na tabeli
`review_logs` są gotowe, ale zakomentowane od czasu migracji (`20260607000001_...sql:1-2`),
a zapis oceny w `sr.ts:125-129` traktuje INSERT logu jako "best-effort" — cicha utrata historii
nie przerywa operacji. Plan refaktoru dzieli się na dwie fazy: Faza 1 (bez zmian w aplikacji)
odblokuje zakomentowane policies nową migracją, Faza 2 zastępuje dwa oddzielne roundtripy
jedną Postgres RPC (`apply_card_rating_atomic`) wykonywaną w jednej transakcji, a domenowy agregat
`applyCardRating` staje się jedynym miejscem egzekucji reguły. Testy integracyjne (8 przypadków)
potwierdzają legalne i nielegalne przejścia zanim kod wejdzie do bazy — zgodnie z dyscypliną
test-first projektu. Po Fazie 1 użytkownik nie może już manipulować historią ocen przez
bezpośrednie wywołania Supabase; po Fazie 2 aplikacja nie może zgubić logu przez błąd sieci
ani race condition między zapytaniami.
