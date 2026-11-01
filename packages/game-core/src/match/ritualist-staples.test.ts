import { describe, expect, it } from "vitest";

import { AREA_IN_THE_AREA, RANGE_MELEE, RANGE_SPIRIT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { fillPools } from "../skills/adrenaline.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { applyEffects, type CombatEvent } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import { KNOCKDOWN_SECONDS, type Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Ritualist spirits (#1550): spirit blows that steal, double on a hex or
 * knock down at a cost, Soothing's slower adrenaline, the death bursts of
 * Destruction and Life, and Xinrae's Weapon.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BLOODSONG = "ritualist.bloodsong";
const ANGUISH = "ritualist.anguish";
const WANDERLUST = "ritualist.wanderlust";
const SOOTHING = "ritualist.soothing";
const DESTRUCTION = "ritualist.destruction";
const LIFE = "ritualist.life";
const XINRAES_WEAPON = "ritualist.xinraes-weapon";
const BAR = [BLOODSONG, ANGUISH, WANDERLUST, SOOTHING, DESTRUCTION, LIFE, XINRAES_WEAPON];
const RANKS = new Map([
  ["ritualist.communing", 12],
  ["ritualist.channeling-magic", 12],
  ["ritualist.restoration-magic", 12],
]);

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: BAR,
    attributeRanks: RANKS,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
  return result;
}

