import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describeStatus } from "../skills/describe.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BACKFIRE = "mesmer.backfire";
const EMPATHY = "mesmer.empathy";
const SWIFT_CHOP = "warrior.swift-chop";
const FIREBALL = "elementalist.fireball";
const MALAISE = "necromancer.malaise";
const HEALING_SIGNET = "warrior.healing-signet";
const POWER_SPIKE = "mesmer.power-spike";

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: { weapon, attributeId, damageType: weapon.damageType, requirementMet: true },
  };
}

/** A rank-12 fighter with `weapon`, Swift Chop, two spells and a signet. */
function fighter(id: string, spawn: Vec2, weapon: Weapon = WEAPONS.axe): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [SWIFT_CHOP, FIREBALL, MALAISE, HEALING_SIGNET],
    attributeRanks: new Map([
      ["warrior.axe-mastery", 12],
      ["ranger.marksmanship", 12],
      ["elementalist.fire-magic", 12],
      ["necromancer.curses", 12],
    ]),
    equipment: wielding(
      weapon,
      weapon === WEAPONS.flatbow ? "ranger.marksmanship" : "warrior.axe-mastery",
    ),
    maxHealth: 1e4,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** The Mesmer: Backfire, Empathy and Power Spike, at rank 12. */
function mesmer(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [BACKFIRE, EMPATHY, POWER_SPIKE],
    attributeRanks: new Map([["mesmer.domination-magic", 12]]),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** A fighter `a` next to Mesmer `m`. */
function sim(weapon: Weapon = WEAPONS.axe, at: Vec2 = vec2(40, 0)): MatchSimulation {
  return new MatchSimulation({
    seed: "reactive-hexes",
    participants: [fighter("a", vec2(0, 0), weapon), mesmer("m", at)],
  });
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `a` uses its skill in `slot` on `m`. */
function use(match: MatchSimulation, slot: number): void {
  match.setTarget("a", "m");
  expect(match.requestSkill("a", slot)?.check).toEqual({ ok: true });
}

/** Every entry a hex's trigger logged. */
function fired(log: readonly CombatLogEntry[], skillId: string): CombatLogEntry[] {
  return log.filter((entry) => entry.skillId === skillId && entry.sourceId === "m");
}

function damageTo(entries: readonly CombatLogEntry[], id: string): number[] {
  return entries.flatMap((entry) =>
    entry.events.flatMap((event) =>
      event.kind === "damage" && event.targetId === id ? [event.amount] : [],
    ),
  );
}

describe("Backfire (#469)", () => {
  it("is cast as the backfire hex", () => {
    const match = sim(WEAPONS.axe, vec2(200, 0));
    match.setTarget("m", "a");
    expect(match.requestSkill("m", 0)?.check).toEqual({ ok: true });
    stepFor(match, 3.5);
    expect(get(match, "a").statuses.get("backfire")?.sourceId).toBe("m");
    expect(describeStatus("backfire")).toBe("takes 119 damage whenever it casts a spell");
  });

  it("a finished spell costs its caster 119, credited to the Mesmer, after the spell", () => {
    const match = sim();
    get(match, "a").statuses.apply("backfire", 10, "m");
    use(match, 2);
    const log = stepFor(match, 2.5);
    expect(damageTo(fired(log, BACKFIRE), "a")).toEqual([119]);
    const spell = log.findIndex((entry) => entry.skillId === MALAISE);
    const backfire = log.findIndex((entry) => entry.skillId === BACKFIRE);
    expect(spell).toBeGreaterThanOrEqual(0);
    expect(backfire).toBeGreaterThan(spell);
    expect(get(match, "m").statuses.has("malaise")).toBe(true);
  });

  it("fires once for each of two spells", () => {
    const match = sim();
    get(match, "a").statuses.apply("backfire", 10, "m");
    use(match, 2);
    stepFor(match, 3);
    use(match, 1);
    expect(damageTo(fired(stepFor(match, 3), BACKFIRE), "a")).toEqual([119]);
  });

  it("fires as a flying spell is released, not when it lands", () => {
    const match = sim(WEAPONS.axe, vec2(400, 0));
    get(match, "a").statuses.apply("backfire", 10, "m");
    use(match, 1);
    const log = stepFor(match, 1 + 2 * DT);
    expect(damageTo(fired(log, BACKFIRE), "a")).toEqual([119]);
    expect(damageTo(log, "m")).toEqual([]);
  });

  it("an interrupted spell does nothing", () => {
    const match = sim();
    get(match, "a").statuses.apply("backfire", 10, "m");
    use(match, 2);
    match.setTarget("m", "a");
    expect(match.requestSkill("m", 2)?.check).toEqual({ ok: true });
    const log = stepFor(match, 2);
    expect(log.some((entry) => entry.events.some((event) => event.kind === "interrupted"))).toBe(
      true,
    );
    expect(fired(log, BACKFIRE)).toEqual([]);
  });

  it("a signet or an attack skill does nothing", () => {
    const match = sim();
    get(match, "a").statuses.apply("backfire", 10, "m");
    expect(match.requestSkill("a", 3)?.check).toEqual({ ok: true });
    stepFor(match, 2.5);
    use(match, 0);
    expect(fired(stepFor(match, 2), BACKFIRE)).toEqual([]);
  });

  it("a kill by Backfire is the Mesmer's", () => {
    const match = sim();
    const bearer = get(match, "a");
    bearer.health = 100;
    bearer.statuses.apply("backfire", 10, "m");
    use(match, 2);
    const entries = fired(stepFor(match, 2.5), BACKFIRE);
    expect(entries.flatMap((entry) => entry.events.map((event) => event.kind))).toEqual([
      "damage",
      "death",
    ]);
    expect(bearer.dead).toBe(true);
  });

  it("does nothing once the Mesmer has left the match", () => {
    const match = sim();
    get(match, "a").statuses.apply("backfire", 10, "m");
    match.remove("m");
    expect(match.requestSkill("a", 3)?.check).toEqual({ ok: true });
    const log = stepFor(match, 2.5);
    expect(log.some((entry) => entry.skillId === BACKFIRE)).toBe(false);
    expect(get(match, "a").statuses.has("backfire")).toBe(true);
  });
});

describe("Empathy (#469)", () => {
  it("is cast as the empathy hex", () => {
    const match = sim(WEAPONS.axe, vec2(200, 0));
    match.setTarget("m", "a");
    expect(match.requestSkill("m", 1)?.check).toEqual({ ok: true });
    stepFor(match, 2.5);
    expect(get(match, "a").statuses.get("empathy")?.sourceId).toBe("m");
    expect(describeStatus("empathy")).toBe("takes 39 damage whenever it attacks");
  });

  it("each melee swing costs 39, armor or not, credited to the Mesmer", () => {
    const match = sim();
    get(match, "a").statuses.apply("empathy", 13, "m");
    expect(match.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(match, 3);
    const swings = log.filter((entry) => entry.cause === "weapon" && entry.sourceId === "a");
    expect(swings.length).toBeGreaterThanOrEqual(2);
    expect(damageTo(fired(log, EMPATHY), "a")).toEqual(swings.map(() => 39));
  });

  it("each ranged release costs 39, before the arrow lands", () => {
    const match = sim(WEAPONS.flatbow, vec2(600, 0));
    get(match, "a").statuses.apply("empathy", 13, "m");
    expect(match.requestAttack("a", "m")).toEqual({ ok: true });
    // Up to the first release, and not a tick further.
    const log: CombatLogEntry[] = [];
    for (let tick = 0; tick < 100 && fired(log, EMPATHY).length === 0; tick += 1) {
      log.push(...match.step(DT).log);
    }
    expect(damageTo(fired(log, EMPATHY), "a")).toEqual([39]);
    expect(damageTo(log, "m")).toEqual([]);
  });

  it("an attack skill costs 39 once", () => {
    const match = sim();
    get(match, "a").statuses.apply("empathy", 13, "m");
    use(match, 0);
    expect(damageTo(fired(stepFor(match, 1), EMPATHY), "a")).toEqual([39]);
  });

  it("a blinded miss and a blocked blow cost 39 all the same", () => {
    for (const status of ["blind", "guardian"] as const) {
      const match = sim();
      const bearer = get(match, "a");
      bearer.statuses.apply("empathy", 13, "m");
      if (status === "blind") {
        bearer.statuses.apply("blind", 13, "m");
      } else {
        get(match, "m").statuses.apply("guardian", 13, "m");
      }
      expect(match.requestAttack("a", "m")).toEqual({ ok: true });
      const log = stepFor(match, 3);
      const swings = log.filter((entry) => entry.cause === "weapon" && entry.sourceId === "a");
      expect(swings.length).toBeGreaterThanOrEqual(2);
      expect(damageTo(fired(log, EMPATHY), "a")).toEqual(swings.map(() => 39));
    }
  });

  it("a spell does nothing", () => {
    const match = sim();
    get(match, "a").statuses.apply("empathy", 13, "m");
    use(match, 2);
    expect(fired(stepFor(match, 2.5), EMPATHY)).toEqual([]);
  });
});

describe("reactive hexes together (#469)", () => {
  it("both on one bearer fire once each, and trigger damage fires neither", () => {
    const match = sim();
    const bearer = get(match, "a");
    bearer.statuses.apply("empathy", 13, "m");
    bearer.statuses.apply("backfire", 10, "m");
    use(match, 0);
    const log = stepFor(match, 1);
    expect(damageTo(fired(log, EMPATHY), "a")).toEqual([39]);
    expect(fired(log, BACKFIRE)).toEqual([]);
  });
});
