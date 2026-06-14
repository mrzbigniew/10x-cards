---
date: 2026-06-12T23:23:17+02:00
researcher: Claude Code (Fable 5)
git_commit: 0a8156f6d557e4888c6d09e5bef4da20ec5e0e31
branch: main
repository: 10x-cards
topic: "Account deletion via new settings page behind an avatar menu (S-09)"
tags: [research, codebase, account-deletion, auth, supabase, settings, topbar, rls]
status: complete
last_updated: 2026-06-12
last_updated_by: Claude Code (Fable 5)
---

# Research: Account deletion via new settings page behind an avatar menu (S-09)

**Date**: 2026-06-12T23:23:17+02:00
**Researcher**: Claude Code (Fable 5)
**Git Commit**: 0a8156f6d557e4888c6d09e5bef4da20ec5e0e31
**Branch**: main
**Repository**: 10x-cards

## Research Question

How should the account-deletion change (roadmap S-09) be implemented? Scope per `change.md`: (1) replace the topbar "Wyloguj" button with an avatar dropdown menu ("Ustawienia" + "Wyloguj"), (2) add a gated `/settings` page (email read-only, change-password placeholder, delete-account button), (3) permanently delete the auth user **and** all app data (decks, cards, SR state) with a hard confirmation, leaving no orphans.

## Summary

- **FK cascades make deletion clean.** Every app table (`decks`, `cards`, `card_sr_state`, `review_logs`) has `user_id REFERENCES auth.users(id) ON DELETE CASCADE` (plus redundant chains `decks → cards → card_sr_state/review_logs`). Deleting the auth user row removes all app data with zero orphans. FK cascades fire at the SQL level and bypass RLS, so the missing DELETE policy on `review_logs` is not a blocker.
- **The missing piece is infrastructure, not schema.** There is no service-role key or admin client anywhere in the repo — the only client factory (`src/lib/supabase.ts`) uses the anon key. `supabase.auth.admin.deleteUser(userId)` requires a new `SUPABASE_SERVICE_ROLE_KEY` secret (declared in `astro.config.mjs` env schema, read via `astro:env/server`, set with `wrangler secret put`) and a server-only admin client factory.
- **Endpoint placement gotcha:** middleware treats everything under `/api/auth/` as public (`src/middleware.ts:13`). The deletion endpoint should live elsewhere (e.g. `/api/account`) to get the middleware auth guard automatically, or must self-guard.
- **Hard confirmation has two precedents:** typed-phrase matching (`DeleteDeckModal.tsx`, S-02) and password re-verification via `supabase.auth.signInWithPassword()` (already used in `src/pages/api/auth/signin.ts:13`). `change.md` allows either.
- **UI gap:** `src/components/ui/` contains only `button.tsx` and `LibBadge.astro`. shadcn `dropdown-menu` and `avatar` (and their Radix deps) must be added via `npx shadcn@latest add`. The new confirmation modal must use `createPortal` (lessons.md rule) — note `DeleteDeckModal.tsx` predates the rule and renders inline; follow `ReviewModal.tsx:53` instead.
- **`/settings` needs no special gating** — middleware protects all non-public routes by default and redirects unauthenticated page requests to `/auth/signin`.

## Detailed Findings

### Database schema & FK cascades

`supabase/migrations/20260526220447_initial_schema.sql`:

| Table           | FK                                                                           | Behavior          |
| --------------- | ---------------------------------------------------------------------------- | ----------------- |
| `decks`         | `user_id → auth.users(id)` (line 13)                                         | ON DELETE CASCADE |
| `cards`         | `deck_id → decks(id)` (line 34); `user_id → auth.users(id)` (line 35)        | both CASCADE      |
| `card_sr_state` | `card_id → cards(id)` UNIQUE (line 61); `user_id → auth.users(id)` (line 62) | both CASCADE      |

`supabase/migrations/20260602000000_review_session.sql`:

| Table         | FK                                                                    | Behavior     |
| ------------- | --------------------------------------------------------------------- | ------------ |
| `review_logs` | `card_id → cards(id)` (line 10); `user_id → auth.users(id)` (line 11) | both CASCADE |

