import { RecurringTransaction } from "@prisma/client";

export type RecurringReportData = {
    inflow: number;
    outflow: number;
    total: number;
    inflowTransactions: RecurringTransaction[];
    outflowTransactions: RecurringTransaction[];
  }