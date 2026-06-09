import { useState } from "react";
import type { DueCard } from "@/lib/services/sr";
import { RatingButtons } from "@/components/review/RatingButtons";
import { cn } from "@/lib/utils";

interface Props {
  loading: boolean;
  error: string | null;
  current: DueCard | null;
  remaining: number;
  reviewedCount: number;
  againCount: number;
  totalInitial: number;
  finished: boolean;
  showAnswer: boolean;
  submitting: boolean;
  reveal: () => void;
  rate: (rating: 1 | 2 | 3 | 4) => Promise<void>;
  onClose?: () => void;
}

export function ReviewSession({
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
  onClose,
}: Props) {
  const cardId = current?.id ?? null;
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);
  const flipped = cardId !== null && flippedCardId === cardId;

  if (loading) {
    return <p className="text-muted-foreground text-sm">Ładowanie…</p>;
  }

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>;
  }

  if (finished && totalInitial === 0) {
    return (
      <div className="text-center">
        <p className="text-foreground/80 text-xl font-semibold">Brak kart na dziś</p>
        <p className="text-muted-foreground mt-2 text-sm">Wszystkie karty zaplanowane są na przyszłe daty.</p>
        <button onClick={onClose} className="mt-6 inline-block text-sm text-purple-500 hover:text-purple-400">
          Zamknij
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="text-center">
        <p className="text-foreground text-xl font-semibold">Sesja zakończona!</p>
        <p className="text-muted-foreground mt-3 text-sm">
          Przejrzane karty: <span className="text-foreground font-medium">{reviewedCount}</span>
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Oceny &ldquo;Raz jeszcze&rdquo;: <span className="text-foreground font-medium">{againCount}</span>
        </p>
        <div className="mt-6 flex justify-center">
          <button onClick={onClose} className="text-sm text-purple-500 hover:text-purple-400">
            Zamknij
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div>
      <div className="text-muted-foreground mb-4 flex items-center justify-end text-sm">
        <span>Pozostało: {remaining + 1}</span>
      </div>
      <div className="[perspective:1200px]">
        <div
          className={cn("flip-card-inner", flipped && "flipped")}
          onTransitionEnd={() => {
            if (flipped) reveal();
          }}
        >
          {/* Front face */}
          <div
            data-testid="review-card-flipper"
            className="flip-card-face border-border bg-card cursor-pointer rounded-xl border p-6 backdrop-blur-sm"
            onClick={() => {
              if (!showAnswer && !submitting && cardId) setFlippedCardId(cardId);
            }}
          >
            <p className="text-foreground text-lg font-semibold">{current.front}</p>
            <p className="text-muted-foreground mt-4 text-xs">Kliknij, aby odsłonić odpowiedź</p>
          </div>
          {/* Back face */}
          <div className="flip-card-face flip-card-back border-border bg-card rounded-xl border p-6 backdrop-blur-sm">
            <p className="text-foreground text-lg font-semibold">{current.front}</p>
            <hr className="border-border my-4" />
            <p className="text-foreground/80 text-base">{current.back}</p>
            <div className="mt-6">
              <RatingButtons onRate={rate} disabled={submitting || !showAnswer} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
