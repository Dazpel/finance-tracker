import { describe, it, expect } from "vitest";
import { categorizeBatch } from "./categorize";

// Exercises only the deterministic paths (lookup + signal) — no LLM call.
describe("categorizeBatch precedence (no LLM)", () => {
  it("correction map wins, tagged 'lookup'", async () => {
    const map = new Map([["stripe|in", "Revenue" as const]]);
    const out = await categorizeBatch(
      [
        {
          id: "1",
          name: "Stripe",
          merchantName: "Stripe",
          plaidCategory: ["Service"],
          amount: -500,
        },
      ],
      [],
      map,
    );
    expect(out.get("1")).toEqual({ category: "Revenue", source: "lookup" });
  });

  it("falls back to deterministic signal, tagged 'signal'", async () => {
    const out = await categorizeBatch(
      [
        {
          id: "2",
          name: "Shell",
          merchantName: "Shell",
          plaidCategory: ["Travel", "Gas Stations"],
          amount: 40,
        },
      ],
      [],
      new Map(),
    );
    expect(out.get("2")).toEqual({ category: "Car", source: "signal" });
  });
});
