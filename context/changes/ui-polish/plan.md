# UI Polish Implementation Plan

## Overview

Implement S-06 (ui-polish) across five changes: a fully reworked shared header with brand mark and dark/light toggle; a replaced dashboard intro with a "+" deck card in the deck grid; a per-deck bulk SR-reset action behind a confirmation modal; a 3D flip-card review UX with click-to-reveal; and migration of the core surfaces (header, dashboard, deck list) to CSS-variable-based Tailwind classes so the dark/light toggle has a real visual effect.

## Current State Analysis

- `src/components/Topbar.astro` — renders email on the left and three links on the right ("Dashboard", "Generuj fiszki", "Sign out"). No brand mark. All classes use hardcoded opacity tokens (`bg-white/5`, `border-white/10`).
- `src/pages/dashboard.astro` — shows a welcome card (heading, user email, "Generuj fiszki z AI" button, sign-out form). `DeckList` is rendered below with `client:load`.
- `src/components/decks/DeckList.tsx` — has a "+ Nowy zestaw" button in the section header and an inline create form that collapses in/out. Deck grid uses `grid-cols-[repeat(auto-fill,minmax(360px,1fr))]`.
- `src/components/decks/DeckRow.tsx` — named `DeckCard`; has a manual three-dot SVG dropdown with "Review" / "Edit" / "Delete" items. All colors are hardcoded opacity tokens.
- `src/lib/services/cards.ts:52` — `resetCardSRState(supabase, userId, cardId)` resets a single card's SR state. No batch variant exists.
- `src/components/review/ReviewSession.tsx` — instant reveal: clicking "Show answer" button immediately shows the back and rating buttons. No animation.
- `src/components/review/RatingButtons.tsx:8-21` — labels "Again / Hard / Good / Easy" (English).
- `src/layouts/Layout.astro` — `<html lang="en">`, no `.dark` class or initialization script.
- `src/styles/global.css` — dark mode CSS variables already defined (`.dark` selector, OKLCH palette), `@custom-variant dark (&:is(.dark *))`, body already `@apply bg-background text-foreground`. The `@utility bg-cosmic` produces a hardcoded dark gradient. No localStorage wiring exists.

## Desired End State

Every page shows a branded header with a lucide icon + "10xCards" linking to `/dashboard`, visible "Generuj fiszki" and "Wyloguj" actions, and a sun/moon toggle that persists the theme in localStorage (defaults to OS preference). The dashboard shows a short Polish intro paragraph followed by the deck grid; the grid contains a "+" card that opens a modal to create a new deck. Each deck card's dropdown includes "Resetuj postępy" guarded by a confirmation modal showing the affected card count. The review card flips in 3D on click; rating buttons ("Raz jeszcze / Trudna / Dobra / Łatwa") appear only after the flip animation completes. Light mode renders a subtle lavender-blue gradient background and light card surfaces throughout the header, dashboard, and deck list.

### Key Discoveries

- `tw-animate-css` is already imported in `global.css:2` — flip animation CSS can be added there without a new package.
- `@custom-variant dark (&:is(.dark *))` means `.dark` must be set on an ancestor (e.g. `<html>`). An inline `<script is:inline>` in `<head>` before CSS prevents FOUC.
- `DeckWithCount` (from `src/lib/services/decks.ts`) already includes `card_count` — the confirmation modal can show the count without an extra API call.
- `card_sr_state` has `card_id` + `user_id` but no `deck_id`; the batch reset therefore needs two DB calls: fetch card IDs for the deck, then batch-update `card_sr_state` where `card_id IN (...)`.
- The flip card's back face must always be in the DOM (for the 3D transform to work). `showAnswer` state is reset to false after rating (line 84 of `useReviewSession.ts`), which naturally drives the `flipped` reset via a `useEffect` on `current?.id`.

## What We're NOT Doing

