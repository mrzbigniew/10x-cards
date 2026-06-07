<!-- PLAN-REVIEW-REPORT -->
# Plan Review: SR Integration Correctness — Unit Tests

- **Plan**: context/changes/testing-sr-integration-correctness/plan.md
- **Mode**: Deep
- **Date**: 2026-06-07
- **Verdict**: REVISE → SOUND (after triage)
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

5/5 paths ✓ (sr.ts, useReviewSession.ts, decks.test.ts, useGeneration.test.ts, generation.test.ts), 5/5 symbols ✓ (scheduler L8, applyRating L94, review_logs non-fatal L126-129, fsrsCardToDbUpdate exported L25, rowToFsrsCard not exported), brief↔plan ⚠️ (stub routing approach — F3)

## Findings

### F1 — Contradictory update chain terminal instructions

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details — "Update chain terminates without .single()"
- **Detail**: Two sentences in the same paragraph gave contradictory ways to connect srUpdateFn to the second .eq() call. One hardcoded a happy-path Promise (making the update-error test unconfigurable); the other said "return srUpdateFn()" which, if called eagerly at chain-build time, resolves before the test's mockResolvedValueOnce is applied — producing the vacuous-success bug the brief's Open Risks section explicitly warns about.
- **Fix**: Replaced contradictory text with the exact mock setup using `.mockImplementation(() => srUpdateFn())` (lazy routing, matching makeDecksChain() pattern), plus an explicit warning against the eager anti-pattern.
- **Decision**: FIXED

### F2 — Fixture naming mismatch: UPDATED_SR vs UPDATED_SR_A / UPDATED_SR_B

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — fixtures block
- **Detail**: Fixtures block defined UPDATED_SR (singular) but the Again test used UPDATED_SR_A and UPDATED_SR_B, and the Good-rating test also used UPDATED_SR_A.
- **Fix**: Updated fixtures block to list UPDATED_SR_A and UPDATED_SR_B with usage description.
- **Decision**: FIXED

### F3 — Brief↔plan stub routing approach inconsistency

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: plan-brief.md Architecture section
- **Detail**: Brief said "mockImplementationOnce to return different chain shapes per call" (call-order-based). Plan said "operation-type-aware, not call-order-dependent." Plan is authoritative; brief was stale.
- **Fix**: Updated plan-brief.md Architecture section to describe the operation-type-aware approach.
- **Decision**: FIXED
