"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function useNavigateWithPending() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return { navigate, isPending };
}
