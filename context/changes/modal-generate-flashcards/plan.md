# Modal: Generate Flashcards (S-07) Implementation Plan

## Overview

Move the AI flashcard generation flow from the standalone `/generate` page into a modal dialog that can be opened from three entry points: the dashboard hero CTA, a per-deck action button on the deck list, and the deck detail page. After saving, the modal auto-dismisses after 1.5 s and the deck list refreshes in place via a custom DOM event. The `/generate` route is removed (redirects to `/dashboard`).

## Current State Analysis

- **Generation flow** lives at `src/pages/generate.astro` (full-page route) and is driven by a self-contained `<GenerationFlow client:load />` component that calls `useGeneration()` internally.
- **`useGeneration`** (`src/components/hooks/useGeneration.ts`) is a phase-state machine: `input → generating → reviewing → saving → done`. It has no `reset()` and dispatches no events.
- **Only one entry point** exists today: `dashboard.astro:24` — a plain `<a href="/generate">` link.
- **Modal infrastructure** is hand-rolled across the codebase (`DeleteDeckModal`, `CreateDeckModal`, `ResetProgressModal` — all use the same `fixed inset-0 z-50` + `max-w-md rounded-2xl` pattern). No shadcn Dialog/Sheet installed.
- **`useDeckList`** has a `refresh()` function internally but does not expose it to callers.
- **`DeckCard`** (`src/components/decks/DeckRow.tsx`) has three action buttons: Play (review), RotateCcw (reset), Trash2 (delete). No generate action.
- **`DeckDetail`** (`src/components/DeckDetail.tsx`) has one action button: "+ Dodaj fiszkę".

## Desired End State

The user can open the flashcard generation modal from:
1. The dashboard hero "Generuj fiszki z AI" CTA (no longer a page link).
2. A new Sparkles icon button on each `DeckCard` in the deck list.
3. A "Generuj z AI" button on the deck detail page alongside "+ Dodaj fiszkę".

When opened from a deck context (2 or 3), that deck is pre-selected in `SaveDeckForm`. After saving, a brief ✓ screen is shown for 1.5 s, the modal auto-closes, and the deck list refreshes without a page reload. Closing during the `reviewing` phase shows an inline confirmation. The `/generate` page redirects to `/dashboard`.

### Key Discoveries

- `GenerationFlow:6` calls `useGeneration()` directly — must be refactored into a presenter so `GenerationModal` can own the hook and access `phase` for the close guard.
- `SaveDeckForm:15` initialises `selectedDeckId` to `"new"` — a `preselectedDeckId` prop changes this initial value.
- `useDeckList:12` already has `refresh()` via `refreshKey` increment — just not returned; expose it.
- All existing modals use `max-w-md`; the generation modal needs `max-w-3xl` to accommodate the proposal list.
- `GenerationFlow:26–31` (done phase) currently renders a "Przejdź do panelu" anchor — replaced by the `onDone` auto-dismiss callback in modal context.

## What We're NOT Doing

- Installing shadcn Dialog, Sheet, or Drawer — the hand-rolled `fixed inset-0` pattern is used consistently.
- Adding keyboard shortcut / floating action button triggers.
- Persisting draft state across modal open/close cycles — state resets on close.
- Changing the generation API, prompt, or AI service.
- Adding a generate action to the Topbar (it would require making the Astro component a React island).
- Keeping the `generate.astro` page as a working route — it becomes a redirect.

## Implementation Approach

`GenerationModal` owns the `useGeneration` hook so it can read `phase` for the close guard and call `reset()` on close. `GenerationFlow` is refactored into a pure presenter that receives all hook values as props. Three entry-point changes wire `GenerationModal` into the three locations. `useDeckList` exposes `refresh`, and `DeckList` listens for a `'deck-saved'` CustomEvent dispatched by `useGeneration` after a successful save.

## Critical Implementation Details

**Hook ownership shift** — `GenerationFlow` currently calls `useGeneration()` itself. After this change it receives all hook values as props. The caller (`GenerationModal`) owns the hook instance, so `reset()` and `phase` are available at the modal level without prop drilling or context.

**State reset timing** — `reset()` must be called before `onClose()` fires, so the modal re-opens with a clean `input` state regardless of how it was previously closed.

**`deck-saved` event and listener** — the event is dispatched inside `useGeneration.saveProposals` immediately after `setPhase('done')`. `DeckList` adds the listener in a `useEffect` and calls the `refresh` function returned by `useDeckList`. The listener uses the stable `refresh` reference so the effect dependency array is correct.

---

## Phase 1: Core Modal + Hook Refactor

### Overview

Refactor `GenerationFlow` into a presenter, add `reset()` + event dispatch to `useGeneration`, create `GenerationModal` with the scrollable shell and close guard, and thread `preselectedDeckId` into `SaveDeckForm`. After this phase the modal component exists and can be manually rendered; nothing opens it yet.

