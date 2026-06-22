---
title: "10xCards — Anti-Corruption Layer: ts-fsrs"
created: 2026-06-22
type: refactor-plan
---

# 10xCards — Anti-Corruption Layer: ts-fsrs

> Dokument jest **planem refaktoru**, nie implementacją. Żaden kod produkcyjny
> nie jest tu modyfikowany. Cytaty `plik:linia` odnoszą się do stanu repozytorium
> na dzień 2026-06-22. Poprzednie dokumenty domenowe:
> `01-domain-distillation.md` · `02-invariant-aggregate-refactor.md`.

---

## KROK 0 — Kontekst

### Stack i warstwy

| Warstwa             | Technologia                            | Gdzie żyje              |
| ------------------- | -------------------------------------- | ----------------------- |
| UI / klient         | React hooks                            | `src/components/hooks/` |
| API                 | Astro API Routes na Cloudflare Workers | `src/pages/api/`        |
| Serwis              | TypeScript                             | `src/lib/services/`     |
| Schemat / walidacja | Zod                                    | `src/lib/schemas/`      |
| Persystencja        | Supabase PostgreSQL + RLS              | `supabase/migrations/`  |

### Zależności zewnętrzne z package.json

| Pakiet                          | Rola                              | Warstwy gdzie importowany                            |
| ------------------------------- | --------------------------------- | ---------------------------------------------------- |
| `ts-fsrs` ^5.4.1                | Algorytm FSRS (spaced repetition) | services/sr.ts · services/cards.ts · test/sr.test.ts |
| `openai` ^6.39.1                | Klient LLM (przez OpenRouter)     | services/generation.ts                               |
| `@supabase/supabase-js` ^2.99.1 | Klient DB + Auth                  | lib/supabase.ts · lib/supabase-admin.ts              |
| `@supabase/ssr` ^0.10.3         | SSR client helpers                | lib/supabase.ts                                      |

### Deklaracje intencji z dokumentów bazowych

- `prd.md:221-222` (Non-Goals): _"An in-house advanced spaced-repetition algorithm
  (SuperMemo-grade, FSRS-from-scratch, Anki-equivalent). The MVP uses a ready
  open-source library — no homegrown SR engine."_ — celowe delegowanie do gotowej
  biblioteki; domyślna implikacja: wymienialność.
- `prd.md:189` (Guardrail): _"SR algorithm correctness: a card scheduled by the
  algorithm for day D is shown exactly once in the session run on day D."_
- `tech-stack.md` (Why): _"AI generation calls to external LLM providers route
  through Astro API endpoints"_ — OpenAI/OpenRouter celowo ograniczone do serwera.

---

## KROK 1 — Identyfikacja przeciekających zależności

### Kandydat A — `ts-fsrs`

**Wszystkie pliki, które dziś "znają" `ts-fsrs`:**

| Plik                                                    | Linia | Co importuje / co wie                                                                                        |
| ------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| `src/lib/services/sr.ts`                                | 1     | `import { fsrs, type Card, type Grade, type ReviewLog } from "ts-fsrs"` — 4 nazwy z biblioteki               |
| `src/lib/services/cards.ts`                             | 1     | `import { createEmptyCard } from "ts-fsrs"` — bezpośredni import do serwisu CRUD kart                        |
| `src/components/hooks/useReviewSession.ts`              | 2     | `import type { DueCard, RatingResult } from "@/lib/services/sr"` — typy _pochodne_ od kształtu ts-fsrs       |
| `src/test/sr.test.ts`                                   | 2     | `import { fsrs, type Card } from "ts-fsrs"` — test (oczekiwane, ale po ACL obejmie tylko adapter)            |
| `supabase/migrations/20260526220447_initial_schema.sql` | 57    | Komentarz: `"Holds the current ts-fsrs Card state"` — intencja; kolumny DB nazwane jak pola `ts-fsrs Card`   |
| `supabase/migrations/20260602000000_review_session.sql` | 7     | Komentarz: `"Mirrors ts-fsrs ReviewLog + audit"` — kolumny `review_logs` odzwierciedlają `ts-fsrs ReviewLog` |

**Trzy klasy przecieków:**

