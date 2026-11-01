import { describe, expect, it } from "vitest";

import { defaultBuildEquipment, validatePlayerBuild, type PlayerBuild } from "../build.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, EXCLUSIVE_CATEGORIES, getStatusDefinition } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import type { FiredTrigger } from "../skills/triggers.js";
import type { Combatant } from "../skills/types.js";
import { resolveAttackSkill, resolveSwing } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const APPLY_POISON = "ranger.apply-poison";

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

function prepared(weapon: Weapon, attributeId: string): Combatant {
  const attacker = makeCombatant({
    id: "a",
    team: 0,
    equipment: wielding(weapon, attributeId),
    attributeRanks: new Map([[attributeId, 12]]),
  });
  attacker.statuses.apply("apply-poison", 24, "a", NO_RANKS);
  return attacker;
}

const victim = (id = "t"): Combatant => makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 });

/** Whom Apply Poison poisoned, in a group of its own or a log entry: under its own name, not the blow's (#939). */
const poisoned = (
  fired: readonly {
    readonly skillId: string | undefined;
    readonly events: readonly CombatEvent[];
  }[],
): string[] =>
  fired
    .filter(({ skillId }) => skillId === APPLY_POISON)
    .flatMap(({ events }) => events)
    .flatMap((event) =>
      event.kind === "status-applied" && event.statusId === "poison" ? [event.targetId] : [],
    );

const NOWHERE = (): boolean => false;

function swing(attacker: Combatant, target: Combatant, seed = 1): ReturnType<typeof resolveSwing> {
  return resolveSwing({
    attacker,
    target: { combatant: target, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng: createRng(seed),
    rules: RULES.combat,
    exposed: NOWHERE,
  });
}

describe("Apply Poison on a blow (#525)", () => {
  it("a sword swing that hits poisons its target for 13 s", () => {
    const target = victim();
    expect(poisoned(swing(prepared(WEAPONS.sword, "warrior.swordsmanship"), target).fired)).toEqual(
      ["t"],
    );
    expect(target.statuses.get("poison")?.remainingSeconds).toBe(13);
  });

  it("a miss poisons nobody", () => {
    const attacker = prepared(WEAPONS.sword, "warrior.swordsmanship");
    attacker.statuses.apply("blind", 10, "foe", NO_RANKS);
    for (let seed = 0; seed < 50; seed += 1) {
      const target = victim();
      const { events } = swing(attacker, target, seed);
      const missed = events.some((event) => event.kind === "attack-missed");
      expect(target.statuses.has("poison")).toBe(!missed);
    }
  });

  it("a blocked blow poisons nobody", () => {
    const attacker = prepared(WEAPONS.sword, "warrior.swordsmanship");
    for (let seed = 0; seed < 50; seed += 1) {
      const target = victim();
      target.statuses.apply("guardian", 10, "ally", NO_RANKS);
      const { events } = swing(attacker, target, seed);
      const blocked = events.some((event) => event.kind === "attack-blocked");
      expect(target.statuses.has("poison")).toBe(!blocked);
    }
  });

  it("without the preparation, or once it ran out, a hit poisons nobody", () => {
    const attacker = prepared(WEAPONS.sword, "warrior.swordsmanship");
    attacker.statuses.remove("apply-poison");
    const target = victim();
    expect(poisoned(swing(attacker, target).fired)).toEqual([]);
  });

  it("a wand's bolt is no physical attack: no poison", () => {
    const target = victim();
    expect(
      poisoned(swing(prepared(WEAPONS.wand, "elementalist.fire-magic"), target).fired),
    ).toEqual([]);
    expect(target.health).toBeLessThan(target.maxHealth);
  });

  it("an attack skill poisons each victim of its area", () => {
    const barrage = getSkill("ranger.barrage");
    if (barrage?.attack === undefined) {
      throw new Error("missing barrage");
    }
    // Barrage without its "all your preparations are removed" (#1629).
    const { removesPreparations: _removes, ...keeps } = barrage.attack;
    const fired: FiredTrigger[] = [];
    resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: { ...barrage, attack: keeps },
        caster: prepared(WEAPONS.longbow, "ranger.marksmanship"),
        targets: [victim("x"), victim("y"), victim("z")],
        rng: createRng(1),
        rules: RULES.combat,
      },
      NOWHERE,
      fired,
    );
    expect(poisoned(fired)).toEqual(["x", "y", "z"]);
  });

  it("Barrage removes the preparation before its arrows: nobody is poisoned (#1629)", () => {
    const barrage = getSkill("ranger.barrage");
    if (barrage === undefined) {
      throw new Error("missing barrage");
    }
    const caster = prepared(WEAPONS.longbow, "ranger.marksmanship");
    const fired: FiredTrigger[] = [];
    const events = resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: barrage,
        caster,
        targets: [victim("x"), victim("y")],
        rng: createRng(1),
        rules: RULES.combat,
      },
      NOWHERE,
      fired,
    );
    expect(poisoned(fired)).toEqual([]);
    expect(caster.statuses.has("apply-poison")).toBe(false);
    expect(events).toContainEqual({
      kind: "status-removed",
      targetId: caster.id,
      statusId: "apply-poison",
    });
  });
});

