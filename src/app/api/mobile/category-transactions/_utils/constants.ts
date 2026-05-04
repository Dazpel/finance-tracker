// Maps mobile-side CategoryKey values to the canonical Title-Case category
// name returned by resolveCategory (in src/lib/reports/draftReport.ts).
// Single source of truth for the key↔display mapping in this endpoint —
// the wider web app uses display names directly in normalizeCategory.
export const CATEGORY_KEY_TO_CANONICAL_NAME = {
  foodAndDrink: "Food & Drink",
  billsAndUtilities: "Bills & Utilities",
  car: "Car",
  entertainment: "Entertainment",
  groceries: "Groceries",
  healthAndWellness: "Health & Wellness",
  personal: "Personal",
  shopping: "Shopping",
  feesAndAdjustments: "Fees & Adjustments",
  others: "Others",
  foster: "Foster",
  revenue: "Revenue",
} as const;

export type CategoryKey = keyof typeof CATEGORY_KEY_TO_CANONICAL_NAME;
