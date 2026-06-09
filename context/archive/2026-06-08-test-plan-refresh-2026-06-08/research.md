---
date: 2026-06-08T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: f292691be5ff3cbd09f86a46a508915111aa9d4f
branch: main
repository: 10xDEVv3
topic: "Test plan refresh 2026-06-08: modal lifecycle, useDeckList mutations, useReviewSession requeue"
tags: [research, testing, modal-generation, useDeckList, useReviewSession, again-requeue]
status: complete
last_updated: 2026-06-08
last_updated_by: Claude Sonnet 4.6
---

# Research: Test Plan Refresh 2026-06-08

**Date**: 2026-06-08
**Researcher**: Claude Sonnet 4.6
**Git Commit**: f292691be5ff3cbd09f86a46a508915111aa9d4f
**Branch**: main
**Repository**: 10xDEVv3

## Research Question

Ground the three risks from the test-plan-refresh-2026-06-08 change brief:

- **R-A**: Modal generation lifecycle — does the modal unmount on close? Where is text state? Is there a dismiss guard?
- **R-B**: `useDeckList` optimistic-update rollback — does it exist? What triggers it?
- **R-C**: `useReviewSession` Again-requeue depth — what does the existing test cover?

## Summary

All three risks are confirmed as real, but two require reframing from the original brief:

- **R-A**: The risk is real but the guard partially exists. A dismiss guard protects the _reviewing_ phase (proposals visible), but **nothing protects the _generating_ phase** (AI call in flight). Dismissing during generation unmounts the hook and silently discards pasted text. This is a **feature gap + missing test**.
- **R-B**: The original fear ("optimistic rollback missing") was a misconception — **no optimistic updates exist**. The pessimistic pattern (wait for server → refetch) is correct for `createDeck` and `deleteDeck`. However, `resetDeckProgress` has a **real bug**: it never calls `refresh()` on success, so the deck list silently goes stale after a successful progress reset.
- **R-C**: The again-requeue implementation is correct. Test coverage **partially exists** for the single-step case but **entirely missing** for the Again→Again chain and the `finished === true` session-end condition.

**Additional finding**: `context/foundation/lessons.md` has a stale/wrong entry. The actual portal library is `react-dom`'s `createPortal`, not `react-doom`. The lesson must be corrected.

---

## Detailed Findings

### R-A: Modal generation lifecycle

#### Modal component and portal

`GenerationModal.tsx` was added in slice `2026-06-03-modal-generate-flashcards` (S-07 equivalent). It wraps the full generation flow.

- **Portal library**: `react-dom` `createPortal` (`src/components/generation/GenerationModal.tsx:2`), rendering to `document.body`. There is no `react-doom` package installed (`package.json` lists only `react-dom@^19.2.6`). The lesson in `context/foundation/lessons.md:12-17` ("All modals must use a react-doom portal") is **incorrect and must be updated**.
- **Unmount behavior**: the component returns `null` when `!isOpen` (`GenerationModal.tsx:73`). React unmounts the portal and all children; the `useGeneration` hook is destroyed. This is a **full unmount**, not CSS hiding.

#### `useGeneration` location and text state

- Hook is instantiated **inside** `GenerationModal` (`GenerationModal.tsx:13`):
  ```ts
  const generation = useGeneration();
  ```
- Text state lives in `useGeneration.ts:20`: `const [text, setTextRaw] = useState("")`.
- Text state is **not lifted above the modal boundary**. When the modal unmounts, text is destroyed.
- On intentional close, `reset()` is called first (`GenerationModal.tsx:32, 49`), which sets `text` to `""` (`useGeneration.ts:110`) before unmount.

#### Dismiss guard: what it covers and what it doesn't

The guard lives in `handleCloseRequest` (`GenerationModal.tsx:28-46`):

```ts
function handleCloseRequest() {
  if (phase === "reviewing") {
    setShowCloseGuard(true); // shows confirmation dialog
  } else {
    reset();
    onClose(); // immediate close — no confirmation
  }
}
```

