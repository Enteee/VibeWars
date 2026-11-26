import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng, seedFromString } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "../skills/status.js";
import type { Skill } from "../skills/types.js";
import { lowRankMisses } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { EN_NAMES, EN_WORDS } from "../skills/describe-words.js";

/**
 * The Ranger staples 5 (#2133): two preparations, a stance and two bow
 * attacks, on a critical rider bound to the bow, a failed hit bound to
 * it, elemental damage as one type, a miss chance at a low rank and a
 * target within a distance of its caster.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };
/** Every blow crits. */
const ALL_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: 1 } };

const DISRUPTING_ACCURACY = "ranger.disrupting-accuracy";
const OATH_SHOT = "ranger.oath-shot";
const MARKSMANS_WAGER = "ranger.marksmans-wager";
const STORM_CHASER = "ranger.storm-chaser";
const SCREAMING_SHOT = "ranger.screaming-shot";
const BAR = [DISRUPTING_ACCURACY, OATH_SHOT, MARKSMANS_WAGER, STORM_CHASER, SCREAMING_SHOT];

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

interface Setup {
  readonly foe?: ParticipantSpec;
  readonly expertise?: number;
  readonly weapon?: Weapon;
  readonly ruleset?: Ruleset;
  readonly seed?: string;
}

/**
 * `r`, a rank-12 Ranger with `BAR` and a longbow, at the origin, and `f`,
 * its foe, 200 east unless `foe` places it.
 */
function match({
  foe,
  expertise = 12,
  weapon = WEAPONS.longbow,
  ruleset = NO_CRIT,
  seed = "mechanics-ranger-staples-5",
}: Setup = {}): MatchSimulation {
  const ranger = spec("r", 0, vec2(0, 0), {
    skillBar: BAR,
    attributeRanks: new Map([
      ["ranger.marksmanship", 12],
      ["ranger.expertise", expertise],
      ["ranger.wilderness-survival", 12],
    ]),
    equipment: wielding(weapon, "ranger.marksmanship"),
  });
  return new MatchSimulation({
    seed,
    ruleset,
    participants: [ranger, foe ?? spec("f", 1, vec2(200, 0))],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

function events(log: readonly CombatLogEntry[]): CombatEvent[] {
  return log.flatMap((entry) => entry.events);
}

/** `r` uses the self-targeted skill `skillId`, and steps until it is done. */
function useOnSelf(sim: MatchSimulation, skillId: string): CombatLogEntry[] {
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  return stepFor(sim, skill(skillId).activationSeconds + 1);
}

/** `r` uses `skillId` on `f`: its events until it landed. */
function shot(sim: MatchSimulation, skillId: string): CombatEvent[] {
  sim.setTarget("r", "f");
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  const all: CombatEvent[] = [];
  for (let tick = 1; tick <= 10 * RULES.tickRateHz; tick += 1) {
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "r" && entry.skillId === skillId)
      .flatMap((entry) => entry.events);
    all.push(...logged);
    if (logged.length > 0 && sim.projectiles.length === 0) {
      return all;
    }
  }
  throw new Error(`${skillId} never landed`);
}

/** `r` attacks `f` until its first blow or arrow reaches it: everything logged until then. */
function blow(sim: MatchSimulation): CombatLogEntry[] {
  expect(sim.requestAttack("r", "f")).toEqual({ ok: true });
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim.step(DT).log;
    log.push(...logged);
    const reached = logged.some(
      (entry) => entry.sourceId === "r" && entry.skillId === undefined && entry.events.length > 0,
    );
    if (reached && sim.projectiles.length === 0) {
      return log;
    }
  }
  throw new Error("r never reached f");
}

/** The events of `skillId`'s log entries. */
function from(log: readonly CombatLogEntry[], skillId: string): CombatEvent[] {
  return events(log.filter((entry) => entry.skillId === skillId));
}

describe("the corpus's numbers (#2133)", () => {
  it("are each skill's", () => {
    const rows = BAR.map((id) => {
      const { gwId, type, elite, attributeId, cost, activationSeconds, rechargeSeconds } =
        skill(id);
      return [
        id,
        gwId,
        type,
        elite,
        attributeId,
        cost?.kind === "energy" ? cost.amount : 0,
        activationSeconds,
        rechargeSeconds,
      ];
    });
    const M = "ranger.marksmanship";
    const E = "ranger.expertise";
    const W = "ranger.wilderness-survival";
    expect(rows).toEqual([
      [DISRUPTING_ACCURACY, 1723, "preparation", false, M, 5, 2, 12],
      [OATH_SHOT, 405, "attack", true, E, 10, 0, 25],
      [MARKSMANS_WAGER, 430, "preparation", true, E, 5, 1, 24],
      [STORM_CHASER, 455, "stance", false, W, 10, 0, 20],
      [SCREAMING_SHOT, 1719, "attack", false, M, 10, 0, 8],
    ]);
  });

  it("each status lasts as long as GW1's at rank 12", () => {
    const statuses: [string, StatusId][] = [
      [DISRUPTING_ACCURACY, "disrupting-accuracy"],
      [MARKSMANS_WAGER, "marksmans-wager"],
      [STORM_CHASER, "storm-chaser"],
    ];
    const durations = statuses.map(([skillId, statusId]) => {
      const sim = match();
      useOnSelf(sim, skillId);
      return get(sim, "r").combatant.statuses.get(statusId)?.durationSeconds;
    });
    expect(durations).toEqual([36, 18, 18]);
  });
});

describe("Disrupting Accuracy and a critical rider bound to the bow (#2133)", () => {
  /** `f` begins Shelter's 5 s cast, then `r` lands a critical on it with `weapon`. */
  function interrupted(weapon: Weapon, at: Vec2): boolean {
    const sim = match({
      weapon,
      ruleset: ALL_CRIT,
      foe: spec("f", 1, at, {
        skillBar: ["ritualist.shelter"],
        attributeRanks: new Map([["ritualist.communing", 12]]),
      }),
    });
    get(sim, "r").combatant.statuses.apply("disrupting-accuracy", 1000, "r", NO_RANKS);
    expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 0.5);
    expect(get(sim, "f").combatant.cast.activeCast?.skillId).toBe("ritualist.shelter");
    const log = blow(sim);
    expect(
      events(log).some(
        (event) => event.kind === "damage" && event.targetId === "f" && event.critical,
      ),
    ).toBe(true);
    return from(log, DISRUPTING_ACCURACY).some(
      (event) => event.kind === "interrupted" && event.targetId === "f",
    );
  }

  it("an arrow's critical interrupts a 5 s cast", () => {
    expect(interrupted(WEAPONS.longbow, vec2(200, 0))).toBe(true);
  });

  it("a sword's critical does not", () => {
    expect(interrupted(WEAPONS.sword, vec2(40, 0))).toBe(false);
  });

  it("says so", () => {
    expect(describeStatus("disrupting-accuracy", undefined, EN_WORDS, EN_NAMES)).toContain(
      "every time you land a critical hit with a bow: interrupts",
    );
  });
});

