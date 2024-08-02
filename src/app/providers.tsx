"use client";

import { Layout } from "@components/layout/layout";
import { NextUIProvider } from "@nextui-org/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ThemeProviderProps } from "next-themes/dist/types";

interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
  session: any;
}

export function Providers({ children, themeProps, session }: ProvidersProps) {
  const queryClient = new QueryClient();
  return (
    <NextUIProvider className="font-mono">
      <NextThemesProvider {...themeProps}>
        <SessionProvider session={session}>
          <Layout>
            <QueryClientProvider client={queryClient}>
              {children}
            </QueryClientProvider>
          </Layout>
        </SessionProvider>
      </NextThemesProvider>
    </NextUIProvider>
  );
}
