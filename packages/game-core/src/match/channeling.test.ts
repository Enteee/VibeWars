import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import type { CombatEvent } from "../skills/effects.js";
import { resolveMagnitudeAtRanks } from "../skills/scaling.js";
import type { Magnitude, Skill, SkillEffect } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Ritualist Channeling staples (#1270): Spirit Rift's delayed strike,
 * what a spirit in earshot adds to Spirit Burn, Essence Strike and Signet
 * of Spirits, Painful Bond's spirit damage, and Lamentation's damage near
 * a spirit or a corpse.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RIFT = "ritualist.spirit-rift";
const BURN = "ritualist.spirit-burn";
const ESSENCE = "ritualist.essence-strike";
const BOND = "ritualist.painful-bond";
const LAMENTATION = "ritualist.lamentation";
const SIGNET = "ritualist.signet-of-spirits";
const SHELTER = "ritualist.shelter";
const PAIN = "ritualist.pain";

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2, channeling = 12): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [RIFT, BURN, ESSENCE, BOND, LAMENTATION, SIGNET, SHELTER, PAIN],
    attributeRanks: new Map([
      ["ritualist.channeling-magic", channeling],
      ["ritualist.communing", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** `r` on team 0 at the origin, and `more`. */
function match(more: readonly ParticipantSpec[], channeling = 12): MatchSimulation {
  return new MatchSimulation({
    seed: "channeling",
    participants: [spec("r", 0, vec2(0, 0), channeling), ...more],
  });
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

/**
 * `caster` casts `skillId` at `targetId`, and steps until it has landed,
 * an aftercast before it included.
 */
function cast(
  sim: MatchSimulation,
  skillId: string,
  targetId: string | undefined,
  caster = "r",
): CombatLogEntry[] {
  sim.setTarget(caster, targetId);
  const slot = get(sim, caster).skillBar.indexOf(skillId);
  expect(sim.requestSkill(caster, slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (
    let i = 0;
    !log.some((entry) => entry.sourceId === caster && entry.skillId === skillId);
    i += 1
  ) {
    expect(i).toBeLessThan(10 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** The events `skillId` of `r` caused in `log`. */
function of(log: readonly CombatLogEntry[], skillId: string, sourceId = "r"): CombatEvent[] {
  return log
    .filter((entry) => entry.sourceId === sourceId && entry.skillId === skillId)
    .flatMap((entry) => entry.events);
}

function damageTo(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

function energyGained(events: readonly CombatEvent[]): number[] {
  return events.flatMap((event) =>
    event.kind === "energy-gain" && event.targetId === "r" ? [event.amount] : [],
  );
}

/** Kill `id` as burning would: a fresh corpse. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "y", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** The first magnitude of `kind` in `skillId`'s effects, however deep. */
function magnitudeOf(skillId: string, kind: "damage" | "energy-gain"): Magnitude {
  const find = (effects: readonly SkillEffect[]): Magnitude | undefined => {
    for (const effect of effects) {
      if (effect.kind === kind) {
        return effect.amount;
      }
      const inner =
        effect.kind === "if"
          ? find(effect.effects)
          : effect.kind === "create-ground-effect" && effect.act.kind === "pulse"
            ? find(effect.act.pulse.effects)
            : undefined;
      if (inner !== undefined) {
        return inner;
      }
    }
    return undefined;
  };
  const found = find(skillOf(skillId).effects);
  if (found === undefined) {
    throw new Error(`${skillId}: no ${kind}`);
  }
  return found;
}

describe("the numbers, rank 0...15 being GW1's a...b (#1270)", () => {
  it.each([
    [RIFT, "damage", 0, 25],
    [RIFT, "damage", 12, 105],
    [RIFT, "damage", 15, 125],
    [ESSENCE, "energy-gain", 0, 1],
    [ESSENCE, "energy-gain", 12, 7],
    [ESSENCE, "energy-gain", 15, 9],
    [SIGNET, "energy-gain", 0, 3],
    [SIGNET, "energy-gain", 12, 10],
    [SIGNET, "energy-gain", 15, 12],
    [LAMENTATION, "damage", 0, 10],
    [LAMENTATION, "damage", 12, 42],
    [LAMENTATION, "damage", 15, 50],
  ] as const)("%s's %s at Channeling %i is %i", (id, kind, rank, expected) => {
    const ranks = new Map([["ritualist.channeling-magic", rank]]);
    expect(resolveMagnitudeAtRanks(magnitudeOf(id, kind), ranks)).toBe(expected);
  });
});

describe("Spirit Rift (#1270)", () => {
  it("strikes and cracks a foe still adjacent to the spot after 3 s, not before, and spares one who left", () => {
    const sim = match([
      spec("stays", 1, vec2(300, 0)),
      spec("leaves", 1, vec2(300, AREA_ADJACENT / 2)),
      spec("arrives", 1, vec2(300, -3 * AREA_ADJACENT)),
    ]);
    const landed = cast(sim, RIFT, "stays");
    expect(damageTo(of(landed, RIFT), "stays")).toEqual([]);
    sim.walkTo("leaves", vec2(300, 4 * AREA_ADJACENT));
    sim.walkTo("arrives", vec2(300, -AREA_ADJACENT / 2));

    const early = stepFor(sim, 2.5);
    expect(of(early, RIFT).filter((event) => event.kind === "damage")).toEqual([]);
    const late = stepFor(sim, 1);
    const events = of(late, RIFT);
    expect(damageTo(events, "stays")).toHaveLength(1);
    expect(damageTo(events, "arrives")).toHaveLength(1);
    expect(damageTo(events, "leaves")).toEqual([]);
    expect(get(sim, "stays").combatant.statuses.has("cracked-armor")).toBe(true);
    expect(get(sim, "leaves").combatant.statuses.has("cracked-armor")).toBe(false);

    // Once: the rift is gone.
    expect(of(stepFor(sim, 3), RIFT)).toEqual([]);
  });
});

describe("a spirit in earshot (#1270)", () => {
  it("Spirit Burn burns only with a spirit in earshot, of either team", () => {
    const alone = match([spec("f", 1, vec2(300, 0))]);
    cast(alone, BURN, "f");
    expect(get(alone, "f").combatant.statuses.has("burning")).toBe(false);

    const own = match([spec("f", 1, vec2(300, 0))]);
    cast(own, SHELTER, undefined);
    cast(own, BURN, "f");
    expect(get(own, "f").combatant.statuses.has("burning")).toBe(true);

    const theirs = match([spec("f", 1, vec2(300, 0)), spec("g", 1, vec2(-100, 0))]);
    cast(theirs, SHELTER, undefined, "g");
    cast(theirs, BURN, "f");
    expect(get(theirs, "f").combatant.statuses.has("burning")).toBe(true);
  });

  it.each([
    [0, 1],
    [12, 7],
    [15, 9],
  ])(
    "Essence Strike at Channeling %i gives %i Energy with a spirit, none without",
    (rank, gain) => {
      const alone = match([spec("f", 1, vec2(300, 0))], rank);
      get(alone, "r").combatant.energy = 50;
      expect(energyGained(of(cast(alone, ESSENCE, "f"), ESSENCE))).toEqual([]);

      const near = match([spec("f", 1, vec2(300, 0))], rank);
      cast(near, SHELTER, undefined);
      get(near, "r").combatant.energy = 50;
      expect(energyGained(of(cast(near, ESSENCE, "f"), ESSENCE))).toEqual([gain]);
    },
  );

  it("Signet of Spirits gives 10 Energy with a spirit, and nothing without, though it is used", () => {
    const alone = match([]);
    get(alone, "r").combatant.energy = 50;
    expect(energyGained(of(cast(alone, SIGNET, undefined), SIGNET))).toEqual([]);
    expect(get(alone, "r").combatant.cast.rechargeRemaining.size).toBeGreaterThan(0);

    const near = match([]);
    cast(near, SHELTER, undefined);
    get(near, "r").combatant.energy = 50;
    expect(energyGained(of(cast(near, SIGNET, undefined), SIGNET))).toEqual([10]);
  });
});

describe("Painful Bond (#1270)", () => {
  it("hexes the target and the foes nearby it, not one farther", () => {
    const sim = match([
      spec("f", 1, vec2(300, 0)),
      spec("near", 1, vec2(300 + AREA_NEARBY - 1, 0)),
      spec("far", 1, vec2(300 + 2 * AREA_NEARBY, 0)),
    ]);
    cast(sim, BOND, "f");
    expect(get(sim, "f").combatant.statuses.has("painful-bond")).toBe(true);
    expect(get(sim, "near").combatant.statuses.has("painful-bond")).toBe(true);
    expect(get(sim, "far").combatant.statuses.has("painful-bond")).toBe(false);
  });

  /** The damage of Pain's first hit on `f`, with or without the hex. */
  function firstSpiritHit(hexed: boolean): number {
    const sim = match([spec("f", 1, vec2(300, 0))]);
    cast(sim, PAIN, undefined);
    const pain = [...sim.participants()].find((p) => p.creature?.kind === "spirit");
    if (pain === undefined) {
      throw new Error("no spirit");
    }
    if (hexed) {
      get(sim, "f").combatant.statuses.apply("painful-bond", 60, "r", NO_RANKS);
    }
    for (let i = 0; i < 10 * RULES.tickRateHz; i += 1) {
      const hits = damageTo(
        sim
          .step(DT)
          .log.filter((entry) => entry.sourceId === pain.id)
          .flatMap((entry) => entry.events),
        "f",
      );
      if (hits.length > 0) {
        return hits[0] ?? 0;
      }
    }
    throw new Error("no hit");
  }

  it("adds 18 to a spirit's hit, past armor", () => {
    expect(firstSpiritHit(true) - firstSpiritHit(false)).toBe(18);
  });

  it("adds nothing to a blocked one", () => {
    const sim = match([spec("f", 1, vec2(300, 0))]);
    cast(sim, PAIN, undefined);
    const f = get(sim, "f").combatant;
    f.statuses.apply("painful-bond", 60, "r", NO_RANKS);
    let blocked = 0;
    for (let i = 0; i < 25 * RULES.tickRateHz; i += 1) {
      f.statuses.apply("lightning-reflexes", 60, "f", NO_RANKS);
      const events = sim.step(DT).log.flatMap((entry) => entry.events);
      if (events.some((event) => event.kind === "attack-blocked" && event.targetId === "f")) {
        blocked += 1;
        expect(damageTo(events, "f")).toEqual([]);
      }
    }
    expect(blocked).toBeGreaterThan(0);
  });
});

describe("Lamentation (#1270)", () => {
  it("damages the hexed with a corpse in earshot, and only hexes without one", () => {
    const alone = match([spec("f", 1, vec2(300, 0)), spec("near", 1, vec2(300, AREA_NEARBY - 1))]);
    const quiet = of(cast(alone, LAMENTATION, "f"), LAMENTATION);
    expect(damageTo(quiet, "f")).toEqual([]);
    expect(get(alone, "f").combatant.statuses.has("lamentation")).toBe(true);
    expect(get(alone, "near").combatant.statuses.has("lamentation")).toBe(true);

    const mourned = match([
      spec("f", 1, vec2(300, 0)),
      spec("near", 1, vec2(300, AREA_NEARBY - 1)),
      spec("fallen", 0, vec2(-100, 0)),
    ]);
    kill(mourned, "fallen");
    const events = of(cast(mourned, LAMENTATION, "f"), LAMENTATION);
    // Typeless: armor takes none of it.
    expect(damageTo(events, "f")).toEqual([42]);
    expect(damageTo(events, "near")).toEqual([42]);
    // The corpse is not exploited.
    expect(get(mourned, "fallen").corpseExploited).toBe(false);
  });

  it("damages with a spirit in earshot too", () => {
    const sim = match([spec("f", 1, vec2(300, 0))]);
    cast(sim, SHELTER, undefined);
    expect(damageTo(of(cast(sim, LAMENTATION, "f"), LAMENTATION), "f")).toEqual([42]);
  });
});
