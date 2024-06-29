export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    // Exclude cronjobs from being authenticated
    {
      source: "/((?!api/cronjob).*)",
    },
  ],
};
