import type { APIRoute } from "astro";
import { GenerateRequestSchema } from "@/lib/schemas/generation";
import { generateProposals, GenerationError } from "@/lib/services/generation";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const proposals = await generateProposals(parsed.data.text);
    return Response.json({ proposals });
  } catch (err) {
    if (err instanceof GenerationError) {
      return Response.json({ error: err.message }, { status: 500 });
    }
    return Response.json({ error: "Unexpected error" }, { status: 500 });
  }
};
