import { describe, expect, it } from "vitest";

import { defaultBuildEquipment, validatePlayerBuild, type PlayerBuild } from "../build.js";
import { AREA_EARSHOT } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { effectiveActivationSeconds } from "../skills/tick.js";
import { isSpell, type Combatant, type Skill } from "../skills/types.js";
import { blocks, resolveAttackSkill, resolveSwing } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ANTHEM = "paragon.anthem-of-flame";
const WARDING = "ritualist.weapon-of-warding";
const NOWHERE = (): boolean => false;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** A rank-12 axe warrior under Anthem of Flame. */
function chanted(): Combatant {
  const attacker = makeCombatant({
    id: "a",
    team: 0,
    equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
    attributeRanks: new Map([["warrior.axe-mastery", 12]]),
  });
  attacker.statuses.apply("anthem-of-flame", 10, "p", NO_RANKS);
  return attacker;
}

const victim = (id = "t"): Combatant => makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 });

const burned = (events: readonly CombatEvent[]): string[] =>
  events.flatMap((event) =>
    event.kind === "status-applied" && event.statusId === "burning" ? [event.targetId] : [],
  );

function chop(attacker: Combatant, targets: readonly Combatant[], seed = 1): CombatEvent[] {
  return resolveAttackSkill(
    {
      surroundings: new Map(),
      skill: skill("warrior.swift-chop"),
      caster: attacker,
      targets,
      rng: createRng(seed),
      rules: RULES.combat,
    },
    NOWHERE,
    [],
  );
}

function swing(attacker: Combatant, target: Combatant, seed = 1): CombatEvent[] {
  return resolveSwing({
    attacker,
    target: { combatant: target, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng: createRng(seed),
    rules: RULES.combat,
    exposed: NOWHERE,
  }).events;
}

describe("Anthem of Flame on an attack skill (#758)", () => {
  it("an attack skill that hits burns its target for 3 s and ends the chant", () => {
    const attacker = chanted();
    const target = victim();
    const events = chop(attacker, [target]);
    expect(burned(events)).toEqual(["t"]);
    expect(target.statuses.get("burning")?.remainingSeconds).toBe(3);
    expect(attacker.statuses.has("anthem-of-flame")).toBe(false);
    expect(events).toContainEqual({
      kind: "status-expired",
      targetId: "a",
      statusId: "anthem-of-flame",
    });
  });

  it("a blocked one burns nobody and still ends the chant", () => {
    let seenBlock = false;
    for (let seed = 0; seed < 30; seed += 1) {
      const attacker = chanted();
      const target = victim();
      target.statuses.apply("guardian", 10, "ally", NO_RANKS);
      const events = chop(attacker, [target], seed);
      const blocked = events.some((event) => event.kind === "attack-blocked");
      seenBlock ||= blocked;
      expect(target.statuses.has("burning")).toBe(!blocked);
      expect(attacker.statuses.has("anthem-of-flame")).toBe(false);
    }
    expect(seenBlock).toBe(true);
  });

  it("a blind miss burns nobody and still ends the chant", () => {
    const attacker = chanted();
    attacker.statuses.apply("blind", 10, "foe", NO_RANKS);
    for (let seed = 0; seed < 30; seed += 1) {
      attacker.statuses.apply("anthem-of-flame", 10, "p", NO_RANKS);
      const target = victim();
      const missed = chop(attacker, [target], seed).some((event) => event.kind === "attack-missed");
      expect(target.statuses.has("burning")).toBe(!missed);
      expect(attacker.statuses.has("anthem-of-flame")).toBe(false);
    }
  });

  it("a plain swing leaves it alone", () => {
    const attacker = chanted();
    const target = victim();
    expect(burned(swing(attacker, target))).toEqual([]);
    expect(attacker.statuses.has("anthem-of-flame")).toBe(true);
  });

  it("burns every victim an attack skill hits, Barrage's volley each", () => {
    const ranger = makeCombatant({
      id: "a",
      equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
      attributeRanks: new Map([["ranger.marksmanship", 12]]),
    });
    ranger.statuses.apply("anthem-of-flame", 10, "p", NO_RANKS);
    const events = resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: skill("ranger.barrage"),
        caster: ranger,
        targets: [victim("x"), victim("y"), victim("z")],
        rng: createRng(1),
        rules: RULES.combat,
      },
      NOWHERE,
      [],
    );
    expect(burned(events)).toEqual(["x", "y", "z"]);
    expect(ranger.statuses.has("anthem-of-flame")).toBe(false);
  });

  it("is a chant, not a spell, and chants are not exclusive: the longer one stays", () => {
    const anthem = skill(ANTHEM);
    expect(anthem.type).toBe("chant");
    expect(isSpell(anthem.type)).toBe(false);
    const dazed = makeCombatant({ id: "p" });
    dazed.statuses.apply("dazed", 10, "foe", NO_RANKS);
    expect(effectiveActivationSeconds(anthem, dazed)).toBe(1);
    const ally = makeCombatant({ id: "a" });
    ally.statuses.apply("anthem-of-flame", 10, "p", NO_RANKS);
    ally.statuses.apply("watch-yourself", 10, "w", NO_RANKS);
    ally.statuses.apply("anthem-of-flame", 4, "p", NO_RANKS);
    // The re-application is the newest (#521), but the longer duration stays.
    expect(ally.statuses.active.map((status) => [status.id, status.remainingSeconds])).toEqual([
      ["watch-yourself", 10],
      ["anthem-of-flame", 10],
    ]);
  });

  it("reads as what it does", () => {
    const description = describeSkill(skill(ANTHEM));
    expect(description.typeText).toBe("Chant.");
    expect(description.effects.map((effect) => effect.text)).toEqual([
      "Applies Anthem of Flame for 10s (next attack skill: Burning 3s)",
    ]);
  });
});

