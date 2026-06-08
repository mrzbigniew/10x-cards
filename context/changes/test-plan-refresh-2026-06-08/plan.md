# Test Plan Refresh 2026-06-08 Implementation Plan

## Overview

Extend test coverage and fix two confirmed gaps arising from slices S-07 and S-08. Phase 1 fixes
the generating-phase dismiss guard in `GenerationModal`, fixes the missing `refresh()` in
`resetDeckProgress`, adds component + hook tests for both, and corrects a stale lesson. Phase 2
extends `useReviewSession.test.ts` with a three-scenario table for the Again-requeue depth risk
and refreshes the test-plan docs.

## Current State Analysis

- `GenerationModal.tsx:28-35` guards dismiss only when `phase === "reviewing"` — dismissing
  during `"generating"` (AI in flight) immediately calls `reset()` then `onClose()`, silently
  discarding pasted text.
- `useDeckList.ts:71-77` — `resetDeckProgress` never calls `refresh()` on success; the deck list
  goes stale after a successful progress reset. `createDeck` and `deleteDeck` both call `refresh()`
  correctly.
- `useReviewSession.test.ts` covers single-step Again requeue and mid-sequence state but never
  asserts the Again→Again chain or the `finished === true` terminal condition.
- `context/foundation/lessons.md:12-17` incorrectly names the portal library as "react-doom";
  the codebase uses `react-dom`'s `createPortal` (`GenerationModal.tsx:2`).
- `test-plan.md §4` says "no test infrastructure exists yet" — stale; Vitest + MSW are installed.
- No test file exists for `useDeckList`; zero test coverage for all three mutations.

### Key Discoveries:

- `handleCloseRequest` (`GenerationModal.tsx:28-35`): the `else` branch calls `reset()` then
  `onClose()` immediately for all non-reviewing phases, including `"generating"`. Fix is a 1-line
  condition change.
- `resetDeckProgress` (`useDeckList.ts:71-77`) has `[]` dependency array — adding `refresh` is
  safe because `refresh` is stable (`useCallback(() => setRefreshKey((k) => k+1), [])`).
- All three `useDeckList` mutations are pessimistic (no optimistic writes). The test oracle is the
  contract: error throws + no refresh; success no-throw + refresh.
- R-C implementation in `useReviewSession.ts` is correct — only tests need extension. The
  `finished` condition is `!loading && queue.length === 0` (line 96).

## What We're NOT Doing

- Not guarding `"input"` phase (no proposals generated yet; text loss is recoverable)
- Not guarding `"saving"` phase (sub-second window, friction cost > edge gain)
- Not adding a distinct dialog message for the generating phase — same Polish text reused
- Not adding new routes, schema changes, or service-layer code
- Not testing ts-fsrs algorithm internals (§7 exclusion)
- Not running mutation testing in this change (scope is too broad; narrow to single-file runs only)

## Implementation Approach

Phase 1 ships fixes and tests together so each test serves as a regression guard from day one.
Phase 2 extends an existing test file and updates foundation docs with no code changes.

## Critical Implementation Details

**Modal test isolation**: `GenerationModal` instantiates `useGeneration` internally and spreads
the result into `GenerationFlow`. Tests must `vi.mock('@/components/hooks/useGeneration')` to
control `phase`, and also `vi.mock('@/components/generation/GenerationFlow', () => ({ GenerationFlow: () => null }))` to
prevent child rendering from blocking the assertion. The `reset` spy must be captured from the
mock return so the test can assert it was NOT called when the guard fires.

**useDeckList refresh detection**: the hook re-fetches on `refreshKey` change via `useEffect`.
After a successful mutation the effect fires again, triggering a second `fetch('/api/decks')` call.
Assert `fetchSpy` call count: initial load = 1; after success = 2; after error = still 1.

---

## Phase 1: modal-and-hook-gaps

### Overview

Correct the stale lessons.md lesson; extend the generating-phase dismiss guard; fix the
`resetDeckProgress` missing `refresh()`; add `GenerationModal.test.tsx` and `useDeckList.test.ts`.

### Changes Required:

#### 1. lessons.md correction

**File**: `context/foundation/lessons.md`

