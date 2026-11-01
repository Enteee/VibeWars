import { createRng } from "../rng.js";
import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { gainStrikes } from "../skills/adrenaline.js";
import { getSkill } from "../skills/catalog.js";
import { mitigate, rankedDamageReduction } from "../skills/damage.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, getStatusDefinition } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Warrior staples 2 (#1592): a holds-a-shield condition, a
 * `bearer-uses-skill` trigger bound to adrenal skills, a damage cut by
 * the bearer's rank, and the six Warrior skills on them.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const SHIELD_BASH = "warrior.shield-bash";
const SHIELD_STANCE = "warrior.shield-stance";
const RAGE_OF_THE_NTOUKA = "warrior.rage-of-the-ntouka";
const CLEAVE = "warrior.cleave";
const PENETRATING_BLOW = "warrior.penetrating-blow";
const SUN_AND_MOON_SLASH = "warrior.sun-and-moon-slash";
const BAR = [
  SHIELD_BASH,
  SHIELD_STANCE,
  RAGE_OF_THE_NTOUKA,
  CLEAVE,
  PENETRATING_BLOW,
  SUN_AND_MOON_SLASH,
];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

function wielding(
  weapon: Weapon,
  attributeId: string,
  offhandId?: ResolvedEquipment["offhandId"],
): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
    offhandId,
  };
}

/** A sword and a shield. */
const SWORD_AND_SHIELD = wielding(WEAPONS.sword, "warrior.swordsmanship", "shield");
/** A sword and a focus: no shield. */
const SWORD_AND_FOCUS = wielding(WEAPONS.sword, "warrior.swordsmanship", "focus");
/** A hammer, two-handed: no shield. */
const HAMMER = wielding(WEAPONS.hammer, "warrior.hammer-mastery");
/** An axe in hand. */
const AXE = wielding(WEAPONS.axe, "warrior.axe-mastery");
/** A longbow in `f`'s hand: a projectile attacker. */
const LONGBOW = wielding(WEAPONS.longbow, "ranger.marksmanship");

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

/** `w`, a rank-12 Warrior with a sword, a shield and `BAR`, at the origin. */
function warrior(extra: Partial<ParticipantSpec> = {}): ParticipantSpec {
  return spec("w", 0, vec2(0, 0), {
    skillBar: BAR,
    attributeRanks: new Map([
      ["warrior.strength", 12],
      ["warrior.axe-mastery", 12],
      ["warrior.swordsmanship", 12],
      ["warrior.tactics", 12],
    ]),
    equipment: SWORD_AND_SHIELD,
    ...extra,
  });
}

