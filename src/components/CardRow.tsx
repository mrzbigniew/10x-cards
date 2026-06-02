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
      setError(err instanceof Error ? err.message : "Nie udało się zaktualizować fiszki");
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
      setError(err instanceof Error ? err.message : "Nie udało się usunąć fiszki");
      setDeleting(false);
      setMode("view");
    }
  }

  if (mode === "deleting") {
    return (
      <li className="rounded-lg border border-destructive/30 bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex-1 text-sm text-foreground/80">Potwierdzić usunięcie?</span>
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-40"
          >
            {deleting ? "Usuwanie…" : "Tak, usuń"}
          </button>
          <button
            onClick={() => setMode("view")}
            disabled={deleting}
            className="rounded border border-border px-3 py-1 text-xs text-foreground/70 transition-colors hover:text-foreground disabled:opacity-40"
          >
            Anuluj
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </li>
    );
  }

  if (mode === "editing") {
    return (
      <li className="space-y-3 rounded-lg border border-primary/30 bg-card px-4 py-3">
        <div>
          <div className="mb-1 flex justify-between">
            <label className="text-xs font-medium text-muted-foreground">Przód</label>
            <span className={cn("text-xs", editFront.length >= 490 ? "text-destructive" : "text-muted-foreground")}>
              {editFront.length}/500
            </span>
          </div>
          <textarea
            value={editFront}
            onChange={(e) => setEditFront(e.target.value)}
            maxLength={500}
            rows={2}
            className="w-full resize-none rounded border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between">
            <label className="text-xs font-medium text-muted-foreground">Tył</label>
            <span className={cn("text-xs", editBack.length >= 490 ? "text-destructive" : "text-muted-foreground")}>
              {editBack.length}/500
            </span>
          </div>
          <textarea
            value={editBack}
            onChange={(e) => setEditBack(e.target.value)}
            maxLength={500}
            rows={2}
            className="w-full resize-none rounded border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground/70">
          <input
            type="checkbox"
            checked={resetSR}
            onChange={(e) => setResetSR(e.target.checked)}
            className="rounded"
          />
          Resetuj postęp powtórek
        </label>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => void handleSave()}
            disabled={saving || !editFront.trim() || !editBack.trim()}
            className="rounded bg-purple-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
          >
            {saving ? "Zapisywanie…" : "Zapisz"}
          </button>
          <button
            onClick={() => setMode("view")}
            disabled={saving}
            className="rounded border border-border px-3 py-1 text-xs text-foreground/70 transition-colors hover:text-foreground disabled:opacity-40"
          >
            Anuluj
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{truncate(card.front)}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{truncate(card.back)}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={startEdit}
          className="rounded border border-border px-2.5 py-1 text-xs text-foreground/70 transition-colors hover:text-foreground"
        >
          Edytuj
        </button>
        <button
          onClick={() => setMode("deleting")}
          className="rounded border border-destructive/30 px-2.5 py-1 text-xs text-destructive/80 transition-colors hover:border-destructive hover:text-destructive"
        >
          Usuń
        </button>
      </div>
    </li>
  );
}
