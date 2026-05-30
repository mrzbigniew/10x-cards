<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Database Schema + RLS

- **Plan**: context/changes/db-schema-rls/plan.md
- **Scope**: Full Plan (Phases 1–2 of 2)
- **Date**: 2026-05-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Automated criteria (re-verified at review time)

| Check | Result |
|-------|--------|
| `npx supabase db reset` | PASS — "Finished supabase db reset on branch main" |
| `npx tsc --noEmit` | PASS — exit 0 |
| `npm run lint` | 1000 pre-existing CRLF errors; 0 new errors introduced by this change |

All 7 manual checkboxes confirmed [x] by user during implementation.

## Findings

### F1 — UPDATE policies missing WITH CHECK

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260526220447_initial_schema.sql:24, :49, :82
- **Detail**: All three UPDATE policies use only `USING (auth.uid() = user_id)` with no `WITH CHECK` clause. Without it, an authenticated user can issue `UPDATE decks SET user_id = '<victim-uuid>'` — the USING check passes (they own the row currently), silently transferring ownership. The plan itself specified this pattern, so this is a plan-level omission the implementation faithfully reproduced.
- **Fix A ⭐ Recommended**: Edit the migration to add `WITH CHECK (auth.uid() = user_id)` on the UPDATE policies for `decks`, `cards`, and `card_sr_state`, then run `supabase db reset` + `npm run gen-types`.
  - Strength: Closes the ownership-transfer bypass in 3 lines; local DB resets freely, gen-types is a one-command refresh.
  - Tradeoff: Minor — db reset wipes any local test data.
  - Confidence: HIGH — standard Supabase RLS hardening.
  - Blind spot: None significant.
- **Fix B**: Accept and document as known gap — address before first production deployment when service-layer discipline can be verified.
  - Strength: No schema change now.
  - Tradeoff: Leaves a non-obvious RLS hole for future developers.
  - Confidence: MED — relies entirely on application-layer discipline.
  - Blind spot: S-01..S-05 service code not yet implemented.
- **Decision**: PENDING

### F2 — Lint criteria (1.3 and 2.2) overstate what was verified

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/db-schema-rls/plan.md (Progress 1.3, 2.2)
- **Detail**: Both criteria are worded "lint passes" but lint exits with 1000 errors (pre-existing CRLF issues across the repo, confirmed by stash test — zero new errors introduced). The intent was met; the wording is misleading.
- **Fix**: Rename both criterion titles to "npm run lint: no new errors introduced" in the plan's Phase blocks.
- **Decision**: PENDING

### F3 — supabase.ts returns null on missing env vars

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase.ts (pre-existing, not introduced by Phase 2)
- **Detail**: `createServerClient` returns null when env vars are absent. Every downstream slice (S-01..S-05) will need a null-guard before calling `.from()`. TypeScript will enforce it, but it creates recurring boilerplate. A throw-on-missing-config approach is safer for server routes where missing env vars are always a deployment error.
- **Fix**: Out of scope for this change — flag for S-01 to decide whether to convert to throw-on-missing or add a typed assertion helper.
- **Decision**: PENDING

### F4 — ts-fsrs pinned with caret range

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: package.json (ts-fsrs: "^5.4.1")
- **Detail**: Caret range allows silent resolution to 5.x+. The schema's `CHECK (state IN (0, 1, 2, 3))` is tied to ts-fsrs State enum integers. Low probability, but the constraint is immutable while the range is living.
- **Fix**: Pin to `"5.4.1"` (exact) after S-01 integration is verified end-to-end.
- **Decision**: PENDING
