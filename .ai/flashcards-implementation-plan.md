# API Endpoint Implementation Plan: Flashcards

## 1. Przegląd punktu końcowego

Zasób `/api/flashcards` udostępnia pełny CRUD dla fiszek (`flashcards`) zalogowanego użytkownika. Obejmuje pięć operacji:

| Metoda | URL | Opis |
|--------|-----|------|
| `GET` | `/api/flashcards` | Paginowana lista fiszek użytkownika |
| `POST` | `/api/flashcards` | Masowe tworzenie fiszek (manual + AI) |
| `GET` | `/api/flashcards/{id}` | Pobranie pojedynczej fiszki |
| `PUT` | `/api/flashcards/{id}` | Aktualizacja treści fiszki |
| `DELETE` | `/api/flashcards/{id}` | Usunięcie fiszki |

Wszystkie endpointy są chronione — wymagają aktywnej sesji Supabase. Izolacja danych per-użytkownik realizowana jest przez Row Level Security (RLS) na poziomie bazy danych (`auth.uid() = user_id`).

---

## 2. Szczegóły żądania

### GET /api/flashcards

- **Metoda HTTP:** `GET`
- **URL:** `/api/flashcards`
- **Query params:**
  - Opcjonalne:
    - `limit` — integer, zakres 1–20, domyślnie `20`
    - `offset` — integer, min 0, domyślnie `0`
    - `source` — enum `MANUAL | AI | AI_EDIT`, filtr po źródle fiszki
    - `includeGeneration` — boolean (`true | false`), domyślnie `false`; gdy `false`, pole `generationId` jest pomijane w odpowiedzi
- **Request body:** brak

### POST /api/flashcards

- **Metoda HTTP:** `POST`
- **URL:** `/api/flashcards`
- **Request body:**

```json
{
  "flashcards": [
    {
      "front": "string",
      "back": "string",
      "source": "MANUAL | AI | AI_EDIT",
      "generationId": "uuid | null"
    }
  ]
}
```

- **Ograniczenia:** tablica `flashcards` nie może być pusta; maksymalnie 100 elementów na żądanie.

### GET /api/flashcards/{id}

- **Metoda HTTP:** `GET`
- **URL:** `/api/flashcards/{id}`
- **Path params:**
  - Wymagane: `id` — UUID fiszki

### PUT /api/flashcards/{id}

- **Metoda HTTP:** `PUT`
- **URL:** `/api/flashcards/{id}`
- **Path params:**
  - Wymagane: `id` — UUID fiszki
- **Request body:**

```json
{
  "front": "string",
  "back": "string"
}
```

### DELETE /api/flashcards/{id}

- **Metoda HTTP:** `DELETE`
- **URL:** `/api/flashcards/{id}`
- **Path params:**
  - Wymagane: `id` — UUID fiszki
- **Request body:** brak

---

## 3. Wykorzystywane typy

Wszystkie typy są zdefiniowane w `src/types.ts`.

### Encje DB

```typescript
FlashcardEntity       // Tables<'flashcards'> — pełny wiersz z bazy danych
SourceType            // 'MANUAL' | 'AI' | 'AI_EDIT'
```

### DTOs (odpowiedzi API)

```typescript
FlashcardDTO                // camelCase DTO dla frontendu
FlashcardResponse           // ApiResponse<FlashcardDTO>
FlashcardsListResponse      // ApiListResponse<FlashcardDTO> z meta { limit, offset }
BulkFlashcardsCreateResponse // ApiResponse<FlashcardDTO[]> — odpowiedź POST /api/flashcards
```

### Command Models (żądania API)

```typescript
FlashcardCreateCommand  // { front, back, source, generationId }
BulkFlashcardsCommand   // { flashcards: FlashcardCreateCommand[] }
FlashcardUpdateCommand  // { front, back }
```

### Schematy Zod (nowe — do zdefiniowania w serwisie lub dedykowanym pliku)

