import { describe, it, expect } from "vitest";
import {
  buildCarryoverMap,
  carryoverPatches,
  mergeCarriedIntoCreate,
  type CarriedFields,
  type PendingRow,
} from "./carryover";

const pending = (overrides: Partial<PendingRow> = {}): PendingRow => ({
  transaction_id: "pending-1",
  notes: null,
  userCategoryOverride: null,
  categorySource: null,
  userAmountOverride: null,
  userSoftDeleted: false,
  ...overrides,
});

const carried = (overrides: Partial<CarriedFields> = {}): CarriedFields => {
  const { transaction_id: _ignored, ...fields } = pending(overrides);
  return fields;
};

const posted = (pendingId: string | null, id = "posted-1") => ({
  transaction_id: id,
  pending_transaction_id: pendingId,
});

describe("buildCarryoverMap", () => {
  it("keys each pending row's user intent by its transaction_id", () => {
    const map = buildCarryoverMap([
      pending({ transaction_id: "p-1", notes: "tip added" }),
      pending({ transaction_id: "p-2", userAmountOverride: 42.5 }),
    ]);

    expect(map.get("p-1")?.notes).toBe("tip added");
    expect(map.get("p-2")?.userAmountOverride).toBe(42.5);
  });
});

describe("carryoverPatches", () => {
  it("carries userAmountOverride onto the posted row", () => {
    const map = buildCarryoverMap([
      pending({ transaction_id: "p-1", userAmountOverride: 31.75 }),
    ]);

    const patches = carryoverPatches([posted("p-1")], map);

    expect(patches).toEqual([
      {
        transaction_id: "posted-1",
        guard: { userAmountOverride: null },
        data: { userAmountOverride: 31.75 },
      },
    ]);
  });

  it("guards an amount carry so an edit already made on the posted row wins", () => {
    const map = buildCarryoverMap([
      pending({ transaction_id: "p-1", userAmountOverride: 31.75 }),
    ]);

    const [patch] = carryoverPatches([posted("p-1")], map);

    expect(patch.guard).toEqual({ userAmountOverride: null });
  });

  it("carries an amount override of zero", () => {
    const map = buildCarryoverMap([
      pending({ transaction_id: "p-1", userAmountOverride: 0 }),
    ]);

    const patches = carryoverPatches([posted("p-1")], map);

    expect(patches).toHaveLength(1);
    expect(patches[0].data).toEqual({ userAmountOverride: 0 });
  });

  it("keeps categorySource paired with the userCategoryOverride it describes", () => {
    const map = buildCarryoverMap([
      pending({
        transaction_id: "p-1",
        userCategoryOverride: "Groceries",
        categorySource: "user",
      }),
    ]);

    const patches = carryoverPatches([posted("p-1")], map);

    expect(patches).toEqual([
      {
        transaction_id: "posted-1",
        guard: { userCategoryOverride: null },
        data: { userCategoryOverride: "Groceries", categorySource: "user" },
      },
    ]);
  });

  it("carries notes guarded on the posted row having none", () => {
    const map = buildCarryoverMap([
      pending({ transaction_id: "p-1", notes: "split with Ana" }),
    ]);

    expect(carryoverPatches([posted("p-1")], map)).toEqual([
      {
        transaction_id: "posted-1",
        guard: { notes: null },
        data: { notes: "split with Ana" },
      },
    ]);
  });

  it("carries a soft delete guarded on the posted row not already deleted", () => {
    const map = buildCarryoverMap([
      pending({ transaction_id: "p-1", userSoftDeleted: true }),
    ]);

    expect(carryoverPatches([posted("p-1")], map)).toEqual([
      {
        transaction_id: "posted-1",
        guard: { userSoftDeleted: false },
        data: { userSoftDeleted: true },
      },
    ]);
  });

  it("emits one patch per carried field when the user edited several", () => {
    const map = buildCarryoverMap([
      pending({
        transaction_id: "p-1",
        notes: "n",
        userCategoryOverride: "Groceries",
        categorySource: "user",
        userAmountOverride: 12,
        userSoftDeleted: true,
      }),
    ]);

    const patches = carryoverPatches([posted("p-1")], map);

    expect(patches.map((p) => Object.keys(p.guard)[0]).sort()).toEqual([
      "notes",
      "userAmountOverride",
      "userCategoryOverride",
      "userSoftDeleted",
    ]);
  });

  it("emits nothing for an added row with no pending predecessor", () => {
    const map = buildCarryoverMap([
      pending({ transaction_id: "p-1", userAmountOverride: 10 }),
    ]);

    expect(carryoverPatches([posted(null)], map)).toEqual([]);
  });

  it("emits nothing when the pending predecessor is not in the map", () => {
    expect(carryoverPatches([posted("p-unknown")], buildCarryoverMap([]))).toEqual([]);
  });

  it("emits nothing when the pending row carried no user intent", () => {
    const map = buildCarryoverMap([pending({ transaction_id: "p-1" })]);

    expect(carryoverPatches([posted("p-1")], map)).toEqual([]);
  });
});

describe("mergeCarriedIntoCreate", () => {
  const base = { transaction_id: "posted-1", amount: 20 };

  it("puts a carried amount override on the row it creates", () => {
    const merged = mergeCarriedIntoCreate(
      base,
      carried({ userAmountOverride: 31.75 })
    );

    expect(merged.userAmountOverride).toBe(31.75);
  });

  it("creates the row with the carried category's provenance", () => {
    const merged = mergeCarriedIntoCreate(
      base,
      carried({ userCategoryOverride: "Groceries", categorySource: "user" })
    );

    expect(merged.userCategoryOverride).toBe("Groceries");
    expect(merged.categorySource).toBe("user");
  });

  it("returns the base data untouched when there is nothing to carry", () => {
    expect(mergeCarriedIntoCreate(base, undefined)).toEqual(base);
  });

  it("omits absent overrides so column defaults apply", () => {
    const merged = mergeCarriedIntoCreate(base, carried({ notes: "n" }));

    expect(merged.notes).toBe("n");
    expect(merged.userAmountOverride).toBeUndefined();
    expect(merged.userCategoryOverride).toBeUndefined();
  });
});
