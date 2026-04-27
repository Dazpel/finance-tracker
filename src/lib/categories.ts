// Canonical category labels written to Transaction.category[0] and SyncedTransaction.userCategoryOverride.
// Mirrors defaultCategoryFilterOptions in src/utils/constants.ts (excluding the UI-only "All"/"None").
export const CANONICAL_CATEGORIES = [
  "Food & Drink",
  "Bills & Utilities",
  "Car",
  "Entertainment",
  "Groceries",
  "Health & Wellness",
  "Personal",
  "Shopping",
  "Fees & Adjustments",
  "Others",
  "Revenue",
  "Foster",
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

export function isCanonicalCategory(value: string): value is CanonicalCategory {
  return (CANONICAL_CATEGORIES as readonly string[]).includes(value);
}
