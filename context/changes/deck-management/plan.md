# Deck Management Implementation Plan

## Overview

Implement S-02: a full deck management layer on top of the F-01 schema. Adds a REST resource for deck CRUD, embeds a deck list island into `/dashboard`, and completes the FR-009 existing-deck save path in the generation flow.

## Current State Analysis

F-01 and S-01 are complete. The `decks` / `cards` / `card_sr_state` tables exist with owner RLS and cascade deletes. `POST /api/decks` creates a new deck + bulk-inserts cards. `SaveDeckForm.tsx` is hard-coded to "new deck only". There is no GET/PATCH/DELETE on decks, no deck list UI, and no `/dashboard` deck content.

## Desired End State

- `/dashboard` shows the welcome header, a "Generuj fiszki" CTA, and a live deck list below it. Each deck row displays the deck name, card count, an inline-rename affordance, and a delete button.
- A modal with a typed-name input guards deletion.
- The generation save form always shows a deck picker; "Nowy zestaw" is the first option and reveals a name input; selecting an existing deck hides it.
- All deck mutations are protected by the same 401-on-no-user middleware already in place.

### Key Discoveries

- `src/middleware.ts:19` uses `startsWith` — `"/api/decks"` already covers `/api/decks/[id]`. **No middleware changes needed.**
- `src/lib/services/decks.ts` already has `createDeckWithCards`. Extend the same file.
- Supabase aggregate `select('id, name, created_at, cards(count)')` returns `cards` as `Array<{ count: number }>` — the service layer must normalize this to a scalar `card_count`.
- Dynamic Astro API route file must be `src/pages/api/decks/[id].ts` with `context.params.id` for `deckId`.
- `card_sr_state` rows are created by a DB trigger on card insert — never insert them from app code (S-01 convention, `src/lib/services/decks.ts`).

## What We're NOT Doing

- No deck detail page (S-03 and S-04 will own per-deck navigation)
- No deck sorting controls — list is newest-first (`created_at DESC`)
- No card management in this slice (S-04)
- No undo / soft-delete / trash (PRD Non-Goals)
- No folder, tags, colors, or custom ordering (PRD Non-Goals)

## Implementation Approach

Three vertical phases, each independently testable:

1. **API layer first** — service functions + REST endpoints; verifiable with curl/Postman before any UI exists.
2. **Deck list island** — React island on `/dashboard` using the new API; fully functional CRUD before the generation flow is touched.
3. **Generation save flow** — extend `SaveDeckForm` and `useGeneration` to offer the existing-deck path; the last phase because it depends on the deck list API being stable.

## Critical Implementation Details

**Supabase aggregate shape**: `select('id, name, created_at, cards(count)')` returns each row with `cards: [{ count: number }]`. Normalize to `card_count: number` in the service function before returning. Components and the API response must only see the scalar.

**Dynamic route `context.params.id` typing**: In `src/pages/api/decks/[id].ts`, `context.params.id` is `string | undefined`. Validate it early — if missing, return `400`. Pass it through `RenameDeckSchema` / `DeleteDeckSchema` before touching Supabase.

**Optimistic rename**: The `DeckRow` inline edit should update local state before the PATCH resolves so the rename feels instant. Roll back to the previous name and surface an error message if the API returns non-2xx.

---

## Phase 1: API Layer

### Overview

Add service functions for list / rename / delete / append, extend `POST /api/decks` to handle the existing-deck cards path, and add a new `src/pages/api/decks/[id].ts` file for PATCH and DELETE. No UI changes.

### Changes Required

#### 1. New Zod schemas

**File**: `src/lib/schemas/decks.ts`

**Intent**: Centralise deck-specific validation schemas so API routes stay thin. Mirrors the `src/lib/schemas/generation.ts` pattern from S-01.

**Contract**: Export three schemas:
- `CreateEmptyDeckSchema` — `{ name: z.string().min(1).max(200) }`
- `RenameDeckSchema` — `{ name: z.string().min(1).max(200) }`
- `AppendCardsToDeckSchema` — `{ deckId: z.string().uuid(), cards: ProposalSchema.array().min(1) }` — import `ProposalSchema` from `generation.ts`

---

#### 2. Extended deck service

**File**: `src/lib/services/decks.ts`

