import { describe, expect, it } from "vitest";

import {
  unarmedResolvedEquipment,
  type ResolvedEquipment,
  type ResolvedWeaponSet,
} from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { MatchRules } from "../match-rules.js";
import { moraleMaximum } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { swingIntervalSeconds } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Weapon sets (#489, ADR-0036): up to four, swapped at once or queued
 * behind the action in progress, no cooldown, and current energy moves
 * with the maximum, below 0 if it must (GW1's hidden energy).
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BASE_ENERGY = RULES.combat.baseEnergy;
const FIREBALL = "elementalist.fireball";
const SWIFT_CHOP = "warrior.swift-chop";
const SEVER_ARTERY = "warrior.sever-artery";

function wielding(weapon: Weapon, attributeId: string | undefined): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

const SWORD: ResolvedWeaponSet = {
  equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
  maxEnergy: 40,
  maxHealth: MINIMAL_GW_INSPIRED_PVP_V1.combat.baseHealth,
  baseEnergyPips: 0,
};
const AXE: ResolvedWeaponSet = {
  equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
  maxEnergy: 28,
  maxHealth: MINIMAL_GW_INSPIRED_PVP_V1.combat.baseHealth,
  baseEnergyPips: 0,
};
const BOW: ResolvedWeaponSet = {
  equipment: wielding(WEAPONS["recurve-bow"], "ranger.marksmanship"),
  maxEnergy: 40,
  maxHealth: MINIMAL_GW_INSPIRED_PVP_V1.combat.baseHealth,
  baseEnergyPips: 0,
};

/** Set 1 a sword (40 energy, a focus's worth over set 2), set 2 an axe, set 3 a bow, set 4 empty. */
function fighter(id: string, spawn: Vec2, extra?: Partial<ParticipantSpec>): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [FIREBALL, SWIFT_CHOP, SEVER_ARTERY],
    attributeRanks: new Map([
      ["warrior.axe-mastery", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: SWORD.equipment,
    maxEnergy: SWORD.maxEnergy,
    spareWeaponSets: [AXE, BOW, null],
    spawn,
    facing: 0,
    ...extra,
  };
}

/** A punching bag with one set, as every dummy has. */
function dummy(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn,
    facing: Math.PI,
  };
}

function sim(matchRules?: MatchRules, ...more: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "weapon-sets",
    matchRules,
    participants: [fighter("a", vec2(0, 0)), dummy("d", vec2(40, 0)), ...more],
  });
}

function get(match: MatchSimulation, id: string): Participant {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function weaponOf(match: MatchSimulation, id: string): string {
  return get(match, id).combatant.equipment.mainHand.weapon.id;
}

/** Step until `done`, at most `seconds`; the log of every step. */
function stepUntil(
  match: MatchSimulation,
  done: (log: readonly CombatLogEntry[]) => boolean,
  seconds = 10,
): CombatLogEntry[] {
  const all: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    const { log } = match.step(DT);
    all.push(...log);
    if (done(log)) {
      return all;
    }
  }
  throw new Error("never happened");
}

const blowOf =
  (weaponId: string) =>
  (log: readonly CombatLogEntry[]): boolean =>
    log.some(
      (entry) =>
        entry.cause === "weapon" &&
        entry.weaponId === weaponId &&
        entry.events.some((event) => event.kind === "damage"),
    );

/** Kill `id` in one tick, as burning would. */
function kill(match: MatchSimulation, id: string): void {
  const victim = get(match, id).combatant;
  victim.statuses.apply("burning", 10, "foe", NO_RANKS);
  victim.health = 0.2;
  match.step(DT);
  expect(victim.dead).toBe(true);
}

