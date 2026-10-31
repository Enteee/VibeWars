import type { CAPE_COLOURS, CAPE_EMBLEMS, WireCape } from "@vibewars/game-protocol";

import type { Point } from "./weapon-mark-geometry.js";

/**
 * The guild cape's look (#1422): its palette and the emblems on it. How
 * it moves and the shape it takes are `cape-motion.ts` (#1699).
 */

export type CapeColour = (typeof CAPE_COLOURS)[number];
export type CapeEmblem = (typeof CAPE_EMBLEMS)[number];

/** The study's palette (`docs/art/art-direction.md`), as 0xRRGGBB. */
export const CAPE_PALETTE: Readonly<Record<CapeColour, number>> = {
  gold: 0xe6c04a,
  violet: 0xa078e0,
  white: 0xf2f2f2,
  black: 0x23272e,
  lime: 0x9bd445,
  orange: 0xf0963c,
  teal: 0x2fb8a0,
  pink: 0xe86fb4,
};

/** A cape as it is drawn: its colours as 0xRRGGBB. */
export interface CapeLook {
  readonly main: number;
  readonly trim: number;
  readonly emblem: CapeEmblem;
}

export function capeLook(cape: WireCape): CapeLook {
  return { main: CAPE_PALETTE[cape.main], trim: CAPE_PALETTE[cape.trim], emblem: cape.emblem };
}

/** How wide an emblem is on a cape. */
export const EMBLEM_SIZE = 5;

/** An emblem part: a filled polygon, or a closed line stroked `width` wide. */
export type EmblemPart =
  | { readonly kind: "fill"; readonly points: readonly Point[] }
  | { readonly kind: "stroke"; readonly points: readonly Point[]; readonly width: number };

/** Sides of the polygon a round emblem is drawn as. */
const ROUND_SIDES = 16;

/** `n` points round a circle of `radius` from angle `from` to `to`, both ends included. */
function arcPoints(radius: number, from: number, to: number, n: number): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const angle = from + ((to - from) * i) / n;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

const circlePoints = (radius: number): Point[] =>
  arcPoints(radius, 0, Math.PI * 2, ROUND_SIDES).slice(0, ROUND_SIDES);

const polygon = (flat: readonly number[]): Point[] =>
  Array.from({ length: flat.length / 2 }, (_, i) => ({
    x: flat[i * 2] ?? 0,
    y: flat[i * 2 + 1] ?? 0,
  }));

/** The eight emblems in a 10 unit box centred on 0,0, pointing up (-y), as the study draws them. */
const EMBLEMS: Readonly<Record<CapeEmblem, readonly EmblemPart[]>> = {
  disc: [{ kind: "fill", points: circlePoints(4) }],
  bar: [{ kind: "fill", points: polygon([-1.6, -4.6, 1.6, -4.6, 1.6, 4.6, -1.6, 4.6]) }],
  chevron: [
    { kind: "fill", points: polygon([-4.6, 2.4, 0, -3, 4.6, 2.4, 4.6, 4.6, 0, -0.6, -4.6, 4.6]) },
  ],
  diamond: [{ kind: "fill", points: polygon([0, -4.8, 4, 0, 0, 4.8, -4, 0]) }],
  triangle: [{ kind: "fill", points: polygon([0, -4.6, 4.6, 3.6, -4.6, 3.6]) }],
  cross: [
    {
      kind: "fill",
      points: polygon([
        -1.6, -4.6, 1.6, -4.6, 1.6, -1.6, 4.6, -1.6, 4.6, 1.6, 1.6, 1.6, 1.6, 4.6, -1.6, 4.6, -1.6,
        1.6, -4.6, 1.6, -4.6, -1.6, -1.6, -1.6,
      ]),
    },
  ],
  ring: [{ kind: "stroke", points: circlePoints(3.4), width: 2 }],
  "half-disc": [{ kind: "fill", points: arcPoints(4.6, -Math.PI / 2, Math.PI / 2, 8) }],
};

/** `emblem` centred on `centre`, `size` across, its up turned by `turn` radians from -y. */
export function emblemShape(
  emblem: CapeEmblem,
  centre: Point,
  turn: number,
  size: number,
): readonly EmblemPart[] {
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const scale = size / 10;
  const place = (point: Point): Point => ({
    x: centre.x + (point.x * cos - point.y * sin) * scale,
    y: centre.y + (point.x * sin + point.y * cos) * scale,
  });
  return EMBLEMS[emblem].map((part) =>
    part.kind === "fill"
      ? { kind: "fill", points: part.points.map(place) }
      : { kind: "stroke", points: part.points.map(place), width: part.width * scale },
  );
}