1. **Przeciek subdomenowy** (`cards.ts:1`): serwis CRUD kart (subdomena Supporting) bezpośrednio
   importuje `createEmptyCard` z biblioteki algorytmu SR (subdomena Core). Karta jako agregat
   nie powinna wiedzieć, jak algorytm SR inicjalizuje stan — to jest wiedza adaptera SR.

2. **Przeciek serwer→klient** (`useReviewSession.ts:2`): hook React (bundle klienta) importuje
   `RatingResult` z `sr.ts`. `RatingResult = ReturnType<typeof fsrsCardToDbUpdate>` — ten typ
   jest mapowaniem pól `ts-fsrs Card` na nazwy kolumn DB. Zmiana ts-fsrs → zmiana `RatingResult`
   → zmiana kontraktu API → zmiana hooka. Trzy warstwy w jednej kaskadzie.

3. **Przeciek do schematu DB** (migracje): Kolumny `card_sr_state` (`stability`, `difficulty`,
   `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review`, `learning_steps`)
   są dosłownymi kopiami pól `ts-fsrs Card`. Kolumny `review_logs` odzwierciedlają `ts-fsrs ReviewLog`.
   Wymiana biblioteki wymaga migracji DB — nie tylko zmiany kodu.

### Kandydat B — `openai`

**Pliki, które dziś "znają" `openai`:**

| Plik                             | Linia | Co importuje                  |
| -------------------------------- | ----- | ----------------------------- |
| `src/lib/services/generation.ts` | 1     | `import OpenAI from "openai"` |

**Ocena**: biblioteka jest już dobrze izolowana — import istnieje tylko w jednym pliku serwisowym;
żaden typ `openai` nie wycieka do warstwy API ani do hooków. ACL istnieje de facto.

---

## KROK 2 — Klasyfikacja i wybór #1

### Macierz oceny

| Kandydat      | (a) Liczba warstw / plików                                                           | (b) Ryzyko wymiany dziś                                                                                                                                       | (c) Intencja dokumentów                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ts-fsrs`** | **3 warstwy produkcyjne** (serwis SR, serwis CRUD, hook klienta) + schemat DB + test | **Krytyczne** — wymiana → zmiany w 5 miejscach, w tym migracja DB i zmiana kontraktu API; klient-side bundle zależy od typów pochodnych od biblioteki serwera | **Rozjazd**: `prd.md:221-222` deklaruje użycie "ready library" (implikuje wymienialność); kod na 4 warstwy tworzy sprzężenie uniemożliwiające wymianę bez kaskadowych zmian |
| `openai`      | 1 warstwa (serwis)                                                                   | Niskie — wymiana dotyczy tylko `generation.ts`                                                                                                                | Brak deklaracji wymienialności; ACL faktycznie istnieje                                                                                                                     |

### Wybrany przeciek #1: `ts-fsrs`

**Uzasadnienie:**

1. **Rozjazd intencja vs. kod** — PRD (`prd.md:221-222`) deklaruje, że algorytm SR jest
   delegowany do "ready open-source library". Delegowanie implikuje możliwość zmiany delegata.
   Tymczasem kod przywiązuje **cztery warstwy** do konkretnej biblioteki: serwis SR, serwis CRUD,
   hook klienta, schemat DB.

2. **Naruszenie granic subdomen** — `cards.ts:1` to serwis karty (Supporting), który importuje
   z biblioteki SR (Core). Zmiana API `createEmptyCard` w ts-fsrs natychmiast łamie serwis
   zarządzania kartami — dwie niezwiązane subdomeny są ze sobą sprzęgnięte przez import.

3. **Przeciek do bundla klienta** — `useReviewSession.ts` importuje `RatingResult` —
   typ wyprowadzony z kształtu ts-fsrs `Card`. Ta biblioteka jest biblioteką **serwerową**
   (logika algorytmu powinna być niewidoczna dla przeglądarki). Każda zmiana wewnętrznych pól
   ts-fsrs kaskadowo zmienia kontrakt API i typ używany w React.

4. **Gotowe ACL dla openai** — `generation.ts` jest już poprawnie izolowany. ts-fsrs nie ma
   żadnej warstwy ochrony.

---

## KROK 3 — Diagnoza

### 3.1 Dokumenty deklarują wymienialność — kod jej nie dotrzymuje

**Cytat dokumentu:**

> `prd.md:221` — _"An in-house advanced spaced-repetition algorithm... The MVP uses a ready
> open-source library — no homegrown SR engine."_

**Rzeczywistość kodu:**

```
ts-fsrs → services/sr.ts → useReviewSession.ts (klient)
ts-fsrs → services/cards.ts (inna subdomena)
ts-fsrs shape → DB schema (card_sr_state, review_logs)
```

Wymiana biblioteki SR dziś wymaga zmian w 5 plikach produkcyjnych + migracji DB.

### 3.2 Przeciek subdomenowy — `cards.ts:1`

```typescript
// src/lib/services/cards.ts:1
import { createEmptyCard } from "ts-fsrs";   // ← serwis CRUD importuje algorytm SR

