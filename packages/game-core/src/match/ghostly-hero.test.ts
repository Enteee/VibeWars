import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import {
  ANNIHILATION_MATCH_RULES,
  CAPTURE_POINTS_MATCH_RULES,
  CAPTURE_WAVE_SECONDS,
  KING_OF_THE_HILL_MATCH_RULES,
  PRIEST_ANNIHILATION_MATCH_RULES,
  PRIEST_WAVE_SECONDS,
  type MatchRules,
} from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { NO_RANKS } from "../skills/status.js";
import { chargeAdrenaline } from "../skills/testing.js";
import { vec2, type Vec2 } from "../vec2.js";
import { applyIntent } from "./apply-intent.js";
import {
  GHOST_AXE_MASTERY,
  GHOST_AXE_SKILLS,
  GHOST_HEALTH,
  GHOST_SKILL_BAR,
  ghostId,
  type GhostField,
} from "./ghost.js";
import { MASTERLESS_TEAM } from "./minions.js";
import { priestId, type Shrine } from "./priest.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Heroes' Ascent's Ghostly Hero (#2689) on a map with no altar: its
 * GW1 stats at its map's level, its axe skills whether it stays or
 * follows, and +10% morale for the team that kills a foe team's.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIELD: GhostField = {
  level: 28,
  altar: undefined,
  spawns: [
    { team: 0, position: vec2(300, 500) },
    { team: 1, position: vec2(1700, 500) },
  ],
};
const GHOST_0 = ghostId(0);

