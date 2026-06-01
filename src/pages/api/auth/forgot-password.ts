import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    const redirectTo = new URL("/auth/reset-password", context.request.url).href;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  }

  return context.redirect("/auth/forgot-password-sent");
};
