import type { CreatureLook } from "@vibewars/game-core";

import type { CapeLook } from "./cape-shape.js";
import { mixColour } from "./body-reactions.js";
import {
  bladesSlices,
  cowlSlices,
  hatSlices,
  mantleSlices,
  spikesSlices,
  wrapSkirtRadii,
} from "./outfits-necromancer-mesmer-assassin.js";
import {
  PROFESSION_OUTFITS,
  WARRIOR_OUTFIT,
  type Accent,
  type BackKind,
  type HeadKind,
  type LegKind,
  type Outfit,
  type ShoulderKind,
  type TorsoKind,
} from "./profession-outfits.js";
import { beastSlices } from "./stack-beasts.js";
import { minionSlices } from "./stack-minions.js";
import type { Point } from "./weapon-mark-geometry.js";

/**
 * A standing body as a stacked figure (ADR-0057, #4031): slices of a
 * caped figure in its profession's outfit (#4175), from the boots up,
 * each lifted `STACK_STEP` over the one below. The geometry is the
 * `gothic` preset's body slicer of the #3977 spike, in body radii, `x`
 * forward and `y` to the right, and the outfit study's for the outfits.
 * This file is the only source: the atlas bake draws these slices, and
 * nothing else keeps a copy of them.
 */

/** What colour a slice is painted in: resolved per look by `stackTones`. */
export type StackTone =
  | "boot"
  | "trouser"
  | "skin"
  | "belt"
  | "team"
  | "cape"
  | "trim"
  | "metal"
  | "visor"
  | "crest"
  | "cloth"
  | "leather"
  | "rope"
  | "hair"
  | "gold"
  | "bone"
  | "accent";

/**
 * One slice: its polygons, its tone (a body's named tone, or a creature's
 * fixed colour), how lit it is (1 full colour, less darker toward the
 * ground), its lift, how many `STACK_STEP`s a breath or a stride's bob
 * lifts it on top (#4060), and how opaque it is. The lift counts from 0
 * on the ground: a torso shares its shoulders' lift, and a prop held in
 * the hand restarts lower than the head listed before it (#4171).
 */
export interface StackSlice<Tone = StackTone> {
  readonly parts: readonly (readonly Point[])[];
  readonly tone: Tone;
  readonly light: number;
  readonly lift: number;
  readonly rise: number;
  readonly alpha: number;
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

/** The outfits' fixed tones (#4175): a quiver's leather, a rope belt, hair, a circlet, bone spikes. */
const LEATHER = 0x5a4030;
const ROPE = 0xb8a070;
const HAIR = 0x2a2018;
const GOLD = 0xc9a24a;
const BONE = 0xd8d0b8;

/** An ellipse of `n` sides round `cx`, `cy`, turned `turn` radians. */
export function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n = STACK_SEGMENTS,
  turn = 0,
): Point[] {
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const px = rx * Math.cos(a);
    const py = ry * Math.sin(a);
    return { x: cx + px * cos - py * sin, y: cy + px * sin + py * cos };
  });
}

/**
 * How a pose moves the figure: how far it swings the legs and arms, leans
 * into a cast, lifts the torso and head (a breath) or the head alone
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

/** Adds a slice at the lift the figure has reached. */
export type Push = (parts: Point[][], tone: StackTone, light: number, same?: boolean) => void;

/** A figure being built: where its slices go, and how its pose moves it. */
export interface Figure {
  readonly push: Push;
  /** Adds a cape slice, or only its lift when the figure wears none (#4171). */
  readonly cape: (parts: Point[][], light: number) => void;
  readonly motion: PoseMotion;
}

/** The cape's back at `hem` (1 at the hem, 0 at the shoulders), swayed. */
function capeBack(motion: PoseMotion, x: number, rx: number, ry: number, hem: number): Point[] {
  return ellipse(x - 0.12 * motion.capeOut * hem, 0.15 * motion.capeSide * hem, rx, ry, 14);
}

/** The boots, striding. */
function bootSlices({ push, motion }: Figure): void {
  const f = 0.3 * motion.stride;
  for (let i = 0; i < 2; i += 1) {
    push(
      [ellipse(f + 0.05, -0.26, 0.26, 0.16, 10), ellipse(-f + 0.05, 0.26, 0.26, 0.16, 10)],
      "boot",
      0.5 + 0.2 * i,
    );
  }
}

