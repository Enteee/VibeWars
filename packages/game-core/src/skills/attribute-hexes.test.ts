import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY } from "../distances.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { IMPLEMENTED_SKILLS, getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, STATUS_DEFINITIONS, getStatusDefinition, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill, SkillEffect, SurroundingBody, Surroundings } from "./types.js";

/**
 * Hexes know their attribute (#1765): "if target foe has a Water Magic
 * hex", "remove one Mesmer hex". Shatter Delusions, Icy Prism, Teinai's
 * Crystals and Freezing Gust, each on foes with and without the hex.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([
  ["mesmer.domination-magic", 12],
  ["elementalist.water-magic", 12],
  ["elementalist.earth-magic", 12],
]);
/** A Mesmer hex, whichever the catalog has first. */
const MESMER_HEX = Object.values(STATUS_DEFINITIONS).find(
  ({ category, profession }) => category === "hex" && profession === "mesmer",
)?.id;
const WATER_HEX: StatusId = "ice-spikes";
const FIRE_HEX: StatusId = "mark-of-rodgort";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function caster(): Combatant {
  return makeCombatant({ id: "caster", attributeRanks: RANKS, energy: 30 });
}

function foe(id: string, ...hexes: StatusId[]): Combatant {
  const combatant = makeCombatant({ id, team: 1, maxHealth: 1000, health: 1000 });
  for (const hex of hexes) {
    combatant.statuses.apply(hex, 10, "someone", NO_RANKS);
  }
  return combatant;
}

function at(combatant: Combatant, position: Vec2): SurroundingBody {
  return { combatant, position, creature: undefined, corpseExploited: false };
}

/** The target at the origin, `near` just inside `radius`, `far` just past it. */
function crowd(radius: number, ...hexes: StatusId[]) {
  const target = foe("target", ...hexes);
  const near = foe("near");
  const far = foe("far");
  const surroundings: Surroundings = new Map([
    ["target", at(target, vec2(0, 0))],
    ["near", at(near, vec2(radius, 0))],
    ["far", at(far, vec2(radius + 1, 0))],
  ]);
  return { target, near, far, surroundings };
}

function use(
  user: Combatant,
  skillId: string,
  target: Combatant,
  surroundings: Surroundings = new Map(),
): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings,
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES,
  });
}

function damageTo(events: readonly CombatEvent[], targetId: string): number {
  return events.reduce(
    (sum, event) =>
      event.kind === "damage" && event.targetId === targetId ? sum + event.amount : sum,
    0,
  );
}

function statusesApplied(effects: readonly SkillEffect[]): StatusId[] {
  return effects.flatMap((effect): StatusId[] => {
    switch (effect.kind) {
      case "apply-status":
        return [effect.statusId];
      case "if":
      case "splash":
        return statusesApplied(effect.effects);
      default:
        return [];
    }
  });
}

describe("a hex's attribute (#1765)", () => {
  it("is the attribute of the skill that applies it", () => {
    for (const each of IMPLEMENTED_SKILLS) {
      for (const statusId of statusesApplied(each.effects)) {
        const { attribute } = getStatusDefinition(statusId);
        if (attribute !== undefined) {
          expect([each.id, statusId, attribute]).toEqual([each.id, statusId, each.attributeId]);
        }
      }
    }
  });

  it("is set on every Elementalist hex", () => {
    const untagged = Object.values(STATUS_DEFINITIONS)
      .filter(({ category, profession }) => category === "hex" && profession === "elementalist")
      .filter(({ attribute }) => attribute === undefined)
      .map(({ id }) => id);
    expect(untagged).toEqual([]);
  });

  it("names the attribute or profession in an if's line and a removal", () => {
    const text = describeSkill(skill("elementalist.icy-prism"), RANKS)
      .effects.map((effect) => effect.text)
      .join("\n");
    expect(text).toContain("If target has a Water Magic hex");
    const gust = describeSkill(skill("elementalist.freezing-gust"), RANKS)
      .effects.map((effect) => effect.text)
      .join("\n");
    expect(gust).toContain("If target has no Water Magic hex");
    const shatter = describeSkill(skill("mesmer.shatter-delusions"), RANKS).effects[0]?.text;
    expect(shatter).toBe("Removes 1 Mesmer hex");
  });
});