- A third migration (`20260607000001_review_logs_deny_update_delete.sql`) is fully commented out — a no-op.
- `src/lib/database.types.ts` confirms exactly four public tables (`card_sr_state`:37, `cards`:99, `decks`:140, `review_logs`:164). No generation-log or stats tables; no storage buckets used. Nothing else to clean up.
- RLS: `decks`/`cards`/`card_sr_state` have owner policies for all four operations (`initial_schema.sql:21-25`, `:46-50`, `:79-83`). `review_logs` has **SELECT + INSERT only** (`review_session.sql:28-30`) — users cannot DELETE their own review logs through the anon-key client. This rules out a "delete app rows with the user's own client" approach and confirms the admin-API + cascade path.

**Conclusion:** `auth.admin.deleteUser(userId)` alone removes everything; no explicit app-row deletion needed.

### Auth-user deletion capability (admin client) — does not exist yet

- The only Supabase client factory is `src/lib/supabase.ts:6-25` — `createServerClient<Database>` from `@supabase/ssr` with the **anon key**, cookie-bridged via `parseCookieHeader` + `AstroCookies`. Returns `null` when env vars are unset (callers must handle this).
- No `auth.admin`, `service_role`, or `SUPABASE_SERVICE_ROLE_KEY` usage anywhere in `src/` (confirmed by grep; also confirmed by `context/archive/2026-06-07-auth-and-access-control/research.md:141` — "no SUPABASE_SERVICE_ROLE_KEY exists anywhere. RLS is therefore always active").
- **Secrets pattern (precedent):** env vars are declared in `astro.config.mjs:25-31` via `envField` (`context: "server", access: "secret", optional: true`): `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`. Server code imports them from `astro:env/server` — e.g. `src/lib/services/generation.ts:2` with a runtime null-guard that throws (`generation.ts:28-30`). Nothing uses `Astro.locals.runtime.env` or `process.env`.
- Production secrets are set with `npx wrangler secret put NAME`; local dev uses `.dev.vars`/`.env` (gitignored, `.gitignore:16-21`; no `.env.example` exists). `wrangler.jsonc` declares no `vars` block.
- A new admin client should use plain `createClient` from `@supabase/supabase-js` with `auth: { autoRefreshToken: false, persistSession: false }`, in a server-only module alongside `src/lib/supabase.ts`, following the same null-guard convention.

### Middleware & route gating

`src/middleware.ts`:

- `PUBLIC_ROUTES` (lines 5-12): the six `/auth/*` pages. `PUBLIC_API_ROUTES = ["/api/auth/"]` (line 13).
- Every request: `createClient(...)` → `supabase.auth.getUser()` → `context.locals.user = user ?? null` (lines 15-26).
- Non-public routes: API requests without a user get `401 { error: "Unauthorized" }` (line 39); page requests redirect to `/auth/signin` (line 41).
- **Implication 1:** `/settings.astro` is gated automatically — no extra code needed.
- **Implication 2:** anything under `/api/auth/` bypasses the guard (lines 30-32). A deletion endpoint at e.g. `/api/account` (DELETE) gets the 401 guard for free; placing it under `/api/auth/` would require a manual `locals.user` check.

### Auth API routes & password re-verification

- All auth routes export only `POST`, use `context.request.formData()`, redirect with `?error=` query params (no JSON), and rely on `@supabase/ssr` cookie handling: `src/pages/api/auth/signin.ts:4-20`, `signup.ts:4-20`, `signout.ts:4-10`, `forgot-password.ts:4-19`, `reset-password.ts:4-22`.
- Business API routes use a different, JSON-based pattern (see below) — the deletion endpoint fits the business pattern better than the form-redirect auth pattern, since it's called from a React modal via `fetch`.
- **Password re-verification:** no dedicated mechanism exists. The available primitive is `supabase.auth.signInWithPassword({ email, password })` (used in `signin.ts:13`) — calling it server-side with the signed-in user's email and the re-entered password verifies the password before deletion. `reset-password.ts:15` shows `auth.updateUser({ password })` (relevant later for the change-password placeholder).
- **Signout end-to-end** (the behavior moving into the avatar menu): form POST from `Topbar.astro:19-23` → `signout.ts` calls `supabase.auth.signOut()` → redirect `/` → middleware sees no user → `/auth/signin`. After account deletion the endpoint should similarly clear the session cookies (`signOut()`) before the client redirects.

### Business API route + service patterns (template for the deletion endpoint)