describe("Oath Shot and missChanceAtOrBelowRank (#2133)", () => {
  it("a hit recharges Storm Chaser's 20 s, not itself", () => {
    const sim = match();
    useOnSelf(sim, STORM_CHASER);
    const caster = get(sim, "r").combatant;
    expect(caster.cast.rechargeRemaining.get(STORM_CHASER) ?? 0).toBeGreaterThan(15);
    const landed = shot(sim, OATH_SHOT);
    expect(landed.some((event) => event.kind === "damage" && event.targetId === "f")).toBe(true);
    expect(caster.cast.rechargeRemaining.get(STORM_CHASER) ?? 0).toBe(0);
    expect(caster.cast.rechargeRemaining.get(OATH_SHOT) ?? 0).toBeGreaterThan(20);
  });

  it("a block disables every skill for 5 s, Oath Shot's own under its recharge", () => {
    const sim = match();
    get(sim, "f").combatant.statuses.apply("magnetic-surge", 1000, "f", NO_RANKS);
    const landed = shot(sim, OATH_SHOT);
    expect(landed.some((event) => event.kind === "attack-blocked")).toBe(true);
    const waits = get(sim, "r").combatant.cast.rechargeRemaining;
    for (const id of BAR.filter((id) => id !== OATH_SHOT)) {
      expect(waits.get(id), id).toBeGreaterThan(4.5);
      expect(waits.get(id), id).toBeLessThanOrEqual(5);
    }
    expect(waits.get(OATH_SHOT) ?? 0).toBeGreaterThan(20);
  });

  it("misses about half its blows at Expertise 7, none at 8", () => {
    const misses = (expertise: number): number => {
      const caster = get(match({ expertise }), "r").combatant;
      const rng = createRng(seedFromString(`oath-${String(expertise)}`));
      let count = 0;
      for (let n = 0; n < 200; n += 1) {
        if (lowRankMisses(skill(OATH_SHOT).attack, caster, rng)) {
          count += 1;
        }
      }
      return count;
    };
    expect(misses(7)).toBeGreaterThan(70);
    expect(misses(7)).toBeLessThan(130);
    expect(misses(8)).toBe(0);
  });

  it("its miss in a match is a miss: every skill disabled", () => {
    const missed = Array.from({ length: 20 }, (_, n) => {
      const sim = match({ expertise: 0, seed: `oath-miss-${String(n)}` });
      const landed = shot(sim, OATH_SHOT);
      return { sim, missed: landed.some((event) => event.kind === "attack-missed") };
    }).find((run) => run.missed);
    expect(missed).toBeDefined();
    const waits =
      missed === undefined ? new Map() : get(missed.sim, "r").combatant.cast.rechargeRemaining;
    expect(waits.get(SCREAMING_SHOT)).toBeGreaterThan(4.5);
  });

  it("says so", () => {
    const texts = describeSkill(skill(OATH_SHOT), undefined, EN_WORDS, EN_NAMES).effects.map(
      (effect) => effect.text,
    );
    expect(texts).toContain("50% chance to miss with Expertise 7 or less");
  });
});

