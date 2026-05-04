import type { Transaction } from "@prisma/client";
import type { SerializedCategoryTransaction } from "./serialize";

// Maps a frozen Transaction row (attached to an APPROVED Report) to the same
// wire shape that serializeTransaction produces for live SyncedTransaction rows.
// The approve route (src/app/api/prisma/reports/[id]/approve/route.ts) already
// applies resolveAmount + resolveCategory when populating Transaction at
// approval time, so the amount/category here are already final and the
// override distinction is collapsed.
//
// Limitations vs the live serializer:
//   - id is coerced (Transaction.id is Int; SyncedTransaction.id is a uuid string)
//   - merchantName is null (Transaction has no merchant_name column)
//   - pending is always false (frozen rows are post-approval)
//   - categoryOverridden is always false (the override decision was baked into
//     category[] at approval time and is not separately tracked on Transaction)
export function serializeFrozenTransaction(
  row: Transaction
): SerializedCategoryTransaction {
  return {
    id: String(row.id),
    transactionId: row.transaction_id,
    name: row.name,
    merchantName: null,
    amount: row.amount,
    date: row.date,
    pending: false,
    categoryOverridden: false,
  };
}
