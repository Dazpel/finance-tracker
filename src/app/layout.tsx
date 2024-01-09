import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Roboto_Flex } from "next/font/google";
import { Providers } from "./providers";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Tracker",
  description: "Finance Tracker",
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
  return (
    <html suppressHydrationWarning dir="ltr" lang="en">
      <head />
      <body className={`${roboto.variable}`}>
        <Providers
          session={session}
          themeProps={{ attribute: "class", defaultTheme: "dark" }}
        >
          {children}
        </Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
