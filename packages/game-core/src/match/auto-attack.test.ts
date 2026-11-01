import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { segment, type Segment } from "../geometry.js";
import { createRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { emptyAdrenaline } from "../skills/adrenaline.js";
import { applyEffects } from "../skills/effects.js";
import { chargeAdrenaline, strikesOf, withAttackDuration } from "../skills/testing.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import { tallyCombat, type CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
const ARMOR_OF_EARTH = "elementalist.armor-of-earth";
const SEVER_ARTERY = "warrior.sever-artery";
const BACKBREAKER = "warrior.backbreaker";
const ORISON = "monk.orison-of-healing";

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

/**
 * A swordsman at rank 12 who also knows a little fire, and Sever Artery.
 * Backbreaker, 9 strikes, only so a test can count strikes past Sever
 * Artery's four (#463): a sword cannot use it.
 */
function swordsman(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [FIREBALL, ARMOR_OF_EARTH, SEVER_ARTERY, BACKBREAKER],
    attributeRanks: new Map([
      ["warrior.swordsmanship", 12],
      ["elementalist.fire-magic", 12],
      ["elementalist.earth-magic", 12],
    ]),
    equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** A 60-armor punching bag that does nothing. */
function dummy(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn,
    facing: 0,
  };
}

function sim(...participants: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({ seed: "swing", participants });
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/**
 * How long a Fireball flies over `units`, in whole ticks: it lands this
 * long after its cast resolves (#535).
 */
function fireballFlight(units: number): number {
  const speed = getSkill(FIREBALL)?.projectile?.speed;
  if (speed === undefined) {
    throw new Error("Fireball does not fly");
  }
  return Math.ceil(units / speed / DT) * DT;
}

function swings(log: readonly CombatLogEntry[]): CombatLogEntry[] {
  return log.filter((entry) => entry.cause === "weapon");
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

describe("requestAttack", () => {
  it("refuses anything but a living enemy, and a dead attacker", () => {
    const match = sim(
      swordsman("a", vec2(0, 0)),
      swordsman("ally", vec2(0, 50)),
      dummy("d", vec2(40, 0)),
    );
    expect(match.requestAttack("a", "a")).toEqual({ ok: false, reason: "invalid-target-self" });
    expect(match.requestAttack("a", "ally")).toEqual({ ok: false, reason: "invalid-target-ally" });
    expect(match.requestAttack("a", "nobody")).toEqual({ ok: false, reason: "no-target" });
    expect(match.requestAttack("nobody", "d")).toBeUndefined();
    get(match, "d").combatant.dead = true;
    expect(match.requestAttack("a", "d")).toEqual({ ok: false, reason: "invalid-target-dead" });
    get(match, "d").combatant.dead = false;
    get(match, "a").combatant.dead = true;
    expect(match.requestAttack("a", "d")).toEqual({ ok: false, reason: "caster-dead" });
    expect(get(match, "a").combatant.attack).toBeUndefined();
  });
});

describe("the swing", () => {
  it("a sword at 40 units hits every 1.33 s, for its range at 60 armor", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    expect(match.requestAttack("a", "d")).toEqual({ ok: true });
    const hits = swings(stepFor(match, 14));

    expect(hits).toHaveLength(10);
    const times = hits.map((entry) => entry.atSeconds);
    expect(times[0]).toBeCloseTo(1.35, 6);
    for (let i = 1; i < times.length; i += 1) {
      expect(Math.abs((times[i] ?? 0) - (times[i - 1] ?? 0) - 1.33)).toBeLessThanOrEqual(DT);
    }
    // Remainders carried, not zeroed: ten swings take ten intervals.
    expect((times[9] ?? 0) - (times[0] ?? 0)).toBeCloseTo(9 * 1.33, 1);

    for (const entry of hits) {
      expect(entry).toMatchObject({ sourceId: "a", skillId: undefined, area: undefined });
      // Each blow, then the strike it filled until the bar is full (#1735).
      for (const event of entry.events.filter(({ kind }) => kind !== "adrenaline-gained")) {
        expect(event.kind).toBe("damage");
        if (event.kind === "damage" && event.critical) {
          // A crit (#533): the maximum × √2.
          expect(event.amount).toBe(31);
        } else if (event.kind === "damage") {
          expect(event.amount).toBeGreaterThanOrEqual(15);
          expect(event.amount).toBeLessThanOrEqual(22);
        }
      }
    }
    // A strike per landed swing, each skill capped at its own cost (#463).
    expect(strikesOf(get(match, "a").combatant, SEVER_ARTERY)).toBe(4);
    expect(strikesOf(get(match, "a").combatant, BACKBREAKER)).toBe(9);
  });

  it("walks into reach first; the first hit lands one interval after arriving", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(200, 0)));
    match.requestAttack("a", "d");
    let arrived: number | undefined;
    let firstHit: number | undefined;
    for (let i = 0; i < 100 && firstHit === undefined; i += 1) {
      const result = match.step(DT);
      const near =
        distance(get(match, "a").position, get(match, "d").position) <= WEAPONS.sword.range;
      if (near && arrived === undefined) {
        arrived = result.elapsedSeconds;
      }
      if (swings(result.log).length > 0) {
        firstHit = result.elapsedSeconds;
      }
    }
    expect(arrived).toBeDefined();
    // 160 units at 180/s.
    expect(arrived ?? 0).toBeCloseTo(0.9, 6);
    expect(Math.abs((firstHit ?? 0) - (arrived ?? 0) - 1.33)).toBeLessThanOrEqual(DT);
  });

  it("a direction input cancels it; no direction does not", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(200, 0)));
    match.requestAttack("a", "d");
    match.setInputDirection("a", vec2(0, 0));
    expect(get(match, "a").combatant.attack).toBeDefined();
    stepFor(match, 0.5);
    match.setInputDirection("a", vec2(0, 1));
    expect(get(match, "a").combatant.attack).toBeUndefined();
    match.setInputDirection("a", vec2(0, 0));
    const x = get(match, "a").position.x;
    expect(swings(stepFor(match, 5))).toEqual([]);
    expect(get(match, "a").position.x).toBe(x);
  });

  it("stops when the target dies, and a corpse does not swing", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.requestAttack("a", "d");
    get(match, "d").combatant.health = 1;
    const log = stepFor(match, 3);
    expect(swings(log)).toHaveLength(1);
    expect(swings(log)[0]?.events.map((event) => event.kind)).toEqual([
      "damage",
      "death",
      "adrenaline-gained",
    ]);
    expect(get(match, "a").combatant.attack).toBeUndefined();

    const again = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    again.requestAttack("a", "d");
    get(again, "a").combatant.health = 0;
    get(again, "a").combatant.dead = true;
    expect(swings(stepFor(again, 3))).toEqual([]);
  });

  it("asking again for the same target keeps the swing; a new target restarts it", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)), dummy("e", vec2(0, 40)));
    match.requestAttack("a", "d");
    stepFor(match, 1);
    match.requestAttack("a", "d");
    expect(get(match, "a").combatant.attack?.swingElapsed).toBeCloseTo(1, 6);
    match.requestAttack("a", "e");
    expect(get(match, "a").combatant.attack).toEqual({
      targetId: "e",
      swingElapsed: 0,
      unreachableSeconds: 0,
    });
  });
});

