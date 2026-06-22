# SR Review Integrity — Implementation Plan

## Overview

Egzekwowanie niezmienników I-1 (append-only `review_logs`) i I-2 (atomowość oceny karty) przez
dwie fazy: (1) jawne deny-policies w DB, (2) zastąpienie dwóch oddzielnych zapytań jedną
Postgres RPC i stworzenie domenowego agregatu `applyCardRating` jako jedynego miejsca
zapisu oceny.

## Current State Analysis

- `sr.ts:125` — INSERT review_log jest oznaczony `// Best-effort`; błąd logowania jest połykany
  i applyRating rozwiązuje się sukcesem niezależnie od logu.
- `20260607000001_review_logs_deny_update_delete.sql:1-2` — obie deny-policies są zakomentowane;
  tabela ma aktywne SELECT + INSERT, ale brak jawnego blokowania UPDATE/DELETE.
- `review_session.sql:28-30` — RLS jest włączone, ale brak policies FOR UPDATE/FOR DELETE.
- `src/test/sr.test.ts:222-238` — test dokumentuje "best-effort" zachowanie jako oczekiwane;
  musi zostać usunięty po refaktorze.
- Brak katalogu `src/lib/domain/` — nowy moduł domenowy.

## Desired End State

Po zakończeniu planu:

- Żaden uwierzytelniony klient nie może modyfikować ani usuwać wpisów w `review_logs`
  (egzekwowane przez jawne `USING (false)` policies w PostgreSQL).
- Ocena karty jest atomowa: jeśli INSERT review_log nie powiedzie się, UPDATE card_sr_state
  również jest wycofywany (Postgres transakcja w RPC).
- Błąd RPC jest zawsze propagowany do wywołującego — nigdy połykany.
- `applyCardRating` w `src/lib/domain/CardRatingEvent.ts` jest jedynym miejscem w kodzie
  aplikacji, które zapisuje ocenę.

Weryfikacja: submit oceny przez UI → `review_logs` ma nowy wiersz, `card_sr_state` zaktualizowany;
bezpośrednia próba DELETE/UPDATE na `review_logs` przez Supabase JS zwraca błąd RLS.

### Key Discoveries

- `rowToFsrsCard` w `sr.ts:10-23` jest prywatna; musi być wyeksportowana, by `CardRatingEvent.ts`
  mogła jej użyć bez duplikacji.
- `reviewLogToDbInsert` w `sr.ts:41-58` staje się martwym kodem po refaktorze (log insertion
  przeniesiona do SQL); należy ją usunąć.
- `sr.test.ts:240-282` zawiera analizę przeżytych mutantów dla `applyRating` i `reviewLogToDbInsert`
  — cały ten blok staje się nieaktualny i należy go usunąć razem z describe blokiem `applyRating`.
- Supabase RPC z SECURITY DEFINER wymaga `GRANT EXECUTE ON FUNCTION ... TO authenticated` w migracji.
- Jsonb payload `p_new_state` musi przenosić zarówno nowy stan karty (dla UPDATE card*sr_state)
  jak i stan sprzed oceny (dla INSERT review_logs), z prefiksem `prev*` dla pól historycznych.

## What We're NOT Doing

- Faza 3 z dokumentu domenowego (walidacja server-side "karta jest due") — opcjonalna, poza zakresem.
- Wariant B (obliczenia FSRS w PL/pgSQL) — out of scope dla MVP.
- Zmiany w `loadDueCards` — niezwiązane z tym niezmiennikeim.
- Optymalizacja double-SELECT (TypeScript SELECT dla FSRS + SQL SELECT dla ownership check)
  — akceptowalny overhead w MVP.

## Critical Implementation Details

**Payload jsonb `p_new_state`** — tabela mapowania pól. Kolumny `elapsed_days`, `scheduled_days`,
`learning_steps` są wspólne dla `card_sr_state` i `review_logs` (ts-fsrs zwraca te same wartości
w `result.card` i `result.log`). Pola sprzed oceny mają prefix `prev_`:

