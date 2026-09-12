import type { CategorySource } from "@generated/prisma/client";

// When a pending Plaid transaction posts, Plaid sends the posted row as `added`
// (a brand-new transaction_id carrying `pending_transaction_id`) and the pending
// row as `removed`. Nothing about that transition is user-aware, so every column
// holding *user intent* has to be carried across by hand before the pending row
// is deleted — otherwise the user's edit disappears on the next sync.
//
// This is the field set that must survive that transition.
export type CarriedFields = {
  notes: string | null;
  userCategoryOverride: string | null;
  categorySource: CategorySource | null;
  userAmountOverride: number | null;
  userSoftDeleted: boolean;
};

export type PendingRow = CarriedFields & { transaction_id: string };

// A guarded fill for the posted row. `guard` goes into the updateMany WHERE so a
// carry only fills a value the posted row still holds at its default. NOTE: a
// default is not proof the user never edited — see the ordering caveat in
// ./helpers on `carryoverPatches`.
export type CarryoverPatch = {
  transaction_id: string;
  guard: Partial<CarriedFields>;
  data: Partial<CarriedFields>;
};

export type AddedTransaction = {
  transaction_id: string;
  pending_transaction_id?: string | null;
};
