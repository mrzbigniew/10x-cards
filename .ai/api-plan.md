# REST API Plan

## 1. Resources

- `Flashcard` (DB table: `public.flashcards`)
  - Fields: `id`, `user_id`, `front`, `back`, `source`, `generation_id`, `created_at`, `updated_at`
  - Constraints/notes: `front` and `back` length + non-empty trimming checks; `source` is an enum (`MANUAL`, `AI`, `AI_EDIT`)
- `AIGenerationLog` (DB table: `public.ai_generation_logs`)
  - Fields: `id`, `user_id`, `model`, `prompt_text_hash`, `prompt_text_length`, `generated_count`, `accepted_count`, `edited_count`, `error_code`, `error_message`, `created_at`, `duration`, `prompt_text`, `raw_candidates`
- `AIGenerationStats` (DB view: `public.ai_generation_stats`, read-only aggregation)
  - Fields: `user_id`, `total_generations`, `total_accepted_cards`, `acceptance_rate_percent`

Notes:

- `auth.users` is used for identity/ownership but is not a custom application table.
- Study-session state is not represented in the provided schema; API will therefore be stateless for the MVP study flow (client-side sequencing), while providing read access to the ordered cards list.

## 2. API Endpoints

### Common conventions

- Base URL: `/api`
- Request content type: `application/json`
- Success response bodies:
  - For `GET` endpoints: JSON object with `data` and optionally `meta`.
  - For `POST/PUT` endpoints: JSON object with `data`.
  - For `DELETE` endpoints: `204 No Content` (or `200` with `data` if you prefer consistency).
- Error response format:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

- Authentication:
  - Endpoints under “Protected resources” require an authenticated user.
  - Ownership is enforced by Supabase RLS (`auth.uid() = user_id`).

---

## 2.1 Authentication (Supabase-backed)

### Register

- Method: `POST`
- URL: `/api/auth/register`
- Description: Create a new user account (email + password) and trigger an activation email.
- Query params: none
- Request JSON:

```json
{
  "email": "user@example.com",
  "password": "string",
  "confirmPassword": "string"
}
```

- Response JSON (success):

```json
{
  "data": {
    "status": "activation_email_sent"
  }
}
```

- Success codes:
  - `201 Created`
  - `200 OK` (if your implementation returns a status object)
- Error codes/messages:
  - `400`/`422` validation errors (password policy, mismatched passwords)
  - `409` email already in use
  - `500` unexpected error

### Verify email / Activate account

- Method: `POST`
- URL: `/api/auth/verify-email`
- Description: Verify the email activation link (OTP/code flow) and activate the account.
- Request JSON:

```json
{
  "email": "user@example.com",
  "token": "string"
}
```

- Response JSON:

```json
{
  "data": {
    "status": "email_verified"
  }
}
```

- Success codes: `200 OK`
- Error codes/messages:
  - `400` invalid/expired token
  - `401` if auth context is required by your OTP flow

### Login

- Method: `POST`
- URL: `/api/auth/login`
- Description: Authenticate with email + password.
- Request JSON:

```json
{
  "email": "user@example.com",
  "password": "string"
}
```

- Response JSON:

```json
{
  "data": {
    "status": "logged_in"
  }
}
```

- Success codes: `200 OK`
- Error codes/messages:
  - `401` wrong credentials
  - `403` account not active (PRD: inactive accounts must not be able to log in)

### Request password reset

- Method: `POST`
- URL: `/api/auth/reset-password/request`
- Description: Send a password reset link valid for `2 hours`.
- Request JSON:

```json
{
  "email": "user@example.com"
}
```

- Response JSON:

```json
{
  "data": {
    "status": "reset_email_sent"
  }
}
```

- Success codes: `200 OK`
- Error codes/messages:
  - `400` invalid email format
  - `500` unexpected error

### Confirm password reset

- Method: `POST`
- URL: `/api/auth/reset-password/confirm`
- Description: Confirm a reset token and set a new password.
- Request JSON:

```json
{
  "email": "user@example.com",
  "token": "string",
  "password": "string",
  "confirmPassword": "string"
}
```

