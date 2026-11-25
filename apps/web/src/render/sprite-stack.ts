import type { CapePattern } from "../cosmetics/catalog.js";
import type { CapeLook } from "./cape-shape.js";
import { mixColour } from "./body-reactions.js";
import type { Point } from "./weapon-mark-geometry.js";

/**
 * A standing body as a stacked figure (ADR-0057, #4031): slices of a
 * helmeted, caped figure, from the boots up, each lifted `STACK_STEP`
 * over the one below. The geometry is the `gothic` preset's body slicer
 * of the #3977 spike, in body radii, `x` forward and `y` to the right.
 * This file is the only source: the atlas bake draws these slices, and
 * nothing else keeps a copy of them.
 */

/** What colour a slice is painted in: resolved per look by `stackTones`. */
export type StackTone =
  "boot" | "trouser" | "skin" | "belt" | "team" | "cape" | "trim" | "metal" | "visor" | "crest";

/**
 * One slice: its polygons, its tone, how lit it is (1 full colour, less
 * darker toward the ground) and whether it shares the lift of the slice
 * before it, as a torso shares its shoulders' height.
 */
export interface StackSlice {
  readonly parts: readonly (readonly Point[])[];
  readonly tone: StackTone;
  readonly light: number;
  readonly same: boolean;
}

/** Standing, the two walk frames and the cast lean. */
export const STACK_POSES = ["stand", "stride-a", "stride-b", "cast"] as const;
export type StackPose = (typeof STACK_POSES)[number];

/** Heading buckets a figure turns in: ADR-0057's eight. */
export const STACK_HEADINGS = 8;

/**
 * How far each slice rises over the one below, in body radii: the
 * preset's 1 px `step` on its 12 px body.
 */
export const STACK_STEP = 1 / 12;

/** Sides of a round slice (the preset's `seg`). */
export const STACK_SEGMENTS = 18;

/** How far lower slices darken: the preset's `contrast`. */
export const STACK_CONTRAST = 0.75;

/** The shadow under a figure's feet: the preset's ambient occlusion. */
export const STACK_SHADOW_ALPHA = 0.5;

/** The silhouette's outline: 1 px of near black (ADR-0057, Shading). */
export const STACK_OUTLINE = 0x08080a;
export const STACK_OUTLINE_WIDTH = 1;

/** How much a slice's depth is squashed on screen: the preset's 0.82. */
export const STACK_SQUASH = 0.82;

/** The preset's fixed tones; the team's and the cape's come from the look. */
const BOOT = 0x1c1a1a;
const TROUSER = 0x2a2a30;
const SKIN = 0xb89a84;
const BELT = 0x3a2a20;
const STEEL = 0x9aa0a8;
const VISOR = 0x101014;

function ellipse(cx: number, cy: number, rx: number, ry: number, n = STACK_SEGMENTS): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

/** How far a pose swings the legs and arms, and how far it leans into a cast. */
function poseMotion(pose: StackPose): { readonly stride: number; readonly lean: number } {
  switch (pose) {
    case "stand":
      return { stride: 0, lean: 0 };
    case "stride-a":
      return { stride: 1, lean: 0 };
    case "stride-b":
      return { stride: -1, lean: 0 };
    case "cast":
      return { stride: 0, lean: 1 };
  }
}

