import type { ExpenseKey } from "@lib/notifications/expenseKeys";

/** A category whose current-month spend has exceeded its budget cap. */
export type ExceededBudget = {
  key: ExpenseKey;
  display: string;
  spent: number;
  limit: number;
};

/** In / Out / Net for the current month, plus a display label ("July 2026"). */
export type MonthSummary = {
  in: number;
  out: number;
  net: number;
  label: string;
};

/**
 * DB-backed snapshot for the Home hub, computed server-side. Connection health
 * is intentionally excluded — it needs live Plaid calls and loads client-side
 * (see ActionItems) so it never blocks first paint.
 */
export type HomeSummary = {
  accountCount: number;
  month: MonthSummary;
  pendingReports: number;
  exceededBudgets: ExceededBudget[];
};

/** A quick-launch tile linking to one of the deep pages. */
export type QuickLink = {
  label: string;
  description: string;
  href: string;
  icon: string;
};
