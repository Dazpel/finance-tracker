"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Accordion,
  AccordionItem,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Select,
  SelectItem,
} from "@heroui/react";
import { Transaction } from "@generated/prisma/browser";

interface CategoryBreakdown {
  category: string;
  amount: number;
  transactions: Transaction[];
  percentage: number;
}

export type BudgetStatus = "over" | "under" | "on-target";

export interface BudgetSectionData {
  type: "needs" | "wants" | "savings";
  label: string;
  amount: number;
  percent: number;
  target: number;
  targetAmount: number;
  difference: number;
  status: BudgetStatus;
  categories: string[];
}

interface BudgetSectionBreakdownProps {
  section: BudgetSectionData;
  transactions: Transaction[];
  defaultExpanded?: boolean;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => currencyFormatter.format(value);

const getStatusColor = (status: BudgetStatus, isSavings: boolean) => {
  if (isSavings) {
    // For savings: over target is good, under is bad
    if (status === "over") return "success";
    if (status === "under") return "danger";
    return "default";
  }
  // For needs/wants: under target is good, over is bad
  if (status === "over") return "danger";
  if (status === "under") return "success";
  return "default";
};

const getStatusLabel = (status: BudgetStatus, isSavings: boolean) => {
  if (isSavings) {
    if (status === "over") return "Above Target";
    if (status === "under") return "Below Target";
    return "On Target";
  }
  if (status === "over") return "Over Budget";
  if (status === "under") return "Under Budget";
  return "On Target";
};

const getBorderColor = (status: BudgetStatus, isSavings: boolean) => {
  if (isSavings) {
    if (status === "over") return "border-l-success";
    if (status === "under") return "border-l-danger";
    return "border-l-default";
  }
  if (status === "over") return "border-l-danger";
  if (status === "under") return "border-l-success";
  return "border-l-default";
};

type SortOption = "date-desc" | "date-asc" | "price-desc" | "price-asc";

export default function BudgetSectionBreakdown({
  section,
  transactions,
  defaultExpanded = false,
}: BudgetSectionBreakdownProps) {
  const isSavings = section.type === "savings";
  // Track sort option per category
  const [sortOptions, setSortOptions] = useState<Map<string, SortOption>>(
    new Map()
  );
  
  const getSortOption = (category: string): SortOption => {
    return sortOptions.get(category) || "date-desc";
  };
  
  const setSortOption = (category: string, option: SortOption) => {
    setSortOptions((prev) => {
      const newMap = new Map(prev);
      newMap.set(category, option);
      return newMap;
    });
  };

  // Group transactions by category
  const categoryBreakdown = useMemo(() => {
    const categoryMap = new Map<string, { amount: number; transactions: Transaction[] }>();

    // Initialize categories
    section.categories.forEach((cat) => {
      categoryMap.set(cat, { amount: 0, transactions: [] });
    });

    // For savings, we show revenue transactions
    if (isSavings) {
      transactions.forEach((transaction) => {
        const transactionCategories = (transaction.category || []).map((c) =>
          c.toLowerCase()
        );
        if (transactionCategories.includes("revenue")) {
          const existing = categoryMap.get("revenue");
          if (existing) {
            existing.amount += Math.abs(transaction.amount);
            existing.transactions.push(transaction);
          }
        }
      });
    } else {
      // Group expense transactions by category
      transactions.forEach((transaction) => {
        const transactionCategories = (transaction.category || []).map((c) =>
          c.toLowerCase()
        );

        transactionCategories.forEach((cat) => {
          if (section.categories.includes(cat)) {
            const existing = categoryMap.get(cat);
            if (existing) {
              existing.amount += Math.abs(transaction.amount);
              existing.transactions.push(transaction);
            }
          }
        });
      });
    }

    // Convert to array and sort by amount
    // For percentage, use absolute value of section amount to handle negative savings
    const totalForPercentage = Math.abs(section.amount) || 1;
    const breakdown = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        transactions: data.transactions,
        percentage: (data.amount / totalForPercentage) * 100,
      }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return breakdown;
  }, [section, transactions, isSavings]);

