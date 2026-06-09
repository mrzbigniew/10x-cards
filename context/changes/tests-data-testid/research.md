---
date: 2026-06-09T00:00:00+02:00
researcher: Claude Sonnet 4.6
git_commit: bbd54c7a018283c842bbb60f44bd48afd02bd262
branch: main
repository: 10x-cards
topic: "Add data-testid attributes to interactive elements for Playwright test targeting"
tags: [research, codebase, playwright, data-testid, components, e2e]
status: complete
last_updated: 2026-06-09
last_updated_by: Claude Sonnet 4.6
---

# Research: data-testid Coverage for Playwright Tests

**Date**: 2026-06-09  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: `bbd54c7a018283c842bbb60f44bd48afd02bd262`  
**Branch**: main  
**Repository**: 10x-cards

## Research Question

Which interactive elements in the codebase need `data-testid` attributes added, and what naming convention should be used, to enable reliable Playwright test targeting?

## Summary

The codebase has **95 interactive elements** across 20+ component files. Only **1 element** currently carries a `data-testid` (`btn-generate` in `TextInputForm.tsx`). Existing E2E tests (`tests/generation-error-recovery.spec.ts`, `tests/seed.spec.ts`) already rely on this single testid.

**Critical constraint from CLAUDE.md**: `getByTestId` is a fallback — `getByRole` / `getByLabel` / `getByText` must be preferred. `data-testid` is justified only when accessibility attributes are genuinely ambiguous. This narrows the target list considerably.

**Primary ambiguity sources in this codebase:**

1. **Repeating rows** — DeckRow, ProposalRow, CardRow render the same button roles/names N times; Playwright cannot target "the delete button for deck X" without per-row disambiguation.
2. **Icon-only buttons without unique aria-label per row** — DeckRow action icons have `title` but no `aria-label`.
3. **Non-button clickable elements** — the flip-card `<div>` in ReviewSession has no semantic role.
4. **Modal containers** — for asserting presence/absence of a specific modal when multiple could theoretically be open.

Elements reachable without `data-testid` (submit buttons with unique text, labeled inputs, navigation links, bulk-action buttons with count) should keep using accessible selectors.

---

## Detailed Findings

### Existing data-testid Usage

| File                                          | Line | testid         | Used by tests                                                            |
| --------------------------------------------- | ---- | -------------- | ------------------------------------------------------------------------ |
| `src/components/generation/TextInputForm.tsx` | 56   | `btn-generate` | `tests/generation-error-recovery.spec.ts:19,25`, `tests/seed.spec.ts:17` |

**Total: 1 of 95 interactive elements has a testid.**

---

### Elements that NEED data-testid (genuinely ambiguous)

#### DeckRow icon buttons — `src/components/decks/DeckRow.tsx`

Four icon-only action buttons appear once per deck card. Because `DeckList` renders N deck rows, Playwright `getByRole('button', { name: /Powtórz/ })` is ambiguous when the user has multiple decks. The buttons use `title` (tooltip) rather than `aria-label`, so `getByRole` cannot target them by accessible name.

| Line  | Role   | Current attr                           | Proposed testid               |
| ----- | ------ | -------------------------------------- | ----------------------------- |
| 25–33 | button | `title="Powtórz"`                      | `deck-row-btn-review`         |
| 35–43 | button | `title="Generuj fiszki"` (conditional) | `deck-row-btn-generate`       |
| 45–53 | button | `title="Resetuj postępy"`              | `deck-row-btn-reset-progress` |
| 54–62 | button | `title="Usuń"`                         | `deck-row-btn-delete`         |

In tests, target per-deck row via: `page.getByRole('listitem').filter({ hasText: deckName }).getByTestId('deck-row-btn-delete')`.

#### ProposalRow action buttons — `src/components/generation/ProposalRow.tsx`

ProposalList renders N ProposalRow entries. Each row contains 4–6 buttons (accept, reject, edit, undo, confirm-edit, cancel-edit). A proposal list with 5–15 entries gives Playwright 5–15 "Akceptuj" buttons with no disambiguation.

