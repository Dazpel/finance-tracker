"use client";

import { useMemo } from "react";
import { Transaction } from "@prisma/client";
import { DateRange } from "../DateRangePicker/DateRangePicker";
import FiftyThirtyTwentyCard from "./FiftyThirtyTwentyCard";
import OverBudgetDetails from "./OverBudgetDetails";
import { calculateFiftyThirtyTwenty } from "../../utils/insights";

interface BudgetAllocationTabProps {
  transactions: Transaction[];
  dateRange: DateRange | null;
}

export default function BudgetAllocationTab({
  transactions,
  dateRange,
}: BudgetAllocationTabProps) {
  const budgetSummary = useMemo(
    () => calculateFiftyThirtyTwenty(transactions),
    [transactions]
  );

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No transaction data available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* 50/30/20 Budget Overview */}
      <section>
        <FiftyThirtyTwentyCard summary={budgetSummary} dateRange={dateRange} />
      </section>

      {/* Over-budget Details */}
      <section>
        <OverBudgetDetails summary={budgetSummary} transactions={transactions} />
      </section>
    </div>
  );
}

