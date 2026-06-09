import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useGeneration } from "@/components/hooks/useGeneration";
import { GenerationFlow } from "@/components/generation/GenerationFlow";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preselectedDeckId?: string;
}

export function GenerationModal({ isOpen, onClose, preselectedDeckId }: Props) {
  const generation = useGeneration();
  const { phase, reset } = generation;
  const [showCloseGuard, setShowCloseGuard] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => {
      setToastVisible(false);
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, [toastVisible]);

  const handleCloseRequest = useCallback(() => {
    if (phase === "reviewing" || phase === "generating") {
      setShowCloseGuard(true);
    } else {
      reset();
      onClose();
    }
  }, [phase, reset, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleCloseRequest();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleCloseRequest]);

  function handleConfirmClose() {
    reset();
    setShowCloseGuard(false);
    onClose();
  }

  function handleDone() {
    reset();
    setToastVisible(true);
    onClose();
  }

  const toast = toastVisible
    ? createPortal(
        <div className="fixed right-6 bottom-6 z-[60] flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-600/20 px-4 py-3 shadow-lg backdrop-blur-sm">
          <span className="text-lg text-green-400">✓</span>
          <div>
            <p className="text-sm font-semibold text-green-400">Zestaw zapisany!</p>
            <p className="text-xs text-green-400/70">Twoje fiszki są gotowe do nauki.</p>
          </div>
        </div>,
        document.body,
      )
    : null;

  if (!isOpen) return toast;

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="border-border bg-card flex w-full max-w-3xl flex-col rounded-2xl border shadow-xl"
            style={{ maxHeight: "90vh" }}
          >
            <div className="border-border flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-foreground text-base font-semibold">Generuj fiszki z AI</h2>
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
                <p className="text-foreground text-sm">Zamknąć? Niezapisane zmiany zostaną utracone.</p>
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
                    onClick={handleConfirmClose}
                    aria-label="Potwierdź zamknięcie"
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
                  >
                    Zamknij
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6">
                <GenerationFlow {...generation} onDone={handleDone} preselectedDeckId={preselectedDeckId} />
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
      {toast}
    </>
  );
}
