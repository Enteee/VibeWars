import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { resolveSkillEffects, type CombatEvent, type SkillOutcome } from "./effects.js";
import { NO_RANKS } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill, Surroundings } from "./types.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Elementalist staples (#2288): Searing Heat, Gust, Lightning Bolt,
 * Shatter Storm, Ride the Lightning and Mirror of Ice. The corpus's
 * numbers, at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ATTRIBUTES = [
  "elementalist.fire-magic",
  "elementalist.air-magic",
  "elementalist.water-magic",
];
const ranked = (rank: number) => new Map(ATTRIBUTES.map((id) => [id, rank]));

const SEARING = "elementalist.searing-heat";
const GUST = "elementalist.gust";
const BOLT = "elementalist.lightning-bolt";
const SHATTER = "elementalist.shatter-storm";
const RIDE = "elementalist.ride-the-lightning";
const MIRROR = "elementalist.mirror-of-ice";

const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function placed(...entries: readonly (readonly [Combatant, Vec2])[]): Surroundings {
  return new Map(
    entries.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );
}

/** `caster`, at `rank`, lands `id` on `target` among `surroundings`. */
function land(
  id: string,
  caster: Combatant,
  target: Combatant,
  surroundings: Surroundings,
): SkillOutcome {
  return resolveSkillEffects({
    skill: skill(id),
    caster,
    targets: [target],
    rng: steady(),
    rules: RULES.combat,
    surroundings,
  });
}

function elementalist(rank: number): Combatant {
  return makeCombatant({ id: "e", attributeRanks: ranked(rank) });
}

function foe(id: string): Combatant {
  return makeCombatant({ id, team: 1, maxHealth: 1e4, health: 1e4 });
}

function damageTo(events: readonly CombatEvent[], id: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === id ? [event.amount] : [],
  );
}

describe("the six are the corpus's (#2288)", () => {
  it.each([
    [SEARING, 196, "spell", false, 15, 2, 25, 0],
    [GUST, 843, "enchantment", true, 10, 0.75, 15, 0],
    [BOLT, 1369, "spell", false, 5, 1, 8, 0],
    [SHATTER, 933, "spell", true, 10, 1, 0, 0],
    // The PvP record's recharge (2807), on the base record's id.
    [RIDE, 836, "spell", true, 5, 1, 10, 5],
    [MIRROR, 1098, "hex", true, 10, 0.75, 15, 0],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, energy, activationSeconds, rechargeSeconds, overcast) => {
      expect(getSkill(id)).toMatchObject({
        gwId,
        type,
        elite,
        cost: { kind: "energy", amount: energy },
        activationSeconds,
        rechargeSeconds,
        overcast,
        range: RANGE_SPELL,
      });
    },
  );

  it("Lightning Bolt flies; the rest land at once", () => {
    expect(getSkill(BOLT)?.projectile).toBeDefined();
    expect(getSkill(RIDE)?.projectile).toBeUndefined();
  });
});

