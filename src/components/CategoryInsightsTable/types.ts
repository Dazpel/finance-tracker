import { Transaction } from "@prisma/client";

export interface MonthlyData {
  month: string;
  amount: number;
  transactionCount: number;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface CategoryMonthlyChartProps {
  transactions: Array<Transaction>;
  selectedCategory: string;
  dateRange: DateRange;
}

export interface UseCategoryMonthlyDataProps {
  transactions: Array<Transaction>;
  selectedCategory: string;
  dateRange: DateRange;
}

export interface CategoryMonthlyDataResult {
  monthlyData: Array<MonthlyData>;
  totalAmount: number;
  totalTransactions: number;
  monthsWithActivity: number;
}