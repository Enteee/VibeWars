import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { BASE_ENERGY_PIPS_BY_PROFESSION } from "../equipment/armor.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Vigorous Spirit in a match (#1039): each swing and each completed
 * spell heals its bearer 5...17 by its Monk's Healing Prayers, a signet or a cancelled spell does not, and
 * its own cast does not. Divine Favor adds to Cure Hex, not to Vigorous
 * Spirit's heals.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const VIGOROUS_SPIRIT = "monk.vigorous-spirit";
const CURE_HEX = "monk.cure-hex";
const HEAL_OTHER = "monk.heal-other";

const AXE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.axe,
    attributeId: "warrior.axe-mastery",
    damageType: WEAPONS.axe.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    startHealthFraction: 0.5,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
}

/**
 * A Monk with Vigorous Spirit, Cure Hex and Heal Other; an axe Warrior
 * beside it with Healing Signet, and a foe beside the Warrior; a Mesmer
 * foe with Shatter Enchantment.
 */
function match(divineFavor = 0, healingPrayers = 12): MatchSimulation {
  return new MatchSimulation({
    seed: "vigorous-spirit",
    participants: [
      spec("monk", 0, vec2(0, 0), {
        skillBar: [VIGOROUS_SPIRIT, CURE_HEX, HEAL_OTHER],
        attributeRanks: new Map([
          ["monk.healing-prayers", healingPrayers],
          ["monk.divine-favor", divineFavor],
        ]),
      }),
      spec("w", 0, vec2(100, 0), {
        skillBar: ["warrior.healing-signet"],
        attributeRanks: new Map([["warrior.axe-mastery", 12]]),
        equipment: AXE,
        baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION.warrior,
      }),
      spec("foe", 1, vec2(100 + AREA_ADJACENT - 10, 0), { maxHealth: 1e6 }),
      spec("mesmer", 1, vec2(300, 0), { skillBar: ["mesmer.shatter-enchantment"] }),
    ],
  });
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `id` uses the skill in `slot` on `targetId`, itself if `undefined`. */
function use(sim: MatchSimulation, id: string, slot: number, targetId?: string): void {
  sim.setTarget(id, targetId);
  expect(sim.requestSkill(id, slot)?.check).toEqual({ ok: true });
}

/** Each heal `skillId` from `sourceId` logged on `targetId`. */
function heals(
  log: readonly CombatLogEntry[],
  skillId: string,
  targetId: string,
  sourceId = "monk",
): number[] {
  return log
    .filter((entry) => entry.skillId === skillId && entry.sourceId === sourceId)
    .flatMap((entry) => entry.events)
    .flatMap((event) =>
      event.kind === "heal" && event.targetId === targetId ? [event.amount] : [],
    );
}

describe("Vigorous Spirit in a match (#1039)", () => {
  it("heals the Warrior 17 for its Monk on each swing", () => {
    const sim = match();
    use(sim, "monk", 0, "w");
    stepFor(sim, 1);
    expect(sim.requestAttack("w", "foe")).toEqual({ ok: true });
    const log = stepFor(sim, 5);
    const swings = log.filter((entry) => entry.cause === "weapon" && entry.sourceId === "w");
    expect(swings.length).toBeGreaterThanOrEqual(2);
    expect(heals(log, VIGOROUS_SPIRIT, "w")).toEqual(swings.map(() => 17));
  });

  it("heals 5 a swing for a Monk with no Healing Prayers", () => {
    const sim = match(0, 0);
    use(sim, "monk", 0, "w");
    stepFor(sim, 1);
    expect(sim.requestAttack("w", "foe")).toEqual({ ok: true });
    const log = stepFor(sim, 5);
    const swings = log.filter((entry) => entry.cause === "weapon" && entry.sourceId === "w");
    expect(swings.length).toBeGreaterThanOrEqual(2);
    expect(heals(log, VIGOROUS_SPIRIT, "w")).toEqual(swings.map(() => 5));
  });

  it("does not heal for a signet", () => {
    const sim = match();
    use(sim, "monk", 0, "w");
    stepFor(sim, 1);
    use(sim, "w", 0);
    const log = stepFor(sim, 3);
    expect(heals(log, "warrior.healing-signet", "w", "w").length).toBe(1);
    expect(heals(log, VIGOROUS_SPIRIT, "w")).toEqual([]);
  });

  it("cast on the Monk itself, heals not for its own cast but for the next spell", () => {
    const sim = match();
    use(sim, "monk", 0);
    expect(heals(stepFor(sim, 1), VIGOROUS_SPIRIT, "monk")).toEqual([]);
    use(sim, "monk", 2, "w");
    expect(heals(stepFor(sim, 2), VIGOROUS_SPIRIT, "monk")).toEqual([17]);
  });

  it("does not heal for a spell cancelled before it completes", () => {
    const sim = match();
    use(sim, "monk", 0);
    stepFor(sim, 1);
    use(sim, "monk", 2, "w");
    stepFor(sim, 0.25);
    sim.cancelAction("monk");
    const log = stepFor(sim, 2);
    expect(heals(log, HEAL_OTHER, "w")).toEqual([]);
    expect(heals(log, VIGOROUS_SPIRIT, "monk")).toEqual([]);
  });

  it("is taken by Shatter Enchantment, and the next swing heals nothing", () => {
    const sim = match();
    use(sim, "monk", 0, "w");
    stepFor(sim, 1);
    use(sim, "mesmer", 0, "w");
    stepFor(sim, 2);
    expect(sim.get("w")?.combatant.statuses.has("vigorous-spirit")).toBe(false);
    expect(sim.requestAttack("w", "foe")).toEqual({ ok: true });
    expect(heals(stepFor(sim, 4), VIGOROUS_SPIRIT, "w")).toEqual([]);
  });

  it("with Divine Favor 12, Cure Hex heals 86 + 38 and each swing still 17", () => {
    const sim = match(12);
    sim.get("w")?.combatant.statuses.apply("malaise", 10, "mesmer", NO_RANKS);
    use(sim, "monk", 1, "w");
    const cured = stepFor(sim, 2);
    expect(heals(cured, CURE_HEX, "w").reduce((sum, amount) => sum + amount, 0)).toBe(86 + 38);
    use(sim, "monk", 0, "w");
    stepFor(sim, 1);
    expect(sim.requestAttack("w", "foe")).toEqual({ ok: true });
    const swung = stepFor(sim, 3);
    expect(heals(swung, VIGOROUS_SPIRIT, "w").length).toBeGreaterThanOrEqual(1);
    expect(new Set(heals(swung, VIGOROUS_SPIRIT, "w"))).toEqual(new Set([17]));
  });
});
