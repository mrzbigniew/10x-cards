---
session: roadmap-to-github-issues
date: 2026-05-25
repo: https://github.com/mrzbigniew/10x-cards
source: context/foundation/roadmap.md
---

# Session summary: Roadmap → GitHub Issues

## Goal

Convert `context/foundation/roadmap.md` (v1, 6 work items) into tracked GitHub Issues on `mrzbigniew/10x-cards` using the `gh` CLI. No issues existed before this session.

---

## Labels created (7)

| Label | Color | Purpose |
|---|---|---|
| `foundation` | `#0075ca` | Horizontal enabler (F-xx) |
| `slice` | `#0e8a16` | Vertical user-visible slice (S-xx) |
| `stream:A` | `#e4e669` | Core generation loop |
| `stream:B` | `#f9d0c4` | Deck and card management |
| `stream:C` | `#c5def5` | Auth completeness |
| `status:ready` | `#2cbe4e` | Can be started now |
| `status:proposed` | `#ededed` | Blocked by prerequisites |

---

## Issues created (6)

| GitHub # | Roadmap ID | Change ID | Title | Labels | Prerequisites |
|---|---|---|---|---|---|
| [#2](https://github.com/mrzbigniew/10x-cards/issues/2) | F-01 | `db-schema-rls` | Set up Supabase migrations: decks, cards, SR-state tables + RLS policies | `foundation`, `status:ready` | — |
| [#3](https://github.com/mrzbigniew/10x-cards/issues/3) | S-01 | `first-gated-generation` | AI generation flow: paste text → proposals → review → save to new deck | `slice`, `stream:A`, `status:proposed` | #2 |
| [#4](https://github.com/mrzbigniew/10x-cards/issues/4) | S-02 | `deck-management` | Deck management: list / create / rename / delete + existing-deck save path | `slice`, `stream:B`, `status:proposed` | #2 |
| [#5](https://github.com/mrzbigniew/10x-cards/issues/5) | S-05 | `password-reset` | Password reset: forgot-password + email link + new-password pages | `slice`, `stream:C`, `status:proposed` | #2 |
| [#6](https://github.com/mrzbigniew/10x-cards/issues/6) | S-04 | `manual-card-crud` | Manual flashcard CRUD: add / edit (SR-reset option) / delete | `slice`, `stream:B`, `status:proposed` | #2, #4 |
| [#7](https://github.com/mrzbigniew/10x-cards/issues/7) | S-03 | `review-session` | Review session: SR-scheduled cards, rating loop, state persistence | `slice`, `stream:A`, `status:proposed` | #2, #3, #4 |

---

## Roadmap ID → issue number map

| Roadmap ID | GitHub issue |
|---|---|
| F-01 | #2 |
| S-01 | #3 |
| S-02 | #4 |
| S-05 | #5 |
| S-04 | #6 |
| S-03 | #7 |

---

## Notes

- Issue #1 is the first merged PR ("Update wrangler config name to 10x-cards"), not part of this migration.
- Only F-01 (#2) carries `status:ready`; all slices are `status:proposed` and gated behind F-01 at minimum.
- Each issue body contains: Outcome, Prerequisites (with `#N` cross-links), PRD References, Blockers, Unknowns/Open questions, Risk, and the Roadmap metadata footer.
