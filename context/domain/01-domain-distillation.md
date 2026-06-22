---
title: "10xCards — Domain Distillation"
created: 2026-06-22
type: domain-distillation
---

# 10xCards — Domain Distillation

## KROK 0 — Kontekst projektu

### Materiały źródłowe

| Dokument    | Ścieżka                            | Rola                                      |
| ----------- | ---------------------------------- | ----------------------------------------- |
| PRD         | `context/foundation/prd.md`        | Wymagania, user stories, success criteria |
| Tech Stack  | `context/foundation/tech-stack.md` | Decyzje techniczne                        |
| README      | `README.md`                        | Przegląd projektu                         |
| Migracje DB | `supabase/migrations/*.sql`        | Schematyczny model danych                 |

### Stack

- **Frontend**: Astro v6 + React v19 + TypeScript + Tailwind CSS
- **Backend**: Astro API Routes na Cloudflare Workers
- **Baza danych**: Supabase (PostgreSQL + Row Level Security + Auth)
- **AI**: OpenAI via OpenRouter (`openai/gpt-4o-mini`)
- **SR Library**: `ts-fsrs` (FSRS algorithm)
- **Deployment**: Cloudflare Pages

### Warstwy kodu (gdzie żyje logika)

```
src/pages/api/         ← warstwa API (routing, walidacja Zod, 401)
src/lib/services/      ← logika biznesowa (generation, sr, cards, decks)
src/lib/schemas/       ← Zod schemas (walidacja wejścia)
src/components/hooks/  ← stan sesji po stronie klienta
supabase/migrations/   ← schemat DB, RLS policies, triggery
```

---

## KROK 1 — Ubiquitous Language

### Glosariusz pojęć domenowych