/** Ritualist `r` at the origin, at `ranks`, and `more`. */
function match(more: readonly ParticipantSpec[] = [], ranks = RANKS): MatchSimulation {
  return new MatchSimulation({
    seed: "ritualist-staples",
    participants: [spec("r", 0, vec2(0, 0), { attributeRanks: ranks }), ...more],
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

/** `r` casts `skillId` and steps until its spirit stands. */
function ritual(sim: MatchSimulation, skillId: string): Participant {
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check.ok).toBe(true);
  stepFor(sim, skillOf(skillId).activationSeconds + DT * 2);
  const found = [...sim.participants()].find((p) => p.creature?.skillId === skillId);
  if (found === undefined) {
    throw new Error(`no ${skillId} spirit`);
  }
  return found;
}

/** Every event of `log` from `sourceId`. */
function eventsOf(log: readonly CombatLogEntry[], sourceId: string): CombatEvent[] {
  return log.filter((entry) => entry.sourceId === sourceId).flatMap((entry) => entry.events);
}

function sum(events: readonly CombatEvent[], kind: CombatEvent["kind"], targetId: string): number {
  return events.reduce(
    (total, event) =>
      event.kind === kind && "targetId" in event && event.targetId === targetId && "amount" in event
        ? total + event.amount
        : total,
    0,
  );
}

describe("the spirits' numbers at rank 12 (#1550)", () => {
  it.each([
    [BLOODSONG, 190, 126],
    [ANGUISH, 170, 39],
    [WANDERLUST, 190, 54],
    [SOOTHING, 190, 39],
    [DESTRUCTION, 210, 30],
    [LIFE, 210, 20],
  ])("%s: %i Health, %i s", (id, health, seconds) => {
    const planted = ritual(match(), id);
    expect(planted.combatant.maxHealth).toBe(health);
    expect(planted.combatant.equipment.baseArmor).toBe(51);
    expect(planted.creature?.expiresInSeconds).toBeLessThan(seconds);
    expect(planted.creature?.expiresInSeconds).toBeCloseTo(seconds, 0);
  });
});

describe("Bloodsong (#1550)", () => {
  it("each hit steals 21 for the spirit, even at full Health, and deals nothing else", () => {
    const sim = match([spec("f", 1, vec2(300, 0), { skillBar: [] })]);
    const spirit = ritual(sim, BLOODSONG);
    const events = eventsOf(stepFor(sim, 5), spirit.id);
    expect(sum(events, "life-stolen", "f")).toBeGreaterThanOrEqual(42);
    expect(sum(events, "life-stolen", "f") % 21).toBe(0);
    expect(sum(events, "damage", "f")).toBe(0);
    expect(spirit.combatant.health).toBe(spirit.combatant.maxHealth);
  });
});

describe("Anguish (#1550)", () => {
  /** What one Anguish blow lands on `f`, hexed or not. */
  function blow(hexed: boolean): CombatEvent[] {
    const sim = match([spec("f", 1, vec2(300, 0), { skillBar: [] })]);
    if (hexed) {
      get(sim, "f").combatant.statuses.apply("lamentation", 1000, "r", NO_RANKS);
    }
    const spirit = ritual(sim, ANGUISH);
    const log = stepFor(sim, 4);
    const first = log.find(
      (entry) =>
        entry.sourceId === spirit.id && entry.events.some((event) => event.kind === "damage"),
    );
    return first?.events.filter((event) => event.kind === "damage") ?? [];
  }

  it("deals one packet to an unhexed foe, two equal ones to a hexed one", () => {
    const plain = blow(false);
    const hexed = blow(true);
    expect(plain).toHaveLength(1);
    expect(hexed).toHaveLength(2);
    expect(sum(hexed, "damage", "f")).toBeGreaterThan(sum(plain, "damage", "f"));
  });
});

describe("Wanderlust (#1550)", () => {
  it("knocks a standing foe down and pays 54 Health for it", () => {
    const sim = match([spec("f", 1, vec2(300, 0), { skillBar: [] })]);
    const spirit = ritual(sim, WANDERLUST);
    const foe = get(sim, "f").combatant;
    let knocked = false;
    for (let i = 0; i < 4 / DT && !knocked; i += 1) {
      sim.step(DT);
      knocked = foe.knockdownRemaining > 0;
    }
    expect(knocked).toBe(true);
    expect(foe.knockdownRemaining).toBeCloseTo(KNOCKDOWN_SECONDS, 1);
    expect(spirit.combatant.maxHealth - spirit.combatant.health).toBe(54);
  });

  it("does nothing to a foe on the move, and costs nothing", () => {
    const sim = match([spec("f", 1, vec2(300, 0), { skillBar: [] })]);
    const spirit = ritual(sim, WANDERLUST);
    const foe = get(sim, "f");
    for (let i = 0; i < 4 / DT; i += 1) {
      // Back and forth inside the spirit's range.
      sim.setInputDirection("f", vec2(i % 40 < 20 ? 1 : -1, 0));
      sim.step(DT);
      expect(foe.combatant.knockdownRemaining).toBe(0);
    }
    expect(spirit.combatant.health).toBe(spirit.combatant.maxHealth);
  });
});

describe("Soothing (#1550)", () => {
  it("halves the adrenaline a foe in its range gains; an ally gains as ever", () => {
    const sim = match([
      spec("f", 1, vec2(300, 0), { skillBar: ["warrior.sever-artery"] }),
      spec("a", 0, vec2(0, 100), { skillBar: ["warrior.sever-artery"] }),
    ]);
    ritual(sim, SOOTHING);
    const foe = get(sim, "f").combatant;
    const ally = get(sim, "a").combatant;
    expect(foe.statuses.has("soothing")).toBe(true);
    expect(ally.statuses.has("soothing")).toBe(false);
    fillPools(foe, 50);
    fillPools(ally, 50);
    expect([...foe.adrenaline.values()]).toEqual([25]);
    expect([...ally.adrenaline.values()]).toEqual([50]);
  });
});

describe("death bursts (#1550)", () => {
  it("Destruction living its 30 s deals 150 to each foe in the area, none to allies", () => {
    const sim = match([
      spec("f", 1, vec2(AREA_IN_THE_AREA - 10, 0), { skillBar: [] }),
      spec("far", 1, vec2(AREA_IN_THE_AREA + 50, 0), { skillBar: [] }),
      spec("a", 0, vec2(0, 50), { skillBar: [] }),
    ]);
    const spirit = ritual(sim, DESTRUCTION);
    const events = eventsOf(stepFor(sim, 31), "r");
    expect(sim.get(spirit.id)).toBeUndefined();
    expect(sum(events, "damage", "f")).toBe(150);
    expect(sum(events, "damage", "far")).toBe(0);
    expect(sum(events, "damage", "a")).toBe(0);
  });

  it("Destruction gone after 10 whole seconds deals 80; one under a second, nothing", () => {
    for (const [lived, dealt] of [
      [10.5, 80],
      [0.9, 0],
    ] as const) {
      const sim = match([spec("f", 1, vec2(100, 0), { skillBar: [] })]);
      const spirit = ritual(sim, DESTRUCTION);
      const creature = spirit.creature;
      if (creature === undefined) {
        throw new Error("not a creature");
      }
      creature.expiresInSeconds = lived - creature.ageSeconds;
      const events = eventsOf(stepFor(sim, lived + 1), "r");
      expect(sum(events, "damage", "f")).toBe(dealt);
    }
  });

  it("scales with its caster's rank at summoning: 1 a second at rank 0 (#1603)", () => {
    const sim = match([spec("f", 1, vec2(100, 0), { skillBar: [] })], new Map());
    const spirit = ritual(sim, DESTRUCTION);
    const creature = spirit.creature;
    if (creature === undefined) {
      throw new Error("not a creature");
    }
    expect(creature.deathBurst).toMatchObject({ perSecondAlive: 1 });
    creature.expiresInSeconds = 10.5 - creature.ageSeconds;
    expect(sum(eventsOf(stepFor(sim, 11.5), "r"), "damage", "f")).toBe(10);
    expect(
      describeSkill(skillOf(DESTRUCTION), new Map()).effects.map((each) => each.text),
    ).toContain(
      "When it dies, non-spirit foes in the area take 1 damage per second it lived (max 150)",
    );
  });

  it("Destruction killed bursts as it dies", () => {
    const sim = match([
      spec("f", 1, vec2(RANGE_MELEE / 2, 0), {
        skillBar: [],
        equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      }),
    ]);
    const spirit = ritual(sim, DESTRUCTION);
    stepFor(sim, 5);
    spirit.combatant.health = 1;
    const age = spirit.creature?.ageSeconds ?? 0;
    expect(sim.requestAttack("f", spirit.id)).toEqual({ ok: true });
    let events: CombatEvent[] = [];
    let lived = age;
    for (let i = 0; i < 5 / DT && sim.get(spirit.id) !== undefined; i += 1) {
      lived = (spirit.creature?.ageSeconds ?? 0) + DT;
      events = events.concat(eventsOf(sim.step(DT).log, "r"));
    }
    expect(sim.get(spirit.id)).toBeUndefined();
    expect(sum(events, "damage", "f")).toBe(8 * Math.floor(lived));
  });

  it("Life living its 20 s heals each non-spirit ally in range 120, and no spirit", () => {
    const sim = match([
      spec("a", 0, vec2(RANGE_SPIRIT - 10, 0), { skillBar: [] }),
      spec("f", 1, vec2(0, 100), { skillBar: [] }),
    ]);
    const bloodsong = ritual(sim, BLOODSONG);
    stepFor(sim, 1);
    const life = ritual(sim, LIFE);
    // Hurt just before it goes, so regeneration has not refilled them.
    stepFor(sim, 19);
    for (const id of ["r", "a", "f"]) {
      get(sim, id).combatant.health -= 300;
    }
    bloodsong.combatant.health -= 100;
    const events = eventsOf(stepFor(sim, 1.5), "r");
    expect(sim.get(life.id)).toBeUndefined();
    expect(sum(events, "heal", "a")).toBe(120);
    expect(sum(events, "heal", "r")).toBe(120);
    expect(sum(events, "heal", "f")).toBe(0);
    expect(sum(events, "heal", bloodsong.id)).toBe(0);
  });
});

describe("Xinrae's Weapon (#1550)", () => {
  it("caps the next foe's hit at 5% of max Health, then steals 68 and ends", () => {
    const sim = match([spec("f", 1, vec2(100, 0), { skillBar: [] })]);
    const ally = get(sim, "r").combatant;
    const foe = get(sim, "f").combatant;
    ally.statuses.apply("xinraes-weapon", 8, "r", NO_RANKS);
    const before = ally.health;
    const events = applyEffects(
      [{ kind: "damage", amount: { flat: 100 }, type: "typeless", armorPenetration: 0 }],
      {
        caster: foe,
        target: ally,
        rng: createRng(1),
        rules: RULES.combat,
        surroundings: new Map(),
      },
    );
    expect(before - ally.health).toBe(Math.floor(ally.maxHealth * 0.05));
    expect(sum(events, "damage", "r")).toBe(Math.floor(ally.maxHealth * 0.05));
    const foeBefore = foe.health;
    stepFor(sim, DT);
    expect(ally.statuses.has("xinraes-weapon")).toBe(false);
    expect(foeBefore - foe.health).toBe(68);
  });
});

describe("a flat lose-health (#1550)", () => {
  it("costs its caster the amount once, with no profession to count", () => {
    const caster = makeCombatant({ id: "c" });
    const target = makeCombatant({ id: "t" });
    const events = applyEffects(
      [{ kind: "lose-health", amount: { flat: 54 }, perRemovedOfProfession: undefined }],
      { caster, target, rng: createRng(1), rules: RULES.combat, surroundings: new Map() },
    );
    expect(events).toEqual([{ kind: "sacrifice", targetId: "c", amount: 54 }]);
  });
});

describe("the texts (#1550)", () => {
  const lines = (id: string): string[] =>
    describeSkill(skillOf(id), RANKS).effects.map((each) => each.text);

  it("names the on-hit effects and the bursts", () => {
    expect(lines(BLOODSONG)).toContain("Its attacks: steals up to 21 Health");
    expect(lines(ANGUISH)).toContain("Its attacks: if target has a hex: deals 17 piercing damage");
    // One line, and the spirit pays (QA on PR 1582).
    expect(lines(WANDERLUST)).toContain(
      "Its attacks: if target is not moving: knocks down for 2s, this spirit loses 54 Health",
    );
    expect(lines(WANDERLUST).filter((line) => line.startsWith("Its attacks"))).toHaveLength(1);
    expect(lines(SOOTHING).join(" ")).toContain("gain adrenaline 50% slower");
    expect(lines(DESTRUCTION)).toContain(
      "When it dies, non-spirit foes in the area take 8 damage per second it lived (max 150)",
    );
    expect(lines(LIFE)).toContain(
      "When it dies, non-spirit allies in its range are healed for 6 Health per second it lived",
    );
  });

  it("says what an attacking spirit's blow deals, before its rider (#1631)", () => {
    expect(lines(ANGUISH)).toContain("Its attacks deal 17 damage");
    expect(lines("ritualist.pain")).toContain("Its attacks deal 25 damage");
    const anguish = lines(ANGUISH);
    expect(anguish.indexOf("Its attacks deal 17 damage")).toBeLessThan(
      anguish.indexOf("Its attacks: if target has a hex: deals 17 piercing damage"),
    );
  });

  it("says it scaled, at rank 0 too (#1631)", () => {
    const line = describeSkill(skillOf(ANGUISH), new Map()).effects.find(({ text }) =>
      text.startsWith("Its attacks deal"),
    );
    expect(line?.text).toBe("Its attacks deal 5 damage");
    expect(line?.magnitude?.atZero).toBe(5);
  });

  it("gives a blow that is only its rider no damage line (#1631)", () => {
    for (const id of [BLOODSONG, WANDERLUST]) {
      expect(
        lines(id).some((line) => line.startsWith("Its attacks deal")),
        id,
      ).toBe(false);
    }
  });
});
