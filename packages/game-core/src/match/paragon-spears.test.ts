import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import type { StatusId } from "../skills/status.js";
import { chargeAdrenaline, makeCombatant } from "../skills/testing.js";
import type { Combatant, Skill } from "../skills/types.js";
import { resolveAttackSkill } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Paragon spears (#1486): a faster flight, riders on a critical hit and
 * on a blow that fails to hit, and the eleven Spear Mastery and
 * Leadership attacks that use them.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };
/** Every roll crits. */
const ALL_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: 1 } };

const BARBED = "paragon.barbed-spear";
const BLAZING = "paragon.blazing-spear";
const MIGHTY = "paragon.mighty-throw";
const UNBLOCKABLE = "paragon.unblockable-throw";
const WEARYING = "paragon.wearying-spear";
const VICIOUS = "paragon.vicious-attack";
const DISRUPTING = "paragon.disrupting-throw";
const SLAYERS = "paragon.slayers-spear";
const SWIFT = "paragon.swift-javelin";
const CHEST = "paragon.chest-thumper";
const REDEMPTION = "paragon.spear-of-redemption";
const SWIPE = "paragon.spear-swipe";
const SPEARS = [
  BLAZING,
  MIGHTY,
  UNBLOCKABLE,
  WEARYING,
  VICIOUS,
  DISRUPTING,
  SLAYERS,
  SWIFT,
  CHEST,
  REDEMPTION,
  SWIPE,
];

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
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

interface Arena {
  readonly seed?: string;
  readonly ruleset?: Ruleset;
  /** How far the foe stands: 300 by default. */
  readonly distance?: number;
}

/** A rank-12 spear Paragon `p` with `bar`, its foe `foe` east of it. */
function arena(bar: readonly string[], options: Arena = {}): MatchSimulation {
  const match = new MatchSimulation({
    seed: options.seed ?? "spears",
    ruleset: options.ruleset ?? RULES,
    participants: [
      spec("p", 0, vec2(0, 0), {
        skillBar: [...bar],
        attributeRanks: new Map([
          ["paragon.spear-mastery", 12],
          ["paragon.leadership", 12],
        ]),
        equipment: wielding(WEAPONS.spear, "paragon.spear-mastery"),
        maxEnergy: 100,
      }),
      spec("foe", 1, vec2(options.distance ?? 300, 0)),
    ],
  });
  chargeAdrenaline(get(match, "p").combatant);
  match.setTarget("p", "foe");
  return match;
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Step until the spear in `slot` has left the hand: its flight time. */
function released(match: MatchSimulation, slot: number): number {
  expect(match.requestSkill("p", slot)?.check).toEqual({ ok: true });
  for (let i = 0; i < 400; i += 1) {
    match.step(DT);
    const [shot] = match.projectiles;
    if (shot !== undefined) {
      return shot.flightSeconds;
    }
  }
  throw new Error("no spear left the hand");
}

/** Step until the spear in flight lands: the events its throw and landing logged. */
function landed(match: MatchSimulation): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < 400; i += 1) {
    events.push(
      ...match
        .step(DT)
        .log.filter((logged) => logged.cause === "skill" && logged.sourceId === "p")
        .flatMap((logged: CombatLogEntry) => logged.events),
    );
    if (match.projectiles.length === 0) {
      return events;
    }
  }
  throw new Error("no spear landed");
}

/** Throw the spear in `slot` and step until it has landed. */
function thrown(match: MatchSimulation, slot: number): CombatEvent[] {
  released(match, slot);
  return landed(match);
}

const kinds = (events: CombatEvent[]): string[] => events.map((event) => event.kind);
const damageOf = (events: CombatEvent[]): number =>
  events.reduce((sum, event) => sum + (event.kind === "damage" ? event.amount : 0), 0);
const paragon = (match: MatchSimulation): Combatant => get(match, "p").combatant;
const foe = (match: MatchSimulation): Combatant => get(match, "foe").combatant;
const durationOn = (who: Combatant, statusId: StatusId): number | undefined =>
  who.statuses.get(statusId)?.durationSeconds;

/**
 * Run `attempt` on seeds, each also numbered, until `kinds` of what it returns includes
 * `wanted`, and return those events; throws when no seed of 40 does.
 */
function onSomeSeed(
  wanted: string,
  attempt: (seed: string, n: number) => CombatEvent[],
): { readonly seed: string; readonly events: CombatEvent[] } {
  for (let n = 0; n < 40; n += 1) {
    const seed = `${wanted}-${String(n)}`;
    const events = attempt(seed, n);
    if (kinds(events).includes(wanted)) {
      return { seed, events };
    }
  }
  throw new Error(`no seed gave ${wanted}`);
}

