# API Endpoint Implementation Plan: POST /api/generate

## 1. Przegląd punktu końcowego

Endpoint przyjmuje tekst wejściowy użytkownika, wysyła go do modelu językowego przez OpenRouter.ai i zwraca listę kandydatów na fiszki (front/back). Kandydaci **nie są** automatycznie zapisywani do tabeli `flashcards` — są tymczasowe. Każde wywołanie jest rejestrowane w tabeli `ai_generation_logs` niezależnie od wyniku (sukces lub błąd AI). Endpoint jest chroniony — wymaga aktywnej sesji Supabase.

---

## 2. Szczegóły żądania

- **Metoda HTTP:** `POST`
- **URL:** `/api/generate`
- **Content-Type:** `application/json`
- **Parametry:**
  - Wymagane: brak parametrów URL/query
  - Opcjonalne: brak parametrów URL/query
- **Request Body:**

```json
{
  "text": "string (1000–10000 znaków)"
}
```

---

## 3. Wykorzystywane typy

Wszystkie typy są już zdefiniowane w `src/types.ts`:

| Typ | Rola |
|-----|------|
| `GenerateCommand` | Zwalidowane dane z request body (`text`) |
| `CandidateFlashcard` | Pojedynczy kandydat na fiszkę `{ front, back }` |
| `AIGenerationResponse` | Payload odpowiedzi sukcesu `{ generationId, candidates }` |
| `ApiResponse<AIGenerationResponse>` | Wrapper odpowiedzi `{ data: AIGenerationResponse }` |
| `ApiError` | Wrapper błędu `{ error: { code, message, details? } }` |
| `AIGenerationLogEntity` | Encja DB tabeli `ai_generation_logs` |

**Zod schema do walidacji (nowa — zdefiniować w pliku serwisu lub route):**

```typescript
const GenerateSchema = z.object({
  text: z.string().min(1000).max(10000)
});
```

---

## 4. Szczegóły odpowiedzi

### Sukces — `200 OK`

```json
{
  "data": {
    "generationId": "uuid",
    "candidates": [
      { "front": "string", "back": "string" }
    ]
  }
}
```

Jeśli AI nie zwróci żadnych kandydatów, `candidates` jest pustą tablicą `[]`.

### Błędy

| Kod | Treść `error.code` | Opis |
|-----|--------------------|------|
| `401` | `UNAUTHORIZED` | Brak aktywnej sesji lub wygasły token |
| `422` | `VALIDATION_ERROR` | Tekst poza zakresem 1000–10000 znaków |
| `429` | `RATE_LIMIT_EXCEEDED` | Przekroczony limit wywołań AI per użytkownik |
| `502` | `AI_PROVIDER_ERROR` | OpenRouter zwrócił błąd lub odpowiedź nieczytelna |
| `503` | `AI_PROVIDER_UNAVAILABLE` | Timeout lub niedostępność OpenRouter |
| `500` | `INTERNAL_ERROR` | Nieoczekiwany błąd serwera |

---

## 5. Przepływ danych

```
POST /api/generate
  │
  ├─ [1] Weryfikacja sesji (context.locals.supabase → getUser())
  │       └─ brak sesji → 401
  │
  ├─ [2] Parsowanie i walidacja JSON body (Zod schema)
  │       └─ błąd walidacji → 422
  │
  ├─ [3] (Opcjonalnie) Rate-limit check
  │       └─ COUNT(ai_generation_logs) w ostatniej godzinie per user_id
  │       └─ limit przekroczony → 429
  │
  ├─ [4] Przygotowanie wywołania AI
  │       └─ Wybranie modelu (z DEFAULT_OPENROUTER_MODEL)
  │
  ├─ [5] Wywołanie OpenRouter API
  │       ├─ POST https://openrouter.ai/api/v1/chat/completions
  │       ├─ System prompt instruuje model do zwrotu JSON array [{front,back}]
  │       ├─ Pomiar czasu (start → end → duration w ms)
  │       └─ błąd/timeout → przejdź do [6b]
  │
  ├─ [6a] Parsowanie odpowiedzi AI → CandidateFlashcard[]
  │
  ├─ [6b] Zapis do ai_generation_logs (zawsze — sukces i błąd)
  │       ├─ user_id, model
  │       ├─ generated_count (0 przy błędzie)
  │       ├─ duration (ms)
  │       ├─ error_code / error_message (NULL przy sukcesie)
  │       └─ accepted_count, edited_count → NULL (uzupełniane później)
  │
  └─ [7] Zwrot odpowiedzi 200 z generationId i candidates
```

