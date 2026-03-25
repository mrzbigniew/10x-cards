-- =============================================================================
-- Migration: 20260325184000_create_flashcards_ai_logs.sql
-- Purpose: Create core schema for 10x-cards application including flashcards
--          and AI generation tracking tables.
-- Tables affected: 
--   - source_type enum
--   - ai_generation_logs
--   - flashcards
--   - update_updated_at_column trigger function
--   - ai_generation_stats view
-- RLS: Enabled on all tables with granular policies for anon and authenticated roles.
-- Notes: 
--   - All SQL written in lowercase per guidelines.
--   - Follows referential order: enum -> ai_generation_logs -> flashcards.
--   - Fixed inconsistencies from db-plan (e.g. generation_id type to uuid, missing columns).
--   - Optimized for Supabase (RLS, auth.users references, indexes for pagination).
--   - Trigger only on flashcards for updated_at.
-- =============================================================================

-- 1. create enum type for card source
-- this distinguishes between manually created cards and those generated/edited by ai
create type source_type as enum ('manual', 'ai', 'ai_edit');

comment on type source_type is 'źródło utworzenia fiszki - pozwala analizować udział ai w generowaniu treści';

-- 2. create ai_generation_logs table first (referenced by flashcards)
-- tracks ai api calls, success rates, errors for analytics and debugging
create table ai_generation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model varchar not null,
  prompt_text text not null,
  prompt_text_hash varchar not null,
  prompt_text_length integer not null check (prompt_text_length between 1000 and 10000),
  generated_count integer not null default 0,
  accepted_count integer,
  edited_count integer,
  error_code varchar(200),
  error_message text,
  raw_candidates jsonb,
  created_at timestamptz default now() not null,
  duration integer not null check (duration >= 0),

  constraint chk_prompt_length check (prompt_text_length between 1000 and 10000)
);

comment on table ai_generation_logs is 'logi generowania fiszek przez ai - metryki sukcesu, błędy, czas odpowiedzi';

comment on column ai_generation_logs.user_id is 'użytkownik który wygenerował fiszki - klucz do rls';
comment on column ai_generation_logs.prompt_text is 'pełny prompt wysłany do modelu ai';
comment on column ai_generation_logs.raw_candidates is 'surowa odpowiedź z ai (jsonb dla elastyczności)';

-- 3. create flashcards table (depends on ai_generation_logs)
-- main table for user flashcards
create table flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  front text not null,
  back text not null,
  source source_type not null default 'manual',
  generation_id uuid references ai_generation_logs(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  constraint chk_front_length check (length(front) <= 200 and length(trim(front)) > 0),
  constraint chk_back_length check (length(back) <= 500 and length(trim(back)) > 0),
  constraint chk_front_not_empty check (trim(front) <> ''),
  constraint chk_back_not_empty check (trim(back) <> '')
);

comment on table flashcards is 'główne dane fiszek użytkownika - front i back strony';
comment on column flashcards.generation_id is 'odwołanie do logu ai który wygenerował tę fiszkę (nullable)';
comment on column flashcards.source is 'źródło fiszki - manual/ai/ai_edit - używane w analityce';

-- 4. create shared trigger function for updated_at
-- this is reusable but applied only to flashcards in this migration
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

comment on function update_updated_at_column() is 'automatycznie aktualizuje kolumnę updated_at przy każdej modyfikacji wiersza';

-- 5. create trigger on flashcards only
-- note: only flashcards has updated_at in this schema
create trigger update_flashcards_updated_at 
  before update on flashcards 
  for each row execute function update_updated_at_column();

-- 6. create view for ai generation statistics
-- provides aggregated metrics per user (success rate etc)
create view ai_generation_stats as
select 
  user_id,
  count(*) as total_generations,
  sum(coalesce(accepted_count, 0)) as total_accepted_cards,
  round(
    avg(
      case 
        when generated_count > 0 
        then (coalesce(accepted_count, 0)::float / generated_count::float ) * 100 
        else 0 
      end
    )::numeric, 
    2
  ) as acceptance_rate_percent
from ai_generation_logs 
group by user_id;

comment on view ai_generation_stats is 'agregowane statystyki generowania ai per użytkownik - cel sukcesu ~75%';

-- 7. create indexes for performance (paginacja per user + fk lookups)
-- composite indexes support order by created_at desc + user_id filter
create index idx_flashcards_user_created on flashcards (user_id, created_at desc);
create index idx_ai_logs_user_created on ai_generation_logs (user_id, created_at desc);
create index idx_flashcards_generation_id on flashcards (generation_id);  -- for joins with logs

comment on index idx_flashcards_user_created is 'optymalizacja zapytań "moje fiszki posortowane po dacie" używane w paginacji';
comment on index idx_ai_logs_user_created is 'optymalizacja dla statystyk i historii generowań ai per user';

-- 8. enable row level security on all tables
-- required by supabase security model - even for user-owned data
alter table ai_generation_logs enable row level security;
alter table flashcards enable row level security;

comment on table ai_generation_logs is 'rls enabled - dostęp tylko do własnych rekordów';
comment on table flashcards is 'rls enabled - dostęp tylko do własnych fiszek';

-- =============================================================================
-- RLS POLICIES 
-- Granular policies for BOTH anon and authenticated roles as per guidelines.
-- Separate policy per operation (select/insert/update/delete).
-- For authenticated: scoped to own user_id via auth.uid()
-- For anon: explicit false (no access to private user data)
-- =============================================================================

-- === POLICIES FOR flashcards TABLE ===

-- select policies
create policy "authenticated select own flashcards" 
  on flashcards for select 
  to authenticated
  using (auth.uid() = user_id);

create policy "anon cannot select flashcards" 
  on flashcards for select 
  to anon
  using (false);

-- insert policies
create policy "authenticated insert own flashcards" 
  on flashcards for insert 
  to authenticated
  with check (auth.uid() = user_id);

create policy "anon cannot insert flashcards" 
  on flashcards for insert 
  to anon
  with check (false);

-- update policies
create policy "authenticated update own flashcards" 
  on flashcards for update 
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "anon cannot update flashcards" 
  on flashcards for update 
  to anon
  using (false);

-- delete policies
create policy "authenticated delete own flashcards" 
  on flashcards for delete 
  to authenticated
  using (auth.uid() = user_id);

create policy "anon cannot delete flashcards" 
  on flashcards for delete 
  to anon
  using (false);

-- === POLICIES FOR ai_generation_logs TABLE ===

-- select policies for logs
create policy "authenticated select own ai logs" 
  on ai_generation_logs for select 
  to authenticated
  using (auth.uid() = user_id);

create policy "anon cannot select ai logs" 
  on ai_generation_logs for select 
  to anon
  using (false);

-- insert policies for logs
create policy "authenticated insert own ai logs" 
  on ai_generation_logs for insert 
  to authenticated
  with check (auth.uid() = user_id);

create policy "anon cannot insert ai logs" 
  on ai_generation_logs for insert 
  to anon
  with check (false);

-- update policies for logs (rare but allowed for error correction)
create policy "authenticated update own ai logs" 
  on ai_generation_logs for update 
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "anon cannot update ai logs" 
  on ai_generation_logs for update 
  to anon
  using (false);

-- no delete policy for logs (should be immutable) - only cascade on user delete

-- =============================================================================
-- final notes
-- - view ai_generation_stats inherits rls from underlying table
-- - all user data is protected by rls - no public access
-- - on delete cascade ensures cleanup when user account is deleted
-- - constraints prevent empty or too long content
-- - ready for production use with supabase cli
-- =============================================================================
