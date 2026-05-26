<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Database Schema + RLS

- **Plan**: context/changes/db-schema-rls/plan.md
- **Scope**: Phase 1 of 2
- **Date**: 2026-05-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — UPDATE policies missing WITH CHECK

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260526220447_initial_schema.sql:24, :49, :82
- **Detail**: The UPDATE policy on each of the three tables uses only `USING (auth.uid() = user_id)` with no `WITH CHECK` clause. PostgreSQL UPDATE policies: USING controls which rows can be targeted; WITH CHECK controls what the row looks like after. Without WITH CHECK, an authenticated user can issue `UPDATE decks SET user_id = '<victim-uuid>'` — the USING check passes (they own the row currently), and the row is silently transferred to the victim. The plan itself specified this pattern, so this is a plan-level omission that the implementation faithfully reproduced.
- **Fix A ⭐ Recommended**: Add `WITH CHECK (auth.uid() = user_id)` to all three UPDATE policies in the migration, then run `supabase db reset`.
  - Strength: Closes the ownership-transfer bypass entirely; 3-line change, local DB can be reset freely.
  - Tradeoff: Minor — requires re-running db reset locally.
  - Confidence: HIGH — standard Supabase RLS hardening pattern.
  - Blind spot: None significant.
- **Fix B**: Accept and document as known gap — relies on application-layer discipline preventing arbitrary user_id in UPDATE payloads.
  - Strength: No migration change now; can be addressed before first production deployment.
  - Tradeoff: Leaves a non-obvious RLS hole for future developers.
  - Confidence: MED — relies entirely on service-layer correctness.
  - Blind spot: Downstream S-01..S-05 service code not yet reviewed.
- **Decision**: PENDING

### F2 — Lint criterion 1.3 marked done but lint still fails

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/db-schema-rls/plan.md (Progress 1.3)
- **Detail**: Progress row 1.3 is marked [x] "npm run lint passes", but lint currently exits with 999 errors (was 1028 before this change — net reduction of 29 via lint-staged auto-fixing markdown/json during commit hook). All failures are pre-existing CRLF issues across the codebase, verified by stash test. No new errors were introduced. The intent was met; the criterion wording is misleading.
- **Fix**: Rename criterion 1.3 to "npm run lint: no new errors introduced" to accurately reflect what was verified.
- **Decision**: PENDING

### F3 — ts-fsrs pinned with caret range, allows silent minor upgrades

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: package.json (ts-fsrs: "^5.4.1")
- **Detail**: The schema's `CHECK (state IN (0, 1, 2, 3))` and all downstream code (S-01..S-05) will be tied to ts-fsrs's State enum integer mapping. A caret range allows npm to silently resolve to 5.x+, risking a future mismatch if the library changes its enum values. Low probability for a stable library, but the schema constraint is immutable while npm ranges are living.
- **Fix**: Pin to `"5.4.1"` (exact) once the S-01 integration layer is implemented and the mapping is verified end-to-end.
- **Decision**: PENDING