---

## 6. Względy bezpieczeństwa

1. **Autentykacja:** Sesja weryfikowana przez `context.locals.supabase.auth.getUser()`. Brak sesji lub wygasły token → natychmiastowy `401` bez dalszego przetwarzania.

2. **Autoryzacja:** RLS na tabeli `ai_generation_logs` zapewnia, że użytkownik może wstawiać/odczytywać tylko własne logi. Insert przez Supabase client z context.locals respektuje RLS.

3. **Klucz API OpenRouter:** Wyłącznie w `import.meta.env.OPENROUTER_API_KEY` (zmienna serwerowa, nigdy eksponowana klientowi).

4. **Prompt injection:** System prompt powinien być ściśle ustrukturyzowany i izolowany od treści użytkownika. Tekst użytkownika przekazywany jako `user` message, nie wbudowany w `system` prompt.

5. **Walidacja długości:** Zod (warstwa API) stanowi barierę walidacyjną dla długości tekstu wejściowego (1000–10000 znaków).

6. **Nieujawnianie wewnętrznych błędów:** Odpowiedzi błędów nigdy nie zawierają szczegółów stosu wywołań ani wewnętrznych wiadomości. Logować po stronie serwera przez `console.error`, klientowi zwracać ogólną wiadomość.

7. **Rate limiting:** Sprawdzenie liczby wierszy w `ai_generation_logs` dla danego `user_id` w ostatniej godzinie przed wywołaniem AI (zalecany limit: np. 10/h).

---

## 7. Obsługa błędów

| Scenariusz | Działanie | Kod HTTP |
|------------|-----------|----------|
| Brak/nieważna sesja | Zwróć `ApiError` z `UNAUTHORIZED`, zakończ | `401` |
| Nieprawidłowy JSON | Zwróć `ApiError` z `VALIDATION_ERROR` | `422` |
| `text` < 1000 lub > 10000 znaków | Zwróć `ApiError` z `VALIDATION_ERROR` + details | `422` |
| Rate limit przekroczony | Zwróć `ApiError` z `RATE_LIMIT_EXCEEDED` | `429` |
| OpenRouter HTTP 4xx/5xx | Zapisz log z `error_code`, zwróć `502` | `502` |
| Timeout OpenRouter | Zapisz log z `error_code='TIMEOUT'`, zwróć `503` | `503` |
| Nieparsowalna odpowiedź AI | Zapisz log z `error_code='PARSE_ERROR'`, zwróć `502` | `502` |
| Błąd zapisu do Supabase | `console.error`, zwróć `500` | `500` |
| Dowolny nieoczekiwany błąd | `console.error`, zwróć `500` | `500` |

---

## 8. Rozważania dotyczące wydajności

1. **Timeout AI:** Ustaw timeout dla fetch do OpenRouter (np. `AbortController` z 30s). Zbyt długie oczekiwanie blokuje worker Astro.

2. **Streaming (opcjonalne):** OpenRouter wspiera streaming SSE. W MVP nie jest wymagany, ale umożliwiłby szybsze TTFB.

3. **Indeks na `ai_generation_logs`:** Indeks `idx_ai_logs_user_generated` na `(user_id, created_at DESC)` przyspieszy zarówno rate-limit check jak i widok statystyk.

4. **Pojedynczy DB round-trip:** Insert logu wykonać jednorazowo po zakończeniu wywołania AI (nie split na insert + update). Jeśli potrzebny jest log przed wywołaniem AI — użyć insert z `generated_count=0` i update po odpowiedzi.

