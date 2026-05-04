import type { SyncedTransaction } from "@prisma/client";
import { resolveCategory } from "@lib/reports/draftReport";

// Mirrors the per-row filtering done by computeReportTotals so the per-category
// transaction list matches what the home Report totals were computed from:
//   - Skip userSoftDeleted rows.
//   - Resolve effective category via resolveCategory (respects userCategoryOverride).
export function filterAndResolve(
  rows: SyncedTransaction[],
  canonicalCategoryName: string
): SyncedTransaction[] {
  return rows.filter((t) => {
    if (t.userSoftDeleted) return false;
    return resolveCategory(t) === canonicalCategoryName;
  });
}
