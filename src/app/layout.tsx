import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react"
import { Roboto_Flex } from "next/font/google";
import { Providers } from "./providers";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import { isUserAuthorized } from "@lib/prisma/prismaFunctions";
import prisma from "@lib/prisma/prismaClient";
import Unauthorized from "@components/Unauthorized/Unauthorized";
import PageLoader from "@components/PageLoader/PageLoader";
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

async function AuthGate({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(options);

  if (!session?.user?.email) {
    return <Unauthorized />;
  }

  const res = await isUserAuthorized(prisma, session.user.email);

  if (!res.data) {
    return <Unauthorized />;
  }

  return (
    <Providers
      session={session}
      themeProps={{ attribute: "class", defaultTheme: "dark" }}
    >
      {children}
    </Providers>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning dir="ltr" lang="en">
      <body className={`${roboto.variable}`} suppressHydrationWarning>
        <Suspense fallback={<PageLoader />}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
