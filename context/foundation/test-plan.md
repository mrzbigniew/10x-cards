# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-07

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   area" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/` (37 commits/30d).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                      | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | AI generation returns malformed or empty proposals — user pastes text, clicks Generate, gets zero usable cards (LLM returns invalid JSON, parser rejects, or array is empty) | High   | Medium     | PRD US-01, FR-006, FR-007; interview Q1 ("core functionality"); hot-spot dir `src/components/generation` (20 commits/30d)                                 |
| 2   | Deck-save writes partially — deck created but cards missing — user accepts proposals, clicks Save, gets success, but deck is empty because bulk card insert failed silently  | High   | Medium     | PRD guardrail (durability of flashcards); archive first-gated-generation/plan.md (bulk insert + trigger dependency); interview Q2 (Supabase config burns) |
| 3   | SR scheduling error — due cards not shown or shown when not due — student trusts the algorithm; a bug in due-date filtering or rating persistence means they study wrong     | High   | Low        | PRD guardrail (SR algorithm correctness); archive review-session/plan.md (ts-fsrs integration, due_before contract)                                       |
| 4   | Cross-user data access via RLS gap — user A reads or modifies user B's decks/cards by manipulating IDs in API requests                                                       | High   | Low        | PRD NFR (user data isolation); interview Q2 (burned on Supabase config); hot-spot dir `src/lib/services` (10 commits/30d)                                 |
| 5   | Generation flow drops pasted text on API error — AI call times out, student's pasted notes disappear from the UI, requiring re-paste                                         | Medium | Medium     | PRD FR-007 (preserve input on error); US-01 AC (error recovery); interview Q1                                                                             |
| 6   | Auth gate regression — unauthenticated user reaches product routes — a change to middleware exposes dashboard/generation/deck pages to anonymous users                       | High   | Low        | PRD FR-005 (redirect non-signed-in); hot-spot dir `src/pages` (14 commits/30d)                                                                            |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                              | Must challenge                                                                                     | Context `/10x-research` must ground                                                                   | Likely cheapest layer                                                     | Anti-pattern to avoid                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| #1   | Given valid input, the service returns a well-formed array of `{front, back}` pairs; given malformed LLM output, the service returns a structured error without crashing | "If JSON.parse succeeds, the response is valid" — it can parse but violate the schema              | Entry point to LLM, response parsing logic, Zod validation schema, error propagation path             | Unit test (service layer, mocked LLM response)                            | Asserting against a hardcoded LLM response snapshot — tautological test                    |
| #2   | After save completes, deck row count equals accepted proposals; if any insert fails, user sees an error and no partial deck is created                                   | "Insert returns without error = all rows landed" — bulk insert can succeed partially               | Deck creation + card bulk insert sequence, trigger behavior, error surfacing path                     | Integration test (API route with test DB)                                 | Mocking DB so heavily the test can never catch an RLS or trigger issue                     |
| #3   | Cards rated "Good" today do not appear tomorrow; cards due today always appear; Again-rated cards reappear in same session                                               | "ts-fsrs is tested by its maintainers" — the integration layer is custom and untested              | Row-to-FSRS-card mapper, rating service, due-date query filter, Again-requeue logic                   | Unit test (service layer with deterministic FSRS config)                  | Testing ts-fsrs's own algorithm instead of the integration boundary                        |
| #4   | A request with user A's token attempting to read/modify user B's deck returns 0 rows or 403 — never user B's data                                                        | "RLS is on = isolation works" — a missing policy on a new table or service-role bypass breaks this | Which tables have RLS, policy definitions, whether any route uses service-role client                 | Integration test (two test users, cross-access attempt)                   | Testing Supabase's RLS engine in isolation rather than the app's actual queries through it |
| #5   | After an API error, the generation UI still displays the original pasted text and a retry option                                                                         | "Text is in React state, it can't disappear" — a re-render, unmount, or navigation clears it       | Error handling in the generation hook, what triggers unmount, error-state interaction with text state | Unit test (React hook with mocked fetch returning errors)                 | Testing only the happy path and assuming error recovery works                              |
| #6   | An unauthenticated request to any product route returns redirect (pages) or 401 (API) — never 200 with content                                                           | "Middleware covers all routes" — a new route added outside the protection array is unguarded       | Middleware implementation, route registration, how new routes join the protected set                  | Integration test (unauthenticated fetch against protected route patterns) | Hardcoding the route list in the test — becomes stale when a new route is added            |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                 | Goal (one line)                                                                             | Risks covered | Test types         | Status | Change folder                                                  |
| --- | -------------------------- | ------------------------------------------------------------------------------------------- | ------------- | ------------------ | ------ | -------------------------------------------------------------- |
| 1   | critical-path-coverage     | Bootstrap Vitest; prove generation service produces valid output and save-to-deck is atomic | #1, #2, #5    | unit + integration | done   | context/archive/2026-06-06-testing-critical-path-coverage/     |
| 2   | sr-integration-correctness | Prove the review service schedules and persists ratings correctly                           | #3            | unit               | done   | context/archive/2026-06-07-testing-sr-integration-correctness/ |
| 3   | auth-and-access-control    | Prove no unauthenticated or cross-user access is possible through the app's routes          | #4, #6        | integration        | done   | context/archive/2026-06-07-auth-and-access-control/            |
| 4   | quality-gates-wiring       | Lock the floor: wire lint + typecheck + test into CI so no commit can regress silently      | cross-cutting | CI gates           | done   | context/changes/quality-gates-wiring/                          |

