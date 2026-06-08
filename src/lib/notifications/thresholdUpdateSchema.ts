import { z } from "zod";
import { EXPENSE_KEYS, type ExpenseKey } from "./expenseKeys";

// One field rule: a non-negative dollar amount under 1_000_000, optional so the
// request body can be a partial update of any subset of categories.
const field = z.number().min(0).lt(1_000_000).optional();

// Build the shape from EXPENSE_KEYS (single source of truth), but cast to a
// Record keyed by ExpenseKey. `Object.fromEntries` on its own widens the keys to
// a `string` index signature, which would erase the key union from
// `z.infer<typeof thresholdUpdateSchema>` (it would degrade to
// Record<string, number | undefined>) and weaken type safety for callers.
const shape = Object.fromEntries(
  EXPENSE_KEYS.map((k) => [k, field])
) as Record<ExpenseKey, typeof field>;

// Partial body: any subset of expense column keys, each a non-negative number
// under 1_000_000. Reject unknown keys. Shared by the web
// (PUT /api/prisma/thresholds/update) and mobile (PATCH /api/mobile/thresholds) routes.
export const thresholdUpdateSchema = z.object(shape).strict();

export type ThresholdUpdateInput = z.infer<typeof thresholdUpdateSchema>;
