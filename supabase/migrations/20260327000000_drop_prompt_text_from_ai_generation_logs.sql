-- =============================================================================
-- Migration: 20260327000000_drop_prompt_text_from_ai_generation_logs.sql
-- Purpose: Drop prompt_text column and its associated comment from the
--          ai_generation_logs table.
-- Tables affected:
--   - ai_generation_logs
-- Notes:
--   - prompt_text_hash and prompt_text_length are retained for analytics.
-- =============================================================================

-- drop column comment first (implicit when column is dropped, but explicit for clarity)
comment on column ai_generation_logs.prompt_text is null;

-- drop prompt_text column
alter table ai_generation_logs
  drop column prompt_text;
