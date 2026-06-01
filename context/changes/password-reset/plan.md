# Password Reset Flow Implementation Plan

## Overview

Implement the complete forgot-password → email link → new-password flow (S-05) using Supabase's built-in PKCE recovery mechanism. No data model changes — Supabase owns token lifecycle, email delivery, and expiry enforcement.

## Current State Analysis

- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Auth API routes: `src/pages/api/auth/{signin,signup,signout}.ts`
- Supabase client: `src/lib/supabase.ts` — cookie-based SSR client using `@supabase/ssr`
- Form components: `FormField`, `PasswordToggle`, `SubmitButton`, `ServerError` in `src/components/auth/` — all reusable
- Middleware: `src/middleware.ts` — `PUBLIC_ROUTES` array guards pages; all `/api/auth/*` routes already public via `PUBLIC_API_ROUTES`
- Config: `otp_expiry = 3600` in `supabase/config.toml` (needs updating to 86400 for 24 h requirement)
- Email testing: Inbucket running at `localhost:54324` in local dev

## Desired End State

User can click "Forgot password?" on the sign-in page, enter their email, receive an email with a reset link, click the link within 24 hours, enter a new password, and be automatically redirected to `/dashboard` with all existing decks and SR state intact. Submitting an unknown email shows the same "check email" page (privacy-preserving). Expired or already-used links redirect to the forgot-password page with a clear error.

### Key Discoveries:

- `@supabase/ssr` PKCE flow: `resetPasswordForEmail()` sends email → link contains `?code=xxx` → `exchangeCodeForSession(code)` establishes session in cookies → `updateUser({ password })` updates password
- `src/lib/supabase.ts:createClient()` accepts headers + `AstroCookies` — works identically for page frontmatter and API routes
- Error propagation pattern in every existing auth route: redirect with `?error=<encoded message>`, read on page, pass as `serverError` prop to `ServerError` component
- `PUBLIC_API_ROUTES = ["/api/auth"]` in middleware already covers the new API routes — no change needed for API-side routing

## What We're NOT Doing

- Rate-limiting email submissions (Supabase enforces 2 emails/hour via `config.toml`)
- Custom SMTP configuration (Supabase built-in for MVP; custom SMTP is an upgrade path noted in the roadmap)
- "Confirm old password" requirement before setting new one (`secure_password_change = false`)
- Any changes to Supabase schema (password storage is entirely Supabase-managed)
- OAuth / social login / magic-link (parked in roadmap)

## Implementation Approach

Follow the exact pattern of existing auth pages and API routes. Each new page gets a corresponding form component that reuses `FormField`, `PasswordToggle`, `SubmitButton`, and `ServerError`. The reset-password page handles code exchange server-side in its Astro frontmatter. If a subsequent password-update attempt fails and redirects back with `?error=` but no `?code=`, the page falls back to checking for an existing session in cookies so the form remains usable.

## Critical Implementation Details

**Code exchange + fallback logic in reset-password page**: The Astro frontmatter must handle two arrival cases — (a) fresh link click with `?code=xxx`, and (b) POST-failure redirect with no `?code` but a session already set in cookies from the prior exchange. Check `?code` first; if absent, verify an active session via `supabase.auth.getUser()`. Redirect to `/auth/forgot-password?error=...` only when neither condition is met.

**Redirect URL construction**: `redirectTo` in `resetPasswordForEmail()` must be an absolute URL. Derive it from the incoming request: `new URL('/auth/reset-password', context.request.url).href` so it works in local dev, Wrangler preview, and production without hardcoding.

**Production Supabase configuration** (dashboard, not code): After deploy, add `<production-domain>/auth/reset-password` to Auth → URL Configuration → Redirect URLs, and set Email OTP Expiration to 86400 s (24 h). These are not code changes.

---

## Phase 1: Request Flow

### Overview

Implements the first half of the flow: config and middleware updates, the `ForgotPasswordForm` component, the `/auth/forgot-password` page, the `/api/auth/forgot-password` API route, and the `/auth/forgot-password-sent` confirmation page.

### Changes Required:

#### 1. Config: OTP expiry

**File**: `supabase/config.toml`

**Intent**: Extend local-dev recovery link lifetime to 24 h to match the product requirement.

**Contract**: Under `[auth.email]`, change `otp_expiry = 3600` → `otp_expiry = 86400`.

#### 2. Middleware: Public routes

**File**: `src/middleware.ts`

**Intent**: Permit unauthenticated access to the three new auth pages.

**Contract**: Add `/auth/forgot-password`, `/auth/forgot-password-sent`, and `/auth/reset-password` to the `PUBLIC_ROUTES` array. No change needed for API routes — already covered by `PUBLIC_API_ROUTES`.