// ...
// cards.ts:55 — używane przy resetSRState
const emptyCard = createEmptyCard(new Date());
await supabase.from("card_sr_state").update(fsrsCardToDbUpdate(emptyCard))...

// cards.ts:78 — używane przy resetDeckProgress
await supabase.from("card_sr_state").update(fsrsCardToDbUpdate(createEmptyCard(new Date())))...
```

**Sygnał**: `cards.ts` jest serwisem CRUD kart. Wiedza o tym, jak ts-fsrs inicjalizuje pusty
stan karty (`createEmptyCard`), to wiedza algorytmu — nie wiedza zarządzania kartami. Jeśli
ts-fsrs zmieni sygnatury `createEmptyCard`, wymaga to zmiany w serwisie CRUD kart, który
nie ma żadnych innych powiązań z algorytmem.

### 3.3 Przeciek serwer→klient — `useReviewSession.ts:2`

```typescript
// src/components/hooks/useReviewSession.ts:2  (bundle klienta)
import type { DueCard, RatingResult } from "@/lib/services/sr";

// RatingResult jest zdefiniowany w sr.ts:67:
// export type RatingResult = ReturnType<typeof fsrsCardToDbUpdate>;
//
// fsrsCardToDbUpdate mapuje ts-fsrs Card → DB columns:
// { due, stability, difficulty, elapsed_days, scheduled_days,
//   reps, lapses, state, last_review, learning_steps }
//
// Każde pole to bezpośrednia nazwa pola z ts-fsrs Card type.
```

**Sygnał**: `RatingResult` wygląda jak "typ domenowy", ale jest to naprawdę
`Omit<ts-fsrs.Card, 'due'> & { due: string }` po spłaszczeniu do DB. Ten typ jest
używany w hook React (`useReviewSession.ts:69`) do parsowania odpowiedzi API:

```typescript
const data = (await res.json()) as { sr: RatingResult };
```

Kontrakt API response jest zatem domyślnie sprzężony z kształtem `ts-fsrs Card`.

### 3.4 Duplikacja konwersji: dwie drogi do "pustego stanu SR"

| Miejsce              | Linia | Jak tworzy pusty SR state                                                |
| -------------------- | ----- | ------------------------------------------------------------------------ |
| `cards.ts`           | 55    | `fsrsCardToDbUpdate(createEmptyCard(new Date()))` — bezpośrednio ts-fsrs |
| `cards.ts`           | 78    | `fsrsCardToDbUpdate(createEmptyCard(new Date()))` — powtórzony wzorzec   |
| `initial_schema.sql` | 63-73 | Wartości domyślne kolumn = "pusty stan" zakodowany w SQL                 |

Trzy miejsca wiedzą, co to jest "pusty stan SR" — żadne z nich nie jest adaptem,
każde jest częścią innej warstwy.

---

## KROK 4 — Projekt ACL

### 4.1 Domenowy value object — `SrCardState`

Jedyne miejsce wiedzy o _kształcie_ stanu SR. Definiuje własne pola domenowe
(nie kopie pól ts-fsrs). Zawiera mapowanie do/z persystencji i konwersję do/z ts-fsrs.

```typescript
// src/lib/domain/sr/SrCardState.ts

export type SrPhase = 0 | 1 | 2 | 3;
// 0=New, 1=Learning, 2=Review, 3=Relearning — identyczne semantyki do ts-fsrs,
// ale to są stałe domenowe, nie import z biblioteki.

