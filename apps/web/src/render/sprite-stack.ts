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
 * darker toward the ground), whether it shares the lift of the slice
 * before it, as a torso shares its shoulders' height, and how many
 * `STACK_STEP`s a breath or a stride's bob lifts it on top (#4060).
 */
export interface StackSlice {
  readonly parts: readonly (readonly Point[])[];
  readonly tone: StackTone;
  readonly light: number;
  readonly same: boolean;
  readonly rise: number;
}

/**
 * Standing, two breaths in (#4060), the four walk frames (a foot down,
 * passing, the other foot down, passing) and the cast lean.
 */
export const STACK_POSES = [
  "stand",
  "breath-a",
  "breath-b",
  "contact-a",
  "pass-a",
  "contact-b",
  "pass-b",
  "cast",
] as const;
export type StackPose = (typeof STACK_POSES)[number];

/**
 * Heading buckets a figure turns in: sixteen (#4060), as #4031's turning
 * sheet showed ADR-0057's eight step visibly.
 */
export const STACK_HEADINGS = 16;

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

/**
 * How a pose moves the figure: how far it swings the legs and arms, leans
 * into a cast, lifts the torso and helmet (a breath) or the helmet alone
 * (a stride's bob), in `STACK_STEP`s, and sways the cape to one side and
 * out behind. The cape trails the legs by one walk frame (#4060).
 */
interface PoseMotion {
  readonly stride: number;
  readonly lean: number;
  readonly rise: number;
  readonly bob: number;
  readonly capeSide: number;
  readonly capeOut: number;
}

const STILL: PoseMotion = { stride: 0, lean: 0, rise: 0, bob: 0, capeSide: 0, capeOut: 0 };

function poseMotion(pose: StackPose): PoseMotion {
  switch (pose) {
    case "stand":
      return STILL;
    case "breath-a":
      return { ...STILL, rise: 0.5 };
    case "breath-b":
      return { ...STILL, rise: 1 };
    case "contact-a":
      return { ...STILL, stride: 1, capeOut: 1 };
    case "pass-a":
      return { ...STILL, bob: 1, capeSide: 1, capeOut: 1 };
    case "contact-b":
      return { ...STILL, stride: -1, capeOut: 1 };
    case "pass-b":
      return { ...STILL, bob: 1, capeSide: -1, capeOut: 1 };
    case "cast":
      return { ...STILL, lean: 1 };
  }
}

/** The slices of a figure in `pose`, boots first. */
export function stackSlices(pose: StackPose): readonly StackSlice[] {
  const { stride, lean, rise: breath, bob, capeSide, capeOut } = poseMotion(pose);
  const slices: StackSlice[] = [];
  let rise = 0;
  const push = (parts: Point[][], tone: StackTone, light: number, same = false): void => {
    slices.push({ parts, tone, light, same, rise });
  };
  /** The cape's back at `hem` (1 at the hem, 0 at the shoulders), swayed. */
  const capeBack = (x: number, rx: number, ry: number, hem: number): Point[] =>
    ellipse(x - 0.12 * capeOut * hem, 0.15 * capeSide * hem, rx, ry, 14);
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
    push([capeBack(-0.3 - 0.06 * lean, 0.32, 0.66, 1 - i / 11)], "cape", 0.5 + 0.06 * i);
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
  // A breath lifts it, and everything over it.
  rise = breath;
  const torso = [0.56, 0.6, 0.64, 0.68, 0.7];
  for (let i = 0; i < 7; i += 1) {
    push([capeBack(-0.3, 0.3, 0.6 + 0.02 * i, (7 - i) / 11)], "cape", 0.6 + 0.05 * i);
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
  // A stride bobs the helmet at its passing frames.
  rise = breath + bob;
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

/** The bucket `facing` (radians) turns a figure into: the nearest of `STACK_HEADINGS`. */
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
    const rise = slice.rise * STACK_STEP * r;
    for (const part of slice.parts) {
      layers.push({
        points: part.map((p) => ({
          x: (p.x * cos - p.y * sin) * r,
          y: (p.x * sin + p.y * cos) * r * STACK_SQUASH - lift - rise,
        })),
        colour,
      });
    }
  }
  return layers;
}

/**
 * World units walked over one whole walk cycle, its four frames (#4060):
 * the 0.36 s cycle #4031 strode in, at the 180 units a second of a run.
 * The cycle follows the distance, so a snare slows it and a boost speeds it.
 */
export const STACK_STRIDE_UNITS = 64;

/** The walk frames, in the order a stride goes through them. */
const WALK: readonly StackPose[] = ["contact-a", "pass-a", "contact-b", "pass-b"];

/** Seconds a cape takes to settle once its body stops (#4060). */
export const STACK_CAPE_SETTLE_SECONDS = 0.4;

/** One breath in and out of a standing body, seconds (#4060). */
export const STACK_BREATH_SECONDS = 3;

