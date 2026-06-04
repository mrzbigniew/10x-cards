# Review Session Modal Implementation Plan

## Overview

Move the review session out of its standalone full page (`/deck/[id]/review.astro`) and into a modal dialog triggered from the deck list. Users stay on the dashboard while completing a full review loop: flip card → rate → session summary → close.

## Current State Analysis

The review session lives at `src/pages/deck/[id]/review.astro`, which mounts `ReviewSession.tsx` client-side. The only entry point is the green Play button on `DeckCard` (`src/components/decks/DeckRow.tsx:24-30`), which is a plain `<a href="/deck/{id}/review">` navigation link.

`ReviewSession.tsx` (108 lines) is a self-contained component that calls `useReviewSession(deckId)` internally and renders three states: loading, active card (flip + RatingButtons), and session summary. Navigation uses `<a>` tags back to the deck or dashboard.

`GenerationModal.tsx` establishes the modal pattern: `createPortal`, `max-w-3xl` container, close guard on dangerous state, Escape key handler, and `CustomEvent` dispatch to notify parent of completion. That same pattern is applied here.

## Desired End State

From the deck list, clicking the Play button on any deck:
- If 0 cards are due: shows a brief toast ("Brak kart na dziś") without opening a modal.
- If cards are due: opens a modal overlay where the full review loop (flip → rate → again-requeue) runs to completion; the summary screen stays until the user clicks "Zamknij" or presses Escape; the deck list refreshes in place.

Closing the modal mid-session (when at least one card has been rated) shows a guard dialog ("Zamknąć sesję? Postęp zostanie utracony.").

The standalone review page (`/deck/[id]/review.astro`) is deleted.

### Key Discoveries

- `useReviewSession.ts:94-111` returns `{ loading, error, current, remaining, reviewedCount, againCount, totalInitial, finished, showAnswer, submitting, reveal, rate }` — all values needed by the presenter.
- `finished` is a computed value: `!loading && queue.length === 0`. There is no explicit reset; the hook refetches on mount (tied to `deckId`).
- `DeckCard` in `DeckRow.tsx` already uses the optional-callback pattern for `onGenerateRequest` (line 31-41) — `onReviewRequest` should follow the exact same shape.
- `DeckList.tsx:14-24` already wires a `deck-saved` CustomEvent listener calling `refresh()`. The `session-completed` listener follows the same pattern.
- `GenerationModal.tsx:61-71` renders a success toast via `createPortal` at `z-[60]`. The zero-due toast follows the same technique.

## What We're NOT Doing

- Adding a review entry point on the Deck Detail page (`DeckDetail.tsx`) — roadmap S-08 scope is deck list only.
- Adding number-key shortcuts (1–4) for ratings during review.
- Keeping the standalone review page as a parallel path — it is retired in Phase 3.
- Pre-passing fetched cards to the modal to avoid double-fetch — the double-fetch is acceptable for simplicity.

## Implementation Approach

Three sequential phases:

1. **Presenter refactor + ReviewModal** — decouple `ReviewSession` from its hook; create the modal wrapper.
2. **DeckList integration** — wire the zero-due pre-check, modal mount, refresh listener, and toast.
3. **Route retirement** — delete the standalone page.

Phases 1 and 2 can be reviewed independently. Phase 3 is the final cleanup step, safe only after Phase 2 is confirmed working.

## Critical Implementation Details

**Hook lifecycle**: `ReviewModal` must be conditionally mounted in DeckList (`{reviewingDeck && <ReviewModal …/>}`) rather than always-mounted with an `isOpen` prop. `useReviewSession` fetches due cards on mount via `useEffect([deckId])`; always-mounted would fire a stale fetch before a deck is selected. Conditional mount means the hook is always fresh per session.

**`session-completed` dispatch timing**: The `finished` flag is computed (`!loading && queue.length === 0`). Dispatch the CustomEvent in a `useEffect([finished])` inside `ReviewModal`, guarded by `reviewedCount > 0` to avoid firing on the zero-due edge-case path.

**Zero-due pre-check**: DeckList computes `endOfDay` identically to the hook — `new Date()` set to `23:59:59.999` local time — so the pre-check and the hook agree on "due before".

---

## Phase 1: ReviewSession Presenter Refactor + ReviewModal