- Response JSON:

```json
{
  "data": {
    "status": "password_updated"
  }
}
```

- Success codes: `200 OK`
- Error codes/messages:
  - `400` token invalid/expired
  - `422` password policy violations

### Change password (while logged in)

- Method: `POST`
- URL: `/api/auth/change-password`
- Description: Change password from the app while keeping the user logged in.
- Protected resource: yes
- Request JSON:

```json
{
  "currentPassword": "string",
  "newPassword": "string",
  "confirmPassword": "string"
}
```

- Response JSON:

```json
{
  "data": {
    "status": "password_changed",
    "session": {
      "stillAuthenticated": true
    }
  }
}
```

- Success codes: `200 OK`
- Error codes/messages:
  - `401` not authenticated
  - `403` current password incorrect
  - `422` password policy violations

---

## 2.2 Flashcards

### List flashcards (paginated)

- Method: `GET`
- URL: `/api/flashcards`
- Description: Return paginated flashcards for the authenticated user, sorted by `created_at` descending (PRD: 20 per page; sorted decreasing by created date).
- Protected resource: yes
- Query params:
  - `limit` (default: `20`, max: `20` to match PRD)
  - `offset` (default: `0`)
  - `source` (optional: `MANUAL|AI|AI_EDIT`) to filter by generation source
  - `includeGeneration` (optional, default: `false`) to return `generation_id` field
- Request JSON: none
- Response JSON:

```json
{
  "data": [
    {
      "id": "uuid",
      "front": "string",
      "back": "string",
      "source": "manual|ai|ai_edit",
      "generationId": "uuid|null",
      "createdAt": "ISO-8601 string",
      "updatedAt": "ISO-8601 string"
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0
  }
}
```

- Success codes: `200 OK`
- Error codes/messages:
  - `401` not authenticated
  - `400` invalid query params

### Bulk create flashcards (manual and AI-generated)

- Method: `POST`
- URL: `/api/flashcards`
- Description: Create multiple flashcards in a single request. Supports both manual and AI-generated flashcards. Flashcards must adhere to field validation and required properties below.
- Protected resource: yes

- Request JSON:

```json
{
  "flashcards": [
    {
      "front": "string",
      "back": "string",
      "source": "MANUAL|AI|AI_EDIT",
      "generation_id": "uuid|null"
    }
  ]
}
```

- Response JSON:

```json
{
  "data": [
    {
      "id": "uuid",
      "front": "string",
      "back": "string",
      "source": "MANUAL|AI|AI_EDIT",
      "generationId": "uuid|null",
      "createdAt": "ISO-8601 string",
      "updatedAt": "ISO-8601 string"
    }
  ]
}
```

- Success codes:
  - `201 Created`
  - `200 OK` (if your framework prefers)

- Error codes/messages:
  - `401` not authenticated
  - `422` if any flashcard violates validation (all-or-nothing: insertion fails if any invalid)
      - validation includes: `front/back` non-empty after trim, length limits, no whitespace-only, `source` present and correct, `generation_id` null for MANUAL, uuid for AI/AI_EDIT
      - returns list of validation errors per item
  - `400` too many flashcards (if limit exceeded)
  - `500` unexpected error

- Notes:
  - This endpoint enables batch saving for both manual and AI-assisted user flows.
  - All flashcards must comply with business logic in validation and field requirements.
  - No partial success: if any flashcard in input is invalid, none are saved.


### Get a single flashcard

- Method: `GET`
- URL: `/api/flashcards/{id}`
- Description: Retrieve a flashcard owned by the current user.
- Protected resource: yes
- Path params:
  - `id`: `uuid`
- Response JSON:

```json
{
  "data": {
    "id": "uuid",
    "front": "string",
    "back": "string",
    "source": "MANUAL|AI|AI_EDIT",
    "generationId": "uuid|null",
    "createdAt": "ISO-8601 string",
    "updatedAt": "ISO-8601 string"
  }
}
```

- Success codes: `200 OK`
- Error codes/messages:
  - `401` not authenticated
  - `404` not found (or not owned due to RLS)

