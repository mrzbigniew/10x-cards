<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Account Deletion (S-09) Implementation Plan

- **Plan**: `context/changes/account-deletion/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-12
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | PASS    |

## Grounding

8/8 paths ✓, 3/3 symbols ✓ (`envField` schema in `astro.config.mjs:25-31`, `PUBLIC_API_ROUTES` in `src/middleware.ts:13`, `@supabase/supabase-js` direct dep in `package.json:33`), brief↔plan ✓, Progress↔Phases ✓. "Wyloguj" blast radius is exactly `Topbar.astro` + `tests/login.setup.ts:18` — both covered by the plan.

Verified claims that held up: cascade-only deletion, `/api/account` middleware 401 guard, secrets pattern, the `login.setup.ts` breakage and its fix.

## Findings

### F1 — E2E flow skips the post-signup confirm-email detour

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4 — `e2e/account-deletion.spec.ts` contract
- **Detail**: `src/pages/api/auth/signup.ts:19` redirects to `/auth/confirm-email`, an auth page without the Topbar — so the spec's "sign up → open avatar menu" step is not executable as written. Existing infra signs in explicitly after signup (`tests/login.setup.ts`).
- **Fix**: Spec the flow as sign up → sign in via UI → `/dashboard` → avatar menu → delete.
  - Strength: Mirrors the proven setup→login chain; works regardless of whether `signUp` sets session cookies.
  - Tradeoff: A few extra lines per spec run.
  - Confidence: HIGH — `signup.ts:19` and `login.setup.ts` are explicit.
  - Blind spot: None significant.
- **Decision**: ACCEPTED — risk acknowledged; the explicit sign-in step will be handled during Phase 4 implementation.

### F2 — Disposable-email collision across 3 parallel browser projects

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — disposable-user strategy
- **Detail**: The spec runs in chromium, firefox, and webkit in parallel; `Date.now()` can produce identical timestamps in concurrent workers → identical plus-addressed email → "user already registered" signup failure.
- **Fix**: Include the project name in the address, e.g. `name+delete-${testInfo.project.name}-${Date.now()}@domain`.
- **Decision**: SKIPPED

### F3 — Unparseable JSON body falls into the 500 catch

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `src/pages/api/account.ts` contract
- **Detail**: `request.json()` throws on a missing/malformed body; the contract doesn't state that parse failure is a 400, so an implementer following the decks template might let it land in the catch-all 500.
- **Fix**: State in the contract that a JSON parse failure is also a 400 (Polish error), and add the case to the unit-test status matrix.
- **Decision**: SKIPPED

### F4 — Failed E2E run leaves disposable-user residue

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — Manual criterion 4.5
- **Detail**: Criterion 4.5 ("no disposable-user residue") only holds when the spec passes — the user is deleted by the flow under test. A failure before the confirm click strands the disposable user (cosmetic; RLS-isolated).
- **Fix**: Soften 4.5 to "no residue after a passing run"; stranded users from failed runs may be cleaned manually.
- **Decision**: SKIPPED
