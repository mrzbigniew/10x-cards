# Review Session Modal — Plan Brief

> Full plan: `context/changes/modal-review-session/plan.md`

## What & Why

Move the review session from a standalone page (`/deck/[id]/review`) into a modal dialog so users can complete a full review loop without navigating away from the deck list. This is S-08 on the roadmap, a UX refinement that mirrors what S-07 did for the generation flow.

## Starting Point

`ReviewSession.tsx` is a self-contained page component that calls `useReviewSession` internally and renders inside `/deck/[id]/review.astro`. The only entry point is a `<a href>` Play button on each `DeckCard` in `DeckList`. The modal pattern is already proven by `GenerationModal.tsx` (S-07).

## Desired End State

From the deck list, clicking Play on a deck opens a modal with the full review loop (flip → rate → again-requeue → summary). Closing mid-session shows a confirmation guard. After the session completes the summary stays until the user dismisses it, and the deck list refreshes in place. Clicking Play on a deck with no due cards shows a toast instead of opening the modal. The standalone `/deck/[id]/review` route is deleted.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Entry point | Deck list only (Play button on DeckCard) | Matches S-08 roadmap scope ("without leaving the deck list page") | Plan |
| Standalone page | Retire (delete) | Mirrors S-07 which retired `/generate.astro` when the modal shipped | Plan |
| Close guard trigger | Only after first card rated (`reviewedCount > 0 && !finished`) | Guards only when there's meaningful progress to lose, matching S-07's pattern | Plan |
| Post-session UX | Summary stays; user closes manually ("Zamknij" / Escape) | User reads stats at own pace; no surprise disappearance | Plan |
| Zero-due UX | Pre-check on Play click → toast if 0 due; modal never opens | User explicitly preferred toast-only, not opening an empty modal | Plan |
| Deck list refresh | `session-completed` CustomEvent → `refresh()` | Same pattern as S-07's `deck-saved` event; zero new concepts | Plan |
| Hook lifecycle | `ReviewModal` conditionally mounted (not always-mounted with `isOpen`) | `useReviewSession` fetches on mount; always-mounting would waste a fetch before a deck is selected | Plan |
| Keyboard | Focus-trap + Escape; no number-key shortcuts | Covers roadmap risk with minimal code; shortcuts are nice-to-have | Plan |

## Scope

**In scope:**
- `ReviewSession.tsx` refactored to a presenter (props-driven, no internal hook call)
- New `ReviewModal.tsx` owning the hook + modal lifecycle
- `DeckCard` Play button converted to callback trigger
- `DeckList` zero-due pre-check, toast, modal mount, refresh listener
- Deletion of `src/pages/deck/[id]/review.astro`

**Out of scope:**
- Review entry point on Deck Detail page
- Number-key shortcuts (1–4) for ratings
- Keeping the standalone review page as a parallel path

## Architecture / Approach

`ReviewSession.tsx` becomes a pure presenter (like `GenerationFlow.tsx`). `ReviewModal.tsx` owns `useReviewSession`, renders the presenter inside a `createPortal` overlay, and manages close guard, Escape, and `session-completed` event dispatch. `DeckList` handles the pre-check and conditionally mounts `ReviewModal` — the hook is always fresh because the component only mounts when a deck is selected.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. ReviewSession Presenter + ReviewModal | Decoupled presenter + working modal component (no entry point yet) | Presenter refactor must keep all rendering branches intact |
| 2. DeckList Entry Point + Toast | Play button wired; zero-due toast; refresh listener | Double-fetch on open is acceptable but must not cause visible flicker |
| 3. Route Retirement | `/deck/[id]/review` deleted; `DeckCard` `<a href>` fallback removed | Must verify no dangling references before deletion |

**Prerequisites:** S-07 (modal-generate-flashcards) done — confirmed ✓  
**Estimated effort:** ~1-2 sessions across 3 phases

## Open Risks & Assumptions

- The flip animation (`[perspective:1200px]` + CSS `flip-card-inner`) must work inside a `max-w-2xl` / `90vh` modal container. If the card feels cramped, the plan allows increasing the modal width.
- Zero-due pre-check adds a lightweight double-fetch (pre-check + hook on mount). Acceptable for simplicity; could be optimized later by passing `initialCards` to the hook.

## Success Criteria (Summary)

- User can complete a full review session from the deck list without navigating to a new page.
- Closing mid-session shows a guard dialog; completing a session shows a summary the user dismisses manually.
- Direct navigation to `/deck/{id}/review` returns 404 after Phase 3.
