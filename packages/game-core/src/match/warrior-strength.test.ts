import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import {
  unarmedResolvedEquipment,
  type ResolvedEquipment,
  type ResolvedLoadout,
} from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { chargeAdrenaline } from "../skills/testing.js";
import { effectiveMaxHealth, raisedMaxHealth } from "../skills/tick.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The Strength staples in a match (#1359): Bull's Strike on a moving foe,
 * Griffon's Sweep blocked, Dolyak Signet's footing, Endure Pain's
 * maximum, Warrior's Endurance's capped energy and Rush's adrenaline.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BULLS_STRIKE = "warrior.bulls-strike";
const GRIFFONS_SWEEP = "warrior.griffons-sweep";
const DOLYAK_SIGNET = "warrior.dolyak-signet";
const ENDURE_PAIN = "warrior.endure-pain";
const WARRIORS_ENDURANCE = "warrior.warriors-endurance";
const RUSH = "warrior.rush";
const HAMMER_BASH = "warrior.hammer-bash";
const BAR = [
  BULLS_STRIKE,
  GRIFFONS_SWEEP,
  DOLYAK_SIGNET,
  ENDURE_PAIN,
  WARRIORS_ENDURANCE,
  RUSH,
  HAMMER_BASH,
];

type Wielded = "sword" | "hammer" | "longbow";

function wielding(weapon: Wielded): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS[weapon],
      attributeId:
        weapon === "sword"
          ? "warrior.swordsmanship"
          : weapon === "hammer"
            ? "warrior.hammer-mastery"
            : "ranger.marksmanship",
      damageType: WEAPONS[weapon].damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** No energy regeneration, so only a gain moves a bar. */
function spec(id: string, team: number, spawn: Vec2, weapon: Wielded = "sword"): ParticipantSpec {
  return {
    id,
    team,
    skillBar: BAR,
    attributeRanks: new Map([
      ["warrior.strength", 12],
      ["warrior.swordsmanship", 12],
      ["warrior.hammer-mastery", 12],
    ]),
    equipment: wielding(weapon),
    spawn,
    facing: 0,
    baseEnergyPips: 0,
  };
}

