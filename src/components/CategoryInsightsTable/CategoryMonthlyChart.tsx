"use client";

import React, { useMemo, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useCategoryMonthlyData } from "./useCategoryMonthlyData";
import { CategoryMonthlyChartProps } from "./types";
import { Card, CardBody, CardHeader } from "@heroui/react";
import { useTheme as useNextTheme } from "next-themes";

const CategoryMonthlyChart: React.FC<CategoryMonthlyChartProps> = ({
  transactions,
  selectedCategory,
  dateRange,
}) => {
  const { theme } = useNextTheme();
  const isDarkTheme = theme === "dark" ? true : false;
  const strokeColor = isDarkTheme ? "#fff" : "#11181c";
  const legendColor = isDarkTheme ? "#11181c" : "#fff";

  const { monthlyData, totalAmount, totalTransactions, monthsWithActivity } =
    useCategoryMonthlyData({
      transactions,
      selectedCategory,
      dateRange,
    });

  const maxAmount = useMemo(
    () =>
      monthlyData.length > 0
        ? Math.max(...monthlyData.map((d) => d.amount))
        : 0,
    [monthlyData]
  );

  const yAxisDomain = useMemo(
    () => [0, maxAmount > 0 ? maxAmount * 1.1 : 100], // Add 10% padding or default to 100
    [maxAmount]
  );

  const chartMargin = useMemo(
    () => ({ top: 5, right: 30, left: 20, bottom: 5 }),
    []
  );

  const tooltipContentStyle = useMemo(
    () => ({
      color: strokeColor,
      backgroundColor: legendColor,
      borderRadius: "8px",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    }),
    [legendColor, strokeColor]
  );

  const handleTooltipFormatter = useCallback(
    (value: unknown, name: unknown): [string, string] => [
      `$${Number(value ?? 0).toFixed(2)}`,
      name === "amount" ? "Total Spent" : "Transactions",
    ],
    []
  );

  const handleLabelFormatter = useCallback(
    (label: unknown) => `Month: ${String(label ?? "")}`,
    []
  );

  if (!selectedCategory) {
    return (
      <div className="w-full h-64 flex items-center justify-center rounded-lg border bg-background border-gray-600">
        <p className="text-sm">Select a category to view monthly trends</p>
      </div>
    );
  }

  if (monthlyData.length === 0) {
    return (
      <div className="w-full rounded-lg border p-4 mb-6 bg-background border-gray-600">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 capitalize">
            Monthly Trends: {selectedCategory}
          </h3>
        </div>
        <div className="w-full h-64 flex items-center justify-center rounded-lg">
          <p className="text-sm">
            No data available for the selected category in this date range
          </p>
        </div>
      </div>
    );
  }

  return (
    <Card
      role="region"
      aria-label={`Monthly spending trends for ${selectedCategory} category`}
    >
      <CardHeader className="mb-4 flex flex-col gap-2 justify-start items-start">
        <h3 className="text-lg font-semibold capitalize">
          Monthly Trends: {selectedCategory}
        </h3>
        <p className="text-sm opacity-70">
          Total spent: ${totalAmount.toFixed(2)}
        </p>
      </CardHeader>
      <CardBody>
        <div
          className="w-full h-64"
          role="img"
          aria-label={`Line chart showing monthly spending for ${selectedCategory} category`}
        >
          <ResponsiveContainer width="100%" height={256}>
            <LineChart data={monthlyData} margin={chartMargin}>
              <CartesianGrid strokeDasharray="3 3" stroke={strokeColor} />
              <XAxis
                dataKey="month"
                stroke={strokeColor}
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke={strokeColor}
                fontSize={12}
                tickLine={false}
                axisLine={false}
                domain={yAxisDomain}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={tooltipContentStyle}
                formatter={handleTooltipFormatter}
                labelFormatter={handleLabelFormatter}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ fill: "#3b82f6", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: "#3b82f6", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="w-full rounded-lg border p-4 mb-6 bg-background border-gray-600">
            <p className="font-medium">
              {monthsWithActivity}{" "}
              {monthsWithActivity === 1 ? "Month" : "Months"}
            </p>
            <p className="opacity-50">With Activity</p>
          </div>
          <div className="w-full rounded-lg border p-4 mb-6 bg-background border-gray-600">
            <p className="font-medium">{totalTransactions}</p>
            <p className="opacity-50">Total Transactions</p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};

export default React.memo(CategoryMonthlyChart);
