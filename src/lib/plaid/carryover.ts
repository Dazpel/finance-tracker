import type { CategorySource } from "@generated/prisma/client";

// When a pending Plaid transaction posts, Plaid sends the posted row as `added`
// (a brand-new transaction_id carrying `pending_transaction_id`) and the pending
// row as `removed`. Nothing about that transition is user-aware, so every column
// that holds *user intent* has to be carried across by hand before the pending
// row is deleted — otherwise the user's edit disappears on the next sync.
//
// This module is the single source of truth for that field set. Adding a
// user-intent column to SyncedTransaction means adding it here; `CARRIED_SELECT`,
// the patches, and the create merge all derive from `CarriedFields`, so the
// typechecker catches a column that is declared but not carried.
export type CarriedFields = {
  notes: string | null;
  userCategoryOverride: string | null;
  categorySource: CategorySource | null;
  userAmountOverride: number | null;
  userSoftDeleted: boolean;
};

export type PendingRow = CarriedFields & { transaction_id: string };

// Prisma `select` for reading the pending rows. Kept next to `CarriedFields` so
// the read and the carry can't drift apart.
export const CARRIED_SELECT = {
  transaction_id: true,
  notes: true,
  userCategoryOverride: true,
  categorySource: true,
  userAmountOverride: true,
  userSoftDeleted: true,
} as const;

// A guarded fill for the posted row. `guard` goes into the updateMany WHERE so a
// carry only ever fills a value the user hasn't already set on the posted row
// (which happens when a prior partial sync created it and the user edited it
// there) — we never clobber the newer edit.
export type CarryoverPatch = {
  transaction_id: string;
  guard: Partial<CarriedFields>;
  data: Partial<CarriedFields>;
};

type AddedTransaction = {
  transaction_id: string;
  pending_transaction_id?: string | null;
};

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
  return {
    ...data,
    notes: carried.notes ?? undefined,
    userCategoryOverride: carried.userCategoryOverride ?? undefined,
    categorySource: carried.categorySource ?? undefined,
    userAmountOverride: carried.userAmountOverride ?? undefined,
    userSoftDeleted: carried.userSoftDeleted,
  };
};
