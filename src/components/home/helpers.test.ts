import { describe, it, expect } from "vitest";
import {
  getFirstName,
  formatMoney,
  computeExceededBudgets,
  buildMonthSummary,
  classifyConnectionAttention,
} from "./helpers";
import type { ItemStatus } from "@lib/plaid/status/types";

const makeItem = (overrides: Partial<ItemStatus> = {}): ItemStatus => ({
  institutionName: "Chase",
  itemId: "item-1",
  plaidAccountId: "acct-1",
  linkedAt: "2026-01-01T00:00:00.000Z",
  lastLocalSyncAt: null,
  error: null,
  requestFailed: null,
  updateType: null,
  consentExpirationTime: null,
  lastSuccessfulUpdate: null,
  lastFailedUpdate: null,
  lastWebhook: null,
  ...overrides,
});

const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

describe("getFirstName", () => {
  it("returns the first token of a full name, trimmed", () => {
    expect(getFirstName("  Alexander Victoria ")).toBe("Alexander");
  });
  it("returns a single name unchanged", () => {
    expect(getFirstName("Alex")).toBe("Alex");
  });
  it("returns null for empty or missing names", () => {
    expect(getFirstName("")).toBeNull();
    expect(getFirstName("   ")).toBeNull();
    expect(getFirstName(null)).toBeNull();
    expect(getFirstName(undefined)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats whole dollars with a grouping separator and no cents", () => {
    expect(formatMoney(1260)).toBe("$1,260");
    expect(formatMoney(0)).toBe("$0");
  });
  it("rounds to the nearest dollar", () => {
    expect(formatMoney(1260.5)).toBe("$1,261");
  });
  it("formats negatives with a leading minus", () => {
    expect(formatMoney(-1260)).toBe("-$1,260");
  });
});

describe("computeExceededBudgets", () => {
  it("returns only categories where spend strictly exceeds a positive cap", () => {
    const report = { foodAndDrink: 612, groceries: 445, entertainment: 165, shopping: 388 };
    const thresholds = { foodAndDrink: 400, groceries: 400, entertainment: 400, shopping: 300 };

    const result = computeExceededBudgets(report, thresholds);

    expect(result.map((b) => b.key)).toEqual(["foodAndDrink", "groceries", "shopping"]);
    expect(result[0]).toEqual({
      key: "foodAndDrink",
      display: "Food & Drink",
      spent: 612,
      limit: 400,
    });
  });

  it("ignores categories with a zero (unset) cap even when spend is positive", () => {
    const report = { others: 500 };
    const thresholds = { others: 0 };
    expect(computeExceededBudgets(report, thresholds)).toEqual([]);
  });

  it("does not flag a category exactly at its cap (reached, not exceeded)", () => {
    const report = { groceries: 400 };
    const thresholds = { groceries: 400 };
    expect(computeExceededBudgets(report, thresholds)).toEqual([]);
  });

  it("treats missing columns as zero spend", () => {
    expect(computeExceededBudgets({}, { foodAndDrink: 400 })).toEqual([]);
  });
});

describe("buildMonthSummary", () => {
  // Reports store `expenses` as a NEGATIVE total (draftReport.finalizeReportTotals),
  // with total = revenue + expenses. Home must show spend as a positive magnitude.
  it("presents Out as a positive magnitude of the stored negative expenses", () => {
    const summary = buildMonthSummary(
      { revenue: 4200, expenses: -2940, total: 1260 },
      "July 2026"
    );
    expect(summary).toEqual({ in: 4200, out: 2940, net: 1260, label: "July 2026" });
  });

  it("keeps Net signed (negative when spend outpaces income)", () => {
    const summary = buildMonthSummary(
      { revenue: 1000, expenses: -1500, total: -500 },
      "July 2026"
    );
    expect(summary.net).toBe(-500);
    expect(summary.out).toBe(1500);
  });

  it("returns zeros when there is no report for the month", () => {
    expect(buildMonthSummary(null, "July 2026")).toEqual({
      in: 0,
      out: 0,
      net: 0,
      label: "July 2026",
    });
  });
});

describe("classifyConnectionAttention", () => {
  it("returns null for a healthy connection with no expiring consent", () => {
    expect(classifyConnectionAttention(makeItem())).toBeNull();
  });

  it("flags an item error as a danger-tone reconnect", () => {
    const result = classifyConnectionAttention(
      makeItem({ error: { code: "ITEM_LOGIN_REQUIRED", message: "Sign in again" } })
    );
    expect(result).toEqual({
      title: "Reconnect Chase",
      subtitle: "Sign in again",
      tone: "danger",
    });
  });

  it("flags a failed refresh as a re-sync (not a reconnect)", () => {
    const result = classifyConnectionAttention(
      makeItem({ lastFailedUpdate: "2026-07-10T00:00:00.000Z", lastSuccessfulUpdate: null })
    );
    expect(result?.title).toBe("Re-sync Chase");
    expect(result?.tone).toBe("warning");
  });

  it("flags expiring consent as a renewal", () => {
    const result = classifyConnectionAttention(makeItem({ consentExpirationTime: soon }));
    expect(result?.title).toBe("Renew connection to Chase");
    expect(result?.tone).toBe("warning");
    expect(result?.subtitle).toContain("Consent expires");
  });

  it("prioritizes consent renewal over a failed refresh when both apply", () => {
    const result = classifyConnectionAttention(
      makeItem({
        lastFailedUpdate: "2026-07-10T00:00:00.000Z",
        lastSuccessfulUpdate: null,
        consentExpirationTime: soon,
      })
    );
    // Re-syncing cannot extend consent, so renewal must win.
    expect(result?.title).toBe("Renew connection to Chase");
  });

  it("keeps a hard error above expiring consent", () => {
    const result = classifyConnectionAttention(
      makeItem({
        error: { code: "ITEM_LOGIN_REQUIRED", message: "Sign in again" },
        consentExpirationTime: soon,
      })
    );
    expect(result?.title).toBe("Reconnect Chase");
    expect(result?.tone).toBe("danger");
  });
});
