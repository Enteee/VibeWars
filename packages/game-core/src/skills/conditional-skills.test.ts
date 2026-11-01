import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { AREA_NEARBY } from "../distances.js";
import { vec2 } from "../vec2.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Surroundings } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * The skills whose effects depend on an earlier effect (#521, #793, #920), each in a
 * scripted duel: the foe is busy (or not), the skill lands.
 */

const RANKS = new Map([
  ["mesmer.domination-magic", 12],
  ["mesmer.inspiration-magic", 12],
  ["monk.protection-prayers", 12],
  ["monk.healing-prayers", 12],
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
function use(
  user: Combatant,
  skillId: string,
  target: Combatant,
  surroundings: Surroundings = new Map(),
): CombatEvent[] {
  const skill = getSkill(skillId);
  if (skill === undefined) {
    throw new Error(`unknown skill ${skillId}`);
  }
  payCost(skill, user);
  return applySkillEffects({
    surroundings,
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
    target.statuses.apply("guardian", 10, "ally", NO_RANKS);
    target.statuses.apply("regeneration", 10, "ally", NO_RANKS);
    use(caster(), "mesmer.shatter-enchantment", target);
    expect(target.statuses.has("regeneration")).toBe(false);
    expect(target.statuses.has("guardian")).toBe(true);
    expect(target.health).toBe(500 - 83);
  });

  it("deals nothing to a foe with no enchantment", () => {
    const target = foe();
    target.statuses.apply("bleeding", 10, "ally", NO_RANKS);
    use(caster(), "mesmer.shatter-enchantment", target);
    expect(target.statuses.has("bleeding")).toBe(true);
    expect(target.health).toBe(500);
  });
});

describe("Drain Enchantment (#521)", () => {
  it("gives its caster 15 energy and 104 health when an enchantment goes", () => {
    const mesmer = caster({ health: 200 });
    const target = foe();
    target.statuses.apply("guardian", 10, "ally", NO_RANKS);
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
    ally.statuses.apply("poison", 10, "foe", NO_RANKS);
    ally.statuses.apply("bleeding", 10, "foe", NO_RANKS);
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

describe("Energy Surge (#920)", () => {
  /**
   * The target at the origin, a foe nearby it, a foe twice as far and an
   * ally of the caster beside the target, all at 500 health.
   */
  function crowd(energy: number): {
    readonly target: Combatant;
    readonly near: Combatant;
    readonly far: Combatant;
    readonly ally: Combatant;
    readonly surroundings: Surroundings;
  } {
    const target = makeCombatant({ id: "foe", team: 1, energy });
    const near = makeCombatant({ id: "near", team: 1, energy: 25 });
    const far = makeCombatant({ id: "far", team: 1, energy: 25 });
    const ally = makeCombatant({ id: "ally" });
    const surroundings: Surroundings = new Map([
      [
        "foe",
        { combatant: target, position: vec2(0, 0), creature: undefined, corpseExploited: false },
      ],
      [
        "near",
        {
          combatant: near,
          position: vec2(AREA_NEARBY, 0),
          creature: undefined,
          corpseExploited: false,
        },
      ],
      [
        "far",
        {
          combatant: far,
          position: vec2(2 * AREA_NEARBY, 0),
          creature: undefined,
          corpseExploited: false,
        },
      ],
      [
        "ally",
        { combatant: ally, position: vec2(0, 1), creature: undefined, corpseExploited: false },
      ],
    ]);
    return { target, near, far, ally, surroundings };
  }

  it("burns 8 energy; the target takes 56, a nearby foe 75% of it, no one else anything", () => {
    const { target, near, far, ally, surroundings } = crowd(25);
    use(caster(), "mesmer.energy-surge", target, surroundings);
    expect(target.energy).toBe(17);
    expect(target.health).toBe(500 - 56);
    expect(near.health).toBe(500 - 42);
    expect(near.energy).toBe(25);
    expect(far.health).toBe(500);
    expect(ally.health).toBe(500);
  });

  it("counts what the target lost: 3 points, 21 and 15.75 rounded; none, no damage at all", () => {
    const low = crowd(3);
    use(caster(), "mesmer.energy-surge", low.target, low.surroundings);
    expect(low.target.health).toBe(500 - 21);
    expect(low.near.health).toBe(500 - 16);

    const empty = crowd(0);
    const events = use(caster(), "mesmer.energy-surge", empty.target, empty.surroundings);
    expect(events.filter((event) => event.kind === "damage")).toEqual([]);
    expect(empty.near.health).toBe(500);
  });
});

describe("Leech Signet (#920)", () => {
  it("interrupts a spell and gives 13 energy, at no cost", () => {
    const mesmer = caster();
    const events = use(mesmer, "mesmer.leech-signet", foe("elementalist.fireball"));
    expect(events).toContainEqual({
      kind: "interrupted",
      targetId: "foe",
      skillId: "elementalist.fireball",
    });
    expect(mesmer.energy).toBe(20 + 13);
  });

  it("interrupts an attack skill, a chant or a skill, and gives nothing", () => {
    for (const skillId of [
      "warrior.distracting-blow",
      "paragon.anthem-of-flame",
      "ranger.troll-unguent",
    ]) {
      const mesmer = caster();
      const target = foe(skillId);
      const events = use(mesmer, "mesmer.leech-signet", target);
      expect(events, skillId).toContainEqual({ kind: "interrupted", targetId: "foe", skillId });
      expect(target.cast.isCasting, skillId).toBe(false);
      expect(mesmer.energy, skillId).toBe(20);
    }
  });

  it("misses an idle foe and gives nothing", () => {
    const mesmer = caster();
    expect(use(mesmer, "mesmer.leech-signet", foe())).toEqual([
      { kind: "interrupt-missed", targetId: "foe", refusedSkillId: null },
    ]);
    expect(mesmer.energy).toBe(20);
  });
});

describe("Dwayna's Kiss (#920)", () => {
  it("heals 51, and 30 more for each enchantment and hex on the ally, as one heal (#1760)", () => {
    const ally = makeCombatant({ id: "ally", health: 100 });
    ally.statuses.apply("guardian", 10, "ally", NO_RANKS);
    ally.statuses.apply("regeneration", 10, "ally", NO_RANKS);
    ally.statuses.apply("malaise", 10, "foe", NO_RANKS);
    ally.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    expect(use(caster(), "monk.dwaynas-kiss", ally)).toEqual([
      { kind: "heal", targetId: "ally", amount: 51 + 90 },
    ]);
    expect(ally.health).toBe(100 + 51 + 90);
  });

  it("heals only 51 on an ally with neither, with no second heal", () => {
    const ally = makeCombatant({ id: "ally", health: 100 });
    expect(use(caster(), "monk.dwaynas-kiss", ally)).toEqual([
      { kind: "heal", targetId: "ally", amount: 51 },
    ]);
  });

  it("cannot target its caster", () => {
    expect(getSkill("monk.dwaynas-kiss")?.target).toBe("single-other-ally");
  });
});
