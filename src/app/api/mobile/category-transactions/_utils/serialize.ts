import type { SyncedTransaction } from "@prisma/client";
import { resolveAmount, resolveCategory } from "@lib/reports/draftReport";

export type SerializedCategoryTransactionSynced = {
  source: "synced";
  id: string;
  transactionId: string;
  name: string;
  merchantName: string | null;
  amount: number;
  date: string;
  pending: boolean;
  category: string;
  notes: string | null;
  userCategoryOverride: string | null;
  userAmountOverride: number | null;
};

export type SerializedCategoryTransactionFrozen = {
  source: "frozen";
  id: string;
  transactionId: string;
  name: string;
  amount: number;
  date: string;
  category: string;
  notes: string | null;
};

export type SerializedCategoryTransaction =
  | SerializedCategoryTransactionSynced
  | SerializedCategoryTransactionFrozen;

// Keep this function pure — no I/O, no Date.now() — so it can be tested in isolation.
export function serializeTransaction(
  row: SyncedTransaction
): SerializedCategoryTransactionSynced {
  return {
    source: "synced",
    id: row.id,
    transactionId: row.transaction_id,
    name: row.name,
    merchantName: row.merchant_name,
    amount: resolveAmount(row),
    date: row.date,
    pending: row.pending,
    category: resolveCategory(row),
    notes: row.notes,
    userCategoryOverride: row.userCategoryOverride,
    userAmountOverride: row.userAmountOverride,
  };
}
