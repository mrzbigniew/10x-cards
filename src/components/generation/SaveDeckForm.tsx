import { useState } from "react";
import type { Proposal } from "@/components/hooks/useGeneration";

interface Props {
  text: string;
  proposals: Proposal[];
  isSaving: boolean;
  onSave: (deckName: string) => void;
}

export function SaveDeckForm({ text, proposals, isSaving, onSave }: Props) {
  const autoName = text.trim().replace(/\s+/g, " ").slice(0, 50);
  const [deckName, setDeckName] = useState(autoName);
  const [confirmSkip, setConfirmSkip] = useState(false);

  const acceptedCount = proposals.filter((p) => p.status === "accepted").length;
  const pendingCount = proposals.filter((p) => p.status === "pending").length;

  function handleSave() {
    if (acceptedCount === 0) return;
    if (pendingCount > 0 && !confirmSkip) {
      setConfirmSkip(true);
      return;
    }
    onSave(deckName.trim() || autoName);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h3 className="mb-4 text-base font-semibold text-white">Zapisz do nowego zestawu</h3>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-white/70">Nazwa zestawu</label>
        <input
          type="text"
          value={deckName}
          onChange={(e) => {
            setDeckName(e.target.value);
            setConfirmSkip(false);
          }}
          maxLength={200}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none"
          placeholder="Nazwa zestawu"
        />
      </div>

      <div className="mb-4 text-sm text-white/60">
        {acceptedCount === 0 ? (
          <span className="text-amber-400/80">Zaakceptuj przynajmniej jedną propozycję, aby zapisać.</span>
        ) : (
          <span>
            Liczba fiszek do zapisania: <span className="font-medium text-white">{acceptedCount}</span>
          </span>
        )}
      </div>

      {confirmSkip && pendingCount > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {pendingCount} nierozpatrzona propozycja{pendingCount === 1 ? "" : `(${pendingCount})`} zostanie pominięta.
          Kliknij &bdquo;Zapisz zestaw&rdquo; ponownie, aby potwierdzić.
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving || acceptedCount === 0}
        className="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSaving ? "Zapisywanie…" : "Zapisz zestaw"}
      </button>
    </div>
  );
}