**Intent**: Correct the "All modals must use a react-doom portal" lesson — the library named does
not exist; the codebase uses `react-dom`'s `createPortal`.

**Contract**: Update the heading to "All modals must use a react-dom portal". Update the rule body
to name `createPortal` from `react-dom` as the required mechanism and remove any reference to
`react-doom`.

#### 2. GenerationModal generating-phase guard

**File**: `src/components/generation/GenerationModal.tsx`

**Intent**: Extend `handleCloseRequest` so that dismissing while `phase === "generating"` shows
the same confirmation dialog as the reviewing phase, preventing silent text loss.

**Contract**: Condition in `handleCloseRequest` (line 29) changes from `phase === "reviewing"` to
`phase === "reviewing" || phase === "generating"`. The rest of the function and the dialog UI are
unchanged.

#### 3. useDeckList resetDeckProgress bug fix

**File**: `src/components/hooks/useDeckList.ts`

**Intent**: Call `refresh()` after a successful `resetDeckProgress` response so the deck list
reflects the reset server state immediately.

**Contract**: Add `refresh()` after the `!res.ok` early-throw in `resetDeckProgress`. Update the
`useCallback` dependency array from `[]` to `[refresh]`.

#### 4. GenerationModal component test

**File**: `src/test/GenerationModal.test.tsx`

**Intent**: Assert that the generating-phase dismiss guard fires (confirmation dialog appears)
instead of immediately calling `onClose`. Regression-guard the reviewing-phase guard. Control-case
the input-phase immediate close.

**Contract**: Three `it` cases in `describe("GenerationModal — handleCloseRequest")`:

1. `faza "generating" → pokazuje dialog potwierdzenia` — `vi.mock('@/components/hooks/useGeneration')`
   returns `{ phase: "generating", reset: vi.fn(), ... }`. Render `<GenerationModal isOpen onClose={spy} />`.
   Click the `aria-label="Zamknij"` button. Assert `getByText(/Zamknąć/)` is visible. Assert `spy`
   not called. Assert `reset` spy not called.

2. `faza "reviewing" → pokazuje dialog potwierdzenia` — same setup with `phase: "reviewing"`.
   Same assertions.

3. `faza "input" → zamyka bezpośrednio` — `phase: "input"`. Click close. Assert `spy` called once.
   Assert confirmation text not in document.

Mock `@/components/generation/GenerationFlow` as `() => null` to isolate the guard logic.
Use `@testing-library/react` `render` + `screen`; query with `getByText` / `queryByText`.

#### 5. useDeckList hook test

**File**: `src/test/useDeckList.test.ts`

**Intent**: Cover the error and success paths for all three mutations, asserting the pessimistic
contract: error throws without triggering a refresh; success triggers a refresh (second fetch).

**Contract**: Three `describe` blocks (`"createDeck"`, `"deleteDeck"`, `"resetDeckProgress"`),
each with two `it` cases:

- **Error case**: initial load fetch (`/api/decks`) returns `ok: true`; mutation fetch returns
  `ok: false, json: { error: "Błąd serwera" }`. Assert the mutation call `rejects.toThrow("Błąd serwera")`.
  Assert `fetchSpy.mock.calls.length === 1` (initial load only; no refresh).

- **Success case**: initial load returns ok; mutation fetch returns `ok: true, json: {}`.
  Assert the mutation call resolves without throw. Assert `fetchSpy.mock.calls.length === 2`
  (initial load + post-success refresh).

The `resetDeckProgress` success case is the regression guard for the bug fix — if `refresh()` is
absent, call count stays at 1 and the test fails.

Use `vi.spyOn(globalThis, "fetch")` + `mockResolvedValueOnce` per the `useGeneration.test.ts`
pattern. `afterEach(vi.restoreAllMocks)`.

### Success Criteria:

#### Automated Verification:

- All existing tests still pass: `npm run test`
- New `GenerationModal` tests pass: `npm run test -- GenerationModal`
- New `useDeckList` tests pass: `npm run test -- useDeckList`
- TypeScript: `npm run typecheck` passes with no new errors
- Lint: `npm run lint` passes

