import { useState, useRef } from "react";
import type { Deck } from "@/components/hooks/useDeckDetail";

interface Props {
  deck: Deck;
  onRename: (name: string) => Promise<void>;
}

export function DeckDetailHeader({ deck, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(deck.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraftName(deck.name);
    setRenameError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commitRename() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === deck.name) {
      setEditing(false);
      return;
    }
    try {
      await onRename(trimmed);
      setRenameError(null);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Nie udało się zmienić nazwy zestawu");
    } finally {
      setEditing(false);
    }
  }

  function cancelEdit() {
    setDraftName(deck.name);
    setRenameError(null);
    setEditing(false);
  }

  return (
    <div className="mb-6">
      <a
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm transition-colors"
      >
        ← Pulpit
      </a>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="flex-1">
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value);
              }}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename();
                if (e.key === "Escape") cancelEdit();
              }}
              maxLength={200}
              className="border-primary/50 bg-input text-foreground w-full rounded border px-3 py-1 text-2xl font-bold focus:outline-none"
            />
          ) : (
            <button
              onClick={startEdit}
              title="Kliknij, aby zmienić nazwę"
              className="text-foreground block text-left text-2xl font-bold transition-colors hover:text-purple-500"
            >
              {deck.name}
            </button>
          )}
          {renameError && <p className="text-destructive mt-1 text-sm">{renameError}</p>}
        </div>
      </div>
    </div>
  );
}
