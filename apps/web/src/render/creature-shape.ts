import type { CreatureLook } from "@vibewars/game-core";

import type { Point } from "./weapon-mark-geometry.js";

/**
 * A creature's body (#1162, #1158 direction C): never a circle. Every
 * creature, pets included, is a hexagon plate, pointy top, upright whatever
 * its facing. Picking and collision stay the circle of its radius.
 *
 * No Phaser here: plain geometry, so the shapes can be tested in Node.
 */

/** A hexagon plate's circumradius, against the creature's radius. */
export const HEXAGON_SCALE = 1.1;
/** A dead pet's dash and gap (#1046), against its radius: the study's `3 2` at radius 10. */
export const DEAD_DASH = 0.3;
export const DEAD_GAP = 0.2;

/** The closed outline of a creature of radius `r` at (`x`, `y`). */
export function creatureOutline(x: number, y: number, r: number): readonly Point[] {
  // A vertex straight up and one straight down: pointy top.
  return Array.from({ length: 6 }, (_, k) => {
    const angle = Math.PI / 6 + (k * Math.PI) / 3;
    return {
      x: x + Math.cos(angle) * r * HEXAGON_SCALE,
      y: y + Math.sin(angle) * r * HEXAGON_SCALE,
    };
  });
}

/**
 * The dashes along the closed outline `points`: each `dash` long, `gap`
 * apart, the pattern running on round the corners as an SVG dash does.
 */
export function dashes(
  points: readonly Point[],
  dash: number,
  gap: number,
): readonly (readonly [Point, Point])[] {
  const result: [Point, Point][] = [];
  // Where in the pattern this edge starts: under `dash`, drawing.
  let phase = 0;
  for (let i = 0; i < points.length; i += 1) {
    const from = points[i];
    const to = points[(i + 1) % points.length];
    if (from === undefined || to === undefined) {
      continue;
    }
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const at = (t: number): Point => ({
      x: from.x + ((to.x - from.x) * t) / length,
      y: from.y + ((to.y - from.y) * t) / length,
    });
    let t = 0;
    while (t < length) {
      const drawing = phase < dash;
      const step = Math.min(length - t, drawing ? dash - phase : dash + gap - phase);
      if (drawing) {
        result.push([at(t), at(t + step)]);
      }
      t += step;
      phase = (phase + step) % (dash + gap);
    }
  }
  return result;
}

/**
 * How big each creature is drawn (#2047, C of #2043), world units: an NPC
 * outgrows a summon. Picking uses it too, so what you see is what you
 * click; the simulation's collision radius is unchanged.
 */
export const CREATURE_DRAWN_RADIUS: Readonly<Record<CreatureLook, number>> = {
  beast: 10,
  "bone-minion": 10,
  "bone-horror": 11.5,
  "vampiric-horror": 11.5,
  "flesh-golem": 11.5,
  "shambling-horror": 11.5,
  "jagged-horror": 11.5,
  spirit: 10,
  priest: 12,
  "guild-lord": 15,
  guard: 12,
  "ghostly-hero": 13.5,
};

/** The gold of a Guild Lord's gems. */
export const GEM_COLOUR = 0xffd866;

/** Who colours an ornament: the creature's team, `ink`, or a fixed colour. */
export type OrnamentColour = "team" | "ink" | number;

/**
 * What a creature wears round its plate (#2047), upright whatever its
 * facing, drawn under the plate:
 *
 * - `polygon`: filled, its outline `edge`-cased `edge` wide;
 * - `ring`: an `edge` casing `width` + `RING_CASING` wide under a
 *   `colour` stroke `width` wide, which is dashed along `arcs` when it is
 *   not one whole circle;
 * - `outline`: a closed polygon stroked `colour` over an `edge` casing
 *   `casing` wide.
 */
export type CreatureOrnament =
  | {
      readonly kind: "polygon";
      readonly points: readonly Point[];
      readonly colour: OrnamentColour;
      readonly edge: number;
    }
  | {
      readonly kind: "ring";
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly colour: OrnamentColour;
      readonly width: number;
      readonly arcs: readonly { readonly from: number; readonly to: number }[];
    }
  | {
      readonly kind: "outline";
      readonly points: readonly Point[];
      readonly colour: OrnamentColour;
      readonly width: number;
      readonly casing: number;
    };

/** A ring's `edge` casing, wider than its stroke by this. */
export const RING_CASING = 1.8;
/** A rim polygon's `edge` outline. */
const RIM_EDGE = 1.4;
/** The spirit's dashed aura: dash and gap at radius 10, the study's `3 2.6`. */
const SPIRIT_DASH = 0.3;
const SPIRIT_GAP = 0.26;
const WHOLE: readonly { readonly from: number; readonly to: number }[] = [
  { from: 0, to: 2 * Math.PI },
];

