import type { CanonicalCategory } from "@lib/categories";
import type { CorrectionMap, GroundTruthRow } from "./types";
import { makeCorrectionKey } from "./keys";

// Builds a deterministic merchant→category map from user-corrected ground
// truth. On conflicting corrections for the same key: majority vote wins; ties
// break toward the most recent correction; a remaining exact tie breaks
// lexicographically by category name. Deterministic given the same input set,
// independent of input order.
export function buildCorrectionMap(rows: GroundTruthRow[]): CorrectionMap {
  const tally = new Map<
    string,
    Map<CanonicalCategory, { count: number; latest: number }>
  >();

  for (const row of rows) {
    const key = makeCorrectionKey(row);
    if (!key) continue;
    const byCat =
      tally.get(key) ??
      new Map<CanonicalCategory, { count: number; latest: number }>();
    const ts = row.createdAt.getTime();
    const cur = byCat.get(row.category) ?? { count: 0, latest: 0 };
    cur.count += 1;
    if (ts > cur.latest) cur.latest = ts;
    byCat.set(row.category, cur);
    tally.set(key, byCat);
  }

  const map: CorrectionMap = new Map();
  for (const [key, byCat] of tally) {
    let best: CanonicalCategory | null = null;
    let bestCount = -1;
    let bestLatest = -1;
    for (const [cat, { count, latest }] of byCat) {
      const better =
        count > bestCount ||
        (count === bestCount && latest > bestLatest) ||
        (count === bestCount &&
          latest === bestLatest &&
          (best === null || cat < best));
      if (better) {
        best = cat;
        bestCount = count;
        bestLatest = latest;
      }
    }
    if (best) map.set(key, best);
  }
  return map;
}