/** The slices of a figure in `pose`, boots first. */
export function stackSlices(pose: StackPose): readonly StackSlice[] {
  const { stride, lean } = poseMotion(pose);
  const slices: StackSlice[] = [];
  const push = (parts: Point[][], tone: StackTone, light: number, same = false): void => {
    slices.push({ parts, tone, light, same });
  };
  const f = 0.3 * stride;
  for (let i = 0; i < 2; i += 1) {
    push(
      [ellipse(f + 0.05, -0.26, 0.26, 0.16, 10), ellipse(-f + 0.05, 0.26, 0.26, 0.16, 10)],
      "boot",
      0.5 + 0.2 * i,
    );
  }
  for (let i = 0; i < 4; i += 1) {
    push(
      [ellipse(f * 0.7, -0.24, 0.18, 0.17, 10), ellipse(-f * 0.7, 0.24, 0.18, 0.17, 10)],
      "trouser",
      0.55 + 0.08 * i,
    );
  }
  // The skirt, its cape behind it.
  [0.62, 0.6, 0.58, 0.56].forEach((r, i) => {
    push([ellipse(-0.3 - 0.06 * lean, 0, 0.32, 0.66, 14)], "cape", 0.5 + 0.06 * i);
    push([ellipse(0.03 * lean * i, 0, r * 0.72, r)], "team", 0.6 + 0.07 * i, true);
  });
  push([ellipse(0.12 * lean, 0, 0.4, 0.56)], "belt", 0.9);
  const arms = (i: number): Point[][] => {
    const swing = -0.22 * stride * (1 - i / 7);
    const reach = 0.25 * lean * (i / 7);
    return [
      ellipse(swing + reach, -0.66, 0.15, 0.14, 10),
      ellipse(-swing + reach, 0.66, 0.15, 0.14, 10),
    ];
  };
  // The torso, the cape behind it and the arms beside it.
  const torso = [0.56, 0.6, 0.64, 0.68, 0.7];
  for (let i = 0; i < 7; i += 1) {
    push([ellipse(-0.3, 0, 0.3, 0.6 + 0.02 * i, 14)], "cape", 0.6 + 0.05 * i);
    if (i >= 2) {
      const r = torso[Math.min(i - 2, 4)] ?? 0;
      push([ellipse(0.06 + 0.2 * lean * (i / 7), 0, r * 0.66, r)], "team", 0.74 + 0.04 * i, true);
    }
    push(arms(i), i < 2 ? "metal" : "team", i < 2 ? 0.9 : 0.7 + 0.04 * i, true);
  }
  // Pauldrons, the neck, then the helmet with its visor and crest.
  for (let i = 0; i < 2; i += 1) {
    push(
      [ellipse(0.25 * lean, -0.6, 0.3, 0.26, 12), ellipse(0.25 * lean, 0.6, 0.3, 0.26, 12)],
      "metal",
      0.85 + 0.15 * i,
    );
  }
  push([ellipse(0.06 + 0.3 * lean, 0, 0.16, 0.16, 10)], "skin", 0.8);
  const cx = 0.1 + 0.35 * lean;
  [0.3, 0.36, 0.38, 0.38, 0.34, 0.26].forEach((r, i) => {
    push([ellipse(cx, 0, r * 1.05, r)], "metal", 0.7 + 0.07 * i);
    if (i === 2 || i === 3) {
      push(
        [
          [
            { x: cx + r * 0.55, y: -r * 0.7 },
            { x: cx + r * 1.1, y: -r * 0.35 },
            { x: cx + r * 1.1, y: r * 0.35 },
            { x: cx + r * 0.55, y: r * 0.7 },
          ],
        ],
        "visor",
        1,
        true,
      );
    }
    if (i === 5) {
      push([ellipse(cx - 0.05, 0, 0.32, 0.08, 8)], "crest", 1.05);
    }
  });
  return slices;
}

/** How many lifts a figure has: every slice but those sharing the one before. */
export function stackLifts(slices: readonly StackSlice[]): number {
  return slices.filter((slice) => !slice.same).length;
}

/** The standing figure's slice count, which every pose shares. */
export const STACK_SLICES = stackLifts(stackSlices("stand"));

/** How far a figure's top rises over its feet, in body radii. */
export const STACK_HEIGHT = STACK_SLICES * STACK_STEP;

/** The bucket `facing` (radians) turns a figure into: the nearest of eight. */
export function headingBucket(facing: number): number {
  const turn = Math.round(facing / ((Math.PI * 2) / STACK_HEADINGS));
  return ((turn % STACK_HEADINGS) + STACK_HEADINGS) % STACK_HEADINGS;
}

/** The facing a bucket is drawn at. */
export function bucketFacing(bucket: number): number {
  return (bucket * Math.PI * 2) / STACK_HEADINGS;
}

/** A guild cape (ADR-0056) on a figure: its colours and the pattern cosmetic on it. */
export interface StackCape {
  readonly look: CapeLook;
  readonly pattern: CapePattern | undefined;
}

/**
 * Every tone of one look: its body colour, and its cape's cloth and trim,
 * or the body colour darkened when it wears none (ADR-0057). The steel
 * takes a quarter of the body colour, as the preset's takes of its accent.
 */
export function stackTones(body: number, cape: StackCape | undefined): Record<StackTone, number> {
  const cloth = cape === undefined ? mixColour(body, 0x000000, 0.4) : cape.look.main;
  return {
    boot: BOOT,
    trouser: TROUSER,
    skin: SKIN,
    belt: BELT,
    team: body,
    cape: cloth,
    trim: cape === undefined ? cloth : cape.look.trim,
    metal: mixColour(STEEL, body, 0.25),
    visor: VISOR,
    crest: cape === undefined ? body : cape.look.trim,
  };
}

