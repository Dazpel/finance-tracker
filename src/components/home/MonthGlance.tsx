"use client";

import React from "react";
import { Card, CardBody, CardHeader } from "@heroui/react";
import { formatMoney } from "./helpers";
import type { MonthSummary } from "./types";

type MonthGlanceProps = {
  month: MonthSummary;
};

type Stat = { label: string; value: number; tone: "in" | "out" | "net" };

export const MonthGlance = ({ month }: MonthGlanceProps) => {
  const stats: Stat[] = [
    { label: "In", value: month.in, tone: "in" },
    { label: "Out", value: month.out, tone: "out" },
    { label: "Net", value: month.net, tone: "net" },
  ];

  const valueColor = (stat: Stat) => {
    if (stat.tone === "in") return "text-success";
    if (stat.tone === "net") return stat.value >= 0 ? "text-success" : "text-danger";
    return "text-foreground";
  };

  return (
    <Card shadow="sm">
      <CardHeader className="pb-0">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-default-500">
          {month.label} at a glance
        </h2>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-3 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-default-500">
                {stat.label}
              </span>
              <span className={`text-2xl font-semibold tabular-nums ${valueColor(stat)}`}>
                {stat.tone === "net" && stat.value > 0 ? "+" : ""}
                {formatMoney(stat.value)}
              </span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
};
