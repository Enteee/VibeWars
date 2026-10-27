import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant } from "./types.js";

/**
 * The skills whose effects depend on an earlier effect (#521, #793), each in a
 * scripted duel: the foe is busy (or not), the skill lands.
 */

const RANKS = new Map([
  ["mesmer.domination-magic", 12],
  ["mesmer.inspiration-magic", 12],
  ["monk.protection-prayers", 12],
]);

function caster(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "caster", attributeRanks: RANKS, energy: 20, ...overrides });
}

/** A foe 1 s into casting `skillId`, which takes 3 s; `undefined`: idle. */
function foe(skillId?: string): Combatant {
  const combatant = makeCombatant({ id: "foe", team: 1 });
  if (skillId !== undefined) {
    combatant.cast.beginCast(skillId, combatant.id, 3, undefined);
  }
  return combatant;
}

/** `user` pays for `skillId` and it lands on `target`. */
function use(user: Combatant, skillId: string, target: Combatant): CombatEvent[] {
  const skill = getSkill(skillId);
  if (skill === undefined) {
    throw new Error(`unknown skill ${skillId}`);
  }
  payCost(skill, user);
  return applySkillEffects({
    skill,
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
  });
}

describe("Power Spike (#521)", () => {
  it("interrupts a spell or a chant and deals 102 damage", () => {
    for (const skillId of ["elementalist.fireball", "paragon.anthem-of-flame"]) {
      const target = foe(skillId);
      const events = use(caster(), "mesmer.power-spike", target);
      expect(events, skillId).toContainEqual({ kind: "interrupted", targetId: "foe", skillId });
      expect(target.health, skillId).toBe(500 - 102);
    }
  });

  it("does nothing to an attack skill, a skill or an idle foe, and is still paid for", () => {
    for (const skillId of ["warrior.distracting-blow", "ranger.troll-unguent", undefined]) {
      const mesmer = caster();
      const target = foe(skillId);
      use(mesmer, "mesmer.power-spike", target);
      expect(target.cast.isCasting, String(skillId)).toBe(skillId !== undefined);
      expect(target.health, String(skillId)).toBe(500);
      expect(mesmer.energy, String(skillId)).toBe(15);
    }
  });
});

describe("Power Drain (#521)", () => {
  it("gives 25 energy for an interrupted spell, none for an attack skill", () => {
    const drained = caster();
    use(drained, "mesmer.power-drain", foe("elementalist.fireball"));
    expect(drained.energy).toBe(15 + 25);

    const missed = caster();
    const target = foe("warrior.distracting-blow");
    use(missed, "mesmer.power-drain", target);
    expect(missed.energy).toBe(15);
    expect(target.cast.isCasting).toBe(true);
  });
});

describe("Shatter Enchantment (#521)", () => {
  it("removes the newest enchantment and deals 83 damage", () => {
    const target = foe();
    target.statuses.apply("guardian", 10, "ally");
    target.statuses.apply("regeneration", 10, "ally");
    use(caster(), "mesmer.shatter-enchantment", target);
    expect(target.statuses.has("regeneration")).toBe(false);
    expect(target.statuses.has("guardian")).toBe(true);
    expect(target.health).toBe(500 - 83);
  });

  it("deals nothing to a foe with no enchantment", () => {
    const target = foe();
    target.statuses.apply("bleeding", 10, "ally");
    use(caster(), "mesmer.shatter-enchantment", target);
    expect(target.statuses.has("bleeding")).toBe(true);
    expect(target.health).toBe(500);
  });
});

describe("Drain Enchantment (#521)", () => {
  it("gives its caster 15 energy and 104 health when an enchantment goes", () => {
    const mesmer = caster({ health: 200 });
    const target = foe();
    target.statuses.apply("guardian", 10, "ally");
    use(mesmer, "mesmer.drain-enchantment", target);
    expect(target.statuses.has("guardian")).toBe(false);
    expect(mesmer.energy).toBe(15 + 15);
    expect(mesmer.health).toBe(200 + 104);
    expect(target.health).toBe(500);
  });

  it("gives nothing when there was none", () => {
    const mesmer = caster({ health: 200 });
    use(mesmer, "mesmer.drain-enchantment", foe());
    expect(mesmer.energy).toBe(15);
    expect(mesmer.health).toBe(200);
  });
});

describe("Mend Condition (#521)", () => {
  it("removes the newest condition and heals the ally for 57", () => {
    const ally = makeCombatant({ id: "ally", health: 300 });
    ally.statuses.apply("poison", 10, "foe");
    ally.statuses.apply("bleeding", 10, "foe");
    use(caster(), "monk.mend-condition", ally);
    expect(ally.statuses.has("bleeding")).toBe(false);
    expect(ally.statuses.has("poison")).toBe(true);
    expect(ally.health).toBe(300 + 57);
  });

  it("heals nothing on an ally with no condition", () => {
    const ally = makeCombatant({ id: "ally", health: 300 });
    use(caster(), "monk.mend-condition", ally);
    expect(ally.health).toBe(300);
  });

  it("cannot target its caster", () => {
    expect(getSkill("monk.mend-condition")?.target).toBe("single-other-ally");
  });
});

describe("Energy Burn (#793)", () => {
  it("burns 8 energy and deals 9 damage a point from a foe with plenty", () => {
    const target = makeCombatant({ id: "foe", team: 1, energy: 25 });
    const mesmer = caster();
    use(mesmer, "mesmer.energy-burn", target);
    expect(target.energy).toBe(17);
    expect(target.health).toBe(500 - 72);
    expect(mesmer.energy).toBe(10);
  });

  it("burns only what a foe has: 3 points, 27 damage; none, none", () => {
    const low = makeCombatant({ id: "foe", team: 1, energy: 3 });
    use(caster(), "mesmer.energy-burn", low);
    expect(low.energy).toBe(0);
    expect(low.health).toBe(500 - 27);

    const empty = makeCombatant({ id: "foe", team: 1, energy: 0 });
    expect(use(caster(), "mesmer.energy-burn", empty)).toEqual([]);
    expect(empty.health).toBe(500);
  });
});

describe("Energy Tap (#793)", () => {
  it("gives the caster 2 energy for each of the 6 points the foe lost", () => {
    const target = makeCombatant({ id: "foe", team: 1, energy: 25 });
    const mesmer = caster();
    const events = use(mesmer, "mesmer.energy-tap", target);
    expect(target.energy).toBe(19);
    expect(mesmer.energy).toBe(15 + 12);
    expect(events).toEqual([
      { kind: "energy-loss", targetId: "foe", amount: 6 },
      { kind: "energy-gain", targetId: "caster", amount: 12 },
    ]);
  });

  it("gives only for what a foe with too little had", () => {
    const mesmer = caster();
    use(mesmer, "mesmer.energy-tap", makeCombatant({ id: "foe", team: 1, energy: 2 }));
    expect(mesmer.energy).toBe(15 + 4);
  });
});
