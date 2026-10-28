import type { WireWeaponSets } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { weaponSetIntent } from "./weapon-set-keys.js";

/** A sword in set 1, a bow in set 2, sets 3 and 4 empty. */
const SETS: WireWeaponSets = {
  sets: [
    { weaponId: "sword", offhandId: "shield" },
    { weaponId: "recurve-bow", offhandId: null },
    null,
    null,
  ],
  active: 0,
  pending: null,
};

describe("weaponSetIntent (#489)", () => {
  it("swaps to a carried set, the one in hand included", () => {
    expect(weaponSetIntent("weapon-set-2", SETS)).toEqual({ kind: "weapon-set", set: 1 });
    // The active set's key is sent: it drops a queued swap.
    expect(weaponSetIntent("weapon-set-1", SETS)).toEqual({ kind: "weapon-set", set: 0 });
  });

  it("sends nothing for an empty set, sets not yet known, or another action", () => {
    expect(weaponSetIntent("weapon-set-3", SETS)).toBeUndefined();
    expect(weaponSetIntent("weapon-set-4", SETS)).toBeUndefined();
    expect(weaponSetIntent("weapon-set-2", undefined)).toBeUndefined();
    expect(weaponSetIntent("skill-1", SETS)).toBeUndefined();
  });
});
