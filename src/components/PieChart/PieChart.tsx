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
import { Transaction } from "@prisma/client";
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

  const totalAmount = Array.from(categoryMap.values()).reduce(
    (sum, amount) => sum + amount,
    0
  );

  const categoryData: Array<CategoryData> = Array.from(categoryMap.entries())
    .map(([category, amount], index) => ({
      category,
      amount,
      percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
      color: categoryColors[index % categoryColors.length],
    }))
    .filter((data) => data.amount > 0)
    .sort((a, b) => b.amount - a.amount);

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
        <p className="text-sm text-gray-600">
          Total: ${totalAmount.toFixed(2)}
        </p>
      </CardHeader>
      <CardBody>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Pie Chart */}
          <div className="flex justify-center lg:w-1/2">
            <div className="h-[300px] w-full max-w-sm">
              <ResponsiveContainer width="100%" height="100%">
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
                    formatter={(value: number, name: string) => {
                      const percent = ((value / totalAmount) * 100).toFixed(1);
                      return [`$${value.toFixed(2)} (${percent}%)`, name];
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