/**
 * Whether the `index`th of a cape's `count` back slices, from the hem
 * up, is in its trim: the hem always, as a flat cape's trim runs along
 * it, then the pattern's bands up the back (#3579's patterns, sliced).
 */
export function capeSliceTrimmed(
  pattern: CapePattern | undefined,
  index: number,
  count: number,
): boolean {
  if (index === 0) {
    return true;
  }
  switch (pattern) {
    case undefined:
      return false;
    case "stripes":
      return index % 2 === 0;
    case "chevrons":
      return index % 3 === 0;
    case "quarters":
      return index >= count / 2;
    case "stars":
      return index % 4 === 0;
  }
}

/** `colour` lit to `light`: darker below 1 by `STACK_CONTRAST`, brighter above. */
export function stackShade(colour: number, light: number): number {
  const k = 1 - STACK_CONTRAST * (1 - Math.min(light, 1)) + Math.max(0, light - 1);
  const channel = (shift: number): number =>
    Math.min(255, Math.floor(((colour >> shift) & 0xff) * k)) << shift;
  return channel(16) | channel(8) | channel(0);
}

/** One polygon of a figure, placed: offset from its feet, lifted, coloured. */
export interface StackLayer {
  readonly points: readonly Point[];
  readonly colour: number;
}

/**
 * The polygons of `slices` turned to `facing` at radius `r`, lifted and
 * shaded, relative to the centre of the feet: what the bake fills, bottom
 * to top.
 */
export function stackLayers(
  slices: readonly StackSlice[],
  facing: number,
  r: number,
  tones: Record<StackTone, number>,
  pattern: CapePattern | undefined,
): StackLayer[] {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const capes = slices.filter((slice) => slice.tone === "cape").length;
  let cape = 0;
  let lift = 0;
  const layers: StackLayer[] = [];
  for (const slice of slices) {
    if (!slice.same) {
      lift += STACK_STEP * r;
    }
    let tone = slice.tone;
    if (tone === "cape") {
      tone = capeSliceTrimmed(pattern, cape, capes) ? "trim" : "cape";
      cape += 1;
    }
    const colour = stackShade(tones[tone], slice.light);
    for (const part of slice.parts) {
      layers.push({
        points: part.map((p) => ({
          x: (p.x * cos - p.y * sin) * r,
          y: (p.x * sin + p.y * cos) * r * STACK_SQUASH - lift,
        })),
        colour,
      });
    }
  }
  return layers;
}

/** How long each walk frame shows, seconds: two make one stride. */
export const STACK_STRIDE_SECONDS = 0.18;

/**
 * The pose a body stands in: leaning into a cast, striding while it
 * moves, else standing. Under reduced motion it never strides or leans:
 * only its heading turns it, which is state, not motion (ADR-0057).
 */
export function stackPose(
  moving: boolean,
  casting: boolean,
  now: number,
  reducedMotion: boolean,
): StackPose {
  if (reducedMotion) {
    return "stand";
  }
  if (casting) {
    return "cast";
  }
  if (moving) {
    return Math.floor(now / STACK_STRIDE_SECONDS) % 2 === 0 ? "stride-a" : "stride-b";
  }
  return "stand";
}

/** The profession badge on top of a figure (ADR-0057): a dark disc with a rim, the glyph pale on it. */
export const STACK_BADGE_RIM = 0x14100c;
export const STACK_BADGE_FILL = 0x2c2620;
export const STACK_GLYPH_TINT = 0xf4ead0;

/**
 * The badge disc on top of a figure of body radius `r`: its radius, and
 * how far its centre stands over the feet, just clear of the crest (the
 * preset's badge, grown to fit today's glyph).
 */
export function stackBadge(r: number): { readonly radius: number; readonly rise: number } {
  const radius = Math.max(5, r * 0.6);
  return { radius, rise: STACK_HEIGHT * r + r * 0.1 + radius * 0.6 };
}

/**
 * How much higher than over a flat disc the things over a figure's head
 * stand: from its edge, `r` over the feet, to the top of its badge's rim.
 */
export function stackOverheadRise(r: number): number {
  const badge = stackBadge(r);
  return badge.rise + badge.radius + 1 - r;
}
