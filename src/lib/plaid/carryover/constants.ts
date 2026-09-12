import type { CarriedFields } from "./types";

// Prisma `select` for reading the pending rows before they are deleted.
//
// The `satisfies` clause is load-bearing: it requires a key for every field in
// CarriedFields, so adding a user-intent column to that type fails to compile
// right here. That break is the prompt to also handle the new column in
// `carryoverPatches` and `mergeCarriedIntoCreate` (./helpers) — the compiler
// enforces the first of those two on its own, the other is on you.
export const CARRIED_SELECT = {
  transaction_id: true,
  notes: true,
  userCategoryOverride: true,
  categorySource: true,
  userAmountOverride: true,
  userSoftDeleted: true,
} as const satisfies Record<"transaction_id" | keyof CarriedFields, true>;
