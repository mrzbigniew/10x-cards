import { useState } from "react";
import { Sparkles } from "lucide-react";
import { GenerationModal } from "@/components/generation/GenerationModal";

export function GenerateButton() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          setIsOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition-all hover:from-purple-500 hover:to-blue-500 hover:shadow-purple-500/25"
      >
        <Sparkles className="size-5" />
        Generuj fiszki z AI
      </button>
      <GenerationModal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
        }}
      />
    </>
  );
}
