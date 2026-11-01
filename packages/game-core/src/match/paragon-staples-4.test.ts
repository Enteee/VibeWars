import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { fillPools } from "../skills/adrenaline.js";
import { getSkill } from "../skills/catalog.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "../skills/status.js";
import { makeCombatant, strikesOf } from "../skills/testing.js";
import type { Combatant, Skill } from "../skills/types.js";
import { resolveSwing } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Paragon staples 4 (#1677): "Go for the Eyes!", "Never Give Up!", "The
 * Power Is Yours!", "It's Just a Flesh Wound.", Focused Anger, Awe,
 * Glowing Signet, Signet of Aggression and Remedy Signet, at rank 12; the
 * PvP ones where GW1 splits them.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/**
 * A blow with no mastery crits 34% of the time: exactly always under "Go
 * for the Eyes!"'s 66%.
 */
const CRIT_34: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: 0.34 } };

const GO_FOR_THE_EYES = "paragon.go-for-the-eyes";
const NEVER_GIVE_UP = "paragon.never-give-up";
const THE_POWER = "paragon.the-power-is-yours";
const FLESH_WOUND = "paragon.its-just-a-flesh-wound";
const FOCUSED_ANGER = "paragon.focused-anger";
const AWE = "paragon.awe";
const GLOWING_SIGNET = "paragon.glowing-signet";
const SIGNET_OF_AGGRESSION = "paragon.signet-of-aggression";
const REMEDY_SIGNET = "paragon.remedy-signet";

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
    maxHealth: 1000,
    maxEnergy: 1000,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** `c`, a rank-12 Paragon with `skillBar`, at the origin, beside `more`. */
function match(skillBar: readonly string[], more: readonly ParticipantSpec[], ruleset = RULES) {
  const caster = spec("c", 0, vec2(0, 0), {
    skillBar: [...skillBar],
    attributeRanks: new Map([
      ["paragon.command", 12],
      ["paragon.motivation", 12],
      ["paragon.leadership", 12],
    ]),
  });
  return new MatchSimulation({ seed: skillBar.join(), ruleset, participants: [caster, ...more] });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `c` uses the skill in `slot` on `targetId`: what it logged as it landed. */
function used(sim: MatchSimulation, slot: number, targetId = "c"): CombatEvent[] {
  const skillId = get(sim, "c").combatant.skillBar[slot];
  sim.setTarget("c", targetId);
  expect(sim.requestSkill("c", slot)?.check).toEqual({ ok: true });
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "c" && entry.skillId === skillId);
    if (logged.length > 0) {
      return logged.flatMap((entry) => entry.events);
    }
  }
  throw new Error(`${String(skillId)} never landed`);
}

function gained(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "energy-gain" && event.targetId === targetId ? [event.amount] : [],
  );
}

function applied(events: readonly CombatEvent[]): [string, StatusId, number][] {
  return events.flatMap((event) =>
    event.kind === "status-applied"
      ? [[event.targetId, event.statusId, event.durationSeconds] as [string, StatusId, number]]
      : [],
  );
}

describe("the nine are GW1's (#1677)", () => {
  it.each([
    [GO_FOR_THE_EYES, 1558, "shout", false, "paragon.command", "adrenaline", 4, 0, 4],
    [NEVER_GIVE_UP, 1593, "shout", false, "paragon.command", "energy", 5, 0, 20],
    [THE_POWER, 1782, "shout", true, "paragon.motivation", "adrenaline", 4, 0, 0],
    [FLESH_WOUND, 1599, "shout", true, "paragon.motivation", "energy", 5, 0, 2],
    [FOCUSED_ANGER, 1769, "skill", true, "paragon.leadership", "energy", 10, 0, 45],
    [AWE, 1573, "skill", false, "paragon.leadership", "energy", 10, 0.75, 10],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %s %i, %d s, %i s recharge",
    (id, gwId, type, elite, attributeId, cost, amount, activation, recharge) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: { kind: cost, amount },
        activationSeconds: activation,
        rechargeSeconds: recharge,
      });
    },
  );

  it.each([
    [GLOWING_SIGNET, 1581, "paragon.leadership", 0.25, 15, "single-enemy"],
    [SIGNET_OF_AGGRESSION, 1776, undefined, 1, 5, "self"],
    [REMEDY_SIGNET, 1777, undefined, 1, 4, "self"],
  ] as const)(
    "%s: gwId %i, a free signet of %s, %d s, %i s recharge",
    (id, gwId, attributeId, activation, recharge, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type: "signet",
        attributeId,
        cost: undefined,
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );
});