describe("a faster flight (#1486)", () => {
  it("Mighty Throw flies three times as fast as a plain spear: a third of the flight time", () => {
    const plain = released(arena([BARBED]), 0);
    expect(released(arena([MIGHTY]), 0)).toBeCloseTo(plain / 3, 9);
  });

  it("Swift Javelin flies twice as fast only while its thrower is enchanted", () => {
    const plain = released(arena([BARBED]), 0);
    expect(released(arena([SWIFT]), 0)).toBeCloseTo(plain, 9);
    const enchanted = arena([SWIFT]);
    paragon(enchanted).statuses.apply("guardian", 1000, "p", NO_RANKS);
    expect(released(enchanted, 0)).toBeCloseTo(plain / 2, 9);
  });

  it("Mighty Throw arrives before a foe who starts walking at the release sidesteps it", () => {
    const sidestep = (slot: number, bar: string[]): string[] => {
      const match = arena(bar);
      released(match, slot);
      match.setInputDirection("foe", vec2(0, 1));
      return kinds(landed(match));
    };
    expect(sidestep(0, [BARBED])).toContain("attack-dodged");
    expect(sidestep(0, [MIGHTY])).not.toContain("attack-dodged");
  });
});

describe("riders on a critical hit (#1486)", () => {
  it("Vicious Attack deep-wounds for 13 s on a critical hit, never on a normal one", () => {
    const crit = arena([VICIOUS], { ruleset: ALL_CRIT });
    thrown(crit, 0);
    expect(durationOn(foe(crit), "deep-wound")).toBe(13);

    const normal = arena([VICIOUS], { ruleset: NO_CRIT });
    expect(kinds(thrown(normal, 0))).toEqual(["damage"]);
    expect(foe(normal).statuses.has("deep-wound")).toBe(false);
  });

  it("a blocked critical is no critical: no Deep Wound", () => {
    const { seed } = onSomeSeed("attack-blocked", (seed) => {
      const match = arena([VICIOUS], { seed, ruleset: ALL_CRIT });
      foe(match).statuses.apply("guardian", 1000, "foe", NO_RANKS);
      return thrown(match, 0);
    });
    const match = arena([VICIOUS], { seed, ruleset: ALL_CRIT });
    foe(match).statuses.apply("guardian", 1000, "foe", NO_RANKS);
    thrown(match, 0);
    expect(foe(match).statuses.has("deep-wound")).toBe(false);
  });

  /** A sword blow of Vicious Attack's with `attack` over its rule: its target after. */
  function struck(attack: Partial<NonNullable<Skill["attack"]>>, rules: Ruleset): Combatant {
    const vicious = skill(VICIOUS);
    const base = vicious.attack;
    if (base === undefined) {
      throw new Error("Vicious Attack is an attack");
    }
    const target = makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 });
    resolveAttackSkill(
      {
        skill: { ...vicious, attack: { ...base, weapon: "sword", ...attack } },
        caster: makeCombatant({
          id: "a",
          team: 0,
          equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
        }),
        targets: [target],
        rng: createRng(1),
        rules: rules.combat,
        surroundings: new Map(),
      },
      () => false,
      [],
    );
    return target;
  }

  it("lands on a melee blow a forced critical makes, not on one that rolls none", () => {
    expect(struck({ criticalWhen: "always" }, NO_CRIT).statuses.has("deep-wound")).toBe(true);
    expect(struck({}, NO_CRIT).statuses.has("deep-wound")).toBe(false);
  });
});

