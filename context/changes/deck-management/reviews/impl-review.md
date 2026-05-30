<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Deck Management Implementation Plan

- **Plan**: context/changes/deck-management/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-05-30
- **Verdict**: APPROVED (all findings fixed during triage)
- **Findings**: 0 critical  4 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING → FIXED |
| Scope Discipline | PASS |
| Safety & Quality | WARNING → FIXED |
| Architecture | PASS |
| Pattern Consistency | WARNING → FIXED |
| Success Criteria | PASS |

## Findings

### F1 — appendCardsToDeck has no deck-ownership check

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/decks.ts:103 / src/pages/api/decks.ts:51
- **Detail**: appendCardsToDeck inserted cards into whatever deckId was supplied without verifying userId owns the deck. An authenticated user who knows another user's deck UUID could inject cards into it.
- **Fix Applied**: Fix A — added deck ownership pre-check (`.eq("user_id", userId).single()`) at the top of `appendCardsToDeck` in the service layer. Throws "Deck not found or access denied" if the deck doesn't belong to the caller.
- **Decision**: FIXED via Fix A

### F2 — renameDeck / deleteDeck: silent 200 on non-existent rows

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/decks.ts:82 (renameDeck), :95 (deleteDeck)
- **Detail**: Supabase returns no error for a no-op UPDATE/DELETE. Both functions returned void successfully even when deckId didn't exist, giving the client a false 200 confirmation.
- **Fix Applied**: Chained `.select("id").single()` onto both mutations. PostgREST surfaces a PGRST116 error when zero rows match, which the existing `if (error)` guard now catches and rethrows.
- **Decision**: FIXED

### F3 — CreateEmptyDeckSchema defined but never used server-side

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/schemas/decks.ts:4
- **Detail**: CreateEmptyDeckSchema was exported but imported nowhere. The POST handler validated via SaveDeckRequestSchema (NewDeckSaveSchema union), not CreateEmptyDeckSchema, creating a divergence risk.
- **Fix Applied**: Deleted CreateEmptyDeckSchema from decks.ts. The SaveDeckRequestSchema union is the single enforced path.
- **Decision**: FIXED

### F4 — useDeckList: optimistic rollback via re-fetch, not in-memory snapshot

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/hooks/useDeckList.ts:58-68
- **Detail**: Plan specified instant in-memory rollback on rename failure. Implementation called refresh() (a new GET round-trip) instead, leaving a brief window where the optimistically-wrong name was visible.
- **Fix Applied**: Captured `prevName` before the optimistic update. On failure, `setDecks` restores the previous name directly without a round-trip. Removed the `refresh` dependency in favour of `decks`.
- **Decision**: FIXED

### F5 — SaveDeckForm useEffect: missing cancellation pattern

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/generation/SaveDeckForm.tsx:19-26
- **Detail**: The deck-list fetch in SaveDeckForm had no mounted/cancelled guard. useDeckList.ts in the same change used a cancelled flag correctly — inconsistent.
- **Fix Applied**: Added `let cancelled = false` guard and cleanup return `() => { cancelled = true; }`, matching the useDeckList pattern.
- **Decision**: FIXED

### F6 — Delete failure in DeckList: no error shown to user

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/decks/DeckList.tsx:35-46
- **Detail**: The catch block in handleDelete was empty. The modal stayed open with zero feedback about why the delete failed.
- **Fix Applied**: Added `deleteError` state to DeckList, populated it in the catch block, passed it as `error` prop to DeleteDeckModal. DeleteDeckModal renders the error in red text above the action buttons when non-null. Error is cleared on cancel.
- **Decision**: FIXED