| Klucz jsonb         | Źródło TypeScript                        | Cel SQL                          |
| ------------------- | ---------------------------------------- | -------------------------------- |
| `due`               | `result.card.due.toISOString()`          | UPDATE card_sr_state             |
| `stability`         | `result.card.stability`                  | UPDATE card_sr_state             |
| `difficulty`        | `result.card.difficulty`                 | UPDATE card_sr_state             |
| `elapsed_days`      | `result.card.elapsed_days`               | UPDATE card_sr_state + INSERT rl |
| `scheduled_days`    | `result.card.scheduled_days`             | UPDATE card_sr_state + INSERT rl |
| `reps`              | `result.card.reps`                       | UPDATE card_sr_state             |
| `lapses`            | `result.card.lapses`                     | UPDATE card_sr_state             |
| `state`             | `result.card.state`                      | UPDATE card_sr_state             |
| `last_review`       | `result.card.last_review?.toISOString()` | UPDATE card_sr_state             |
| `learning_steps`    | `result.card.learning_steps`             | UPDATE card_sr_state + INSERT rl |
| `last_elapsed_days` | `result.log.last_elapsed_days`           | INSERT review_logs only          |
| `prev_state`        | `result.log.state`                       | INSERT review_logs (pre-rating)  |
| `prev_due`          | `result.log.due.toISOString()`           | INSERT review_logs (pre-rating)  |
| `prev_stability`    | `result.log.stability`                   | INSERT review_logs               |
| `prev_difficulty`   | `result.log.difficulty`                  | INSERT review_logs               |

Kolumna `review` w review_logs pochodzi z `p_now` (parametr RPC), nie z payloadu.

**SECURITY DEFINER** — funkcja omija RLS dla operacji wewnętrznych; ownership check
(`WHERE user_id = p_user_id AND deck_id = p_deck_id`) jest jedyną barierą bezpieczeństwa
wewnątrz funkcji. `p_user_id` pochodzi z `context.locals.user.id` w API route (zweryfikowane JWT).

---

## Phase 1: DB Append-Only Enforcement

### Overview

Dodanie jawnych deny-policies FOR UPDATE i FOR DELETE na tabeli `review_logs`. Żadnych zmian
w kodzie aplikacji. Reversible (można DROP POLICY).

### Changes Required

#### 1. Migracja deny-policies

**File**: `supabase/migrations/20260622000001_review_logs_deny_mutations.sql`

**Intent**: Zastąpić zakomentowane policies z `20260607000001_...sql` jawnymi, aktywnymi guardami
tak, by żaden uwierzytelniony klient (przeglądarka, Postman, bezpośrednie Supabase JS) nie mógł
mutować historii ocen.

**Contract**:

```sql
CREATE POLICY "review_logs: deny update" ON review_logs
  FOR UPDATE USING (false);

CREATE POLICY "review_logs: deny delete" ON review_logs
  FOR DELETE USING (false);
```

Plik nie zawiera nic więcej — nie edytujemy historii migracji.

### Success Criteria

#### Automated Verification

- Migracja aplikuje się czysto: `npx supabase db push` kończy się kodem 0
- `npm run typecheck` — brak błędów typów (kod aplikacji niezmieniony)

#### Manual Verification

- W Supabase Dashboard SQL Editor, jako uwierzytelniony użytkownik:
  `DELETE FROM review_logs WHERE user_id = auth.uid() LIMIT 1;` → zero wierszy lub błąd RLS
- `UPDATE review_logs SET rating = 1 WHERE user_id = auth.uid() LIMIT 1;` → zero wierszy lub błąd RLS

**Implementation Note**: Po tej fazie zatrzymaj się na ręczną weryfikację w Supabase przed
przejściem do Fazy 2.

---

