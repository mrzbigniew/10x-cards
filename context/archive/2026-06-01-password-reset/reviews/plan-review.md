<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Password Reset Flow Implementation Plan

- **Plan**: context/changes/password-reset/plan.md
- **Mode**: Deep
- **Date**: 2026-06-01
- **Verdict**: REVISE
- **Findings**: 0 critical · 1 warning · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

10/10 paths ✓ · 5/5 symbols ✓ · brief↔plan ✓

## Findings

### F1 — `localhost` origin not in Supabase redirect allowlist

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Config / supabase/config.toml:156
- **Detail**: config.toml had `site_url = "http://127.0.0.1:3000"` and `additional_redirect_urls = ["https://127.0.0.1:3000"]`. When the app is accessed via `http://localhost:8080` (the team's actual dev URL), the dynamic `redirectTo` resolves to `http://localhost:8080/auth/reset-password` — not in the allowlist. Supabase's local GoTrue validates `redirectTo` against this list and rejects the mismatched origin; the password-reset email is not sent or links to an unresolvable callback.
- **Fix**: Add `"http://localhost:8080"` to `additional_redirect_urls` in `supabase/config.toml`, and update `site_url` to match.
- **Decision**: FIXED — user updated config.toml directly: `site_url = "http://localhost:8080"`, `additional_redirect_urls = ["http://localhost:8080", "http://localhost:8080/**"]`

### F2 — Production redirect URL is prose-only, not enforced

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — Production Supabase configuration
- **Detail**: The two required post-deploy Supabase dashboard steps (add `/auth/reset-password` to Redirect URLs; set Email OTP Expiry to 86400 s) were noted in plan prose only — no TODO comment in code or deploy checklist. If forgotten at deploy time, the production reset flow fails silently.
- **Fix**: Add TODO comments in `src/pages/api/auth/forgot-password.ts` at the `resetPasswordForEmail` call site.
- **Decision**: FIXED — two `// TODO(deploy):` comments added to `src/pages/api/auth/forgot-password.ts`