describe("Searing Heat (#2288)", () => {
  function spec(id: string, team: number, spawn: Vec2, rank = 0): ParticipantSpec {
    return {
      id,
      team,
      skillBar: id === "e" ? [SEARING] : [],
      attributeRanks: ranked(rank),
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxHealth: 1e5,
      maxEnergy: 100,
      spawn,
      facing: 0,
    };
  }

  function get(sim: MatchSimulation, id: string): Participant {
    const found = sim.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found;
  }

  /** `e` casts at `f`; `g` stands near `f`, `h` near it until `h` walks off. */
  function scene(rank: number) {
    const sim = new MatchSimulation({
      seed: "staples-ele-a",
      participants: [
        spec("e", 0, vec2(0, 0), rank),
        spec("f", 1, vec2(300, 0)),
        spec("g", 1, vec2(300, AREA_NEARBY * 0.6)),
        spec("h", 1, vec2(300, -AREA_NEARBY * 0.6)),
      ],
    });
    sim.setTarget("e", "f");
    expect(sim.requestSkill("e", 0)?.check).toEqual({ ok: true });
    return sim;
  }

  function struck(sim: MatchSimulation, seconds: number): CombatEvent[] {
    const events: CombatEvent[] = [];
    for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
      for (const entry of sim.step(DT).log) {
        if (entry.skillId === SEARING) {
          events.push(...entry.events);
        }
      }
    }
    return events;
  }

  it.each([
    [12, 34],
    [0, 10],
  ])("at rank %i strikes foes near the spot 5 times, then burns those still in it", (rank) => {
    const sim = scene(rank);
    // Cast, and two seconds of pulses; then `h` walks out.
    const early = struck(sim, 2 + 2.05);
    get(sim, "h").position = vec2(300, -AREA_NEARBY * 3);
    const late = struck(sim, 4);
    const all = [...early, ...late];
    for (const id of ["f", "g"]) {
      expect(damageTo(all, id)).toHaveLength(5);
      expect(get(sim, id).combatant.statuses.get("burning")?.durationSeconds).toBe(3);
    }
    // `h` was struck while in it, and is not set on fire.
    expect(damageTo(early, "h").length).toBeGreaterThan(0);
    expect(get(sim, "h").combatant.statuses.has("burning")).toBe(false);
  });

  it("holds one ground effect, and burns as it ends at 5 s (#2329)", () => {
    const sim = scene(0);
    struck(sim, 2 + 0.1);
    expect(sim.groundEffects.filter((effect) => effect.skillId === SEARING)).toHaveLength(1);
    struck(sim, 4.8);
    expect(get(sim, "f").combatant.statuses.has("burning")).toBe(false);
    struck(sim, 0.2);
    expect(get(sim, "f").combatant.statuses.has("burning")).toBe(true);
    expect(sim.groundEffects).toHaveLength(0);
  });

  it("says its Burning lands when it ends, and creates its symbol once (#2329)", () => {
    const lines = describeSkill(skill(SEARING), ranked(0), EN_WORDS, EN_NAMES).effects.map(
      (effect) => effect.text,
    );
    expect(lines).toEqual([
      "Creates a symbol at your target's location for 5 seconds",
      "Every 1s for 5s, foes nearby: deals 10 fire damage",
      "When it ends, foes nearby: applies Burning for 3s (−7 Health degeneration)",
    ]);
  });

  it("strikes 34 at rank 12 and 10 at rank 0, before armor", () => {
    const at = (rank: number) => {
      const sim = scene(rank);
      return damageTo(struck(sim, 8), "f")[0] ?? 0;
    };
    expect([at(12), at(0)]).toEqual([34, 10]);
  });
});

describe("Lightning Bolt (#2288)", () => {
  // 82 and 10 in one hit (#2330), through 60 armor a quarter pierced.
  it.each([
    [12, 106],
    [0, 13],
  ])("at rank %i strikes a moving foe once, twice as hard: %i", (rank, amount) => {
    const moving = foe("m");
    moving.moving = true;
    expect(damageTo(land(BOLT, elementalist(rank), moving, placed()).events, "m")).toEqual([
      amount,
    ]);
  });

  it("is 41 at rank 12 and 5 at rank 0, its armor penetration 25%", () => {
    const at = (rank: number) =>
      damageTo(land(BOLT, elementalist(rank), foe("f"), placed()).events, "f")[0];
    // 41 and 5 through 60 armor, a quarter of it pierced: ×2^(15/40).
    expect([at(12), at(0)]).toEqual([53, 6]);
    expect(getSkill(BOLT)?.effects[0]).toMatchObject({
      amount: { scaling: { atTwelve: 41 } },
      armorPenetration: 0.25,
    });
  });

  it("dodged, it deals neither its damage nor its bonus (#2330)", () => {
    const spec = (id: string, team: number, spawn: Vec2): ParticipantSpec => ({
      id,
      team,
      skillBar: id === "e" ? [BOLT] : [],
      attributeRanks: ranked(12),
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxHealth: 1e5,
      maxEnergy: 100,
      spawn,
      facing: 0,
    });
    const sim = new MatchSimulation({
      seed: "staples-ele-a",
      participants: [spec("e", 0, vec2(0, 0)), spec("f", 1, vec2(400, 0))],
    });
    sim.setTarget("e", "f");
    expect(sim.requestSkill("e", 0)?.check).toEqual({ ok: true });
    const events: CombatEvent[] = [];
    const run = (seconds: number) => {
      for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
        events.push(...sim.step(DT).log.flatMap((entry) => entry.events));
      }
    };
    run(1 + 2 * DT);
    expect(sim.projectiles.length).toBeGreaterThan(0);
    const dodger = sim.get("f");
    if (dodger === undefined) {
      throw new Error("no participant f");
    }
    dodger.position = vec2(0, 300);
    dodger.combatant.moving = true;
    run(2);
    expect(damageTo(events, "f")).toEqual([]);
  });
});