/** `w` and `more`; `f`, its foe, in melee reach east unless `more` places it. */
function match(more: readonly ParticipantSpec[] = [], self = warrior()) {
  const participants = [self, ...more];
  if (!more.some((participant) => participant.id === "f")) {
    participants.push(spec("f", 1, vec2(RANGE_MELEE / 2, 0), { equipment: AXE }));
  }
  return new MatchSimulation({ seed: "warrior-staples-2", ruleset: NO_CRIT, participants });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `w` uses `skillId` on `f`: what its skill logged until it landed. */
function used(sim: MatchSimulation, skillId: string): CombatEvent[] {
  sim.setTarget("w", "f");
  expect(sim.requestSkill("w", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "w" && entry.skillId === skillId)
      .flatMap((entry) => entry.events);
    if (logged.length > 0) {
      return logged;
    }
  }
  throw new Error(`${skillId} never landed`);
}

/** `w` uses `skillId`, which logs nothing, and a second passes. */
function usedQuietly(sim: MatchSimulation, skillId: string): void {
  sim.setTarget("w", "f");
  expect(sim.requestSkill("w", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  for (let i = 0; i < RULES.tickRateHz; i += 1) {
    sim.step(DT);
  }
}

/**
 * `f` swings or shoots at `w` once: what the log said until it ended,
 * every source's but degeneration.
 */
function attacked(sim: MatchSimulation): CombatEvent[] {
  expect(sim.requestAttack("f", "w")).toEqual({ ok: true });
  const events: CombatEvent[] = [];
  const logged = (): CombatEvent[] =>
    sim
      .step(DT)
      .log.filter((entry) => entry.cause !== "degeneration")
      .flatMap((entry) => entry.events);
  for (let i = 0; i < 4 * RULES.tickRateHz; i += 1) {
    events.push(...logged());
    if (events.some((event) => event.kind === "attack-blocked" || event.kind === "damage")) {
      // The block's trigger fires at the tick's drain, a tick on at most.
      events.push(...logged());
      return events;
    }
  }
  throw new Error("f's attack never landed");
}

function damageTo(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

describe("caster-holds-shield (#1592)", () => {
  /** Whether Shield Bash put its status on `w`, holding `equipment`. */
  function bashes(equipment: ResolvedEquipment): boolean {
    const sim = match([], warrior({ equipment }));
    usedQuietly(sim, SHIELD_BASH);
    return get(sim, "w").combatant.statuses.has("shield-bash");
  }

  it("holds with a shield, not with a focus or a two-handed weapon", () => {
    expect(bashes(SWORD_AND_SHIELD)).toBe(true);
    expect(bashes(SWORD_AND_FOCUS)).toBe(false);
    expect(bashes(HAMMER)).toBe(false);
  });

  it("with no shield, the energy and the recharge are spent for nothing", () => {
    const sim = match([], warrior({ equipment: SWORD_AND_FOCUS }));
    const w = get(sim, "w").combatant;
    usedQuietly(sim, SHIELD_BASH);
    expect(w.energy).toBeLessThan(1000);
    expect(w.cast.rechargeRemaining.get(SHIELD_BASH) ?? 0).toBeGreaterThan(0);
  });
});

describe("Shield Bash (#1592)", () => {
  it("blocks the next melee blow, knocks its attacker down and ends", () => {
    expect(skill(SHIELD_BASH)).toMatchObject({
      attributeId: "warrior.strength",
      cost: { kind: "energy", amount: 5 },
      rechargeSeconds: 20,
    });
    const sim = match();
    usedQuietly(sim, SHIELD_BASH);
    expect(get(sim, "w").combatant.statuses.get("shield-bash")?.durationSeconds).toBe(10);
    const events = attacked(sim);
    expect(damageTo(events, "w")).toEqual([]);
    expect(get(sim, "f").combatant.knockdownRemaining).toBeGreaterThan(0);
    expect(get(sim, "w").combatant.statuses.has("shield-bash")).toBe(false);
  });

  it("a plain swing blocked lengthens no skill of the attacker's", () => {
    const sim = match([
      spec("f", 1, vec2(RANGE_MELEE / 2, 0), { equipment: AXE, skillBar: [CLEAVE] }),
    ]);
    usedQuietly(sim, SHIELD_BASH);
    attacked(sim);
    expect(get(sim, "f").combatant.cast.rechargeRemaining.size).toBe(0);
  });

  it("an arrow is neither blocked nor answered, and Shield Bash stays", () => {
    const sim = match([spec("f", 1, vec2(500, 0), { equipment: LONGBOW })]);
    usedQuietly(sim, SHIELD_BASH);
    const events = attacked(sim);
    expect(damageTo(events, "w")).toHaveLength(1);
    expect(get(sim, "w").combatant.statuses.has("shield-bash")).toBe(true);
  });
});

describe("Shield Stance (#1592)", () => {
  it("is a 5 s stance of a 75% block on any attack", () => {
    expect(skill(SHIELD_STANCE)).toMatchObject({
      type: "stance",
      attributeId: "warrior.tactics",
      cost: { kind: "energy", amount: 5 },
      rechargeSeconds: 15,
    });
    const sim = match();
    usedQuietly(sim, SHIELD_STANCE);
    expect(get(sim, "w").combatant.statuses.get("shield-stance")?.durationSeconds).toBe(5);
    expect(getStatusDefinition("shield-stance").block).toEqual({ chance: 0.75, against: "all" });
  });

  it("cuts 2 a Strength rank off each packet, at most 15: Tactics gives none", () => {
    const cut = (ranks: [string, number][]): number => {
      const bearer = makeCombatant({ id: "w", attributeRanks: new Map(ranks) });
      bearer.statuses.apply("shield-stance", 5, "w", NO_RANKS);
      return rankedDamageReduction(bearer);
    };
    expect(cut([["warrior.strength", 4]])).toBe(8);
    expect(cut([["warrior.strength", 7]])).toBe(14);
    expect(cut([["warrior.strength", 8]])).toBe(15);
    expect(cut([["warrior.strength", 12]])).toBe(15);
    expect(cut([["warrior.tactics", 12]])).toBe(0);
    expect(rankedDamageReduction(makeCombatant({ id: "x" }))).toBe(0);
  });

  it("a 50 slashing packet lands 35", () => {
    const bearer = makeCombatant({
      id: "w",
      attributeRanks: new Map([["warrior.strength", 12]]),
    });
    const packet = {
      armored: 50,
      armorIgnoring: 0,
      type: "slashing",
      source: "weapon",
      armorPenetration: 0,
    } as const;
    expect(mitigate(packet, bearer, RULES.combat, null, createRng(1))).toBe(50);
    bearer.statuses.apply("shield-stance", 5, "w", NO_RANKS);
    expect(mitigate(packet, bearer, RULES.combat, null, createRng(1))).toBe(35);
  });
});

describe("Rage of the Ntouka (#1592)", () => {
  it("is an elite of 6 strikes, each adrenal skill capped at its cost", () => {
    expect(skill(RAGE_OF_THE_NTOUKA)).toMatchObject({
      elite: true,
      attributeId: "warrior.strength",
      cost: { kind: "energy", amount: 5 },
      rechargeSeconds: 15,
      effects: [
        { kind: "adrenaline-gain", strikes: 6 },
        { kind: "apply-status", statusId: "rage-of-the-ntouka", durationSeconds: 8 },
      ],
    });
    const sim = match();
    const w = get(sim, "w").combatant;
    usedQuietly(sim, RAGE_OF_THE_NTOUKA);
    expect((w.adrenaline.get(CLEAVE) ?? 0) / ADRENALINE_PER_STRIKE).toBe(4);
    expect((w.adrenaline.get(SUN_AND_MOON_SLASH) ?? 0) / ADRENALINE_PER_STRIKE).toBe(6);
  });

  it("an adrenal skill used under it, paid for by its strikes, recharges for 3 s", () => {
    const sim = match([], warrior({ equipment: AXE }));
    const w = get(sim, "w").combatant;
    usedQuietly(sim, RAGE_OF_THE_NTOUKA);
    used(sim, CLEAVE);
    const left = w.cast.rechargeRemaining.get(CLEAVE) ?? 0;
    expect(left).toBeGreaterThan(2);
    expect(left).toBeLessThanOrEqual(3);
  });

  it("an energy skill under it gets no more recharge", () => {
    const sim = match();
    const w = get(sim, "w").combatant;
    usedQuietly(sim, RAGE_OF_THE_NTOUKA);
    usedQuietly(sim, SHIELD_STANCE);
    expect(w.cast.rechargeRemaining.get(SHIELD_STANCE) ?? 0).toBeLessThanOrEqual(15);
  });

  it("without it, an adrenal skill recharges at once", () => {
    const sim = match([], warrior({ equipment: AXE }));
    const w = get(sim, "w").combatant;
    gainStrikes(w, 4, 0);
    used(sim, CLEAVE);
    expect(w.cast.rechargeRemaining.get(CLEAVE) ?? 0).toBe(0);
  });
});

describe("Cleave (#1592)", () => {
  /** `f` and three more foes, all adjacent to `f`. */
  const FOES = [
    spec("f", 1, vec2(RANGE_MELEE / 2, 0)),
    spec("g1", 1, vec2(RANGE_MELEE / 2, 30)),
    spec("g2", 1, vec2(RANGE_MELEE / 2, -30)),
    spec("g3", 1, vec2(RANGE_MELEE / 2 + 30, 0)),
  ];

  it("an elite axe blow of +34 that hits 2 adjacent foes for 34 slashing", () => {
    expect(skill(CLEAVE)).toMatchObject({
      elite: true,
      cost: { kind: "adrenaline", amount: 4 },
      attack: {
        weapon: "axe",
        bonusDamage: { scaling: { attributeId: "warrior.axe-mastery", atTwelve: 34 } },
      },
    });
    const sim = match(FOES, warrior({ equipment: AXE }));
    gainStrikes(get(sim, "w").combatant, 4, 0);
    const events = used(sim, CLEAVE);
    expect(damageTo(events, "f")).toHaveLength(1);
    const splashed = ["g1", "g2", "g3"].map((id) => damageTo(events, id));
    expect(splashed.filter((hits) => hits.length > 0)).toEqual([[34], [34]]);
  });

  it("a blocked blow splashes no one", () => {
    const sim = match(FOES, warrior({ equipment: AXE }));
    get(sim, "f").combatant.statuses.apply("shield-bash", 10, "f", NO_RANKS);
    gainStrikes(get(sim, "w").combatant, 4, 0);
    const events = used(sim, CLEAVE);
    expect(events.some((event) => event.kind === "attack-blocked")).toBe(true);
    for (const id of ["f", "g1", "g2", "g3"]) {
      expect(damageTo(events, id)).toEqual([]);
    }
  });
});

describe("Penetrating Blow (#1592)", () => {
  it("an axe blow of +22 with 20% armor penetration", () => {
    expect(skill(PENETRATING_BLOW)).toMatchObject({
      cost: { kind: "adrenaline", amount: 5 },
      attack: {
        weapon: "axe",
        bonusDamage: { scaling: { attributeId: "warrior.axe-mastery", atTwelve: 22 } },
        armorPenetration: 0.2,
      },
      effects: [],
    });
  });
});

describe("Sun and Moon Slash (#1592)", () => {
  it("two sword blows nothing blocks", () => {
    expect(skill(SUN_AND_MOON_SLASH)).toMatchObject({
      cost: { kind: "adrenaline", amount: 8 },
      attack: { weapon: "sword", bonusDamage: undefined, strikes: 2, unblockable: true },
    });
    const sim = match();
    get(sim, "f").combatant.statuses.apply("shield-bash", 10, "f", NO_RANKS);
    gainStrikes(get(sim, "w").combatant, 8, 0);
    const events = used(sim, SUN_AND_MOON_SLASH);
    expect(events.some((event) => event.kind === "attack-blocked")).toBe(false);
    expect(damageTo(events, "f")).toHaveLength(2);
  });
});

describe("the texts (#1592)", () => {
  const ranks = warrior().attributeRanks;
  const text = (id: string): string[] =>
    describeSkill(skill(id), ranks).effects.map((effect) => effect.text);

  it("say what each does", () => {
    expect(text(SHIELD_BASH)).toEqual([
      "If you hold a shield: applies Shield Bash for 10s (100% chance to block melee attacks. The next time it blocks a melee attack: knocks down for 2s)",
    ]);
    expect(describeStatus("shield-stance", ranks)).toBe(
      "75% chance to block attacks, −15 damage taken (2 per rank of Strength, at most 15)",
    );
    expect(describeStatus("shield-stance", new Map([["warrior.strength", 3]]))).toBe(
      "75% chance to block attacks, −6 damage taken (2 per rank of Strength, at most 15)",
    );
    expect(describeStatus("rage-of-the-ntouka", ranks)).toBe(
      "whenever it uses an adrenal skill: that skill takes 3 seconds longer to recharge",
    );
  });
});
