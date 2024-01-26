"use client";

import ReportCard, { ReportData } from "@components/ReportCard/ReportCard";
import { Button, Tooltip } from "@nextui-org/react";
import SwapIcon from "assets/icons/SwapIcon";
import React, { useMemo, useState } from "react";
import { decodeQueryString } from "utils/functions";

type ReportsToCompare = {
  [key: string]: ReportData;
};

const styledBreakdown = (breakdown: string, index: number) => {
  const isIncreased = breakdown.includes("increased");
  const isRevenueOrTotal = breakdown.includes("Revenue") || breakdown.includes("Total");

  // Simplified color logic
  let textColor;
  if (isRevenueOrTotal) {
    textColor = isIncreased ? "text-green-500" : "text-red-500";
  } else {
    textColor = isIncreased ? "text-red-500" : "text-green-500";
  }

  // Splitting the text for styling
  const splitText = isIncreased ? breakdown.split("increased") : breakdown.split("decreased");
  
  return (
    <p key={index}>
      {splitText[0]}
      <span className={textColor}>{isIncreased ? "increased" : "decreased"}</span>
      {splitText[1]}
    </p>
  );
};

export default function Page({
  searchParams,
}: {
  searchParams: { data: string };
}) {
  const reportData: ReportsToCompare = decodeQueryString(searchParams.data);
  const [reportsOrder, setReportsOrder] = useState(["report1", "report2"]);

  if (!reportData.report1 || !reportData.report2) {
    return <p>Invalid data</p>;
  }

  const formattedReport = (report: ReportData) => {
    const { id, reportName, createdAt, ...rest } = report;
    return rest;
  };

  const handleOrderSwap = () => {
    const arrayCopy = [...reportsOrder];
    setReportsOrder(arrayCopy.reverse());
  };

  const ReportAnalysis = () => {
    const comparisonResults: string[] = [];
      const report1 = formattedReport(reportData[reportsOrder[0]]);
      const report2 = formattedReport(reportData[reportsOrder[1]]);

      Object.entries(report1).map(([key, value]) => {
        const difference =
          key === "expenses"
            ? Math.abs(report2[key]) - Math.abs(value)
            : report2[key] - value;
        if (difference !== 0) {
          const direction = difference > 0 ? "increased" : "decreased";
          const formattedKey =
            key.charAt(0).toUpperCase() +
            key.slice(1).replace(/([A-Z])/g, " $1");
          comparisonResults.push(
            `${formattedKey} ${direction} by $${Math.abs(difference).toFixed(
              2
            )}`
          );
        }
      });

      return comparisonResults.map((result, index) =>
        styledBreakdown(result, index)
      );
  }

  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold mb-4">Comparing reports</h3>
      <div className="flex gap-4 items-center">
        <div className="flex flex-col gap-2 items-center">
          <label>Report 1: {reportData[reportsOrder[0]].reportName}</label>
          <ReportCard
            reportData={formattedReport(reportData[reportsOrder[0]])}
          />
        </div>
        <Tooltip content="Swap Order">
          <Button
            isIconOnly
            color="primary"
            aria-label="swap"
            onClick={handleOrderSwap}
          >
            <SwapIcon />
          </Button>
        </Tooltip>
        <div className="flex flex-col gap-2 items-center">
          <label>Report 2: {reportData[reportsOrder[1]].reportName}</label>
          <ReportCard
            reportData={formattedReport(reportData[reportsOrder[1]])}
          />
        </div>
      </div>
      <div className="flex flex-col gap-4 mt-8">
        <h3 className="text-xl font-semibold mb-4">
          Report Comparison Analysis:
        </h3>
        <div className="flex flex-col gap-2">{ReportAnalysis()}</div>
      </div>
    </div>
  );
}
