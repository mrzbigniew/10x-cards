# SR Integration Correctness — Unit Tests Implementation Plan

## Overview

Write unit tests that prove the review service integration boundary is correct:
`loadDueCards` filters by due date and maps results correctly, `applyRating` persists
the FSRS-computed state and handles a non-fatal log failure without propagating it,
and `useReviewSession`'s Again-requeue logic moves the card to the end of the queue.
This is test-plan §3 Phase 2, covering risk #3.

## Current State Analysis

The SR service (`src/lib/services/sr.ts`) and the review session hook
(`src/components/hooks/useReviewSession.ts`) are fully implemented and in production.
No tests exist for either. The only SR-adjacent test placeholder is a `.todo` in
`src/test/decks.test.ts:167` for a future integration test.

The test infrastructure (Vitest, `@testing-library/react`, fluent-builder Supabase
stub pattern) was established in Phase 1 (`testing-critical-path-coverage`).
Canonical examples are `src/test/generation.test.ts` (service unit test),
`src/test/decks.test.ts` (fluent-builder stub), and `src/test/useGeneration.test.ts`
(React hook test with fetch spy).

### Key Discoveries:

- `sr.ts:8` — `const scheduler = fsrs()` is module-level; it is NOT mocked in tests.
  Real ts-fsrs is used with controlled inputs to derive deterministic expected values.
- `sr.ts:94-132` — `applyRating` makes three Supabase calls: (1) select + `.single()`
  to load card state, (2) update ending with `.eq()` (no `.single()`), (3) insert into
  `review_logs`. The update chain terminates without `.single()`, which is different from
  the select chain — see Critical Implementation Details.
- `sr.ts:125-129` — the `review_logs` insert is explicitly non-fatal: a failure logs to
  console but does not throw. This design decision must be covered by a test.
- `useReviewSession.ts:71-76` — Again (rating=1) requeues by spreading the updated `sr`
  state into the head card and appending it to the tail. Non-1 ratings call `q.slice(1)`.
- `fsrsCardToDbUpdate` is exported from `sr.ts:25`; `rowToFsrsCard` is not exported.
  Tests must independently replicate the row→Card mapping to construct the oracle value.

## Desired End State

After this plan completes:
- `src/test/sr.test.ts` covers `loadDueCards` (filter + mapping + error) and
  `applyRating` (happy path + load error + update error + non-fatal log failure).
- `src/test/useReviewSession.test.ts` covers Again-requeue, Good card removal, and
  fetch error state.
- All 10 test cases pass under `npm test`.
- Survived mutants in `sr.ts` are reviewed and documented.
- `test-plan.md §3` Phase 2 status updated to `done`.

### Key Discoveries (continued):

- `src/lib/services/sr.ts` — full source; three Supabase operations in `applyRating`
- `src/components/hooks/useReviewSession.ts` — full source; requeue at lines 71-76
- `src/test/decks.test.ts` — fluent-builder pattern to replicate for SR tables
- `src/test/useGeneration.test.ts` — fetch spy + `act()` pattern to replicate for hook

## What We're NOT Doing

- Not testing ts-fsrs algorithm correctness — that is ts-fsrs's own test suite.
- Not asserting specific FSRS output values (stability, difficulty, due date) as
  business rules — they are algorithm outputs, not integration assertions.
- Not writing integration tests against a real DB — that is Phase 3 (auth/RLS slice).
- Not testing the full `useReviewSession` hook lifecycle (initial load, `finished`
  state, `reviewedCount` precision) — only the behaviors directly tied to risk #3.
- Not touching the Stryker config or `test:mutation` script — we run Stryker via
  `npx stryker run` with a `--mutate` override as a manual post-ship step.

## Implementation Approach

Two test files following the patterns established in Phase 1:

1. **`src/test/sr.test.ts`** — unit tests for `loadDueCards` and `applyRating` using a
   typed fluent-builder Supabase stub (`makeSrSupabase()`). The stub routes `from(table)`
   to table-specific chain builders with `vi.fn()` terminals. The `applyRating` happy
   path derives its oracle by independently constructing a `Card` from the fixture row
   (replicating `rowToFsrsCard`) and calling real ts-fsrs to get the expected DB update.

