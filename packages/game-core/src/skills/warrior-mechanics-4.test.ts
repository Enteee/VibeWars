import { describe, expect, it } from "vitest";

import { AREA_NEARBY, RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { fillPools, gainStrikes } from "./adrenaline.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { effectiveArmor, skillDamage, type DamagePacket } from "./damage.js";
import type { CombatEvent } from "./effects.js";
import type { Skill } from "./types.js";
import { NO_RANKS } from "./status.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Warrior mechanics 4 (#2180): Disarm, Desperation Blow, Decapitate,
 * Battle Rage and "Shields Up!", each on a primitive of its own, at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const DISARM = "warrior.disarm";
const DESPERATION_BLOW = "warrior.desperation-blow";
const DECAPITATE = "warrior.decapitate";
const BATTLE_RAGE = "warrior.battle-rage";
const SHIELDS_UP = "warrior.shields-up";
const WATCH_YOURSELF = "warrior.watch-yourself";
const POWER_ATTACK = "warrior.power-attack";
const HEALING_SIGNET = "warrior.healing-signet";
const EVISCERATE = "warrior.eviscerate";
const BAR = [DISARM, DESPERATION_BLOW, DECAPITATE, BATTLE_RAGE, SHIELDS_UP, WATCH_YOURSELF];
const CONDITIONS = ["deep-wound", "weakness", "bleeding", "crippled"] as const;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
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

const AXE = wielding(WEAPONS.axe, "warrior.axe-mastery");
const SWORD = wielding(WEAPONS.sword, "warrior.swordsmanship");
const BOW = wielding(WEAPONS.longbow, "ranger.marksmanship");

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** `w`, a rank-12 Warrior with `BAR` and `equipment`, at the origin. */
function warrior(equipment: ResolvedEquipment): ParticipantSpec {
  return spec("w", 0, vec2(0, 0), {
    skillBar: BAR,
    attributeRanks: new Map([
      ["warrior.strength", 12],
      ["warrior.axe-mastery", 12],
      ["warrior.swordsmanship", 12],
      ["warrior.tactics", 12],
    ]),
    equipment,
  });
}

/** `w` with its adrenaline full; `f`, its foe, in reach east unless `more` places it. */
function match(
  equipment: ResolvedEquipment,
  more: readonly ParticipantSpec[] = [],
  seed = "warrior-mechanics-4",
) {
  const participants = [warrior(equipment), ...more];
  if (!more.some((participant) => participant.id === "f")) {
    participants.push(spec("f", 1, vec2(RANGE_MELEE / 2, 0)));
  }
  const sim = new MatchSimulation({ seed, ruleset: NO_CRIT, participants });
  gainStrikes(get(sim, "w").combatant, 8, 0);
  return sim;
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `w` uses `skillId` on `f`, `meanwhile` run before each step: what its skill logged until it landed. */
function used(sim: MatchSimulation, skillId: string, meanwhile?: () => void): CombatEvent[] {
  sim.setTarget("w", "f");
  expect(sim.requestSkill("w", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    meanwhile?.();
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "w" && entry.skillId === skillId)
      .flatMap((entry) => entry.events);
    if (logged.length > 0) {
      return logged;
    }
  }
  throw new Error(`${skillId} never landed`);
}

function steps(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

function disabledFor(events: readonly CombatEvent[], targetId: string): string[] {
  return events.flatMap((event) =>
    event.kind === "skill-disabled" && event.targetId === targetId ? [event.skillId] : [],
  );
}

describe("Disarm (#2180): interrupted-attack, disable-skill attacks", () => {
  /**
   * `f`, a swordsman with Power Attack, Healing Signet and Eviscerate, in
   * reach of `w`. An interrupted Power Attack's own recharge outlasts the
   * disable, so Eviscerate is the one that shows it.
   */
  const foe = spec("f", 1, vec2(RANGE_MELEE / 2, 0), {
    skillBar: [POWER_ATTACK, HEALING_SIGNET, EVISCERATE],
    equipment: SWORD,
  });

  it("interrupting a plain swing disables every attack skill of the foe's, 2 s at 12", () => {
    const sim = match(SWORD, [foe]);
    sim.requestAttack("f", "w");
    steps(sim, 0.3);
    const events = used(sim, DISARM);
    expect(events).toContainEqual({ kind: "attack-interrupted", targetId: "f" });
    expect(disabledFor(events, "f")).toEqual([POWER_ATTACK, EVISCERATE]);
    // 0...3: 2.4 at 12, a whole 2 as GW1's tables round it.
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "skill-disabled", skillId: POWER_ATTACK, seconds: 2 }),
    );
  });

  it("interrupting an attack skill counts as an attack too", () => {
    const sim = match(SWORD, [foe]);
    sim.setTarget("f", "w");
    const events = used(sim, DISARM, () => {
      if (!get(sim, "f").combatant.cast.isCasting) {
        sim.requestSkill("f", 0);
      }
    });
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "interrupted", targetId: "f", skillId: POWER_ATTACK }),
    );
    expect(disabledFor(events, "f")).toEqual([EVISCERATE]);
  });

  it("a foe using a non-attack skill is interrupted, and nothing is disabled", () => {
    const sim = match(SWORD, [foe]);
    const events = used(sim, DISARM, () => {
      if (!get(sim, "f").combatant.cast.isCasting) {
        sim.requestSkill("f", 1);
      }
    });
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "interrupted", targetId: "f", skillId: HEALING_SIGNET }),
    );
    expect(disabledFor(events, "f")).toEqual([]);
  });

  it("an idle foe: nothing to interrupt, nothing disabled", () => {
    const events = used(match(SWORD, [foe]), DISARM);
    expect(events.some((event) => event.kind === "interrupt-missed")).toBe(true);
    expect(disabledFor(events, "f")).toEqual([]);
  });

  it("reads as GW1 words it", () => {
    const lines = describeSkill(skill(DISARM), undefined, EN_WORDS, EN_NAMES).effects.map(
      ({ text }) => text,
    );
    expect(lines.join(" | ")).toContain("If that action was an attack");
    expect(lines.join(" | ")).toContain("all of the target's attack skills are disabled");
  });
});

