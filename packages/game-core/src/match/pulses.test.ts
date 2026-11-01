import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { segment, type Segment } from "../geometry.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Pulses (#1113): a ground effect that lands its effects again and
 * again, the first the step it is placed, then one every interval, on
 * whoever its area takes around it, from its owner. Symbol of Wrath is
 * the catalog's.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SYMBOL = "monk.symbol-of-wrath";
const SMITING = "monk.smiting-prayers";

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [SYMBOL],
    attributeRanks: new Map([[SMITING, 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** `m`, the monk, on team 0 at the origin, `f` a foe at (200, 0), and whoever else `others` adds. */
function match(others: ParticipantSpec[] = [], walls: readonly Segment[] = []): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "pulses",
    participants: [spec("m", 0, vec2(0, 0)), spec("f", 1, vec2(200, 0)), ...others],
    walls,
  });
  for (const participant of sim.participants()) {
    participant.combatant.maxHealth = 1e4;
    participant.combatant.health = 1e4;
  }
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

/** `m` casts Symbol of Wrath at `f`, and the steps until it lands. */
function castSymbol(sim: MatchSimulation): CombatLogEntry[] {
  sim.setTarget("m", "f");
  expect(sim.requestSkill("m", 0)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  while (sim.groundEffects.length === 0) {
    const stepped = sim.step(DT);
    log.push(...stepped.log);
    expect(stepped.tick).toBeLessThan(2 / DT);
  }
  return log;
}

/** The log rows of the symbol's pulses: the ones with an area. */
function pulses(log: readonly CombatLogEntry[]): CombatLogEntry[] {
  return log.filter((entry) => entry.skillId === SYMBOL && entry.area !== undefined);
}

/** The damage `log`'s pulses dealt to `id`, one number per hit. */
function hits(log: readonly CombatLogEntry[], id: string): number[] {
  return pulses(log).flatMap((entry) =>
    entry.events.flatMap((event) =>
      event.kind === "damage" && event.targetId === id ? [event.amount] : [],
    ),
  );
}

describe("Symbol of Wrath (#1113)", () => {
  it("is the corpus's: 5 energy, 1 s, 20 s recharge, a Smiting Prayers spell at a foe", () => {
    expect(getSkill(SYMBOL)).toMatchObject({
      type: "spell",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: SMITING,
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 20,
      target: "single-enemy",
    });
  });

  it("reads as a symbol at its target that strikes adjacent foes every second, at rank 12", () => {
    const skill = getSkill(SYMBOL);
    if (skill === undefined) {
      throw new Error("no Symbol of Wrath");
    }
    const described = describeSkill(skill, new Map([[SMITING, 12]]));
    expect(described.effects.map(({ text }) => text)).toEqual([
      "Creates a symbol at your target's location for 5 seconds",
      "Every 1s for 5s, foes adjacent: deals 34 holy damage",
    ]);
    expect(described.headline).toBe("34 holy damage");
  });
});

describe("pulsing (#1113)", () => {
  it("lands where its target stood, then strikes it at age 0, 1, 2, 3 and 4, and is gone at 5", () => {
    const sim = match();
    const log = castSymbol(sim);
    const [symbol, ...others] = sim.groundEffects;
    expect(others).toEqual([]);
    expect(symbol).toMatchObject({
      skillId: SYMBOL,
      ownerId: "m",
      team: 0,
      position: vec2(200, 0),
      durationSeconds: 5,
      act: { kind: "pulse" },
    });
    log.push(...stepFor(sim, 5 - DT));
    const struck = pulses(log);
    expect(struck.map((entry) => entry.atSeconds - (struck[0]?.atSeconds ?? 0))).toEqual([
      0,
      expect.closeTo(1, 6),
      expect.closeTo(2, 6),
      expect.closeTo(3, 6),
      expect.closeTo(4, 6),
    ]);
    for (const entry of struck) {
      expect(entry).toMatchObject({
        cause: "skill",
        sourceId: "m",
        area: { x: 200, y: 0, radius: AREA_ADJACENT },
      });
    }
    expect(hits(log, "f")).toEqual([34, 34, 34, 34, 34]);
    expect(sim.groundEffects).toHaveLength(1);
    const after = stepFor(sim, 2 * DT);
    expect(sim.groundEffects).toEqual([]);
    expect(pulses(after.concat(stepFor(sim, 2)))).toEqual([]);
  });

  it("stays where it was placed when its target walks off: the pulses after strike nobody, logged", () => {
    const sim = match();
    castSymbol(sim);
    sim.walkTo("f", vec2(400, 0));
    const log = stepFor(sim, 5 + DT);
    expect(sim.groundEffects).toEqual([]);
    expect(pulses(log).map((entry) => entry.events)).toEqual([[], [], [], []]);
  });

  it("strikes no ally, no foe just past adjacent and no foe behind a wall", () => {
    const sim = match(
      [
        spec("pal", 0, vec2(200, 30)),
        spec("far", 1, vec2(200, -(AREA_ADJACENT + 1))),
        spec("hid", 1, vec2(200 + AREA_ADJACENT - 5, 0)),
      ],
      [segment(vec2(220, -10), vec2(220, 10))],
    );
    const log = castSymbol(sim).concat(stepFor(sim, 5));
    expect(hits(log, "f")).toHaveLength(5);
    for (const id of ["pal", "far", "hid"]) {
      expect(hits(log, id), id).toEqual([]);
      expect(get(sim, id).combatant.health, id).toBe(1e4);
    }
  });

  it("goes on with its owner dead, the damage the owner's", () => {
    const sim = match([spec("pal", 0, vec2(-300, 0))]);
    castSymbol(sim);
    const monk = get(sim, "m").combatant;
    monk.statuses.apply("burning", 10, "f", NO_RANKS);
    monk.health = 0.2;
    const log = stepFor(sim, 5);
    expect(monk.dead).toBe(true);
    expect(hits(log, "f")).toEqual([34, 34, 34, 34]);
    expect(pulses(log).every((entry) => entry.sourceId === "m")).toBe(true);
  });

  it("is gone with no more pulses once its owner has left the match", () => {
    const sim = match();
    castSymbol(sim);
    sim.remove("m");
    const log = stepFor(sim, 5);
    expect(sim.groundEffects).toEqual([]);
    expect(pulses(log)).toEqual([]);
  });

  it("stacks: two symbols on one spot strike twice as often, each on its own clock", () => {
    const sim = match([spec("m2", 0, vec2(0, 50))]);
    sim.setTarget("m2", "f");
    expect(sim.requestSkill("m2", 0)?.check.ok).toBe(true);
    const log = castSymbol(sim).concat(stepFor(sim, 6));
    expect(hits(log, "f")).toEqual(Array.from({ length: 10 }, () => 34));
  });

  it("is deterministic: the same seed pulses the same events with the same ids", () => {
    const run = (): unknown => {
      const sim = match();
      const log = castSymbol(sim);
      const placed = sim.groundEffects.map(({ id }) => id);
      return { placed, log: pulses(log.concat(stepFor(sim, 5))) };
    };
    expect(run()).toEqual(run());
  });
});
