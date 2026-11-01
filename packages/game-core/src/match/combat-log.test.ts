import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { applyDamage, type CombatEvent } from "../skills/effects.js";
import { NO_RANKS, HEALTH_PER_PIP, MAX_PIPS } from "../skills/status.js";
import { vec2 } from "../vec2.js";
import { CombatMeter, MatchTally, tallyCombat, type CombatLogEntry } from "./combat-log.js";
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
    attributeId: undefined,
    area: undefined,
    doubleStrike: false,
    events: [{ kind: "damage", targetId: "target", amount, critical: false }],
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
      facing: 0,
    })),
  });
  const victim = sim.get("victim");
  const statuses = ["bleeding", "burning"] as const;
  sources.forEach((source, index) => {
    victim?.combatant.statuses.apply(
      statuses[index % statuses.length] ?? "bleeding",
      10,
      source,
      NO_RANKS,
    );
  });
  return sim.step(1 / RULES.tickRateHz).log[0];
}

describe("degeneration attribution", () => {
  it("names the source when every draining status came from one participant", () => {
    const entry = degenerationEntry(["necro"]);
    expect(entry?.cause).toBe("degeneration");
    expect(entry?.sourceId).toBe("necro");
    expect(tallyCombat(entry === undefined ? [] : [entry])).toMatchObject({
      damageByActor: new Map([["necro", expect.closeTo((3 * HEALTH_PER_PIP) / 20, 9) as number]]),
      unattributedDamage: 0,
    });
  });

  it("names nobody when two sources' statuses summed into one number", () => {
    const entry = degenerationEntry(["necro", "ele"]);
    expect(entry?.sourceId).toBeUndefined();
    const tally = tallyCombat(entry === undefined ? [] : [entry]);
    expect(tally.damageByActor.size).toBe(0);
    expect(tally.unattributedDamage).toBeCloseTo(
      (Math.min(3 + 7, MAX_PIPS) * HEALTH_PER_PIP) / 20,
      9,
    );
    expect(tally.damageTakenByActor.get("victim")).toBeCloseTo(
      (Math.min(3 + 7, MAX_PIPS) * HEALTH_PER_PIP) / 20,
      9,
    );
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
          { kind: "damage", targetId: "a", amount: 5, critical: false },
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

  it("counts health a status took as it landed as taken, never as dealt (#800)", () => {
    const tally = tallyCombat([
      {
        ...hit(1, "a", 0),
        events: [{ kind: "health-lost", targetId: "target", amount: 100, statusId: "deep-wound" }],
      },
    ]);
    expect(tally.damageByActor).toEqual(new Map());
    expect(tally.damageTakenByActor).toEqual(new Map([["target", 100]]));
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

describe("MatchTally (#1057)", () => {
  /** Ann and Bob on team 0, Cat and Dan on team 1; team 1's Guild Lord, no member. */
  const TEAMS: Readonly<Record<string, number>> = {
    ann: 0,
    bob: 0,
    cat: 1,
    dan: 1,
    "guild-lord/1": 1,
  };
  const tally = (): MatchTally =>
    new MatchTally(
      (id) => TEAMS[id],
      (id) => id !== "guild-lord/1",
    );
  const entry = (sourceId: string | undefined, events: readonly CombatEvent[]): CombatLogEntry => ({
    tick: 0,
    atSeconds: 0,
    cause: "skill",
    sourceId,
    skillId: undefined,
    weaponId: undefined,
    attributeId: undefined,
    area: undefined,
    doubleStrike: false,
    events,
  });
  const damage = (targetId: string, amount: number): CombatEvent => ({
    kind: "damage",
    targetId,
    amount,
    critical: false,
  });

  it("counts damage to a foe as dealt, to yourself or an ally as taken only", () => {
    const t = tally();
    t.add([entry("ann", [damage("cat", 40)]), entry("ann", [damage("ann", 10), damage("bob", 7)])]);
    expect(t.row("ann")).toMatchObject({ damage: 40, taken: 10 });
    expect(t.row("bob").taken).toBe(7);
    expect(t.row("cat").taken).toBe(40);
  });

  it("counts healing on anyone, yourself included", () => {
    const t = tally();
    t.add([
      entry("bob", [{ kind: "heal", targetId: "bob", amount: 30 }]),
      entry("bob", [{ kind: "heal", targetId: "ann", amount: 20 }]),
    ]);
    expect(t.row("bob").healing).toBe(50);
  });

  it("counts health lost and stolen as taken, a sacrifice not", () => {
    const t = tally();
    t.add([
      entry("cat", [
        { kind: "health-lost", targetId: "ann", amount: 12, statusId: "deep-wound" },
        { kind: "life-stolen", targetId: "ann", amount: 5 },
        { kind: "health-loss", targetId: "ann", amount: 53 },
      ]),
      entry("ann", [{ kind: "sacrifice", targetId: "ann", amount: 50 }]),
    ]);
    expect(t.row("ann").taken).toBe(70);
  });

  it("credits a kill to a foe source only; every death counts", () => {
    const t = tally();
    const death = (targetId: string): CombatEvent => ({ kind: "death", targetId });
    t.add([
      entry("ann", [damage("cat", 10), death("cat")]),
      entry("ann", [death("bob")]),
      entry(undefined, [death("dan")]),
    ]);
    expect(t.row("ann").kills).toBe(1);
    expect(t.row("cat").deaths).toBe(1);
    expect(t.row("bob").deaths).toBe(1);
    expect(t.row("dan").deaths).toBe(1);
    expect(t.row("bob").kills + t.row("cat").kills + t.row("dan").kills).toBe(0);
  });

  it("credits no kill for a foe creature's death, a Guild Lord's (#1226)", () => {
    const t = tally();
    t.add([entry("ann", [{ kind: "death", targetId: "guild-lord/1" }])]);
    expect(t.row("ann").kills).toBe(0);
    t.add([entry("ann", [{ kind: "death", targetId: "cat" }])]);
    expect(t.row("ann").kills).toBe(1);
  });

  it("counts an interrupt that landed, never one that missed", () => {
    const t = tally();
    t.add([
      entry("dan", [{ kind: "interrupted", targetId: "ann", skillId: "monk.heal-other" }]),
      entry("dan", [{ kind: "interrupt-missed", targetId: "ann", refusedSkillId: null }]),
    ]);
    expect(t.row("dan").interrupts).toBe(1);
  });

  it("adds no overkill: a blow counts the health it took", () => {
    const sim = new MatchSimulation({
      seed: "overkill",
      participants: ["ann", "cat"].map((id, index) => ({
        id,
        team: index,
        skillBar: [],
        attributeRanks: new Map(),
        equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
        spawn: vec2(index * 100, 0),
        facing: 0,
      })),
    });
    const cat = sim.get("cat")?.combatant;
    expect(cat).toBeDefined();
    if (cat === undefined) {
      return;
    }
    cat.health = 25;
    const events: CombatEvent[] = [];
    applyDamage(cat, 300, "fire", false, events, sim.get("ann")?.combatant);
    const t = new MatchTally(
      (id) => (id === "ann" ? 0 : 1),
      () => true,
    );
    t.add([entry("ann", events)]);
    expect(t.row("ann")).toMatchObject({ damage: 25, kills: 1 });
  });

  it("gives zeros for an id it never saw", () => {
    expect(tally().row("nobody")).toEqual({
      damage: 0,
      healing: 0,
      taken: 0,
      kills: 0,
      deaths: 0,
      interrupts: 0,
    });
  });
});
