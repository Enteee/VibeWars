import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { CombatMeter, tallyCombat, type CombatLogEntry } from "./combat-log.js";
import { MatchSimulation } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;

function hit(atSeconds: number, sourceId: string | undefined, amount: number): CombatLogEntry {
  return {
    tick: Math.round(atSeconds * RULES.tickRateHz),
    atSeconds,
    cause: sourceId === undefined ? "degeneration" : "skill",
    sourceId,
    skillId: undefined,
    weaponId: undefined,
    area: undefined,
    events: [{ kind: "damage", targetId: "target", amount }],
  };
}

/** One participant bleeding under statuses from `sources`, ticked once. */
function degenerationEntry(sources: readonly string[]): CombatLogEntry | undefined {
  const sim = new MatchSimulation({
    seed: "degen",
    participants: ["victim", ...sources].map((id, index) => ({
      id,
      team: index === 0 ? 0 : 1,
      skillBar: [],
      attributeRanks: new Map(),
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      spawn: vec2(index * 100, 0),
    })),
  });
  const victim = sim.get("victim");
  const statuses = ["bleeding", "burning"] as const;
  sources.forEach((source, index) => {
    victim?.combatant.statuses.apply(statuses[index % statuses.length] ?? "bleeding", 10, source);
  });
  return sim.step(1 / RULES.tickRateHz).log[0];
}

describe("degeneration attribution", () => {
  it("names the source when every draining status came from one participant", () => {
    const entry = degenerationEntry(["necro"]);
    expect(entry?.cause).toBe("degeneration");
    expect(entry?.sourceId).toBe("necro");
    expect(tallyCombat(entry === undefined ? [] : [entry])).toMatchObject({
      damageByActor: new Map([["necro", expect.closeTo(3 / 20, 9) as number]]),
      unattributedDamage: 0,
    });
  });

  it("names nobody when two sources' statuses summed into one number", () => {
    const entry = degenerationEntry(["necro", "ele"]);
    expect(entry?.sourceId).toBeUndefined();
    const tally = tallyCombat(entry === undefined ? [] : [entry]);
    expect(tally.damageByActor.size).toBe(0);
    expect(tally.unattributedDamage).toBeCloseTo((3 + 7) / 20, 9);
    expect(tally.damageTakenByActor.get("victim")).toBeCloseTo((3 + 7) / 20, 9);
  });
});

describe("tallyCombat", () => {
  it("credits damage to its source, healing to its source, and not self-damage", () => {
    const tally = tallyCombat([
      hit(1, "a", 50),
      hit(2, "a", 25),
      hit(2, "b", 10),
      {
        ...hit(3, "a", 0),
        events: [
          { kind: "heal", targetId: "a", amount: 40 },
          { kind: "damage", targetId: "a", amount: 5 },
        ],
      },
    ]);
    expect(tally.damageByActor).toEqual(
      new Map([
        ["a", 75],
        ["b", 10],
      ]),
    );
    expect(tally.healingByActor).toEqual(new Map([["a", 40]]));
    expect(tally.damageTakenByActor).toEqual(
      new Map([
        ["target", 85],
        ["a", 5],
      ]),
    );
    expect(tally.unattributedDamage).toBe(0);
  });
});

describe("CombatMeter", () => {
  it("reports 0, not NaN, at t=0", () => {
    const meter = new CombatMeter({ windowSeconds: 5 });
    expect(meter.damagePerSecond("a", 0)).toBe(0);
    meter.record(hit(0, "a", 100));
    expect(meter.damagePerSecond("a", 0)).toBe(0);
  });

  it("divides by the time so far until a full window has passed, then by the window", () => {
    const meter = new CombatMeter({ windowSeconds: 5 });
    meter.record(hit(1, "a", 20));
    meter.record(hit(2, "a", 20));
    expect(meter.damagePerSecond("a", 2)).toBe(40 / 2);
    meter.record(hit(9, "a", 50));
    // Only the hit inside (4, 9] counts.
    expect(meter.damagePerSecond("a", 9)).toBe(50 / 5);
    expect(meter.damagePerSecond("b", 9)).toBe(0);
  });

  it("totals everything since the last reset, and reset forgets it", () => {
    const meter = new CombatMeter({ windowSeconds: 5 });
    meter.record(hit(1, "a", 20));
    meter.record(hit(30, "a", 30));
    expect(meter.totals().damageByActor.get("a")).toBe(50);
    meter.reset();
    expect(meter.totals().damageByActor.size).toBe(0);
    expect(meter.damagePerSecond("a", 30)).toBe(0);
  });

  it("reports healing per second the same way", () => {
    const meter = new CombatMeter({ windowSeconds: 4 });
    meter.record({ ...hit(2, "monk", 0), events: [{ kind: "heal", targetId: "x", amount: 80 }] });
    expect(meter.healingPerSecond("monk", 4)).toBe(80 / 4);
  });
});
