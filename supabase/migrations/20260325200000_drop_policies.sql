-- =============================================================================
-- Migration: 20260325200000_drop_policies.sql
-- Purpose: Drop all RLS policies from flashcards and ai_generation_logs.
-- This removes the granular access control policies previously created.
-- Note: RLS remains enabled on the tables. Without policies, all access will be denied
--       by default (Supabase/Postgres behavior). Consider disabling RLS or adding new policies
--       if full access is desired.
-- Tables affected: 
--   - flashcards
--   - ai_generation_logs
-- =============================================================================

-- drop all policies for flashcards table
drop policy if exists "authenticated select own flashcards" on flashcards;
drop policy if exists "anon cannot select flashcards" on flashcards;
drop policy if exists "authenticated insert own flashcards" on flashcards;
drop policy if exists "anon cannot insert flashcards" on flashcards;
drop policy if exists "authenticated update own flashcards" on flashcards;
drop policy if exists "anon cannot update flashcards" on flashcards;
drop policy if exists "authenticated delete own flashcards" on flashcards;
drop policy if exists "anon cannot delete flashcards" on flashcards;

-- drop all policies for ai_generation_logs table
drop policy if exists "authenticated select own ai logs" on ai_generation_logs;
drop policy if exists "anon cannot select ai logs" on ai_generation_logs;
drop policy if exists "authenticated insert own ai logs" on ai_generation_logs;
drop policy if exists "anon cannot insert ai logs" on ai_generation_logs;
drop policy if exists "authenticated update own ai logs" on ai_generation_logs;
drop policy if exists "anon cannot update ai logs" on ai_generation_logs;

comment on table flashcards is 'rls policies dropped - review access control';
comment on table ai_generation_logs is 'rls policies dropped - review access control';

-- =============================================================================
-- Notes:
-- - Policies dropped using IF EXISTS for safety in case of re-runs.
-- - After this migration, you may want to either:
--   1. Disable RLS entirely: ALTER TABLE ... DISABLE ROW LEVEL SECURITY;
--   2. Create new simplified policies.
-- - Run with: supabase db push or supabase migration up
-- =============================================================================