| Pojęcie                                    | Definicja                                                                                                            | Cytat źródłowy                                                                                                                      | Lokalizacja w kodzie                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Flashcard** (Karta)                      | Para pytanie–odpowiedź tworzona ręcznie lub przez AI; podstawowa jednostka uczenia                                   | _"question + answer pair… each of which they can independently accept, edit, or reject"_ — `prd.md:63`                              | `database.types.ts:99` tabela `cards` (front, back, source, deck_id)                                                |
| **Deck** (Zestaw)                          | Nazwany zbiór kart należący do jednego użytkownika; kontener dla sesji powtórek                                      | _"After the review, the student can name the new deck and save it"_ — `prd.md:69`                                                   | `database.types.ts:140` tabela `decks`; `services/decks.ts:6` `DeckWithCount`                                       |
| **Source Text** (Tekst źródłowy)           | Fragment notatek lub podręcznika wklejany przez studenta jako wejście do generatora AI; ograniczony do 10 000 znaków | _"paste a fragment of notes or textbook content into the generator"_ — `prd.md:58`                                                  | `schemas/generation.ts:4` `z.string().min(50).max(10000)`                                                           |
| **Proposal** (Propozycja)                  | Kandydatka na kartę zwrócona przez AI, oczekująca na decyzję użytkownika; ma status cyklu życia                      | _"list of proposed flashcards… accept, edit-and-accept, or reject"_ — `prd.md:63`                                                   | `useGeneration.ts:6` interface `Proposal`; `ProposalStatus = "pending" \| "accepted" \| "rejected" \| "editing"`    |
| **ProposalStatus**                         | Etap cyklu życia propozycji podczas sesji generowania                                                                | _"accept / edit inline before accepting / reject"_ — `prd.md:146`                                                                   | `useGeneration.ts:3` typ `ProposalStatus`                                                                           |
| **Generation Session** (Sesja generowania) | Tymczasowy proces: wejście → generowanie → przegląd propozycji → zapis do decku                                      | _"The user encounters this rule twice in a single generation session"_ — `prd.md:199`                                               | `useGeneration.ts:14` typ `GenerationPhase = "input" \| "generating" \| "reviewing" \| "saving" \| "done"`          |
| **SR State** (Stan powtórek)               | Zbiór parametrów algorytmu FSRS dla jednej karty: stability, difficulty, due, reps, lapses, state                    | _"SR state (intervals, due-dates, rating history at whatever fidelity the algorithm requires)"_ — `prd.md:168`                      | `database.types.ts:37` tabela `card_sr_state`; `services/sr.ts:10` `rowToFsrsCard`                                  |
| **SR State.state**                         | Dyskretna faza karty w algorytmie FSRS: 0=New, 1=Learning, 2=Review, 3=Relearning                                    | _"state values: 0=New 1=Learning 2=Review 3=Relearning"_ — `initial_schema.sql:58`                                                  | `database.types.ts:47`; `initial_schema.sql:70` `CHECK (state IN (0, 1, 2, 3))`                                     |
| **Due Date**                               | Data/czas, kiedy karta jest zaplanowana do powtórzenia przez algorytm                                                | _"due ≤ today per the SR algorithm — no more, no less"_ — `prd.md:93`                                                               | `database.types.ts:43` kolumna `due`; `sr.ts:80` `.lte("due", dueBefore)`                                           |
| **Review Session** (Sesja powtórek)        | Sekwencja ocen kart o due ≤ dzisiaj dla wybranego zestawu                                                            | _"start a review session for that deck; the system presents the cards that the SR algorithm has scheduled for today"_ — `prd.md:89` | `useReviewSession.ts:1` hook; `services/sr.ts:69` `loadDueCards`                                                    |
| **Rating / Grade** (Ocena)                 | Ocena jakości przypomnienia: 1=Again, 2=Hard, 3=Good, 4=Easy (skala natywna FSRS)                                    | _"rate their recall (using the SR library's native scale — e.g. Again / Hard / Good / Easy)"_ — `prd.md:165`                        | `schemas/review.ts:6` `z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])`; typ `Grade` z `ts-fsrs`  |
| **Review Log** (Wpis historii)             | Niemodyfikowalny zapis jednej oceny: snapshot stanu SR przed oceną + rating                                          | _"rating history at whatever fidelity the algorithm requires"_ — `prd.md:168`                                                       | `database.types.ts:165` tabela `review_logs`; `review_session.sql:8`                                                |
| **Source** (Źródło karty)                  | Atrybut wskazujący, czy karta powstała przez AI czy ręcznie                                                          | _"75% of all flashcards in the user's library originate from AI generation"_ — `prd.md:43`                                          | `initial_schema.sql:38` `source text NOT NULL CHECK (source IN ('ai', 'manual'))`                                   |
| **Reset SR** (Reset postępu)               | Opcjonalna operacja przywracania stanu SR karty do stanu "New" przy edycji                                           | _"optionally tick 'reset review progress for this card'"_ — `prd.md:115`                                                            | `schemas/cards.ts:8` pole `resetSR: z.boolean()`; `services/cards.ts:95` `if (resetSR) await resetCardSRState(...)` |
| **User** (Użytkownik)                      | Zarejestrowany student; właściciel zestawów, kart i historii powtórek                                                | _"flat hierarchy. Every registered user sees and edits only their own flashcards and decks"_ — `prd.md:204`                         | `auth.users` (Supabase); `user_id` FK na wszystkich tabelach                                                        |
| **Password Reset**                         | Jednorazowy, wygasający link e-mail umożliwiający odzyskanie dostępu bez utraty danych                               | _"reset link expires after a finite time (24h)… works exactly once"_ — `prd.md:106-107`                                             | `pages/api/auth/forgot-password.ts`; `pages/api/auth/reset-password.ts`                                             |

---

## KROK 2 — Klasyfikacja subdomen

