import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { AddCardSchema } from "@/lib/schemas/cards";
import { addCard } from "@/lib/services/cards";

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

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AddCardSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const result = await addCard(supabase, context.locals.user.id, deckId, parsed.data.front, parsed.data.back);
    return Response.json({ id: result.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add card";
    return Response.json({ error: message }, { status: 500 });
  }
};
