<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Account Deletion (S-09)

- **Plan**: context/changes/account-deletion/plan.md
- **Scope**: All 4 phases
- **Date**: 2026-06-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — supabase session null-check inadvertently gates deletion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/account.ts:36
- **Detail**: The early guard `if (!admin || !supabase)` blocks the entire deletion path when the session client (`createClient`) is unavailable — even though `supabase` is only used for the best-effort `signOut()` that is already allowed to fail (lines 48-55). `deleteAccount` only needs `admin`. In practice this is unreachable because if `SUPABASE_KEY` is unset the middleware's `getUser()` also fails and the 401 fires first. But the code structure implies a stronger invariant than intended.
- **Fix**: Separate the two null-checks. Guard on `!admin` only in the early block; move the `!supabase` check to just before the `signOut()` call. Update `account.test.ts:124` to match the new behaviour ("null supabase → 200 with signOut skipped" instead of "null supabase → 503").
  - Strength: Brings code intent into alignment with documented behaviour (signOut tolerated to fail).
  - Tradeoff: Requires updating the corresponding unit test.
  - Confidence: HIGH — the 401 guard makes this unreachable in practice, but correctness-by-reading matters.
  - Blind spot: If SUPABASE_KEY is ever separated from SUPABASE_URL in a future environment, this becomes reachable.
- **Decision**: FIXED — separated null-checks; `api/account.ts` now guards only on `!admin` early and moves `createClient`/`signOut` to after deletion; `account.test.ts:124` updated to assert 200 + deleteUser called + signOut skipped when session client is null.

### F2 — no cleanup of disposable test accounts on failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: e2e/account-deletion.spec.ts (whole file); tests/teardown.ts (currently empty)
- **Detail**: Each test run mints a `+delete-{Date.now()}@domain` account. If the spec fails between signup and the deletion step, the Supabase auth table accumulates zombie accounts. `tests/teardown.ts` is empty, so nothing ever cleans them.
- **Fix**: Add a `test.afterEach` (or `test.afterAll`) to the spec that calls the Supabase admin API to delete the disposable user by email if it still exists, using the service-role key already available in `.env`.
  - Strength: Keeps the Supabase auth table clean across repeated CI runs without manual intervention.
  - Tradeoff: Adds ~10 lines and an admin client dependency to the test file.
  - Confidence: HIGH — zombie accounts are a known E2E hygiene issue for specs that create real auth rows.
  - Blind spot: May need supabase-js admin API imported directly in the test rather than via the app's route.
- **Decision**: FIXED — added `test.afterAll` to `e2e/account-deletion.spec.ts` that creates an admin Supabase client and deletes the disposable user by email if it still exists after the test run.

### F3 — "Sign in" page title is English (pre-existing)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency (Polish rule)
- **Location**: src/pages/auth/signin.astro:9
- **Detail**: `<Layout title="Sign in">` is English while the heading is "Zaloguj się". Phase 2 touched this file to add the account-deleted notice but the English title was pre-existing.
- **Fix**: Change `title="Sign in"` to `title="Zaloguj się"`.
- **Decision**: SKIPPED

### F4 — narrow double-click race on destructive confirm button

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/settings/DeleteAccountSection.tsx:34-38
- **Detail**: `setIsDeleting(true)` is synchronous but the button's `disabled` re-render only lands after React's next render pass. A rapid double-click within that window could launch two concurrent DELETE /api/account requests. The second call would hit the API after the user is deleted, return a 500, and display it briefly before navigation. Low probability but the operation is destructive.
- **Fix**: Add a `useRef<boolean>` guard checked at the top of `handleDelete` and set before the first await, reset in `finally`. Same pattern as `UserMenu.tsx`'s `formRef`.
- **Decision**: SKIPPED

### F5 — plan references wrong filename for Playwright login file

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — informational only; no code change needed
- **Dimension**: Plan Adherence
- **Location**: plan.md Phase 3 (tests/login.setup.ts)
- **Detail**: The plan specified modifying `tests/login.setup.ts:18` in Phase 3, but that file never existed — the real fixture is `tests/setup.ts`. The implementation correctly modified `tests/setup.ts` instead. No functional drift; the plan's filename was wrong.
- **Fix**: No action needed in code.
- **Decision**: SKIPPED
