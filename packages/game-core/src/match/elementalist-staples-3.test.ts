import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_IN_THE_AREA, AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, getStatusDefinition, type StatusId } from "../skills/status.js";
import type { Combatant, Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Elementalist staples 3 (#1664): eleven Air and Earth spells on
 * primitives that already exist, and the two statuses they bring. Numbers
 * are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

const ENERVATING_CHARGE = "elementalist.enervating-charge";
const LIGHTNING_HAMMER = "elementalist.lightning-hammer";
const LIGHTNING_JAVELIN = "elementalist.lightning-javelin";
const ARC_LIGHTNING = "elementalist.arc-lightning";
const THUNDERCLAP = "elementalist.thunderclap";
const WINDBORNE_SPEED = "elementalist.windborne-speed";
const GLOWSTONE = "elementalist.glowstone";
const DRAGONS_STOMP = "elementalist.dragons-stomp";
const ERUPTION = "elementalist.eruption";
const ASH_BLAST = "elementalist.ash-blast";
const SHOCKWAVE = "elementalist.shockwave";
const POWER_ATTACK = "warrior.power-attack";
const BAR = [
  ENERVATING_CHARGE,
  LIGHTNING_HAMMER,
  LIGHTNING_JAVELIN,
  ARC_LIGHTNING,
  THUNDERCLAP,
  WINDBORNE_SPEED,
  GLOWSTONE,
  DRAGONS_STOMP,
  ERUPTION,
  ASH_BLAST,
  SHOCKWAVE,
];
const RANKS = new Map([
  ["elementalist.air-magic", 12],
  ["elementalist.earth-magic", 12],
  ["elementalist.energy-storage", 12],
  ["warrior.axe-mastery", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

function body(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...BAR, POWER_ATTACK],
    attributeRanks: RANKS,
    equipment: {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      mainHand: {
        weapon: WEAPONS.axe,
        attributeId: "warrior.axe-mastery",
        damageType: WEAPONS.axe.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    maxHealth: 1e4,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** Where the target `f` stands, in range of the caster `c` at the origin. */
const F = 300;

/**
 * Caster `c` at the origin, its ally `a` beside it. Foe `f` in range; `h`
 * and `k` adjacent to `f`, `g` near `f` but not adjacent, and `far`
 * beyond every area around `f`; any of them in `without` left out.
 */
function match(without: readonly string[] = []): MatchSimulation {
  return new MatchSimulation({
    seed: "elementalist-staples-3",
    participants: [
      body("c", 1, vec2(0, 0)),
      body("a", 1, vec2(0, 60)),
      body("f", 0, vec2(F, 0)),
      body("h", 0, vec2(F, 30)),
      body("k", 0, vec2(F, -30)),
      body("g", 0, vec2(F + AREA_NEARBY - 10, 0)),
      body("far", 0, vec2(F + AREA_NEARBY + 100, 0)),
    ].filter(({ id }) => !without.includes(id)),
  });
}

function get(sim: MatchSimulation, id: string): Combatant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `casterId` uses `skillId` on `targetId`: what that skill logged until it landed. */
function cast(
  sim: MatchSimulation,
  skillId: string,
  targetId = "f",
  casterId = "c",
): CombatEvent[] {
  sim.setTarget(casterId, targetId);
  expect(sim.requestSkill(casterId, BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  const log = stepFor(sim, skill(skillId).activationSeconds + 1.5);
  return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

/** Who took damage in `events`. */
function struck(events: readonly CombatEvent[]): Set<string> {
  return new Set(events.flatMap((event) => (event.kind === "damage" ? [event.targetId] : [])));
}

function hits(events: readonly CombatEvent[], id: string): number {
  return events.filter((event) => event.kind === "damage" && event.targetId === id).length;
}

function seconds(sim: MatchSimulation, id: string, statusId: StatusId) {
  return get(sim, id).statuses.get(statusId)?.durationSeconds;
}

it("the layout puts each foe where the areas assume", () => {
  expect(30).toBeLessThan(AREA_ADJACENT);
  expect(AREA_NEARBY - 10).toBeGreaterThan(AREA_ADJACENT);
  expect(AREA_NEARBY + 100).toBeGreaterThan(AREA_IN_THE_AREA);
  expect(F + AREA_NEARBY + 100).toBeLessThan(RANGE_SPELL + 200);
});

describe("the eleven are the corpus's (#1664)", () => {
  it.each([
    [ENERVATING_CHARGE, 224, "spell", false, "air-magic", 10, 1, 8],
    [LIGHTNING_HAMMER, 865, "spell", false, "air-magic", 25, 2, 4],
    [LIGHTNING_JAVELIN, 230, "spell", false, "air-magic", 5, 1, 5],
    [ARC_LIGHTNING, 842, "spell", false, "air-magic", 5, 1.5, 8],
    [THUNDERCLAP, 228, "spell", true, "air-magic", 10, 1, 8],
    [WINDBORNE_SPEED, 160, "enchantment", false, "air-magic", 10, 0.75, 5],
    [GLOWSTONE, 1661, "spell", false, "earth-magic", 5, 0.75, 7],
    [DRAGONS_STOMP, 1086, "spell", false, "earth-magic", 25, 3, 15],
    [ERUPTION, 167, "spell", false, "earth-magic", 25, 2, 30],
    [ASH_BLAST, 1085, "hex", false, "earth-magic", 5, 1, 10],
    [SHOCKWAVE, 937, "spell", true, "earth-magic", 10, 1, 15],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attribute, energy, activation, recharge) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId: `elementalist.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
      });
    },
  );

  it("every Air spell's damage has 25% armor penetration, and Earth's none", () => {
    for (const id of BAR) {
      const damage = JSON.stringify(skill(id).effects).match(/"armorPenetration":[\d.]+/g) ?? [];
      const air = skill(id).attributeId === "elementalist.air-magic";
      for (const each of damage) {
        expect(each, id).toBe(air ? '"armorPenetration":0.25' : '"armorPenetration":0');
      }
    }
  });

  it("Dragon's Stomp Exhausts its caster by 10", () => {
    expect(skill(DRAGONS_STOMP).overcast).toBe(10);
  });
});

describe("Air (#1664)", () => {
  it("Enervating Charge strikes for 45 and Weakens its target for 17 s, no one else", () => {
    expect(skill(ENERVATING_CHARGE).effects[0]).toMatchObject({
      type: "lightning",
      amount: { scaling: { atTwelve: 45 } },
    });
    const sim = match();
    expect(struck(cast(sim, ENERVATING_CHARGE))).toEqual(new Set(["f"]));
    expect(seconds(sim, "f", "weakness")).toBeCloseTo(17, 0);
  });

  it("Lightning Hammer strikes for 82, and its PvP split cracks no armor", () => {
    expect(skill(LIGHTNING_HAMMER).effects).toHaveLength(1);
    expect(skill(LIGHTNING_HAMMER).effects[0]).toMatchObject({
      amount: { scaling: { atTwelve: 82 } },
    });
    const sim = match();
    expect(struck(cast(sim, LIGHTNING_HAMMER))).toEqual(new Set(["f"]));
    expect(get(sim, "f").statuses.has("cracked-armor")).toBe(false);
  });

  describe("Lightning Javelin", () => {
    it("flies, and strikes for 43", () => {
      expect(skill(LIGHTNING_JAVELIN).projectile).toEqual({ speed: RANGE_SPELL });
      expect(skill(LIGHTNING_JAVELIN).effects[0]).toMatchObject({
        amount: { scaling: { atTwelve: 43 } },
      });
      expect(struck(cast(match(), LIGHTNING_JAVELIN))).toEqual(new Set(["f"]));
    });

    it("interrupts a foe's attack skill", () => {
      const sim = match();
      sim.walkTo("a", vec2(F - 30, 0));
      stepFor(sim, 3);
      sim.setTarget("c", "f");
      expect(sim.requestSkill("c", BAR.indexOf(LIGHTNING_JAVELIN))?.check).toEqual({ ok: true });
      // Thrown, it is in flight as `f` swings, and lands mid-swing.
      stepFor(sim, skill(LIGHTNING_JAVELIN).activationSeconds + 0.3);
      sim.setTarget("f", "a");
      expect(sim.requestSkill("f", BAR.length)?.check).toEqual({ ok: true });
      const events = stepFor(sim, 1)
        .filter((entry) => entry.skillId === LIGHTNING_JAVELIN)
        .flatMap((entry) => entry.events);
      expect(events).toContainEqual({ kind: "interrupted", targetId: "f", skillId: POWER_ATTACK });
    });

    it("leaves a foe casting a spell alone", () => {
      const sim = match();
      sim.setTarget("f", "c");
      expect(sim.requestSkill("f", BAR.indexOf(LIGHTNING_HAMMER))?.check).toEqual({ ok: true });
      sim.setTarget("c", "f");
      expect(sim.requestSkill("c", BAR.indexOf(LIGHTNING_JAVELIN))?.check).toEqual({ ok: true });
      const log = stepFor(sim, 1.9);
      const events = log.flatMap((entry) => entry.events);
      expect(hits(events, "f")).toBe(1);
      expect(events.filter((event) => event.kind === "interrupted")).toEqual([]);
      expect(get(sim, "f").cast.activeCast?.skillId).toBe(LIGHTNING_HAMMER);
    });
  });

  describe("Arc Lightning", () => {
    it("not Overcast, strikes its target for 33 and no one else", () => {
      expect(skill(ARC_LIGHTNING).effects[0]).toMatchObject({
        amount: { scaling: { atTwelve: 33 } },
      });
      expect(struck(cast(match(), ARC_LIGHTNING))).toEqual(new Set(["f"]));
    });

    it("Overcast, also strikes the two foes nearest its target for 71", () => {
      expect(JSON.stringify(skill(ARC_LIGHTNING).effects[1])).toContain('"atTwelve":71');
      const sim = match();
      get(sim, "c").overcast = 10;
      expect(struck(cast(sim, ARC_LIGHTNING))).toEqual(new Set(["f", "h", "k"]));
    });

    it("Overcast with one foe near the target, strikes that one", () => {
      const sim = match(["h", "k"]);
      get(sim, "c").overcast = 10;
      expect(struck(cast(sim, ARC_LIGHTNING))).toEqual(new Set(["f", "g"]));
    });
  });

  describe("Thunderclap", () => {
    it("strikes for 42 and Cracks Armor and Weakens for 17 s, the target and all foes near it", () => {
      expect(skill(THUNDERCLAP).effects[0]).toMatchObject({
        amount: { scaling: { atTwelve: 42 } },
      });
      const sim = match();
      expect(struck(cast(sim, THUNDERCLAP))).toEqual(new Set(["f", "h", "k", "g"]));
      for (const id of ["f", "h", "k", "g"]) {
        expect(seconds(sim, id, "cracked-armor"), id).toBeCloseTo(17, 0);
        expect(seconds(sim, id, "weakness"), id).toBeCloseTo(17, 0);
      }
      expect(get(sim, "far").statuses.has("weakness")).toBe(false);
    });

    it("interrupts a foe's spell", () => {
      const sim = match();
      sim.setTarget("f", "c");
      expect(sim.requestSkill("f", BAR.indexOf(LIGHTNING_HAMMER))?.check).toEqual({ ok: true });
      expect(cast(sim, THUNDERCLAP)).toContainEqual({
        kind: "interrupted",
        targetId: "f",
        skillId: LIGHTNING_HAMMER,
      });
    });
  });

  it("Windborne Speed has its ally move 33% faster for 11 s", () => {
    expect(getStatusDefinition("windborne-speed")).toMatchObject({
      category: "enchantment",
      moveSpeedMultiplier: 1.33,
    });
    const sim = match();
    cast(sim, WINDBORNE_SPEED, "a");
    expect(seconds(sim, "a", "windborne-speed")).toBe(11);
  });
});

describe("Earth (#1664)", () => {
  describe("Glowstone", () => {
    it("flies, and strikes for 41", () => {
      expect(skill(GLOWSTONE).projectile).toEqual({ speed: RANGE_SPELL });
      expect(skill(GLOWSTONE).effects[0]).toMatchObject({
        type: "earth",
        amount: { scaling: { atTwelve: 41 } },
      });
      expect(struck(cast(match(), GLOWSTONE))).toEqual(new Set(["f"]));
    });

    it("pays 11 energy back off a Weakened foe, and none off another", () => {
      const energyAfter = (weakened: boolean): number => {
        const sim = match();
        get(sim, "c").energy = 100;
        if (weakened) {
          get(sim, "f").statuses.apply("weakness", 20, "x", NO_RANKS);
        }
        cast(sim, GLOWSTONE);
        return get(sim, "c").energy;
      };
      expect(energyAfter(true) - energyAfter(false)).toBeCloseTo(11, 5);
    });
  });

  it("Dragon's Stomp knocks down and strikes for 85 the target and all foes near it", () => {
    expect(skill(DRAGONS_STOMP).effects[1]).toMatchObject({
      type: "earth",
      amount: { scaling: { atTwelve: 85.2 } },
    });
    const sim = match();
    const events = cast(sim, DRAGONS_STOMP);
    expect(struck(events)).toEqual(new Set(["f", "h", "k", "g"]));
    const down = events.flatMap((event) => (event.kind === "knocked-down" ? [event.targetId] : []));
    expect(new Set(down)).toEqual(new Set(["f", "h", "k", "g"]));
    expect(get(sim, "c").overcast).toBeGreaterThan(0);
  });

  it("Eruption strikes foes near where its target stood for 34, five times a second apart, and Blinds them for 10 s", () => {
    expect(JSON.stringify(skill(ERUPTION).effects)).toContain('"atTwelve":34');
    const sim = match();
    sim.setTarget("c", "f");
    expect(sim.requestSkill("c", BAR.indexOf(ERUPTION))?.check).toEqual({ ok: true });
    const log = stepFor(sim, skill(ERUPTION).activationSeconds + 7);
    const events = log
      .filter((entry) => entry.skillId === ERUPTION)
      .flatMap((entry) => entry.events);
    for (const id of ["f", "h", "k", "g"]) {
      expect(hits(events, id), id).toBe(5);
    }
    expect(hits(events, "far")).toBe(0);
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "status-applied",
        targetId: "f",
        statusId: "blind",
        durationSeconds: 10,
      }),
    );
  });

  it("Ash Blast strikes its target and adjacent foes for 59, and hexes only the burning ones", () => {
    expect(skill(ASH_BLAST).effects[0]).toMatchObject({ amount: { scaling: { atTwelve: 59 } } });
    expect(getStatusDefinition("ash-blast")).toMatchObject({
      category: "hex",
      attackMissChance: 0.64,
    });
    const sim = match();
    get(sim, "h").statuses.apply("burning", 10, "x", NO_RANKS);
    expect(struck(cast(sim, ASH_BLAST))).toEqual(new Set(["f", "h", "k"]));
    expect(seconds(sim, "h", "ash-blast")).toBeGreaterThan(3);
    expect(get(sim, "f").statuses.has("ash-blast")).toBe(false);
    expect(get(sim, "k").statuses.has("ash-blast")).toBe(false);
  });

  describe("Shockwave", () => {
    /**
     * `c` at the origin, `adj` adjacent, `near` nearby, `area` in the area
     * and `out` beyond it.
     */
    function rings(): MatchSimulation {
      return new MatchSimulation({
        seed: "elementalist-staples-3-shockwave",
        participants: [
          body("c", 1, vec2(0, 0)),
          body("adj", 0, vec2(30, 0)),
          body("near", 0, vec2(0, AREA_NEARBY - 10)),
          body("area", 0, vec2(-(AREA_IN_THE_AREA - 10), 0)),
          body("out", 0, vec2(0, -(AREA_IN_THE_AREA + 50))),
        ],
      });
    }

    it("strikes 51 per ring a foe stands in, each ring with its condition for 8 s", () => {
      expect(JSON.stringify(skill(SHOCKWAVE).effects).match(/"atTwelve":51/g)).toHaveLength(3);
      const sim = rings();
      expect(sim.requestSkill("c", BAR.indexOf(SHOCKWAVE))?.check).toEqual({ ok: true });
      const events = stepFor(sim, 1.5)
        .filter((entry) => entry.skillId === SHOCKWAVE)
        .flatMap((entry) => entry.events);
      expect(hits(events, "adj")).toBe(3);
      expect(hits(events, "near")).toBe(2);
      expect(hits(events, "area")).toBe(1);
      expect(hits(events, "out")).toBe(0);
      expect(hits(events, "c")).toBe(0);

      const has = (id: string) =>
        (["weakness", "cracked-armor", "blind"] as const).filter((status) =>
          get(sim, id).statuses.has(status),
        );
      expect(has("adj")).toEqual(["weakness", "cracked-armor", "blind"]);
      expect(has("near")).toEqual(["weakness", "cracked-armor"]);
      expect(has("area")).toEqual(["weakness"]);
      expect(has("out")).toEqual([]);
      expect(seconds(sim, "adj", "blind")).toBeGreaterThan(7);
    });
  });
});
