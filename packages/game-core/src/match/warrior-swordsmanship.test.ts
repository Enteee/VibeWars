import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { BASE_ENERGY_PIPS_BY_PROFESSION } from "../equipment/armor.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { chargeAdrenaline, strikesOf } from "../skills/testing.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The Swordsmanship staples in a match (#1354): Pure Strike's block, Gash
 * on a bleeding foe, Final Thrust below half, Savage Slash's interrupt,
 * Hundred Blades' splash and Dragon Slash's adrenaline.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const PURE_STRIKE = "warrior.pure-strike";
const GASH = "warrior.gash";
const FINAL_THRUST = "warrior.final-thrust";
const SAVAGE_SLASH = "warrior.savage-slash";
const HUNDRED_BLADES = "warrior.hundred-blades";
const DRAGON_SLASH = "warrior.dragon-slash";
const GALRATH_SLASH = "warrior.galrath-slash";
const EMPATHY = "mesmer.empathy";
const DEFENSIVE_ANTHEM = "paragon.defensive-anthem";
const BAR = [
  PURE_STRIKE,
  GASH,
  FINAL_THRUST,
  SAVAGE_SLASH,
  HUNDRED_BLADES,
  DRAGON_SLASH,
  GALRATH_SLASH,
];

function wielding(weapon: "sword" | "axe"): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS[weapon],
      attributeId: weapon === "sword" ? "warrior.swordsmanship" : "warrior.axe-mastery",
      damageType: WEAPONS[weapon].damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  weapon: "sword" | "axe" = "sword",
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: team === 0 ? BAR : [EMPATHY, DEFENSIVE_ANTHEM],
    attributeRanks: new Map([
      ["warrior.swordsmanship", 12],
      ["mesmer.domination-magic", 12],
      ["paragon.leadership", 12],
    ]),
    equipment: wielding(weapon),
    spawn,
    facing: 0,
    baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION.warrior,
  };
}

/**
 * Warrior `w` at the origin, its target foe `t` adjacent. `crowd`: foe
 * `side` adjacent too, and foe `far` at twice adjacent.
 */
function arena(seed: string, weapon: "sword" | "axe" = "sword", crowd = false): MatchSimulation {
  const sim = new MatchSimulation({
    seed,
    participants: [
      spec("w", 0, vec2(0, 0), weapon),
      spec("t", 1, vec2(AREA_ADJACENT - 10, 0)),
      ...(crowd
        ? [spec("side", 1, vec2(0, AREA_ADJACENT - 10)), spec("far", 1, vec2(2 * AREA_ADJACENT, 0))]
        : []),
    ],
  });
  for (const participant of sim.participants()) {
    participant.combatant.maxHealth = 1000;
    participant.combatant.health = 1000;
  }
  sim.setTarget("w", "t");
  return sim;
}

