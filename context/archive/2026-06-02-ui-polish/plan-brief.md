# UI Polish — Plan Brief

> Full plan: `context/changes/ui-polish/plan.md`

## What & Why

S-06 ships five UX refinements that clean up the app's visual identity and fix accumulated English strings: a branded shared header with dark/light toggle, a simplified dashboard intro with a "+" deck card, a per-deck bulk SR-reset action, a 3D flip-card review, and migration of the header/dashboard/deck-list surfaces to CSS-variable-based Tailwind classes so the theme toggle has a real visual effect. The app is used by Polish high-school students — every English string in the modified components is a compliance failure against the lessons.md rule.

## Starting Point

The app has a functional but unstyled `Topbar.astro` with hardcoded dark-ish opacity classes and English labels ("Dashboard", "Sign out"). The dashboard shows a welcome card that must be replaced. All deck and review UI exists and works; this plan re-skins it without changing domain logic. Dark-mode CSS variables and the `.dark` class strategy are already defined in `global.css` but nothing wires them yet.

## Desired End State

Every page shows a "10xCards" branded header with a sun/moon toggle; the dark/light theme persists across refreshes. The dashboard shows a short Polish intro and a "+" tile in the deck grid. Each deck card's dropdown includes "Resetuj postępy" behind a confirmation modal. The review card flips in 3D on click; Polish rating labels appear only after the flip completes. Light mode renders a lavender gradient background and proper light card surfaces on all migrated pages.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Dark mode scope | Wire + migrate core surfaces | Toggle needs real visual effect on header, dashboard, deck list | Plan |
| "Nowy zestaw" entry point | "+" card in deck grid opens modal | User-specified — more discoverable than a header button | Plan |
| Bulk reset DB approach | Single batch UPDATE (2 DB calls) | Avoids O(n) per-card calls; `card_sr_state` has no `deck_id` so IDs must be fetched first | Plan |
| Rating label timing | Fix in S-06 now | lessons.md rule: all user-facing text must be in Polish; RatingButtons.tsx is being edited anyway | Plan |
| Flip reveal timing | After `transitionend` | Rating buttons should appear only when the back face is fully visible | Plan |
| Light background | Subtle lavender gradient | User preference; preserves brand identity in both themes | Plan |

## Scope

**In scope:**
- Topbar.astro full rework (brand mark, dark/light toggle, Polish strings, CSS var migration)
- Layout.astro: `lang="pl"`, FOUC-prevention init script, title default
- global.css: bg-cosmic light/dark CSS variables, flip-card CSS classes
- ThemeToggle.tsx: new React island
- dashboard.astro: remove welcome card, add Polish intro paragraph
- DeckList.tsx: "+" deck card, CreateDeckModal, CSS var migration
- DeckRow.tsx: reset menu item, Polish dropdown labels, CSS var migration
- ResetProgressModal.tsx, CreateDeckModal.tsx: new modal components
- POST /api/decks/[id]/reset-progress: new endpoint
- cards.ts: `resetDeckProgress()` service function
- ReviewSession.tsx: 3D flip card, Polish strings
- RatingButtons.tsx: Polish labels
- useReviewSession.ts: Polish error strings

**Out of scope:**
- generate, deck-detail, auth pages — S-07 localization sweep handles those
- Adding purple to the CSS design token set
- SR algorithm or review logic changes
- Undo for bulk reset

## Architecture / Approach

Dark mode wires through a 3-layer stack: CSS variables on `:root`/`.dark` (already defined) → Tailwind `@theme inline` mapping (already wired) → `.dark` class on `<html>` set by an `is:inline` init script in `<head>`. The toggle is a React island (`ThemeToggle.tsx`) embedded in the Astro Topbar via `client:load`. The flip card uses plain CSS classes added to `global.css` (`flip-card-inner`, `flip-card-face`, `flip-card-back`) with `perspective`, `transform-style: preserve-3d`, and `backface-visibility: hidden` — no third-party animation library needed since `tw-animate-css` doesn't cover 3D transforms.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Theme foundation + shared header | Dark/light toggle live; branded header with "10xCards", "Wyloguj", ThemeToggle | FOUC if init script placement is wrong; must be first child of `<head>` |
| 2. Dashboard intro + "+" deck card | Welcome card replaced; "+" tile in grid opens CreateDeckModal | CSS var migration must cover deck grid so light mode looks correct |
| 3. Per-deck bulk reset | "Resetuj postępy" in dropdown; batch API endpoint; confirmation modal | `card_sr_state` lacks `deck_id` — needs 2 DB calls; must guard against empty deck |
| 4. Flip-card review + Polish labels | 3D flip; rating buttons after transitionend; all Polish strings | Back face uses `position: absolute; inset: 0` — min-height must accommodate content |

**Prerequisites:** S-03 (review session) and S-04 (manual card CRUD) must be complete — both are marked `done` in the roadmap.

**Estimated effort:** ~3–4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- The flip card CSS uses `backface-visibility: hidden` which has inconsistent behavior on some mobile Safari versions — acceptable for MVP but worth noting.
- Purple accent classes (`text-purple-300`, `bg-purple-600/20`) on interactive elements are NOT migrated to CSS variables; they stay hardcoded and look fine in dark mode. Light mode will show purple accents on the card surfaces — acceptable for this scope.
- The `transitionend` event on the flip inner element fires once per property; if multiple properties transition simultaneously, `reveal()` may be called multiple times. Guard with `if (flipped && !showAnswer)` inside the handler.

## Success Criteria (Summary)

- Dark/light toggle is functional and persistent across all core pages
- No English text is visible on any surface modified in this slice
- "Resetuj postępy" action correctly resets SR state for all cards in a deck
