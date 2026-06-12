# Account Deletion (S-09) Implementation Plan

## Overview

Implement permanent account deletion behind a new `/settings` page reached from a new topbar avatar menu. Deleting the account removes the auth user and — via existing FK cascades — all app data (decks, cards, SR state, review logs), satisfying the PRD's GDPR right-to-erasure baseline. UI copy is Polish throughout.

## Current State Analysis

- The topbar (`src/components/Topbar.astro:16-25`) renders a plain "Wyloguj" form POST for signed-in users; there is no settings page and no avatar menu.
- Every app table cascades from `auth.users` (`supabase/migrations/20260526220447_initial_schema.sql:13,34-35,61-62`; `20260602000000_review_session.sql:10-11`), so deleting the auth user wipes all app data with zero orphans. `review_logs` RLS is SELECT/INSERT-only, which rules out user-client deletion and confirms the admin-API path.
- No service-role key or admin client exists anywhere (`src/lib/supabase.ts` is anon-key only). `auth.admin.deleteUser` requires new infrastructure: a `SUPABASE_SERVICE_ROLE_KEY` secret and a server-only admin client.
- Middleware (`src/middleware.ts:13,30-32`) treats everything under `/api/auth/` as public — the deletion endpoint must live elsewhere (`/api/account`) to get the 401 guard for free.
- `src/components/ui/` has only `button.tsx`; shadcn `dropdown-menu`, `avatar`, `alert-dialog`, `input`, `label` must be added.
- **Playwright login chain depends on the current topbar**: `tests/login.setup.ts:18` asserts a visible "Wyloguj" button after sign-in. Moving "Wyloguj" into a dropdown breaks every E2E run unless that assertion is updated in the same change.

## Desired End State

- Signed-in users see an avatar button (generic user icon) in the topbar; it opens a dropdown with "Ustawienia" (gear icon → `/settings`) and "Wyloguj" (logout icon, existing POST semantics).
- `/settings` (auth-gated by middleware automatically) shows the user's email read-only, a disabled "Zmień hasło" button with a "Wkrótce" hint, and a destructive "Usuń konto" button.
- "Usuń konto" opens a shadcn AlertDialog requiring the typed phrase **USUŃ KONTO**; on confirm, `DELETE /api/account` verifies the phrase server-side, deletes the auth user via the admin API (cascades wipe app data), clears the session, and the client lands on `/auth/signin?notice=account-deleted` showing "Twoje konto zostało usunięte."
- Unit tests cover the service and route handler; a Playwright spec proves the full flow with a disposable user without harming the shared `PLAYWRIGHT_USER`.

### Key Discoveries:

- FK cascades make `auth.admin.deleteUser(userId)` the only deletion call needed — no app-row cleanup (`research.md`, schema migrations above).
- Secrets pattern: declare in `astro.config.mjs:25-31` via `envField` (server/secret/optional), import from `astro:env/server`, null-guard like `src/lib/services/generation.ts:28-30`.
- Business API route template: `src/pages/api/decks/[id].ts:80-102` (401 → Zod 400 → 503 unconfigured → try/catch 500 → `Response.json`).
- Typed-phrase precedent: `src/components/decks/DeleteDeckModal.tsx:18` (`inputValue === phrase` gating the confirm button) — but it renders inline; the new modal uses shadcn AlertDialog (Radix portal, satisfies the lessons.md portal rule).
- Topbar React island precedent: `src/components/ThemeToggle.tsx` hydrated `client:load`, user data from `Astro.locals`.
- Unit-test style: mocked Supabase chains, Polish `describe`/`it` strings (`src/test/access-control.test.ts`).
- E2E signup works without email confirmation (`tests/setup.ts` signs up, `tests/login.setup.ts` signs in immediately) — a disposable-user spec is feasible.

## What We're NOT Doing