export interface SrCardState {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  phase: SrPhase;
  lastReview: Date | undefined;
  learningSteps: number;
}

export interface SrReviewRecord {
  rating: 1 | 2 | 3 | 4;
  phase: SrPhase;
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  lastElapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reviewedAt: Date;
}

export interface SrSchedulingResult {
  newState: SrCardState;
  record: SrReviewRecord;
}

// Mapowanie: DB row → SrCardState (jedyne miejsce znajomości nazw kolumn)
export function srCardStateFromDb(row: {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  learning_steps: number;
}): SrCardState {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsed_days,
    scheduledDays: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    phase: row.state as SrPhase,
    lastReview: row.last_review ? new Date(row.last_review) : undefined,
    learningSteps: row.learning_steps,
  };
}

// Mapowanie: SrCardState → DB update payload
export function srCardStateToDb(state: SrCardState): {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  learning_steps: number;
} {
  return {
    due: state.due.toISOString(),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    reps: state.reps,
    lapses: state.lapses,
    state: state.phase,
    last_review: state.lastReview?.toISOString() ?? null,
    learning_steps: state.learningSteps,
  };
}

// Mapowanie: SrReviewRecord → DB insert payload (review_logs)
export function srReviewRecordToDb(
  record: SrReviewRecord,
  cardId: string,
  userId: string,
): {
  card_id: string;
  user_id: string;
  rating: number;
  state: number;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  review: string;
} {
  return {
    card_id: cardId,
    user_id: userId,
    rating: record.rating,
    state: record.phase,
    due: record.due.toISOString(),
    stability: record.stability,
    difficulty: record.difficulty,
    elapsed_days: record.elapsedDays,
    last_elapsed_days: record.lastElapsedDays,
    scheduled_days: record.scheduledDays,
    learning_steps: record.learningSteps,
    review: record.reviewedAt.toISOString(),
  };
}

// Pusty stan SR — jedyne miejsce definicji "New card" w domenie
export function emptySrCardState(now: Date): SrCardState {
  return {
    due: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    phase: 0,
    lastReview: undefined,
    learningSteps: 0,
  };
}
```

### 4.2 Port domenowy — `ISrScheduler`

Wąski interfejs — jedyna wiedza, jakiej serwis SR potrzebuje od algorytmu.

```typescript
// src/lib/domain/sr/ISrScheduler.ts

import type { SrCardState, SrSchedulingResult } from "./SrCardState";

export interface ISrScheduler {
  schedule(current: SrCardState, now: Date, rating: 1 | 2 | 3 | 4): SrSchedulingResult;
}
```

### 4.3 Adapter — `FsrsAdapter` (JEDYNY plik z importem ts-fsrs)

```typescript
// src/lib/domain/sr/FsrsAdapter.ts
// ← JEDYNY plik importujący ts-fsrs w całym projekcie

import { fsrs } from "ts-fsrs";
import type { Card as FsrsCard, Grade } from "ts-fsrs";
import type { ISrScheduler } from "./ISrScheduler";
import type { SrCardState, SrSchedulingResult } from "./SrCardState";

function domainStateToFsrs(state: SrCardState): FsrsCard {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    reps: state.reps,
    lapses: state.lapses,
    state: state.phase,
    last_review: state.lastReview,
    learning_steps: state.learningSteps,
  };
}

export class FsrsAdapter implements ISrScheduler {
  private readonly scheduler = fsrs();

  schedule(current: SrCardState, now: Date, rating: 1 | 2 | 3 | 4): SrSchedulingResult {
    const fsrsCard = domainStateToFsrs(current);
    const result = this.scheduler.next(fsrsCard, now, rating as Grade);

    const c = result.card;
    const l = result.log;

    return {
      newState: {
        due: c.due,
        stability: c.stability,
        difficulty: c.difficulty,
        elapsedDays: c.elapsed_days,
        scheduledDays: c.scheduled_days,
        reps: c.reps,
        lapses: c.lapses,
        phase: c.state,
        lastReview: c.last_review,
        learningSteps: c.learning_steps,
      },
      record: {
        rating: l.rating as 1 | 2 | 3 | 4,
        phase: l.state,
        due: l.due,
        stability: l.stability,
        difficulty: l.difficulty,
        elapsedDays: l.elapsed_days,
        lastElapsedDays: l.last_elapsed_days,
        scheduledDays: l.scheduled_days,
        learningSteps: l.learning_steps,
        reviewedAt: l.review,
      },
    };
  }
}

