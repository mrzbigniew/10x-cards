-- ── card_sr_state: add learning_steps ───────────────────────────────────────
-- ts-fsrs Card.learning_steps is required; backfill 0 = "no step in progress"
ALTER TABLE card_sr_state
  ADD COLUMN learning_steps int4 NOT NULL DEFAULT 0;

-- ── review_logs ──────────────────────────────────────────────────────────────
-- Append-only history; one row per rating. Mirrors ts-fsrs ReviewLog + audit.
CREATE TABLE review_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id           uuid        NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating            smallint    NOT NULL CHECK (rating IN (1, 2, 3, 4)),
  state             smallint    NOT NULL CHECK (state IN (0, 1, 2, 3)),
  due               timestamptz NOT NULL,
  stability         float4      NOT NULL,
  difficulty        float4      NOT NULL,
  elapsed_days      int4        NOT NULL,
  last_elapsed_days int4        NOT NULL,
  scheduled_days    int4        NOT NULL,
  learning_steps    int4        NOT NULL,
  review            timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX review_logs_card_id_idx ON review_logs (card_id);
CREATE INDEX review_logs_user_id_idx ON review_logs (user_id);

ALTER TABLE review_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "review_logs: owner select" ON review_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "review_logs: owner insert" ON review_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
