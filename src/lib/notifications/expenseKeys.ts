import { NotificationLevel } from "@prisma/client";

// Column keys on ExpenseThreshold AND on Report that hold per-category dollar
// totals. Order matches CANONICAL_CATEGORIES (excluding Revenue) for stable
// iteration in alerts.
export const EXPENSE_KEYS = [
  "foodAndDrink",
  "billsAndUtilities",
  "car",
  "entertainment",
  "groceries",
  "healthAndWellness",
  "personal",
  "shopping",
  "feesAndAdjustments",
  "others",
  "foster",
] as const;

export type ExpenseKey = (typeof EXPENSE_KEYS)[number];

// Display name shown in emails / push for each column key.
export const EXPENSE_KEY_TO_DISPLAY: Record<ExpenseKey, string> = {
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
};

// Returns levels in fire order (warning → reached → exceeded). Empty array
// when limit <= 0 (treated as "no threshold for this category").
export function levelsCrossed(spent: number, limit: number): NotificationLevel[] {
  if (limit <= 0) return [];
  const out: NotificationLevel[] = [];
  if (spent >= limit * 0.7) out.push("WARNING_70");
  if (spent >= limit) out.push("REACHED_100");
  if (spent > limit) out.push("EXCEEDED");
  return out;
}