/** A rank-12 ranger with a longbow and Apply Poison. */
function archer(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [APPLY_POISON],
    attributeRanks: new Map([
      ["ranger.marksmanship", 12],
      ["ranger.wilderness-survival", 12],
    ]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
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

describe("Apply Poison in the match (#525)", () => {
  it("is a 2 s cast that prepares the ranger for 24 s, and a landed arrow poisons", () => {
    const match = new MatchSimulation({
      seed: "prep",
      participants: [archer("a", vec2(0, 0)), dummy("d", vec2(600, 0))],
    });
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    stepFor(match, 2);
    expect(get(match, "a").combatant.statuses.get("apply-poison")?.remainingSeconds).toBeCloseTo(
      24,
      6,
    );
    match.requestAttack("a", "d");
    const log = stepFor(match, 5);
    expect(get(match, "d").combatant.statuses.has("poison")).toBe(true);
    // Logged as Apply Poison's, not the bow's (#939).
    expect(poisoned(log)).toEqual(["d"]);
    expect(
      log.filter(({ cause }) => cause === "weapon").flatMap(({ events }) => events),
    ).not.toContainEqual(expect.objectContaining({ kind: "status-applied", statusId: "poison" }));
  });

  it("an arrow that lands after the preparation ran out poisons nobody", () => {
    const match = new MatchSimulation({
      seed: "prep",
      participants: [archer("a", vec2(0, 0)), dummy("d", vec2(1000, 0))],
    });
    const ranger = get(match, "a").combatant;
    ranger.statuses.apply("apply-poison", 24, "a", NO_RANKS);
    match.requestAttack("a", "d");
    // Released, then the preparation ends while the arrow is in the air.
    let released = false;
    for (let i = 0; i < 200 && !released; i += 1) {
      match.step(DT);
      released = match.projectiles.length > 0;
    }
    expect(released).toBe(true);
    ranger.statuses.remove("apply-poison");
    match.cancelAction("a");
    const landed = stepFor(match, 3).flatMap((entry) => entry.events);
    expect(landed.some((event) => event.kind === "damage" && event.targetId === "d")).toBe(true);
    expect(get(match, "d").combatant.statuses.has("poison")).toBe(false);
  });

  it("ends with its ranger's death: the first arrow after the respawn poisons nobody", () => {
    const match = new MatchSimulation({
      seed: "prep",
      participants: [archer("a", vec2(0, 0)), dummy("d", vec2(600, 0))],
      matchRules: {
        victory: "kill-count",
        scoreToWin: 10,
        timeLimitSeconds: 600,
        deathRule: "respawn",
        respawnSeconds: 1,
        deathPenalty: false,
      },
    });
    const ranger = get(match, "a").combatant;
    ranger.statuses.apply("apply-poison", 24, "a", NO_RANKS);
    ranger.statuses.apply("burning", 10, "d", NO_RANKS);
    ranger.health = 0.2;
    stepFor(match, DT);
    expect(ranger.dead).toBe(true);
    stepFor(match, 1.5);
    expect(ranger.dead).toBe(false);
    expect(ranger.statuses.active).toEqual([]);
    match.requestAttack("a", "d");
    const landed = stepFor(match, 5).flatMap((entry) => entry.events);
    expect(landed.some((event) => event.kind === "damage" && event.targetId === "d")).toBe(true);
    expect(get(match, "d").combatant.statuses.has("poison")).toBe(false);
  });

  it("is a preparation: one at a time, and its tooltip says what it does", () => {
    expect(EXCLUSIVE_CATEGORIES.has(getStatusDefinition("apply-poison").category)).toBe(true);
    expect(getStatusDefinition("apply-poison").category).toBe("preparation");
    const skill = getSkill(APPLY_POISON);
    expect(skill?.type).toBe("preparation");
    expect(skill && describeSkill(skill).typeText).toBe("Preparation.");
    expect(skill && describeSkill(skill).effects.map((effect) => effect.text)).toEqual([
      "For 24s, foes your physical attacks hit get Poison for 13s",
    ]);
  });

  it("a second preparation ends the first, restarting it at its full duration", () => {
    const ranger = makeCombatant({ id: "a" });
    ranger.statuses.apply("apply-poison", 24, "a", NO_RANKS);
    ranger.statuses.apply("sprint", 13, "a", NO_RANKS);
    ranger.statuses.apply("apply-poison", 5, "a", NO_RANKS);
    expect(ranger.statuses.active.map((status) => [status.id, status.remainingSeconds])).toEqual([
      ["sprint", 13],
      ["apply-poison", 5],
    ]);
  });

  it("a ranger with Apply Poison is a legal build", () => {
    const build: PlayerBuild = {
      name: "Poisoner",
      primaryProfession: "ranger",
      secondaryProfession: undefined,
      attributes: [],
      skillBar: [APPLY_POISON, null, null, null, null, null, null, null],
      equipment: defaultBuildEquipment("ranger"),
    };
    expect(validatePlayerBuild(build, RULES.attributes)).toEqual([]);
  });
});