| Subdomena                           | Kategoria  | Uzasadnienie                                                                                                                                                                                                                     |
| ----------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI Flashcard Generation**         | **Core**   | Bezpośrednio realizuje unikalną wartość produktu — "take the student's own text and let AI propose flashcards"; success criterion #1: 75% kart z AI. Żaden competitor, który ma jedynie ręczne tworzenie, nie zastąpi tego flow. |
| **Spaced Repetition Session**       | **Core**   | Realizuje drugą połowę obietnicy produktu — nawyk powtórek. Success criterion D7 retention zależy wyłącznie od tej subdomeny. SR jest sercem 10xCards; bez niego to tylko kolejny edytor fiszek.                                 |
| **Deck Management**                 | Supporting | Niezbędna infrastruktura dla Core, ale nie wyróżnia produktu. Dowolny CRUD-kontener zastąpiłby tę subdomenę. Zdefiniowana przez FR-013, FR-017.                                                                                  |
| **Flashcard CRUD**                  | Supporting | Obowiązkowa, by produkt był kompletny (US-02, US-05, FR-010–FR-012), ale nie decyduje o adopcji. PRD przyznaje wprost, że ręczne tworzenie "drags down the 75%-from-AI metric".                                                  |
| **Review Logging**                  | Supporting | Waliduje poprawność algorytmu SR (audit trail) i umożliwia przyszłą analitykę; obecnie bez własnego UI. Żadne reguły biznesowe nie są egzekwowane przez tę subdomenę — jest agregatorem zdarzeń.                                 |
| **Authentication & Password Reset** | Generic    | Całkowicie delegowana do Supabase Auth. Nie stanowi przewagi konkurencyjnej; jej wartość to bezpieczeństwo i niezawodność. Non-goal: OAuth i magic-link poza MVP.                                                                |
| **Access Control / Data Isolation** | Generic    | Row Level Security w Supabase. Wymaganie fundamentalne (`prd.md:212`), ale standardowy wzorzec SaaS, nie wiedza domenowa.                                                                                                        |

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

### Agregat 1: `Deck`

Korzeń agregatu dla zestawu i jego kart.

| Niezmiennik                                                   | Cytat źródłowy                                                                              | Egzekucja                                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Każda karta należy do dokładnie jednego zestawu               | _"add the proposals to an existing deck"_ — `prd.md:69`                                     | **Egzekwowany** — DB: `deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE` (`initial_schema.sql:33`)                                                         |
| Właścicielem zestawu jest jeden użytkownik                    | _"Every registered user sees and edits only their own… decks"_ — `prd.md:204`               | **Egzekwowany** — RLS policies: `USING (auth.uid() = user_id)` (`initial_schema.sql:22-25`)                                                                            |
| Usunięcie zestawu usuwa wszystkie jego karty                  | _"delete an entire deck (together with all of its flashcards and SR state)"_ — `prd.md:172` | **Egzekwowany** — `ON DELETE CASCADE` na `cards.deck_id` (`initial_schema.sql:33`)                                                                                     |
| Po usunięciu ostatniej karty zestaw pozostaje (nie usuwa się) | _"Deleting the last flashcard in a deck does NOT delete the deck itself"_ — `prd.md:157`    | **Deklarowany** w PRD; brak kodu chroniącego przed "orphan deck" — ale brak też kodu, który by deck usuwał przy pustych kartach. Zachowanie poprawne przez brak akcji. |

### Agregat 2: `Card` (+ obowiązkowy `CardSrState`)

Karta zawsze istnieje razem ze stanem SR — są nierozerwalną parą.

| Niezmiennik                                                       | Cytat źródłowy                                                                                | Egzekucja                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Każda karta ma dokładnie jeden stan SR (1:1)                      | _"auto-create an SR state row for every new card"_ — `initial_schema.sql:89`                  | **Egzekwowany** — `UNIQUE` constraint + trigger `after_card_insert` (`initial_schema.sql:61, 103`)                               |
| front i back karty są niepuste                                    | _"form enforces a non-empty question and a non-empty answer"_ — `prd.md:81`                   | **Egzekwowany** — DB: `NOT NULL`; Zod: `min(1)` (`schemas/cards.ts:4-5`); API: walidacja Zod                                     |
| source ∈ {'ai', 'manual'}                                         | _"75% of all flashcards… originate from AI generation"_ — `prd.md:43`                         | **Egzekwowany** — DB `CHECK (source IN ('ai', 'manual'))` (`initial_schema.sql:38`)                                              |
| Nowa karta startuje z czystym SR State (state=0, reps=0, due=now) | _"the flashcard has zero SR state (a new card, due 'today' per the algorithm)"_ — `prd.md:82` | **Egzekwowany** — trigger ustawia domyślne wartości; `createEmptyCard()` z `ts-fsrs` używany przy reset (`services/cards.ts:55`) |
| Reset SR przy edycji jest opcjonalny (domyślnie: zachowaj SR)     | _"By default the 'reset progress' checkbox is unticked"_ — `prd.md:119`                       | **Egzekwowany** — `if (resetSR) await resetCardSRState(...)` (`services/cards.ts:99-101`)                                        |

### Agregat 3: `GenerationSession` (nieformalne — brak encji DB)

Tymczasowy obiekt domeny istniejący tylko w pamięci React.

