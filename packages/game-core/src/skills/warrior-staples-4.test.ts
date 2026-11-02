import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { fillPools } from "./adrenaline.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers, getStatusDefinition } from "./status.js";
import { makeCombatant, withStatusDefinitions } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { resolveAttackSkillOutcome, resolveSwing } from "./weapon-attack.js";

/**
 * Warrior staples 4 (#2181): Tiger Stance, Berserker Stance, Skull Crack,
 * Crippling Slash, Bull's Charge, Counterattack, Knee Cutter, Standing
 * Slash and Soldier's Strike, on today's primitives. Numbers are the
 * corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
const RANKS = new Map([
  ["warrior.strength", 12],
  ["warrior.swordsmanship", 12],
  ["warrior.tactics", 12],
]);
const SWORD: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: WEAPONS.sword.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

/** A float stream of 0.9: no crit, no block, no blind miss. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

/** A float stream of 0.5: a 75% block blocks, and a blind attacker misses. */
const blocking = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.5 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A sword Warrior at rank 12, with `bar`'s adrenaline pools empty. */
function warrior(bar: readonly string[] = []): Combatant {
  return makeCombatant({
    id: "w",
    team: 0,
    energy: 10,
    maxEnergy: 50,
    equipment: SWORD,
    attributeRanks: RANKS,
    skillBar: [...bar],
    adrenaline: new Map(bar.map((id) => [id, 0])),
  });
}

const body = (id: string): Combatant =>
  makeCombatant({ id, team: 1, energy: 30, health: 1e6, maxHealth: 1e6 });

/** `target` blocks 75% of attacks. */
function guarded(target: Combatant): Combatant {
  target.statuses.apply("critical-defenses", 10, target.id, NO_RANKS);
  return target;
}

/** `caster` attacks `target` with attack skill `skillId`. */
function attack(skillId: string, caster: Combatant, target: Combatant, rng = steady()) {
  return resolveAttackSkillOutcome(
    {
      skill: skill(skillId),
      caster,
      targets: [target],
      rng,
      rules: RULES,
      surroundings: new Map(),
    },
    () => false,
    [],
  );
}

/** `caster` swings its weapon at `target`, a plain attack. */
function swing(caster: Combatant, target: Combatant, rng = steady()) {
  return resolveSwing({
    attacker: caster,
    target: { combatant: target, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng,
    rules: RULES,
    exposed: () => false,
  });
}

/** `caster`'s non-attack skill `skillId` on itself. */
function selfCast(skillId: string, caster: Combatant) {
  return resolveSkillEffects({
    skill: skill(skillId),
    caster,
    targets: [caster],
    rng: steady(),
    rules: RULES,
    surroundings: new Map(),
  });
}

const damageTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );

/** A plain sword blow's damage under `steady`: Crippling Slash's, which adds none. */
function plainBlow(): number {
  const [blow] = damageTo(attack("warrior.crippling-slash", warrior(), body("f")).events, "f");
  return blow ?? 0;
}

describe("the nine are the corpus's (#2181)", () => {
  it.each([
    ["warrior.tiger-stance", 995, "stance", false, "strength", "energy", 5, 0, 20, RANGE_SPELL],
    [
      "warrior.berserker-stance",
      370,
      "stance",
      false,
      "strength",
      "energy",
      10,
      0,
      10,
      RANGE_SPELL,
    ],
    ["warrior.skull-crack", 329, "attack", true, undefined, "adrenaline", 6, 0.25, 0, RANGE_MELEE],
    [
      "warrior.crippling-slash",
      1415,
      "attack",
      true,
      "swordsmanship",
      "adrenaline",
      5,
      0,
      0,
      RANGE_MELEE,
    ],
    ["warrior.bulls-charge", 379, "stance", true, "strength", "energy", 5, 0, 12, RANGE_SPELL],
    ["warrior.counterattack", 1693, "attack", false, "strength", "energy", 5, 0, 6, RANGE_MELEE],
    [
      "warrior.knee-cutter",
      2010,
      "attack",
      false,
      "swordsmanship",
      "adrenaline",
      5,
      0,
      1,
      RANGE_MELEE,
    ],
    [
      "warrior.standing-slash",
      996,
      "attack",
      false,
      "swordsmanship",
      "adrenaline",
      6,
      0,
      0,
      RANGE_MELEE,
    ],
    ["warrior.soldiers-strike", 1695, "attack", false, "tactics", "energy", 5, 0, 4, RANGE_MELEE],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, attribute, costKind, amount, activation, recharge, range) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        profession: "warrior",
        attributeId: attribute === undefined ? undefined : `warrior.${attribute}`,
        cost: { kind: costKind, amount },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
      });
    },
  );
});

