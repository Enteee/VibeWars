import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { BONE_HORROR } from "../skills/catalog/shared.js";
import type { CombatEvent } from "../skills/effects.js";
import { SKILLS_BY_ID } from "../skills/catalog.js";
import { getStatusDefinition, NO_RANKS } from "../skills/status.js";
import type { SkillEffect, TakeControlEffect } from "../skills/types.js";
import { healingMultiplierOf } from "../skills/tick.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MASTERLESS_TEAM } from "./minions.js";
import {
  MAX_CREATURES,
  MatchSimulation,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";

/**
 * Taking foe minions (#2092): Verata's Gaze frees a foe's minion or takes
 * a masterless one, Verata's Aura takes every foe minion round you while
 * it lasts, and Malign Intervention raises a masterless horror where its
 * bearer dies.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const GAZE = "necromancer.veratas-gaze";
const AURA = "necromancer.veratas-aura";
const MALIGN = "necromancer.malign-intervention";
const HORROR = "necromancer.animate-bone-horror";
const BAR = [GAZE, AURA, MALIGN, HORROR];

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  return {
    id,
    team,
    skillBar: BAR,
    attributeRanks: new Map([["necromancer.death-magic", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxEnergy: 100,
    ...extra,
  } satisfies ParticipantSpec;
}

/**
 * A Bone Horror of `ownerId`'s standing at `spawn`, 500 max Health, at
 * 100; it fights as a minion does unless `still`.
 */
function minion(
  id: string,
  ownerId: string,
  team: number,
  spawn: Vec2,
  still = false,
): ParticipantSpec {
  return spec(id, team, spawn, {
    skillBar: [],
    maxHealth: 500,
    startHealthFraction: 0.2,
    behaviour: still ? undefined : BONE_HORROR.behaviour,
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
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      bondStatusId: undefined,
      mode: "guard",
    },
  });
}

