<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-03 Review Session

- **Plan**: context/changes/review-session/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-06-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical | 2 warnings | 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Dual in-flight guard: split-brain between hook and RatingButtons

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useReviewSession.ts:55 + src/components/review/RatingButtons.tsx:24 + src/components/review/ReviewSession.tsx:20
- **Detail**: Two independent booleans govern the same "rating in flight" state: `submitting` in the hook and `pending` in RatingButtons. They are never synchronized. If the session finishes while a rating is awaiting (queue empties and ReviewSession unmounts), RatingButtons.handleRate's finally block calls setPending(false) on an unmounted component. More structurally: ReviewSession.tsx destructures `submitting` from the hook (line 20) but never uses it in JSX — the RatingButtons disabled state runs entirely off its own local `pending`, making `submitting` a dead variable that provides no actual protection at the button level.
- **Fix A ⭐ Recommended**: Remove local `pending` from RatingButtons, add a `disabled` prop, pass `submitting` from ReviewSession.
  - Strength: Single source of truth; eliminates unmount race; removes the dead `submitting` destructure.
  - Tradeoff: 3-file touch (hook return already has submitting; add disabled prop to RatingButtons, forward it in ReviewSession).
  - Confidence: HIGH — the hook already computes submitting correctly; it just needs to be wired through.
  - Blind spot: None significant.
- **Fix B**: Remove `submitting` from hook return, keep RatingButtons.pending.
  - Strength: Fewer prop changes; local state is self-contained.
  - Tradeoff: Doesn't fix the unmount risk; leaves dual state in place. Only cleans up the dead destructure.
  - Confidence: MEDIUM — still two separate booleans; race survives.
  - Blind spot: The unmount case is low-probability but not impossible.
- **Decision**: FIXED via Fix A — removed local `pending` from RatingButtons, added `disabled` prop, wired `submitting` from ReviewSession.

### F2 — cards.ts has CRLF line endings on disk (autocrlf artifact)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/cards.ts (all lines)
- **Detail**: The file is stored correctly with LF in git (confirmed via `git show 4316a0a:src/lib/services/cards.ts`), but the working-copy version has CRLF endings — introduced when git stash pop triggered core.autocrlf during Phase 3 verification. Prettier reports 89 "Delete ␍" errors when linting cards.ts directly. `npx astro check` and `npm run build` are unaffected; only the prettier/eslint pass is broken.
- **Fix**: `npx eslint --fix src/lib/services/cards.ts` — strips CRLF → LF. No content change since git-stored version is already correct.
- **Decision**: FIXED — ran eslint --fix; no remaining lint errors.

### F3 — Silent review_logs insert failure has no server-side observability

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/sr.ts:125
- **Detail**: Best-effort log insert is intentional per plan ("log failure non-fatal"). But the error is completely swallowed — a systematic failure (RLS misconfiguration, schema mismatch) would be invisible until someone notices missing review history.
- **Fix**: `const { error: logError } = await supabase.from("review_logs").insert(...); if (logError) console.error("[review_logs] insert failed:", logError.message);`
- **Decision**: FIXED — added console.error guard after review_logs insert.

### F4 — Dead `submitting` destructure in ReviewSession.tsx

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/review/ReviewSession.tsx:20
- **Detail**: `submitting` is destructured from useReviewSession but never referenced in JSX. If F1 is fixed via Fix A, this variable becomes load-bearing and the dead code is resolved automatically. If F1 is fixed via Fix B, `submitting` should be removed from the destructure.
- **Fix**: Resolve via F1 Fix A (wire submitting → RatingButtons disabled), or drop from the destructure if Fix B is chosen.
- **Decision**: FIXED — resolved automatically by F1 Fix A.

### F5 — PostgREST cross-deck filter has no explanatory comment

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/sr.ts:80
- **Detail**: `.eq("cards.deck_id", deckId)` filters the embedded resource — correct PostgREST INNER JOIN filter, confirmed working during manual verification. A future reader or Supabase client upgrade might not know this filter is load-bearing for deck scoping. The user_id check prevents cross-user leakage, but cross-deck within the same user is only blocked here.
- **Fix**: Add comment: `// .eq on the embed acts as a JOIN condition — filters to this deck only (PostgREST embedded filter).`
- **Decision**: FIXED — comment added at sr.ts:80.
