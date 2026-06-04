import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useReviewSession } from "@/components/hooks/useReviewSession";
import { ReviewSession } from "@/components/review/ReviewSession";

interface Props {
  deckId: string;
  onClose: () => void;
}

export function ReviewModal({ deckId, onClose }: Props) {
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

  const [showCloseGuard, setShowCloseGuard] = useState(false);

  useEffect(() => {
    if (finished && reviewedCount > 0) {
      window.dispatchEvent(new CustomEvent("session-completed"));
    }
  }, [finished, reviewedCount]);

  const handleCloseRequest = useCallback(() => {
    if (reviewedCount > 0 && !finished) {
      setShowCloseGuard(true);
    } else {
      onClose();
    }
  }, [reviewedCount, finished, onClose]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleCloseRequest();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCloseRequest]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="border-border bg-card flex w-full max-w-2xl flex-col rounded-2xl border shadow-xl"
        style={{ maxHeight: "90vh" }}
      >
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-foreground text-base font-semibold">Powtórka</h2>
          <button
            onClick={handleCloseRequest}
            className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg p-1.5 transition-colors"
            aria-label="Zamknij"
          >
            ×
          </button>
        </div>

        {showCloseGuard ? (
          <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-foreground text-sm">Zamknąć sesję? Postęp zostanie utracony.</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCloseGuard(false);
                }}
                className="border-border bg-card text-foreground hover:bg-accent rounded-lg border px-4 py-2 text-sm transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={onClose}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
              >
                Zamknij
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <ReviewSession
              loading={loading}
              error={error}
              current={current}
              remaining={remaining}
              reviewedCount={reviewedCount}
              againCount={againCount}
              totalInitial={totalInitial}
              finished={finished}
              showAnswer={showAnswer}
              submitting={submitting}
              reveal={reveal}
              rate={rate}
              onClose={onClose}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
