import { describe, expect, it } from "vitest";

import type { WireWeaponSets } from "@vibewars/game-protocol";

import { weaponSetIntent, weaponSetOf } from "./weapon-set-keys.js";

const SETS: WireWeaponSets = {
  sets: [{ weaponId: "sword", offhandId: null }, { weaponId: "axe", offhandId: null }, null, null],
  active: 0,
  pending: null,
};

describe("weapon-set keys and clicks (#489)", () => {
  it("send the swap for a carried set, the active one included", () => {
    expect(weaponSetIntent(SETS, 1)).toEqual({ kind: "weapon-set", set: 1 });
    expect(weaponSetIntent(SETS, 0)).toEqual({ kind: "weapon-set", set: 0 });
  });

  it("send nothing for an empty set, or before the host has said", () => {
    expect(weaponSetIntent(SETS, 2)).toBeUndefined();
    expect(weaponSetIntent(undefined, 0)).toBeUndefined();
  });

  it("map the four actions to sets 0-3, and nothing else", () => {
    expect(weaponSetOf("weapon-set-1")).toBe(0);
    expect(weaponSetOf("weapon-set-4")).toBe(3);
    expect(weaponSetOf("skill-1")).toBeUndefined();
  });
});
