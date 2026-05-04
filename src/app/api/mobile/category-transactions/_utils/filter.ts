import type { SyncedTransaction } from "@prisma/client";
import { resolveCategory } from "@lib/reports/draftReport";

// Mirrors the per-row filtering done by computeReportTotals so the per-category
// transaction list matches what the home Report totals were computed from:
//   - Drop pending rows superseded by a posted counterpart (Plaid pending→posted
//     transition where the `removed` event for the pending row hasn't arrived yet).
//   - Skip userSoftDeleted rows.
//   - Resolve effective category via resolveCategory (respects userCategoryOverride).
//
// Dedupe runs before the soft-delete + category step so the decision is based on
// Plaid's authoritative pending_transaction_id link, not a category-override
// coincidence on one side of the pair.
export function filterAndResolve(
  rows: SyncedTransaction[],
  canonicalCategoryName: string
): SyncedTransaction[] {
  const supersededPendingIds = new Set<string>();
  for (const r of rows) {
    if (!r.pending && r.pending_transaction_id) {
      supersededPendingIds.add(r.pending_transaction_id);
    }
  }

  const deduped = rows.filter(
    (r) => !(r.pending && supersededPendingIds.has(r.transaction_id))
  );

  return deduped.filter((t) => {
    if (t.userSoftDeleted) return false;
    return resolveCategory(t) === canonicalCategoryName;
  });
}
