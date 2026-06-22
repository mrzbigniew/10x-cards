---
id: core-layer-spread
title: "Analiza rozsmarowania subdomen Core po warstwach"
type: research
status: preparing
created: 2026-06-22
updated: 2026-06-22
---

## Cel

Zbadanie, jak głęboko dwie subdomeny Core (AI Flashcard Generation + Spaced Repetition Session)
są rozłożone po warstwach kodu — API, services, schemas, hooks, DB — oraz identyfikacja
przecieków logiki domenowej między warstwami.

## Zakres

- Subdomena Core #1: AI Flashcard Generation
- Subdomena Core #2: Spaced Repetition Session
- Wszystkie warstwy: `src/pages/api/`, `src/lib/services/`, `src/lib/schemas/`,
  `src/components/hooks/`, `supabase/migrations/`
