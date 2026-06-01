import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { RenameDeckSchema } from "@/lib/schemas/decks";
import { renameDeck, deleteDeck } from "@/lib/services/decks";
import { listCardsInDeck } from "@/lib/services/cards";

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

  try {
    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .select("id, name, created_at, updated_at")
      .eq("id", deckId)
      .eq("user_id", context.locals.user.id)
      .single();

    if (deckError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const cards = await listCardsInDeck(supabase, context.locals.user.id, deckId);
    return Response.json({ deck, cards });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch deck";
    return Response.json({ error: message }, { status: 500 });
  }
};

export const PATCH: APIRoute = async (context) => {
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

  const parsed = RenameDeckSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    await renameDeck(supabase, context.locals.user.id, deckId, parsed.data.name);
    return Response.json({});
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to rename deck";
    return Response.json({ error: message }, { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
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
    await deleteDeck(supabase, context.locals.user.id, deckId);
    return Response.json({});
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete deck";
    return Response.json({ error: message }, { status: 500 });
  }
};
