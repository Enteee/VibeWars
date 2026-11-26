import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { FLESH_GOLEM } from "../skills/catalog/shared.js";
import type { CombatEvent } from "../skills/effects.js";
import { magnitudeAtRank, resolveMagnitudeAtRanks } from "../skills/scaling.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Minions 2 (#1836): Vampiric Horror feeds its owner, Flesh Golem is one
 * at a time and leaves corpses, Shambling Horror is replaced by a Jagged
 * Horror, and Putrid Flesh and Feast for the Dead spend a minion.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const VAMPIRIC = "necromancer.animate-vampiric-horror";
const GOLEM = "necromancer.animate-flesh-golem";
const SHAMBLING = "necromancer.animate-shambling-horror";
const PUTRID = "necromancer.putrid-flesh";
const FEAST = "necromancer.feast-for-the-dead";
const HORROR = "necromancer.animate-bone-horror";
const DEATH_MAGIC = "necromancer.death-magic";
const BAR = [VAMPIRIC, GOLEM, SHAMBLING, PUTRID, FEAST, HORROR];

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: BAR,
    attributeRanks: new Map([[DEATH_MAGIC, 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxEnergy: 100,
    ...extra,
  };
  return result;
}

/** `n` the necromancer, `x` and `z` foes to kill for corpses, `y` a foe beside them. */
function match(rank = 12): MatchSimulation {
  return new MatchSimulation({
    seed: "minions-2",
    participants: [
      spec("n", 0, vec2(0, 0), { attributeRanks: new Map([[DEATH_MAGIC, rank]]) }),
      spec("x", 1, vec2(200, 0)),
      spec("z", 1, vec2(200, 40)),
      spec("y", 1, vec2(230, 0), { skillBar: [] }),
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

/** Kill `id` as burning would. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "n", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** `n` casts `skillId` on `targetId` through to its log entry; its events. */
function cast(sim: MatchSimulation, skillId: string, targetId?: string): CombatEvent[] {
  const caster = get(sim, "n");
  while ((caster.combatant.cast.rechargeRemaining.get(skillId) ?? 0) > 0) {
    sim.step(DT);
  }
  caster.combatant.energy = 100;
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

function minionsOf(sim: MatchSimulation, name?: string): Participant[] {
  return [...sim.participants()].filter(
    (participant) =>
      participant.creature?.ownerId === "n" &&
      !participant.combatant.dead &&
      (name === undefined || participant.creature.name === name),
  );
}

function only(sim: MatchSimulation, name: string): Participant {
  const [minion, ...rest] = minionsOf(sim, name);
  expect(rest).toHaveLength(0);
  if (minion === undefined) {
    throw new Error(`no ${name}`);
  }
  return minion;
}

describe("the three new minions (#1836)", () => {
  it.each([
    [VAMPIRIC, "Vampiric Horror", 0, 100, 9],
    [VAMPIRIC, "Vampiric Horror", 12, 360, 58],
    [GOLEM, "Flesh Golem", 0, 140, 16],
    [GOLEM, "Flesh Golem", 12, 500, 84],
    [SHAMBLING, "Shambling Horror", 0, 100, 9],
    [SHAMBLING, "Shambling Horror", 12, 360, 58],
  ])(
    "%s raises a %s at Death Magic %i: %i Health, armor %i",
    (skill, name, rank, health, armor) => {
      const sim = match(rank);
      kill(sim, "x");
      cast(sim, skill);
      const minion = only(sim, name);
      expect(minion.combatant.maxHealth).toBe(health);
      expect(minion.combatant.equipment.baseArmor).toBe(armor);
      expect(get(sim, "x").corpseExploited).toBe(true);
    },
  );

  it.each([
    [VAMPIRIC, "Vampiric Horror", "vampiric-horror"],
    [GOLEM, "Flesh Golem", "flesh-golem"],
    [SHAMBLING, "Shambling Horror", "shambling-horror"],
  ])("%s raises a %s that wears its own look, %s (#1860)", (skill, name, look) => {
    const sim = match(0);
    kill(sim, "x");
    cast(sim, skill);
    expect(only(sim, name).creature?.look).toBe(look);
  });
});

describe("Vampiric Horror (#1836)", () => {
  it("gives its owner the Health each blow takes, not a heal of its own", () => {
    const sim = match();
    kill(sim, "x");
    cast(sim, VAMPIRIC);
    const horror = only(sim, "Vampiric Horror");
    get(sim, "n").combatant.health = 100;
    const blows = stepFor(sim, 12).filter(
      (entry) => entry.cause === "weapon" && entry.sourceId === horror.id,
    );
    const landed = blows.filter((entry) =>
      entry.events.some((event) => event.kind === "damage" && event.amount > 0),
    );
    expect(landed.length).toBeGreaterThanOrEqual(2);
    for (const entry of landed) {
      const dealt = entry.events.flatMap((event) =>
        event.kind === "damage" && event.targetId === "y" ? [event.amount] : [],
      );
      const gained = entry.events.flatMap((event) =>
        event.kind === "heal" && event.targetId === "n" ? [event.amount] : [],
      );
      expect(gained).toEqual(dealt);
    }
  });

  it("gives nothing for a blow that misses", () => {
    const sim = match();
    kill(sim, "x");
    cast(sim, VAMPIRIC);
    const horror = only(sim, "Vampiric Horror");
    horror.combatant.statuses.apply("blind", 60, "y", NO_RANKS);
    get(sim, "n").combatant.health = 100;
    const missed = stepFor(sim, 20).filter(
      (entry) =>
        entry.sourceId === horror.id &&
        entry.events.some((event) => event.kind === "attack-missed"),
    );
    expect(missed.length).toBeGreaterThanOrEqual(1);
    for (const entry of missed) {
      expect(entry.events.some((event) => event.kind === "heal")).toBe(false);
    }
  });

  it("gives nothing once its owner is dead", () => {
    const sim = match();
    kill(sim, "x");
    cast(sim, VAMPIRIC);
    const horror = only(sim, "Vampiric Horror");
    kill(sim, "n");
    const heals = stepFor(sim, 8)
      .filter((entry) => entry.sourceId === horror.id)
      .flatMap((entry) => entry.events.filter((event) => event.kind === "heal"));
    expect(heals).toEqual([]);
  });
});

describe("Flesh Golem (#1836)", () => {
  it("is GW1's level at every Death Magic rank, from level 3...25, Health 80 + 20 a level (#1899)", () => {
    const scaling = FLESH_GOLEM.attack?.scaling;
    if (scaling?.kind !== "level") {
      throw new Error("the Flesh Golem's blows scale by level");
    }
    const ranks = Array.from({ length: 13 }, (_, rank) => rank);
    const levels = [3, 4, 6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21];
    expect(ranks.map((rank) => magnitudeAtRank(scaling.level, rank))).toEqual(levels);
    // Whole levels, so Health steps with them: 500 at 12, not 80 + 20·20.6.
    expect(
      ranks.map((rank) =>
        resolveMagnitudeAtRanks(
          FLESH_GOLEM.maxHealth,
          new Map([["necromancer.death-magic", rank]]),
        ),
      ),
    ).toEqual(levels.map((level) => 80 + 20 * level));
  });

  it("leaves 3 corpses at Death Magic 12, each exploited once, and goes with the last", () => {
    const sim = match();
    kill(sim, "x");
    cast(sim, GOLEM);
    const golem = only(sim, "Flesh Golem");
    kill(sim, golem.id);
    stepFor(sim, DT);
    expect(sim.get(golem.id)).toBeDefined();
    for (let i = 0; i < 3; i += 1) {
      cast(sim, HORROR);
    }
    expect(minionsOf(sim, "Bone Horror")).toHaveLength(3);
    expect(sim.get(golem.id)).toBeUndefined();
    sim.setTarget("n", undefined);
    stepFor(sim, 6);
    expect(sim.requestSkill("n", BAR.indexOf(HORROR))?.check).toMatchObject({ ok: false });
  });

  it("is one at a time: a second kills the first, which leaves its corpses", () => {
    const sim = match();
    kill(sim, "x");
    kill(sim, "z");
    cast(sim, GOLEM);
    const first = only(sim, "Flesh Golem");
    const events = cast(sim, GOLEM);
    expect(events).toContainEqual({ kind: "death", targetId: first.id });
    const second = only(sim, "Flesh Golem");
    expect(second.id).not.toBe(first.id);
    expect(get(sim, first.id).combatant.dead).toBe(true);
  });

  it("leaves at most one body lying: a second takes the first's away", () => {
    const sim = match();
    kill(sim, "x");
    kill(sim, "z");
    cast(sim, GOLEM);
    const first = only(sim, "Flesh Golem");
    kill(sim, first.id);
    cast(sim, GOLEM);
    const second = only(sim, "Flesh Golem");
    kill(sim, second.id);
    const bodies = [...sim.participants()].filter(
      (participant) => participant.creature?.name === "Flesh Golem" && participant.combatant.dead,
    );
    expect(bodies.map((body) => body.id)).toEqual([second.id]);
  });
});

describe("Shambling Horror (#1836)", () => {
  it("is replaced where it fell by a Jagged Horror whose blows make its foe bleed", () => {
    const sim = match();
    kill(sim, "x");
    cast(sim, SHAMBLING);
    const shambling = only(sim, "Shambling Horror");
    const fell = shambling.position;
    kill(sim, shambling.id);
    stepFor(sim, DT);
    const jagged = only(sim, "Jagged Horror");
    expect(jagged.creature?.look).toBe("jagged-horror");
    expect(distance(jagged.position, fell)).toBeLessThanOrEqual(
      RULES.movement.maxSpeedUnitsPerSecond * 2 * DT + 2 * RULES.collision.creatureRadius,
    );
    expect(jagged.combatant.maxHealth).toBe(320);
    expect(jagged.creature?.replacedBy).toBeUndefined();
    const hit = stepFor(sim, 10).some(
      (entry) =>
        entry.sourceId === jagged.id &&
        entry.events.some((event) => event.kind === "damage" && event.targetId === "y"),
    );
    expect(hit).toBe(true);
    expect(get(sim, "y").combatant.statuses.has("bleeding")).toBe(true);
  });

  it("is replaced when destroyed, but not once its owner is dead", () => {
    const sim = match();
    kill(sim, "x");
    cast(sim, SHAMBLING);
    cast(sim, PUTRID, only(sim, "Shambling Horror").id);
    stepFor(sim, DT);
    const jagged = only(sim, "Jagged Horror");
    kill(sim, "n");
    kill(sim, jagged.id);
    stepFor(sim, DT);
    expect(minionsOf(sim)).toEqual([]);
  });
});

describe("Putrid Flesh and Feast for the Dead (#1836)", () => {
  it("Putrid Flesh diseases foes near the caster's minion and destroys it: no death", () => {
    const sim = match();
    kill(sim, "x");
    cast(sim, VAMPIRIC);
    const horror = only(sim, "Vampiric Horror");
    const events = cast(sim, PUTRID, horror.id);
    expect(events).toContainEqual({ kind: "creature-destroyed", targetId: horror.id });
    expect(events.some((event) => event.kind === "death")).toBe(false);
    expect(get(sim, "y").combatant.statuses.has("disease")).toBe(true);
    expect(sim.get(horror.id)).toBeUndefined();
  });

  it("Putrid Flesh refuses anything but a minion of the caster's", () => {
    const sim = match();
    sim.setTarget("n", "y");
    get(sim, "n").combatant.energy = 100;
    expect(sim.requestSkill("n", BAR.indexOf(PUTRID))?.check).toEqual({
      ok: false,
      reason: "invalid-target-not-own-minion",
    });
  });

  it("Feast for the Dead heals the caster's other minions 82 and destroys its target", () => {
    const sim = match();
    kill(sim, "x");
    kill(sim, "z");
    cast(sim, VAMPIRIC);
    cast(sim, SHAMBLING);
    const vampiric = only(sim, "Vampiric Horror");
    const shambling = only(sim, "Shambling Horror");
    vampiric.combatant.health = 100;
    shambling.combatant.health = 100;
    const events = cast(sim, FEAST, shambling.id);
    expect(events).toContainEqual({ kind: "heal", targetId: vampiric.id, amount: 82 });
    expect(events.some((event) => event.kind === "heal" && event.targetId === shambling.id)).toBe(
      false,
    );
    expect(events).toContainEqual({ kind: "creature-destroyed", targetId: shambling.id });
  });
});
