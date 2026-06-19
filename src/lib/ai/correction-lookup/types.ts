import type { CanonicalCategory } from "@lib/categories";

export type Flow = "in" | "out";

// A user-corrected ground-truth row, normalized for map building.
export type GroundTruthRow = {
  merchantName: string | null;
  name: string;
  amount: number | null;
  category: CanonicalCategory;
  // Recency tiebreaker for conflicting corrections on the same key.
  createdAt: Date;
};

export type CorrectionMap = Map<string, CanonicalCategory>;
