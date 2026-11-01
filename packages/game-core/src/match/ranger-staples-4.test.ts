import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_IN_THE_AREA, AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeStatus } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { blockChanceOf } from "../skills/tick.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * The Ranger staples 3 (#1676): four bow attacks, four pet attacks, three
 * traps and a stance, all on primitives that were already there.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const CALLED_SHOT = "ranger.called-shot";
const ARCING_SHOT = "ranger.arcing-shot";
const SPLINTER_SHOT = "ranger.splinter-shot";
const MAGEBANE_SHOT = "ranger.magebane-shot";
const POUNCE = "ranger.pounce";
const BESTIAL_POUNCE = "ranger.bestial-pounce";
const FERAL_LUNGE = "ranger.feral-lunge";
const POISONOUS_BITE = "ranger.poisonous-bite";
const VIPERS_NEST = "ranger.vipers-nest";
const TRIPWIRE = "ranger.tripwire";
const SMOKE_TRAP = "ranger.smoke-trap";
const ZOJUNS_HASTE = "ranger.zojuns-haste";
/** Gives `r` its wolf. */
const CHARM = "ranger.charm-animal";
const BAR = [
  CALLED_SHOT,
  ARCING_SHOT,
  SPLINTER_SHOT,
  MAGEBANE_SHOT,
  VIPERS_NEST,
  TRIPWIRE,
  SMOKE_TRAP,
  ZOJUNS_HASTE,
];
const PET_BAR = [CHARM, POUNCE, BESTIAL_POUNCE, FERAL_LUNGE, POISONOUS_BITE];
/** A spell, for a foe to be casting. */
const SPELL = "necromancer.rotting-flesh";
/** A signet, for a foe to be using a skill that is no spell. */
const SIGNET = "warrior.healing-signet";
/** An attack skill, for a foe to be attacking. */
const ATTACK_SKILL = "ranger.hunters-shot";

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