describe("Desperation Blow (#2180): apply-random-status, knockdown on the caster", () => {
  /** Which of the four conditions the blow left on `f`, under `seed`. */
  function picked(seed: string): string[] {
    const sim = match(SWORD, [], seed);
    used(sim, DESPERATION_BLOW);
    const foe = get(sim, "f").combatant;
    return CONDITIONS.filter((id) => foe.statuses.has(id));
  }

  it("a hit: +34, exactly one of the four conditions, and you are knocked down", () => {
    const sim = match(SWORD);
    const events = used(sim, DESPERATION_BLOW);
    const foe = get(sim, "f").combatant;
    const lasting = { "deep-wound": 20, weakness: 20, bleeding: 25, crippled: 15 };
    const on = CONDITIONS.filter((id) => foe.statuses.has(id));
    expect(on.map((id) => [id, foe.statuses.get(id)?.durationSeconds])).toEqual(
      on.map((id) => [id, lasting[id]]),
    );
    expect(on).toHaveLength(1);
    expect(events).toContainEqual({ kind: "knocked-down", targetId: "w", durationSeconds: 2 });
    expect(get(sim, "w").combatant.knockdownRemaining).toBeGreaterThan(0);
    expect(foe.knockdownRemaining).toBe(0);
    expect(getSkill(DESPERATION_BLOW)?.attack?.bonusDamage).toEqual({
      scaling: { attributeId: "warrior.tactics", atZero: 10, atTwelve: 34 },
    });
  });

  it("the same seed picks the same condition; across seeds, all four appear", () => {
    expect(picked("same")).toEqual(picked("same"));
    const seen = new Set<string>();
    for (let i = 0; i < 40 && seen.size < 4; i += 1) {
      for (const id of picked(`seed-${String(i)}`)) {
        seen.add(id);
      }
    }
    expect([...seen].sort()).toEqual([...CONDITIONS].sort());
  });

  it("a miss: no condition, and you are knocked down all the same", () => {
    for (let i = 0; i < 20; i += 1) {
      const sim = match(SWORD, [], `blind-${String(i)}`);
      get(sim, "w").combatant.statuses.apply("blind", 1000, "f", NO_RANKS);
      const events = used(sim, DESPERATION_BLOW);
      if (!events.some((event) => event.kind === "attack-missed")) {
        continue;
      }
      const foe = get(sim, "f").combatant;
      expect(CONDITIONS.filter((id) => foe.statuses.has(id))).toEqual([]);
      expect(events).toContainEqual({ kind: "knocked-down", targetId: "w", durationSeconds: 2 });
      return;
    }
    throw new Error("blind never missed");
  });
});

