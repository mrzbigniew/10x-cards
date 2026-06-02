import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { SubmitRatingSchema } from "@/lib/schemas/review";
import { applyRating } from "@/lib/services/sr";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: deckId, cardId } = context.params;
  if (!deckId || !cardId) {
    return Response.json({ error: "Missing deck id or card id" }, { status: 400 });
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

  const parsed = SubmitRatingSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const sr = await applyRating(supabase, context.locals.user.id, cardId, deckId, parsed.data.rating, new Date());
    return Response.json({ sr });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to apply rating";
    return Response.json({ error: message }, { status: 500 });
  }
};
