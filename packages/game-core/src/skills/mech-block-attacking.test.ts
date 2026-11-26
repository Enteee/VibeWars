import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { getStatusDefinition } from "./status.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Flashing Blades, Winter's Embrace, Tease, Signet of Recall and
 * Watchful Healing (#2374): a block only while attacking, a hex that
 * hurts a moving foe, an area interrupt that steals energy, energy on an
 * effect's end and a heal on an enchantment's early end. The corpus's
 * numbers, at rank 12 and at rank 0. Nothing crits.
 */

const RULES: Ruleset = {
  ...MINIMAL_GW_INSPIRED_PVP_V1,
  combat: {
    ...MINIMAL_GW_INSPIRED_PVP_V1.combat,
    criticalBaseChance: 0,
    criticalChancePerRank: 0,
  },
};
const DT = 1 / RULES.tickRateHz;
const ATTRIBUTES = [
  "assassin.dagger-mastery",
  "elementalist.water-magic",
  "mesmer.inspiration-magic",
  "monk.divine-favor",
];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A body that neither regenerates energy nor dies, at `rank` in every attribute here. */
function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[],
  rank: number,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks: new Map(ATTRIBUTES.map((attributeId) => [attributeId, rank])),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 100,
    baseEnergyPips: 0,
    spawn,
    facing: team === 0 ? 0 : Math.PI,
  };
}

function simOf(participants: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({ seed: "block-attacking", ruleset: RULES, participants });
}

function get(sim: MatchSimulation, id: string): Combatant {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `id` uses its skill in `slot` on `targetId`, and the activation runs out. */
function cast(sim: MatchSimulation, id: string, slot: number, targetId: string): CombatLogEntry[] {
  sim.setTarget(id, targetId);
  expect(sim.requestSkill(id, slot)?.check).toEqual({ ok: true });
  return stepFor(sim, skill(get(sim, id).skillBar[slot] ?? "").activationSeconds + 0.1);
}

/** Every `kind` amount on `targetId` that `skillId`'s entries in `log` carry. */
function amounts(
  log: readonly CombatLogEntry[],
  skillId: string,
  kind: "damage" | "heal" | "energy-gain",
  targetId: string,
): number[] {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .flatMap((event) => (event.kind === kind && event.targetId === targetId ? [event.amount] : []));
}

describe("the five are the corpus's (#2374)", () => {
  it.each([
    ["assassin.flashing-blades", 1042, "stance", "assassin.dagger-mastery", 10, 0, 30, true],
    ["elementalist.winters-embrace", 1999, "hex", "elementalist.water-magic", 10, 0.75, 15, false],
    ["mesmer.tease", 1342, "spell", "mesmer.inspiration-magic", 5, 0.25, 20, true],
    ["mesmer.signet-of-recall", 1993, "signet", "mesmer.inspiration-magic", 0, 0.25, 20, false],
    ["monk.watchful-healing", 1392, "enchantment", "monk.divine-favor", 5, 1, 10, false],
  ] as const)(
    "%s: gwId %i, %s, %s, %i energy, %d s, %i s recharge, elite %s",
    (id, gwId, type, attributeId, energy, activation, recharge, elite) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        attributeId,
        cost: energy === 0 ? undefined : { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        elite,
      });
    },
  );
});

