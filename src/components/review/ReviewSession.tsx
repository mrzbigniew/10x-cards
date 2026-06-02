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
    return <p className="text-sm text-muted-foreground">Ładowanie…</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (finished && totalInitial === 0) {
    return (
      <div className="text-center">
        <p className="text-xl font-semibold text-foreground/80">Brak kart na dziś</p>
        <p className="mt-2 text-sm text-muted-foreground">Wszystkie karty zaplanowane są na przyszłe daty.</p>
        <a href={`/deck/${deckId}`} className="mt-6 inline-block text-sm text-purple-500 hover:text-purple-400">
          ← Powrót do zestawu
        </a>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="text-center">
        <p className="text-xl font-semibold text-foreground">Sesja zakończona!</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Przejrzane karty: <span className="font-medium text-foreground">{reviewedCount}</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Oceny &ldquo;Raz jeszcze&rdquo;: <span className="font-medium text-foreground">{againCount}</span>
        </p>
        <div className="mt-6 flex justify-center gap-6">
          <a href={`/deck/${deckId}`} className="text-sm text-purple-500 hover:text-purple-400">
            ← Powrót do zestawu
          </a>
          <a href="/dashboard" className="text-sm text-purple-500 hover:text-purple-400">
            Pulpit
          </a>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
        <a href={`/deck/${deckId}`} className="hover:text-foreground">
          ← Wróć
        </a>
        <span>Pozostało: {remaining + 1}</span>
      </div>
      <div className="rounded-xl border border-border bg-card p-6 backdrop-blur-sm">
        <p className="text-lg font-semibold text-foreground">{current.front}</p>
        {showAnswer ? (
          <>
            <hr className="my-4 border-border" />
            <p className="text-base text-foreground/80">{current.back}</p>
            <div className="mt-6">
              <RatingButtons onRate={rate} disabled={submitting} />
            </div>
          </>
        ) : (
          <button
            onClick={reveal}
            className="mt-4 rounded-lg border border-purple-500/40 bg-purple-600/20 px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-600/30 dark:text-purple-300"
          >
            Pokaż odpowiedź
          </button>
        )}
      </div>
    </div>
  );
}
