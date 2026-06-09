import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  isOpen: boolean;
  deckName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  error?: string | null;
}

export function DeleteDeckModal({ isOpen, deckName, onConfirm, onCancel, isDeleting, error }: Props) {
  const [inputValue, setInputValue] = useState("");

  if (!isOpen) return null;

  const confirmed = inputValue === deckName;

  return (
    <div
      data-testid="modal-delete-deck"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="border-border bg-card w-full max-w-md rounded-2xl border p-6 shadow-xl">
        <h2 className="text-foreground mb-2 text-lg font-semibold">Usuń zestaw</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Ta operacja jest nieodwracalna. Wszystkie fiszki w zestawie zostaną usunięte.
        </p>
        <p className="text-foreground/80 mb-2 text-sm">
          Wpisz <span className="text-foreground font-mono font-semibold">{deckName}</span>, aby potwierdzić:
        </p>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
          }}
          className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-destructive/50 mb-4 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
          placeholder={deckName}
          autoFocus
        />
        {error && <p className="text-destructive mb-3 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="border-border bg-card text-foreground hover:bg-accent flex-1 rounded-lg border px-4 py-2 text-sm transition-colors disabled:opacity-40"
          >
            Anuluj
          </button>
          <button
            onClick={() => {
              setInputValue("");
              onConfirm();
            }}
            disabled={!confirmed || isDeleting}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
              confirmed && !isDeleting ? "bg-red-600 hover:bg-red-500" : "cursor-not-allowed bg-red-600/40 opacity-40",
            )}
          >
            {isDeleting ? "Usuwanie…" : "Usuń zestaw"}
          </button>
        </div>
      </div>
    </div>
  );
}