describe("Decapitate (#2180): drain-own-energy, target-killed", () => {
  it("loses all adrenaline and all Energy, never blocked, always critical", () => {
    const sim = match(AXE);
    const w = get(sim, "w").combatant;
    // Gladiator's Defense: 75% to block; Decapitate is unblockable.
    get(sim, "f").combatant.statuses.apply("gladiators-defense", 1000, "f", NO_RANKS);
    const events = used(sim, DECAPITATE);
    expect(events.some((event) => event.kind === "attack-blocked")).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "damage", targetId: "f", critical: true }),
    );
    expect(w.energy).toBe(0);
    expect([...w.adrenaline.values()].every((units) => units === 0)).toBe(true);
    expect(get(sim, "f").combatant.statuses.get("deep-wound")?.durationSeconds).toBe(17);
  });

  it("fires with 0 Energy", () => {
    const sim = match(AXE);
    get(sim, "w").combatant.energy = 0;
    const events = used(sim, DECAPITATE);
    expect(events.some((event) => event.kind === "damage" && event.targetId === "f")).toBe(true);
  });

  it("a kill Weakens the foes near the target for 8 s, not the dead, not the far", () => {
    const sim = match(AXE, [
      spec("f", 1, vec2(RANGE_MELEE / 2, 0), { maxHealth: 50 }),
      spec("g", 1, vec2(RANGE_MELEE / 2 + AREA_NEARBY - 10, 0)),
      spec("h", 1, vec2(RANGE_MELEE / 2 + AREA_NEARBY + 50, 0)),
    ]);
    const events = used(sim, DECAPITATE);
    expect(events).toContainEqual({ kind: "death", targetId: "f" });
    expect(get(sim, "g").combatant.statuses.get("weakness")?.durationSeconds).toBe(8);
    expect(get(sim, "h").combatant.statuses.has("weakness")).toBe(false);
    expect(get(sim, "f").combatant.statuses.has("weakness")).toBe(false);
  });

  it("no kill: no Weakness", () => {
    const sim = match(AXE, [
      spec("f", 1, vec2(RANGE_MELEE / 2, 0)),
      spec("g", 1, vec2(RANGE_MELEE / 2 + 30, 0)),
    ]);
    used(sim, DECAPITATE);
    expect(get(sim, "g").combatant.statuses.has("weakness")).toBe(false);
  });
});