/** The legs over the boots. */
function legSlices({ push, motion }: Figure, kind: LegKind): void {
  const f = 0.3 * motion.stride;
  for (let i = 0; i < 4; i += 1) {
    switch (kind) {
      case "trousers":
        push(
          [ellipse(f * 0.7, -0.24, 0.18, 0.17, 10), ellipse(-f * 0.7, 0.24, 0.18, 0.17, 10)],
          "trouser",
          0.55 + 0.08 * i,
        );
        break;
      case "robe":
        // A long skirt hides the legs: only a dark inner hem shows.
        push([ellipse(0, 0, 0.4, 0.4, 12)], "boot", 0.55 + 0.08 * i);
        break;
    }
  }
}

/**
 * The skirt's radii, hem first: a robe's long and wide, a coat's flared. A
 * robe is the study's narrowed so that its trimmed hem fits the frame.
 */
function skirtRadii(outfit: Outfit): readonly number[] {
  if (outfit.legs === "robe") {
    return [0.84, 0.8, 0.76, 0.7];
  }
  switch (outfit.torso) {
    case "coat":
      return [0.7, 0.66, 0.62, 0.58];
    case "plate":
    case "robe":
      return [0.62, 0.6, 0.58, 0.56];
    case "wrap":
      return wrapSkirtRadii();
  }
}

/**
 * The skirt, its cape behind it, then the belt: a robe's hem in its
 * cloth, a trim accent a ring under the hem, a belt accent over the belt.
 */
function skirtSlices(
  { push, cape, motion }: Figure,
  outfit: Outfit,
  accent: Accent | undefined,
): void {
  const { lean } = motion;
  const robe = outfit.legs === "robe";
  skirtRadii(outfit).forEach((r, i) => {
    const x = 0.03 * lean * i;
    if (i === 0 && accent?.kind === "trim") {
      const k = robe ? 1.15 : 1.1;
      push([ellipse(x, 0, r * 0.72 * k, r * k)], "accent", 0.5, true);
    }
    if (i === 0 && robe) {
      push([ellipse(x, 0, r * 0.72 * 1.08, r * 1.08)], "cloth", 0.55, true);
    }
    const capeLength = robe ? 0.66 + 0.04 * (1 - i / 4) : 0.66;
    cape([capeBack(motion, -0.3 - 0.06 * lean, 0.32, capeLength, 1 - i / 11)], 0.5 + 0.06 * i);
    push([ellipse(x, 0, r * 0.72, r)], "team", 0.6 + 0.07 * i, true);
  });
  push([ellipse(0.12 * lean, 0, 0.4, 0.56)], outfit.torso === "plate" ? "belt" : "rope", 0.9);
  if (accent?.kind === "belt") {
    push([ellipse(0.12 * lean, 0, 0.44, 0.6)], "accent", 0.92, true);
  }
}

/** A torso's radii, waist up, and what its sleeves and hands are in. */
function torsoShape(kind: TorsoKind): {
  readonly radii: readonly number[];
  readonly sleeve: StackTone;
  readonly hand: StackTone;
} {
  switch (kind) {
    case "plate":
      return { radii: [0.56, 0.6, 0.64, 0.68, 0.7], sleeve: "team", hand: "metal" };
    case "coat":
    case "wrap":
      return { radii: [0.56, 0.6, 0.64, 0.68, 0.7], sleeve: "cloth", hand: "skin" };
    case "robe":
      return { radii: [0.52, 0.54, 0.56, 0.58, 0.6], sleeve: "cloth", hand: "skin" };
  }
}

/** What is on the back at torso slice `i`, `x` behind its centre. */
function backSlices(figure: Figure, kind: BackKind | undefined, i: number, x: number): void {
  const { push } = figure;
  switch (kind) {
    case undefined:
      return;
    case "quiver":
      push([ellipse(x, 0.24, 0.1, 0.1, 8)], "leather", 0.5 + 0.08 * i, true);
      if (i === 6) {
        // The fletchings of two arrows.
        push([ellipse(x, 0.2, 0.05, 0.05, 6), ellipse(x, 0.3, 0.05, 0.05, 6)], "metal", 1, true);
      }
      return;
    case "blades":
      bladesSlices(figure, i, x);
      return;
  }
}

/**
 * The torso, the cape behind it and the arms beside it: a sash accent
 * runs over it from the right shoulder to the left hip, and what the
 * outfit wears on its back stands behind it.
 */