describe("skills and the swing", () => {
  it("a Fireball mid-swing loses the swing; the attack resumes after its aftercast", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.requestAttack("a", "d");
    match.setTarget("a", "d");
    stepFor(match, 1);
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(get(match, "a").combatant.attack?.swingElapsed).toBe(0);

    const log = stepFor(match, 4);
    const fireball = log.find((entry) => entry.cause === "skill");
    const hit = swings(log)[0];
    // Fireball lands 1 s in; no swing while it was cast or in the 0.75 s
    // aftercast (#317), then a full one.
    expect(fireball?.atSeconds).toBeCloseTo(2, 6);
    const aftercastEnds = 2 + RULES.combat.aftercastSeconds;
    expect(Math.abs((hit?.atSeconds ?? 0) - aftercastEnds - 1.33)).toBeLessThanOrEqual(DT);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
  });

  it("a self-enchant keeps the attack target", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.requestAttack("a", "d");
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: true });
    stepFor(match, 1);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
  });

  it("a spell at another enemy leaves the attack on the first, and the target on them (#317)", () => {
    const match = sim(
      swordsman("a", vec2(0, 0)),
      dummy("d", vec2(40, 0)),
      dummy("e", vec2(0, 300)),
    );
    match.requestAttack("a", "d");
    match.setTarget("a", "e");
    match.requestSkill("a", 0);
    const log = stepFor(match, 1 + RULES.combat.aftercastSeconds + 1.5);

    // The Fireball's release carries only the use; its landing hits e (#535).
    const [released, landed] = log.filter((entry) => entry.cause === "skill");
    expect(released?.events.map((event) => event.kind)).toEqual(["skill-used"]);
    expect(landed?.events[0]?.targetId).toBe("e");
    expect(swings(log)[0]?.events[0]?.targetId).toBe("d");
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
    expect(get(match, "a").targetId).toBe("e");
  });

  it("a spell at an enemy starts no attack (#317)", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    stepFor(match, 1 + RULES.combat.aftercastSeconds + 1);
    expect(get(match, "a").combatant.attack).toBeUndefined();
    expect(get(match, "a").position).toEqual(vec2(0, 0));
  });

  it("an attack skill at an enemy starts an attack on them, and swings follow", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.setTarget("a", "d");
    chargeAdrenaline(get(match, "a").combatant);
    expect(match.requestSkill("a", 2)?.check).toEqual({ ok: true });
    const log = stepFor(match, 3);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
    expect(swings(log).length).toBeGreaterThan(0);
  });

  it("an interrupted cast at an enemy starts nothing, and resumes the attack in progress", () => {
    const match = sim(
      swordsman("a", vec2(0, 0)),
      dummy("d", vec2(40, 0)),
      dummy("e", vec2(0, 300)),
    );
    match.setTarget("a", "e");
    match.requestSkill("a", 0);
    get(match, "a").combatant.cast.cancelCast();
    stepFor(match, 1.1);
    expect(get(match, "a").combatant.attack).toBeUndefined();

    match.requestAttack("a", "d");
    match.requestSkill("a", 0);
    get(match, "a").combatant.cast.cancelCast();
    stepFor(match, 1.1);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
  });
});

describe("moving", () => {
  it("an attack asked for mid-walk is dropped, and never doubles the walking speed", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(0, 300)));
    match.setInputDirection("a", vec2(1, 0));
    expect(match.requestAttack("a", "d")).toEqual({ ok: true });
    const step = RULES.movement.maxSpeedUnitsPerSecond * DT;
    for (let i = 0; i < 20; i += 1) {
      const before = get(match, "a").position;
      match.step(DT);
      const after = get(match, "a").position;
      expect(distance(before, after)).toBeCloseTo(step, 9);
      expect(after.y).toBe(0);
    }
    expect(get(match, "a").combatant.attack).toBeUndefined();
  });
});

describe("adrenaline (#463)", () => {
  it("a landed swing gives every adrenaline skill one strike", () => {
    const hit = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    hit.requestAttack("a", "d");
    stepFor(hit, 1.4);
    expect(strikesOf(get(hit, "a").combatant, SEVER_ARTERY)).toBe(1);
    expect(strikesOf(get(hit, "a").combatant, BACKBREAKER)).toBe(1);
  });

  it("an attack skill pays at once, draining a strike from the others, and its blow refills it", () => {
    const chop = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    chop.setTarget("a", "d");
    const caster = get(chop, "a").combatant;
    chargeAdrenaline(caster);
    expect(chop.requestSkill("a", 2)?.check).toEqual({ ok: true });
    stepFor(chop, DT);
    expect(strikesOf(caster, SEVER_ARTERY)).toBe(0);
    expect(strikesOf(caster, BACKBREAKER)).toBe(8);
    stepFor(chop, 0.7);
    expect(strikesOf(caster, SEVER_ARTERY)).toBe(1);
    expect(strikesOf(caster, BACKBREAKER)).toBe(9);
  });

  it("a damaging spell gives none (Q19)", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    // Its 1 s cast, then its flight to d (#535).
    const log = stepFor(match, 1.1 + fireballFlight(300));
    expect(
      log.some((entry) => entry.cause === "skill" && entry.events.some((e) => e.kind === "damage")),
    ).toBe(true);
    expect(strikesOf(get(match, "a").combatant, SEVER_ARTERY)).toBe(0);
    expect(strikesOf(get(match, "a").combatant, BACKBREAKER)).toBe(0);
  });

  it("a cleave that damages three foes is one blow: one strike", () => {
    const match = sim(
      {
        ...swordsman("a", vec2(0, 0)),
        equipment: wielding(WEAPONS.scythe, "dervish.scythe-mastery"),
      },
      dummy("d", vec2(40, 0)),
      dummy("e", vec2(45, 20)),
      dummy("f", vec2(45, -20)),
    );
    match.requestAttack("a", "d");
    const [swing] = swings(stepFor(match, 1.9));
    const struck = new Set(
      (swing?.events ?? []).flatMap((event) => (event.kind === "damage" ? [event.targetId] : [])),
    );
    expect(struck).toEqual(new Set(["d", "e", "f"]));
    expect(strikesOf(get(match, "a").combatant, BACKBREAKER)).toBe(1);
  });

  it("death empties every adrenaline skill", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    const caster = get(match, "a").combatant;
    chargeAdrenaline(caster);
    caster.statuses.apply("burning", 10, "d", NO_RANKS);
    caster.health = 0.2;
    stepFor(match, DT);
    expect(caster.dead).toBe(true);
    expect(strikesOf(caster, SEVER_ARTERY)).toBe(0);
    expect(strikesOf(caster, BACKBREAKER)).toBe(0);
  });
});

