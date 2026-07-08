// Canonical category labels written to Transaction.category[0] and SyncedTransaction.userCategoryOverride.
// Source of truth for category names: defaultCategoryFilterOptions in src/utils/constants.ts is derived
// from this list (with the UI-only "All"/"None" prepended).
export const CANONICAL_CATEGORIES = [
  "Food & Drink",
  "Bills & Utilities",
  "Car",
  "Entertainment",
  "Groceries",
  "Charity",
  "Health & Wellness",
  "Personal",
  "Shopping",
  "Fees & Adjustments",
  "Others",
  "Revenue",
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

export function isCanonicalCategory(value: string): value is CanonicalCategory {
  return (CANONICAL_CATEGORIES as readonly string[]).includes(value);
}
