# Manual Flashcard CRUD Implementation Plan

## Overview

Implements S-04: user can add, edit, and delete flashcards manually within any of their decks. Delivers a new `/deck/[id]` page as the primary card management surface, and redesigns the dashboard from a flat list to a 360×150px card grid with a 3-dot action dropdown. The DB schema (`cards` table with `source` column) is already in place — no migrations needed.

## Current State Analysis

The `cards` table is fully ready: `id, deck_id, user_id, front, back, source ('ai'|'manual'), created_at, updated_at`. The `card_sr_state` row is auto-created by a DB trigger on every card INSERT (`state=0, due=now()`) — this contract must not be broken. RLS enforces owner-only access on all three tables.

The dashboard (`dashboard.astro` + `DeckList.tsx` + `DeckRow.tsx`) renders a vertical list. Deck rename and delete are handled inline in `DeckRow.tsx`. There are no card-level API endpoints, no card service functions, and no deck-detail page.

## Desired End State

- Dashboard shows a responsive card grid where each deck card is ~360×150px, displaying name + card count, with a 3-dot dropdown: Edit (→ `/deck/[id]`) and Delete (existing typed-name modal, unchanged).
- `/deck/[id]` page: breadcrumb (← Dashboard), inline deck rename, card list below with an "Add card" button that opens a modal form.
- Each card row: front + back (truncated), Edit and Delete controls. Editing reveals inline front/back textareas plus an SR-reset checkbox (unchecked by default). Delete shows a 2-click inline confirm (row switches to "Confirm delete? / Cancel").
- Manually added cards have `source='manual'`, preserving the 75%-from-AI acceptance metric.
- The deck survives even when its last card is deleted.
- Front and back fields enforce a 500-char maximum.

### Key Discoveries:

- `card_sr_state` is auto-created by `after_card_insert` trigger — SR reset = `UPDATE card_sr_state SET state=0, due=now(), stability=0, difficulty=0, elapsed_days=0, scheduled_days=0, reps=0, lapses=0, last_review=null WHERE card_id=... AND user_id=...`. Never DELETE+INSERT.
- `source` has a CHECK constraint (`IN ('ai', 'manual')`) — manually created cards must set `source: 'manual'`.
- `DeckRow.tsx` currently owns inline rename; that UX moves to `/deck/[id]` in Phase 3 — the inline rename input is removed from the dashboard.
- All service functions receive `(supabase, userId, ...)` — RLS enforces access; explicit `user_id` filtering in queries is the established codebase convention.
- `export const prerender = false` is required on all new API routes.
- Protected routes are configured in `src/middleware.ts` as an array — add `/deck` pattern.

## What We're NOT Doing

- No SR state display on card rows (due/state badges) — that's S-03
- No bulk card operations
- No drag-and-drop reordering
- No card search or filter within a deck
- No card-count header on `/deck/[id]` — the list length is self-evident

## Implementation Approach

Phase 1 builds the data layer (service functions + Zod schemas + API endpoints) with no UI impact. Phase 2 adds the `/deck/[id]` page with full card CRUD, reachable directly via URL before Phase 3 wires the dashboard navigation. Phase 3 redesigns the dashboard to the card-grid layout and connects the 3-dot dropdown, completing the end-to-end flow.

## Critical Implementation Details

- **SR state reset is an UPDATE, not a trigger action.** The DB trigger fires only on INSERT. Resetting SR during card edit requires an explicit `UPDATE card_sr_state`. If the row is somehow absent (defensive case), the update is a no-op — not a 500.
- **`source` must be `'manual'`.** The DB CHECK constraint rejects any other value; omitting it causes a 500 from Supabase.
- **Nested Astro dynamic routes.** `src/pages/api/decks/[id]/cards/[cardId].ts` uses `context.params.id` and `context.params.cardId` as separate params.

---

## Phase 1: API + Service Layer

### Overview

Creates the card-level service functions, Zod validation schemas, and API endpoints. No UI changes. Existing deck endpoints remain untouched.

### Changes Required:

#### 1. Card service

