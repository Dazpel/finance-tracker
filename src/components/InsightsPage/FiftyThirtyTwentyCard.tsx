"use client";

import { Card, CardHeader, CardBody, Divider, Progress } from "@heroui/react";
import { DateRange } from "../DateRangePicker/DateRangePicker";
import {
  FiftyThirtyTwentySummary,
  fiftyThirtyTwentyTargets,
} from "../../utils/insights";

type FiftyThirtyTwentyCardProps = {
  summary: FiftyThirtyTwentySummary;
  dateRange?: DateRange | null;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatCurrency = (value: number) => currencyFormatter.format(value);

const formatDateRange = (dateRange?: DateRange | null) => {
  if (!dateRange?.startDate || !dateRange?.endDate) {
    return "Select a date range to view allocations.";
  }

  const start = dateFormatter.format(new Date(dateRange.startDate));
  const end = dateFormatter.format(new Date(dateRange.endDate));

  return `${start} – ${end}`;
};

const getProgressColor = (percent: number, target: number, isSavings = false) => {
  // Negative percentages always indicate danger (loss/overspending)
  if (percent < 0) {
    return "danger";
  }

  if (isSavings) {
    // For savings: higher is better, so invert the logic
    if (percent >= target) {
      return "success";
    }
    if (percent >= target - 10) {
      return "warning";
    }
    return "danger";
  }

  // For needs/wants: lower is better (under budget)
  if (percent <= target) {
    return "success";
  }
  if (percent <= target + 10) {
    return "warning";
  }
  return "danger";
};

const getDifferenceCopy = (percent: number, target: number, isSavings = false) => {
  // Handle negative savings (loss situation) clearly
  if (isSavings && percent < 0) {
    return `Loss (${Math.abs(percent).toFixed(1)}% of income)`;
  }

  const difference = percent - target;
  const rounded = difference.toFixed(1);

  if (difference === 0) {
    return "On target";
  }

  return `${difference > 0 ? "+" : ""}${rounded}% vs target`;
};

export default function FiftyThirtyTwentyCard({
  summary,
  dateRange,
}: FiftyThirtyTwentyCardProps) {
  const rows = [
    {
      label: "Needs",
      key: "needs",
      amount: summary.needs,
      percent: summary.needsPercent,
      target: fiftyThirtyTwentyTargets.needs,
      isSavings: false,
    },
    {
      label: "Wants",
      key: "wants",
      amount: summary.wants,
      percent: summary.wantsPercent,
      target: fiftyThirtyTwentyTargets.wants,
      isSavings: false,
    },
    {
      label: "Savings / Profit",
      key: "savings",
      amount: summary.savings,
      percent: summary.savingsPercent,
      target: fiftyThirtyTwentyTargets.savings,
      isSavings: true,
    },
  ];

  const hasIncome = summary.revenue > 0;

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col items-start gap-2">
        <div>
          <p className="text-sm uppercase tracking-wide text-gray-500">
            50 / 30 / 20 Overview
          </p>
          <h3 className="text-lg font-semibold">Budget Allocation</h3>
        </div>
        <p className="text-sm text-gray-600">{formatDateRange(dateRange)}</p>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-gray-500">Revenue</p>
            <p className="text-xl font-semibold">{formatCurrency(summary.revenue)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-500">Expenses</p>
            <p className="text-xl font-semibold">{formatCurrency(summary.expenses)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-500">Savings / Profit</p>
            <p className="text-xl font-semibold">{formatCurrency(summary.savings)}</p>
          </div>
        </div>

        <Divider />

        {!hasIncome ? (
          <p className="text-sm text-gray-500">
            Categorize at least one transaction as revenue to view the 50/30/20
            breakdown for this period.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={row.key} className="space-y-2">
                <div className="flex items-start justify-between gap-4 text-sm">
                  <div>
                    <p className="font-medium">{row.label}</p>
                    <p className="text-xs text-gray-500">
                      Target {row.target}% of income
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(row.amount)}</p>
                    <p className="text-xs text-gray-500">
                      {row.percent.toFixed(1)}% of income · {getDifferenceCopy(row.percent, row.target, row.isSavings)}
                    </p>
                  </div>
                </div>
                <Progress
                  maxValue={100}
                  value={Math.min(Math.abs(row.percent), 200)}
                  aria-label={`${row.label} allocation`}
                  color={getProgressColor(row.percent, row.target, row.isSavings)}
                />
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

