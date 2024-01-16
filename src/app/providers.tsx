"use client";

import { Layout } from "@components/layout/layout";
import { NextUIProvider } from "@nextui-org/react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ThemeProviderProps } from "next-themes/dist/types";

interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
  session: any;
}

export function Providers({ children, themeProps, session }: ProvidersProps) {
  return (
    <NextUIProvider className="font-mono">
      <NextThemesProvider {...themeProps}>
        <SessionProvider session={session}>
          <Layout>{children}</Layout>
        </SessionProvider>
      </NextThemesProvider>
    </NextUIProvider>
  );
}