describe("riders on a blow that fails to hit (#1486)", () => {
  /** A Spear of Redemption thrower, Bleeding and Burning. */
  function redeemer(seed: string): MatchSimulation {
    const match = arena([REDEMPTION], { seed });
    paragon(match).statuses.apply("bleeding", 1000, "foe", NO_RANKS);
    paragon(match).statuses.apply("burning", 1000, "foe", NO_RANKS);
    return match;
  }
  const conditions = (match: MatchSimulation): number =>
    paragon(match).statuses.countByCategory("condition");

  it("Spear of Redemption costs its thrower nothing when it hits", () => {
    const match = redeemer("hit");
    expect(kinds(thrown(match, 0))).toEqual(["damage", "adrenaline-gained"]);
    expect(conditions(match)).toBe(2);
  });

  it("loses one condition when it is blocked", () => {
    const { seed } = onSomeSeed("attack-blocked", (seed) => {
      const match = redeemer(seed);
      foe(match).statuses.apply("guardian", 1000, "foe", NO_RANKS);
      return thrown(match, 0);
    });
    const match = redeemer(seed);
    foe(match).statuses.apply("guardian", 1000, "foe", NO_RANKS);
    expect(kinds(thrown(match, 0))).toEqual(["attack-blocked", "status-removed"]);
    expect(conditions(match)).toBe(1);
  });

  it("loses one condition when blindness makes it miss", () => {
    const { events } = onSomeSeed("attack-missed", (seed) => {
      const match = redeemer(seed);
      paragon(match).statuses.apply("blind", 1000, "foe", NO_RANKS);
      expect(match.requestSkill("p", 0)?.check).toEqual({ ok: true });
      const log: CombatEvent[] = [];
      for (let i = 0; i < 40; i += 1) {
        log.push(
          ...match
            .step(DT)
            .log.filter((logged) => logged.cause === "skill")
            .flatMap((logged) => logged.events),
        );
      }
      expect(conditions(match)).toBe(kinds(log).includes("attack-missed") ? 2 : 3);
      return log;
    });
    expect(kinds(events)).toEqual(["skill-used", "attack-missed", "status-removed"]);
  });

  it("loses one condition when its foe sidesteps it", () => {
    const match = redeemer("dodge");
    released(match, 0);
    match.setInputDirection("foe", vec2(0, 1));
    expect(kinds(landed(match))).toEqual(["attack-dodged", "status-removed"]);
    expect(conditions(match)).toBe(1);
  });

  it("a melee blow that misses blind lands its rider too; one that hits does not", () => {
    const redemption = skill(REDEMPTION);
    const base = redemption.attack;
    if (base === undefined) {
      throw new Error("Spear of Redemption is an attack");
    }
    const strike = (blind: boolean, seed = 1): CombatEvent[] => {
      const caster = makeCombatant({
        id: "a",
        team: 0,
        equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
      });
      caster.statuses.apply("bleeding", 1000, "t", NO_RANKS);
      if (blind) {
        caster.statuses.apply("blind", 1000, "t", NO_RANKS);
      }
      const events = resolveAttackSkill(
        {
          skill: { ...redemption, attack: { ...base, weapon: "sword" } },
          caster,
          targets: [makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 })],
          rng: createRng(seed),
          rules: RULES.combat,
          surroundings: new Map(),
        },
        () => false,
        [],
      );
      return events;
    };
    expect(kinds(strike(false))).not.toContain("status-removed");
    const missed = onSomeSeed("attack-missed", (_, n) => strike(true, n)).events;
    expect(kinds(missed)).toEqual(["attack-missed", "status-removed"]);
  });
});