describe("Weapon of Warding (#758)", () => {
  it("+4 health regeneration and a 50% chance to block", () => {
    const ally = makeCombatant({ id: "a" });
    ally.statuses.apply("weapon-of-warding", 7, "r", NO_RANKS);
    expect(aggregateModifiers(ally.statuses.active).healthPips).toBe(4);
    const rng = createRng(758);
    let blocked = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (blocks(ally, "e", i % 2 === 0 ? "melee" : "projectile", false, rng)) {
        blocked += 1;
      }
    }
    expect(blocked / 2000).toBeGreaterThan(0.45);
    expect(blocked / 2000).toBeLessThan(0.55);
  });

  it("ends when its bearer swings, hit or miss, and when it uses an attack skill", () => {
    const swinger = chanted();
    swinger.statuses.apply("weapon-of-warding", 7, "r", NO_RANKS);
    swinger.statuses.apply("blind", 10, "foe", NO_RANKS);
    const events = swing(swinger, victim());
    expect(events[0]).toEqual({
      kind: "status-expired",
      targetId: "a",
      statusId: "weapon-of-warding",
    });
    expect(swinger.statuses.has("weapon-of-warding")).toBe(false);

    const chopper = chanted();
    chopper.statuses.apply("weapon-of-warding", 7, "r", NO_RANKS);
    chop(chopper, [victim()]);
    expect(chopper.statuses.has("weapon-of-warding")).toBe(false);
  });

  it("one weapon spell at a time: the same one again starts over at its duration", () => {
    const ally = makeCombatant({ id: "a" });
    ally.statuses.apply("weapon-of-warding", 7, "r", NO_RANKS);
    ally.statuses.apply("weapon-of-warding", 3, "r", NO_RANKS);
    expect(ally.statuses.get("weapon-of-warding")?.remainingSeconds).toBe(3);
  });

  it("is no enchantment: enchantment removal leaves it", () => {
    const ally = makeCombatant({ id: "a" });
    ally.statuses.apply("weapon-of-warding", 7, "r", NO_RANKS);
    ally.statuses.apply("guardian", 7, "m", NO_RANKS);
    expect(ally.statuses.removeByCategory("enchantment")).toEqual([
      { id: "guardian", sourceSkillId: undefined },
    ]);
    expect(ally.statuses.has("weapon-of-warding")).toBe(true);
  });

  it("is a spell: dazed doubles its cast", () => {
    const warding = skill(WARDING);
    expect(isSpell(warding.type)).toBe(true);
    const dazed = makeCombatant({ id: "r" });
    dazed.statuses.apply("dazed", 10, "foe", NO_RANKS);
    expect(effectiveActivationSeconds(warding, dazed)).toBe(2);
  });

  it("reads as what it does", () => {
    const description = describeSkill(skill(WARDING));
    expect(description.typeText).toBe("Weapon Spell.");
    expect(description.effects.map((effect) => effect.text)).toEqual([
      "Applies Weapon of Warding for 7s (+4 Health regeneration, " +
        "50% chance to block attacks, ends if the bearer attacks)",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* In the match                                                                */
/* -------------------------------------------------------------------------- */

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    spawn,
    facing: 0,
    ...extra,
  };
}

/** A rank-12 Leadership paragon with Anthem of Flame in slot 0. */
const paragon = (spawn: Vec2): ParticipantSpec =>
  spec("p", 0, spawn, {
    skillBar: [ANTHEM],
    attributeRanks: new Map([["paragon.leadership", 12]]),
  });

/** A rank-12 axe warrior with Swift Chop in slot 0. */
const warrior = (id: string, spawn: Vec2): ParticipantSpec =>
  spec(id, 0, spawn, {
    skillBar: ["warrior.swift-chop"],
    attributeRanks: new Map([["warrior.axe-mastery", 12]]),
    equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
  });

/** A rank-12 longbow ranger with Barrage in slot 0. */
const archer = (id: string, spawn: Vec2): ParticipantSpec =>
  spec(id, 0, spawn, {
    skillBar: ["ranger.barrage"],
    attributeRanks: new Map([["ranger.marksmanship", 12]]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
  });

/** An arrow that takes this long to cross 600: two releases fit in one flight. */
const SLOW_FLIGHT_SECONDS = 12;

/** A Barrage and Broad Head Arrow ranger whose longbow shoots slowly. */
const slowArcher = (id: string, spawn: Vec2): ParticipantSpec =>
  spec(id, 0, spawn, {
    skillBar: ["ranger.barrage", "ranger.broad-head-arrow"],
    attributeRanks: new Map([["ranger.marksmanship", 12]]),
    equipment: wielding(
      { ...WEAPONS.longbow, projectileSpeed: 600 / SLOW_FLIGHT_SECONDS },
      "ranger.marksmanship",
    ),
  });

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** Steps until `count` attack-skill shots fly; the log of those steps. */
function untilFlying(match: MatchSimulation, count: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  const flying = (): number =>
    match.projectiles.filter((shot) => shot.skillHit?.kind === "attack").length;
  for (let i = 0; i < 10 * RULES.tickRateHz && flying() < count; i += 1) {
    log.push(...match.step(DT).log);
  }
  expect(flying()).toBe(count);
  return log;
}

describe("Anthem of Flame in the match (#758)", () => {
  it("a 1 s chant reaches every ally in earshot, the paragon too, and Leadership pays for 3", () => {
    const match = new MatchSimulation({
      seed: "anthem",
      participants: [
        paragon(vec2(0, 0)),
        spec("near", 0, vec2(AREA_EARSHOT - 10, 0)),
        spec("close", 0, vec2(0, 100)),
        spec("far", 0, vec2(0, -(AREA_EARSHOT + 10))),
        spec("foe", 1, vec2(40, 0)),
      ],
    });
    const chanter = get(match, "p").combatant;
    chanter.energy = 10;
    expect(match.requestSkill("p", 0)?.check).toEqual({ ok: true });
    const entry = stepFor(match, 1.05).find((row) => row.skillId === ANTHEM);
    for (const id of ["p", "near", "close"]) {
      expect(
        get(match, id).combatant.statuses.get("anthem-of-flame")?.remainingSeconds,
      ).toBeCloseTo(10, 0);
    }
    expect(get(match, "far").combatant.statuses.has("anthem-of-flame")).toBe(false);
    expect(get(match, "foe").combatant.statuses.has("anthem-of-flame")).toBe(false);
    // The same as "Watch Yourself!" reaching three (#625).
    expect(entry?.events.filter((event) => event.kind === "energy-gain")).toEqual([
      { kind: "energy-gain", targetId: "p", amount: 3 },
    ]);
  });

  it("an attack skill cancelled before its blow leaves the chant; the next one uses it", () => {
    const match = new MatchSimulation({
      seed: "anthem",
      participants: [warrior("w", vec2(0, 0)), spec("foe", 1, vec2(30, 0))],
    });
    const chopper = get(match, "w").combatant;
    chopper.statuses.apply("anthem-of-flame", 10, "p", NO_RANKS);
    match.requestAttack("w", "foe");
    expect(match.requestSkill("w", 0)?.check).toEqual({ ok: true });
    match.step(DT);
    expect(chopper.cast.isCasting).toBe(true);
    match.cancelAction("w");
    stepFor(match, 1);
    expect(chopper.statuses.has("anthem-of-flame")).toBe(true);
    expect(get(match, "foe").combatant.statuses.has("burning")).toBe(false);
  });

  it("a ranged attack skill ends it at release and carries its burn in flight (#782)", () => {
    const match = new MatchSimulation({
      seed: "anthem",
      participants: [archer("r", vec2(0, 0)), spec("foe", 1, vec2(600, 0))],
    });
    const ranger = get(match, "r").combatant;
    ranger.statuses.apply("anthem-of-flame", 10, "p", NO_RANKS);
    match.requestAttack("r", "foe");
    expect(match.requestSkill("r", 0)?.check).toEqual({ ok: true });
    const released = untilFlying(match, 1);
    expect(released.flatMap((row) => row.events)).toContainEqual({
      kind: "status-expired",
      targetId: "r",
      statusId: "anthem-of-flame",
    });
    expect(ranger.statuses.has("anthem-of-flame")).toBe(false);
    expect(get(match, "foe").combatant.statuses.has("burning")).toBe(false);
    stepFor(match, 2);
    expect(get(match, "foe").combatant.statuses.has("burning")).toBe(true);
  });

  it("only the first of two attack skills loosed inside one flight carries it (#782)", () => {
    const match = new MatchSimulation({
      seed: "anthem",
      participants: [slowArcher("r", vec2(0, 0)), spec("foe", 1, vec2(600, 0))],
    });
    const ranger = get(match, "r").combatant;
    ranger.energy = 50;
    ranger.statuses.apply("anthem-of-flame", 10, "p", NO_RANKS);
    match.requestAttack("r", "foe");
    expect(match.requestSkill("r", 0)?.check).toEqual({ ok: true });
    untilFlying(match, 1);
    expect(match.requestSkill("r", 1)?.check).toEqual({ ok: true });
    untilFlying(match, 2);
    const [first, second] = match.projectiles.flatMap((shot) =>
      shot.skillHit?.kind === "attack" ? [shot.skillHit] : [],
    );
    expect(first?.skill.id).toBe("ranger.barrage");
    expect(first?.next.effects).toEqual([
      { kind: "apply-status", statusId: "burning", durationSeconds: { flat: 3 } },
    ]);
    expect(second?.skill.id).toBe("ranger.broad-head-arrow");
    expect(second?.next).toEqual({ statusIds: [], effects: [] });
  });

  it("an Anthem that runs out while the arrow flies still burns on the hit (#782)", () => {
    const match = new MatchSimulation({
      seed: "anthem",
      participants: [slowArcher("r", vec2(0, 0)), spec("foe", 1, vec2(600, 0))],
    });
    const ranger = get(match, "r").combatant;
    match.requestAttack("r", "foe");
    expect(match.requestSkill("r", 0)?.check).toEqual({ ok: true });
    // Up just long enough for the release, then gone with the arrow in the air.
    ranger.statuses.apply("anthem-of-flame", 3, "p", NO_RANKS);
    untilFlying(match, 1);
    stepFor(match, 3);
    expect(get(match, "foe").combatant.statuses.has("burning")).toBe(false);
    let ticks = 0;
    while (match.projectiles.some((shot) => shot.skillHit?.kind === "attack")) {
      match.step(DT);
      ticks += 1;
      expect(ticks).toBeLessThan(SLOW_FLIGHT_SECONDS * RULES.tickRateHz);
    }
    expect(get(match, "foe").combatant.statuses.get("burning")?.remainingSeconds).toBeCloseTo(3, 0);
  });

  it("a paragon with Anthem of Flame is a legal build", () => {
    const build: PlayerBuild = {
      name: "Anthem",
      primaryProfession: "paragon",
      secondaryProfession: undefined,
      attributes: [],
      skillBar: [ANTHEM, null, null, null, null, null, null, null],
      equipment: defaultBuildEquipment("paragon"),
    };
    expect(validatePlayerBuild(build, RULES.attributes)).toEqual([]);
  });
});

describe("Weapon of Warding in the match (#758)", () => {
  it("is cast on an ally for 7 s and ends on the ally's first swing", () => {
    const match = new MatchSimulation({
      seed: "warding",
      participants: [
        spec("r", 0, vec2(0, 0), {
          skillBar: [WARDING],
          attributeRanks: new Map([["ritualist.restoration-magic", 12]]),
        }),
        warrior("w", vec2(200, 0)),
        spec("foe", 1, vec2(800, 0)),
      ],
    });
    match.setTarget("r", "w");
    expect(match.requestSkill("r", 0)?.check).toEqual({ ok: true });
    stepFor(match, 1.05);
    const ward = get(match, "w").combatant;
    expect(ward.statuses.get("weapon-of-warding")?.remainingSeconds).toBeCloseTo(7, 0);
    match.requestAttack("w", "foe");
    let ended = false;
    let damaged = false;
    for (let i = 0; i < 200 && !ended; i += 1) {
      const { log } = match.step(DT);
      damaged ||= log.some((row) =>
        row.events.some((event) => event.kind === "damage" && event.targetId === "foe"),
      );
      ended = !ward.statuses.has("weapon-of-warding");
    }
    expect(ended).toBe(true);
    // It ended with the first blow, not before it reached the foe.
    expect(damaged).toBe(true);
  });

  it("a ritualist with Weapon of Warding is a legal build", () => {
    const build: PlayerBuild = {
      name: "Warder",
      primaryProfession: "ritualist",
      secondaryProfession: undefined,
      attributes: [],
      skillBar: [WARDING, null, null, null, null, null, null, null],
      equipment: defaultBuildEquipment("ritualist"),
    };
    expect(validatePlayerBuild(build, RULES.attributes)).toEqual([]);
  });
});