- Migrating the generate page (`/generate`), deck-detail page (`/deck/[id]`), or auth pages to CSS variables — those are S-07 scope.
- Adding purple CSS variables to the design token set — purple accents keep their hardcoded classes (they are used in interactive elements and look fine in both modes with the migrations described).
- Changing the SR algorithm or review logic — Phase 4 is purely visual + labeling.
- Adding undo to the bulk reset — it is intentionally irreversible (roadmap spec).
- Moving S-07 Polish localization into this slice — only the English strings in the five directly-modified components are fixed here.

## Implementation Approach

Phases are ordered by dependency: the theme foundation (Phase 1) must land before any surface migration makes sense. Phase 2 (dashboard + "+" card) and Phase 3 (bulk reset) are independent and could run in parallel, but are sequenced here for simplicity. Phase 4 (flip card) is fully independent of Phases 2–3.

## Critical Implementation Details

**Dark mode FOUC prevention** — Layout.astro must include an `is:inline` script in `<head>` that runs before CSS loads:
```js
(function () {
  const s = localStorage.getItem('theme');
  const dark = s ? s === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
})();
```
Without this, the page flashes light-on-dark before React hydrates.

**Flip card height** — both faces must be `position: absolute; inset: 0` within a relatively-positioned inner element that has an explicit `min-height`. Without a fixed height the container collapses (both children are out of flow). Set `min-h-[220px]` on `.flip-card-inner`; adjust if card content regularly exceeds this.

---

## Phase 1: Theme foundation + shared header

### Overview

Wire dark/light mode end-to-end and ship the reworked Topbar. This phase establishes the theme toggle and CSS variable migration on the header surface so every subsequent phase can build on it.

### Changes Required

#### 1. Layout.astro

**File**: `src/layouts/Layout.astro`

**Intent**: Fix the language attribute to Polish, add a FOUC-preventing dark-mode init script, and update the page title default.

**Contract**: Change `<html lang="en">` → `<html lang="pl">`. Add an `<script is:inline>` block (see Critical Implementation Details above) as the first child of `<head>`, before the global.css link. Change default title from `"10x Astro Starter"` to `"10xCards"`.

#### 2. global.css — bg-cosmic light/dark variables + flip card CSS

**File**: `src/styles/global.css`

**Intent**: Make `bg-cosmic` respond to the dark/light toggle by replacing its hardcoded gradient with CSS variables; add flip-card CSS classes needed by Phase 4.

**Contract**:

Add to `:root`:
```css
--cosmic-from: #e8eeff;
--cosmic-via: #ede8ff;
--cosmic-to: #e8eeff;
```

Add to `.dark`:
```css
--cosmic-from: #0a0e1a;
--cosmic-via: #0f1529;
--cosmic-to: #0a0e1a;
```

Replace the existing `@utility bg-cosmic` body with:
```css
background-image: linear-gradient(to bottom, var(--cosmic-from), var(--cosmic-via), var(--cosmic-to));
```

Add the following at the end of the file (before any closing layer block):
```css
.flip-card-inner {
  transform-style: preserve-3d;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  min-height: 220px;
}
.flip-card-inner.flipped {
  transform: rotateY(180deg);
}
.flip-card-face {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  position: absolute;
  inset: 0;
}
.flip-card-back {
  transform: rotateY(180deg);
}
```

#### 3. ThemeToggle.tsx

**File**: `src/components/ThemeToggle.tsx`

**Intent**: A small React island that reads the current theme from `<html>`, toggles the `.dark` class and `localStorage` on click, and swaps between `Sun` and `Moon` lucide icons.

**Contract**: Props: none. On mount, read `document.documentElement.classList.contains('dark')` to set local state. On click, toggle the class and write `localStorage.setItem('theme', isDark ? 'dark' : 'light')`. Render `<Sun className="size-4" />` when dark (toggling to light), `<Moon className="size-4" />` when light. Button uses `className="rounded p-1 text-foreground/60 transition-colors hover:text-foreground"`.

