import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { mitigate, unmitigatedDamage } from "./damage.js";
import { applyDamage, applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import { fireChangeTriggers, type SpreadGainedCondition } from "./triggers.js";
import type { Combatant, Skill } from "./types.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Monk and Ranger staples (#2190): Shield of Absorption, Divine
 * Intervention, Healing Hands, Shield of Judgment, Disrupting Shot,
 * Incendiary Arrows, Marauder's Shot, Body Shot, Quick Shot and Tiger's
 * Fury, all on primitives that were already there. Numbers are the
 * corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const DISRUPTING = "ranger.disrupting-shot";
const INCENDIARY = "ranger.incendiary-arrows";
const MARAUDERS = "ranger.marauders-shot";
const BODY = "ranger.body-shot";
const QUICK = "ranger.quick-shot";
const TIGERS = "ranger.tigers-fury";
/** A non-attack skill on the Ranger's bar, for the disables to catch. */
const SIGNET = "warrior.healing-signet";
const BAR = [DISRUPTING, INCENDIARY, MARAUDERS, BODY, QUICK, TIGERS, SIGNET];
/** A spell, for a foe to be casting. */
const SPELL = "necromancer.rotting-flesh";

const MONK_RANKS = new Map([
  ["monk.healing-prayers", 12],
  ["monk.protection-prayers", 12],
  ["monk.smiting-prayers", 12],
]);
const noSpread: SpreadGainedCondition = () => [];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the ten are the corpus's (#2190)", () => {
  it.each([
    ["monk.shield-of-absorption", 1399, "monk.protection-prayers", 5, 1, 10, false],
    ["monk.divine-intervention", 246, "monk.divine-favor", 5, 0.25, 30, false],
    ["monk.healing-hands", 285, "monk.healing-prayers", 5, 0.25, 15, true],
    ["monk.shield-of-judgment", 262, "monk.smiting-prayers", 15, 1, 45, true],
    [DISRUPTING, 2143, "ranger.marksmanship", 10, 0.5, 15, false],
    [INCENDIARY, 428, "ranger.wilderness-survival", 5, 0, 5, true],
    [MARAUDERS, 908, "ranger.marksmanship", 5, 0, 6, false],
    [BODY, 2198, "ranger.marksmanship", 5, 0, 8, false],
    [QUICK, 397, undefined, 5, 0.5, 1, true],
    [TIGERS, 454, "ranger.beast-mastery", 10, 0, 10, false],
  ] as const)("%s", (id, gwId, attributeId, energy, activation, recharge, elite) => {
    const found = skill(id);
    expect([
      found.gwId,
      found.attributeId,
      found.cost?.amount,
      found.activationSeconds,
      found.rechargeSeconds,
      found.elite,
    ]).toEqual([gwId, attributeId, energy, activation, recharge, elite]);
  });
});

/* ------------------------------------------------------------------------ */
/* Monk                                                                     */
/* ------------------------------------------------------------------------ */

/** `m`, a team-0 Monk; `a`, its ally at 300 of 1000, no Divine Favor unless `ranks` say so; `w` and `v`, team-1 foes. */
function party(ranks = MONK_RANKS): Map<string, Combatant> {
  return new Map([
    ["m", makeCombatant({ id: "m", team: 0, attributeRanks: ranks })],
    ["a", makeCombatant({ id: "a", team: 0, health: 300, maxHealth: 1000 })],
    ["w", makeCombatant({ id: "w", team: 1, health: 400, maxHealth: 500 })],
    ["v", makeCombatant({ id: "v", team: 1, health: 400, maxHealth: 500 })],
  ]);
}

/** How long `bearer` still has `statusId`, 0 when it has none. */
function remaining(bearer: Combatant, statusId: string): number {
  return bearer.statuses.active.find(({ id }) => id === statusId)?.remainingSeconds ?? 0;
}

function member(combatants: Map<string, Combatant>, id: string): Combatant {
  const found = combatants.get(id);
  if (found === undefined) {
    throw new Error(`no combatant ${id}`);
  }
  return found;
}

