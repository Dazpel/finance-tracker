import { z } from "zod";
import { EXPENSE_KEYS } from "./expenseKeys";

// Partial body: any subset of expense column keys, each a non-negative
// number under 1_000_000. Reject unknown keys. Shared by the web
// (PUT /api/prisma/thresholds/update) and mobile (PATCH /api/mobile/thresholds) routes.
export const thresholdUpdateSchema = z
  .object(
    Object.fromEntries(
      EXPENSE_KEYS.map((k) => [k, z.number().min(0).lt(1_000_000).optional()])
    )
  )
  .strict();

export type ThresholdUpdateInput = z.infer<typeof thresholdUpdateSchema>;
