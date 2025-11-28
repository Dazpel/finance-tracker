"use client";

import { Transaction } from "@prisma/client";
import PieChart from "../PieChart/PieChart";
import CategoryInsightsTable from "../CategoryInsightsTable/CategoryInsightsTable";
import { DateRange } from "../DateRangePicker/DateRangePicker";

interface CategoryDistributionTabProps {
  transactions: Transaction[];
  dateRange: DateRange | null;
}

export default function CategoryDistributionTab({
  transactions,
  dateRange,
}: CategoryDistributionTabProps) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No transaction data available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Pie Chart */}
      <section>
        <PieChart transactions={transactions} />
      </section>

      {/* Category Insights Table */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Category Insights</h2>
        <CategoryInsightsTable
          transactions={transactions}
          dateRange={
            dateRange
              ? {
                  startDate: dateRange.startDate,
                  endDate: dateRange.endDate,
                }
              : undefined
          }
        />
      </section>
    </div>
  );
}

