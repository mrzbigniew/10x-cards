---
date: 2026-06-08T00:00:00+02:00
researcher: Zbigniew Jędraczka
git_commit: 4ac4603005f0659d9d0ac81712bfd188140934fc
branch: main
repository: 10xDEVv3
topic: "Quality gates wiring — Phase 4 of the test-plan rollout"
tags: [research, ci, github-actions, husky, vitest, astro-check, quality-gates]
status: complete
last_updated: 2026-06-08
last_updated_by: Zbigniew Jędraczka
---

# Research: Quality Gates Wiring

**Date**: 2026-06-08T00:00:00+02:00
**Researcher**: Zbigniew Jędraczka
**Git Commit**: `4ac4603005f0659d9d0ac81712bfd188140934fc`
**Branch**: main
**Repository**: 10xDEVv3

## Research Question

What is the current state of CI, pre-commit hooks, typecheck, and test wiring?
What concrete changes are needed to lock the floor as specified by test-plan.md §3 Phase 4
("Lock the floor: wire lint + typecheck + test into CI so no commit can regress silently")?

## Summary

Three of the four required gates are partially in place but none are fully wired.
The CI pipeline runs lint and build but skips tests and typecheck entirely.
The pre-commit hook file exists but is **not active** (Husky's prepare script is missing,
so `.git/hooks/pre-commit` was never created). A typecheck command (`astro check`) has no npm
script. These three concrete gaps are the full scope of Phase 4.

## Detailed Findings

### CI Pipeline — `.github/workflows/ci.yml`

Triggers: push to `master` and pull requests targeting `master`.

Current steps:

1. `npm ci`
2. `npx astro sync` (generates Astro type declarations)
3. `npm run lint` (ESLint 9 flat config, strict TypeScript + React + Astro rules)
4. `npm run build` (Astro → Cloudflare Workers; needs `SUPABASE_URL`, `SUPABASE_KEY` secrets)

**Missing gates:**

- ❌ No `npm run check` (`astro check` typecheck)
- ❌ No `npm run test` (Vitest — 7 passing test files from Phases 1–3)

The build step already has `SUPABASE_URL` and `SUPABASE_KEY` wired as GitHub secrets.
The test step does **not** need these secrets — `vitest.setup.ts` mocks `astro:env/server`
with hard-coded test values (`"test-openrouter-key"`, `"http://localhost:54321"`, `"test-supabase-key"`).
`astro check` also does not need real runtime env values — it only reads the env schema
definition from `astro.config.mjs`.

**Recommended CI step order** (adding two new steps between lint and build):

```
npm ci → astro sync → lint → check → test → build
```

### Pre-commit Hook — Husky

**Husky version**: 9.1.7 (devDependency present)
**Hook file**: `.husky/pre-commit` — contains `npx lint-staged`
**Hook active?**: ❌ NO

Root cause: `package.json` has no `"prepare"` script. In Husky 9, the prepare script
(`"prepare": "husky"`) is what writes the actual hook to `.git/hooks/pre-commit` when
`npm install` runs. Without it, `.git/hooks/pre-commit` is absent and the hook never fires.

**lint-staged config** (in `package.json`):

```json
{
  "*.{ts,tsx,astro}": ["eslint --fix"],
  "*.{json,css,md}": ["prettier --write"]
}
```

**What the test-plan requires for pre-commit** (§5 Quality Gates):

> lint (ESLint) + typecheck (`astro check`) — local (husky pre-commit) + CI — required

So the pre-commit hook should run both lint-staged AND `astro check`.
Note: `astro check` typechecks the whole project (~2–5 s on this codebase);
it cannot be narrowed to staged files, so it runs on every commit regardless of scope.

### Typecheck Command — `astro check`

**Installed**: `@astrojs/check` is in devDependencies.
**npm script**: ❌ MISSING — no `"check"` or `"typecheck"` entry in `package.json`.
**ESLint vs typecheck distinction**: ESLint with `typescript-eslint` catches type errors
_during linting_ but is not a substitute for a full Astro typecheck pass (`astro check`
validates `.astro` components, island boundaries, and virtual module types that
`tsc --noEmit` alone misses).

**Required addition to `package.json`**:

```json
"check": "astro check"
```

### Test Infrastructure — Vitest (all from Phases 1–3)

Fully established; no Phase 4 work needed here except wiring into CI.

- **Config**: `vitest.config.ts` — jsdom env, `@astrojs/node` Vite config adapter,
  `@` alias → `/src`, v8 coverage, `passWithNoTests: true`
- **Setup**: `vitest.setup.ts` — mocks `astro:env/server`; `afterEach` cleanup via
  `@testing-library/react`