- Route shape (`src/pages/api/decks/[id].ts:80-102` DELETE; same in `src/pages/api/decks/[id]/cards/[cardId].ts:51-73`): `export const prerender = false`; guard `context.locals.user` → 401; validate input (Zod) → 400; `createClient` null-check → 503 "Database not configured"; try/catch around service call → 500 with `err.message`; success → `Response.json({})`.
- Service shape (`src/lib/services/decks.ts:106-112` `deleteDeck`, `src/lib/services/cards.ts:104-110` `deleteCard`): client passed as first param typed `NonNullable<ReturnType<typeof createClient>>`; ownership defense-in-depth via `.eq("user_id", userId)`; errors re-thrown as `Error(error.message)` (never swallowed — lessons.md rule).

### Topbar & avatar menu

- Current `src/components/Topbar.astro`: brand link (lines 11-14); signed-in state renders the "Wyloguj" form POST (lines 19-23) + `<ThemeToggle client:load />` (line 24); signed-out state (lines 27-35) stays unchanged. User comes from `Astro.locals.user` (line 5).
- `ThemeToggle.tsx` is the hydration precedent for a topbar React island: `useSyncExternalStore` + MutationObserver (`src/components/ThemeToggle.tsx:1-22`), hydrated with `client:load`.
- The avatar menu must be a React island (e.g. `src/components/UserMenu.tsx`) hydrated with `client:load`, receiving the user email as a prop from the Astro component. No DropdownMenu exists anywhere in the codebase today — this is the first one.
- The "Wyloguj" menu item must keep the POST semantics — either submit a hidden form programmatically or `fetch("/api/auth/signout", { method: "POST" })` + redirect.

### shadcn/ui inventory

- `src/components/ui/` contains only `button.tsx` (CVA variants incl. `destructive`) and `LibBadge.astro`. **Missing for this change:** `dropdown-menu`, `avatar`; (`dialog`/`input`/`label` optional — existing modals are hand-rolled).
- Only `@radix-ui/react-slot` is installed (`package.json:29`); `npx shadcn@latest add dropdown-menu avatar` will pull in `@radix-ui/react-dropdown-menu` / `@radix-ui/react-avatar` (per AGENTS.md convention).

### Typed-phrase confirmation precedent (S-02)

`src/components/decks/DeleteDeckModal.tsx:1-70`:

- Match logic: `const confirmed = inputValue === deckName;` (line 18); confirm button `disabled={!confirmed || isDeleting}` (line 58).
- Polish copy: "Usuń zestaw", "Ta operacja jest nieodwracalna. Wszystkie fiszki w zestawie zostaną usunięte.", "Wpisz `{deckName}`, aby potwierdzić:", "Anuluj" / "Usuwanie…".
- Error display above buttons (line 43); API call lives in the parent hook (`src/components/hooks/useDeckList.ts:59-69`, plain `fetch` + `!res.ok` → throw).
- **Caveat:** it renders inline (`if (!isOpen) return null;`, line 16) — it predates the lessons.md portal rule. The new account-deletion modal must use `createPortal`; correct examples: `src/components/review/ReviewModal.tsx:53`, `src/components/generation/GenerationModal.tsx:61,77`, `src/components/decks/DeckList.tsx:118` (toast).

### Settings page structure

Authenticated page template (`src/pages/dashboard.astro:1-27`, `src/pages/deck/[id].astro:1-21`): `Layout.astro` (sets `lang="pl"`, inline theme script, `src/layouts/Layout.astro:14-20`) + `Topbar.astro` + React islands with `client:load`. `/settings.astro` follows the same shape; user email available via `Astro.locals.user.email`.

## Code References

- `src/middleware.ts:5-13` — public routes list; `/api/auth/` prefix is fully public
- `src/middleware.ts:15-45` — locals.user population; 401 for APIs, redirect for pages
- `src/lib/supabase.ts:6-25` — anon-key SSR client factory (returns null when unconfigured)
- `astro.config.mjs:25-31` — env schema (`SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`); add `SUPABASE_SERVICE_ROLE_KEY` here
- `src/lib/services/generation.ts:2,28-30` — server-secret access precedent (`astro:env/server` + null-guard throw)
- `supabase/migrations/20260526220447_initial_schema.sql:13,34-35,61-62` — ON DELETE CASCADE FKs (decks, cards, card_sr_state)
- `supabase/migrations/20260602000000_review_session.sql:10-11,28-30` — review_logs FKs + SELECT/INSERT-only RLS
- `src/lib/database.types.ts:37,99,140,164` — complete table inventory
- `src/pages/api/auth/signin.ts:13` — `signInWithPassword` (password re-verification primitive)
- `src/pages/api/auth/signout.ts:4-10` — session cleanup to reuse post-deletion
- `src/pages/api/decks/[id].ts:80-102` — DELETE route pattern (401/400/503/500/JSON)
- `src/lib/services/decks.ts:106-112` — service-layer delete pattern
- `src/components/Topbar.astro:16-25` — signed-in topbar section being replaced
- `src/components/ThemeToggle.tsx:24-31` — topbar React island precedent
- `src/components/decks/DeleteDeckModal.tsx:16-58` — typed-phrase confirmation precedent (inline-rendered; do not copy the no-portal part)
- `src/components/review/ReviewModal.tsx:53` — correct `createPortal` modal pattern
- `src/components/hooks/useDeckList.ts:59-69` — fetch + error-throw pattern for destructive calls

