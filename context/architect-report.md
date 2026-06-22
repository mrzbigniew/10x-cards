# Raport architektoniczny — Moduł 4 (10xArchitect)

> Data: 2026-06-22. Artefakty: L2/L3/L4 z repo **wekan**, L5 z repo **10xCards** (ten projekt).

---

## 1. Opisane projekty

| Projekt                               | Stack                                                                                                                       | Skala                                                                          | Artefakty    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------ |
| **Wekan** (`D:\PROJECTS\wekan`)       | Meteor.js (JS full-stack, wspólne `models/` klient+serwer), MongoDB, Blaze/Jade templates                                   | ~2 300 commitów/rok, 19 aktywnych autorów (Q2 2026), 31 publikacji reaktywnych | L2 · L3 · L4 |
| **10xCards** (`D:\PROJECTS\10xDEVv3`) | Astro v6 + React v19 + TypeScript, Cloudflare Workers, Supabase (PostgreSQL + RLS + Auth), OpenAI via OpenRouter, `ts-fsrs` | MVP — jeden deweloper                                                          | L5           |

---

## 2. Mapa projektu — Wekan (L2)

**5 kluczowych wniosków:**

1. **25-modułowy SCC jako fundament ryzyka.** `reactiveCache.js` i 24 moduły domenowe tworzą jeden Strongly Connected Component (fan-in ~100). Wejście binarne: każdy import `reactiveCache.js` wciąga wszystkie 25 modułów jednocześnie — brak gradacji ryzyka.

2. **Niewidzialne sprzężenie przez `Meteor.Session`.** Dep-cruiser widzi 2 cross-component importy, ale git history pokazuje 10 silnych par co-change (siła 24–38). Sprzężenie przebiega przez globalny stan reaktywny — niewidoczne dla CI.

3. **`rules/` rośnie na cyklicznym gruncie.** Najszybciej rosnący moduł (0→100 zmian/rok) zależy od `Utils.getCurrentBoard()` — jedynej metody z `client/lib/utils.js`, który sam jest w cyklu SCC. Zmiana utils.js dotyka 11 plików rules i ~35 komponentów importujących utils.

4. **`models/users.js → client/lib/utils.js` — jedyne naruszenie granicy shared→client.** Nie ma reguły `models-not-to-server` w dep-cruiserze — naruszenia są niewidoczne w CI.

5. **Q2 2026: eksplozja aktywności (1 179 commitów, 19 autorów vs 526/9 w Q1).** Prawdopodobnie onboarding nowych kontrybutorów — wysokie ryzyko regresji bez testów integracyjnych.

---

## 3. Analiza ficzera — Wekan (L3)