#### 3. ForgotPasswordForm component

**File**: `src/components/auth/ForgotPasswordForm.tsx`

**Intent**: Email-only form that submits to `/api/auth/forgot-password`. Accepts `serverError` to display expired-link errors on return visits.

**Contract**: Props `{ serverError?: string | null }`. Single `FormField` (id="email", type="email", icon `<Mail>`). Client-side validation: non-empty and valid email format (same regex as `SignInForm`). `SubmitButton` with `pendingText="Sending..."`. Form `action="/api/auth/forgot-password"`, `method="POST"`.

#### 4. Forgot-password page

**File**: `src/pages/auth/forgot-password.astro`

**Intent**: Entry point for the reset flow. Renders the form with any `?error` carried from an expired-link redirect.

**Contract**: Server reads `Astro.url.searchParams.get('error')`. Renders `<ForgotPasswordForm serverError={error} client:load />`. Same card/centering layout as `signin.astro` (title "Forgot password"). Includes a "Back to sign in" link.

#### 5. Forgot-password API route

**File**: `src/pages/api/auth/forgot-password.ts`

**Intent**: Receives the email form POST, calls Supabase to dispatch the recovery email, and always redirects to the confirmation page — never revealing whether the email exists.

**Contract**: `export const POST: APIRoute`, `export const prerender = false`. Reads `email` from `formData`. Builds `redirectTo = new URL('/auth/reset-password', context.request.url).href`. Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo })`. Ignores all Supabase errors (including "user not found"). Always redirects to `/auth/forgot-password-sent`.

#### 6. Forgot-password-sent page

**File**: `src/pages/auth/forgot-password-sent.astro`

**Intent**: Static confirmation page after email submission. Includes spam-folder hint. In dev mode, surfaces the Inbucket URL.

**Contract**: No server-side data needed. Heading: "Check your email". Description: link was sent, click within 24 h. Spam hint paragraph. Dev-only: link to `http://localhost:54324` rendered when `import.meta.env.DEV`. "Back to sign in" link. Same card layout as `confirm-email.astro`.

### Success Criteria:

#### Automated Verification:

- TypeScript compilation passes: `npx tsc --noEmit`
- Lint passes: `npm run lint`

#### Manual Verification:

- Navigate to `/auth/forgot-password` as a signed-out user — page renders without error
- Submit any email address — redirects to `/auth/forgot-password-sent`
- `/auth/forgot-password-sent` shows the spam hint and (in dev) the Inbucket link
- In dev, Inbucket at `localhost:54324` contains the recovery email for a registered address
- Submit a non-existent email address — same `/auth/forgot-password-sent` page shown

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Reset Flow

### Overview

Implements the second half: user clicks the email link, the server exchanges the PKCE code for a session (setting auth cookies), user enters a new password, and is redirected to the dashboard.

### Changes Required:

#### 1. ResetPasswordForm component

**File**: `src/components/auth/ResetPasswordForm.tsx`

**Intent**: New-password + confirm-password form. Mirrors `SignUpForm` validation and field structure, minus the email field. Submits to `/api/auth/reset-password`.

**Contract**: Props `{ serverError?: string | null }`. Two `FormField`s (id="password", id="confirmPassword"), each with `PasswordToggle`. Validation: non-empty, min 6 chars, passwords match (same thresholds as `SignUpForm`). `SubmitButton` pendingText="Updating password...". Form `action="/api/auth/reset-password"`, `method="POST"`.

#### 2. Reset-password page

**File**: `src/pages/auth/reset-password.astro`

**Intent**: Server-side landing page for the email link. Exchanges the PKCE code for a session, then renders the password form. Falls back to verifying an existing session when arriving without a code (after a failed update redirect).

**Contract**: Frontmatter reads `code = Astro.url.searchParams.get('code')` and `error = Astro.url.searchParams.get('error')`. Logic:
- If `code` present → call `supabase.auth.exchangeCodeForSession(code)`; on error redirect to `/auth/forgot-password?error=Link+expired+or+already+used`.
- If no `code` → call `supabase.auth.getUser()`; if no user, redirect to `/auth/forgot-password?error=Link+expired+or+already+used`.
- If session valid → render `<ResetPasswordForm serverError={error} client:load />`.

Title "Set new password". Same card layout as other auth pages.

#### 3. Reset-password API route

**File**: `src/pages/api/auth/reset-password.ts`

**Intent**: Receives the new-password POST, calls `updateUser` against the session established by the code exchange, and redirects to the dashboard on success.

**Contract**: `export const POST: APIRoute`, `export const prerender = false`. Reads `password` from `formData`. Calls `supabase.auth.updateUser({ password })`. On error: redirect to `/auth/reset-password?error=<encoded message>`. On success: redirect to `/dashboard`.