- No change-password implementation — only a disabled placeholder (separate future change).
- No soft-delete, grace period, or undo (PRD non-goal: deletion is permanent and irreversible).
- No password re-entry confirmation — typed phrase only (decision).
- No dedicated "konto usunięte" page — signin page notice instead (decision).
- No changes to the signed-out topbar state.
- No deeper GDPR tooling (data export, audit trail) — out of PRD scope.
- No migration of existing hand-rolled modals to shadcn Dialog.

## Implementation Approach

Backend first (secret → admin client → service → endpoint, fully unit-tested), then the settings page with the deletion flow (reachable by direct URL), then the topbar avatar menu (including the Playwright login-setup fix it forces), and finally the disposable-user E2E spec. Each phase is independently shippable; the deletion endpoint follows the JSON business-route dialect, not the form-redirect auth dialect, because it is called from a React modal via `fetch`.

## Critical Implementation Details

- **Admin client must only ever receive `locals.user.id`.** It bypasses RLS entirely; never accept a client-supplied user id anywhere in the deletion path.
- **`signOut()` after `deleteUser` may fail — tolerate it deliberately.** Once the auth user is deleted, the server-side `signOut()` can error because the session's user no longer exists. Deletion has already succeeded at that point; wrap only the `signOut()` call in a try/catch that proceeds to the 200 response, with a code comment marking this as a deliberate exception to the never-swallow-errors rule. Stale cookies are harmless: middleware calls `supabase.auth.getUser()` per request, which returns null for a deleted user, so the next navigation is treated as signed-out.
- **`tests/login.setup.ts:18` must change in the same commit as the topbar** (Phase 3). It asserts `getByRole("button", { name: "Wyloguj" })` is visible after login; once "Wyloguj" lives inside the dropdown that locator finds nothing and the whole E2E dependency chain (`login` → `chromium`/`firefox`/`webkit`) fails. Give the avatar trigger `aria-label="Menu użytkownika"` and assert on that instead.
- **The E2E spec must not touch `PLAYWRIGHT_USER`.** Other specs depend on its saved storage state. The deletion spec starts with an empty `storageState` and signs up its own plus-addressed disposable user.

## Phase 1: Deletion backend

### Overview

Add the service-role secret and admin client, the `account` service, and the `DELETE /api/account` endpoint, with unit tests for both layers.

### Changes Required:

#### 1. Env schema

**File**: `astro.config.mjs`

**Intent**: Declare the new server secret alongside the existing ones so it flows through `astro:env/server`.

**Contract**: `SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true })` added to the existing `env.schema` block (lines 25-31).

#### 2. Admin client factory

**File**: `src/lib/supabase-admin.ts` (new)

**Intent**: Server-only factory for a service-role Supabase client, mirroring the null-when-unconfigured convention of `src/lib/supabase.ts`.

**Contract**: `createAdminClient(): SupabaseClient<Database> | null` — returns `null` when `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is unset. The non-obvious part is the auth config, required so the admin client never persists or refreshes sessions:

```ts
createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

Uses plain `createClient` from `@supabase/supabase-js` (not `@supabase/ssr` — no cookies involved).

#### 3. Account service

**File**: `src/lib/services/account.ts` (new)

**Intent**: Business logic for account deletion, following the service shape of `src/lib/services/decks.ts:106-112`.

**Contract**: `deleteAccount(admin, userId)` calls `admin.auth.admin.deleteUser(userId)` and rethrows any error as `Error(error.message)` (never swallowed). FK cascades handle all app data — no other calls.

#### 4. Deletion endpoint

**File**: `src/pages/api/account.ts` (new)

**Intent**: `DELETE` route called by the settings modal; follows the business-route template (`src/pages/api/decks/[id].ts:80-102`), deliberately outside `/api/auth/` so middleware guards it.

**Contract**: `export const prerender = false`; `DELETE` handler: `locals.user` guard → 401; JSON body validated with Zod (defined in the route file, per the decks-route pattern) requiring `confirmation` to be the literal `"USUŃ KONTO"` → 400 with a Polish error; `createAdminClient()` and `createClient(...)` null-checks → 503 "Baza danych nie jest skonfigurowana"; `deleteAccount(admin, locals.user.id)` in try/catch → 500 with the error message; then best-effort `supabase.auth.signOut()` (tolerated failure, see Critical Implementation Details); success → `Response.json({})`.

