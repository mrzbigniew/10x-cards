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
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f0c1a] p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-white">Usuń zestaw</h2>
        <p className="mb-4 text-sm text-white/60">
          Ta operacja jest nieodwracalna. Wszystkie fiszki w zestawie zostaną usunięte.
        </p>
        <p className="mb-2 text-sm text-white/80">
          Wpisz <span className="font-mono font-semibold text-white">{deckName}</span>, aby potwierdzić:
        </p>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
          }}
          className="mb-4 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-red-400/50 focus:outline-none"
          placeholder={deckName}
          autoFocus
        />
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-40"
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