| Line    | Accessible text         | Proposed testid                 |
| ------- | ----------------------- | ------------------------------- |
| 96–103  | "Akceptuj"              | `proposal-row-btn-accept`       |
| 105–110 | "Edytuj"                | `proposal-row-btn-edit`         |
| 111–118 | "Odrzuć"                | `proposal-row-btn-reject`       |
| 122–129 | "Cofnij"                | `proposal-row-btn-undo`         |
| 68–73   | "Potwierdź" (edit mode) | `proposal-row-btn-confirm-edit` |
| 75–80   | "Anuluj" (edit mode)    | `proposal-row-btn-cancel-edit`  |

#### CardRow action buttons — `src/components/CardRow.tsx`

CardList renders N CardRow entries. Same per-row ambiguity as above.

| Line    | Accessible text              | Proposed testid               |
| ------- | ---------------------------- | ----------------------------- |
| 167–171 | "Edytuj"                     | `card-row-btn-edit`           |
| 173–180 | "Usuń"                       | `card-row-btn-delete`         |
| 139–145 | "Zapisz" (edit mode)         | `card-row-btn-save`           |
| 146–154 | "Anuluj" (edit mode cancel)  | `card-row-btn-cancel-edit`    |
| 67–73   | "Tak, usuń" (confirm delete) | `card-row-btn-confirm-delete` |
| 74–82   | "Anuluj" (cancel delete)     | `card-row-btn-cancel-delete`  |

#### Review flip card — `src/components/review/ReviewSession.tsx`

| Line  | Element                | Issue                                | Proposed testid       |
| ----- | ---------------------- | ------------------------------------ | --------------------- |
| 96–99 | `<div onClick={flip}>` | No semantic role, no accessible name | `review-card-flipper` |

#### Rating buttons — `src/components/review/RatingButtons.tsx`

The four rating buttons ("Raz jeszcze", "Trudna", "Dobra", "Łatwa") are unique by text within a single session, so `getByRole` works. However, testids add robustness against label copy changes and make assertion intent explicit. Recommended as **medium priority**.

| Proposed testid    |
| ------------------ |
| `rating-btn-again` |
| `rating-btn-hard`  |
| `rating-btn-good`  |
| `rating-btn-easy`  |

#### Modal containers

Each modal portal should expose a root testid so tests can assert the modal is open/closed without relying on heading text. The container `<div>` of the portal is the right target.

| Component          | File                                            | Proposed testid        |
| ------------------ | ----------------------------------------------- | ---------------------- |
| GenerationModal    | `src/components/generation/GenerationModal.tsx` | `modal-generation`     |
| ReviewModal        | `src/components/review/ReviewModal.tsx`         | `modal-review`         |
| AddCardModal       | `src/components/AddCardModal.tsx`               | `modal-add-card`       |
| CreateDeckModal    | `src/components/decks/CreateDeckModal.tsx`      | `modal-create-deck`    |
| DeleteDeckModal    | `src/components/decks/DeleteDeckModal.tsx`      | `modal-delete-deck`    |
| ResetProgressModal | `src/components/decks/ResetProgressModal.tsx`   | `modal-reset-progress` |

---

### Elements that DON'T need data-testid

These are reachable via accessible selectors and should stay that way per CLAUDE.md guidance.

| Element                                            | Accessible selector                                       |
| -------------------------------------------------- | --------------------------------------------------------- | ------------------ |
| All form inputs (email, password, name, textarea)  | `getByLabel(...)`                                         |
| "Generuj fiszki z AI" submit button                | `getByTestId('btn-generate')` ← already covered           |
| "Zapisz zestaw" save button                        | `getByRole('button', { name: 'Zapisz zestaw' })`          |
| "Utwórz" create deck submit                        | `getByRole('button', { name: 'Utwórz' })`                 |
| "Dodaj fiszkę" add card submit                     | `getByRole('button', { name: 'Dodaj fiszkę' })`           |
| "Akceptuj pozostałe (N)" bulk button               | `getByRole('button', { name: /Akceptuj pozostałe/ })`     |
| "Odrzuć pozostałe (N)" bulk button                 | `getByRole('button', { name: /Odrzuć pozostałe/ })`       |
| Navigation links (Topbar, back link)               | `getByRole('link', { name: '...' })`                      |
| ThemeToggle                                        | `getByRole('button', { name: /Przełącz/ })`               |
| PasswordToggle                                     | `getByRole('button', { name: /Show password               | Hide password/ })` |
| Modal cancel/confirm (within unique modal context) | `getByRole('button', { name: 'Anuluj' })` scoped to modal |