describe("Shatter Storm (#2288)", () => {
  it.each([
    [2, 14],
    [0, 0],
  ])("strips %i enchantments and is disabled 7 s more for each", (count, seconds) => {
    const f = foe("f");
    for (const id of ["aegis", "mending"].slice(0, count)) {
      f.statuses.apply(id as "aegis", 60, f.id, NO_RANKS);
    }
    const outcome = land(SHATTER, elementalist(0), f, placed());
    expect(f.statuses.countByCategory("enchantment")).toBe(0);
    expect(outcome.rechargeLongerSeconds).toBe(seconds);
  });
});

describe("Ride the Lightning (#2288)", () => {
  it.each([
    // Whole seconds: 4.2 is 4.
    [12, 4],
    [0, 1],
  ])("at rank %i steps to a foe, strikes it and blinds it and its neighbours", (rank, blind) => {
    const e = elementalist(rank);
    const f = foe("f");
    const g = foe("g");
    const far = foe("far");
    const { events } = land(
      RIDE,
      e,
      f,
      placed(
        [e, vec2(0, 0)],
        [f, vec2(300, 0)],
        [g, vec2(300, AREA_ADJACENT * 0.8)],
        [far, vec2(300, AREA_ADJACENT * 2)],
      ),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "shadow-stepped", targetId: "e", toId: "f" }),
    );
    expect(damageTo(events, "f")).toHaveLength(1);
    expect(damageTo(events, "g")).toEqual([]);
    expect(f.statuses.get("blind")?.durationSeconds).toBeCloseTo(blind);
    expect(g.statuses.get("blind")?.durationSeconds).toBeCloseTo(blind);
    expect(far.statuses.has("blind")).toBe(false);
  });

  it("is 58 at rank 12 and 10 at rank 0, with 25% armor penetration", () => {
    const at = (rank: number) =>
      damageTo(land(RIDE, elementalist(rank), foe("f"), placed()).events, "f")[0];
    // 58 and 10 through 60 armor, a quarter of it pierced: ×2^(15/40).
    expect([at(12), at(0)]).toEqual([75, 13]);
  });

  it("on an ally steps to them and blinds their neighbours, striking nobody", () => {
    const e = elementalist(12);
    const a = makeCombatant({ id: "a" });
    const g = foe("g");
    const { events } = land(
      RIDE,
      e,
      a,
      placed([e, vec2(0, 0)], [a, vec2(300, 0)], [g, vec2(300, AREA_ADJACENT * 0.8)]),
    );
    expect(events.filter(({ kind }) => kind === "damage")).toEqual([]);
    expect(a.statuses.has("blind")).toBe(false);
    expect(g.statuses.has("blind")).toBe(true);
  });
});

describe("Gust (#2288)", () => {
  /** `e` at the origin casts on ally `a` at 300; foes beside each, and `both` between when they stand close. */
  function scene(rank: number, apart = 300) {
    const e = elementalist(rank);
    const a = makeCombatant({ id: "a" });
    const nearMe = foe("nearMe");
    const nearAlly = foe("nearAlly");
    const away = foe("away");
    const surroundings = placed(
      [e, vec2(0, 0)],
      [a, vec2(apart, 0)],
      [nearMe, vec2(0, AREA_ADJACENT * 0.8)],
      [nearAlly, vec2(apart, AREA_ADJACENT * 0.8)],
      [away, vec2(apart / 2, AREA_ADJACENT * 3)],
    );
    return { e, a, nearMe, nearAlly, away, surroundings };
  }

  it.each([
    // Whole seconds: 9.8 is 10.
    [12, 10],
    [0, 5],
  ])("at rank %i speeds you and the ally, and strikes the foes beside either", (rank, seconds) => {
    const { e, a, nearMe, nearAlly, away, surroundings } = scene(rank);
    const { events } = land(GUST, e, a, surroundings);
    expect(e.statuses.get("gust")?.durationSeconds).toBeCloseTo(seconds);
    expect(a.statuses.get("gust")?.durationSeconds).toBeCloseTo(seconds);
    expect(damageTo(events, "nearMe")).toHaveLength(1);
    expect(damageTo(events, "nearAlly")).toHaveLength(1);
    expect(damageTo(events, "away")).toEqual([]);
    expect(nearMe.knockdownRemaining + nearAlly.knockdownRemaining + away.knockdownRemaining).toBe(
      0,
    );
  });

  it("is 59 cold at rank 12 and 15 at rank 0", () => {
    const at = (rank: number) => {
      const { e, a, surroundings } = scene(rank);
      return damageTo(land(GUST, e, a, surroundings).events, "nearMe")[0];
    };
    expect([at(12), at(0)]).toEqual([59, 15]);
  });

  it("knocks down a struck foe that is moving or attacking, not one that is not", () => {
    const { e, a, nearMe, nearAlly, away, surroundings } = scene(12);
    nearMe.moving = true;
    nearAlly.attack = { targetId: "a", swingElapsed: 0, unreachableSeconds: 0 };
    away.moving = true;
    land(GUST, e, a, surroundings);
    expect(nearMe.knockdownRemaining).toBeGreaterThan(0);
    expect(nearAlly.knockdownRemaining).toBeGreaterThan(0);
    expect(away.knockdownRemaining).toBe(0);
  });

  it("strikes a foe beside both you and the ally once", () => {
    const { e, a, nearMe, surroundings } = scene(12, AREA_ADJACENT);
    // `nearMe` is within reach of both now.
    expect(damageTo(land(GUST, e, a, surroundings).events, nearMe.id)).toHaveLength(1);
  });

  it("says whom it knocks down", () => {
    const text = describeSkill(skill(GUST), ranked(12), EN_WORDS, EN_NAMES)
      .effects.map((line) => line.text)
      .join("\n");
    expect(text).toMatch(/Adjacent foes around the target and you take 59 cold damage/);
    expect(text).toMatch(/while attacking or moving are knocked down/);
  });
});

