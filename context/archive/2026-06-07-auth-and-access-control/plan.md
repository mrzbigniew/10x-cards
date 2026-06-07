# Auth and Access Control Implementation Plan

## Overview

Phase 3 of the test rollout: write integration tests proving the two security guarantees from test-plan.md §2 — Risk #6 (no unauthenticated request reaches a product route) and Risk #4 (no authenticated user can access another user's data through the application layer). A one-file migration precedes the tests to make the `review_logs` append-only invariant explicit.

## Current State Analysis

The app has three defense layers: global middleware (`src/middleware.ts:15-46`), per-route auth checks in all 11 product API routes, and RLS on all four user-scoped tables using `auth.uid() = user_id`. No service-role key exists — RLS is always active. Service functions use dependency injection (injected `SupabaseClientType` as the first parameter), which is the established test seam from Phases 1 and 2.

One gap: `review_logs` (`supabase/migrations/20260602000000_review_session.sql:28-30`) has only SELECT + INSERT policies; UPDATE and DELETE are denied by Postgres default-deny but the intent is implicit. Adding explicit `USING (false)` denial policies makes this auditable before Phase 3 tests run.

A structural risk in the middleware: `PUBLIC_API_ROUTES = ["/api/auth"]` uses `startsWith()`, meaning a future route like `/api/auth2` or `/api/auth-settings` would be accidentally public. The fix (append `/` to the prefix) is safe because all five existing auth routes live under `/api/auth/` (no route is exactly `/api/auth`). This fix lands in Phase 2 alongside the regression test.

### Key Discoveries

- `src/middleware.ts:15-46` — middleware exports `onRequest` from `defineMiddleware`, which is a type-safe identity wrapper; the raw function is directly callable in Vitest once `astro:middleware` is mocked, matching the `astro:env/server` precedent in `vitest.setup.ts:9-13`
- `src/lib/services/decks.ts:53-71` — `listDecksWithCardCount` terminal is `.order()` (not `.single()`); requires a different stub terminal than the Phase 1 pattern
- `src/lib/services/decks.ts:87-147` — `renameDeck` and `deleteDeck` route `.single()` through the update/delete chain; `appendCardsToDeck` does a pre-INSERT SELECT to check ownership
- `src/lib/services/cards.ts:17-30` — `listCardsInDeck` terminal is `.order()`, same pattern as `listDecksWithCardCount`
- `src/lib/services/sr.ts` — `applyRating` cross-user test reuses the `srLoadSingleFn` pattern from `src/test/sr.test.ts`

## Desired End State

`npm run test` passes with two new test files:

- `src/test/middleware.test.ts` — 6 scenarios proving the auth gate (Risk #6) including the prefix guard
- `src/test/access-control.test.ts` — 6 hermetic scenarios proving cross-user isolation (Risk #4), plus a `describe.skip` placeholder with `it.todo` items for future real-DB assertions

`review_logs` has four policies (SELECT, INSERT, explicit UPDATE deny, explicit DELETE deny). `npx supabase db reset` applies cleanly. The middleware `startsWith()` prefix collision is closed.

## What We're NOT Doing

- Real-DB RLS verification — deferred to the `describe.skip` placeholder; requires `supabase start` in CI
- E2E browser tests — middleware and service-layer tests are the cheapest layer with the required signal
- Per-route auth check tests for all 11 product routes — the middleware mechanism test covers this without hardcoding the route inventory (test-plan §2 Risk #6 anti-pattern)
- Testing Supabase's RLS engine in isolation (test-plan §7 deliberate exclusion)
- Any UI changes or new product features

## Implementation Approach

**Phase 1**: One migration file closes the implicit gap in `review_logs`. Two SQL lines; no application code changes.

**Phase 2**: Fix the `startsWith()` prefix in `src/middleware.ts`. Then unit-test `src/middleware.ts` in Vitest: mock `astro:middleware` (identity function) and `@/lib/supabase` (returns a stub with configurable `auth.getUser()`). Call `onRequest` directly with mock contexts. Six scenarios.

**Phase 3**: Write hermetic stub tests for six service functions in `src/test/access-control.test.ts`, using the fluent-builder stub pattern established in Phases 1 and 2. Each scenario configures the stub to return the empty/error result that app-layer `.eq("user_id", userId)` + RLS would produce in production, then asserts the service's behavior. Add a `describe.skip` placeholder matching the precedent in `src/test/decks.test.ts:166-168`.

## Critical Implementation Details

**Middleware mock shape**: `astro:middleware` must be mocked inside the test file (not just in `vitest.setup.ts`) because `src/middleware.ts` imports it. `createClient` from `@/lib/supabase` must also be mocked in the same file so `auth.getUser()` is controllable per-test. The mock context for `onRequest` needs `url` (a real `URL` object for `.pathname`), `locals` (plain object — middleware assigns `user` to it), `cookies` (empty stub), `request.headers` (new `Headers()`), and `redirect` (a `vi.fn()` returning a 302 Response).

**Cross-user stub design**: `listDecksWithCardCount` and `listCardsInDeck` end with `.order()` as the async terminal — the stub must expose a `vi.fn()` on `.order()`, not `.single()`. For `renameDeck`/`deleteDeck`, the existing `makeDecksChain` in `decks.test.ts` routes `.single()` through `deckSelectSingleFn` for the update path — new stubs for the cross-user file should be written fresh, scoped to the function under test, to avoid routing complexity.

---

## Phase 1: review_logs Explicit Denial Migration

### Overview

Add two explicit Postgres denial policies to `review_logs` so the append-only invariant is auditable rather than relying on implicit Postgres default-deny. No application code changes.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/20260607000001_review_logs_deny_update_delete.sql`

**Intent**: Declare that `review_logs` rows can never be updated or deleted by any user, making the append-only design intent explicit and verifiable by inspecting `pg_policies`.

**Contract**: Two `CREATE POLICY` statements on the existing `review_logs` table. Must sort after `20260602000000` in filename order; exact time suffix is implementer's choice. The SQL:

```sql
CREATE POLICY "review_logs: owner update" ON review_logs FOR UPDATE USING (false);
CREATE POLICY "review_logs: owner delete" ON review_logs FOR DELETE USING (false);
```

### Success Criteria

#### Automated Verification

- Migration applies cleanly on a fresh local schema: `npx supabase db reset`
- Types remain consistent (no new columns): `npm run gen-types && npx astro check`
- All existing tests still pass: `npm run test`

#### Manual Verification

- Confirm four policies exist on `review_logs` via Supabase MCP or `psql`: SELECT, INSERT, UPDATE (USING false), DELETE (USING false)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Middleware Unit Tests (Risk #6 — Auth Gate)

### Overview

Fix the `startsWith()` prefix collision in the middleware, then write 6 Vitest unit tests proving the auth-gate mechanism: every non-whitelisted path returns 401/redirect when unauthenticated, whitelisted paths pass through, and the `/api/auth/` prefix boundary is explicitly pinned.

### Changes Required

#### 1. Middleware prefix fix

**File**: `src/middleware.ts`

**Intent**: Prevent a future route like `/api/auth2` from being accidentally treated as public by narrowing the public-route prefix from `"/api/auth"` to `"/api/auth/"`.

**Contract**: Change line 13 from `["/api/auth"]` to `["/api/auth/"]`. All five existing auth routes (`signin`, `signup`, `signout`, `forgot-password`, `reset-password`) live under `src/pages/api/auth/` and resolve to paths beginning with `/api/auth/`, so no existing route breaks.

#### 2. Middleware test file

**File**: `src/test/middleware.test.ts`

**Intent**: Prove the middleware auth-gate mechanism (Risk #6) — that every non-public path blocks unauthenticated callers, public paths pass through, and the new prefix boundary is guarded by a regression test.

**Contract**: Two `vi.mock()` declarations at module top (required before any imports that resolve `astro:middleware` and `@/lib/supabase`):

```typescript
vi.mock("astro:middleware", () => ({
  defineMiddleware: <T>(fn: T): T => fn,
}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));
```

Mock context factory returning:
- `url`: `new URL(path, "http://localhost")` — provides a real `.pathname`
- `locals`: `{}` — middleware writes `user` to it; assertions can read it back
- `request`: `{ headers: new Headers() }`
- `cookies`: `{}` (middleware passes it to `createClient`, the mock ignores it)
- `redirect`: `vi.fn().mockReturnValue(new Response(null, { status: 302 }))` — captures redirect path

Six test scenarios (Polish names):
1. Nieuwhentykowany → `/api/decks` → `response.status === 401`
2. Nieuwhentykowany → `/dashboard` → `context.redirect` called with `"/auth/signin"`
3. Uwierzytelniony → `/api/decks` → `next()` called (not 401)
4. Nieuwhentykowany → `/api/auth/signin` → `next()` called (public API route)
5. Nieuwhentykowany → `/auth/signin` → `next()` called (public page route)
6. Guard `/api/auth/`: nieuwhentykowany → `/api/auth2` → `response.status === 401` (does NOT match `/api/auth/` prefix)

### Success Criteria

#### Automated Verification

- All 6 middleware tests pass: `npm run test -- src/test/middleware.test.ts`
- TypeScript compiles without errors: `npx astro check`
- Lint passes: `npm run lint`
- Full test suite still passes: `npm run test`

#### Manual Verification

- Confirm test names are in Polish and describe the expected behavior in user terms
- Confirm scenario 6 (prefix guard) fails before the middleware fix and passes after — verifying the fix is load-bearing

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Cross-User Isolation Tests (Risk #4)

### Overview

Write 6 hermetic stub tests proving that the application layer correctly isolates each user's data. Each test simulates a cross-user access attempt — User B calling a service function with User A's resource ID — by configuring the stub to return the empty/error result that the `.eq("user_id", userId)` filter chain and RLS would produce in production.

### Changes Required

#### 1. Cross-user isolation test file

**File**: `src/test/access-control.test.ts`

**Intent**: Prove that all six user-scoped service operations handle "no rows matched for this userId" correctly — returning empty arrays or throwing — so that cross-user queries never silently succeed or return another user's data.

**Contract**: Six `describe` blocks, each covering one service function from the research coverage matrix. Stubs are written fresh (not imported from other test files) — one per `describe` block, scoped to the function under test. The file imports services from `@/lib/services/decks`, `@/lib/services/cards`, and `@/lib/services/sr`.

Coverage matrix:

| Test scenario | Service call | Stub returns | Expected outcome |
|---|---|---|---|
| User B lists User A's decks | `listDecksWithCardCount(supabase, USER_B_ID)` | `.order()` → `{ data: [], error: null }` | Returns `[]` |
| User B renames User A's deck | `renameDeck(supabase, USER_B_ID, USER_A_DECK_ID, "nowa nazwa")` | `.single()` (update path) → `{ data: null, error: { message: "..." } }` | Throws |
| User B deletes User A's deck | `deleteDeck(supabase, USER_B_ID, USER_A_DECK_ID)` | `.single()` (delete path) → `{ data: null, error: { message: "..." } }` | Throws |
| User B appends to User A's deck | `appendCardsToDeck(supabase, USER_B_ID, USER_A_DECK_ID, CARDS)` | `.single()` (ownership SELECT) → `{ data: null, error: { message: "..." } }` | Throws "Deck not found or access denied" |
| User B rates User A's card | `applyRating(supabase, USER_B_ID, USER_A_CARD_ID, USER_A_DECK_ID, 3, now)` | `srLoadSingleFn` → `{ data: null, error: { message: "..." } }` | Throws |
| User B lists User A's cards | `listCardsInDeck(supabase, USER_B_ID, USER_A_DECK_ID)` | `.order()` → `{ data: [], error: null }` | Returns `[]` |

`listDecksWithCardCount` stub needs `.select().eq().order()` chain; `.order()` is the `vi.fn()` terminal returning the configured promise. `listCardsInDeck` needs the same `.order()` terminal pattern on a `cards` chain. `applyRating` stub follows the `makeSrCardStateChain()` pattern from `src/test/sr.test.ts:58-89` — reuse or adapt the same structure.

Append a `describe.skip` block at the file bottom with `it.todo` items for future real-DB assertions (two-user Supabase integration test), matching the deferred placeholder pattern in `src/test/decks.test.ts:166-168`.

### Success Criteria

#### Automated Verification

- All 6 cross-user isolation tests pass: `npm run test -- src/test/access-control.test.ts`
- `describe.skip` placeholder is present (confirms intent is preserved): `npm run test` output shows the skip block
- Full test suite passes: `npm run test`
- TypeScript compiles: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification

- Confirm all 6 test names are in Polish and name the cross-user scenario explicitly
- Confirm the `describe.skip` placeholder contains at least two `it.todo` items covering the real-DB assertions deferred to a future phase

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests

- `src/test/middleware.test.ts` — 6 scenarios covering the mechanism-based auth gate; stubs `auth.getUser()` directly without a real Supabase instance
- `src/test/access-control.test.ts` — 6 hermetic stub scenarios, one per user-scoped service function; stubs simulate "no rows for this userId" at the fluent-builder terminal

### Integration Tests

- Deferred: `describe.skip` block in `access-control.test.ts` with `it.todo` items for two-user real-DB assertions (requires `supabase start` in CI)

### Manual Testing Steps

1. Apply the Phase 1 migration and confirm four policies on `review_logs` in Supabase Studio or via `psql \d+ review_logs`
2. Before the Phase 2 middleware fix, run the prefix-guard test in isolation and confirm it fails (proving the test is load-bearing)
3. After the fix, confirm all 6 middleware tests pass
4. Run `npm run test` after Phase 3 to confirm the full suite (including existing Phase 1/2 tests) is green

## Migration Notes

Phase 1 migration is append-only: two new policies on an existing table. No application code changes, no data changes, no column changes. Safe to apply on top of `20260602000000_review_session.sql` without a compensating rollback.

## References

- Research: `context/changes/auth-and-access-control/research.md`
- Phase 1/2 test patterns: `src/test/decks.test.ts`, `src/test/sr.test.ts`
- Virtual module mock precedent: `vitest.setup.ts:9-13`, `src/test/generation.test.ts:8-12`
- Deferred placeholder precedent: `src/test/decks.test.ts:166-168`
- Risk definitions: `context/foundation/test-plan.md §2`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: review_logs Explicit Denial Migration

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — bfd4a9c
- [x] 1.2 Types consistent and check passes: `npm run gen-types && npx astro check` — bfd4a9c
- [x] 1.3 Existing tests still pass: `npm run test` — bfd4a9c

#### Manual

- [x] 1.4 Four policies confirmed on review_logs (SELECT, INSERT, UPDATE deny, DELETE deny) — bfd4a9c

### Phase 2: Middleware Unit Tests (Risk #6 — Auth Gate)

#### Automated

- [x] 2.1 All 6 middleware tests pass: `npm run test -- src/test/middleware.test.ts` — 10f7042
- [x] 2.2 TypeScript compiles: `npx astro check` — 10f7042
- [x] 2.3 Lint passes: `npm run lint` — 10f7042
- [x] 2.4 Full test suite passes: `npm run test` — 10f7042

#### Manual

- [x] 2.5 Test names in Polish and describe expected behavior — 10f7042
- [x] 2.6 Prefix guard test (scenario 6) confirmed load-bearing: fails before fix, passes after — 10f7042

### Phase 3: Cross-User Isolation Tests (Risk #4)

#### Automated

- [x] 3.1 All 6 cross-user isolation tests pass: `npm run test -- src/test/access-control.test.ts` — f39c97a
- [x] 3.2 `describe.skip` placeholder present in output: `npm run test` — f39c97a
- [x] 3.3 Full test suite passes: `npm run test` — f39c97a
- [x] 3.4 TypeScript compiles: `npx astro check` — f39c97a
- [x] 3.5 Lint passes: `npm run lint` — f39c97a

#### Manual

- [x] 3.6 All 6 test names in Polish, naming the cross-user scenario explicitly — f39c97a
- [x] 3.7 `describe.skip` block contains at least 2 `it.todo` items for deferred real-DB assertions — f39c97a