/** `m` casts `skillId` on `a`. */
function cast(combatants: Map<string, Combatant>, skillId: string): CombatEvent[] {
  return applySkillEffects({
    surroundings: new Map(),
    skill: skill(skillId),
    caster: member(combatants, "m"),
    targets: [member(combatants, "a")],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

/** Whatever `bearer`'s statuses recorded, fired as the simulation's drain does. */
function drain(bearer: Combatant, combatants: Map<string, Combatant>): CombatEvent[] {
  return bearer.statuses.drainChanges().flatMap((change) =>
    fireChangeTriggers(bearer, change, noSpread, {
      sourceOf: (id) => combatants.get(id),
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
      usedSkill: undefined,
    }).flatMap(({ events }) => events),
  );
}

describe("Shield of Absorption (#2190)", () => {
  it("lasts 6 s and takes 5 more off each hit, 5, 10, 15; a recast starts again at 5", () => {
    const combatants = party();
    const a = member(combatants, "a");
    expect(cast(combatants, "monk.shield-of-absorption")).toContainEqual(
      expect.objectContaining({ kind: "status-applied", statusId: "shield-of-absorption" }),
    );
    expect(remaining(a, "shield-of-absorption")).toBe(6);
    const hit = () =>
      mitigate(unmitigatedDamage(50, "skill"), a, RULES.combat, null, createRng(1), new Map());
    expect([hit(), hit(), hit()]).toEqual([45, 40, 35]);
    cast(combatants, "monk.shield-of-absorption");
    expect([hit(), hit()]).toEqual([45, 40]);
  });
});

describe("Divine Intervention (#2190)", () => {
  it("negates a killing blow, ends, and heals 197 from the Monk's Divine Favor", () => {
    const combatants = party(new Map([...MONK_RANKS, ["monk.divine-favor", 12]]));
    const a = member(combatants, "a");
    cast(combatants, "monk.divine-intervention");
    // Divine Favor 12 heals the target 38 as the spell lands; start over.
    a.health = 300;
    const events: CombatEvent[] = [];
    applyDamage(a, 400, "slashing", false, events, member(combatants, "w"));
    expect(a.dead).toBe(false);
    expect(a.health).toBe(300);
    expect(a.statuses.has("divine-intervention")).toBe(false);
    drain(a, combatants);
    expect(a.health).toBe(300 + 197);
  });

  it("lets a blow that leaves the ally alive through, and stays", () => {
    const combatants = party();
    const a = member(combatants, "a");
    cast(combatants, "monk.divine-intervention");
    applyDamage(a, 299, "slashing", false, [], member(combatants, "w"));
    expect(a.health).toBe(1);
    expect(a.statuses.has("divine-intervention")).toBe(true);
    drain(a, combatants);
    expect(a.health).toBe(1);
  });
});

describe("Healing Hands (#2190)", () => {
  it("heals 29 when a foe damages the ally, every time", () => {
    const combatants = party();
    const a = member(combatants, "a");
    cast(combatants, "monk.healing-hands");
    for (const health of [279, 258]) {
      applyDamage(a, 50, "slashing", false, [], member(combatants, "w"));
      drain(a, combatants);
      expect(a.health).toBe(health);
    }
  });
});

describe("Shield of Judgment (#2190)", () => {
  it("lasts 18 s", () => {
    const combatants = party();
    cast(combatants, "monk.shield-of-judgment");
    expect(remaining(member(combatants, "a"), "shield-of-judgment")).toBe(18);
  });

  it("smites and knocks down each attacker that hits, from any number of them", () => {
    const combatants = party();
    const a = member(combatants, "a");
    cast(combatants, "monk.shield-of-judgment");
    a.statuses.recordHitByAttack("w", 20, undefined, WEAPONS.sword);
    a.statuses.recordHitByAttack("v", 20, undefined, WEAPONS.sword);
    const events = drain(a, combatants);
    for (const id of ["w", "v"]) {
      // Holy, from the Monk's Smiting Prayers 12: armor has no say.
      expect(member(combatants, id).health, id).toBe(400 - 41);
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "knocked-down", targetId: id }),
      );
    }
    expect(a.statuses.has("shield-of-judgment")).toBe(true);
  });
});

/* ------------------------------------------------------------------------ */
/* Ranger                                                                   */
/* ------------------------------------------------------------------------ */

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

/** `r`, a rank-12 Ranger with a longbow, at the origin; `f`, its foe, 200 east unless `more` places it. */
function match(more: readonly ParticipantSpec[] = [], seed = "monk-ranger-staples") {
  const participants: ParticipantSpec[] = [
    spec("r", 0, vec2(0, 0), {
      skillBar: BAR,
      attributeRanks: new Map([
        ["ranger.marksmanship", 12],
        ["ranger.beast-mastery", 12],
        ["ranger.wilderness-survival", 12],
      ]),
      equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    }),
    ...more,
  ];
  if (!more.some((participant) => participant.id === "f")) {
    participants.push(spec("f", 1, vec2(200, 0)));
  }
  return new MatchSimulation({ seed, ruleset: NO_CRIT, participants });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `r` uses `skillId` on `f`: its events until it landed, and how fast it flew. */
function shot(sim: MatchSimulation, skillId: string) {
  sim.setTarget("r", "f");
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  const events: CombatEvent[] = [];
  let speed: number | undefined;
  for (let tick = 1; tick <= 10 * RULES.tickRateHz; tick += 1) {
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "r" && entry.skillId === skillId)
      .flatMap((entry) => entry.events);
    events.push(...logged);
    speed ??= sim.projectiles[0]?.speed;
    if (logged.length > 0 && sim.projectiles.length === 0) {
      return { events, speed };
    }
  }
  throw new Error(`${skillId} never landed`);
}