#### 4. Topbar.astro

**File**: `src/components/Topbar.astro`

**Intent**: Replace the current bar with a branded header: lucide icon + "10xCards" brand mark on the left; "Generuj fiszki", "Wyloguj" (POST sign-out), and `<ThemeToggle client:load />` on the right. Remove the "Dashboard" nav link. Fix all English strings. Migrate hardcoded opacity classes to CSS-variable-based Tailwind classes.

**Contract**:

Outer wrapper: `class="mb-4 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2 text-sm text-foreground"`.

Left slot (authenticated): a `<a href="/dashboard">` wrapping a lucide icon (e.g. `BrainCircuit` from `lucide-react`, rendered via an Astro component import or inline SVG) and the text `10xCards` as a branded link. Use `class="flex items-center gap-2 font-semibold text-foreground hover:opacity-80"`.

Right slot (authenticated): flex row with `gap-3`. Items:
1. `<a href="/generate" class="font-medium text-foreground/80 transition-colors hover:text-foreground">Generuj fiszki</a>` — larger/more prominent than before.
2. `<form method="POST" action="/api/auth/signout"><button type="submit" class="font-medium text-foreground/60 transition-colors hover:text-foreground">Wyloguj</button></form>`
3. `<ThemeToggle client:load />`

Unauthenticated state: left slot shows the same brand mark. Right slot: "Zaloguj się" → `/auth/signin`, "Zarejestruj się" → `/auth/signup`, `<ThemeToggle client:load />`.

Remove the email display and the "Not signed in" / "Dashboard" text.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- No new Astro/React import errors: `npm run build` (or dev server starts without errors)

#### Manual Verification

