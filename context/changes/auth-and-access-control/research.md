---
date: 2026-06-07T12:00:00+02:00
researcher: 10x-research
git_commit: 4567b915aed94739d1c3022b8a34afaf664de42a
branch: main
repository: 10xDEVv3
topic: "Phase 3 auth-and-access-control — prove no unauthenticated or cross-user access through app routes"
tags: [research, codebase, testing, auth, rls, middleware, access-control]
status: complete
last_updated: 2026-06-07
last_updated_by: Zbigniew Jędraczka
---

# Research: Auth and Access Control (Phase 3)

**Date**: 2026-06-07T12:00:00+02:00
**Researcher**: Zbigniew Jędraczka
**Git Commit**: 4567b915aed94739d1c3022b8a34afaf664de42a
**Branch**: main
**Repository**: 10xDEVv3

## Research Question

Map and evaluate every auth and access-control layer in the 10xCards app so that
Phase 3 integration tests can be written with confidence: (a) **Risk #6** — prove
no unauthenticated user can reach any product route, and (b) **Risk #4** — prove
no authenticated user can read or modify another user's data.

## Summary

The app uses a **three-layer defense**:

1. **Global middleware** (`src/middleware.ts`) — default-deny with a whitelist of public routes; blocks unauthenticated requests before the route handler runs.
2. **Per-route auth check** — every product API route independently checks `context.locals.user` and returns 401; this layer would survive a middleware misconfiguration.
3. **Database RLS** (`auth.uid() = user_id`) on all four user-scoped tables — the last line of defense even if the application layer is bypassed.

No service-role key exists anywhere in the codebase. Every Supabase query goes through the anon/user key, so RLS is always active. Service functions receive the client by dependency injection and always add `.eq("user_id", userId)` filters as defense-in-depth.

**One minor gap found:** `review_logs` has RLS enabled but only SELECT + INSERT policies — intentionally append-only. The missing UPDATE/DELETE policies mean Postgres default-deny applies (safe), but intent is implicit. Recommend adding explicit `USING (false)` denial policies before shipping Phase 3 tests to make the invariant explicit and auditable.

No other RLS gap, no bypass route, and no service-role privilege escalation was found.

---

## Detailed Findings

### Risk #6 — Auth Gate (Middleware + Per-Route Checks)

#### Middleware architecture (`src/middleware.ts:1-47`)

