import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { isAttacking } from "../skills/attacking.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { stateHolds, type CombatEvent } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import type { Skill, StateCondition } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The `not` condition (#1670) and the four skills it, or an existing
 * condition, unlocks: Test of Faith, Waste Not Want Not, Sloth Hunter's
 * Shot and Signet of Synergy, at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const TEST_OF_FAITH = "dervish.test-of-faith";
const WASTE_NOT = "mesmer.waste-not-want-not";
const SLOTH_HUNTERS_SHOT = "ranger.sloth-hunters-shot";
const SIGNET_OF_SYNERGY = "paragon.signet-of-synergy";
/** The foe's long spell, so it is mid-cast when a skill lands. */
const METEOR_SHOWER = "elementalist.meteor-shower";
/** A monk enchantment to stand on whoever needs one. */
const ENCHANTMENT = "guardian";

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

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** `c`, the caster with `skillId` alone and `attributeId` at 12, at the origin, beside `more`. */
function match(
  skillId: string,
  attributeId: string,
  more: readonly ParticipantSpec[],
  extra: Partial<ParticipantSpec> = {},
) {
  const caster = spec("c", 0, vec2(0, 0), {
    skillBar: [skillId],
    attributeRanks: new Map([[attributeId, 12]]),
    ...extra,
  });
  return new MatchSimulation({ seed: skillId, ruleset: NO_CRIT, participants: [caster, ...more] });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `c` uses its one skill on `targetId`: what it logged until it landed. */
function used(sim: MatchSimulation, skillId: string, targetId: string): CombatEvent[] {
  sim.setTarget("c", targetId);
  expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
  const events: CombatEvent[] = [];
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    // An entry, even an empty one: Waste Not, Want Not on a busy foe does nothing.
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "c" && entry.skillId === skillId);
    events.push(...logged.flatMap((entry) => entry.events));
    if (logged.length > 0 && sim.projectiles.length === 0) {
      return events;
    }
  }
  throw new Error(`${skillId} never landed`);
}

function amounts(events: readonly CombatEvent[], kind: CombatEvent["kind"], targetId: string) {
  return events.flatMap((event) =>
    event.kind === kind && "targetId" in event && event.targetId === targetId && "amount" in event
      ? [event.amount]
      : [],
  );
}

/** Each line of `id`'s tooltip at rank 12 of `attributeId`. */
function lines(id: string, attributeId: string): string[] {
  return describeSkill(skill(id), new Map([[attributeId, 12]])).effects.map(({ text }) => text);
}

/** `f` starts Meteor Shower on `c`: 5 s of casting. */
function startCasting(sim: MatchSimulation): void {
  sim.setTarget("f", "c");
  expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
  sim.step(DT);
  expect(get(sim, "f").combatant.cast.activeCast?.skillId).toBe(METEOR_SHOWER);
}

describe("the not condition (#1670)", () => {
  const holds = (condition: StateCondition, moving: boolean, knockedDown: boolean) => {
    const target = makeCombatant({ id: "t", team: 1 });
    target.moving = moving;
    target.knockdownRemaining = knockedDown ? 2 : 0;
    return stateHolds(condition, makeCombatant({ id: "c" }), target, new Map());
  };
  const MOVING: StateCondition = { kind: "target-moving" };
  const DOWN: StateCondition = { kind: "target-knocked-down" };

  it("holds when its condition does not", () => {
    expect(holds({ kind: "not", condition: MOVING }, false, false)).toBe(true);
    expect(holds({ kind: "not", condition: MOVING }, true, false)).toBe(false);
  });

  it("of any-of, holds only when none of them does", () => {
    const neither: StateCondition = {
      kind: "not",
      condition: { kind: "any-of", conditions: [MOVING, DOWN] },
    };
    expect(holds(neither, false, false)).toBe(true);
    expect(holds(neither, true, false)).toBe(false);
    expect(holds(neither, false, true)).toBe(false);
  });

  it("inside any-of, holds when it, or another, does", () => {
    const stillOrDown: StateCondition = {
      kind: "any-of",
      conditions: [{ kind: "not", condition: MOVING }, DOWN],
    };
    expect(holds(stillOrDown, false, false)).toBe(true);
    expect(holds(stillOrDown, true, true)).toBe(true);
    expect(holds(stillOrDown, true, false)).toBe(false);
  });
});