describe("Shatter Delusions (#1765)", () => {
  const SHATTER = "mesmer.shatter-delusions";

  it("removes only the Mesmer hex, and strikes the target and adjacent foes", () => {
    expect(MESMER_HEX).toBeDefined();
    const mesmerHex = MESMER_HEX ?? WATER_HEX;
    const { target, surroundings } = crowd(AREA_ADJACENT, mesmerHex, WATER_HEX);

    const events = use(caster(), SHATTER, target, surroundings);

    expect(target.statuses.has(mesmerHex)).toBe(false);
    expect(target.statuses.has(WATER_HEX)).toBe(true);
    const struck = damageTo(events, "target");
    expect(struck).toBeGreaterThan(0);
    expect(Math.abs(damageTo(events, "near") - struck * 0.75)).toBeLessThanOrEqual(1);
    expect(damageTo(events, "far")).toBe(0);
  });

  it("does nothing to a foe with no Mesmer hex, though its energy is spent", () => {
    const user = caster();
    const { target, near, surroundings } = crowd(AREA_ADJACENT, WATER_HEX);

    const events = use(user, SHATTER, target, surroundings);

    expect(target.statuses.has(WATER_HEX)).toBe(true);
    expect(damageTo(events, "target")).toBe(0);
    expect(damageTo(events, near.id)).toBe(0);
    expect(user.energy).toBe(25);
  });
});

describe("Icy Prism (#1765)", () => {
  const PRISM = "elementalist.icy-prism";

  it("strikes nearby foes too when the target has a Water Magic hex, once for two", () => {
    const { target, surroundings } = crowd(AREA_NEARBY, WATER_HEX, "shard-storm");

    const events = use(caster(), PRISM, target, surroundings);

    expect(damageTo(events, "near")).toBeGreaterThan(0);
    expect(damageTo(events, "near")).toBe(damageTo(events, "target"));
    expect(damageTo(events, "far")).toBe(0);
  });

  it("strikes the target alone when its hex is no Water Magic hex", () => {
    const { target, surroundings } = crowd(AREA_NEARBY, FIRE_HEX);

    const events = use(caster(), PRISM, target, surroundings);

    expect(damageTo(events, "target")).toBeGreaterThan(0);
    expect(damageTo(events, "near")).toBe(0);
  });
});

describe("Teinai's Crystals (#1765)", () => {
  const CRYSTALS = "elementalist.teinais-crystals";

  it("strikes the target twice and cracks nearby foes' armor on a Water Magic hex", () => {
    const plain = crowd(AREA_NEARBY);
    const once = damageTo(use(caster(), CRYSTALS, plain.target, plain.surroundings), "target");
    const { target, near, far, surroundings } = crowd(AREA_NEARBY, WATER_HEX);

    const events = use(caster(), CRYSTALS, target, surroundings);

    expect(damageTo(events, "target")).toBe(once * 2);
    expect(target.statuses.has("cracked-armor")).toBe(false);
    expect(damageTo(events, "near")).toBe(once);
    expect(near.statuses.has("cracked-armor")).toBe(true);
    expect(far.statuses.has("cracked-armor")).toBe(false);
    expect(plain.near.statuses.has("cracked-armor")).toBe(false);
    expect(damageTo(events, "far")).toBe(0);
  });
});

describe("Freezing Gust (#1765)", () => {
  const GUST = "elementalist.freezing-gust";

  it("slows a foe with no Water Magic hex, and strikes it on the second cast", () => {
    const user = caster();
    const target = foe("target", FIRE_HEX);

    const first = use(user, GUST, target);
    expect(damageTo(first, "target")).toBe(0);
    expect(target.statuses.has("freezing-gust")).toBe(true);

    const second = use(user, GUST, target);
    expect(damageTo(second, "target")).toBeGreaterThan(0);
    expect(target.statuses.has("freezing-gust")).toBe(true);
  });

  it("strikes a foe with another caster's Water Magic hex and does not hex it", () => {
    const target = foe("target", WATER_HEX);

    const events = use(caster(), GUST, target);

    expect(damageTo(events, "target")).toBeGreaterThan(0);
    expect(target.statuses.has("freezing-gust")).toBe(false);
  });
});
