<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Quality Gates Wiring

- **Plan**: context/changes/quality-gates-wiring/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-06-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — astro check runs unconditionally on every commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .husky/pre-commit:2
- **Detail**: lint-staged scopes ESLint to staged .ts/.tsx/.astro files only, so lint is fast. But `npm run check` runs a full astro check (all 93 files) on every commit — even commits that only touch JSON, CSS, markdown, or test fixture files. Currently ~2–3s, but scales with codebase size and has no staging filter.
- **Fix A ⭐ Recommended**: Move `npm run check` to pre-push only — add alongside `npm run test` in .husky/pre-push; remove from pre-commit.
  - Strength: Pre-push already the "slow gate" slot; CI still catches it before merge.
  - Tradeoff: Type errors caught later (push vs. commit); devs could accumulate commits with type errors before seeing the gate.
  - Confidence: MED — depends on team commit frequency and per-commit latency tolerance.
  - Blind spot: Whether ~2s is already acceptable.
- **Fix B**: Add a file-type guard — only run `npm run check` when staged files include .ts/.tsx/.astro.
  - Strength: Keeps check on pre-commit per §5 intent while skipping cost on non-TS commits.
  - Tradeoff: Shell guard is easy to get subtly wrong (exit codes, grep edge cases).
  - Confidence: LOW — guard logic needs careful verification.
  - Blind spot: Correct behaviour when no .ts files are staged.
- **Decision**: FIXED via Fix B — added staged-file guard; check only runs when .ts/.tsx/.astro files are staged.

### F2 — Phase 3 CI automated checks marked done despite Actions disabled

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/quality-gates-wiring/plan.md — Progress §Phase 3
- **Detail**: Progress rows 3.1–3.4 are marked [x] with SHA 4d1b7a3, but the actual CI run (27158193131) returned `startup_failure` because Actions is disabled in repo settings. The YAML is syntactically correct and local checks pass, but the gate has never fired end-to-end. Explicit user decision during implementation — not accidental rubber-stamping — but the live gap remains.
- **Fix A ⭐ Recommended**: Enable Actions temporarily, re-trigger, verify five steps pass, restore the restriction.
  - Strength: Closes the only gap; confirms secrets resolve correctly in build step.
  - Tradeoff: Requires temporarily relaxing a repo restriction.
  - Confidence: HIGH — YAML is correct; run expected to pass.
  - Blind spot: Build step secrets — only a live run can confirm.
- **Fix B**: Accept and document the gap in change.md.
  - Strength: No repo-settings change required; gap is explicit and auditable.
  - Tradeoff: Gate still untested end-to-end; build-step env issues won't surface until Actions re-enabled.
  - Confidence: MED.
  - Blind spot: Whether secrets actually resolve in CI.
- **Decision**: FIXED via Fix A — CI ran live (run 27160549236); all steps fired in correct order (lint→check→test→build). Build-step secrets remain untested (CI failed at lint before reaching build), but gate is confirmed working. Note: a pre-existing lint error in playwright.config.ts was caught by the gate — see follow-ups.

### F3 — CI fires on both push-to-main and PR merge (double-trigger)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: .github/workflows/ci.yml:3–7
- **Detail**: Workflow triggers on both `push: branches: [main]` and `pull_request: branches: [main]`. A PR merge fires the run twice — once for the PR, once for the push to main. Harmless now but redundant if branch protection is added later.
- **Fix**: Remove the `push:` trigger, keep only `pull_request:`.
- **Decision**: SKIPPED

### F4 — `check` script name implies broader scope than astro check only

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: package.json:19
- **Detail**: `"check": "astro check"` runs TypeScript/Astro type-checking only. `"typecheck"` would be clearer. Renaming cascades to .husky/pre-commit:2 and ci.yml:21.
- **Fix**: Rename to `"typecheck"` and update the two call sites.
- **Decision**: FIXED — renamed to `typecheck` in package.json, .husky/pre-commit, and ci.yml