```typescript
// src/lib/validators/flashcards.validators.ts

const flashcardFieldsSchema = z.object({
  front: z.string().trim().min(1).max(200),
  back: z.string().trim().min(1).max(500),
});

const flashcardCreateItemSchema = flashcardFieldsSchema.extend({
  source: z.enum(['MANUAL', 'AI', 'AI_EDIT']),
  generationId: z.string().uuid().nullable(),
}).refine(
  (data) => data.source === 'MANUAL' ? data.generationId === null : data.generationId !== null,
  { message: 'generationId must be null for MANUAL and a valid UUID for AI/AI_EDIT' }
);

const bulkFlashcardsSchema = z.object({
  flashcards: z.array(flashcardCreateItemSchema).min(1).max(100),
});

const flashcardUpdateSchema = flashcardFieldsSchema;

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  source: z.enum(['MANUAL', 'AI', 'AI_EDIT']).optional(),
  includeGeneration: z.coerce.boolean().default(false),
});

const uuidParamSchema = z.string().uuid();
```

---

## 4. Szczegóły odpowiedzi

### GET /api/flashcards → `200 OK`

```json
{
  "data": [
    {
      "id": "uuid",
      "front": "string",
      "back": "string",
      "source": "MANUAL | AI | AI_EDIT",
      "generationId": "uuid | null",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0
  }
}
```

> Uwaga: pole `generationId` jest zawarte w odpowiedzi zawsze (może być `null`). Gdy `includeGeneration=false`, pole `generationId` jest **pomijane** z każdego obiektu w tablicy `data`.

### POST /api/flashcards → `201 Created`

```json
{
  "data": [
    {
      "id": "uuid",
      "front": "string",
      "back": "string",
      "source": "MANUAL | AI | AI_EDIT",
      "generationId": "uuid | null",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ]
}
```

### GET /api/flashcards/{id} → `200 OK`

```json
{
  "data": {
    "id": "uuid",
    "front": "string",
    "back": "string",
    "source": "MANUAL | AI | AI_EDIT",
    "generationId": "uuid | null",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
}
```

### PUT /api/flashcards/{id} → `200 OK`

Identyczna struktura jak `GET /api/flashcards/{id}`, z zaktualizowanymi polami `front`, `back`, `source`, `updatedAt`.

### DELETE /api/flashcards/{id} → `204 No Content`

Brak body.

### Format błędu (wszystkie endpointy)

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

---

## 5. Przepływ danych

### GET /api/flashcards

```
Request → Middleware (auth check) → Astro endpoint
  → Parse & validate query params (Zod: listQuerySchema)
  → FlashcardsService.listFlashcards(supabase, { limit, offset, source })
      → supabase.from('flashcards')
           .select('id, front, back, source, generation_id, created_at, updated_at')
           .order('created_at', { ascending: false })
           .range(offset, offset + limit - 1)
           [.eq('source', source) if filter provided]
      → map FlashcardEntity[] → FlashcardDTO[] (snake_case → camelCase)
      → conditionally omit generationId if includeGeneration=false
  → return 200 { data, meta }
```

### POST /api/flashcards

```
Request → Middleware (auth check) → Astro endpoint
  → Parse & validate JSON body (Zod: bulkFlashcardsSchema)
      → per-item validation: front/back trim+length, source enum, generationId cross-check
      → collect all validation errors before rejecting (fail-fast per spec)
  → FlashcardsService.createFlashcards(supabase, flashcards)
      → trim front/back values
      → attach user_id = session.user.id to each record
      → supabase.from('flashcards').insert(records).select()
  → map inserted FlashcardEntity[] → FlashcardDTO[]
  → return 201 { data }
```

### GET /api/flashcards/{id}

```
Request → Middleware (auth check) → Astro endpoint
  → Validate path param id (Zod: uuidParamSchema)
  → FlashcardsService.getFlashcard(supabase, id)
      → supabase.from('flashcards').select('*').eq('id', id).single()
      → RLS ensures user_id match; returns null if not found/not owned
  → map FlashcardEntity → FlashcardDTO
  → return 200 { data } or 404
```

### PUT /api/flashcards/{id}

```
Request → Middleware (auth check) → Astro endpoint
  → Validate path param id (Zod: uuidParamSchema)
  → Parse & validate JSON body (Zod: flashcardUpdateSchema)
  → FlashcardsService.updateFlashcard(supabase, id, { front, back })
      → fetch current record: supabase.from('flashcards').select('source').eq('id', id).single()
      → if not found → throw 404
      → determine new source:
          current source = 'AI'      → new source = 'AI_EDIT'
          current source = 'AI_EDIT' → new source = 'AI_EDIT'
          current source = 'MANUAL'  → new source = 'MANUAL'
      → supabase.from('flashcards')
           .update({ front: front.trim(), back: back.trim(), source: newSource })
           .eq('id', id).select().single()
  → map FlashcardEntity → FlashcardDTO
  → return 200 { data }
```

