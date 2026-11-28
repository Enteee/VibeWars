import type { CreatureLook } from "@vibewars/game-core";

import { AVERAGE_BODY } from "./figure-body.js";
import { WARRIOR_OUTFIT, type Accent, type Outfit } from "./profession-outfits.js";
import {
  ellipse,
  stackSlices,
  stackTones,
  type CreaturePose,
  type StackSlice,
  type StackTone,
} from "./sprite-stack.js";
import type { Point } from "./weapon-mark-geometry.js";

/**
 * Pets and NPCs as stacked figures (#4173), after the creature stack
 * study (`docs/art/creature-stack-study.md`): a beast and a rat on four
 * legs, and a guard, a priest and a guild lord on the body's build in
 * their own tones, each holding its weapon in the stack. Nothing here
 * runs when the module loads: `sprite-stack.ts` imports it back.
 */

/** A slice of a creature's own colour, opaque and never lifted by a breath. */
function slice(parts: Point[][], tone: number, light: number, lift: number): StackSlice<number> {
  return { parts, tone, light, lift, rise: 0, alpha: 1 };
}

/** -1, 0 or 1: which foot a creature's pose has forward. */
function strideOf(pose: CreaturePose): number {
  return pose === "stride-a" ? 1 : pose === "stride-b" ? -1 : 0;
}

/** What tells one four-legged build from another. */
interface Quadruped {
  readonly fur: number;
  readonly dark: number;
  readonly tail: number;
  readonly tailLength: number;
  readonly ears: boolean;
}

const BEAST: Quadruped = { fur: 0x8a7360, dark: 0x5a4a3e, tail: 2, tailLength: 0.8, ears: true };
const RAT: Quadruped = { fur: 0x7a6e66, dark: 0x4e4440, tail: 4, tailLength: 0.9, ears: false };

/** Where each leg stands, and which way a stride moves it: diagonal pairs swap. */
const LEGS = [
  { x: 0.55, y: -0.26, phase: 1 },
  { x: 0.55, y: 0.26, phase: -1 },
  { x: -0.55, y: -0.26, phase: -1 },
  { x: -0.55, y: 0.26, phase: 1 },
] as const;

/**
 * A low, long animal: three slices of legs, the diagonal pairs swapping
 * in a stride, a five-slice body, a tail curling behind on one lift, a
 * head forward, its ears and its snout.
 */
function quadrupedSlices(build: Quadruped, pose: CreaturePose): readonly StackSlice<number>[] {
  const stride = strideOf(pose);
  const slices: StackSlice<number>[] = [];
  let lift = -1;
  const push = (parts: Point[][], tone: number, light: number, same = false): void => {
    if (!same) {
      lift += 1;
    }
    slices.push(slice(parts, tone, light, lift));
  };
  for (let i = 0; i < 3; i += 1) {
    push(
      LEGS.map((leg) => ellipse(leg.x + 0.22 * stride * leg.phase, leg.y, 0.11, 0.08, 6)),
      build.dark,
      0.5 + 0.12 * i,
    );
  }
  for (let i = 0; i < 5; i += 1) {
    const r = 0.36 + 0.04 * Math.sin((i / 4) * Math.PI);
    push([ellipse(0, 0, 0.95, r)], build.fur, 0.6 + 0.08 * i);
  }
  for (let i = 0; i < build.tail; i += 1) {
    const x = -1 - 0.25 * i * build.tailLength;
    const y = 0.12 * Math.sin(i + stride);
    push([ellipse(x, y, 0.28 * build.tailLength, 0.04, 6)], build.dark, 0.6 + 0.04 * i, i > 0);
  }
  [0.26, 0.3, 0.26, 0.2].forEach((r, i) => {
    push([ellipse(0.95, 0, r * 1.15, r * 0.9, 10)], build.fur, 0.7 + 0.08 * i);
  });
  if (build.ears) {
    push(
      [
        [
          { x: 0.85, y: -0.2 },
          { x: 0.78, y: -0.34 },
          { x: 0.7, y: -0.14 },
        ],
        [
          { x: 0.85, y: 0.2 },
          { x: 0.78, y: 0.34 },
          { x: 0.7, y: 0.14 },
        ],
      ],
      build.dark,
      1.05,
    );
  }
  push([ellipse(1.3, 0, 0.14, 0.1, 8)], build.dark, 0.9, true);
  return slices;
}

/** The lift a held weapon's first slice is on: the hand's, not over the head. */
const HAND_LIFT = 8;
/** The lift a shield on the left arm starts on. */
const SHIELD_LIFT = 6;
const WOOD = 0x6a4a2c;
const GOLD = 0xc9a227;

/** A human NPC: the outfit it wears, its tones over a body's, and what it holds. */
interface Humanoid {
  readonly outfit: Outfit;
  readonly accent: Accent | undefined;
  readonly caped: boolean;
  readonly crested: boolean;
  readonly tones: Partial<Record<StackTone, number>>;
  readonly held: (stride: number) => StackSlice<number>[];
}

/** A pole held upright at `x`, `y`: `length` slices up from the hand, then a tip. */
function pole(
  x: number,
  y: number,
  length: number,
  tone: number,
  tip: number,
  tipTone: number,
): StackSlice<number>[] {
  const slices: StackSlice<number>[] = [];
  for (let i = 0; i < length; i += 1) {
    slices.push(slice([ellipse(x, y, 0.1, 0.1, 6)], tone, 0.8 + 0.2 * (i / length), HAND_LIFT + i));
  }
  for (let i = 0; i < tip; i += 1) {
    const parts = [ellipse(x, y, 0.16 - 0.04 * i, 0.12 - 0.03 * i, 6)];
    slices.push(slice(parts, tipTone, 1, HAND_LIFT + length + i));
  }
  return slices;
}

