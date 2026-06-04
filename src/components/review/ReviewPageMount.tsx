import { ReviewModal } from "@/components/review/ReviewModal";

interface Props {
  deckId: string;
}

export function ReviewPageMount({ deckId }: Props) {
  return (
    <ReviewModal
      deckId={deckId}
      onClose={() => {
        window.location.href = "/dashboard";
      }}
    />
  );
}