describe("Tiger Stance (#2181)", () => {
  it("attacks 33% faster for 9 s", () => {
    const caster = warrior();
    selfCast("warrior.tiger-stance", caster);
    expect(caster.statuses.get("tiger-stance")?.remainingSeconds).toBe(9);
    expect(aggregateModifiers(caster.statuses.active).attackDurationMultiplier).toBe(0.67);
  });

  it("stays on a hit, a hit for 0 damage too", () => {
    const caster = warrior();
    selfCast("warrior.tiger-stance", caster);
    swing(caster, body("f"));
    expect(caster.statuses.has("tiger-stance")).toBe(true);
    const numb = body("g");
    numb.statuses.apply("frenzy", 10, "g", NO_RANKS);
    withStatusDefinitions({ frenzy: { damageTakenMultiplier: 0 } }, () => {
      const { events } = swing(caster, numb);
      expect(numb.health).toBe(1e6);
      expect(events.some((event) => event.kind === "attack-missed")).toBe(false);
      expect(events.some((event) => event.kind === "attack-blocked")).toBe(false);
    });
    expect(caster.statuses.has("tiger-stance")).toBe(true);
  });

  it("ends on a miss", () => {
    const caster = warrior();
    selfCast("warrior.tiger-stance", caster);
    caster.statuses.apply("blind", 10, "f", NO_RANKS);
    const { events } = swing(caster, body("f"), blocking());
    expect(events.some((event) => event.kind === "attack-missed")).toBe(true);
    expect(caster.statuses.has("tiger-stance")).toBe(false);
  });

  it("ends on a block, an attack skill's too", () => {
    const caster = warrior();
    selfCast("warrior.tiger-stance", caster);
    const { events } = attack("warrior.crippling-slash", caster, guarded(body("f")), blocking());
    expect(events.some((event) => event.kind === "attack-blocked")).toBe(true);
    expect(caster.statuses.has("tiger-stance")).toBe(false);
  });

  it("ends on an evade: every attack at the foe misses", () => {
    const caster = warrior();
    selfCast("warrior.tiger-stance", caster);
    const foe = body("f");
    foe.statuses.apply("shadow-form", 10, "f", NO_RANKS);
    swing(caster, foe);
    expect(caster.statuses.has("tiger-stance")).toBe(false);
  });
});

describe("Berserker Stance (#2181)", () => {
  it("attacks 33% faster and gains twice the adrenaline for 13 s", () => {
    const caster = warrior(["warrior.crippling-slash"]);
    selfCast("warrior.berserker-stance", caster);
    expect(caster.statuses.get("berserker-stance")?.remainingSeconds).toBe(13);
    expect(aggregateModifiers(caster.statuses.active).attackDurationMultiplier).toBe(0.67);
    fillPools(caster, ADRENALINE_PER_STRIKE);
    expect(caster.adrenaline.get("warrior.crippling-slash")).toBe(2 * ADRENALINE_PER_STRIKE);
  });
});

