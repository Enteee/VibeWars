import { describe, expect, it } from "vitest";

import { WEAPONS } from "@vibewars/game-core";

import { REST_FRAME } from "./attack-clock.js";
import { weaponMarkLayout } from "./weapon-mark.js";
import { WEAPON_MARK_GEOMETRY } from "./weapon-mark-geometry.js";

const R = 14;
const IDS = Object.keys(WEAPONS);
const FACINGS = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8);
const ONE_HANDED = ["sword", "axe", "spear", "wand"];
const BOWS = ["shortbow", "longbow", "flatbow", "recurve-bow", "hornbow"];

const pointsOf = (id: string, x = 0, y = 0, r = R, facing = 0) => {
  const { strokes, fills, strings } = weaponMarkLayout(x, y, r, facing, id, REST_FRAME);
  return [...strokes, ...fills, ...strings].flat();
};

describe("weapon mark geometry", () => {
  it("has a mark for every weapon the game has, and no other", () => {
    expect(Object.keys(WEAPON_MARK_GEOMETRY).sort()).toEqual([...IDS].sort());
  });

  it("keeps every point clear of the target ring, at every facing", () => {
    for (const id of IDS) {
      for (const facing of FACINGS) {
        for (const q of pointsOf(id, 0, 0, R, facing)) {
          expect(Math.hypot(q.x, q.y), `${id} at ${String(facing)}`).toBeLessThanOrEqual(
            R + 5.5 + 1e-9,
          );
        }
      }
    }
  });

  it("makes the 14 marks pairwise distinct", () => {
    const seen = new Map<string, string>();
    for (const id of IDS) {
      const key = JSON.stringify(WEAPON_MARK_GEOMETRY[id as keyof typeof WEAPON_MARK_GEOMETRY]);
      expect(seen.get(key), `${id} equals ${seen.get(key) ?? ""}`).toBeUndefined();
      seen.set(key, id);
    }
  });

  it("draws two fists for unarmed, so it has a facing", () => {
    const { strokes, fills } = WEAPON_MARK_GEOMETRY.unarmed;
    expect(fills).toHaveLength(2);
    expect(strokes).toHaveLength(0);
  });

  it("strings each bow from one limb tip to the other, and nothing else", () => {
    for (const id of IDS) {
      const { strokes, strings } = WEAPON_MARK_GEOMETRY[id as keyof typeof WEAPON_MARK_GEOMETRY];
      if (!BOWS.includes(id)) {
        expect(strings, id).toHaveLength(0);
        continue;
      }
      expect(strings, id).toHaveLength(1);
      const limb = strokes[0];
      const [string] = strings;
      expect(string?.[0], id).toEqual(limb?.[0]);
      expect(string?.at(-1), id).toEqual(limb?.at(-1));
    }
  });

  it("holds one-handed weapons on the right, where no off-hand is", () => {
    for (const id of ONE_HANDED) {
      for (const q of pointsOf(id)) {
        expect(q.y, id).toBeGreaterThan(0);
      }
    }
  });
});

describe("weaponMarkLayout", () => {
  it("rotates to the facing and translates to the body", () => {
    const [shaft] = weaponMarkLayout(100, 50, R, Math.PI / 2, "spear", REST_FRAME).strokes;
    // The spear's local (12.5, 7.5): forward is +y on screen, right is −x.
    const tip = shaft?.[1];
    expect(tip?.x).toBeCloseTo(100 - 7.5, 9);
    expect(tip?.y).toBeCloseTo(50 + 12.5, 9);
  });

  it("scales uniformly with the radius", () => {
    const a = pointsOf("longbow", 0, 0, R);
    const b = pointsOf("longbow", 0, 0, 2 * R);
    a.forEach((q, i) => {
      expect(b[i]?.x).toBeCloseTo(2 * q.x, 9);
      expect(b[i]?.y).toBeCloseTo(2 * q.y, 9);
    });
  });

  it("draws nothing for no weapon or one it does not know", () => {
    for (const id of [undefined, "trebuchet"]) {
      expect(weaponMarkLayout(0, 0, R, 0, id, REST_FRAME)).toEqual({
        strokes: [],
        fills: [],
        strings: [],
        alpha: 1,
      });
    }
  });
});
