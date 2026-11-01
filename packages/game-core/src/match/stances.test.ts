import { describe, expect, it } from "vitest";

import { defaultBuildEquipment, validatePlayerBuild, type PlayerBuild } from "../build.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describeSkill } from "../skills/describe.js";
import { getSkill } from "../skills/catalog.js";
import { chargeAdrenaline } from "../skills/testing.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SPRINT = "warrior.sprint";
const DASH = "assassin.dash";
const WILD_THROW = "paragon.wild-throw";

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

/** A warrior/assassin with Sprint in slot 0 and Dash in slot 1. */
function runner(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [SPRINT, DASH],
    attributeRanks: new Map([["warrior.strength", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** A rank-12 paragon with a spear and Wild Throw. */
function thrower(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [WILD_THROW],
    attributeRanks: new Map([["paragon.spear-mastery", 12]]),
    equipment: wielding(WEAPONS.spear, "paragon.spear-mastery"),
    spawn,
    facing: 0,
  };
}

/** A sturdy foe that does nothing. */
function dummy(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn,
    facing: Math.PI,
  };
}

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

const stances = (match: MatchSimulation, id: string) =>
  get(match, id).combatant.statuses.active.map((status) => status.id);

/** How far `id` walks east in one second from where it stands. */
function walkedInOneSecond(match: MatchSimulation, id: string): number {
  const from = get(match, id).position.x;
  match.setInputDirection(id, vec2(1, 0));
  stepFor(match, 1);
  match.setInputDirection(id, vec2(0, 0));
  return get(match, id).position.x - from;
}

describe("stances (#523)", () => {
  it("Sprint is a 13 s stance that moves you 25% faster", () => {
    const plain = new MatchSimulation({ seed: "stance", participants: [runner("a", vec2(0, 0))] });
    const sprinting = new MatchSimulation({
      seed: "stance",
      participants: [runner("a", vec2(0, 0))],
    });
    expect(sprinting.requestSkill("a", 0)?.check).toEqual({ ok: true });
    sprinting.step(DT);
    expect(get(sprinting, "a").combatant.statuses.get("sprint")?.remainingSeconds).toBe(13);
    plain.step(DT);
    expect(walkedInOneSecond(sprinting, "a")).toBeCloseTo(walkedInOneSecond(plain, "a") * 1.25);
  });

  it("Dash over Sprint ends Sprint: only the second is up", () => {
    const match = new MatchSimulation({ seed: "stance", participants: [runner("a", vec2(0, 0))] });
    match.requestSkill("a", 0);
    match.step(DT);
    match.requestSkill("a", 1);
    match.step(DT);
    expect(stances(match, "a")).toEqual(["dash"]);
    stepFor(match, 3 + DT);
    expect(stances(match, "a")).toEqual([]);
  });

  it("Wild Throw ends the target's stance and leaves its enchantments", () => {
    const match = new MatchSimulation({
      seed: "stance",
      participants: [thrower("a", vec2(0, 0)), dummy("d", vec2(300, 0))],
    });
    const foe = get(match, "d").combatant;
    foe.statuses.apply("sprint", 100, "d", NO_RANKS);
    foe.statuses.apply("regeneration", 100, "d", NO_RANKS);
    chargeAdrenaline(get(match, "a").combatant);
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    const thrown = stepFor(match, 2).filter((entry) => entry.skillId === WILD_THROW);
    expect(thrown.flatMap((entry) => entry.events.map((event) => event.kind))).toContain("damage");
    expect(stances(match, "d")).toEqual(["regeneration"]);
  });

  it("Wild Throw cannot be blocked: it lands through Guardian every time", () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const match = new MatchSimulation({
        seed: `wild-${String(seed)}`,
        participants: [thrower("a", vec2(0, 0)), dummy("d", vec2(300, 0))],
      });
      get(match, "d").combatant.statuses.apply("guardian", 100, "d", NO_RANKS);
      chargeAdrenaline(get(match, "a").combatant);
      match.setTarget("a", "d");
      match.requestSkill("a", 0);
      const kinds = stepFor(match, 2)
        .filter((entry) => entry.skillId === WILD_THROW)
        .flatMap((entry) => entry.events.map((event) => event.kind));
      expect(kinds).toContain("damage");
      expect(kinds).not.toContain("attack-blocked");
    }
  });

  it("Wild Throw on a foe with no stance removes nothing", () => {
    const match = new MatchSimulation({
      seed: "stance",
      participants: [thrower("a", vec2(0, 0)), dummy("d", vec2(300, 0))],
    });
    chargeAdrenaline(get(match, "a").combatant);
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    const thrown = stepFor(match, 2).filter((entry) => entry.skillId === WILD_THROW);
    expect(thrown.flatMap((entry) => entry.events.map((event) => event.kind))).toEqual([
      "skill-used",
      "damage",
      "adrenaline-gained",
    ]);
  });

  it("describes a stance as one, and Wild Throw's removal", () => {
    const text = (id: string) => {
      const skill = getSkill(id);
      return skill === undefined ? [] : describeSkill(skill).effects.map((effect) => effect.text);
    };
    const sprint = getSkill(SPRINT);
    expect(sprint === undefined ? undefined : describeSkill(sprint).typeText).toBe("Stance.");
    expect(text(SPRINT)).toEqual(["For 13s, moves at 125% speed"]);
    expect(text(DASH)).toEqual(["For 3s, moves at 150% speed"]);
    expect(text(WILD_THROW)).toEqual([
      "+5 damage",
      "Cannot be blocked",
      "Ends the target's stance",
    ]);
  });
});

describe("stance builds (#523)", () => {
  const build = (
    primaryProfession: PlayerBuild["primaryProfession"],
    skill: string,
  ): PlayerBuild => ({
    name: "Stancer",
    primaryProfession,
    secondaryProfession: undefined,
    attributes: [],
    skillBar: [skill, null, null, null, null, null, null, null],
    equipment: defaultBuildEquipment(primaryProfession),
  });

  it("a paragon with Wild Throw, an assassin with Dash and a warrior with Sprint are legal", () => {
    expect(validatePlayerBuild(build("paragon", WILD_THROW), RULES.attributes)).toEqual([]);
    expect(validatePlayerBuild(build("assassin", DASH), RULES.attributes)).toEqual([]);
    expect(validatePlayerBuild(build("warrior", SPRINT), RULES.attributes)).toEqual([]);
  });
});