#### 5. Unit tests

**File**: `src/test/account.test.ts` (new)

**Intent**: Cover the service and the route handler in the existing mocked-client style (`src/test/access-control.test.ts`, `src/test/middleware.test.ts`), Polish test descriptions.

**Contract**: Service — success resolves, admin error rethrows with the original message. Route handler — 401 without `locals.user`; 400 for missing/wrong confirmation phrase; 503 when the admin client is unconfigured; 500 when `deleteUser` fails (message propagated); 200 on success even when `signOut()` throws; asserts `deleteUser` is called with `locals.user.id` and never a body-supplied id.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass (including new `src/test/account.test.ts`): `npm run test`

#### Manual Verification:

- With `SUPABASE_SERVICE_ROLE_KEY` set in `.env`, deleting a throwaway user via `curl -X DELETE` (signed-in cookie, correct phrase) removes the auth user and all their rows in Supabase (decks/cards/sr/logs all gone)
- Wrong phrase returns 400 with Polish error; missing secret returns 503

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Settings page + delete-account flow

### Overview

Build `/settings` with the email display, change-password placeholder, and the AlertDialog-based deletion flow, plus the post-deletion notice on the signin page.

### Changes Required:

#### 1. shadcn components

**Files**: `src/components/ui/alert-dialog.tsx`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx` (generated)

**Intent**: First Radix dialog in the codebase, for the deletion confirmation; input/label for the typed phrase.

**Contract**: `npx shadcn@latest add alert-dialog input label` (new-york style per components.json). AlertDialog portals by default, satisfying the lessons.md portal rule.

#### 2. Settings page

**File**: `src/pages/settings.astro` (new)

**Intent**: Server-rendered authenticated page following the `src/pages/dashboard.astro` template (Layout + Topbar). Middleware gates it automatically — no extra guard code.

**Contract**: Title "Ustawienia". Three sections: **Konto** — the user's email (`Astro.locals.user.email`) read-only; **Hasło** — disabled "Zmień hasło" button with a muted "Wkrótce" hint; **Usuń konto** — danger-zone section with Polish warning copy ("Ta operacja jest nieodwracalna…") hosting the React island.

#### 3. Delete-account island

**File**: `src/components/settings/DeleteAccountSection.tsx` (new)

**Intent**: Destructive "Usuń konto" button opening an AlertDialog with typed-phrase confirmation, modeled on the `DeleteDeckModal.tsx:18` gating logic but built on AlertDialog.

**Contract**: Hydrated `client:load`. Dialog copy in Polish; an Input labeled "Wpisz **USUŃ KONTO**, aby potwierdzić:"; confirm button (destructive variant) disabled until the input exactly equals `USUŃ KONTO` or while the request is in flight ("Usuwanie…"). On confirm: `fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "USUŃ KONTO" }) })`; on `!res.ok` surface the server error inside the dialog (never swallow); on success `window.location.assign("/auth/signin?notice=account-deleted")`.

#### 4. Signin notice

**File**: `src/pages/auth/signin.astro`

**Intent**: Render a one-time success notice after deletion, reusing the existing query-param pattern (the page already reads `error`).

**Contract**: Read `notice` from `Astro.url.searchParams`; when it equals `account-deleted`, render "Twoje konto zostało usunięte." in a success-styled block above the form. Unknown values render nothing.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- `/settings` (direct URL) shows email, disabled "Zmień hasło" + "Wkrótce", and "Usuń konto"; unauthenticated access redirects to `/auth/signin`
- Confirm button stays disabled for partial/wrong phrase; enables only on exact `USUŃ KONTO`
- Full flow with a throwaway account: delete → land on signin with "Twoje konto zostało usunięte." → signing in with the deleted credentials fails
- API error (e.g. secret unset) shows a Polish error inside the dialog; dialog stays open

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Topbar avatar menu

### Overview

Replace the inline "Wyloguj" button with an avatar dropdown menu and update the Playwright login setup that depends on the old button.

### Changes Required:

#### 1. shadcn components

**Files**: `src/components/ui/dropdown-menu.tsx`, `src/components/ui/avatar.tsx` (generated)

**Intent**: First DropdownMenu/Avatar in the codebase, for the topbar menu.

**Contract**: `npx shadcn@latest add dropdown-menu avatar`.

#### 2. User menu island

**File**: `src/components/UserMenu.tsx` (new)

**Intent**: React island (`client:load`, like `ThemeToggle.tsx`) rendering the avatar trigger and the two menu items.

**Contract**: Trigger — Avatar with `AvatarFallback` containing the lucide `User` icon (generic icon decision), `aria-label="Menu użytkownika"` (the new E2E login anchor). Items: "Ustawienia" with `Settings` icon navigating to `/settings`; "Wyloguj" with `LogOut` icon preserving POST semantics — a hidden `<form method="POST" action="/api/auth/signout">` submitted via `requestSubmit()` from the menu item, so the browser follows the server redirect natively.

#### 3. Topbar update

**File**: `src/components/Topbar.astro`

**Intent**: Swap the signed-in "Wyloguj" form (lines 19-23) for `<UserMenu client:load />` next to `ThemeToggle`. Signed-out state untouched.

**Contract**: Signed-in right side becomes `UserMenu` + `ThemeToggle`.

#### 4. Playwright login setup fix

**File**: `tests/login.setup.ts`

**Intent**: The post-login assertion targets the removed "Wyloguj" button; repoint it so the E2E dependency chain keeps working (must land in the same commit as the Topbar change).

**Contract**: Replace the line-18 assertion with visibility of the avatar trigger: `getByRole("button", { name: "Menu użytkownika" })`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`
- Existing E2E suite still passes (login chain intact): `npx playwright test`

