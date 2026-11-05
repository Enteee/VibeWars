import { describe, expect, it } from "vitest";

import { AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import { getSkill, IMPLEMENTED_SKILLS } from "./catalog.js";
import type { CombatEvent } from "./effects.js";
import { NO_RANKS } from "./status.js";

/**
 * Corpse teleports (#2268): a random corpse in reach, a step onto it, and
 * a sacrifice that falls with rank. Consume Corpse and Necrotic Traversal.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CONSUME = "necromancer.consume-corpse";
const TRAVERSAL = "necromancer.necrotic-traversal";
const DEATH_MAGIC = "necromancer.death-magic";
const BAR = [CONSUME, TRAVERSAL];
/** Where the Traversal's target stands, its neighbour beside it. */
const FOE = vec2(600, 0);
/** Corpses to be, all in Consume Corpse's reach of the origin. */
const CORPSES: readonly Vec2[] = [vec2(0, 300), vec2(0, -300), vec2(-300, 0), vec2(-200, 200)];

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxEnergy: 100,
    ...extra,
  };
  return result;
}

/**
 * Necromancer `n` at the origin; foe `f` at `FOE`, foe `g` beside it, foe
 * `h` beside `n`; and `corpses` foes `c0`... at `CORPSES`, killed.
 */
function match(options: { rank?: number; corpses?: number; seed?: string } = {}) {
  const corpses = CORPSES.slice(0, options.corpses ?? 0);
  const sim = new MatchSimulation({
    seed: options.seed ?? "corpse-step-2268",
    participants: [
      spec("n", 0, vec2(0, 0), {
        skillBar: BAR,
        attributeRanks: new Map([[DEATH_MAGIC, options.rank ?? 12]]),
      }),
      spec("f", 1, FOE),
      spec("g", 1, vec2(FOE.x + AREA_NEARBY / 2, 0)),
      spec("h", 1, vec2(0, AREA_NEARBY / 2)),
      ...corpses.map((at, i) => spec(`c${String(i)}`, 1, at)),
    ],
  });
  for (const [i] of corpses.entries()) {
    const victim = get(sim, `c${String(i)}`);
    victim.combatant.statuses.apply("burning", 10, "n", NO_RANKS);
    victim.combatant.health = 0.2;
  }
  stepFor(sim, DT);
  return sim;
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `n` uses `skillId` on `targetId` through to its log entry; its events. */
function cast(sim: MatchSimulation, skillId: string, targetId?: string): CombatEvent[] {
  get(sim, "n").combatant.energy = 50; // Room for Consume Corpse's gain.
  sim.setTarget("n", targetId);
  expect(sim.requestSkill("n", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "n" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  stepFor(sim, 2 * DT);
  return log.flatMap((entry) => (entry.skillId === skillId ? entry.events : []));
}

/** The corpses `sim` has exploited, by id. */
function exploited(sim: MatchSimulation): string[] {
  return CORPSES.flatMap((_, i) => {
    const corpse = sim.get(`c${String(i)}`);
    return corpse?.corpseExploited === true ? [corpse.id] : [];
  });
}

function besideOf(sim: MatchSimulation, id: string): number {
  return distance(get(sim, "n").position, get(sim, id).position);
}

describe("the two are the corpus's (#2268)", () => {
  it("Consume Corpse: gwId 98, Death Magic, 5 energy, 1 s, no recharge, a random corpse", () => {
    expect(getSkill(CONSUME)).toMatchObject({
      gwId: 98,
      type: "spell",
      attributeId: DEATH_MAGIC,
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 0,
      target: "self",
      corpse: { radius: RANGE_SPELL, pick: "random", elseSacrificePercent: undefined },
    });
  });

  it("Necrotic Traversal: gwId 97, Death Magic, 5 energy, ¾ s, no recharge, at a foe", () => {
    expect(getSkill(TRAVERSAL)).toMatchObject({
      gwId: 97,
      type: "spell",
      attributeId: DEATH_MAGIC,
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0.75,
      rechargeSeconds: 0,
      target: "single-enemy",
      corpse: { radius: RANGE_SPELL, pick: "random" },
    });
  });

  it("a random pick is never also near the target or every corpse", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      if (skill.corpse?.pick === "random") {
        expect(skill.corpse.near, skill.id).toBeUndefined();
        expect(skill.corpse.all, skill.id).toBeUndefined();
      }
    }
  });
});

describe("a random corpse (#2268)", () => {
  it("is one in reach, the same for the same seed, and not always the nearest", () => {
    const picks = ["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) => {
      const sim = match({ corpses: CORPSES.length, seed });
      cast(sim, CONSUME);
      const [one, ...rest] = exploited(sim);
      expect(rest).toEqual([]);
      const again = match({ corpses: CORPSES.length, seed });
      cast(again, CONSUME);
      expect(exploited(again)).toEqual([one]);
      return one;
    });
    expect(new Set(picks).size).toBeGreaterThan(1);
  });

  it("is never one out of reach", () => {
    const sim = new MatchSimulation({
      seed: "corpse-step-far",
      participants: [
        spec("n", 0, vec2(0, 0), { skillBar: BAR }),
        spec("c0", 1, vec2(RANGE_SPELL + 50, 0)),
      ],
    });
    const corpse = get(sim, "c0");
    corpse.combatant.statuses.apply("burning", 10, "n", NO_RANKS);
    corpse.combatant.health = 0.2;
    stepFor(sim, DT);
    expect(corpse.combatant.dead).toBe(true);
    get(sim, "n").combatant.energy = 100;
    expect(sim.requestSkill("n", BAR.indexOf(CONSUME))?.check).toEqual({
      ok: false,
      reason: "no-corpse",
    });
  });
});