describe("Paragon spears (#1486)", () => {
  it("cost, activate and recharge as the PvP corpus says, all thrown spears", () => {
    expect(
      SPEARS.map((id) => {
        const found = skill(id);
        return [id, found.cost, found.activationSeconds, found.rechargeSeconds, found.attributeId];
      }),
    ).toEqual([
      [BLAZING, { kind: "adrenaline", amount: 6 }, 0, 0, "paragon.spear-mastery"],
      [MIGHTY, { kind: "adrenaline", amount: 4 }, 1, 1, "paragon.spear-mastery"],
      [UNBLOCKABLE, { kind: "adrenaline", amount: 6 }, 1, 1, "paragon.spear-mastery"],
      [WEARYING, { kind: "adrenaline", amount: 3 }, 0, 0, "paragon.spear-mastery"],
      [VICIOUS, { kind: "energy", amount: 5 }, 0, 8, "paragon.spear-mastery"],
      [DISRUPTING, { kind: "energy", amount: 5 }, 0.5, 10, "paragon.spear-mastery"],
      [SLAYERS, { kind: "energy", amount: 10 }, 0, 4, "paragon.spear-mastery"],
      [SWIFT, { kind: "energy", amount: 5 }, 0, 10, "paragon.spear-mastery"],
      [CHEST, { kind: "energy", amount: 5 }, 0, 5, "paragon.spear-mastery"],
      [REDEMPTION, { kind: "adrenaline", amount: 3 }, 0, 0, "paragon.spear-mastery"],
      [SWIPE, { kind: "energy", amount: 5 }, 0, 20, "paragon.leadership"],
    ]);
    for (const id of SPEARS) {
      expect(skill(id).attack?.weapon).toBe("spear");
      expect(skill(id).elite).toBe(false);
    }
  });

  it("Blazing Spear hits 21 harder than a plain spear and burns for 3 s", () => {
    const plain = damageOf(thrown(arena([BARBED]), 0));
    const match = arena([BLAZING]);
    expect(damageOf(thrown(match, 0)) - plain).toBe(21);
    expect(durationOn(foe(match), "burning")).toBe(3);
  });

  it("Mighty Throw and Unblockable Throw hit 34 harder than a plain spear", () => {
    const plain = damageOf(thrown(arena([BARBED]), 0));
    expect(damageOf(thrown(arena([MIGHTY]), 0)) - plain).toBe(34);
    expect(damageOf(thrown(arena([UNBLOCKABLE]), 0)) - plain).toBe(34);
  });

  it("Unblockable Throw is never blocked by a foe who blocks often", () => {
    for (let n = 0; n < 20; n += 1) {
      const match = arena([UNBLOCKABLE], { seed: `unblockable-${String(n)}` });
      foe(match).statuses.apply("guardian", 1000, "foe", NO_RANKS);
      expect(kinds(thrown(match, 0))).toEqual(["damage"]);
    }
  });

  it("Wearying Spear weakens its thrower for 5 s when it hits, not when it is blocked", () => {
    const hit = arena([WEARYING]);
    thrown(hit, 0);
    expect(durationOn(paragon(hit), "weakness")).toBe(5);
    expect(foe(hit).statuses.has("weakness")).toBe(false);

    const { seed } = onSomeSeed("attack-blocked", (seed) => {
      const match = arena([WEARYING], { seed });
      foe(match).statuses.apply("guardian", 1000, "foe", NO_RANKS);
      return thrown(match, 0);
    });
    const blocked = arena([WEARYING], { seed });
    foe(blocked).statuses.apply("guardian", 1000, "foe", NO_RANKS);
    thrown(blocked, 0);
    expect(paragon(blocked).statuses.has("weakness")).toBe(false);
  });

  it("Disrupting Throw interrupts a casting foe with a condition, not a clean one", () => {
    const casting = (bleeding: boolean): MatchSimulation => {
      const match = arena([DISRUPTING]);
      if (bleeding) {
        foe(match).statuses.apply("bleeding", 1000, "p", NO_RANKS);
      }
      released(match, 0);
      foe(match).cast.beginCast("elementalist.fireball", "p", 10, undefined);
      landed(match);
      return match;
    };
    expect(foe(casting(true)).cast.isCasting).toBe(false);
    expect(foe(casting(false)).cast.isCasting).toBe(true);
  });

  it("Slayer's Spear deep-wounds for 17 s a foe with more Health than its thrower", () => {
    const healthier = arena([SLAYERS]);
    paragon(healthier).health = 500;
    thrown(healthier, 0);
    expect(durationOn(foe(healthier), "deep-wound")).toBe(17);

    const weaker = arena([SLAYERS]);
    foe(weaker).health = 500;
    thrown(weaker, 0);
    expect(foe(weaker).statuses.has("deep-wound")).toBe(false);
  });

  it("Swift Javelin is unblockable only while its thrower is enchanted", () => {
    for (let n = 0; n < 20; n += 1) {
      const match = arena([SWIFT], { seed: `swift-${String(n)}` });
      paragon(match).statuses.apply("guardian", 1000, "p", NO_RANKS);
      foe(match).statuses.apply("guardian", 1000, "foe", NO_RANKS);
      expect(kinds(thrown(match, 0))).not.toContain("attack-blocked");
    }
    onSomeSeed("attack-blocked", (seed) => {
      const match = arena([SWIFT], { seed });
      foe(match).statuses.apply("guardian", 1000, "foe", NO_RANKS);
      return thrown(match, 0);
    });
  });

  it("Chest Thumper deep-wounds a foe with Cracked Armor for 17 s, not one without", () => {
    const cracked = arena([CHEST]);
    foe(cracked).statuses.apply("cracked-armor", 1000, "p", NO_RANKS);
    thrown(cracked, 0);
    expect(durationOn(foe(cracked), "deep-wound")).toBe(17);

    const whole = arena([CHEST]);
    thrown(whole, 0);
    expect(foe(whole).statuses.has("deep-wound")).toBe(false);
  });

  it("Spear Swipe is a thrown spear at touch range that dazes for 9 s", () => {
    expect(skill(SWIPE).range).toBe(RANGE_MELEE);
    const match = arena([SWIPE], { distance: RANGE_MELEE / 2 });
    thrown(match, 0);
    expect(durationOn(foe(match), "dazed")).toBe(9);
  });
});

describe("the #1486 spears read as what they do", () => {
  const text = (id: string): string[] =>
    describeSkill(skill(id), new Map([["paragon.spear-mastery", 12]])).effects.map(
      (effect) => effect.text,
    );

  it("faster flight, a critical-hit rider and a failed-hit rider", () => {
    expect([MIGHTY, SWIFT, VICIOUS, REDEMPTION].map(text)).toEqual([
      ["+34 damage", "Flies ×3 as fast"],
      [
        "+17 damage",
        "If you have an enchantment: cannot be blocked",
        "If you have an enchantment: flies ×2 as fast",
      ],
      [
        "+17 damage",
        "On a critical hit: applies Deep Wound for 13s " +
          "(−20% maximum health (at most 100), −20% healing)",
      ],
      ["+17 damage", "If it fails to hit: lose 1 condition"],
    ]);
  });
});
