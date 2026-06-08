# Quality Gates Wiring — Plan Brief

> Full plan: `context/changes/quality-gates-wiring/plan.md`
> Research: `context/changes/quality-gates-wiring/research.md`

## What & Why

Wire the three quality gates (lint + typecheck + tests) into CI and local git hooks so no commit
or push can regress the codebase silently. This is Phase 4 of the test-plan rollout — the
infrastructure (Vitest, ESLint, Husky, `@astrojs/check`) is already installed; it just isn't
connected to anything that enforces it automatically.

## Starting Point

The CI pipeline runs lint and build but skips typecheck and tests. The pre-commit hook source
file (`.husky/pre-commit`) exists but never fires because `"prepare": "husky"` is absent from
`package.json`. `astro check` has no npm script. CI targets `master` instead of `main`, meaning
none of these gates would protect real branches even after wiring.

## Desired End State

Every `git commit` runs lint-staged then `astro check` (type errors abort the commit). Every
`git push` runs the full Vitest suite (test failures abort the push). GitHub Actions on any push
or PR targeting `main` runs all five steps — install → sync → lint → check → test → build —
with build remaining the only step that consumes secrets.

## Key Decisions Made

| Decision                              | Choice                     | Why (1 sentence)                                                  | Source |
| ------------------------------------- | -------------------------- | ----------------------------------------------------------------- | ------ |
| Tests locally: pre-commit vs pre-push | Pre-push                   | Commits stay fast; gate fires before code reaches remote          | Plan   |
| `astro check` scope                   | Pre-commit (follow §5)     | Type errors should block commits per the agreed quality gate spec | Plan   |
| Coverage threshold in CI              | None — `npm run test` only | Phase 4 goal is "lock the floor", not metric enforcement          | Plan   |
| CI branch target                      | Fix `master` → `main`      | Gates we add would never fire on real work without this fix       | Plan   |

## Scope

**In scope:**

- `package.json`: add `"prepare": "husky"` and `"check": "astro check"` scripts
- `.husky/pre-commit`: append `npm run check`
- `.husky/pre-push`: create new file with `npm run test`
- `.github/workflows/ci.yml`: fix branch trigger; add `check` + `test` steps
- `context/foundation/test-plan.md`: mark Phase 4 done

**Out of scope:**

- Coverage thresholds
- Playwright in CI
- Moving `@astrojs/check` to `devDependencies`
- Mutation testing in CI

## Architecture / Approach

Five targeted edits to four existing files (plus one new file). No new dependencies. Order is
load-bearing: scripts must exist before hooks reference them, hooks must be manually verified
before the CI push. Husky's `prepare` lifecycle handles hook activation automatically on `npm
install` — no manual chmod or hook registration needed.

## Phases at a Glance

| Phase          | What it delivers                                   | Key risk                                                       |
| -------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| 1. npm Scripts | `"check"` + `"prepare"` scripts; Husky activation  | `npm install` must be run after editing to write `.git/hooks/` |
| 2. Git Hooks   | pre-commit: lint + typecheck; pre-push: tests      | Pre-push hook file must be created (doesn't exist yet)         |
| 3. CI Pipeline | All five steps pass on `main`; branch target fixed | Build step must still receive its secrets                      |
| 4. Bookkeeping | test-plan §3 reflects Phase 4 done                 | Trivial — table edit only                                      |

**Prerequisites:** Phases 1–3 of the test-plan rollout are all `done` (7 test files passing).  
**Estimated effort:** ~1 session; 5 file edits + one `npm install` + one CI push to verify.

## Open Risks & Assumptions

- `astro check` runs in ~2–5 s on this codebase; if it grows significantly, move it to pre-push
  and amend test-plan §5.
- `npm ci` on GitHub Actions runs the `prepare` script (writes Husky hooks to `.git/hooks/`);
  this is harmless because CI never makes git commits so the hooks never fire. No `HUSKY=0`
  override is needed.

## Success Criteria (Summary)

- `git commit` is blocked by type errors; `git push` is blocked by failing tests
- GitHub Actions on `main` shows five green steps in correct order
- test-plan §3 shows Phase 4 as `done`
