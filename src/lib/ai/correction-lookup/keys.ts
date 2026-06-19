import type { Flow } from "./types";
import { GENERIC_MERCHANT } from "./constants";

// Stored Plaid convention: expenses POSITIVE, revenue/deposits NEGATIVE.
// Money in (inflow) ⇔ amount < 0. Matches the web UI (`amount < 0` is income),
// report aggregation, and finance-tracker-mobile. See draftReport.ts:140.
export function flowOf(amount: number | null | undefined): Flow {
  return typeof amount === "number" && amount < 0 ? "in" : "out";
}

// Prefer the Plaid-curated merchant name; fall back to the raw description.
// Trimmed + lowercased for stable, case-insensitive matching.
export function normalizeMerchant(
  merchantName: string | null | undefined,
  name: string | null | undefined,
): string {
  return (merchantName?.trim() || name?.trim() || "").toLowerCase();
}

// Stable per-merchant key including flow direction, so a dual-direction
// merchant (e.g. a processor that both pays out and charges fees) does not
// collapse inflow and outflow into one bucket. Returns null for empty or
// too-generic merchants — not safe to learn a deterministic category from.
export function makeCorrectionKey(input: {
  merchantName?: string | null;
  name?: string | null;
  amount?: number | null;
}): string | null {
  const merchant = normalizeMerchant(input.merchantName, input.name);
  if (!merchant) return null;
  if (GENERIC_MERCHANT.test(merchant)) return null;
  return `${merchant}|${flowOf(input.amount)}`;
}
