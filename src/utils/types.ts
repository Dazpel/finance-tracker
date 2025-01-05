import { ReportType } from "@prisma/client";

export type CategoryValues = {
  "food & drink": number;
  "bills & utilities": number;
  gas: number;
  entertainment: number;
  groceries: number;
  "health & wellness": number;
  personal: number;
  shopping: number;
  "fees & adjustments": number;
  others: number;
  revenue: number;
};

export type RecurringReportDataDTO = {
  id: number
  inflow: number;
  outflow: number;
  total: number;
  reportName: string;
};

export type ReportDataDTO = {
  id: number;
  reportType: ReportType;
  reportName: string;
  createdAt: string;
  foodAndDrink: number;
  billsAndUtilities: number;
  gas: number;
  entertainment: number;
  groceries: number;
  healthAndWellness: number;
  personal: number;
  shopping: number;
  feesAndAdjustments: number;
  others: number;
  revenue: number;
  expenses: number;
  total: number;
}

export enum defaultColorVariants {
  default = "default",
  primary = "primary",
  secondary = "secondary",
  success = "success",
  warning = "warning",
  danger = "danger",
}
