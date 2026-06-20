import { RecurringTransaction } from "@generated/prisma/browser";

export type RecurringReportData = {
    inflow: number;
    outflow: number;
    total: number;
    inflowTransactions: RecurringTransaction[];
    outflowTransactions: RecurringTransaction[];
  }