export const fsrsAdapter: ISrScheduler = new FsrsAdapter();
```

### 4.4 Zaktualizowane sygnatury serwisu `sr.ts` (after)

```typescript
// src/lib/services/sr.ts — po refaktorze (pseudokod sygnatury)

import { fsrsAdapter } from "@/lib/domain/sr/FsrsAdapter";   // tylko adapter
import {
  SrCardState,
  SrSchedulingResult,
  srCardStateFromDb,
  srCardStateToDb,
  srReviewRecordToDb,
} from "@/lib/domain/sr/SrCardState";
// Żadnego importu z "ts-fsrs" w tym pliku.

export interface DueCard {
  id: string;
  front: string;
  back: string;
  sr: SrCardState;            // ← typ domenowy, nie DB row
}

export type CardRatingOutput = {
  newState: SrCardState;      // ← typ domenowy, nie ReturnType<fsrsCardToDbUpdate>
};

export async function loadDueCards(...): Promise<DueCard[]> { ... }

export async function applyRating(
  supabase: SupabaseClientType,
  userId: string,
  cardId: string,
  deckId: string,
  rating: 1 | 2 | 3 | 4,   // ← nie Grade z ts-fsrs
  now: Date,
): Promise<CardRatingOutput> {
  // 1. Wczytaj DB row → SrCardState (przez srCardStateFromDb)
  // 2. Wywołaj fsrsAdapter.schedule(state, now, rating)
  // 3. Persystuj: srCardStateToDb(result.newState) + srReviewRecordToDb(result.record)
  // 4. Zwróć { newState }
}
```

### 4.5 Zaktualizowany serwis `cards.ts` (after)

```typescript
// src/lib/services/cards.ts — po refaktorze

import { emptySrCardState, srCardStateToDb } from "@/lib/domain/sr/SrCardState";
// Żadnego importu z "ts-fsrs" w tym pliku.
// Żadnego importu z "services/sr" (brak zależności między serwisami).

export async function resetCardSRState(...): Promise<void> {
  const emptyState = emptySrCardState(new Date());   // ← domenowa funkcja, nie createEmptyCard z ts-fsrs
  await supabase.from("card_sr_state").update(srCardStateToDb(emptyState))...
}
```

### 4.6 Zaktualizowany hook `useReviewSession.ts` (after)

```typescript
// src/components/hooks/useReviewSession.ts — po refaktorze

import type { DueCard } from "@/lib/services/sr"; // DueCard używa SrCardState, nie DB row
// Typ odpowiedzi API: { sr: SrCardState } zamiast { sr: RatingResult }
// Hook operuje na domenowych typach — żadna zmiana ts-fsrs nie dotyka tego pliku.
```

---

## KROK 5 — Dowód izolacji + before/after

### 5.1 Grep-test: który plik zna `ts-fsrs` przed i po refaktorze

| Plik                                       | Przed                           | Po                                 |
| ------------------------------------------ | ------------------------------- | ---------------------------------- |
| `src/lib/services/sr.ts`                   | **ZNA** (import linia 1)        | nie zna                            |
| `src/lib/services/cards.ts`                | **ZNA** (import linia 1)        | nie zna                            |
| `src/components/hooks/useReviewSession.ts` | **ZNA** (typy pochodne linia 2) | nie zna                            |
| `src/test/sr.test.ts`                      | zna (test)                      | zna tylko przez `FsrsAdapter` test |
| `src/lib/domain/sr/FsrsAdapter.ts`         | nie istnieje                    | **JEDYNE MIEJSCE**                 |

**Kryterium sukcesu:** `grep -r "from \"ts-fsrs\"" src/` zwraca wyłącznie
`src/lib/domain/sr/FsrsAdapter.ts`.

### 5.2 Before/after dla kluczowych miejsc

#### `src/lib/services/sr.ts` — sygnatura `applyRating`

**Before (`sr.ts:94–101`):**

```typescript
import { fsrs, type Card, type Grade, type ReviewLog } from "ts-fsrs";
// ...
export async function applyRating(
  supabase: SupabaseClientType,
  userId: string,
  cardId: string,
  deckId: string,
  rating: Grade, // ← typ z ts-fsrs w publicznej sygnaturze
  now: Date,
): Promise<RatingResult>; // ← RatingResult = ReturnType<typeof fsrsCardToDbUpdate> (ts-fsrs kształt)
```

**After:**

```typescript
// Żadnego importu z "ts-fsrs"
import { fsrsAdapter } from "@/lib/domain/sr/FsrsAdapter";

