import { useState, useEffect, useRef } from "react";
import type { DeckWithCount } from "@/components/hooks/useDeckList";

interface Props {
  deck: DeckWithCount;
  onDeleteRequest: (deck: DeckWithCount) => void;
}

export function DeckCard({ deck, onDeleteRequest }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [dropdownOpen]);

  return (
    <div className="relative flex min-h-[150px] w-full flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div>
        <p className="line-clamp-2 text-lg font-semibold text-white">{deck.name}</p>
        <p className="mt-1 text-sm text-white/60">
          {deck.card_count} {deck.card_count === 1 ? "fiszka" : "fiszek"}
        </p>
      </div>

      <div ref={dropdownRef} className="absolute top-3 right-3">
        <button
          onClick={() => {
            setDropdownOpen((o) => !o);
          }}
          className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          title="Opcje"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="absolute top-8 right-0 z-10 min-w-[120px] rounded-lg border border-white/10 bg-[#0f0c1a] py-1 shadow-xl">
            <a
              href={`/deck/${deck.id}/review`}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                <path
                  fillRule="evenodd"
                  d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Review
            </a>
            <a
              href={`/deck/${deck.id}`}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              Edit
            </a>
            <button
              onClick={() => {
                setDropdownOpen(false);
                onDeleteRequest(deck);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400/80 transition-colors hover:bg-white/10 hover:text-red-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z"
                  clipRule="evenodd"
                />
              </svg>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