| Niezmiennik                                                        | Cytat źródłowy                                                                                | Egzekucja                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Tylko accepted propozycje trafiają do decku                        | _"Only candidates in an accepted status are saved as flashcards"_ — `prd.md:198`              | **Egzekwowany** — `proposals.filter((p) => p.status === "accepted")` (`useGeneration.ts:77`) |
| Edytowana propozycja zapisuje editedFront/editedBack, nie oryginał | _"Editing happens inline… confirming an edit = accepting the modified version"_ — `prd.md:66` | **Egzekwowany** — `p.editedFront ?? p.front` (`useGeneration.ts:80`)                         |
| Wejście: min 50, max 10 000 znaków                                 | _"text of a bounded maximum length"_ — `prd.md:141`; `~10 000 characters` — `prd.md:183`      | **Egzekwowany** — Zod: `z.string().min(50).max(10000)` (`schemas/generation.ts:4`)           |
| Liczba propozycji: 5–15                                            | _"Generate between 5 and 15 flashcards"_ — `services/generation.ts:11`                        | **Egzekwowany** — w system prompt do LLM; ale brak walidacji liczby propozycji w odpowiedzi  |
| Sesja generowania jest efemeryczna — nie jest persystowana         | _(Open Question #6: auto-save before tab close)_ — `prd.md:250`                               | **IGNOROWANY** — brak tabeli `generation_sessions`; zamknięcie zakładki = utrata sesji       |

### Agregat 4: `ReviewSession` (nieformalne — stan w hooku)

| Niezmiennik                                                      | Cytat źródłowy                                                                                                         | Egzekucja                                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Sesja zawiera TYLKO karty due ≤ end-of-day                       | _"session contains exactly those cards… 'due ≤ today' — no more, no less"_ — `prd.md:93`                               | **Egzekwowany** — `.lte("due", dueBefore)` gdzie `dueBefore = endOfDay` (`sr.ts:80`; `useReviewSession.ts:23`) |
| SR State jest persystowany po każdej ocenie (nie na końcu sesji) | _"SR state is saved after every card (interrupting the session does not roll back already-rated cards)"_ — `prd.md:95` | **Egzekwowany** — `applyRating` robi upsert natychmiastowo (`sr.ts:117-129`)                                   |
| `review_logs` jest append-only (brak update/delete)              | _(implied by "rating history")_; `review_session.sql:8`: tabela jako "Append-only history"                             | **IGNOROWANY** — policies w `20260607000001_review_logs_deny_update_delete.sql` są ZAKOMENTOWANE               |

---

## KROK 4 — Rozjazdy: MODEL vs KOD

| #       | Model (PRD/dokumentacja) mówi…                                                                                           | Kod robi…                                                                                                                                            | Dowód (plik:linia)                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **R-1** | `review_logs` jest append-only ("Append-only history") — brak możliwości edycji/usuwania wpisów                          | Policies `deny update` i `deny delete` istnieją w migracji, ale są **zakomentowane**                                                                 | `20260607000001_review_logs_deny_update_delete.sql:1-2`                                                              |
| **R-2** | Sesja generowania ("auto-save of the proposal draft before saving the deck") powinna być persystowana                    | Sesja żyje wyłącznie w React state (`useGeneration`); zamknięcie zakładki = utrata całego przeglądu propozycji                                       | `useGeneration.ts:16-18` — brak wywołania API dla draft; brak tabeli `generation_drafts`                             |
| **R-3** | Front i back karty mają maksymalną długość (implied by: "non-empty question and a non-empty answer", API schema max 500) | Zod schema: max 500 znaków; DB: brak `CHECK` na długość — DB przyjmie dowolnie długi tekst                                                           | `schemas/cards.ts:4-5`; `initial_schema.sql:34-35` (brak CHECK length)                                               |
| **R-4** | "Bulk actions: accept all remaining, reject all remaining" — "remaining" = undecided                                     | `bulkAccept` i `bulkReject` filtrują tylko `status === "pending"`, ignorując `"editing"` — karta w trakcie edycji jest pomijana przez bulk           | `useGeneration.ts:65-70`                                                                                             |
| **R-5** | Success criterion: D7 retention mierzony empirycznie                                                                     | Brak tabeli events, analytics, czy jakiegokolwiek mechanizmu śledzenia powrotów użytkownika po 7 dniach                                              | `prd.md:44`; brak odpowiadającego pliku w `src/`                                                                     |
| **R-6** | Success criterion: "75% of all flashcards originate from AI generation" — mierzony z biblioteki użytkownika              | Kolumna `source` istnieje w DB, ale brak widoku/funkcji agregującej tę metrykę ani expozycji jej w UI                                                | `initial_schema.sql:38`; `database.types.ts:107`; brak query w `services/`                                           |
| **R-7** | Rating=1 (Again) oznacza, że karta wraca do nauki "za chwilę" (FSRS kalkuluje nowy due_date, często sekundy/minuty)      | Karta z rating=1 wraca natychmiast na koniec kolejki w hooku, bez sprawdzenia nowego due_date; user może ją zobaczyć wcześniej niż algorytm planował | `useReviewSession.ts:72-75` — `[...rest, { ...head, sr: { ...head.sr, ...data.sr } }]` bez sprawdzenia `data.sr.due` |

---

## KROK 5 — Ranking refaktoru

Kryterium oceny: **wartość** (jak rdzenio ważny jest niezmiennik) × **ryzyko** (jak słabo jest dziś egzekwowany).

| Priorytet | Kandydat                                | Niezmiennik                                                    | Wartość       | Ryzyko                                                                                                          | Uzasadnienie                                                                                                                                                                                               |
| --------- | --------------------------------------- | -------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#1**    | `ReviewLog` (append-only)               | `review_logs` nigdy nie może być modyfikowany ani usunięty     | Krytyczna     | **Krytyczne** — policies zakomentowane, każdy uwierzytelniony użytkownik może dziś DELETE swoje wpisy przez RLS | R-1: zakomentowane policies (`20260607000001_...sql:1-2`). Usunięcie wpisów historii psuje audyt SR i uniemożliwia jakąkolwiek przyszłą analitykę. To jedyna linia obrony przed manipulacją historią ocen. |
| **#2**    | `GenerationSession` (persystencja)      | Propozycje nie mogą zniknąć przez case'owe zamknięcie zakładki | Wysoka        | Wysokie — brak jakiejkolwiek persystencji                                                                       | R-2: Open Question #6 z PRD. Strata całej sesji przeglądu propozycji = degradacja UX do zera; sprzeczne z guardrail "continuous feedback for long operations".                                             |
| **#3**    | `Card.front/back` (DB-level max length) | Karty mają ograniczoną długość po stronie serwera              | Średnia       | Średnie — bypass przez bezpośrednie wywołanie API                                                               | R-3: brak `CHECK` w migracji; możliwe wysłanie gigantycznych tekstów z pominięciem API.                                                                                                                    |
| **#4**    | `GenerationSession.bulkAccept`          | Bulk accept obejmuje też propozycje w trakcie edycji           | Średnia       | Niskie — wpływa na UX, nie na integralność danych                                                               | R-4: logiczny błąd w `useGeneration.ts:65`. Karta `"editing"` nie powinna być ignorowana przez "accept all".                                                                                               |
| **#5**    | `ReviewSession.Again` (due_date check)  | Rating=1 pokazuje kartę ponownie zgodnie z planem algorytmu    | Niska–Średnia | Niskie — FSRS usually schedules "Again" za 1–10 min; w typowej sesji różnica niewidoczna                        | R-7: `useReviewSession.ts:72-75`. Potencjalnie nieistotne w MVP, ale sprzeczne z gwarancją algorytmu.                                                                                                      |

### Zalecenie #1 do refaktoru

**`ReviewLog` — odkomentowanie policies append-only.**

Powód: zakomentowane policies w `20260607000001_review_logs_deny_update_delete.sql:1-2` to gotowa implementacja, która przez błąd nie weszła do produkcji. Przywrócenie tych dwóch linii zajmuje minuty, a zapobiega ciągłemu ryzyku modyfikacji historii ocen — zarówno przez błąd aplikacji, jak i bezpośrednie zapytania do bazy. Rdzeń produktu (SR algorithm correctness) bezpośrednio zależy od nienaruszalności tej historii.

---

_Artefakt wygenerowany przez domain-distillation prompt na podstawie `context/foundation/prd.md`, `context/foundation/tech-stack.md`, migracji SQL i kodu źródłowego w `src/`._
