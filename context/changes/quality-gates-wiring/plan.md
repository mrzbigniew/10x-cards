# Quality Gates Wiring — Implementation Plan

## Overview

Wire the three quality gates (lint + typecheck + tests) into both the CI pipeline and local git
hooks so no commit or push can regress the codebase silently. This is Phase 4 of the test-plan
rollout.

## Current State Analysis

Three gates exist in name but none are fully enforced:

- **CI** — lint and build run; `astro check` (typecheck) and `vitest run` (tests) are absent.
- **Pre-commit hook** — `.husky/pre-commit` exists but never fires: `package.json` has no
  `"prepare": "husky"` script, so Husky never writes `.git/hooks/pre-commit`.
- **`astro check` script** — `@astrojs/check` is installed but there is no `"check"` npm script
  to call it.
- **CI branch target** — the workflow triggers on `master`; the repo default branch is `main`.
  The gates we add would never fire on real work.

### Key Discoveries

- `.github/workflows/ci.yml:3-6` — triggers on `master`, not `main`
- `package.json:scripts` — no `"prepare"` or `"check"` entry
- `.husky/pre-commit:1` — contains only `npx lint-staged`; no pre-push hook file exists
- `vitest.setup.ts` — mocks `astro:env/server` with hard-coded test values; the test step needs
  no CI secrets
- `astro check` reads env schema from `astro.config.mjs` only; also needs no secrets in CI
- Husky 9 `prepare` script runs during `npm install` (and `npm ci`); writing hook files on CI is
  harmless because CI never makes git commits, so the hooks never fire

## Desired End State

- `git commit` runs lint-staged (ESLint auto-fix on staged files) then `astro check` (full
  project typecheck). Either failure aborts the commit with a clear message.
- `git push` runs the full Vitest suite. A failing test aborts the push.
- GitHub Actions on any push or PR targeting `main` runs: install → astro sync → lint → check →
  test → build, in that order. Build is the only step that uses secrets.
- `context/foundation/test-plan.md` §3 shows Phase 4 status `done`.

### Key Discoveries

See Current State Analysis above — all five file references apply.

## What We're NOT Doing

- Adding a coverage threshold to CI (deferred; Phase 4 goal is "lock the floor", not metric
  enforcement)
- Moving `astro check` to pre-push (it stays on pre-commit per test-plan §5)
- Enabling Playwright in CI (out of scope for Phase 4 per test-plan §3 and research)
- Moving `@astrojs/check` from `dependencies` to `devDependencies` (separate cleanup, not Phase 4)
- Adding mutation testing to CI (stays manual-only per project conventions)

## Implementation Approach

Five targeted edits across four files — no new dependencies, no configuration added beyond what
already exists. Order matters: npm scripts first (so `npm run check` resolves), then hooks (so
manual verification is possible locally), then CI, then bookkeeping.

## Critical Implementation Details

**Husky hook activation requires `npm install`**: After editing `package.json`, the implementer
must run `npm install` (not just save the file) to trigger the `prepare` lifecycle script. This
is what writes `.git/hooks/pre-commit` and `.git/hooks/pre-push`. Without this step, hooks are
still inert despite the source files in `.husky/` being correct.

---

## Phase 1: npm Scripts

### Overview

Add two missing npm scripts to `package.json`. This unblocks all downstream changes: `npm run
check` becomes callable by hooks and CI, and `npm install` will now activate Husky.

### Changes Required

#### 1. package.json — add `prepare` and `check` scripts

**File**: `package.json`

**Intent**: Add `"prepare": "husky"` so every `npm install` (local or CI) writes the hook
entries to `.git/hooks/`. Add `"check": "astro check"` so the typecheck command is addressable
by name from hooks and CI.

**Contract**: Both entries go in the `"scripts"` object. `"prepare"` must be a top-level script
key (not inside another object). `"check"` sits alongside `"lint"` and `"test"`.

### Success Criteria

#### Automated Verification

- `npm run check` exits 0 (astro check passes on the current codebase)
- `npm run test` continues to exit 0 (no regression from script additions)

#### Manual Verification

- Run `npm install` after editing; confirm Husky activated with
  `git config core.hooksPath` — must print `.husky` (Husky 9 sets
  `core.hooksPath` rather than writing files to `.git/hooks/`)

**Implementation Note**: After automated verification passes, run `npm install` and confirm
`git config core.hooksPath` prints `.husky` before proceeding to Phase 2.

---

## Phase 2: Git Hooks

### Overview

Update the pre-commit hook source to include the typecheck step, and create a pre-push hook
source for the test suite.

### Changes Required

#### 1. `.husky/pre-commit` — append typecheck step

**File**: `.husky/pre-commit`

**Intent**: Add `npm run check` as the second command so type errors block commits. It runs
after lint-staged (which auto-fixes staged files first) to avoid flagging type errors in code
that lint-staged would have fixed.

**Contract**: The file should contain exactly two lines:

```
npx lint-staged
npm run check
```

