import type {
  AddedTransaction,
  CarriedFields,
  CarryoverPatch,
  PendingRow,
} from "./types";

export const buildCarryoverMap = (
  rows: PendingRow[]
): Map<string, CarriedFields> =>
  new Map(
    rows.map(({ transaction_id, ...fields }) => [transaction_id, fields])
  );

const patchesFor = (
  transaction_id: string,
  carried: CarriedFields
): CarryoverPatch[] => {
  const patches: CarryoverPatch[] = [];

  if (carried.notes != null) {
    patches.push({
      transaction_id,
      guard: { notes: null },
      data: { notes: carried.notes },
    });
  }

  // categorySource describes where userCategoryOverride came from, so it rides
  // along in the same patch — a carried category must never land with someone
  // else's provenance, or `categorizeForUser` mistakes it for ground truth.
  if (carried.userCategoryOverride != null) {
    patches.push({
      transaction_id,
      guard: { userCategoryOverride: null },
      data: {
        userCategoryOverride: carried.userCategoryOverride,
        categorySource: carried.categorySource,
      },
    });
  }

  if (carried.userAmountOverride != null) {
    patches.push({
      transaction_id,
      guard: { userAmountOverride: null },
      data: { userAmountOverride: carried.userAmountOverride },
    });
  }

  if (carried.userSoftDeleted) {
    patches.push({
      transaction_id,
      guard: { userSoftDeleted: false },
      data: { userSoftDeleted: true },
    });
  }

  return patches;
};

// Carries user intent onto posted rows that already exist in our DB.
//
// MAINTENANCE: this is the one carry site the compiler cannot check — a new
// CarriedFields column is not a compile error here, so add its branch to
// `patchesFor` above when you add the column.
//
// ORDERING CAVEAT: each guard treats the column's default (null / false) as
// "the user has not set this". That is not strictly true — a user who *clears*
// an override also writes null. If the posted row was created by an earlier
// sync page whose cursor never committed, and the user clears the override
// before the replay, the replay's guard matches and restores the older
// pending-row value. Closing that needs edit ordering (a user-edit timestamp)
// or an atomic carry+delete, neither of which exists yet.
export const carryoverPatches = (
  added: AddedTransaction[],
  carriedByPendingId: Map<string, CarriedFields>
): CarryoverPatch[] => {
  if (!carriedByPendingId.size) return [];

  const patches: CarryoverPatch[] = [];
  for (const t of added) {
    if (!t.pending_transaction_id) continue;
    const carried = carriedByPendingId.get(t.pending_transaction_id);
    if (!carried) continue;
    patches.push(...patchesFor(t.transaction_id, carried));
  }
  return patches;
};

// Applied when the posted row does not exist yet, so the upsert's `create`
// branch carries the user's intent instead of inserting Plaid's raw values.
// Nulls become `undefined` so the column defaults stand.
export const mergeCarriedIntoCreate = <T extends object>(
  data: T,
  carried: CarriedFields | undefined
): T & Partial<CarriedFields> => {
  if (!carried) return data;

  // `satisfies` requires an entry for every CarriedFields key, so a new
  // user-intent column cannot be silently left out of the created row.
  const merged = {
    notes: carried.notes ?? undefined,
    userCategoryOverride: carried.userCategoryOverride ?? undefined,
    categorySource: carried.categorySource ?? undefined,
    userAmountOverride: carried.userAmountOverride ?? undefined,
    userSoftDeleted: carried.userSoftDeleted,
  } satisfies Record<keyof CarriedFields, unknown>;

  return { ...data, ...merged };
};

// True when the row holds anything the user set by hand. `userAmountOverride: 0`
// and `notes: ""` count — only the column defaults mean "untouched".
export const hasUserIntent = (carried: CarriedFields): boolean =>
  carried.notes != null ||
  carried.userCategoryOverride != null ||
  carried.userAmountOverride != null ||
  carried.userSoftDeleted;

// Plaid does not guarantee that a posted transaction's `added` event and its
// pending row's `removed` event land on the same page of one sync — only within
// the same overall update. So a page can delete a pending row before the page
// carrying its posted counterpart arrives, and by then the DB read in
// `buildCarryoverMap` finds nothing.
//
// Recording the intent of every pending row we are about to delete into a
// run-scoped map closes that gap: a later page's `added` resolves against this
// memory instead of the deleted row. Rows with nothing to carry are skipped, and
// an id already present is left alone — the earlier observation is the one taken
// before the row was deleted.
//
// This deliberately does NOT defer the deletes themselves. Deleting per page is
// load-bearing: `computeReportTotals` sums every row in range with no
// superseded-pending dedupe, so a pending row that outlived its page while the
// cursor moved on would double-count the transaction in every report.
export const rememberPendingRows = (
  target: Map<string, CarriedFields>,
  rows: PendingRow[]
): Map<string, CarriedFields> => {
  for (const { transaction_id, ...fields } of rows) {
    if (target.has(transaction_id)) continue;
    if (!hasUserIntent(fields)) continue;
    target.set(transaction_id, fields);
  }
  return target;
};
