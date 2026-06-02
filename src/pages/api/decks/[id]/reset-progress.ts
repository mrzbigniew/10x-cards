import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { resetDeckProgress } from "@/lib/services/cards";

export const prerender = false;

export const POST: APIRoute = async (context) => {
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

  try {
    await resetDeckProgress(supabase, context.locals.user.id, deckId);
    return Response.json({});
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reset deck progress";
    return Response.json({ error: message }, { status: 500 });
  }
};
