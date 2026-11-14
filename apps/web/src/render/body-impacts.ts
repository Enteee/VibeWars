import {
  findStatusDefinition,
  getSkill,
  vec2,
  type SkillType,
  type Vec2,
} from "@vibewars/game-core";
import type { CombatMessage } from "@vibewars/game-session";

import { SKILL_SPRITE } from "./projectiles.js";

/**
 * A skill landing on a body (#1139, docs/art/art-direction.md "Skill
 * impact"): every body it touched flashes for a moment. A burst of spikes
 * when it hurt or hindered that body, a glow when it helped, so the two
 * read without colour; the colour is the skill type's where the palette
 * has one, else what it did. A flying spell lands in a bigger warm
 * burst, and an attack skill strikes a gold star across the body's edge,
 * both thick, outlined and reaching past the target ring so they read
 * over it (#3292).
 *
 * No Phaser here, so it can be tested in Node.
 */

/** `landing` is a flying spell's burst, `star` an attack skill's (#3292). */
export type ImpactShape = "burst" | "landing" | "star" | "glow";

export interface Impact {
  /** The body it flashes on, drawn where that body is now. */
  readonly anchorId: string;
  readonly shape: ImpactShape;
  readonly colour: number;
  readonly remainingSeconds: number;
}

export const IMPACT_SECONDS = 0.3;
/** Past this many at once, the oldest go. */
export const MAX_IMPACTS = 64;

/** The palette's skill type tokens, which colour an impact over what it did. */
const TYPE_COLOURS: Partial<Record<SkillType, number>> = {
  hex: 0xd2a8ff,
  enchantment: 0x56d4dd,
  stance: 0xf778ba,
  preparation: 0xe3b341,
  glyph: 0xc3e88d,
  "weapon-spell": 0x8b9cff,
};
const DAMAGE_COLOUR = 0xff7b72;
const CONDITION_COLOUR = 0xffa657;
const HEAL_COLOUR = 0x7ee787;
/** A flying spell's landing burst, and an attack skill's star (docs/art/3191-skill-visuals.md). */
export const FLYING_SPELL_BURST_COLOUR = 0xff8a3d;
export const ATTACK_STAR_COLOUR = 0xffd23d;

type CombatEvent = CombatMessage["events"][number];

/** What one event did to its body: hurt it, hurt it only with a condition, helped it, or nothing. */
function effectOf(event: CombatEvent): "harm" | "condition" | "help" | undefined {
  switch (event.kind) {
    case "damage":
    case "life-stolen":
    case "energy-loss":
    case "health-lost":
    case "health-loss":
    case "knocked-down":
    case "interrupted":
    case "attack-interrupted":
      return "harm";
    case "heal":
    case "resurrected":
      return "help";
    case "status-applied": {
      const category = findStatusDefinition(event.statusId)?.category;
      if (category === "condition") {
        return "condition";
      }
      return category === "hex" ? "harm" : "help";
    }
    default:
      return undefined;
  }
}

/**
 * One impact per body `message` touched, in the order they were first
 * touched; none unless a skill the client knows caused it.
 */
export function impactsFor(message: CombatMessage): readonly Impact[] {
  if (message.cause !== "skill") {
    return [];
  }
  const skill = getSkill(message.skillId);
  if (skill === undefined) {
    return [];
  }
  const effects = new Map<string, Set<"harm" | "condition" | "help">>();
  for (const event of message.events) {
    const effect = effectOf(event);
    if (effect === undefined) {
      continue;
    }
    const seen = effects.get(event.targetId) ?? new Set();
    seen.add(effect);
    effects.set(event.targetId, seen);
  }
  const typeColour = TYPE_COLOURS[skill.type];
  const attack = skill.type === "attack";
  const flying = SKILL_SPRITE[skill.id] !== undefined;
  return [...effects].map(([anchorId, seen]): Impact => {
    // Harm beats help: a hit that also heals you still hurt.
    if (!seen.has("harm") && !seen.has("condition")) {
      return {
        anchorId,
        shape: "glow",
        colour: typeColour ?? HEAL_COLOUR,
        remainingSeconds: IMPACT_SECONDS,
      };
    }
    if (attack) {
      return {
        anchorId,
        shape: "star",
        colour: ATTACK_STAR_COLOUR,
        remainingSeconds: IMPACT_SECONDS,
      };
    }
    if (flying) {
      return {
        anchorId,
        shape: "landing",
        colour: FLYING_SPELL_BURST_COLOUR,
        remainingSeconds: IMPACT_SECONDS,
      };
    }
    const byEffect = seen.has("harm") ? DAMAGE_COLOUR : CONDITION_COLOUR;
    return {
      anchorId,
      shape: "burst",
      colour: typeColour ?? byEffect,
      remainingSeconds: IMPACT_SECONDS,
    };
  });
}