describe('"Go for the Eyes!" (#1677)', () => {
  it("gives the shouter and allies in earshot 10 s, not a far ally or a foe", () => {
    const sim = match(
      [GO_FOR_THE_EYES],
      [
        spec("near", 0, vec2(100, 0)),
        spec("far", 0, vec2(0, AREA_EARSHOT + 10)),
        spec("foe", 1, vec2(-100, 0)),
      ],
    );
    get(sim, "c").combatant.adrenaline.set(GO_FOR_THE_EYES, 4 * ADRENALINE_PER_STRIKE);
    expect(applied(used(sim, 0)).sort()).toEqual([
      ["c", "go-for-the-eyes", 10],
      ["near", "go-for-the-eyes", 10],
    ]);
  });

  it("+66% critical chance", () => {
    expect(
      aggregateModifiers([{ id: "go-for-the-eyes", ranks: NO_RANKS }]).criticalChanceBonus,
    ).toBe(0.66);
  });

  /** An unskilled swordsman under it swings at a dummy: whether the blow crits. */
  function swingUnder(status: boolean, seed: number) {
    const attacker = makeCombatant({
      id: "a",
      equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
    });
    if (status) {
      attacker.statuses.apply("go-for-the-eyes", 10, "c", NO_RANKS);
    }
    const events = resolveSwing({
      attacker,
      target: {
        combatant: makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 }),
        position: vec2(40, 0),
        creature: undefined,
      },
      surroundings: new Map(),
      rng: createRng(seed),
      rules: CRIT_34.combat,
      exposed: () => false,
    }).events;
    return {
      critical: events.some((event) => event.kind === "damage" && event.critical),
      still: attacker.statuses.has("go-for-the-eyes"),
    };
  }

  it("the swing that ends it crits, every time, at 34% + 66%", () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      expect(swingUnder(true, seed), String(seed)).toEqual({ critical: true, still: false });
    }
  });

  it("without it, the same swings crit only sometimes", () => {
    const crits = Array.from({ length: 10 }, (_, i) => swingUnder(false, i + 1).critical);
    expect(crits).toContain(false);
  });

  it("an arrow released under it crits, and ends it", () => {
    for (let round = 0; round < 5; round += 1) {
      const sim = new MatchSimulation({
        seed: `eyes-${String(round)}`,
        ruleset: CRIT_34,
        participants: [
          spec("r", 0, vec2(0, 0), { equipment: wielding(WEAPONS.flatbow, "ranger.marksmanship") }),
          spec("t", 1, vec2(300, 0), { maxHealth: 1e6 }),
        ],
      });
      const ranger = get(sim, "r").combatant;
      ranger.statuses.apply("go-for-the-eyes", 10, "c", NO_RANKS);
      expect(sim.requestAttack("r", "t")?.ok).toBe(true);
      let hit: CombatEvent | undefined;
      for (let i = 0; i < 5 * RULES.tickRateHz && hit === undefined; i += 1) {
        hit = sim
          .step(DT)
          .log.flatMap((entry) => entry.events)
          .find((event) => event.kind === "damage" && event.targetId === "t");
      }
      expect(hit).toMatchObject({ kind: "damage", critical: true });
      expect(ranger.statuses.has("go-for-the-eyes")).toBe(false);
    }
  });

  it("with no attack, it runs out after 10 s", () => {
    const sim = match([GO_FOR_THE_EYES], []);
    const caster = get(sim, "c").combatant;
    caster.adrenaline.set(GO_FOR_THE_EYES, 4 * ADRENALINE_PER_STRIKE);
    used(sim, 0);
    for (let i = 0; i < 9.5 * RULES.tickRateHz; i += 1) {
      sim.step(DT);
    }
    expect(caster.statuses.has("go-for-the-eyes")).toBe(true);
    for (let i = 0; i < RULES.tickRateHz; i += 1) {
      sim.step(DT);
    }
    expect(caster.statuses.has("go-for-the-eyes")).toBe(false);
  });
});

describe('"Never Give Up!" (#1677)', () => {
  it("8 Energy to each ally in earshot below 75% Health, the shouter too", () => {
    const sim = match(
      [NEVER_GIVE_UP],
      [spec("hurt", 0, vec2(100, 0)), spec("fine", 0, vec2(-100, 0))],
    );
    get(sim, "c").combatant.health = 700;
    get(sim, "hurt").combatant.health = 700;
    get(sim, "fine").combatant.health = 800;
    for (const id of ["c", "hurt", "fine"]) {
      get(sim, id).combatant.energy = 100;
    }
    const events = used(sim, 0);
    // Then Leadership's 2, for the allies the shout reached.
    expect(gained(events, "c")).toEqual([8, 2]);
    expect(gained(events, "hurt")).toEqual([8]);
    expect(gained(events, "fine")).toEqual([]);
  });
});

describe('"The Power Is Yours!" (#1677)', () => {
  it("+2 Energy regeneration for 4 s to all in earshot", () => {
    const sim = match([THE_POWER], [spec("near", 0, vec2(100, 0))]);
    get(sim, "c").combatant.adrenaline.set(THE_POWER, 4 * ADRENALINE_PER_STRIKE);
    expect(applied(used(sim, 0)).sort()).toEqual([
      ["c", "the-power-is-yours", 4],
      ["near", "the-power-is-yours", 4],
    ]);
    expect(get(sim, "near").combatant.statuses.active.length).toBe(1);
    expect(aggregateModifiers(get(sim, "near").combatant.statuses.active).energyPips).toBe(2);
  });
});