describe("Battle Rage (#2180): adrenaline faster from attacks, ends on a non-adrenal skill", () => {
  it("17 s at 12, 33% faster, double adrenaline from attacks only", () => {
    const sim = match(AXE);
    used(sim, BATTLE_RAGE);
    const w = get(sim, "w").combatant;
    expect(w.statuses.get("battle-rage")?.durationSeconds).toBe(17);
    w.adrenaline.set(DECAPITATE, 0);
    fillPools(w, ADRENALINE_PER_STRIKE);
    expect(w.adrenaline.get(DECAPITATE)).toBe(ADRENALINE_PER_STRIKE);
    w.adrenaline.set(DECAPITATE, 0);
    gainStrikes(w, 1, 0, true);
    expect(w.adrenaline.get(DECAPITATE)).toBe(2 * ADRENALINE_PER_STRIKE);
  });

  it("a blow while raging earns two strikes", () => {
    const sim = match(AXE);
    used(sim, BATTLE_RAGE);
    const w = get(sim, "w").combatant;
    w.adrenaline.set(DECAPITATE, 0);
    sim.requestAttack("w", "f");
    for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
      if (
        sim.step(DT).log.some((entry) => entry.sourceId === "w" && entry.weaponId !== undefined)
      ) {
        break;
      }
    }
    expect(w.adrenaline.get(DECAPITATE)).toBe(2 * ADRENALINE_PER_STRIKE);
  });

  it("an adrenal skill keeps it; an energy skill ends it", () => {
    const sim = match(AXE);
    used(sim, BATTLE_RAGE);
    const w = get(sim, "w").combatant;
    expect(w.statuses.has("battle-rage")).toBe(true);
    gainStrikes(w, 8, 0);
    used(sim, WATCH_YOURSELF);
    expect(w.statuses.has("battle-rage")).toBe(true);
    used(sim, SHIELDS_UP);
    expect(w.statuses.has("battle-rage")).toBe(false);
  });

  it("reads as GW1 words it", () => {
    const text = describeSkill(skill(BATTLE_RAGE), undefined, EN_WORDS, EN_NAMES)
      .effects.map((line) => line.text)
      .join(" ");
    expect(text).toContain("from attacks");
    expect(text).toContain("ends if you use a non-adrenal skill");
  });
});

describe('"Shields Up!" (#2180): armor vs projectile attacks', () => {
  const arrow: DamagePacket = {
    armored: 40,
    armorIgnoring: 0,
    type: "piercing",
    source: "weapon",
    armorPenetration: 0,
    projectile: true,
  };
  const { projectile: _, ...blade } = arrow;

  it("you and allies in earshot get +60 armor against projectile attacks, 10 s at 12", () => {
    const sim = match(AXE, [spec("a", 0, vec2(-100, 0)), spec("far", 0, vec2(-5000, 0))]);
    used(sim, SHIELDS_UP);
    for (const id of ["w", "a"]) {
      const bearer = get(sim, id).combatant;
      expect(bearer.statuses.get("shields-up")?.durationSeconds).toBe(10);
      expect(effectiveArmor(bearer, arrow, null) - effectiveArmor(bearer, blade, null)).toBe(60);
      expect(effectiveArmor(bearer, skillDamage(40, "fire", 0), null)).toBe(
        effectiveArmor(get(sim, "far").combatant, skillDamage(40, "fire", 0), null),
      );
    }
    expect(get(sim, "far").combatant.statuses.has("shields-up")).toBe(false);
  });

  it("an arrow hurts its bearer less; a second shout refreshes, never stacks", () => {
    /** What `f`'s first arrow dealt `w`, shielded or not. */
    const arrowDamage = (shielded: boolean): number => {
      const sim = match(AXE, [spec("f", 1, vec2(500, 0), { equipment: BOW })]);
      if (shielded) {
        used(sim, SHIELDS_UP);
      }
      sim.requestAttack("f", "w");
      for (let i = 0; i < 10 * RULES.tickRateHz; i += 1) {
        for (const entry of sim.step(DT).log) {
          for (const event of entry.events) {
            if (entry.sourceId === "f" && event.kind === "damage" && event.targetId === "w") {
              return event.amount;
            }
          }
        }
      }
      throw new Error("no arrow landed");
    };
    expect(arrowDamage(true)).toBeLessThan(arrowDamage(false));

    const sim = match(AXE);
    used(sim, SHIELDS_UP);
    steps(sim, 3);
    const w = get(sim, "w").combatant;
    w.cast.endRecharge(SHIELDS_UP);
    used(sim, SHIELDS_UP);
    expect(w.statuses.active.filter(({ id }) => id === "shields-up")).toHaveLength(1);
    expect(w.statuses.get("shields-up")?.remainingSeconds).toBeCloseTo(10, 5);
  });
});
