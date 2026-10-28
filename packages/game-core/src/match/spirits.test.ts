import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_SPIRIT } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import type { StatusId } from "../skills/status.js";
import type { Combatant } from "../skills/types.js";
import { landBlow, PLAIN_BLOW, skillBlow, weaponSnapshotOf } from "../skills/weapon-attack.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Spirits (#1064): a ritual plants a creature that projects a status on
 * everyone in its range while it lives. Winnowing reaches both teams,
 * Recuperation only its own.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const WINNOWING = "ranger.winnowing";
const RECUPERATION = "ritualist.recuperation";

const AXE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.axe,
    attributeId: "warrior.axe-mastery",
    damageType: WEAPONS.axe.damageType,
    requirementMet: true,
  },
};

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [WINNOWING, RECUPERATION, "mesmer.leech-signet"],
    attributeRanks: new Map([
      ["ranger.beast-mastery", 12],
      ["ritualist.restoration-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
  return result;
}

/** `r` on team 0 at the origin with `a` beside it, `f` on team 1 in range, `far` well out of it. */
function match(...more: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "spirits",
    participants: [
      spec("r", 0, vec2(0, 0)),
      spec("a", 0, vec2(0, 200)),
      spec("f", 1, vec2(300, 0)),
      spec("far", 0, vec2(RANGE_SPIRIT + 300, 0)),
      ...more,
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

function spirits(sim: MatchSimulation): Participant[] {
  return [...sim.participants()].filter((p) => p.creature?.kind === "spirit");
}

/** `by` casts `skillId` from its bar and the steps until it has gone off; their log. */
function ritual(sim: MatchSimulation, skillId: string, by = "r"): CombatLogEntry[] {
  const slot = get(sim, by).skillBar.indexOf(skillId);
  expect(sim.requestSkill(by, slot)?.check.ok).toBe(true);
  return stepFor(sim, 5.5);
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

function wears(sim: MatchSimulation, id: string, statusId: StatusId): boolean {
  return get(sim, id).combatant.statuses.has(statusId);
}

describe("Winnowing (#1064)", () => {
  it("plants one spirit where its Ranger stands: 340 Health, armor 40, 68 s", () => {
    const sim = match();
    ritual(sim, WINNOWING);
    const [spirit, ...others] = spirits(sim);
    expect(others).toEqual([]);
    expect(spirit?.creature).toMatchObject({
      ownerId: "r",
      kind: "spirit",
      name: "Winnowing",
      skillId: WINNOWING,
    });
    expect(spirit?.position).toEqual(vec2(0, 0));
    expect(spirit?.combatant.maxHealth).toBe(340);
    expect(spirit?.combatant.equipment).toEqual(unarmedResolvedEquipment(40));
    // Planted half a second ago, at the tick its cast ended.
    expect(spirit?.creature?.expiresInSeconds).toBeCloseTo(67.5, 1);
  });

  it("never moves, whoever walks into it", () => {
    const sim = match();
    ritual(sim, WINNOWING);
    const spirit = spirits(sim)[0];
    sim.setInputDirection("f", vec2(-1, 0));
    sim.setInputDirection("r", vec2(1, 0));
    stepFor(sim, 3);
    expect(spirit?.position).toEqual(vec2(0, 0));
    const f = get(sim, "f");
    expect(distance(f.position, vec2(0, 0))).toBeGreaterThanOrEqual(
      RULES.collision.playerRadius + RULES.collision.creatureRadius - 1e-6,
    );
  });

  it("is worn by every body of either team in range, not by one out of it or a spirit", () => {
    const sim = match();
    ritual(sim, RECUPERATION, "a");
    ritual(sim, WINNOWING);
    expect(spirits(sim)).toHaveLength(2);
    expect(["r", "a", "f", "far"].map((id) => wears(sim, id, "winnowing"))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    for (const spirit of spirits(sim)) {
      expect(spirit.combatant.statuses.has("winnowing"), spirit.id).toBe(false);
    }
  });

  it("is gained the step a body walks in and lost the step it walks out", () => {
    const sim = match();
    ritual(sim, WINNOWING);
    const far = get(sim, "far");
    const walk = (direction: Vec2): boolean[] => {
      sim.setInputDirection("far", direction);
      const seen: boolean[] = [];
      for (let i = 0; i < 4 * RULES.tickRateHz; i += 1) {
        const from = far.position;
        sim.step(DT);
        expect(wears(sim, "far", "winnowing")).toBe(distance(from, vec2(0, 0)) <= RANGE_SPIRIT);
        seen.push(wears(sim, "far", "winnowing"));
      }
      return seen;
    };
    // Each walk crosses the edge: both answers come up.
    expect(new Set(walk(vec2(-1, 0)))).toEqual(new Set([false, true]));
    expect(new Set(walk(vec2(1, 0)))).toEqual(new Set([true, false]));
  });

  it("puts its status on the monitor as worn from the spirit, with no end", () => {
    const sim = match();
    ritual(sim, WINNOWING);
    const status = get(sim, "f").combatant.statuses.get("winnowing");
    expect(status).toMatchObject({
      sourceId: spirits(sim)[0]?.id,
      remainingSeconds: Number.POSITIVE_INFINITY,
      projected: true,
    });
  });

  it("is off everyone the step after its spirit dies, and after it expires", () => {
    const killed = match();
    ritual(killed, WINNOWING);
    const spirit = spirits(killed)[0];
    if (spirit === undefined) {
      throw new Error("no spirit");
    }
    spirit.combatant.statuses.apply("burning", 10, "f");
    spirit.combatant.health = 0.2;
    const log = stepFor(killed, DT * 2);
    expect(log.flatMap((entry) => entry.events)).toContainEqual({
      kind: "death",
      targetId: spirit.id,
    });
    expect(spirits(killed)).toEqual([]);
    expect(["r", "a", "f"].some((id) => wears(killed, id, "winnowing"))).toBe(false);

    const expired = match();
    ritual(expired, WINNOWING);
    stepFor(expired, 67.5 + 2 * DT);
    expect(spirits(expired)).toEqual([]);
    expect(["r", "a", "f"].some((id) => wears(expired, id, "winnowing"))).toBe(false);
  });

  it("lets a body under two spirits of it, its own and a foe's, wear it once", () => {
    const sim = match(spec("fr", 1, vec2(400, 300)));
    ritual(sim, WINNOWING);
    ritual(sim, WINNOWING, "fr");
    expect(spirits(sim)).toHaveLength(2);
    const worn = get(sim, "a").combatant.statuses.active.filter(({ id }) => id === "winnowing");
    expect(worn).toHaveLength(1);
  });
});

describe("one spirit of a skill in range (#1064)", () => {
  it("a second allied Winnowing in range of the first ends it, with no death", () => {
    const sim = match(spec("r2", 0, vec2(500, 300)));
    ritual(sim, WINNOWING);
    const first = spirits(sim)[0]?.id;
    const log = ritual(sim, WINNOWING, "r2");
    expect(spirits(sim).map((spirit) => spirit.creature?.ownerId)).toEqual(["r2"]);
    expect(log.flatMap((entry) => entry.events)).not.toContainEqual(
      expect.objectContaining({ kind: "death", targetId: first }),
    );
  });

  it("out of its range, both live; a foe's of the same skill lives beside it", () => {
    const apart = match(spec("r2", 0, vec2(RANGE_SPIRIT + 100, 300)));
    ritual(apart, WINNOWING);
    ritual(apart, WINNOWING, "r2");
    expect(spirits(apart)).toHaveLength(2);

    const foes = match(spec("fr", 1, vec2(100, 300)));
    ritual(foes, WINNOWING);
    ritual(foes, WINNOWING, "fr");
    expect(spirits(foes).map((spirit) => spirit.creature?.ownerId)).toEqual(["r", "fr"]);
  });

  it("an interrupted ritual plants nothing, and its energy is spent", () => {
    const sim = match(spec("m", 1, vec2(200, -200)));
    const slot = get(sim, "r").skillBar.indexOf(WINNOWING);
    expect(sim.requestSkill("r", slot)?.check.ok).toBe(true);
    stepFor(sim, 1);
    sim.setTarget("m", "r");
    expect(sim.requestSkill("m", 2)?.check.ok).toBe(true);
    const log = stepFor(sim, 6);
    expect(log.flatMap((entry) => entry.events)).toContainEqual(
      expect.objectContaining({ kind: "interrupted", targetId: "r" }),
    );
    expect(spirits(sim)).toEqual([]);
    expect(get(sim, "r").combatant.energy).toBeLessThan(100);
  });
});

describe("Recuperation (#1064)", () => {
  it("gives its own side +2 Health regeneration in range, never a foe on top of it", () => {
    const sim = match();
    ritual(sim, RECUPERATION);
    expect(["r", "a", "f", "far"].map((id) => wears(sim, id, "recuperation"))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    // Walking up to it, never.
    sim.setInputDirection("f", vec2(-1, 0));
    for (let i = 0; i < 3 * RULES.tickRateHz; i += 1) {
      sim.step(DT);
      expect(wears(sim, "f", "recuperation")).toBe(false);
    }
    // Right up against it, as close as the Ranger beside it lets it get.
    expect(distance(get(sim, "f").position, vec2(0, 0))).toBeLessThan(100);
  });

  it("says what its spirit does, and to whom", () => {
    const lines = (id: string, attributeId: string) =>
      describeSkill(skillOf(id), new Map([[attributeId, 12]])).effects.map(({ text }) => text);
    expect(lines(RECUPERATION, "ritualist.restoration-magic")).toEqual([
      "Summons 1 Recuperation (340 Health, lasts 49 seconds)",
      "Non-spirit allies in its range: +2 Health regeneration",
    ]);
    expect(lines(WINNOWING, "ranger.beast-mastery")).toEqual([
      "Summons 1 Winnowing (340 Health, lasts 68 seconds)",
      "Non-spirit creatures in its range: physical hits deal +3 damage",
    ]);
  });
});

describe("what a spirit lets the Ritualist do (#1064)", () => {
  it("Weapon of Quickening shortens a binding ritual's recharge by 33%, Mantra of Recovery does not", () => {
    const recharge = (statusId: StatusId): number | undefined => {
      const sim = match();
      get(sim, "r").combatant.statuses.apply(statusId, 60, "r");
      const slot = get(sim, "r").skillBar.indexOf(RECUPERATION);
      expect(sim.requestSkill("r", slot)?.check.ok).toBe(true);
      while (spirits(sim).length === 0) {
        sim.step(DT);
      }
      return get(sim, "r").combatant.cast.rechargeRemaining.get(RECUPERATION);
    };
    expect(recharge("weapon-of-quickening")).toBeCloseTo(45 * 0.67, 5);
    expect(recharge("mantra-of-recovery")).toBe(45);
  });

  it("Spirit Light Weapon heals 21 more a second within earshot of a spirit, any team's", () => {
    const sim = match(
      spec("near", 0, vec2(300, -AREA_EARSHOT + 20), { startHealthFraction: 0.2 }),
      spec("beyond", 0, vec2(300, -AREA_EARSHOT - 100), { startHealthFraction: 0.2 }),
    );
    // The foe's, planted where it stands; Winnowing heals nobody.
    ritual(sim, WINNOWING, "f");
    const spirit = spirits(sim)[0];
    expect(spirit?.combatant.team).toBe(1);
    const near = get(sim, "near").combatant;
    const beyond = get(sim, "beyond").combatant;
    near.statuses.apply("spirit-light-weapon", 10, "r");
    beyond.statuses.apply("spirit-light-weapon", 10, "r");
    const [nearBefore, beyondBefore] = [near.health, beyond.health];
    stepFor(sim, 1);
    expect(near.health - nearBefore - (beyond.health - beyondBefore)).toBeCloseTo(21, 5);
  });
});

describe("Winnowing's +3 (#1064)", () => {
  /** A stream that always rolls `roll` and never crits. */
  const steady = (roll = 10): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => 0.95 });

  const struck = (attacker: Combatant, blow = PLAIN_BLOW): number => {
    const victim = makeCombatant({ id: "victim", team: 1, maxHealth: 1000, health: 1000 });
    const events: CombatEvent[] = [];
    landBlow(
      weaponSnapshotOf(attacker),
      attacker,
      victim,
      blow,
      false,
      steady(),
      RULES.combat,
      events,
    );
    return 1000 - victim.health;
  };

  it("adds 3 to a physical hit against armor at the reference level", () => {
    const warrior = makeCombatant({ id: "w", equipment: AXE });
    const plain = struck(warrior);
    warrior.statuses.project("winnowing", "r/c1");
    expect(struck(warrior)).toBe(plain + 3);
  });

  it("leaves a shot that deals only its fixed damage as it is (Concussion Shot)", () => {
    const ranger = makeCombatant({
      id: "ranger",
      attributeRanks: new Map([["ranger.marksmanship", 12]]),
      equipment: {
        ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
        mainHand: {
          weapon: WEAPONS.flatbow,
          attributeId: "ranger.marksmanship",
          damageType: WEAPONS.flatbow.damageType,
          requirementMet: true,
        },
      },
    });
    const blow = skillBlow(skillOf("ranger.concussion-shot"), ranger);
    const plain = struck(ranger, blow);
    ranger.statuses.project("winnowing", "r/c1");
    expect(struck(ranger, blow)).toBe(plain);
  });
});

function skillOf(id: string) {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}
