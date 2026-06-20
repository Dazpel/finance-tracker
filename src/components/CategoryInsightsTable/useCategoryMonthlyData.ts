import { useMemo } from "react";
import { 
  UseCategoryMonthlyDataProps, 
  CategoryMonthlyDataResult 
} from "./types";
import { Transaction } from "@generated/prisma/browser";

export const useCategoryMonthlyData = ({
  transactions,
  selectedCategory,
  dateRange,
}: UseCategoryMonthlyDataProps): CategoryMonthlyDataResult => {
  const monthlyData = useMemo(() => {
    if (!selectedCategory || transactions.length === 0) {
      return [];
    }

    // Filter transactions for the selected category
    const categoryTransactions = transactions.filter((transaction) =>
      transaction.category.some((cat) => cat.toLowerCase() === selectedCategory.toLowerCase())
    );

    if (categoryTransactions.length === 0) {
      return [];
    }

    // Group transactions by month
    const monthlyGroups: { [key: string]: Array<Transaction> } = {};

    categoryTransactions.forEach((transaction) => {
      const date = new Date(transaction.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      
      if (!monthlyGroups[monthKey]) {
        monthlyGroups[monthKey] = [];
      }
      monthlyGroups[monthKey].push(transaction);
    });

    // Convert to array and sort by month
    const sortedMonths = Object.keys(monthlyGroups).sort();
    
    return sortedMonths.map((monthKey) => {
      const monthTransactions = monthlyGroups[monthKey];
      const totalAmount = monthTransactions.reduce(
        (sum, transaction) => sum + Math.abs(transaction.amount),
        0
      );

      // Format month for display
      const [year, month] = monthKey.split("-");
      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];
      const monthName = monthNames[parseInt(month) - 1];
      const displayMonth = `${monthName} ${year}`;

      return {
        month: displayMonth,
        amount: totalAmount,
        transactionCount: monthTransactions.length,
      };
    });
  }, [transactions, selectedCategory, dateRange]);

  const totalAmount = useMemo(() => 
    monthlyData.reduce((sum, d) => sum + d.amount, 0), 
    [monthlyData]
  );

  const totalTransactions = useMemo(() => 
    monthlyData.reduce((sum, d) => sum + d.transactionCount, 0), 
    [monthlyData]
  );

  const monthsWithActivity = useMemo(() => monthlyData.length, [monthlyData]);

  return {
    monthlyData,
    totalAmount,
    totalTransactions,
    monthsWithActivity,
  };
}; 