**Przepływ:** Synchronizacja etykiet między połączonymi kartami (issue #5683). Powiązanie ze strefą ryzyka #1 (SCC) i #3 (`rules/`): `models/cards.js` jest w centrum 25-modułowego SCC.

**Feature overview:** Synchronizacja etykiet **nie istnieje**. Wekan ma zarządzanie etykietami na kartach (pełne: add/remove/toggle przez UI, klawiaturę, drag-and-drop, REST) oraz Linked Cards (`cardType-linkedCard`). Przy tworzeniu linked card pole `labelIds` jest **jawnie usuwane** (`models/cards.js:942`). Oba mechanizmy są celowo rozłączone.

**Technical debt (3 kluczowe):**

1. **TODO bez daty i autora** — `delete linkCard.labelIds` (`models/cards.js:942`). Potwierdzone ast-grepem: `ast-grep --pattern 'delete $X'` → `models/cards.js:942`. Brak roadmapy, brak ownera.

2. **`cardLabels()` hook — 0% pokrycia testami i fire-and-forget.** Hook logujący `addedLabel`/`removedLabel` jest wywoływany z `server/models/cards.js:460` bez `await` — Promise dropped. Błąd w `Activities.insertAsync` jest cicho ignorowany. Blast radius: każda zmiana etykiety na każdej karcie.

3. **Cross-board label matching — duplikacja bez testów.** Ta sama logika (`oldCardLabels.filter(name).map(id)`) zduplikowana w `Card.move()` (linia 2430–2452) i `Card.copy()` (linia 841–858). Żaden test nie weryfikuje ani jednej ścieżki.

---

## 4. Plan refaktoryzacji — Wekan (L4)

**Wybrana opcja:** Podejście B — rozszerzenie silnika reguł (nie hook `before.update`). Użytkownik konfiguruje regułę: trigger `addedLabel`/`removedLabel` → nowa akcja `syncLabelToLinkedCard`. Dodatkowo fix `Card.link()` kopiujący etykiety przy tworzeniu karty.

**Czego NIE robimy:** brak sync dwukierunkowego; brak lock ikony w UI; brak nowych triggerów w `triggersDef.js` (istniejące `addedLabel`/`removedLabel` wystarczą); brak zmian w REST API; brak zmian w `Card.copy()`.

**Fazy:**

| Faza                | Zakres                                                                       | Weryfikacja                                                                           |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1 — Card.link() fix | Usuń `delete linkCard.labelIds`, dodaj cross-board name matching             | Manualna: 3 scenariusze (same-board, cross-board match, cross-board brak dopasowania) |
| 2 — Rules action    | `rulesHelper.js` nowy branch + `cardActions.jade` UI + i18n                  | Auto: lint + `meteor run`; manualna: 4 scenariusze (w tym test unidirectional)        |
| 3 — Migracja        | One-time script dla pre-existing linked cards (idempotentny)                 | Auto: `meteor run`; manualna: seed DB + idempotency check                             |
| 4 — Testy           | Playwright E2E (spec 17 lub nowy spec 28) + opcjonalny unit test rulesHelper | Auto: Playwright + `npm test`                                                         |

---

## 5. Domena wg DDD — 10xCards (L5)

**Ubiquitous language (5 pojęć):**

| Pojęcie                                                                                       | Rozjazd model-vs-kod                                                                      |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Flashcard** — para Q&A, karta uczenia                                                       | —                                                                                         |
| **SR State** — parametry FSRS per karta (stability, difficulty, due, reps, lapses, phase 0–3) | Pola DB nazwane jak pola `ts-fsrs Card` — przeciek zewnętrznej biblioteki do schematu     |
| **Review Log** — niemodyfikowalny zapis jednej oceny                                          | Policies `deny update/delete` **zakomentowane** w migracji `20260607000001_...sql:1-2`    |
| **Generation Session** — tymczasowy proces generowania propozycji AI                          | Żyje tylko w React state; zamknięcie zakładki = utrata całej sesji (PRD pyta o auto-save) |
| **Rating/Grade** — 1=Again, 2=Hard, 3=Good, 4=Easy                                            | Typ `Grade` z ts-fsrs wyciekał do publicznej sygnatury serwisu i hooka klienta            |

**Niezmiennik #1:** `review_logs` jest append-only ORAZ ocena karty jest atomowa. Należy do agregatu **`CardRatingEvent`**. Stan obecny: policies zakomentowane + INSERT logu jest `// Best-effort` w `sr.ts:125` — cicha utrata historii nie przerywa operacji.

**Anti-Corruption Layer — `ts-fsrs`:** Biblioteka przecieka przez **3 warstwy produkcyjne** (`sr.ts:1`, `cards.ts:1`, `useReviewSession.ts:2`) i schemat DB (nazwy kolumn = pola `ts-fsrs Card`). Wymiana biblioteki dziś wymagałaby zmian w 5 plikach + migracji DB — mimo że PRD (`prd.md:221`) deklaruje użycie "ready open-source library" (= intencja wymienialności). Rozwiązanie: `FsrsAdapter` implementujący port `ISrScheduler` jako jedyne miejsce importu ts-fsrs; value object `SrCardState` jako jedyne miejsce mapowania DB↔domena. Po refaktorze `grep "ts-fsrs" src/` zwraca wyłącznie `FsrsAdapter.ts`.

---

## 6. Decyzje, które należą do mnie

W L3/L4 AI zaproponowało dwa podejścia do synchronizacji etykiet (Podejście A: hook `before.update` vs. Podejście B: rozszerzenie silnika reguł). **Zdecydowałem: Podejście B** — jest bezpieczniejsze architektonicznie (nie dotyka SCC bezpośrednio), a silnik reguł i tak jest tu odpowiednim poziomem abstrakcji; użytkownik zyskuje kontrolę nad tym, czy sync jest aktywny.

W L5 AI sklasyfikowało `ts-fsrs` jako gorszy przeciek niż `openai` — **potwierdziłem tę ocenę**, bo `openai` ma ACL de facto (izolacja w jednym pliku), a ts-fsrs nie ma żadnej warstwy ochrony mimo PRD-owej deklaracji wymienialności.

W L5 ranking niezmienników wskazał append-only `review_logs` + atomowość jako #1. **Potwierdziłem**, że zakomentowane policies to błąd krytyczny — nie "dług techniczny do spłacenia kiedyś", lecz aktywne ryzyko manipulacji historią ocen przez bezpośrednie wywołania Supabase JS z przeglądarki.
