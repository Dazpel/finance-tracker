import { Transaction } from "@prisma/client";
import {
  fiftyThirtyTwentyCategories,
  fiftyThirtyTwentyTargets,
} from "./constants";

export interface FiftyThirtyTwentySummary {
  revenue: number;
  expenses: number;
  needs: number;
  wants: number;
  savings: number;
  needsPercent: number;
  wantsPercent: number;
  savingsPercent: number;
}

const normalizeCategory = (category: string) => category.toLowerCase();

const matchesCategoryList = (categories: string[], list: string[]) =>
  categories.some((category) => list.includes(category));

export const calculateFiftyThirtyTwenty = (
  transactions: Array<Transaction> = []
): FiftyThirtyTwentySummary => {
  const summary = transactions.reduce(
    (acc, transaction) => {
      const amount = Math.abs(transaction.amount);

      if (amount === 0) {
        return acc;
      }

      const categories = (transaction.category || []).map(normalizeCategory);
      const isRevenue = categories.includes("revenue");

      if (isRevenue) {
        acc.revenue += amount;
        return acc;
      }

      acc.expenses += amount;

      if (matchesCategoryList(categories, fiftyThirtyTwentyCategories.needs)) {
        acc.needs += amount;
        return acc;
      }

      if (matchesCategoryList(categories, fiftyThirtyTwentyCategories.wants)) {
        acc.wants += amount;
        return acc;
      }

      acc.wants += amount;
      return acc;
    },
    {
      revenue: 0,
      expenses: 0,
      needs: 0,
      wants: 0,
    }
  );

  const savings = summary.revenue - summary.expenses;
  const denominator = summary.revenue > 0 ? summary.revenue : 0;

  return {
    ...summary,
    savings,
    needsPercent: denominator ? (summary.needs / denominator) * 100 : 0,
    wantsPercent: denominator ? (summary.wants / denominator) * 100 : 0,
    savingsPercent: denominator ? (savings / denominator) * 100 : 0,
  };
};

export { fiftyThirtyTwentyTargets };

