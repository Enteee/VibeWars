import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { GUILD_BATTLE_MATCH_RULES } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { applyDamage, applyStatus, type CombatEvent } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { GUARD_ROLES, guardId, type BaseGuard } from "./guards.js";
import { GUILD_LORD_HEALTH, guildLordId, guildLordLossCap } from "./guild-lord.js";
import { countsForTeam, MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * A Guild Battle's base guards (#1223): GW1's roster on leashes, the
 * Bodyguard's 20% off the damage to its lord, and the lord's
 * Amulet of Protection capping the Health it loses each second.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const LORD_0 = vec2(100, 300);
const LORD_1 = vec2(2900, 300);
const LONGBOW_RANGE = WEAPONS.longbow.range;

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxHealth: 480,
    maxEnergy: 30,
  };
}

/** A sword that always hits for `damage` before armor. */
function hitter(id: string, team: number, spawn: Vec2, damage: number): ParticipantSpec {
  return {
    ...spec(id, team, spawn),
    attributeRanks: new Map([["warrior.swordsmanship", 12]]),
    equipment: {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      mainHand: {
        weapon: { ...WEAPONS.sword, damageMin: damage, damageMax: damage },
        attributeId: "warrior.swordsmanship",
        damageType: "slashing",
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
  };
}

function match(
  guards: readonly BaseGuard[],
  participants: readonly ParticipantSpec[] = [],
): MatchSimulation {
  return new MatchSimulation({
    seed: "guards",
    matchRules: GUILD_BATTLE_MATCH_RULES,
    bounds: { width: 3000, height: 1200 },
    guildLords: [
      { team: 0, position: LORD_0 },
      { team: 1, position: LORD_1 },
    ],
    guards,
    participants: [spec("a", 0, vec2(1450, 1000)), spec("x", 1, vec2(1550, 1000)), ...participants],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepTo(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  while (sim.elapsedSeconds < seconds - DT / 2 && sim.phase === "active") {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** The damage events on `targetId` in `log`. */
function damageTo(log: readonly CombatLogEntry[], targetId: string): number[] {
  return log.flatMap((entry) =>
    entry.events.flatMap((event) =>
      event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
    ),
  );
}

describe("guildLordLossCap (#1223)", () => {
  it("rises from 25 at 0:00 to 300 at 12:00, and stays there", () => {
    expect(guildLordLossCap(0)).toBe(25);
    expect(guildLordLossCap(197)).toBeCloseTo(100, 0);
    expect(guildLordLossCap(720)).toBe(300);
    expect(guildLordLossCap(1500)).toBe(300);
  });
});

describe("the Guild Lord's guard on its Health (#1223)", () => {
  function lord(bodyguardDead: boolean) {
    const bodyguard = makeCombatant({ id: "bodyguard", dead: bodyguardDead });
    return makeCombatant({
      id: "lord",
      health: 1000,
      maxHealth: 1000,
      lossGuard: { bodyguard, remaining: 25 },
    });
  }

  it("takes 20% less while its Bodyguard lives, then the cap, then nothing", () => {
    const target = lord(false);
    const events: CombatEvent[] = [];
    applyDamage(target, 20, "slashing", false, events, undefined);
    applyDamage(target, 20, "slashing", false, events, undefined);
    applyDamage(target, 20, "slashing", false, events, undefined);
    expect(events.map((event) => (event.kind === "damage" ? event.amount : -1))).toEqual([
      16, 9, 0,
    ]);
    expect(target.health).toBe(975);
  });

  it("takes it in full once the Bodyguard is dead", () => {
    const target = lord(true);
    const events: CombatEvent[] = [];
    applyDamage(target, 20, "slashing", false, events, undefined);
    expect(events).toEqual([{ kind: "damage", targetId: "lord", amount: 20, critical: false }]);
  });
});

describe("the base guards (#1223)", () => {
  const ROSTER: readonly BaseGuard[] = [
    { team: 0, role: "bodyguard", position: vec2(160, 300) },
    { team: 0, role: "knight", position: vec2(130, 200) },
    { team: 1, role: "footman", position: vec2(2700, 300) },
  ];

  it("stand at their posts as creatures nobody owns, named for their role", () => {
    const sim = match(ROSTER);
    const bodyguard = get(sim, guardId(0, 0));
    expect(bodyguard.position).toEqual(vec2(160, 300));
    expect(bodyguard.creature).toMatchObject({
      kind: "guard",
      name: "Bodyguard",
      ownerId: undefined,
    });
    expect(bodyguard.combatant.maxHealth).toBe(480);
    expect(bodyguard.combatant.equipment.baseArmor).toBe(GUARD_ROLES.bodyguard.armor);
    expect(bodyguard.combatant.equipment.mainHand.damageType).toBe("cold");
    expect(countsForTeam(bodyguard)).toBe(false);
    expect(get(sim, guardId(0, 1)).creature?.name).toBe("Knight");
    expect(get(sim, guardId(0, 1)).combatant.equipment.conditionalArmor).toEqual([
      { amount: 20, conditions: [{ kind: "vs-physical" }] },
    ]);
    // Numbered per team, in the map's order.
    expect(get(sim, guardId(1, 0)).creature?.name).toBe("Footman");
  });

  it("cut a hit on their lord by 20% while the Bodyguard lives, and not once it is dead", () => {
    const sim = match(ROSTER);
    const lord = get(sim, guildLordId(0)).combatant;
    const events: CombatEvent[] = [];
    applyDamage(lord, 10, "slashing", false, events, undefined);
    get(sim, guardId(0, 0)).combatant.dead = true;
    applyDamage(lord, 10, "slashing", false, events, undefined);
    expect(events.map((event) => (event.kind === "damage" ? event.amount : -1))).toEqual([8, 10]);
    // The other team has no Bodyguard: full damage.
    const other = get(sim, guildLordId(1)).combatant;
    const theirs: CombatEvent[] = [];
    applyDamage(other, 10, "slashing", false, theirs, undefined);
    expect(theirs[0]).toMatchObject({ kind: "damage", amount: 10 });
  });

  it("heal their Guild Lord when it is hurt, with no foe near", () => {
    const sim = match(ROSTER);
    const lord = get(sim, guildLordId(0));
    lord.combatant.health = GUILD_LORD_HEALTH * 0.4;
    const log = stepTo(sim, 4);
    const heals = log.filter(
      (entry) =>
        entry.sourceId === guardId(0, 0) &&
        entry.skillId === "monk.heal-other" &&
        entry.events.some((event) => event.kind === "heal" && event.targetId === lord.id),
    );
    expect(heals.length).toBeGreaterThan(0);
  });

  it("let a Knight pulled past its 900-unit leash walk home, ignoring a foe it passes", () => {
    const post = vec2(500, 600);
    const sim = match(
      [{ team: 0, role: "knight", position: post }],
      [spec("near", 1, vec2(1050, 600))],
    );
    const knight = get(sim, guardId(0, 0));
    knight.position = vec2(post.x + 950, post.y);
    stepTo(sim, 2);
    expect(knight.position.x).toBeLessThan(post.x + 950 - 100);
    expect(knight.combatant.attack).toBeUndefined();
    expect(knight.targetId).toBeUndefined();
  });

  it("let an Archer shoot a foe in longbow range of its post, and ignore one beyond it", () => {
    const post = vec2(500, 600);
    const sim = match([{ team: 0, role: "archer", position: post }]);
    const archer = get(sim, guardId(0, 0));
    const x = get(sim, "x");
    x.position = vec2(post.x + LONGBOW_RANGE + 40, post.y);
    expect(damageTo(stepTo(sim, 4), "x")).toHaveLength(0);
    expect(distance(archer.position, post)).toBeLessThan(1);

    x.position = vec2(post.x + LONGBOW_RANGE - 40, post.y);
    const log = stepTo(sim, 10);
    expect(
      log.some((entry) => entry.sourceId === archer.id && damageTo([entry], "x").length > 0),
    ).toBe(true);
  });
});

describe("the Guild Lord's Health-loss cap in a match (#1223)", () => {
  it("negates damage past the second's cap, and aggression counts only what landed", () => {
    // Two swords swinging together: both blows land in the same tick.
    const sim = match(
      [],
      [
        hitter("y", 1, vec2(LORD_0.x + 40, LORD_0.y - 20), 200),
        hitter("z", 1, vec2(LORD_0.x + 40, LORD_0.y + 20), 200),
      ],
    );
    const lord = guildLordId(0);
    sim.requestAttack("y", lord);
    sim.requestAttack("z", lord);
    const log = stepTo(sim, 3);
    const landed = damageTo(
      log.filter((entry) => entry.sourceId === "y" || entry.sourceId === "z"),
      lord,
    );
    expect(landed.length).toBeGreaterThanOrEqual(2);
    expect(landed).toContain(0);
    for (const second of [0, 1, 2]) {
      const inSecond = damageTo(
        log.filter((entry) => entry.atSeconds > second && entry.atSeconds <= second + 1),
        lord,
      );
      expect(inSecond.reduce((sum, amount) => sum + amount, 0)).toBeLessThanOrEqual(
        Math.floor(guildLordLossCap(second)) + 1,
      );
    }
    expect(sim.aggression(1)).toBe(landed.reduce((sum, amount) => sum + amount, 0));
  });

  it("takes no degeneration past the cap, so a lord it spent cannot die to it", () => {
    const sim = match([]);
    const lord = get(sim, guildLordId(0)).combatant;
    // −10 pips of conditions against its +5 and natural regeneration.
    for (const condition of ["bleeding", "burning"] as const) {
      lord.statuses.apply(condition, 10, "x", NO_RANKS);
    }
    sim.step(DT);
    // The whole second's cap, spent by one blow.
    applyDamage(lord, 1000, "slashing", false, [], undefined);
    lord.health = 5;
    // What the blow's whole points left of the cap, under one: then nothing.
    stepTo(sim, 0.5);
    const spent = lord.health;
    expect(spent).toBeGreaterThan(4);
    const log = stepTo(sim, 1 - DT);
    expect(lord.dead).toBe(false);
    expect(lord.health).toBe(spent);
    expect(damageTo(log, lord.id)).toEqual([]);
  });

  it("lets a Deep Wound cut no more than the second's cap, in that second or any later one", () => {
    const sim = match([]);
    sim.step(DT);
    const lord = get(sim, guildLordId(0)).combatant;
    // 20% of its maximum, up to 100, uncapped.
    expect(applyStatus(lord, "deep-wound", 20, "x", NO_RANKS)).toBe(25);
    expect(lord.health).toBe(GUILD_LORD_HEALTH - 25);
    // The cap is spent: a second wound landing takes nothing more.
    lord.statuses.remove("deep-wound");
    expect(applyStatus(lord, "deep-wound", 20, "x", NO_RANKS)).toBe(0);
    expect(lord.health).toBe(GUILD_LORD_HEALTH - 25);
    // Nor does coming down to its new maximum, for the rest of the second.
    stepTo(sim, 1 - DT);
    expect(lord.health).toBe(GUILD_LORD_HEALTH - 25);
    // Each later second takes at most its cap, until it is at its maximum.
    let before = lord.health;
    for (let second = 1; second < 5; second++) {
      stepTo(sim, second + 1 - DT);
      expect(before - lord.health).toBeLessThanOrEqual(guildLordLossCap(second) + 1e-9);
      before = lord.health;
    }
    expect(lord.health).toBe(GUILD_LORD_HEALTH - 100);
  });
});
