import type { CategorizeExample } from "@lib/ai/categorize";
import { CANONICAL_CATEGORIES } from "@lib/categories";

const catIndex = (c: CategorizeExample["category"]): number =>
  CANONICAL_CATEGORIES.indexOf(c);

// Deterministic order: by canonical-category position, then name. Frozen order
// matters — a shifting example set is a primary cause of label drift.
function sortDeterministic(
  examples: CategorizeExample[],
): CategorizeExample[] {
  return [...examples].sort((a, b) => {
    const d = catIndex(a.category) - catIndex(b.category);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}

// Caps the number of examples per category to avoid majority-label bias (the
// documented cause of over-predicting a dominant class such as Revenue).
function capPerCategory(
  examples: CategorizeExample[],
  cap: number,
): CategorizeExample[] {
  const counts = new Map<string, number>();
  const out: CategorizeExample[] = [];
  for (const e of sortDeterministic(examples)) {
    const n = counts.get(e.category) ?? 0;
    if (n >= cap) continue;
    counts.set(e.category, n + 1);
    out.push(e);
  }
  return out;
}

// Class-balanced, frozen-order few-shot selection. Fallback examples are
// appended only when the user has fewer than `minUser` of their own.
export function selectBalancedExamples(
  userExamples: CategorizeExample[],
  fallback: CategorizeExample[],
  opts: { minUser: number; max: number; perCategoryCap: number },
): CategorizeExample[] {
  const capped = capPerCategory(userExamples, opts.perCategoryCap);
  const base =
    capped.length >= opts.minUser
      ? capped
      : [...capped, ...sortDeterministic(fallback)];
  return base.slice(0, opts.max);
}
