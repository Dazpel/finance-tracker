import { z } from "zod";

// All primary keys are UUID strings (v4 today; treat as opaque).
// Zod v4: z.uuid() is the current API (z.string().uuid() is deprecated).
export const UuidSchema = z.uuid();

export const isUuid = (value: unknown): value is string =>
  UuidSchema.safeParse(value).success;
