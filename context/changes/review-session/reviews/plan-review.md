<!-- PLAN-REVIEW-REPORT -->
# Plan Review: S-03 Review Session Implementation Plan

- **Plan**: context/changes/review-session/plan.md
- **Mode**: Deep
- **Date**: 2026-06-02
- **Verdict**: REVISE → SOUND (after fixes)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | WARNING |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

9/9 paths ✓, schema/types ✓, ts-fsrs Card+ReviewLog ✓, API/hook patterns ✓, Progress↔Phase contract ✓, brief↔plan ✓

## Findings

### F1 — "Carry updated SR fields" rationale doesn't hold; server reloads from DB

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (Again re-queue) + Phase 2 applyRating + Phase 4 hook
- **Detail**: applyRating loads card_sr_state fresh from DB each call, so the second next() already uses post-Again state. The client-carried SR fields are display-only, not scheduling-critical — the brief's phase-4 "key risk" is a non-issue given this design.
- **Fix**: Correct the rationale — server reload is the single source of truth; POST response SR fields are for UI display only.
- **Decision**: FIXED — corrected rationale in Critical Implementation Details and Phase 4 hook contract.

### F2 — Due-cards query under-specified: embedded filter/order needs !inner

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — loadDueCards
- **Detail**: Supabase embeds are LEFT joins by default. Filtering/ordering on embedded card_sr_state.due without !inner returns not-due cards and unordered results — silently breaking the "only due cards" guarantee.
- **Fix A ⭐ Recommended**: Query FROM card_sr_state (has user_id + indexed due), embed cards!inner filtered by deck_id.
  - Strength: Filter+order live on the base table (index-friendly, no embedded-order quirk).
  - Tradeoff: Response shape is sr-row-first; UI mapping inverts.
  - Confidence: HIGH — card_sr_state has user_id, due, and the due idx.
  - Blind spot: cards!inner deck_id filter syntax to confirm at impl.
- **Fix B**: Keep FROM cards but spell out card_sr_state!inner(*) + embedded order option.
  - Strength: Card-first shape the UI consumes directly.
  - Tradeoff: Embedded order/filter is the error-prone path this finding is about.
  - Confidence: MED — works but relies on embedded-order option.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — loadDueCards rewritten to query from card_sr_state with cards!inner embed.

### F3 — review_logs added against research's MVP-defer; no S-03 consumer

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Lean Execution
- **Location**: Phase 1 (review_logs table) + Phase 2 (reviewLogToDbInsert)
- **Detail**: review_logs is explicitly deferred by research as "what not to use in MVP." Nothing in S-03 reads it — it serves future analytics/optimizer (both out of scope). It costs a table + RLS + mapper and widens the ts-fsrs 6.0.0 breaking surface.
- **Fix**: Confirm as conscious forward-investment or drop from S-03.
- **Decision**: ACCEPTED — kept as conscious forward-investment; losing historical review data between now and optimizer slice is unrecoverable.

### F4 — reviewedCount semantics under Again re-queue are ambiguous

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 hook + summary
- **Detail**: With Again re-queue a card is rated multiple times. "reviewedCount" is ambiguous: distinct cards passed vs. total ratings. Implementer must also distinguish initial-empty ("0 due") from completed (summary).
- **Fix**: Define reviewedCount = distinct cards that left the queue; againCount = total Again ratings; totalInitial for state disambiguation.
- **Decision**: FIXED — hook contract updated with explicit counter definitions and state disambiguation.

### F5 — Rating route's deckId param doesn't validate card membership

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 POST route + Phase 2 applyRating
- **Detail**: applyRating scopes only by user_id + card_id — deckId is unused. A card from another of the user's own decks could be rated via any deck's URL. Not a security hole (RLS), but inconsistent.
- **Fix**: Pass deckId into applyRating and validate card belongs to the requested deck (defense-in-depth).
- **Decision**: FIXED — applyRating signature updated to include deckId with join-based membership check; route contract updated to pass deck id through.