**File**: `src/lib/services/cards.ts` (new)

**Intent**: Thin, Supabase-only service functions for all card operations. Follow the `(supabase, userId, ...)` convention from `decks.ts`.

**Contract**:
- Export `Card` type: `{ id, deck_id, front, back, source, created_at, updated_at }` (user_id is internal — omit from exported type).
- `listCardsInDeck(supabase, userId, deckId): Promise<Card[]>` — SELECT WHERE deck_id + user_id, ORDER BY created_at ASC. Throws on Supabase error.
- `addCard(supabase, userId, deckId, front, back): Promise<{ id: string }>` — INSERT with `source: 'manual'`; trigger auto-creates card_sr_state. Throws on error.
- `updateCard(supabase, userId, cardId, front, back, resetSR: boolean): Promise<void>` — UPDATE cards WHERE id + user_id; if resetSR is true, also calls `resetCardSRState` in the same function. Throws on error.
- `resetCardSRState(supabase, userId, cardId): Promise<void>` — UPDATE card_sr_state SET state=0, due=now(), stability=0, difficulty=0, elapsed_days=0, scheduled_days=0, reps=0, lapses=0, last_review=null WHERE card_id + user_id.
- `deleteCard(supabase, userId, cardId): Promise<void>` — DELETE WHERE id + user_id. DB cascade deletes card_sr_state.

#### 2. Card Zod schemas

**File**: `src/lib/schemas/cards.ts` (new)

**Intent**: Validate API request bodies for add and update operations.

**Contract**:
- `AddCardSchema`: `{ front: z.string().min(1).max(500), back: z.string().min(1).max(500) }`
- `UpdateCardSchema`: `{ front: z.string().min(1).max(500), back: z.string().min(1).max(500), resetSR: z.boolean() }`

#### 3. GET handler on existing deck endpoint

**File**: `src/pages/api/decks/[id].ts` (modify — add GET export)

**Intent**: Return deck metadata plus its cards so the detail page has a single fetch for both.

**Contract**: GET export — auth guard (401 if no session), validate `context.params.id` (400 if missing), call `listCardsInDeck` and fetch the deck row. Return `{ deck: { id, name, created_at, updated_at }, cards: Card[] }` with 200. If deck row is not found, return 404 `{ error: "Not found" }`. Return 500 on unexpected error.

#### 4. Add card endpoint

**File**: `src/pages/api/decks/[id]/cards.ts` (new)

**Intent**: POST to add a single manual card to the deck.

**Contract**: POST export — auth guard (401), validate `context.params.id` (400 if missing), parse body with `AddCardSchema` (400 on failure), call `addCard`, return `{ id }` with 201. Export `export const prerender = false`.

#### 5. Card mutation endpoint

**File**: `src/pages/api/decks/[id]/cards/[cardId].ts` (new)

**Intent**: PATCH updates a card's content (+ optional SR reset); DELETE removes a card.

**Contract**:
- PATCH export — auth guard (401), validate both `id` and `cardId` params (400 if either missing), parse body with `UpdateCardSchema` (400 on failure), call `updateCard`, return `{}` with 200.
- DELETE export — auth guard (401), validate params, call `deleteCard`, return `{}` with 200.
- Both: 500 on service error.
- Export `export const prerender = false`.

### Success Criteria:

#### Automated Verification:

- TypeScript type-check passes: `npx tsc --noEmit`
- No lint errors: `npx eslint src/lib/services/cards.ts src/lib/schemas/cards.ts src/pages/api/decks/` (or project lint command)

#### Manual Verification:

- GET `/api/decks/<valid-id>` returns `{ deck, cards }` for an authenticated user
- POST `/api/decks/<id>/cards` with `{ front, back }` inserts a card with `source='manual'` (visible in Supabase table editor)
- PATCH `/api/decks/<id>/cards/<cardId>` with `{ front, back, resetSR: false }` updates content; `card_sr_state` row unchanged
- PATCH same route with `resetSR: true` resets `card_sr_state` columns to FSRS defaults (verify in DB)
- DELETE `/api/decks/<id>/cards/<cardId>` removes the card; the deck row still exists
- All endpoints return 401 when called without an authenticated session

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Deck Detail Page + Card Management UI

