import { ReportType } from "@prisma/client";
import { TransactionBase } from "plaid";

// Extended transaction type that includes notes field
export type TransactionWithNotes = TransactionBase & {
  notes?: string;
};

export type CategoryValues = {
  "food & drink": number;
  "bills & utilities": number;
  car: number;
  entertainment: number;
  groceries: number;
  "health & wellness": number;
  personal: number;
  shopping: number;
  "fees & adjustments": number;
  others: number;
  revenue: number;
  foster: number;
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
  car: number;
  entertainment: number;
  groceries: number;
  healthAndWellness: number;
  personal: number;
  shopping: number;
  feesAndAdjustments: number;
  others: number;
  revenue: number;
  foster: number;
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