## Phase 2: Postgres RPC Migration

### Overview

Nowa Postgres funkcja `apply_card_rating_atomic` wykonująca UPDATE card_sr_state i INSERT
review_logs w jednej transakcji. Faza czysto DB — brak zmian w TypeScript. Kończy się
regeneracją typów.

### Changes Required

#### 1. Migracja RPC

**File**: `supabase/migrations/20260622000002_apply_card_rating_atomic.sql`

**Intent**: Zdefiniować atomową funkcję DB, która przyjmuje obliczony przez TypeScript nowy stan SR
jako jsonb i persystuje go w dwóch tabelach w jednej transakcji. Ownership check wewnątrz funkcji
jest security boundary.

**Contract**: Pełna sygnatura i logika:

```sql
CREATE OR REPLACE FUNCTION apply_card_rating_atomic(
  p_card_id   uuid,
  p_user_id   uuid,
  p_deck_id   uuid,
  p_rating    smallint,
  p_now       timestamptz,
  p_new_state jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sr_row card_sr_state%ROWTYPE;
BEGIN
  -- Ownership + existence check
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

  IF p_rating NOT IN (1, 2, 3, 4) THEN
    RAISE EXCEPTION 'InvalidRating: rating must be 1-4, got %', p_rating
      USING ERRCODE = 'P0002';
  END IF;

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
    card_id, user_id, rating,
    state, due, stability, difficulty,
    elapsed_days, last_elapsed_days, scheduled_days, learning_steps,
    review
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

GRANT EXECUTE ON FUNCTION apply_card_rating_atomic(uuid, uuid, uuid, smallint, timestamptz, jsonb)
  TO authenticated;
```

#### 2. Regeneracja typów TypeScript

**File**: `src/lib/database.types.ts` (generowany, nie edytowany ręcznie)

**Intent**: Umożliwić type-safe wywołanie `supabase.rpc("apply_card_rating_atomic", ...)`.

**Contract**: `npm run gen-types` — po zakończeniu `database.types.ts` zawiera
`apply_card_rating_atomic` w sekcji `Functions` schematu `public`.

### Success Criteria

#### Automated Verification

- `npx supabase db push` kończy się kodem 0
- `npm run gen-types` kończy się kodem 0
- `npm run typecheck` — brak nowych błędów

#### Manual Verification

- W Supabase Dashboard SQL Editor:
  `SELECT apply_card_rating_atomic('00000000-0000-0000-0000-000000000001'::uuid, ...)` z nieistniejącym
  card_id → zwraca wyjątek `CardNotFound`
- `database.types.ts` zawiera funkcję `apply_card_rating_atomic` w sekcji Functions

**Implementation Note**: Zatrzymaj się po regeneracji typów; zweryfikuj obecność funkcji w
`database.types.ts` przed przejściem do Fazy 3.

---

## Phase 3: Domain Layer + Wiring (test-first)

### Overview

Implementacja domenowego agregatu w TypeScript, podłączenie go do API route oraz usunięcie
starego `applyRating`. Faza idzie test-first: testy (T-1–T-8) powstają przed kodem domenowym.

### Changes Required

#### 1. Nowy plik testów (test-first)

**File**: `src/test/CardRatingEvent.test.ts`

**Intent**: Zdefiniować kontrakty domenowe zanim powstaną implementacje. Testy T-1–T-6
używają mock `supabase.rpc`; T-5, T-7, T-8 wymagają prawdziwej DB i są oznaczone
`describe.skip` (wzorzec z `access-control.test.ts:230-233`).

**Contract**: Osiem przypadków testowych — implementacja kodu domenowego musi sprawić,
że T-1 do T-6 zielenią się:

| Test       | Wejście                                         | Oczekiwany wynik                                                |
| ---------- | ----------------------------------------------- | --------------------------------------------------------------- |
| T-1        | rating=3, istniejąca karta, rpc zwraca sukces   | resolves z `{ newSrState }` zawierającym zaktualizowane pola SR |
| T-2        | cardId z innego decku (rpc: "CardNotFound")     | throws `CardRatingDomainError` z `code="CardNotFound"`          |
| T-3        | cardId innego użytkownika (rpc: "CardNotFound") | throws `CardRatingDomainError` z `code="CardNotFound"`          |
| T-4        | rating=0 lub rating=5 (rpc: "InvalidRating")    | throws `CardRatingDomainError` z `code="InvalidRating"`         |
| T-6        | rating=1 (Again)                                | resolves z `newSrState.due` będącym przyszłym timestamps (FSRS) |
| T-5 (skip) | symulacja: INSERT log blokowany przez DB        | card_sr_state NIE jest zaktualizowany (rollback)                |
| T-7 (skip) | DELETE review_logs jako auth user               | błąd RLS — wymaga prawdziwej DB                                 |
| T-8 (skip) | UPDATE review_logs jako auth user               | błąd RLS — wymaga prawdziwej DB                                 |

Stub `supabase.rpc` w testach T-1 do T-6: mock funkcji `rpc` na obiekcie supabase, zwracający
`{ data: payload, error: null }` lub `{ data: null, error: { message: "CardNotFound: ..." } }`.

#### 2. Nowy moduł domenowy

**File**: `src/lib/domain/CardRatingEvent.ts`

**Intent**: Jedyne miejsce w aplikacji odpowiedzialne za obliczenie nowego stanu SR przez ts-fsrs,
serializację payloadu i wywołanie atomowego RPC. Eksportuje też klasę błędu domenowego.

**Contract**:

```typescript
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
  newSrState: RatingResult; // ReturnType of fsrsCardToDbUpdate from services/sr.ts
}

export async function applyCardRating(supabase: SupabaseClientType, input: CardRatingInput): Promise<CardRatingOutput>;
```

Ciało `applyCardRating`:

1. Ładuje aktualny `card_sr_state` (SELECT z JOIN na cards dla deck_id — ten sam wzorzec co
   stary `applyRating:103-109`); rzuca błąd gdy NOT FOUND.
2. Wywołuje `scheduler.next(rowToFsrsCard(srRow), input.now, input.rating)`.
3. Buduje jsonb payload przez `buildStatePayload(result.card, result.log)` (prywatna funkcja modułu).
4. Wywołuje `supabase.rpc("apply_card_rating_atomic", { p_card_id, p_user_id, p_deck_id, p_rating,
p_now: input.now.toISOString(), p_new_state: payload })`.
5. Mapuje błędy: `"CardNotFound"` → `CardRatingDomainError("CardNotFound")`,
   `"InvalidRating"` → `CardRatingDomainError("InvalidRating")`, inne → `CardRatingDomainError("RatingFailed")`.
6. Zwraca `{ newSrState: fsrsCardToDbUpdate(result.card) }`.

`buildStatePayload` serializuje `result.card` i `result.log` zgodnie z tabelą mapowania
z sekcji Critical Implementation Details.

Importy: `rowToFsrsCard`, `fsrsCardToDbUpdate` z `@/lib/services/sr`; `fsrs`, `Card`, `Grade`
z `ts-fsrs`; `SupabaseClientType`, `RatingResult` z odpowiednich modułów.

#### 3. Aktualizacja API route

**File**: `src/pages/api/decks/[id]/review/[cardId].ts`

**Intent**: Zastąpić bezpośrednie wywołanie `applyRating` przez domenowy agregat i dodać
mapowanie błędów domenowych na kody HTTP.

**Contract**: Zmień import `applyRating` z `@/lib/services/sr` na
`applyCardRating, CardRatingDomainError` z `@/lib/domain/CardRatingEvent`. W bloku `try`:

