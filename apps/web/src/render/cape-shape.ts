import type { CAPE_COLOURS, CAPE_EMBLEMS, WireCape } from "@vibewars/game-protocol";

import type { Point } from "./weapon-mark-geometry.js";

/**
 * The guild cape (#1422), variant B of the study (#1410,
 * `scripts/assets/cape-study.mjs`): a short tab trailing behind the body,
 * opposite its facing, with a swallowtail hem in the trim colour and the
 * emblem on it. Pure geometry; `body-painter.ts` draws it.
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

/** The tab's root sits 2 inside the rim, behind the centre: under the disc, which covers it. */
const ROOT_BACK = -2;
/** The tab's half width at the root and at the hem's points. */
const ROOT_HALF = 6.5;
const HEM_HALF = 4.5;
/** How far past the rim the hem's points and its notch reach. */
export const CAPE_LENGTH = 17;
const NOTCH_BACK = 12.5;
/** The emblem's centre past the rim, and how wide it is. */
const EMBLEM_BACK = 5.5;
export const EMBLEM_SIZE = 5;

/** An emblem part: a filled polygon, or a closed line stroked `width` wide. */
export type EmblemPart =
  | { readonly kind: "fill"; readonly points: readonly Point[] }
  | { readonly kind: "stroke"; readonly points: readonly Point[]; readonly width: number };

export interface CapeShape {
  /** The cloth: one closed polygon, root to hem and back. */
  readonly tab: readonly Point[];
  /** The hem, point to notch to point: the trim. */
  readonly trim: readonly Point[];
  readonly emblem: readonly EmblemPart[];
}

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

/**
 * The cape on a body at (x, y) of radius `r` facing `facing`: the tab
 * points the other way, `CAPE_LENGTH` past the rim, and turns with it.
 */
export function capeShape(
  x: number,
  y: number,
  r: number,
  facing: number,
  emblem: CapeEmblem,
): CapeShape {
  const back = facing + Math.PI;
  const along = { x: Math.cos(back), y: Math.sin(back) };
  const side = { x: -along.y, y: along.x };
  /** `behind` past the centre, `aside` to the side. */
  const at = (behind: number, aside: number): Point => ({
    x: x + along.x * behind + side.x * aside,
    y: y + along.y * behind + side.y * aside,
  });
  const hemLeft = at(r + CAPE_LENGTH, -HEM_HALF);
  const notch = at(r + NOTCH_BACK, 0);
  const hemRight = at(r + CAPE_LENGTH, HEM_HALF);
  return {
    tab: [at(r + ROOT_BACK, -ROOT_HALF), hemLeft, notch, hemRight, at(r + ROOT_BACK, ROOT_HALF)],
    trim: [hemLeft, notch, hemRight],
    // Its up is the tab's left side, as the study turns it.
    emblem: emblemShape(emblem, at(r + EMBLEM_BACK, 0), back + Math.PI / 2, EMBLEM_SIZE),
  };
}

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
