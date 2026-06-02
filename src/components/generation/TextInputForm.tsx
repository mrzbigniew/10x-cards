import { Sparkles } from "lucide-react";

interface Props {
  text: string;
  onTextChange: (v: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  errorMessage: string | null;
}

export function TextInputForm({ text, onTextChange, onGenerate, isGenerating, errorMessage }: Props) {
  const trimmedLength = text.trim().length;
  const tooShort = trimmedLength < 50;
  const canSubmit = !tooShort && !isGenerating;

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground/70">Wklej notatki lub tekst z podręcznika</label>

        {errorMessage && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => {
            onTextChange(e.target.value);
          }}
          maxLength={10000}
          rows={12}
          disabled={isGenerating}
          placeholder="Wklej tutaj tekst (do 10 000 znaków)…"
          className="w-full rounded-lg border border-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none disabled:opacity-60"
        />

        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
          {tooShort && trimmedLength > 0 ? (
            <span className="text-amber-500">Minimum 50 znaków ({trimmedLength} dotychczas)</span>
          ) : trimmedLength === 0 ? (
            <span>Minimum 50 znaków</span>
          ) : (
            <span>{trimmedLength.toLocaleString("pl-PL")} znaków</span>
          )}
          <span>{text.length.toLocaleString("pl-PL")} / 10 000</span>
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-base font-semibold text-white shadow-lg transition-all hover:from-purple-500 hover:to-blue-500 hover:shadow-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isGenerating ? (
          <>
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Generowanie fiszek…
          </>
        ) : (
          <>
            <Sparkles className="size-5" />
            Generuj fiszki z AI
          </>
        )}
      </button>
    </div>
  );
}
