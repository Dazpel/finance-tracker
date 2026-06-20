import { describe, it, expect } from "vitest";
import { detectStrongSignal } from "./categorize";

// Stored convention: revenue/deposits NEGATIVE, expenses POSITIVE.
describe("detectStrongSignal revenue gate", () => {
  it("payroll DEPOSIT (negative amount) is Revenue", () => {
    expect(
      detectStrongSignal({
        name: "ACME Payroll",
        plaidCategory: ["Transfer", "Payroll"],
        amount: -2000,
        merchantName: null,
      }),
    ).toBe("Revenue");
  });

  it("vendor expense named payroll (positive amount) is NOT Revenue", () => {
    expect(
      detectStrongSignal({
        name: "Gusto Subscription",
        plaidCategory: ["Service", "Subscription"],
        amount: 40,
        merchantName: "Gusto",
      }),
    ).not.toBe("Revenue");
  });

  it("transfer-root inflow (negative) is Revenue", () => {
    expect(
      detectStrongSignal({
        name: "Zelle From X",
        plaidCategory: ["Transfer"],
        amount: -150,
        merchantName: null,
      }),
    ).toBe("Revenue");
  });

  it("deterministic outflow leaves are unaffected by the sign fix", () => {
    expect(
      detectStrongSignal({
        name: "Shell",
        plaidCategory: ["Travel", "Gas Stations"],
        amount: 40,
        merchantName: "Shell",
      }),
    ).toBe("Car");
  });
});