The middleware is **global** (Astro's `src/middleware.ts` convention applies automatically to all routes). It uses a **whitelist with default-deny**:

```typescript
const PUBLIC_ROUTES = [
  "/auth/signin",
  "/auth/signup",
  "/auth/confirm-email",
  "/auth/forgot-password",
  "/auth/forgot-password-sent",
  "/auth/reset-password",
];
const PUBLIC_API_ROUTES = ["/api/auth"];
```

Matching is `startsWith()` (lines 30, 35). Any path not matched by these whitelists is protected. This means **new routes added to `src/pages/api/` are protected automatically** — the whitelist-based design avoids the "stale route list" anti-pattern.

**Unauthenticated access response:**
- Non-API paths: `context.redirect("/auth/signin")` (line 41)
- API paths: `Response.json({ error: "Unauthorized" }, { status: 401 })` (line 39)

**Auth identification**: `supabase.auth.getUser()` is called against the session cookie from request headers (lines 17-21). Session management uses `@supabase/ssr` `createServerClient` — cryptographically signed JWTs.

#### Product pages inventory

| Path | Protection |
|---|---|
| `/dashboard` (`src/pages/dashboard.astro`) | Middleware → protected |
| `/deck/[id]` (`src/pages/deck/[id].astro`) | Middleware → protected |
| `/` (`src/pages/index.astro`) | Redirects to `/dashboard` |
| `/generate` (`src/pages/generate.astro`) | 301 redirect to `/dashboard` |

#### Product API routes — all double-checked

All 11 product API routes independently call `if (!context.locals.user) return 401`:

| Route | Methods | Auth check line |
|---|---|---|
| `src/pages/api/decks.ts` | GET, POST | 8, 28 |
| `src/pages/api/decks/[id].ts` | GET, PATCH, DELETE | 10, 45, 82 |
| `src/pages/api/decks/[id]/cards.ts` | POST | 9 |
| `src/pages/api/decks/[id]/cards/[cardId].ts` | PATCH, DELETE | 9, 52 |
| `src/pages/api/decks/[id]/review.ts` | GET | 9 |
| `src/pages/api/decks/[id]/review/[cardId].ts` | POST | 9 |
| `src/pages/api/decks/[id]/reset-progress.ts` | POST | 8 |
| `src/pages/api/generate.ts` | POST | 8 |

Auth API routes (`/api/auth/*`) are correctly excluded from middleware enforcement and perform no auth check (they implement auth, not consume it).

#### `startsWith()` edge note

The `startsWith()` matching is slightly permissive. Example: a future `/api/auth-new/endpoint` would match `PUBLIC_API_ROUTES` and be accessible without auth. This is not a current vulnerability (no such routes exist), but is worth a comment in the middleware or an integration test that guards the prefix.

---

### Risk #4 — Cross-User Isolation (RLS + Application Filters)

#### RLS policy map

All four user-scoped tables have `ENABLE ROW LEVEL SECURITY`:

**`decks`** (`20260526220447_initial_schema.sql:21-25`) — complete:
```sql
CREATE POLICY "decks: owner select" ON decks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "decks: owner insert" ON decks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "decks: owner update" ON decks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "decks: owner delete" ON decks FOR DELETE USING (auth.uid() = user_id);
```

**`cards`** (`20260526220447_initial_schema.sql:46-50`) — complete (same pattern).

**`card_sr_state`** (`20260526220447_initial_schema.sql:79-83`) — complete (same pattern).

**`review_logs`** (`20260602000000_review_session.sql:28-30`) — partial:
```sql
CREATE POLICY "review_logs: owner select" ON review_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "review_logs: owner insert" ON review_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No UPDATE or DELETE policy
```

The table is intentionally append-only (comment in migration line 7). The missing UPDATE/DELETE policies result in **Postgres default-deny** for those operations — functionally correct, but intent is implicit. Recommended explicit denial:

```sql
CREATE POLICY "review_logs: owner update" ON review_logs FOR UPDATE USING (false);
CREATE POLICY "review_logs: owner delete" ON review_logs FOR DELETE USING (false);
```

This is a migration-only fix (no application code change needed) and should be added before Phase 3 tests to make the invariant auditable rather than relying on Postgres default behavior.

#### Supabase client — anon key only

`src/lib/supabase.ts:6-25` has the only client factory in the codebase. It uses `SUPABASE_KEY` (the anon key) — no `SUPABASE_SERVICE_ROLE_KEY` exists anywhere. RLS is therefore always active.

`astro.config.mjs:17-23` declares three env vars: `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`. No service-role key is declared or expected.

#### Dependency injection pattern

Services never create their own Supabase client. Every service function signature:

```typescript
function serviceName(supabase: SupabaseClientType, userId: string, ...) { ... }
```

The route handler creates the client (`createClient(context.request.headers, context.cookies)`) and passes it in. The service layer cannot accidentally introduce a privilege-elevated client.

#### Application-level user_id filters (defense-in-depth)

Every query across `decks.ts`, `cards.ts`, and `sr.ts` adds `.eq("user_id", userId)`. Examples:

- `decks.ts:57` — `listDecksWithCardCount`: `.eq("user_id", userId)` on SELECT
- `decks.ts:96-97` — `renameDeck`: `.eq("user_id", userId)` on UPDATE
- `decks.ts:107` — `deleteDeck`: `.eq("user_id", userId)` on DELETE
- `decks.ts:128-130` — `appendCardsToDeck`: ownership SELECT before INSERT
- `cards.ts:22` — `listCardsInDeck`: `.eq("user_id", userId)`
- `cards.ts:93` — `updateCard`: `.eq("user_id", userId)`
- `cards.ts:105` — `deleteCard`: `.eq("user_id", userId)`
- `sr.ts:107` — `applyRating`: `.eq("user_id", userId)` + `.eq("cards.deck_id", deckId)` (double ownership check)

#### SECURITY DEFINER trigger

`create_card_sr_state()` (`20260526220447_initial_schema.sql:89-105`) runs as the DB owner (SECURITY DEFINER) to auto-insert a `card_sr_state` row on card insert. It copies `user_id` from `NEW.user_id`, so the resulting row is correctly owned by the triggering user — no cross-user data leakage. The elevated privilege is necessary to bypass the `card_sr_state` INSERT RLS policy that would otherwise block the trigger. This is the Supabase-recommended pattern.

---

## Code References

- `src/middleware.ts:1-47` — global middleware, whitelist, auth check, 401/redirect logic
- `src/lib/supabase.ts:1-26` — single client factory (anon key, SSR cookies)
- `astro.config.mjs:17-23` — env schema (no service-role key declared)
- `src/pages/api/decks.ts:8,28` — representative per-route auth check pattern
- `src/pages/api/decks/[id].ts:10,45,82` — auth check on all methods
- `src/lib/services/decks.ts:53-70` — `listDecksWithCardCount` with `.eq("user_id")`
- `src/lib/services/decks.ts:93-112` — `renameDeck`, `deleteDeck` with ownership `.eq`
- `src/lib/services/decks.ts:114-146` — `appendCardsToDeck` with pre-INSERT ownership SELECT
- `src/lib/services/cards.ts:17-30,85-110` — card CRUD with `.eq("user_id", userId)` everywhere
- `src/lib/services/sr.ts:94-132` — `applyRating` with user + deck membership double-check
- `supabase/migrations/20260526220447_initial_schema.sql:21-25,46-50,79-83` — RLS policies for decks/cards/card_sr_state
- `supabase/migrations/20260526220447_initial_schema.sql:89-105` — SECURITY DEFINER trigger
- `supabase/migrations/20260602000000_review_session.sql:28-30` — review_logs partial RLS
- `supabase/config.toml:150-178` — auth config (anon sign-ins disabled, JWT 3600s, refresh rotation on)

---

## Architecture Insights

**Whitelist-based default-deny middleware** is the right architecture for Risk #6 — the inverse (opt-in protection per route) would leave new routes unguarded by default. Every new route added to `src/pages/api/` that isn't explicitly added to `PUBLIC_API_ROUTES` gets middleware protection for free.

**Dependency injection throughout the service layer** is the right architecture for Risk #4 — the client carrying the user's session JWT is the only client that ever reaches the DB. There's no internal seam where a service could accidentally switch to a privileged client.

**Defense-in-depth at three layers** (middleware → route check → RLS + app filter) means a single misconfiguration in any one layer does not expose user data. This is strong, but the overlapping filters also mean that a test must be careful to challenge each layer independently — if only the app filter is tested, an RLS gap wouldn't surface.

The **`startsWith()` matching** on public route prefixes is a minor structural risk worth monitoring. A future route like `/api/auth-settings` would match `/api/auth` and be unintentionally public. The mitigation is an integration test that verifies `/api/auth/` routes are public and `/api/auth` with a non-matching suffix is not.

---

## Historical Context (from prior changes)

- `context/archive/2026-05-26-db-schema-rls/plan.md` — full schema plan; RLS policy text adopted verbatim in the migration. The plan explicitly noted `SECURITY DEFINER` for the trigger and why it's needed. The `review_logs` table was added in a later migration (`20260602000000_review_session.sql`) and followed the decks/cards pattern except for missing UPDATE/DELETE policies.
- `context/archive/2026-06-06-testing-critical-path-coverage/research.md` — established that service functions take `supabase` as first param (the DI seam for hermetic tests). Also confirmed: `src/pages/api/generate.ts:8-10` has the auth check, and `src/lib/supabase.ts:3,6-25` is the single client factory. Confirmed no service-role key in Phase 1.
- `context/foundation/test-plan.md §2` — Risk #4 anti-pattern: "Testing Supabase's RLS engine in isolation rather than the app's actual queries through it." Risk #6 anti-pattern: "Hardcoding the route list in the test." Both drive the test design below.

---

## Related Research

- `context/archive/2026-06-06-testing-critical-path-coverage/research.md` — Phase 1 research; established the hermetic stub pattern and service DI architecture.

---

## Test Design Implications for Phase 3

### Risk #6 — auth gate integration tests

**What to prove**: An unauthenticated request to any product route returns 401 (API) or redirect (page) — never 200 with content.

**Test seam**: Middleware is the correct seam. The middleware is a function (`onRequest`) that accepts a `context` and `next`. Unit-test the middleware directly by:
1. Constructing a mock context with `context.locals.user = null` and a non-public pathname
2. Verifying the middleware returns a `Response` with status 401 (for API paths) rather than calling `next()`

This approach avoids hardcoding route lists — the test validates the mechanism (everything not in `PUBLIC_ROUTES`/`PUBLIC_API_ROUTES` is blocked), not the inventory.

**Additional integration slice**: Hit one real API route (e.g. `GET /api/decks`) with no session cookie against a running Astro server and verify 401. This pins the end-to-end wire.

**Auth routes must remain accessible**: test that `POST /api/auth/signin` with no session still gets through (middleware `PUBLIC_API_ROUTES` pass-through).

**Test infrastructure needed**: Mock `supabase.auth.getUser()` to return `{ data: { user: null } }` — no real Supabase needed for Risk #6 tests.

### Risk #4 — cross-user isolation integration tests

**What to prove**: A request authenticated as User A attempting to read or modify User B's resources returns 0 rows or 404/403 — never User B's data.

**Two-user setup**: The test needs two distinct `userId` values. Given the DI pattern, this can be achieved with hermetic stubs that represent two different users' clients:
- `supabaseUserA.from("decks")...` with `auth.uid()` = userA's id
- `supabaseUserB.from("decks")...` with `auth.uid()` = userB's id

**Cheapest layer that gives real signal**: Service-layer integration with hermetic stubs, verifying that cross-user queries (User B's client querying User A's `deckId`) return empty results or error — this tests the application's `.eq("user_id", userId)` filter chain without needing a real DB or RLS verification.

**To test RLS itself** (not just the application filter): requires a running local Supabase instance and real cross-user JWT tokens. The test-plan anti-pattern warns against testing "Supabase's RLS engine in isolation" — meaning the app's queries must be the ones going through RLS, not raw SQL in a test. If a full integration test is in scope, use `supabase start` + two test users created via `supabase.auth.admin.createUser()` (service role for setup only, then switch to anon clients for test assertions).

**Coverage matrix for service functions:**

| Test scenario | Service function | Cross-user outcome |
|---|---|---|
| User B reads User A's decks | `listDecksWithCardCount(supabaseB, userA_id)` | Empty array |
| User B reads User A's deck by id | `GET /api/decks/[userA_deckId]` as userB | 404 or empty |
| User B renames User A's deck | `renameDeck(supabaseB, userB_id, userA_deckId, ...)` | Error thrown (0 rows matched) |
| User B deletes User A's deck | `deleteDeck(supabaseB, userB_id, userA_deckId)` | Error thrown |
| User B appends cards to User A's deck | `appendCardsToDeck(supabaseB, userB_id, userA_deckId, cards)` | "Deck not found or access denied" |
| User B rates User A's card | `applyRating(supabaseB, userB_id, userA_cardId, ...)` | loadError → throw |

**`review_logs` gap**: Before writing tests, add the explicit denial policies (migration). The test should then verify that UPDATE/DELETE on `review_logs` are denied even for the row's owner (the intent is append-only, and the test makes that invariant explicit).

---

## Open Questions

1. **`review_logs` explicit denial policies**: Should a new migration file be created in the same Phase 3 change, or is this a separate minimal fix? Recommend: one-line migration in Phase 3 scope (it's a pre-test setup step, not a behavioural change).

2. **RLS testing scope**: Are Phase 3 tests hermetic-only (verify app-layer `.eq("user_id")` filters), or do they include real-DB integration (verify RLS policies fire at the DB layer)? The test-plan anti-pattern says tests must go through "the app's actual queries" — which implies real DB if feasible. Decision: if `supabase start` is available in CI, use it; otherwise hermetic first, real-DB deferred as a `describe.skip` placeholder (matching the Phase 1/2 precedent).

3. **Middleware unit test shape**: Astro middleware uses `defineMiddleware` — verify that the returned function can be called directly in Vitest without spinning up Astro's full dev server. If not, a lightweight fetch-to-running-server test is the fallback.

4. **`startsWith()` prefix collision**: The `/api/auth` prefix guard in `PUBLIC_API_ROUTES` would incorrectly pass `/api/auth-settings` or similar. Should a test assert this boundary? Recommend: yes — one test case that verifies `/api/auth/` passes through and `/api/auth2` does not. This guards against future accidental prefix matches.
