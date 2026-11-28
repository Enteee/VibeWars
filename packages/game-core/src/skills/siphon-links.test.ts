import { describe, expect, it } from "vitest";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { statusMoveSpeed } from "./tick.js";
import type { Combatant } from "./types.js";

/**
 * A siphon hex's caster half lasts while the hex does, and stacks per
 * target (#4167): Life Siphon on two foes regenerates its caster twice
 * over, Siphon Speed on two hastes it once.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const R12 = new Map([
  ["necromancer.blood-magic", 12],
  ["assassin.deadly-arts", 12],
  ["monk.protection-prayers", 12],
]);

function spec(id: string, team: number, spawn: Vec2, skillBar: readonly string[]): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks: R12,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e5,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

function spirit(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    ...spec(id, team, spawn, []),
    creature: {
      ownerId: id,
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
      pulse: undefined,
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      bondStatusId: undefined,
      mode: "guard",
    },
  };
}

/**
 * `n`, a Necromancer with Life Siphon, and `a`, an Assassin with Siphon
 * Speed, of team 0. Of team 1: `f1` and `f2`, apart, `m`, a Monk with
 * Remove Hex, and `s`, a spirit.
 */
function arena(): MatchSimulation {
  return new MatchSimulation({
    seed: "siphon-links",
    participants: [
      spec("n", 0, vec2(0, 0), ["necromancer.life-siphon"]),
      spec("a", 0, vec2(0, 60), ["assassin.siphon-speed"]),
      spec("f1", 1, vec2(300, -200), []),
      spec("f2", 1, vec2(300, 200), []),
      spec("m", 1, vec2(400, -200), ["monk.remove-hex"]),
      spirit("s", 1, vec2(300, 0)),
    ],
  });
}

function get(match: MatchSimulation, id: string): Combatant {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
  }
}

/** `id` uses the skill in slot 0 on `targetId`, and what follows for `seconds`. */
function cast(match: MatchSimulation, id: string, targetId: string, seconds: number): void {
  match.setTarget(id, targetId);
  expect(match.requestSkill(id, 0)?.check).toEqual({ ok: true });
  stepFor(match, seconds);
}

function healthPips(body: Combatant): number {
  return aggregateModifiers(body.statuses.active).healthPips;
}

describe("Life Siphon's caster half (#4167)", () => {
  it("regenerates twice over on two foes, and ends with its last hex", () => {
    const match = arena();
    const n = get(match, "n");
    cast(match, "n", "f1", 7);
    expect(healthPips(n)).toBe(3);
    cast(match, "n", "f2", 1.5);
    expect(get(match, "f1").statuses.get("life-siphon")?.sourceId).toBe("n");
    expect(get(match, "f2").statuses.get("life-siphon")?.sourceId).toBe("n");
    expect(n.statuses.get("life-siphon-regen")?.stacks).toBe(2);
    expect(healthPips(n)).toBe(6);
    // Its clock is the longest hex's: f2's, the newer.
    expect(n.statuses.get("life-siphon-regen")?.remainingSeconds).toBe(
      get(match, "f2").statuses.get("life-siphon")?.remainingSeconds,
    );

    cast(match, "m", "f1", 1.5);
    expect(get(match, "f1").statuses.has("life-siphon")).toBe(false);
    expect(healthPips(n)).toBe(3);

    get(match, "f2").statuses.removeByCategory("hex");
    match.step(DT);
    expect(n.statuses.has("life-siphon-regen")).toBe(false);
    expect(healthPips(n)).toBe(0);
  });

  it("a recast on the same foe counts once", () => {
    const match = arena();
    cast(match, "n", "f1", 7);
    cast(match, "n", "f1", 1.5);
    expect(get(match, "n").statuses.get("life-siphon-regen")?.stacks).toBe(1);
  });

  it("ends as its hexes expire or their foes die", () => {
    const match = arena();
    const n = get(match, "n");
    cast(match, "n", "f1", 7);
    cast(match, "n", "f2", 1.5);
    get(match, "f1").health = 0;
    stepFor(match, 0.5);
    expect(get(match, "f1").dead).toBe(true);
    expect(n.statuses.get("life-siphon-regen")?.stacks).toBe(1);
    stepFor(match, 22);
    expect(get(match, "f2").statuses.has("life-siphon")).toBe(false);
    expect(n.statuses.has("life-siphon-regen")).toBe(false);
  });

  it("a hex refused by immunity gives nothing", () => {
    const match = arena();
    cast(match, "n", "s", 1.5);
    expect(get(match, "s").statuses.has("life-siphon")).toBe(false);
    expect(get(match, "n").statuses.has("life-siphon-regen")).toBe(false);
  });
});

describe("Siphon Speed's caster half (#4167)", () => {
  it("hastes 33% while a hex lives, never more on two, and ends with the last", () => {
    const match = arena();
    const a = get(match, "a");
    cast(match, "a", "f1", 1.5);
    get(match, "f2").statuses.apply("siphon-speed", 13, "a", NO_RANKS);
    match.step(DT);
    expect(a.statuses.get("siphon-speed-haste")?.stacks).toBe(2);
    expect(statusMoveSpeed(aggregateModifiers(a.statuses.active))).toBeCloseTo(1.33);

    get(match, "f1").statuses.removeByCategory("hex");
    match.step(DT);
    expect(a.statuses.has("siphon-speed-haste")).toBe(true);
    get(match, "f2").statuses.removeByCategory("hex");
    match.step(DT);
    expect(a.statuses.has("siphon-speed-haste")).toBe(false);
    expect(statusMoveSpeed(aggregateModifiers(a.statuses.active))).toBe(1);
  });
});