**Guard is active** only when `phase === "reviewing"` (proposals are on screen, user hasn't saved yet). Shows the Polish confirmation: "Zamknąć? Niezapisane zmiany zostaną utracone."

**Guard is NOT active** when:

- `phase === "generating"` — AI call in flight, pasted text present
- `phase === "input"` — user is still typing
- `phase === "saving"` — save in progress

**Consequence**: if the user dismisses (× button at `GenerationModal.tsx:85-91`, or Escape key at `GenerationModal.tsx:37-46`) while generation is in flight, the modal closes immediately, `reset()` clears the text, the portal unmounts, and the pasted text is gone. **This is the exact risk scenario from R-A, and it is unguarded.**

#### Risk R-A verdict: **Feature gap + missing test**

The guard needs to be extended to cover `phase === "generating"`. The plan must:

1. Add `"generating"` to the guarded phases in `handleCloseRequest`.
2. Add a unit test asserting that dismissal during generation is blocked (or shows a confirmation).

The current behavior (silent text loss on generating-phase dismiss) should NOT be formalized as acceptable — the review-phase guard shows the team's intent to guard against data loss.

---

### R-B: `useDeckList` — optimistic-update rollback

#### No optimistic updates exist

`src/components/hooks/useDeckList.ts` exposes three mutation functions:

| Mutation                          | Optimistic update | Post-success refresh         | Post-failure behavior   |
| --------------------------------- | ----------------- | ---------------------------- | ----------------------- |
| `createDeck` (lines 43–57)        | None              | `refresh()` called (line 54) | Throws; state unchanged |
| `deleteDeck` (lines 59–69)        | None              | `refresh()` called (line 67) | Throws; state unchanged |
| `resetDeckProgress` (lines 71–77) | None              | **Missing**                  | Throws; state unchanged |

All three use a **pessimistic pattern**: await the server call, then refetch. No local state is ever written before the server responds, so there is nothing to roll back. The original brief concern ("optimistic rollback missing") was a misconception.

On failure, all three throw an error. The caller (`DeckList.tsx`) catches it and stores it in component state (`createError`, `deleteError`, `resetError`) for display. No refetch is triggered on failure — but since nothing was written locally, the displayed state is still correct (it reflects the last server-confirmed state).

#### The real bug: `resetDeckProgress` missing post-success refresh

`resetDeckProgress` (`useDeckList.ts:71-77`) never calls `refresh()` on success. The consuming handler `DeckList.tsx:handleReset` (lines 89–101) also does not call `refresh()`. After a successful progress reset:

- The server has reset all card SR states for the deck.
- The hook's `decks` array still shows the stale `card_count` / SR data.
- The user sees no change in the UI until they navigate away or trigger another refresh.

This is a real correctness bug independent of the test coverage question.

#### Test coverage: zero

No test file references `useDeckList`, `DeckList`, or `DeckRow`. `src/test/decks.test.ts` covers the service-layer (`createDeckWithCards`, `appendCardsToDeck`) but not the hook.

#### Risk R-B verdict: **Reframed** — real bug in `resetDeckProgress`, not rollback

The plan must:

1. Fix `resetDeckProgress` to call `refresh()` on success (1–2 line fix in the hook).
2. Add unit tests for all three mutations covering: error path (state unchanged, error thrown), and post-success state (for `createDeck`/`deleteDeck`: list reflects new state; for `resetDeckProgress`: list is refreshed).

The test oracle for these tests comes from the documented pessimistic contract, not from the implementation.

---

### R-C: `useReviewSession` Again-requeue depth

#### Hook implementation

Requeue logic (`src/components/hooks/useReviewSession.ts:71-76`):

```ts
if (rating === 1) {
  setQueue((q) => {
    const [head, ...rest] = q;
    return [...rest, { ...head, sr: { ...head.sr, ...data.sr } }];
  });
  setAgainCount((n) => n + 1);
}
```

The card is removed from the head and pushed to the tail with updated SR state. This is purely client-side state management; the API call is always made regardless of rating. The session-end condition is:

```ts
const finished = !loading && queue.length === 0; // line 96
```

Session ends only when the queue drains to zero. Again cards keep the queue non-zero until they are rated non-Again. The mechanism is correct.

#### What the existing tests cover

`src/test/useReviewSession.test.ts` — four test cases:

1. `ocena 'Raz jeszcze' (1) przesuwa kartę na koniec kolejki` (line 86): rates CARD_A with `1`, verifies card moves to tail with updated sr and `againCount` increments. Then rates CARD_B with `1`, verifies CARD_A is back as current. **Partial — asserts mid-sequence state, never checks `finished`.**
2. `ocena niezerowa (3) usuwa kartę z kolejki` (line 122): non-Again rating removes card. Asserts `finished === false` with 1 remaining. **Never reaches `finished === true`.**
3. `reviewedCount nie zwiększa się, gdy ta sama karta pojawia się dwukrotnie` (line 148): deduplication.
4. `błąd fetch przy rate()` (line 179): error path.

Coverage verdict:

| Behavior                                           | Status                                        |
| -------------------------------------------------- | --------------------------------------------- |
| Again moves card to tail with updated sr           | COVERED (`useReviewSession.test.ts:110-119`)  |
| `againCount` increments                            | COVERED (`useReviewSession.test.ts:112`)      |
| Same card rated Again twice (Again→Again chain)    | NOT COVERED                                   |
| `finished === true` after all cards graduate       | NOT COVERED                                   |
| `remaining` non-zero while Again cards persist     | NOT COVERED                                   |
| `applyRating` called with rating=1 in `sr.test.ts` | NOT COVERED (`sr.test.ts` uses rating=3 only) |

#### Risk R-C verdict: **Test gap confirmed**

The plan must extend `useReviewSession.test.ts` with a scenario table covering:

- Single-card session: Again → Again → non-Again → `finished === true`
- Multi-card mixed: all Again first, then all non-Again → session ends only at the end
- `remaining` stays non-zero while Again-requeued cards are still in queue

Anti-pattern to avoid (confirmed by seeing the existing test): test only asserts intermediate state transitions, never the terminal condition. Every new scenario must assert `finished === true` at the end.

---

## Code References

- `src/components/generation/GenerationModal.tsx:13` — `useGeneration` instantiated inside modal
- `src/components/generation/GenerationModal.tsx:28-35` — `handleCloseRequest`, guard only for `"reviewing"`
- `src/components/generation/GenerationModal.tsx:73` — `if (!isOpen) return null` → full unmount
- `src/components/hooks/useGeneration.ts:20` — `const [text, setTextRaw] = useState("")`
- `src/components/hooks/useGeneration.ts:110` — `reset()` clears text
- `src/components/hooks/useDeckList.ts:43-57` — `createDeck` (pessimistic, has refresh)
- `src/components/hooks/useDeckList.ts:59-69` — `deleteDeck` (pessimistic, has refresh)
- `src/components/hooks/useDeckList.ts:71-77` — `resetDeckProgress` (pessimistic, **missing refresh**)
- `src/components/decks/DeckList.tsx:89-101` — `handleReset` consumer (also missing refresh)
- `src/components/hooks/useReviewSession.ts:71-76` — Again requeue logic (correct)
- `src/components/hooks/useReviewSession.ts:96` — `finished = !loading && queue.length === 0`
- `src/test/useReviewSession.test.ts:86` — Test 1: partial Again coverage
- `src/test/useReviewSession.test.ts:122` — Test 2: non-Again, never reaches `finished === true`

## Architecture Insights

1. **Pessimistic mutation pattern in hooks**: `useDeckList` follows a consistent pattern — await server, refetch on success, throw on failure. This is correct but under-tested. The pattern should be documented in `§6` of the test plan as the expected hook contract.

2. **Modal unmount is the right threat model**: `GenerationModal` correctly uses `createPortal` (not CSS visibility). Tests for modal lifecycle must model actual React unmount, not just prop changes.

3. **Guard phase coverage gap**: The reviewing-phase guard was added intentionally (evidence: guard logic, Polish confirmation text, plan doc). The generating-phase is unguarded — this looks like an oversight rather than a conscious decision, because the user's primary concern is exactly this scenario (pasted text loss mid-generation).

## Historical Context

- `context/archive/2026-06-03-modal-generate-flashcards/plan.md` — S-07 implementation spec; confirms `GenerationModal` owns the hook and the reviewing-phase guard was planned.
- `context/archive/2026-06-06-testing-critical-path-coverage/` — Phase 1 rollout that bootstrapped Vitest and added `useGeneration.test.ts`, which covers error recovery for the page-based flow but not modal lifecycle.
- `context/foundation/lessons.md:12-17` — **Stale/wrong entry**: says "react-doom" but implementation uses `react-dom`. Must be corrected in R-2 guide update.

## Open Questions

1. **R-A dismiss guard intent**: Should the plan ADD a guard for `phase === "generating"` (1-2 line change), or accept that closing during generation is intentional (no text has been committed to proposals yet)? The review-phase guard suggests the former — text in the input form is already "the user's work" worth protecting.

2. **R-B `resetDeckProgress` fix scope**: Is the missing `refresh()` call a test-plan change or a separate bug fix? Given it's a 2-line fix, it fits cleanly inside the R-1 plan's implementation sub-phases.
