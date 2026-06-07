# Critical-Path Coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

Bootstrap the missing test infrastructure and prove three critical user risks with automated tests: (1) the generation service fails cleanly on bad LLM output, (2) saving a deck never leaves an orphan record, (3) a network error during generation does not erase the user's pasted text. These are the highest-likelihood, high-impact risks from `test-plan.md §2` with no regression guard today.

## Starting Point

Vitest 4.x, Testing Library, coverage-v8, MSW, and Stryker are all installed. The `vitest.config.ts` references a `vitest.setup.ts` that does not exist yet, so `npm run test` currently errors. No test files exist. `ProposalSchema` accepts whitespace-only strings; `createDeckWithCards` leaves orphan decks on card-insert failure.

## Desired End State

`npm run test` runs three test suites green: generation service (6 error paths + happy path + whitespace edge), deck service (orphan-guard + skip + error paths), and the generation hook (error branch text preservation + retry). The orphan-deck bug is fixed. `npm run test:mutation` runs a scoped Stryker gate on `generation.ts`. `test-plan.md §6` cookbook is filled with the patterns introduced here.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Vitest version | Stay on 4.x (`^4.1.8`) | Already installed; no reason to downgrade | Research |
| Vitest config strategy | `getViteConfig` + node adapter | Already shipped; avoids maintaining a parallel hand-written config | Research |
| `astro:env/server` mock | `vi.mock` with getter pattern (mutable let) | Allows per-test key toggling without `vi.resetModules()` | Plan |
| Risk #2 ordering | TDD — red test first, then fix | Test proves the fix; regression is caught immediately if the guard regresses | Plan (user) |
| ProposalSchema `.trim()` | In this plan, Phase 1 | Schema fix and its covering test ship together | Plan (user) |
| Test file location | `src/test/` central directory | User preference; one place to find all tests | Plan (user) |
| Integration tests | Hermetic-only for Phase 1 | Real Supabase DB not needed to catch the orphan-deck risk; deferred placeholder added | Research |
| Stryker scope | CLI `--mutate` on `generation.ts` via `test:mutation` script | Selective-gate doctrine; avoids slow broad-scope run per AGENTS.md | Research |

## Scope

**In scope:**
- `vitest.setup.ts` creation (unblocks all test runs)
- `ProposalSchema.front` and `.back`: `.min(1)` → `.trim().min(1)`
- `package.json`: add `test:mutation` script
- `src/test/generation.test.ts`: Risk #1 (8+ test cases)
- `src/test/decks.test.ts`: Risk #2 hermetic stub + orphan-guard fix + integration placeholder (skipped)
- `src/lib/services/decks.ts`: compensating delete in `createDeckWithCards`
- `src/test/useGeneration.test.ts`: Risk #5 (both error branches + retry)
- Stryker mutation gate run + triage
- `test-plan.md §6` cookbook fill (6.1, 6.2, 6.3)

**Out of scope:**
- Integration tests against a real Supabase DB
- MSW server setup
- Coverage CI gate (test-plan §3 Phase 4)
- `stryker.config.json` broad-glob cleanup

## Architecture / Approach

Three distinct test layers, each using the cheapest mock that gives a real signal. Generation service: `vi.mock("openai")` + `vi.mock("astro:env/server")` — unit test, no network. Deck service: a typed Supabase fluent-builder stub — hermetic, no DB. Generation hook: `vi.spyOn(globalThis, "fetch")` — unit test, no server. Risk #2 uses TDD so the fix is proven by the test, not assumed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Environment & Schema Fix | `vitest.setup.ts` + `.trim().min(1)` + `test:mutation` script | `getViteConfig` may not resolve `astro:env/server` — fallback alias needed |
| 2. Risk #1 Generation Tests | 8+ test cases covering full failure matrix | Mirror-test anti-pattern: asserting against implementation output not oracle |
| 3. Risk #2 Deck Atomicity (TDD) | Hermetic stub red → compensating-delete fix → green | Fluent Supabase builder stub is non-trivial to type correctly |
| 4. Risk #5 Hook Error Recovery | `renderHook` tests pinning error-branch text preservation | Act wrapping async state; not importing hook internals |
| 5. Mutation Gate + Cookbook | Stryker triage + test-plan.md §6 filled | Over-killing cosmetic mutants produces mirror tests |

**Prerequisites:** Working Node environment; `npm ci` already run; Supabase local instance not required for Phase 1–5 (hermetic only).

**Estimated effort:** ~3–4 implementation sessions across 5 phases.

## Open Risks & Assumptions

- `astro:env/server` virtual module may not resolve under `getViteConfig` in the test context — if Phase 2 fails with a module-not-found error (not an assertion error), an explicit `alias` in `vitest.config.ts` is needed
- Supabase fluent builder stub typing against `SupabaseClientType` may require `as unknown as SupabaseClientType` casts if the type is too deep to satisfy completely — acceptable as long as the tested methods are vi.fn() and not just `any`

## Success Criteria (Summary)

- `npm run test` runs all three suites green with no errors or skips
- `npm run test:mutation` completes and the HTML report shows a conscious triage decision for every survived mutant
- `test-plan.md §6.1–§6.3` contain prose descriptions that let a new contributor reproduce the pattern without reading the full plan
