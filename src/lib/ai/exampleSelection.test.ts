import { describe, it, expect } from "vitest";
import { selectBalancedExamples } from "./exampleSelection";
import type { CategorizeExample } from "./categorize";

const ex = (
  name: string,
  category: CategorizeExample["category"],
): CategorizeExample => ({ name, category });

describe("selectBalancedExamples", () => {
  it("caps examples per category", () => {
    const user = [
      ex("a", "Revenue"),
      ex("b", "Revenue"),
      ex("c", "Revenue"),
      ex("d", "Groceries"),
    ];
    const out = selectBalancedExamples(user, [], {
      minUser: 1,
      max: 30,
      perCategoryCap: 2,
    });
    expect(out.filter((e) => e.category === "Revenue").length).toBe(2);
    expect(out.filter((e) => e.category === "Groceries").length).toBe(1);
  });

  it("is deterministic regardless of input order", () => {
    const a = [ex("z", "Groceries"), ex("a", "Revenue")];
    const b = [ex("a", "Revenue"), ex("z", "Groceries")];
    const opts = { minUser: 1, max: 30, perCategoryCap: 5 };
    expect(selectBalancedExamples(a, [], opts)).toEqual(
      selectBalancedExamples(b, [], opts),
    );
  });

  it("appends fallback when below minUser", () => {
    const user = [ex("a", "Revenue")];
    const fb = [ex("Whole Foods", "Groceries")];
    const out = selectBalancedExamples(user, fb, {
      minUser: 5,
      max: 30,
      perCategoryCap: 5,
    });
    expect(out.some((e) => e.name === "Whole Foods")).toBe(true);
  });

  it("does not append fallback when at/above minUser", () => {
    const user = [ex("a", "Revenue"), ex("b", "Groceries")];
    const fb = [ex("Whole Foods", "Groceries")];
    const out = selectBalancedExamples(user, fb, {
      minUser: 2,
      max: 30,
      perCategoryCap: 5,
    });
    expect(out.some((e) => e.name === "Whole Foods")).toBe(false);
  });

  it("caps total at max", () => {
    const user = Array.from({ length: 50 }, (_, i) => ex(`m${i}`, "Shopping"));
    const out = selectBalancedExamples(user, [], {
      minUser: 1,
      max: 10,
      perCategoryCap: 100,
    });
    expect(out.length).toBe(10);
  });
});
