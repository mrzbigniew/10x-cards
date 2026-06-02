import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (front: string, back: string) => Promise<void>;
}

export function AddCardModal({ isOpen, onClose, onAdd }: Props) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const f = front.trim();
    const b = back.trim();
    if (!f || !b) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAdd(f, b);
      setFront("");
      setBack("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się dodać fiszki");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Dodaj fiszkę</h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <div className="mb-1 flex justify-between">
              <label className="text-xs font-medium text-muted-foreground">Przód</label>
              <span className={cn("text-xs", front.length >= 490 ? "text-destructive" : "text-muted-foreground")}>
                {front.length}/500
              </span>
            </div>
            <textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Przód fiszki…"
              autoFocus
              className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between">
              <label className="text-xs font-medium text-muted-foreground">Tył</label>
              <span className={cn("text-xs", back.length >= 490 ? "text-destructive" : "text-muted-foreground")}>
                {back.length}/500
              </span>
            </div>
            <textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Tył fiszki…"
              className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setFront(""); setBack(""); setError(null); onClose(); }}
              disabled={submitting}
              className="flex-1 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-40"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={submitting || !front.trim() || !back.trim()}
              className={cn(
                "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
                !submitting && front.trim() && back.trim()
                  ? "bg-purple-600 hover:bg-purple-500"
                  : "cursor-not-allowed bg-purple-600/40 opacity-40",
              )}
            >
              {submitting ? "Dodawanie…" : "Dodaj fiszkę"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
