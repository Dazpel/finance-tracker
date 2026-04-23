import prisma from "@lib/prisma/prismaClient";
import { ReportStatus, ReportType, type SyncedTransaction } from "@prisma/client";
import {
  mapPlaidCategoryToDefaultCategory,
  mapDefaultCategoryToCustomCategory,
} from "utils/functions";

export type DraftMonth = { month: number; year: number };

// 7 days into the next month. A pending->posted transition straddling the
// month boundary must have time to settle in the prior month's draft.
const GRACE_WINDOW_DAYS = 7;

export function getEligibleDraftMonths(now: Date): DraftMonth[] {
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();
  const out: DraftMonth[] = [{ month: currentMonth, year: currentYear }];

  const startOfCurrentMonth = Date.UTC(currentYear, currentMonth - 1, 1);
  const graceExpiresAt =
    startOfCurrentMonth + GRACE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  if (now.getTime() < graceExpiresAt) {
    const prev = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
    out.push({
      month: prev.getUTCMonth() + 1,
      year: prev.getUTCFullYear(),
    });
  }

  return out;
}

export function isMonthFullyPast(target: DraftMonth, now: Date): boolean {
  const startOfNextMonth = Date.UTC(target.year, target.month, 1);
  return now.getTime() >= startOfNextMonth;
}

export function isGraceExpired(target: DraftMonth, now: Date): boolean {
  const startOfMonthAfterTarget = Date.UTC(target.year, target.month, 1);
  const graceExpiresAt =
    startOfMonthAfterTarget + GRACE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() >= graceExpiresAt;
}

type Totals = {
  foodAndDrink: number;
  billsAndUtilities: number;
  car: number;
  entertainment: number;
  groceries: number;
  healthAndWellness: number;
  personal: number;
  shopping: number;
  feesAndAdjustments: number;
  others: number;
  revenue: number;
  foster: number;
  expenses: number;
  total: number;
};

const emptyTotals = (): Totals => ({
  foodAndDrink: 0,
  billsAndUtilities: 0,
  car: 0,
  entertainment: 0,
  groceries: 0,
  healthAndWellness: 0,
  personal: 0,
  shopping: 0,
  feesAndAdjustments: 0,
  others: 0,
  revenue: 0,
  foster: 0,
  expenses: 0,
  total: 0,
});

const categoryToReportKey = (category: string): keyof Totals => {
  switch (category) {
    case "Food & Drink":       return "foodAndDrink";
    case "Bills & Utilities":  return "billsAndUtilities";
    case "Car":                return "car";
    case "Entertainment":      return "entertainment";
    case "Groceries":          return "groceries";
    case "Health & Wellness":  return "healthAndWellness";
    case "Personal":           return "personal";
    case "Shopping":           return "shopping";
    case "Fees & Adjustments": return "feesAndAdjustments";
    case "Revenue":            return "revenue";
    case "Foster":             return "foster";
    default:                   return "others";
  }
};

export const resolveCategory = (
  t: Pick<
    SyncedTransaction,
    "category" | "merchant_name" | "name" | "userCategoryOverride"
  >
): string => {
  if (t.userCategoryOverride) return t.userCategoryOverride;
  const rawCategory = t.category?.[0]?.replace("and", "&") ?? "Others";
  const mapped = mapPlaidCategoryToDefaultCategory(rawCategory);
  const description = t.merchant_name ?? t.name ?? "";
  return mapDefaultCategoryToCustomCategory(description, mapped);
};

// Pure. Sums per-category totals. Skips userSoftDeleted rows. Respects userCategoryOverride.
// Sign convention (matches TransactionsPage + mergeReports + createAnnualReport):
// revenue positive, per-category fields positive, expenses negative, total = revenue + expenses.
export function computeReportTotals(transactions: SyncedTransaction[]): Totals {
  const totals = emptyTotals();

  for (const t of transactions) {
    if (t.userSoftDeleted) continue;
    const cat = resolveCategory(t);
    const key = categoryToReportKey(cat);

    if (key === "revenue") {
      totals.revenue += Math.abs(t.amount);
    } else {
      totals[key] += t.amount;
    }
  }

  const expenseSum =
    totals.foodAndDrink +
    totals.billsAndUtilities +
    totals.car +
    totals.entertainment +
    totals.groceries +
    totals.healthAndWellness +
    totals.personal +
    totals.shopping +
    totals.feesAndAdjustments +
    totals.others +
    totals.foster;

  totals.expenses = -Number(expenseSum.toFixed(2));
  totals.total = Number((totals.revenue + totals.expenses).toFixed(2));

  return totals;
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

const monthDateRange = (target: DraftMonth) => {
  const start = `${target.year}-${pad2(target.month)}-01`;
  const nextMonthStartDate = new Date(Date.UTC(target.year, target.month, 1));
  const end =
    `${nextMonthStartDate.getUTCFullYear()}-` +
    `${pad2(nextMonthStartDate.getUTCMonth() + 1)}-01`;
  return { gte: start, lt: end };
};

const defaultReportName = (target: DraftMonth) => {
  const d = new Date(Date.UTC(target.year, target.month - 1, 1));
  const monthName = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${monthName} ${target.year}`;
};

// Idempotent. Called after every Plaid sync.
// For each eligible month:
//  - APPROVED or PENDING_APPROVAL existing row → skip.
//  - Grace expired with a DRAFT → flip to PENDING_APPROVAL, no recompute.
//  - Otherwise → full recompute from SyncedTransaction and upsert the DRAFT row.
export async function upsertCurrentMonthDraftReport(
  userId: string,
  now: Date = new Date()
): Promise<void> {
  const months = getEligibleDraftMonths(now);

  for (const target of months) {
    // Partial unique index (WHERE "autoMaintainedAt" IS NOT NULL) scopes uniqueness
    // to auto-drafts only, so findFirst + autoMaintainedAt filter is the correct lookup.
    // Legacy/manual reports for the same month are intentionally invisible here.
    const existing = await prisma.report.findFirst({
      where: {
        userId,
        year: target.year,
        month: target.month,
        reportType: ReportType.MONTHLY,
        autoMaintainedAt: { not: null },
      },
    });

    if (existing?.status === ReportStatus.APPROVED) continue;
    if (existing?.status === ReportStatus.PENDING_APPROVAL) continue;

    if (isGraceExpired(target, now)) {
      if (existing?.status === ReportStatus.DRAFT) {
        await prisma.report.update({
          where: { id: existing.id },
          data: { status: ReportStatus.PENDING_APPROVAL },
        });
      }
      continue;
    }

    const range = monthDateRange(target);
    const transactions = await prisma.syncedTransaction.findMany({
      where: { userId, date: range },
    });

    const totals = computeReportTotals(transactions);

    if (existing) {
      await prisma.report.update({
        where: { id: existing.id },
        data: {
          ...totals,
          status: ReportStatus.DRAFT,
          autoMaintainedAt: now,
        },
      });
    } else {
      await prisma.report.create({
        data: {
          userId,
          reportName: defaultReportName(target),
          reportType: ReportType.MONTHLY,
          status: ReportStatus.DRAFT,
          month: target.month,
          year: target.year,
          autoMaintainedAt: now,
          ...totals,
        },
      });
    }
  }
}
