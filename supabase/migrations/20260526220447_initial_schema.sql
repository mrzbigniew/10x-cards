-- ── Shared trigger function ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── decks ────────────────────────────────────────────────────────────────
CREATE TABLE decks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX decks_user_id_idx ON decks (user_id);

ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "decks: owner select" ON decks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "decks: owner insert" ON decks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "decks: owner update" ON decks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "decks: owner delete" ON decks FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER decks_updated_at
  BEFORE UPDATE ON decks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── cards ────────────────────────────────────────────────────────────────
CREATE TABLE cards (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id    uuid        NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  front      text        NOT NULL,
  back       text        NOT NULL,
  source     text        NOT NULL CHECK (source IN ('ai', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cards_deck_id_idx ON cards (deck_id);
CREATE INDEX cards_user_id_idx ON cards (user_id);

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cards: owner select" ON cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cards: owner insert" ON cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cards: owner update" ON cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cards: owner delete" ON cards FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── card_sr_state ────────────────────────────────────────────────────────
-- One row per card. Holds the current ts-fsrs Card state.
-- state values: 0=New 1=Learning 2=Review 3=Relearning
CREATE TABLE card_sr_state (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id        uuid        NOT NULL UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due            timestamptz NOT NULL DEFAULT now(),
  stability      float4      NOT NULL DEFAULT 0,
  difficulty     float4      NOT NULL DEFAULT 0,
  elapsed_days   int4        NOT NULL DEFAULT 0,
  scheduled_days int4        NOT NULL DEFAULT 0,
  reps           int4        NOT NULL DEFAULT 0,
  lapses         int4        NOT NULL DEFAULT 0,
  state          smallint    NOT NULL DEFAULT 0 CHECK (state IN (0, 1, 2, 3)),
  last_review    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX card_sr_state_user_id_idx ON card_sr_state (user_id);
CREATE INDEX card_sr_state_due_idx     ON card_sr_state (due);

ALTER TABLE card_sr_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "card_sr_state: owner select" ON card_sr_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "card_sr_state: owner insert" ON card_sr_state FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "card_sr_state: owner update" ON card_sr_state FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "card_sr_state: owner delete" ON card_sr_state FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER card_sr_state_updated_at
  BEFORE UPDATE ON card_sr_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create an SR state row for every new card
CREATE OR REPLACE FUNCTION create_card_sr_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO card_sr_state (card_id, user_id)
  VALUES (NEW.id, NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_card_insert
  AFTER INSERT ON cards
  FOR EACH ROW EXECUTE FUNCTION create_card_sr_state();
