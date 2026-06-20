"use client";

import React from "react";
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardBody, CardHeader } from "@heroui/react";
import { Transaction } from "@generated/prisma/browser";
import { defaultCategories } from "../../utils/constants";

interface PieChartProps {
  transactions: Array<Transaction>;
}

interface CategoryData {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

const categoryColors = [
  "#6366F1", // Indigo
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#06B6D4", // Cyan
  "#F97316", // Orange
  "#84CC16", // Lime
  "#EF4444", // Red
  "#3B82F6", // Blue
  "#14B8A6", // Teal
  "#A855F7", // Purple
];

export default function PieChart({ transactions }: PieChartProps) {
  const categoryMap = new Map<string, number>();
  defaultCategories.forEach((category) => categoryMap.set(category, 0));

  transactions.forEach((transaction) => {
    transaction.category.forEach((cat) => {
      const normalized = cat.toLowerCase();
      if (categoryMap.has(normalized)) {
        categoryMap.set(
          normalized,
          categoryMap.get(normalized)! + Math.abs(transaction.amount)
        );
      } else {
        categoryMap.set(
          "others",
          (categoryMap.get("others") ?? 0) + Math.abs(transaction.amount)
        );
      }
    });
  });

  // Calculate revenue and expenses separately
  const revenueAmount = categoryMap.get("revenue") || 0;
  const expensesAmount = Array.from(categoryMap.entries())
    .filter(([category]) => category !== "revenue")
    .reduce((sum, [, amount]) => sum + amount, 0);
  
  // Total for percentage calculations (expenses only, excluding revenue)
  const totalAmount = expensesAmount;

  const categoryData: Array<CategoryData> = Array.from(categoryMap.entries())
    .map(([category, amount], index) => ({
      category,
      amount,
      // For revenue, calculate percentage based on revenue itself (100%)
      // For expenses, calculate percentage based on expenses total
      percentage: category === "revenue" 
        ? (revenueAmount > 0 ? 100 : 0)
        : (totalAmount > 0 ? (amount / totalAmount) * 100 : 0),
      color: categoryColors[index % categoryColors.length],
    }))
    .filter((data) => data.amount > 0)
    .sort((a, b) => {
      // Sort revenue first, then by amount descending
      if (a.category === "revenue") return -1;
      if (b.category === "revenue") return 1;
      return b.amount - a.amount;
    });

  const chartData = categoryData.map((d) => ({
    name: d.category,
    value: d.amount,
    color: d.color,
  }));

  if (categoryData.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <h3 className="text-lg font-semibold">Category Distribution</h3>
        </CardHeader>
        <CardBody>
          <div className="text-center py-8 text-gray-500">
            <p>No transaction data available for the selected date range.</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-2 justify-start items-start">
        <h3 className="text-lg font-semibold">Category Distribution</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-gray-500">Revenue</p>
            <p className="text-xl font-semibold">${revenueAmount.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-500">Expenses</p>
            <p className="text-xl font-semibold">${expensesAmount.toFixed(2)}</p>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Pie Chart */}
          <div className="flex justify-center lg:w-1/2">
            <div className="h-[300px] w-full max-w-sm">
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={40}
                    labelLine={false}
                    label={false}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown, name: unknown): [string, string] => {
                      const nameStr = String(name ?? "");
                      const category = categoryData.find(
                        (data) => data.category === nameStr
                      );
                      const percent = category
                        ? category.percentage.toFixed(1)
                        : "0.0";
                      return [
                        `$${Number(value ?? 0).toFixed(2)} (${percent}%)`,
                        nameStr,
                      ];
                    }}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Legend */}
          <div className="lg:w-1/2">
            <div className="space-y-3">
              {categoryData.map((data) => (
                <div
                  key={data.category}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: data.color }}
                    />
                    <span className="text-sm font-medium capitalize">
                      {data.category}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">
                      {data.percentage.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">
                      ${data.amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
