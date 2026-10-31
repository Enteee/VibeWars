import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * The Elementalist Fire Magic staples in a match (#1366): the single-target
 * nukes, the point-blank areas, Fire Storm's ground and Mind Burn's
 * energy-read elite.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIRE = "elementalist.fire-magic";
const IMMOLATE = 0;
const FLARE = 1;
const INFERNO = 2;
const FLAME_BURST = 3;
const RODGORTS_INVOCATION = 4;
const FIRE_STORM = 5;
const MIND_BURN = 6;

/** A rank-12 Fire Magic Elementalist of team 1 with the seven. */
function elementalist(spawn: Vec2): ParticipantSpec {
  return {
    id: "n",
    team: 1,
    skillBar: [
      "elementalist.immolate",
      "elementalist.flare",
      "elementalist.inferno",
      "elementalist.flame-burst",
      "elementalist.rodgorts-invocation",
      "elementalist.fire-storm",
      "elementalist.mind-burn",
    ],
    attributeRanks: new Map([[FIRE, 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A foe of team 0 that stands still. */
function foe(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** The Elementalist at `at`, foe `a` at the origin, and whoever else is asked for. */
function sim(at: Vec2, ...more: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "elementalist-fire",
    participants: [foe("a", vec2(0, 0)), elementalist(at), ...more],
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

/** Each damage event a skill dealt, its target and amount, in order: burning's ticks are not. */
function damage(log: readonly CombatLogEntry[]): [string, number][] {
  return log.flatMap((entry) =>
    entry.skillId === undefined
      ? []
      : entry.events.flatMap((event): [string, number][] =>
          event.kind === "damage" ? [[event.targetId, event.amount]] : [],
        ),
  );
}

/** Whether `id` burns, set on fire by `n` for at most `seconds` and more than 2.5 s less. */
function burnsFor(match: MatchSimulation, id: string, seconds: number): void {
  const burning = get(match, id).statuses.get("burning");
  expect(burning?.sourceId, id).toBe("n");
  expect(burning?.remainingSeconds, id).toBeGreaterThan(seconds - 2.5);
  expect(burning?.remainingSeconds, id).toBeLessThanOrEqual(seconds);
}

describe("Immolate (#1366)", () => {
  it("strikes for 64 and sets the target on fire for 3 s", () => {
    const match = sim(vec2(300, 0));
    expect(damage(cast(match, IMMOLATE, "a"))).toEqual([["a", 64]]);
    burnsFor(match, "a", 3);
  });
});

describe("Flare (#1366)", () => {
  it("hits only its target while the caster is not overcast", () => {
    const match = sim(vec2(300, 0), foe("b", vec2(0, AREA_ADJACENT - 5)));
    expect(damage(cast(match, FLARE, "a"))).toEqual([["a", 56]]);
  });

  it("hits an adjacent foe as well while the caster is overcast", () => {
    const match = sim(vec2(300, 0), foe("b", vec2(0, AREA_ADJACENT - 5)));
    get(match, "n").overcast = 10;
    expect(damage(cast(match, FLARE, "a"))).toEqual([
      ["a", 56],
      ["b", 56],
    ]);
  });
});

describe("Inferno and Flame Burst (#1366)", () => {
  // b and c stand adjacent to n; d is past adjacent, still nearby.
  const around = (): MatchSimulation =>
    sim(vec2(0, 30), foe("b", vec2(30, 30)), foe("d", vec2(0, 30 + AREA_ADJACENT + 20)));

  it("Inferno strikes the adjacent foes for 114, not a nearby one", () => {
    const match = around();
    expect(damage(cast(match, INFERNO, "n")).sort()).toEqual([
      ["a", 114],
      ["b", 114],
    ]);
  });

  it("Flame Burst strikes every nearby foe for 99, the farther one too", () => {
    const match = around();
    expect(damage(cast(match, FLAME_BURST, "n")).sort()).toEqual([
      ["a", 99],
      ["b", 99],
      ["d", 99],
    ]);
  });

  it("goes off with no foe in reach, and costs its energy", () => {
    const match = sim(vec2(300, 0));
    const caster = get(match, "n");
    caster.energy = 50;
    expect(damage(cast(match, INFERNO, "n"))).toEqual([]);
    expect(caster.energy).toBeLessThan(50 - 10 + 3);
  });
});

describe("Rodgort's Invocation (#1366)", () => {
  it("strikes and burns the target and a nearby foe, not a farther one", () => {
    const match = sim(
      vec2(300, 0),
      foe("b", vec2(0, AREA_NEARBY - 5)),
      foe("c", vec2(0, -(AREA_NEARBY + 20))),
    );
    expect(damage(cast(match, RODGORTS_INVOCATION, "a")).sort()).toEqual([
      ["a", 99],
      ["b", 99],
    ]);
    burnsFor(match, "a", 3);
    burnsFor(match, "b", 3);
    expect(get(match, "c").statuses.has("burning")).toBe(false);
  });
});

describe("Fire Storm (#1366)", () => {
  it("strikes a foe who stays for 29 each second, ten times", () => {
    const match = sim(vec2(300, 0));
    const log = cast(match, FIRE_STORM, "a");
    log.push(...stepFor(match, 10));
    expect(damage(log)).toEqual(Array.from({ length: 10 }, () => ["a", 29]));
  });

  it("stops striking a foe who walked out", () => {
    const match = sim(vec2(300, 0));
    match.setTarget("n", "a");
    expect(match.requestSkill("n", FIRE_STORM)?.check).toEqual({ ok: true });
    const log = stepFor(match, 2 + DT * 2);
    expect(damage(log)).toEqual([["a", 29]]);
    const walker = match.get("a");
    if (walker === undefined) {
      throw new Error("no participant a");
    }
    walker.position = vec2(0, AREA_ADJACENT + 50);
    expect(damage(stepFor(match, 10))).toEqual([]);
  });
});

describe("Mind Burn (#1366)", () => {
  const burnFoes = (energy: number): MatchSimulation => {
    const match = sim(vec2(300, 0), foe("b", vec2(0, AREA_ADJACENT - 5)));
    get(match, "n").energy = 50;
    get(match, "a").energy = energy;
    get(match, "b").energy = energy;
    return match;
  };

  it("against foes with less energy, strikes the target and an adjacent foe twice and burns them 8 s", () => {
    const match = burnFoes(10);
    expect(damage(cast(match, MIND_BURN, "a")).sort()).toEqual([
      ["a", 51],
      ["a", 51],
      ["b", 51],
      ["b", 51],
    ]);
    burnsFor(match, "a", 8);
    burnsFor(match, "b", 8);
  });

  it("against foes with more energy, strikes once and burns nobody", () => {
    const match = burnFoes(90);
    expect(damage(cast(match, MIND_BURN, "a")).sort()).toEqual([
      ["a", 51],
      ["b", 51],
    ]);
    expect(get(match, "a").statuses.has("burning")).toBe(false);
    expect(get(match, "b").statuses.has("burning")).toBe(false);
  });

  it("overcasts its caster by 5", () => {
    const match = burnFoes(10);
    cast(match, MIND_BURN, "a");
    expect(get(match, "n").overcast).toBeGreaterThan(4);
    expect(get(match, "n").overcast).toBeLessThanOrEqual(5);
  });
});

describe("Fire Magic texts (#1366)", () => {
  const lines = (id: string): string[] => {
    const found = getSkill(id);
    if (found === undefined) {
      throw new Error(`unknown skill ${id}`);
    }
    return describeSkill(found, new Map([[FIRE, 12]])).effects.map((effect) => effect.text);
  };

  it("says what each does", () => {
    expect({
      immolate: lines("elementalist.immolate"),
      flare: lines("elementalist.flare"),
      inferno: lines("elementalist.inferno"),
      flameBurst: lines("elementalist.flame-burst"),
      rodgorts: lines("elementalist.rodgorts-invocation"),
      fireStorm: lines("elementalist.fire-storm"),
      mindBurn: lines("elementalist.mind-burn"),
    }).toMatchInlineSnapshot(`
      {
        "fireStorm": [
          "Creates a symbol at your target's location for 10 seconds",
          "Every 1s for 10s, foes adjacent: deals 29 fire damage",
        ],
        "flameBurst": [
          "Deals 99 fire damage",
        ],
        "flare": [
          "Deals 56 fire damage",
          "If you are Overcast: adjacent foes take 56 fire damage",
          "Projectile: can be dodged",
        ],
        "immolate": [
          "Deals 64 fire damage",
          "Applies Burning for 3s (−7 Health degeneration)",
        ],
        "inferno": [
          "Deals 114 fire damage",
        ],
        "mindBurn": [
          "Deals 51 fire damage",
          "If you have more Energy than target: deals 51 fire damage",
          "If you have more Energy than target: applies Burning for 8s (−7 Health degeneration)",
        ],
        "rodgorts": [
          "Deals 99 fire damage",
          "Applies Burning for 3s (−7 Health degeneration)",
        ],
      }
    `);
  });
});