describe("Marksman's Wager and a failed hit bound to the bow (#2133)", () => {
  /** `r`, at `energy`, under Marksman's Wager, attacks `f` once, `f` blocking the next if `blocking`. */
  function wager(blocking: boolean, energy: number, setup: Setup = {}) {
    const sim = match(setup);
    if (blocking) {
      get(sim, "f").combatant.statuses.apply("magnetic-surge", 1000, "f", NO_RANKS);
    }
    const caster = get(sim, "r").combatant;
    caster.statuses.apply("marksmans-wager", 1000, "r", NO_RANKS);
    caster.energy = energy;
    const log = blow(sim);
    expect(events(log).some((event) => event.kind === "attack-blocked")).toBe(blocking);
    return { wagered: from(log, MARKSMANS_WAGER), energy: caster.energy };
  }

  it("an arrow that hits gains 9 Energy", () => {
    expect(wager(false, 500).wagered).toEqual([{ kind: "energy-gain", targetId: "r", amount: 9 }]);
  });

  it("a blocked arrow loses 10, and at 4 Energy leaves 0", () => {
    expect(wager(true, 500).wagered).toEqual([{ kind: "energy-loss", targetId: "r", amount: 10 }]);
    const poor = wager(true, 4).energy;
    expect(poor).toBeGreaterThanOrEqual(0);
    expect(poor).toBeLessThan(1);
  });

  it("a blocked sword blow loses nothing", () => {
    const sword = { weapon: WEAPONS.sword, foe: spec("f", 1, vec2(40, 0)) };
    expect(wager(true, 500, sword).wagered).toEqual([]);
  });
});
describe("Storm Chaser and elemental damage as one type (#2133)", () => {
  it("moves its bearer 25% faster", () => {
    const sim = match();
    useOnSelf(sim, STORM_CHASER);
    expect(aggregateModifiers(get(sim, "r").combatant.statuses.active).moveSpeedMultiplier).toBe(
      1.25,
    );
  });

  it("a foe's fire gives 4 Energy", () => {
    const sim = match({
      foe: spec("f", 1, vec2(200, 0), {
        skillBar: ["elementalist.flare"],
        attributeRanks: new Map([["elementalist.fire-magic", 12]]),
      }),
    });
    get(sim, "r").combatant.energy = 0;
    get(sim, "r").combatant.statuses.apply("storm-chaser", 1000, "r", NO_RANKS);
    sim.setTarget("f", "r");
    expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
    const log = stepFor(sim, 3);
    expect(events(log).some((event) => event.kind === "damage" && event.targetId === "r")).toBe(
      true,
    );
    expect(from(log, STORM_CHASER)).toEqual([{ kind: "energy-gain", targetId: "r", amount: 4 }]);
  });

  it("a foe's sword gives none", () => {
    const sim = match({
      foe: spec("f", 1, vec2(40, 0), {
        equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
      }),
    });
    get(sim, "r").combatant.energy = 0;
    get(sim, "r").combatant.statuses.apply("storm-chaser", 1000, "r", NO_RANKS);
    expect(sim.requestAttack("f", "r")).toEqual({ ok: true });
    const log = stepFor(sim, 3);
    expect(events(log).some((event) => event.kind === "damage" && event.targetId === "r")).toBe(
      true,
    );
    expect(from(log, STORM_CHASER)).toEqual([]);
  });

  it("says so", () => {
    expect(describeStatus("storm-chaser", undefined, EN_WORDS, EN_NAMES)).toContain(
      "Whenever you take elemental damage from a foe",
    );
  });
});

describe("Screaming Shot and target-within (#2133)", () => {
  it("+22 damage at rank 12", () => {
    expect(skill(SCREAMING_SHOT).attack?.bonusDamage).toMatchObject({ scaling: { atTwelve: 22 } });
  });

  it("bleeds a foe at 300 for 17 s, and not one at 500", () => {
    const bleeding = (at: number) => {
      const sim = match({ foe: spec("f", 1, vec2(at, 0)) });
      const landed = shot(sim, SCREAMING_SHOT);
      expect(landed.some((event) => event.kind === "damage" && event.targetId === "f")).toBe(true);
      return get(sim, "f").combatant.statuses.get("bleeding")?.durationSeconds;
    };
    expect(bleeding(300)).toBe(17);
    expect(bleeding(500)).toBeUndefined();
  });

  it("says so", () => {
    const texts = describeSkill(skill(SCREAMING_SHOT), undefined, EN_WORDS, EN_NAMES).effects.map(
      (effect) => effect.text,
    );
    expect(texts.some((text) => text.startsWith("If target is within earshot"))).toBe(true);
  });
});
