import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { payCost } from "./activation.js";
import { gainStrikes } from "./adrenaline.js";
import { getSkill } from "./catalog.js";
import { applyEffects, applySkillEffects, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import { resolveAttackSkill } from "./weapon-attack.js";
import type { Combatant, DisableSkillEffect, Skill } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * Disables (#914): an interrupt that also keeps the skill from being used
 * again for a while, alongside its recharge. Power Block takes the whole
 * attribute with it; Distracting Shot and Disrupting Chop the one skill.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const NOWHERE = (): boolean => false;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A foe with `bar`, 1 s into casting `casting`, which takes 3 s; `undefined`: idle. */
function foe(bar: readonly string[], casting?: string): Combatant {
  const combatant = makeCombatant({ id: "foe", team: 1, skillBar: bar });
  if (casting !== undefined) {
    combatant.cast.beginCast(casting, combatant.id, 3, undefined);
  }
  return combatant;
}

const disabled = (events: readonly CombatEvent[]): CombatEvent[] =>
  events.filter((event) => event.kind === "skill-disabled");

describe("Power Block (#914)", () => {
  // Four Curses skills, all quicker than 10 s but Enfeeble at 10, and one of Death Magic.
  const NECROMANCER_BAR = [
    "necromancer.faintheartedness",
    "necromancer.malaise",
    "necromancer.weaken-armor",
    "necromancer.enfeeble",
    "necromancer.rotting-flesh",
  ];
  const CURSES = NECROMANCER_BAR.slice(0, 4);

  function block(target: Combatant): CombatEvent[] {
    const mesmer = makeCombatant({
      id: "caster",
      attributeRanks: new Map([["mesmer.domination-magic", 12]]),
    });
    payCost(skill("mesmer.power-block"), mesmer);
    return applySkillEffects({
      surroundings: new Map(),
      skill: skill("mesmer.power-block"),
      caster: mesmer,
      targets: [target],
      rng: createRng(1),
      rules: RULES,
    });
  }

  it("disables the interrupted spell and its attribute's skills for 10 s, not another attribute's", () => {
    const target = foe(NECROMANCER_BAR, "necromancer.faintheartedness");
    const events = block(target);

    expect(events).toContainEqual({
      kind: "interrupted",
      targetId: "foe",
      skillId: "necromancer.faintheartedness",
    });
    for (const skillId of CURSES) {
      expect(target.cast.rechargeRemaining.get(skillId), skillId).toBe(10);
      expect(target.cast.rechargeTotal.get(skillId), skillId).toBe(10);
    }
    expect(target.cast.rechargeRemaining.has("necromancer.rotting-flesh")).toBe(false);
    expect(disabled(events)).toEqual(
      CURSES.map((skillId) => ({ kind: "skill-disabled", targetId: "foe", skillId, seconds: 10 })),
    );
  });

  it("leaves a skill recharging longer than the disable alone, and says nothing of it", () => {
    const target = foe(NECROMANCER_BAR, "necromancer.faintheartedness");
    target.cast.startRecharge("necromancer.weaken-armor", 15);
    const events = block(target);

    expect(target.cast.rechargeRemaining.get("necromancer.weaken-armor")).toBe(15);
    expect(
      disabled(events).map((event) => event.kind === "skill-disabled" && event.skillId),
    ).toEqual(["necromancer.faintheartedness", "necromancer.malaise", "necromancer.enfeeble"]);
  });

  it("disables nothing when the foe casts a signet or nothing", () => {
    for (const casting of ["warrior.healing-signet", undefined]) {
      const target = foe(["warrior.healing-signet", ...NECROMANCER_BAR], casting);
      const events = block(target);
      expect(disabled(events), String(casting)).toEqual([]);
      expect(target.cast.rechargeRemaining.size, String(casting)).toBe(0);
    }
  });

  it("disables only the interrupted skill when it has no attribute", () => {
    const target = foe(["warrior.distracting-blow", "assassin.dash"], "warrior.distracting-blow");
    const events = applyEffects(
      [
        { kind: "interrupt" },
        { kind: "disable-skill", which: "interrupted-and-attribute", seconds: { flat: 20 } },
      ],
      {
        caster: makeCombatant({ id: "caster" }),
        target,
        rng: createRng(1),
        rules: RULES,
        surroundings: new Map(),
      },
    );
    expect(disabled(events)).toEqual([
      { kind: "skill-disabled", targetId: "foe", skillId: "warrior.distracting-blow", seconds: 20 },
    ]);
    expect(target.cast.rechargeRemaining.has("assassin.dash")).toBe(false);
  });
});

describe("Distracting Shot (#914)", () => {
  /** A stream that never misses blind, never blocks and never crits. */
  const steady = (): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.95 });

  /** The shot lands on `target`, unless `blind` makes the ranger miss (90% at 0.5). */
  function shoot(target: Combatant, blind = false): CombatEvent[] {
    const ranger = makeCombatant({
      id: "ranger",
      equipment: {
        ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
        mainHand: {
          weapon: WEAPONS.longbow,
          attributeId: "ranger.marksmanship",
          damageType: WEAPONS.longbow.damageType,
          requirementMet: true,
          creatureDamageScale: undefined,
        },
      },
      attributeRanks: new Map([["ranger.expertise", 12]]),
    });
    if (blind) {
      ranger.statuses.apply("blind", 10, "foe", NO_RANKS);
    }
    payCost(skill("ranger.distracting-shot"), ranger);
    return resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: skill("ranger.distracting-shot"),
        caster: ranger,
        targets: [target],
        rng: blind
          ? Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.5 })
          : steady(),
        rules: RULES,
      },
      NOWHERE,
      [],
    );
  }

  it("interrupts a skill, deals 13 and disables that skill for 20 s", () => {
    const target = foe(["elementalist.fireball"], "elementalist.fireball");
    const events = shoot(target);

    expect(target.health).toBe(500 - 13);
    expect(target.cast.isCasting).toBe(false);
    expect(target.cast.rechargeRemaining.get("elementalist.fireball")).toBe(20);
    expect(disabled(events)).toEqual([
      { kind: "skill-disabled", targetId: "foe", skillId: "elementalist.fireball", seconds: 20 },
    ]);
  });

  it("deals 13 to a foe only swinging its weapon, and disables nothing", () => {
    const target = foe(["elementalist.fireball"]);
    const events = shoot(target);

    expect(target.health).toBe(500 - 13);
    expect(disabled(events)).toEqual([]);
    expect(target.cast.rechargeRemaining.size).toBe(0);
  });

  it("interrupts and disables nothing when it misses", () => {
    const target = foe(["elementalist.fireball"], "elementalist.fireball");
    const events = shoot(target, true);

    expect(events.some((event) => event.kind === "attack-missed")).toBe(true);
    expect(target.cast.isCasting).toBe(true);
    expect(disabled(events)).toEqual([]);
    expect(target.health).toBe(500);
  });
});