### Changes Required

#### 1. Dispatch `deck-saved` event and add `reset()` to hook

**File**: `src/components/hooks/useGeneration.ts`

**Intent**: After a successful save (`setPhase('done')`), dispatch `window.dispatchEvent(new CustomEvent('deck-saved'))` so `DeckList` can re-fetch without a page reload. Add a `reset` callback that clears all state back to the initial `input` phase so the modal can reuse the hook across open/close cycles.

**Contract**: `reset: () => void` is added to the hook's return object. The `CustomEvent` is dispatched synchronously after `setPhase('done')` inside `saveProposals`. No new parameters are introduced.

#### 2. Refactor `GenerationFlow` into a presenter

**File**: `src/components/generation/GenerationFlow.tsx`

**Intent**: Remove the internal `useGeneration()` call and accept all hook values as explicit props. Add two optional new props: `onDone?: () => void` (auto-dismiss callback) and `preselectedDeckId?: string` (forwarded to `SaveDeckForm`). When `phase === 'done'` and `onDone` is provided, a `useEffect` fires a 1.5 s `setTimeout` that calls `onDone()`, replacing the "Przejdź do panelu" link.

**Contract**: New `Props` interface mirrors the `useGeneration` return type (`phase`, `text`, `setText`, `proposals`, `errorMessage`, `generate`, `updateProposal`, `bulkAccept`, `bulkReject`, `saveProposals`) plus `onDone?` and `preselectedDeckId?`. The `done` branch: when `onDone` is provided, render the ✓ screen without the anchor link; when `onDone` is absent (legacy path — unused after route removal), keep the anchor. The timer cleanup `return () => clearTimeout(timer)` must be included.

#### 3. Thread `preselectedDeckId` into `SaveDeckForm`

**File**: `src/components/generation/SaveDeckForm.tsx`

**Intent**: Accept an optional `preselectedDeckId` prop and use it as the initial value of `selectedDeckId` state, so the form opens with that deck already selected rather than "Nowy zestaw".

**Contract**: Add `preselectedDeckId?: string` to the `Props` interface. Change `useState<string>("new")` to `useState<string>(preselectedDeckId ?? "new")`. No other logic changes — the dropdown already handles existing IDs correctly once populated from `/api/decks`.

#### 4. Create `GenerationModal`

**File**: `src/components/generation/GenerationModal.tsx` _(new)_

**Intent**: Full modal shell: fixed overlay backdrop, sticky title header with a close (×) button, scrollable content body containing `<GenerationFlow>`, and an inline close-guard bar. Owns the `useGeneration` hook instance.

**Contract**:
```
Props: { isOpen: boolean; onClose: () => void; preselectedDeckId?: string }
```
Internal state: `showCloseGuard: boolean`.

Layout structure (Tailwind classes follow the existing modal pattern):
- Outer: `fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm` (returns `null` when `!isOpen`)
- Inner: `flex w-full max-w-3xl flex-col rounded-2xl border border-border bg-card shadow-xl` with `max-h-[90vh]`
- Header (non-scrolling): `flex items-center justify-between border-b border-border px-6 py-4` — title "Generuj fiszki z AI" + × `<button>`
- Body: `flex-1 overflow-y-auto p-6` — renders `<GenerationFlow {...generation} onDone={handleDone} preselectedDeckId={preselectedDeckId} />`
- Close guard (conditional, replaces body or appears as footer): shown only when `showCloseGuard`. Renders "Zamknąć? Niezapisane zmiany zostaną utracone." + "Anuluj" + "Zamknij" buttons.