### Overview

Creates the `/deck/[id]` page with full card CRUD. The deck detail page is reachable directly via URL; the dashboard navigation link is wired up in Phase 3.

### Changes Required:

#### 1. Middleware protection

**File**: `src/middleware.ts` (modify)

**Intent**: Add `/deck` to the protected-routes list so unauthenticated visits redirect to sign-in.

**Contract**: Locate the `PROTECTED_ROUTES` array (or equivalent guard check) and add `'/deck'` alongside `'/dashboard'`. The existing matching logic should cover all `/deck/...` subpaths with this addition.

#### 2. Deck detail Astro page

**File**: `src/pages/deck/[id].astro` (new)

**Intent**: Server-rendered shell that mounts the `DeckDetail` React island and passes the deck id.

**Contract**: Read `Astro.params.id`. If undefined, return a 404 response. Render `<Topbar />` and `<DeckDetail deckId={id} client:load />` inside a container consistent with `dashboard.astro`. Import and use the existing `Layout` component.

#### 3. useDeckDetail hook

**File**: `src/components/hooks/useDeckDetail.ts` (new)

**Intent**: Centralize all data fetching and mutations for the deck detail page. One hook owns the deck + cards state for this surface.

**Contract**:
- On mount: GET `/api/decks/${deckId}` → populate `deck` and `cards` state.
- Mutations: `renameDeck(name)`, `addCard(front, back)`, `updateCard(cardId, front, back, resetSR)`, `deleteCard(cardId)` — each calls the appropriate API endpoint, then re-fetches deck+cards on success, sets `error` state on failure.
- Return: `{ deck, cards, loading, error, renameDeck, addCard, updateCard, deleteCard }`

#### 4. DeckDetail component

**File**: `src/components/DeckDetail.tsx` (new)

**Intent**: Top-level component for the deck detail page; composes header + card list + add modal.

**Contract**: Props `{ deckId: string }`. Uses `useDeckDetail`. Local state: `showAddModal`. Renders: loading spinner → error banner → `DeckDetailHeader` + add-card button + `CardList` + `AddCardModal` (when `showAddModal` is true).

#### 5. DeckDetailHeader component

**File**: `src/components/DeckDetailHeader.tsx` (new)

**Intent**: Breadcrumb plus inline deck rename.

**Contract**: Props `{ deck: { id, name }, onRename: (name: string) => Promise<void> }`. Renders: `← Dashboard` anchor (href="/dashboard"); deck name inline-editable (same click-to-edit, Enter/blur-saves, Escape-cancels pattern as the current `DeckRow` rename; use an `input` ref for focus management).

#### 6. CardList component

**File**: `src/components/CardList.tsx` (new)

**Intent**: Renders the ordered list of `CardRow` components or an empty state.

**Contract**: Props `{ cards: Card[], onUpdate: (cardId, front, back, resetSR) => Promise<void>, onDelete: (cardId) => Promise<void> }`. Empty state: "No cards yet — add your first card." When cards exist, render a `<ul>` of `CardRow`.

#### 7. CardRow component

**File**: `src/components/CardRow.tsx` (new)

**Intent**: Displays a single card with inline edit (ProposalRow pattern) and inline delete confirm.

**Contract**: Props `{ card: Card, onUpdate: ..., onDelete: ... }`. Three local modes:
- **View**: front (truncated ~80 chars) + back (truncated ~80 chars); Edit + Delete buttons.
- **Editing**: two stacked textareas for front and back (both max 500, character count displayed); SR-reset checkbox labelled "Reset SR progress" — **default unchecked**; Save + Cancel buttons.
- **Deleting**: row content replaced by "Confirm delete?" text + "Yes, delete" (red) + "Cancel" buttons inline.

State machine: View → Editing (Edit click), View → Deleting (Delete click), Editing → View (Save or Cancel), Deleting → View (Cancel or after successful delete).