describe("Disrupting Chop (#914)", () => {
  it("interrupts a skill and disables it for 20 s when the axe hits", () => {
    const warrior = makeCombatant({
      id: "warrior",
      equipment: {
        ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
        mainHand: {
          weapon: WEAPONS.axe,
          attributeId: "warrior.axe-mastery",
          damageType: WEAPONS.axe.damageType,
          requirementMet: true,
          creatureDamageScale: undefined,
        },
      },
    });
    const target = foe(["elementalist.fireball"], "elementalist.fireball");
    const events = resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: skill("warrior.disrupting-chop"),
        caster: warrior,
        targets: [target],
        rng: Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.95 }),
        rules: RULES,
      },
      NOWHERE,
      [],
    );

    expect(target.cast.isCasting).toBe(false);
    expect(target.cast.rechargeRemaining.get("elementalist.fireball")).toBe(20);
    expect(disabled(events)).toEqual([
      { kind: "skill-disabled", targetId: "foe", skillId: "elementalist.fireball", seconds: 20 },
    ]);
  });
});

describe("a disabled skill loses all its adrenaline (#1097)", () => {
  const DISABLE_ALL: DisableSkillEffect = {
    kind: "disable-skill",
    which: "all",
    seconds: { flat: 4 },
  };
  const BAR = ["warrior.backbreaker", "warrior.watch-yourself", "warrior.healing-signet"];

  /** A warrior with Backbreaker and "Watch Yourself!" charged, and 20 energy. */
  function warrior(): Combatant {
    return makeCombatant({
      id: "foe",
      team: 1,
      skillBar: BAR,
      energy: 20,
      adrenaline: new Map([
        ["warrior.backbreaker", 9 * ADRENALINE_PER_STRIKE],
        ["warrior.watch-yourself", 4 * ADRENALINE_PER_STRIKE],
      ]),
    });
  }

  function disableAll(target: Combatant): CombatEvent[] {
    return applyEffects([DISABLE_ALL], {
      caster: makeCombatant({ id: "caster" }),
      target,
      rng: createRng(1),
      rules: RULES,
      surroundings: new Map(),
    });
  }

  it("empties every disabled pool, leaves energy alone, and fills none until it ends", () => {
    const target = warrior();
    disableAll(target);
    expect([...target.adrenaline.values()]).toEqual([0, 0]);
    expect(target.energy).toBe(20);

    gainStrikes(target, 2, 0);
    expect([...target.adrenaline.values()]).toEqual([0, 0]);
    target.cast.advance(4);
    gainStrikes(target, 2, 0);
    expect([...target.adrenaline.values()]).toEqual([
      2 * ADRENALINE_PER_STRIKE,
      2 * ADRENALINE_PER_STRIKE,
    ]);
  });

  it("empties a pool whose longer recharge the disable left as it was", () => {
    const target = warrior();
    target.cast.startRecharge("warrior.backbreaker", 15);
    const events = disableAll(target);
    expect(target.cast.rechargeRemaining.get("warrior.backbreaker")).toBe(15);
    expect(
      disabled(events).map((event) => event.kind === "skill-disabled" && event.skillId),
    ).not.toContain("warrior.backbreaker");
    expect(target.adrenaline.get("warrior.backbreaker")).toBe(0);
  });
});
