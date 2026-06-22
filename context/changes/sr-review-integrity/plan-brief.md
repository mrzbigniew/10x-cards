# SR Review Integrity — Plan Brief

> Full plan: `context/changes/sr-review-integrity/plan.md`
> Domain analysis: `context/domain/02-invariant-aggregate-refactor.md`

## What & Why

Dwa niezmienniki integralności historii SR są zadeklarowane w PRD i komentarzach migracji,
ale nie są egzekwowane w kodzie. Policies `deny update/delete` na `review_logs` są zakomentowane,
a INSERT logu w `sr.ts:125` jest oznaczony `// Best-effort` — cicha utrata historii ocen nie
przerywa operacji. FSRS oblicza interwały na podstawie historii; uszkodzona historia oznacza
błędne harmonogramy dla wszystkich przyszłych sesji.

## Starting Point

`applyRating` w `sr.ts:94-132` wykonuje UPDATE `card_sr_state` i INSERT `review_logs` jako
dwa oddzielne zapytania. Tabela `review_logs` ma aktywne RLS, ale brak jawnych guards dla
UPDATE/DELETE — policies istnieją jako zakomentowany kod w `20260607000001_...sql`.

## Desired End State

Po planie: żaden uwierzytelniony klient nie może modyfikować ani usuwać wpisów `review_logs`
(egzekwowane przez `USING (false)` policies). Ocena karty jest atomowa — jeden Postgres RPC
zastępuje dwa oddzielne roundtrip'y, a domenowy agregat `applyCardRating` jest jedynym miejscem
w aplikacji, które zapisuje ocenę.

## Key Decisions Made

| Decision                    | Choice                                              | Why (1 sentence)                                                                           | Source          |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| Egzekucja I-1 (append-only) | Jawne `USING (false)` policies w nowej migracji     | Zakomentowany kod nie jest gwarancją; jawna policy jest testowalna i czytelna              | Domain analysis |
| Atomowość I-2               | Postgres RPC `SECURITY DEFINER` w jednej transakcji | Eliminuje scenariusz split-brain między UPDATE a INSERT bez przepisywania algorytmu FSRS   | Domain analysis |
| Obliczenia SR               | TypeScript (ts-fsrs) + wynik jako jsonb do SQL      | Zachowanie biblioteki ts-fsrs; SQL odpowiada tylko za persystencję (Wariant A z dokumentu) | Domain analysis |
| Fate of `applyRating`       | Usunięcie jako publiczna funkcja                    | Domena ma jeden point-of-entry; duplikacja toruje drogę do regresji "best-effort"          | Plan            |
| Testy T-5/T-7/T-8           | `describe.skip` placeholders                        | Wymagają prawdziwej DB; wzorzec z `access-control.test.ts:230-233`                         | Plan            |
| `rowToFsrsCard`             | Eksportowana z `sr.ts`                              | Potrzebna w `CardRatingEvent.ts` bez duplikacji logiki konwersji                           | Plan            |

## Scope

**In scope:**

- Migracja deny-policies na `review_logs` (Faza 1)
- Postgres RPC `apply_card_rating_atomic` + regeneracja typów (Faza 2)
- Nowy moduł `src/lib/domain/CardRatingEvent.ts` z `applyCardRating` i `CardRatingDomainError`
- Aktualizacja API route, usunięcie `applyRating`, reorganizacja testów (Faza 3)

**Out of scope:**

- Walidacja server-side "karta jest due" (Faza 3 z dokumentu domenowego — opcjonalna)
- Obliczenia FSRS w PL/pgSQL (Wariant B)
- Zmiany w `loadDueCards`
- Optymalizacja double-SELECT (SELECT w TypeScript + SELECT w SQL dla ownership)

## Architecture / Approach

```
API route  →  applyCardRating()  →  scheduler.next()  →  supabase.rpc()
              (CardRatingEvent.ts)    (ts-fsrs)           ↓
                                                   apply_card_rating_atomic()
                                                   ┌─ verify ownership (JOIN)
                                                   ├─ UPDATE card_sr_state
                                                   └─ INSERT review_logs
                                                       (jedna transakcja)
```

TypeScript jest odpowiedzialny za obliczenia SR (ts-fsrs); SQL za atomową persystencję.
`p_new_state jsonb` przenosi zarówno nowy stan karty jak i pola pre-rating (`prev_state`,
`prev_due`, etc.) potrzebne dla rekordu review_log.

## Phases at a Glance

| Phase             | What it delivers                                                       | Key risk                                                                                     |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. DB Append-Only | Jawne deny-policies aktywne w DB                                       | Migracja może się zderzyć z istniejącą policy (brak — policies były zakomentowane)           |
| 2. Postgres RPC   | Atomowa funkcja `apply_card_rating_atomic` + type-safe TS              | Cast jsonb → właściwy typ może wymagać korekty jeśli ts-fsrs zmieni format                   |
| 3. Domain Layer   | `applyCardRating`, testy T-1–T-6 zielone, stary `applyRating` usunięty | Stub `supabase.rpc` musi odzwierciedlać dokładną sygnaturę RPC; błędny stub = fałszywe testy |

**Prerequisites:** Lokalne środowisko Supabase (lub remote project) dostępne dla `db push`
**Estimated effort:** ~2-3 sesje pracy; Faza 1 to 15 minut, Faza 2 ~1h, Faza 3 ~2-3h

## Open Risks & Assumptions

- `last_review` w `card_sr_state` jest nullable; cast `(p_new_state->>'last_review')::timestamptz`
  zwraca NULL dla literału JSON `null` — PostgreSQL zachowuje się poprawnie, ale warto zweryfikować.
- Supabase JS `supabase.rpc(...)` z SECURITY DEFINER może wymagać dodatkowych uprawnień w środowisku
  produkcyjnym jeśli projekt używa niestandardowych ról.
- Stryker na nowym module może ujawnić przeżyte mutanty w mapowaniu błędów (`CardNotFound` vs
  `RatingFailed`) — do przeglądu po Fazie 3.

## Success Criteria (Summary)

- Submit oceny w UI → `review_logs` ma nowy wiersz, `card_sr_state` zaktualizowany, karta
  znika z kolejki w bieżącej sesji i wraca w odpowiedniej przyszłej sesji
- Bezpośrednia próba `DELETE FROM review_logs` przez Supabase Dashboard → 0 wierszy / błąd RLS
- `npm run test && npm run typecheck && npm run build` — wszystko zielone