function combatant(sim: MatchSimulation, id: string) {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Use `w`'s `skillId` and step until it resolves: its log entry. */
function use(sim: MatchSimulation, skillId: string): CombatLogEntry {
  expect(sim.requestSkill("w", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  for (let tick = 0; tick < 3 / DT; tick += 1) {
    const entry = sim.step(DT).log.find((logged) => logged.skillId === skillId);
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

const damageTo = (entry: CombatLogEntry, targetId: string): number =>
  entry.events.reduce(
    (sum, event) =>
      event.kind === "damage" && event.targetId === targetId ? sum + event.amount : sum,
    0,
  );

const blocked = (entry: CombatLogEntry): boolean =>
  entry.events.some(({ kind }) => kind === "attack-blocked");

describe("Pure Strike (#1354)", () => {
  it("is never blocked out of a stance, even by Gladiator's Defense", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const sim = arena(`pure-${String(seed)}`);
      combatant(sim, "t").statuses.apply("gladiators-defense", 10, "t", NO_RANKS);
      expect(blocked(use(sim, PURE_STRIKE)), `seed ${String(seed)}`).toBe(false);
    }
  });

  it("can be blocked while its user is in a stance", () => {
    const blocks = Array.from({ length: 50 }, (_, seed) => {
      const sim = arena(`pure-${String(seed)}`);
      combatant(sim, "t").statuses.apply("gladiators-defense", 10, "t", NO_RANKS);
      combatant(sim, "w").statuses.apply("balanced-stance", 10, "w", NO_RANKS);
      return blocked(use(sim, PURE_STRIKE));
    });
    expect(blocks).toContain(true);
  });
});

describe("Gash (#1354)", () => {
  it("on a bleeding foe deals 17 more and inflicts a Deep Wound; on a clean one neither", () => {
    const clean = arena("gash");
    chargeAdrenaline(combatant(clean, "w"), GASH);
    const plain = use(clean, GASH);
    const bleeding = arena("gash");
    combatant(bleeding, "t").statuses.apply("bleeding", 20, "w", NO_RANKS);
    chargeAdrenaline(combatant(bleeding, "w"), GASH);
    const wounding = use(bleeding, GASH);
    expect(damageTo(plain, "t")).toBeGreaterThan(0);
    expect(damageTo(wounding, "t") - damageTo(plain, "t")).toBe(17);
    expect(combatant(clean, "t").statuses.has("deep-wound")).toBe(false);
    expect(combatant(bleeding, "t").statuses.has("deep-wound")).toBe(true);
  });
});

describe("Final Thrust (#1354)", () => {
  function thrust(health: number): CombatLogEntry {
    const sim = arena("thrust");
    combatant(sim, "t").health = health;
    chargeAdrenaline(combatant(sim, "w"), FINAL_THRUST);
    return use(sim, FINAL_THRUST);
  }

  it("deals 33 more to a foe below half Health than above it, and none more at half", () => {
    expect(damageTo(thrust(400), "t") - damageTo(thrust(600), "t")).toBe(33);
    expect(damageTo(thrust(500), "t")).toBe(damageTo(thrust(600), "t"));
  });

  it("drains all adrenaline though it is blocked", () => {
    // Guardian, not Gladiator's Defense: its damage back would charge some.
    for (let seed = 0; seed < 50; seed += 1) {
      const sim = arena(`thrust-${String(seed)}`);
      combatant(sim, "t").statuses.apply("guardian", 10, "t", NO_RANKS);
      const w = combatant(sim, "w");
      chargeAdrenaline(w, FINAL_THRUST, GASH, GALRATH_SLASH);
      if (blocked(use(sim, FINAL_THRUST))) {
        expect([FINAL_THRUST, GASH, GALRATH_SLASH].map((id) => strikesOf(w, id))).toEqual([
          0, 0, 0,
        ]);
        return;
      }
    }
    throw new Error("Guardian never blocked Final Thrust");
  });
});

describe("Savage Slash (#1354)", () => {
  /** `t` starts `slot` at `w`, then `w` slashes it mid-activation. */
  function slash(slot: number): { entry: CombatLogEntry; plain: CombatLogEntry } {
    const quiet = arena("savage");
    const plain = use(quiet, SAVAGE_SLASH);
    const sim = arena("savage");
    sim.setTarget("t", "w");
    expect(sim.requestSkill("t", slot)?.check).toEqual({ ok: true });
    sim.step(DT);
    return { entry: use(sim, SAVAGE_SLASH), plain };
  }

  it("interrupts a spell and deals 32 more", () => {
    const { entry, plain } = slash(0);
    expect(entry.events).toContainEqual({ kind: "interrupted", targetId: "t", skillId: EMPATHY });
    expect(damageTo(entry, "t") - damageTo(plain, "t")).toBe(32);
  });

  it("interrupts a chant, with no more damage", () => {
    const { entry, plain } = slash(1);
    expect(entry.events).toContainEqual({
      kind: "interrupted",
      targetId: "t",
      skillId: DEFENSIVE_ANTHEM,
    });
    expect(damageTo(entry, "t")).toBe(damageTo(plain, "t"));
  });
});

describe("Hundred Blades (#1354)", () => {
  /** `w` uses Hundred Blades, waits `wait` s, then swings at `t` until it has swung once. */
  function swing(weapon: "sword" | "axe", wait = 0): CombatLogEntry[] {
    const sim = arena("blades", weapon, true);
    use(sim, HUNDRED_BLADES);
    expect(combatant(sim, "w").statuses.get("hundred-blades")?.remainingSeconds).toBeCloseTo(15, 1);
    for (let tick = 0; tick < wait / DT; tick += 1) {
      sim.step(DT);
    }
    expect(sim.requestAttack("w", "t")?.ok).toBe(true);
    for (let tick = 0; tick < 4 / DT; tick += 1) {
      const { log } = sim.step(DT);
      if (log.some(({ weaponId }) => weaponId !== undefined)) {
        return log.filter(({ skillId }) => skillId === HUNDRED_BLADES);
      }
    }
    throw new Error("w never swung");
  }

  it("a sword swing deals 26 slashing to every adjacent foe, none to one farther off", () => {
    const fired = swing("sword");
    expect(fired).toHaveLength(1);
    const [entry] = fired;
    if (entry === undefined) {
      throw new Error("no splash");
    }
    const hit = entry.events.flatMap((event) => (event.kind === "damage" ? [event] : []));
    expect(hit.map(({ targetId }) => targetId).sort()).toEqual(["side", "t"]);
    expect(damageTo(entry, "t")).toBe(26);
    expect(damageTo(entry, "side")).toBe(26);
  });

  it("an axe swing sets off none", () => {
    expect(swing("axe")).toEqual([]);
  });

  it("is gone after 15 s", () => {
    expect(swing("sword", 15.5)).toEqual([]);
  });
});

describe("Dragon Slash (#1354)", () => {
  /** Strikes `w`'s Final Thrust holds after `skillId` hits `t`, or misses it if `blind`. */
  function strikesAfter(skillId: string, blind = false): number {
    for (let seed = 0; seed < 50; seed += 1) {
      const sim = arena(`dragon-${String(seed)}`);
      const w = combatant(sim, "w");
      chargeAdrenaline(w, skillId);
      if (blind) {
        w.statuses.apply("blind", 10, "t", NO_RANKS);
      }
      const entry = use(sim, skillId);
      const missed = entry.events.some(({ kind }) => kind === "attack-missed");
      if (missed === blind) {
        return strikesOf(w, FINAL_THRUST);
      }
    }
    throw new Error(`${skillId} never ${blind ? "missed" : "hit"}`);
  }

  it("gains 4 strikes of adrenaline on a hit more than Galrath Slash's", () => {
    expect(strikesAfter(DRAGON_SLASH) - strikesAfter(GALRATH_SLASH)).toBe(4);
  });

  it("gains none on a miss", () => {
    expect(strikesAfter(DRAGON_SLASH, true)).toBe(0);
  });
});
