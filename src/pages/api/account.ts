import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase-admin";
import { deleteAccount } from "@/lib/services/account";

export const prerender = false;

const CONFIRMATION_PHRASE = "USUŃ KONTO";

const DeleteAccountSchema = z.object({
  confirmation: z.literal(CONFIRMATION_PHRASE, {
    error: `Wpisz dokładnie "${CONFIRMATION_PHRASE}", aby potwierdzić usunięcie konta`,
  }),
});

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie" }, { status: 400 });
  }

  const parsed = DeleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe żądanie" }, { status: 400 });
  }

  const admin = createAdminClient();
  const supabase = createClient(context.request.headers, context.cookies);
  if (!admin || !supabase) {
    return Response.json({ error: "Baza danych nie jest skonfigurowana" }, { status: 503 });
  }

  try {
    // Admin client bypasses RLS — the id must come from the session, never the body.
    await deleteAccount(admin, context.locals.user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Nie udało się usunąć konta";
    return Response.json({ error: message }, { status: 500 });
  }

  try {
    await supabase.auth.signOut();
  } catch {
    // Deliberate exception to the never-swallow-errors rule: the auth user is
    // already deleted, so signOut() may fail on a dead session. Deletion has
    // succeeded; stale cookies are harmless — middleware's getUser() returns
    // null for a deleted user, so the next navigation is treated as signed-out.
  }

  return Response.json({});
};
