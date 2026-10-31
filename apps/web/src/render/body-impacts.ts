import {
  findStatusDefinition,
  getSkill,
  vec2,
  type SkillType,
  type Vec2,
} from "@vibewars/game-core";
import type { CombatMessage } from "@vibewars/game-session";

/**
 * A skill landing on a body (#1139, docs/art/art-direction.md "Skill
 * impact"): every body it touched flashes for a moment. A burst of spikes
 * when it hurt or hindered that body, a glow when it helped, so the two
 * read without colour; the colour is the skill type's where the palette
 * has one, else what it did.
 *
 * No Phaser here, so it can be tested in Node.
 */

export type ImpactShape = "burst" | "glow";

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
    if (effect === undefined || event.targetId === undefined) {
      continue;
    }
    const seen = effects.get(event.targetId) ?? new Set();
    seen.add(effect);
    effects.set(event.targetId, seen);
  }
  const typeColour = TYPE_COLOURS[skill.type];
  return [...effects].map(([anchorId, seen]) => {
    // Harm beats help: a hit that also heals you still hurt.
    const shape: ImpactShape = seen.has("harm") || seen.has("condition") ? "burst" : "glow";
    const byEffect =
      shape === "glow" ? HEAL_COLOUR : seen.has("harm") ? DAMAGE_COLOUR : CONDITION_COLOUR;
    return {
      anchorId,
      shape,
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
  | { readonly kind: "spike"; readonly from: Vec2; readonly to: Vec2; readonly alpha: number }
  | { readonly kind: "tint" | "ring"; readonly radius: number; readonly alpha: number };

/** The burst's spikes. */
export const IMPACT_SPIKES = 8;
/** Every mark stays inside the body's radius plus this, clear of the target ring at r + 8. */
export const IMPACT_REACH = 6;
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
  if (impact.shape === "burst") {
    const inner = radius + 1 + 2 * progress;
    const outer = radius + 3 + 3 * progress;
    return Array.from({ length: IMPACT_SPIKES }, (_, k) => {
      const angle = Math.PI / IMPACT_SPIKES + (k * 2 * Math.PI) / IMPACT_SPIKES;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        kind: "spike",
        from: vec2(cos * inner, sin * inner),
        to: vec2(cos * outer, sin * outer),
        alpha,
      };
    });
  }
  const ringRadius = reducedMotion ? radius + 4 : radius + IMPACT_REACH - 4 * progress;
  return [
    { kind: "tint", radius, alpha: GLOW_TINT_ALPHA * alpha },
    { kind: "ring", radius: ringRadius, alpha },
  ];
}
