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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-foreground">Usuń zestaw</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Ta operacja jest nieodwracalna. Wszystkie fiszki w zestawie zostaną usunięte.
        </p>
        <p className="mb-2 text-sm text-foreground/80">
          Wpisz <span className="font-mono font-semibold text-foreground">{deckName}</span>, aby potwierdzić:
        </p>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
          }}
          className="mb-4 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-destructive/50 focus:outline-none"
          placeholder={deckName}
          autoFocus
        />
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-40"
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
