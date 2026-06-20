import { describe, it, expect } from "vitest";
import { flowOf, normalizeMerchant, makeCorrectionKey } from "./keys";

describe("flowOf", () => {
  it("treats negative as inflow (money in)", () => {
    expect(flowOf(-100)).toBe("in");
  });
  it("treats positive as outflow (expense)", () => {
    expect(flowOf(25)).toBe("out");
  });
  it("treats zero/null/undefined as outflow", () => {
    expect(flowOf(0)).toBe("out");
    expect(flowOf(null)).toBe("out");
    expect(flowOf(undefined)).toBe("out");
  });
});

describe("normalizeMerchant", () => {
  it("prefers merchant_name, lowercased + trimmed", () => {
    expect(normalizeMerchant("  Whole Foods ", "WF STORE 123")).toBe(
      "whole foods",
    );
  });
  it("falls back to name when merchant missing", () => {
    expect(normalizeMerchant(null, "  Shell Oil ")).toBe("shell oil");
  });
  it("returns empty string when both missing", () => {
    expect(normalizeMerchant(null, "")).toBe("");
  });
});

describe("makeCorrectionKey", () => {
  it("combines merchant and flow", () => {
    expect(
      makeCorrectionKey({ merchantName: "Stripe", name: "x", amount: -500 }),
    ).toBe("stripe|in");
    expect(
      makeCorrectionKey({ merchantName: "Stripe", name: "x", amount: 5 }),
    ).toBe("stripe|out");
  });
  it("returns null for empty merchant", () => {
    expect(
      makeCorrectionKey({ merchantName: "", name: "", amount: -1 }),
    ).toBeNull();
  });
  it("returns null for generic merchants", () => {
    expect(
      makeCorrectionKey({ merchantName: "POS DEBIT", name: "x", amount: -1 }),
    ).toBeNull();
  });
});
