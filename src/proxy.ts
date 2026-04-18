import middleware from "next-auth/middleware";

export const proxy = middleware;

export const config = {
  matcher: [
    // Exclude cronjobs and webhooks from being authenticated
    {
      source: "/((?!api/cronjob|api/webhooks).*)",
    },
  ],
};