  // Sort transactions based on selected option
  const sortTransactions = (transactions: Transaction[], category: string): Transaction[] => {
    const sorted = [...transactions];
    const sortOption = getSortOption(category);
    
    switch (sortOption) {
      case "date-desc":
        return sorted.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
      case "date-asc":
        return sorted.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
      case "price-desc":
        return sorted.sort(
          (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
        );
      case "price-asc":
        return sorted.sort(
          (a, b) => Math.abs(a.amount) - Math.abs(b.amount)
        );
      default:
        return sorted;
    }
  };

  // Track if we've initialized the expanded state
  const hasInitializedRef = useRef(false);
  
  // Initialize expandedKeys - will be set via effect after categoryBreakdown is computed
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Effect to set the first category expanded when defaultExpanded is true (only once)
  useEffect(() => {
    if (defaultExpanded && categoryBreakdown.length > 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const firstCategoryKey = `${section.type}-${categoryBreakdown[0].category}`;
      setExpandedKeys(new Set([firstCategoryKey]));
    }
  }, [defaultExpanded, categoryBreakdown, section.type]);

  const statusColor = getStatusColor(section.status, isSavings);
  const statusLabel = getStatusLabel(section.status, isSavings);
  const borderColor = getBorderColor(section.status, isSavings);

  // Generate description based on status
  const getDescription = () => {
    const absAmount = Math.abs(section.difference);
    
    if (isSavings) {
      // Handle negative savings (loss situation)
      if (section.amount < 0) {
        return (
          <>
            You have a{" "}
            <span className="text-danger font-medium">
              loss of {formatCurrency(Math.abs(section.amount))}
            </span>
            , which is {formatCurrency(absAmount)} below your target of{" "}
            {formatCurrency(section.targetAmount)}.
          </>
        );
      }
      
      if (section.status === "over") {
        return (
          <>
            Great job! You&apos;ve saved {formatCurrency(section.amount)}, which is{" "}
            <span className="text-success font-medium">
              {formatCurrency(absAmount)} above
            </span>{" "}
            your target of {formatCurrency(section.targetAmount)}.
          </>
        );
      }
      if (section.status === "under") {
        return (
          <>
            You&apos;ve saved {formatCurrency(section.amount)}, which is{" "}
            <span className="text-danger font-medium">
              {formatCurrency(absAmount)} below
            </span>{" "}
            your target of {formatCurrency(section.targetAmount)}.
          </>
        );
      }
      return <>You&apos;re right on target with {formatCurrency(section.amount)} in savings.</>;
    }

    if (section.status === "over") {
      return (
        <>
          You&apos;ve spent {formatCurrency(section.amount)} on {section.label}, which is{" "}
          <span className="text-danger font-medium">
            {formatCurrency(absAmount)} over
          </span>{" "}
          your target of {formatCurrency(section.targetAmount)}.
        </>
      );
    }
    if (section.status === "under") {
      return (
        <>
          You&apos;ve spent {formatCurrency(section.amount)} on {section.label}, which is{" "}
          <span className="text-success font-medium">
            {formatCurrency(absAmount)} under
          </span>{" "}
          your target of {formatCurrency(section.targetAmount)}.
        </>
      );
    }
    return <>You&apos;re right on target with {formatCurrency(section.amount)} in {section.label}.</>;
  };

  if (categoryBreakdown.length === 0) {
    return (
      <Card className={`border-l-4 ${borderColor}`}>
        <CardHeader className="flex flex-col items-start gap-2 pb-2">
          <div className="flex items-center gap-2">
            <Chip color={statusColor} variant="flat" size="sm">
              {statusLabel}
            </Chip>
            <h3 className="text-lg font-semibold">{section.label} · Breakdown</h3>
          </div>
          <p className="text-sm text-gray-600">{getDescription()}</p>
        </CardHeader>
        <CardBody className="pt-0">
          <p className="text-sm text-gray-500">No transactions in this category.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardHeader className="flex flex-col items-start gap-2 pb-2">
        <div className="flex items-center gap-2">
          <Chip color={statusColor} variant="flat" size="sm">
            {statusLabel}
          </Chip>
          <h3 className="text-lg font-semibold">{section.label} · Breakdown</h3>
        </div>
        <p className="text-sm text-gray-600">{getDescription()}</p>
      </CardHeader>
      <CardBody className="pt-0">
        <Accordion
          selectionMode="multiple"
          selectedKeys={expandedKeys}
          onSelectionChange={(keys) => setExpandedKeys(keys as Set<string>)}
          variant="splitted"
        >
          {categoryBreakdown.map(({ category, amount, transactions: catTransactions, percentage }) => (
            <AccordionItem
              key={`${section.type}-${category}`}
              aria-label={category}
              title={
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <span className="capitalize font-medium">{category}</span>
                    <Chip size="sm" variant="flat">
                      {catTransactions.length} transactions
                    </Chip>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold">{formatCurrency(amount)}</span>
                    {!isSavings && (
                      <span className="text-sm text-gray-500 ml-2">
                        ({percentage.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
              }
              classNames={{
                content: "pt-0",
              }}
            >
              <div className="flex flex-col gap-2">
                <div className="flex justify-end">
                  <Select
                    label="Sort by"
                    placeholder="Sort transactions"
                    selectedKeys={[getSortOption(category)]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as SortOption;
                      setSortOption(category, selected);
                    }}
                    size="sm"
                    className="max-w-[200px]"
                    classNames={{
                      trigger: "h-8 min-h-8",
                    }}
                  >
                    <SelectItem key="date-desc">
                      Date (Newest First)
                    </SelectItem>
                    <SelectItem key="date-asc">
                      Date (Oldest First)
                    </SelectItem>
                    <SelectItem key="price-desc">
                      Price (High to Low)
                    </SelectItem>
                    <SelectItem key="price-asc">
                      Price (Low to High)
                    </SelectItem>
                  </Select>
                </div>
                <Table
                  aria-label={`${category} transactions`}
                  isCompact
                  removeWrapper
                  classNames={{
                    base: "max-h-[300px] overflow-auto",
                  }}
                >
                  <TableHeader>
                    <TableColumn>DATE</TableColumn>
                    <TableColumn>DESCRIPTION</TableColumn>
                    <TableColumn className="text-right">AMOUNT</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent="No transactions found">
                    {sortTransactions(catTransactions, category).map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="whitespace-nowrap">
                          {transaction.date}
                        </TableCell>
                        <TableCell>{transaction.name}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatCurrency(Math.abs(transaction.amount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </AccordionItem>
          ))}
        </Accordion>
      </CardBody>
    </Card>
  );
}

