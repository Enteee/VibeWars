import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_IN_THE_AREA, AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";

/**
 * Caster staples (#1870): Blood Renewal, Meekness, Ethereal Burden, Sum of
 * All Fears, Grasping Earth, Breath of Fire, Aura of Stability and Healing
 * Ring. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["necromancer.blood-magic", 12],
  ["necromancer.curses", 12],
  ["mesmer.illusion-magic", 12],
  ["elementalist.earth-magic", 12],
  ["elementalist.fire-magic", 12],
  ["monk.protection-prayers", 12],
  ["monk.healing-prayers", 12],
]);

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

/** Every `kind` event `skillId` caused in `log`. */
function eventsOf(
  log: readonly CombatLogEntry[],
  skillId: string,
  kind: CombatEvent["kind"],
): CombatEvent[] {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .filter((event) => event.kind === kind);
}

/** `caster` casts its first skill on `target` and the cast resolves. */
function cast(match: MatchSimulation, caster: string, target: string): CombatLogEntry[] {
  match.setTarget(caster, target);
  expect(match.requestSkill(caster, 0)?.check).toEqual({ ok: true });
  return stepFor(match, 2.5);
}

describe("caster staples' data (#1870)", () => {
  it.each([
    ["necromancer.blood-renewal", 115, "enchantment", "blood-magic", 1, 1, 7, "self"],
    ["necromancer.meekness", 1260, "hex", "curses", 15, 1, 20, "single-enemy"],
    ["mesmer.ethereal-burden", 45, "hex", "illusion-magic", 15, 1.5, 30, "single-enemy"],
    ["mesmer.sum-of-all-fears", 1996, "hex", "illusion-magic", 10, 1.5, 10, "single-enemy"],
    ["elementalist.grasping-earth", 173, "hex", "earth-magic", 10, 0.75, 12, "self"],
    ["elementalist.breath-of-fire", 1094, "spell", "fire-magic", 5, 2, 10, "single-enemy"],
    [
      "monk.aura-of-stability",
      2063,
      "enchantment",
      "protection-prayers",
      5,
      0.25,
      12,
      "single-other-ally",
    ],
    ["monk.healing-ring", 1262, "spell", "healing-prayers", 5, 1, 10, "self"],
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
});

describe("Blood Renewal (#1870)", () => {
  function renewed(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "blood-renewal",
      participants: [spec("n", 0, vec2(0, 0), ["necromancer.blood-renewal"], 0.2)],
    });
    cast(match, "n", "n");
    expect(get(match, "n").combatant.statuses.get("blood-renewal")?.durationSeconds).toBe(7);
    return match;
  }

  it("costs 15% of maximum Health up front", () => {
    const match = new MatchSimulation({
      seed: "blood-renewal-sacrifice",
      participants: [spec("n", 0, vec2(0, 0), ["necromancer.blood-renewal"])],
    });
    expect(eventsOf(cast(match, "n", "n"), "necromancer.blood-renewal", "sacrifice")).toEqual([
      { kind: "sacrifice", targetId: "n", amount: 75 },
    ]);
  });

  it("gives +5 regeneration", () => {
    expect(aggregateModifiers([{ id: "blood-renewal", ranks: NO_RANKS }]).healthPips).toBe(5);
  });

  it("heals 160 when it runs out", () => {
    const match = renewed();
    expect(eventsOf(stepFor(match, 4), "necromancer.blood-renewal", "heal")).toEqual([]);
    expect(eventsOf(stepFor(match, 2), "necromancer.blood-renewal", "heal")).toEqual([
      { kind: "heal", targetId: "n", amount: 160 },
    ]);
  });

  it("and when it is stripped, at once", () => {
    const match = renewed();
    get(match, "n").combatant.statuses.removeByCategory("enchantment");
    expect(eventsOf(stepFor(match, DT), "necromancer.blood-renewal", "heal")).toEqual([
      { kind: "heal", targetId: "n", amount: 160 },
    ]);
  });
});

describe("Meekness (#1870)", () => {
  it("hexes the target and a foe in the area for 25 s, not one far away, for 17% Health", () => {
    const match = new MatchSimulation({
      seed: "meekness",
      participants: [
        spec("n", 0, vec2(0, 0), ["necromancer.meekness"]),
        spec("a", 1, vec2(300, 0)),
        spec("b", 1, vec2(300 + AREA_IN_THE_AREA / 2, 0)),
        spec("c", 1, vec2(300 + AREA_IN_THE_AREA + 50, 0)),
      ],
    });
    // 17% of 500, once however many foes it reaches.
    expect(eventsOf(cast(match, "n", "a"), "necromancer.meekness", "sacrifice")).toEqual([
      { kind: "sacrifice", targetId: "n", amount: 85 },
    ]);
    expect(get(match, "a").combatant.statuses.get("meekness")?.durationSeconds).toBe(25);
    expect(get(match, "b").combatant.statuses.has("meekness")).toBe(true);
    expect(get(match, "c").combatant.statuses.has("meekness")).toBe(false);
    expect(aggregateModifiers([{ id: "meekness", ranks: NO_RANKS }]).attackDurationMultiplier).toBe(
      1.5,
    );
  });
});

