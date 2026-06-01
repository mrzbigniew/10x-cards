# Manual Flashcard CRUD — Plan Brief

> Full plan: `context/changes/manual-card-crud/plan.md`

## What & Why

S-04 delivers manual flashcard CRUD: add, edit (with optional SR-state reset), and delete cards in any deck. This unlocks the core study loop — AI generation (S-01) produces an initial card set, but students need to supplement and correct it manually. It also completes the prerequisite chain for S-03 (review session).

## Starting Point

The `cards` table is schema-ready (`source` column accepts `'manual'`; RLS enforced; `card_sr_state` auto-created by DB trigger). The dashboard shows a flat deck list with no navigation into a deck's cards — there are no card-level API endpoints and no deck-detail page.

## Desired End State

The dashboard becomes a responsive card grid (360×150px per deck) with a 3-dot dropdown per deck: Edit navigates to `/deck/[id]`; Delete preserves the existing typed-name confirmation. On `/deck/[id]`, the user can rename the deck, add cards via a modal form, edit cards inline (textareas appear in place with an unchecked SR-reset checkbox), and delete cards with a 2-click inline confirm. All manual cards are stored with `source='manual'`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- | ------ |
| Entry point for card management | New `/deck/[id]` page | Clean separation: dashboard = deck list, `/deck/[id]` = card ops | Plan |
| Dashboard deck display | 360×150px card grid + 3-dot dropdown | User specified dimensions and interaction model | Plan |
| Add card UX | Modal form | Keeps the card list visually uncluttered | Plan |
| Edit card UX | Inline textareas (ProposalRow pattern) | Reuses established codebase pattern, lowest new-code cost | Plan |
| Delete card UX | 2-click inline confirm (no modal) | Proportionate to action severity; faster than an overlay | Plan |
| SR reset mechanic | UPDATE card_sr_state to FSRS defaults | Trigger only fires on INSERT; reset = UPDATE, never DELETE | Research |
| `source` field on manual cards | Always `'manual'` | DB CHECK constraint; preserves 75%-from-AI metric accuracy | Research |
| Front/back max length | 500 chars each | Typical flashcard content; avoids unwieldy review cards in S-03 | Plan |
| Deck rename location | Moved from dashboard to `/deck/[id]` | 3-dot dropdown replaces inline rename on dashboard | Plan |

## Scope

**In scope:** New `/deck/[id]` page; card-level API endpoints (GET deck+cards, POST/PATCH/DELETE card); dashboard card-grid redesign + 3-dot dropdown; SR-reset checkbox on edit (unchecked by default).

**Out of scope:** SR state display (S-03); bulk card operations; card reordering; card search/filter; deck-level stats header on detail page.

## Architecture / Approach

Standard service → API → hook → component layering (identical to S-01/S-02). Three new API route files nest under `/api/decks/[id]/` using Astro file-based routing. A new `useDeckDetail` hook manages all detail-page state (deck metadata + cards + mutations). The dashboard's `DeckRow` is reshaped into `DeckCard` with a 3-dot dropdown — inline rename is removed from the dashboard and replaced by navigation to the detail page.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. API + Service layer | All card-level endpoints + service functions | SR reset must UPDATE card_sr_state, not INSERT |
| 2. Deck detail page + card UI | Full CRUD surface at `/deck/[id]` | SR-reset checkbox must default unchecked (FR-011 explicit requirement) |
| 3. Dashboard redesign | Card grid + 3-dot dropdown; inline rename removed | Removing DeckRow rename without breaking existing delete flow |

**Prerequisites:** F-01 (done), S-02 (done) — schema, RLS, and deck APIs are all in place.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Dropdown click-outside handling: no existing pattern in the codebase — a `useEffect` adding a document click listener is the simplest approach.
- `card_sr_state` row could theoretically be absent for a card (edge case from trigger failure) — SR reset UPDATE should silently no-op in that case.

## Success Criteria (Summary)

- User can navigate from dashboard → `/deck/[id]` → add, edit (with SR reset option), and delete cards end-to-end
- SR-reset checkbox defaults to unchecked; when checked, `card_sr_state` row resets to FSRS initial values
- Dashboard shows card grid; 3-dot dropdown navigates to Edit or triggers Delete; existing delete flow unchanged
