import type { Prisma } from "@prisma/client";
import prismaClient from "@lib/prisma/prismaClient";
import {
  emptyTotals,
  categoryToReportKey,
  finalizeReportTotals,
} from "@lib/reports/draftReport";

type PrismaLike = Prisma.TransactionClient | typeof prismaClient;

// Sums the frozen Transaction[] rows under reportId and writes per-category +
// expenses + total fields back to the Report row. Frozen reports use
// Transaction.category[0] (no override field; the override was collapsed in
// at approval time) and Transaction.amount directly. Per-category accumulation
// + finalize math is shared with the draft path via @lib/reports/draftReport
// so the two never drift.
export async function recomputeFrozenReportTotals(
  reportId: number,
  client: PrismaLike = prismaClient
): Promise<void> {
  const rows = await client.transaction.findMany({
    where: { reportId },
    select: { amount: true, category: true },
  });

  const totals = emptyTotals();
  for (const t of rows) {
    const key = categoryToReportKey(t.category?.[0] ?? "Others");
    if (key === "revenue") {
      totals.revenue += Math.abs(t.amount);
    } else {
      totals[key] += t.amount;
    }
  }

  finalizeReportTotals(totals);

  await client.report.update({
    where: { id: reportId },
    data: {
      foodAndDrink: totals.foodAndDrink,
      billsAndUtilities: totals.billsAndUtilities,
      car: totals.car,
      entertainment: totals.entertainment,
      groceries: totals.groceries,
      healthAndWellness: totals.healthAndWellness,
      personal: totals.personal,
      shopping: totals.shopping,
      feesAndAdjustments: totals.feesAndAdjustments,
      others: totals.others,
      foster: totals.foster,
      revenue: totals.revenue,
      expenses: totals.expenses,
      total: totals.total,
    },
  });
}