#### Manual Verification:

- Paste text in generation modal → click Generate → while generating spinner is visible, click × → confirmation dialog appears (not immediate close)
- Click "Anuluj" in dialog → modal stays open, generation continues
- Click × again → confirm → modal closes
- Navigate to Deck List → click Reset Progress for any deck → deck list updates immediately without page reload

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before proceeding to Phase 2. Phase blocks use plain bullets — the
corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom.

---

## Phase 2: review-requeue-depth

### Overview

Add three named scenario cases to `useReviewSession.test.ts` for the Again-requeue depth risk,
then update `test-plan.md` to remove stale copy, document the new phases, add cookbook patterns,
and bump freshness.

### Changes Required:

#### 1. useReviewSession test extension

**File**: `src/test/useReviewSession.test.ts`

**Intent**: Add a second `describe` block that covers the Again→Again chain, multi-card mixed
sessions, and the `remaining` invariant — all behaviors untested in the current four cases.

**Contract**: Add `describe("useReviewSession — głębokość ponownego kolejkowania")` with three
`it` cases:

1. `pojedyncza karta: Raz jeszcze → Raz jeszcze → dobra → finished === true` — one-card session
   (CARD_A only). Rate `1` twice, then rate `3`. At each intermediate Again step, assert `current`
   is CARD_A and `finished === false`. After the non-Again rating, assert `finished === true` and
   `queue.length === 0` (via the hook's return).

2. `wiele kart: wszystkie Raz jeszcze, potem wszystkie dobra → sesja kończy się na końcu` — two
   cards (CARD_A, CARD_B). Rate CARD_A `1`, rate CARD_B `1` (both requeued), then rate the
   requeued CARD_A `3`, then rate the requeued CARD_B `3`. Assert `finished === false` after each
   Again. Assert `finished === true` only after the final non-Again.

3. `remaining > 0 kiedy ponownie kolejkowane karty są w kolejce` — two cards. Rate CARD_A `1`
   (requeued). Assert `remaining === 1` (CARD_B is current, CARD_A is tail; `remaining =
queue.length - 1 = 1`). This proves the queue doesn't drain prematurely.

Every case must assert `finished === true` or `finished === false` explicitly at the terminal step.
No case ends with only an intermediate state assertion — this avoids the anti-pattern confirmed in
the existing tests.

Fetch mock setup follows the existing test pattern: `vi.spyOn(globalThis, "fetch")` with one
`mockResolvedValueOnce` per fetch call (initial load + one per `rate()` call).

#### 2. test-plan.md updates

**File**: `context/foundation/test-plan.md`

**Intent**: Remove stale "no test infrastructure" text in §4; document new phases in §3 and §6.5;
bump freshness in §8 and add the F-02 i18n watch item.

**Contract** (section by section):

- **§2 Risk Map**: add three rows — R-A (High × Medium, modal generation lifecycle), R-B
  (Medium × High, `resetDeckProgress` stale UI after reset), R-C (High × Medium, Again-requeue
  depth and session-end). Source column cites the change brief and research doc.

- **§3 Phased Rollout**: add two rows:
  - Phase 5 | `modal-and-hook-gaps` | Fix generating-phase guard + resetDeckProgress bug;
    add GenerationModal + useDeckList tests | R-A, R-B | unit + component | planned |
    `context/changes/test-plan-refresh-2026-06-08/`
  - Phase 6 | `review-requeue-depth` | Extend useReviewSession tests for Again-requeue depth;
    refresh test-plan docs | R-C | unit | planned |
    `context/changes/test-plan-refresh-2026-06-08/`

- **§4 Stack**: remove the sentence "No test infrastructure exists yet — Phase 1 bootstraps the
  runner." Update the opening sentence to reflect that Vitest + MSW are installed. Update the
  Vitest and MSW rows from "latest (to install in Phase 1)" to installed versions (check
  `package.json` for current pinned versions at implement time).

- **§6.5 Per-rollout-phase notes**: replace "(Filled in as phases ship.)" with substantive notes:
  - Phase 5 (modal-and-hook-gaps): document the pessimistic mutation contract
    (error=throw+no-refresh, success=no-throw+refresh); note the guard extension pattern for
    `handleCloseRequest`.
  - Phase 6 (review-requeue-depth): document the scenario-table pattern for Again-requeue
    (each scenario must assert `finished` at the terminal step; no test ends on intermediate state).

- **§8 Freshness Ledger**: bump "Strategy (§1–§5) last reviewed" to 2026-06-08. Add watch item:
  "F-02 (i18n) ships — review §2 Risk Map for new text-handling risks in generation and deck
  management flows."

### Success Criteria:

#### Automated Verification:

- All tests (including Phase 1 additions) pass: `npm run test`
- TypeScript: `npm run typecheck` passes
- Lint: `npm run lint` passes

#### Manual Verification:

- `test-plan.md §4` no longer contains "no test infrastructure exists yet"
- `test-plan.md §3` table has R-1 and R-2 rows (phases 5 and 6) with correct status, risks, and change folder
- `test-plan.md §6.5` has substantive notes for both new phases (not "TBD")
- `test-plan.md §8` freshness date is current and F-02 watch item appears

---

## Testing Strategy

### Unit Tests:

- `GenerationModal.test.tsx`: guard fires for `generating` + `reviewing`; immediate close for `input`
- `useDeckList.test.ts`: error path (throw, no refresh) and success path (no throw, refresh triggered) for each of the three mutations; `resetDeckProgress` success case is the regression guard for the bug fix
- `useReviewSession.test.ts` extension: Again→Again chain reaches `finished === true`; multi-card all-Again session ends only after last non-Again; `remaining` non-zero during re-queue

### Integration Tests:

None — all changes are unit/component layer. No new API routes or DB changes.

### Manual Testing Steps:

1. Paste text in generation modal → click Generate → while generating, click × → guard dialog appears
2. "Anuluj" in guard dialog → generation resumes from where it was
3. Click × again → confirm → modal closes cleanly
4. Navigate to Deck List → Reset Progress for any deck → list refreshes immediately
5. Open review session → rate a card Again twice → confirm card reappears each time, session does not end prematurely

## Performance Considerations

No performance impact. Changes are limited to a 1-line condition extension, a 1-line function call
addition, and test files.

## Migration Notes

No schema or API changes.

## References

- Research: `context/changes/test-plan-refresh-2026-06-08/research.md`
- `src/components/generation/GenerationModal.tsx:28-35` — handleCloseRequest guard (fix target)
- `src/components/hooks/useDeckList.ts:71-77` — resetDeckProgress (bug location)
- `src/test/useGeneration.test.ts` — hook test pattern (fetch spy, act, asserting phase)
- `src/test/useReviewSession.test.ts:86` — existing Again test (starting point for Phase 2 extension)
- `context/archive/2026-06-03-modal-generate-flashcards/plan.md` — S-07 implementation context

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: modal-and-hook-gaps

#### Automated

- [x] 1.1 All existing tests pass: `npm run test`
- [x] 1.2 New GenerationModal tests pass: `npm run test -- GenerationModal`
- [x] 1.3 New useDeckList tests pass: `npm run test -- useDeckList`
- [x] 1.4 TypeScript passes: `npm run typecheck`
- [x] 1.5 Lint passes: `npm run lint`

#### Manual

- [x] 1.6 Dismissing modal during generation shows confirmation dialog, not immediate close
- [x] 1.7 Cancelling guard dialog resumes generation; confirming closes modal
- [x] 1.8 Resetting deck progress immediately updates deck list without page reload

### Phase 2: review-requeue-depth

#### Automated

- [ ] 2.1 All tests pass (including Phase 1 tests): `npm run test`
- [ ] 2.2 TypeScript passes: `npm run typecheck`
- [ ] 2.3 Lint passes: `npm run lint`

#### Manual

- [ ] 2.4 test-plan.md §4 no longer says "no test infrastructure exists yet"
- [ ] 2.5 test-plan.md §3 table includes phases 5 and 6 with correct metadata
- [ ] 2.6 test-plan.md §6.5 has substantive per-phase notes for both new phases
- [ ] 2.7 test-plan.md §8 freshness date is current and F-02 watch item appears
