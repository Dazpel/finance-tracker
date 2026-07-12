import "server-only";
import prisma from "@lib/prisma/prismaClient";
import type { ExpenseKey } from "@lib/notifications/expenseKeys";
import { buildMonthSummary, computeExceededBudgets } from "./helpers";
import type { HomeSummary } from "./types";

/**
 * DB-backed Home summary for one user. All queries are scoped by `userId`.
 * Connection health is deliberately NOT fetched here — it needs live Plaid
 * calls and is loaded client-side so it can't block the server render.
 *
 * Mirrors the current-month source of truth used by threshold alerts and the
 * mobile report: the auto-maintained MONTHLY report for the current UTC month.
 */
export const getHomeSummary = async (userId: string): Promise<HomeSummary> => {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(now);

  const [accountCount, report, thresholds, pendingReports] = await Promise.all([
    prisma.plaidAccount.count({ where: { userId } }),
    prisma.report.findFirst({
      where: {
        userId,
        month,
        year,
        reportType: "MONTHLY",
        autoMaintainedAt: { not: null },
      },
    }),
    prisma.expenseThreshold.findUnique({ where: { userId } }),
    // Only PENDING_APPROVAL is actionable: approveReport rejects DRAFT reports
    // still in the 7-day grace window, so surfacing them would offer a fix the
    // user cannot complete.
    prisma.report.count({
      where: { userId, status: "PENDING_APPROVAL" },
    }),
  ]);

  const exceededBudgets =
    report && thresholds
      ? computeExceededBudgets(
          report as unknown as Record<ExpenseKey, number>,
          thresholds as unknown as Record<ExpenseKey, number>
        )
      : [];

  return {
    accountCount,
    month: buildMonthSummary(report, label),
    pendingReports,
    exceededBudgets,
  };
};