### DELETE /api/flashcards/{id}

```
Request → Middleware (auth check) → Astro endpoint
  → Validate path param id (Zod: uuidParamSchema)
  → FlashcardsService.deleteFlashcard(supabase, id)
      → supabase.from('flashcards').delete().eq('id', id)
      → RLS prevents deletion of other users' cards
      → verify rowCount > 0; if not → throw 404
  → return 204 No Content
```

---

## 6. Względy bezpieczeństwa

### Uwierzytelnianie

- Każdy endpoint sprawdza sesję poprzez `context.locals.session` (ustawiana przez middleware Astro).
- Brak sesji zwraca natychmiastowe `401 Unauthorized` przed wykonaniem jakiejkolwiek logiki biznesowej.
- Używać `context.locals.supabase` (instancja Supabase z kontekstem sesji) — NIE importować `supabaseClient` bezpośrednio.

### Autoryzacja i izolacja danych

- RLS Supabase (`auth.uid() = user_id`) zapewnia, że użytkownik widzi i modyfikuje wyłącznie własne fiszki.
- Zapytania `SELECT` z RLS zwracają puste wyniki dla cudzych ID (nie ujawniają istnienia rekordu).
- Dla `DELETE` i `PUT` weryfikować `rowCount > 0` po operacji, aby rozróżnić "nie znaleziono" od sukcesu.

### Walidacja danych wejściowych

- Wszystkie dane wejściowe (query params, path params, body) są walidowane Zod **przed** wywołaniem serwisu.
- Trimowanie `front` i `back` wykonywane w schemacie Zod (`.trim()`) oraz ponownie przed zapisem do DB.
- UUID path param walidowany jako `z.string().uuid()`, aby zapobiec nieprawidłowym zapytaniom do DB.
- Maksymalna liczba fiszek w `POST` (100) chroni przed nadmiernym obciążeniem DB.

### Dodatkowe

- Brak ekspozycji szczegółów błędów DB w odpowiedziach — logować błędy serwera, zwracać generyczne komunikaty.
- Nie ufać żadnym polom z request body dotyczącym `user_id` — zawsze ustawiać z sesji po stronie serwera.

---

## 7. Obsługa błędów

| Kod | Kod błędu (`error.code`) | Scenariusz |
|-----|--------------------------|------------|
| `400` | `INVALID_QUERY_PARAMS` | Nieprawidłowe lub niespójne query params (`limit`, `offset`, `source`) |
| `400` | `TOO_MANY_FLASHCARDS` | Tablica `flashcards` w POST przekracza limit 100 |
| `401` | `UNAUTHORIZED` | Brak aktywnej sesji użytkownika |
| `404` | `FLASHCARD_NOT_FOUND` | Fiszka o podanym `id` nie istnieje lub nie należy do użytkownika |
| `422` | `VALIDATION_ERROR` | Naruszenie reguł walidacji pól (`front`, `back`, `source`, `generationId`) |
| `500` | `INTERNAL_ERROR` | Nieoczekiwany błąd serwera lub bazy danych |

### Szczegółowe zachowanie dla `422` (POST):