describe('"It\'s Just a Flesh Wound." (#1677)', () => {
  function shout(conditions: readonly StatusId[]) {
    const sim = match([FLESH_WOUND], [spec("a", 0, vec2(100, 0))]);
    const ally = get(sim, "a").combatant;
    for (const id of conditions) {
      ally.statuses.apply(id, 20, "x", NO_RANKS);
    }
    const events = used(sim, 0, "a");
    return { applied: applied(events), left: ally.statuses.active.map(({ id }) => id) };
  }

  it("with two conditions: both gone, and 8 s of 25% faster", () => {
    expect(shout(["crippled", "bleeding"])).toEqual({
      applied: [["a", "its-just-a-flesh-wound", 8]],
      left: ["its-just-a-flesh-wound"],
    });
    expect(
      aggregateModifiers([{ id: "its-just-a-flesh-wound", ranks: NO_RANKS }]).moveSpeedMultiplier,
    ).toBe(1.25);
  });

  it("with none: nothing", () => {
    expect(shout([])).toEqual({ applied: [], left: [] });
  });

  it("cannot target the shouter", () => {
    expect(skill(FLESH_WOUND).target).toBe("single-other-ally");
  });
});

describe("Focused Anger (#1677)", () => {
  it("45 s of 120% more adrenaline: a strike gives 2.2, floored", () => {
    const sim = match([FOCUSED_ANGER], []);
    expect(applied(used(sim, 0))).toEqual([["c", "focused-anger", 45]]);

    const warrior = makeCombatant({ id: "w", skillBar: [GO_FOR_THE_EYES] });
    warrior.adrenaline.set(GO_FOR_THE_EYES, 0);
    warrior.statuses.apply("focused-anger", 45, "w", NO_RANKS);
    fillPools(warrior, ADRENALINE_PER_STRIKE);
    expect(warrior.adrenaline.get(GO_FOR_THE_EYES)).toBe(Math.floor(ADRENALINE_PER_STRIKE * 2.2));
  });
});

describe("Awe (#1677)", () => {
  function awe(knockedDown: boolean) {
    const sim = match([AWE], [spec("f", 1, vec2(100, 0))]);
    const foe = get(sim, "f").combatant;
    foe.knockdownRemaining = knockedDown ? 3 : 0;
    const energy = get(sim, "c").combatant.energy;
    used(sim, 0, "f");
    return {
      dazed: foe.statuses.get("dazed")?.durationSeconds,
      spent: energy - get(sim, "c").combatant.energy >= 9,
    };
  }

  it("on a knocked-down foe: Dazed for 13 s", () => {
    expect(awe(true)).toEqual({ dazed: 13, spent: true });
  });

  it("on a standing foe: energy spent, nothing else", () => {
    expect(awe(false)).toEqual({ dazed: undefined, spent: true });
  });
});

describe("Glowing Signet (#1677)", () => {
  function signet(burning: boolean) {
    const sim = match([GLOWING_SIGNET], [spec("f", 1, vec2(100, 0))]);
    get(sim, "c").combatant.energy = 100;
    if (burning) {
      get(sim, "f").combatant.statuses.apply("burning", 10, "x", NO_RANKS);
    }
    return gained(used(sim, 0, "f"), "c");
  }

  it("13 Energy off a Burning foe", () => {
    expect(signet(true)).toEqual([13]);
  });

  it("none off a foe not Burning", () => {
    expect(signet(false)).toEqual([]);
  });
});

describe("Signet of Aggression (#1677)", () => {
  /** `c` holds an adrenaline skill and is under `statusId`: its strikes after the signet. */
  function signet(statusId: StatusId | undefined): number {
    const sim = match([SIGNET_OF_AGGRESSION, GO_FOR_THE_EYES], []);
    const caster: Combatant = get(sim, "c").combatant;
    if (statusId !== undefined) {
      caster.statuses.apply(statusId, 30, "c", NO_RANKS);
    }
    used(sim, 0);
    return strikesOf(caster, GO_FOR_THE_EYES);
  }

  it("under a shout: 2 strikes", () => {
    expect(signet("fall-back")).toBe(2);
  });

  it("under a chant: 2 strikes", () => {
    expect(signet("anthem-of-flame")).toBe(2);
  });

  it("under neither, or only an echo: nothing", () => {
    expect(signet(undefined)).toBe(0);
    expect(signet("aggressive-refrain")).toBe(0);
  });
});

describe("Remedy Signet (#1677)", () => {
  it("loses one condition of two", () => {
    const sim = match([REMEDY_SIGNET], []);
    const caster = get(sim, "c").combatant;
    caster.statuses.apply("crippled", 20, "x", NO_RANKS);
    caster.statuses.apply("bleeding", 20, "x", NO_RANKS);
    used(sim, 0);
    expect(
      caster.statuses.active.filter(({ id }) => id === "crippled" || id === "bleeding"),
    ).toHaveLength(1);
  });
});
