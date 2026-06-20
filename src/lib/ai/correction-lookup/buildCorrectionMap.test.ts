import { describe, it, expect } from "vitest";
import { buildCorrectionMap } from "./buildCorrectionMap";
import type { GroundTruthRow } from "./types";

const row = (o: Partial<GroundTruthRow>): GroundTruthRow => ({
  merchantName: "Acme",
  name: "Acme",
  amount: -100,
  category: "Revenue",
  createdAt: new Date("2026-01-01"),
  ...o,
});

describe("buildCorrectionMap", () => {
  it("maps a single correction by merchant|flow", () => {
    const m = buildCorrectionMap([row({})]);
    expect(m.get("acme|in")).toBe("Revenue");
  });

  it("keeps inflow and outflow of same merchant separate", () => {
    const m = buildCorrectionMap([
      row({ amount: -100, category: "Revenue" }),
      row({ amount: 100, category: "Fees & Adjustments" }),
    ]);
    expect(m.get("acme|in")).toBe("Revenue");
    expect(m.get("acme|out")).toBe("Fees & Adjustments");
  });

  it("majority vote wins conflicts", () => {
    const m = buildCorrectionMap([
      row({ category: "Revenue" }),
      row({ category: "Revenue" }),
      row({ category: "Others" }),
    ]);
    expect(m.get("acme|in")).toBe("Revenue");
  });

  it("most-recent breaks ties", () => {
    const m = buildCorrectionMap([
      row({ category: "Others", createdAt: new Date("2026-01-01") }),
      row({ category: "Revenue", createdAt: new Date("2026-05-01") }),
    ]);
    expect(m.get("acme|in")).toBe("Revenue");
  });

  it("is order-independent", () => {
    const rows = [
      row({ category: "Others", createdAt: new Date("2026-01-01") }),
      row({ category: "Revenue", createdAt: new Date("2026-05-01") }),
    ];
    expect(buildCorrectionMap(rows).get("acme|in")).toBe(
      buildCorrectionMap([...rows].reverse()).get("acme|in"),
    );
  });

  it("skips generic merchants", () => {
    const m = buildCorrectionMap([
      row({ merchantName: "POS 123", name: "POS 123" }),
    ]);
    expect(m.size).toBe(0);
  });
});