## 4. Stack

The classic test base for this project. No test infrastructure exists yet —
Phase 1 bootstraps the runner.

| Layer               | Tool                                   | Version                        | Notes                                                                                    |
| ------------------- | -------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| unit + integration  | Vitest                                 | latest (to install in Phase 1) | Vite-native; zero-config with Astro projects; supports TypeScript and JSX out of the box |
| API/service mocking | MSW (Mock Service Worker)              | latest (to install in Phase 1) | Intercepts at the network level; mocks OpenRouter responses without touching internals   |
| e2e                 | none yet — see §3 Phase 3 if warranted | —                              | e2e only if cheaper layers cannot cover the interaction risk                             |
| accessibility       | none planned                           | —                              | Baseline a11y is a non-goal per PRD (no WCAG-AA audit in MVP)                            |

**Stack grounding tools (current session):**

- Docs: Context7 — available; can query Vitest, Astro, Supabase, ts-fsrs docs; checked: 2026-06-06
- Search: Exa.ai — available; can verify current tool status and best practices; checked: 2026-06-06
- Runtime/browser: none — no Playwright MCP runtime in session; checked: 2026-06-06
- Provider/platform: Supabase MCP — available (schema inspection, SQL execution); quality-gate relevance for verifying migrations; checked: 2026-06-06

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                                      | Where                         | Required?                                            | Catches                                         |
| ----------------------------------------- | ----------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| lint (ESLint) + typecheck (`astro check`) | local (husky pre-commit) + CI | required                                             | syntactic / type drift                          |
| unit + integration tests                  | local + CI                    | required after §3 Phase 1                            | logic regressions in generation, save, SR, auth |
| e2e on critical flows                     | CI on PR                      | optional — add only if unit+integration leaves a gap | broken cross-layer user paths                   |
| post-edit hook (run affected tests)       | local (agent loop)            | recommended after §3 Phase 4                         | regressions at edit time before commit          |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test for a service function

Pattern established in §3 Phase 1. Canonical example: `src/test/generation.test.ts`.

- **Mock setup**: use `vi.mock()` at module top to intercept both the external SDK (e.g. `openai`) and any virtual Astro modules (e.g. `astro:env/server`). For env modules, use a getter inside the mock factory so per-test values can be toggled with a `let` variable — no `vi.resetModules()` needed.
- **Oracle source**: derive all expected values from the production error messages and domain rules (PRD, business contract) — never compute the expected value by running the same logic as the code under test.
- **Assertion style**: use `it.each` with a named-scenario table to cover a failure matrix; each row names the scenario in Polish so test-runner output is self-explanatory. Assert both the error class (`instanceof`) and the message content (`toContain`).
- **Edge cases**: add at least one edge case per risk beyond the happy path and the failure matrix (e.g., whitespace-only input after a schema `.trim().min(1)` fix).
- **Mutation triage**: after shipping, run `npm run test:mutation --mutate <file>` and consciously review each survived mutant. Equivalent mutants (cosmetic `.name` property, LLM prompt content, SDK constructor wiring) are documented as comments at the bottom of the test file so the decision is explicit and auditable.

### 6.2 Adding a hermetic stub test for a service with injected client

Pattern established in §3 Phase 1. Canonical example: `src/test/decks.test.ts`. Full integration test (real DB) is deferred to §3 Phase 3.

