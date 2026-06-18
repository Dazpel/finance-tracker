"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getTransactionsByDateRange,
  getTransactionsByReportId,
} from "../../app/insights/actions";
import { ReportType, Transaction } from "@prisma/client";
import DateRangePicker, { DateRange } from "../DateRangePicker/DateRangePicker";
import { useToast } from "../../hooks/useToast";
import { today, getLocalTimeZone, parseDate } from "@internationalized/date";
import { Tabs, Tab, Chip, Button } from "@heroui/react";
import CategoryDistributionTab from "./CategoryDistributionTab";
import BudgetAllocationTab from "./BudgetAllocationTab";

interface InsightsPageProps {
  years: number;
  initialReportId?: string;
  initialReportType?: ReportType;
}

type TabKey = "category" | "budget";

export default function InsightsPage({
  years,
  initialReportId,
  initialReportType,
}: InsightsPageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [transactions, setTransactions] = useState<Array<Transaction>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentDateRange, setCurrentDateRange] = useState<DateRange | null>(null);
  const [reportName, setReportName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("category");
  const { errorToast: errorToastFn } = useToast();
  
  // Track if we've already fetched for this reportId to prevent infinite loops
  const fetchedReportIdRef = useRef<string | null>(null);
  
  // Stable errorToast callback to avoid dependency issues
  const errorToast = useCallback(
    (message: string, title?: string) => {
      errorToastFn(message, title);
    },
    [errorToastFn]
  );

  // Auto-fetch if reportId is provided (only once per reportId)
  useEffect(() => {
    if (!initialReportId || !initialReportType) return;
    if (fetchedReportIdRef.current === initialReportId) return;

    const fetchByReportId = async () => {
      fetchedReportIdRef.current = initialReportId;
      setIsLoading(true);
      
      try {
        const result = await getTransactionsByReportId({
          reportId: initialReportId,
          reportType: initialReportType,
        });

        if (result.success && result.data) {
          setTransactions(result.data);
          setReportName(result.reportName || null);
          setIsLoaded(true);
        } else {
          errorToast(result.error || "Failed to fetch report insights");
        }
      } catch (error) {
        console.error("Error fetching report insights:", error);
        errorToast("An error occurred while fetching report insights");
      } finally {
        setIsLoading(false);
      }
    };

    fetchByReportId();
  }, [initialReportId, initialReportType, errorToast]);

  // Handle getting insights based on selected date range
  const handleGetInsights = async (dates: DateRange) => {
    setIsLoading(true);
    try {
      const result = await getTransactionsByDateRange({
        start: dates.startDate,
        end: dates.endDate,
      });

      if (result.success && result.data) {
        setTransactions(result.data);
        setCurrentDateRange(dates);
        setReportName(null); // Clear report name when using date range
        setIsLoaded(true);
      } else {
        errorToast(result.error || "Failed to fetch insights");
      }
    } catch (error) {
      console.error("Error fetching insights:", error);
      errorToast("An error occurred while fetching insights");
    } finally {
      setIsLoading(false);
    }
  };

  // Clear report-based data and allow custom date selection
  const handleClearReport = () => {
    setTransactions([]);
    setReportName(null);
    setCurrentDateRange(null);
    setIsLoaded(false);
  };

  // Derive effective date range for display
  const effectiveDateRange = useMemo(() => {
    if (currentDateRange) return currentDateRange;

    if (transactions.length > 0) {
      const dates = transactions.map((t) => new Date(t.date).getTime());
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      return {
        startDate: minDate.toISOString().split("T")[0],
        endDate: maxDate.toISOString().split("T")[0],
      };
    }

    return null;
  }, [currentDateRange, transactions]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Insights</h1>
        {reportName && (
          <Chip color="primary" variant="flat" size="lg">
            Report: {reportName}
          </Chip>
        )}
      </div>

      {/* Date Range Selection */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <DateRangePicker
          className="max-w-xs"
          label="Select dates"
          labelPlacement="outside"
          showMonthAndYearPickers
          maxValue={today(getLocalTimeZone())}
          minValue={parseDate(`${years}-01-01`)}
          onSubmit={handleGetInsights}
          buttonText="Get Insights"
          isLoading={isLoading}
        />
        {reportName && (
          <Button
            variant="flat"
            color="default"
            onPress={handleClearReport}
            size="md"
          >
            Clear Report Data
          </Button>
        )}
      </div>

      {/* Show insights only after data is loaded */}
      {isLoaded && transactions.length > 0 && (
        <Tabs
          aria-label="Insights tabs"
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as TabKey)}
          color="primary"
          variant="underlined"
          classNames={{
            tabList: "gap-6 w-full relative rounded-none p-0 border-b border-divider",
            cursor: "w-full bg-primary",
            tab: "max-w-fit px-0 h-12",
            tabContent: "group-data-[selected=true]:text-primary",
          }}
        >
          <Tab
            key="category"
            title={
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                >
                  <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                  <path d="M22 12A10 10 0 0 0 12 2v10z" />
                </svg>
                <span>Category Distribution</span>
              </div>
            }
          >
            <div className="pt-6">
              <CategoryDistributionTab
                transactions={transactions}
                dateRange={effectiveDateRange}
              />
            </div>
          </Tab>
          <Tab
            key="budget"
            title={
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                >
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                <span>Budget Allocation</span>
              </div>
            }
          >
            <div className="pt-6">
              <BudgetAllocationTab
                transactions={transactions}
                dateRange={effectiveDateRange}
              />
            </div>
          </Tab>
        </Tabs>
      )}

      {/* Initial state message */}
      {!isLoaded && !isLoading && (
        <div className="text-center py-12 text-gray-500">
          <p>
            Select a date range and click "Get Insights" to view your financial data.
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-12 text-gray-500">
          <p>Loading insights...</p>
        </div>
      )}

      {/* No data state */}
      {isLoaded && transactions.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No transactions found for the selected period.</p>
        </div>
      )}
    </div>
  );
}