/** Warrior `w` at the origin, its target foe `t` adjacent, each 1000 Health. */
function arena(seed: string, weapon: Wielded = "sword"): MatchSimulation {
  const sim = new MatchSimulation({
    seed,
    participants: [spec("w", 0, vec2(0, 0), weapon), spec("t", 1, vec2(AREA_ADJACENT - 10, 0))],
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

/**
 * `user` uses `skillId` and steps until it resolves: its log entry.
 * `before` runs ahead of every step.
 */
function use(
  sim: MatchSimulation,
  skillId: string,
  user = "w",
  before: () => void = () => undefined,
): CombatLogEntry {
  expect(sim.requestSkill(user, BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  for (let tick = 0; tick < 3 / DT; tick += 1) {
    before();
    const entry = sim.step(DT).log.find((logged) => logged.skillId === skillId);
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < seconds / DT; tick += 1) {
    sim.step(DT);
  }
}

const damageTo = (entry: CombatLogEntry, targetId: string): number =>
  entry.events.reduce(
    (sum, event) =>
      event.kind === "damage" && event.targetId === targetId ? sum + event.amount : sum,
    0,
  );

const knockedDown = (entry: CombatLogEntry, targetId: string): boolean =>
  entry.events.some((event) => event.kind === "knocked-down" && event.targetId === targetId);

describe("Bull's Strike (#1359)", () => {
  it("knocks down a moving foe and deals 25 more; a standing one, neither", () => {
    const still = arena("bull");
    const plain = use(still, BULLS_STRIKE);
    const moving = arena("bull");
    // Read as the blow lands: `t` is moving then, though it stands put.
    const struck = use(moving, BULLS_STRIKE, "w", () => {
      combatant(moving, "t").moving = true;
    });
    expect(damageTo(plain, "t")).toBeGreaterThan(0);
    expect(damageTo(struck, "t") - damageTo(plain, "t")).toBe(25);
    expect(combatant(still, "t").knockdownRemaining).toBe(0);
    expect(combatant(moving, "t").knockdownRemaining).toBeGreaterThan(0);
  });

  it("knocks down a foe that walks past", () => {
    const sim = arena("bull-walk");
    sim.setInputDirection("t", vec2(0, 1));
    sim.step(DT);
    expect(combatant(sim, "t").moving).toBe(true);
    use(sim, BULLS_STRIKE);
    expect(combatant(sim, "t").knockdownRemaining).toBeGreaterThan(0);
  });
});

describe("Griffon's Sweep (#1359)", () => {
  it("blocked by Gladiator's Defense, knocks its target down and deals it 29", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const sim = arena(`griffon-${String(seed)}`);
      combatant(sim, "t").statuses.apply("gladiators-defense", 10, "t", NO_RANKS);
      const entry = use(sim, GRIFFONS_SWEEP);
      if (entry.events.some(({ kind }) => kind === "attack-blocked")) {
        expect(combatant(sim, "t").knockdownRemaining).toBeGreaterThan(0);
        expect(damageTo(entry, "t")).toBe(29);
        return;
      }
    }
    throw new Error("Gladiator's Defense never blocked Griffon's Sweep");
  });
});

describe("Dolyak Signet (#1359)", () => {
  it("a Hammer Bash does not knock its bearer down", () => {
    const sim = new MatchSimulation({
      seed: "dolyak",
      participants: [spec("w", 0, vec2(0, 0), "hammer"), spec("t", 1, vec2(AREA_ADJACENT - 10, 0))],
    });
    sim.setTarget("w", "t");
    use(sim, DOLYAK_SIGNET, "t");
    expect(combatant(sim, "t").statuses.has("dolyak-signet")).toBe(true);
    chargeAdrenaline(combatant(sim, "w"), HAMMER_BASH);
    const entry = use(sim, HAMMER_BASH);
    expect(damageTo(entry, "t")).toBeGreaterThan(0);
    expect(combatant(sim, "t").knockdownRemaining).toBe(0);
    expect(knockedDown(entry, "t")).toBe(false);
  });

  it("slows its bearer to a quarter of a walker's speed", () => {
    const sim = new MatchSimulation({
      seed: "dolyak-walk",
      participants: [spec("slow", 0, vec2(0, 0)), spec("fast", 0, vec2(0, 300))],
    });
    use(sim, DOLYAK_SIGNET, "slow");
    const from = (id: string): Vec2 => {
      const at = sim.get(id)?.position;
      if (at === undefined) {
        throw new Error(`no participant ${id}`);
      }
      return { ...at };
    };
    const slowFrom = from("slow");
    const fastFrom = from("fast");
    sim.setInputDirection("slow", vec2(1, 0));
    sim.setInputDirection("fast", vec2(1, 0));
    stepFor(sim, 1);
    const ratio = distance(from("slow"), slowFrom) / distance(from("fast"), fastFrom);
    expect(ratio).toBeCloseTo(0.25, 2);
  });
});

describe("Endure Pain (#1359)", () => {
  it("raises maximum and current Health by 258, and after 16 s takes back only the extra", () => {
    const sim = arena("endure");
    const w = combatant(sim, "w");
    use(sim, ENDURE_PAIN);
    expect(raisedMaxHealth(w)).toBe(1258);
    expect(w.health).toBe(1258);
    stepFor(sim, 16.5);
    expect(w.statuses.has("endure-pain")).toBe(false);
    expect(effectiveMaxHealth(w)).toBe(1000);
    expect(w.health).toBe(1000);
  });

  it("ending, takes nothing from a bearer below the normal maximum", () => {
    const sim = arena("endure-low");
    const w = combatant(sim, "w");
    use(sim, ENDURE_PAIN);
    w.health = 600;
    stepFor(sim, 16.5);
    expect(w.statuses.has("endure-pain")).toBe(false);
    expect(w.dead).toBe(false);
    expect(w.health).toBeGreaterThanOrEqual(600);
    expect(w.health).toBeLessThanOrEqual(1000);
  });

  it("rearmed at full raised health, comes back at the new maximum, not above it", () => {
    const sim = arena("endure-rearm");
    use(sim, ENDURE_PAIN);
    const loadout: ResolvedLoadout = {
      attributeRanks: new Map([["warrior.strength", 12]]),
      weaponSets: [
        { equipment: wielding("sword"), maxEnergy: 30, maxHealth: 600, baseEnergyPips: 4 },
        null,
        null,
        null,
      ],
    };
    sim.rearm("w", loadout, []);
    expect(combatant(sim, "w").health).toBe(600);
  });
});

describe("Warrior's Endurance (#1359)", () => {
  /**
   * `w` takes up Warrior's Endurance at `energy` of `maxEnergy`, then
   * swings at `t` until it has hit `hits` times.
   */
  function hitsFrom(weapon: Wielded, energy: number, hits: number, maxEnergy = 50): number {
    const sim = arena(`endurance-${weapon}`, weapon);
    const w = combatant(sim, "w");
    use(sim, WARRIORS_ENDURANCE);
    w.maxEnergy = maxEnergy;
    w.energy = energy;
    expect(sim.requestAttack("w", "t")?.ok).toBe(true);
    let landed = 0;
    for (let tick = 0; tick < 20 / DT && landed < hits; tick += 1) {
      for (const entry of sim.step(DT).log) {
        if (entry.weaponId !== undefined && damageTo(entry, "t") > 0) {
          landed += 1;
        }
      }
    }
    expect(landed).toBe(hits);
    return w.energy;
  }

  it("a sword hit from 40 of 50 Energy gives the full 3 (#1395)", () => {
    expect(hitsFrom("sword", 40, 1)).toBe(43);
  });

  it("with energy runes, a hit from 54 takes it to 55, not 57", () => {
    expect(hitsFrom("sword", 54, 1, 60)).toBe(55);
  });

  it("with energy runes, a hit above 55 gives nothing", () => {
    expect(hitsFrom("sword", 58, 1, 60)).toBe(58);
  });

  it("a bow hit gains nothing", () => {
    expect(hitsFrom("longbow", 10, 1)).toBe(10);
  });
});

describe("Rush (#1359)", () => {
  it("needs 4 strikes of adrenaline, then makes its user move 25% faster", () => {
    const sim = arena("rush");
    const w = combatant(sim, "w");
    expect(sim.requestSkill("w", BAR.indexOf(RUSH))?.check.ok).toBe(false);
    chargeAdrenaline(w, RUSH);
    use(sim, RUSH);
    expect(w.statuses.get("rush")?.remainingSeconds).toBeCloseTo(18, 1);
  });
});