/**
 * `live` aged by `dt` seconds, the spent dropped, then `added`: a new
 * impact replaces any older one on its body. At most `MAX_IMPACTS`, the
 * oldest dropped first.
 */
export function mergeImpacts(
  live: readonly Impact[],
  added: readonly Impact[],
  dt: number,
): Impact[] {
  const replaced = new Set(added.map((impact) => impact.anchorId));
  const aged = live
    .filter((impact) => !replaced.has(impact.anchorId))
    .map((impact) => ({ ...impact, remainingSeconds: impact.remainingSeconds - dt }))
    .filter((impact) => impact.remainingSeconds > 0);
  // Within `added`, the later of two on one body wins, as in the log.
  const newest = new Map(added.map((impact) => [impact.anchorId, impact]));
  return [...aged, ...newest.values()].slice(-MAX_IMPACTS);
}

export type ImpactMark =
  | {
      readonly kind: "spike";
      readonly from: Vec2;
      readonly to: Vec2;
      readonly alpha: number;
      /** Line width, px; an outlined spike gets a dark edge under it. */
      readonly width: number;
      readonly outlined: boolean;
    }
  | { readonly kind: "tint" | "ring"; readonly radius: number; readonly alpha: number };

/** The burst's spikes. */
export const IMPACT_SPIKES = 8;
/** A plain burst and a glow stay inside the body's radius plus this, clear of the target ring at r + 8. */
export const IMPACT_REACH = 6;

/**
 * A spiked shape's spikes, from the body's edge: where each starts and
 * ends at the start of the flash, how far both move out by its end, and
 * how they are drawn. A landing and a star reach past the target ring
 * (r + 8), thick and outlined so they read over it in any colour. Of
 * their twelve spikes round, they keep only those on the free sides,
 * below and left: none points up into the health bar or right into the
 * damage number, which starts right of the body and rises (#3292).
 */
interface SpikeLook {
  readonly inner: number;
  readonly outer: number;
  readonly grow: readonly [inner: number, outer: number];
  readonly width: number;
  readonly outlined: boolean;
  /** Spikes round the whole body, evenly spaced, before any is left out. */
  readonly spikes: number;
  readonly clearOfText: boolean;
}
export const SPIKE_LOOK: Readonly<Record<Exclude<ImpactShape, "glow">, SpikeLook>> = {
  burst: {
    inner: 1,
    outer: 3,
    grow: [2, 3],
    width: 1.5,
    outlined: false,
    spikes: IMPACT_SPIKES,
    clearOfText: false,
  },
  landing: {
    inner: 2,
    outer: 9,
    grow: [2, 4],
    width: 3,
    outlined: true,
    spikes: 12,
    clearOfText: true,
  },
  star: {
    inner: -4,
    outer: 11,
    grow: [2, 3],
    width: 3,
    outlined: true,
    spikes: 12,
    clearOfText: true,
  },
};
/** A spike pointing up more steeply than this (sine of its angle, y down) would cross the health bar. */
const UP_INTO_BAR = -0.7;
/** A spike pointing right flatter than this (sine, y down) would cross the damage number. */
const RIGHT_INTO_NUMBER = 0.5;
const GLOW_TINT_ALPHA = 0.35;

/**
 * What `impact` draws on a body of radius `radius`, as offsets from its
 * centre. Under `reducedMotion`, the frozen form: halfway through, at full
 * alpha, whatever the time left.
 */
export function impactMarks(
  impact: Impact,
  radius: number,
  reducedMotion: boolean,
): readonly ImpactMark[] {
  const progress = reducedMotion
    ? 0.5
    : Math.min(1, Math.max(0, 1 - impact.remainingSeconds / IMPACT_SECONDS));
  const alpha = reducedMotion ? 1 : 1 - progress;
  if (impact.shape !== "glow") {
    const look = SPIKE_LOOK[impact.shape];
    const inner = radius + look.inner + look.grow[0] * progress;
    const outer = radius + look.outer + look.grow[1] * progress;
    return Array.from({ length: look.spikes }, (_, k) => {
      const angle = Math.PI / look.spikes + (k * 2 * Math.PI) / look.spikes;
      return { cos: Math.cos(angle), sin: Math.sin(angle) };
    })
      .filter(
        ({ cos, sin }) =>
          !look.clearOfText || (sin >= UP_INTO_BAR && (cos <= 0 || sin >= RIGHT_INTO_NUMBER)),
      )
      .map(({ cos, sin }): ImpactMark => ({
        kind: "spike",
        from: vec2(cos * inner, sin * inner),
        to: vec2(cos * outer, sin * outer),
        alpha,
        width: look.width,
        outlined: look.outlined,
      }));
  }
  const ringRadius = reducedMotion ? radius + 4 : radius + IMPACT_REACH - 4 * progress;
  return [
    { kind: "tint", radius, alpha: GLOW_TINT_ALPHA * alpha },
    { kind: "ring", radius: ringRadius, alpha },
  ];
}
