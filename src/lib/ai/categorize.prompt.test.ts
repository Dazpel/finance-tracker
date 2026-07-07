import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT } from "./categorize";
import { CANONICAL_CATEGORIES } from "@lib/categories";

// Guards the AI-tier system prompt against category drift. Category behavior
// lives only in this prompt string (no deterministic signal path for e.g.
// Charity), so a rename in @lib/categories that isn't reflected here regresses
// silently. These assertions run without an LLM call.
describe("categorize SYSTEM_PROMPT ↔ CANONICAL_CATEGORIES", () => {
  it("lists the exact canonical set for the model to choose from", () => {
    expect(SYSTEM_PROMPT).toContain(CANONICAL_CATEGORIES.join(", "));
  });

  it("routes to Charity, not the removed 'Foster' category", () => {
    expect(SYSTEM_PROMPT).toMatch(/=> Charity/);
    expect(SYSTEM_PROMPT).not.toMatch(/\bFoster\b/);
  });

  it("mentions every canonical category by name", () => {
    for (const category of CANONICAL_CATEGORIES) {
      expect(SYSTEM_PROMPT, `prompt omits "${category}"`).toContain(category);
    }
  });
});
