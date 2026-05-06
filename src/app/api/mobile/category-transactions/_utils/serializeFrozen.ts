import type { Transaction } from "@prisma/client";
import { normalizeCategory } from "@lib/reports/draftReport";
import type { SerializedCategoryTransactionFrozen } from "./serialize";

// Maps a frozen Transaction row (attached to an APPROVED Report) to the wire
// shape consumed by the mobile detail/edit screen. Always emits source: "frozen"
// so the client can branch its edit affordances. Frozen rows have no merchant
// name column and are never pending.
export function serializeFrozenTransaction(
  row: Transaction
): SerializedCategoryTransactionFrozen {
  return {
    source: "frozen",
    id: String(row.id),
    transactionId: row.transaction_id,
    name: row.name,
    amount: row.amount,
    date: row.date,
    category: normalizeCategory(row.category?.[0]),
    notes: row.notes,
  };
}
