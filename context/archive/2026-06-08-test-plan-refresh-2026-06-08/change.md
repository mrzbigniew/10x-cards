---
change_id: test-plan-refresh-2026-06-08
title: Test plan refresh 2026-06-08
status: archived
created: 2026-06-08
updated: 2026-06-10
archived_at: 2026-06-10T00:00:00Z
---

## Notes

Context: context/foundation/test-plan.md has completed all 4 original rollout
phases. This refresh opens a new change to cover three gaps that emerged from
newly shipped slices (S-07 modal generation, S-08 modal review) and high-churn
hooks.

New risks to address:

- R-A (High x Medium): Modal generation lifecycle — pasted text lost when modal
  is dismissed during active generation (modal unmount destroys React state).
  Source: interview Q1; hot-spot dir src/components/generation (24 commits/30d).
- R-B (Medium x High): useDeckList optimistic-update rollback — failed mutation
  silently leaves UI in optimistic state. Source: interview Q2+Q4; hot-spot dir
  src/components/hooks (11 commits/30d). Research must verify rollback is
  implemented before planning tests.
- R-C (High x Medium): useReviewSession Again-requeue depth — existing test may
  not assert the Again→Again chain or session-end condition. Source: interview Q3+Q4.

Proposed rollout phases in this refresh:

- R-1 (modal-and-hook-gaps): unit tests for R-A + R-B
- R-2 (review-requeue-depth): extend useReviewSession tests for R-C; update
  test-plan.md §4 (remove stale "no test infrastructure" text), §6.5
  (per-phase notes), §8 (add F-02 i18n to watch-list)

Risk response intent:

- R-A: prove text survives modal dismiss during in-flight generation (dismiss
  guard OR state lifted above modal boundary); challenge: "React state survives
  unmount" — it does not; avoid: testing only happy-path generation.
- R-B: prove failed mutation reverts deck list to server state; challenge:
  verify rollback is actually implemented first — if absent, flag as feature
  gap, not test gap; avoid: testing only successful mutations.
- R-C: prove Again→Again re-queues correctly and session ends only when all
  non-Again cards are exhausted; challenge: existing test may only assert final
  outcome, not intermediate requeue; avoid: single Again→Good scenario.