describe("weapon sets (#489)", () => {
  it("swaps at once with nothing in progress: the weapon, its interval and its reach", () => {
    const match = sim();
    const a = get(match, "a");
    expect(weaponOf(match, "a")).toBe("sword");
    expect(match.requestWeaponSet("a", 2)).toEqual({ kind: "swapped" });
    expect(a.activeWeaponSet).toBe(2);
    expect(weaponOf(match, "a")).toBe("recurve-bow");
    expect(swingIntervalSeconds(a.combatant)).toBe(WEAPONS["recurve-bow"].attackIntervalSeconds);
    expect(a.combatant.equipment.mainHand.weapon.range).toBe(WEAPONS["recurve-bow"].range);
  });

  it("gives an axe skill to the axe set and takes the sword's away", () => {
    const match = sim();
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: false, reason: "wrong-weapon" });
    expect(match.requestWeaponSet("a", 1)).toEqual({ kind: "swapped" });
    expect(match.requestSkill("a", 2)?.check).toEqual({ ok: false, reason: "wrong-weapon" });
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: true });
  });

  it("waits for a cast and its aftercast, and swaps the tick both end", () => {
    const match = sim();
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    match.step(DT);
    const { cast } = get(match, "a").combatant;
    expect(cast.isCasting).toBe(true);
    expect(match.requestWeaponSet("a", 1)).toEqual({ kind: "queued" });
    while (cast.isCasting || cast.inAftercast) {
      expect(get(match, "a").activeWeaponSet).toBe(0);
      match.step(DT);
    }
    expect(get(match, "a").activeWeaponSet).toBe(1);
    expect(get(match, "a").pendingWeaponSet).toBeUndefined();
  });

  it("lets a blow begun land with the old weapon, then swings the new one a full interval later", () => {
    const match = sim();
    match.requestAttack("a", "d");
    match.step(DT);
    expect(match.requestWeaponSet("a", 1)).toEqual({ kind: "queued" });
    stepUntil(match, blowOf("sword"));
    expect(weaponOf(match, "a")).toBe("axe");
    const swappedAt = match.elapsedSeconds;
    stepUntil(match, blowOf("axe"));
    expect(match.elapsedSeconds - swappedAt).toBeCloseTo(WEAPONS.axe.attackIntervalSeconds, 1);
  });

  it("waits for a knocked-down body to stand", () => {
    const match = sim();
    const a = get(match, "a");
    a.combatant.knockdownRemaining = 1;
    expect(match.requestWeaponSet("a", 1)).toEqual({ kind: "queued" });
    while (a.combatant.knockdownRemaining > 0) {
      expect(a.activeWeaponSet).toBe(0);
      match.step(DT);
    }
    match.step(DT);
    expect(a.activeWeaponSet).toBe(1);
  });

  it("swaps at once when moving or Esc ends the attack it waited for", () => {
    for (const end of [
      (match: MatchSimulation) => {
        match.cancelAction("a");
      },
      (match: MatchSimulation) => {
        match.setInputDirection("a", vec2(-1, 0));
      },
    ]) {
      const match = sim();
      match.requestAttack("a", "d");
      match.step(DT);
      match.step(DT);
      expect(match.requestWeaponSet("a", 1)).toEqual({ kind: "queued" });
      end(match);
      match.step(DT);
      expect(get(match, "a").activeWeaponSet).toBe(1);
    }
  });

  it("replaces a queued swap with the next press, and drops it on the active set's key", () => {
    const match = sim();
    const a = get(match, "a");
    match.requestAttack("a", "d");
    match.step(DT);
    expect(match.requestWeaponSet("a", 1)).toEqual({ kind: "queued" });
    expect(match.requestWeaponSet("a", 2)).toEqual({ kind: "queued" });
    expect(a.pendingWeaponSet).toBe(2);
    expect(match.requestWeaponSet("a", 0)).toEqual({ kind: "kept" });
    expect(a.pendingWeaponSet).toBeUndefined();
    stepUntil(match, blowOf("sword"));
    expect(a.activeWeaponSet).toBe(0);
  });

  it("moves maximum and current energy by the sets' difference, there and back, at any morale", () => {
    const rules: MatchRules = {
      victory: "kill-count",
      scoreToWin: 99,
      timeLimitSeconds: 600,
      deathRule: "respawn",
      respawnSeconds: 1,
      deathPenalty: true,
    };
    for (const deaths of [0, 1]) {
      const match = sim(rules);
      const a = get(match, "a").combatant;
      for (let i = 0; i < deaths; i += 1) {
        kill(match, "a");
        stepUntil(match, () => !a.dead);
      }
      expect(a.morale).toBe(deaths === 0 ? 0 : -15);
      a.energy = 20;
      const sword = moraleMaximum(BASE_ENERGY, SWORD.maxEnergy, a.morale);
      const axe = moraleMaximum(BASE_ENERGY, AXE.maxEnergy, a.morale);
      expect(a.maxEnergy).toBe(sword);
      match.requestWeaponSet("a", 1);
      expect(a.maxEnergy).toBe(axe);
      expect(a.energy).toBe(20 - (sword - axe));
      match.requestWeaponSet("a", 0);
      expect(a.maxEnergy).toBe(sword);
      expect(a.energy).toBe(20);
    }
  });

  it("moves health by the sets' difference in maximum, but never below 1 (#2007)", () => {
    const base = MINIMAL_GW_INSPIRED_PVP_V1.combat.baseHealth;
    // Set 1's sword carries of Fortitude: +30 Health while it is in hand.
    const match = new MatchSimulation({
      seed: "weapon-sets",
      participants: [
        fighter("a", vec2(0, 0), {
          maxHealth: base + 30,
          spareWeaponSets: [AXE, { ...AXE, baseEnergyPips: 3 }, null],
        }),
      ],
    });
    const a = get(match, "a").combatant;
    a.health = 100;
    match.requestWeaponSet("a", 1);
    expect(a.maxHealth).toBe(base);
    expect(a.health).toBe(70);
    match.requestWeaponSet("a", 0);
    expect(a.maxHealth).toBe(base + 30);
    expect(a.health).toBe(100);
    a.health = 20;
    match.requestWeaponSet("a", 1);
    expect(a.health).toBe(1);
    // Regeneration is the set's too.
    expect(a.baseEnergyPips).toBe(0);
    match.requestWeaponSet("a", 2);
    expect(a.baseEnergyPips).toBe(3);
  });

  it("owes the health a swap's floor held back, so swapping down and up is never a heal (#2007)", () => {
    const base = MINIMAL_GW_INSPIRED_PVP_V1.combat.baseHealth;
    const match = new MatchSimulation({
      seed: "weapon-sets",
      participants: [
        fighter("a", vec2(0, 0), { maxHealth: base + 30, spareWeaponSets: [AXE, null, null] }),
      ],
    });
    const a = get(match, "a").combatant;
    a.health = 20;
    for (let round = 0; round < 5; round += 1) {
      match.requestWeaponSet("a", 1);
      expect(a.health).toBe(1);
      match.requestWeaponSet("a", 0);
      expect(a.health).toBe(20);
    }
    // 20 - 30 is -10, so the floor held back 11; a heal while down counts.
    match.requestWeaponSet("a", 1);
    a.health = 11;
    match.requestWeaponSet("a", 0);
    expect(a.health).toBe(30);
  });

  it("hides energy below 0, which regeneration climbs back through before a skill is paid", () => {
    const match = sim(undefined);
    const a = get(match, "a");
    a.combatant.energy = 5;
    match.requestWeaponSet("a", 1);
    expect(a.combatant.energy).toBe(5 - (SWORD.maxEnergy - AXE.maxEnergy));
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 1)?.check).toEqual({
      ok: false,
      reason: "insufficient-energy",
    });
    // No regeneration of its own: nothing a floor may push up.
    match.step(DT);
    expect(a.combatant.energy).toBe(-7);
  });

  it("climbs from hidden energy as regeneration runs, and pays only once it is enough", () => {
    const match = new MatchSimulation({
      seed: "weapon-sets",
      participants: [
        fighter("a", vec2(0, 0), {
          baseEnergyPips: 4,
          spareWeaponSets: [{ ...AXE, baseEnergyPips: 4 }, BOW, null],
        }),
        dummy("d", vec2(40, 0)),
      ],
    });
    const a = get(match, "a").combatant;
    a.energy = 5;
    match.requestWeaponSet("a", 1);
    expect(a.energy).toBe(-7);
    match.step(DT);
    expect(a.energy).toBeGreaterThan(-7);
    expect(a.energy).toBeLessThan(0);
    match.setTarget("a", "d");
    stepUntil(match, () => a.energy >= 5, 60);
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: true });
  });

  it("lands an arrow loosed before a swap with the bow", () => {
    const match = new MatchSimulation({
      seed: "weapon-sets",
      participants: [fighter("a", vec2(0, 0)), dummy("d", vec2(300, 0))],
    });
    match.requestWeaponSet("a", 2);
    match.requestAttack("a", "d");
    match.step(DT);
    expect(match.requestWeaponSet("a", 0)).toEqual({ kind: "queued" });
    // Loosed, and the sword in hand the same tick, before the arrow lands.
    const loosing = stepUntil(match, () => weaponOf(match, "a") === "sword");
    expect(blowOf("recurve-bow")(loosing)).toBe(false);
    stepUntil(match, blowOf("recurve-bow"), 1);
  });

  it("drops a queued swap on death, and respawns holding the set it died with", () => {
    const rules: MatchRules = {
      victory: "kill-count",
      scoreToWin: 99,
      timeLimitSeconds: 600,
      deathRule: "respawn",
      respawnSeconds: 1,
      deathPenalty: false,
    };
    const match = sim(rules);
    const a = get(match, "a");
    match.requestWeaponSet("a", 1);
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    match.step(DT);
    expect(match.requestWeaponSet("a", 0)).toEqual({ kind: "queued" });
    kill(match, "a");
    expect(a.pendingWeaponSet).toBeUndefined();
    stepUntil(match, () => !a.combatant.dead);
    expect(a.activeWeaponSet).toBe(1);
    expect(a.combatant.energy).toBe(AXE.maxEnergy);
  });

  it("refuses the dead, an empty set, a dummy's set 4 and a set past 4", () => {
    const match = sim();
    expect(match.requestWeaponSet("a", 3)).toEqual({ kind: "refused", reason: "empty-set" });
    expect(match.requestWeaponSet("d", 3)).toEqual({ kind: "refused", reason: "empty-set" });
    expect(match.requestWeaponSet("a", 6)).toEqual({ kind: "refused", reason: "no-such-set" });
    expect(match.requestWeaponSet("nobody", 1)).toBeUndefined();
    kill(match, "a");
    expect(match.requestWeaponSet("a", 1)).toEqual({ kind: "refused", reason: "dead" });
    expect(get(match, "a").activeWeaponSet).toBe(0);
  });
});
