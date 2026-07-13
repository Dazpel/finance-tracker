"use client";

import React from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader, Chip, Skeleton } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import {
  formatDateTime,
  getStatusChipInfo,
  isConsentExpiringSoon,
} from "@lib/plaid/status/helpers";
import type { ItemStatusResponse } from "@lib/plaid/status/types";
import { appRoutes } from "utils/constants";
import type { ExceededBudget } from "./types";

type ActionItemsProps = {
  pendingReports: number;
  exceededBudgets: ExceededBudget[];
};

type Tone = "danger" | "warning";

type ActionRow = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  href: string;
  tone: Tone;
};

export const ActionItems = ({ pendingReports, exceededBudgets }: ActionItemsProps) => {
  const {
    data: health,
    isLoading: healthLoading,
    isError: healthError,
  } = useQuery<ItemStatusResponse>({
    queryKey: ["home", "connection-health"],
    queryFn: async () => {
      const res = await fetch("/api/plaid/itemStatus");
      if (!res.ok) throw new Error("Failed to load connection status");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Server-known rows (available on first paint, no waiting on Plaid).
  const serverRows: ActionRow[] = [];

  if (pendingReports > 0) {
    serverRows.push({
      id: "pending-reports",
      icon: "📄",
      title: `${pendingReports} report${pendingReports > 1 ? "s" : ""} awaiting approval`,
      subtitle: "Review and approve to keep your history current",
      href: appRoutes.REPORTS_PAGE,
      tone: "warning",
    });
  }

  if (exceededBudgets.length > 0) {
    serverRows.push({
      id: "exceeded-budgets",
      icon: "📈",
      title: `${exceededBudgets.length} budget${exceededBudgets.length > 1 ? "s" : ""} exceeded`,
      subtitle: exceededBudgets.map((b) => b.display).join(", "),
      href: appRoutes.THRESHOLDS_PAGE,
      tone: "danger",
    });
  }

  // Connection-health rows (only once the live Plaid check resolves). A
  // connection needs attention when its status chip is non-success OR its
  // consent is expiring soon — the same signals the Plaid status page surfaces,
  // so Home never says "all caught up" while that page shows a warning. The
  // title names the actual remedy available at the destination: reconnect / renew
  // go through update-mode Link, while a failed refresh is fixed by "Sync now".
  const healthRows: ActionRow[] = (health?.items ?? [])
    .map((item): ActionRow | null => {
      const chip = getStatusChipInfo(item);
      const consentExpiring = isConsentExpiringSoon(item.consentExpirationTime);
      if (chip.color === "success" && !consentExpiring) return null;

      let title: string;
      let subtitle: string;
      let tone: Tone;

      if (chip.color === "danger") {
        title = `Reconnect ${item.institutionName}`;
        subtitle = chip.message ?? "This connection needs to be reconnected";
        tone = "danger";
      } else if (chip.color === "warning") {
        // Refresh-failed — resolved by "Sync now", not by reconnecting.
        title = `Re-sync ${item.institutionName}`;
        subtitle = chip.message ?? "The last transaction refresh failed";
        tone = "warning";
      } else {
        // Healthy but consent expiring — renew via update-mode reconnect.
        title = `Renew connection to ${item.institutionName}`;
        subtitle = `Consent expires ${formatDateTime(item.consentExpirationTime)}`;
        tone = "warning";
      }

      return {
        id: `conn-${item.plaidAccountId}`,
        icon: "🔌",
        title,
        subtitle,
        href: appRoutes.PLAID_STATUS_PAGE,
        tone,
      };
    })
    .filter((row): row is ActionRow => row !== null);

  const rows = [...healthRows, ...serverRows];
  const caughtUp = rows.length === 0 && !healthLoading && !healthError;

  return (
    <Card shadow="sm">
      <CardHeader className="flex items-center justify-between pb-0">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-default-500">
          Action items
        </h2>
        {rows.length > 0 && (
          <span className="text-xs text-default-500">
            {rows.length} need{rows.length > 1 ? "" : "s"} attention
          </span>
        )}
      </CardHeader>
      <CardBody className="gap-2">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={row.href}
            className="flex items-center gap-3 rounded-medium border border-default-200 p-3 transition-colors hover:bg-default-100"
          >
            <span className="text-lg" aria-hidden="true">
              {row.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.title}</p>
              <p className="truncate text-xs text-default-500">{row.subtitle}</p>
            </div>
            <Chip size="sm" color={row.tone} variant="flat">
              Fix
            </Chip>
          </Link>
        ))}

        {healthLoading && (
          <div className="flex items-center gap-3 rounded-medium border border-default-200 p-3">
            <Skeleton className="h-8 w-8 rounded-medium" />
            <div className="flex flex-1 flex-col gap-1">
              <Skeleton className="h-3 w-2/5 rounded" />
              <Skeleton className="h-3 w-3/5 rounded" />
            </div>
          </div>
        )}

        {healthError && (
          <div className="flex items-center gap-3 rounded-medium border border-default-200 p-3 text-sm text-default-500">
            Couldn't check your bank connections right now — try refreshing the page.
          </div>
        )}

        {caughtUp && (
          <div className="flex items-center gap-2 py-2 text-sm text-default-500">
            <span aria-hidden="true">🎉</span> You're all caught up — nothing needs your attention.
          </div>
        )}
      </CardBody>
    </Card>
  );
};
