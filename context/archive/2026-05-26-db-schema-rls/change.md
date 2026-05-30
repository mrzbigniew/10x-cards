---
change_id: db-schema-rls
title: Supabase database schema migrations and RLS policies for all app data
status: archived
created: 2026-05-26
updated: 2026-05-30
archived_at: 2026-05-30T16:13:01Z
---

## Notes

F-01 from roadmap. Supabase migration files for `decks`, `cards`, and SR-state tables; RLS policies enforce per-user data isolation via `auth.uid()`. SR library choice (ts-fsrs vs SM-2 variant) must be decided upfront to avoid schema rework. Unlocks all other slices (S-01, S-02, S-03, S-04, S-05).