describe("Flashing Blades (#2374)", () => {
  /** `a` at `rank` stands in Flashing Blades beside `f`, who swings at it. */
  function stance(rank: number) {
    const sim = simOf([
      spec("a", 0, vec2(0, 0), ["assassin.flashing-blades"], rank),
      spec("f", 1, vec2(RANGE_MELEE / 2, 0), [], 0),
    ]);
    get(sim, "a").energy = 100;
    cast(sim, "a", 0, "a");
    expect(sim.requestAttack("f", "a")).toEqual({ ok: true });
    return sim;
  }

  it.each([
    [12, 25, 17],
    [0, 5, 5],
  ])("at rank %i lasts %i s, and a block hurts the attacker %i", (rank, seconds, damage) => {
    const sim = stance(rank);
    expect(Math.round(get(sim, "a").statuses.get("flashing-blades")?.remainingSeconds ?? 0)).toBe(
      seconds,
    );
    expect(sim.requestAttack("a", "f")).toEqual({ ok: true });
    const hurt = amounts(stepFor(sim, 4), "assassin.flashing-blades", "damage", "f");
    expect(hurt.length).toBeGreaterThan(0);
    expect(new Set(hurt)).toEqual(new Set([damage]));
  });

  it("standing idle, it blocks nothing and hurts no attacker", () => {
    const log = stepFor(stance(12), 4);
    expect(log.flatMap((entry) => entry.events).some((e) => e.kind === "attack-blocked")).toBe(
      false,
    );
    expect(amounts(log, "assassin.flashing-blades", "damage", "f")).toEqual([]);
  });
});

describe("Winter's Embrace (#2374)", () => {
  /** `e` at `rank` hexes `x`; `x` walks off when `walks`. */
  function hexed(rank: number, walks: boolean) {
    const sim = simOf([
      spec("e", 0, vec2(0, 0), ["elementalist.winters-embrace"], rank),
      spec("x", 1, vec2(200, 0), [], 0),
    ]);
    get(sim, "e").energy = 100;
    cast(sim, "e", 0, "x");
    if (walks) {
      sim.walkTo("x", vec2(2000, 0));
    }
    return { sim, x: get(sim, "x") };
  }

  it.each([
    [12, 5, 13],
    [0, 2, 5],
  ])("at rank %i lasts %i s and hurts a moving foe %i a second", (rank, seconds, damage) => {
    const { sim, x } = hexed(rank, true);
    expect(Math.round(x.statuses.get("winters-embrace")?.remainingSeconds ?? 0)).toBe(seconds);
    const hurt = amounts(stepFor(sim, 1.5), "elementalist.winters-embrace", "damage", "x");
    expect(hurt.length).toBeGreaterThan(0);
    expect(new Set(hurt)).toEqual(new Set([damage]));
  });

  it("slows the foe to 34%", () => {
    const { x } = hexed(12, false);
    expect(x.statuses.has("winters-embrace")).toBe(true);
    expect(getStatusDefinition("winters-embrace").moveSpeedMultiplier).toBe(0.34);
  });

  it("a foe standing still takes nothing", () => {
    const { sim } = hexed(12, false);
    expect(amounts(stepFor(sim, 3), "elementalist.winters-embrace", "damage", "x")).toEqual([]);
  });
});

describe("Tease (#2374)", () => {
  /** `m` at `rank` Teases `x`, casting when `casting`, beside `y`, casting too; `z` far off. */
  function teased(rank: number, casting: boolean) {
    const sim = simOf([
      spec("m", 0, vec2(0, 0), ["mesmer.tease"], rank),
      spec("x", 1, vec2(300, 0), [], 0),
      spec("y", 1, vec2(330, 0), [], 0),
      spec("z", 1, vec2(900, 0), [], 0),
    ]);
    const [m, x, y, z] = ["m", "x", "y", "z"].map((id) => get(sim, id));
    if (m === undefined || x === undefined || y === undefined || z === undefined) {
      throw new Error("missing participant");
    }
    m.energy = 50;
    for (const foe of [x, y, z]) {
      foe.energy = 20;
    }
    if (casting) {
      x.cast.beginCast("elementalist.fireball", "m", 2, undefined);
    }
    y.cast.beginCast("elementalist.fireball", "m", 2, undefined);
    z.cast.beginCast("elementalist.fireball", "m", 2, undefined);
    cast(sim, "m", 0, "x");
    return { m, x, y, z };
  }

  it.each([
    [12, 4],
    [0, 0],
  ])(
    "at rank %i interrupts the foe and those in the area, stealing %i from each",
    (rank, stolen) => {
      const { m, x, y, z } = teased(rank, true);
      expect([x.cast.activeCast, y.cast.activeCast]).toEqual([undefined, undefined]);
      expect(z.cast.activeCast).toBeDefined();
      expect([x.energy, y.energy, z.energy]).toEqual([20 - stolen, 20 - stolen, 20]);
      expect(m.energy).toBe(45 + 2 * stolen);
    },
  );

  it("on a foe using no skill, does nothing, but recharges", () => {
    const { m, y } = teased(12, false);
    expect(y.cast.activeCast).toBeDefined();
    expect([m.energy, y.energy]).toEqual([45, 20]);
    expect(m.cast.rechargeRemaining.get("mesmer.tease")).toBeGreaterThan(19);
  });
});