describe("Ethereal Burden (#1870)", () => {
  function burdened(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "ethereal-burden",
      participants: [
        spec("m", 0, vec2(0, 0), ["mesmer.ethereal-burden"]),
        spec("a", 1, vec2(300, 0)),
      ],
    });
    cast(match, "m", "a");
    expect(get(match, "a").combatant.statuses.get("ethereal-burden")?.sourceId).toBe("m");
    get(match, "m").combatant.energy = 0;
    return match;
  }

  it("slows its target by half for 11 s", () => {
    expect(
      aggregateModifiers([{ id: "ethereal-burden", ranks: NO_RANKS }]).moveSpeedMultiplier,
    ).toBe(0.5);
    const match = burdened();
    expect(get(match, "a").combatant.statuses.get("ethereal-burden")?.durationSeconds).toBe(11);
  });

  it("gives its caster 16 energy when it runs out", () => {
    const match = burdened();
    expect(eventsOf(stepFor(match, 8), "mesmer.ethereal-burden", "energy-gain")).toEqual([]);
    expect(eventsOf(stepFor(match, 2), "mesmer.ethereal-burden", "energy-gain")).toEqual([
      { kind: "energy-gain", targetId: "m", amount: 16 },
    ]);
  });

  it("and when it is removed, at once", () => {
    const match = burdened();
    get(match, "a").combatant.statuses.removeByCategory("hex");
    expect(eventsOf(stepFor(match, DT), "mesmer.ethereal-burden", "energy-gain")).toEqual([
      { kind: "energy-gain", targetId: "m", amount: 16 },
    ]);
  });
});

describe("Sum of All Fears (#1870)", () => {
  it("makes its target move, attack and cast a third slower", () => {
    expect(aggregateModifiers([{ id: "sum-of-all-fears", ranks: NO_RANKS }])).toMatchObject({
      moveSpeedMultiplier: 0.67,
      attackDurationMultiplier: 1.33,
      castTimeMultiplier: 1.33,
    });
  });
});

describe("Grasping Earth (#1870)", () => {
  it("hexes every nearby foe for 17 s, not one beyond nor an ally", () => {
    const match = new MatchSimulation({
      seed: "grasping-earth",
      participants: [
        spec("e", 0, vec2(0, 0), ["elementalist.grasping-earth"]),
        spec("ally", 0, vec2(-AREA_NEARBY / 2, 0)),
        spec("a", 1, vec2(AREA_NEARBY / 2, 0)),
        spec("b", 1, vec2(0, AREA_NEARBY - 10)),
        spec("c", 1, vec2(AREA_NEARBY + 50, 0)),
      ],
    });
    cast(match, "e", "e");
    expect(get(match, "a").combatant.statuses.get("grasping-earth")?.durationSeconds).toBe(17);
    expect(get(match, "b").combatant.statuses.has("grasping-earth")).toBe(true);
    expect(get(match, "c").combatant.statuses.has("grasping-earth")).toBe(false);
    expect(get(match, "ally").combatant.statuses.has("grasping-earth")).toBe(false);
    expect(
      aggregateModifiers([{ id: "grasping-earth", ranks: NO_RANKS }]).moveSpeedMultiplier,
    ).toBe(0.5);
  });
});

describe("Breath of Fire (#1870)", () => {
  it("strikes a foe standing in it 5 times, one outside never", () => {
    const match = new MatchSimulation({
      seed: "breath-of-fire",
      participants: [
        spec("e", 0, vec2(0, 0), ["elementalist.breath-of-fire"]),
        spec("a", 1, vec2(300, 0)),
        spec("b", 1, vec2(300 + AREA_ADJACENT + 50, 0)),
      ],
    });
    match.setTarget("e", "a");
    expect(match.requestSkill("e", 0)?.check).toEqual({ ok: true });
    const log = stepFor(match, 9);
    const hits = (id: string) =>
      eventsOf(log, "elementalist.breath-of-fire", "damage").filter(
        (event) => event.kind === "damage" && event.targetId === id,
      );
    expect(hits("a")).toHaveLength(5);
    expect(hits("b")).toEqual([]);
  });
});

describe("Aura of Stability (#1870)", () => {
  it("keeps another ally from being knocked down for 7 s", () => {
    const match = new MatchSimulation({
      seed: "aura-of-stability",
      participants: [
        spec("mo", 0, vec2(0, 0), ["monk.aura-of-stability"]),
        spec("ally", 0, vec2(200, 0)),
      ],
    });
    cast(match, "mo", "ally");
    expect(get(match, "ally").combatant.statuses.get("aura-of-stability")?.durationSeconds).toBe(7);
    expect(describeStatus("aura-of-stability")).toBe("cannot be knocked down");
  });

  it("refuses its caster", () => {
    const match = new MatchSimulation({
      seed: "aura-of-stability-self",
      participants: [spec("mo", 0, vec2(0, 0), ["monk.aura-of-stability"])],
    });
    match.setTarget("mo", "mo");
    expect(match.requestSkill("mo", 0)?.check.ok).toBe(false);
  });
});

describe("Healing Ring (#1870)", () => {
  it("heals an adjacent ally and foe for 150, not its caster nor one further off", () => {
    const match = new MatchSimulation({
      seed: "healing-ring",
      participants: [
        spec("mo", 0, vec2(0, 0), ["monk.healing-ring"], 0.5),
        spec("ally", 0, vec2(AREA_ADJACENT / 2, 0), [], 0.5),
        spec("foe", 1, vec2(-AREA_ADJACENT / 2, 0), [], 0.5),
        spec("far", 0, vec2(AREA_ADJACENT + 50, 0), [], 0.5),
      ],
    });
    const heals = eventsOf(cast(match, "mo", "mo"), "monk.healing-ring", "heal");
    expect(heals).toHaveLength(2);
    expect(heals).toContainEqual({ kind: "heal", targetId: "ally", amount: 150 });
    expect(heals).toContainEqual({ kind: "heal", targetId: "foe", amount: 150 });
  });
});