describe("Skull Crack (#2181)", () => {
  it("interrupts a spell and dazes for 15 s", () => {
    const foe = body("f");
    foe.cast.beginCast("elementalist.fireball", "f", 3, undefined);
    const { events } = attack("warrior.skull-crack", warrior(), foe);
    expect(events).toContainEqual({
      kind: "interrupted",
      targetId: "f",
      skillId: "elementalist.fireball",
    });
    expect(foe.statuses.get("dazed")?.remainingSeconds).toBe(15);
  });

  it("interrupts a non-spell skill and does not daze", () => {
    const foe = body("f");
    foe.cast.beginCast("warrior.healing-signet", "f", 2, undefined);
    const { events } = attack("warrior.skull-crack", warrior(), foe);
    expect(events).toContainEqual({
      kind: "interrupted",
      targetId: "f",
      skillId: "warrior.healing-signet",
    });
    expect(foe.statuses.has("dazed")).toBe(false);
  });

  it("does nothing when blocked", () => {
    const foe = guarded(body("f"));
    foe.cast.beginCast("elementalist.fireball", "f", 3, undefined);
    attack("warrior.skull-crack", warrior(), foe, blocking());
    expect(foe.cast.activeCast?.skillId).toBe("elementalist.fireball");
    expect(foe.statuses.has("dazed")).toBe(false);
  });
});

describe("Crippling Slash (#2181)", () => {
  it("cripples for 13 s and bleeds for 22 s", () => {
    const foe = body("f");
    attack("warrior.crippling-slash", warrior(), foe);
    expect(foe.statuses.get("crippled")?.remainingSeconds).toBe(13);
    expect(foe.statuses.get("bleeding")?.remainingSeconds).toBe(22);
  });
});

describe("Bull's Charge (#2181)", () => {
  it("moves 50% faster for 6 s", () => {
    const caster = warrior();
    selfCast("warrior.bulls-charge", caster);
    expect(caster.statuses.get("bulls-charge")?.remainingSeconds).toBe(6);
    expect(aggregateModifiers(caster.statuses.active).moveSpeedMultiplier).toBe(1.5);
  });

  it("knocks down a foe moving as the blow lands, and not a still one", () => {
    const caster = warrior();
    selfCast("warrior.bulls-charge", caster);
    const still = body("s");
    const { fired: stillFired } = swing(caster, still);
    expect(still.knockdownRemaining).toBe(0);
    expect(stillFired).toEqual([]);
    const moving = body("m");
    moving.moving = true;
    const { fired } = swing(caster, moving);
    expect(moving.knockdownRemaining).toBeGreaterThan(0);
    expect(fired.map(({ skillId }) => skillId)).toEqual(["warrior.bulls-charge"]);
  });

  it("knocks down only in melee: a bow's hit does not", () => {
    const archer = makeCombatant({
      id: "w",
      team: 0,
      attributeRanks: RANKS,
      equipment: {
        ...SWORD,
        mainHand: {
          weapon: WEAPONS.flatbow,
          attributeId: "ranger.marksmanship",
          damageType: WEAPONS.flatbow.damageType,
          requirementMet: true,
          creatureDamageScale: undefined,
        },
      },
    });
    archer.statuses.apply("bulls-charge", 10, "w", RANKS);
    const moving = body("m");
    moving.moving = true;
    swing(archer, moving);
    expect(moving.knockdownRemaining).toBe(0);
  });
});

describe("Counterattack (#2181)", () => {
  it("strikes for +29, and gains 5 Energy off an attacking foe", () => {
    const caster = warrior();
    const foe = body("f");
    foe.attack = { targetId: "w", swingElapsed: 0, unreachableSeconds: 0 };
    const { events } = attack("warrior.counterattack", caster, foe);
    expect(damageTo(events, "f")).toEqual([plainBlow() + 29]);
    expect(caster.energy).toBe(10 + 5);
  });

  it("gains none off a foe that is not attacking", () => {
    const caster = warrior();
    attack("warrior.counterattack", caster, body("f"));
    expect(caster.energy).toBe(10);
  });
});

describe("Knee Cutter (#2181)", () => {
  it("off a Crippled foe gains 6 Energy and 3 strikes", () => {
    const caster = warrior(["warrior.crippling-slash"]);
    const foe = body("f");
    foe.statuses.apply("crippled", 10, "w", NO_RANKS);
    attack("warrior.knee-cutter", caster, foe);
    expect(caster.energy).toBe(10 + 6);
    expect(caster.adrenaline.get("warrior.crippling-slash")).toBe(3 * ADRENALINE_PER_STRIKE);
  });

  it("off a foe that is not Crippled gains neither", () => {
    const caster = warrior(["warrior.crippling-slash"]);
    attack("warrior.knee-cutter", caster, body("f"));
    expect(caster.energy).toBe(10);
    expect(caster.adrenaline.get("warrior.crippling-slash")).toBe(0);
  });
});

