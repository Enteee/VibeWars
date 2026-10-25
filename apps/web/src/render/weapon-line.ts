import { isWeaponId, type WeaponId } from "@vibewars/game-core";

/**
 * The weapon mark (#188, docs/art/art-direction.md "Player mark"): a line
 * from a body's centre the way it faces, with a tip that names what it
 * carries. Mirrors `scripts/assets/player-mark.mjs`, which draws the
 * reference sheet.
 *
 * No Phaser here: plain geometry, so the shapes can be tested in Node.
 */

export type WeaponFamily = "blade" | "axe" | "hammer" | "daggers" | "bow" | "caster" | "unarmed";

const FAMILY: Readonly<Record<WeaponId, WeaponFamily>> = {
  unarmed: "unarmed",
  sword: "blade",
  spear: "blade",
  axe: "axe",
  scythe: "axe",
  hammer: "hammer",
  daggers: "daggers",
  flatbow: "bow",
  shortbow: "bow",
  longbow: "bow",
  "recurve-bow": "bow",
  hornbow: "bow",
  wand: "caster",
  staff: "caster",
};

/** A weapon's family, or `undefined` for none or one this client does not know: draw nothing. */
export function weaponFamily(weaponId: string | undefined): WeaponFamily | undefined {
  return weaponId !== undefined && isWeaponId(weaponId) ? FAMILY[weaponId] : undefined;
}

/** How far past the body's edge the centrelines reach, along the facing. */
export const WEAPON_REACH = 3;

/** The 4 px casing and 2 px core paint around these centrelines. */
export interface WeaponLineLayout {
  /** Open polylines. */
  readonly strokes: readonly (readonly Point[])[];
  /** Filled polygons: the axe's head, the caster's orb. */
  readonly fills: readonly (readonly Point[])[];
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const NOTHING: WeaponLineLayout = { strokes: [], fills: [] };

function polar(from: Point, angle: number, distance: number): Point {
  return { x: from.x + Math.cos(angle) * distance, y: from.y + Math.sin(angle) * distance };
}

/** The weapon mark of a body of radius `r` at (`x`, `y`), facing `facing` radians. */
export function weaponLineLayout(
  x: number,
  y: number,
  r: number,
  facing: number,
  family: WeaponFamily,
): WeaponLineLayout {
  if (family === "unarmed") {
    return NOTHING;
  }
  const a = facing;
  const centre = { x, y };
  const tip = polar(centre, a, r + WEAPON_REACH);
  switch (family) {
    case "blade":
      return { strokes: [[centre, tip]], fills: [] };
    case "axe": {
      // A one-sided head: a triangle hanging off the left of the shaft's end.
      const back = polar(tip, a, -6);
      const out = polar(polar(tip, a, -2), a - Math.PI / 2, 5);
      return { strokes: [[centre, tip]], fills: [[tip, out, back]] };
    }
    case "hammer":
      return {
        strokes: [
          [centre, tip],
          [polar(tip, a - Math.PI / 2, 4), polar(tip, a + Math.PI / 2, 4)],
        ],
        fills: [],
      };
    case "daggers": {
      // Forks 5 before the tip. Prongs of 5.5 at ±30° end 4.76 along the
      // line, inside the reach; the sheet's 6 would end past it.
      const fork = polar(centre, a, r + WEAPON_REACH - 5);
      return {
        strokes: [
          [centre, fork],
          [fork, polar(fork, a - Math.PI / 6, 5.5)],
          [fork, polar(fork, a + Math.PI / 6, 5.5)],
        ],
        fills: [],
      };
    }
    case "bow": {
      // An arc of radius 5 over 140°, bulging outward, its apex at the tip.
      const arcCentre = polar(tip, a, -5);
      const half = (70 * Math.PI) / 180;
      const arc: Point[] = [];
      for (let k = 0; k <= 8; k += 1) {
        arc.push(polar(arcCentre, a - half + (k * 2 * half) / 8, 5));
      }
      return { strokes: [[centre, tip], arc], fills: [] };
    }
    case "caster": {
      // A filled orb of radius 3 whose outer edge is the tip; the line stops at its centre.
      const orbCentre = polar(tip, a, -3);
      const orb: Point[] = [];
      for (let k = 0; k < 12; k += 1) {
        orb.push(polar(orbCentre, (k * Math.PI) / 6, 3));
      }
      return { strokes: [[centre, orbCentre]], fills: [orb] };
    }
  }
}
