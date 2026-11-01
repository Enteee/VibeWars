import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { BASE_ENERGY_PIPS_BY_PROFESSION } from "../equipment/armor.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { chargeAdrenaline } from "../skills/testing.js";
import { KNOCKDOWN_SECONDS } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Warrior Hammer Mastery staples in a match (#1357): weakness into
 * knockdown, the knockdown-only riders, and the two elites. The hammer
 * always rolls its maximum and nothing crits, so two blows differ only by
 * what the skill adds.
 */

const NO_CRIT: Ruleset = {
  ...MINIMAL_GW_INSPIRED_PVP_V1,
  combat: { ...MINIMAL_GW_INSPIRED_PVP_V1.combat, criticalBaseChance: 0, criticalChancePerRank: 0 },
};
const DT = 1 / NO_CRIT.tickRateHz;

const BAR = [
  "warrior.mighty-blow",
  "warrior.crushing-blow",
  "warrior.irresistible-blow",
  "warrior.counter-blow",
  "warrior.heavy-blow",
  "warrior.staggering-blow",
  "warrior.earth-shaker",
  "warrior.devastating-hammer",
] as const;
type HammerSkill = (typeof BAR)[number];

const HAMMER: ResolvedEquipment = {
  ...unarmedResolvedEquipment(NO_CRIT.combat.armorReferenceLevel),
  mainHand: {
    weapon: { ...WEAPONS.hammer, damageMin: WEAPONS.hammer.damageMax },
    attributeId: "warrior.hammer-mastery",
    damageType: WEAPONS.hammer.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...BAR],
    attributeRanks: new Map([["warrior.hammer-mastery", 12]]),
    equipment: HAMMER,
    spawn,
    facing: 0,
    baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION.warrior,
  };
}

/** A foe of `w`'s with a 3 s spell on its bar, to be caught casting. */
function caster(id: string, spawn: Vec2): ParticipantSpec {
  return {
    ...spec(id, 1, spawn),
    skillBar: ["elementalist.fireball"],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(NO_CRIT.combat.armorReferenceLevel),
    baseEnergyPips: 0,
  };
}

/**
 * Warrior `w` at the origin, every pool and its energy full, beside its
 * target `t`; `others` around them.
 */
