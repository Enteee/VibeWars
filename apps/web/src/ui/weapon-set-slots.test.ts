import { describe, expect, it } from "vitest";

import type { WireWeaponSets } from "@vibewars/game-protocol";

import { weaponSetSlots } from "./weapon-set-slots.js";

describe("the weapon-set slots (#489)", () => {
  const sets: WireWeaponSets = {
    sets: [
      { weaponId: "sword", offhandId: "shield" },
      { weaponId: "recurve-bow", offhandId: null },
      null,
      null,
    ],
    active: 0,
    pending: 1,
  };

  it("lights the set in hand, outlines the queued one and dims the empty ones", () => {
    const slots = weaponSetSlots(sets);
    expect(slots.map(({ active, queued, empty }) => ({ active, queued, empty }))).toEqual([
      { active: true, queued: false, empty: false },
      { active: false, queued: true, empty: false },
      { active: false, queued: false, empty: true },
      { active: false, queued: false, empty: true },
    ]);
    expect(slots[0]?.weapon?.name).toBe("Sword");
    expect(slots[0]?.offhand?.name).toBe("Shield");
    expect(slots[1]?.offhand).toBeUndefined();
    expect(slots[2]).toMatchObject({ weapon: undefined, name: "Weapon set 3: empty" });
    expect(slots[0]?.name).toBe("Weapon set 1: Sword and Shield");
  });

  it("shows every slot empty until the host has said", () => {
    expect(weaponSetSlots(undefined).every((slot) => slot.empty && !slot.active)).toBe(true);
  });
});
