import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

// Routes accessible without authentication
const PUBLIC_ROUTES = [
  "/auth/signin",
  "/auth/signup",
  "/auth/confirm-email",
  "/auth/forgot-password",
  "/auth/forgot-password-sent",
  "/auth/reset-password",
];
const PUBLIC_API_ROUTES = ["/api/auth/"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const { pathname } = context.url;

  // Allow public API routes through without auth
  if (PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))) {
    return next();
  }

  // Require auth for all non-public pages
  if (!PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!context.locals.user) {
      // Return 401 for API calls, redirect to sign-in for page requests
      if (pathname.startsWith("/api/")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
