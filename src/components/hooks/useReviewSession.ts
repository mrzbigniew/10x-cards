import { useState, useCallback, useEffect, useRef } from "react";
import type { DueCard, RatingResult } from "@/lib/services/sr";

export function useReviewSession(deckId: string) {
  const [queue, setQueue] = useState<DueCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalInitial, setTotalInitial] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [againCount, setAgainCount] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const reviewedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        const dueBefore = endOfDay.toISOString();

        const res = await fetch(`/api/decks/${deckId}/review?due_before=${encodeURIComponent(dueBefore)}`);
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          throw new Error(d.error ?? "Nie udało się załadować kart");
        }
        const data = (await res.json()) as { cards: DueCard[] };
        if (!cancelled) {
          setQueue(data.cards);
          setTotalInitial(data.cards.length);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Nie udało się załadować kart");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const reveal = useCallback(() => {
    setShowAnswer(true);
  }, []);

  const rate = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (queue.length === 0 || submitting) return;
      const current = queue[0];

      setSubmitting(true);
      try {
        const res = await fetch(`/api/decks/${deckId}/review/${current.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          throw new Error(d.error ?? "Nie udało się przesłać oceny");
        }
        const data = (await res.json()) as { sr: RatingResult };

        if (rating === 1) {
          setQueue((q) => {
            const [head, ...rest] = q;
            return [...rest, { ...head, sr: { ...head.sr, ...data.sr } }];
          });
          setAgainCount((n) => n + 1);
        } else {
          if (!reviewedIds.current.has(current.id)) {
            reviewedIds.current.add(current.id);
            setReviewedCount((n) => n + 1);
          }
          setQueue((q) => q.slice(1));
        }
        setShowAnswer(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nie udało się przesłać oceny");
      } finally {
        setSubmitting(false);
      }
    },
    [queue, deckId, submitting],
  );

  const current: DueCard | null = queue.length > 0 ? queue[0] : null;
  const remaining = Math.max(0, queue.length - 1);
  const finished = !loading && queue.length === 0;

  return {
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
  };
}