---

## Code References

- `src/components/decks/DeckRow.tsx:25–62` — 4 icon-only action buttons per deck row
- `src/components/generation/ProposalRow.tsx:68–129` — 6 action buttons per proposal row
- `src/components/CardRow.tsx:67–180` — 6 action buttons per card row
- `src/components/review/ReviewSession.tsx:96–99` — flip-card clickable div
- `src/components/review/RatingButtons.tsx:39–50` — 4 rating buttons
- `src/components/generation/GenerationModal.tsx:12` — modal portal root
- `src/components/review/ReviewModal.tsx:11` — modal portal root
- `src/components/AddCardModal.tsx:10` — modal portal root
- `src/components/decks/CreateDeckModal.tsx:11` — modal portal root
- `src/components/decks/DeleteDeckModal.tsx` — modal portal root
- `src/components/decks/ResetProgressModal.tsx` — modal portal root
- `src/components/generation/TextInputForm.tsx:56` — **existing** `data-testid="btn-generate"`
- `tests/generation-error-recovery.spec.ts:19,25` — uses `btn-generate`
- `tests/seed.spec.ts:17` — uses `btn-generate`
- `playwright.config.ts` — `testDir: ./tests`, `baseURL: http://localhost:8080`

---

## Architecture Insights

### Naming convention

The existing testid `btn-generate` is flat and context-free. For a multi-page app with repeating list components, a **scoped kebab-case** convention works better:

```
[component-context]-[element-type]-[action]
modal-[name]
```

Examples: `deck-row-btn-review`, `modal-generation`, `review-card-flipper`, `rating-btn-again`.

The existing `btn-generate` should be left as-is (changing it would break existing tests). New testids follow the structured convention.

### Modal portal pattern

All six modals use `createPortal` (per lesson in `lessons.md`). The `data-testid` should go on the outermost `<div>` inside the `createPortal(...)` call, not on the portal call itself. This is the element that Playwright's DOM snapshot sees.

### Row-level scoping in tests

For DeckRow / ProposalRow / CardRow, the recommended Playwright pattern is:

```ts
// Target per-row button
const deckRow = page.getByRole("listitem").filter({ hasText: "My Deck" });
await deckRow.getByTestId("deck-row-btn-delete").click();
```

This uses `data-testid` only for disambiguation within an already-scoped locator, consistent with CLAUDE.md's "getByTestId only when ambiguous" rule.

---

## Historical Context

- `context/changes/test-plan-refresh-2026-06-08/` — implemented 2026-06-08; added modal lifecycle and hook gap tests (Vitest). Did not address E2E Playwright selector strategy.
- `context/foundation/test-plan.md` (last updated 2026-06-07) — Playwright E2E noted as planned but not yet phases-scheduled. The `tests-data-testid` change is a prerequisite blocker for robust E2E coverage.

---

## Open Questions

1. **`btn-generate` naming inconsistency** — Should it be migrated to `generation-btn-generate` for consistency? Requires updating `tests/generation-error-recovery.spec.ts` and `tests/seed.spec.ts`. Low priority; not blocking.
2. **DeckDetailHeader inline rename input** — The deck-name input (`DeckDetailHeader.tsx:55–69`) appears conditionally when editing. Should it get a testid (`deck-header-input-name`) for E2E rename flows? Currently reachable by `getByRole('textbox')` (only one on the page when visible).
3. **GenerationFlow phase indicator** — No testid on phase container. If E2E tests need to assert "we are in reviewing phase", a `data-testid="generation-phase-[name]"` on the `GenerationFlow` phase wrapper would help.