**Intent**: Add the four new operations needed by S-02 without changing the existing `createDeckWithCards` signature (S-01 callers must stay unaffected).

**Contract**: Append four exported async functions:

| Function | Supabase call | Returns |
|----------|---------------|---------|
| `listDecksWithCardCount(supabase, userId)` | `.from('decks').select('id, name, created_at, updated_at, cards(count)').eq('user_id', userId).order('created_at', { ascending: false })` | `Array<DeckWithCount>` or throws |
| `createEmptyDeck(supabase, userId, name)` | `.from('decks').insert({ name, user_id: userId }).select('id').single()` | `{ id: string }` or throws |
| `renameDeck(supabase, userId, deckId, name)` | `.from('decks').update({ name }).eq('id', deckId).eq('user_id', userId)` | `void` or throws |
| `deleteDeck(supabase, userId, deckId)` | `.from('decks').delete().eq('id', deckId).eq('user_id', userId)` | `void` or throws |
| `appendCardsToDeck(supabase, userId, deckId, cards)` | `.from('cards').insert(cards.map(c => ({ front: c.front, back: c.back, source: 'ai', deck_id: deckId, user_id: userId })))` | `void` or throws |

`DeckWithCount` type (add to file or a types location): `{ id: string; name: string; created_at: string; updated_at: string; card_count: number }`. Normalize the `cards: [{ count }]` aggregate inside `listDecksWithCardCount` before returning.

---

#### 3. Extended `POST /api/decks` + new `GET /api/decks`

**File**: `src/pages/api/decks.ts`

**Intent**: Add `GET` to list decks, and extend `POST` to handle both the new-deck path (name + cards, existing S-01 behaviour) and the existing-deck path (deckId + cards, new FR-009 path). The discriminator is presence of `deckId` in the body.

**Contract**:

`GET` handler — auth + Supabase guard (same 401/503 pattern as existing POST) → `listDecksWithCardCount` → `Response.json(decks)`.

`POST` handler — extend `SaveDeckRequestSchema` in `generation.ts` OR add a local `safeParse` check: if body has `deckId` (validate as uuid) → `appendCardsToDeck`; otherwise keep existing `createDeckWithCards` path. Return `{ deckId }` in both cases.

---

#### 4. New `PATCH` + `DELETE` route

**File**: `src/pages/api/decks/[id].ts` *(new file)*

**Intent**: Expose rename and delete on the deck resource. Follows the established APIRoute conventions — `prerender = false`, auth + Supabase guard, Zod validation, JSON errors.

**Contract**:

```typescript
export const prerender = false;
export const PATCH: APIRoute = async (context) => { ... };
export const DELETE: APIRoute = async (context) => { ... };
```

`PATCH`: validate `context.params.id` is present, parse body with `RenameDeckSchema`, call `renameDeck(supabase, userId, id, name)`, return `200 {}` or appropriate error.

`DELETE`: validate `context.params.id`, call `deleteDeck(supabase, userId, id)`, return `200 {}`.

Both handlers return `400` if params/body are invalid, `500` on service error. The DB cascade handles deleting cards and SR state when a deck is deleted.

---

### Success Criteria

#### Automated Verification

- TypeScript builds without errors: `npm run build` (or `astro check`)
- Linting passes: `npm run lint`

#### Manual Verification

- `GET /api/decks` with a valid session cookie returns the user's deck list with `card_count` per deck.
- `POST /api/decks` with `{ name, cards }` creates a new deck (existing S-01 behaviour unchanged).
- `POST /api/decks` with `{ deckId, cards }` appends cards to an existing deck without creating a new one.
- `PATCH /api/decks/:id` with `{ name }` renames the deck; verifiable via subsequent GET.
- `DELETE /api/decks/:id` removes the deck; cards cascade-deleted; verifiable via subsequent GET.
- Calling any endpoint without a session returns `401 { "error": "Unauthorized" }`.

**Pause here for manual confirmation before proceeding to Phase 2.**

---

## Phase 2: Deck List on Dashboard

### Overview

Build the React island that replaces the minimal dashboard content with a live, editable deck list. The island owns create, rename, and delete interactions; the Astro page provides the shell.

### Changes Required

#### 1. Deck list hook

**File**: `src/components/hooks/useDeckList.ts` *(new file)*