#### 8. AddCardModal component

**File**: `src/components/AddCardModal.tsx` (new)

**Intent**: Modal overlay with front + back fields for adding a new card.

**Contract**: Props `{ isOpen: boolean, onClose: () => void, onAdd: (front, back) => Promise<void> }`. Structure mirrors `DeleteDeckModal`: `fixed inset-0 z-50` overlay with `bg-black/60 backdrop-blur-sm`, centered rounded container. Contains: front textarea (max 500, character count), back textarea (max 500, character count), error banner (on failure), "Add card" submit button (disabled while either field is empty or submission is in flight), Cancel button. On successful add: reset fields + call `onClose`.

### Success Criteria:

#### Automated Verification:

- TypeScript type-check passes: `npx tsc --noEmit`
- No lint errors

#### Manual Verification:

- Visiting `/deck/<valid-id>` shows the deck name, breadcrumb, and card list (or empty state)
- Unauthenticated visit to `/deck/<id>` redirects to `/auth/signin`
- Add card modal opens; client-side validation blocks empty submit; successful submit adds the card to the list
- Edit a card: textareas populate with current content; SR checkbox starts unchecked; saving without checkbox updates content only (verify `card_sr_state` unchanged in DB); saving with checkbox checked resets SR state (verify `state=0, due≈now()` in DB)
- Delete a card: inline confirm appears; confirming removes the card; deck page remains; deleting the last card shows empty state (not a 404)
- Breadcrumb navigates back to `/dashboard`
- Deck rename from detail header works and persists

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 3. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Dashboard Redesign

### Overview

Converts the dashboard from a vertical list to a 360×150px card grid with a 3-dot action dropdown per deck. Inline rename moves off the dashboard entirely.

### Changes Required:

#### 1. DeckList layout to card grid

**File**: `src/components/DeckList.tsx` (modify)

**Intent**: Change the container's layout from a vertical stack to a responsive card grid. The rest of DeckList (fetching, error state, create-deck form) is unchanged.

**Contract**: Replace the list container with `grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-4`. Update the child component import from `DeckRow` to `DeckCard` (or the renamed component).

#### 2. DeckRow → DeckCard

**File**: `src/components/DeckRow.tsx` (modify in-place; rename export to `DeckCard`)

**Intent**: Reshape from a list row to a 360×150px card with a 3-dot dropdown. Remove all inline rename UI.

**Contract**:
- Outer element: fixed dimensions approximated with `min-h-[150px] w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 flex flex-col justify-between relative` (match existing glass aesthetic).
- Content area (top): deck name with `line-clamp-2 text-lg font-semibold`; card count with `text-sm text-white/60` below.
- Top-right corner: 3-dot button (`⋯` or a `MoreVertical` icon, ghost style). Toggling it shows a small absolutely-positioned dropdown below.
- Dropdown: "Edit" item (pencil icon + text, click navigates to `/deck/${deck.id}` via `window.location.href` or an `<a>` tag) and "Delete" item (trash icon + text, calls existing `onDelete` prop). Close dropdown on outside click (`useEffect` with a document click listener).
- Remove: all rename state (`editing`, `editName`, `inputRef`), the rename input element, and the `onRename` prop from both the component and its call site in `DeckList.tsx`.
- Keep: `onDelete` prop unchanged — still triggers `DeleteDeckModal` from `DeckList`.

#### 3. useDeckList hook cleanup

**File**: `src/components/hooks/useDeckList.ts` (modify)

**Intent**: Remove `renameDeck` from the hook's exported return value since the dashboard no longer calls it.