5. **Brak N+1:** Brak pętlowych zapytań DB — jeden insert do `ai_generation_logs`, zero interakcji z `flashcards`.

---

## 9. Etapy implementacji

### Krok 1 — Utwórz serwis AI `src/lib/services/generation.service.ts`

Zawiera:
- Typ `OpenRouterConfig` (model, apiKey, systemPrompt)
- Funkcję `callOpenRouter(text: string, model: string): Promise<CandidateFlashcard[]>`
  - Buduje payload `{ model, messages: [system, user] }`
  - Wywołuje `fetch` z `AbortController` timeout
  - Parsuje odpowiedź JSON i waliduje strukturę tablicy `[{ front, back }]`
  - Rzuca typowane błędy: `AIProviderError`, `AIParseError`, `AITimeoutError`
- Funkcję pomocniczą do przygotowania danych logu generacji

### Krok 2 — Utwórz route `src/pages/api/generate.ts`

```typescript
export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  // 1. Auth check
  // 2. Parse & validate body (Zod)
  // 3. Rate limit check
  // 4. Prepare AI call
  // 5. Call generation.service
  // 6. Insert ai_generation_logs
  // 7. Return 200
}
```

Używać `context.locals.supabase` (zgodnie z regułą backend).

### Krok 3 — Zdefiniuj Zod schema w pliku route lub osobnym `src/lib/schemas/generate.schema.ts`

```typescript
export const GenerateSchema = z.object({
  text: z.string().min(1000, 'Text must be at least 1000 characters')
             .max(10000, 'Text must be at most 10000 characters')
});
```

### Krok 4 — Zaimplementuj logikę rate limitingu

W route, przed wywołaniem AI:
```typescript
const { count } = await locals.supabase
  .from('ai_generation_logs')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId)
  .gte('created_at', new Date(Date.now() - 3600_000).toISOString());

if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
  return new Response(JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: '...' } }), { status: 429 });
}
```

### Krok 5 — Zaimplementuj system prompt dla generacji fiszek

System prompt powinien:
- Nakazywać zwrot **wyłącznie** tablicy JSON `[{"front":"...","back":"..."}]`
- Zabraniać dodatkowego tekstu poza JSON
- Określać zakres długości pól (front ≤ 200 znaków, back ≤ 500 znaków)
- Być odizolowany od treści użytkownika (rola `system` vs `user`)

### Krok 6 — Zaimplementuj zapis do `ai_generation_logs`

Insert po zakończeniu wywołania AI (sukces lub błąd):
- `user_id` — z sesji
- `model` — wybrany model
- `generated_count` — `candidates.length` (0 przy błędzie)
- `duration` — czas wywołania AI w ms
- `error_code` / `error_message` — NULL przy sukcesie, wypełnione przy błędzie

### Krok 7 — Obsługa błędów w route

Użyć struktury `try/catch` z rozróżnieniem typów błędów serwisu AI:
- `AITimeoutError` → `503`
- `AIProviderError` → `502`
- `AIParseError` → `502`
- Pozostałe → `500`

We wszystkich przypadkach błędów AI: wykonać insert do `ai_generation_logs` z odpowiednim `error_code`.

### Krok 8 — Dodaj zmienne środowiskowe

W `src/env.d.ts` rozszerzyć interfejs `ImportMetaEnv`:
```typescript
OPENROUTER_API_KEY: string;
DEFAULT_OPENROUTER_MODEL: string;
GENERATION_RATE_LIMIT_PER_HOUR: string; // parsować jako number
```

### Krok 9 — Weryfikacja typów i lintowanie

Uruchomić `tsc --noEmit` i ESLint po implementacji. Upewnić się, że:
- Nie ma `any` w logice serwisu
- Wszystkie ścieżki błędów zwracają `ApiError` zgodny z typem
- Insert do Supabase używa `TablesInsert<'ai_generation_logs'>`