#### Manual Verification:

- Avatar menu opens; "Ustawienia" navigates to `/settings`; "Wyloguj" signs out and lands on the signin page
- Menu closes on Escape and outside click; signed-out topbar unchanged
- Works in both themes (ThemeToggle still functional next to the menu)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 4: E2E deletion spec

### Overview

Prove the full browser flow with a disposable user, without touching the shared `PLAYWRIGHT_USER`.

### Changes Required:

#### 1. Deletion spec

**File**: `e2e/account-deletion.spec.ts` (new)

**Intent**: End-to-end proof of the riskiest flow in the app: signup → delete account → locked out.

**Contract**: `test.use({ storageState: { cookies: [], origins: [] } })` so the spec ignores the shared auth state. Disposable user: plus-addressed variant of `PLAYWRIGHT_USER` (e.g. `name+delete-${Date.now()}@domain`) with `PLAYWRIGHT_USER_PASS`, signed up through the UI using the selectors from `tests/setup.ts`. Flow: sign up → open avatar menu → "Ustawienia" → "Usuń konto" → type `USUŃ KONTO` → confirm → expect URL `/auth/signin?notice=account-deleted` and the notice text visible → attempt signin with the deleted credentials → expect an error (still on signin page). The spec never references `PLAYWRIGHT_USER` itself.

### Success Criteria:

#### Automated Verification:

- New spec passes: `npx playwright test e2e/account-deletion.spec.ts`
- Full suite passes (shared user unharmed by the run): `npx playwright test`
- Lint/typecheck pass: `npm run lint`, `npm run typecheck`

#### Manual Verification:

- After a full E2E run, `PLAYWRIGHT_USER` still exists and can sign in
- No disposable-user residue visible in the Supabase dashboard (auth user deleted)

---

## Testing Strategy

### Unit Tests:

- `src/test/account.test.ts`: service success/error propagation; route handler status matrix (401/400/503/500/200); `deleteUser` receives `locals.user.id` only; success despite `signOut()` failure.
- Key edge cases: wrong/missing confirmation phrase; unconfigured admin client; admin API error message propagation.

### Integration Tests:

- `e2e/account-deletion.spec.ts` (Phase 4) covers the browser flow end to end against a real Supabase instance.

### Manual Testing Steps:

1. Create a throwaway account, add a deck with cards and review one card (populates all four tables), then delete the account from `/settings`.
2. Verify in Supabase: auth user gone, zero rows remain in `decks`, `cards`, `card_sr_state`, `review_logs` for that user id.
3. Verify the signin notice renders and signing in with deleted credentials fails.
4. Verify `/settings` and `DELETE /api/account` reject unauthenticated requests (redirect / 401).

## Performance Considerations

None material — deletion is a single admin API call; cascades run in one DB transaction. The dropdown/avatar components add small, route-shared client JS to every authenticated page (consistent with the existing `ThemeToggle` island).

## Migration Notes

- **Secret provisioning (deploy-time TODO, same spirit as `forgot-password.ts:12-13`)**: set `SUPABASE_SERVICE_ROLE_KEY` locally in `.env` (gitignored) and in production via `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` before the feature works outside dev. Until set, the endpoint degrades to 503 — no crash.
- No schema migrations: the `ON DELETE CASCADE` FKs from F-01 already anticipate account deletion.
- Update `change.md` to `status: planned` (done as part of this planning session).

## References

- Related research: `context/changes/account-deletion/research.md`
- Change definition: `context/changes/account-deletion/change.md`
- Roadmap slice: `context/foundation/roadmap.md` (S-09)
- Route template: `src/pages/api/decks/[id].ts:80-102`
- Service template: `src/lib/services/decks.ts:106-112`
- Secrets precedent: `astro.config.mjs:25-31`, `src/lib/services/generation.ts:28-30`
- Typed-phrase precedent: `src/components/decks/DeleteDeckModal.tsx:16-58`
- Topbar island precedent: `src/components/ThemeToggle.tsx`
- E2E login chain: `playwright.config.ts:38-71`, `tests/login.setup.ts`, `tests/setup.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Deletion backend

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — a8b9f7e
- [x] 1.2 Linting passes: `npm run lint` — a8b9f7e
- [x] 1.3 Unit tests pass (including new `src/test/account.test.ts`): `npm run test` — a8b9f7e

#### Manual

- [x] 1.4 Throwaway-user deletion via curl removes auth user and all app rows — a8b9f7e
- [x] 1.5 Wrong phrase returns 400 (Polish error); missing secret returns 503 — a8b9f7e

### Phase 2: Settings page + delete-account flow

#### Automated

- [ ] 2.1 Type checking passes: `npm run typecheck`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Build succeeds: `npm run build`

#### Manual

- [ ] 2.4 `/settings` renders email, disabled "Zmień hasło" + "Wkrótce", "Usuń konto"; unauthenticated access redirects
- [ ] 2.5 Confirm button gated on exact `USUŃ KONTO` phrase
- [ ] 2.6 Full delete flow: redirect to signin with notice; deleted credentials rejected
- [ ] 2.7 API error shown in Polish inside the dialog; dialog stays open

### Phase 3: Topbar avatar menu

#### Automated

- [ ] 3.1 Type checking passes: `npm run typecheck`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Unit tests pass: `npm run test`
- [ ] 3.4 Existing E2E suite passes (login chain intact): `npx playwright test`

#### Manual

- [ ] 3.5 Avatar menu opens; "Ustawienia" navigates; "Wyloguj" signs out
- [ ] 3.6 Menu closes on Escape/outside click; signed-out topbar unchanged
- [ ] 3.7 Works in both themes

### Phase 4: E2E deletion spec

#### Automated

- [ ] 4.1 New spec passes: `npx playwright test e2e/account-deletion.spec.ts`
- [ ] 4.2 Full suite passes: `npx playwright test`
- [ ] 4.3 Lint/typecheck pass: `npm run lint`, `npm run typecheck`

#### Manual

- [ ] 4.4 `PLAYWRIGHT_USER` still exists and signs in after the run
- [ ] 4.5 No disposable-user residue in Supabase
