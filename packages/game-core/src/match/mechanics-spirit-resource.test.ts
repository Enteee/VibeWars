import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_SPIRIT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Spirits as a resource (#1947): Spirit Transfer drains the spirit
 * nearest its caster, any team's, to heal an ally five for each point;
 * Gaze of Fury spends an allied spirit for a Spirit of Fury in its place.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const TRANSFER = "ritualist.spirit-transfer";
const GAZE = "ritualist.gaze-of-fury";

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [TRANSFER, GAZE],
    attributeRanks: new Map([
      ["ritualist.restoration-magic", 12],
      ["ritualist.channeling-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 2000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A spirit of `ownerId`'s already standing, with `health`, as `#summon` would make it. */
function spirit(
  id: string,
  ownerId: string,
  team: number,
  spawn: Vec2,
  health = 200,
): ParticipantSpec {
  return {
    ...spec(id, team, spawn),
    skillBar: [],
    attributeRanks: new Map(),
    maxHealth: health,
    creature: {
      ownerId,
      kind: "spirit",
      look: "spirit",
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
      mode: "guard",
    },
  };
}

/** `r` on team 0 at the origin, its hurt ally `a` beside it, and `more`. */
function match(more: readonly ParticipantSpec[]): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "spirit-resource",
    participants: [spec("r", 0, vec2(0, 0)), spec("a", 0, vec2(0, 40)), ...more],
  });
  get(sim, "a").combatant.health = 500;
  return sim;
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

/** `r` casts `skillId` at `targetId`, and steps until it has landed. */
function cast(sim: MatchSimulation, skillId: string, targetId: string): CombatEvent[] {
  sim.setTarget("r", targetId);
  const slot = get(sim, "r").skillBar.indexOf(skillId);
  expect(sim.requestSkill("r", slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "r" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log
    .filter((entry) => entry.sourceId === "r" && entry.skillId === skillId)
    .flatMap((entry) => entry.events);
}

function amountsTo(
  events: readonly CombatEvent[],
  kind: "heal" | "health-loss",
  targetId: string,
): number[] {
  return events.flatMap((event) =>
    event.kind === kind && event.targetId === targetId ? [event.amount] : [],
  );
}

describe("Spirit Transfer (#1947)", () => {
  it("takes 41 from the nearest spirit and heals the ally 205", () => {
    const sim = match([spirit("s", "r", 0, vec2(100, 0))]);
    const events = cast(sim, TRANSFER, "a");
    expect(amountsTo(events, "health-loss", "s")).toEqual([41]);
    expect(amountsTo(events, "heal", "a")).toEqual([205]);
    expect(get(sim, "s").combatant.health).toBe(159);
  });

  it("on a spirit with 30 Health heals 150, and kills it", () => {
    const sim = match([spirit("s", "r", 0, vec2(100, 0), 30)]);
    const events = cast(sim, TRANSFER, "a");
    expect(amountsTo(events, "heal", "a")).toEqual([150]);
    expect(sim.get("s")).toBeUndefined();
  });

  it("drains a foe's spirit when it is the nearer, and only that one", () => {
    const sim = match([
      spirit("mine", "r", 0, vec2(200, 0)),
      spirit("theirs", "f", 1, vec2(-100, 0)),
    ]);
    const events = cast(sim, TRANSFER, "a");
    expect(amountsTo(events, "health-loss", "theirs")).toEqual([41]);
    expect(amountsTo(events, "health-loss", "mine")).toEqual([]);
  });

  it("ties by id", () => {
    const sim = match([spirit("t2", "r", 0, vec2(100, 0)), spirit("t1", "r", 0, vec2(-100, 0))]);
    const events = cast(sim, TRANSFER, "a");
    expect(amountsTo(events, "health-loss", "t1")).toEqual([41]);
  });

  it("with no spirit within earshot is refused before it starts, and costs nothing", () => {
    const sim = match([spirit("far", "r", 0, vec2(AREA_EARSHOT + 50, 0))]);
    sim.setTarget("r", "a");
    const energy = get(sim, "r").combatant.energy;
    expect(sim.requestSkill("r", 0)?.check).toEqual({ ok: false, reason: "no-spirit" });
    stepFor(sim, 1);
    expect(get(sim, "r").combatant.energy).toBeGreaterThanOrEqual(energy);
    expect(get(sim, "far").combatant.health).toBe(200);
  });

  it("says what it takes and what it gives", () => {
    const ranks = new Map([["ritualist.restoration-magic", 12]]);
    const skill = getSkill(TRANSFER);
    if (skill === undefined) {
      throw new Error(`no skill ${TRANSFER}`);
    }
    const described = describeSkill(skill, ranks);
    expect(described.effects.map((effect) => effect.text)).toContain(
      "Nearest spirit loses 41 Health; target ally is healed 5 per point",
    );
  });
});

describe("Gaze of Fury (#1947)", () => {
  it("destroys the target and plants a level 8 Spirit of Fury in its place, the caster's", () => {
    const sim = match([spirit("s", "a", 0, vec2(300, 0))]);
    cast(sim, GAZE, "s");
    stepFor(sim, DT * 2);
    expect(sim.get("s")).toBeUndefined();
    const fury = [...sim.participants()].find(
      (other) => other.creature?.kind === "spirit" && !other.combatant.dead && other.id !== "s",
    );
    expect(fury?.creature?.ownerId).toBe("r");
    expect(fury?.creature?.name).toBe("Fury");
    expect(fury?.position).toEqual(vec2(300, 0));
    // Level 8: 50 + 20 per level (#1917).
    expect(fury?.combatant.maxHealth).toBe(210);
    const mainHand = fury?.combatant.equipment.mainHand;
    expect((mainHand?.weapon.damageMax ?? 0) * (mainHand?.creatureDamageScale ?? 0)).toBeCloseTo(
      17,
      9,
    );
    expect(mainHand?.weapon.range).toBe(RANGE_SPIRIT);
    expect(fury?.creature?.expiresInSeconds).toBeCloseTo(54, 0);
    stepFor(sim, 55);
    expect(sim.get(fury?.id ?? "")).toBeUndefined();
  });

  it("is refused at a foe's spirit", () => {
    const sim = match([spirit("theirs", "f", 1, vec2(300, 0))]);
    sim.setTarget("r", "theirs");
    expect(sim.requestSkill("r", 1)?.check.ok).toBe(false);
  });
});
