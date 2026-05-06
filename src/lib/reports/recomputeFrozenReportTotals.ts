import prisma from "@lib/prisma/prismaClient";
import { normalizeCategory } from "@lib/reports/draftReport";

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
  switch (normalizeCategory(category)) {
    case "Food & Drink":       return "foodAndDrink";
    case "Bills & Utilities":  return "billsAndUtilities";
    case "Car":                return "car";
    case "Entertainment":      return "entertainment";
    case "Groceries":          return "groceries";
    case "Health & Wellness":  return "healthAndWellness";
    case "Personal":           return "personal";
    case "Foster":             return "foster";
    case "Shopping":           return "shopping";
    case "Fees & Adjustments": return "feesAndAdjustments";
    case "Revenue":            return "revenue";
    default:                   return "others";
  }
};

// Sums the frozen Transaction[] rows under reportId and writes per-category +
// expenses + total fields back to the Report row. Mirrors computeReportTotals
// in draftReport.ts so the math agrees:
//   - revenue accumulates Math.abs(amount)
//   - expense categories accumulate raw amount
//   - expenses = -Number(expenseSum.toFixed(2))
//   - total = revenue + expenses
//
// Frozen reports use Transaction.category[0] (no override field; the override
// was collapsed in at approval time) and Transaction.amount directly.
export async function recomputeFrozenReportTotals(reportId: number): Promise<void> {
  const rows = await prisma.transaction.findMany({
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

  await prisma.report.update({
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
