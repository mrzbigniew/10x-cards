import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    // TODO(deploy): add <production-domain>/auth/reset-password to Supabase Auth → URL Configuration → Redirect URLs
    // TODO(deploy): set Email OTP Expiration to 86400 s in Supabase Auth → Email settings
    const redirectTo = new URL("/auth/reset-password", context.request.url).href;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  }

  return context.redirect("/auth/forgot-password-sent");
};
