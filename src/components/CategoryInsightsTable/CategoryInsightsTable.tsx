"use client";

import React, { useState } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Select,
  SelectItem,
} from "@heroui/react";
import { Transaction } from "@prisma/client";
import { defaultCategories } from "../../utils/constants";
import CategoryMonthlyChart from "./CategoryMonthlyChart";
import { DateRange } from "./types";

interface CategoryInsightsTableProps {
  transactions: Array<Transaction>;
  dateRange?: DateRange;
}

interface CategoryData {
  [key: string]: Array<Transaction>;
}

interface TopContentProps {
  activeCategories: Array<string>;
  groupedTransactions: CategoryData;
  categoryTotals: { [key: string]: number };
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

const TopContent = ({
  activeCategories,
  groupedTransactions,
  categoryTotals,
  selectedCategory,
  onCategoryChange,
}: TopContentProps) => {
  const currentTotal = selectedCategory ? categoryTotals[selectedCategory] : 0;
  const currentTransactions = selectedCategory
    ? groupedTransactions[selectedCategory]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-4">
          <Select
            label="Select Category"
            placeholder="Choose a category"
            selectedKeys={selectedCategory ? [selectedCategory] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              onCategoryChange(selected);
            }}
            className="min-w-[300px]"
            classNames={{
              trigger: "min-w-[300px]",
              listbox: "min-w-[300px]",
            }}
          >
            {activeCategories.map((category) => (
              <SelectItem key={category} textValue={category}>
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="capitalize truncate">{category}</span>
                  <div className="flex items-center gap-2 text-sm text-gray-500 flex-shrink-0">
                    <span>({groupedTransactions[category].length})</span>
                    <span className="font-medium">
                      ${categoryTotals[category].toFixed(2)}
                    </span>
                  </div>
                </div>
              </SelectItem>
            ))}
          </Select>
        </div>
        {selectedCategory && (
          <div className="text-right">
            <p className="text-sm text-gray-600">
              Total:{" "}
              <span className="font-semibold">${currentTotal.toFixed(2)}</span>
            </p>
            <p className="text-xs text-gray-500">
              {currentTransactions.length} transactions
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default function CategoryInsightsTable({
  transactions,
  dateRange,
}: CategoryInsightsTableProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  // Group transactions by category
  const groupedTransactions: CategoryData = {};

  // Initialize all default categories
  defaultCategories.forEach((category) => {
    groupedTransactions[category] = [];
  });

  // Group transactions by their categories
  transactions.forEach((transaction) => {
    transaction.category.forEach((cat) => {
      const normalizedCategory = cat.toLowerCase();
      if (groupedTransactions[normalizedCategory]) {
        groupedTransactions[normalizedCategory].push(transaction);
      } else {
        // If category doesn't exist in defaults, add to "others"
        if (groupedTransactions["others"]) {
          groupedTransactions["others"].push(transaction);
        }
      }
    });
  });

  // Calculate total amount for each category
  const categoryTotals: { [key: string]: number } = {};
  Object.keys(groupedTransactions).forEach((category) => {
    categoryTotals[category] = groupedTransactions[category].reduce(
      (sum, transaction) => sum + Math.abs(transaction.amount),
      0
    );
  });

  // Filter out categories with no transactions
  const activeCategories = defaultCategories.filter(
    (category) => groupedTransactions[category].length > 0
  );

  // Set default selected category if none is selected
  if (!selectedCategory && activeCategories.length > 0) {
    setSelectedCategory(activeCategories[0]);
  }

  if (activeCategories.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No transactions found for the selected date range.</p>
      </div>
    );
  }

  const currentTransactions = selectedCategory
    ? groupedTransactions[selectedCategory]
    : [];

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Monthly Chart Section */}
      {selectedCategory && dateRange && (
        <CategoryMonthlyChart
          key={`${selectedCategory}-${dateRange.startDate}-${dateRange.endDate}`}
          transactions={transactions}
          selectedCategory={selectedCategory}
          dateRange={dateRange}
        />
      )}

      <Table
        aria-label="Category insights table"
        classNames={{
          wrapper: "min-h-[400px]",
          base: "min-h-[400px]",
          table: "min-w-full",
        }}
        topContent={
          <TopContent
            activeCategories={activeCategories}
            groupedTransactions={groupedTransactions}
            categoryTotals={categoryTotals}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        }
        topContentPlacement="outside"
      >
        <TableHeader>
          <TableColumn>DATE</TableColumn>
          <TableColumn>NAME</TableColumn>
          <TableColumn className="text-right">AMOUNT</TableColumn>
        </TableHeader>
        <TableBody
          emptyContent={
            selectedCategory
              ? `No transactions found in ${selectedCategory}`
              : "Select a category to view transactions"
          }
          items={currentTransactions}
        >
          {(transaction) => (
            <TableRow key={transaction.id}>
              <TableCell>{transaction.date}</TableCell>
              <TableCell>{transaction.name}</TableCell>
              <TableCell className="text-right">
                <span
                  className={transaction.amount < 0 ? "text-green-600" : ""}
                >
                  ${Math.abs(transaction.amount).toFixed(2)}
                </span>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