function torsoSlices(figure: Figure, outfit: Outfit, accent: Accent | undefined): void {
  const { push, motion } = figure;
  const { stride, lean } = motion;
  const { radii, sleeve, hand } = torsoShape(outfit.torso);
  const arms = (i: number): Point[][] => {
    const swing = -0.22 * stride * (1 - i / 7);
    const reach = 0.25 * lean * (i / 7);
    return [
      ellipse(swing + reach, -0.66, 0.15, 0.14, 10),
      ellipse(-swing + reach, 0.66, 0.15, 0.14, 10),
    ];
  };
  for (let i = 0; i < 7; i += 1) {
    figure.cape([capeBack(motion, -0.3, 0.3, 0.6 + 0.02 * i, (7 - i) / 11)], 0.6 + 0.05 * i);
    if (i >= 2) {
      const r = radii[Math.min(i - 2, 4)] ?? 0;
      const x = 0.06 + 0.2 * lean * (i / 7);
      push([ellipse(x, 0, r * 0.66, r)], "team", 0.74 + 0.04 * i, true);
      if (accent?.kind === "sash" && i >= 3) {
        push([ellipse(x, 0, 0.2, r * 1.12, 14, 0.5)], "accent", 0.82 + 0.04 * i, true);
      }
      backSlices(figure, outfit.back, i, x - 0.52);
    }
    push(arms(i), i < 2 ? hand : sleeve, i < 2 ? 0.9 : 0.7 + 0.04 * i, true);
  }
}

/** Over the shoulders, and the neck: a collar stands up round it, a mantle or spikes under it. */
function shoulderSlices(figure: Figure, kind: ShoulderKind): void {
  const { push, motion } = figure;
  const { lean } = motion;
  const neck = (tone: StackTone): void => {
    push([ellipse(0.06 + 0.3 * lean, 0, 0.16, 0.16, 10)], tone, 0.8);
  };
  switch (kind) {
    case "pauldrons":
      for (let i = 0; i < 2; i += 1) {
        push(
          [ellipse(0.25 * lean, -0.6, 0.3, 0.26, 12), ellipse(0.25 * lean, 0.6, 0.3, 0.26, 12)],
          "metal",
          0.85 + 0.15 * i,
        );
      }
      neck("skin");
      return;
    case "none":
      neck("skin");
      return;
    case "collar":
      neck("cloth");
      push([ellipse(0.3 * lean, 0, 0.3, 0.38, 14)], "cloth", 0.95);
      push([ellipse(0.3 * lean, 0, 0.26, 0.34, 14)], "cloth", 1);
      return;
    case "mantle":
      mantleSlices(figure);
      neck("skin");
      return;
    case "spikes":
      spikesSlices(figure);
      neck("skin");
      return;
  }
}

