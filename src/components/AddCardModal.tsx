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
      setError(err instanceof Error ? err.message : "Failed to add card");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f0c1a] p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-white">Add card</h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <div className="mb-1 flex justify-between">
              <label className="text-xs font-medium text-white/50">Front</label>
              <span className={cn("text-xs", front.length >= 490 ? "text-red-400" : "text-white/30")}>
                {front.length}/500
              </span>
            </div>
            <textarea
              value={front}
              onChange={(e) => {
                setFront(e.target.value);
              }}
              maxLength={500}
              rows={3}
              placeholder="Card front…"
              autoFocus
              className="w-full resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none"
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between">
              <label className="text-xs font-medium text-white/50">Back</label>
              <span className={cn("text-xs", back.length >= 490 ? "text-red-400" : "text-white/30")}>
                {back.length}/500
              </span>
            </div>
            <textarea
              value={back}
              onChange={(e) => {
                setBack(e.target.value);
              }}
              maxLength={500}
              rows={3}
              placeholder="Card back…"
              className="w-full resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setFront("");
                setBack("");
                setError(null);
                onClose();
              }}
              disabled={submitting}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-40"
            >
              Cancel
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
              {submitting ? "Adding…" : "Add card"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
