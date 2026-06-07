<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auth and Access Control Implementation Plan

- **Plan**: context/changes/auth-and-access-control/plan.md
- **Mode**: Deep
- **Date**: 2026-06-07
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

6/6 paths ✓ (middleware.ts, decks.ts, cards.ts, sr.ts, decks.test.ts, 20260602000000_review_session.sql — middleware.test.ts and access-control.test.ts absent as expected, new files), 3/3 symbols ✓ (PUBLIC_API_ROUTES confirmed ["/api/auth"] at middleware.ts:13; listDecksWithCardCount terminal is .order() at decks.ts:58; srLoadSingleFn pattern confirmed at sr.test.ts:52,86), brief↔plan ✓

## Findings

### F1 — `next` function mock absent from Critical Implementation Details

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Critical Implementation Details / Mock context factory
- **Detail**: The mock context factory lists `url`, `locals`, `request`, `cookies`, and `redirect` in detail but omits the `next` function, which is the second parameter to `onRequest(context, next)` — separate from the context object. Scenarios 3, 4, and 5 assert "next() called"; without a mock `next`, the middleware's `return next()` calls (lines 31 and 45 of middleware.ts) throw `TypeError: next is not a function`. TypeScript also flags the missing second argument since `MiddlewareHandler` requires two parameters.
- **Fix**: Add `const mockNext = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }))` to the test helper and pass it as the second argument: `onRequest(mockContext, mockNext)`. Assertions for scenarios 3/4/5 use `expect(mockNext).toHaveBeenCalledOnce()`.
- **Decision**: PENDING

### F2 — Manual step 2.6 requires git reversion that the plan ordering doesn't facilitate

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Changes Required order vs. Manual Verification 2.6
- **Detail**: Phase 2 applies the middleware fix first, then writes the test file. Manual step 2.6 says "confirm scenario 6 fails before the middleware fix and passes after." By the time the test file exists, the fix is already committed — there is no natural point in the plan's order where both the test and the unfixed middleware coexist. Verifying 2.6 as written would require `git stash` or a temporary revert.
- **Fix**: Add a parenthetical to step 2.6: "or verify by inspection — scenario 6 would fail on the old prefix because `/api/auth2` satisfies `startsWith('/api/auth')` but not `startsWith('/api/auth/')`. Running the unfixed version to confirm is optional." Alternatively, swap the order: write the test first, run it, then apply the fix.
- **Decision**: PENDING

### F3 — updateCard / deleteCard cross-user silent success not in coverage matrix

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Coverage matrix
- **Detail**: `updateCard` (cards.ts:93) and `deleteCard` (cards.ts:104) use `.update()`/`.delete()` without a trailing `.single()`. Unlike `renameDeck`/`deleteDeck`, a cross-user call returns `{ error: null }` with 0 rows affected — no throw. The plan's 6-scenario matrix excludes both. They are still protected by RLS and the `.eq("user_id", userId)` filter (no actual data leaks), but the application layer doesn't signal the zero-row outcome. Worth noting in the `describe.skip` placeholder as a known behavioral asymmetry for a future real-DB phase.
- **Fix**: Not a blocker. Optionally add an `it.todo` in the `describe.skip` block noting the silent-success asymmetry for `updateCard`/`deleteCard`.
- **Decision**: PENDING