/** `r`, a rank-12 Ranger with a longbow and `bar`, at the origin. */
function ranger(bar: readonly string[] = BAR): ParticipantSpec {
  return spec("r", 0, vec2(0, 0), {
    skillBar: bar,
    attributeRanks: new Map([
      ["ranger.marksmanship", 12],
      ["ranger.expertise", 12],
      ["ranger.beast-mastery", 12],
      ["ranger.wilderness-survival", 12],
    ]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
  });
}

/** `r` and `more`; `f`, its foe, 200 east unless `more` places it. */
function match(
  more: readonly ParticipantSpec[] = [],
  { seed = "ranger-staples-4", bar = BAR }: { seed?: string; bar?: readonly string[] } = {},
) {
  const participants = [ranger(bar), ...more];
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

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
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

function knockedDown(events: readonly CombatEvent[], targetId: string): boolean {
  return events.some((event) => event.kind === "knocked-down" && event.targetId === targetId);
}

describe("the corpus's numbers (#1676)", () => {
  it("cost, recharge, activation, attribute and elite, as GW1 has them", () => {
    const row = (id: string) => {
      const found = skill(id);
      return [
        found.attributeId,
        found.cost?.amount,
        found.rechargeSeconds,
        found.activationSeconds,
        found.elite,
      ];
    };
    expect(row(CALLED_SHOT)).toEqual([undefined, 5, 3, 0, false]);
    expect(row(ARCING_SHOT)).toEqual(["ranger.marksmanship", 5, 3, 0, false]);
    expect(row(SPLINTER_SHOT)).toEqual(["ranger.marksmanship", 10, 5, 0, false]);
    expect(row(MAGEBANE_SHOT)).toEqual([undefined, 10, 5, 0.5, true]);
    expect(row(POUNCE)).toEqual(["ranger.beast-mastery", 5, 10, 0, false]);
    expect(row(BESTIAL_POUNCE)).toEqual(["ranger.beast-mastery", 5, 10, 0, false]);
    expect(row(FERAL_LUNGE)).toEqual(["ranger.beast-mastery", 5, 10, 0, false]);
    expect(row(POISONOUS_BITE)).toEqual(["ranger.beast-mastery", 5, 7, 0, false]);
    expect(row(VIPERS_NEST)).toEqual(["ranger.beast-mastery", 10, 20, 2, false]);
    expect(row(TRIPWIRE)).toEqual(["ranger.wilderness-survival", 10, 30, 2, false]);
    expect(row(SMOKE_TRAP)).toEqual(["ranger.wilderness-survival", 10, 15, 2, true]);
    expect(row(ZOJUNS_HASTE)).toEqual(["ranger.expertise", 5, 30, 0, false]);
  });

  it("bonus damage at rank 12", () => {
    expect(skill(ARCING_SHOT).attack?.bonusDamage).toMatchObject({ scaling: { atTwelve: 30 } });
    expect(skill(SPLINTER_SHOT).attack?.bonusDamage).toMatchObject({ scaling: { atTwelve: 12.6 } });
    expect(skill(POUNCE).petAttack?.bonusDamage).toMatchObject({ scaling: { atTwelve: 17 } });
    expect(skill(BESTIAL_POUNCE).petAttack?.bonusDamage).toMatchObject({
      scaling: { atTwelve: 17 },
    });
    expect(skill(FERAL_LUNGE).petAttack?.bonusDamage).toMatchObject({ scaling: { atTwelve: 29 } });
    expect(skill(POISONOUS_BITE).petAttack?.bonusDamage).toBeUndefined();
  });
});

describe("Called Shot and Arcing Shot (#1676)", () => {
  it("land through a 75% block every time", () => {
    for (const id of [CALLED_SHOT, ARCING_SHOT]) {
      for (let n = 0; n < 10; n += 1) {
        const sim = match([], { seed: `unblockable-${String(n)}` });
        get(sim, "f").combatant.statuses.apply("guardian", 1000, "f", NO_RANKS);
        const { events } = shot(sim, id);
        expect(damageTo(events, "f"), `${id} ${String(n)}`).toHaveLength(1);
      }
    }
  });

  it("Called Shot flies 3 times as fast as its bow, Arcing Shot half as fast", () => {
    const sim = match();
    expect(sim.requestAttack("r", "f")).toEqual({ ok: true });
    let bow: number | undefined;
    for (let i = 0; i < 5 * RULES.tickRateHz && bow === undefined; i += 1) {
      sim.step(DT);
      bow = sim.projectiles[0]?.speed;
    }
    expect(bow).toBeGreaterThan(0);
    expect(shot(match(), CALLED_SHOT).speed).toBeCloseTo(3 * (bow ?? 0), 9);
    expect(shot(match(), ARCING_SHOT).speed).toBeCloseTo(0.5 * (bow ?? 0), 9);
  });
});

describe("Splinter Shot (#1676)", () => {
  /** `f` 300 east, `near` in its area, `far` outside; `f` blocks 75%. */
  function splinter(seed: string) {
    const sim = match(
      [
        spec("f", 1, vec2(300, 0)),
        spec("near", 1, vec2(300 + AREA_IN_THE_AREA - 10, 0)),
        spec("far", 1, vec2(300 + AREA_IN_THE_AREA + 40, 0)),
      ],
      { seed },
    );
    get(sim, "f").combatant.statuses.apply("guardian", 1000, "f", NO_RANKS);
    const { events } = shot(sim, SPLINTER_SHOT);
    return events;
  }

  it("blocked: the target and each foe in its area take 53; hit: only the target, no splash", () => {
    const outcomes = new Set<string>();
    for (let n = 0; n < 20; n += 1) {
      const events = splinter(`splinter-${String(n)}`);
      const blocked = events.some((event) => event.kind === "attack-blocked");
      if (blocked) {
        outcomes.add("blocked");
        expect(damageTo(events, "f")).toEqual([53]);
        expect(damageTo(events, "near")).toEqual([53]);
      } else {
        outcomes.add("hit");
        expect(damageTo(events, "f")).toHaveLength(1);
        expect(damageTo(events, "near")).toEqual([]);
      }
      expect(damageTo(events, "far")).toEqual([]);
    }
    expect([...outcomes].sort()).toEqual(["blocked", "hit"]);
  });
});

describe("Magebane Shot (#1676)", () => {
  /** `f` in a long use of `skillId`, or doing nothing; what the shot did. */
  function magebane(skillId: string | undefined) {
    const sim = match();
    const foe = get(sim, "f").combatant;
    foe.statuses.apply("guardian", 1000, "f", NO_RANKS);
    if (skillId !== undefined) {
      foe.cast.beginCast(skillId, "r", 60, undefined);
    }
    const { events } = shot(sim, MAGEBANE_SHOT);
    return { foe, events };
  }

  it("interrupts a spell and disables it 10 s longer, through any block", () => {
    const { foe, events } = magebane(SPELL);
    expect(damageTo(events, "f")).toHaveLength(1);
    expect(foe.cast.isCasting).toBe(false);
    expect(events).toContainEqual({
      kind: "skill-disabled",
      targetId: "f",
      skillId: SPELL,
      seconds: 10,
    });
  });

  it("interrupts a signet, with no extra disable", () => {
    const { foe, events } = magebane(SIGNET);
    expect(foe.cast.isCasting).toBe(false);
    expect(events.some((event) => event.kind === "skill-disabled")).toBe(false);
  });

  it("on a foe doing nothing, is a plain arrow", () => {
    const { events } = magebane(undefined);
    expect(damageTo(events, "f")).toHaveLength(1);
    expect(events.some((event) => event.kind === "skill-disabled")).toBe(false);
  });
});

describe("the pet attacks (#1676)", () => {
  /** Ranger `r` with its wolf and `PET_BAR`, foe `f` 60 off, set up by `prepare`. */
  function petBlow(skillId: string, prepare: (sim: MatchSimulation) => void = () => undefined) {
    const sim = match([spec("f", 1, vec2(60, 0))], { bar: PET_BAR });
    prepare(sim);
    sim.setTarget("r", "f");
    expect(sim.requestSkill("r", PET_BAR.indexOf(skillId))?.check).toEqual({ ok: true });
    const log = stepFor(sim, 4);
    const blow = log.find((entry) => entry.skillId === skillId && entry.sourceId !== "r");
    expect(blow, skillId).toBeDefined();
    return { sim, events: blow?.events ?? [] };
  }
  const casting = (id: string) => (sim: MatchSimulation) => {
    get(sim, "f").combatant.cast.beginCast(id, "r", 60, undefined);
  };

  it("Pounce knocks down a moving foe, not a standing one", () => {
    // Crippled, so the wolf catches it walking away.
    const moving = petBlow(POUNCE, (sim) => {
      get(sim, "f").combatant.statuses.apply("crippled", 1000, "r", NO_RANKS);
      sim.setInputDirection("f", vec2(0, 1));
    });
    expect(knockedDown(moving.events, "f")).toBe(true);
    expect(knockedDown(petBlow(POUNCE).events, "f")).toBe(false);
  });

  it("Bestial Pounce knocks down a foe casting a spell, not one attacking", () => {
    expect(knockedDown(petBlow(BESTIAL_POUNCE, casting(SPELL)).events, "f")).toBe(true);
    expect(knockedDown(petBlow(BESTIAL_POUNCE, casting(ATTACK_SKILL)).events, "f")).toBe(false);
  });

  it("Feral Lunge bleeds an attacking foe 21 s, not a casting one", () => {
    const attacking = petBlow(FERAL_LUNGE, casting(ATTACK_SKILL));
    expect(get(attacking.sim, "f").combatant.statuses.get("bleeding")?.durationSeconds).toBe(21);
    const spell = petBlow(FERAL_LUNGE, casting(SPELL));
    expect(get(spell.sim, "f").combatant.statuses.has("bleeding")).toBe(false);
  });

  it("Poisonous Bite poisons for 17 s", () => {
    const { sim } = petBlow(POISONOUS_BITE);
    expect(get(sim, "f").combatant.statuses.get("poison")?.durationSeconds).toBe(17);
  });
});

describe("the traps (#1676)", () => {
  /** `r` sets `trapId`; `f`, adjacent, springs it; what the spring did. */
  function sprung(trapId: string, more: readonly ParticipantSpec[] = []) {
    const sim = match([spec("f", 1, vec2(AREA_ADJACENT - 10, 0)), ...more]);
    expect(sim.requestSkill("r", BAR.indexOf(trapId))?.check).toEqual({ ok: true });
    const events = stepFor(sim, 3)
      .filter((entry) => entry.skillId === trapId)
      .flatMap((entry) => entry.events);
    return { sim, events };
  }

  it("Viper's Nest strikes nearby foes for 29 and poisons them 17 s", () => {
    const { sim, events } = sprung(VIPERS_NEST);
    expect(damageTo(events, "f")).toEqual([29]);
    expect(get(sim, "f").combatant.statuses.get("poison")?.durationSeconds).toBe(17);
  });

  it("Tripwire strikes for 17 and knocks down only the Crippled", () => {
    const sim = match([
      spec("f", 1, vec2(AREA_ADJACENT - 10, 0)),
      spec("lame", 1, vec2(0, AREA_NEARBY - 10)),
    ]);
    get(sim, "lame").combatant.statuses.apply("crippled", 1000, "r", NO_RANKS);
    expect(sim.requestSkill("r", BAR.indexOf(TRIPWIRE))?.check).toEqual({ ok: true });
    const events = stepFor(sim, 3)
      .filter((entry) => entry.skillId === TRIPWIRE)
      .flatMap((entry) => entry.events);
    expect(damageTo(events, "f")).toEqual([17]);
    expect(damageTo(events, "lame")).toEqual([17]);
    expect(knockedDown(events, "lame")).toBe(true);
    expect(knockedDown(events, "f")).toBe(false);
  });

  it("Smoke Trap blinds and dazes foes in the area 9 s, past nearby", () => {
    const { sim } = sprung(SMOKE_TRAP, [
      spec("area", 1, vec2(0, AREA_IN_THE_AREA - 10)),
      spec("out", 1, vec2(0, -(AREA_IN_THE_AREA + 20))),
    ]);
    expect(AREA_IN_THE_AREA - 10).toBeGreaterThan(AREA_NEARBY);
    for (const id of ["f", "area"]) {
      const statuses = get(sim, id).combatant.statuses;
      expect(statuses.get("blind")?.durationSeconds, id).toBe(9);
      expect(statuses.get("dazed")?.durationSeconds, id).toBe(9);
    }
    expect(get(sim, "out").combatant.statuses.has("blind")).toBe(false);
  });
});

describe("Zojun's Haste (#1676)", () => {
  it("moves 33% faster and blocks 65% of projectiles, no melee blow", () => {
    const bearer = makeCombatant({ id: "r" });
    bearer.statuses.apply("zojuns-haste", 10, "r", NO_RANKS);
    expect(aggregateModifiers(bearer.statuses.active).moveSpeedMultiplier).toBe(1.33);
    expect(blockChanceOf(bearer, "projectile")).toBe(0.65);
    expect(blockChanceOf(bearer, "melee")).toBe(0);
  });

  it("lasts 10 s, and ends as its bearer releases a shot", () => {
    const sim = match();
    expect(sim.requestSkill("r", BAR.indexOf(ZOJUNS_HASTE))?.check).toEqual({ ok: true });
    sim.step(DT);
    const bearer = get(sim, "r").combatant;
    expect(bearer.statuses.get("zojuns-haste")?.durationSeconds).toBe(10);
    shot(sim, CALLED_SHOT);
    expect(bearer.statuses.has("zojuns-haste")).toBe(false);
  });

  it("says what it does", () => {
    expect(describeStatus("zojuns-haste", new Map())).toBe(
      "moves at 133% speed, 65% chance to block projectiles, ends if the bearer attacks",
    );
  });
});
