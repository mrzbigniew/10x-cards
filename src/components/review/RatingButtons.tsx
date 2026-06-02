import { cn } from "@/lib/utils";

interface Props {
  onRate: (rating: 1 | 2 | 3 | 4) => Promise<void>;
  disabled?: boolean;
}

const BUTTONS = [
  { rating: 1 as const, label: "Again", style: "border-red-500/40 bg-red-600/20 text-red-300 hover:bg-red-600/30" },
  {
    rating: 2 as const,
    label: "Hard",
    style: "border-orange-500/40 bg-orange-600/20 text-orange-300 hover:bg-orange-600/30",
  },
  {
    rating: 3 as const,
    label: "Good",
    style: "border-green-500/40 bg-green-600/20 text-green-300 hover:bg-green-600/30",
  },
  { rating: 4 as const, label: "Easy", style: "border-blue-500/40 bg-blue-600/20 text-blue-300 hover:bg-blue-600/30" },
];

export function RatingButtons({ onRate, disabled = false }: Props) {
  return (
    <div className="flex gap-2">
      {BUTTONS.map(({ rating, label, style }) => (
        <button
          key={rating}
          disabled={disabled}
          onClick={() => void onRate(rating)}
          className={cn(
            "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40",
            style,
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
