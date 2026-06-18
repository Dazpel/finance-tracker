import { z } from "zod";
import { CATEGORY_KEY_TO_CANONICAL_NAME } from "./constants";

const CATEGORY_KEYS = Object.keys(CATEGORY_KEY_TO_CANONICAL_NAME) as [
  keyof typeof CATEGORY_KEY_TO_CANONICAL_NAME,
  ...Array<keyof typeof CATEGORY_KEY_TO_CANONICAL_NAME>
];

export const QuerySchema = z
  .object({
    key: z.enum(CATEGORY_KEYS),
    monthKey: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "monthKey must match YYYY-MM")
      .optional(),
    reportId: z.uuid().optional(),
  })
  .refine((data) => data.reportId != null || data.monthKey != null, {
    message: "Either reportId or monthKey must be provided",
  });

export type Query = z.infer<typeof QuerySchema>;
