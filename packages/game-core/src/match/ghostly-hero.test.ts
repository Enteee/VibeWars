import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
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
