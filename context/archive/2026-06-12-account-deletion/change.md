---
change_id: account-deletion
title: Account deletion via new settings page behind an avatar menu
status: archived
created: 2026-06-12
updated: 2026-06-14
archived_at: 2026-06-14T10:42:09Z
---

## Notes

Source: roadmap slice **S-09 (account-deletion)** in `context/foundation/roadmap.md` — "user can permanently delete their account and all related data (decks, cards, SR state)". PRD ref: NFR (GDPR baseline — right to erasure). Prerequisite F-01 (db-schema-rls) is done.

### Scope

Two parts: a topbar navigation change (avatar menu) and a new settings page that hosts account actions, including the account-deletion outcome from S-09.

**1. Topbar: replace the logout link with an avatar menu**

- Today `src/components/Topbar.astro` renders a plain "Wyloguj" button (a form POST to `/api/auth/signout`) for signed-in users.
- Replace it with an avatar dropdown menu (shadcn/ui `DropdownMenu` + `Avatar`) containing two items:
  - **Ustawienia** — navigates to the new settings page. With some gear icon next to it.
  - **Wyloguj** — keeps the existing behavior (POST `/api/auth/signout`); only its placement moves into the menu. With some logout icon next to it.
- The signed-out state of the topbar (Zaloguj się / Zarejestruj się) is unchanged.

**2. New settings page**

A server-rendered page (e.g. `/settings`, gated like other authenticated pages) displaying:

- the user's login (email) — read-only,
- a change-password option, - placeholder for now it will be implemented later
- a **delete account** button.

### Account deletion requirements (from S-09)

- Deletion is permanent and irreversible — no undo, no soft-delete (PRD non-goal).
- Must remove the auth user **and** all app data (decks, cards, SR state); verify FK cascades so neither side leaves orphans.
- Requires a hard confirmation before executing (e.g. password re-entry or typed phrase, consistent with the typed-name deck-delete pattern from S-02).

### UI language

User-facing labels are Polish: "Ustawienia", "Wyloguj", and Polish copy for the settings/deletion UI, consistent with the rest of the app.