describe("Consume Corpse (#2268)", () => {
  it("cannot be used with no corpse, and costs nothing", () => {
    const sim = match();
    get(sim, "n").combatant.energy = 50;
    expect(sim.requestSkill("n", BAR.indexOf(CONSUME))?.check).toEqual({
      ok: false,
      reason: "no-corpse",
    });
    expect(get(sim, "n").combatant.energy).toBe(50);
  });

  it.each([
    [0, 25, 5],
    [12, 85, 17],
  ])(
    "at Death Magic %i steps onto the corpse it took, gains %i Health and %i Energy",
    (rank, health, energy) => {
      const sim = match({ rank, corpses: 1 });
      get(sim, "n").combatant.health = 100;
      const events = cast(sim, CONSUME);
      expect(exploited(sim)).toEqual(["c0"]);
      expect(besideOf(sim, "c0")).toBeLessThanOrEqual(2 * RULES.collision.playerRadius + 1);
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "heal", targetId: "n", amount: health }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "energy-gain", targetId: "n", amount: energy }),
      );
    },
  );
});

describe("Necrotic Traversal (#2268)", () => {
  it.each([
    [0, 30],
    [12, 22],
    [15, 20],
  ])("with no corpse, at Death Magic %i sacrifices %i% of max Health", (rank, percent) => {
    const sim = match({ rank });
    const max = get(sim, "n").combatant.maxHealth;
    const events = cast(sim, TRAVERSAL, "f");
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "sacrifice",
        targetId: "n",
        amount: Math.round((max * percent) / 100),
      }),
    );
  });

  it("with a corpse takes it and sacrifices nothing", () => {
    const sim = match({ corpses: 1 });
    const events = cast(sim, TRAVERSAL, "f");
    expect(exploited(sim)).toEqual(["c0"]);
    expect(events.filter(({ kind }) => kind === "sacrifice")).toEqual([]);
  });

  it.each([
    [0, 5],
    [12, 17],
  ])(
    "at Death Magic %i steps to the foe, Diseased 6 s, foes near it Poisoned %i s",
    (rank, poison) => {
      const sim = match({ rank, corpses: 1 });
      const events = cast(sim, TRAVERSAL, "f");
      expect(besideOf(sim, "f")).toBeLessThanOrEqual(2 * RULES.collision.playerRadius + 1);
      expect(events).toContainEqual(
        expect.objectContaining({
          kind: "status-applied",
          targetId: "n",
          statusId: "disease",
          durationSeconds: 6,
        }),
      );
      for (const foe of ["f", "g"]) {
        expect(events).toContainEqual(
          expect.objectContaining({
            kind: "status-applied",
            targetId: foe,
            statusId: "poison",
            durationSeconds: poison,
          }),
        );
      }
      // Near where the caster stood, not where it went.
      expect(events).not.toContainEqual(
        expect.objectContaining({ targetId: "h", statusId: "poison" }),
      );
    },
  );
});
