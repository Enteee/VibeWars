import { describe, expect, it } from "vitest";

import { WEAPONS } from "@vibewars/game-core";

import { WEAPON_REACH, weaponFamily, weaponLineLayout, type WeaponFamily } from "./weapon-line.js";

const R = 14;
const FAMILIES: readonly WeaponFamily[] = ["blade", "axe", "hammer", "daggers", "bow", "caster"];

describe("weaponFamily", () => {
  it("maps every weapon the game has", () => {
    for (const id of Object.keys(WEAPONS)) {
      expect(weaponFamily(id), id).toBeDefined();
    }
  });

  it("groups them as the art direction says", () => {
    expect(weaponFamily("sword")).toBe("blade");
    expect(weaponFamily("spear")).toBe("blade");
    expect(weaponFamily("scythe")).toBe("axe");
    expect(weaponFamily("hammer")).toBe("hammer");
    expect(weaponFamily("daggers")).toBe("daggers");
    expect(weaponFamily("recurve-bow")).toBe("bow");
    expect(weaponFamily("staff")).toBe("caster");
    expect(weaponFamily("unarmed")).toBe("unarmed");
  });

  it("draws nothing for no weapon or one it does not know", () => {
    expect(weaponFamily(undefined)).toBeUndefined();
    expect(weaponFamily("trebuchet")).toBeUndefined();
  });
});

describe("weaponLineLayout", () => {
  it("runs from the centre to r + 3 the way the body faces", () => {
    for (const [facing, x, y] of [
      [0, 100 + R + WEAPON_REACH, 100],
      [Math.PI / 2, 100, 100 + R + WEAPON_REACH],
      [Math.PI, 100 - R - WEAPON_REACH, 100],
    ] as const) {
      const [shaft] = weaponLineLayout(100, 100, R, facing, "blade").strokes;
      expect(shaft?.[0]).toEqual({ x: 100, y: 100 });
      expect(shaft?.[1]?.x).toBeCloseTo(x, 9);
      expect(shaft?.[1]?.y).toBeCloseTo(y, 9);
    }
  });

  it("reaches no further than r + 3 along the facing, for every family and way", () => {
    for (const family of FAMILIES) {
      for (const facing of [0, 1, Math.PI / 2, 2.5, Math.PI, -2]) {
        const { strokes, fills } = weaponLineLayout(0, 0, R, facing, family);
        for (const point of [...strokes, ...fills].flat()) {
          const along = point.x * Math.cos(facing) + point.y * Math.sin(facing);
          expect(along, `${family} at ${String(facing)}`).toBeLessThanOrEqual(
            R + WEAPON_REACH + 1e-9,
          );
        }
      }
    }
  });

  it("draws nothing for an unarmed body", () => {
    expect(weaponLineLayout(0, 0, R, 0, "unarmed")).toEqual({ strokes: [], fills: [] });
  });
});
