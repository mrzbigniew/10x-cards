<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Test Plan Refresh 2026-06-08

- **Plan**: context/changes/test-plan-refresh-2026-06-08/plan.md
- **Scope**: Phase 1 + Phase 2 of 2
- **Date**: 2026-06-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Scenario 3 ends on intermediate state, violating plan anti-pattern rule

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/test/useReviewSession.test.ts:306-327
- **Detail**: The plan requires "No case ends with only an intermediate state assertion." Scenario 3 rated CARD_A as Again and ended on `expect(result.current.remaining).toBe(1)` with no `finished` assertion. The plan's own scenario description only said "Assert remaining === 1", creating an internal contradiction, but the global anti-pattern rule was unambiguous.
- **Fix**: Added `expect(result.current.finished).toBe(false)` after the `remaining === 1` assertion.
- **Decision**: FIXED

### F2 — setToastVisible(true) fires after onClose() — toast may silently drop

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/generation/GenerationModal.tsx:57-58 (pre-existing; not introduced by this change)
- **Detail**: `handleDone()` called `onClose()` first, then `setToastVisible(true)`. If the parent conditionally renders `{isOpen && <GenerationModal />}`, calling `onClose()` sets `isOpen = false` and the component unmounts before `setToastVisible(true)` executes — the success toast is silently dropped.
- **Fix A ⭐ Applied**: Moved `setToastVisible(true)` to before `onClose()` in handleDone — one-line reorder, no side-effect dependencies.
- **Decision**: FIXED (Fix A)

### F3 — Two buttons named "Zamknij" coexist when guard is shown

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/generation/GenerationModal.tsx:85-91 and 105-110
- **Detail**: Header X button has `aria-label="Zamknij"`. Confirm-close dialog button text is also "Zamknij". Both mount simultaneously when guard is shown — `getByRole("button", { name: "Zamknij" })` would throw "found multiple elements" in any test that queries after guard appears.
- **Fix**: Added `aria-label="Potwierdź zamknięcie"` to the confirm-close button.
- **Decision**: FIXED

### F4 — "faza input" test: missing reset() call assertion

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/test/GenerationModal.test.tsx:62-71
- **Detail**: Production code calls `reset()` in the else branch before `onClose()`. The "faza input" test asserted `onClose` was called and guard not shown, but did not assert `reset()` was called. A regression removing `reset()` would not be caught.
- **Fix**: Destructured `reset` from `setupMock("input")` and added `expect(reset).toHaveBeenCalledOnce()`.
- **Decision**: FIXED

### F5 — Single-tick act(Promise.resolve()) may not settle multi-step async hook chains

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/useDeckList.test.ts:16, 54, 92, 130
- **Detail**: `await act(() => Promise.resolve())` used for async flush. The hook chain is fetch → .json() → setState — at minimum two microtask ticks. A single tick may not flush both. Pre-existing pattern across the suite; tests pass in practice but structurally fragile.
- **Fix**: Replaced all four instances with `await act(async () => { await Promise.resolve(); await Promise.resolve(); })`.
- **Decision**: FIXED