/**
 * A guard: a warrior's plate in steel, no cape and no crest, a spear
 * standing over its head and a kite shield on its left arm with a gold
 * boss. Steel and the two weapons, never a glyph, tell it from a body.
 */
const GUARD: Humanoid = {
  outfit: WARRIOR_OUTFIT,
  accent: undefined,
  caped: false,
  crested: false,
  tones: { team: 0x6c727c, metal: 0x9aa0a8, trouser: 0x3c4048 },
  held: (stride) => {
    const slices = pole(0.3 + 0.1 * stride, 0.75, 19, WOOD, 3, 0xc9ced6);
    for (let i = 0; i < 6; i += 1) {
      const parts = [ellipse(0.1, -0.88, 0.1, 0.34 - 0.025 * i, 8)];
      slices.push(slice(parts, i === 5 ? GOLD : 0x7e8590, 0.7 + 0.05 * i, SHIELD_LIFT + i));
    }
    return slices;
  },
};

/**
 * A priest: a pale robe to the ground with a brown belt, a hood over a
 * lit face, and a staff with a gold orb.
 */
const PRIEST: Humanoid = {
  outfit: {
    torso: "robe",
    legs: "robe",
    shoulders: "none",
    head: "hood",
    back: undefined,
    cloth: 0xc8bfa8,
  },
  accent: undefined,
  caped: false,
  crested: false,
  tones: { team: 0xd9d2c0, rope: 0x8a6a3a },
  held: (stride) => {
    const x = 0.4 + 0.08 * stride;
    const slices = pole(x, 0.8, 12, WOOD, 0, WOOD);
    const top = HAND_LIFT + 12;
    slices.push(
      slice([ellipse(x, 0.8, 0.14, 0.14, 8)], GOLD, 1, top),
      slice([ellipse(x, 0.8, 0.09, 0.09, 8)], 0xf6e7a0, 1.1, top),
    );
    return slices;
  },
};

/**
 * A guild lord: dark plate, a gold helm, pauldrons, hands and belt, a
 * gold-trimmed hem, a dark red cape, and a sword raised from the hand
 * over a gold crossguard. Its drawn radius makes it 1.25 of a body.
 */
const GUILD_LORD: Humanoid = {
  outfit: WARRIOR_OUTFIT,
  accent: { kind: "trim", tone: GOLD },
  caped: true,
  crested: true,
  tones: {
    team: 0x26262e,
    metal: GOLD,
    belt: GOLD,
    trouser: 0x1e1e24,
    cape: 0x8a2a2a,
    trim: 0x5a1a1a,
    crest: 0x8a2a2a,
  },
  held: (stride) => {
    const x = 0.35 + 0.05 * stride;
    const slices: StackSlice<number>[] = [
      slice([ellipse(x, 0.8, 0.08, 0.08, 6)], 0x3a2a20, 0.8, HAND_LIFT),
      slice([ellipse(x, 0.8, 0.07, 0.3, 6)], GOLD, 1, HAND_LIFT + 1),
    ];
    for (let i = 0; i < 9; i += 1) {
      const parts = [ellipse(x, 0.8, 0.09 - 0.004 * i, 0.06, 6)];
      slices.push(slice(parts, 0xdfe3ea, 0.85 + 0.02 * i, HAND_LIFT + 2 + i));
    }
    return slices;
  },
};

/**
 * `build`'s figure in `pose`: a body's slices in the NPC's tones, the
 * cape and the crest only where it wears them, then what it holds.
 */
function humanoidSlices(build: Humanoid, pose: CreaturePose): readonly StackSlice<number>[] {
  const stride = strideOf(pose);
  const tones = {
    ...stackTones(0, undefined, build.outfit, build.accent),
    ...build.tones,
  };
  const body = stackSlices(
    stride === 1 ? "contact-a" : stride === -1 ? "contact-b" : "stand",
    build.outfit,
    build.accent,
    AVERAGE_BODY,
    build.caped,
  );
  let capes = 0;
  const slices = body
    .filter((part) => build.crested || part.tone !== "crest")
    .map((part): StackSlice<number> => {
      let tone = part.tone;
      if (tone === "cape") {
        // The hem is in the trim, as a body's cape is (`stackLayers`).
        tone = capes === 0 ? "trim" : "cape";
        capes += 1;
      }
      return { ...part, tone: tones[tone] };
    });
  return [...slices, ...build.held(stride)];
}

/**
 * The slices of pet or NPC `look` in `pose`, in their own colours, or
 * `undefined` for a look this module does not build.
 */
export function beastSlices(
  look: CreatureLook,
  pose: CreaturePose,
): readonly StackSlice<number>[] | undefined {
  switch (look) {
    case "beast":
      return quadrupedSlices(BEAST, pose);
    case "rat":
      return quadrupedSlices(RAT, pose);
    case "guard":
      return humanoidSlices(GUARD, pose);
    case "priest":
      return humanoidSlices(PRIEST, pose);
    case "guild-lord":
      return humanoidSlices(GUILD_LORD, pose);
    default:
      return undefined;
  }
}