describe("Mirror of Ice (#2288)", () => {
  function scene(rank: number, apart = 300) {
    const e = elementalist(rank);
    const a = makeCombatant({ id: "a" });
    const nearMe = foe("nearMe");
    const nearAlly = foe("nearAlly");
    const away = foe("away");
    const surroundings = placed(
      [e, vec2(0, 0)],
      [a, vec2(apart, 0)],
      [nearMe, vec2(0, AREA_NEARBY * 0.8)],
      [nearAlly, vec2(apart, AREA_NEARBY * 0.8)],
      [away, vec2(apart / 2, AREA_NEARBY * 3)],
    );
    return { e, a, nearMe, nearAlly, away, surroundings };
  }

  it.each([
    // Whole seconds: 5.2 is 5.
    [12, 5],
    [0, 2],
  ])("at rank %i strikes and slows the foes near you or the ally", (rank, seconds) => {
    const { e, a, nearMe, nearAlly, away, surroundings } = scene(rank);
    const { events } = land(MIRROR, e, a, surroundings);
    for (const struck of [nearMe, nearAlly]) {
      expect(damageTo(events, struck.id)).toHaveLength(1);
      expect(struck.statuses.get("mirror-of-ice")?.durationSeconds).toBeCloseTo(seconds);
    }
    expect(damageTo(events, away.id)).toEqual([]);
    expect(away.statuses.has("mirror-of-ice")).toBe(false);
  });

  it("is 59 cold at rank 12 and 15 at rank 0", () => {
    const at = (rank: number) => {
      const { e, a, surroundings } = scene(rank);
      return damageTo(land(MIRROR, e, a, surroundings).events, "nearAlly")[0];
    };
    expect([at(12), at(0)]).toEqual([59, 15]);
  });

  it("strikes a foe near both you and the ally once", () => {
    const { e, a, nearMe, surroundings } = scene(12, AREA_NEARBY / 2);
    expect(damageTo(land(MIRROR, e, a, surroundings).events, nearMe.id)).toHaveLength(1);
  });

  it("says when it recharges faster", () => {
    const text = describeSkill(skill(MIRROR), ranked(12), EN_WORDS, EN_NAMES)
      .effects.map((line) => line.text)
      .join("\n");
    expect(text).toMatch(
      /If it strikes a foe that has a Water Magic hex: this skill recharges 50% faster/,
    );
  });

  it("recharges 50% faster when it strikes a foe with a Water Magic hex, not its own", () => {
    const fresh = scene(12);
    expect(land(MIRROR, fresh.e, fresh.a, fresh.surroundings).rechargeFraction).toBe(0);

    const hexed = scene(12);
    hexed.nearAlly.statuses.apply("ice-spikes", 10, "other", NO_RANKS);
    expect(land(MIRROR, hexed.e, hexed.a, hexed.surroundings).rechargeFraction).toBe(0.5);

    const otherHex = scene(12);
    otherHex.nearAlly.statuses.apply("barbs", 10, "other", NO_RANKS);
    expect(land(MIRROR, otherHex.e, otherHex.a, otherHex.surroundings).rechargeFraction).toBe(0);

    const outOfReach = scene(12);
    outOfReach.away.statuses.apply("ice-spikes", 10, "other", NO_RANKS);
    expect(land(MIRROR, outOfReach.e, outOfReach.a, outOfReach.surroundings).rechargeFraction).toBe(
      0,
    );
  });
});
