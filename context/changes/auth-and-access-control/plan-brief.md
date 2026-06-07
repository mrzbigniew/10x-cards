# Auth and Access Control — Plan Brief

> Full plan: `context/changes/auth-and-access-control/plan.md`
> Research: `context/changes/auth-and-access-control/research.md`

## What & Why

Phase 3 of the test rollout: prove the two security guarantees from test-plan.md §2 that are still untested — Risk #6 (no unauthenticated request reaches a product route) and Risk #4 (no authenticated user can read or modify another user's data). The research confirmed the defense layers are correct; this change makes that correctness machine-verifiable and regression-proof.

## Starting Point

Vitest is bootstrapped (Phase 1/2). The fluent-builder Supabase stub pattern and Astro virtual module mocking (`astro:env/server`) are both established. Two tests files exist (`decks.test.ts`, `sr.test.ts`) that serve as templates. No middleware tests or cross-user isolation tests exist yet.

A minor structural risk in the middleware is also addressed: `PUBLIC_API_ROUTES = ["/api/auth"]` uses `startsWith()`, which would accidentally allow a hypothetical `/api/auth2` route to bypass auth. The fix (append `/`) is safe and lands alongside the regression test.

## Desired End State

Two new test files pass under `npm run test`:
- `src/test/middleware.test.ts` — 6 scenarios: unauthenticated API/page blocking, authenticated pass-through, public route pass-through, and the `/api/auth/` prefix guard
- `src/test/access-control.test.ts` — 6 hermetic scenarios proving each user-scoped service function returns empty/throws for cross-user queries; a `describe.skip` placeholder preserves the intent to run real-DB assertions in a future phase

`review_logs` has four explicit policies (SELECT, INSERT, UPDATE deny, DELETE deny). `npx supabase db reset` applies cleanly.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| review_logs denial policies | Phase 3 scope (pre-test migration) | It's a direct prerequisite for making the append-only invariant testable | Plan |
| RLS testing depth | Hermetic stubs + describe.skip placeholder | Matches Phase 1/2 precedent; no Supabase instance needed in CI | Plan |
| Middleware test seam | Vitest unit test (mock astro:middleware) | `defineMiddleware` is a type-safe identity function; mockable exactly like `astro:env/server` | Research + Plan |
| startsWith() prefix guard | Fix + dedicated test case | The current prefix would pass `/api/auth2` through; fix is 1-char and safe for all existing auth routes | Research + Plan |
| Cross-user test coverage | All 6 service functions from coverage matrix | Each function has a different query shape; covering all 6 takes minimal extra effort given the stub pattern | Plan |
| Phase structure | 3 phases | Migration can be verified independently before tests run | Plan |

## Scope

**In scope:**
- `supabase/migrations/20260607000001_review_logs_deny_update_delete.sql` — 2-line migration
- `src/middleware.ts` — 1-char fix (`"/api/auth"` → `"/api/auth/"`)
- `src/test/middleware.test.ts` — new, 6 test scenarios
- `src/test/access-control.test.ts` — new, 6 hermetic scenarios + `describe.skip` placeholder

**Out of scope:**
- Real-DB RLS verification (deferred to placeholder)
- E2E browser tests
- Per-route auth check tests for all 11 product routes
- Any UI changes or product features

## Architecture / Approach

The middleware is a function exported as `onRequest`; mocking `astro:middleware` as `{ defineMiddleware: (fn) => fn }` makes it directly callable in Vitest with a mock context. Cross-user tests use the established fluent-builder stub pattern: stubs are configured to return the empty/error results that app-layer `.eq("user_id", userId)` filters and RLS would produce in production, proving the service handles "no rows for this userId" correctly at every entry point.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. review_logs migration | Explicit denial policies; append-only intent is auditable | None — 2-line SQL append |
| 2. Middleware unit tests | Risk #6 proven; prefix bug fixed and pinned by regression test | Middleware mock shape must be correct or tests give false confidence |
| 3. Cross-user isolation tests | Risk #4 proven at app-layer; real-DB deferred to skip placeholder | Stub terminal patterns differ per function — wrong terminal gives a passing test that proves nothing |

**Prerequisites:** Phase 1 (Vitest bootstrap) and Phase 2 (SR tests) are complete. Local Supabase running for Phase 1 manual verification.
**Estimated effort:** ~1 session across 3 phases (migration is trivial; both test files are ~50-80 lines each following established patterns)

## Open Risks & Assumptions

- The hermetic tests prove the application's filter-chain behavior, not that RLS policies fire at the database layer — the real-DB path is deferred
- `defineMiddleware` from `astro:middleware` is assumed to be a no-op identity function (confirmed from Astro source and the project's use of `getViteConfig`); if a future Astro version adds behavior, the mock may diverge
- The middleware fix (`/api/auth/` prefix) assumes no route is registered at exactly `/api/auth` — confirmed by inspecting `src/pages/api/auth/` (all routes have a subdirectory segment)

## Success Criteria (Summary)

- `npm run test` is green with two new test files and all existing tests intact
- `review_logs` shows four explicit policies in `pg_policies`
- A request to `/api/auth2` (no trailing slash) is blocked (401) — the prefix guard regression test passes