**Intent**: Centralise all deck CRUD state and fetch calls so `DeckList` is a pure rendering component. Follows the `useGeneration.ts` hook pattern from S-01.

**Contract**: Export `useDeckList()` returning:

```typescript
{
  decks: DeckWithCount[];
  loading: boolean;
  error: string | null;
  createDeck: (name: string) => Promise<void>;
  renameDeck: (id: string, name: string) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;
}
```

All mutating functions re-fetch the list on success. `renameDeck` applies an optimistic local update before the PATCH and rolls back with an error string if it fails.

---

#### 2. Delete confirmation modal

**File**: `src/components/decks/DeleteDeckModal.tsx` *(new file)*

**Intent**: GitHub-style typed-name confirmation per FR-017. Renders a modal overlay with an input the user must type to match the deck name before the destructive button becomes enabled.

**Contract**: Props `{ isOpen: boolean; deckName: string; onConfirm: () => void; onCancel: () => void; isDeleting: boolean }`. Delete button disabled while `inputValue !== deckName` or `isDeleting`. Uses `cn()` from `@/lib/utils` for class merging.

---

#### 3. Deck row

**File**: `src/components/decks/DeckRow.tsx` *(new file)*

**Intent**: A single deck list item with card count, inline rename, and a delete trigger. Keeps `DeckList` clean by isolating per-row state.

**Contract**: Props `{ deck: DeckWithCount; onRename: (id: string, name: string) => Promise<void>; onDeleteRequest: (deck: DeckWithCount) => void }`.

Inline rename: clicking the name switches it to a `<input>` pre-filled with the current name. `onBlur` or `Enter` calls `onRename`; `Escape` cancels without saving.

---

#### 4. Deck list container

**File**: `src/components/decks/DeckList.tsx` *(new file)*

**Intent**: The React island rendered on `/dashboard`. Composes `useDeckList`, `DeckRow`, and `DeleteDeckModal` into the full deck management experience.

**Contract**: No props (fetches everything via hook). Renders a "Nowy zestaw" create form at the top (text input + submit button, hidden until user clicks "+ Nowy zestaw"); maps `decks` to `DeckRow` instances; holds `deletingDeck: DeckWithCount | null` state to control `DeleteDeckModal`. Loading and error states are visible.

---

#### 5. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Embed the `DeckList` island below the existing welcome header and CTA, keeping the current layout shell intact.

**Contract**: Add `import DeckList from '@/components/decks/DeckList'` and render `<DeckList client:load />` after the existing sign-out / generate CTA block.

---

### Success Criteria

#### Automated Verification

- TypeScript builds without errors: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification

- `/dashboard` shows the existing welcome header + "Generuj fiszki" CTA, then the deck list below.
- Creating a deck via the "+ Nowy zestaw" form adds it to the list without a full page reload.
- Clicking a deck name makes it editable; pressing Enter saves; the rename is reflected immediately (optimistic) and persisted after.
- Pressing Escape during a rename cancels without change.
- Clicking the delete icon opens the modal; the confirm button is disabled until the deck name is typed exactly; confirming removes the deck from the list.
- Sign in as two different users — each user only sees their own decks.

**Pause here for manual confirmation before proceeding to Phase 3.**

---

## Phase 3: Generation Save Flow — Existing-Deck Path

### Overview

Extend `SaveDeckForm` to always show a deck picker where "Nowy zestaw" is the first option, and wire the existing-deck path through `useGeneration` to `POST /api/decks` with a `deckId`.

### Changes Required

#### 1. Save deck schema extension

**File**: `src/lib/schemas/generation.ts`

**Intent**: Allow `POST /api/decks` to accept either `{ name, cards }` (new deck) or `{ deckId, cards }` (existing deck). The discriminated union replaces the current single-shape `SaveDeckRequestSchema`.

**Contract**: Replace `SaveDeckRequestSchema` with a `z.union` (or `z.discriminatedUnion`) of:
- `NewDeckSaveSchema`: `{ name: z.string().min(1).max(200), cards: ProposalSchema.array().min(1) }`
- `ExistingDeckSaveSchema`: `{ deckId: z.string().uuid(), cards: ProposalSchema.array().min(1) }`

Update the `SaveDeckRequest` TypeScript type export to reflect both branches.

---

#### 2. Save form with deck picker

**File**: `src/components/generation/SaveDeckForm.tsx`