## Architecture Insights

- **Two API route dialects coexist:** form-POST + redirect-with-`?error=` for auth routes vs JSON + status codes + Zod for business routes. The deletion endpoint is called from a React modal, so the JSON dialect at `/api/account` is the natural fit and gets middleware auth for free.
- **Defense-in-depth ownership:** services always chain `.eq("user_id", userId)` on top of RLS. The admin client bypasses RLS entirely — it must only ever receive `locals.user.id` (never a client-supplied id).
- **Secrets are schema-declared, not ambient:** all server secrets flow through `astro.config.mjs` `envField` → `astro:env/server`; they are optional, so every consumer null-guards. The admin client factory should return null/throw consistently with `src/lib/supabase.ts` and `generation.ts`.
- **Deletion ordering:** verify password → `auth.admin.deleteUser(user.id)` (cascades wipe app data atomically in one transaction) → `signOut()` to clear cookies → client redirects to a signed-out page. Errors at any step must surface to the user (lessons.md "never swallow errors") — there is no partial-failure window between app data and auth user because cascades are DB-level.

## Historical Context (from prior changes)

- `context/archive/2026-05-26-db-schema-rls/plan.md:90-186` — the `ON DELETE CASCADE` FKs from `auth.users` were a deliberate F-01 design decision; account deletion was anticipated.
- `context/archive/2026-05-30-deck-management/plan.md:182-187` — GitHub-style typed-name confirmation design rationale and `DeleteDeckModal` props shape.
- `context/archive/2026-06-01-password-reset/plan.md` — server-side Supabase auth action patterns (`exchangeCodeForSession`, `updateUser`); confirms no admin access existed.
- `context/archive/2026-06-02-ui-polish/plan.md:132-152` — Topbar rework decisions; the structure now being modified.
- `context/archive/2026-06-07-auth-and-access-control/research.md:141` — explicit confirmation that no service-role key exists and RLS is always active.
- `context/foundation/roadmap.md:204-214` — S-09 definition and the orphaned-data risk note.
- `context/foundation/prd.md:177-191,238` — GDPR-baseline right-to-erasure NFR; deeper compliance is out of scope.
- `context/foundation/infrastructure.md:45` — secrets managed via wrangler secrets on Cloudflare.
- `context/foundation/lessons.md` — four binding rules: Polish UI copy, `createPortal` for all modals, LF line endings, never swallow errors.

## Related Research

- `context/archive/2026-06-07-auth-and-access-control/research.md` — auth/RLS isolation research; closest prior artifact.

## Open Questions

1. **Confirmation mechanism choice:** password re-entry vs typed phrase (e.g. "USUŃ KONTO") — `change.md` allows either ("consistent with the typed-name deck-delete pattern from S-02"). Password re-entry is stronger (proves identity, not just intent) and the primitive exists; a decision is needed at plan time.
2. **Post-deletion UX:** where to land the user after deletion — `/auth/signin` with a confirmation notice, or a dedicated "konto usunięte" page? Also whether `signOut()` after `admin.deleteUser` errors (session already invalid) and needs tolerant handling.
3. **`SUPABASE_SERVICE_ROLE_KEY` provisioning:** secret must be added to local `.dev.vars`/`.env` and via `npx wrangler secret put` in production — a deploy-time TODO in the same spirit as the existing `TODO(deploy)` comments in `forgot-password.ts:12-13`.
4. **E2E test impact:** Playwright tests exist (`npx playwright test`); deleting test users could become a useful test-cleanup utility, but tests for the deletion flow need a disposable-user strategy.
