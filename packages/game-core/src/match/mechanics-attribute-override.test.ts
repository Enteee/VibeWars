import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import { makeCombatant } from "../skills/testing.js";
import { effectiveActivationSeconds, rankOf } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import { vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Attributes set or borrowed (#1929): Wail of Doom's "all of target foe's
 * attributes are 0", Atrophy's primary one, Master of Magic's elemental
 * ones at 13, and Signet of Illusions' next 3 non-Illusion spells at the
 * caster's Illusion Magic.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ARMOR = RULES.combat.armorReferenceLevel;

/** Equipment adding `bonuses` to their attributes, as a rune and headgear would. */
function runed(bonuses: ReadonlyMap<string, number>): ResolvedEquipment {
  return { ...unarmedResolvedEquipment(ARMOR), attributeBonuses: bonuses };
}

/** A bearer at `ranks`, runes and headgear included, `bonuses` of them from equipment. */
function bearer(ranks: [string, number][], bonuses: [string, number][] = []): Combatant {
  return makeCombatant({
    id: "b",
    attributeRanks: new Map(ranks),
    equipment: runed(new Map(bonuses)),
  });
}

describe("Wail of Doom (#1929)", () => {
  it("sets every attribute to 0, but what runes and headgear add stands", () => {
    const necro = bearer(
      [
        ["necromancer.curses", 12],
        ["necromancer.soul-reaping", 9],
      ],
      [["necromancer.curses", 2]],
    );
    necro.statuses.apply("wail-of-doom", 5, "foe", NO_RANKS);
    expect(rankOf(necro, "necromancer.curses")).toBe(2);
    expect(rankOf(necro, "necromancer.soul-reaping")).toBe(0);
  });

  it("stays 0 under Weakness too", () => {
    const necro = bearer([["necromancer.curses", 12]]);
    necro.statuses.apply("wail-of-doom", 5, "foe", NO_RANKS);
    necro.statuses.apply("weakness", 5, "foe", NO_RANKS);
    expect(rankOf(necro, "necromancer.curses")).toBe(0);
  });

  it("lengthens a Fast Casting foe's cast", () => {
    const mesmer = bearer([["mesmer.fast-casting", 12]]);
    const spell = skill("elementalist.lightning-hammer");
    const fast = effectiveActivationSeconds(spell, mesmer);
    mesmer.statuses.apply("wail-of-doom", 5, "foe", NO_RANKS);
    expect(effectiveActivationSeconds(spell, mesmer)).toBeGreaterThan(fast);
    expect(effectiveActivationSeconds(spell, mesmer)).toBe(spell.activationSeconds);
  });

  it("ends, and the ranks come back", () => {
    const necro = bearer([["necromancer.curses", 12]]);
    necro.statuses.apply("wail-of-doom", 5, "foe", NO_RANKS);
    necro.statuses.advance(5.1, false);
    expect(rankOf(necro, "necromancer.curses")).toBe(12);
  });
});

describe("Atrophy (#1929)", () => {
  it("sets only the primary attribute to 0", () => {
    const mesmer = bearer([
      ["mesmer.fast-casting", 12],
      ["mesmer.domination-magic", 10],
      ["necromancer.curses", 8],
    ]);
    mesmer.statuses.apply("atrophy", 6, "foe", NO_RANKS);
    expect(rankOf(mesmer, "mesmer.fast-casting")).toBe(0);
    expect(rankOf(mesmer, "mesmer.domination-magic")).toBe(10);
    expect(rankOf(mesmer, "necromancer.curses")).toBe(8);
  });

  it("drops a Mesmer's Fast Casting from its casts", () => {
    const mesmer = bearer([["mesmer.fast-casting", 12]]);
    const spell = skill("elementalist.lightning-hammer");
    mesmer.statuses.apply("atrophy", 6, "foe", NO_RANKS);
    expect(effectiveActivationSeconds(spell, mesmer)).toBe(spell.activationSeconds);
  });
});

describe("Master of Magic (#1929)", () => {
  it("sets every elemental attribute to 13, over runes and Weakness", () => {
    const ele = bearer(
      [
        ["elementalist.energy-storage", 3],
        ["elementalist.fire-magic", 16],
        ["elementalist.air-magic", 2],
      ],
      [["elementalist.fire-magic", 4]],
    );
    ele.statuses.apply("weakness", 10, "foe", NO_RANKS);
    ele.statuses.apply("master-of-magic", 49, "b", NO_RANKS);
    expect(rankOf(ele, "elementalist.fire-magic")).toBe(13);
    expect(rankOf(ele, "elementalist.air-magic")).toBe(13);
    expect(rankOf(ele, "elementalist.water-magic")).toBe(13);
    expect(rankOf(ele, "elementalist.earth-magic")).toBe(13);
    // Energy Storage is not elemental: Weakness takes its one.
    expect(rankOf(ele, "elementalist.energy-storage")).toBe(2);
  });

  it("loses to a newer Wail of Doom", () => {
    const ele = bearer([["elementalist.fire-magic", 12]]);
    ele.statuses.apply("master-of-magic", 49, "b", NO_RANKS);
    ele.statuses.apply("wail-of-doom", 5, "foe", NO_RANKS);
    expect(rankOf(ele, "elementalist.fire-magic")).toBe(0);
  });

  it("returns 1 + 30% of an elemental spell's cost, and nothing for another", () => {
    const spent = (mastered: boolean): readonly [number, number] => {
      const match = new MatchSimulation({
        seed: "mom",
        participants: [
          caster("a", ["elementalist.lightning-strike", "monk.banish"], []),
          dummy("d"),
        ],
      });
      if (mastered) {
        get(match, "a").combatant.statuses.apply("master-of-magic", 49, "a", NO_RANKS);
      }
      match.setTarget("a", "d");
      return [spentOn(match, 0), spentOn(match, 1)];
    };
    const [strike, banish] = spent(false);
    const [masteredStrike, masteredBanish] = spent(true);
    // Lightning Strike costs 5: 1 + 2 back, the 1.5 rounded half up. Banish is no elemental spell.
    expect(skill("elementalist.lightning-strike").cost).toEqual({ kind: "energy", amount: 5 });
    expect(strike - masteredStrike).toBe(3);
    expect(masteredBanish).toBe(banish);
  });
});

describe("Signet of Illusions (#1929)", () => {
  it("lends its next 3 non-Illusion spells the caster's Illusion Magic, then lets go", () => {
    const strike = (illusion: number, air: number): number => {
      const match = new MatchSimulation({
        seed: "soi",
        participants: [
          caster(
            "a",
            ["elementalist.lightning-strike"],
            [
              ["mesmer.illusion-magic", illusion],
              ["elementalist.air-magic", air],
            ],
          ),
          dummy("d"),
        ],
      });
      match.setTarget("a", "d");
      return dealtBy(match, 0);
    };
    const atTwelve = strike(0, 12);
    const atZero = strike(0, 0);
    expect(atTwelve).toBeGreaterThan(atZero);

    const match = new MatchSimulation({
      seed: "soi",
      participants: [
        caster(
          "a",
          ["mesmer.signet-of-illusions", "elementalist.lightning-strike"],
          [["mesmer.illusion-magic", 12]],
        ),
        dummy("d"),
      ],
    });
    match.setTarget("a", "d");
    const mesmer = get(match, "a").combatant;
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    stepFor(match, 2.5);
    expect(mesmer.statuses.get("signet-of-illusions")?.castsLeft).toBe(3);
    for (let cast = 0; cast < 3; cast += 1) {
      expect(dealtBy(match, 1)).toBe(atTwelve);
    }
    expect(mesmer.statuses.has("signet-of-illusions")).toBe(false);
    expect(dealtBy(match, 1)).toBe(atZero);
    // Nothing borrowed is left on the caster between casts.
    expect(mesmer.borrowedAttribute).toBeNull();
  });

  it("is not spent by a spell of Illusion Magic, nor by a non-spell", () => {
    const mesmer = makeCombatant({ id: "m" });
    mesmer.statuses.apply("signet-of-illusions", Number.POSITIVE_INFINITY, "m", NO_RANKS);
    expect(mesmer.statuses.borrowedFor(skill("mesmer.conjure-phantasm"))).toBeUndefined();
    expect(mesmer.statuses.borrowedFor(skill("warrior.signet-of-strength"))).toBeUndefined();
    expect(mesmer.statuses.borrowedFor(skill("elementalist.lightning-strike"))).toBe(
      "signet-of-illusions",
    );
  });

  it("starts its count again on a recast", () => {
    const mesmer = makeCombatant({ id: "m" });
    mesmer.statuses.apply("signet-of-illusions", Number.POSITIVE_INFINITY, "m", NO_RANKS);
    mesmer.statuses.spendBorrowed("signet-of-illusions");
    mesmer.statuses.spendBorrowed("signet-of-illusions");
    mesmer.statuses.apply("signet-of-illusions", Number.POSITIVE_INFINITY, "m", NO_RANKS);
    expect(mesmer.statuses.get("signet-of-illusions")?.castsLeft).toBe(3);
  });
});

describe("tooltips (#1929)", () => {
  it("say what each sets or lends", () => {
    expect(describeStatus("wail-of-doom")).toContain("attributes set to 0");
    expect(describeStatus("atrophy")).toContain("primary attribute set to 0");
    expect(describeStatus("master-of-magic")).toContain("elemental attributes set to 13");
    expect(describeStatus("signet-of-illusions")).toContain(
      "your next 3 spells use Illusion Magic",
    );
    for (const [id, text] of [
      ["necromancer.wail-of-doom", "attributes set to 0"],
      ["necromancer.atrophy", "primary attribute set to 0"],
      ["elementalist.master-of-magic", "elemental attributes set to 13"],
      ["mesmer.signet-of-illusions", "use Illusion Magic"],
    ] as const) {
      expect(JSON.stringify(describeSkill(skill(id))), id).toContain(text);
    }
  });
});

/** A caster at `ranks` with `bar`, plenty of energy and no regeneration to blur a cost. */
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

/** The damage the dummy takes from one use of `slot`, cast and recharged: its 1 s and its 5. */
function dealtBy(match: MatchSimulation, slot: number): number {
  const foe = get(match, "d").combatant;
  const before = foe.health;
  expect(match.requestSkill("a", slot)?.check).toEqual({ ok: true });
  stepFor(match, 7);
  return Math.round(before - foe.health);
}

/** The energy one use of `slot` costs the caster, all said and done. */
function spentOn(match: MatchSimulation, slot: number): number {
  const self = get(match, "a").combatant;
  self.energy = 100;
  expect(match.requestSkill("a", slot)?.check).toEqual({ ok: true });
  // Long enough to cast, short enough that regeneration adds nothing whole.
  stepFor(match, 1.2);
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