```typescript
const { newSrState } = await applyCardRating(supabase, {
  cardId,
  userId: context.locals.user.id,
  deckId,
  rating: parsed.data.rating,
  now: new Date(),
});
return Response.json({ sr: newSrState });
```

W bloku `catch`: jeśli `err instanceof CardRatingDomainError`, zwróć
`{ error: err.message }` ze statusem 404 dla `code="CardNotFound"`, 422 dla `code="InvalidRating"`,
500 dla `code="RatingFailed"`. Pozostałe błędy — istniejący fallback 500.

#### 4. Aktualizacja `src/lib/services/sr.ts`

**Intent**: Usunąć `applyRating` (zastąpiona przez domenowy agregat), wyeksportować
`rowToFsrsCard` (potrzebna w `CardRatingEvent.ts`), usunąć `reviewLogToDbInsert` (martwy kod).

**Contract**:

- Usuń funkcję `applyRating` (linie 94-132) w całości.
- Zmień `function rowToFsrsCard` → `export function rowToFsrsCard` (linia 10).
- Usuń funkcję `reviewLogToDbInsert` (linie 41-58) — insertion przeniesiona do SQL.

Pozostają: `fsrsCardToDbUpdate` (eksportowana), `loadDueCards` (eksportowana),
`rowToFsrsCard` (teraz eksportowana).

#### 5. Aktualizacja `src/test/sr.test.ts`

**Intent**: Usunąć testy dla usuniętej `applyRating` i nieaktualny komentarz o przeżytych mutantach.

**Contract**:

- Usuń cały blok `describe("applyRating", ...)` (linie 177-239).
- Usuń blok komentarza `// Survived mutants (sr.ts)` (linie 240-282) — dotyczy usuniętych funkcji.
- Usuń import `applyRating` z nagłówka pliku (linia 3).
- Pozostaw: `describe("loadDueCards", ...)`, stubs `loadDueResultFn`, `lteFn`.

#### 6. Aktualizacja `src/test/access-control.test.ts`

**Intent**: Zastąpić cross-user test dla `applyRating` testem dla `applyCardRating`,
który weryfikuje, że domenowy agregat rzuca `CardRatingDomainError("CardNotFound")`
gdy RPC zwraca błąd "CardNotFound".

**Contract**:

- Usuń blok `describe("applyRating: użytkownik B...")` (linie 141-193) i jego import `applyRating`.
- Dodaj `import { applyCardRating, CardRatingDomainError }` z `@/lib/domain/CardRatingEvent`.
- Dodaj `describe("applyCardRating: użytkownik B próbuje ocenić kartę użytkownika A", ...)`:
  - Stub `supabase.rpc` zwracający `{ data: null, error: { message: "CardNotFound: ..." } }`.
  - Jeden test: wywołanie `applyCardRating(supabase, { userId: USER_B_ID, cardId: USER_A_CARD_ID, deckId: USER_A_DECK_ID, rating: 3, now: TEST_NOW })` rzuca `CardRatingDomainError` z `code="CardNotFound"`.

### Success Criteria

#### Automated Verification

- `npm run test` — wszystkie testy zielone (w tym nowe T-1–T-6 w `CardRatingEvent.test.ts`)
- `npm run typecheck` — brak błędów
- `npm run lint` — brak błędów
- `npm run build` — build kończy się sukcesem

#### Manual Verification

- Submit oceny w UI (rating Dobra na wymagalnej karcie) → karta znika z sesji, następna sesja
  pokazuje poprawną datę due
- Supabase Dashboard → `review_logs` zawiera nowy wiersz z poprawnym `rating`, `card_id`, `user_id`
- Supabase Dashboard → `card_sr_state` dla tej karty ma zaktualizowane `due`, `reps`, `state`
- Próba `DELETE FROM review_logs WHERE user_id = auth.uid()` → 0 wierszy (deny policy z Fazy 1)

