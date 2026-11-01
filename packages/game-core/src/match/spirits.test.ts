import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_NATURE_RITUAL, RANGE_SPIRIT } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { resolveMagnitudeAtRanks } from "../skills/scaling.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import type { StatusId } from "../skills/status.js";
import type { Combatant } from "../skills/types.js";
import { landBlow, PLAIN_BLOW, skillBlow, weaponSnapshotOf } from "../skills/weapon-attack.js";
import { distance, normalize, sub, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

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
    creatureDamageScale: undefined,
  },
};

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [WINNOWING, RECUPERATION, "mesmer.leech-signet"],
    attributeRanks: new Map([
      ["ranger.wilderness-survival", 12],
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
      spec("far", 0, vec2(RANGE_NATURE_RITUAL + 300, 0)),
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
  return stepFor(sim, skillOf(skillId).activationSeconds + 0.5);
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
  it("plants one spirit where its Ranger stands: 210 Health, armor 51, 198 s", () => {
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
    expect(spirit?.combatant.maxHealth).toBe(210);
    expect(spirit?.combatant.equipment).toEqual(unarmedResolvedEquipment(51));
    // Planted at the tick its cast ended, half a second and a tick ago.
    expect(spirit?.creature?.expiresInSeconds).toBeCloseTo(197.5 - DT, 5);
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
        expect(wears(sim, "far", "winnowing")).toBe(
          distance(from, vec2(0, 0)) <= RANGE_NATURE_RITUAL,
        );
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
    spirit.combatant.statuses.apply("burning", 10, "f", NO_RANKS);
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
    stepFor(expired, 197.5 + 2 * DT);
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

  it("reaches as far as its own aura: a Winnowing 1,000 away, past spirit range, ends too", () => {
    const sim = match(spec("r2", 0, vec2(1000, 0)));
    ritual(sim, WINNOWING);
    expect(RANGE_SPIRIT).toBeLessThan(1000);
    expect(RANGE_NATURE_RITUAL).toBeGreaterThan(1000);
    ritual(sim, WINNOWING, "r2");
    expect(spirits(sim).map((spirit) => spirit.creature?.ownerId)).toEqual(["r2"]);
  });

  it("out of its range, both live; a foe's of the same skill lives beside it", () => {
    const apart = match(spec("r2", 0, vec2(RANGE_NATURE_RITUAL + 100, 300)));
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

describe("bodies a spirit, minion or pet does not block (#1278)", () => {
  const TOUCH = RULES.collision.playerRadius + RULES.collision.creatureRadius;

  /** `sim` past the aftercast, `id` walking `direction` for `seconds`. */
  function walk(sim: MatchSimulation, direction: Vec2, seconds = 0.5, id = "r"): Vec2 {
    stepFor(sim, 1);
    sim.setInputDirection(id, direction);
    stepFor(sim, seconds);
    sim.setInputDirection(id, vec2(0, 0));
    return get(sim, id).position;
  }

  /** `r` with Recuperation planted at the origin, and the same match with none. */
  function plantedAndBare(): [MatchSimulation, MatchSimulation] {
    const sim = match();
    ritual(sim, RECUPERATION);
    const bare = match();
    stepFor(bare, skillOf(RECUPERATION).activationSeconds + 0.5);
    return [sim, bare];
  }

  it("lets a Ritualist walk off the spirit at their feet in any direction, straight", () => {
    for (const direction of [vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1)]) {
      const [sim, bare] = plantedAndBare();
      expect(walk(sim, direction)).toEqual(walk(bare, direction));
      expect(spirits(sim)[0]?.position).toEqual(vec2(0, 0));
    }
  });

  it("lets a teammate, and then its owner, walk straight through it", () => {
    const [sim, bare] = plantedAndBare();
    for (const each of [sim, bare]) {
      walk(each, vec2(-1, 0));
      each.setInputDirection("a", vec2(0, -1));
    }
    // `a` from 200 above it to 200 below, every step where it is with none.
    for (let i = 0; i < 2.2 * RULES.tickRateHz; i += 1) {
      sim.step(DT);
      bare.step(DT);
      expect(get(sim, "a").position).toEqual(get(bare, "a").position);
    }
    expect(get(sim, "a").position.y).toBeLessThan(-TOUCH);
    for (const each of [sim, bare]) {
      each.setInputDirection("a", vec2(0, 0));
    }
    expect(walk(sim, vec2(1, 0), 1)).toEqual(walk(bare, vec2(1, 0), 1));
    expect(get(sim, "r").position.x).toBeGreaterThan(TOUCH);
    expect(spirits(sim)[0]?.position).toEqual(vec2(0, 0));
  });

  it("stops a foe walking straight at the spirit at the touch", () => {
    const sim = match();
    ritual(sim, RECUPERATION);
    walk(sim, vec2(0, -1));
    sim.setInputDirection("f", vec2(-1, 0));
    stepFor(sim, 3);
    expect(get(sim, "f").position).toEqual(vec2(TOUCH, 0));
  });

  /** `r`'s Bone Minion, spawned on it at the origin, walked by nothing. */
  const MINION: ParticipantSpec = {
    ...spec("r/m", 0, vec2(0, 0)),
    creature: {
      ownerId: "r",
      kind: "minion",
      look: "bone-minion",
      name: "Bone Minion",
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: "necromancer.animate-bone-minions",
      aura: undefined,
      onDeath: "vanish",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      mode: "guard",
    },
  };

  /** `from` walks straight at `r/m` for 3 s, and stops touching it. */
  function walkInto(sim: MatchSimulation, from: string): void {
    const minion = get(sim, "r/m");
    const at = minion.position;
    const body = get(sim, from);
    sim.setInputDirection(from, normalize(sub(at, body.position)));
    stepFor(sim, 3);
    expect(minion.position).toEqual(at);
    expect(distance(body.position, at)).toBeCloseTo(TOUCH, 6);
  }

  it("lets an owner step off the minion spawned on them unpushed, then blocks them", () => {
    const sim = match(MINION);
    const bare = match();
    expect(walk(sim, vec2(0, -1))).toEqual(walk(bare, vec2(0, -1)));
    walkInto(sim, "r");
  });

  it("blocks a teammate, and a foe, at the touch of the owner's minion", () => {
    for (const from of ["a", "f"]) {
      const sim = match(MINION);
      walk(sim, vec2(-1, 0));
      walkInto(sim, from);
    }
  });

  it("lets an owner walk off their own pet standing on them, unpushed", () => {
    const sim = new MatchSimulation({
      seed: "pass",
      participants: [spec("r", 0, vec2(0, 0), { skillBar: ["ranger.charm-animal"] })],
    });
    const pet = [...sim.participants()].find((p) => p.creature?.kind === "pet");
    if (pet === undefined) {
      throw new Error("no pet");
    }
    pet.position = vec2(0, 0);
    const bare = match();
    for (const each of [sim, bare]) {
      each.setInputDirection("r", vec2(0, -1));
      stepFor(each, 0.5);
    }
    expect(get(sim, "r").position).toEqual(get(bare, "r").position);
  });

  it("still pushes two players of one team apart", () => {
    const sim = match(spec("b", 0, vec2(5, 0)));
    stepFor(sim, 0.5);
    expect(distance(get(sim, "r").position, get(sim, "b").position)).toBeGreaterThanOrEqual(
      2 * RULES.collision.playerRadius - 1e-6,
    );
  });
});

describe("a walk that does not steer round its own team's spirit (#1295)", () => {
  const TOUCH = RULES.collision.playerRadius + RULES.collision.creatureRadius;

  /**
   * `r`'s Recuperation planted at the origin, `r` then gone 1 s left, and
   * the same match with no spirit; `extra` joins both.
   */
  function plantedAndBare(...extra: ParticipantSpec[]): [MatchSimulation, MatchSimulation] {
    const sim = match(...extra);
    ritual(sim, RECUPERATION);
    const bare = match(...extra);
    stepFor(bare, skillOf(RECUPERATION).activationSeconds + 0.5);
    for (const each of [sim, bare]) {
      stepFor(each, 1);
      each.setInputDirection("r", vec2(-1, 0));
      stepFor(each, 1);
      each.setInputDirection("r", vec2(0, 0));
    }
    expect(get(sim, "r").position.x).toBeLessThan(-2 * TOUCH);
    return [sim, bare];
  }

  it("walks a teammate's click straight through it, in the time it takes with none", () => {
    const [sim, bare] = plantedAndBare();
    const goal = vec2(0, -200);
    sim.walkTo("a", goal);
    bare.walkTo("a", goal);
    for (let i = 0; i < 3 * RULES.tickRateHz; i += 1) {
      sim.step(DT);
      bare.step(DT);
      expect(Math.abs(get(sim, "a").position.x)).toBeLessThan(1);
      expect(get(sim, "a").position).toEqual(get(bare, "a").position);
    }
    expect(get(sim, "a").position).toEqual(goal);
    expect(spirits(sim)[0]?.position).toEqual(vec2(0, 0));
  });

  it("walks an attack on a foe behind it straight, in the time it takes with none", () => {
    // `b` and `g` on the diagonal through the spirit, clear of everyone else.
    const [sim, bare] = plantedAndBare(
      spec("b", 0, vec2(200, 200), { equipment: AXE }),
      spec("g", 1, vec2(-200, -200)),
    );
    expect(sim.requestAttack("b", "g")?.ok).toBe(true);
    expect(bare.requestAttack("b", "g")?.ok).toBe(true);
    let passed = false;
    for (let i = 0; i < 2 * RULES.tickRateHz; i += 1) {
      sim.step(DT);
      bare.step(DT);
      const at = get(sim, "b").position;
      expect(Math.abs(at.x - at.y) / Math.SQRT2).toBeLessThan(1);
      expect(at).toEqual(get(bare, "b").position);
      passed ||= at.x < -TOUCH;
    }
    expect(passed).toBe(true);
  });

  it("still bends a foe's click round it", () => {
    const [sim] = plantedAndBare();
    sim.walkTo("f", vec2(-100, 0));
    let widest = 0;
    for (let i = 0; i < 3 * RULES.tickRateHz; i += 1) {
      sim.step(DT);
      widest = Math.max(widest, Math.abs(get(sim, "f").position.y));
    }
    expect(widest).toBeGreaterThan(RULES.collision.creatureRadius);
    expect(get(sim, "f").position.x).toBeLessThan(-TOUCH);
  });
});

describe("Recuperation (#1064)", () => {
  it("gives its own side +3 Health regeneration in range, never a foe on top of it", () => {
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

  it("reaches spirit range, not a nature ritual's", () => {
    const sim = match(spec("mid", 0, vec2(0, -(RANGE_SPIRIT + 100))));
    ritual(sim, RECUPERATION);
    expect(wears(sim, "a", "recuperation")).toBe(true);
    expect(wears(sim, "mid", "recuperation")).toBe(false);
  });

  it("says what its spirit does, and to whom", () => {
    const lines = (id: string, attributeId: string) =>
      describeSkill(skillOf(id), new Map([[attributeId, 12]])).effects.map(({ text }) => text);
    expect(lines(RECUPERATION, "ritualist.restoration-magic")).toEqual([
      "Summons 1 Recuperation (210 Health, lasts 39 seconds)",
      "Non-spirit allies in its range: +3 Health regeneration",
    ]);
    expect(lines(WINNOWING, "ranger.wilderness-survival")).toEqual([
      "Summons 1 Winnowing (210 Health, lasts 198 seconds)",
      "Non-spirit creatures in its range: take +4 from physical damage",
    ]);
  });
});

describe("Spawning Power (#1098)", () => {
  /** `r`, with `spawningPower` and the rest of `spec`'s ranks, alone on team 0. */
  function summoner(spawningPower: number, extra?: Partial<ParticipantSpec>): MatchSimulation {
    return new MatchSimulation({
      seed: "spawning",
      participants: [
        spec("r", 0, vec2(0, 0), {
          attributeRanks: new Map([
            ["ranger.wilderness-survival", 12],
            ["ritualist.restoration-magic", 12],
            ["ritualist.spawning-power", spawningPower],
          ]),
          ...extra,
        }),
      ],
    });
  }

  it("gives a Ritualist's spirit 4% more Health a rank: 311 at 12, 210 at 0", () => {
    const strong = summoner(12);
    ritual(strong, RECUPERATION);
    expect(spirits(strong)[0]?.combatant.maxHealth).toBe(311);
    const plain = summoner(0);
    ritual(plain, RECUPERATION);
    expect(spirits(plain)[0]?.combatant.maxHealth).toBe(210);
  });

  it("is the summoner's: a Ranger's Winnowing gets it, an R/Rt with none gets 210", () => {
    const rtR = summoner(12);
    ritual(rtR, WINNOWING);
    expect(spirits(rtR)[0]?.combatant.maxHealth).toBe(311);
    const rRt = match();
    ritual(rRt, RECUPERATION);
    expect(spirits(rRt)[0]?.combatant.maxHealth).toBe(210);
  });

  it("leaves a charmed pet alone (#1144): the same summoner's wolf has 480, its spirit 311", () => {
    const sim = summoner(12, { skillBar: [RECUPERATION, "ranger.charm-animal"] });
    const pet = [...sim.participants()].find((p) => p.creature?.kind === "pet");
    expect(pet?.combatant.maxHealth).toBe(480);
    ritual(sim, RECUPERATION);
    expect(spirits(sim)[0]?.combatant.maxHealth).toBe(311);
  });

  it("leaves the spirit's lifetime alone", () => {
    const sim = summoner(12);
    ritual(sim, RECUPERATION);
    const plain = summoner(0);
    ritual(plain, RECUPERATION);
    expect(spirits(sim)[0]?.creature?.expiresInSeconds).toBe(
      spirits(plain)[0]?.creature?.expiresInSeconds,
    );
  });

  it("says the health in the tooltip, the base in brackets", () => {
    const line = (spawningPower: number) =>
      describeSkill(
        skillOf(RECUPERATION),
        new Map([
          ["ritualist.restoration-magic", 12],
          ["ritualist.spawning-power", spawningPower],
        ]),
      ).effects[0]?.text;
    expect(line(12)).toBe("Summons 1 Recuperation (311 Health (210), lasts 39 seconds)");
    expect(line(0)).toBe("Summons 1 Recuperation (210 Health, lasts 39 seconds)");
  });
});

describe("what a spirit lets the Ritualist do (#1064)", () => {
  it("Weapon of Quickening shortens a binding ritual's recharge by 33%, Mantra of Recovery does not", () => {
    const recharge = (statusId: StatusId): number | undefined => {
      const sim = match();
      get(sim, "r").combatant.statuses.apply(statusId, 60, "r", NO_RANKS);
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
    near.statuses.apply("spirit-light-weapon", 10, "r", NO_RANKS);
    beyond.statuses.apply("spirit-light-weapon", 10, "r", NO_RANKS);
    const [nearBefore, beyondBefore] = [near.health, beyond.health];
    stepFor(sim, 1);
    expect(near.health - nearBefore - (beyond.health - beyondBefore)).toBeCloseTo(21, 5);
  });
});

describe("Winnowing's +4 (#1064)", () => {
  /** A stream that always rolls `roll` and never crits. */
  const steady = (roll = 10): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => 0.95 });

  /** What `blow` takes off a reference-armor victim, under Winnowing or not. */
  const struck = (attacker: Combatant, winnowed: boolean, blow = PLAIN_BLOW): number => {
    const victim = makeCombatant({ id: "victim", team: 1, maxHealth: 1000, health: 1000 });
    if (winnowed) {
      victim.statuses.project("winnowing", "r/c1", NO_RANKS);
    }
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

  it("adds 4 to a physical hit its bearer takes, against armor at the reference level", () => {
    const warrior = makeCombatant({ id: "w", equipment: AXE });
    expect(struck(warrior, true)).toBe(struck(warrior, false) + 4);
  });

  it("is on the attacker's own hits nothing: it is what the bearer takes", () => {
    const warrior = makeCombatant({ id: "w", equipment: AXE });
    const plain = struck(warrior, false);
    warrior.statuses.project("winnowing", "r/c1", NO_RANKS);
    expect(struck(warrior, false)).toBe(plain);
  });

  it("adds 4 to a shot that deals only its fixed damage too (Concussion Shot)", () => {
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
          creatureDamageScale: undefined,
        },
      },
    });
    const blow = skillBlow(skillOf("ranger.concussion-shot"), ranger, new Map());
    expect(struck(ranger, true, blow)).toBe(struck(ranger, false, blow) + 4);
  });

  it("adds nothing to fire damage", () => {
    const warrior = makeCombatant({ id: "w", equipment: AXE });
    const fire = { ...PLAIN_BLOW, damageType: "fire" as const };
    expect(struck(warrior, true, fire)).toBe(struck(warrior, false, fire));
  });
});

function skillOf(id: string) {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("a spirit's Health by whole level (#1917)", () => {
  /** The Health `skillId`'s spirit has at `rank` of the attribute it scales with. */
  function healthAt(skillId: string, rank: number): number {
    const summon = getSkill(skillId)?.effects.find((effect) => effect.kind === "summon");
    if (summon?.kind !== "summon") {
      throw new Error(`${skillId} summons nothing`);
    }
    const health = summon.creature.maxHealth;
    if (!("byLevel" in health)) {
      throw new Error(`${skillId}'s spirit has no level`);
    }
    return resolveMagnitudeAtRanks(health, new Map([[health.byLevel.level.attributeId, rank]]));
  }

  it("steps Winnowing's spirit by GW1's level 1...10: 50 + 20 per level", () => {
    // Levels 1, 2, 8 and 10: never the straight line's 245 at 15.
    expect([0, 1, 12, 15].map((rank) => healthAt(WINNOWING, rank))).toEqual([70, 90, 210, 250]);
  });

  it("gives a Ritualist spirit 210 at 12, not the unrounded 214", () => {
    expect(healthAt("ritualist.displacement", 12)).toBe(210);
  });
});