function arena(
  seed = "hammer",
  others: ParticipantSpec[] = [],
  target = spec("t", 1, vec2(AREA_ADJACENT - 10, 0)),
): MatchSimulation {
  const sim = new MatchSimulation({
    seed,
    ruleset: NO_CRIT,
    participants: [spec("w", 0, vec2(0, 0)), target, ...others],
  });
  for (const participant of sim.participants()) {
    participant.combatant.maxHealth = 1e6;
    participant.combatant.health = 1e6;
  }
  const warrior = combatant(sim, "w");
  warrior.energy = warrior.maxEnergy;
  chargeAdrenaline(warrior, ...BAR);
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
function swing(sim: MatchSimulation, skillId: HammerSkill): CombatLogEntry {
  expect(sim.requestSkill("w", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  for (let tick = 0; tick < 3 / DT; tick += 1) {
    const entry = sim.step(DT).log.find((logged) => logged.skillId === skillId);
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

/** Step `seconds`, so the next skill is not queued behind this one's aftercast. */
function wait(sim: MatchSimulation, seconds = 1): void {
  for (let tick = 0; tick < seconds / DT; tick += 1) {
    sim.step(DT);
  }
}

/** The damage `entry` dealt `targetId`, every packet summed. */
function damageTo(entry: CombatLogEntry, targetId: string): number {
  return entry.events.reduce(
    (sum, event) =>
      event.kind === "damage" && event.targetId === targetId ? sum + event.amount : sum,
    0,
  );
}

/** `t` suffers `statusId` with `seconds` left, less the tick or two since it landed. */
function expectLasting(
  sim: MatchSimulation,
  statusId: "weakness" | "deep-wound",
  seconds: number,
): void {
  const left = combatant(sim, "t").statuses.get(statusId)?.remainingSeconds ?? 0;
  expect(left).toBeLessThanOrEqual(seconds);
  expect(left).toBeGreaterThan(seconds - 2 * DT);
}

const down = (sim: MatchSimulation, id: string): boolean =>
  combatant(sim, id).knockdownRemaining > 0;

describe("Heavy Blow and Staggering Blow (#1357)", () => {
  it("Staggering Blow weakens for 17 s; then Heavy Blow knocks down and strikes for +24", () => {
    const plain = damageTo(swing(arena(), "warrior.heavy-blow"), "t");
    const sim = arena();
    swing(sim, "warrior.staggering-blow");
    expectLasting(sim, "weakness", 17);
    wait(sim);
    chargeAdrenaline(combatant(sim, "w"), "warrior.heavy-blow");
    const entry = swing(sim, "warrior.heavy-blow");
    expect(down(sim, "t")).toBe(true);
    expect(damageTo(entry, "t") - plain).toBe(24);
  });

  it("alone, it neither knocks down nor adds, and still empties every pool", () => {
    const sim = arena();
    swing(sim, "warrior.heavy-blow");
    expect(down(sim, "t")).toBe(false);
    expect([...combatant(sim, "w").adrenaline.values()].every((units) => units === 0)).toBe(true);
  });
});

describe("Counter Blow (#1357)", () => {
  it("knocks down a foe mid-attack", () => {
    const sim = arena();
    expect(sim.requestAttack("t", "w")).toEqual({ ok: true });
    wait(sim, 0.1);
    swing(sim, "warrior.counter-blow");
    expect(down(sim, "t")).toBe(true);
  });

  it("does not knock down a foe casting a spell", () => {
    const sim = arena("hammer", [], caster("t", vec2(AREA_ADJACENT - 10, 0)));
    sim.setTarget("t", "w");
    expect(sim.requestSkill("t", 0)?.check).toEqual({ ok: true });
    wait(sim, 0.1);
    swing(sim, "warrior.counter-blow");
    expect(down(sim, "t")).toBe(false);
  });
});

describe("Irresistible Blow (#1357)", () => {
  it("blocked by Gladiator's Defense, knocks its target down and deals it 17", () => {
    // The first seed under which the stance blocks the blow.
    for (let seed = 0; seed < 50; seed += 1) {
      const sim = arena(`block-${String(seed)}`);
      combatant(sim, "t").statuses.apply("gladiators-defense", 6, "t", NO_RANKS);
      const entry = swing(sim, "warrior.irresistible-blow");
      if (entry.events.some(({ kind }) => kind === "attack-blocked")) {
        expect(down(sim, "t")).toBe(true);
        expect(damageTo(entry, "t")).toBe(17);
        return;
      }
    }
    throw new Error("Gladiator's Defense never blocked");
  });
});

describe("Earth Shaker (#1357)", () => {
  it("knocks down its target and every foe adjacent to it, not one farther off nor an ally", () => {
    const sim = arena("hammer", [
      spec("side", 1, vec2(AREA_ADJACENT - 10, AREA_ADJACENT - 10)),
      spec("back", 1, vec2(2 * AREA_ADJACENT - 30, 0)),
      spec("far", 1, vec2(AREA_ADJACENT - 10 + 300, 300)),
      spec("pal", 0, vec2(AREA_ADJACENT - 10, -(AREA_ADJACENT - 10))),
    ]);
    swing(sim, "warrior.earth-shaker");
    expect(["t", "side", "back", "far", "pal"].filter((id) => down(sim, id))).toEqual([
      "t",
      "side",
      "back",
    ]);
  });
});

describe("Crushing Blow (#1357)", () => {
  it("Deep Wounds a knocked-down foe for 17 s, and not a standing one", () => {
    const standing = arena();
    swing(standing, "warrior.crushing-blow");
    expect(combatant(standing, "t").statuses.get("deep-wound")).toBeUndefined();
    const sim = arena();
    combatant(sim, "t").knockdownRemaining = KNOCKDOWN_SECONDS;
    swing(sim, "warrior.crushing-blow");
    expectLasting(sim, "deep-wound", 17);
  });
});

describe("Devastating Hammer (#1357)", () => {
  it("knocks down and weakens for 17 s", () => {
    const sim = arena();
    swing(sim, "warrior.devastating-hammer");
    expect(down(sim, "t")).toBe(true);
    expectLasting(sim, "weakness", 17);
  });
});