/** The head over the neck. */
function headSlices({ push, motion }: Figure, kind: HeadKind): void {
  const cx = 0.1 + 0.35 * motion.lean;
  /** A round head of `radii`, bottom up, `extra` adding to each slice. */
  const dome = (
    radii: readonly number[],
    tone: StackTone,
    extra?: (r: number, i: number) => void,
  ): void => {
    radii.forEach((r, i) => {
      push([ellipse(cx, 0, r * 1.05, r)], tone, 0.7 + 0.07 * i);
      extra?.(r, i);
    });
  };
  const hair = (ry: number): void => {
    push([ellipse(cx - 0.06, 0, 0.3, ry, 12)], "hair", 0.95);
  };
  switch (kind) {
    case "helm":
      // The visor at the helm's widest, the crest on top.
      dome([0.3, 0.36, 0.38, 0.38, 0.34, 0.26], "metal", (r, i) => {
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
      return;
    case "hood":
      // The face shows at the hood's opening.
      dome([0.3, 0.36, 0.4, 0.4, 0.36, 0.28], "cloth", (r, i) => {
        if (i === 2 || i === 3) {
          push([ellipse(cx + r * 0.62, 0, 0.16, 0.2, 10)], "skin", 0.95, true);
        }
      });
      return;
    case "bare":
      dome([0.26, 0.3, 0.32, 0.32, 0.28, 0.22], "skin");
      hair(0.3);
      return;
    case "circlet":
      dome([0.26, 0.3, 0.32, 0.32, 0.28, 0.22], "skin", (r, i) => {
        if (i === 3) {
          push([ellipse(cx, 0, r * 1.15, r * 1.1)], "gold", 0.95, true);
        }
      });
      hair(0.28);
      return;
    case "cowl":
      cowlSlices(push, cx);
      return;
    case "hat":
      hatSlices(push, cx);
      return;
  }
}

/**
 * The slices of a figure wearing `outfit` and `accent` in `pose`, boots
 * first (#4175). Without its cape (`caped` false) every other slice keeps
 * its lift.
 */
export function stackSlices(
  pose: StackPose,
  outfit: Outfit,
  accent: Accent | undefined,
  caped = true,
): readonly StackSlice[] {
  const motion = poseMotion(pose);
  const slices: StackSlice[] = [];
  let rise = 0;
  let lift = -1;
  const push: Push = (parts, tone, light, same = false) => {
    if (!same) {
      lift += 1;
    }
    slices.push({ parts, tone, light, lift, rise, alpha: 1 });
  };
  const figure: Figure = {
    motion,
    push,
    cape: (parts, light) => {
      if (caped) {
        push(parts, "cape", light);
      } else {
        lift += 1;
      }
    },
  };
  bootSlices(figure);
  legSlices(figure, outfit.legs);
  skirtSlices(figure, outfit, accent);
  // A breath lifts the torso, and everything over it.
  rise = motion.rise;
  torsoSlices(figure, outfit, accent);
  shoulderSlices(figure, outfit.shoulders);
  // A stride bobs the head at its passing frames.
  rise = motion.rise + motion.bob;
  headSlices(figure, outfit.head);
  return slices;
}

/** How many lifts a figure has: its highest slice's, and every one under it. */
export function stackLifts(slices: readonly { readonly lift: number }[]): number {
  return slices.reduce((top, slice) => Math.max(top, slice.lift), -1) + 1;
}

/**
 * The most lifts any outfit stands in, which every pose shares: the
 * badge and the frame are sized to the tallest.
 */
export const STACK_SLICES = Math.max(
  ...[WARRIOR_OUTFIT, ...Object.values(PROFESSION_OUTFITS)].map((outfit) =>
    stackLifts(stackSlices("stand", outfit, undefined)),
  ),
);

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

/**
 * Every tone of one look: its body colour, and its cape's cloth and trim,
 * or the body colour darkened when it wears none (ADR-0057); its outfit's
 * cloth and its accent's tone, or the body colour when it has none. The
 * steel takes a quarter of the body colour, as the preset's takes of its
 * accent.
 */
export function stackTones(
  body: number,
  cape: CapeLook | undefined,
  outfit: Outfit,
  accent: Accent | undefined,
): Record<StackTone, number> {
  const cloth = cape === undefined ? mixColour(body, 0x000000, 0.4) : cape.main;
  return {
    boot: BOOT,
    trouser: TROUSER,
    skin: SKIN,
    belt: BELT,
    team: body,
    cape: cloth,
    trim: cape === undefined ? cloth : cape.trim,
    metal: mixColour(STEEL, body, 0.25),
    visor: VISOR,
    crest: cape === undefined ? body : cape.trim,
    cloth: outfit.cloth,
    leather: LEATHER,
    rope: ROPE,
    hair: HAIR,
    gold: GOLD,
    bone: BONE,
    accent: accent?.tone ?? body,
  };
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
  readonly alpha: number;
}

/**
 * The polygons of `slices`, slice `i` in `colours[i]`, turned to `facing`
 * at radius `r` and lifted, relative to the centre of the feet: what the
 * bake fills, bottom to top. Slices go up by lift, those on one lift in
 * list order, so a prop restarting at the hand is painted under the head
 * listed before it (#4171).
 */
function placeSlices<Tone>(
  slices: readonly StackSlice<Tone>[],
  colours: readonly number[],
  facing: number,
  r: number,
): StackLayer[] {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const order = slices.map((slice, i) => ({ slice, colour: colours[i] ?? STACK_OUTLINE }));
  order.sort((a, b) => a.slice.lift - b.slice.lift);
  const layers: StackLayer[] = [];
  for (const { slice, colour } of order) {
    const lift = (slice.lift + 1) * STACK_STEP * r;
    const rise = slice.rise * STACK_STEP * r;
    for (const part of slice.parts) {
      layers.push({
        points: part.map((p) => ({
          x: (p.x * cos - p.y * sin) * r,
          y: (p.x * sin + p.y * cos) * r * STACK_SQUASH - lift - rise,
        })),
        colour,
        alpha: slice.alpha,
      });
    }
  }
  return layers;
}

/** A body's `slices`, shaded in `tones`, placed (`placeSlices`). */
export function stackLayers(
  slices: readonly StackSlice[],
  facing: number,
  r: number,
  tones: Record<StackTone, number>,
): StackLayer[] {
  let cape = 0;
  const colours = slices.map((slice) => {
    let tone = slice.tone;
    if (tone === "cape") {
      // The hem is in the trim, as a flat cape's trim runs along it.
      tone = cape === 0 ? "trim" : "cape";
      cape += 1;
    }
    return stackShade(tones[tone], slice.light);
  });
  return placeSlices(slices, colours, facing, r);
}

/** A creature's `slices`, shaded in their own colours, placed (`placeSlices`). */
export function creatureLayers(
  slices: readonly StackSlice<number>[],
  facing: number,
  r: number,
): StackLayer[] {
  const colours = slices.map((slice) => stackShade(slice.tone, slice.light));
  return placeSlices(slices, colours, facing, r);
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
 * The badge disc on top of a figure of body radius `r`, `tall` radii
 * high, a body's unless a creature's (#4172): its radius, and how far its
 * centre stands over the feet, just clear of the crest (the preset's
 * badge, grown to fit today's glyph).
 */
export function stackBadge(
  r: number,
  tall = STACK_HEIGHT,
): { readonly radius: number; readonly rise: number } {
  const radius = Math.max(5, r * 0.6);
  return { radius, rise: tall * r + r * 0.1 + radius * 0.6 };
}

/**
 * How much higher than over a flat disc the things over a figure's head
 * stand: from its edge, `r` over the feet, to the top of its badge's rim,
 * on a figure `tall` radii high.
 */
export function stackOverheadRise(r: number, tall = STACK_HEIGHT): number {
  const badge = stackBadge(r, tall);
  return badge.rise + badge.radius + 1 - r;
}

/**
 * The poses a creature's figure stands in (#4171): still, and the two
 * feet of a stride. A creature does not breathe or lean into a cast.
 */
export type CreaturePose = "stand" | "stride-a" | "stride-b";

/** How a stacked creature turns and moves: its heading buckets and its poses. */
export interface CreatureStack {
  readonly headings: number;
  readonly poses: readonly CreaturePose[];
}

/** A creature that turns in 8 headings and walks. */
const WALKER: CreatureStack = { headings: 8, poses: ["stand", "stride-a", "stride-b"] };

/**
 * The creature looks drawn as figures (#4171), the rest keep their disc.
 * A spirit does not turn: one heading, one pose. Pets and NPCs (#4173)
 * turn and walk.
 */
const CREATURE_STACKS: Readonly<Partial<Record<CreatureLook, CreatureStack>>> = {
  spirit: { headings: 1, poses: ["stand"] },
  "ghostly-hero": WALKER,
  beast: WALKER,
  rat: WALKER,
  guard: WALKER,
  priest: WALKER,
  "guild-lord": WALKER,
  "bone-minion": WALKER,
  "bone-horror": WALKER,
  "bone-fiend": WALKER,
  "vampiric-horror": WALKER,
  "shambling-horror": WALKER,
  "jagged-horror": WALKER,
  "flesh-golem": WALKER,
};

/** How `look` turns and moves as a figure, or `undefined` when it stays a disc. */
export function creatureStack(look: CreatureLook): CreatureStack | undefined {
  return CREATURE_STACKS[look];
}

/**
 * The pose of `stack` a body's `pose` is: a stride's contact frames
 * stride, the rest stand, and a creature that does not walk always stands.
 */
export function creaturePose(stack: CreatureStack, pose: StackPose): CreaturePose {
  const moved = pose === "contact-a" ? "stride-a" : pose === "contact-b" ? "stride-b" : "stand";
  return stack.poses.includes(moved) ? moved : "stand";
}

/** The bucket of `stack`'s headings nearest a body's heading `bucket`. */
export function creatureBucket(stack: CreatureStack, bucket: number): number {
  return Math.round((bucket * stack.headings) / STACK_HEADINGS) % stack.headings;
}

/** The facing a creature's heading bucket is drawn at. */
export function creatureFacing(stack: CreatureStack, bucket: number): number {
  return (bucket * Math.PI * 2) / stack.headings;
}

/** A spirit's stone base and its wisp (the creature study, #4178). */
const SPIRIT_STONE = 0x4a4a50;
const SPIRIT_WISP = 0x76c96f;
const SPIRIT_CORE = 0xe8f7e4;

/**
 * A spirit totem: two slices of dark stone, then a wisp column narrowing
 * upward through nine slices, pale green to near white at the top, fading
 * as it rises.
 */
function spiritSlices(): readonly StackSlice<number>[] {
  const slices: StackSlice<number>[] = [
    {
      parts: [ellipse(0, 0, 0.55, 0.55, 10)],
      tone: SPIRIT_STONE,
      light: 0.35,
      lift: 0,
      rise: 0,
      alpha: 1,
    },
    {
      parts: [ellipse(0, 0, 0.45, 0.45, 10)],
      tone: SPIRIT_STONE,
      light: 0.55,
      lift: 1,
      rise: 0,
      alpha: 1,
    },
  ];
  for (let i = 0; i < 9; i += 1) {
    const r = 0.38 - 0.032 * i;
    slices.push({
      parts: [ellipse(0, 0, r, r)],
      tone: i > 6 ? SPIRIT_CORE : SPIRIT_WISP,
      light: 0.6 + 0.05 * i,
      lift: 2 + i,
      rise: 0,
      alpha: 0.9 - 0.04 * i,
    });
  }
  return slices;
}

/** A ghostly hero's tones: a body's, desaturated blue-grey, its axe's haft and head. */
const GHOST_BODY = 0x8fa3b8;
const GHOST_TONES: Record<StackTone, number> = {
  ...stackTones(GHOST_BODY, undefined, WARRIOR_OUTFIT, undefined),
  trouser: 0x6a7a8e,
  metal: 0xaebdcf,
  crest: 0xdfe9f5,
};
const GHOST_HAFT = 0x6a4a2c;
const GHOST_BLADE = 0xdfe9f5;
const GHOST_ALPHA = 0.75;
/** The lift the axe's haft starts on: the hand's, not over the helmet. */
const GHOST_HAND_LIFT = 8;

/**
 * A spectral warrior: a body without its cape in the ghost's tones, every
 * slice at `GHOST_ALPHA`, and an axe in the right hand, its haft rising
 * from the hand to a wedge head.
 */
function ghostSlices(pose: CreaturePose): readonly StackSlice<number>[] {
  const stride = pose === "stride-a" ? 1 : pose === "stride-b" ? -1 : 0;
  const body = stackSlices(
    pose === "stride-a" ? "contact-a" : pose === "stride-b" ? "contact-b" : "stand",
    WARRIOR_OUTFIT,
    undefined,
    false,
  );
  const slices: StackSlice<number>[] = body.map((slice) => ({
    ...slice,
    tone: GHOST_TONES[slice.tone],
    alpha: GHOST_ALPHA,
  }));
  const x = 0.2 - 0.1 * stride;
  const y = 0.7;
  for (let i = 0; i < 8; i += 1) {
    slices.push({
      parts: [ellipse(x, y, 0.1, 0.1, 6)],
      tone: GHOST_HAFT,
      light: 0.8 + 0.2 * (i / 8),
      lift: GHOST_HAND_LIFT + i,
      rise: 0,
      alpha: GHOST_ALPHA,
    });
  }
  for (let i = 0; i < 3; i += 1) {
    slices.push({
      parts: [
        [
          { x, y },
          { x: x + 0.35, y: 0.95 - 0.05 * i },
          { x: x + 0.35, y: 0.45 + 0.05 * i },
        ],
      ],
      tone: GHOST_BLADE,
      light: 0.9 + 0.05 * i,
      lift: GHOST_HAND_LIFT + 8 + i,
      rise: 0,
      alpha: GHOST_ALPHA,
    });
  }
  return slices;
}

/**
 * The slices of creature `look` in `pose` (#4171), ground first, in their
 * own colours: no team is baked in, the plate under the figure carries it.
 * `undefined` for a look still drawn as a disc.
 */
export function creatureSlices(
  look: CreatureLook,
  pose: CreaturePose,
): readonly StackSlice<number>[] | undefined {
  switch (look) {
    case "spirit":
      return spiritSlices();
    case "ghostly-hero":
      return ghostSlices(pose);
    case "beast":
    case "rat":
    case "guard":
    case "priest":
    case "guild-lord":
      return beastSlices(look, pose);
    case "bone-minion":
    case "bone-horror":
    case "bone-fiend":
    case "vampiric-horror":
    case "shambling-horror":
    case "jagged-horror":
    case "flesh-golem":
      return minionSlices(look, pose);
    default:
      return undefined;
  }
}
