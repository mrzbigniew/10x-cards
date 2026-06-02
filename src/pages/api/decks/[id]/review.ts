import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { DueQuerySchema } from "@/lib/schemas/review";
import { loadDueCards } from "@/lib/services/sr";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deckId = context.params.id;
  if (!deckId) {
    return Response.json({ error: "Missing deck id" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const rawQuery = Object.fromEntries(context.url.searchParams.entries());
  const parsed = DueQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const cards = await loadDueCards(supabase, context.locals.user.id, deckId, parsed.data.due_before);
    return Response.json({ cards });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load due cards";
    return Response.json({ error: message }, { status: 500 });
  }
};