describe("adrenaline from damage taken (#827)", () => {
  /** A swordsman of the other team, with `maxHealth`, who only stands and takes it. */
  function victim(maxHealth: number): ParticipantSpec {
    return { ...swordsman("v", vec2(40, 0)), team: 1, maxHealth };
  }

  /** The damage of `a`'s first landed swing on `v`, and `v`'s units in each skill after it. */
  function firstBlow(maxHealth: number): { amount: number; units: number; severArtery: number } {
    const match = sim(swordsman("a", vec2(0, 0)), victim(maxHealth));
    match.requestAttack("a", "v");
    for (let i = 0; i < 200; i += 1) {
      for (const entry of swings(match.step(DT).log)) {
        for (const event of entry.events) {
          if (event.kind === "damage") {
            return {
              amount: event.amount,
              units: get(match, "v").combatant.adrenaline.get(BACKBREAKER) ?? 0,
              severArtery: get(match, "v").combatant.adrenaline.get(SEVER_ARTERY) ?? 0,
            };
          }
        }
      }
    }
    throw new Error("no blow landed in 10 s");
  }

  it("a hit for a quarter of max health is one strike on every skill; a hair less, 24 units", () => {
    // The same seed swings the same first blow, whatever the victim's health.
    const { amount } = firstBlow(1e6);
    expect(firstBlow(4 * amount)).toMatchObject({
      units: ADRENALINE_PER_STRIKE,
      severArtery: ADRENALINE_PER_STRIKE,
    });
    expect(firstBlow((4 * amount * 120) / 119).units).toBe(24);
  });

  it("a lethal blow gives nothing: death leaves the pools empty", () => {
    const { amount } = firstBlow(1e6);
    const match = sim(swordsman("a", vec2(0, 0)), victim(amount));
    const taker = get(match, "v").combatant;
    match.requestAttack("a", "v");
    stepFor(match, 1.4);
    expect(taker.dead).toBe(true);
    expect(strikesOf(taker, BACKBREAKER)).toBe(0);
  });

  it("a bleeding tick gains nothing", () => {
    const match = sim(swordsman("a", vec2(0, 0)), victim(480));
    const taker = get(match, "v").combatant;
    taker.statuses.apply("bleeding", 10, "a", NO_RANKS);
    const log = stepFor(match, 3);
    expect(log.some((entry) => entry.events.some((event) => event.kind === "damage"))).toBe(true);
    expect(taker.health).toBeLessThan(480);
    expect(strikesOf(taker, BACKBREAKER)).toBe(0);
    expect(strikesOf(taker, SEVER_ARTERY)).toBe(0);
  });
});

describe("adrenaline is lost out of combat (#828)", () => {
  const LOSS = RULES.resources.adrenalineLossSeconds;

  /** `a`, charged at 0 s, beside a dummy; `a` takes `fields`. */
  function charged(
    fields: Partial<ParticipantSpec> = {},
    ...extra: ParticipantSpec[]
  ): MatchSimulation {
    const match = new MatchSimulation({
      seed: "swing",
      matchRules: {
        victory: "kill-count",
        scoreToWin: 99,
        timeLimitSeconds: 600,
        deathRule: "respawn",
        respawnSeconds: 8,
        deathPenalty: false,
      },
      participants: [
        {
          ...swordsman("a", vec2(0, 0)),
          skillBar: [FIREBALL, ARMOR_OF_EARTH, SEVER_ARTERY, BACKBREAKER, ORISON],
          attributeRanks: new Map([
            ["warrior.swordsmanship", 12],
            ["elementalist.earth-magic", 12],
            ["monk.healing-prayers", 12],
          ]),
          ...fields,
        },
        dummy("d", vec2(40, 0)),
        ...extra,
      ],
    });
    chargeAdrenaline(get(match, "a").combatant);
    return match;
  }

  it("goes at 25 s out of combat, not at 24.9 s", () => {
    const match = charged();
    const caster = get(match, "a").combatant;
    stepFor(match, LOSS - 0.1);
    expect(strikesOf(caster, BACKBREAKER)).toBe(9);
    stepFor(match, 0.1);
    expect(strikesOf(caster, BACKBREAKER)).toBe(0);
    expect(strikesOf(caster, SEVER_ARTERY)).toBe(0);
  });

  it("a heal and a spell do not keep it", () => {
    const match = charged();
    const caster = get(match, "a").combatant;
    stepFor(match, 20);
    caster.health -= 100;
    expect(match.requestSkill("a", 4)?.check).toEqual({ ok: true });
    stepFor(match, 2);
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: true });
    stepFor(match, LOSS - 22 - 0.1);
    expect(caster.lastCombatAt).toBe(0);
    expect(strikesOf(caster, BACKBREAKER)).toBe(9);
    stepFor(match, 0.1);
    expect(strikesOf(caster, BACKBREAKER)).toBe(0);
  });

  it("a blow started keeps it, even one that is blocked and earns nothing", () => {
    const match = charged();
    get(match, "d").combatant.statuses.apply("guardian", 1e6, "monk", NO_RANKS);
    stepFor(match, 20);
    match.requestAttack("a", "d");
    for (let i = 0; i < 2000; i += 1) {
      const [swing] = swings(match.step(DT).log);
      if (swing?.events.every((event) => event.kind === "attack-blocked") === true) {
        expect(get(match, "a").combatant.lastCombatAt).toBe(match.elapsedSeconds);
        return;
      }
    }
    throw new Error("no blocked swing in 100 s");
  });

  it("a foe's blow keeps it, even a hit for 0, which logs no damage", () => {
    // Armor no blow gets through.
    const match = charged(
      { equipment: unarmedResolvedEquipment(1e6) },
      { ...swordsman("f", vec2(-40, 0)), team: 1 },
    );
    const caster = get(match, "a").combatant;
    stepFor(match, 20);
    match.requestAttack("f", "a");
    const [swing] = swings(stepFor(match, 2));
    expect(swing).toMatchObject({ sourceId: "f", events: [] });
    stepFor(match, LOSS - 22 + 1);
    expect(strikesOf(caster, BACKBREAKER)).toBe(9);
  });

  it("a respawn starts the window again", () => {
    const match = charged();
    const caster = get(match, "a").combatant;
    stepFor(match, 10);
    caster.statuses.apply("burning", 10, "d", NO_RANKS);
    caster.health = 0.2;
    stepFor(match, DT);
    expect(caster.dead).toBe(true);
    stepFor(match, 8 + DT);
    expect(caster.dead).toBe(false);
    chargeAdrenaline(caster);
    stepFor(match, LOSS - 1);
    expect(strikesOf(caster, BACKBREAKER)).toBe(9);
  });
});