### Overview

Decouple `ReviewSession.tsx` from `useReviewSession` so it becomes a pure display component (presenter). Create `ReviewModal.tsx` that owns the hook and manages the modal overlay, close guard, Escape key, and `session-completed` event.

### Changes Required

#### 1. Refactor `ReviewSession.tsx` to presenter

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Remove the internal `useReviewSession` call. Accept all session state and actions as props plus an optional `onClose` callback. Replace `<a href>` navigation tags with `onClose?.()` invocations. This leaves the component purely declarative.

**Contract**: New Props interface:

```ts
interface Props {
  loading: boolean;
  error: string | null;
  current: DueCard | null;
  remaining: number;
  reviewedCount: number;
  againCount: number;
  totalInitial: number;
  finished: boolean;
  showAnswer: boolean;
  submitting: boolean;
  reveal: () => void;
  rate: (rating: 1 | 2 | 3 | 4) => void;
  onClose?: () => void;
}
```

- Add `import type { DueCard } from "@/lib/services/sr"` (already transitively available but must be explicit after removing the hook import).
- In the active-card view, remove the `← Wróć` anchor (the modal's X button serves as close). Keep the "Pozostało: {remaining + 1}" counter.
- In the `finished && totalInitial === 0` (zero-due fallback) state, replace the `<a href>` back-link with a `<button onClick={onClose}>Zamknij</button>`.
- In the session-summary (`finished`) state, replace both `<a href>` links ("← Powrót do zestawu" and "Pulpit") with a single `<button onClick={onClose}>Zamknij</button>`.

#### 2. Create `ReviewModal.tsx`

**File**: `src/components/review/ReviewModal.tsx`

**Intent**: Modal container that owns `useReviewSession`, renders the `ReviewSession` presenter inside a `createPortal` overlay, and handles close lifecycle (guard, Escape, `session-completed` dispatch).

**Contract**: Props `{ deckId: string; onClose: () => void }`. Key behaviors:

- **Close guard**: show when `reviewedCount > 0 && !finished` — dialog text "Zamknąć sesję? Postęp zostanie utracony.", buttons "Anuluj" (dismiss guard) and "Zamknij" (confirm → `onClose()`).
- **Escape key**: `window.addEventListener('keydown', …)` while mounted; calls `handleCloseRequest`.
- **Session complete**: `useEffect([finished])` inside the modal dispatches `window.dispatchEvent(new CustomEvent('session-completed'))` when `finished === true && reviewedCount > 0`.
- **Summary close**: pass `onClose` as `onClose` prop to `ReviewSession`; the presenter's "Zamknij" button calls it directly.
- **Modal sizing**: `max-w-2xl` (matching the former review page's `max-w-2xl` container), `maxHeight: "90vh"`, `overflow-y-auto` body.
- **Title**: "Powtórka" in the sticky header.
- X button in header calls `handleCloseRequest`.

### Success Criteria

#### Automated Verification

- Type check passes: `npm run typecheck`
- Lint passes: `npm run lint`

#### Manual Verification

- `ReviewSession` renders correctly when all props are supplied directly (smoke test in isolation is fine; full end-to-end covered in Phase 2).
- `ReviewModal` mounts in DOM via portal (visible in DevTools under `<body>`).
- Close guard dialog appears when `reviewedCount > 0 && !finished`; does NOT appear when 0 cards reviewed or session already finished.
- Escape key triggers the close guard path (guard or direct close depending on state).
- `session-completed` CustomEvent fires in DevTools Event Listener when session finishes naturally.

**Implementation Note**: After Phase 1 automated checks pass, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: DeckList Entry Point + Zero-Due Toast

### Overview

Update `DeckCard` to call a callback instead of navigating, then wire the callback in `DeckList` with a zero-due pre-check, modal mount, refresh listener, and toast display.

### Changes Required

#### 1. Update `DeckCard` in `DeckRow.tsx`

**File**: `src/components/decks/DeckRow.tsx`

**Intent**: Convert the Play button from a navigation link to a callback button, following the same optional-callback pattern already used by `onGenerateRequest`.

**Contract**: Add `onReviewRequest?: (deck: DeckWithCount) => void` to the Props interface (line 4-9). When `onReviewRequest` is defined, render Play as `<button onClick={() => onReviewRequest(deck)}>` with the same visual styling (green, `title="Powtórz"`). When `onReviewRequest` is undefined, keep the `<a href>` as a fallback (matches the `onGenerateRequest` pattern). In Phase 3, after the review page is deleted, the fallback `<a href>` can be removed.

#### 2. Update `DeckList.tsx`

**File**: `src/components/decks/DeckList.tsx`

**Intent**: Add the review session flow: zero-due pre-check on Play click, conditional `ReviewModal` mount, `session-completed` refresh listener, and zero-due toast.

**Contract**:

- Import `ReviewModal` from `@/components/review/ReviewModal`.
- Add state `reviewingDeck: DeckWithCount | null` (null = modal closed).
- Add state `zeroDueToast: boolean` with a `useEffect` that auto-dismisses it after 3 s (same timer pattern as `GenerationModal:18-26`).
- Add `handleReviewRequest(deck: DeckWithCount)` async function:
  1. Compute `endOfDay` (new Date set to 23:59:59.999).
  2. Fetch `GET /api/decks/${deck.id}/review?due_before=${encodeURIComponent(endOfDay.toISOString())}`.
  3. If response cards array is empty: `setZeroDueToast(true)`; return.
  4. Otherwise: `setReviewingDeck(deck)`.
- Add `session-completed` CustomEvent listener (alongside the existing `deck-saved` listener) that calls `refresh()`.
- Pass `onReviewRequest={handleReviewRequest}` to each `DeckCard` (line 101-108).
- Conditionally mount the modal: `{reviewingDeck && <ReviewModal deckId={reviewingDeck.id} onClose={() => setReviewingDeck(null)} />}` (placed alongside the other modal renders, after the `GenerationModal`).
- Render zero-due toast via `createPortal` when `zeroDueToast` is true — same fixed bottom-right pattern as `GenerationModal:61-71`, text: "Brak kart na dziś".

### Success Criteria

#### Automated Verification

- Type check passes: `npm run typecheck`
- Lint passes: `npm run lint`

#### Manual Verification

- Play button on DeckCard opens modal for a deck that has due cards.
- Play button shows toast ("Brak kart na dziś") and modal does NOT open for a deck with no due cards. Toast auto-dismisses after ~3 s.
- Full review loop works in modal: flip → rate (all four ratings) → again-requeue → session summary.
- "Zamknij" button on session summary closes the modal.
- Deck list refreshes in place after session completes (deck cards update).
- Mid-session close (after rating ≥1 card): guard dialog appears; "Anuluj" dismisses guard; "Zamknij" closes modal.
- No guard dialog when closing from summary screen or before any card has been rated.
- Escape key triggers close guard during active review.
- Re-opening the modal for the same deck starts a fresh session (no stale state).
- No navigation away from the deck list occurs at any point.

**Implementation Note**: After Phase 2 automated checks pass, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Route Retirement

### Overview

Delete the now-unused standalone review page and remove the stale `<a href>` fallback from `DeckCard`.

### Changes Required

#### 1. Delete standalone review page

**File**: `src/pages/deck/[id]/review.astro`

**Intent**: Remove the file. The route `/deck/{id}/review` will return 404 after deletion. Since Phase 2 replaced the only entry point, no user path reaches this URL.

#### 2. Remove `<a href>` fallback from `DeckCard`

**File**: `src/components/decks/DeckRow.tsx`

**Intent**: Remove the `<a href="/deck/{id}/review">` fallback branch added in Phase 2. Make `onReviewRequest` required (remove the `?` from the prop type) and render only the `<button>` path. This eliminates the last reference to the retired route.

#### 3. Verify no dangling references

**Files**: `src/**/*.{ts,tsx,astro}`

**Intent**: Grep for any remaining `/review` references (links, redirects, tests) and remove or update them.

**Contract**: `grep -r "deck/\[id\]/review\|/review" src/` should return only API route files (`src/pages/api/decks/[id]/review.ts`, `src/pages/api/decks/[id]/review/[cardId].ts`) and internal `useReviewSession.ts` fetch calls — no page imports, nav links, or Astro routes.

### Success Criteria

#### Automated Verification

- Type check passes: `npm run typecheck`
- Lint passes: `npm run lint`
- No TypeScript import errors for the deleted `.astro` file.

#### Manual Verification

- Direct navigation to `/deck/{someId}/review` URL returns 404 in the browser.
- No broken links visible anywhere in the app (deck list, deck detail, header).
- Full happy-path smoke test: deck list → Play → review session in modal → Zamknij → back on deck list.

---

## Testing Strategy

### Unit Tests

None planned — the logic layers (`useReviewSession`, `sr.ts`, API routes) are unchanged. Presenter refactor is pure prop-threading with no logic change.

### Integration Tests

None planned in this slice.

### Manual Testing Steps

1. Open dashboard with at least one deck that has due cards.
2. Click Play on a deck with due cards → modal opens.
3. Flip first card → answer revealed → rate "Dobra" → next card appears (or session ends if only 1 card).
4. Mid-session: click X button → guard dialog appears → "Anuluj" → session continues.
5. Mid-session: press Escape → guard dialog appears → "Zamknij" → modal closes → deck list visible.
6. Complete a session: rate all cards → summary screen with counts.
7. Click "Zamknij" on summary → modal closes → deck list visible and refreshed.
8. Click Play on a deck with 0 due cards → toast appears, modal does not open → toast disappears after ~3 s.
9. Open modal → complete session → re-open same deck → fresh session (no stale state from previous session).
10. Navigate to `/deck/{id}/review` directly → 404 page (Phase 3).

## Performance Considerations

The zero-due pre-check adds one extra API call before opening the modal. This call is lightweight (returns a JSON array of due cards, same endpoint as the hook). The subsequent double-fetch inside `useReviewSession` is acceptable given the small payload size.

## Migration Notes

No database changes. No new API endpoints. Existing `useReviewSession` hook and both API routes (`review.ts`, `review/[cardId].ts`) are untouched.

## References

- Similar implementation: `src/components/generation/GenerationModal.tsx` (modal pattern)
- Hook: `src/components/hooks/useReviewSession.ts`
- Presenter target: `src/components/review/ReviewSession.tsx`
- Entry point: `src/components/decks/DeckRow.tsx:24-30` (Play button)
- Parent: `src/components/decks/DeckList.tsx:100-108` (DeckCard render loop)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: ReviewSession Presenter Refactor + ReviewModal

#### Automated

- [x] 1.1 Type check passes: `npm run typecheck` — 089ba61
- [x] 1.2 Lint passes: `npm run lint` — 089ba61

#### Manual

- [x] 1.3 ReviewModal mounts in DOM via portal (visible in DevTools under `<body>`) — 089ba61
- [x] 1.4 Close guard dialog appears only when `reviewedCount > 0 && !finished` — 089ba61
- [x] 1.5 Escape key triggers close guard path — 089ba61
- [x] 1.6 `session-completed` CustomEvent fires when session finishes naturally — 089ba61

### Phase 2: DeckList Entry Point + Zero-Due Toast

#### Automated

- [x] 2.1 Type check passes: `npm run typecheck` — a0ef85d
- [x] 2.2 Lint passes: `npm run lint` — a0ef85d

#### Manual

- [x] 2.3 Play button opens modal for deck with due cards — a0ef85d
- [x] 2.4 Play button shows toast (no modal) for deck with 0 due cards; toast auto-dismisses — a0ef85d
- [x] 2.5 Full review loop works in modal (flip → rate all four ratings → again-requeue → summary) — a0ef85d
- [x] 2.6 "Zamknij" on summary closes the modal — a0ef85d
- [x] 2.7 Deck list refreshes after session completes — a0ef85d
- [x] 2.8 Mid-session close guard works; "Anuluj" resumes session; "Zamknij" closes modal — a0ef85d
- [x] 2.9 No guard when closing from summary or before first card rated — a0ef85d
- [x] 2.10 Re-opening modal starts a fresh session (no stale state) — a0ef85d

### Phase 3: Route Retirement

#### Automated

- [x] 3.1 Type check passes: `npm run typecheck`
- [x] 3.2 Lint passes: `npm run lint`

#### Manual

- [x] 3.3 `/deck/{id}/review` URL returns 404 in browser
- [x] 3.4 No broken links visible in app
- [x] 3.5 Full happy-path smoke test: deck list → Play → session → Zamknij → back on deck list