- **Mock setup**: build a typed fluent-builder stub that matches the shape of the injected client (`SupabaseClientType = NonNullable<ReturnType<typeof createClient>>`). Expose `vi.fn()` references only at terminal async operations (`.single()`, bare `.insert()`); intermediate chain methods return the same stub object.
- **Oracle source**: expected behavior comes from the service contract (what `createDeckWithCards` must guarantee: atomicity, compensating delete on failure). The oracle is the _outcome_ — error thrown, delete called, card table untouched — not the internal sequence.
- **Assertion style**: assert error messages with `.rejects.toThrow()`, assert side-effects with `expect(fn).toHaveBeenCalledOnce()` or `not.toHaveBeenCalled()` on the exposed `vi.fn()` terminals.
- **Partial failure coverage**: hermetic stubs let you trigger the second-step failure (card insert fails after deck insert succeeds) that real infra cannot easily produce. This is the main value of the layer — do not replace it with an integration test just to get a "real DB" feel.
- **Deferred placeholder**: add a `describe.skip` block with `it.todo` for deferred integration assertions (e.g., `"deck row count = N after successful save"`) so the intent is preserved without blocking the test run.

### 6.3 Adding a unit test for a React hook

Pattern established in §3 Phase 1. Canonical example: `src/test/useGeneration.test.ts`.

- **Mock setup**: spy on `globalThis.fetch` with `vi.spyOn` — do not import or mock an internal fetch wrapper. Restore all spies in `afterEach` with `vi.restoreAllMocks()`.
- **Oracle source**: expected values come from the hook's observable contract (PRD FR-007: preserve input on error). Assert `phase`, `errorMessage`, and `text` values that a user would experience — not internal state variables or implementation details.
- **Assertion style**: wrap synchronous state mutations in `act()`; wrap async operations in `await act(async () => { ... })` to flush all React state updates before asserting. Access only the values returned by `renderHook` — never import or access hook-internal variables.
- **Both error branches**: cover `!res.ok` (non-200 HTTP response) and `fetch` rejection (network failure) as separate test cases — they exercise different code paths in the catch branch.
- **Retry path**: pin that a successful retry after an error restores `phase === "reviewing"` with the original text intact; this proves state is not reset between calls.

### 6.4 Adding a test for a new API endpoint

Pattern established in §3 Phase 3. Canonical examples: `src/test/middleware.test.ts` (auth gate) and `src/test/access-control.test.ts` (cross-user isolation).

- **Auth gate coverage**: mock `astro:middleware` as an identity function and `@/lib/supabase.createClient` to return a stub with a controllable `auth.getUser()`. Call `onRequest` directly — no server spin-up needed. Verify that any non-whitelisted path returns 401 (API) or redirect (page) when `getUser` returns `null`.
- **Coverage check for new routes**: the middleware uses a whitelist with default-deny (`PUBLIC_API_ROUTES`, `PUBLIC_ROUTES`). New routes added under `src/pages/api/` are protected automatically — no test update needed. New _public_ routes must be added to the whitelist and covered by a pass-through test scenario.
- **Prefix guard**: the public API prefix is `"/api/auth/"` (with trailing slash). If you add a new public route prefix, write a boundary test: one case that matches, one that almost-matches but should be blocked.
- **Cross-user coverage for new service functions**: add a `describe` block in `src/test/access-control.test.ts` with a fresh fluent-builder stub scoped to the function under test. Stub the terminal (`.order()` for list operations, `.single()` for single-row operations) to return `{ data: null/[], error: { message: "..." } }` and assert the service returns empty or throws. Use `USER_B_ID` + a `USER_A_*_ID` constant to make the cross-user intent explicit.

### 6.5 Per-rollout-phase notes

(Filled in as phases ship.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Cloudflare Workers infrastructure** — deployment config, edge runtime behavior, Workers-specific APIs. Re-evaluate if the app moves off Cloudflare or a Workers-specific bug surfaces. (Source: interview Q5.)
- **Supabase platform integration/configuration** — auth SDK internals, RLS engine behavior in isolation, migration tooling. We test our _queries through_ RLS (risk #4), not Supabase itself. Re-evaluate if migrating off Supabase. (Source: interview Q5.)
- **Pure UI styling** — pixel-level visual appearance, spacing, colors. The user changes UI often (Q3) but wants logic correctness, not snapshot enforcement. Re-evaluate if visual regression becomes a top-3 risk. (Source: interview Q3 context.)
- **Rate limiting / resource abuse** — generation endpoint spam protection. This is Cloudflare/infrastructure territory per Q5. Re-evaluate if abuse becomes a real incident. (Source: interview Q5, challenger pass.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-08
- Stack versions last verified: 2026-06-06
- AI-native tool references last verified: 2026-06-06 (none recommended in this rollout)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