describe("block (#534)", () => {
  /** `defender` under a Guardian that outlasts the test. */
  function guarded(match: MatchSimulation, defender: string): void {
    get(match, defender).combatant.statuses.apply("guardian", 1e6, "monk", NO_RANKS);
  }

  /** What landed, less the adrenaline it filled (#1735): these read the bar itself. */
  function kinds(entries: readonly CombatLogEntry[]): string[] {
    return entries
      .flatMap((entry) => entry.events.map((event) => event.kind))
      .filter((kind) => kind !== "adrenaline-gained");
  }

  it("a blocked swing deals nothing and earns no adrenaline; a landed one still earns a strike", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    guarded(match, "d");
    match.requestAttack("a", "d");
    const seen = kinds(swings(stepFor(match, 7)));
    const landed = seen.filter((kind) => kind === "damage").length;
    const blocked = seen.filter((kind) => kind === "attack-blocked").length;
    expect(landed + blocked).toBe(seen.length);
    expect(landed).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThan(0);
    expect(strikesOf(get(match, "a").combatant, BACKBREAKER)).toBe(Math.min(9, landed));
  });

  it("a double strike with one blow blocked and one landed earns adrenaline for the landed one", () => {
    const always: Weapon = {
      ...WEAPONS.daggers,
      doubleStrike: { attributeId: "assassin.dagger-mastery", baseChance: 1, perRank: 0 },
    };
    const match = sim(
      { ...swordsman("a", vec2(0, 0)), equipment: wielding(always, "assassin.dagger-mastery") },
      dummy("d", vec2(40, 0)),
    );
    guarded(match, "d");
    match.requestAttack("a", "d");
    // Every swing until one is half blocked: at 50% a blow, one comes soon.
    for (let i = 0; i < 2000; i += 1) {
      emptyAdrenaline(get(match, "a").combatant);
      const seen = kinds(swings(match.step(DT).log)).sort();
      if (seen.length === 2 && seen[0] === "attack-blocked" && seen[1] === "damage") {
        expect(strikesOf(get(match, "a").combatant, BACKBREAKER)).toBe(1);
        return;
      }
    }
    throw new Error("no half-blocked double strike in 100 s");
  });

  it("an arrow rolls its block on landing", () => {
    const archer: ParticipantSpec = {
      ...swordsman("a", vec2(0, 0)),
      attributeRanks: new Map([["ranger.marksmanship", 12]]),
      equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    };
    const match = sim(archer, dummy("d", vec2(300, 0)));
    guarded(match, "d");
    match.requestAttack("a", "d");
    const seen = kinds(swings(stepFor(match, 20)));
    expect(seen).toContain("attack-blocked");
    expect(seen).toContain("damage");
  });

  it("Swift Chop, blocked: cost and recharge spent, its flat damage and Deep Wound, no adrenaline", () => {
    const axeman: ParticipantSpec = {
      ...swordsman("a", vec2(0, 0)),
      skillBar: ["warrior.swift-chop", BACKBREAKER],
      attributeRanks: new Map([["warrior.axe-mastery", 12]]),
      equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
    };
    // The first seed whose chop is blocked.
    for (let seed = 0; seed < 20; seed += 1) {
      const match = new MatchSimulation({
        seed: `block-${String(seed)}`,
        participants: [axeman, dummy("d", vec2(40, 0))],
      });
      guarded(match, "d");
      match.setTarget("a", "d");
      const energy = get(match, "a").combatant.energy;
      expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
      const chop = stepFor(match, 0.7).filter((entry) => entry.skillId === "warrior.swift-chop");
      expect(chop).toHaveLength(1);
      if (!kinds(chop).includes("attack-blocked")) {
        continue;
      }
      // Then the health deep wound takes as it lands (#764, #800).
      expect(kinds(chop)).toEqual([
        "skill-used",
        "attack-blocked",
        "damage",
        "status-applied",
        "health-lost",
      ]);
      expect(get(match, "d").combatant.statuses.has("deep-wound")).toBe(true);
      const caster = get(match, "a").combatant;
      expect(caster.energy).toBeLessThan(energy);
      expect(caster.cast.rechargeRemaining.has("warrior.swift-chop")).toBe(true);
      expect(strikesOf(caster, BACKBREAKER)).toBe(0);
      return;
    }
    throw new Error("no seed blocked the chop");
  });

  it("a spell is never blocked", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    guarded(match, "d");
    match.setTarget("a", "d");
    const fireballs: CombatLogEntry[] = [];
    for (let cast = 0; cast < 5; cast += 1) {
      expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
      fireballs.push(...stepFor(match, 9).filter((entry) => entry.skillId === FIREBALL));
    }
    // Each cast is two entries: its release, then its landing (#535).
    expect(fireballs).toHaveLength(10);
    expect(kinds(fireballs).filter((kind) => kind === "damage")).toHaveLength(5);
    expect(kinds(fireballs)).not.toContain("attack-blocked");
  });
});

