import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { rankOf } from "../skills/tick.js";
import type { Skill } from "../skills/types.js";
import { swingIntervalSeconds } from "../skills/weapon-attack.js";
import { vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Attributes raised for a time or for the next skills (#1941): Glyph of
 * Elemental Power, Glyph of Energy, Ritual Lord and Expert's Dexterity,
 * at their rank-12 values. The spell or skill that spends the last use
 * still scales with the boost.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ARMOR = RULES.combat.armorReferenceLevel;

describe("Glyph of Elemental Power (#1941)", () => {
  it("lasts 25 s and holds the next 10 spells", () => {
    const match = new MatchSimulation({
      seed: "goep",
      participants: [caster("a", ["elementalist.glyph-of-elemental-power"], []), dummy("d")],
    });
    use(match, 0, 1.5);
    const glyph = get(match, "a").combatant.statuses.get("glyph-of-elemental-power");
    expect(glyph?.remainingSeconds).toBeCloseTo(25 - 0.5, 0);
    expect(glyph?.spellsLeft).toBe(10);
  });

  it("raises Fireball's damage for exactly 10 spells, the 10th included", () => {
    const fireball = (fire: number): number => {
      const match = new MatchSimulation({
        seed: "goep",
        participants: [
          caster("a", ["elementalist.fireball"], [["elementalist.fire-magic", fire]]),
          dummy("d"),
        ],
      });
      return dealt(match, 0, 9);
    };
    const normal = fireball(10);
    const boosted = fireball(12);
    expect(boosted).toBeGreaterThan(normal);

    const match = new MatchSimulation({
      seed: "goep",
      participants: [
        caster("a", ["elementalist.fireball"], [["elementalist.fire-magic", 10]]),
        dummy("d"),
      ],
    });
    const self = get(match, "a").combatant;
    // Longer than the glyph's own 25 s, so only its count ends it.
    self.statuses.apply("glyph-of-elemental-power", 1000, "a", NO_RANKS);
    for (let spell = 1; spell <= 10; spell += 1) {
      expect(dealt(match, 0, 9), `spell ${String(spell)}`).toBe(boosted);
    }
    expect(self.statuses.has("glyph-of-elemental-power")).toBe(false);
    expect(dealt(match, 0, 9)).toBe(normal);
    // Nothing held is left on the caster between casts.
    expect(self.heldAttributeDeltas).toEqual([]);
  });
});

describe("Glyph of Energy (#1941)", () => {
  it("makes the next 3 spells 22 cheaper and boosted, then lets go", () => {
    const invocation = (fire: number): number => {
      const match = new MatchSimulation({
        seed: "goe",
        participants: [
          caster("a", ["elementalist.rodgorts-invocation"], [["elementalist.fire-magic", fire]]),
          dummy("d"),
        ],
      });
      return dealt(match, 0, 11);
    };
    const normal = invocation(10);
    const boosted = invocation(12);
    expect(boosted).toBeGreaterThan(normal);
    expect(skill("elementalist.rodgorts-invocation").cost).toEqual({ kind: "energy", amount: 25 });

    const match = new MatchSimulation({
      seed: "goe",
      participants: [
        caster(
          "a",
          ["elementalist.glyph-of-energy", "elementalist.rodgorts-invocation"],
          [["elementalist.fire-magic", 10]],
        ),
        dummy("d"),
      ],
    });
    const self = get(match, "a").combatant;
    use(match, 0, 2.5);
    expect(self.statuses.has("glyph-of-energy")).toBe(true);
    for (let spell = 1; spell <= 3; spell += 1) {
      expect(paid(match, 1), `spell ${String(spell)}`).toBe(3);
      expect(dealt(match, undefined, 11)).toBe(boosted);
    }
    expect(self.statuses.has("glyph-of-energy")).toBe(false);
    expect(paid(match, 1)).toBe(25);
    expect(dealt(match, undefined, 11)).toBe(normal);
  });

  it("lets its spells cause no Overcast, then they do again", () => {
    const match = new MatchSimulation({
      seed: "goe",
      participants: [caster("a", ["elementalist.mind-burn"], []), dummy("d")],
    });
    const self = get(match, "a").combatant;
    expect(skill("elementalist.mind-burn").overcast).toBe(5);
    self.statuses.apply("glyph-of-energy", Number.POSITIVE_INFINITY, "a", NO_RANKS);
    for (let spell = 1; spell <= 3; spell += 1) {
      use(match, 0, 7);
      expect(self.overcast, `spell ${String(spell)}`).toBe(0);
    }
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(self.overcast).toBe(5);
  });
});

describe("Ritual Lord (#1941)", () => {
  const RITUALIST: [string, number][] = [
    ["ritualist.spawning-power", 8],
    ["ritualist.restoration-magic", 8],
  ];

  /** Recuperation's spirit's maximum Health, cast at `ranks`, Ritual Lord first or not. */
  const spirit = (ranks: [string, number][], lord: boolean): number => {
    const match = new MatchSimulation({
      seed: "rl",
      participants: [caster("a", ["ritualist.ritual-lord", "ritualist.recuperation"], ranks)],
    });
    if (lord) {
      use(match, 0, 0.5);
    }
    use(match, 1, 4);
    const found = [...match.participants()].find((p) => p.creature?.kind === "spirit");
    if (found === undefined) {
      throw new Error("no spirit");
    }
    return found.combatant.maxHealth;
  };

  it("lends a binding ritual +4 Ritualist attributes", () => {
    const raised: [string, number][] = [
      ["ritualist.spawning-power", 12],
      ["ritualist.restoration-magic", 12],
    ];
    expect(spirit(RITUALIST, true)).toBeGreaterThan(spirit(RITUALIST, false));
    expect(spirit(RITUALIST, true)).toBe(spirit(raised, false));
  });

  it("makes a binding ritual recharge 50% faster, and is ready again at once", () => {
    const match = new MatchSimulation({
      seed: "rl",
      participants: [caster("a", ["ritualist.ritual-lord", "ritualist.recuperation"], RITUALIST)],
    });
    const self = get(match, "a").combatant;
    use(match, 0, 0.5);
    expect(self.cast.rechargeRemaining.get("ritualist.ritual-lord")).toBeGreaterThan(0);
    expect(self.statuses.has("ritual-lord")).toBe(true);
    use(match, 1, 3.05);
    expect(self.statuses.has("ritual-lord")).toBe(false);
    expect(self.cast.rechargeRemaining.has("ritualist.ritual-lord")).toBe(false);
    expect(self.cast.rechargeTotal.get("ritualist.recuperation")).toBeCloseTo(45 * 0.5);
  });

  it("is spent by a skill that is no binding ritual, to no recharge effect", () => {
    const match = new MatchSimulation({
      seed: "rl",
      participants: [
        caster("a", ["ritualist.ritual-lord", "elementalist.fireball"], RITUALIST),
        dummy("d"),
      ],
    });
    const self = get(match, "a").combatant;
    use(match, 0, 0.5);
    use(match, 1, 1.5);
    expect(self.statuses.has("ritual-lord")).toBe(false);
    expect(self.cast.rechargeRemaining.get("ritualist.ritual-lord")).toBeGreaterThan(40);
    expect(self.cast.rechargeTotal.get("elementalist.fireball")).toBe(
      skill("elementalist.fireball").rechargeSeconds,
    );
  });
});

describe("Expert's Dexterity (#1941)", () => {
  it("attacks 15% faster and raises Marksmanship by 1 for 16 s", () => {
    const match = new MatchSimulation({
      seed: "ed",
      participants: [caster("a", ["ranger.experts-dexterity"], [["ranger.marksmanship", 10]])],
    });
    const self = get(match, "a").combatant;
    const swing = swingIntervalSeconds(self);
    use(match, 0, 0.5);
    expect(self.statuses.get("experts-dexterity")?.remainingSeconds).toBeCloseTo(16 - 0.45, 1);
    expect(swingIntervalSeconds(self)).toBeCloseTo(swing * 0.85);
    expect(rankOf(self, "ranger.marksmanship")).toBe(11);
    expect(rankOf(self, "ranger.expertise")).toBe(0);
    stepFor(match, 16);
    expect(rankOf(self, "ranger.marksmanship")).toBe(10);
  });
});

function caster(id: string, bar: string[], ranks: [string, number][]): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: bar,
    attributeRanks: new Map(ranks),
    equipment: unarmedResolvedEquipment(ARMOR),
    maxEnergy: 200,
    spawn: vec2(0, 0),
    facing: 0,
  };
}