describe("Standing Slash (#2181)", () => {
  it("strikes for +17, and +17 more in a stance", () => {
    const [bare] = damageTo(attack("warrior.standing-slash", warrior(), body("f")).events, "f");
    const stanced = warrior();
    stanced.statuses.apply("sprint", 10, "w", NO_RANKS);
    const [inStance] = damageTo(attack("warrior.standing-slash", stanced, body("f")).events, "f");
    expect(bare).toBe(plainBlow() + 17);
    expect(inStance).toBe(plainBlow() + 34);
  });
});

describe("Soldier's Strike (#2181)", () => {
  it("strikes for +34", () => {
    const { events } = attack("warrior.soldiers-strike", warrior(), body("f"));
    expect(damageTo(events, "f")).toEqual([plainBlow() + 34]);
  });

  it("is blocked as ever outside a shout or chant", () => {
    const { events } = attack("warrior.soldiers-strike", warrior(), guarded(body("f")), blocking());
    expect(events.some((event) => event.kind === "attack-blocked")).toBe(true);
  });

  it.each([
    ["shout", "watch-yourself"],
    ["chant", "song-of-restoration"],
  ] as const)("cannot be blocked under a %s", (category, statusId) => {
    const caster = warrior();
    caster.statuses.apply(statusId, 10, "w", NO_RANKS);
    expect(getStatusDefinition(statusId).category).toBe(category);
    const { events } = attack("warrior.soldiers-strike", caster, guarded(body("f")), blocking());
    expect(events.some((event) => event.kind === "attack-blocked")).toBe(false);
  });
});

describe("the stances that end on a skill, in a match (#2181)", () => {
  const BAR = ["warrior.berserker-stance", "warrior.bulls-charge", "warrior.watch-yourself"];

  function match(): MatchSimulation {
    return new MatchSimulation({
      seed: "warrior-staples-4",
      participants: [
        {
          id: "w",
          team: 0,
          skillBar: [...BAR],
          attributeRanks: RANKS,
          equipment: SWORD,
          maxHealth: 1e4,
          maxEnergy: 1000,
          spawn: vec2(0, 0),
          facing: 0,
        },
        {
          id: "f",
          team: 1,
          skillBar: [],
          attributeRanks: new Map(),
          equipment: SWORD,
          maxHealth: 1e4,
          maxEnergy: 1000,
          spawn: vec2(400, 0),
          facing: 0,
        },
      ],
    });
  }

  function get(sim: MatchSimulation): Combatant {
    const found = sim.get("w");
    if (found === undefined) {
      throw new Error("no participant w");
    }
    return found.combatant;
  }

  /** `w` uses bar slot `slot`, and the steps until its use is logged. */
  function use(sim: MatchSimulation, slot: number): CombatLogEntry[] {
    const id = BAR[slot] ?? "";
    const cost = skill(id).cost;
    if (cost?.kind === "adrenaline") {
      get(sim).adrenaline.set(id, cost.amount * ADRENALINE_PER_STRIKE);
    }
    expect(sim.requestSkill("w", slot)?.check).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < 2 / DT; i += 1) {
      log.push(...sim.step(DT).log);
      if (log.some((entry) => entry.skillId === id)) {
        break;
      }
    }
    return log;
  }

  it.each([
    [0, "berserker-stance"],
    [1, "bulls-charge"],
  ] as const)("slot %i's %s survives its own use, and ends on the next skill", (slot, statusId) => {
    const sim = match();
    use(sim, slot);
    sim.step(DT);
    expect(get(sim).statuses.has(statusId)).toBe(true);
    use(sim, 2);
    expect(get(sim).statuses.has(statusId)).toBe(false);
  });
});
