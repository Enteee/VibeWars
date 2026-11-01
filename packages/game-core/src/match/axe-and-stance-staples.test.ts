import { createRng } from "../rng.js";
import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { gainStrikes } from "../skills/adrenaline.js";
import { getSkill } from "../skills/catalog.js";
import { mitigate, skillDamage } from "../skills/damage.js";
import { describeStatus } from "../skills/describe.js";
import type { CombatLogEntry } from "./combat-log.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, getStatusDefinition } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Staples (#1869): three Axe attacks, two Warrior stances, a Ranger
 * stance and a bow attack, on primitives that already exist, at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const KEEN_CHOP = "warrior.keen-chop";
const PENETRATING_CHOP = "warrior.penetrating-chop";
const LACERATING_CHOP = "warrior.lacerating-chop";
const FRENZIED_DEFENSE = "warrior.frenzied-defense";
const FLURRY = "warrior.flurry";
const HEKETS_RAMPAGE = "ranger.hekets-rampage";
const SUNDERING_ATTACK = "ranger.sundering-attack";
const WARRIOR_BAR = [KEEN_CHOP, PENETRATING_CHOP, LACERATING_CHOP, FRENZIED_DEFENSE, FLURRY];
const RANGER_BAR = [HEKETS_RAMPAGE, SUNDERING_ATTACK];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** `a`, a rank-12 axe Warrior at the origin, its adrenaline full; `f`, its foe, in reach. */
function warriorMatch(seed = "staples-1869", ruleset: Ruleset = NO_CRIT) {
  const sim = new MatchSimulation({
    seed,
    ruleset,
    participants: [
      spec("a", 0, vec2(0, 0), {
        skillBar: WARRIOR_BAR,
        attributeRanks: new Map([
          ["warrior.strength", 12],
          ["warrior.axe-mastery", 12],
        ]),
        equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
      }),
      spec("f", 1, vec2(RANGE_MELEE / 2, 0)),
    ],
  });
  gainStrikes(get(sim, "a").combatant, 8, 0);
  return sim;
}

/** `a`, a rank-12 Ranger with a longbow at the origin; `f`, its foe, 200 east. */
function rangerMatch() {
  return new MatchSimulation({
    seed: "staples-1869",
    ruleset: NO_CRIT,
    participants: [
      spec("a", 0, vec2(0, 0), {
        skillBar: RANGER_BAR,
        attributeRanks: new Map([
          ["ranger.marksmanship", 12],
          ["ranger.beast-mastery", 12],
        ]),
        equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
      }),
      spec("f", 1, vec2(200, 0)),
    ],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function slot(skillId: string): number {
  const index = [...WARRIOR_BAR, ...RANGER_BAR].indexOf(skillId);
  return index < WARRIOR_BAR.length ? index : index - WARRIOR_BAR.length;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `a` uses `skillId` on `f`: its events until it landed. */
function used(sim: MatchSimulation, skillId: string): CombatEvent[] {
  sim.setTarget("a", "f");
  expect(sim.requestSkill("a", slot(skillId))?.check).toEqual({ ok: true });
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "a" && entry.skillId === skillId)
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind !== "skill-used");
    if (logged.length > 0 && sim.projectiles.length === 0) {
      return logged;
    }
  }
  throw new Error(`${skillId} never landed`);
}

/** `a`'s first plain attack on `f`: its events. */
function swing(sim: MatchSimulation): CombatEvent[] {
  expect(sim.requestAttack("a", "f")).toEqual({ ok: true });
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "a" && entry.skillId === undefined)
      .flatMap((entry) => entry.events);
    if (logged.length > 0 && sim.projectiles.length === 0) {
      return logged;
    }
  }
  throw new Error("a never hit f");
}