/** `n` points on a circle of radius `r`, the first at angle `rotation`. */
function ngon(x: number, y: number, n: number, r: number, rotation: number): Point[] {
  return Array.from({ length: n }, (_, k) => {
    const angle = rotation + (k * 2 * Math.PI) / n;
    return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
  });
}

/** A star of `n` teeth, tips at `outer` and notches at `inner`, the first tip along +x. */
function star(x: number, y: number, n: number, outer: number, inner: number): Point[] {
  return Array.from({ length: n * 2 }, (_, k) => {
    const angle = (k * Math.PI) / n;
    const r = k % 2 === 0 ? outer : inner;
    return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
  });
}

/** The arcs of a dashed circle of radius `r`: `dash` long, `gap` apart, as near as whole. */
function dashedArcs(r: number, dash: number, gap: number): { from: number; to: number }[] {
  const count = Math.max(1, Math.round((2 * Math.PI * r) / (dash + gap)));
  const step = (2 * Math.PI) / count;
  const drawn = (step * dash) / (dash + gap);
  return Array.from({ length: count }, (_, k) => ({ from: k * step, to: k * step + drawn }));
}

/** A ring of radius `radius` round (`x`, `y`). */
function ring(
  x: number,
  y: number,
  radius: number,
  colour: OrnamentColour,
  width: number,
  arcs = WHOLE,
): CreatureOrnament {
  return { kind: "ring", x, y, radius, colour, width, arcs };
}

/**
 * What a creature of look `look`, drawn at radius `r` at (`x`, `y`),
 * wears round its plate (#2047, C of #2043): ears on a pet, a toothed rim
 * on a minion (more teeth on a horror), a dashed aura on a spirit, an `ink`
 * ring on a priest, a thick `ink` hexagon on a guard, gold gems on a Guild
 * Lord, a team halo on a Ghostly Hero.
 */
export function creatureOrnament(
  look: CreatureLook,
  x: number,
  y: number,
  r: number,
): readonly CreatureOrnament[] {
  // The study draws at radius 10 (15 for the Lord's gems): scale from there.
  const u = r / 10;
  switch (look) {
    case "beast":
      return [-1, 1].map((side) => ({
        kind: "polygon",
        points: [
          { x: x + side * 7 * u, y: y - 8.5 * u },
          { x: x + side * 9.5 * u, y: y - 14 * u },
          { x: x + side * 3 * u, y: y - 10 * u },
        ],
        colour: "team",
        edge: RIM_EDGE,
      }));
    case "bone-minion":
      return [
        {
          kind: "polygon",
          points: star(x, y, 10, r * 1.34, r * HEXAGON_SCALE),
          colour: "team",
          edge: RIM_EDGE,
        },
      ];
    case "bone-horror":
    case "vampiric-horror":
    case "shambling-horror":
    case "jagged-horror":
    case "flesh-golem":
      return [
        {
          kind: "polygon",
          points: star(x, y, 12, r * 1.34, r * HEXAGON_SCALE),
          colour: "team",
          edge: RIM_EDGE,
        },
      ];
    case "spirit":
      return [
        ring(x, y, r * 1.5, "team", 1.6, dashedArcs(r * 1.5, r * SPIRIT_DASH, r * SPIRIT_GAP)),
      ];
    case "priest":
      return [ring(x, y, r * 1.45, "ink", 1.6)];
    case "guard":
      return [
        {
          kind: "outline",
          points: ngon(x, y, 6, r * 1.34, -Math.PI / 2),
          colour: "ink",
          width: 2.4,
          casing: 5,
        },
      ];
    case "guild-lord": {
      const g = r / 15;
      return ngon(x, y, 5, r * 1.5, -Math.PI / 2).map((at) => ({
        kind: "polygon",
        points: [
          { x: at.x, y: at.y - 4 * g },
          { x: at.x + 3 * g, y: at.y },
          { x: at.x, y: at.y + 4 * g },
          { x: at.x - 3 * g, y: at.y },
        ],
        colour: GEM_COLOUR,
        edge: 1.2,
      }));
    }
    case "ghostly-hero":
      return [ring(x, y, r * 1.4, "team", 2.2)];
  }
}

/** The facing tick's edge outline. */
export const TICK_EDGE = 1;

/**
 * An unarmed creature's facing tick (#2047): a small `ink` triangle just
 * outside its plate, its tip pointing along `facing`.
 */
export function creatureTick(
  x: number,
  y: number,
  r: number,
  facing: number,
): readonly [Point, Point, Point] {
  const plate = r * HEXAGON_SCALE;
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const place = (along: number, across: number): Point => ({
    x: x + along * cos - across * sin,
    y: y + along * sin + across * cos,
  });
  return [place(plate + 2.6, 0), place(plate - 0.6, -2.6), place(plate - 0.6, 2.6)];
}
