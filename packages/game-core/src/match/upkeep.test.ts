import { describe, expect, it } from "vitest";

import { RANGE_COMPASS } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { applyEffect, type CombatEvent } from "../skills/effects.js";
import { NO_RANKS, StatusSet } from "../skills/status.js";
import type { Combatant } from "../skills/types.js";
import { vec2 } from "../vec2.js";
import { applyIntent } from "./apply-intent.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const MENDING = "monk.mending";

/** A monk on team 0, 40 apart from the last, with Mending on its bar. */
function monk(id: string, index: number, baseEnergyPips = 4): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [MENDING],
    attributeRanks: new Map([["monk.healing-prayers", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn: vec2(index * 40, 0),
    facing: 0,
    baseEnergyPips,
  };
}

/** Monks `ids`, the first with `baseEnergyPips`; nobody does anything unless told. */
function monks(ids: readonly string[], baseEnergyPips = 4): MatchSimulation {
  return new MatchSimulation({
    seed: "upkeep",
    participants: ids.map((id, index) => monk(id, index, index === 0 ? baseEnergyPips : 4)),
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `caster` maintains Mending on `bearer`, as the skill's effect does. */
function mend(sim: MatchSimulation, casterId: string, bearerId: string): CombatEvent[] {
  return applyEffect(
    { kind: "maintain-status", on: "target", statusId: "mending" },
    {
      surroundings: new Map(),
      caster: get(sim, casterId).combatant,
      target: get(sim, bearerId).combatant,
      rng: createRng(1),
      rules: RULES.combat,
    },
  );
}

function energyPips(sim: MatchSimulation, id: string): number {
  return sim.pips(get(sim, id)).energy;
}

function mending(sim: MatchSimulation, id: string): Combatant["statuses"] {
  return get(sim, id).combatant.statuses;
}

/** Every upkeep-lost event a step logged. */
function upkeepLost(sim: MatchSimulation): CombatEvent[] {
  return sim
    .step(DT)
    .log.flatMap((entry) => entry.events)
    .filter((event) => event.kind === "upkeep-lost");
}

describe("maintained enchantments (#837)", () => {
  it("cast through the bar: Mending is maintained on the ally, for 10 energy", () => {
    const sim = monks(["a", "b"]);
    const before = get(sim, "a").combatant.energy;
    sim.setTarget("a", "b");
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(get(sim, "a").combatant.energy).toBe(before - 10);
    for (let i = 0; i < Math.round(2.5 / DT); i += 1) {
      sim.step(DT);
    }
    const status = mending(sim, "b").get("mending");
    expect(status?.maintained).not.toBeNull();
    expect(status?.sourceId).toBe("a");
    expect(status?.remainingSeconds).toBe(Number.POSITIVE_INFINITY);
    expect(energyPips(sim, "a")).toBe(3);
  });

  it("costs its caster one pip each, and its bearer none", () => {
    const sim = monks(["a", "b", "c", "d"]);
    expect(mend(sim, "a", "b")).toEqual([
      { kind: "status-applied", targetId: "b", statusId: "mending", durationSeconds: null },
    ]);
    expect(energyPips(sim, "a")).toBe(3);
    expect(energyPips(sim, "b")).toBe(4);
    mend(sim, "a", "c");
    mend(sim, "a", "d");
    expect(energyPips(sim, "a")).toBe(1);
  });

  it("recast on the same ally is still one, and never expires", () => {
    const sim = monks(["a", "b"]);
    mend(sim, "a", "b");
    mend(sim, "a", "b");
    expect(energyPips(sim, "a")).toBe(3);
    for (let i = 0; i < Math.round(60 / DT); i += 1) {
      sim.step(DT);
    }
    expect(mending(sim, "b").has("mending")).toBe(true);
  });

  it("a second caster's replaces the first's, whose upkeep ends with it", () => {
    const sim = monks(["a", "b", "c"]);
    mend(sim, "a", "c");
    mend(sim, "b", "c");
    expect(energyPips(sim, "a")).toBe(4);
    expect(energyPips(sim, "b")).toBe(3);
    expect(mending(sim, "c").get("mending")?.sourceId).toBe("b");
  });

  it("can't pay: at 0 energy the newest goes first, until the net is 0", () => {
    // Base 1, three maintained: −2 net, so two go, newest first.
    const sim = monks(["a", "b", "c", "d"], 1);
    mend(sim, "a", "b");
    mend(sim, "a", "c");
    mend(sim, "a", "d");
    get(sim, "a").combatant.energy = 0;
    expect(upkeepLost(sim)).toEqual([
      { kind: "upkeep-lost", targetId: "d", statusId: "mending", casterId: "a" },
      { kind: "upkeep-lost", targetId: "c", statusId: "mending", casterId: "a" },
    ]);
    expect(mending(sim, "b").has("mending")).toBe(true);
    expect(energyPips(sim, "a")).toBe(0);
  });

  it("at 0 energy with a net of 0, nothing drops", () => {
    const sim = monks(["a", "b"], 1);
    mend(sim, "a", "b");
    get(sim, "a").combatant.energy = 0;
    expect(upkeepLost(sim)).toEqual([]);
    expect(mending(sim, "b").has("mending")).toBe(true);
  });

  it("past −10 pre-cap, the oldest give way to the newest, unlogged", () => {
    // Base 0: eleven maintained is −11, so the oldest goes.
    const ids = ["a", ...Array.from({ length: 11 }, (_, i) => `ally${String(i)}`)];
    const sim = monks(ids, 0);
    for (const id of ids.slice(1)) {
      mend(sim, "a", id);
    }
    expect(upkeepLost(sim)).toEqual([]);
    expect(mending(sim, "ally0").has("mending")).toBe(false);
    expect(mending(sim, "ally1").has("mending")).toBe(true);
    expect(mending(sim, "ally10").has("mending")).toBe(true);
    expect(energyPips(sim, "a")).toBe(-10);
  });

  it("ends with its caster's death, and with its bearer's", () => {
    const sim = monks(["a", "b", "c"]);
    mend(sim, "a", "b");
    mend(sim, "b", "c");
    // Burned to death this tick, as any degeneration kills.
    for (const id of ["a", "c"]) {
      const { combatant } = get(sim, id);
      combatant.health = 0.01;
      combatant.statuses.apply("burning", 5, "foe", NO_RANKS);
    }
    sim.step(DT);
    expect(get(sim, "a").combatant.dead).toBe(true);
    expect(mending(sim, "b").has("mending")).toBe(false);
    expect(mending(sim, "c").has("mending")).toBe(false);
    expect(energyPips(sim, "b")).toBe(4);
  });

  it("enchantment removal takes it, and the upkeep with it", () => {
    const sim = monks(["a", "b"]);
    mend(sim, "a", "b");
    mending(sim, "b").removeByCategory("enchantment");
    expect(energyPips(sim, "a")).toBe(4);
  });
});

describe("beyond compass range (#839)", () => {
  /** Step `seconds` of match time. */
  function run(sim: MatchSimulation, seconds: number): void {
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      sim.step(DT);
    }
  }

  /** "a" maintains Mending on "b", then "b" stands `x` from "a". */
  function apart(x: number): MatchSimulation {
    const sim = monks(["a", "b"]);
    mend(sim, "a", "b");
    get(sim, "a").position = vec2(0, 0);
    get(sim, "b").position = vec2(x, 0);
    return sim;
  }

  it("ends after the bearer is beyond range for more than 5 s, unlogged", () => {
    const sim = apart(RANGE_COMPASS + 100);
    run(sim, 4.9);
    expect(mending(sim, "b").has("mending")).toBe(true);
    const log = [];
    for (let i = 0; i < Math.round(0.2 / DT); i += 1) {
      log.push(...sim.step(DT).log);
    }
    expect(mending(sim, "b").has("mending")).toBe(false);
    expect(log).toEqual([]);
    expect(energyPips(sim, "a")).toBe(4);
  });

  it("4.9 s out, then back: it stays, and the grace starts again", () => {
    const sim = apart(RANGE_COMPASS + 100);
    run(sim, 4.9);
    get(sim, "b").position = vec2(100, 0);
    run(sim, 1);
    get(sim, "b").position = vec2(RANGE_COMPASS + 100, 0);
    run(sim, 4.9);
    expect(mending(sim, "b").has("mending")).toBe(true);
  });

  it("out, in, out, each under 5 s, it stays", () => {
    const sim = apart(RANGE_COMPASS + 100);
    for (const x of [100, RANGE_COMPASS + 100, 100, RANGE_COMPASS + 100]) {
      run(sim, 3);
      get(sim, "b").position = vec2(x, 0);
    }
    expect(mending(sim, "b").has("mending")).toBe(true);
  });

  it("exactly at compass range is inside", () => {
    const sim = apart(RANGE_COMPASS);
    run(sim, 6);
    expect(mending(sim, "b").has("mending")).toBe(true);
  });

  it("one on yourself never ends this way", () => {
    const sim = monks(["a"]);
    mend(sim, "a", "a");
    run(sim, 10);
    expect(mending(sim, "a").has("mending")).toBe(true);
  });
});

describe("ending a maintained enchantment (#838)", () => {
  it("its caster ends it at once, for free, unlogged, and the pip returns", () => {
    const sim = monks(["a", "b"]);
    mend(sim, "a", "b");
    const energy = get(sim, "a").combatant.energy;
    expect(applyIntent(sim, "a", { kind: "end-upkeep", targetId: "b", status: "mending" })).toBe(
      null,
    );
    expect(mending(sim, "b").has("mending")).toBe(false);
    expect(get(sim, "a").combatant.energy).toBe(energy);
    expect(energyPips(sim, "a")).toBe(4);
    expect(sim.step(DT).log).toEqual([]);
  });

  it("on itself too", () => {
    const sim = monks(["a"]);
    mend(sim, "a", "a");
    expect(sim.endUpkeep("a", "a", "mending")).toBe(true);
    expect(mending(sim, "a").has("mending")).toBe(false);
  });

  it("refuses another caster's, a timed one, a missing one and an unknown id, quietly", () => {
    const sim = monks(["a", "b", "c"]);
    mend(sim, "b", "c");
    get(sim, "c").combatant.statuses.apply("burning", 5, "a", NO_RANKS);
    expect(sim.endUpkeep("a", "c", "mending")).toBe(false);
    expect(sim.endUpkeep("a", "c", "burning")).toBe(false);
    expect(sim.endUpkeep("a", "b", "mending")).toBe(false);
    expect(sim.endUpkeep("a", "nobody", "mending")).toBe(false);
    expect(sim.endUpkeep("a", "c", "no-such-status")).toBe(false);
    expect(mending(sim, "c").has("mending")).toBe(true);
    expect(mending(sim, "c").has("burning")).toBe(true);
    expect(
      sim
        .step(DT)
        .log.flatMap((entry) => entry.events)
        .map((e) => e.kind),
    ).not.toContain("upkeep-lost");
  });
});

describe("StatusSet.maintain (#837)", () => {
  it("refuses a status that is not an enchantment", () => {
    expect(() => new StatusSet().maintain("bleeding", "a", 0, NO_RANKS)).toThrow(/enchantment/);
  });
});
