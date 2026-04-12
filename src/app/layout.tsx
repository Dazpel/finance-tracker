import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react"
import { Roboto_Flex } from "next/font/google";
import { Providers } from "./providers";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import { isUserAuthorized } from "@lib/prisma/prismaFunctions";
import prisma from "@lib/prisma/prismaClient";
import Unauthorized from "@components/Unauthorized/Unauthorized";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoneyEye",
  description: "MoneyEye",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

const roboto = Roboto_Flex({
  subsets: ["latin"],
  display: "swap",
  weight: ["100", "300", "400", "500", "700"],
  variable: "--font-roboto",
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(options);
  const res = await isUserAuthorized(prisma, session.user.email);

  return (
    <html suppressHydrationWarning dir="ltr" lang="en">
      <head>
        <Script
          src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className={`${roboto.variable}`} suppressHydrationWarning>
        {res.data ? (
          <Providers
            session={session}
            themeProps={{ attribute: "class", defaultTheme: "dark" }}
          >
            {children}
          </Providers>
        ) : (
          <Unauthorized />
        )}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
