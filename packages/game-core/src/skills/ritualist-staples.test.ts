import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import { NO_RANKS } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Skill } from "./types.js";
import { landBlow, PLAIN_BLOW, weaponSnapshotOf, type BlowRule } from "./weapon-attack.js";

/**
 * Ritualist staples (#2212): Gaze from Beyond and Ghostmirror Light by a
 * spirit, Channeled Strike and Soothing Memories with ashes in hand,
 * Ancestors' Rage's pulse round an ally, and Dulled Weapon's hex that
 * forbids critical hits.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const GAZE = "ritualist.gaze-from-beyond";
const RAGE = "ritualist.ancestors-rage";
const STRIKE = "ritualist.channeled-strike";
const SOOTHING = "ritualist.soothing-memories";
const GHOSTMIRROR = "ritualist.ghostmirror-light";
const DULLED = "ritualist.dulled-weapon";
const SHELTER = "ritualist.shelter";

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [GAZE, RAGE, STRIKE, SOOTHING, GHOSTMIRROR, DULLED, SHELTER],
    attributeRanks: new Map([
      ["ritualist.channeling-magic", 12],
      ["ritualist.restoration-magic", 12],
      ["ritualist.communing", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    startHealthFraction: 0.5,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** `r` on team 0 at the origin, and `more`. */
function match(more: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "ritualist-staples",
    participants: [spec("r", 0, vec2(0, 0)), ...more],
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

/** `caster` casts `skillId` at `targetId`, and steps until it has landed. */
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

/** The events `skillId` of `sourceId` caused in `log`. */
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

function healTo(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "heal" && event.targetId === targetId ? [event.amount] : [],
  );
}

/** `r` holds ashes, as after an item spell. */
function holdAshes(sim: MatchSimulation): void {
  get(sim, "r").combatant.statuses.apply("protective-was-kaolai", 30, "r", NO_RANKS);
}

/** The effect lines `skillId` reads as at rank 12. */
function lines(skillId: string): string[] {
  const ranks = new Map([
    ["ritualist.channeling-magic", 12],
    ["ritualist.restoration-magic", 12],
    ["ritualist.communing", 12],
  ]);
  return describeSkill(skillOf(skillId), ranks).effects.map(({ text }) => text);
}

describe("Gaze from Beyond (#2212)", () => {
  it("strikes for 56 lightning, and blinds for 5 s only by a spirit of either team", () => {
    const alone = match([spec("f", 1, vec2(300, 0))]);
    const log = cast(alone, GAZE, "f");
    expect(of(log, GAZE).some((event) => event.kind === "damage" && event.targetId === "f")).toBe(
      true,
    );
    expect(get(alone, "f").combatant.statuses.has("blind")).toBe(false);

    const own = match([spec("f", 1, vec2(300, 0))]);
    cast(own, SHELTER, undefined);
    cast(own, GAZE, "f");
    expect(get(own, "f").combatant.statuses.get("blind")?.durationSeconds).toBeCloseTo(5, 1);

    const theirs = match([spec("f", 1, vec2(300, 0)), spec("g", 1, vec2(-100, 0))]);
    cast(theirs, SHELTER, undefined, "g");
    cast(theirs, GAZE, "f");
    expect(get(theirs, "f").combatant.statuses.has("blind")).toBe(true);
  });

  it("reads as GW1 words it", () => {
    expect(lines(GAZE)).toEqual([
      "Deals 56 lightning damage",
      "If a spirit is in earshot of you: applies Blind for 5s (90% of attacks miss)",
    ]);
  });
});

describe("Channeled Strike (#2212)", () => {
  /** Lightning at an unarmored foe: what Channeled Strike deals, with or without ashes. */
  function strike(ashes: boolean): number[] {
    const sim = match([spec("f", 1, vec2(300, 0))]);
    if (ashes) {
      holdAshes(sim);
    }
    return damageTo(of(cast(sim, STRIKE, "f"), STRIKE), "f");
  }

  it("strikes once without an item, and again for more with ashes in hand", () => {
    const plain = strike(false);
    const held = strike(true);
    expect(plain).toHaveLength(1);
    expect(held).toHaveLength(2);
    expect(held[0]).toBe(plain[0]);
    // 29 against 77 at the same armor.
    expect((held[1] ?? 0) / (plain[0] ?? 1)).toBeCloseTo(29 / 77, 1);
  });

  it("reads as GW1 words it", () => {
    expect(lines(STRIKE)).toEqual([
      "Deals 77 lightning damage",
      "If you are holding an item: deals 29 lightning damage",
    ]);
  });
});

describe("Soothing Memories (#2212)", () => {
  it("heals 82, and gives 3 Energy only with ashes in hand", () => {
    const plain = match([spec("w", 0, vec2(100, 0))]);
    const log = cast(plain, SOOTHING, "w");
    expect(healTo(of(log, SOOTHING), "w")).toEqual([82]);
    expect(of(log, SOOTHING).some((event) => event.kind === "energy-gain")).toBe(false);

    const held = match([spec("w", 0, vec2(100, 0))]);
    holdAshes(held);
    expect(
      of(cast(held, SOOTHING, "w"), SOOTHING).filter((event) => event.kind === "energy-gain"),
    ).toEqual([expect.objectContaining({ targetId: "r", amount: 3 })]);
  });

  it("reads as GW1 words it", () => {
    expect(lines(SOOTHING)).toEqual(["Heals for 82", "If you are holding an item: gain 3 energy"]);
  });
});