/** `n` the necromancer at the origin; `f` a foe necromancer 300 off; `extra` beside them. */
function match(...extra: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "minion-takeover",
    participants: [
      spec("n", 0, vec2(0, 0), { maxHealth: 500 }),
      spec("f", 1, vec2(300, 0), { skillBar: [] }),
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
  victim.combatant.statuses.apply("burning", 10, "n", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

function ownedBy(sim: MatchSimulation, ownerId: string): Participant[] {
  return [...sim.participants()].filter(
    (participant) =>
      participant.creature?.kind === "minion" &&
      participant.creature.ownerId === ownerId &&
      !participant.combatant.dead,
  );
}

describe("Verata's Gaze (#2092)", () => {
  it("frees a foe's minion, which turns on its old master; a second Gaze takes it, +76", () => {
    const sim = match(minion("m", "f", 1, vec2(320, 0)));
    cast(sim, GAZE, "m");
    const m = get(sim, "m");
    expect(m.combatant.team).toBe(MASTERLESS_TEAM);
    expect(m.creature?.ownerId).toBeUndefined();
    // Past its 5 s recharge and the aftercast.
    const log = stepFor(sim, 6);
    expect(
      log.some(
        (entry) =>
          entry.sourceId === "m" &&
          entry.events.some((event) => event.kind === "damage" && event.targetId === "f"),
      ),
    ).toBe(true);

    const events = cast(sim, GAZE, "m");
    expect(events).toContainEqual({ kind: "heal", targetId: "m", amount: 76 });
    expect(m.combatant.team).toBe(0);
    expect(m.creature?.ownerId).toBe("n");
  });

  it("refuses your own minion and a player", () => {
    const sim = match(minion("mine", "n", 0, vec2(20, 0)));
    get(sim, "n").combatant.energy = 100;
    sim.setTarget("n", "mine");
    expect(sim.requestSkill("n", BAR.indexOf(GAZE))?.check).toEqual({
      ok: false,
      reason: "invalid-target-not-enemy-minion",
    });
    sim.setTarget("n", "f");
    expect(sim.requestSkill("n", BAR.indexOf(GAZE))?.check).toEqual({
      ok: false,
      reason: "invalid-target-not-enemy-minion",
    });
  });
});

describe("Verata's Aura (#2092)", () => {
  it("takes every foe minion in the area while it lasts, and frees them as it ends", () => {
    const sim = match(
      minion("m1", "f", 1, vec2(60, 0), true),
      minion("m2", "f", 1, vec2(0, 60), true),
      minion("m3", "f", 1, vec2(-60, 0), true),
      minion("far", "f", 1, vec2(200, 0), true),
    );
    cast(sim, AURA);
    for (const id of ["m1", "m2", "m3"]) {
      expect(get(sim, id).combatant.team).toBe(0);
      expect(get(sim, id).creature?.ownerId).toBe("n");
      expect(get(sim, id).creature?.bondStatusId).toBe("veratas-aura");
    }
    expect(get(sim, "far").combatant.team).toBe(1);
    expect(get(sim, "far").creature?.ownerId).toBe("f");

    expect(get(sim, "n").combatant.statuses.remove("veratas-aura")).toBe(true);
    stepFor(sim, DT);
    for (const id of ["m1", "m2", "m3"]) {
      expect(get(sim, id).combatant.team).toBe(MASTERLESS_TEAM);
      expect(get(sim, id).creature?.ownerId).toBeUndefined();
    }
  });

  it("takes past the cap, and the next raise culls down to it", () => {
    const own = Array.from({ length: 8 }, (_, i) =>
      minion(`own${String(i)}`, "n", 0, vec2(-40, i)),
    );
    const theirs = Array.from({ length: 3 }, (_, i) =>
      minion(`foe${String(i)}`, "f", 1, vec2(50, i * 10)),
    );
    const sim = match(...own, ...theirs, spec("x", 1, vec2(0, 200), { skillBar: [] }));
    cast(sim, AURA);
    expect(ownedBy(sim, "n")).toHaveLength(11);
    kill(sim, "x");
    cast(sim, HORROR, "x");
    stepFor(sim, DT);
    expect(ownedBy(sim, "n")).toHaveLength(8);
  });
});

describe("Malign Intervention (#2092)", () => {
  it("cuts the healing its bearer takes by 20% for 17 s: a heal of 100 gives 80", () => {
    const sim = match();
    cast(sim, MALIGN, "f");
    const f = get(sim, "f").combatant;
    expect(100 * healingMultiplierOf(f)).toBeCloseTo(80, 5);
    stepFor(sim, 17);
    expect(f.statuses.has("malign-intervention")).toBe(false);
    expect(healingMultiplierOf(f)).toBe(1);
  });

  it("raises a masterless level 14 Bone Horror where its bearer dies", () => {
    const sim = match();
    cast(sim, MALIGN, "f");
    const at = get(sim, "f").position;
    kill(sim, "f");
    stepFor(sim, DT);
    const risen = [...sim.participants()].filter((participant) =>
      participant.id.startsWith("masterless/"),
    );
    expect(risen).toHaveLength(1);
    const [horror] = risen;
    expect(horror?.creature?.name).toBe("Bone Horror");
    expect(horror?.creature?.ownerId).toBeUndefined();
    expect(horror?.combatant.team).toBe(MASTERLESS_TEAM);
    expect(horror?.position).toEqual(at);
    expect(get(sim, "f").corpseExploited).toBe(false);
  });

  it("raises none with the match at its creature cap, the masterless counted", () => {
    const owned = Array.from({ length: MAX_CREATURES - 1 }, (_, i) =>
      minion(`m${String(i)}`, "n", 0, vec2(-100, i)),
    );
    const sim = match(...owned, minion("loose", "f", 1, vec2(320, 0)));
    cast(sim, GAZE, "loose");
    expect(get(sim, "loose").combatant.team).toBe(MASTERLESS_TEAM);
    cast(sim, MALIGN, "f");
    kill(sim, "f");
    stepFor(sim, DT);
    expect([...sim.participants()].some((p) => p.id.startsWith("masterless/"))).toBe(false);
  });
});

/** Every `take-control` in `effects`, however deep a splash or an `if` holds it. */
function takeControls(effects: readonly SkillEffect[]): TakeControlEffect[] {
  return effects.flatMap((effect) =>
    effect.kind === "take-control"
      ? [effect]
      : "effects" in effect
        ? takeControls(effect.effects)
        : [],
  );
}

describe("bonds (#2092)", () => {
  it("binds every take-control to a status that holds what it takes", () => {
    const bonds = [...SKILLS_BY_ID.values()]
      .flatMap((skill) => takeControls(skill.effects))
      .flatMap((effect) => (effect.bondStatusId === undefined ? [] : [effect.bondStatusId]));
    expect(bonds).toContain("veratas-aura");
    for (const id of bonds) {
      expect(getStatusDefinition(id).bindsCreatures).toBe(true);
    }
  });
});
