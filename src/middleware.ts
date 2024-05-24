export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    // Exclude the bi-weekly report cronjob from being authenticated
    {
      source: "/((?!api/cronjob/biweek-report).*)",
    },
  ],
};