/** What picks a body's pose (`stackPose`). */
export interface StackPoseState {
  readonly casting: boolean;
  /** World units it has walked, all told: where it is in its stride. */
  readonly walked: number;
  /** Seconds since it stopped walking; 0 or less while it walks. */
  readonly stoppedFor: number;
  readonly now: number;
  /** Its own offset into a breath, 0 to 1, so a crowd does not breathe in step. */
  readonly phase: number;
  readonly reducedMotion: boolean;
}

/** The walk frame `walked` units into a stride. */
function walkFrame(walked: number): number {
  const frame = Math.floor((walked / STACK_STRIDE_UNITS) * WALK.length);
  return ((frame % WALK.length) + WALK.length) % WALK.length;
}

/**
 * The pose a body stands in (#4060): leaning into a cast; while it walks,
 * the walk frame its distance reaches; for the first half of its cape's
 * settling, the passing frame next in its stride, the cape still out;
 * else breathing, in, held and out, every `STACK_BREATH_SECONDS`. Under
 * reduced motion it never strides, sways, breathes or leans: only its
 * heading turns it, which is state, not motion (ADR-0057).
 */
export function stackPose(state: StackPoseState): StackPose {
  if (state.reducedMotion) {
    return "stand";
  }
  if (state.casting) {
    return "cast";
  }
  const frame = walkFrame(state.walked);
  if (state.stoppedFor <= 0) {
    return WALK[frame] ?? "stand";
  }
  if (state.stoppedFor < STACK_CAPE_SETTLE_SECONDS / 2) {
    return WALK[frame | 1] ?? "stand";
  }
  const breath = (1 - Math.cos(2 * Math.PI * (state.now / STACK_BREATH_SECONDS + state.phase))) / 2;
  return breath < 1 / 3 ? "stand" : breath < 2 / 3 ? "breath-a" : "breath-b";
}

/** Seconds a figure takes to turn to a new heading (#4060). */
export const STACK_TURN_SECONDS = 0.12;

/** A figure's heading as it turns: the bucket drawn, and the turn it is in. */
export interface StackTurn {
  readonly drawn: number;
  readonly from: number;
  readonly to: number;
  readonly startedAt: number;
}

const bucketOf = (turn: number): number =>
  ((turn % STACK_HEADINGS) + STACK_HEADINGS) % STACK_HEADINGS;

/** Buckets from `from` to `to` the short way round: negative turns back. */
export function shortTurn(from: number, to: number): number {
  const ahead = bucketOf(to - from);
  return ahead > STACK_HEADINGS / 2 ? ahead - STACK_HEADINGS : ahead;
}

/**
 * `turn` a frame on at `now`, towards bucket `target` (#4060): a new
 * heading starts a turn from the bucket drawn, which eases there over
 * `STACK_TURN_SECONDS` through the buckets between, the short way, never
 * more than one bucket a frame. The first frame stands at `target`.
 */
export function stepTurn(turn: StackTurn | undefined, target: number, now: number): StackTurn {
  if (turn === undefined) {
    return { drawn: target, from: target, to: target, startedAt: now };
  }
  const restart = target !== turn.to;
  const from = restart ? turn.drawn : turn.from;
  const startedAt = restart ? now : turn.startedAt;
  const t = Math.min(1, Math.max(0, (now - startedAt) / STACK_TURN_SECONDS));
  const want = bucketOf(from + Math.round(shortTurn(from, target) * t * t * (3 - 2 * t)));
  const step = Math.max(-1, Math.min(1, shortTurn(turn.drawn, want)));
  return { drawn: bucketOf(turn.drawn + step), from, to: target, startedAt };
}

/**
 * The buckets the atlas bakes (#4060): those facing left of the screen,
 * a quarter turn either side of straight left, both ends included.
 */
export const STACK_BAKED_HEADINGS: readonly number[] = Array.from(
  { length: STACK_HEADINGS / 2 + 1 },
  (_, i) => STACK_HEADINGS / 4 + i,
);

/** A pose seen in a mirror: the other foot leads, the cape sways the other way. */
function mirroredPose(pose: StackPose): StackPose {
  switch (pose) {
    case "contact-a":
      return "contact-b";
    case "contact-b":
      return "contact-a";
    case "pass-a":
      return "pass-b";
    case "pass-b":
      return "pass-a";
    default:
      return pose;
  }
}

/**
 * Where a figure at `bucket` in `pose` is in the atlas (#4060). A figure
 * is the same both sides of its spine, so one facing right of the screen
 * is the one facing as far left, in the mirrored pose, flipped: the atlas
 * bakes only `STACK_BAKED_HEADINGS`.
 */
export function bakedFrame(
  bucket: number,
  pose: StackPose,
): { readonly bucket: number; readonly pose: StackPose; readonly flipped: boolean } {
  if (STACK_BAKED_HEADINGS.includes(bucket)) {
    return { bucket, pose, flipped: false };
  }
  return { bucket: bucketOf(STACK_HEADINGS / 2 - bucket), pose: mirroredPose(pose), flipped: true };
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