function damageTo(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

describe("the staples' numbers (#1869)", () => {
  it.each([
    [KEEN_CHOP, 2009, "warrior.axe-mastery", { kind: "adrenaline", amount: 3 }, 0, 0],
    [PENETRATING_CHOP, 1136, "warrior.axe-mastery", { kind: "adrenaline", amount: 5 }, 0, 0],
    [LACERATING_CHOP, 849, "warrior.axe-mastery", { kind: "adrenaline", amount: 5 }, 0, 0],
    [FRENZIED_DEFENSE, 1700, undefined, { kind: "energy", amount: 5 }, 0, 10],
    [FLURRY, 344, undefined, { kind: "energy", amount: 5 }, 0, 5],
    [HEKETS_RAMPAGE, 1728, "ranger.beast-mastery", { kind: "energy", amount: 5 }, 0, 10],
    [SUNDERING_ATTACK, 1191, "ranger.marksmanship", { kind: "energy", amount: 10 }, 1, 4],
  ] as const)("%s: gwId %i", (id, gwId, attributeId, cost, activationSeconds, rechargeSeconds) => {
    expect(skill(id)).toMatchObject({ gwId, cost, activationSeconds, rechargeSeconds });
    expect(skill(id).attributeId).toBe(attributeId);
  });
});

describe("Keen Chop (#1869)", () => {
  it("a hit is always a critical hit", () => {
    const events = used(warriorMatch(), KEEN_CHOP);
    expect(events).toContainEqual(expect.objectContaining({ kind: "damage", critical: true }));
  });

  it("a blocked chop is no critical hit, and no damage", () => {
    const sim = warriorMatch();
    get(sim, "f").combatant.statuses.apply("frenzied-defense", 1000, "f", NO_RANKS);
    for (let tries = 0; tries < 10; tries += 1) {
      const events = used(sim, KEEN_CHOP);
      if (events.some((event) => event.kind === "attack-blocked")) {
        expect(damageTo(events, "f")).toEqual([]);
        return;
      }
      gainStrikes(get(sim, "a").combatant, 8, 0);
      stepFor(sim, 2);
    }
    throw new Error("f never blocked");
  });
});

describe("Penetrating Chop and Sundering Attack (#1869)", () => {
  it("Penetrating Chop: +22 and 20% armor penetration, harder than a swing and its bonus", () => {
    expect(skill(PENETRATING_CHOP).attack).toMatchObject({
      bonusDamage: { scaling: { atTwelve: 22 } },
      armorPenetration: 0.2,
    });
    const [plain] = damageTo(swing(warriorMatch()), "f");
    const [chop] = damageTo(used(warriorMatch(), PENETRATING_CHOP), "f");
    expect(chop ?? 0).toBeGreaterThan((plain ?? 0) + 22);
  });

  it("Sundering Attack: +13 and 10% armor penetration, harder than an arrow and its bonus", () => {
    expect(skill(SUNDERING_ATTACK).attack).toMatchObject({
      bonusDamage: { scaling: { atTwelve: 13 } },
      armorPenetration: 0.1,
    });
    const [plain] = damageTo(swing(rangerMatch()), "f");
    const [shot] = damageTo(used(rangerMatch(), SUNDERING_ATTACK), "f");
    expect(shot ?? 0).toBeGreaterThan((plain ?? 0) + 13);
  });
});

describe("Lacerating Chop (#1869)", () => {
  it("+17, and Bleeding for 17 s only on a knocked-down foe", () => {
    expect(skill(LACERATING_CHOP).attack?.bonusDamage).toMatchObject({
      scaling: { atTwelve: 17 },
    });
    const standing = warriorMatch();
    expect(damageTo(used(standing, LACERATING_CHOP), "f")).toHaveLength(1);
    expect(get(standing, "f").combatant.statuses.has("bleeding")).toBe(false);

    const down = warriorMatch();
    get(down, "f").combatant.knockdownRemaining = 1000;
    used(down, LACERATING_CHOP);
    expect(get(down, "f").combatant.statuses.get("bleeding")?.durationSeconds).toBe(17);
  });
});

describe("Frenzied Defense (#1869)", () => {
  it("blocks about 75% of attacks over a seeded run", () => {
    const sim = warriorMatch();
    get(sim, "a").combatant.statuses.apply("frenzied-defense", 1000, "a", NO_RANKS);
    // `f` swings at `a`: the axe it is handed blocks nothing itself.
    expect(sim.requestAttack("f", "a")).toEqual({ ok: true });
    const events = stepFor(sim, 120)
      .filter((entry) => entry.sourceId === "f")
      .flatMap((entry) => entry.events);
    const blocked = events.filter((event) => event.kind === "attack-blocked").length;
    const hits = events.filter((event) => event.kind === "damage").length;
    expect(blocked + hits).toBeGreaterThan(50);
    expect(blocked / (blocked + hits)).toBeGreaterThan(0.65);
    expect(blocked / (blocked + hits)).toBeLessThan(0.85);
  });

  it("doubles all damage taken, from anyone", () => {
    const bearer = makeCombatant({ id: "x", maxHealth: 480 });
    bearer.statuses.apply("frenzied-defense", 8, "x", NO_RANKS);
    expect(
      mitigate(skillDamage(20, "typeless", 0), bearer, RULES.combat, "chest", createRng(1)),
    ).toBe(40);
  });
});

describe("Flurry (#1869)", () => {
  it("attacks 33% faster for 25% less weapon damage", () => {
    expect(aggregateModifiers([{ id: "flurry", ranks: NO_RANKS }])).toMatchObject({
      attackDurationMultiplier: 0.67,
      weaponDamageMultiplier: 0.75,
    });
  });

  it("lands more swings, each weaker", () => {
    const run = (flurry: boolean) => {
      const sim = warriorMatch();
      if (flurry) {
        get(sim, "a").combatant.statuses.apply("flurry", 1000, "a", NO_RANKS);
      }
      expect(sim.requestAttack("a", "f")).toEqual({ ok: true });
      return damageTo(
        stepFor(sim, 20)
          .filter((entry) => entry.sourceId === "a")
          .flatMap((entry) => entry.events),
        "f",
      );
    };
    const plain = run(false);
    const flurried = run(true);
    expect(flurried.length).toBeGreaterThan(plain.length);
    expect(Math.max(...flurried)).toBeLessThan(Math.max(...plain));
  });
});

describe("Heket's Rampage (#1869)", () => {
  it("attacks 33% faster, and says it ends on an attack skill", () => {
    expect(getStatusDefinition("hekets-rampage").attackDurationMultiplier).toBe(0.67);
    expect(describeStatus("hekets-rampage")).toContain("ends if you use an attack skill");
  });

  it("a plain arrow keeps it", () => {
    const sim = rangerMatch();
    get(sim, "a").combatant.statuses.apply("hekets-rampage", 10, "a", NO_RANKS);
    swing(sim);
    expect(get(sim, "a").combatant.statuses.has("hekets-rampage")).toBe(true);
  });

  it("an attack skill ends it, and is not hastened by it", () => {
    const sim = rangerMatch();
    const ranger = get(sim, "a").combatant;
    ranger.statuses.apply("hekets-rampage", 10, "a", NO_RANKS);
    sim.setTarget("a", "f");
    expect(sim.requestSkill("a", slot(SUNDERING_ATTACK))?.check).toEqual({ ok: true });
    expect(ranger.statuses.has("hekets-rampage")).toBe(false);
    // Half of its 1 s activation, not of 0.67 s.
    expect(ranger.cast.activeCast?.totalSeconds).toBeCloseTo(0.5);
    const landed = stepFor(sim, 3).filter((entry) => entry.skillId === SUNDERING_ATTACK);
    expect(
      damageTo(
        landed.flatMap((entry) => entry.events),
        "f",
      ),
    ).toHaveLength(1);
  });
});