export async function applyRating(
  supabase: SupabaseClientType,
  userId: string,
  cardId: string,
  deckId: string,
  rating: 1 | 2 | 3 | 4, // ← typ domenowy, nie Grade z ts-fsrs
  now: Date,
): Promise<{ newState: SrCardState }>; // ← typ domenowy
```

---

#### `src/lib/services/cards.ts` — `resetCardSRState`

**Before (`cards.ts:1, 52–58`):**

```typescript
import { createEmptyCard } from "ts-fsrs";          // ← serwis CRUD zna ts-fsrs
import { fsrsCardToDbUpdate } from "@/lib/services/sr"; // ← zna wewnętrzną konwersję sr.ts

export async function resetCardSRState(...): Promise<void> {
  const { error } = await supabase
    .from("card_sr_state")
    .update(fsrsCardToDbUpdate(createEmptyCard(new Date())))  // ← ts-fsrs API + sr konwersja
    ...
}
```

**After:**

```typescript
import { emptySrCardState, srCardStateToDb } from "@/lib/domain/sr/SrCardState";
// Żadnego importu z "ts-fsrs" ani z "services/sr"

export async function resetCardSRState(...): Promise<void> {
  const emptyState = emptySrCardState(new Date());            // ← domenowa funkcja
  const { error } = await supabase
    .from("card_sr_state")
    .update(srCardStateToDb(emptyState))                      // ← domenowe mapowanie
    ...
}
```

---

#### `src/components/hooks/useReviewSession.ts` — typ odpowiedzi API

**Before (`useReviewSession.ts:2, 69`):**

```typescript
import type { DueCard, RatingResult } from "@/lib/services/sr";
// ...
const data = (await res.json()) as { sr: RatingResult };
// RatingResult = ReturnType<typeof fsrsCardToDbUpdate>
// = { due: string; stability: number; difficulty: number; elapsed_days: number; ... }
// Pola: nazwy kolumn DB = nazwy pól ts-fsrs Card
```

**After:**

```typescript
import type { DueCard } from "@/lib/services/sr";
import type { SrCardState } from "@/lib/domain/sr/SrCardState";
// ...
const data = (await res.json()) as { sr: SrCardState };
// SrCardState używa camelCase domenowego: elapsedDays, scheduledDays, phase
// Żadne pole ts-fsrs nie jest widoczne w hooku
```

---

### 5.3 Wymiana ts-fsrs → inna biblioteka (test izolacji)

Po refaktorze wymiana biblioteki SR dotyka **wyłącznie**:

| Plik                               | Zmiana                                         |
| ---------------------------------- | ---------------------------------------------- |
| `src/lib/domain/sr/FsrsAdapter.ts` | Implementacja `ISrScheduler` z nową biblioteką |
| `package.json`                     | Zmiana `ts-fsrs` na nową bibliotekę            |

Pliki **bez zmian przy wymianie biblioteki**:

| Plik                                          | Dlaczego bezpieczny                                       |
| --------------------------------------------- | --------------------------------------------------------- |
| `src/lib/services/sr.ts`                      | Zna tylko `ISrScheduler`, `SrCardState`                   |
| `src/lib/services/cards.ts`                   | Zna tylko `emptySrCardState`, `srCardStateToDb`           |
| `src/components/hooks/useReviewSession.ts`    | Zna tylko `SrCardState`                                   |
| `src/pages/api/decks/[id]/review/[cardId].ts` | Zna tylko `applyRating` (sygnatura domenowa)              |
| `supabase/migrations/*.sql`                   | Nie zmienia się (kolumny DB są stabilne — mapowane w ACL) |

### 5.4 Otwarte pytanie z kontraktu biblioteki — rozstrzygnięcie w ACL

**Pytanie**: ts-fsrs używa `elapsed_days` (oznaczone `@deprecated` w v5, ale obecne —
patrz `// eslint-disable-next-line @typescript-eslint/no-deprecated` w `sr.ts:30, 52`).
Czy domenowe `SrCardState.elapsedDays` powinno być persystowane?

**Decyzja zakodowana w ACL**: `SrCardState` zawiera `elapsedDays` jako domenową wartość
(nie jest to artefakt biblioteki). Adapter mapuje ją z pola ts-fsrs niezależnie od
tego, czy pole jest `@deprecated` w bibliotece. DB schema nie zmienia kolumny
`elapsed_days`. Adapter jest jedynym miejscem, które "widzi" `@deprecated` i obsługuje
kompatybilność przy upgradach ts-fsrs.

---

## KROK 6 — Weryfikacja i plan

### 6.1 Kryterium sukcesu

```bash
# Po refaktorze — powinno zwrócić TYLKO FsrsAdapter:
grep -rn "from \"ts-fsrs\"" src/
# Oczekiwany output:
# src/lib/domain/sr/FsrsAdapter.ts:1:import { fsrs } from "ts-fsrs";
# src/lib/domain/sr/FsrsAdapter.ts:2:import type { Card as FsrsCard, Grade } from "ts-fsrs";
```

**Pliki, które dziś znają `ts-fsrs` — i których to dotyczy po refaktorze:**

| Plik                                       | Stan przed            | Stan po                 |
| ------------------------------------------ | --------------------- | ----------------------- |
| `src/lib/services/sr.ts`                   | zna (import:1)        | **nie zna**             |
| `src/lib/services/cards.ts`                | zna (import:1)        | **nie zna**             |
| `src/components/hooks/useReviewSession.ts` | zna (typy pochodne:2) | **nie zna**             |
| `src/test/sr.test.ts`                      | zna (import:2)        | zna tylko `FsrsAdapter` |
| `src/lib/domain/sr/FsrsAdapter.ts`         | nie istnieje          | **jedyne miejsce**      |

### 6.2 Plan faz (zgodny z konwencją projektu)

Projekt stosuje dyscyplinę test-first (Vitest, Stryker). Fazy z ★ idą test-first.

#### Faza 1 — Szkielet ACL (bez zmiany logiki)

**Cel**: stworzyć `SrCardState.ts`, `ISrScheduler.ts`, `FsrsAdapter.ts` z tymi
samymi obliczeniami co dziś — refactor without behavior change.

1. Utwórz `src/lib/domain/sr/SrCardState.ts` z typami i mapperami.
2. Utwórz `src/lib/domain/sr/ISrScheduler.ts` z interfejsem.
3. Utwórz `src/lib/domain/sr/FsrsAdapter.ts` implementującym interfejs.
4. Uruchom `npm run typecheck` — zero błędów (żadne istniejące pliki nie są zmienione).
5. Uruchom `npm run test` — zero zmian w wynikach.

_Reversible. Zero zmian w plikach istniejących._

#### Faza 2 ★ — Migracja `sr.ts` (test-first)

**Cel**: usunąć importy ts-fsrs z `sr.ts`, zastąpić przez ACL.

Przypadki testowe (do napisania przed zmianą):

- T-1: `loadDueCards` zwraca `DueCard[]` z `sr: SrCardState` (pola camelCase)
- T-2: `applyRating` z `rating: 1|2|3|4` (nie `Grade`) zwraca `{ newState: SrCardState }`
- T-3: `applyRating` z nieznanym `cardId` rzuca błąd (nie cicho ignoruje)

Kroki:

1. Napisz testy dla T-1 – T-3.
2. Zmodyfikuj `sr.ts`: usuń import ts-fsrs, użyj `fsrsAdapter` i typów domenowych.
3. Uruchom testy — przejście.
4. `grep "ts-fsrs" src/lib/services/sr.ts` → puste.

#### Faza 3 ★ — Migracja `cards.ts` (test-first)

**Cel**: usunąć importy ts-fsrs z `cards.ts`, zastąpić `emptySrCardState`.

Przypadki testowe:

- T-4: `resetCardSRState` tworzy stan SR z `phase=0, reps=0, due≈now`
- T-5: `resetDeckProgress` zeruje stan SR dla wszystkich kart decku

Kroki:

1. Napisz testy dla T-4 – T-5.
2. Zmodyfikuj `cards.ts`: usuń importy ts-fsrs i `fsrsCardToDbUpdate` z sr.ts.
3. Uruchom testy — przejście.
4. `grep "ts-fsrs" src/lib/services/cards.ts` → puste.

#### Faza 4 — Migracja hooka `useReviewSession.ts`

**Cel**: zmienić import `RatingResult` → `SrCardState` w hooku klienta.

Kroki:

1. Zaktualizuj `useReviewSession.ts:2` — import `SrCardState` z domain zamiast `RatingResult` z sr.ts.
2. Zaktualizuj typ `data` w linii 69 — `{ sr: SrCardState }`.
3. Uruchom `npm run typecheck` — zero błędów.
4. `grep "RatingResult" src/` → zero trafień.

#### Faza 5 — Stryker (weryfikacja mutacyjna)

```bash
npm run test:mutation  # istniejąca konfiguracja: src/lib/services/generation.ts
# Dodaj scope dla ACL:
npx stryker run --mutate "src/lib/domain/sr/FsrsAdapter.ts"
npx stryker run --mutate "src/lib/domain/sr/SrCardState.ts"
```

Przeżyte mutanty do zbadania: w `srCardStateFromDb` i `srCardStateToDb` — sprawdź, czy
błędne mapowanie kolumn jest wykrywane przez testy integracyjne.

### 6.3 Nowe kontrakty do zarejestrowania

| Nazwa                | Typ                    | Lokalizacja (po refaktorze)         |
| -------------------- | ---------------------- | ----------------------------------- |
| `SrCardState`        | Domain value object    | `src/lib/domain/sr/SrCardState.ts`  |
| `SrReviewRecord`     | Domain value object    | `src/lib/domain/sr/SrCardState.ts`  |
| `SrSchedulingResult` | Domain interface       | `src/lib/domain/sr/SrCardState.ts`  |
| `ISrScheduler`       | Domain port            | `src/lib/domain/sr/ISrScheduler.ts` |
| `FsrsAdapter`        | Infrastructure adapter | `src/lib/domain/sr/FsrsAdapter.ts`  |
| `emptySrCardState`   | Domain factory         | `src/lib/domain/sr/SrCardState.ts`  |
| `fsrsAdapter`        | Singleton adapter      | `src/lib/domain/sr/FsrsAdapter.ts`  |

---

## Podsumowanie

Wybrano `ts-fsrs` jako najgorszy przeciek: biblioteka algorytmu SR jest importowana w trzech
warstwach produkcyjnych (serwis SR, serwis CRUD kart, hook React klienta), a schemat DB
nosi jej nazwy pól dosłownie. PRD deklaruje użycie "ready open-source library" — czyli intencję
wymienialności — ale kod tworzy sprzężenie uniemożliwiające wymianę bez kaskadowych zmian w
5 plikach i migracji DB. Projekt ACL opiera się na trzech nowych artefaktach domenowych:
value object `SrCardState` (jedyne miejsce mapowania DB↔domena i definicji "pustego stanu"),
port `ISrScheduler` (wąski interfejs), oraz adapter `FsrsAdapter` (jedyny plik z importem ts-fsrs).
Po refaktorze `grep "ts-fsrs" src/` zwraca wyłącznie adapter. Plan pięciu faz pozwala wdrożyć
refaktor inkrementalnie — Faza 1 jest czysto addytywna (zero zmian w istniejących plikach),
każda kolejna eliminuje jeden przeciek zgodnie z dyscypliną test-first projektu.

---

_Artefakt wygenerowany przez DDD ACL prompt na podstawie `context/foundation/prd.md`,
`context/foundation/tech-stack.md`, `context/domain/01-domain-distillation.md`,
`context/domain/02-invariant-aggregate-refactor.md` oraz kodu źródłowego w `src/`._
