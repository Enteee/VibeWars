import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { CombatEvent } from "../skills/effects.js";
import type { StatusId } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The PvP forms (#1951): Shadow Form fails a foe's spells at its bearer
 * and makes attacks at it miss, then drops it to 41 Health; Elemental
 * Flame burns whoever its bearer's Elemental hexes land on; Mist Form
 * cuts a Water-hexed foe's damage and heals hurt allies on each
 * elemental spell.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ARMOR = RULES.combat.armorReferenceLevel;

describe("Shadow Form (#1951)", () => {
  it("fails a foe's spell at its bearer: paid for, recharging, and nothing else", () => {
    const match = sim([
      body("s", 0, vec2(0, 0)),
      body("e", 1, vec2(300, 0), ["elementalist.fireball"]),
    ]);
    put(match, "s", "shadow-form", 13);
    const foe = get(match, "e").combatant;
    const energy = foe.energy;
    const log = cast(match, "e", 0, "s", 4);
    expect(get(match, "s").combatant.health).toBe(480);
    expect(foe.energy).toBeLessThan(energy - 9);
    expect(foe.cast.rechargeRemaining.size).toBe(1);
    expect(events(log)).toContainEqual({
      kind: "spell-failed",
      targetId: "e",
      skillId: "elementalist.fireball",
    });
    expect(get(match, "s").combatant.statuses.has("shadow-form")).toBe(true);
  });

  it("still takes an area spell aimed at an ally beside it", () => {
    const match = sim([
      body("s", 0, vec2(0, 0)),
      body("x", 0, vec2(20, 0)),
      body("e", 1, vec2(300, 0), ["elementalist.fireball"]),
    ]);
    put(match, "s", "shadow-form", 13);
    cast(match, "e", 0, "x", 4);
    expect(get(match, "x").combatant.health).toBeLessThan(480);
    expect(get(match, "s").combatant.health).toBeLessThan(480);
  });

  it("makes every blow at it miss, never a block", () => {
    const match = sim([
      body("s", 0, vec2(0, 0)),
      { ...body("w", 1, vec2(40, 0)), equipment: sword() },
    ]);
    put(match, "s", "shadow-form", 13);
    expect(match.requestAttack("w", "s")?.ok).toBe(true);
    const log = stepFor(match, 5);
    const missed = events(log).filter((event) => event.kind === "attack-missed");
    expect(missed.length).toBeGreaterThan(2);
    expect(events(log).some((event) => event.kind === "attack-blocked")).toBe(false);
    expect(get(match, "s").combatant.health).toBe(480);
  });

  it("drops its bearer to 41 Health when it runs out, and when it is stripped", () => {
    const expired = sim([body("s", 0, vec2(0, 0))]);
    get(expired, "s").combatant.health = 400;
    put(expired, "s", "shadow-form", 1);
    stepFor(expired, 1.5);
    expect(get(expired, "s").combatant.health).toBe(41);

    const stripped = sim([body("s", 0, vec2(0, 0))]);
    get(stripped, "s").combatant.health = 400;
    put(stripped, "s", "shadow-form", 13);
    get(stripped, "s").combatant.statuses.end("shadow-form");
    stepFor(stripped, 0.1);
    expect(get(stripped, "s").combatant.health).toBe(41);
  });

  it("leaves a bearer already under 41 Health as it is", () => {
    const match = sim([body("s", 0, vec2(0, 0))]);
    get(match, "s").combatant.health = 30;
    put(match, "s", "shadow-form", 1);
    stepFor(match, 1.5);
    expect(get(match, "s").combatant.health).toBe(30);
  });
});

describe("Elemental Flame (#1951)", () => {
  it("sets every foe its Water hex lands on burning for 2 s", () => {
    const match = sim([
      body("a", 0, vec2(0, 0), ["elementalist.deep-freeze"]),
      body("d", 1, vec2(300, 0)),
      body("d2", 1, vec2(310, 10)),
      body("d3", 1, vec2(310, -10)),
    ]);
    put(match, "a", "elemental-flame", 17);
    cast(match, "a", 0, "d", 0, (m) => get(m, "d").combatant.statuses.has("deep-freeze"));
    for (const id of ["d", "d2", "d3"]) {
      const burning = get(match, id).combatant.statuses.get("burning");
      expect(burning?.remainingSeconds).toBeGreaterThan(1.5);
      expect(burning?.remainingSeconds).toBeLessThanOrEqual(2);
    }
  });

  it("does not answer a Mesmer hex", () => {
    const match = sim([body("a", 0, vec2(0, 0), ["mesmer.empathy"]), body("d", 1, vec2(300, 0))]);
    put(match, "a", "elemental-flame", 17);
    cast(match, "a", 0, "d", 3);
    expect(get(match, "d").combatant.statuses.has("empathy")).toBe(true);
    expect(get(match, "d").combatant.statuses.has("burning")).toBe(false);
  });
});

describe("Mist Form (#1951)", () => {
  it("takes 33% less damage from a foe under a Water Magic hex", () => {
    const fireball = (hexed: boolean): number => {
      const match = sim([
        body("m", 0, vec2(0, 0)),
        body("e", 1, vec2(300, 0), ["elementalist.fireball"]),
      ]);
      put(match, "m", "mist-form", 38);
      if (hexed) {
        put(match, "e", "deep-freeze", 30, "m");
      }
      cast(match, "e", 0, "m", 4);
      return 480 - get(match, "m").combatant.health;
    };
    const plain = fireball(false);
    expect(plain).toBeGreaterThan(0);
    expect(fireball(true)).toBe(Math.round(plain * 0.67));
  });

  it("heals hurt non-spirit allies in earshot for 210% of an elemental spell's cost", () => {
    const match = sim([
      body("m", 0, vec2(0, 0), ["elementalist.fireball"]),
      body("hurt", 0, vec2(100, 0)),
      body("fine", 0, vec2(-100, 0)),
      spirit("sp", "m", vec2(0, 100)),
      body("d", 1, vec2(300, 0)),
    ]);
    put(match, "m", "mist-form", 38);
    get(match, "hurt").combatant.health = 240;
    get(match, "fine").combatant.health = 432;
    get(match, "sp").combatant.health = 50;
    cast(match, "m", 0, "d", 0.1, () => true);
    stepFor(match, 0.2);
    expect(get(match, "hurt").combatant.health).toBe(240 + 21);
    expect(get(match, "fine").combatant.health).toBe(432);
    expect(get(match, "sp").combatant.health).toBe(50);
  });
});

function sim(participants: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({ seed: "forms-pvp", participants });
}

function body(id: string, team: number, spawn: Vec2, bar: string[] = []): ParticipantSpec {
  return {
    id,
    team,
    skillBar: bar,
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(ARMOR),
    maxHealth: 480,
    maxEnergy: 200,
    spawn,
    facing: team === 0 ? 0 : Math.PI,
  };
}

/** A spirit of `ownerId`'s already standing, as `#summon` would make it. */
function spirit(id: string, ownerId: string, spawn: Vec2): ParticipantSpec {
  return {
    ...body(id, 0, spawn),
    maxHealth: 200,
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

function sword(): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(ARMOR),
    mainHand: {
      weapon: WEAPONS.sword,
      attributeId: "warrior.swordsmanship",
      damageType: WEAPONS.sword.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function put(
  match: MatchSimulation,
  id: string,
  status: StatusId,
  seconds: number,
  from = id,
): void {
  get(match, id).combatant.statuses.apply(status, seconds, from, NO_RANKS);
}

/**
 * `casterId` uses `slot` at `targetId`, then steps `seconds` more, or
 * until `done` holds after the cast is under way.
 */
function cast(
  match: MatchSimulation,
  casterId: string,
  slot: number,
  targetId: string,
  seconds: number,
  done?: (match: MatchSimulation) => boolean,
): CombatLogEntry[] {
  match.setTarget(casterId, targetId);
  expect(match.requestSkill(casterId, slot)?.check).toEqual({ ok: true });
  const log: CombatLogEntry[] = [];
  log.push(...stepFor(match, seconds));
  for (let i = 0; done !== undefined && i < 600; i += 1) {
    if (done(match) && !get(match, casterId).combatant.cast.isCasting) {
      break;
    }
    log.push(...match.step(DT).log);
  }
  return log;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

function events(log: readonly CombatLogEntry[]): CombatEvent[] {
  return log.flatMap((entry) => entry.events);
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}