describe("the log", () => {
  it("a double strike is one entry with two hits, both credited to the attacker", () => {
    const always: Weapon = {
      ...WEAPONS.daggers,
      doubleStrike: { attributeId: "assassin.dagger-mastery", baseChance: 1, perRank: 0 },
    };
    const match = sim(
      { ...swordsman("a", vec2(0, 0)), equipment: wielding(always, "assassin.dagger-mastery") },
      dummy("d", vec2(40, 0)),
    );
    match.requestAttack("a", "d");
    const [entry] = swings(stepFor(match, 1.4));
    // Two blows, then the two strikes they filled (#1735).
    expect(entry?.events.map((event) => event.kind)).toEqual([
      "damage",
      "damage",
      "adrenaline-gained",
    ]);
    expect(entry?.doubleStrike).toBe(true);
    const total = (entry?.events ?? []).reduce(
      (sum, event) => sum + (event.kind === "damage" ? event.amount : 0),
      0,
    );
    expect(tallyCombat(entry === undefined ? [] : [entry]).damageByActor.get("a")).toBe(total);
    // Two blows, each landed: a strike each (#463).
    expect(strikesOf(get(match, "a").combatant, BACKBREAKER)).toBe(2);
  });

  it("says which swings struck twice; an attack skill never does (#561, ADR-0029)", () => {
    // A sword that always strikes twice, so Sever Artery can ride it.
    const always: Weapon = {
      ...WEAPONS.sword,
      doubleStrike: { attributeId: "warrior.swordsmanship", baseChance: 1, perRank: 0 },
    };
    const match = sim(
      { ...swordsman("a", vec2(0, 0)), equipment: wielding(always, "warrior.swordsmanship") },
      dummy("d", vec2(40, 0)),
    );
    match.setTarget("a", "d");
    chargeAdrenaline(get(match, "a").combatant);
    expect(match.requestSkill("a", 2)?.check).toEqual({ ok: true });
    const log = stepFor(match, 3);
    const cut = log.filter((entry) => entry.skillId === SEVER_ARTERY);
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.every((entry) => !entry.doubleStrike)).toBe(true);
    expect(swings(log).length).toBeGreaterThan(0);
    expect(swings(log).every((entry) => entry.doubleStrike)).toBe(true);

    const single = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    single.requestAttack("a", "d");
    const plain = swings(stepFor(single, 3));
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((entry) => !entry.doubleStrike)).toBe(true);
  });

  it("two runs from one seed write the same log", () => {
    const run = (): CombatLogEntry[] => {
      const match = sim(
        {
          ...swordsman("a", vec2(0, 0)),
          equipment: wielding(WEAPONS.scythe, "dervish.scythe-mastery"),
        },
        dummy("d", vec2(200, 0)),
        dummy("e", vec2(220, 20)),
        dummy("f", vec2(220, -20)),
      );
      get(match, "a").combatant.statuses.apply("blind", 5, "d", NO_RANKS);
      match.requestAttack("a", "d");
      return stepFor(match, 20);
    };
    const first = run();
    expect(swings(first).length).toBeGreaterThan(5);
    expect(run()).toEqual(first);
  });
});

describe("the approach on Arena Alpha (#211)", () => {
  /** A rectangle's four sides, as a map's rect wall becomes. */
  function rect(x: number, y: number, width: number, height: number): Segment[] {
    const a = vec2(x, y);
    const b = vec2(x + width, y);
    const c = vec2(x + width, y + height);
    const d = vec2(x, y + height);
    return [segment(a, b), segment(b, c), segment(c, d), segment(d, a)];
  }

  /** Arena Alpha's three walls (packages/game-maps/maps/arena-alpha). */
  const WALLS = [...rect(440, 0, 24, 260), ...rect(440, 380, 24, 260), ...rect(300, 300, 120, 24)];

  function arena(walls: readonly Segment[], ...participants: ParticipantSpec[]): MatchSimulation {
    return new MatchSimulation({
      seed: "arena",
      walls,
      bounds: { width: 960, height: 640 },
      participants,
    });
  }

  function archer(id: string, spawn: Vec2): ParticipantSpec {
    return {
      ...swordsman(id, spawn),
      skillBar: [],
      attributeRanks: new Map([["ranger.marksmanship", 12]]),
      equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    };
  }

  it("walks a sword from one spawn round the walls to the other, and hits", () => {
    const match = arena(WALLS, swordsman("a", vec2(80, 320)), dummy("d", vec2(880, 320)));
    match.requestAttack("a", "d");

    // The shortest way round, by hand (pathing.test.ts), at full speed.
    const pathLength = Math.hypot(205, 19) + 150 + Math.hypot(445, 19);
    const allowed = pathLength / RULES.movement.maxSpeedUnitsPerSecond + 1;
    let seconds = 0;
    while (distance(get(match, "a").position, vec2(880, 320)) > WEAPONS.sword.range) {
      match.step(DT);
      seconds += DT;
      expect(seconds).toBeLessThanOrEqual(allowed);
    }
    const hits = swings(stepFor(match, WEAPONS.sword.attackIntervalSeconds * 2 + DT));
    expect(hits.some((entry) => entry.events.some((event) => event.kind === "damage"))).toBe(true);
  });

  it("walks a bow out from behind the central wall until it sees, then shoots", () => {
    // In range already, but the wall is in the way.
    const match = arena(WALLS, archer("a", vec2(400, 150)), dummy("d", vec2(520, 150)));
    match.requestAttack("a", "d");

    const log = stepFor(match, 6);
    const kinds = swings(log).flatMap((entry) => entry.events.map((event) => event.kind));
    expect(kinds).not.toContain("attack-obstructed");
    expect(kinds).toContain("damage");
    expect(get(match, "a").position).not.toEqual(vec2(400, 150));
  });

  it("gives up on a target walled in, once, and says so", () => {
    const boxed = [...WALLS, ...rect(600, 400, 120, 120)];
    const match = arena(boxed, swordsman("a", vec2(80, 320)), dummy("d", vec2(660, 460)));
    match.requestAttack("a", "d");

    const log = stepFor(match, 2);
    const unreachable = swings(log).filter((entry) =>
      entry.events.some((event) => event.kind === "attack-unreachable"),
    );
    expect(unreachable).toHaveLength(1);
    // Not on the first failing tick: it has to last (#218).
    expect(unreachable[0]?.atSeconds).toBeCloseTo(RULES.combat.unreachableAfterSeconds, 5);
    expect(get(match, "a").combatant.attack).toBeUndefined();
  });

  it("walks out of a notch it was squeezed into, rather than giving up (#218)", () => {
    // Two walls meeting at 60 degrees, opening to the left, and the
    // attacker pressed 20 units into the apex: 10 from each wall, well
    // inside its 14 of clearance, so no path leaves from where it stands.
    const apex = vec2(300, 300);
    const arm = 200;
    const notch = [
      segment(apex, vec2(300 - arm * Math.cos(Math.PI / 6), 300 - arm * Math.sin(Math.PI / 6))),
      segment(apex, vec2(300 - arm * Math.cos(Math.PI / 6), 300 + arm * Math.sin(Math.PI / 6))),
    ];
    const match = new MatchSimulation({
      seed: "notch",
      walls: notch,
      participants: [swordsman("a", vec2(280, 300)), dummy("d", vec2(100, 300))],
    });
    match.requestAttack("a", "d");

    const log = stepFor(match, 2);
    expect(
      swings(log).some((entry) =>
        entry.events.some((event) => event.kind === "attack-unreachable"),
      ),
    ).toBe(false);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
    expect(distance(get(match, "a").position, vec2(100, 300))).toBeLessThanOrEqual(
      WEAPONS.sword.range,
    );
  });
});