describe("Test of Faith (#1670)", () => {
  function touch(enchanted: boolean) {
    const sim = match(TEST_OF_FAITH, "dervish.wind-prayers", [spec("f", 1, vec2(30, 0))]);
    get(sim, "c").combatant.adrenaline.set(TEST_OF_FAITH, 5 * ADRENALINE_PER_STRIKE);
    const foe = get(sim, "f").combatant;
    if (enchanted) {
      foe.statuses.apply(ENCHANTMENT, 1000, "f", NO_RANKS);
    }
    const events = used(sim, TEST_OF_FAITH, "f");
    return {
      damage: amounts(events, "damage", "f"),
      enchanted: foe.statuses.has(ENCHANTMENT),
      dazed: foe.statuses.get("dazed")?.durationSeconds,
    };
  }

  it("on an enchanted foe: 63 cold, takes the enchantment, no Daze", () => {
    expect(touch(true)).toEqual({ damage: [63], enchanted: false, dazed: undefined });
  });

  it("on an unenchanted foe: 63 cold and Dazed for 5 s", () => {
    expect(touch(false)).toEqual({ damage: [63], enchanted: false, dazed: 5 });
  });

  it("says the Daze is for a foe that is not enchanted", () => {
    expect(lines(TEST_OF_FAITH, "dervish.wind-prayers")[1]).toMatch(
      /^If target has no enchantment: applies Dazed for 5s/,
    );
  });
});

describe("Waste Not, Want Not (#1670)", () => {
  function cast(foe: "walking" | "swinging" | "casting") {
    const sim = match(WASTE_NOT, "mesmer.inspiration-magic", [
      spec("f", 1, vec2(30, 0), {
        skillBar: [METEOR_SHOWER],
        equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
      }),
    ]);
    get(sim, "c").combatant.energy = 10;
    if (foe === "walking") {
      sim.setInputDirection("f", vec2(0, 1));
      sim.step(DT);
      expect(get(sim, "f").combatant.moving).toBe(true);
    }
    if (foe === "swinging") {
      sim.requestAttack("f", "c");
      sim.step(DT);
      expect(isAttacking(get(sim, "f").combatant)).toBe(true);
    }
    if (foe === "casting") {
      startCasting(sim);
    }
    return amounts(used(sim, WASTE_NOT, "f"), "energy-gain", "c");
  }

  it("on a walking foe: 12 energy", () => {
    expect(cast("walking")).toEqual([12]);
  });

  it("on a foe swinging a sword: none", () => {
    expect(cast("swinging")).toEqual([]);
  });

  it("on a foe casting a spell: none", () => {
    expect(cast("casting")).toEqual([]);
  });
});

describe("Sloth Hunter's Shot (#1670)", () => {
  function shot(casting: boolean) {
    const sim = match(
      SLOTH_HUNTERS_SHOT,
      "ranger.marksmanship",
      [spec("f", 1, vec2(200, 0), { skillBar: [METEOR_SHOWER] })],
      { equipment: wielding(WEAPONS.longbow, "ranger.marksmanship") },
    );
    if (casting) {
      startCasting(sim);
    }
    return amounts(used(sim, SLOTH_HUNTERS_SHOT, "f"), "damage", "f");
  }

  it("strikes a foe mid-cast for +17, an idle one for +13 more", () => {
    const [busy = 0] = shot(true);
    const [idle = 0] = shot(false);
    expect(idle - busy).toBe(13);
  });

  it("says the bonus is for a foe not using a skill", () => {
    expect(lines(SLOTH_HUNTERS_SHOT, "ranger.marksmanship")).toEqual([
      "+17 damage",
      "If target is not using a skill: +13 damage",
    ]);
  });
});

describe("Signet of Synergy (#1670)", () => {
  function signet(enchanted: boolean) {
    const sim = match(SIGNET_OF_SYNERGY, "paragon.motivation", [
      spec("a", 0, vec2(50, 0)),
      spec("f", 1, vec2(500, 0)),
    ]);
    for (const id of ["c", "a"]) {
      get(sim, id).combatant.health = 1000;
    }
    if (enchanted) {
      get(sim, "c").combatant.statuses.apply(ENCHANTMENT, 1000, "c", NO_RANKS);
    }
    const events = used(sim, SIGNET_OF_SYNERGY, "a");
    return { ally: amounts(events, "heal", "a"), caster: amounts(events, "heal", "c") };
  }

  it("heals the ally 88, and the Paragon 88 while it is not enchanted", () => {
    expect(signet(false)).toEqual({ ally: [88], caster: [88] });
  });

  it("while the Paragon is enchanted, heals only the ally", () => {
    expect(signet(true)).toEqual({ ally: [88], caster: [] });
  });
});
