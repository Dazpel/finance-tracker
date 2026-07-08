import type { SyncedTransaction } from "@generated/prisma/browser";
import {
  serializeTransaction,
  type SerializedCategoryTransactionSynced,
} from "@api/mobile/category-transactions/_utils/serialize";

// Feed rows extend the shared category serialization with two fields the feed
// needs: `createdAt` (when the row was synced into our DB — drives the mobile
// "new since last visit" marker) and `accountId` (Plaid's individual account_id
// — the join key to the account filter's SyncedAccount list).
export type SerializedFeedTransaction = SerializedCategoryTransactionSynced & {
  createdAt: string;
  accountId: string;
};

// Drop pending rows that have already been superseded by a posted counterpart
// (Plaid pending→posted transition where the `removed` event for the pending
// row hasn't arrived yet). Mirrors the dedupe half of `filterAndResolve` in
// category-transactions/_utils/filter.ts, minus the per-category filtering.
// userSoftDeleted rows are excluded at the query level, so they are not
// re-checked here.
export function dedupePendingPosted(
  rows: SyncedTransaction[]
): SyncedTransaction[] {
  const supersededPendingIds = new Set<string>();
  for (const r of rows) {
    if (!r.pending && r.pending_transaction_id) {
      supersededPendingIds.add(r.pending_transaction_id);
    }
  }
  return rows.filter(
    (r) => !(r.pending && supersededPendingIds.has(r.transaction_id))
  );
}

export function serializeFeedTransaction(
  row: SyncedTransaction
): SerializedFeedTransaction {
  return {
    ...serializeTransaction(row),
    createdAt: row.createdAt.toISOString(),
    accountId: row.account_id,
  };
}