**Contract**: Delete `renameDeck` from the returned object literal. The underlying `renameDeck` service function in `src/lib/services/decks.ts` is untouched (still used by the detail page's `useDeckDetail` hook). Remove any now-unused imports in this file.

### Success Criteria:

#### Automated Verification:

- TypeScript type-check passes: `npx tsc --noEmit`
- No lint errors

#### Manual Verification:

- Dashboard shows a card grid that wraps responsively (test at 1440px, 1024px, 768px)
- Each deck card displays name (truncated on overflow) + card count
- 3-dot button toggles the dropdown; clicking outside the dropdown closes it
- "Edit" in dropdown navigates to `/deck/<id>`
- "Delete" in dropdown opens the existing typed-name delete modal; deck is deleted on confirmation
- No inline rename input visible anywhere on the dashboard
- End-to-end flow works: dashboard → Edit deck → add card → edit card → delete card → breadcrumb back

**Implementation Note**: After completing this phase and all automated verification passes, pause here for final manual confirmation from the human that the full flow works end-to-end. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Manual Testing Steps:

1. From dashboard, click 3-dot → Edit → land on `/deck/[id]` with card list
2. Add a card via modal → appears in list with correct front + back
3. Edit a card (SR reset unchecked) → content updates; verify `card_sr_state` unchanged in DB
4. Edit a card (SR reset checked) → content updates; verify `card_sr_state.state=0, due≈now()` in DB
5. Delete a card (2-click inline confirm) → card removed; page stays; deck exists in DB
6. Delete the last card in a deck → empty state shown; deck row survives in DB
7. Rename deck from detail header → reflects immediately and persists across refresh
8. Dashboard card grid: verify layout at 1440px, 1024px, 768px viewports
9. Verify 500-char limit is enforced on front and back fields (both modal and inline edit)

## References

- Roadmap: `context/foundation/roadmap.md` (S-04, PRD refs: US-02, US-05, FR-010, FR-011, FR-012)
- DB schema: `supabase/migrations/20260526220447_initial_schema.sql`
- Existing service pattern: `src/lib/services/decks.ts`
- Existing modal pattern: `src/components/DeleteDeckModal.tsx`
- Existing inline edit pattern: `src/components/ProposalRow.tsx`
- Existing hook pattern: `src/components/hooks/useDeckList.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API + Service Layer

#### Automated

- [x] 1.1 TypeScript type-check passes — c621001
- [x] 1.2 No lint errors — c621001

#### Manual

- [x] 1.3 GET /api/decks/<id> returns { deck, cards } for authenticated user — c621001
- [x] 1.4 POST /api/decks/<id>/cards inserts card with source='manual' — c621001
- [x] 1.5 PATCH /api/decks/<id>/cards/<cardId> updates content; with resetSR:true resets card_sr_state — c621001
- [x] 1.6 DELETE /api/decks/<id>/cards/<cardId> removes card; deck survives — c621001
- [x] 1.7 All endpoints return 401 when unauthenticated — c621001

### Phase 2: Deck Detail Page + Card Management UI

#### Automated

- [x] 2.1 TypeScript type-check passes — de53c86
- [x] 2.2 No lint errors — de53c86

#### Manual

- [x] 2.3 /deck/<id> shows deck name, breadcrumb, and card list — de53c86
- [x] 2.4 Unauthenticated visit to /deck/<id> redirects to /auth/signin — de53c86
- [x] 2.5 Add card modal validates and adds card to list on submit — de53c86
- [x] 2.6 Edit card: SR checkbox starts unchecked; save without checkbox updates content only; save with checkbox resets card_sr_state — de53c86
- [x] 2.7 Delete card: inline confirm works; last card leaves empty state; deck page remains — de53c86
- [x] 2.8 Breadcrumb navigates back to /dashboard — de53c86
- [x] 2.9 Deck rename from detail header persists — de53c86

### Phase 3: Dashboard Redesign

#### Automated

- [x] 3.1 TypeScript type-check passes
- [x] 3.2 No lint errors

#### Manual

- [x] 3.3 Dashboard shows responsive card grid at 1440px, 1024px, 768px
- [x] 3.4 Each deck card shows name + card count
- [x] 3.5 3-dot dropdown toggles and closes on outside click
- [x] 3.6 Edit navigates to /deck/<id>
- [x] 3.7 Delete opens typed-name modal; deck deleted on confirmation
- [x] 3.8 No inline rename input on dashboard
- [x] 3.9 Full end-to-end flow verified (dashboard → add card → edit card → delete card → back)
