import { useState, useRef } from "react";
import type { DeckWithCount } from "@/components/hooks/useDeckList";

interface Props {
  deck: DeckWithCount;
  onRename: (id: string, name: string) => Promise<void>;
  onDeleteRequest: (deck: DeckWithCount) => void;
}

export function DeckRow({ deck, onRename, onDeleteRequest }: Props) {
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
      await onRename(deck.id, trimmed);
      setRenameError(null);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Błąd zmiany nazwy");
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
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:bg-white/8">
      <div className="min-w-0 flex-1">
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
            className="w-full rounded border border-purple-400/50 bg-white/10 px-2 py-0.5 text-sm text-white focus:outline-none"
          />
        ) : (
          <button
            onClick={startEdit}
            title="Kliknij, aby zmienić nazwę"
            className="block truncate text-left text-sm font-medium text-white hover:text-purple-300"
          >
            {deck.name}
          </button>
        )}
        {renameError && <p className="mt-1 text-xs text-red-400">{renameError}</p>}
      </div>

      <span className="shrink-0 text-xs text-white/40">
        {deck.card_count} {deck.card_count === 1 ? "fiszka" : "fiszek"}
      </span>

      <button
        onClick={() => {
          onDeleteRequest(deck);
        }}
        title="Usuń zestaw"
        className="shrink-0 rounded p-1 text-white/30 transition-colors hover:text-red-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}
