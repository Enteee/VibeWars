import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { ANNIHILATION_MATCH_RULES } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { critterSpec, RAT } from "./critters.js";
import { countsForTeam, MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * The rat (#3315): a small hostile critter that holds its post, bites
 * whoever comes near and vanishes when killed.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const POST = vec2(600, 300);
const AGGRO = 200;
const LEASH = 300;

function rat(position: Vec2 = POST, aggroUnits = AGGRO): ParticipantSpec {
  return critterSpec(
    "rat/0",
    1,
    position,
    0,
    {
      kind: "guard",
      post: POST,
      aggroUnits,
      leashUnits: LEASH,
      rooted: false,
      thinkSeconds: 0.25,
    },
    Math.PI,
  );
}

/** A warrior at `spawn`: armor 80, a sword at Swordsmanship 12. */
function warrior(spawn: Vec2): ParticipantSpec {
  return {
    id: "w",
    team: 0,
    skillBar: [],
    attributeRanks: new Map([["warrior.swordsmanship", 12]]),
    equipment: {
      ...unarmedResolvedEquipment(80),
      mainHand: {
        weapon: WEAPONS.sword,
        attributeId: "warrior.swordsmanship",
        damageType: "slashing",
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    spawn,
    facing: 0,
    maxHealth: 480,
    maxEnergy: 25,
  };
}

function match(participants: readonly ParticipantSpec[]): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "rats",
    matchRules: ANNIHILATION_MATCH_RULES,
    bounds: { width: 1200, height: 600 },
    participants,
  });
  sim.add(rat());
  return sim;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  const end = sim.elapsedSeconds + seconds;
  while (sim.elapsedSeconds < end - DT / 2 && sim.phase === "active") {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** The blows `attackerId` landed on `targetId` in `log`. */
function blows(log: readonly CombatLogEntry[], attackerId: string, targetId: string): number[] {
  return log.flatMap((entry) =>
    entry.sourceId === attackerId
      ? entry.events.flatMap((event) =>
          event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
        )
      : [],
  );
}

describe("critterSpec (#3315)", () => {
  it("makes a rat nobody owns: 120 health, armor 20, the rat look, counting for nobody", () => {
    const sim = match([warrior(vec2(100, 300))]);
    const body = sim.get("rat/0");
    expect(body?.combatant.team).toBe(1);
    expect(body?.combatant.maxHealth).toBe(RAT.health);
    expect(body?.combatant.health).toBe(120);
    expect(body?.combatant.equipment.baseArmor).toBe(20);
    expect(body?.combatant.equipment.mainHand.damageType).toBe("piercing");
    expect(body?.creature).toMatchObject({
      kind: "critter",
      look: "rat",
      name: "Rat",
      ownerId: undefined,
      onDeath: "vanish",
    });
    expect(body === undefined ? undefined : countsForTeam(body)).toBe(false);
  });

  it("dies to a warrior's sword in 3 to 8 blows, and vanishes", () => {
    const sim = match([warrior(vec2(560, 300))]);
    sim.requestAttack("w", "rat/0");
    const log = stepFor(sim, 20);
    const landed = blows(log, "w", "rat/0");
    expect(sim.get("rat/0")).toBeUndefined();
    expect(landed.length).toBeGreaterThanOrEqual(3);
    expect(landed.length).toBeLessThanOrEqual(8);
  });

  it("bites a foe within its aggro for 4 to 8 before armor, every 1.5 s", () => {
    const sim = match([warrior(vec2(POST.x - AGGRO + 40, 300))]);
    const log = stepFor(sim, 10);
    const bites = blows(log, "rat/0", "w");
    // 10 s, less the walk and the swing up: at least 4 bites, at most 7.
    expect(bites.length).toBeGreaterThanOrEqual(4);
    expect(bites.length).toBeLessThanOrEqual(7);
    // The warrior's armor 80 against a raw 4–8: a nip, never more than 8.
    for (const bite of bites) {
      expect(bite).toBeGreaterThan(0);
      expect(bite).toBeLessThanOrEqual(8);
    }
  });

  it("leaves a foe past its aggro alone", () => {
    const sim = match([warrior(vec2(POST.x - AGGRO - 150, 300))]);
    const log = stepFor(sim, 5);
    expect(blows(log, "rat/0", "w")).toEqual([]);
    expect(distance(sim.get("rat/0")?.position ?? vec2(0, 0), POST)).toBeLessThan(5);
  });

  it("walks home from past its leash, ignoring the foe beside it until it is there", () => {
    // Knocked 350 from its post, past its leash of 300, a warrior at its
    // side and well within an aggro of 500.
    const sim = new MatchSimulation({
      seed: "rats",
      matchRules: ANNIHILATION_MATCH_RULES,
      bounds: { width: 1200, height: 600 },
      participants: [warrior(vec2(POST.x - 380, 300))],
    });
    sim.add(rat(vec2(POST.x - 350, 300), 500));
    const log: CombatLogEntry[] = [];
    let home = Number.POSITIVE_INFINITY;
    while (home > 30 && sim.elapsedSeconds < 10) {
      log.push(...stepFor(sim, DT));
      home = distance(sim.get("rat/0")?.position ?? vec2(0, 0), POST);
    }
    expect(home).toBeLessThanOrEqual(30);
    expect(blows(log, "rat/0", "w")).toEqual([]);
  });
});
