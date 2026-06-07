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
      <div className="border-border bg-card w-full max-w-md rounded-2xl border p-6 shadow-xl">
        <h2 className="text-foreground mb-4 text-lg font-semibold">Nowy zestaw</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            maxLength={200}
            autoFocus
            placeholder="Nazwa zestawu"
            className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary/50 mb-4 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
          />
          {error && <p className="text-destructive mb-3 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setName("");
                onCancel();
              }}
              disabled={isCreating}
              className="border-border bg-card text-foreground hover:bg-accent flex-1 rounded-lg border px-4 py-2 text-sm transition-colors disabled:opacity-40"
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
