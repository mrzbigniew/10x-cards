---
id: sr-review-integrity
title: "SR Review Integrity — append-only review_logs + atomiczna ocena"
type: refactor
status: planned
created: 2026-06-22
updated: 2026-06-22
---

## Cel

Egzekwowanie dwóch niezmienników historii SR, które są zadeklarowane, ale nie chronione:

1. **I-1** — `review_logs` jest append-only; żaden wpis nie może być modyfikowany ani usunięty.
2. **I-2** — ocena karty (UPDATE `card_sr_state` + INSERT `review_logs`) jest atomowa.

## Źródło

`context/domain/02-invariant-aggregate-refactor.md` — pełna analiza domenowa.

## Zakres

- Nowa migracja DB: explicit `deny update / deny delete` policies na `review_logs`
- Nowa migracja DB: Postgres RPC `apply_card_rating_atomic` (UPDATE + INSERT w jednej transakcji)
- Nowy moduł domenowy: `src/lib/domain/CardRatingEvent.ts`
- Aktualizacja API route: `src/pages/api/decks/[id]/review/[cardId].ts`
- Usunięcie `applyRating` z `src/lib/services/sr.ts`
- Testy: nowy `src/test/CardRatingEvent.test.ts` (T-1–T-8), aktualizacja `sr.test.ts` i `access-control.test.ts`