describe("the auto-attack behaviour (#162)", () => {
  it("attacks the nearest enemy, and asks again once its target is back", () => {
    const attacker: ParticipantSpec = {
      ...swordsman("bot", vec2(0, 0)),
      team: 1,
      behaviour: { kind: "auto-attack", targeting: { kind: "nearest-enemy" }, reach: undefined },
    };
    const victim: ParticipantSpec = {
      ...dummy("v", vec2(30, 0)),
      team: 0,
      reset: { kind: "on-death", afterSeconds: 1 },
    };
    const match = sim(attacker, victim);
    match.step(DT);
    expect(get(match, "bot").combatant.attack?.targetId).toBe("v");

    // Dead: the attack drops. Back: the behaviour attacks again, unasked.
    get(match, "v").combatant.health = 0;
    get(match, "v").combatant.dead = true;
    match.step(DT);
    expect(get(match, "bot").combatant.attack).toBeUndefined();
    stepFor(match, 1.5);
    expect(get(match, "v").combatant.dead).toBe(false);
    expect(get(match, "bot").combatant.attack?.targetId).toBe("v");
  });
});

describe("the approach round bodies (#277)", () => {
  function unreachable(log: readonly CombatLogEntry[]): CombatLogEntry[] {
    return swings(log).filter((entry) =>
      entry.events.some((event) => event.kind === "attack-unreachable"),
    );
  }

  it("steers round a body between it and its target, and hits", () => {
    // Weapon DPS as it stands: the spawn, the melee dummy just in front,
    // and the bow-range dummy behind it on the same line (#277's repro).
    const match = sim(
      swordsman("a", vec2(100, 210)),
      dummy("melee", vec2(136, 210)),
      dummy("ranged", vec2(480, 210)),
    );
    match.requestAttack("a", "ranged");

    const log = stepFor(match, 5);
    expect(unreachable(log)).toEqual([]);
    expect(distance(get(match, "a").position, vec2(480, 210))).toBeLessThanOrEqual(
      WEAPONS.sword.range,
    );
    const hits = swings(log).filter((entry) => entry.events.some((e) => e.kind === "damage"));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((entry) => entry.events.some((e) => e.targetId === "ranged"))).toBe(true);
  });

  it("gives up, once, when bodies box it in and it cannot move", () => {
    // Six bodies round it, each touching the next: there is a path, and
    // no way along it.
    const ring = [0, 1, 2, 3, 4, 5].map((k) =>
      dummy(
        `r${String(k)}`,
        vec2(200 + 28 * Math.cos((k * Math.PI) / 3), 200 + 28 * Math.sin((k * Math.PI) / 3)),
      ),
    );
    const match = sim(swordsman("a", vec2(200, 200)), ...ring, dummy("d", vec2(500, 200)));
    match.requestAttack("a", "d");

    const log = stepFor(match, 2);
    const ended = unreachable(log);
    expect(ended).toHaveLength(1);
    // Half a second of no progress (#218). Since #291 refuses a move deeper
    // into a body there is no jostling first, so it can land on 0.5 s exactly.
    const at = ended[0]?.atSeconds ?? 0;
    expect(at).toBeGreaterThanOrEqual(RULES.combat.unreachableAfterSeconds - 1e-9);
    expect(at).toBeLessThanOrEqual(RULES.combat.unreachableAfterSeconds + 3 * DT + 1e-9);
    expect(get(match, "a").combatant.attack).toBeUndefined();
  });

  it("is held, not lost, when it cannot move at all", () => {
    // No speed: every step asks for nothing, so no step is a stall.
    const still = { ...RULES, movement: { ...RULES.movement, maxSpeedUnitsPerSecond: 0 } };
    const match = new MatchSimulation({
      seed: "held",
      ruleset: still,
      participants: [swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0))],
    });
    match.requestAttack("a", "d");

    const log = stepFor(match, 3);
    expect(unreachable(log)).toEqual([]);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
  });
});

describe("aftercast (#317)", () => {
  const AFTERCAST = RULES.combat.aftercastSeconds;

  it("attacking, a cast at the foe: no swing in the cast or the aftercast, then one full interval", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.requestAttack("a", "d");
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    const log = stepFor(match, 1 + AFTERCAST + 2);

    const first = swings(log)[0]?.atSeconds ?? 0;
    expect(first).toBeGreaterThan(1 + AFTERCAST);
    expect(
      Math.abs(first - (1 + AFTERCAST) - WEAPONS.sword.attackIntervalSeconds),
    ).toBeLessThanOrEqual(DT);
  });

  it("an attack skill has its own instead: the recovery from its blow, as long as the wind-up", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.setTarget("a", "d");
    chargeAdrenaline(get(match, "a").combatant);
    match.requestSkill("a", 2);
    const hitTicks = Math.ceil(WEAPONS.sword.attackIntervalSeconds / 2 / DT);
    stepFor(match, hitTicks * DT);
    expect(get(match, "a").combatant.cast.inAftercast).toBe(true);
    stepFor(match, (hitTicks - 1) * DT);
    expect(get(match, "a").combatant.cast.inAftercast).toBe(true);
    match.step(DT);
    expect(get(match, "a").combatant.cast.inAftercast).toBe(false);
    expect(match.requestSkill("a", 1)).toEqual({ skillId: ARMOR_OF_EARTH, check: { ok: true } });
  });

  it("a cancelled or interrupted cast has none", () => {
    const moved = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    moved.setTarget("a", "d");
    moved.requestSkill("a", 0);
    stepFor(moved, 0.5);
    moved.setInputDirection("a", vec2(0, 1));
    moved.step(DT);
    expect(get(moved, "a").combatant.cast.inAftercast).toBe(false);

    const cut = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    cut.setTarget("a", "d");
    cut.requestSkill("a", 0);
    get(cut, "a").combatant.cast.cancelCast();
    stepFor(cut, 1.1);
    expect(get(cut, "a").combatant.cast.inAftercast).toBe(false);
  });

  it("holds a walking hero still, who walks the first tick after it ends", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    expect(get(match, "a").combatant.cast.inAftercast).toBe(true);
    match.setInputDirection("a", vec2(0, 1));

    let ticks = 0;
    while (get(match, "a").combatant.cast.inAftercast) {
      match.step(DT);
      ticks += 1;
      expect(get(match, "a").position).toEqual(vec2(0, 0));
    }
    expect(ticks * DT).toBeCloseTo(AFTERCAST, 6);
    // Armor of Earth's own slow still applies; the body moves, that is all.
    match.step(DT);
    expect(get(match, "a").position.y).toBeGreaterThan(0);
  });

  it("a skill with an activation time pressed in it is queued, and starts the tick it ends", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    const energy = get(match, "a").combatant.energy;
    expect(match.requestSkill("a", 0)).toEqual({
      skillId: FIREBALL,
      check: { ok: true },
      queued: true,
    });
    // Nothing paid, nothing cast, until the aftercast ends.
    expect(get(match, "a").combatant.energy).toBe(energy);

    let ticks = 0;
    while (get(match, "a").combatant.cast.inAftercast) {
      expect(get(match, "a").combatant.cast.isCasting).toBe(false);
      match.step(DT);
      ticks += 1;
    }
    expect(ticks * DT).toBeCloseTo(AFTERCAST, 6);
    expect(get(match, "a").combatant.cast.activeCast).toMatchObject({
      skillId: FIREBALL,
      remainingSeconds: 1,
    });
    const log = stepFor(match, 1);
    expect(log.map((entry) => entry.skillId)).toEqual([FIREBALL]);
  });

  it("a second press replaces the queued skill", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    stepFor(match, 1);
    match.requestSkill("a", 0);
    match.requestSkill("a", 1);
    expect(get(match, "a").combatant.cast.queuedSlot).toBe(1);
    stepFor(match, AFTERCAST);
    expect(get(match, "a").combatant.cast.activeCast?.skillId).toBe(ARMOR_OF_EARTH);
  });

  it("an attack skill pressed in it waits for it, as it winds up like a cast (ADR-0029)", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    chargeAdrenaline(get(match, "a").combatant);
    expect(match.requestSkill("a", 2)).toEqual({
      skillId: SEVER_ARTERY,
      check: { ok: true },
      queued: true,
    });
    stepFor(match, AFTERCAST);
    expect(get(match, "a").combatant.cast.activeCast?.skillId).toBe(SEVER_ARTERY);
  });

  it("a skill that could not go off is refused at the press, not queued", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    get(match, "a").combatant.energy = 0;
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: false, reason: "insufficient-energy" });
    expect(get(match, "a").combatant.cast.queuedSlot).toBeUndefined();
  });

  it("a move drops the queue, and walks when the aftercast ends", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    match.requestSkill("a", 0);
    match.setInputDirection("a", vec2(0, 1));
    expect(get(match, "a").combatant.cast.queuedSlot).toBeUndefined();
    stepFor(match, AFTERCAST + DT);
    expect(get(match, "a").combatant.cast.isCasting).toBe(false);
    expect(get(match, "a").position.y).toBeGreaterThan(0);
  });

  it("holds a click-to-walk too, drops the queue, and walks when it ends", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    match.requestSkill("a", 0);
    match.walkTo("a", vec2(0, 100));
    expect(get(match, "a").combatant.cast.queuedSlot).toBeUndefined();
    while (get(match, "a").combatant.cast.inAftercast) {
      match.step(DT);
      expect(get(match, "a").position).toEqual(vec2(0, 0));
    }
    match.step(DT);
    expect(get(match, "a").combatant.cast.isCasting).toBe(false);
    expect(get(match, "a").position.y).toBeGreaterThan(0);
  });

  it("Cancel Action drops the queue", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    match.requestSkill("a", 0);
    match.cancelAction("a");
    stepFor(match, AFTERCAST + DT);
    expect(get(match, "a").combatant.cast.isCasting).toBe(false);
  });
});

