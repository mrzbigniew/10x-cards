import { cn } from "@/lib/utils";

interface Props {
  onRate: (rating: 1 | 2 | 3 | 4) => Promise<void>;
  disabled?: boolean;
}

const BUTTONS = [
  {
    rating: 1 as const,
    label: "Raz jeszcze",
    style:
      "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-600/20 dark:text-red-300 dark:hover:bg-red-600/30",
  },
  {
    rating: 2 as const,
    label: "Trudna",
    style:
      "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-600/20 dark:text-orange-300 dark:hover:bg-orange-600/30",
  },
  {
    rating: 3 as const,
    label: "Dobra",
    style:
      "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-500/40 dark:bg-green-600/20 dark:text-green-300 dark:hover:bg-green-600/30",
  },
  {
    rating: 4 as const,
    label: "Łatwa",
    style:
      "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-600/20 dark:text-blue-300 dark:hover:bg-blue-600/30",
  },
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