describe("Signet of Recall (#2374)", () => {
  /** `m` at `rank` uses Signet of Recall. */
  function recalled(rank: number) {
    const sim = simOf([spec("m", 0, vec2(0, 0), ["mesmer.signet-of-recall"], rank)]);
    const m = get(sim, "m");
    m.energy = 50;
    cast(sim, "m", 0, "m");
    return { sim, m };
  }

  it("drains 4 pips of Energy for 6 s", () => {
    const { sim, m } = recalled(12);
    expect(m.statuses.get("signet-of-recall")?.remainingSeconds).toBeCloseTo(5.9, 1);
    const participant = sim.get("m");
    expect(participant === undefined ? undefined : sim.pips(participant).energy).toBe(-4);
  });

  it.each([
    [12, 19],
    [0, 13],
  ])("at rank %i gives %i Energy when it runs out", (rank, gained) => {
    const { sim } = recalled(rank);
    expect(amounts(stepFor(sim, 5.5), "mesmer.signet-of-recall", "energy-gain", "m")).toEqual([]);
    expect(amounts(stepFor(sim, 1), "mesmer.signet-of-recall", "energy-gain", "m")).toEqual([
      gained,
    ]);
  });

  it("removed early, gives its Energy then", () => {
    const { sim, m } = recalled(12);
    stepFor(sim, 2);
    const before = m.energy;
    m.statuses.remove("signet-of-recall");
    sim.step(DT);
    expect(m.energy - before).toBeCloseTo(19, 0);
  });
});

describe("Watchful Healing (#2374)", () => {
  /** `p` at `rank` enchants `a`, hurt. */
  function watched(rank: number) {
    const sim = simOf([
      spec("p", 0, vec2(0, 0), ["monk.watchful-healing"], rank),
      spec("a", 0, vec2(100, 0), [], 0),
    ]);
    get(sim, "p").energy = 50;
    get(sim, "a").health = 1000;
    cast(sim, "p", 0, "a");
    return { sim, a: get(sim, "a") };
  }

  it.each([
    [12, 3, 102],
    [0, 1, 30],
  ])(
    "at rank %i gives +%i Health regeneration, and %i Health if it ends early",
    (rank, pips, heal) => {
      const { sim, a } = watched(rank);
      const participant = sim.get("a");
      expect(participant === undefined ? undefined : sim.pips(participant).health).toBe(pips);
      stepFor(sim, 3);
      a.statuses.remove("watchful-healing");
      expect(amounts(stepFor(sim, 0.2), "monk.watchful-healing", "heal", "a")).toEqual([heal]);
    },
  );

  it("running its full 10 s heals nothing", () => {
    const { sim, a } = watched(12);
    expect(a.statuses.get("watchful-healing")?.remainingSeconds).toBeGreaterThan(9.5);
    const log = stepFor(sim, 11);
    expect(a.statuses.has("watchful-healing")).toBe(false);
    expect(amounts(log, "monk.watchful-healing", "heal", "a")).toEqual([]);
  });
});
