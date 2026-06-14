# Account Deletion (S-09) — Plan Brief

> Full plan: `context/changes/account-deletion/plan.md`
> Research: `context/changes/account-deletion/research.md`

## What & Why

Users get a way to permanently delete their account and all related data (decks, cards, SR state, review logs) — the PRD's GDPR right-to-erasure baseline (roadmap S-09). The deletion lives on a new `/settings` page, reached from a new topbar avatar menu that also absorbs the existing "Wyloguj" action.

## Starting Point

The topbar shows a bare "Wyloguj" button; there is no settings page, no avatar menu, and no admin-level Supabase access anywhere in the repo. The database is already prepared: every app table cascades from `auth.users` (a deliberate F-01 decision), so deleting the auth user wipes all app data atomically — the work is infrastructure and UI, not schema.

## Desired End State

A signed-in user opens the avatar menu → "Ustawienia" → sees their email, a "Zmień hasło (Wkrótce)" placeholder, and "Usuń konto". Typing **USUŃ KONTO** in a confirmation dialog permanently deletes the account; they land on the signin page with "Twoje konto zostało usunięte." and can never sign in with those credentials again. All UI copy is Polish.

## Key Decisions Made

| Decision                    | Choice                                  | Why (1 sentence)                                                                                                | Source   |
| --------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| Data cleanup mechanism      | `auth.admin.deleteUser` + FK cascades   | Cascades already cover every table; no app-row deletion code needed.                                            | Research |
| Endpoint placement          | `DELETE /api/account` (JSON dialect)    | `/api/auth/*` bypasses the middleware auth guard; `/api/account` gets the 401 guard for free.                   | Research |
| Hard confirmation           | Typed phrase "USUŃ KONTO"               | Consistent with the S-02 deck-delete pattern; zero extra server auth logic.                                     | Plan     |
| Post-deletion UX            | `/auth/signin?notice=account-deleted`   | Reuses the auth pages' query-param messaging pattern; no new public route.                                      | Plan     |
| Modal technology            | shadcn AlertDialog                      | Accessible by default and portals natively (lessons.md rule), at the cost of a second modal idiom.              | Plan     |
| Avatar content              | Generic lucide `User` icon              | Simplest; no profile images exist anyway.                                                                       | Plan     |
| Change-password placeholder | Disabled button + "Wkrótce"             | Honest placeholder that reserves layout space per change.md.                                                    | Plan     |
| Testing depth               | Unit + API tests **and** Playwright E2E | Irreversible destructive flow warrants both layers; disposable-user signup is feasible (no email confirmation). | Plan     |

## Scope

**In scope:** `SUPABASE_SERVICE_ROLE_KEY` secret + server-only admin client; `account` service + `DELETE /api/account`; `/settings` page (email, password placeholder, delete flow); topbar avatar dropdown (Ustawienia/Wyloguj); shadcn `alert-dialog`, `input`, `label`, `dropdown-menu`, `avatar`; unit tests + E2E spec; `tests/login.setup.ts` fix.

**Out of scope:** change-password implementation; soft-delete/undo; password re-entry confirmation; dedicated farewell page; signed-out topbar changes; deeper GDPR tooling; migrating existing hand-rolled modals.

## Architecture / Approach

A new server-only admin client (service-role key, declared via `astro.config.mjs` env schema) is the single new infrastructure piece. The deletion endpoint follows the existing business-route template (401 → Zod 400 → 503 → try/catch 500 → JSON), calls `deleteAccount(admin, locals.user.id)` (the admin client bypasses RLS, so it only ever receives the session's own user id), then best-effort `signOut()`. UI follows existing island patterns: Astro pages + `client:load` React components.

## Phases at a Glance

| Phase                          | What it delivers                                                 | Key risk                                                                              |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1. Deletion backend            | Secret, admin client, service, `DELETE /api/account`, unit tests | Service-role key handling — must stay server-only and id must come from `locals.user` |
| 2. Settings page + delete flow | `/settings`, AlertDialog confirmation, signin notice             | First Radix dialog in the codebase; error paths must surface in the dialog            |
| 3. Topbar avatar menu          | UserMenu island replacing the Wyloguj button                     | Breaks `tests/login.setup.ts:18` — must update the assertion in the same commit       |
| 4. E2E deletion spec           | Disposable-user Playwright proof of the full flow                | Must never touch the shared `PLAYWRIGHT_USER` other specs depend on                   |

**Prerequisites:** `SUPABASE_SERVICE_ROLE_KEY` available locally (`.env`) and in production (`npx wrangler secret put`); dev server + real Supabase for E2E.
**Estimated effort:** ~3-4 sessions across 4 phases; Phase 1 and 2 carry most of the substance.

## Open Risks & Assumptions

- Assumes Supabase signup remains confirmation-free (it is today — `tests/setup.ts` signs up and in immediately); if email confirmation is ever enabled, the E2E disposable-user strategy needs rework.
- `signOut()` after `deleteUser` may error (session's user is gone) — deliberately tolerated; middleware's `getUser()` makes stale cookies harmless.
- Until the production secret is set, the endpoint returns 503 — feature is inert, not broken.

## Success Criteria (Summary)

- A user can permanently delete their account from `/settings` behind a typed-phrase confirmation, landing on the signin page with a Polish notice; their credentials and all their data are gone (verified down to the DB).
- The topbar avatar menu replaces the bare Wyloguj button without breaking logout or the Playwright login chain.
- The flow is covered by unit tests (status matrix, id-source guard) and a repeatable disposable-user E2E spec.
