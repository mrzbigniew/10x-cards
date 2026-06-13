import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONFIRMATION_PHRASE = "USUŃ KONTO";

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = inputValue === CONFIRMATION_PHRASE;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setInputValue("");
      setError(null);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: CONFIRMATION_PHRASE }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Wystąpił błąd. Spróbuj ponownie.");
        return;
      }
      window.location.assign("/auth/signin?notice=account-deleted");
    } catch {
      setError("Wystąpił błąd połączenia. Spróbuj ponownie.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Usuń konto</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Usuń konto</AlertDialogTitle>
          <AlertDialogDescription>
            Ta operacja jest nieodwracalna. Twoje konto oraz wszystkie dane (zestawy, fiszki, historia powtórek) zostaną
            trwale usunięte.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="confirmation">
            Wpisz <span className="font-mono font-semibold">{CONFIRMATION_PHRASE}</span>, aby potwierdzić:
          </Label>
          <Input
            id="confirmation"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
            }}
            placeholder={CONFIRMATION_PHRASE}
            disabled={isDeleting}
            autoFocus
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
          <Button variant="destructive" disabled={!confirmed || isDeleting} onClick={handleDelete}>
            {isDeleting ? "Usuwanie…" : "Usuń konto"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
