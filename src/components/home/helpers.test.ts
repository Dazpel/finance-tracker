import { describe, it, expect } from "vitest";
import {
  getFirstName,
  formatMoney,
  computeExceededBudgets,
  buildMonthSummary,
} from "./helpers";

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