### Success Criteria:

#### Automated Verification:

- TypeScript compilation passes
- Lint passes

#### Manual Verification:

- In dev: open Inbucket, click the reset link → lands on `/auth/reset-password` with the password form
- Enter a new password (≥ 6 chars, matching confirm) → redirects to `/dashboard`, user is signed in
- All existing decks visible on dashboard (data intact)
- Enter mismatched passwords → client-side validation error; no network request made
- Enter a password under 6 chars → client-side validation error
- Attempt to reuse the same reset link after a successful update → redirects to `/auth/forgot-password?error=Link+expired+or+already+used`
- Navigate to `/auth/reset-password` with no `?code` and no session → redirects to `/auth/forgot-password?error=...`
- Sign out; sign in with old password → fails; sign in with new password → succeeds

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Sign-in Integration

### Overview

Surfaces the forgot-password entry point on the sign-in page.

### Changes Required:

#### 1. "Forgot password?" link in SignInForm

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Add a right-aligned "Forgot password?" anchor after the password field, giving users a discovery path to the reset flow from the sign-in page.

**Contract**: Insert a right-aligned `<div className="text-right">` containing `<a href="/auth/forgot-password" className="text-sm text-purple-300 hover:underline">Forgot password?</a>`. Place it between the password `FormField` and the `<ServerError>` component.

### Success Criteria:

#### Automated Verification:

- TypeScript compilation passes
- Lint passes

#### Manual Verification:

- Sign-in page shows "Forgot password?" link below password field, right-aligned
- Clicking the link navigates to `/auth/forgot-password`
- Existing sign-in flow is unaffected

---

## Testing Strategy

### Manual Testing Steps:

1. Request reset with a registered email → verify recovery email appears in Inbucket
2. Request reset with an unregistered email → same "check email" page; no email in Inbucket (verify neutral behavior)
3. Click reset link → form appears; enter and confirm new password → land on dashboard
4. Verify existing decks are present on dashboard (data intact)
5. Sign out; attempt sign-in with old password → fails; sign-in with new password → succeeds
6. Click the now-used reset link a second time → redirects to forgot-password with expired-link error
7. Navigate to `/auth/reset-password` with no `?code` and no active session → redirects to forgot-password
8. Submit reset form with passwords that don't match → client-side validation catches it before submission

## Performance Considerations

No additional database queries — password storage and the auth token exchange are handled entirely by Supabase Auth (auth.users table managed by Supabase).

## Migration Notes

No schema changes. No data migration required. Existing sessions and user data are unaffected.

## References

- Roadmap entry S-05: `context/foundation/roadmap.md`
- Existing auth patterns: `src/pages/api/auth/signin.ts`, `src/pages/auth/signin.astro`, `src/components/auth/SignUpForm.tsx`
- Supabase client factory: `src/lib/supabase.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Request Flow

#### Automated

- [x] 1.1 TypeScript compilation passes (`npx tsc --noEmit`) — 9468b48
- [x] 1.2 Lint passes (`npm run lint`) — 9468b48

#### Manual

- [x] 1.3 `/auth/forgot-password` renders without error for signed-out user — 9468b48
- [x] 1.4 Submitting any email → `/auth/forgot-password-sent` with spam hint — 9468b48
- [x] 1.5 Inbucket shows recovery email for registered address — 9468b48
- [x] 1.6 Non-existent email → same `/auth/forgot-password-sent` (neutral behavior) — 9468b48

### Phase 2: Reset Flow

#### Automated

- [x] 2.1 TypeScript compilation passes — 5a0c619
- [x] 2.2 Lint passes — 5a0c619

#### Manual

- [x] 2.3 Clicking Inbucket link → `/auth/reset-password` with password form — 5a0c619
- [x] 2.4 Valid new password → redirects to `/dashboard`, user signed in, decks intact — 5a0c619
- [x] 2.5 Mismatched passwords → client-side validation error (no submission) — 5a0c619
- [x] 2.6 Password under 6 chars → client-side validation error — 5a0c619
- [x] 2.7 Re-used reset link → `/auth/forgot-password?error=Link+expired+or+already+used` — 5a0c619
- [x] 2.8 `/auth/reset-password` with no code and no session → forgot-password redirect — 5a0c619
- [x] 2.9 Sign-in with old password fails; new password succeeds — 5a0c619

### Phase 3: Sign-in Integration

#### Automated

- [x] 3.1 TypeScript compilation passes
- [x] 3.2 Lint passes

#### Manual

- [x] 3.3 "Forgot password?" link visible on sign-in page, right-aligned below password field
- [x] 3.4 Link navigates to `/auth/forgot-password`
- [x] 3.5 Existing sign-in flow unaffected
