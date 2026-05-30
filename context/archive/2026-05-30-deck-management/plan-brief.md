# Deck Management — Plan Brief

> Full plan: `context/changes/deck-management/plan.md`

## What & Why

S-02 adds the deck management layer that the rest of the product depends on. S-01 proved the core hypothesis (AI proposals from the student's own text are usable); S-02 makes those decks manageable — users can list, create, rename, and delete their decks, and choose an existing deck when saving new generation results.

## Starting Point

F-01 schema and S-01 generation flow are complete. The `decks` table exists with owner RLS and cascade-delete on cards. `POST /api/decks` creates a new deck + cards. There is no deck list, no rename/delete API, and `SaveDeckForm` is hard-coded to "new deck only."

## Desired End State

`/dashboard` shows the existing welcome header + CTA, then a live deck list with card counts, inline rename, and a typed-name delete modal. The generation save form always presents a deck picker where "Nowy zestaw" is the first option, completing the FR-009 existing-deck path deferred from S-01.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Deck list location | Embedded in `/dashboard` | Keeps navigation flat; users land on their deck list immediately after sign-in |
| API structure | REST: GET/POST `/api/decks` + PATCH/DELETE `/api/decks/[id]` | Follows standard REST conventions; Astro dynamic routes support it cleanly |
| Save form UX | Always-visible deck picker; "Nowy zestaw" is first option | Avoids a mode-switch toggle; experienced users can jump to an existing deck without an extra click |
| Delete confirmation | Modal with typed deck name (FR-017) | PRD requires it; GitHub-style confirmation prevents accidental loss of all cards in a deck |
| Rename UX | Inline edit — click name → input → Enter/blur saves | Fastest interaction; no extra modal or button required for a frequent action |
| Card count on list | Yes — Supabase aggregate `cards(count)` | Gives users meaningful context about each deck at a glance without extra round-trips |

## Scope

**In scope:** deck list with card count; create empty deck; rename; typed-name delete; existing-deck save path in generation; dashboard layout extension.

**Out of scope:** deck detail page (S-03/S-04); card management (S-04); sorting/filtering controls; undo/trash; folder, tags, or colors.

## Architecture / Approach

Three thin vertical layers stacked on the existing Supabase + Astro + React-island pattern:

1. `src/lib/services/decks.ts` gets four new functions; `src/pages/api/decks.ts` gets a GET handler + extended POST; a new `src/pages/api/decks/[id].ts` handles PATCH/DELETE.
2. A `useDeckList` hook + three deck-specific components (`DeckRow`, `DeleteDeckModal`, `DeckList`) form the `/dashboard` island.
3. `SaveDeckForm` and `useGeneration` get minimal extensions to pass `deckId` through the existing `POST /api/decks` call via a Zod discriminated union.

The middleware already uses `startsWith` matching, so `/api/decks` covers `/api/decks/[id]` with no changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. API Layer | GET/POST/PATCH/DELETE deck endpoints + service functions | Supabase aggregate query shape requires manual normalization; easy to ship `[{ count }]` arrays to the client instead of scalars |
| 2. Deck List on Dashboard | Live deck list with create, inline rename, typed-name delete | Optimistic rename state must roll back cleanly on error |
| 3. Generation Save Flow | Existing-deck path in `SaveDeckForm` + `useGeneration` | `SaveDeckRequestSchema` union change must not break S-01 new-deck callers |

**Prerequisites:** F-01 done ✓, S-01 done ✓  
**Estimated effort:** ~2–3 sessions across 3 phases

## Open Risks & Assumptions

- The `SaveDeckForm` deck picker makes a `GET /api/decks` call on mount in the generation flow — if a user has many decks, this list could grow. Flat list is fine for MVP; pagination is out of scope.
- Deck deletion is immediate and permanent (cascade to cards + SR state). There is no undo by PRD design — the typed-name confirmation is the only safeguard.

## Success Criteria (Summary)

- A signed-in user can see all their decks on `/dashboard` with card counts and perform create / rename / delete without a page reload.
- Saving a generation result to an existing deck increments that deck's card count visibly.
- All deck data is user-isolated: no user can read or mutate another user's decks.
