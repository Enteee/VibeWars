import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { JAGGED_HORROR } from "../skills/catalog/shared.js";
import { applyDamage, type CombatEvent } from "../skills/effects.js";
import { NO_RANKS } from "../skills/status.js";
import type { CreatureTemplate } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Minion care (#1986): Blood of the Master heals every allied minion at a
 * price per minion, Verata's Sacrifice takes their conditions, Dark Bond
 * hands most of a hit to the closest minion, and Jagged Bones stands a
 * Jagged Horror up where its minion dies.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BLOOD = "necromancer.blood-of-the-master";
const VERATA = "necromancer.veratas-sacrifice";
const BOND = "necromancer.dark-bond";
const JAGGED = "necromancer.jagged-bones";
const FEAST = "necromancer.feast-for-the-dead";
const BAR = [BLOOD, VERATA, BOND, JAGGED, FEAST];

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  return {
    id,
    team,
    skillBar: BAR,
    attributeRanks: new Map([
      ["necromancer.death-magic", 12],
      ["necromancer.blood-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxEnergy: 100,
    ...extra,
  } satisfies ParticipantSpec;
}

/** A minion of `ownerId`'s standing at `spawn`, 500 max Health, at 100. */
function minion(
  id: string,
  ownerId: string,
  team: number,
  spawn: Vec2,
  replacedBy?: CreatureTemplate["replacedBy"],
): ParticipantSpec {
  return spec(id, team, spawn, {
    skillBar: [],
    maxHealth: 500,
    startHealthFraction: 0.2,
    creature: {
      ownerId,
      kind: "minion",
      look: "bone-minion",
      name: id,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: "vanish",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      replacedBy,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      mode: "guard",
    },
  });
}

/** `n` the necromancer (500 Health) and `a` its ally; `f` a foe far off; `extra` beside them. */
function match(...extra: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "minion-bonds",
    participants: [
      spec("n", 0, vec2(0, 0), { maxHealth: 500 }),
      spec("a", 0, vec2(-40, 0), { skillBar: [] }),
      spec("f", 1, vec2(0, 2000), { skillBar: [] }),
      ...extra,
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

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `n` uses `skillId` on `targetId` through to its log entry; its events. */
function cast(sim: MatchSimulation, skillId: string, targetId?: string): CombatEvent[] {
  const record = get(sim, "n");
  record.combatant.energy = 100;
  sim.setTarget("n", targetId);
  expect(sim.requestSkill("n", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "n" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log.flatMap((entry) => (entry.skillId === skillId ? entry.events : []));
}

/** Kill `id` as burning would. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "f", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

function horrorsOf(sim: MatchSimulation): Participant[] {
  return [...sim.participants()].filter(
    (participant) =>
      participant.creature?.ownerId === "n" &&
      participant.creature.name === "Jagged Horror" &&
      !participant.combatant.dead,
  );
}

describe("Blood of the Master (#1986)", () => {
  it("heals every allied minion, anyone's, for 99, at 2% of max Health each", () => {
    const sim = match(
      minion("m1", "n", 0, vec2(20, 0)),
      minion("m2", "n", 0, vec2(20, 20)),
      minion("m3", "n", 0, vec2(800, 0)),
      minion("m4", "a", 0, vec2(-60, 0)),
      minion("foe", "f", 1, vec2(0, 1960)),
    );
    const events = cast(sim, BLOOD);
    for (const id of ["m1", "m2", "m3", "m4"]) {
      expect(events).toContainEqual({ kind: "heal", targetId: id, amount: 99 });
    }
    expect(events.some((event) => "targetId" in event && event.targetId === "foe")).toBe(false);
    const paid = events.flatMap((event) =>
      event.kind === "sacrifice" && event.targetId === "n" ? [event.amount] : [],
    );
    expect(paid).toEqual([25, 10, 10, 10, 10]);
  });

  it("with no minion, costs only its 5%", () => {
    const sim = match();
    const events = cast(sim, BLOOD);
    expect(events.filter((event) => event.kind === "sacrifice")).toEqual([
      { kind: "sacrifice", targetId: "n", amount: 25 },
    ]);
  });
});

describe("Verata's Sacrifice (#1986)", () => {
  it("moves its minions' conditions to you, with their time, and has them regenerate", () => {
    const sim = match(minion("m1", "n", 0, vec2(20, 0)));
    const m1 = get(sim, "m1");
    m1.combatant.statuses.apply("bleeding", 10, "f", NO_RANKS);
    m1.combatant.statuses.apply("poison", 12, "f", NO_RANKS);
    cast(sim, VERATA);
    const n = get(sim, "n").combatant;
    const left = (id: string): number | undefined =>
      n.statuses.active.find((status) => status.id === id)?.remainingSeconds;
    // Two seconds of activation gone from each.
    expect(left("bleeding")).toBeCloseTo(8, 0);
    expect(left("poison")).toBeCloseTo(10, 0);
    expect(m1.combatant.statuses.has("bleeding")).toBe(false);
    expect(m1.combatant.statuses.has("poison")).toBe(false);
    expect(m1.combatant.statuses.has("veratas-sacrifice")).toBe(true);
    // +10 pips, 20 a second, over a minion's own -1.
    const before = m1.combatant.health;
    stepFor(sim, 1);
    expect(m1.combatant.health - before).toBeCloseTo(18, 5);
    stepFor(sim, 9);
    expect(m1.combatant.statuses.has("veratas-sacrifice")).toBe(false);
  });

  it("recharges at once with 3 minions, and takes its 60 s with 4", () => {
    const three = match(
      minion("m1", "n", 0, vec2(20, 0)),
      minion("m2", "n", 0, vec2(20, 20)),
      minion("m3", "n", 0, vec2(20, -20)),
    );
    cast(three, VERATA);
    expect(get(three, "n").combatant.cast.rechargeRemaining.get(VERATA) ?? 0).toBe(0);

    const four = match(
      minion("m1", "n", 0, vec2(20, 0)),
      minion("m2", "n", 0, vec2(20, 20)),
      minion("m3", "n", 0, vec2(20, -20)),
      minion("m4", "n", 0, vec2(40, 0)),
    );
    cast(four, VERATA);
    expect(get(four, "n").combatant.cast.rechargeRemaining.get(VERATA)).toBeCloseTo(60, 0);
  });

  it("recharges at once with no minion", () => {
    const sim = match();
    cast(sim, VERATA);
    expect(get(sim, "n").combatant.cast.rechargeRemaining.get(VERATA) ?? 0).toBe(0);
  });
});

describe("Dark Bond (#1986)", () => {
  /** A 100 hit on `n`; the damage each took from it. */
  function hit(sim: MatchSimulation): Map<string, number> {
    const events: CombatEvent[] = [];
    applyDamage(get(sim, "n").combatant, 100, "fire", false, events, get(sim, "f").combatant);
    // The share lands as the tick drains; a minion's own degeneration aside.
    events.push(
      ...stepFor(sim, DT).flatMap((entry) => (entry.cause === "degeneration" ? [] : entry.events)),
    );
    const taken = new Map<string, number>();
    for (const event of events) {
      if (event.kind === "damage") {
        taken.set(event.targetId, (taken.get(event.targetId) ?? 0) + event.amount);
      }
    }
    return taken;
  }

  it("sends 75% of a hit, of any type, to your closest minion", () => {
    const sim = match(minion("near", "n", 0, vec2(20, 0)), minion("far", "n", 0, vec2(300, 0)));
    cast(sim, BOND);
    expect(hit(sim)).toEqual(
      new Map([
        ["n", 25],
        ["near", 75],
      ]),
    );
  });

  it("with no minion, you take all of it, the share never sent round again", () => {
    const sim = match();
    cast(sim, BOND);
    expect(hit(sim)).toEqual(new Map([["n", 100]]));
  });
});

describe("Jagged Bones (#1986)", () => {
  it("stands a level 12 Jagged Horror of its owner's up where the minion died", () => {
    const sim = match(minion("m1", "n", 0, vec2(20, 0)));
    cast(sim, JAGGED, "m1");
    expect(get(sim, "m1").combatant.statuses.has("jagged-bones")).toBe(true);
    kill(sim, "m1");
    stepFor(sim, DT);
    const [horror, ...rest] = horrorsOf(sim);
    expect(rest).toHaveLength(0);
    expect(horror?.combatant.team).toBe(0);
    expect(horror?.combatant.maxHealth).toBe(320);
  });

  it("on a Shambling Horror, two", () => {
    const sim = match(minion("m1", "n", 0, vec2(20, 0), { creature: JAGGED_HORROR, count: 1 }));
    cast(sim, JAGGED, "m1");
    kill(sim, "m1");
    stepFor(sim, DT);
    expect(horrorsOf(sim)).toHaveLength(2);
  });

  it("none for a destroyed minion, which did not die", () => {
    const sim = match(minion("m1", "n", 0, vec2(20, 0)));
    cast(sim, JAGGED, "m1");
    cast(sim, FEAST, "m1");
    stepFor(sim, 2 * DT);
    expect(sim.get("m1")).toBeUndefined();
    expect(horrorsOf(sim)).toHaveLength(0);
  });

  it("none once its owner is dead", () => {
    const sim = match(minion("m1", "n", 0, vec2(20, 0)));
    cast(sim, JAGGED, "m1");
    kill(sim, "n");
    kill(sim, "m1");
    stepFor(sim, DT);
    expect(horrorsOf(sim)).toHaveLength(0);
  });
});