- Clicking the dark/light toggle in the header switches the cosmic background between the dark (#0a0e1a gradient) and light (lavender #e8eeff gradient)
- The theme preference persists after a hard refresh
- First visit with OS dark-mode preference defaults to dark; first visit with OS light-mode preference defaults to light
- "10xCards" brand mark appears on the left with a lucide icon; clicking it navigates to `/dashboard`
- The "Dashboard" text link is absent from the navigation
- "Wyloguj" form submission signs the user out and redirects correctly
- Unauthenticated header shows brand mark + "Zaloguj się" / "Zarejestruj się"
- No English strings are visible in the header

**After this phase passes manual verification, proceed to Phase 2.**

---

## Phase 2: Dashboard intro + "+" deck card

### Overview

Remove the dashboard welcome card, add a short Polish intro paragraph, and replace the inline create-deck form with a "+" card in the deck grid that opens a modal. Migrate the deck-list surface classes to CSS variables.

### Changes Required

#### 1. dashboard.astro

**File**: `src/pages/dashboard.astro`

**Intent**: Remove the welcome card div (currently lines 12–37) and replace it with a short, Polish intro paragraph directly above the `DeckList` island.

**Contract**: Delete the entire `<div class="rounded-2xl border border-white/10 ...">` block. In its place, add a `<p>` with approximately 1–2 sentences in Polish describing what 10xCards is — shown to new users before any decks exist. Wrap it in a `class="mb-6 max-w-2xl text-center text-sm text-foreground/70"` div. The outer page wrapper already uses `bg-cosmic`; no change needed there.

#### 2. CreateDeckModal.tsx

**File**: `src/components/decks/CreateDeckModal.tsx`

**Intent**: A new modal component (following the structural pattern of `DeleteDeckModal.tsx`) that prompts the user for a deck name and calls `onConfirm(name)`.

**Contract**: Props: `isOpen: boolean; onConfirm: (name: string) => void; onCancel: () => void; isCreating: boolean; error?: string | null`. Renders `null` when `!isOpen`. Contains an autofocus text input for the deck name (max 200 chars, placeholder "Nazwa zestawu"), error display, and two buttons: "Anuluj" (calls `onCancel`) and "Utwórz" (disabled when input empty or `isCreating`; calls `onConfirm(name.trim())`). All classes use CSS-variable tokens (`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`) — no hardcoded opacity colors.

#### 3. DeckList.tsx

**File**: `src/components/decks/DeckList.tsx`

**Intent**: Remove the header "+ Nowy zestaw" button and the inline create form; replace them with a `CreateDeckModal` and a "+" card rendered as the first item in the deck grid. Migrate all hardcoded opacity classes to CSS-variable equivalents.

**Contract**:

- Remove `showCreateForm`-gated inline `<form>` (lines 67–98) and the conditional `+ Nowy zestaw` button (lines 54–64).
- Keep `showCreateForm`, `newDeckName`, `creating`, `createError` state; wire `handleCreate` to call `createDeck` and then `setShowCreateForm(false)` on success.
- Render `<CreateDeckModal isOpen={showCreateForm} onConfirm={(name) => void handleCreate(name)} onCancel={...} isCreating={creating} error={createError} />` adjacent to `DeleteDeckModal`.
- In the deck grid (currently guarded by `!loading && decks.length > 0`): always render the grid (even with 0 decks), with the "+" card as the first item. Replace the `decks.length === 0` empty-state message with a zero-decks state that the "+" card implicitly handles.
- "+" card markup: a `<button>` with `className="relative flex min-h-[150px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/50 bg-card/30 transition-colors hover:border-primary/50 hover:bg-card/60"`. Inside: a `Plus` lucide icon (`size-8 text-muted-foreground`) and a `<span className="mt-2 text-sm text-muted-foreground">Nowy zestaw</span>`. `onClick`: `setShowCreateForm(true); setCreateError(null)`.
- Migrate section heading "Twoje zestawy" class from `text-white/80` → `text-foreground/80`.
- Migrate loading/error text classes from `text-white/40` / `text-red-400` → `text-muted-foreground` / `text-destructive`.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`

#### Manual Verification

- Dashboard shows the short Polish intro paragraph above the deck list
- The "Dashboard" welcome card/heading is entirely gone
- The "+" card appears as the first tile in the deck grid
- Clicking "+" opens the create-deck modal (not an inline form)
- Creating a deck from the modal closes the modal and the new deck appears in the grid
- Light mode: deck grid cards use CSS-variable-based card surface (light background), not transparent-on-dark
- Dark mode: deck grid cards retain the previous dark-card appearance

**After this phase passes manual verification, proceed to Phase 3.**

---

## Phase 3: Per-deck bulk SR-state reset

### Overview

Add a "Resetuj postępy" action to each deck's dropdown menu, backed by a new batch API endpoint and a confirmation modal showing the affected card count.

### Changes Required

#### 1. cards.ts — batch reset service function

**File**: `src/lib/services/cards.ts`

**Intent**: Add a function that resets SR state for all cards in a deck in two DB calls (fetch card IDs, then batch-update `card_sr_state`).

**Contract**: New export `resetDeckProgress(supabase: SupabaseClientType, userId: string, deckId: string): Promise<void>`. First, select `id` from `cards` where `deck_id = deckId AND user_id = userId`. If no cards, return early. Then call `supabase.from("card_sr_state").update(fsrsCardToDbUpdate(createEmptyCard(new Date()))).in("card_id", cardIds).eq("user_id", userId)`. Throw on error.

#### 2. reset-progress.ts — new API route

**File**: `src/pages/api/decks/[id]/reset-progress.ts`

**Intent**: Expose `POST /api/decks/[id]/reset-progress` that calls `resetDeckProgress` and returns `{}` on success.

**Contract**: Export `prerender = false` and a `POST: APIRoute`. Follow the exact structure of the existing handlers in `src/pages/api/decks/[id].ts`: auth guard, `deckId` param guard, supabase client creation, try/catch wrapping `resetDeckProgress(supabase, user.id, deckId)`, returning `Response.json({})` on success and `Response.json({ error: message }, { status: 500 })` on failure.

#### 3. ResetProgressModal.tsx

**File**: `src/components/decks/ResetProgressModal.tsx`

**Intent**: A confirmation modal (following `DeleteDeckModal.tsx` structure) that asks the user to confirm resetting all SR progress for a deck. No text-input confirmation — just a button confirm.

**Contract**: Props: `isOpen: boolean; deckName: string; cardCount: number; onConfirm: () => void; onCancel: () => void; isResetting: boolean; error?: string | null`. Heading: "Resetuj postępy". Body: "Zresetować postępy dla {cardCount} fiszek w zestawie **{deckName}**? Nie można cofnąć." Buttons: "Anuluj" / "Resetuj postępy" (destructive). All classes use CSS-variable tokens (same as `CreateDeckModal`).

#### 4. DeckRow.tsx — add reset menu item + CSS var migration

**File**: `src/components/decks/DeckRow.tsx`

**Intent**: Add `onResetProgressRequest` prop and a fourth menu item "Resetuj postępy" in the dropdown. Migrate all hardcoded opacity classes to CSS-variable equivalents.

**Contract**:

New prop in `Props`: `onResetProgressRequest: (deck: DeckWithCount) => void`.

Add a new `<button>` item in the dropdown after "Edit", before "Delete":
```
Resetuj postępy — onClick: setDropdownOpen(false); onResetProgressRequest(deck)
```
Style the button identically to the "Edit" item (neutral hover, not destructive).

Migrate the card container: `border-white/10 bg-white/5` → `border-border bg-card`; `text-white` → `text-foreground`; `text-white/60` → `text-muted-foreground`.
Migrate the dropdown container: `border-white/10 bg-[#0f0c1a]` → `border-border bg-popover`.
Migrate dropdown item hover: `text-white/80 hover:bg-white/10 hover:text-white` → `text-foreground/80 hover:bg-accent hover:text-foreground`.
Keep the delete item's red coloring as-is (`text-red-400/80 hover:text-red-300`).

Also fix English strings in the dropdown: "Review" → "Powtórz", "Edit" → "Edytuj", "Delete" → "Usuń". (`title="Opcje"` is already Polish — keep it.)

#### 5. useDeckList.ts — add resetDeckProgress callback

**File**: `src/components/hooks/useDeckList.ts`

**Intent**: Expose a `resetDeckProgress(id)` callback that calls the new endpoint, following the same structure as `deleteDeck`.

**Contract**: Add `const resetDeckProgress = useCallback(async (id: string) => { ... }, [])`. POSTs to `/api/decks/${id}/reset-progress`. Throws on non-ok response using the same error-extraction pattern. Does NOT call `refresh()` (SR state reset doesn't change the deck list). Add to the return value.

#### 6. DeckList.tsx — wire reset modal

**File**: `src/components/decks/DeckList.tsx`

**Intent**: Add state and handler for the reset-progress flow; pass the new prop to `DeckCard`; render `ResetProgressModal`.

**Contract**: Add state `resettingDeck: DeckWithCount | null`, `isResetting: boolean`, `resetError: string | null`. Add `handleReset()` async function (mirrors `handleDelete`). Pass `onResetProgressRequest={setResettingDeck}` to each `<DeckCard>`. Render `<ResetProgressModal isOpen={resettingDeck !== null} deckName={resettingDeck?.name ?? ""} cardCount={resettingDeck?.card_count ?? 0} onConfirm={() => void handleReset()} onCancel={() => { setResettingDeck(null); setResetError(null); }} isResetting={isResetting} error={resetError} />`.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- `POST /api/decks/[id]/reset-progress` returns 200 for an authenticated user with a valid deck ID (manual curl or browser test)

#### Manual Verification

- "Resetuj postępy" appears in each deck's dropdown menu (between "Edytuj" and "Usuń")
- Clicking it opens a confirmation dialog showing the correct card count and deck name
- Confirming resets the SR state; opening the review session for that deck shows the cards as due again
- Cancelling the dialog closes it without making any changes
- No English strings visible in the dropdown or modal

**After this phase passes manual verification, proceed to Phase 4.**

---

## Phase 4: Flip-card review + Polish labels

### Overview

Replace the instant-reveal "Show answer" button with a 3D flip card. Rating buttons appear after the flip animation completes. Translate all English strings in the review session to Polish.

### Changes Required

#### 1. ReviewSession.tsx — flip card structure + Polish strings

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Restructure the card area into a flip-card layout. On click, the card flips to reveal the answer; rating buttons become active only after `transitionend` fires. Replace all English strings with Polish.

**Contract**:

Add local state: `const [flipped, setFlipped] = useState(false)`.

Reset `flipped` when the card changes:
```ts
useEffect(() => { setFlipped(false); }, [current?.id]);
```

Replace the `<div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">` card block with:
```tsx
<div className="[perspective:1200px]">
  <div
    className={cn("flip-card-inner", flipped && "flipped")}
    onTransitionEnd={() => { if (flipped) reveal(); }}
  >
    {/* Front face */}
    <div className="flip-card-face rounded-xl border border-border bg-card p-6 backdrop-blur-sm cursor-pointer"
         onClick={() => { if (!showAnswer && !submitting) setFlipped(true); }}>
      <p className="text-lg font-semibold text-foreground">{current.front}</p>
      <p className="mt-4 text-xs text-muted-foreground">Kliknij, aby odsłonić odpowiedź</p>
    </div>
    {/* Back face */}
    <div className="flip-card-face flip-card-back rounded-xl border border-border bg-card p-6 backdrop-blur-sm">
      <p className="text-lg font-semibold text-foreground">{current.front}</p>
      <hr className="my-4 border-border" />
      <p className="text-base text-foreground/80">{current.back}</p>
      <div className="mt-6">
        <RatingButtons onRate={rate} disabled={submitting || !showAnswer} />
      </div>
    </div>
  </div>
</div>
```

Replace English strings in all conditional branches:
- `"Loading…"` → `"Ładowanie…"`
- `"No cards due today"` → `"Brak kart na dziś"`
- `"All cards are scheduled for a future date."` → `"Wszystkie karty zaplanowane są na przyszłe daty."`
- `"← Back to deck"` → `"← Powrót do zestawu"`
- `"Session complete!"` → `"Sesja zakończona!"`
- `"Cards reviewed:"` → `"Przejrzane karty:"`
- `"Again ratings:"` → `"Oceny 'Raz jeszcze':"`
- `"Dashboard"` → `"Pulpit"`
- `"← Back"` → `"← Wróć"`
- `"{N} card{s} remaining"` → `"Pozostało: {N}"` (static, no pluralization needed)

Import `cn` from `@/lib/utils`.

#### 2. RatingButtons.tsx — Polish labels

**File**: `src/components/review/RatingButtons.tsx`

**Intent**: Translate the four button labels to Polish.

**Contract**: In the `BUTTONS` array, change the `label` fields: `"Again"` → `"Raz jeszcze"`, `"Hard"` → `"Trudna"`, `"Good"` → `"Dobra"`, `"Easy"` → `"Łatwa"`. No other changes.

#### 3. useReviewSession.ts — Polish error strings

**File**: `src/components/hooks/useReviewSession.ts`

**Intent**: Translate the two English error strings to Polish.

**Contract**: `"Failed to load due cards"` → `"Nie udało się załadować kart"`. `"Failed to submit rating"` → `"Nie udało się przesłać oceny"`.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`

#### Manual Verification

- Review card shows a 3D flip animation when clicked (visible front-to-back rotation)
- Rating buttons ("Raz jeszcze", "Trudna", "Dobra", "Łatwa") are disabled/non-interactive during the flip and become active only after the animation completes
- After rating, the card flips back to show the question side for the next card
- The "0 due" screen and session-complete screen display only Polish text
- No English strings are visible anywhere in the review session flow

---

## Testing Strategy

### Manual Testing Steps

1. **Theme toggle**: Toggle dark/light 3 times on the dashboard; verify cosmic background and card surfaces switch. Hard-refresh; verify preference persists.
2. **Header**: Verify "10xCards" brand mark links to `/dashboard`; verify "Wyloguj" signs out; verify sign-in/sign-up shown when logged out.
3. **Dashboard intro**: Create a fresh test account; verify intro paragraph visible; verify welcome card absent.
4. **"+" card**: Click "+" card; create deck via modal; verify deck appears in grid.
5. **Bulk reset**: Add cards to a deck; run a review session (rate some); verify SR state is non-zero; use "Resetuj postępy" → confirm; open review session again → all cards should be due.
6. **Flip card**: Start review on a deck with due cards; click card → flip animation plays; rating buttons are inactive during flip; rate a card; verify next card appears face-up.
7. **Polish strings**: Check every visible screen (header, dashboard, deck list, review session, modals) for any remaining English strings.

## References

- Roadmap: `context/foundation/roadmap.md` (S-06 scope)
- `resetCardSRState` implementation: `src/lib/services/cards.ts:52`
- DeleteDeckModal pattern: `src/components/decks/DeleteDeckModal.tsx`
- CSS variable palette: `src/styles/global.css:6-73`
- useReviewSession: `src/components/hooks/useReviewSession.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Theme foundation + shared header

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — cc0702f
- [x] 1.2 Dev server starts without errors — cc0702f

#### Manual

- [x] 1.3 Dark/light toggle switches cosmic background and header surface — cc0702f
- [x] 1.4 Theme preference persists after hard refresh — cc0702f
- [x] 1.5 OS dark/light preference applied on first visit — cc0702f
- [x] 1.6 "10xCards" brand mark appears with icon, links to `/dashboard` — cc0702f
- [x] 1.7 "Dashboard" nav link absent; "Wyloguj" signs out correctly — cc0702f
- [x] 1.8 No English strings visible in the header — cc0702f

### Phase 2: Dashboard intro + "+" deck card

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — 2e1ba14

#### Manual

- [x] 2.2 Welcome card gone; short Polish intro paragraph visible on dashboard — 2e1ba14
- [x] 2.3 "+" card appears as first tile in deck grid — 2e1ba14
- [x] 2.4 Clicking "+" opens create-deck modal; deck created successfully — 2e1ba14
- [x] 2.5 Deck grid card surfaces use CSS-variable classes in both light and dark mode — 2e1ba14

### Phase 3: Per-deck bulk SR-state reset

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck` — 64dcdab
- [x] 3.2 `POST /api/decks/[id]/reset-progress` returns 200 for valid deck — 64dcdab

#### Manual

- [x] 3.3 "Resetuj postępy" visible in each deck dropdown (between "Edytuj" and "Usuń") — 64dcdab
- [x] 3.4 Confirmation modal shows correct card count and deck name — 64dcdab
- [x] 3.5 Confirming reset makes all deck cards due in the next review session — 64dcdab
- [x] 3.6 No English strings visible in dropdown or modal — 64dcdab

### Phase 4: Flip-card review + Polish labels

#### Automated

- [x] 4.1 Type checking passes: `npm run typecheck` — 3440b4f

#### Manual

- [x] 4.2 Review card flips in 3D on click — 3440b4f
- [x] 4.3 Rating buttons active only after flip animation completes — 3440b4f
- [x] 4.4 Rating labels show "Raz jeszcze / Trudna / Dobra / Łatwa" — 3440b4f
- [x] 4.5 No English strings visible in review session flow — 3440b4f