describe("Ghostmirror Light (#2212)", () => {
  it("heals the other ally 75, and the caster 75 too only by a spirit", () => {
    const alone = match([spec("w", 0, vec2(100, 0))]);
    const plain = of(cast(alone, GHOSTMIRROR, "w"), GHOSTMIRROR);
    expect([healTo(plain, "w"), healTo(plain, "r")]).toEqual([[75], []]);

    const near = match([spec("w", 0, vec2(100, 0))]);
    cast(near, SHELTER, undefined);
    const both = of(cast(near, GHOSTMIRROR, "w"), GHOSTMIRROR);
    expect([healTo(both, "w"), healTo(both, "r")]).toEqual([[75], [75]]);
  });

  it("cannot target the caster", () => {
    expect(skillOf(GHOSTMIRROR).target).toBe("single-other-ally");
  });

  it("reads as GW1 words it", () => {
    expect(lines(GHOSTMIRROR)).toEqual([
      "Heals for 75",
      "If a spirit is in earshot of you: you gain 75 health",
    ]);
  });
});

describe("Ancestors' Rage (#2212)", () => {
  it("hits the foes adjacent to the ally 41 a second for 3 s, and not the ally", () => {
    const sim = match([
      spec("w", 0, vec2(100, 0)),
      spec("f", 1, vec2(130, 0)),
      spec("far", 1, vec2(600, 0)),
    ]);
    const log = [...cast(sim, RAGE, "w"), ...stepFor(sim, 4)];
    const events = of(log, RAGE);
    expect(damageTo(events, "f")).toHaveLength(3);
    expect(damageTo(events, "far")).toEqual([]);
    expect(damageTo(events, "w")).toEqual([]);
  });

  it("goes with the ally: a foe adjacent for one second takes one tick", () => {
    const sim = match([spec("w", 0, vec2(100, 0)), spec("f", 1, vec2(130, 0))]);
    const log = cast(sim, RAGE, "w");
    log.push(...stepFor(sim, 1.05));
    // The ally steps away from the foe, carrying the rage.
    get(sim, "w").position = vec2(-400, 0);
    log.push(...stepFor(sim, 3));
    expect(damageTo(of(log, RAGE), "f")).toHaveLength(1);
  });

  it("reads as GW1 words it", () => {
    expect(lines(RAGE)).toEqual([
      "Applies Ancestors' Rage for 3s (each second, adjacent foes take 41 lightning damage)",
    ]);
  });
});

describe("Dulled Weapon (#2212)", () => {
  it("hexes the target and the foes adjacent to it as it lands, for 17 s", () => {
    const sim = match([
      spec("f", 1, vec2(300, 0)),
      spec("next", 1, vec2(330, 0)),
      spec("far", 1, vec2(700, 0)),
    ]);
    cast(sim, DULLED, "f");
    expect(get(sim, "f").combatant.statuses.get("dulled-weapon")?.durationSeconds).toBeCloseTo(
      17,
      1,
    );
    expect(get(sim, "next").combatant.statuses.has("dulled-weapon")).toBe(true);
    expect(get(sim, "far").combatant.statuses.has("dulled-weapon")).toBe(false);
  });

  /** A stream that rolls `roll` on every damage roll, and whose crit roll is `crit`. */
  const stream = (roll: number, crit: number): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => crit });

  /** One blow of an unarmed attacker, hexed or not, at an unarmored victim. */
  function blow(
    hexed: boolean,
    rule: BlowRule,
    rng: SimulationRng,
  ): { crit: boolean; dealt: number } {
    const attacker = makeCombatant({ id: "a", team: 0 });
    const victim = makeCombatant({ id: "v", team: 1, maxHealth: 1000, health: 1000 });
    if (hexed) {
      attacker.statuses.apply("dulled-weapon", 17, "r", NO_RANKS);
    }
    const crit = landBlow(
      weaponSnapshotOf(attacker),
      attacker,
      victim,
      rule,
      false,
      rng,
      RULES.combat,
      [],
      new Map(),
    );
    return { crit, dealt: 1000 - victim.health };
  }

  it("lets no blow crit, not even one that always does", () => {
    const always: BlowRule = { ...PLAIN_BLOW, criticalWhen: "always" };
    const crits = (hexed: boolean, rng: SimulationRng): boolean[] =>
      [PLAIN_BLOW, always].map((rule) => blow(hexed, rule, rng).crit);
    expect(crits(false, stream(10, 0))).toEqual([true, true]);
    expect(crits(true, stream(10, 0))).toEqual([false, false]);
  });

  it("takes 17 off a blow's roll, and never below 0", () => {
    const hexed = makeCombatant({ id: "a", team: 0 });
    hexed.statuses.apply("dulled-weapon", 17, "r", NO_RANKS);
    expect(weaponSnapshotOf(hexed).damageDelta).toBe(-17);
    expect(blow(true, PLAIN_BLOW, stream(5, 0.99)).dealt).toBe(0);
    expect(blow(true, PLAIN_BLOW, stream(40, 0.99)).dealt).toBeLessThan(
      blow(false, PLAIN_BLOW, stream(40, 0.99)).dealt,
    );
  });

  it("reads as GW1 words it", () => {
    expect(lines(DULLED)).toEqual([
      "Applies Dulled Weapon for 17s (attacks deal 17 less damage, cannot land critical hits)",
    ]);
  });
});
