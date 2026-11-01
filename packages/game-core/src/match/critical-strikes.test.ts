import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { RANGE_MELEE } from "../distances.js";
import { criticalStrikesEnergy } from "../primary-attributes.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import { blockChanceOf } from "../skills/tick.js";
import { landedCritical } from "../skills/weapon-attack.js";
import { vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Critical Strikes staples (#1315): Critical Strike crits on every blow,
 * Malicious Strike on a conditioned foe, Unsuspecting Strike hits a
 * healthy foe harder, and Critical Defenses blocks and is refreshed by
 * each critical hit its bearer lands.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const JAGGED_STRIKE = 0;
const FOX_FANGS = 1;
const CRITICAL_STRIKE = 2;
const MALICIOUS_STRIKE = 3;
const UNSUSPECTING_STRIKE = 4;
const CRITICAL_DEFENSES = 5;

/** No roll ever crits: whatever ranks add, the chance stays below 0. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };
/** Every roll crits. */
const ALL_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: 1 } };

/** Daggers that always roll their maximum, so two blows differ only by what a skill adds. */
const STEADY_DAGGERS: Weapon = { ...WEAPONS.daggers, damageMin: WEAPONS.daggers.damageMax };

function daggers(): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: STEADY_DAGGERS,
      attributeId: "assassin.dagger-mastery",
      damageType: STEADY_DAGGERS.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function fight(ruleset: Ruleset = NO_CRIT): MatchSimulation {
  return new MatchSimulation({
    seed: "critical-strikes",
    ruleset,
    participants: [
      {
        id: "sin",
        team: 0,
        skillBar: [
          "assassin.jagged-strike",
          "assassin.fox-fangs",
          "assassin.critical-strike",
          "assassin.malicious-strike",
          "assassin.unsuspecting-strike",
          "assassin.critical-defenses",
        ],
        attributeRanks: new Map([
          ["assassin.dagger-mastery", 12],
          ["assassin.critical-strikes", 12],
        ]),
        equipment: daggers(),
        maxEnergy: 60,
        spawn: vec2(0, 0),
        facing: 0,
      },
      {
        id: "foe",
        team: 1,
        skillBar: [],
        attributeRanks: new Map(),
        equipment: unarmedResolvedEquipment(60),
        maxHealth: 1e6,
        spawn: vec2(RANGE_MELEE / 2, 0),
        facing: Math.PI,
      },
    ],
  });
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `slot` used at `targetId`, stepped until it resolves, then 1 s more so the next is not queued. */
function use(match: MatchSimulation, slot: number, targetId = "foe"): CombatLogEntry {
  const skillId = get(match, "sin").skillBar[slot] ?? "";
  match.setTarget("sin", targetId);
  expect(match.requestSkill("sin", slot)?.check).toEqual({ ok: true });
  for (let i = 0; i < 100; i += 1) {
    const entry = match.step(DT).log.find((logged) => logged.skillId === skillId);
    if (entry !== undefined) {
      stepFor(match, 1);
      return entry;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

type DamageEvent = Extract<CombatEvent, { kind: "damage" }>;

function blowsOn(entry: CombatLogEntry, targetId = "foe"): DamageEvent[] {
  return entry.events.filter(
    (event): event is DamageEvent => event.kind === "damage" && event.targetId === targetId,
  );
}

function energyGains(entry: CombatLogEntry): number[] {
  return entry.events.flatMap((event) =>
    event.kind === "energy-gain" && event.targetId === "sin" ? [event.amount] : [],
  );
}

describe("Critical Strike (#1315)", () => {
  it("after a lead and an off-hand, both blows crit, each paying Critical Strikes' energy and 3", () => {
    const match = fight();
    const opened = [use(match, JAGGED_STRIKE), use(match, FOX_FANGS)];
    // The rolls crit nothing: the chain's own blows are plain.
    expect(opened.flatMap((entry) => blowsOn(entry)).map((blow) => blow.critical)).toEqual([
      false,
      false,
    ]);
    // Room for every gain under the 60 maximum.
    get(match, "sin").combatant.energy = 10;
    const entry = use(match, CRITICAL_STRIKE);
    expect(blowsOn(entry).map((blow) => blow.critical)).toEqual([true, true]);
    expect(energyGains(entry).reduce((sum, gained) => sum + gained, 0)).toBe(
      2 * (criticalStrikesEnergy(12) + 3),
    );
  });

  it("out of chain order it misses, as Twisting Fangs does", () => {
    const match = fight();
    const entry = use(match, CRITICAL_STRIKE);
    expect(blowsOn(entry)).toEqual([]);
    expect(
      entry.events.some(
        (event) => event.kind === "attack-missed" && event.reason === "out-of-sequence",
      ),
    ).toBe(true);
  });
});

describe("Malicious Strike (#1315)", () => {
  /** Its one blow on the foe, bleeding or not. */
  function malicious(bleeding: boolean): DamageEvent {
    const match = fight();
    if (bleeding) {
      get(match, "foe").combatant.statuses.apply("bleeding", 20, "sin", NO_RANKS);
    }
    const [blow] = blowsOn(use(match, MALICIOUS_STRIKE));
    if (blow === undefined) {
      throw new Error("Malicious Strike did not hit");
    }
    return blow;
  }

  it("on a conditioned foe crits and adds 26; on a clean one, neither", () => {
    const clean = malicious(false);
    const bleeding = malicious(true);
    expect(clean.critical).toBe(false);
    expect(bleeding.critical).toBe(true);
    // A crit's weapon part is at least the maximum the clean blow rolled.
    expect(bleeding.amount - clean.amount).toBeGreaterThanOrEqual(26);
  });
});

describe("Unsuspecting Strike (#1315)", () => {
  /** Its blow on a foe at `fraction` of its maximum health. */
  function unsuspecting(fraction: number): number {
    const match = fight();
    const foe = get(match, "foe").combatant;
    foe.health = foe.maxHealth * fraction;
    const [blow] = blowsOn(use(match, UNSUSPECTING_STRIKE));
    if (blow === undefined) {
      throw new Error("Unsuspecting Strike did not hit");
    }
    return blow.amount;
  }

  it("deals 63 more above 90% Health; at exactly 90% and below, none", () => {
    const below = unsuspecting(0.5);
    expect(unsuspecting(0.9)).toBe(below);
    expect(unsuspecting(1) - below).toBe(63);
  });

  it("is a lead attack: Fox Fangs follows it", () => {
    const match = fight();
    use(match, UNSUSPECTING_STRIKE);
    expect(blowsOn(use(match, FOX_FANGS))).toHaveLength(1);
  });
});

describe("Critical Defenses (#1315)", () => {
  it("is a 1 s self enchantment, 10 energy, 30 s, that blocks 75% for 9 s", () => {
    expect(getSkill("assassin.critical-defenses")).toMatchObject({
      type: "enchantment",
      target: "self",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 1,
      rechargeSeconds: 30,
      effects: [{ kind: "apply-status", statusId: "critical-defenses", durationSeconds: 9 }],
    });
    const bearer = makeCombatant({ id: "b" });
    bearer.statuses.apply("critical-defenses", 9, "b", NO_RANKS);
    expect(blockChanceOf(bearer, "melee")).toBe(0.75);
    expect(blockChanceOf(bearer, "projectile")).toBe(0.75);
  });

  it("a critical hit puts its remaining time back to the duration it was applied with", () => {
    const bearer = makeCombatant({ id: "b" });
    bearer.statuses.apply("critical-defenses", 9, "b", NO_RANKS);
    bearer.statuses.advance(5, false);
    expect(bearer.statuses.get("critical-defenses")?.remainingSeconds).toBeCloseTo(4, 9);
    landedCritical(bearer, 12, []);
    expect(bearer.statuses.get("critical-defenses")?.remainingSeconds).toBe(9);
  });

  it("in a match, a crit at 8 s left resets it to 9 s", () => {
    const match = fight(ALL_CRIT);
    use(match, CRITICAL_DEFENSES, "sin");
    const sin = get(match, "sin").combatant;
    expect(sin.statuses.get("critical-defenses")?.remainingSeconds).toBeCloseTo(8, 1);
    match.requestAttack("sin", "foe");
    for (let i = 0; i < 200; i += 1) {
      const crit = match.step(DT).log.some((entry) => blowsOn(entry).some((blow) => blow.critical));
      if (crit) {
        break;
      }
    }
    expect(sin.statuses.get("critical-defenses")?.remainingSeconds).toBeGreaterThan(9 - 2 * DT);
  });

  it("with no crits it ends on time, however its bearer attacks", () => {
    const match = fight();
    use(match, CRITICAL_DEFENSES, "sin");
    match.requestAttack("sin", "foe");
    stepFor(match, 7.9);
    expect(get(match, "sin").combatant.statuses.has("critical-defenses")).toBe(true);
    stepFor(match, 0.2);
    expect(get(match, "sin").combatant.statuses.has("critical-defenses")).toBe(false);
  });
});

describe("Critical Strikes texts (#1315)", () => {
  const lines = (id: string): string[] => {
    const found = getSkill(id);
    if (found === undefined) {
      throw new Error(`unknown skill ${id}`);
    }
    return describeSkill(found, new Map([["assassin.critical-strikes", 12]])).effects.map(
      (effect) => effect.text,
    );
  };

  it("says what each does", () => {
    expect(lines("assassin.critical-strike")).toContain("Results in a critical hit");
    expect(lines("assassin.malicious-strike")).toEqual(
      expect.arrayContaining([
        "If target has a condition: +26 damage",
        "If target has a condition: results in a critical hit",
      ]),
    );
    expect(lines("assassin.unsuspecting-strike")).toContain(
      "If target is above 90% Health: +63 damage",
    );
    expect(describeStatus("critical-defenses")).toBe(
      "75% chance to block attacks, refreshes every time you land a critical hit",
    );
  });
});
