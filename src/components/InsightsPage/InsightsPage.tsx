"use client";

import React, { useState } from "react";
import { getTransactionsByDateRange } from "../../app/insights/actions";
import { Button, DateRangePicker, RangeValue } from "@heroui/react";
import { Transaction } from "@prisma/client";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { formatDate } from "../../app/insights/utils";
import CategoryInsightsTable from "../CategoryInsightsTable/CategoryInsightsTable";
import PieChart from "../PieChart/PieChart";
import { useToast } from "../../hooks/useToast";

interface InsightsPageProps {
  years: number;
}

export default function InsightsPage({ years }: InsightsPageProps) {
  const [selectedDates, setSelectedDates] = useState<RangeValue<Date>>();
  const [isLoaded, setIsLoaded] = useState(false);
  const [transactions, setTransactions] = useState<Array<Transaction>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { errorToast } = useToast();

  // Handle getting insights based on selected date range
  const handleGetInsights = async () => {
    if (!selectedDates?.start || !selectedDates?.end) {
      errorToast("Please select a date range");
      return;
    }

    setIsLoading(true);
    try {
      const result = await getTransactionsByDateRange({
        start: formatDate(selectedDates.start),
        end: formatDate(selectedDates.end),
      });

      if (result.success && result.data) {
        setTransactions(result.data);
        setIsLoaded(true);
      } else {
        errorToast(result.error || "Failed to fetch transactions");
      }
    } catch (error) {
      console.error("Error fetching insights:", error);
      errorToast("An error occurred while fetching insights");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Insights</h1>

      {/* Date Range Selection and Get Insights Button */}
      <div className="mb-6 flex flex-col align-left gap-4">
        <DateRangePicker
          className="max-w-xs"
          label="Select dates"
          labelPlacement="outside"
          showMonthAndYearPickers
          maxValue={today(getLocalTimeZone())}
          minValue={parseDate(`${years}-01-01`)}
          onChange={(value) => {
            value && setSelectedDates(value);
          }}
        />
        <Button
          onPress={handleGetInsights}
          isDisabled={isLoading || !selectedDates?.start || !selectedDates?.end}
          color="primary"
          className="w-fit"
          isLoading={isLoading}
        >
          Get Insights
        </Button>
      </div>

      {/* Show insights only after user clicks "Get Insights" */}
      {isLoaded && (
        <>
          {/* Pie Chart */}
          <section className="mb-8">
            <PieChart transactions={transactions} />
          </section>

          {/* Category Insights Table */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Category Insights</h2>
            <CategoryInsightsTable transactions={transactions} />
          </section>
        </>
      )}

      {/* Initial state message */}
      {!isLoaded && (
        <div className="text-center py-12 text-gray-500">
          <p>
            Select a date range and click "Get Insights" to view your financial
            data.
          </p>
        </div>
      )}
    </div>
  );
}
