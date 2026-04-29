import type { Key } from "react";
import type { Selection } from "@heroui/react";
import type { TransactionWithNotes } from "utils/types";

export const removeTransactionsByIds = (
  transactions: TransactionWithNotes[],
  idsToRemove: Set<string>
): TransactionWithNotes[] =>
  transactions.filter((t) => !idsToRemove.has(t.transaction_id));

export const removeTransactionById = (
  transactions: TransactionWithNotes[],
  id: string
): TransactionWithNotes[] =>
  removeTransactionsByIds(transactions, new Set([id]));

export const resolveSelectedRowIds = (
  selection: Selection,
  visibleTransactions: TransactionWithNotes[]
): Set<string> => {
  if (selection === "all") {
    return new Set(visibleTransactions.map((t) => t.transaction_id));
  }
  return new Set(Array.from(selection as Set<Key>).map(String));
};

export const countSelectedRows = (
  selection: Selection,
  visibleCount: number
): number => (selection === "all" ? visibleCount : (selection as Set<Key>).size);