**Implementation Note**: Po Fazie 3 uruchom Stryker na `src/lib/domain/CardRatingEvent.ts`
(wąski zakres: `--mutate "src/lib/domain/CardRatingEvent.ts"`) i przejrzyj przeżyte mutanty
jeden po jednym. Dodaj asercje tylko dla mutantów reprezentujących user-visible bug.

---

## Testing Strategy

### Unit Tests (mock-based)

- T-1: Poprawna ocena — `supabase.rpc` stub returns success → resolves z `{ newSrState }`
- T-2: Karta z innego decku → RPC error "CardNotFound" → `CardRatingDomainError("CardNotFound")`
- T-3: Karta innego użytkownika → RPC error "CardNotFound" → `CardRatingDomainError("CardNotFound")`
- T-4: Rating=0 lub rating=5 → RPC error "InvalidRating" → `CardRatingDomainError("InvalidRating")`
- T-6: rating=1 (Again) → resolves z `newSrState.due` będącym przyszłym timestamp

### Integration Tests (placeholders — require real DB)

- T-5: Atomowość — symulacja blokady INSERT log → rollback UPDATE card_sr_state
- T-7: `review_logs` deny delete — DELETE jako auth user → RLS violation
- T-8: `review_logs` deny update — UPDATE jako auth user → RLS violation

### Manual Testing Steps

1. Uruchom `npm run dev`, wejdź w sesję powtórek dla decku z kartami wymagalnymi
2. Oceń kartę (rating 1–4) — karta powinna zniknąć z kolejki
3. Sprawdź Supabase Dashboard: `review_logs` i `card_sr_state` zaktualizowane
4. Spróbuj DELETE/UPDATE na `review_logs` przez Dashboard SQL Editor → 0 wierszy

## References

- Analiza domenowa: `context/domain/02-invariant-aggregate-refactor.md`
- Istniejące testy SR: `src/test/sr.test.ts`
- Wzorzec integration placeholder: `src/test/access-control.test.ts:230-233`
- API route: `src/pages/api/decks/[id]/review/[cardId].ts`
- Schema review_logs: `supabase/migrations/20260602000000_review_session.sql:8-30`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: DB Append-Only Enforcement

#### Automated

- [ ] 1.1 `npx supabase db push` kończy się kodem 0 (migracja deny-policies)
- [ ] 1.2 `npm run typecheck` — brak błędów po migracji

#### Manual

- [ ] 1.3 DELETE na `review_logs` jako auth user zwraca 0 wierszy lub błąd RLS
- [ ] 1.4 UPDATE na `review_logs` jako auth user zwraca 0 wierszy lub błąd RLS

### Phase 2: Postgres RPC Migration

#### Automated

- [ ] 2.1 `npx supabase db push` kończy się kodem 0 (migracja RPC)
- [ ] 2.2 `npm run gen-types` kończy się kodem 0
- [ ] 2.3 `npm run typecheck` — brak nowych błędów

#### Manual

- [ ] 2.4 `database.types.ts` zawiera `apply_card_rating_atomic` w sekcji Functions
- [ ] 2.5 Wywołanie RPC z nieistniejącym card_id zwraca wyjątek `CardNotFound` w Dashboard

### Phase 3: Domain Layer + Wiring

#### Automated

- [ ] 3.1 `npm run test` — wszystkie testy zielone (T-1–T-6 w CardRatingEvent.test.ts)
- [ ] 3.2 `npm run typecheck` — brak błędów
- [ ] 3.3 `npm run lint` — brak błędów
- [ ] 3.4 `npm run build` — build kończy się sukcesem

#### Manual

- [ ] 3.5 Submit oceny w UI → karta znika z kolejki, review_logs ma nowy wiersz
- [ ] 3.6 card_sr_state dla ocenionej karty ma zaktualizowane `due`, `reps`, `state`
- [ ] 3.7 DELETE na `review_logs` przez Dashboard → 0 wierszy (deny policy z Fazy 1 nadal aktywna)
