import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Card } from "@/components/hooks/useDeckDetail";

type Mode = "view" | "editing" | "deleting";

interface Props {
  card: Card;
  onUpdate: (cardId: string, front: string, back: string, resetSR: boolean) => Promise<void>;
  onDelete: (cardId: string) => Promise<void>;
}

function truncate(text: string, maxLen = 80): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

export function CardRow({ card, onUpdate, onDelete }: Props) {
  const [mode, setMode] = useState<Mode>("view");
  const [editFront, setEditFront] = useState(card.front);
  const [editBack, setEditBack] = useState(card.back);
  const [resetSR, setResetSR] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setEditFront(card.front);
    setEditBack(card.back);
    setResetSR(false);
    setError(null);
    setMode("editing");
  }

  async function handleSave() {
    const front = editFront.trim();
    const back = editBack.trim();
    if (!front || !back) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(card.id, front, back, resetSR);
      setMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update card");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(card.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete card");
      setDeleting(false);
      setMode("view");
    }
  }

  if (mode === "deleting") {
    return (
      <li className="rounded-lg border border-red-500/30 bg-white/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex-1 text-sm text-white/80">Confirm delete?</span>
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            onClick={() => {
              setMode("view");
            }}
            disabled={deleting}
            className="rounded border border-white/20 px-3 py-1 text-xs text-white/70 transition-colors hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </li>
    );
  }

  if (mode === "editing") {
    return (
      <li className="space-y-3 rounded-lg border border-purple-400/30 bg-white/5 px-4 py-3">
        <div>
          <div className="mb-1 flex justify-between">
            <label className="text-xs font-medium text-white/50">Front</label>
            <span className={cn("text-xs", editFront.length >= 490 ? "text-red-400" : "text-white/30")}>
              {editFront.length}/500
            </span>
          </div>
          <textarea
            value={editFront}
            onChange={(e) => {
              setEditFront(e.target.value);
            }}
            maxLength={500}
            rows={2}
            className="w-full resize-none rounded border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between">
            <label className="text-xs font-medium text-white/50">Back</label>
            <span className={cn("text-xs", editBack.length >= 490 ? "text-red-400" : "text-white/30")}>
              {editBack.length}/500
            </span>
          </div>
          <textarea
            value={editBack}
            onChange={(e) => {
              setEditBack(e.target.value);
            }}
            maxLength={500}
            rows={2}
            className="w-full resize-none rounded border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={resetSR}
            onChange={(e) => {
              setResetSR(e.target.checked);
            }}
            className="rounded"
          />
          Reset SR progress
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => void handleSave()}
            disabled={saving || !editFront.trim() || !editBack.trim()}
            className="rounded bg-purple-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setMode("view");
            }}
            disabled={saving}
            className="rounded border border-white/20 px-3 py-1 text-xs text-white/70 transition-colors hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">{truncate(card.front)}</p>
        <p className="mt-0.5 text-sm text-white/60">{truncate(card.back)}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={startEdit}
          className="rounded border border-white/20 px-2.5 py-1 text-xs text-white/70 transition-colors hover:text-white"
        >
          Edit
        </button>
        <button
          onClick={() => {
            setMode("deleting");
          }}
          className="rounded border border-red-500/30 px-2.5 py-1 text-xs text-red-400/80 transition-colors hover:border-red-400 hover:text-red-300"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
