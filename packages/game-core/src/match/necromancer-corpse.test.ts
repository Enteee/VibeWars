import { describe, expect, it } from "vitest";

import { AREA_NEARBY, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { BONE_FIEND, RANGE_LONG } from "../skills/catalog/shared.js";
import type { CombatEvent } from "../skills/effects.js";
import { magnitudeAtRank } from "../skills/scaling.js";
import { NO_RANKS } from "../skills/status.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Corpse mechanics (#2250): Signet of Sorrow recharges at once on a foe
 * near a fresh corpse or with a dead pet, and Animate Bone Fiend raises a
 * ranged minion from a corpse.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SORROW = "necromancer.signet-of-sorrow";
const FIEND = "necromancer.animate-bone-fiend";
const CHARM = "ranger.charm-animal";
const SOUL_REAPING = "necromancer.soul-reaping";
const DEATH_MAGIC = "necromancer.death-magic";
const BAR = [SORROW, FIEND];
/** Where the signet's target stands. */
const FOE = vec2(300, 0);

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
 * Necromancer `n` at the origin, foe `f` at `FOE`, and foe `c`, a corpse
 * to be, `corpseFrom` units beyond `f`. `pet`: `f` charms one.
 */
function match(options: { corpseFrom?: number; pet?: boolean; rank?: number } = {}) {
  const rank = options.rank ?? 12;
  return new MatchSimulation({
    seed: "corpse-2250",
    participants: [
      spec("n", 0, vec2(0, 0), {
        skillBar: BAR,
        attributeRanks: new Map([
          [SOUL_REAPING, rank],
          [DEATH_MAGIC, rank],
        ]),
      }),
      spec("f", 1, FOE, options.pet === true ? { skillBar: [CHARM] } : {}),
      spec("c", 1, vec2(FOE.x + (options.corpseFrom ?? 300), 0)),
    ],
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

/** Kill `victim` as burning would. */
function kill(sim: MatchSimulation, victim: Participant): void {
  victim.combatant.statuses.apply("burning", 10, "n", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** `n` uses `skillId` on `targetId` through to its log entry; its events. */
function cast(sim: MatchSimulation, skillId: string, targetId?: string): CombatEvent[] {
  get(sim, "n").combatant.energy = 100;
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

function sorrowRecharge(sim: MatchSimulation): number {
  return get(sim, "n").combatant.cast.rechargeRemaining.get(SORROW) ?? 0;
}

function fiends(sim: MatchSimulation): Participant[] {
  return [...sim.participants()].filter(
    (participant) =>
      participant.creature?.ownerId === "n" &&
      participant.creature.name === "Bone Fiend" &&
      !participant.combatant.dead,
  );
}

describe("the two are the corpus's (#2250)", () => {
  it("Signet of Sorrow: gwId 1363, a Soul Reaping signet, no cost, 1 s, 30 s recharge", () => {
    expect(getSkill(SORROW)).toMatchObject({
      gwId: 1363,
      type: "signet",
      attributeId: SOUL_REAPING,
      cost: undefined,
      activationSeconds: 1,
      rechargeSeconds: 30,
      target: "single-enemy",
    });
  });

  it("Animate Bone Fiend: gwId 84, a Death Magic spell, 15 energy, 1 s, 5 s recharge", () => {
    expect(getSkill(FIEND)).toMatchObject({
      gwId: 84,
      type: "spell",
      attributeId: DEATH_MAGIC,
      cost: { kind: "energy", amount: 15 },
      activationSeconds: 1,
      rechargeSeconds: 5,
      corpse: { radius: RANGE_SPELL },
    });
  });
});

describe("Signet of Sorrow (#2250)", () => {
  it.each([
    [0, 15],
    [15, 75],
  ])("at Soul Reaping %i deals %i", (rank, amount) => {
    const sim = match({ rank });
    const hits = cast(sim, SORROW, "f").filter((event) => event.kind === "damage");
    expect(hits).toEqual([expect.objectContaining({ targetId: "f", amount })]);
  });

  it("recharges at once with a fresh corpse nearby the foe, not one a step beyond", () => {
    const near = match({ corpseFrom: AREA_NEARBY });
    kill(near, get(near, "c"));
    cast(near, SORROW, "f");
    expect(sorrowRecharge(near)).toBe(0);

    const far = match({ corpseFrom: AREA_NEARBY + 1 });
    kill(far, get(far, "c"));
    cast(far, SORROW, "f");
    expect(sorrowRecharge(far)).toBeGreaterThan(25);
  });

  it("does not count an exploited corpse", () => {
    const sim = match({ corpseFrom: AREA_NEARBY });
    const corpse = get(sim, "c");
    kill(sim, corpse);
    cast(sim, FIEND);
    expect(corpse.corpseExploited).toBe(true);
    cast(sim, SORROW, "f");
    expect(sorrowRecharge(sim)).toBeGreaterThan(25);
  });

  it("recharges at once on a foe whose pet is dead, not one whose pet lives", () => {
    const living = match({ pet: true });
    cast(living, SORROW, "f");
    expect(sorrowRecharge(living)).toBeGreaterThan(25);

    const dead = match({ pet: true });
    const pet = [...dead.participants()].find((other) => other.creature?.ownerId === "f");
    if (pet === undefined) {
      throw new Error("f has no pet");
    }
    kill(dead, pet);
    cast(dead, SORROW, "f");
    expect(sorrowRecharge(dead)).toBe(0);
  });
});

describe("Animate Bone Fiend (#2250)", () => {
  it("is level 1 at Death Magic 0 and 17 at 15", () => {
    const scaling = BONE_FIEND.attack?.scaling;
    if (scaling?.kind !== "level") {
      throw new Error("the Bone Fiend's shots scale by level");
    }
    expect(magnitudeAtRank(scaling.level, 0)).toBe(1);
    expect(magnitudeAtRank(scaling.level, 15)).toBe(17);
  });

  it("raises a level 17 Bone Fiend at Death Magic 15: 420 Health, armor 51", () => {
    const sim = match({ rank: 15, corpseFrom: AREA_NEARBY });
    kill(sim, get(sim, "c"));
    cast(sim, FIEND);
    const [fiend, ...rest] = fiends(sim);
    expect(rest).toEqual([]);
    expect(fiend?.combatant.maxHealth).toBe(420);
    expect(fiend?.combatant.equipment.baseArmor).toBe(51);
  });

  it("needs a fresh corpse", () => {
    const sim = match();
    get(sim, "n").combatant.energy = 100;
    expect(sim.requestSkill("n", BAR.indexOf(FIEND))?.check).not.toEqual({ ok: true });
    expect(fiends(sim)).toEqual([]);
  });

  it("shoots piercing from half a longbow's range, once every 1.86 s", () => {
    expect(BONE_FIEND.attack).toMatchObject({
      damageType: "piercing",
      attackIntervalSeconds: 1.86,
      range: RANGE_LONG / 2,
    });
    const sim = match({ corpseFrom: AREA_NEARBY });
    kill(sim, get(sim, "c"));
    cast(sim, FIEND);
    const [fiend] = fiends(sim);
    if (fiend === undefined) {
      throw new Error("no Bone Fiend");
    }
    sim.setTarget("n", "f");
    sim.requestAttack("n", "f");
    const hits = stepFor(sim, 12)
      .filter((entry) => entry.sourceId === fiend.id)
      .flatMap((entry) => entry.events.filter((event) => event.kind === "damage"));
    // About 12 / 1.86, after its walk into range.
    expect(hits.length).toBeGreaterThanOrEqual(4);
    expect(hits.length).toBeLessThanOrEqual(7);
    expect(distance(fiend.position, get(sim, "f").position)).toBeGreaterThan(RANGE_MELEE * 2);
  });
});
