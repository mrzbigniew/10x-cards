```markdown
# Schemat Bazy Danych - 10x-card

## 1. Typy i Tabele

### Enum
```sql
CREATE TYPE source_type AS ENUM ('MANUAL', 'AI', 'AI_EDIT');
```

### Tabela `flashcards`

```sql
CREATE TABLE flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  source source_type NOT NULL DEFAULT 'MANUAL',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  generation_id: BIGINT REFERENCES ai_generation_logs(id) ON DELETE SET NULL,
  
  CONSTRAINT chk_front_length CHECK (length(front) <= 200 AND length(trim(front)) > 0),
  CONSTRAINT chk_back_length CHECK (length(back) <= 500 AND length(trim(back)) > 0),
  CONSTRAINT chk_front_not_empty CHECK (trim(front) <> ''),
  CONSTRAINT chk_back_not_empty CHECK (trim(back) <> '')
);
```

### Tabela `ai_generation_logs`

```sql
CREATE TABLE ai_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model VARCHAR NOT NULL,
  prompt_text_hash VARCHAR NOT NULL,
  prompt_text_length: INTEGER NOT NULL CHECK (prompt_text_length BETWEEN 1000 AND 10000),
  generated_count: INTEGER NOT NULL,
  accepted_count INTEGER NULLABLE,
  edited_count: INTEGER NULLABLE,
  error_code VARCHAR(200) NULLABLE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  duration: INTEGER NOT NULL,
  CONSTRAINT chk_prompt_length CHECK (length(prompt_text) BETWEEN 1000 AND 10000)
);
```

### Trigger dla `updated_at`

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_flashcards_updated_at 
  BEFORE UPDATE ON flashcards 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### View `ai_generation_stats`

```sql
CREATE VIEW ai_generation_stats AS
SELECT 
  user_id,
  COUNT(*) as total_generations,
  SUM(accepted_cards_count) as total_accepted_cards,
  ROUND(
    AVG(
      CASE 
        WHEN jsonb_array_length(raw_candidates) > 0 
        THEN (accepted_count::float / generated_count::float ) * 100 
        ELSE 0 
      END
    )::numeric, 2
  ) as acceptance_rate_percent
FROM ai_generation_logs 
GROUP BY user_id;
```

## 2. Indeksy

```sql
-- Composite indexes dla paginacji i zapytań per user
CREATE INDEX idx_flashcards_user_created ON flashcards (user_id, created_at DESC);
CREATE INDEX idx_ai_logs_user_generated ON ai_generation_logs (user_id, generated_at DESC);
```

## 3. Row Level Security (RLS)

```sql
-- Włącz RLS
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generation_logs ENABLE ROW LEVEL SECURITY;

-- Polityki dla flashcards
CREATE POLICY "Users can view own flashcards" 
  ON flashcards FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own flashcards" 
  ON flashcards FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own flashcards" 
  ON flashcards FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own flashcards" 
  ON flashcards FOR DELETE 
  USING (auth.uid() = user_id);

-- Polityki dla ai_generation_logs
CREATE POLICY "Users can view own ai logs" 
  ON ai_generation_logs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai logs" 
  ON ai_generation_logs FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai logs" 
  ON ai_generation_logs FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);
```

## 4. Dodatkowe uwagi

- **Bezpośrednie powiązanie z `auth.users`** (zgodnie z decyzjami z sesji planowania - bez tabeli `profiles` dla fiszek i logów w MVP)
- **Paginacja** realizowana przez `ORDER BY created_at DESC LIMIT 20 OFFSET X` na composite index
- **ON DELETE CASCADE** zapewnia automatyczne usunięcie fiszek i logów przy usunięciu konta
- **Brak duplikatów zabronionych** - duplikaty treści fiszek są dozwolone
- **Źródło fiszek** (`source`) pozwala na analizę udziału AI (MANUAL / AI / AI_EDIT)
- **View `ai_generation_stats`** wspiera metryki sukcesu (cel 75% akceptacji AI)
- **JSONB + GIN** dla elastycznego przechowywania surowych odpowiedzi AI
- Schemat zoptymalizowany pod Supabase (RLS, auth.users, PostgreSQL 17)
- Zgodny z normalizacją 3NF, skalowalny dla MVP

Plik gotowy do użycia jako podstawa migracji Supabase (`supabase/migrations/`).

```

```

