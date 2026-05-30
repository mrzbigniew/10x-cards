import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { SaveDeckRequestSchema } from "@/lib/schemas/generation";
import { createDeckWithCards } from "@/lib/services/decks";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SaveDeckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const { deckId } = await createDeckWithCards(supabase, context.locals.user.id, parsed.data.name, parsed.data.cards);
    return Response.json({ deckId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save deck";
    return Response.json({ error: message }, { status: 500 });
  }
};