**Intent**: Replace the "new deck only" title input with a full deck picker where "Nowy zestaw" is the first list item. Selecting "Nowy zestaw" reveals a name input; selecting any existing deck hides it. Keeps the existing "Zapisz" submit trigger.

**Contract**: Props stay the same as the existing `SaveDeckForm` props (accepted card array + onSave callback). Add internal state: `decks: DeckWithCount[]` (fetched via `GET /api/decks` on mount), `selectedDeckId: string | 'new'` (default `'new'`), `newDeckName: string`. On submit: if `selectedDeckId === 'new'` pass `{ name: newDeckName, cards }` to parent callback; otherwise pass `{ deckId: selectedDeckId, cards }`.

---

#### 3. Generation hook — save to existing deck

**File**: `src/components/hooks/useGeneration.ts`

**Intent**: Update `saveProposals` (or equivalent) to pass the new discriminated union payload to `POST /api/decks`. No other behaviour changes.

**Contract**: The `saveProposals` function currently builds `{ name, cards }`. Change the parameter from `name: string` to `saveTarget: { name: string } | { deckId: string }` and construct the request body accordingly before `fetch('/api/decks', ...)`.

---

### Success Criteria

#### Automated Verification

- TypeScript builds without errors: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification

- On the `/generate` page, after proposals are reviewed and accepted, the save form shows a picker with "Nowy zestaw" first, followed by any existing decks.
- Selecting "Nowy zestaw" shows a name input; entering a name and saving creates a new deck visible on `/dashboard`.
- Selecting an existing deck hides the name input; saving appends accepted cards to that deck — the card count on `/dashboard` increases accordingly.
- The generation flow still ends at `/dashboard` on success (no change to `GenerationFlow.tsx` phase routing).

---

## Testing Strategy

### Manual Testing Steps

1. Create a deck via dashboard "Nowy zestaw" → verify it appears with card count 0.
2. Rename the deck (inline) → verify name change persists after page reload.
3. Run the generation flow; choose an existing deck → verify card count increments on dashboard.
4. Run the generation flow; choose "Nowy zestaw" → verify new deck appears on dashboard.
5. Delete a deck: attempt without typing name (button stays disabled) → type name exactly → confirm → deck gone.
6. Open a second browser session with a different user account → verify decks are isolated.

## References

- Roadmap slice: `context/foundation/roadmap.md` — S-02 (lines 92–102)
- Schema: `supabase/migrations/20260526220447_initial_schema.sql`
- S-01 service conventions: `src/lib/services/decks.ts`
- S-01 hook pattern: `src/components/hooks/useGeneration.ts`
- S-01 save form: `src/components/generation/SaveDeckForm.tsx`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: API Layer

#### Automated

- [x] 1.1 TypeScript build passes after schema + service + API changes — 9c86d2c
- [x] 1.2 Linting passes — 9c86d2c

#### Manual

- [x] 1.3 GET /api/decks returns deck list with card_count — 9c86d2c
- [x] 1.4 POST /api/decks with deckId appends cards to existing deck — 9c86d2c
- [x] 1.5 PATCH /api/decks/:id renames deck — 9c86d2c
- [x] 1.6 DELETE /api/decks/:id removes deck and cascades cards — 9c86d2c
- [x] 1.7 All endpoints return 401 without a valid session — 9c86d2c

### Phase 2: Deck List on Dashboard

#### Automated

- [x] 2.1 TypeScript build passes after dashboard island changes
- [x] 2.2 Linting passes

#### Manual

- [x] 2.3 Dashboard shows welcome header + CTA + deck list
- [x] 2.4 Create deck via "+ Nowy zestaw" form works without page reload
- [x] 2.5 Inline rename saves on Enter, cancels on Escape
- [x] 2.6 Typed-name delete modal prevents premature deletion
- [x] 2.7 Two users see only their own decks

### Phase 3: Generation Save Flow

#### Automated

- [ ] 3.1 TypeScript build passes after SaveDeckForm + hook changes
- [ ] 3.2 Linting passes

#### Manual

- [ ] 3.3 Save form shows deck picker with "Nowy zestaw" first
- [ ] 3.4 Saving to new deck creates it and shows on dashboard
- [ ] 3.5 Saving to existing deck increments its card count on dashboard
