import prisma from "@lib/prisma/prismaClient";
import { Prisma, ReportStatus, ReportType, type SyncedTransaction } from "@generated/prisma/client";
import {
  mapPlaidCategoryToDefaultCategory,
  mapDefaultCategoryToCustomCategory,
} from "utils/functions";
import { flipExpiredDraftsForUser } from "./flipExpiredDrafts";

export type DraftMonth = { month: number; year: number };

// 7 days into the next month. A pending->posted transition straddling the
// month boundary must have time to settle in the prior month's draft.
export const GRACE_WINDOW_DAYS = 7;

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

// Per-category + summary fields written to the Report row. Shared by both
// the draft path (computeReportTotals) and the frozen path
// (recomputeFrozenReportTotals) so a new category lands here once.
export type Totals = {
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
  charity: number;
  expenses: number;
  total: number;
};

export const emptyTotals = (): Totals => ({
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
  charity: 0,
  expenses: 0,
  total: 0,
});

// Canonical form = Title Case keys exactly as `mapDefaultCategoryToCustomCategory`
// returns and as `categoryToReportKey` expects. UI lowercase values, raw Plaid
// strings, and any historical overrides all flow through `normalizeCategory`
// so totals/comparisons agree on a single representation.
const CATEGORY_CANONICAL: Record<string, string> = {
  "food & drink": "Food & Drink",
  "bills & utilities": "Bills & Utilities",
  "car": "Car",
  "entertainment": "Entertainment",
  "groceries": "Groceries",
  "health & wellness": "Health & Wellness",
  "personal": "Personal",
  "charity": "Charity",
  "shopping": "Shopping",
  "fees & adjustments": "Fees & Adjustments",
  "others": "Others",
  "revenue": "Revenue",
};

export function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return "Others";
  const key = raw.replace(/\s+and\s+/gi, " & ").trim().toLowerCase();
  return CATEGORY_CANONICAL[key] ?? "Others";
}

export const categoryToReportKey = (category: string): keyof Totals => {
  switch (normalizeCategory(category)) {
    case "Food & Drink":       return "foodAndDrink";
    case "Bills & Utilities":  return "billsAndUtilities";
    case "Car":                return "car";
    case "Entertainment":      return "entertainment";
    case "Groceries":          return "groceries";
    case "Health & Wellness":  return "healthAndWellness";
    case "Personal":           return "personal";
    case "Charity":            return "charity";
    case "Shopping":           return "shopping";
    case "Fees & Adjustments": return "feesAndAdjustments";
    case "Revenue":            return "revenue";
    default:                   return "others";
  }
};

export const resolveCategory = (
  t: Pick<
    SyncedTransaction,
    "category" | "merchant_name" | "name" | "userCategoryOverride"
  >
): string => {
  if (t.userCategoryOverride) return normalizeCategory(t.userCategoryOverride);
  const rawCategory = t.category?.[0]?.replace("and", "&") ?? "Others";
  const mapped = mapPlaidCategoryToDefaultCategory(rawCategory);
  const description = t.name?.trim() ? t.name : (t.merchant_name ?? "");
  return normalizeCategory(mapDefaultCategoryToCustomCategory(description, mapped));
};

// Returns the user-corrected amount when set (e.g., after a partial Venmo
// reimbursement); otherwise the raw Plaid amount. Stored values follow
// Plaid's row-level convention — expenses positive, revenue negative — and
// `userAmountOverride` rides the same convention. Report-level aggregation
// in `computeReportTotals` flips signs for the `expenses` field and uses
// `Math.abs` for `revenue`; see the note on that function. The edit UI
// sign-flips on display and re-flips on submit, so the round trip is
// invariant.
export const resolveAmount = (
  t: Pick<SyncedTransaction, "amount" | "userAmountOverride">
): number => t.userAmountOverride ?? t.amount;

// Computes `expenses` and `total` from already-accumulated per-category sums.
// Sign convention: per-category fields positive (raw expense rows are positive
// per Plaid), expenses = -sum(per-category), total = revenue + expenses.
// Shared between the draft path and the frozen recompute so the math agrees.
export function finalizeReportTotals(totals: Totals): Totals {
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
    totals.charity;

  totals.expenses = -Number(expenseSum.toFixed(2));
  totals.total = Number((totals.revenue + totals.expenses).toFixed(2));

  return totals;
}

// Pure. Sums per-category totals. Skips userSoftDeleted rows. Respects userCategoryOverride.
// Sign convention (matches TransactionsPage + mergeReports + createAnnualReport):
// revenue positive, per-category fields positive, expenses negative, total = revenue + expenses.
export function computeReportTotals(transactions: SyncedTransaction[]): Totals {
  const totals = emptyTotals();

  for (const t of transactions) {
    if (t.userSoftDeleted) continue;
    const cat = resolveCategory(t);
    const key = categoryToReportKey(cat);
    const amount = resolveAmount(t);

    if (key === "revenue") {
      totals.revenue += Math.abs(amount);
    } else {
      totals[key] += amount;
    }
  }

  return finalizeReportTotals(totals);
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export const monthDateRange = (target: DraftMonth) => {
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
  await flipExpiredDraftsForUser(userId, now);

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
      try {
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
      } catch (e) {
        // Concurrent sync for the same user (e.g. multiple Plaid accounts)
        // can race past findFirst and both call create, hitting the partial
        // unique index on (userId, year, month, reportType). Recover by
        // re-fetching the row the other call created and updating it.
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          const raced = await prisma.report.findFirst({
            where: {
              userId,
              year: target.year,
              month: target.month,
              reportType: ReportType.MONTHLY,
              autoMaintainedAt: { not: null },
            },
          });
          if (raced) {
            await prisma.report.update({
              where: { id: raced.id },
              data: {
                ...totals,
                status: ReportStatus.DRAFT,
                autoMaintainedAt: now,
              },
            });
            continue;
          }
        }
        throw e;
      }
    }
  }
}