`handleCloseRequest`: if `phase === 'reviewing'` → `setShowCloseGuard(true)`; else → `reset(); onClose()`.
`handleConfirmClose`: `reset(); setShowCloseGuard(false); onClose()`.
`handleDone`: `reset(); onClose()` (called 1.5 s after save, from `GenerationFlow`'s `useEffect`).
Escape key: `useEffect` adds/removes `keydown` listener on `isOpen`; calls `handleCloseRequest`.

### Success Criteria

#### Automated Verification

- TypeScript compilation passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- Import `GenerationModal` in a test harness (or temporarily in `dashboard.astro`) with `isOpen={true}` and confirm the modal renders with the correct scrollable layout.
- Confirm the × button opens the close guard when `phase === 'reviewing'` (advance to reviewing by entering text and clicking generate).
- Confirm Escape key triggers the same close guard in reviewing phase.
- Confirm the ✓ screen appears for ~1.5 s then the modal closes after a successful save.
- Confirm state resets on re-open (text input is empty, phase is `input`).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2.

---

## Phase 2: Dashboard + DeckList Entry Points

### Overview

Add a `GenerateButton` React island to the dashboard hero, add a Sparkles action to `DeckCard`, and wire `GenerationModal` into `DeckList` (with deck-list refresh on `deck-saved`). After this phase two of the three entry points are live.

### Changes Required

#### 1. Create `GenerateButton` island

**File**: `src/components/GenerateButton.tsx` _(new)_

**Intent**: Thin React island for the dashboard: manages `isOpen` state, renders the styled "Generuj fiszki z AI" button, and owns a `<GenerationModal>` with no `preselectedDeckId`.

**Contract**: No props. The button uses the same gradient styling currently in `dashboard.astro:25` — copy the `className` verbatim. Renders: a `<button onClick={() => setIsOpen(true)}>` (with Sparkles icon + label) and `<GenerationModal isOpen={isOpen} onClose={() => setIsOpen(false)} />`.

#### 2. Replace the dashboard CTA link with `GenerateButton`

**File**: `src/pages/dashboard.astro`

**Intent**: Swap the `<a href="/generate">` anchor (lines 23–29) for `<GenerateButton client:load />`.

**Contract**: Remove the `import { Sparkles }` line (now inside `GenerateButton.tsx`). Add `import GenerateButton from "@/components/GenerateButton"`. Replace the entire `<a …>…</a>` block with `<GenerateButton client:load />`.

#### 3. Add Sparkles action button to `DeckCard`

**File**: `src/components/decks/DeckRow.tsx`

**Intent**: Add an optional `onGenerateRequest?: (deck: DeckWithCount) => void` prop. When provided, render a Sparkles icon button in the action row — placed between the Play (Powtórz) and RotateCcw (Resetuj) buttons.

**Contract**: Import `Sparkles` from `lucide-react`. The button: `title="Generuj fiszki"`, same `rounded-lg p-2` pattern as the other actions, `text-purple-500` color. The button only renders when `onGenerateRequest` is defined (use `&&` guard). The prop is optional so existing usages without it continue to compile.

#### 4. Expose `refresh` from `useDeckList` and add `deck-saved` event listener

**File**: `src/components/hooks/useDeckList.ts`

**Intent**: Add `refresh` to the hook's return object so `DeckList` can call it externally (e.g. from an event handler).

**Contract**: Change `return { decks, loading, error, createDeck, deleteDeck, resetDeckProgress }` to include `refresh`.

**File**: `src/components/decks/DeckList.tsx`

**Intent**: Destructure `refresh` from `useDeckList`, listen for the `'deck-saved'` CustomEvent on `window`, call `refresh()` when it fires. Also add `generatingDeck` state and pass `onGenerateRequest` to each `DeckCard`, rendering a `<GenerationModal>` when `generatingDeck` is set.

**Contract**: 
- New state: `const [generatingDeck, setGeneratingDeck] = useState<DeckWithCount | null>(null)`.
- Add `useEffect` that adds/removes a `'deck-saved'` listener on `window`; listener calls `refresh()`. Dependency array: `[refresh]`.
- Each `<DeckCard>` receives `onGenerateRequest={setGeneratingDeck}`.
- After the existing `<ResetProgressModal>` render, add:
  ```tsx
  <GenerationModal
    isOpen={generatingDeck !== null}
    onClose={() => setGeneratingDeck(null)}
    preselectedDeckId={generatingDeck?.id}
  />
  ```

### Success Criteria

#### Automated Verification

- TypeScript compilation passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- Dashboard hero "Generuj fiszki z AI" opens the modal (no page navigation).
- Each deck card shows a Sparkles button in its action row.
- Opening the modal from a DeckCard shows that deck pre-selected in `SaveDeckForm`.
- After saving from the dashboard modal, the deck list refreshes and the new deck appears without a page reload.
- After saving from a DeckCard modal, the deck's card count updates.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 3.

---

## Phase 3: DeckDetail Entry Point + Route Cleanup

### Overview

Add the "Generuj z AI" button to the deck detail page and redirect `/generate` to `/dashboard`. After this phase all three entry points are live and the old route is gone.

### Changes Required

#### 1. Add generation modal to `DeckDetail`

**File**: `src/components/DeckDetail.tsx`

**Intent**: Add `showGenerationModal` state and a "Generuj z AI" button beside the existing "+ Dodaj fiszkę" button. Render `<GenerationModal>` with the current `deckId` pre-selected.

**Contract**: New state: `const [showGenerationModal, setShowGenerationModal] = useState(false)`. The new button sits in the `flex items-center justify-between` row alongside "+ Dodaj fiszkę", to the left of it. Styling: same `rounded-lg border border-purple-500/40 bg-purple-600/20 px-3 py-1.5 text-xs font-medium text-purple-600` pattern as the existing button, label "Generuj z AI" with a Sparkles icon. Add `<GenerationModal isOpen={showGenerationModal} onClose={() => setShowGenerationModal(false)} preselectedDeckId={deckId} />` after `<AddCardModal>`.

**Note on deck list refresh from DeckDetail**: After saving in the DeckDetail modal, `deck-saved` fires. `DeckList` (on the dashboard) is not mounted, so the event has no effect — that is correct and expected. The user navigates to `/dashboard` next and sees the updated list on mount.

#### 2. Redirect `/generate` to `/dashboard`

**File**: `src/pages/generate.astro`

**Intent**: Remove the generation page content and return a permanent redirect so any bookmarked or linked `/generate` URLs land gracefully on the dashboard.

**Contract**: Replace the entire file contents with:
```astro
---
return Astro.redirect("/dashboard", 301);
---
```

### Success Criteria

#### Automated Verification

- TypeScript compilation passes: `npm run typecheck`
- Linting passes: `npm run lint`
- `GET /generate` (in dev or preview) returns a 301 redirect to `/dashboard`.

#### Manual Verification

- On the deck detail page, "Generuj z AI" button appears to the left of "+ Dodaj fiszkę".
- Opening the modal from deck detail shows the current deck pre-selected in `SaveDeckForm`.
- After saving, the modal auto-closes; navigating to the dashboard shows the updated deck count.
- Visiting `/generate` in the browser redirects to `/dashboard`.
- No regression: "+ Dodaj fiszkę" still opens `AddCardModal` correctly.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests

- None required for this slice (test suite not yet introduced; Module 3 scope).

### Manual Testing Steps

1. Open dashboard — confirm hero CTA opens the generation modal (not a page navigation).
2. Enter text, generate proposals, review and accept some, save — confirm ✓ screen appears ~1.5 s then modal closes; deck list gains the new deck without reload.
3. Open the modal from a DeckCard Sparkles button — confirm pre-selected deck in save form.
4. Close mid-reviewing (× or Escape) — confirm inline "Zamknąć?" guard appears; cancel returns to reviewing; confirm close resets to empty input on next open.
5. Open the modal from deck detail "Generuj z AI" — confirm correct deck pre-selected.
6. Visit `/generate` in browser — confirm 301 redirect to `/dashboard`.
7. Confirm all existing deck actions (play, reset, delete, add card) still work.
8. Test on a viewport ≤ 768 px height — confirm proposal list scrolls inside the modal and save button remains visible.

## Performance Considerations

No new API calls are introduced. `SaveDeckForm` fetches `/api/decks` (same call as before) on mount within the modal — this is a pre-existing pattern. The `deck-saved` CustomEvent is synchronous and O(1).

## Migration Notes

No data migration. The `/generate` route is replaced with a 301 redirect; no client-side code references the URL directly after this change (the dashboard link is removed in Phase 2).

## References

- Roadmap entry: `context/foundation/roadmap.md` (S-07, line 40)
- Existing modal pattern: `src/components/decks/DeleteDeckModal.tsx`
- Generation hook: `src/components/hooks/useGeneration.ts`
- Generation flow: `src/components/generation/GenerationFlow.tsx`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Core Modal + Hook Refactor

#### Automated

- [x] 1.1 TypeScript compilation passes: `npm run typecheck` — 608546a
- [x] 1.2 Linting passes: `npm run lint` — 608546a

#### Manual

- [x] 1.3 Modal renders with scrollable layout when `isOpen={true}` — 608546a
- [x] 1.4 × button shows close guard during reviewing phase — 608546a
- [x] 1.5 Escape key triggers close guard in reviewing phase — 608546a
- [x] 1.6 ✓ screen appears ~1.5 s then modal closes after successful save — 608546a
- [x] 1.7 State resets on re-open (text empty, phase `input`) — 608546a

### Phase 2: Dashboard + DeckList Entry Points

#### Automated

- [x] 2.1 TypeScript compilation passes: `npm run typecheck`
- [x] 2.2 Linting passes: `npm run lint`

#### Manual

- [x] 2.3 Dashboard hero CTA opens modal (no page navigation)
- [x] 2.4 Each DeckCard shows Sparkles action button
- [x] 2.5 Modal from DeckCard pre-selects originating deck
- [x] 2.6 Deck list refreshes in place after saving (new deck appears without reload)
- [x] 2.7 Saving from DeckCard modal updates card count

### Phase 3: DeckDetail Entry Point + Route Cleanup

#### Automated

- [ ] 3.1 TypeScript compilation passes: `npm run typecheck`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 `GET /generate` returns 301 redirect to `/dashboard`

#### Manual

- [ ] 3.4 "Generuj z AI" button appears on deck detail page
- [ ] 3.5 Modal from deck detail pre-selects the current deck
- [ ] 3.6 After saving from deck detail, dashboard shows updated deck count
- [ ] 3.7 `/generate` redirects to `/dashboard` in browser
- [ ] 3.8 "+ Dodaj fiszkę" still works (no regression)