function fighter(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[] = [],
): ParticipantSpec {
  const axe = WEAPONS.axe;
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map(),
    equipment: {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      mainHand: {
        weapon: axe,
        attributeId: "warrior.axe-mastery",
        damageType: weaponDamageType(axe, "warrior.axe-mastery"),
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    spawn,
    facing: 0,
    maxHealth: 480,
  };
}

/** `owner`'s axe minion on `team`, beside team 0's ghost. */
function minion(id: string, ownerId: string, team: number): ParticipantSpec {
  return {
    ...fighter(id, team, vec2(360, 500)),
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

/** `a` by its ghost, `x` and `y` by theirs, on an open field. */
function ascent(...extra: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "ghostly-hero",
    bounds: { width: 2000, height: 1000 },
    ghostField: FIELD,
    participants: [
      fighter("a", 0, vec2(200, 500)),
      fighter("x", 1, vec2(1800, 500)),
      fighter("y", 1, vec2(1800, 700)),
      ...extra,
    ],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Step until `done`, or fail after `seconds`. */
function stepUntil(sim: MatchSimulation, done: () => boolean, seconds: number): void {
  for (let tick = 0; tick < seconds / DT && !done(); tick += 1) {
    sim.step(DT);
  }
  expect(done()).toBe(true);
}

/** `x`, beside team 0's ghost at 1 Health, swings at it until it dies. */
function killGhost(sim: MatchSimulation): void {
  get(sim, "x").position = vec2(360, 500);
  get(sim, GHOST_0).combatant.health = 1;
  expect(applyIntent(sim, "x", { kind: "attack", targetId: GHOST_0 })).toBeNull();
  stepUntil(sim, () => get(sim, GHOST_0).combatant.dead, 5);
}

describe("the Ghostly Hero (#2689)", () => {
  it("stands at each team's spawn with 640 Health, an axe and its bar, at its map's level", () => {
    const sim = ascent();
    const ghost = get(sim, GHOST_0);
    expect(ghost.position).toEqual(vec2(300, 500));
    expect(ghost.combatant.maxHealth).toBe(GHOST_HEALTH);
    expect(GHOST_HEALTH).toBe(640);
    expect(ghost.skillBar).toEqual(GHOST_SKILL_BAR);
    expect(ghost.combatant.attributeRanks.get("warrior.axe-mastery")).toBe(GHOST_AXE_MASTERY[28]);
    expect(GHOST_AXE_MASTERY).toEqual({ 20: 12, 24: 14, 28: 16 });
    expect(get(sim, ghostId(1)).position).toEqual(vec2(1700, 500));
  });

  it("gives the team that kills a foe team's ghost +10% morale, lifting a death penalty", () => {
    const sim = ascent();
    get(sim, "x").combatant.morale = -15;
    get(sim, "y").combatant.morale = -15;
    killGhost(sim);
    expect(get(sim, "x").combatant.morale).toBe(-5);
    expect(get(sim, "y").combatant.morale).toBe(-5);
    expect(get(sim, "a").combatant.morale).toBe(0);
  });

  it("caps the boost at +10%", () => {
    const sim = ascent();
    sim.moraleBoost(1, 10);
    killGhost(sim);
    expect(get(sim, "x").combatant.morale).toBe(10);
  });

  it("credits a minion's team for a ghost that bleeds out after the minion is gone", () => {
    const sim = ascent(minion("m", "x", 1));
    const ghost = get(sim, GHOST_0);
    expect(applyIntent(sim, "m", { kind: "attack", targetId: GHOST_0 })).toBeNull();
    stepUntil(sim, () => ghost.combatant.health < ghost.combatant.maxHealth, 5);
    // The minion dies and leaves at the end of its step.
    get(sim, "m").combatant.health = 0;
    stepUntil(sim, () => sim.get("m") === undefined, 1);
    // Then the ghost dies to a degen, which has no dealer.
    ghost.combatant.health = 1;
    ghost.combatant.statuses.apply("bleeding", 10, "a", NO_RANKS);
    stepUntil(sim, () => ghost.combatant.dead, 5);
    expect(get(sim, "x").combatant.morale).toBe(10);
    expect(get(sim, "y").combatant.morale).toBe(10);
    expect(get(sim, "a").combatant.morale).toBe(0);
  });

  it("credits nobody for a ghost a masterless creature killed", () => {
    const sim = ascent(minion("m", "nobody", MASTERLESS_TEAM));
    get(sim, GHOST_0).combatant.health = 1;
    expect(applyIntent(sim, "m", { kind: "attack", targetId: GHOST_0 })).toBeNull();
    stepUntil(sim, () => get(sim, GHOST_0).combatant.dead, 5);
    for (const id of ["a", "x", "y"]) {
      expect(get(sim, id).combatant.morale).toBe(0);
    }
  });

  it("uses Cyclone Axe on a foe beside it while it follows its leader, with no altar to draw it", () => {
    const sim = ascent();
    // Space on it: it follows `a`.
    expect(applyIntent(sim, "a", { kind: "target", targetSessionId: GHOST_0 })).toBeNull();
    expect(applyIntent(sim, "a", { kind: "attack", targetId: GHOST_0 })).toBeNull();
    stepUntil(sim, () => get(sim, GHOST_0).creature?.leaderId === "a", 2);
    get(sim, "x").position = vec2(get(sim, GHOST_0).position.x + 60, 500);
    const ghost = get(sim, GHOST_0).combatant;
    stepUntil(sim, () => (ghost.cast.rechargeRemaining.get("warrior.cyclone-axe") ?? 0) > 0, 5);
    expect(get(sim, GHOST_0).creature?.leaderId).toBe("a");
  });

  it.each(GHOST_AXE_SKILLS.map((skillId, slot) => [skillId, slot] as const))(
    "%s fires with 0 Axe Mastery: its ranks scale it, they do not gate it",
    (skillId, slot) => {
      const sim = ascent(fighter("w", 0, vec2(1740, 400), GHOST_AXE_SKILLS));
      get(sim, "x").position = vec2(1740, 460);
      const w = get(sim, "w").combatant;
      chargeAdrenaline(w, skillId);
      expect(applyIntent(sim, "w", { kind: "target", targetSessionId: "x" })).toBeNull();
      expect(applyIntent(sim, "w", { kind: "use-skill", slot })).toBeNull();
      stepUntil(sim, () => (w.cast.rechargeRemaining.get(skillId) ?? 0) > 0, 3);
    },
  );
});

describe("when a dead Ghostly Hero rises (#2839)", () => {
  const SHRINES: readonly Shrine[] = [
    { team: 0, position: vec2(100, 500) },
    { team: 1, position: vec2(1900, 500) },
  ];

  function game(matchRules: MatchRules, shrines: readonly Shrine[]): MatchSimulation {
    return new MatchSimulation({
      seed: "ghost-rises",
      bounds: { width: 2000, height: 1000 },
      matchRules,
      shrines,
      ghostField: FIELD,
      participants: [fighter("a", 0, vec2(200, 900)), fighter("x", 1, vec2(1800, 900))],
    });
  }

  /** Step until the match clock reaches `seconds`. */
  function stepTo(sim: MatchSimulation, seconds: number): void {
    while (sim.elapsedSeconds < seconds - DT / 2) {
      sim.step(DT);
    }
  }

  /** Kill `id` where it stands, as burning would. */
  function kill(sim: MatchSimulation, id: string): void {
    const victim = get(sim, id);
    victim.combatant.statuses.apply("burning", 10, "x", NO_RANKS);
    victim.combatant.health = 0.2;
    stepUntil(sim, () => victim.combatant.dead, 2);
  }

  it("is back at the next wave while its priest lives, and at the wave after", () => {
    const sim = game(PRIEST_ANNIHILATION_MATCH_RULES, SHRINES);
    const ghost = get(sim, GHOST_0);
    stepTo(sim, 30);
    ghost.position = vec2(800, 300);
    kill(sim, GHOST_0);
    stepTo(sim, PRIEST_WAVE_SECONDS - 1);
    expect(ghost.combatant.dead).toBe(true);
    stepTo(sim, PRIEST_WAVE_SECONDS + DT);
    expect(ghost.combatant.dead).toBe(false);
    expect(ghost.combatant.health).toBe(GHOST_HEALTH);
    expect(ghost.position).toEqual(vec2(300, 500));

    kill(sim, GHOST_0);
    stepTo(sim, PRIEST_WAVE_SECONDS * 2 - 1);
    expect(ghost.combatant.dead).toBe(true);
    stepTo(sim, PRIEST_WAVE_SECONDS * 2 + DT);
    expect(ghost.combatant.dead).toBe(false);
  });

  it("does not rise once its priest is dead", () => {
    const sim = game(PRIEST_ANNIHILATION_MATCH_RULES, SHRINES);
    kill(sim, GHOST_0);
    kill(sim, priestId(0));
    stepTo(sim, PRIEST_WAVE_SECONDS * 3 + DT);
    expect(get(sim, GHOST_0).combatant.dead).toBe(true);
  });

  it("never rises with no priests in plain Annihilation, its boost given once", () => {
    const sim = game(ANNIHILATION_MATCH_RULES, []);
    killGhost(sim);
    stepUntil(sim, () => get(sim, "x").combatant.morale === 10, 1);
    stepTo(sim, PRIEST_WAVE_SECONDS * 3);
    expect(get(sim, GHOST_0).combatant.dead).toBe(true);
    expect(get(sim, "x").combatant.morale).toBe(10);
  });

  it("rises 120 s after it died in King of the Hill", () => {
    const sim = game(KING_OF_THE_HILL_MATCH_RULES, []);
    stepTo(sim, 30);
    kill(sim, GHOST_0);
    const died = sim.elapsedSeconds;
    stepTo(sim, died + PRIEST_WAVE_SECONDS - 1);
    expect(get(sim, GHOST_0).combatant.dead).toBe(true);
    stepTo(sim, died + PRIEST_WAVE_SECONDS + 1);
    expect(get(sim, GHOST_0).combatant.dead).toBe(false);
  });

  it("rises at its spawn on the 60 s wave in Capture Points (#2845)", () => {
    const sim = game(CAPTURE_POINTS_MATCH_RULES, SHRINES);
    const ghost = get(sim, GHOST_0);
    stepTo(sim, 30);
    ghost.position = vec2(800, 300);
    kill(sim, GHOST_0);
    stepTo(sim, CAPTURE_WAVE_SECONDS - 1);
    expect(ghost.combatant.dead).toBe(true);
    stepTo(sim, CAPTURE_WAVE_SECONDS + DT);
    expect(ghost.combatant.dead).toBe(false);
    expect(ghost.position).toEqual(vec2(300, 500));
  });
});
