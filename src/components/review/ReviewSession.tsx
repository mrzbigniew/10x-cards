import { useReviewSession } from "@/components/hooks/useReviewSession";
import { RatingButtons } from "@/components/review/RatingButtons";

interface Props {
  deckId: string;
}

export function ReviewSession({ deckId }: Props) {
  const {
    loading,
    error,
    current,
    remaining,
    reviewedCount,
    againCount,
    totalInitial,
    finished,
    showAnswer,
    submitting,
    reveal,
    rate,
  } = useReviewSession(deckId);

  if (loading) {
    return <p className="text-sm text-white/40">Loading…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (finished && totalInitial === 0) {
    return (
      <div className="text-center">
        <p className="text-xl font-semibold text-white/80">No cards due today</p>
        <p className="mt-2 text-sm text-white/50">All cards are scheduled for a future date.</p>
        <a href={`/deck/${deckId}`} className="mt-6 inline-block text-sm text-purple-400 hover:text-purple-300">
          ← Back to deck
        </a>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="text-center">
        <p className="text-xl font-semibold text-white">Session complete!</p>
        <p className="mt-3 text-sm text-white/60">
          Cards reviewed: <span className="text-white">{reviewedCount}</span>
        </p>
        <p className="mt-1 text-sm text-white/60">
          Again ratings: <span className="text-white">{againCount}</span>
        </p>
        <div className="mt-6 flex justify-center gap-6">
          <a href={`/deck/${deckId}`} className="text-sm text-purple-400 hover:text-purple-300">
            ← Back to deck
          </a>
          <a href="/dashboard" className="text-sm text-purple-400 hover:text-purple-300">
            Dashboard
          </a>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-sm text-white/50">
        <a href={`/deck/${deckId}`} className="hover:text-white/80">
          ← Back
        </a>
        <span>
          {remaining + 1} card{remaining + 1 !== 1 ? "s" : ""} remaining
        </span>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <p className="text-lg font-semibold text-white">{current.front}</p>
        {showAnswer ? (
          <>
            <hr className="my-4 border-white/10" />
            <p className="text-base text-white/80">{current.back}</p>
            <div className="mt-6">
              <RatingButtons onRate={rate} disabled={submitting} />
            </div>
          </>
        ) : (
          <button
            onClick={reveal}
            className="mt-4 rounded-lg border border-purple-500/40 bg-purple-600/20 px-4 py-2 text-sm font-medium text-purple-300 transition-colors hover:bg-purple-600/30"
          >
            Show answer
          </button>
        )}
      </div>
    </div>
  );
}
