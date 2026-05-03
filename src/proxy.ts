import middleware from "next-auth/middleware";

export const proxy = middleware;

export const config = {
  matcher: [
    // Exclude cronjobs, webhooks, and mobile-bearer-auth endpoints from NextAuth.
    // Mobile endpoints verify Supabase JWT bearer tokens themselves via
    // `requireMobileUser` — they have no NextAuth session cookie.
    {
      source:
        "/((?!api/cronjob|api/webhooks|api/mobile|api/push-tokens).*)",
    },
  ],
};
