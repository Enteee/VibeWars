import { describe, expect, it } from "vitest";

import { AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { effectiveArmor, skillDamage } from "./damage.js";
import { describeStatus } from "./describe.js";
import { effectiveMaxHealth } from "./tick.js";

/**
 * Caster staples 2 (#1872): Elemental Resistance, Physical Resistance,
 * Vital Blessing, Vital Weapon and Vocal Minority. Numbers are the
 * corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["mesmer.inspiration-magic", 12],
  ["monk.protection-prayers", 12],
  ["ritualist.communing", 12],
  ["ritualist.restoration-magic", 12],
  ["necromancer.curses", 12],
]);

const FIRE = skillDamage(100, "fire", 0);
const SLASHING = skillDamage(100, "slashing", 0);

/** A rank-12 caster of `bar`, lots of energy, at `health` of 500. */
function spec(
  id: string,
  team: number,
  spawn: Vec2,
  bar: readonly string[] = [],
  health = 1,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: bar,
    attributeRanks: RANKS,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 1000,
    startHealthFraction: health,
    spawn,
    facing: 0,
  };
}

function get(match: MatchSimulation, id: string): Participant {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `caster` casts its `slot`th skill on `target` and the cast resolves. */
function cast(match: MatchSimulation, caster: string, target: string, slot = 0): void {
  match.setTarget(caster, target);
  expect(match.requestSkill(caster, slot)?.check).toEqual({ ok: true });
  stepFor(match, 2.5);
}

describe("caster staples 2's data (#1872)", () => {
  it.each([
    ["mesmer.elemental-resistance", 72, "stance", "inspiration-magic", 10, 0, 20, "self"],
    ["mesmer.physical-resistance", 73, "stance", "inspiration-magic", 10, 0, 20, "self"],
    ["monk.vital-blessing", 289, "enchantment", "protection-prayers", 10, 0.75, 2, "single-ally"],
    ["ritualist.vital-weapon", 1267, "weapon-spell", "communing", 5, 1, 2, "single-ally"],
    ["necromancer.vocal-minority", 883, "hex", "curses", 10, 1, 20, "single-enemy"],
  ] as const)(
    "%s: gwId %i, %s, %s, %i energy, %d s, %i s recharge, %s",
    (id, gwId, type, attribute, energy, activation, recharge, target) => {
      const profession = id.slice(0, id.indexOf("."));
      expect(getSkill(id)).toMatchObject({
        gwId,
        type,
        elite: false,
        attributeId: `${profession}.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );

  it("each tooltip says what its status does", () => {
    expect(describeStatus("elemental-resistance")).toContain("+40 elemental armor");
    expect(describeStatus("elemental-resistance")).toContain("−14 physical armor");
    expect(describeStatus("physical-resistance")).toContain("+40 physical armor");
    expect(describeStatus("physical-resistance")).toContain("−14 elemental armor");
  });
});

describe("Elemental and Physical Resistance (#1872)", () => {
  function resisting(): MatchSimulation {
    return new MatchSimulation({
      seed: "resistance",
      participants: [
        spec("m", 0, vec2(0, 0), ["mesmer.elemental-resistance", "mesmer.physical-resistance"]),
      ],
    });
  }

  it("Elemental Resistance: +40 armor against fire, -14 against slashing, for 78 s", () => {
    const match = resisting();
    const m = get(match, "m");
    const fire = effectiveArmor(m.combatant, FIRE, "chest");
    const slashing = effectiveArmor(m.combatant, SLASHING, "chest");
    cast(match, "m", "m");
    expect(m.combatant.statuses.get("elemental-resistance")?.durationSeconds).toBe(78);
    expect(effectiveArmor(m.combatant, FIRE, "chest")).toBe(fire + 40);
    expect(effectiveArmor(m.combatant, SLASHING, "chest")).toBe(slashing - 14);
  });

  it("Physical Resistance replaces it, and turns the armor round", () => {
    const match = resisting();
    const m = get(match, "m");
    const fire = effectiveArmor(m.combatant, FIRE, "chest");
    const slashing = effectiveArmor(m.combatant, SLASHING, "chest");
    cast(match, "m", "m", 0);
    cast(match, "m", "m", 1);
    expect(m.combatant.statuses.has("elemental-resistance")).toBe(false);
    expect(m.combatant.statuses.has("physical-resistance")).toBe(true);
    expect(effectiveArmor(m.combatant, FIRE, "chest")).toBe(fire - 14);
    expect(effectiveArmor(m.combatant, SLASHING, "chest")).toBe(slashing + 40);
  });
});

describe("Vital Blessing (#1872)", () => {
  it("+168 maximum Health while maintained; dropped, Health is clamped to 500", () => {
    const match = new MatchSimulation({
      seed: "vital-blessing",
      participants: [spec("o", 0, vec2(0, 0), ["monk.vital-blessing"]), spec("a", 0, vec2(200, 0))],
    });
    const a = get(match, "a").combatant;
    cast(match, "o", "a");
    expect(a.statuses.get("vital-blessing")?.maintained).not.toBeNull();
    expect(effectiveMaxHealth(a)).toBe(500 + 168);
    expect(a.health).toBe(500 + 168);
    stepFor(match, 30);
    expect(effectiveMaxHealth(a)).toBe(500 + 168);

    expect(match.endUpkeep("o", "a", "vital-blessing")).toBe(true);
    stepFor(match, DT);
    expect(a.statuses.has("vital-blessing")).toBe(false);
    expect(effectiveMaxHealth(a)).toBe(500);
    expect(a.health).toBe(500);
  });

  it("may be cast on its caster", () => {
    const match = new MatchSimulation({
      seed: "vital-blessing-self",
      participants: [spec("o", 0, vec2(0, 0), ["monk.vital-blessing"])],
    });
    cast(match, "o", "o");
    expect(effectiveMaxHealth(get(match, "o").combatant)).toBe(500 + 168);
  });
});

describe("Vital Weapon (#1872)", () => {
  it("+148 maximum Health for 25 s, then Health clamps back to 500", () => {
    const match = new MatchSimulation({
      seed: "vital-weapon",
      participants: [
        spec("r", 0, vec2(0, 0), ["ritualist.vital-weapon"]),
        spec("a", 0, vec2(200, 0)),
      ],
    });
    const a = get(match, "a").combatant;
    cast(match, "r", "a");
    expect(a.statuses.get("vital-weapon")?.durationSeconds).toBe(25);
    expect(effectiveMaxHealth(a)).toBe(500 + 148);
    stepFor(match, 25);
    expect(a.statuses.has("vital-weapon")).toBe(false);
    expect(effectiveMaxHealth(a)).toBe(500);
    expect(a.health).toBe(500);
  });

  it("replaces another weapon spell, and is replaced by one", () => {
    const match = new MatchSimulation({
      seed: "vital-weapon-replaces",
      participants: [
        spec("r", 0, vec2(0, 0), ["ritualist.weapon-of-warding", "ritualist.vital-weapon"]),
        spec("a", 0, vec2(200, 0)),
      ],
    });
    const a = get(match, "a").combatant;
    cast(match, "r", "a", 0);
    expect(a.statuses.has("weapon-of-warding")).toBe(true);
    cast(match, "r", "a", 1);
    expect(a.statuses.has("weapon-of-warding")).toBe(false);
    expect(a.statuses.has("vital-weapon")).toBe(true);
    stepFor(match, 8);
    cast(match, "r", "a", 0);
    expect(a.statuses.has("vital-weapon")).toBe(false);
    expect(effectiveMaxHealth(a)).toBe(500);
  });
});

describe("Vocal Minority (#1872)", () => {
  it("hexes the target and a foe near it for 17 s, not one far away, and refuses its shout", () => {
    const match = new MatchSimulation({
      seed: "vocal-minority",
      participants: [
        spec("n", 0, vec2(0, 0), ["necromancer.vocal-minority"]),
        spec("a", 1, vec2(RANGE_SPELL - 100, 0)),
        spec("b", 1, vec2(RANGE_SPELL - 100 + AREA_NEARBY / 2, 0), ["paragon.fall-back"]),
        spec("c", 1, vec2(RANGE_SPELL - 100 + AREA_NEARBY + 50, 0), ["paragon.fall-back"]),
      ],
    });
    cast(match, "n", "a");
    expect(get(match, "a").combatant.statuses.get("vocal-minority")?.durationSeconds).toBe(17);
    expect(get(match, "b").combatant.statuses.has("vocal-minority")).toBe(true);
    expect(get(match, "c").combatant.statuses.has("vocal-minority")).toBe(false);
    expect(match.requestSkill("b", 0)?.check).toEqual({
      ok: false,
      reason: "cannot-shout-or-chant",
    });
    expect(match.requestSkill("c", 0)?.check).toEqual({ ok: true });
  });
});