/** A sturdy foe in spell range that does nothing. */
function dummy(id: string): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(ARMOR),
    maxHealth: 1e6,
    spawn: vec2(300, 0),
    facing: Math.PI,
  };
}

/** Use `slot` at the dummy, if there is one, and wait `seconds`. */
function use(match: MatchSimulation, slot: number, seconds: number): void {
  if (match.get("d") !== undefined) {
    match.setTarget("a", "d");
  }
  expect(match.requestSkill("a", slot)?.check).toEqual({ ok: true });
  stepFor(match, seconds);
}

/**
 * The damage the dummy takes over `seconds`, after a use of `slot`, or
 * of the one `paid` already began (`undefined`).
 */
function dealt(match: MatchSimulation, slot: number | undefined, seconds: number): number {
  const foe = get(match, "d").combatant;
  const before = foe.health;
  if (slot === undefined) {
    stepFor(match, seconds);
  } else {
    use(match, slot, seconds);
  }
  return Math.round(before - foe.health);
}

/** The energy `slot` costs as it begins: a cost is paid at the start. */
function paid(match: MatchSimulation, slot: number): number {
  const self = get(match, "a").combatant;
  self.energy = 100;
  match.setTarget("a", "d");
  expect(match.requestSkill("a", slot)?.check).toEqual({ ok: true });
  return 100 - self.energy;
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
  }
}

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}