#### 2. `.husky/pre-push` — create test gate

**File**: `.husky/pre-push` (new file)

**Intent**: Run the full Vitest suite before any push reaches the remote. Vitest exits non-zero
on any test failure, which aborts the push.

**Contract**: The file contains a single line: `npm run test`

### Success Criteria

#### Automated Verification

- `npm run check` exits 0
- `npm run test` exits 0

#### Manual Verification

- Make a trivial change to a `.ts` file and `git commit` — observe lint-staged + astro check
  both run and the commit proceeds
- Attempt a `git push` (dry-run acceptable: `git push --dry-run`) — observe Vitest runs before
  the push attempt

**Implementation Note**: Pause here after manual hook verification before moving to Phase 3.

---

## Phase 3: CI Pipeline

### Overview

Patch `ci.yml` to target the correct branch and insert the two missing gate steps between lint
and build.

### Changes Required

#### 1. `.github/workflows/ci.yml` — fix branch targets and add steps

**File**: `.github/workflows/ci.yml`

**Intent**: Change both `push.branches` and `pull_request.branches` from `master` to `main` so
CI fires on real work. Then add `npm run check` and `npm run test` as sequential steps between
`npm run lint` and `npm run build`.

**Contract**: The final step order in the `ci` job:

```
npm ci
npx astro sync
npm run lint
npm run check        ← new
npm run test         ← new
npm run build        (env secrets unchanged)
```

The `check` and `test` steps get no `env:` block — they need no secrets (confirmed in research).

### Success Criteria

#### Automated Verification

- Push a commit to `main` (or open a PR targeting `main`); all five steps pass in GitHub Actions
- CI log shows `npm run check` and `npm run test` steps in the expected order

#### Manual Verification

- Inspect the GitHub Actions run summary; confirm no spurious failures in build step (secrets
  still present)
- Confirm the workflow triggers on `main`, not `master`

**Implementation Note**: This phase requires a push to the remote. Confirm Phase 2 manual
verification is complete before pushing.

---

## Phase 4: Bookkeeping

### Overview

Update `test-plan.md` to reflect that Phase 4 is complete and point the change folder entry to
the correct path.

### Changes Required

#### 1. `context/foundation/test-plan.md` — update Phase 4 row

**File**: `context/foundation/test-plan.md`

**Intent**: Mark Phase 4 status as `done` and fill in the change folder reference so the
test-plan §3 table is accurate.

**Contract**: In the §3 Phased Rollout table, update the `quality-gates-wiring` row:

- `Status` column: `not started` → `done`
- `Change folder` column: `—` → `context/changes/quality-gates-wiring/`

### Success Criteria

#### Automated Verification

- `context/foundation/test-plan.md` renders correctly (no broken markdown table)

#### Manual Verification

- Read §3 of test-plan.md; confirm Phase 4 row shows `done` and the correct change folder

---

## Testing Strategy

### Automated

All existing tests continue to pass unmodified — no production code changes in this plan.

### Manual Testing Steps

1. After Phase 1: `ls .git/hooks/` shows `pre-commit` and `pre-push` (after `npm install`)
2. After Phase 2: `git commit` on a trivial change runs both lint-staged and `astro check`
3. After Phase 2: `git push --dry-run` triggers Vitest before the push attempt
4. After Phase 3: GitHub Actions run on `main` shows all five steps green

## References

- Research: `context/changes/quality-gates-wiring/research.md`
- Test plan §5 (quality gates): `context/foundation/test-plan.md`
- Husky lifecycle: research §"Pre-commit Hook — Husky"
- CI secrets usage: research §"CI Pipeline"

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: npm Scripts

#### Automated

- [x] 1.1 `npm run check` exits 0
- [x] 1.2 `npm run test` continues to exit 0

#### Manual

- [x] 1.3 `.git/hooks/pre-commit` and `.git/hooks/pre-push` appear after `npm install`

### Phase 2: Git Hooks

#### Automated

- [x] 2.1 `npm run check` exits 0 — a5dae57
- [x] 2.2 `npm run test` exits 0 — a5dae57

#### Manual

- [x] 2.3 `git commit` triggers lint-staged + astro check — a5dae57
- [x] 2.4 `git push --dry-run` triggers Vitest — a5dae57

### Phase 3: CI Pipeline

#### Automated

- [x] 3.1 GitHub Actions run on `main` passes all five steps — 4d1b7a3
- [x] 3.2 CI log shows `npm run check` and `npm run test` in order — 4d1b7a3

#### Manual

- [x] 3.3 Build step shows no spurious failures (secrets intact) — 4d1b7a3
- [x] 3.4 Workflow triggers on `main`, not `master` — 4d1b7a3

### Phase 4: Bookkeeping

#### Automated

- [x] 4.1 `test-plan.md` renders correctly (no broken markdown table) — ffd83ea

#### Manual

- [x] 4.2 Phase 4 row in §3 shows `done` and correct change folder — ffd83ea