### Update a flashcard

- Method: `PUT`
- URL: `/api/flashcards/{id}`
- Description: Update `front/back` with input validation identical to manual creation (PRD: edit rules match add rules). Also apply business logic for AI-edited cards:
  - If current `source` is `AI`, changing content will switch `source` to `AI_EDIT`.
  - If current `source` is `MANUAL`, keep `source = MANUAL`.
  - If current `source` is `AI_EDIT`, keep `AI_EDIT`.
- Protected resource: yes
- Path params:
  - `id`: `uuid`
- Request JSON:

```json
{
  "front": "string",
  "back": "string"
}
```

- Response JSON:

```json
{
  "data": {
    "id": "uuid",
    "front": "string",
    "back": "string",
    "source": "MANUAL|AI|AI_EDIT",
    "generationId": "uuid|null",
    "createdAt": "ISO-8601 string",
    "updatedAt": "ISO-8601 string"
  }
}
```

- Success codes: `200 OK`
- Error codes/messages:
  - `401` not authenticated
  - `404` not found
  - `422` validation errors
  - `500` unexpected error

### Delete a flashcard

- Method: `DELETE`
- URL: `/api/flashcards/{id}`
- Description: Delete a flashcard owned by the current user (PRD: deletion uses confirmation in UI; pagination behavior is client-side).
- Protected resource: yes
- Path params:
  - `id`: `uuid`
- Response:
  - `204 No Content`
- Error codes/messages:
  - `401` not authenticated
  - `404` not found

---

## 2.3 AI Generation

### Generate candidate flashcards (temporary candidates; logged in DB)

- Method: `POST`
- URL: `/api/generate`
- Description: Generate a list of candidate flashcards from the provided input text.
  - Validates input length `1000..10000` (PRD: frontend and backend).
  - Creates a row in `ai_generation_logs`.
  - Returns candidates without writing them into `flashcards` (PRD: candidates are temporary; no auto-save).
- Protected resource: yes
- Request JSON:

```json
{
  "text": "string"
}
```

- `model` is optional; if omitted, backend selects a default Openrouter model.
- Response JSON:

```json
{
  "data": {
    "generationId": "uuid",
    "candidates": [
      {
        "front": "string",
        "back": "string"
      }
    ]
  }
}
```

- Success codes:
  - `200 OK` (even if no candidates; use empty `candidates` array)
- Error codes/messages:
  - `401` not authenticated
  - `422` `inputText` length outside `1000..10000`
  - `429` rate limit exceeded (recommended for AI cost control)
  - `502/503` AI provider failure
  - `500` unexpected error

### Get AI generation stats (acceptance rate, etc.)

- Method: `GET`
- URL: `/api/ai/stats`
- Description: Return aggregated AI generation metrics for the authenticated user (backed by `ai_generation_stats` view).
- Protected resource: yes
- Query params: none
- Response JSON:

```json
{
  "data": {
    "totalGenerations": 0,
    "totalAcceptedCards": 0,
    "acceptanceRatePercent": null
  }
}
```

- Success codes: `200 OK`
- Error codes/messages:
  - `401` not authenticated

---

## 3. Bisness logic validation

### 3.1 Flashcards

Validation rules (from DB constraints and PRD):

- `front`
  - must be present
  - trimmed `length(front) > 0`
  - `length(front) <= 200`
  - must reject values that are only whitespace
  - white space normalization: leading/trailing whitespace removed on input before storing (PRD: starting whitespace removed while typing; trailing whitespace removed before save)
- `back`
  - must be present
  - trimmed `length(back) > 0`
  - `length(back) <= 500`
  - must reject values that are only whitespace
  - white space normalization: leading/trailing whitespace removed on input before storing (PRD: starting whitespace removed while typing; trailing whitespace removed before save)
- `source`
  - must be prersent 
  - must be one of `MANUAL|AI|AI_EDIT`
- `generation_Id`
  - nullable for `source` = `MANUAL`
  - not null for `source` in `AI|AI_EDIT`

Business logic:

- `POST /api/flashcards` sets for echa record:
  - `source = MANUAL`, `generation_id = null` if manual add
  - `source = AI|AI_EDIT`, `generation_id = uuid` if generated by AI (PRD: AI_EDIT indicates AI-generated but modified by user)
- `PUT /api/flashcards/{id}` updates:
  - validates `front/back` using the same rules as create
  - if current `source` is `AI`, the updated card must switch to `AI_EDIT` (PRD: AI_EDIT indicates AI-generated but modified by user)
  - if current `source` is `AI_EDIT` keep `AI_EDIT`
  - if current `source` is `MANUAL`, keep `MANUAL`
- `GET /api/flashcards`:
  - enforces per-user visibility via RLS
  - pagination uses `limit=20` and sorting by `created_at DESC` (PRD: 20 per page, newest first)

### 4.2 AI Generation

Validation rules:

- `POST /api/ai/generate`
  - `text` length must be within `1000..10000` characters (frontend and backend per PRD)
  - candidate generation output is expected to produce candidate objects with `front/back` that also obey the flashcard field limits

Business logic:

- Candidate generation persistence policy:
  - candidates are NOT written to `flashcards` automatically
  - generation logs ARE written to `ai_generation_logs`
- Atomic acceptance:
  - acceptance inserts all accepted cards in a single transaction:
    - if any candidate is invalid, none are inserted
  - when inserting:
    - set `generation_id = generationId`
    - set `source` per candidate:
      - unchanged vs original => `AI`
      - changed content => `AI_EDIT`
  - update generation log counts:
    - `accepted_count = flashcards.length`
    - `edited_count = flashcards.find(flashcard => flashcard.source == 'AI_EDIT')`
- “No proposals” state:
  - `POST /api/ai/generate` returns `candidates: []` when the model outputs none (PRD: dedicated UI state handled client-side)

### 4.3 AI Stats

Validation rules:

- `GET /api/ai/stats`:
  - no request payload
  - relies on DB view aggregation for the current user

Business logic:

- Uses `ai_generation_stats` view to return:
  - total generations
  - total accepted cards
  - acceptance rate percent


### 4.5 Mapping PRD features to API endpoints

- User authentication (register/login/activate/reset/change password)
  - Endpoints: `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/login`, `POST /api/auth/reset-password/request`, `POST /api/auth/reset-password/confirm`, `POST /api/auth/change-password`
- Private-only access to flashcards and study
  - Implemented by: protected endpoints + Supabase RLS
  - Endpoints: `GET/POST/PUT/DELETE /api/flashcards`, `POST /api/ai/generate`, `GET /api/ai/stats`
- Flashcard CRUD with strict field limits and trimming rules
  - Endpoints: `POST /api/flashcards`, `PUT /api/flashcards/{id}`, `DELETE /api/flashcards/{id}`, `GET /api/flashcards`
- AI generation flow (input length validation, temporary candidates, accept with validation parity)
  - Endpoints: `POST /api/ai/generate`
- Retention and quality analysis logs (store full originally generated candidates; prompts not for further training)
  - Implemented by: `ai_generation_logs` persistence in `POST /api/ai/generate`
  - Metrics computed via: `GET /api/ai/stats` from view

### 4.6 Security and performance requirements

- Authorization and data isolation
  - Enforced by Supabase RLS policies for `flashcards` and `ai_generation_logs` (`auth.uid() = user_id` for SELECT/INSERT/UPDATE/DELETE)
- Input validation
  - Flashcard field limits are enforced both:
    - in API payload validation (to provide user-friendly errors)
    - in DB constraints (as a second line of defense)
- AI cost/security control
  - Apply rate limiting (e.g., per user per minute) on `POST /api/ai/generate` to prevent abuse and control Openrouter usage
- Prompt storage and training avoidance
  - Store prompt text only for analysis/logging per PRD and ensure it is not used for any model training pipeline (enforced operationally; API only guarantees logging behavior)
- WCAG and UI confirmation modals
  - API does not directly implement UI modal behavior; it only provides the correctness of operations (e.g., delete requires authenticated call; acceptance is atomic with validation blocking).