describe("the skill queue during an activation (#1722)", () => {
  const AFTERCAST = RULES.combat.aftercastSeconds;

  /** `a` casting Fireball at `d`, `seconds` into its 1 s activation. */
  function casting(seconds: number, foe: Vec2 = vec2(300, 0)): MatchSimulation {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", foe));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    stepFor(match, seconds);
    expect(get(match, "a").combatant.cast.activeCast?.skillId).toBe(FIREBALL);
    return match;
  }

  /** Step until `a`'s queued skill is requested; the seconds it took. */
  function untilTaken(match: MatchSimulation): number {
    let ticks = 0;
    while (get(match, "a").combatant.cast.queuedSlot !== undefined) {
      match.step(DT);
      ticks += 1;
    }
    return ticks * DT;
  }

  it("a press is queued, paid for nothing, and goes off when the cast and its aftercast end", () => {
    const match = casting(0.5);
    const energy = get(match, "a").combatant.energy;
    expect(match.requestSkill("a", 1)).toEqual({
      skillId: ARMOR_OF_EARTH,
      check: { ok: true },
      queued: true,
    });
    expect(get(match, "a").combatant.energy).toBe(energy);
    expect(get(match, "a").combatant.cast.queuedSlot).toBe(1);

    // Fireball's last half second, then its aftercast; the tick it ends,
    // Armor of Earth begins.
    expect(untilTaken(match)).toBeCloseTo(0.5 + AFTERCAST, 6);
    expect(get(match, "a").combatant.cast.activeCast?.skillId).toBe(ARMOR_OF_EARTH);
    expect(get(match, "a").combatant.cast.queuedSlot).toBeUndefined();
    expect(get(match, "a").combatant.energy).toBeLessThan(energy);
  });

  it("the casting slot pressed again leaves the queue alone, however often (#1733)", () => {
    const match = casting(0.5);
    match.requestSkill("a", 1);
    for (let i = 0; i < 5; i += 1) {
      expect(match.requestSkill("a", 0)).toEqual({ skillId: FIREBALL, check: { ok: true } });
    }
    expect(get(match, "a").combatant.cast.queuedSlot).toBe(1);
    untilTaken(match);
    expect(get(match, "a").combatant.cast.activeCast?.skillId).toBe(ARMOR_OF_EARTH);
  });

  it("the casting slot pressed again with nothing queued queues nothing (#1733)", () => {
    const match = casting(0.5);
    expect(match.requestSkill("a", 0)).toEqual({ skillId: FIREBALL, check: { ok: true } });
    expect(get(match, "a").combatant.cast.queuedSlot).toBeUndefined();
    // Once the cast is over, a press is used as any other: still recharging.
    stepFor(match, 0.5);
    expect(get(match, "a").combatant.cast.isCasting).toBe(false);
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: false, reason: "still-recharging" });
  });

  it("a press refused for anything but range or sight is refused now, not queued", () => {
    const match = casting(0.5);
    get(match, "a").combatant.cast.startRecharge(ARMOR_OF_EARTH, 10);
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: false, reason: "still-recharging" });
    expect(get(match, "a").combatant.cast.queuedSlot).toBeUndefined();
  });

  it("an interrupt un-queues it", () => {
    const match = casting(0.5);
    match.requestSkill("a", 1);
    applyEffects([{ kind: "interrupt" }], {
      surroundings: new Map(),
      caster: get(match, "d").combatant,
      target: get(match, "a").combatant,
      rng: createRng(1),
      rules: RULES.combat,
    });
    expect(get(match, "a").combatant.cast.queuedSlot).toBeUndefined();
    stepFor(match, 2);
    expect(get(match, "a").combatant.cast.isCasting).toBe(false);
  });

  it("a knockdown un-queues it", () => {
    const match = casting(0.5);
    match.requestSkill("a", 1);
    applyEffects([{ kind: "knockdown", durationSeconds: 2 }], {
      surroundings: new Map(),
      caster: get(match, "d").combatant,
      target: get(match, "a").combatant,
      rng: createRng(1),
      rules: RULES.combat,
    });
    expect(get(match, "a").combatant.cast.queuedSlot).toBeUndefined();
    stepFor(match, 3);
    expect(get(match, "a").combatant.cast.isCasting).toBe(false);
  });

  it("queued out of range, it walks in once the cast and aftercast are over", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(3000, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 1);
    expect(get(match, "a").combatant.cast.activeCast?.skillId).toBe(ARMOR_OF_EARTH);
    expect(match.requestSkill("a", 0)).toEqual({
      skillId: FIREBALL,
      check: { ok: true },
      queued: true,
    });
    const activation = getSkill(ARMOR_OF_EARTH)?.activationSeconds ?? 0;
    expect(untilTaken(match)).toBeCloseTo(activation + AFTERCAST, 6);
    stepFor(match, 0.5);
    expect(get(match, "a").position.x).toBeGreaterThan(0);
    expect(get(match, "a").combatant.cast.isCasting).toBe(false);
  });
});

