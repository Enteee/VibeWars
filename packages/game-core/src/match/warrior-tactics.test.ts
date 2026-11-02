import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY, RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { criticalStrikesEnergy } from "../primary-attributes.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { describeStatus } from "../skills/describe.js";
import { applyEffects, type CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers } from "../skills/status.js";
import { chargeAdrenaline, makeCombatant } from "../skills/testing.js";
import { blockChanceOf } from "../skills/tick.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Warrior Tactics stances (#1329): Bonetti's Defense, Deflect Arrows and
 * Gladiator's Defense answer the blocks they make, Disciplined Stance ends
 * on an adrenal skill, and Balanced Stance stops knockdowns and the extra
 * damage of a critical hit.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BONETTIS_DEFENSE = 0;
const HEALING_SIGNET = 5;
const WATCH_YOURSELF = 6;

/** Every roll crits. */
const ALL_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: 1 } };

/** Daggers that always roll their maximum, so a normal blow and a crit differ only by the crit. */
const STEADY_DAGGERS: Weapon = { ...WEAPONS.daggers, damageMin: WEAPONS.daggers.damageMax };

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

/** The rank-12 Tactics warrior every test watches, at the origin. */
function warrior(): ParticipantSpec {
  return {
    id: "w",
    team: 0,
    skillBar: [
      "warrior.bonettis-defense",
      "warrior.deflect-arrows",
      "warrior.gladiators-defense",
      "warrior.disciplined-stance",
      "warrior.balanced-stance",
      "warrior.healing-signet",
      "warrior.watch-yourself",
    ],
    attributeRanks: new Map([["warrior.tactics", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn: vec2(0, 0),
    facing: 0,
  };
}

/** A foe of the warrior's, wielding `equipment`, or nothing. */
function foe(
  id: string,
  spawn: Vec2,
  equipment = unarmedResolvedEquipment(60),
  attributeRanks = new Map<string, number>(),
): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks,
    equipment,
    maxHealth: 1e6,
    maxEnergy: 60,
    spawn,
    facing: Math.PI,
  };
}

function swordsman(id = "sword", spawn = vec2(RANGE_MELEE / 2, 0)): ParticipantSpec {
  return foe(id, spawn, wielding(WEAPONS.sword, "warrior.swordsmanship"));
}

function archer(id = "bow", spawn = vec2(600, 0)): ParticipantSpec {
  return foe(id, spawn, wielding(WEAPONS.longbow, "ranger.marksmanship"));
}

function fight(foes: ParticipantSpec[], ruleset: Ruleset = RULES): MatchSimulation {
  return new MatchSimulation({
    seed: "warrior-tactics",
    ruleset,
    participants: [warrior(), ...foes],
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

/** `attackerId` attacks the warrior for `seconds`, the warrior under `statusId` throughout. */
function attacked(
  match: MatchSimulation,
  attackerId: string,
  statusId: Parameters<ReturnType<typeof get>["combatant"]["statuses"]["apply"]>[0],
  seconds = 20,
): CombatLogEntry[] {
  get(match, "w").combatant.statuses.apply(statusId, 1000, "w", NO_RANKS);
  expect(match.requestAttack(attackerId, "w")).toEqual({ ok: true });
  return stepFor(match, seconds);
}

function blocksOnWarrior(log: readonly CombatLogEntry[]): number {
  return log
    .flatMap((entry) => entry.events)
    .filter((event) => event.kind === "attack-blocked" && event.targetId === "w").length;
}

function from(log: readonly CombatLogEntry[], skillId: string): CombatEvent[] {
  return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

/** `slot` used by the warrior, stepped until it resolves, then 1 s more. */
function use(match: MatchSimulation, slot: number): void {
  const skillId = get(match, "w").skillBar[slot] ?? "";
  expect(match.requestSkill("w", slot)?.check).toEqual({ ok: true });
  for (let i = 0; i < 300; i += 1) {
    if (match.step(DT).log.some((entry) => entry.skillId === skillId)) {
      stepFor(match, 1);
      return;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

describe("Bonetti's Defense (#1329)", () => {
  it("a blocked swing gives the bearer 5 Energy, each one", () => {
    const match = fight([swordsman()]);
    get(match, "w").combatant.energy = 0;
    const log = attacked(match, "sword", "bonettis-defense");
    const blocked = blocksOnWarrior(log);
    expect(blocked).toBeGreaterThan(0);
    expect(from(log, "warrior.bonettis-defense")).toEqual(
      Array.from({ length: blocked }, () => ({ kind: "energy-gain", targetId: "w", amount: 5 })),
    );
  });

  it("a blocked arrow gives none", () => {
    const match = fight([archer()]);
    get(match, "w").combatant.energy = 0;
    const log = attacked(match, "bow", "bonettis-defense");
    expect(blocksOnWarrior(log)).toBeGreaterThan(0);
    expect(from(log, "warrior.bonettis-defense")).toEqual([]);
  });

  it("the use that puts it up keeps it; the next skill ends it", () => {
    const match = fight([]);
    const w = get(match, "w").combatant;
    chargeAdrenaline(w, "warrior.bonettis-defense");
    use(match, BONETTIS_DEFENSE);
    expect(w.statuses.has("bonettis-defense")).toBe(true);
    use(match, HEALING_SIGNET);
    expect(w.statuses.has("bonettis-defense")).toBe(false);
  });
});

describe("Deflect Arrows (#1329)", () => {
  it("a blocked arrow Bleeds the two adjacent foes for 13 s, not one nearby", () => {
    const match = fight([
      archer(),
      foe("east", vec2(AREA_ADJACENT / 2, 0)),
      foe("north", vec2(0, AREA_ADJACENT / 2)),
      foe("nearby", vec2(-(AREA_ADJACENT + AREA_NEARBY) / 2, 0)),
    ]);
    get(match, "w").combatant.statuses.apply("deflect-arrows", 1000, "w", NO_RANKS);
    expect(match.requestAttack("bow", "w")).toEqual({ ok: true });
    let bleeds: CombatEvent[] = [];
    for (let i = 0; i < 20 / DT && bleeds.length === 0; i += 1) {
      bleeds = from(match.step(DT).log, "warrior.deflect-arrows");
    }
    expect(bleeds).toEqual([
      { kind: "status-applied", targetId: "north", statusId: "bleeding", durationSeconds: 13 },
      { kind: "status-applied", targetId: "east", statusId: "bleeding", durationSeconds: 13 },
    ]);
    expect(get(match, "nearby").combatant.statuses.has("bleeding")).toBe(false);
    expect(get(match, "bow").combatant.statuses.has("bleeding")).toBe(false);
  });

  it("a blocked swing Bleeds nobody", () => {
    const match = fight([swordsman(), foe("east", vec2(0, AREA_ADJACENT / 2))]);
    const log = attacked(match, "sword", "deflect-arrows");
    expect(blocksOnWarrior(log)).toBeGreaterThan(0);
    expect(from(log, "warrior.deflect-arrows")).toEqual([]);
  });
});

describe("Gladiator's Defense (#1329)", () => {
  /** The damage Gladiator's Defense dealt the swordsman in `log`. */
  function backlash(log: readonly CombatLogEntry[]): number[] {
    return from(log, "warrior.gladiators-defense").flatMap((event) =>
      event.kind === "damage" && event.targetId === "sword" ? [event.amount] : [],
    );
  }

  it("a blocked swing deals the attacker 29, each one", () => {
    const match = fight([swordsman()]);
    const log = attacked(match, "sword", "gladiators-defense");
    const blocked = blocksOnWarrior(log);
    expect(blocked).toBeGreaterThan(0);
    expect(backlash(log)).toEqual(Array.from({ length: blocked }, () => 29));
  });

  it("a blocked arrow deals nothing", () => {
    const match = fight([archer()]);
    const log = attacked(match, "bow", "gladiators-defense");
    expect(blocksOnWarrior(log)).toBeGreaterThan(0);
    expect(from(log, "warrior.gladiators-defense")).toEqual([]);
  });

  it("with Shroud of Distress up too, a block in Shroud's share deals nothing", () => {
    const match = fight([swordsman()]);
    const w = get(match, "w").combatant;
    w.health = w.maxHealth * 0.4;
    w.statuses.apply("shroud-of-distress", 1000, "w", NO_RANKS);
    const log = attacked(match, "sword", "gladiators-defense", 60);
    const dealt = backlash(log).length;
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThan(blocksOnWarrior(log));
  });
});

describe("Disciplined Stance (#1329)", () => {
  it("is +10 armor and a 75% block while up", () => {
    const match = fight([]);
    const w = get(match, "w").combatant;
    w.statuses.apply("disciplined-stance", 1000, "w", NO_RANKS);
    expect(aggregateModifiers(w.statuses.active).armorModifier).toBe(10);
    expect(blockChanceOf(w, "melee", false)).toBe(0.75);
    expect(blockChanceOf(w, "projectile", false)).toBe(0.75);
  });

  it("a signet keeps it; an adrenal shout ends it", () => {
    const match = fight([]);
    const w = get(match, "w").combatant;
    w.statuses.apply("disciplined-stance", 1000, "w", NO_RANKS);
    use(match, HEALING_SIGNET);
    expect(w.statuses.has("disciplined-stance")).toBe(true);
    chargeAdrenaline(w, "warrior.watch-yourself");
    use(match, WATCH_YOURSELF);
    expect(w.statuses.has("disciplined-stance")).toBe(false);
  });
});

describe("Balanced Stance (#1329)", () => {
  it("a knockdown does nothing, and the stance stays", () => {
    const target = makeCombatant({ id: "target", team: 1 });
    target.statuses.apply("balanced-stance", 18, "target", NO_RANKS);
    applyEffects([{ kind: "knockdown", durationSeconds: 2 }], {
      caster: makeCombatant({ id: "caster" }),
      target,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
    });
    expect(target.knockdownRemaining).toBe(0);
    expect(target.statuses.has("balanced-stance")).toBe(true);
  });

  /** Every blow an assassin's always-critical daggers land on the warrior, and its energy gains. */
  function crits(balanced: boolean): { blows: number[]; energy: number[] } {
    const match = fight(
      [
        foe(
          "sin",
          vec2(RANGE_MELEE / 2, 0),
          wielding(STEADY_DAGGERS, "assassin.dagger-mastery"),
          new Map([
            ["assassin.dagger-mastery", 12],
            ["assassin.critical-strikes", 12],
          ]),
        ),
      ],
      ALL_CRIT,
    );
    if (balanced) {
      get(match, "w").combatant.statuses.apply("balanced-stance", 1000, "w", NO_RANKS);
    }
    get(match, "sin").combatant.energy = 0;
    expect(match.requestAttack("sin", "w")).toEqual({ ok: true });
    const events = stepFor(match, 6)
      .filter((entry) => entry.sourceId === "sin")
      .flatMap((entry) => entry.events);
    const blows = events.flatMap((event) => {
      if (event.kind !== "damage" || event.targetId !== "w") {
        return [];
      }
      expect(event.critical).toBe(true);
      return [event.amount];
    });
    const energy = events.flatMap((event) =>
      event.kind === "energy-gain" && event.targetId === "sin" ? [event.amount] : [],
    );
    return { blows, energy };
  }

  it("a critical on the bearer deals a normal roll, and still pays Critical Strikes' energy", () => {
    const plain = crits(false);
    const balanced = crits(true);
    expect(balanced.blows.length).toBeGreaterThan(0);
    // The daggers roll their maximum: every normal blow is the same, below a crit.
    expect(new Set(balanced.blows).size).toBe(1);
    expect(Math.max(...balanced.blows)).toBeLessThan(Math.min(...plain.blows));
    expect(balanced.energy).toEqual(balanced.blows.map(() => criticalStrikesEnergy(12)));
  });
});

describe("the Tactics stances' tooltips (#1329)", () => {
  it("say what each does in GW1's words", () => {
    const ranks = new Map<string, number>();
    expect(describeStatus("bonettis-defense", ranks)).toMatchInlineSnapshot(
      `"75% chance to block attacks, ends if you use a skill. You gain 5 Energy for each successful melee attack blocked"`,
    );
    expect(describeStatus("deflect-arrows", ranks)).toMatchInlineSnapshot(
      `"75% chance to block attacks. If you block a projectile attack, adjacent foes suffer from Bleeding for 13 seconds"`,
    );
    expect(describeStatus("gladiators-defense", ranks)).toMatchInlineSnapshot(
      `"75% chance to block attacks. Whenever you block a melee attack this way, the attacker suffers 29 damage"`,
    );
    expect(describeStatus("disciplined-stance", ranks)).toMatchInlineSnapshot(
      `"+10 armor, 75% chance to block attacks, ends if you use an adrenal skill"`,
    );
    expect(describeStatus("balanced-stance", ranks)).toMatchInlineSnapshot(
      `"cannot be knocked down, you do not suffer extra damage from a critical attack"`,
    );
  });
});
