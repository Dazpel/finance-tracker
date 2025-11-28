"use client";

import { useMemo, useState } from "react";
import { Transaction } from "@prisma/client";
import {
  FiftyThirtyTwentySummary,
  fiftyThirtyTwentyTargets,
} from "../../utils/insights";
import { fiftyThirtyTwentyCategories } from "../../utils/constants";
import BudgetSectionBreakdown, {
  BudgetSectionData,
  BudgetStatus,
} from "./BudgetSectionBreakdown";
import { Button } from "@heroui/react";

interface BudgetBreakdownsProps {
  summary: FiftyThirtyTwentySummary;
  transactions: Transaction[];
}

// Savings doesn't have predefined categories, it's calculated from revenue
const savingsCategories = ["revenue"];

export default function BudgetBreakdowns({
  summary,
  transactions,
}: BudgetBreakdownsProps) {
  const [showAllSections, setShowAllSections] = useState(false);

  // Build all budget sections with their status
  const allSections = useMemo((): BudgetSectionData[] => {
    const sections: BudgetSectionData[] = [];

    // Needs section
    const needsTargetAmount = (summary.revenue * fiftyThirtyTwentyTargets.needs) / 100;
    const needsDifference = summary.needs - needsTargetAmount;
    const needsStatus: BudgetStatus =
      needsDifference > 0 ? "over" : needsDifference < 0 ? "under" : "on-target";

    sections.push({
      type: "needs",
      label: "Needs",
      amount: summary.needs,
      percent: summary.needsPercent,
      target: fiftyThirtyTwentyTargets.needs,
      targetAmount: needsTargetAmount,
      difference: needsDifference,
      status: needsStatus,
      categories: fiftyThirtyTwentyCategories.needs,
    });

    // Wants section
    const wantsTargetAmount = (summary.revenue * fiftyThirtyTwentyTargets.wants) / 100;
    const wantsDifference = summary.wants - wantsTargetAmount;
    const wantsStatus: BudgetStatus =
      wantsDifference > 0 ? "over" : wantsDifference < 0 ? "under" : "on-target";

    sections.push({
      type: "wants",
      label: "Wants",
      amount: summary.wants,
      percent: summary.wantsPercent,
      target: fiftyThirtyTwentyTargets.wants,
      targetAmount: wantsTargetAmount,
      difference: wantsDifference,
      status: wantsStatus,
      categories: fiftyThirtyTwentyCategories.wants,
    });

    // Savings section
    const savingsTargetAmount = (summary.revenue * fiftyThirtyTwentyTargets.savings) / 100;
    const savingsDifference = summary.savings - savingsTargetAmount;
    // For savings, being over target is good
    const savingsStatus: BudgetStatus =
      savingsDifference > 0 ? "over" : savingsDifference < 0 ? "under" : "on-target";

    sections.push({
      type: "savings",
      label: "Savings / Profit",
      amount: summary.savings,
      percent: summary.savingsPercent,
      target: fiftyThirtyTwentyTargets.savings,
      targetAmount: savingsTargetAmount,
      difference: savingsDifference,
      status: savingsStatus,
      categories: savingsCategories,
    });

    return sections;
  }, [summary]);

  // Separate over-budget (priority) sections from others
  const { prioritySections, otherSections } = useMemo(() => {
    const priority: BudgetSectionData[] = [];
    const others: BudgetSectionData[] = [];

    allSections.forEach((section) => {
      // Needs/Wants over budget OR Savings under target are priority
      if (section.type === "savings") {
        if (section.status === "under") {
          priority.push(section);
        } else {
          others.push(section);
        }
      } else {
        if (section.status === "over") {
          priority.push(section);
        } else {
          others.push(section);
        }
      }
    });

    return { prioritySections: priority, otherSections: others };
  }, [allSections]);

  if (summary.revenue <= 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Priority sections (over-budget needs/wants or under-target savings) - always shown */}
      {prioritySections.map((section) => (
        <BudgetSectionBreakdown
          key={section.type}
          section={section}
          transactions={transactions}
        />
      ))}

      {/* Other sections - shown on demand or if no priority sections */}
      {(showAllSections || prioritySections.length === 0) && (
        <>
          {otherSections.map((section) => (
            <BudgetSectionBreakdown
              key={section.type}
              section={section}
              transactions={transactions}
            />
          ))}
        </>
      )}

      {/* Toggle button to show/hide other sections */}
      {otherSections.length > 0 && prioritySections.length > 0 && (
        <div className="flex justify-center">
          <Button
            variant="flat"
            color="default"
            onPress={() => setShowAllSections(!showAllSections)}
          >
            {showAllSections
              ? "Hide Other Sections"
              : `Show ${otherSections.length} More Section${otherSections.length > 1 ? "s" : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
}
