import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { UpdateCardSchema } from "@/lib/schemas/cards";
import { updateCard, deleteCard } from "@/lib/services/cards";

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
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

  const parsed = UpdateCardSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    await updateCard(
      supabase,
      context.locals.user.id,
      cardId,
      parsed.data.front,
      parsed.data.back,
      parsed.data.resetSR,
    );
    return Response.json({});
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update card";
    return Response.json({ error: message }, { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
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

  try {
    await deleteCard(supabase, context.locals.user.id, cardId);
    return Response.json({});
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete card";
    return Response.json({ error: message }, { status: 500 });
  }
};
