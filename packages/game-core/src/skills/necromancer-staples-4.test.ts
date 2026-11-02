import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { resolveSkillEffects, type CombatEvent, type SkillOutcome } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { statAt } from "./scaling.js";
import { NO_RANKS, getStatusDefinition } from "./status.js";

/**
 * Necromancer staples 4 (#2230): Virulence, Chilblains, Deathly Swarm,
 * Ravenous Gaze and Vampiric Spirit. Numbers are the corpus's at rank 12.
 * Everyone has 500 maximum health.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const RANKS = new Map([
  ["necromancer.blood-magic", 12],
  ["necromancer.death-magic", 12],
  ["necromancer.curses", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function necro(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "n", attributeRanks: RANKS, health: 300, ...overrides });
}

function foe(id = "f", overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id, team: 1, ...overrides });
}

/**
 * `user`, at the origin, pays for `skillId` and it lands on `target`,
 * 200 away; each of `others` stands where it is placed.
 */
function use(
  user: Combatant,
  skillId: string,
  target: Combatant,
  others: readonly (readonly [Combatant, Vec2])[] = [],
): SkillOutcome {
  payCost(skill(skillId), user);
  const placed: (readonly [Combatant, Vec2])[] = [
    [user, vec2(0, 0)],
    [target, vec2(200, 0)],
    ...others,
  ];
  return resolveSkillEffects({
    surroundings: new Map(
      placed.map(([combatant, position]) => [
        combatant.id,
        { combatant, position, creature: undefined, corpseExploited: false },
      ]),
    ),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

/** Whom `events` damaged, in order. */
function damaged(events: readonly CombatEvent[]): string[] {
  return events.flatMap((event) => (event.kind === "damage" ? [event.targetId] : []));
}

describe("the five are the corpus's (#2230)", () => {
  it.each([
    ["virulence", 107, "spell", "death-magic", 5, 1, 15],
    ["chilblains", 144, "spell", "curses", 25, 2, 8],
    ["deathly-swarm", 105, "spell", "death-magic", 10, 2, 6],
    ["ravenous-gaze", 862, "spell", "blood-magic", 1, 1, 10],
    ["vampiric-spirit", 819, "enchantment", "blood-magic", 5, 1, 8],
  ] as const)(
    "%s: gwId %i, %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, attribute, energy, activation, recharge) => {
      expect(skill(`necromancer.${id}`)).toMatchObject({
        gwId,
        type,
        attributeId: `necromancer.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target: "single-enemy",
      });
    },
  );
});

describe("Virulence (#2230)", () => {
  it("on a foe with a condition: Disease, Poison and Weakness for 13 s", () => {
    const f = foe();
    f.statuses.apply("bleeding", 5, "x", NO_RANKS);
    use(necro(), "necromancer.virulence", f);
    for (const id of ["disease", "poison", "weakness"] as const) {
      expect(f.statuses.get(id)?.remainingSeconds, id).toBe(13);
    }
  });

  it("on a clean foe: nothing, and the energy is spent", () => {
    const n = necro({ energy: 20 });
    const f = foe();
    const { events } = use(n, "necromancer.virulence", f);
    expect(events).toEqual([]);
    expect(f.statuses.has("poison")).toBe(false);
    expect(n.energy).toBe(15);
  });

  it("a longer Poison already on stays", () => {
    const f = foe();
    f.statuses.apply("poison", 20, "x", NO_RANKS);
    use(necro(), "necromancer.virulence", f);
    expect(f.statuses.get("poison")?.remainingSeconds).toBe(20);
    expect(f.statuses.get("disease")?.remainingSeconds).toBe(13);
  });
});

describe("Chilblains (#2230)", () => {
  it("poisons its caster for 10 s with no other foe near", () => {
    const n = necro();
    use(n, "necromancer.chilblains", foe());
    expect(n.statuses.get("poison")?.remainingSeconds).toBe(10);
  });

  it("strikes the target and foes in its area for cold, each losing 2 enchantments", () => {
    const enchanted = (id: string) => {
      const f = foe(id);
      for (const statusId of ["blood-ritual", "dark-fury", "soul-leech"] as const) {
        f.statuses.apply(statusId, 30, "x", NO_RANKS);
      }
      return f;
    };
    const target = enchanted("f");
    const beside = enchanted("g");
    const far = enchanted("h");
    const { events } = use(necro(), "necromancer.chilblains", target, [
      [beside, vec2(280, 0)],
      [far, vec2(400, 0)],
    ]);
    expect(damaged(events)).toEqual(["f", "g"]);
    expect([target, beside, far].map((each) => each.statuses.size)).toEqual([1, 1, 3]);
    expect(
      describeSkill(skill("necromancer.chilblains"), RANKS)
        .effects.map(({ text }) => text)
        .join(" | "),
    ).toMatch(/37 cold/);
  });
});

describe("Deathly Swarm (#2230)", () => {
  it("flies as slowly as Fireball", () => {
    expect(skill("necromancer.deathly-swarm").projectile).toEqual(
      skill("elementalist.fireball").projectile,
    );
  });

  it("strikes at most three: the target and the nearest two foes in its area", () => {
    const { events } = use(necro(), "necromancer.deathly-swarm", foe(), [
      [foe("g"), vec2(230, 0)],
      [foe("h"), vec2(260, 0)],
      [foe("i"), vec2(290, 0)],
    ]);
    expect(damaged(events)).toEqual(["f", "g", "h"]);
  });
});

describe("Ravenous Gaze (#2230)", () => {
  it("sacrifices 8% once, and steals 36 from the target and each nearby foe", () => {
    const n = necro({ health: 400 });
    const { events } = use(n, "necromancer.ravenous-gaze", foe(), [
      [foe("g"), vec2(250, 0)],
      [foe("h"), vec2(400, 0)],
    ]);
    expect(events.filter((event) => event.kind === "sacrifice")).toEqual([
      { kind: "sacrifice", targetId: "n", amount: 40 },
    ]);
    expect(damaged(events)).toEqual(["f", "g"]);
    expect(events).toContainEqual({ kind: "life-stolen", targetId: "f", amount: 36 });
    expect(events).toContainEqual({ kind: "life-stolen", targetId: "g", amount: 36 });
    expect(n.health).toBe(400 - 40 + 72);
  });

  it("can kill its caster", () => {
    const n = necro({ health: 30 });
    use(n, "necromancer.ravenous-gaze", foe());
    expect(n.health).toBe(0);
  });
});

describe("Vampiric Spirit (#2230)", () => {
  it("steals 51 and enchants its caster with +9 Health regeneration for 10 s", () => {
    const n = necro();
    const f = foe();
    const { events } = use(n, "necromancer.vampiric-spirit", f);
    expect(events).toContainEqual({ kind: "life-stolen", targetId: "f", amount: 51 });
    expect(n.statuses.get("vampiric-spirit")?.remainingSeconds).toBe(10);
    expect(f.statuses.has("vampiric-spirit")).toBe(false);
    expect(statAt(getStatusDefinition("vampiric-spirit").healthPips, RANKS)).toBe(9);
  });
});
