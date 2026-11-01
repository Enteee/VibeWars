import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { energyCostOf } from "../skills/activation.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import type { StatusId } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { effectiveMaxHealth } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import {
  MatchSimulation,
  type CreatureKind,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Nature rituals 3 (#1886): Edge of Extinction and Pestilence answer a
 * death in their range; Energizing Wind, Primal Echoes and Roaring Winds
 * change what skills cost and how long they recharge, for both teams.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const MATCH: MatchRules = {
  victory: "kill-count",
  scoreToWin: 15,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 60,
  deathPenalty: false,
};
const BAR = [
  "ranger.edge-of-extinction",
  "ranger.pestilence",
  "ranger.energizing-wind",
  "ranger.primal-echoes",
  "ranger.roaring-winds",
  "ranger.muddy-terrain",
  "ranger.antidote-signet",
];

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: BAR,
    attributeRanks: new Map([
      ["ranger.beast-mastery", 12],
      ["ranger.wilderness-survival", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
  return result;
}

/** A body of `kind` on `team`, owned by `owner`, as a summon would leave it. */
function creatureSpec(id: string, team: number, spawn: Vec2, kind: CreatureKind, owner: string) {
  return spec(id, team, spawn, {
    skillBar: [],
    creature: {
      ownerId: owner,
      kind,
      look: "bone-minion",
      name: id,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: "necromancer.animate-bone-minions",
      aura: undefined,
      onDeath: "vanish",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      mode: "guard",
    },
  });
}

function match(...participants: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "nature-rituals-3",
    matchRules: MATCH,
    participants: [spec("r", 0, vec2(0, 0)), ...participants],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** What `seconds` of steps logged, of `skillId`'s only when given. */
function stepFor(sim: MatchSimulation, seconds: number, skillId?: string): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    for (const entry of sim.step(DT).log) {
      if (skillId === undefined || entry.skillId === skillId) {
        events.push(...entry.events);
      }
    }
  }
  return events;
}

/** `r` casts `skillId` from its bar, then steps until it has gone off. */
function ritual(sim: MatchSimulation, skillId: string): void {
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  stepFor(sim, skillOf(skillId).activationSeconds + 0.5);
}

/** `id` at `fraction` of its maximum Health. */
function hurt(sim: MatchSimulation, id: string, fraction: number): Combatant {
  const { combatant } = get(sim, id);
  combatant.health = Math.round(effectiveMaxHealth(combatant) * fraction);
  return combatant;
}

/** Kill `id` as burning would, and return what Edge of Extinction did. */
function kill(sim: MatchSimulation, id: string): CombatEvent[] {
  const victim = get(sim, id).combatant;
  victim.statuses.apply("burning", 10, "x", NO_RANKS);
  victim.health = 0.2;
  const events = stepFor(sim, DT, "ranger.edge-of-extinction");
  expect(victim.dead).toBe(true);
  return events;
}

function damageTo(events: readonly CombatEvent[], id: string): number {
  return events
    .filter((event) => event.kind === "damage" && event.targetId === id)
    .reduce((sum, event) => sum + (event.kind === "damage" ? event.amount : 0), 0);
}

/** A combatant inside the aura of `statusId`. */
function under(statusId: StatusId, energy = 100): Combatant {
  const combatant = makeCombatant({ id: "c", maxEnergy: 100 });
  combatant.energy = energy;
  combatant.statuses.project(statusId, "r/c1", NO_RANKS);
  return combatant;
}

describe("Edge of Extinction (#1886)", () => {
  it("hits each body of the dead one's type in range below 90%, allies too, for 43", () => {
    const sim = match(
      spec("dies", 1, vec2(300, 0)),
      spec("low", 1, vec2(400, 0)),
      spec("ally", 0, vec2(0, 300)),
      spec("full", 1, vec2(500, 0)),
      spec("far", 1, vec2(1400, 0)),
      creatureSpec("minion", 1, vec2(300, 100), "minion", "low"),
    );
    ritual(sim, "ranger.edge-of-extinction");
    hurt(sim, "low", 0.8);
    hurt(sim, "ally", 0.8);
    hurt(sim, "full", 0.95);
    hurt(sim, "far", 0.5);
    hurt(sim, "minion", 0.5);
    const events = kill(sim, "dies");
    expect(damageTo(events, "low")).toBe(43);
    expect(damageTo(events, "ally")).toBe(43);
    expect(damageTo(events, "full")).toBe(0);
    expect(damageTo(events, "far")).toBe(0);
    expect(damageTo(events, "minion")).toBe(0);
  });

  it("a minion's death hits only minions", () => {
    const sim = match(
      spec("low", 1, vec2(400, 0)),
      creatureSpec("dies", 1, vec2(300, 0), "minion", "low"),
      creatureSpec("other", 1, vec2(300, 100), "minion", "low"),
    );
    ritual(sim, "ranger.edge-of-extinction");
    hurt(sim, "low", 0.5);
    hurt(sim, "other", 0.5);
    const events = kill(sim, "dies");
    expect(damageTo(events, "other")).toBe(43);
    expect(damageTo(events, "low")).toBe(0);
  });

  it("a death it causes fires it again", () => {
    const sim = match(
      spec("dies", 1, vec2(300, 0)),
      spec("next", 1, vec2(400, 0)),
      spec("last", 1, vec2(500, 0)),
    );
    ritual(sim, "ranger.edge-of-extinction");
    get(sim, "next").combatant.health = 30;
    hurt(sim, "last", 0.5);
    const before = get(sim, "last").combatant.health;
    const events = kill(sim, "dies");
    expect(get(sim, "next").combatant.dead).toBe(true);
    expect(damageTo(events, "last")).toBe(86);
    expect(get(sim, "last").combatant.health).toBe(before - 86);
  });
});

describe("Pestilence (#1886)", () => {
  it("spreads the corpse's conditions, with their time left, to nearby bodies with one", () => {
    const sim = match(
      spec("dies", 1, vec2(300, 0)),
      spec("sick", 1, vec2(350, 0)),
      spec("clean", 1, vec2(300, 50)),
    );
    ritual(sim, "ranger.pestilence");
    get(sim, "dies").combatant.statuses.apply("bleeding", 12, "x", NO_RANKS);
    get(sim, "sick").combatant.statuses.apply("poison", 5, "x", NO_RANKS);
    kill(sim, "dies");
    const caught = get(sim, "sick").combatant.statuses.get("bleeding");
    expect(caught?.remainingSeconds).toBeGreaterThan(11);
    expect(caught?.remainingSeconds).toBeLessThanOrEqual(12);
    expect(caught?.sourceId).toBe("x");
    expect(get(sim, "sick").combatant.statuses.has("burning")).toBe(true);
    expect(get(sim, "clean").combatant.statuses.active).toEqual([]);
  });
});

describe("Energizing Wind (#1886)", () => {
  it("takes 15 off, never below 10, and leaves a cost under 10 alone", () => {
    const wind = under("energizing-wind");
    const cost = (id: string) => energyCostOf(skillOf(id), wind);
    expect(cost("ranger.quickening-zephyr")).toBe(10);
    expect(cost("ranger.energizing-wind")).toBe(10);
    expect(cost("ranger.roaring-winds")).toBe(10);
    expect(cost("ranger.winnowing")).toBe(5);
  });

  it("under Quickening Zephyr too, the cost is raised before the discount: 25 is 33, then 18", () => {
    const both = under("energizing-wind");
    both.statuses.project("quickening-zephyr", "r/c2", NO_RANKS);
    expect(energyCostOf(skillOf("ranger.quickening-zephyr"), both)).toBe(18);
  });

  it("recharges a skill 25% slower", () => {
    const sim = match();
    ritual(sim, "ranger.energizing-wind");
    ritual(sim, "ranger.muddy-terrain");
    const recharge = get(sim, "r").combatant.cast.rechargeRemaining.get("ranger.muddy-terrain");
    // 30 s × 1.25, started as the cast ended, under a second ago.
    expect(recharge).toBeGreaterThan(36.5);
    expect(recharge).toBeLessThanOrEqual(37.5);
  });
});

describe("Primal Echoes (#1886)", () => {
  it("a signet costs 10, and a spell what it did", () => {
    const echoed = under("primal-echoes");
    expect(energyCostOf(skillOf("ranger.antidote-signet"), echoed)).toBe(10);
    expect(energyCostOf(skillOf("ranger.winnowing"), echoed)).toBe(5);
  });

  it("refuses a signet at 9 Energy, and takes 10 at 10", () => {
    const sim = match();
    ritual(sim, "ranger.primal-echoes");
    const r = get(sim, "r").combatant;
    const slot = BAR.indexOf("ranger.antidote-signet");
    r.energy = 9;
    expect(sim.requestSkill("r", slot)?.check).toEqual({
      ok: false,
      reason: "insufficient-energy",
    });
    r.energy = 10;
    expect(sim.requestSkill("r", slot)?.check).toEqual({ ok: true });
    // Paid as the cast starts, after the ritual's aftercast.
    stepFor(sim, 1);
    expect(r.energy).toBeLessThan(1);
  });
});

describe("Roaring Winds (#1886)", () => {
  it("a shout or chant costs 4 more, a spell and an adrenal shout no more", () => {
    const roaring = under("roaring-winds");
    expect(energyCostOf(skillOf("paragon.fall-back"), roaring)).toBe(14);
    expect(energyCostOf(skillOf("paragon.anthem-of-flame"), roaring)).toBe(9);
    expect(energyCostOf(skillOf("ranger.winnowing"), roaring)).toBe(5);
    expect(energyCostOf(skillOf("paragon.go-for-the-eyes"), roaring)).toBe(0);
  });
});

describe("tooltips (#1886)", () => {
  it("say what each spirit does", () => {
    const ranks = new Map([
      ["ranger.beast-mastery", 12],
      ["ranger.wilderness-survival", 12],
    ]);
    const lines = (id: string) => describeSkill(skillOf(id), ranks).effects.map(({ text }) => text);
    expect(lines("ranger.edge-of-extinction")).toContain(
      "When a non-spirit dies in its range, each of its type in its range below 90% Health takes 43 damage",
    );
    expect(lines("ranger.pestilence")).toContain(
      "When a non-spirit dies in its range, its conditions spread to each non-spirit in the area that has a condition",
    );
    expect(lines("ranger.energizing-wind").join("\n")).toContain(
      "cost 15 less Energy (minimum 10) and recharge 25% slower",
    );
    expect(lines("ranger.primal-echoes").join("\n")).toContain("your signets cost 10 Energy");
    expect(lines("ranger.roaring-winds").join("\n")).toContain("your shouts cost 4 more Energy");
  });
});
