<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: SR Integration Correctness

- **Plan**: context/changes/testing-sr-integration-correctness/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical / 5 warnings / 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Symmetric oracle in applyRating happy path

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/test/sr.test.ts:185–199
- **Detail**: The oracle is built by calling `fsrsCardToDbUpdate(...)` — the same function exported from `sr.ts`. If `fsrsCardToDbUpdate` is gutted (returns `{}`), both sides of `toEqual` return `{}` and the test still passes. The test verifies the integration plumbing calls the function but cannot catch a broken field mapping inside it. Root cause of the 4 survived mutants in Group A.
- **Fix A ⭐ Recommended**: Add `expect(result.reps).toBe(1); expect(result.state).toBeGreaterThan(0)` alongside the `toEqual` — breaks the symmetric oracle for the most critical fields without asserting algorithm internals.
  - Strength: `reps` 0→1 and `state` New→Learning are structural guarantees of any first-review FSRS call, not tunable parameters.
  - Tradeoff: Anchors two ts-fsrs output values — monitor on major version upgrades.
  - Confidence: HIGH
  - Blind spot: A future ts-fsrs major version could change the state enum values.
- **Fix B**: Hand-write the expected object literal without calling `fsrsCardToDbUpdate`.
  - Strength: Fully breaks the symmetric oracle.
  - Tradeoff: Brittle — violates plan's "not asserting FSRS output values as business rules" principle.
  - Confidence: LOW
  - Blind spot: None.
- **Decision**: FIXED via Fix A — added `expect(result.reps).toBe(1); expect(result.state).toBeGreaterThan(0)` alongside toEqual in sr.test.ts:197–199.

### F2 — Fragile load flush in hook tests

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/test/useReviewSession.test.ts:104
- **Detail**: All three tests flush the initial load with `await act(() => Promise.resolve())` — a single microtask tick. The hook's `load()` involves fetch → res.json → two state updates → setLoading(false). If microtask scheduling changes (React version bump, test env change), the flush may not fully drain before `rate()` is called, causing `rate()` to silently no-op and tests to assert on stale state.
- **Fix A ⭐ Recommended**: Replace with `await waitFor(() => expect(result.current.current).toBeDefined())` from `@testing-library/react`.
  - Strength: Waits for actual state; immune to microtask scheduling differences. Canonical RTL pattern.
  - Tradeoff: Requires importing `waitFor`.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Fix B**: Double the flush: `await act(async () => { await Promise.resolve(); await Promise.resolve(); })`.
  - Strength: Zero new imports.
  - Tradeoff: Still timing-dependent; hides the problem.
  - Confidence: LOW
  - Blind spot: May still need three ticks.
- **Decision**: FIXED via Fix A (adapted) — replaced `await act(() => Promise.resolve())` with `await act(async () => {})` in all 3 tests. `waitFor` caused the "Raz jeszcze" test to fail (interaction with React 18 async batching); async empty `act` reliably drains all pending state updates without requiring a new import.

### F3 — reviewedIds dedup guard not tested

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useReviewSession.ts:78
- **Detail**: The guard `if (!reviewedIds.current.has(current.id))` prevents `reviewedCount` double-incrementing if a card is rated non-1 twice. No test exercises the `has(id) === true` branch. A future removal would cause a visible session-progress display bug (inflated reviewedCount).
- **Fix**: Add one test: mock initial load with `[CARD_A]`, call `rate(3)` twice, assert `reviewedCount` stays at 1 after both calls.
  - Strength: Directly exercises the dedup branch; user-visible behavior.
  - Tradeoff: Slight contrivance (queue is empty on second call).
  - Confidence: HIGH
  - Blind spot: A two-card re-queue scenario would test it more naturally but requires more setup.
- **Decision**: FIXED — added test "reviewedCount nie zwiększa się, gdy ta sama karta pojawia się w kolejce dwukrotnie": loads [CARD_A, CARD_A_dup] (same id), rates both 3, asserts reviewedCount stays at 1.

### F4 — Non-fatal log test misses console.error assertion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/sr.test.ts:218–231
- **Detail**: The non-fatal log test verifies `applyRating` resolves but does not assert `console.error` is called. Silently dropping the `if (logError) console.error(...)` line would pass every test. The log is the only production signal of a silent review_logs insert failure.
- **Fix**: Add `vi.spyOn(console, "error").mockImplementation(() => {})` and assert it was called with a string containing `"[review_logs]"`. Restore in cleanup.
- **Decision**: FIXED — added `vi.spyOn(console, "error").mockImplementation(() => {})` and `expect(consoleSpy).toHaveBeenCalledWith("[review_logs] insert failed:", "log insert failed")` to the non-fatal log test.

### F5 — remaining===0 assertion doesn't distinguish one-card-left from session-done

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/useReviewSession.test.ts:122–145
- **Detail**: After `rate(3)` on a two-card queue, `remaining === 0` is also what you'd see if the session were incorrectly finished (queue cleared entirely). No assertion pins `finished === false`.
- **Fix**: Add `expect(result.current.finished).toBe(false)` after the `rate(3)` call — one line.
- **Decision**: FIXED — added `expect(result.current.finished).toBe(false)` after the `rate(3)` assertions.

### F6 — deckId ownership eq-filter never asserted

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/sr.test.ts:196
- **Detail**: `applyRating`'s select query includes `.eq("cards.deck_id", deckId)` as a defense-in-depth ownership check. No test asserts this filter argument is passed. The stub ignores string values so omitting the filter in production code passes silently. Acceptable at this test layer if integration tests cover it.
- **Fix**: Defer to Phase 3 (auth/RLS) integration tests.
- **Decision**: SKIPPED — deferred to Phase 3 auth/RLS integration tests.

### F7 — lteFn module-level mutation creates latent fragility

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/sr.test.ts:67–89
- **Detail**: `makeSrCardStateChain()` calls `lteFn.mockReturnValue(chain)` each invocation, mutating the module-level `lteFn`'s return value to the newest chain. Harmless with one active supabase per test, but fragile if a future test creates two supabase instances.
- **Fix**: If tests expand to multi-instance scenarios, move `lteFn` inside the chain builder and expose via return value.
- **Decision**: SKIPPED — only matters if test structure expands to multi-instance scenarios.

### F8 — Initial load error path not covered in hook tests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/useReviewSession.test.ts
- **Detail**: `load()`'s `!res.ok` error branch is not tested. A maintainer could break the load error path without any test failing. User-visible: review page shows no error state on failed card load. Out of plan scope (plan excluded initial load lifecycle).
- **Fix**: Defer to Phase 3 (auth/RLS slice) or add a follow-up.
- **Decision**: SKIPPED — out of plan scope; defer to Phase 3 auth/RLS or a follow-up.

### F9 — Empty array case not explicitly asserted in lte test

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/sr.test.ts:156–163
- **Detail**: The `lte` filter test mocks `data: []` but only asserts `lteFn` was called — it doesn't assert `result` equals `[]`. The `.map()` returning empty is exercised but not pinned.
- **Fix**: Add `expect(result).toEqual([])` to the existing lte test — one line.
- **Decision**: FIXED — added `expect(result).toEqual([])` to the lte filter test.