function damageTo(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

function disabled(events: readonly CombatEvent[]): string[] {
  return events.flatMap((event) => (event.kind === "skill-disabled" ? [event.skillId] : []));
}

describe("Disrupting Shot (#2190)", () => {
  it("interrupts a skill and strikes again for the bonus", () => {
    const sim = match();
    const foe = get(sim, "f").combatant;
    foe.cast.beginCast(SPELL, "r", 60, undefined);
    const { events } = shot(sim, DISRUPTING);
    expect(foe.cast.isCasting).toBe(false);
    expect(events).toContainEqual({ kind: "interrupted", targetId: "f", skillId: SPELL });
    expect(damageTo(events, "f")).toHaveLength(2);
  });

  it("on a foe doing nothing, is a plain arrow", () => {
    const { events } = shot(match(), DISRUPTING);
    expect(damageTo(events, "f")).toHaveLength(1);
  });
});

describe("Incendiary Arrows (#2190)", () => {
  it("hits the target and the two foes nearest it, and sets each on fire for 3 s", () => {
    const sim = match([
      spec("g", 1, vec2(230, 0)),
      spec("h", 1, vec2(200, 35)),
      spec("k", 1, vec2(260, 0)),
    ]);
    const { events } = shot(sim, INCENDIARY);
    for (const id of ["f", "g", "h"]) {
      expect(damageTo(events, id), id).toHaveLength(1);
      expect(remaining(get(sim, id).combatant, "burning"), id).toBeGreaterThan(2);
    }
    expect(damageTo(events, "k")).toEqual([]);
    expect(get(sim, "k").combatant.statuses.has("burning")).toBe(false);
  });

  it("with no other foe near, hits only the target", () => {
    const { events } = shot(match(), INCENDIARY);
    expect(damageTo(events, "f")).toHaveLength(1);
    expect(events.filter((event) => event.kind === "damage")).toHaveLength(1);
  });
});

describe("Marauder's Shot (#2190)", () => {
  it('reads "all of your non-attack skills", not every type by name', () => {
    const ranks = new Map([["ranger.marksmanship", 12]]);
    expect(
      describeSkill(skill(MARAUDERS), ranks, EN_WORDS, EN_NAMES).effects.map(({ text }) => text),
    ).toContain("All of your non-attack skills are disabled for 5 seconds");
  });

  it("disables every non-attack skill for 5 s on a hit, and nothing on a block", () => {
    const outcomes = new Set<string>();
    for (let n = 0; n < 20; n += 1) {
      const sim = match([], `marauder-${String(n)}`);
      get(sim, "f").combatant.statuses.apply("guardian", 1000, "f", NO_RANKS);
      const { events } = shot(sim, MARAUDERS);
      if (damageTo(events, "f").length > 0) {
        outcomes.add("hit");
        expect(disabled(events)).toContain(SIGNET);
        expect(disabled(events)).toContain(TIGERS);
        expect(disabled(events)).not.toContain(BODY);
      } else {
        outcomes.add("blocked");
        expect(disabled(events)).toEqual([]);
      }
    }
    expect([...outcomes].sort()).toEqual(["blocked", "hit"]);
  });
});

describe("Body Shot (#2190)", () => {
  function bodyShot(cracked: boolean) {
    const sim = match();
    get(sim, "r").combatant.energy = 20;
    if (cracked) {
      get(sim, "f").combatant.statuses.apply("cracked-armor", 60, "f", NO_RANKS);
    }
    return shot(sim, BODY).events;
  }

  it("gains 9 Energy on a foe with Cracked Armor", () => {
    expect(bodyShot(true)).toContainEqual({ kind: "energy-gain", targetId: "r", amount: 9 });
  });

  it("gains nothing on a foe without", () => {
    expect(bodyShot(false).some((event) => event.kind === "energy-gain")).toBe(false);
  });
});

describe("Quick Shot (#2190)", () => {
  it("flies twice as fast as its bow", () => {
    const sim = match();
    expect(sim.requestAttack("r", "f")).toEqual({ ok: true });
    let bow: number | undefined;
    for (let i = 0; i < 5 * RULES.tickRateHz && bow === undefined; i += 1) {
      sim.step(DT);
      bow = sim.projectiles[0]?.speed;
    }
    expect(bow).toBeGreaterThan(0);
    expect(shot(match(), QUICK).speed).toBeCloseTo(2 * (bow ?? 0), 9);
  });
});

describe("Tiger's Fury (#2190)", () => {
  it("attacks 25% faster for 10 s and disables the non-attack skills for 5 s", () => {
    const sim = match();
    expect(sim.requestSkill("r", BAR.indexOf(TIGERS))?.check).toEqual({ ok: true });
    const events = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "r" && entry.skillId === TIGERS)
      .flatMap((entry) => entry.events);
    const bearer = get(sim, "r").combatant;
    expect(remaining(bearer, "tigers-fury")).toBeCloseTo(10, 1);
    expect(getStatusDefinition("tigers-fury").attackDurationMultiplier).toBe(0.75);
    expect(events).toContainEqual({
      kind: "skill-disabled",
      targetId: "r",
      skillId: SIGNET,
      seconds: 5,
    });
    expect(disabled(events)).not.toContain(MARAUDERS);
  });
});
