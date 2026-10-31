import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_IN_THE_AREA, AREA_NEARBY, RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BLOOD = "necromancer.blood-magic";
const VAMPIRIC_TOUCH = 0;
const VAMPIRIC_SWARM = 1;
const SHADOW_STRIKE = 2;
const BLOOD_OF_THE_AGGRESSOR = 3;
const BARBED_SIGNET = 4;
const OFFERING_OF_BLOOD = 5;

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

/** A rank-12 Blood Magic Necromancer of team 1 with the six, at half health. */
function necromancer(spawn: Vec2): ParticipantSpec {
  return {
    id: "n",
    team: 1,
    skillBar: [
      "necromancer.vampiric-touch",
      "necromancer.vampiric-swarm",
      "necromancer.shadow-strike",
      "necromancer.blood-of-the-aggressor",
      "necromancer.barbed-signet",
      "necromancer.offering-of-blood",
    ],
    attributeRanks: new Map([[BLOOD, 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn,
    facing: 0,
    startHealthFraction: 0.5,
  };
}

/** An axe fighter of team 0. */
function foe(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [],
    attributeRanks: new Map([["warrior.axe-mastery", 12]]),
    equipment: AXE,
    maxHealth: 1000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** The Necromancer at `at`, foe `a` at the origin, and whoever else is asked for. */
function sim(at: Vec2, ...more: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "necromancer-blood",
    participants: [foe("a", vec2(0, 0)), necromancer(at), ...more],
  });
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `n` uses the skill in `slot` on `target`; what it did. */
function cast(match: MatchSimulation, slot: number, target: string): CombatLogEntry[] {
  match.setTarget("n", target);
  expect(match.requestSkill("n", slot)?.check).toEqual({ ok: true });
  return stepFor(match, 2.5).filter((entry) => entry.sourceId === "n");
}

/** Each `kind` event's target and amount, in order. */
function amounts(
  log: readonly CombatLogEntry[],
  kind: "life-stolen" | "damage",
): [string, number][] {
  return log.flatMap((entry) =>
    entry.events.flatMap((event): [string, number][] =>
      event.kind === kind ? [[event.targetId, event.amount]] : [],
    ),
  );
}

describe("Vampiric Touch (#1338)", () => {
  it("steals 65 from a touched foe", () => {
    const match = sim(vec2(RANGE_MELEE - 5, 0));
    const before = get(match, "n").health;
    expect(amounts(cast(match, VAMPIRIC_TOUCH, "a"), "life-stolen")).toEqual([["a", 65]]);
    expect(get(match, "n").health).toBe(before + 65);
  });

  it("from further off, walks into touch range first", () => {
    const match = sim(vec2(300, 0));
    match.setTarget("n", "a");
    match.requestSkill("n", VAMPIRIC_TOUCH);
    expect(amounts(stepFor(match, 0.5), "life-stolen")).toEqual([]);
    const log = stepFor(match, 4);
    expect(amounts(log, "life-stolen")).toEqual([["a", 65]]);
    expect(match.get("n")?.position.x).toBeLessThanOrEqual(RANGE_MELEE + 1);
  });
});

describe("Vampiric Swarm (#1338)", () => {
  it("steals 51 from the target and two foes in the area, a fourth spared", () => {
    const step = AREA_IN_THE_AREA / 4;
    const match = sim(
      vec2(400, 0),
      foe("b", vec2(0, step)),
      foe("c", vec2(0, 2 * step)),
      foe("d", vec2(0, 3 * step)),
    );
    expect(amounts(cast(match, VAMPIRIC_SWARM, "a"), "life-stolen")).toEqual([
      ["a", 51],
      ["b", 51],
      ["c", 51],
    ]);
  });

  it("steals once from a foe that stands alone", () => {
    const match = sim(vec2(400, 0));
    expect(amounts(cast(match, VAMPIRIC_SWARM, "a"), "life-stolen")).toEqual([["a", 51]]);
  });
});

describe("Shadow Strike (#1338)", () => {
  it("on a foe above half health deals 41 and steals 41", () => {
    const log = cast(sim(vec2(400, 0)), SHADOW_STRIKE, "a");
    expect(amounts(log, "life-stolen")).toEqual([["a", 41]]);
    expect(amounts(log, "damage")).toEqual([["a", 41]]);
  });

  it("on a foe at exactly half health deals 41 and steals nothing", () => {
    const match = sim(vec2(400, 0));
    get(match, "a").health = 500;
    const log = cast(match, SHADOW_STRIKE, "a");
    expect(amounts(log, "life-stolen")).toEqual([]);
    expect(amounts(log, "damage")).toEqual([["a", 41]]);
  });
});

describe("Blood of the Aggressor (#1338)", () => {
  it("Weakens an attacking foe for 10 s and steals 37", () => {
    const match = sim(vec2(RANGE_MELEE - 5, 0));
    expect(match.requestAttack("a", "n")).toEqual({ ok: true });
    stepFor(match, 0.2);
    expect(amounts(cast(match, BLOOD_OF_THE_AGGRESSOR, "a"), "life-stolen")).toEqual([["a", 37]]);
    const weakness = get(match, "a").statuses.get("weakness");
    expect(weakness?.sourceId).toBe("n");
    expect(weakness?.remainingSeconds).toBeGreaterThan(10 - 2.5);
    expect(weakness?.remainingSeconds).toBeLessThanOrEqual(10);
  });

  it("only steals from an idle foe", () => {
    const match = sim(vec2(400, 0));
    expect(amounts(cast(match, BLOOD_OF_THE_AGGRESSOR, "a"), "life-stolen")).toEqual([["a", 37]]);
    expect(get(match, "a").statuses.has("weakness")).toBe(false);
  });
});

describe("Barbed Signet (#1338)", () => {
  it("Bleeds the target and an adjacent foe for 13 s, not a nearby one, for 8% once", () => {
    const match = sim(
      vec2(400, 0),
      foe("b", vec2(0, AREA_ADJACENT - 5)),
      foe("c", vec2(0, -(AREA_NEARBY - 5))),
    );
    const before = get(match, "n").health;
    cast(match, BARBED_SIGNET, "a");
    for (const id of ["a", "b"]) {
      const bleeding = get(match, id).statuses.get("bleeding");
      expect(bleeding?.sourceId, id).toBe("n");
      expect(bleeding?.remainingSeconds).toBeGreaterThan(13 - 2.5);
    }
    expect(get(match, "c").statuses.has("bleeding")).toBe(false);
    expect(get(match, "n").health).toBe(before - 80);
  });
});

describe("Offering of Blood (#1338)", () => {
  it("gains 18 energy for 20% of maximum health", () => {
    const match = sim(vec2(400, 0));
    const caster = get(match, "n");
    caster.energy = 10;
    const health = caster.health;
    match.requestSkill("n", OFFERING_OF_BLOOD);
    stepFor(match, 0.5);
    expect(caster.health).toBe(health - 200);
    expect(caster.energy).toBeGreaterThanOrEqual(10 - 1 + 18);
    expect(caster.energy).toBeLessThan(10 - 1 + 18 + 1);
  });
});

describe("Blood Magic texts (#1338)", () => {
  const lines = (id: string): string[] => {
    const found = getSkill(id);
    if (found === undefined) {
      throw new Error(`unknown skill ${id}`);
    }
    return describeSkill(found, new Map([[BLOOD, 12]])).effects.map((effect) => effect.text);
  };

  it("says what each does", () => {
    expect({
      touch: lines("necromancer.vampiric-touch"),
      swarm: lines("necromancer.vampiric-swarm"),
      strike: lines("necromancer.shadow-strike"),
      aggressor: lines("necromancer.blood-of-the-aggressor"),
      signet: lines("necromancer.barbed-signet"),
      offering: lines("necromancer.offering-of-blood"),
    }).toMatchInlineSnapshot(`
      {
        "aggressor": [
          "If target is attacking: applies Weakness for 10s (−66% weapon damage, −1 to all attributes)",
          "Steals up to 37 Health",
        ],
        "offering": [
          "You sacrifice 20% of your maximum health",
          "Gain 18 energy",
        ],
        "signet": [
          "You sacrifice 8% of your maximum health",
          "Applies Bleeding for 13s (−3 Health degeneration)",
        ],
        "strike": [
          "If target is above 50% Health: steals up to 41 Health",
          "Deals 41 shadow damage",
        ],
        "swarm": [
          "Steals up to 51 Health",
        ],
        "touch": [
          "Steals up to 65 Health",
        ],
      }
    `);
  });
});