describe("attack skills ride the weapon (ADR-0029)", () => {
  const SWIFT_CHOP = "warrior.swift-chop";
  const BACKBREAKER = "warrior.backbreaker";

  /** A rank-12 warrior with `weapon`, Swift Chop and Backbreaker, and plenty of adrenaline. */
  function warrior(id: string, weapon: Weapon, attributeId: string): ParticipantSpec {
    return {
      ...swordsman(id, vec2(0, 0)),
      skillBar: [SWIFT_CHOP, BACKBREAKER],
      attributeRanks: new Map([
        ["warrior.axe-mastery", 12],
        ["warrior.hammer-mastery", 12],
      ]),
      equipment: wielding(weapon, attributeId),
    };
  }
  const axeman = (id = "a") => warrior(id, WEAPONS.axe, "warrior.axe-mastery");
  const hammerer = (id = "a") => warrior(id, WEAPONS.hammer, "warrior.hammer-mastery");

  /** Ticks until a cast of `seconds` goes off, as `CastState.advance` counts them. */
  const ticksFor = (seconds: number) => Math.ceil(seconds / DT - 1e-9);

  function skillHits(log: readonly CombatLogEntry[], skillId: string): CombatLogEntry[] {
    return log.filter((entry) => entry.skillId === skillId);
  }

  it("Swift Chop on an axe hits halfway through a swing, recovers as long, then swings again", () => {
    const match = sim(axeman(), dummy("d", vec2(40, 0)));
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    const log = stepFor(match, 4);

    const half = WEAPONS.axe.attackIntervalSeconds / 2;
    const chop = skillHits(log, SWIFT_CHOP);
    expect(chop).toHaveLength(1);
    expect(chop[0]?.atSeconds).toBeCloseTo(ticksFor(half) * DT, 6);
    expect(chop[0]?.events.map((event) => event.kind)).toEqual([
      "skill-used",
      "damage",
      "adrenaline-gained",
    ]);

    const ends = (chop[0]?.atSeconds ?? 0) + half;
    const next = swings(log)[0]?.atSeconds ?? 0;
    expect(Math.abs(next - ends - WEAPONS.axe.attackIntervalSeconds)).toBeLessThanOrEqual(DT);
  });

  it("shows the wind-up on the cast bar until the hit", () => {
    const match = sim(axeman(), dummy("d", vec2(40, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    expect(get(match, "a").combatant.cast.activeCast).toMatchObject({
      skillId: SWIFT_CHOP,
      totalSeconds: WEAPONS.axe.attackIntervalSeconds / 2,
    });
  });

  it("Backbreaker on a hammer hits at half the hammer's 1.75 s", () => {
    const match = sim(hammerer(), dummy("d", vec2(40, 0)));
    match.setTarget("a", "d");
    chargeAdrenaline(get(match, "a").combatant);
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: true });
    const log = stepFor(match, 2);
    expect(skillHits(log, BACKBREAKER)[0]?.atSeconds).toBeCloseTo(ticksFor(0.875) * DT, 6);
  });

  it("pressed mid-swing, the swing is lost: no auto hit before the skill's", () => {
    const match = sim(axeman(), dummy("d", vec2(40, 0)));
    match.requestAttack("a", "d");
    match.setTarget("a", "d");
    stepFor(match, 1.2);
    match.requestSkill("a", 0);
    expect(get(match, "a").combatant.attack?.swingElapsed).toBe(0);

    const log = stepFor(match, 1);
    expect(swings(log)).toEqual([]);
    expect(skillHits(log, SWIFT_CHOP)).toHaveLength(1);
  });

  it("is refused with the wrong weapon, and costs nothing", () => {
    const match = sim(
      warrior("a", WEAPONS.sword, "warrior.swordsmanship"),
      dummy("d", vec2(40, 0)),
    );
    match.setTarget("a", "d");
    const energy = get(match, "a").combatant.energy;
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: false, reason: "wrong-weapon" });
    expect(get(match, "a").combatant.energy).toBe(energy);
  });

  it("an interrupt in the wind-up stops the hit, and the skill recharges", () => {
    const match = sim(axeman(), dummy("d", vec2(40, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    stepFor(match, 0.3);
    const a = get(match, "a").combatant;
    applyEffects([{ kind: "interrupt" }], {
      surroundings: new Map(),
      caster: get(match, "d").combatant,
      target: a,
      rng: createRng(1),
      rules: RULES.combat,
    });

    const log = stepFor(match, 1);
    expect(skillHits(log, SWIFT_CHOP)).toEqual([]);
    expect(a.cast.rechargeRemaining.get(SWIFT_CHOP)).toBeGreaterThan(0);
  });

  it("a faster attack speed shortens both the swing and the attack skill", () => {
    withAttackDuration({ bleeding: 0.67 }, () => {
      const fast = WEAPONS.axe.attackIntervalSeconds * 0.67;

      const swinging = sim(axeman(), dummy("d", vec2(40, 0)));
      get(swinging, "a").combatant.statuses.apply("bleeding", 100, "x", NO_RANKS);
      swinging.requestAttack("a", "d");
      const first = swings(stepFor(swinging, 2))[0]?.atSeconds ?? 0;
      expect(Math.abs(first - fast)).toBeLessThanOrEqual(DT);

      const chopping = sim(axeman(), dummy("d", vec2(40, 0)));
      get(chopping, "a").combatant.statuses.apply("bleeding", 100, "x", NO_RANKS);
      chopping.setTarget("a", "d");
      chopping.requestSkill("a", 0);
      expect(get(chopping, "a").combatant.cast.activeCast?.totalSeconds).toBeCloseTo(fast / 2, 9);
    });
  });
});