2. **`src/test/useReviewSession.test.ts`** — hook tests using `renderHook` + `act` +
   `vi.spyOn(globalThis, 'fetch')`. Each test mocks the initial load fetch and the rate
   POST separately using `mockResolvedValueOnce` chaining.

## Critical Implementation Details

**FSRS oracle construction**: `rowToFsrsCard` is not exported, so the test must
independently replicate its mapping to compute the oracle. In the `applyRating` happy
path test, construct a `Card` object with the same fields as `INITIAL_CARD_ROW` (matching
`rowToFsrsCard`'s field mapping at `sr.ts:10-23`), call
`fsrsCardToDbUpdate(scheduler.next(card, TEST_NOW, 3).card)`, and use that result as the
expected argument to the update stub. This catches `rowToFsrsCard` mapping bugs — if a
field is mapped to the wrong FSRS input, `scheduler.next` will produce different output
and the assertion will fail.

**Stub routing — operation-type-aware, not call-order-dependent**: The `card_sr_state`
chain must detect which operation is being performed (analogous to `makeDecksChain()` in
`decks.test.ts`). Track which method is called first on the chain: if `.select()` is
called first, the chain is in select mode; if `.update()` is called first, the chain is
in update mode. Within select mode, route the terminal: `.single()` returns `srLoadSingleFn()`
(for the `applyRating` load) and `.order()` returns `loadDueResultFn()` (for the
`loadDueCards` array result). This means a single `makeSrSupabase()` serves all test
suites without call-order `mockImplementationOnce` on `from()`.

**Update chain terminates without `.single()`**: The `card_sr_state` update in
`applyRating` (sr.ts:117-122) ends with `.eq("user_id", userId)`, not `.single()`. The
update chain calls `.eq()` twice — once for `card_id` and once for `user_id`. Set up the
update chain's `.eq` exactly as follows (matching the lazy-routing pattern from
`makeDecksChain()` in `decks.test.ts`):

```ts
chain.eq = vi.fn()
  .mockReturnValueOnce(chain)                // first .eq("card_id", …) — returns chain
  .mockImplementation(() => srUpdateFn());   // second .eq("user_id", …) — terminal
```

Each test calls `srUpdateFn.mockResolvedValueOnce(...)` **before** calling `applyRating`
so that the lazy invocation picks up the per-test return value. Do NOT use
`mockReturnValueOnce(srUpdateFn())` (eager call at chain-build time) — that resolves
`srUpdateFn` before the test has configured it, making the update-error test pass
vacuously (applyRating awaits an already-resolved `{ error: undefined }` and never throws).

---

## Phase 1: Service Layer Tests

### Overview

Write `src/test/sr.test.ts` with a fluent-builder Supabase stub and seven test cases
covering `loadDueCards` and `applyRating`.

### Changes Required:

#### 1. New test file: sr.test.ts

**File**: `src/test/sr.test.ts`

**Intent**: Establish fixtures, build the Supabase stub, and write all service-layer test
cases for risk #3 in a single file following the `decks.test.ts` pattern.

**Contract**: The file contains four sections:
- **Fixtures block** — `INITIAL_CARD_ROW` (a `Tables<"card_sr_state">` with `state=0`,
  all numeric fields zeroed, `due` set to a past ISO timestamp, `card_id`, `user_id`
  filled), `TEST_NOW = new Date("2026-01-15T10:00:00Z")`, `USER_ID`, `DECK_ID`,
  `CARD_ID` constants.
- **Fluent-builder stub** — `makeSrSupabase()` factory returning a `SupabaseClientType`
  mock. Exposes module-level `vi.fn()` terminals: `srLoadSingleFn` (select `.single()`
  terminal for `applyRating` load), `srUpdateFn` (update terminal returning
  `Promise<{ error }>` for `applyRating` persist), `reviewLogsInsertFn` (insert terminal
  for `review_logs`), `loadDueResultFn` (array result terminal for `loadDueCards`),
  `lteFn` (intermediate chain spy for asserting `.lte("due", dueBefore)` in the filter
  test — `vi.fn().mockReturnValue(chain)`). The `from("card_sr_state")` chain routes by
  operation type (select vs update) detected from which method is called first; see
  Critical Implementation Details. `from("review_logs")` always returns the insert chain.
