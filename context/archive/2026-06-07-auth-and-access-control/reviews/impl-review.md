<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth and Access Control

- **Plan**: context/changes/auth-and-access-control/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  4 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | FAIL |

## Findings

### F1 — Lint failures in access-control.test.ts (step 3.5 rubber-stamped)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria (root cause: Pattern Consistency)
- **Location**: src/test/access-control.test.ts (multiple lines)
- **Detail**: Plan step 3.5 is marked [x] "Lint passes: npm run lint" but `npm run lint` produces 9 errors exclusively in the newly-created file: (1) line 9: USER_A_ID assigned but never used; (2) line 13: prettier formatting — CARDS array must be single-line; (3) lines 29,61,91,120,163,169,210: no-unsafe-return from untyped vi.fn() terminals (each stub wires `vi.fn().mockImplementation(() => terminalFn())` where terminalFn is untyped, returning `any` — diverges from sr.test.ts which uses typed generic vi.fn()); (4) line 162: unused eslint-disable directive.
- **Fix A ⭐ Recommended**: Fix all 9 errors in access-control.test.ts — (1) Remove or prefix USER_A_ID with _; (2) Collapse CARDS to one line; (3) Cast each terminal return: `vi.fn().mockImplementation(() => terminalFn() as ReturnType<typeof terminalFn>)`; (4) Remove unused disable comment at line 162.
  - Strength: Restores clean lint baseline; unblocks ESLint hook.
  - Tradeoff: ~10-line change, entirely in the test file.
  - Confidence: HIGH — each error has a mechanical fix; no logic changes needed.
  - Blind spot: sr.test.ts and useReviewSession.test.ts have pre-existing lint errors (no-empty-function) not introduced by this change — those are out of scope here but add noise to the baseline.
- **Fix B**: Suppress with eslint-disable-next-line per site — add targeted disable comments for no-unsafe-return at each of the 7 affected lines; remove unused var USER_A_ID; fix prettier.
  - Strength: Minimal change, consistent with the workaround pattern already used at line 158-163 in the file.
  - Tradeoff: Adds 7 disable comments instead of typing the stubs properly; leaves the underlying type weakness in place.
  - Confidence: MEDIUM — works but the preferred path per sr.test.ts is typed generics.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

### F2 — Migration CREATE POLICY lacks IF NOT EXISTS

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260607000001_review_logs_deny_update_delete.sql:1-2
- **Detail**: Both CREATE POLICY statements lack IF NOT EXISTS. If the migration is ever re-applied (local dev npx supabase db reset applied twice, or partial run followed by retry), Postgres will error with "policy already exists". Consistent with existing repo migrations but worth flagging since Supabase CLI's local dev loop makes re-application common.
- **Fix**: Prefix each statement with `CREATE POLICY IF NOT EXISTS`.
- **Decision**: FIXED

### F3 — supabase null branch in middleware.ts not exercised by any test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:24 / src/test/middleware.test.ts
- **Detail**: middleware.ts lines 18-25 have an explicit null-guard: if createClient returns null/undefined, the else branch sets context.locals.user = null and the auth gate still fires (returning 401 for protected routes). The mock always returns a non-null client, so the else branch is never exercised. If createClient returns null due to missing env vars, the safe-fail path is unverified.
- **Fix**: Add one test where createClient mock returns null and verify a protected route still produces 401.
- **Decision**: FIXED

### F4 — next mock fragility in middleware.test.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/test/middleware.test.ts:32-37
- **Detail**: `next` is declared module-level as vi.fn(). beforeEach calls vi.clearAllMocks() then re-assigns next.mockResolvedValue(). vi.clearAllMocks() only clears call history — it does NOT reset mock implementations. If any test calls next.mockRejectedValueOnce(), clearAllMocks() will not remove that one-time implementation, potentially leaking into the next test.
- **Fix**: Replace vi.clearAllMocks() with vi.resetAllMocks() in this file's beforeEach, or re-create `next` as a fresh vi.fn() inside beforeEach instead of patching the module-level declaration.
- **Decision**: FIXED

### F5 — "owner" label semantically misleading in denial policies

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260607000001_review_logs_deny_update_delete.sql:1-2
- **Detail**: Existing review_logs policies are named "review_logs: owner select" and "review_logs: owner insert" — "owner" signals the owner can perform that operation. The new denial policies are named "review_logs: owner update" / "review_logs: owner delete", which reads as if the owner can update/delete. They actually deny everyone. Names like "review_logs: deny update" / "review_logs: deny delete" would be self-documenting.
- **Fix**: Rename via a subsequent migration (DROP POLICY + CREATE POLICY) or note as labelling debt.
- **Decision**: FIXED (updated names in original migration in-place — pre-production)

### F6 — chain.lte dead code in applyRating describe block

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/test/access-control.test.ts:167
- **Detail**: makeSrCardStateChain() wires `chain.lte = vi.fn().mockReturnValue(chain)` but the single test in the applyRating describe only exercises the srLoadSingleFn failure path — lte is never called. Copied from sr.test.ts where lte is exercised, but it's noise here.
- **Fix**: Remove line 167 (chain.lte = ...) to reduce stub surface.
- **Decision**: FIXED