- **Test files** (`src/test/`):
  - `generation.test.ts` — Risk #1 (generation service, 6-scenario failure matrix)
  - `decks.test.ts` — Risk #2 (deck atomicity, hermetic Supabase stub)
  - `useGeneration.test.ts` — Risk #5 (hook error recovery, fetch spy)
  - `sr.test.ts` — Risk #3 (SR scheduling, deterministic FSRS oracle)
  - `useReviewSession.test.ts` — Risk #3 support (Again-requeue logic)
  - `middleware.test.ts` — Risk #6 (auth gate, 6 scenarios)
  - `access-control.test.ts` — Risk #4 (cross-user isolation, RLS stubs)
- **Command**: `npm run test` → `vitest run` (exits after one pass; CI-safe)
- **Coverage**: `npm run test:coverage` → `vitest run --coverage` (v8 provider)

### Playwright E2E — Not in scope for Phase 4

`playwright.config.ts` exists and is CI-aware (1 worker, 2 retries on CI).
The `webServer` block is commented out (lines 80–84). Per test-plan §3, E2E is
"optional — add only if unit+integration leaves a gap." Phase 4 does not enable E2E in CI.

### Mutation Testing — Not in scope for Phase 4

`stryker.config.json` exists; `npm run test:mutation` narrows to `generation.ts`.
Stryker thresholds have no hard break (`break: null`). Not wired into CI and
per project conventions should stay as a manual, on-demand gate only.

## Code References

- `.github/workflows/ci.yml` — current CI pipeline; needs `check` + `test` steps
- `package.json:scripts` — needs `"prepare": "husky"` and `"check": "astro check"`
- `.husky/pre-commit` — needs `npm run check` added after `npx lint-staged`
- `vitest.config.ts` — Vitest configuration (no changes needed)
- `vitest.setup.ts` — mocks `astro:env/server`; confirms tests run without real secrets
- `eslint.config.js` — ESLint 9 flat config with `typescript-eslint` strict + type-checked

## Architecture Insights

**Why `astro check` is not redundant with ESLint type-checking**: ESLint's
`typescript-eslint` project-service mode catches TypeScript type errors in `.ts`/`.tsx`
files, but `astro check` additionally validates `.astro` component type boundaries,
props inference, and Astro's virtual module types (e.g., `astro:env/server`). Both are
needed for full coverage.

**Why tests don't need CI secrets**: `vitest.setup.ts` intercepts `astro:env/server`
via `vi.mock()` at module load time. All 7 test files run fully offline. The only step
that needs the Supabase secrets is `npm run build` (Astro inlines the env schema at
build time), which already has them wired in the CI workflow.

**Husky 9 lifecycle**: In Husky 9, `.husky/pre-commit` is the hook _source_, not the
active hook. The active hook lives at `.git/hooks/pre-commit` and is written by running
`husky` (via the npm `prepare` lifecycle). Without `"prepare": "husky"` in `package.json`,
every fresh `npm install` leaves the hooks unregistered — including on CI agents if they
ever ran `npm ci` without the prepare step.

## Historical Context (from prior changes)

- `context/archive/2026-06-06-testing-critical-path-coverage/` — Phase 1: established
  Vitest, jsdom env, `vi.mock()` pattern, Polish error oracle; chose hermetic stubs over
  real-DB integration for the deck service; mutation gate added for generation.ts.
- `context/archive/2026-06-07-testing-sr-integration-correctness/` — Phase 2: SR unit tests
  with deterministic FSRS config; fluent-builder stub reused from Phase 1.
- `context/archive/2026-06-07-auth-and-access-control/` — Phase 3: middleware integration
  tests; RLS stub pattern; fixed prefix-collision bug (`/api/auth` → `/api/auth/`);
  added append-only denial migration for review_logs.

## Open Questions

1. **`astro check` on pre-commit — acceptable latency?** `astro check` runs against the
   full project. On this codebase it should complete in a few seconds, but confirm after
   first real run. If it becomes a pain point, move it to pre-push only and keep
   pre-commit fast (lint-staged only).

2. **Coverage threshold in CI?** `npm run test:coverage` is available. The test-plan does
   not set a minimum threshold for Phase 4; this can be deferred or set loosely
   (e.g., 60% line coverage as a floor) to avoid blocking CI on low-coverage new code.

3. **`npm run test` in pre-commit vs pre-push?** The test-plan §5 lists tests under
   "local + CI" but does not specify pre-commit vs pre-push. Running 7 test files takes
   ~1–3 s with Vitest; adding to pre-commit is low friction. Pre-push is the safer default
   if the team prefers fast commits with a final gate before remote.
