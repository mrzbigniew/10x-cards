# Modal: Generate Flashcards (S-07) — Plan Brief

> Full plan: `context/changes/modal-generate-flashcards/plan.md`

## What & Why

Move the AI flashcard generation flow from a standalone full-page route (`/generate`) into a modal dialog. The page-navigation UX forces users away from their current context (deck list, deck detail); a modal lets them generate and save without losing their place. This is a pure UX refinement — no new AI capability, no new API.

## Starting Point

A self-contained `<GenerationFlow>` component drives the multi-step flow (text input → generate → review proposals → save to deck). It calls `useGeneration()` internally and has no props. One entry point exists: a `<a href="/generate">` CTA on the dashboard hero card.

## Desired End State

The user can open the generation modal from three places: the dashboard hero button, a Sparkles icon on each deck card, and a "Generuj z AI" button on the deck detail page. When opened from a deck context, that deck is pre-selected in the save form. After saving, a brief ✓ screen auto-dismisses after 1.5 s, the modal closes, and the deck list refreshes in place. The `/generate` route is removed (301 → `/dashboard`).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Hook ownership | `GenerationModal` owns `useGeneration` hook | Modal needs `phase` for close guard + `reset()` on close — only possible if modal holds the hook instance. | Plan |
| Entry points | Dashboard CTA + DeckCard Sparkles + DeckDetail button | All three high-value contexts where a user would want to generate; minimal new UI in each. | User |
| Full-page route fate | Remove — 301 redirect to `/dashboard` | Single implementation surface; no bookmark value for a generation flow. | User |
| Done state | ✓ screen for 1.5 s → auto-close | Gives confirmation without requiring an extra click; deck list already refreshes on close. | User |
| Scroll strategy | Fixed-height modal (`max-h-[90vh]`) + internal scroll | Consistent with existing modals; proposal list can be tall; page-behind stays fixed. | User |
| Pre-selected deck | Yes — pass `preselectedDeckId` to `SaveDeckForm` | User intent is already known when opening from a deck context; saves one interaction step. | User |
| Close guard | Confirm only during `reviewing` phase | Only phase where real reviewed work would be lost; input and generating close silently. | User |
| Deck list refresh | `deck-saved` CustomEvent + `DeckList` listener | Cross-island communication without a page reload; event bus pattern is trivial to add. | Plan |

## Scope

**In scope:**
- `GenerationModal` component with scrollable layout, close guard, and auto-dismiss
- Refactor `GenerationFlow` into a presenter (props instead of internal hook)
- `preselectedDeckId` support in `SaveDeckForm`
- `reset()` function + `deck-saved` event dispatch in `useGeneration`
- Three entry points: dashboard CTA, DeckCard action, DeckDetail button
- `useDeckList` exposes `refresh`; `DeckList` listens for `deck-saved`
- Redirect `/generate` → `/dashboard` (301)

**Out of scope:**
- shadcn Dialog/Sheet — hand-rolled pattern used throughout
- Topbar "Generuj fiszki" link (requires Topbar to become a React island)
- Draft persistence across modal open/close cycles
- Keyboard shortcut / floating action button entry point
- Any changes to the generation API or AI prompt

## Architecture / Approach

`GenerationModal` calls `useGeneration()` and spreads all values as props into `GenerationFlow` (now a presenter). The modal manages the overlay, sticky header, scrollable body, Escape handler, and close guard. Three thin wrappers (`GenerateButton` island on dashboard, `generatingDeck` state in `DeckList`, `showGenerationModal` state in `DeckDetail`) each render one `<GenerationModal>` with an optional `preselectedDeckId`. After save, `useGeneration` dispatches a DOM `CustomEvent('deck-saved')` that `DeckList` catches to re-fetch.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Core Modal + Hook Refactor | `GenerationModal` exists; can be rendered manually; hook refactored | Refactoring `GenerationFlow` into a presenter touches 4 files simultaneously |
| 2. Dashboard + DeckList Entry Points | CTA + DeckCard button live; deck list refreshes on save | Two React islands on the same page communicating via CustomEvent |
| 3. DeckDetail Entry Point + Route Cleanup | Third entry point live; `/generate` gone | Close-modal-then-navigate-to-dashboard to verify deck count (no in-place refresh on DeckDetail) |

**Prerequisites:** S-01 (generation flow components), S-06 (modal patterns, CSS variables, DeckCard structure) — both done.  
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- The `reviewing` phase can stack many proposals; confirm the `max-h-[90vh]` scroll cap does not clip the save button on small-screen laptops.
- Opening from a DeckCard with `preselectedDeckId` requires the deck to appear in `SaveDeckForm`'s async `/api/decks` fetch — the initial selected value is set correctly, but if the fetch races it may temporarily show "Nowy zestaw" before settling. Acceptable for MVP.

## Success Criteria (Summary)

- Opening the modal from any of the three entry points never navigates away from the current page.
- After saving, the deck list on the dashboard gains the new deck without a page reload.
- Visiting `/generate` redirects to `/dashboard` with a 301.
