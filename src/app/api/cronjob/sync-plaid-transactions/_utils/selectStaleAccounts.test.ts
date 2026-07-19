import { describe, it, expect } from "vitest";
import { prioritizeStaleAccounts } from "./selectStaleAccounts";
import type { StaleCandidate } from "./selectStaleAccounts";

const account = (id: string, lastSyncAt: Date | null): StaleCandidate => ({
  id,
  cursor: lastSyncAt ? { lastSyncAt } : null,
});

describe("prioritizeStaleAccounts", () => {
  it("sorts never-synced (null cursor) accounts before synced ones", () => {
    const candidates = [
      account("synced", new Date("2026-07-01")),
      account("never-synced", null),
    ];
    const out = prioritizeStaleAccounts(candidates, 10);
    expect(out.map((c) => c.id)).toEqual(["never-synced", "synced"]);
  });

  it("sorts synced accounts by oldest lastSyncAt first", () => {
    const candidates = [
      account("newer", new Date("2026-07-15")),
      account("older", new Date("2026-07-01")),
      account("newest", new Date("2026-07-18")),
    ];
    const out = prioritizeStaleAccounts(candidates, 10);
    expect(out.map((c) => c.id)).toEqual(["older", "newer", "newest"]);
  });

  it("puts multiple null-cursor accounts all before synced accounts", () => {
    const candidates = [
      account("synced-1", new Date("2026-07-01")),
      account("never-synced-1", null),
      account("synced-2", new Date("2026-07-02")),
      account("never-synced-2", null),
    ];
    const out = prioritizeStaleAccounts(candidates, 10);
    expect(out.slice(0, 2).map((c) => c.id).sort()).toEqual([
      "never-synced-1",
      "never-synced-2",
    ]);
    expect(out.slice(2).map((c) => c.id)).toEqual(["synced-1", "synced-2"]);
  });

  it("caps the result to max", () => {
    const candidates = Array.from({ length: 5 }, (_, i) =>
      account(`acc-${i}`, new Date(2026, 6, i + 1))
    );
    const out = prioritizeStaleAccounts(candidates, 2);
    expect(out.length).toBe(2);
  });

  it("returns an empty array for empty input", () => {
    expect(prioritizeStaleAccounts([], 10)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const candidates = [
      account("b", new Date("2026-07-15")),
      account("a", new Date("2026-07-01")),
    ];
    const copy = [...candidates];
    prioritizeStaleAccounts(candidates, 10);
    expect(candidates).toEqual(copy);
  });
});
