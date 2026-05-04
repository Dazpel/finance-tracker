import type { SyncedTransaction } from "@prisma/client";
import { resolveAmount } from "@lib/reports/draftReport";

export type SerializedCategoryTransaction = {
  id: string;
  transactionId: string;
  name: string;
  merchantName: string | null;
  amount: number;            // resolveAmount applied; Plaid sign convention preserved
  date: string;              // "YYYY-MM-DD"
  pending: boolean;
  categoryOverridden: boolean;
};

// Maps a SyncedTransaction row to the wire shape exposed by
// GET /api/mobile/category-transactions. We intentionally drop:
//   - account_id / plaidAccountId / pending_transaction_id (internal Plaid plumbing)
//   - userCategoryOverride / userAmountOverride (already applied via resolve helpers)
//   - notes / original_description (not needed for the v1 list)
// Keep this function pure — no I/O, no Date.now() — so it can be tested in isolation.
export function serializeTransaction(
  row: SyncedTransaction
): SerializedCategoryTransaction {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    name: row.name,
    merchantName: row.merchant_name,
    amount: resolveAmount(row),
    date: row.date,
    pending: row.pending,
    categoryOverridden: row.userCategoryOverride !== null,
  };
}
