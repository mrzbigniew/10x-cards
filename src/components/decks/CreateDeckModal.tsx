import { useState } from "react";

interface Props {
  isOpen: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  isCreating: boolean;
  error?: string | null;
}

export function CreateDeckModal({ isOpen, onConfirm, onCancel, isCreating, error }: Props) {
  const [name, setName] = useState("");

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Nowy zestaw</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            autoFocus
            placeholder="Nazwa zestawu"
            className="mb-4 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
          />
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setName(""); onCancel(); }}
              disabled={isCreating}
              className="flex-1 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-40"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isCreating}
              className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
            >
              {isCreating ? "Tworzenie…" : "Utwórz"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