- **`loadDueCards` describe block** — three test cases (see below).
- **`applyRating` describe block** — four test cases (see below).

**`loadDueCards` test cases** (Polish test descriptions):
- "zwraca zmapowane karty DueCard[] gdy Supabase zwróci dane" — stub returns a row with
  embedded `cards: { id, front, back }` matching `INITIAL_CARD_ROW`; assert returned
  array shape: `[{ id, front, back, sr }]` where `sr` is the raw row minus `cards`.
- "przekazuje filtr lte('due', dueBefore) do Supabase" — call `loadDueCards` with a
  `dueBefore` string; assert `loadDueResultFn`'s chain had `.lte("due", dueBefore)` called
  (capture the stub's chain spy and assert the call). Alternatively assert on the argument
  the stub chain received.
- "rzuca błąd gdy Supabase zwróci error" — stub returns `{ data: null, error: { message:
  "db error" } }`; assert `rejects.toThrow("db error")`.

**`applyRating` test cases** (Polish test descriptions):
- "aktualizuje card_sr_state z wynikiem FSRS i zwraca RatingResult przy ocenie Dobra" —
  happy path with `rating=3`. Construct the oracle: build a `Card` from `INITIAL_CARD_ROW`
  (replicate `rowToFsrsCard` field mapping), call `fsrsCardToDbUpdate(scheduler.next(card,
  TEST_NOW, 3).card)`, store as `expectedUpdate`. Set `srLoadSingleFn` to return
  `{ data: { ...INITIAL_CARD_ROW, cards: { deck_id: DECK_ID } }, error: null }`,
  `srUpdateFn` to return `{ error: null }`, `reviewLogsInsertFn` to return
  `{ error: null }`. Call `applyRating(supabase, USER_ID, CARD_ID, DECK_ID, 3, TEST_NOW)`.
  Assert: return value deep-equals `expectedUpdate`; `srUpdateFn` was called; 
  `reviewLogsInsertFn` was called.
- "rzuca błąd gdy ładowanie card_sr_state nie powiedzie się" — `srLoadSingleFn` returns
  `{ data: null, error: { message: "load failed" } }`; assert `rejects.toThrow("load
  failed")`.
- "rzuca błąd gdy update card_sr_state nie powiedzie się" — `srLoadSingleFn` returns
  success, `srUpdateFn` returns `{ error: { message: "update failed" } }`; assert
  `rejects.toThrow("update failed")`.
- "błąd wstawiania review_log nie jest propagowany — applyRating rozwiązuje się pomyślnie"
  — `srLoadSingleFn` and `srUpdateFn` return success, `reviewLogsInsertFn` returns
  `{ error: { message: "log insert failed" } }`; assert that `applyRating` resolves (does
  NOT reject) and returns the expected update object.

### Success Criteria:

#### Automated Verification:

- All 7 test cases in sr.test.ts pass: `npm test -- sr.test.ts`
- Full test suite still passes: `npm test`
- Typecheck passes: `npm run check` (or `npx astro check`)
- Lint passes: `npm run lint`

#### Manual Verification:

- Run `npm test -- sr.test.ts -- --reporter=verbose` and confirm all 7 case names are
  visible and passing.
- Confirm the non-fatal log test explicitly shows that `applyRating` resolved — not just
  that no error was thrown by Vitest.

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Hook Tests

### Overview

Write `src/test/useReviewSession.test.ts` with three test cases covering Again-requeue,
card removal on Good rating, and error state on fetch failure.

### Changes Required:

#### 1. New test file: useReviewSession.test.ts

**File**: `src/test/useReviewSession.test.ts`

**Intent**: Prove that `useReviewSession`'s queue manipulation logic matches the expected
behavior for the three scenarios tied to risk #3: requeue on Again, dequeue on non-Again,
and error propagation.

**Contract**: The file follows the `useGeneration.test.ts` pattern exactly:
`vi.spyOn(globalThis, "fetch")` for all network calls, `renderHook` + `act` wrappers,
`afterEach(() => vi.restoreAllMocks())`. Each test mocks fetch **twice** in sequence:
once for the initial `useEffect` load (GET `/api/decks/…/review?due_before=…`) and once
for the rate POST. Use `mockResolvedValueOnce` chained on the same spy.

Fixtures: `DECK_ID = "deck-1"`, `CARD_A` and `CARD_B` as `DueCard` objects with distinct
`id` and `sr` fields, `UPDATED_SR_A` and `UPDATED_SR_B` as `RatingResult` objects returned
by the mock POST responses (one per card, used when mocking sequential rate(1) calls and
when mocking the Good-rating POST for CARD_A).

**Test cases** (Polish test descriptions):
- "ocena 'Raz jeszcze' (1) przesuwa kartę na koniec kolejki ze zaktualizowanym sr" —
  Mock fetch **three** times: initial load returning `{ cards: [CARD_A, CARD_B] }`, then
  rate(1) on CARD_A returning `{ sr: UPDATED_SR_A }`, then rate(1) on CARD_B returning
  `{ sr: UPDATED_SR_B }`. After mounting and flushing the load, call
  `act(async () => { await result.current.rate(1) })`. Assert after first rate:
  `result.current.current.id === CARD_B.id` (CARD_B is now first);
  `result.current.remaining === 1` (CARD_A is still in queue at end);
  `result.current.againCount === 1`. Then call `rate(1)` again (consumes second mock).
  Assert after second rate: `result.current.current.id === CARD_A.id` (CARD_A cycles
  back); `result.current.current.sr` includes the UPDATED_SR_A fields (proves the sr
  merge from the first rate call was applied correctly).

  Note: `useReviewSession` does not expose `queue` in its return value — only `current`
  (= queue[0]) and `remaining` (= queue.length − 1) are accessible. The two-step rate
  approach verifies both queue ordering and the sr merge through the public API.
- "ocena niezerowa (3) usuwa kartę z kolejki i zwiększa reviewedCount" — same initial
  load. Mock POST returns `{ sr: UPDATED_SR_A }`. Call `rate(3)`. Assert:
  `result.current.remaining === 0` (only one card left, none behind);
  `result.current.current.id === CARD_B.id`; `reviewedCount === 1`.
- "błąd fetch przy rate() ustawia stan error" — initial load returns cards. Mock POST
  returns `{ ok: false, json: vi.fn().mockResolvedValue({ error: "Błąd serwera" }) }`.
  Call `rate(3)`. Assert: `result.current.error === "Błąd serwera"`.

**Note on mount flush**: After `renderHook`, wrap the initial-load assertion in
`await act(async () => {})` to flush the `useEffect` fetch before calling `rate()`.

### Success Criteria:

#### Automated Verification:

- All 3 test cases in useReviewSession.test.ts pass: `npm test -- useReviewSession.test.ts`
- Full test suite still passes: `npm test`
- Typecheck passes: `npm run check`
- Lint passes: `npm run lint`

#### Manual Verification:

- Run with `--reporter=verbose` and confirm all 3 case names are visible.
- Confirm the Again test explicitly checks both queue order and the `sr` field update —
  not just that `againCount` incremented.

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Mutation Triage

### Overview

Run Stryker on `sr.ts` scoped to the service functions covered by Phase 1 tests, review
survived mutants, and document decisions in `sr.test.ts`.

### Changes Required:

#### 1. Mutation run and triage

**File**: `src/test/sr.test.ts` (append mutation exclusion comments at bottom)

**Intent**: After the tests ship, identify which mutants in `sr.ts` survive and make an
explicit, auditable decision for each — either add an assertion (if the mutant represents
a user-visible or business-relevant bug) or document it as equivalent (if cosmetic or
unreachable).

**Contract**: Run `npx stryker run --mutate "src/lib/services/sr.ts"`. For each survived
mutant, follow the pattern from test-plan §6.1: append a comment block at the bottom of
`sr.test.ts` in this format:
```
// Survived mutants (sr.ts) — reviewed 2026-xx-xx
// - [line N] <mutant description>: equivalent — <reason>
// - [line N] <mutant description>: added assertion in "<test case name>"
```
New assertions added for non-equivalent survived mutants are added inline in the
appropriate test case, not as separate test cases.

#### 2. Update test-plan Phase 2 status

**File**: `context/foundation/test-plan.md`

**Intent**: Mark Phase 2 as `done` in the phased rollout table so the orchestrator and
future readers know this slice landed.

**Contract**: In §3 Phased Rollout table, change the Phase 2 row's `Status` cell from
`not started` to `done` and fill in `Change folder` with
`context/changes/testing-sr-integration-correctness/`.

### Success Criteria:

#### Automated Verification:

- `npx stryker run --mutate "src/lib/services/sr.ts"` completes without configuration errors.

#### Manual Verification:

- Every survived mutant in `sr.ts` has a comment in `sr.test.ts` with an explicit
  decision (equivalent or assertion added).
- `context/foundation/test-plan.md` Phase 2 row shows `done`.

**Implementation Note**: After completing this phase and all verification passes, this
change is ready for review.

---

## Testing Strategy

### Unit Tests:

- `loadDueCards`: filter application (`.lte` called with correct args), result mapping
  (DueCard[] shape), DB error propagation.
- `applyRating`: FSRS integration (oracle from controlled inputs), `card_sr_state` update
  persistence, `review_logs` insert, non-fatal log failure branch, fatal error branches.
- `useReviewSession` hook: queue reorder on Again, queue dequeue on non-Again,
  `reviewedCount`/`againCount` increments, error state on fetch failure.

### Integration Tests:

- Deferred to Phase 3 (auth/RLS slice). The placeholder `.todo` in `decks.test.ts:167`
  covers the `card_sr_state` row count assertion.

### Manual Testing Steps:

1. Run `npm test -- --reporter=verbose` and verify all test case names are in Polish and
   match the descriptions above.
2. Temporarily break `rowToFsrsCard` (swap one field) and confirm the `applyRating`
   happy-path test fails — validates the oracle approach is actually sensitive to mapping
   bugs.
3. Temporarily remove the `if (logError) console.error(...)` guard in `applyRating` and
   add a throw — confirm the non-fatal test now fails.

## References

- Risk #3 coverage spec: `context/foundation/test-plan.md` §2, §3 Phase 2
- Service under test: `src/lib/services/sr.ts`
- Hook under test: `src/components/hooks/useReviewSession.ts`
- Stub pattern: `src/test/decks.test.ts`
- Hook test pattern: `src/test/useGeneration.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Service Layer Tests

#### Automated

- [x] 1.1 All 7 sr.test.ts cases pass: `npm test -- sr.test.ts`
- [x] 1.2 Full test suite still passes: `npm test`
- [x] 1.3 Typecheck passes: `npm run check`
- [x] 1.4 Lint passes: `npm run lint`

#### Manual

- [ ] 1.5 All 7 case names visible and passing with `--reporter=verbose`
- [ ] 1.6 Non-fatal log test explicitly confirms `applyRating` resolved

### Phase 2: Hook Tests

#### Automated

- [ ] 2.1 All 3 useReviewSession.test.ts cases pass: `npm test -- useReviewSession.test.ts`
- [ ] 2.2 Full test suite still passes: `npm test`
- [ ] 2.3 Typecheck passes: `npm run check`
- [ ] 2.4 Lint passes: `npm run lint`

#### Manual

- [ ] 2.5 All 3 case names visible and passing with `--reporter=verbose`
- [ ] 2.6 Again test checks both queue order and `sr` field update

### Phase 3: Mutation Triage

#### Automated

- [ ] 3.1 `npx stryker run --mutate "src/lib/services/sr.ts"` completes without config errors

#### Manual

- [ ] 3.2 Every survived mutant documented in sr.test.ts comment block
- [ ] 3.3 test-plan.md Phase 2 row shows `done`