Zwrócić tablicę błędów z indeksem elementu:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more flashcards failed validation",
    "details": {
      "errors": [
        {
          "index": 0,
          "field": "front",
          "message": "front must not be empty"
        },
        {
          "index": 2,
          "field": "generationId",
          "message": "generationId must be a valid UUID for AI source"
        }
      ]
    }
  }
}
```

### Zasada braku częściowego sukcesu (POST):

Jeśli **jakakolwiek** fiszka w tablicy nie przejdzie walidacji Zod, żadna nie jest zapisywana do bazy — walidacja Zod musi zebrać wszystkie błędy i zwrócić `422` przed wywołaniem DB.

---

## 8. Rozważania dotyczące wydajności

- **Indeks kompozytowy** `idx_flashcards_user_created ON flashcards (user_id, created_at DESC)` — zapewnia wydajną paginację per-użytkownik. Upewnić się, że migracja go tworzy.
- **Limit paginacji** maksymalnie 20 rekordów — ogranicza rozmiar odpowiedzi i czas zapytania.
- **Bulk insert** w `POST` — pojedyncze wywołanie `.insert(records)` zamiast pętli `n` zapytań; RLS i constraints walidowane przez DB w jednej transakcji.
- **Projekcja kolumn** — używać `.select('id, front, back, source, generation_id, created_at, updated_at')` zamiast `select('*')`, aby uniknąć transferu zbędnych danych (np. `user_id`).
- **Brak N+1** — wszystkie operacje list/bulk używają jednego zapytania do DB.
- **Lazy source resolution** w `PUT` — pobierać tylko pole `source` z istniejącej fiszki (nie cały rekord) przed wykonaniem `update`.

---

## 9. Etapy implementacji

### Krok 1: Schematy Zod

Stworzyć plik `src/lib/validators/flashcards.validators.ts` z następującymi schematami:
- `listQuerySchema`
- `flashcardCreateItemSchema` (z `.refine()` dla `generationId` vs `source`)
- `bulkFlashcardsSchema`
- `flashcardUpdateSchema`
- `uuidParamSchema`

### Krok 2: Serwis fiszek

Stworzyć `src/lib/services/flashcards.service.ts` z metodami:

```typescript
listFlashcards(supabase: SupabaseClient, params: ListParams): Promise<{ data: FlashcardDTO[]; meta: Meta }>
createFlashcards(supabase: SupabaseClient, flashcards: FlashcardCreateCommand[], userId: string): Promise<FlashcardDTO[]>
getFlashcard(supabase: SupabaseClient, id: string): Promise<FlashcardDTO | null>
updateFlashcard(supabase: SupabaseClient, id: string, data: FlashcardUpdateCommand): Promise<FlashcardDTO | null>
deleteFlashcard(supabase: SupabaseClient, id: string): Promise<boolean>
```

Dodatkowo helper prywatny `mapEntityToDTO(entity: FlashcardEntity, includeGeneration?: boolean): FlashcardDTO` do mapowania snake_case → camelCase.

### Krok 3: Endpoint GET /api/flashcards i POST /api/flashcards

Stworzyć `src/pages/api/flashcards/index.ts`:

```typescript
export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => { ... };
export const POST: APIRoute = async ({ request, locals }) => { ... };
```

- `GET`: walidacja query params → `FlashcardsService.listFlashcards` → `200`
- `POST`: walidacja body → `FlashcardsService.createFlashcards` → `201`
- Obu: sprawdzanie sesji na początku → `401` jeśli brak

### Krok 4: Endpoint GET, PUT, DELETE /api/flashcards/{id}

Stworzyć `src/pages/api/flashcards/[id].ts`:

```typescript
export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => { ... };
export const PUT: APIRoute = async ({ params, request, locals }) => { ... };
export const DELETE: APIRoute = async ({ params, locals }) => { ... };
```

- `GET`: walidacja UUID → `FlashcardsService.getFlashcard` → `200` lub `404`
- `PUT`: walidacja UUID + body → `FlashcardsService.updateFlashcard` → `200` lub `404/422`
- `DELETE`: walidacja UUID → `FlashcardsService.deleteFlashcard` → `204` lub `404`

### Krok 5: Helper odpowiedzi błędów

Stworzyć lub rozszerzyć `src/lib/api.helpers.ts` o funkcje pomocnicze:

```typescript
jsonError(code: string, message: string, status: number, details?: Record<string, unknown>): Response
jsonSuccess<T>(data: T, status?: number): Response
```

### Krok 6: Weryfikacja walidatorów i logiki biznesowej

Upewnić się, że:
- Trimowanie `front`/`back` odbywa się w schemacie Zod (`.trim()`)
- Cross-field check `generationId` vs `source` w `flashcardCreateItemSchema`
- Logika `source` mutation (`AI` → `AI_EDIT`) zaimplementowana w `updateFlashcard`
- Brak częściowego sukcesu — błąd Zod dla tablicy zatrzymuje całą operację `POST` przed wywołaniem DB

### Krok 7: Weryfikacja RLS i indeksów

Sprawdzić, że migracje Supabase zawierają:
- RLS policies dla tabeli `flashcards` (SELECT, INSERT, UPDATE, DELETE z `auth.uid() = user_id`)
- Indeks `idx_flashcards_user_created ON flashcards (user_id, created_at DESC)`

### Krok 8: Linting i typowanie

- Uruchomić linter (`eslint`) i naprawić błędy
- Upewnić się, że wszystkie typy są importowane z `src/types.ts` lub `src/db/supabase.client.ts`
- Zweryfikować brak `any` w kodzie produkcyjnym
