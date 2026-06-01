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
      setRenameError(err instanceof Error ? err.message : "Failed to rename deck");
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
        className="mb-4 inline-flex items-center gap-1 text-sm text-white/50 transition-colors hover:text-white/80"
      >
        ← Dashboard
      </a>
      <div className="mt-2">
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
            className="w-full rounded border border-purple-400/50 bg-white/10 px-3 py-1 text-2xl font-bold text-white focus:outline-none"
          />
        ) : (
          <button
            onClick={startEdit}
            title="Click to rename"
            className="block text-left text-2xl font-bold text-white transition-colors hover:text-purple-300"
          >
            {deck.name}
          </button>
        )}
        {renameError && <p className="mt-1 text-sm text-red-400">{renameError}</p>}
      </div>
    </div>
  );
}
