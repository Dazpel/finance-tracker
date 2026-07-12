import {
  EXPENSE_KEYS,
  EXPENSE_KEY_TO_DISPLAY,
  levelsCrossed,
  type ExpenseKey,
} from "@lib/notifications/expenseKeys";
import type { ExceededBudget, MonthSummary } from "./types";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * First token of a display name, trimmed. Returns null when there is no usable
 * name so the greeting can fall back to a plain "Welcome back".
 */
export const getFirstName = (name: string | null | undefined): string | null => {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
};

/** Whole-dollar currency, e.g. 1260.5 → "$1,261", -1260 → "-$1,260". */
export const formatMoney = (amount: number): string => moneyFormatter.format(amount);

/**
 * Maps a monthly report's stored totals to the In / Out / Net the hub shows.
 *
 * Reports store `expenses` as a NEGATIVE total and `total = revenue + expenses`
 * (see `lib/reports/draftReport.finalizeReportTotals`). "Out" is a spend
 * magnitude, so it takes the absolute value; "Net" keeps the signed total.
 */
export const buildMonthSummary = (
  report: { revenue: number; expenses: number; total: number } | null,
  label: string
): MonthSummary => ({
  in: report?.revenue ?? 0,
  out: Math.abs(report?.expenses ?? 0),
  net: report?.total ?? 0,
  label,
});

/**
 * Per-category budgets whose current-month spend strictly exceeds a positive
 * cap. Reuses the same EXCEEDED rule as threshold notifications
 * (`levelsCrossed`) so Home and alerts never disagree. Missing columns count as
 * zero spend / no cap.
 */
export const computeExceededBudgets = (
  report: Partial<Record<ExpenseKey, number>>,
  thresholds: Partial<Record<ExpenseKey, number>>
): ExceededBudget[] => {
  const exceeded: ExceededBudget[] = [];
  for (const key of EXPENSE_KEYS) {
    const spent = report[key] ?? 0;
    const limit = thresholds[key] ?? 0;
    if (levelsCrossed(spent, limit).includes("EXCEEDED")) {
      exceeded.push({ key, display: EXPENSE_KEY_TO_DISPLAY[key], spent, limit });
    }
  }
  return exceeded;
};
