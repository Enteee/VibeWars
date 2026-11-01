import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { attackDamageTypeOf } from "../skills/tick.js";
import { KNOCKDOWN_SECONDS, isEasilyInterrupted, type Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The Ranger staples 2 (#1629): a hit rider for one weapon class, an
 * attack skill that is easily interrupted, one that removes its user's
 * preparations, and the twelve Ranger skills on them.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };
/** Every roll crits. */
const ALL_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: 2 } };

const POWER_SHOT = "ranger.power-shot";
const PRECISION_SHOT = "ranger.precision-shot";
const DETERMINED_SHOT = "ranger.determined-shot";
const KEEN_ARROW = "ranger.keen-arrow";
const PREPARED_SHOT = "ranger.prepared-shot";
const POISON_ARROW = "ranger.poison-arrow";
const VOLLEY = "ranger.volley";
const KINDLE_ARROWS = "ranger.kindle-arrows";
const IGNITE_ARROWS = "ranger.ignite-arrows";
const DUST_TRAP = "ranger.dust-trap";
const SPIKE_TRAP = "ranger.spike-trap";
const ANTIDOTE_SIGNET = "ranger.antidote-signet";
/** A 1 s attack skill that says nothing of interrupts, beside Precision Shot. */
const HUNTERS_SHOT = "ranger.hunters-shot";
const BAR = [
  POWER_SHOT,
  PRECISION_SHOT,
  DETERMINED_SHOT,
  KEEN_ARROW,
  PREPARED_SHOT,
  POISON_ARROW,
  VOLLEY,
  KINDLE_ARROWS,
  IGNITE_ARROWS,
  DUST_TRAP,
  SPIKE_TRAP,
  ANTIDOTE_SIGNET,
  HUNTERS_SHOT,
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
    maxEnergy: 1000,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** `r`, a rank-12 Ranger with a longbow and `BAR`, at the origin. */
function ranger(extra: Partial<ParticipantSpec> = {}): ParticipantSpec {
  return spec("r", 0, vec2(0, 0), {
    skillBar: BAR,
    attributeRanks: new Map([
      ["ranger.marksmanship", 12],
      ["ranger.wilderness-survival", 12],
    ]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    ...extra,
  });
}

/** A swordsman, for a blow that is not a bow's or one that lands on `r`. */
function swordsman(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return spec(id, team, spawn, {
    attributeRanks: new Map([["warrior.swordsmanship", 12]]),
    equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
  });
}

/** `r` and `more`; `f`, its foe, 200 east unless `more` places it. */
function match(
  more: readonly ParticipantSpec[] = [],
  { seed = "ranger-staples-3", ruleset = NO_CRIT, archer = ranger() } = {},
) {
  const participants = [archer, ...more];
  if (!more.some((participant) => participant.id === "f")) {
    participants.push(spec("f", 1, vec2(200, 0)));
  }
  return new MatchSimulation({ seed, ruleset, participants });
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

/** `r` uses `skillId` on `targetId`: everything logged until it landed. */
function used(sim: MatchSimulation, skillId: string, targetId = "f"): CombatLogEntry[] {
  sim.setTarget("r", targetId);
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim.step(DT).log;
    log.push(...logged);
    const own = logged.some((entry) => entry.sourceId === "r" && entry.skillId === skillId);
    if (own && sim.projectiles.length === 0) {
      return log;
    }
  }
  throw new Error(`${skillId} never landed`);
}

/** `r` uses the self-targeted skill `skillId`, and steps until it is done. */
function useOnSelf(sim: MatchSimulation, skillId: string): CombatLogEntry[] {
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  return stepFor(sim, skill(skillId).activationSeconds + 1);
}

/** The events of `log` that `skillId`, or a blow (no skill), put out. */
function eventsOf(log: readonly CombatLogEntry[], skillId: string | undefined): CombatEvent[] {
  return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

function damageTo(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

/** `attacker` swings at `f` until a blow lands: everything logged until then. */
function swingUntilHit(sim: MatchSimulation, attacker: string, target = "f"): CombatLogEntry[] {
  expect(sim.requestAttack(attacker, target)).toEqual({ ok: true });
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim.step(DT).log;
    log.push(...logged);
    const landed = logged.some(
      (entry) =>
        entry.sourceId === attacker &&
        entry.events.some((event) => event.kind === "damage" && event.targetId === target),
    );
    if (landed && sim.projectiles.length === 0) {
      return log;
    }
  }
  throw new Error(`${attacker} never hit ${target}`);
}

describe("the corpus's numbers (#1629)", () => {
  it("are each skill's, the Keen Arrow the PvP one's", () => {
    const rows = BAR.slice(0, -1).map((id) => {
      const { gwId, type, elite, attributeId, cost, activationSeconds, rechargeSeconds } =
        skill(id);
      return [
        id,
        gwId,
        type,
        elite,
        attributeId,
        cost?.kind === "energy" ? cost.amount : 0,
        activationSeconds,
        rechargeSeconds,
      ];
    });
    const M = "ranger.marksmanship";
    const W = "ranger.wilderness-survival";
    expect(rows).toEqual([
      [POWER_SHOT, 394, "attack", false, M, 10, 0, 3],
      [PRECISION_SHOT, 400, "attack", false, M, 10, 1, 6],
      [DETERMINED_SHOT, 402, "attack", false, M, 5, 0, 10],
      [KEEN_ARROW, 1720, "attack", false, M, 5, 0, 12],
      [PREPARED_SHOT, 1465, "attack", true, M, 5, 0, 6],
      [POISON_ARROW, 404, "attack", true, W, 5, 0, 1],
      [VOLLEY, 2144, "attack", false, M, 5, 0, 2],
      [KINDLE_ARROWS, 433, "preparation", false, W, 5, 2, 12],
      [IGNITE_ARROWS, 431, "preparation", false, W, 10, 2, 12],
      [DUST_TRAP, 457, "trap", false, W, 25, 2, 30],
      [SPIKE_TRAP, 461, "trap", true, W, 10, 2, 20],
      [ANTIDOTE_SIGNET, 427, "signet", false, undefined, 0, 1, 4],
    ]);
  });
});

describe("a hit rider for one weapon class (#1629)", () => {
  it("Kindle Arrows rides a bow's blow, and its fire is the bow's type", () => {
    const sim = match();
    useOnSelf(sim, KINDLE_ARROWS);
    const archer = get(sim, "r").combatant;
    expect(archer.statuses.get("kindle-arrows")?.durationSeconds).toBe(24);
    expect(attackDamageTypeOf(archer)).toBe("fire");
    const log = swingUntilHit(sim, "r");
    expect(damageTo(eventsOf(log, KINDLE_ARROWS), "f")).toEqual([20]);
  });

  it("does not ride a sword's blow, nor turn it to fire", () => {
    const sim = match([swordsman("w", 0, vec2(AREA_ADJACENT - 10, 0))], {
      archer: ranger({ spawn: vec2(-500, 0) }),
    });
    const sword = get(sim, "w").combatant;
    sword.statuses.apply("kindle-arrows", 24, "w", NO_RANKS);
    expect(attackDamageTypeOf(sword)).toBeUndefined();
    const log = swingUntilHit(sim, "w");
    expect(damageTo(eventsOf(log, KINDLE_ARROWS), "f")).toEqual([]);
  });

  it("a rider for any weapon rides both: Apply Poison's", () => {
    const sim = match([swordsman("w", 0, vec2(AREA_ADJACENT - 10, 0))]);
    get(sim, "w").combatant.statuses.apply("apply-poison", 24, "w", NO_RANKS);
    swingUntilHit(sim, "w");
    expect(get(sim, "f").combatant.statuses.get("poison")).toBeDefined();
  });
});

describe("Ignite Arrows (#1629)", () => {
  it("each arrow deals 15 fire to the struck foe and every foe adjacent to it", () => {
    const sim = match([
      spec("f", 1, vec2(200, 0)),
      spec("g", 1, vec2(200, AREA_ADJACENT - 10)),
      spec("far", 1, vec2(200, -(AREA_ADJACENT + 40))),
    ]);
    useOnSelf(sim, IGNITE_ARROWS);
    const log = swingUntilHit(sim, "r");
    const ignite = eventsOf(log, IGNITE_ARROWS);
    expect(damageTo(ignite, "f")).toEqual([15]);
    expect(damageTo(ignite, "g")).toEqual([15]);
    expect(damageTo(ignite, "far")).toEqual([]);
  });

  it("replaces Kindle Arrows: one preparation at a time", () => {
    const sim = match();
    useOnSelf(sim, KINDLE_ARROWS);
    useOnSelf(sim, IGNITE_ARROWS);
    const { statuses } = get(sim, "r").combatant;
    expect(statuses.get("kindle-arrows")).toBeUndefined();
    expect(statuses.get("ignite-arrows")).toBeDefined();
  });
});

describe("Power Shot and Poison Arrow (#1629)", () => {
  it("Power Shot strikes for +45", () => {
    expect(skill(POWER_SHOT).attack?.bonusDamage).toEqual({
      scaling: { attributeId: "ranger.marksmanship", atZero: 25, atTwelve: 45 },
    });
    expect(damageTo(eventsOf(used(match(), POWER_SHOT), POWER_SHOT), "f")).toHaveLength(1);
  });

  it("Poison Arrow poisons for 17 s", () => {
    const sim = match();
    used(sim, POISON_ARROW);
    expect(get(sim, "f").combatant.statuses.get("poison")?.durationSeconds).toBe(17);
  });
});

describe("Precision Shot (#1629)", () => {
  it("is never blocked: a foe's 75% block does nothing", () => {
    for (let n = 0; n < 10; n += 1) {
      const sim = match([], { seed: `precision-${String(n)}` });
      get(sim, "f").combatant.statuses.apply("guardian", 1000, "f", NO_RANKS);
      const events = eventsOf(used(sim, PRECISION_SHOT), PRECISION_SHOT);
      expect(damageTo(events, "f")).toHaveLength(1);
    }
  });

  it("is easily interrupted: a blow landing in its activation cuts it", () => {
    expect(isEasilyInterrupted(skill(PRECISION_SHOT))).toBe(true);
    const sim = match([swordsman("w", 1, vec2(AREA_ADJACENT - 10, 0))]);
    expect(sim.requestAttack("w", "r")).toEqual({ ok: true });
    // The sword's first blow lands 1.35 s in, inside the 0.5 s the bow takes.
    sim.setTarget("r", "f");
    stepFor(sim, 1);
    expect(sim.requestSkill("r", BAR.indexOf(PRECISION_SHOT))?.check).toEqual({ ok: true });
    const events = stepFor(sim, 1.5).flatMap((entry) => entry.events);
    expect(events).toContainEqual({ kind: "interrupted", targetId: "r", skillId: PRECISION_SHOT });
  });

  it("a normal attack skill is not: Hunter's Shot goes off under the same blows", () => {
    expect(isEasilyInterrupted(skill(HUNTERS_SHOT))).toBe(false);
    const sim = match([swordsman("w", 1, vec2(AREA_ADJACENT - 10, 0))]);
    expect(sim.requestAttack("w", "r")).toEqual({ ok: true });
    sim.setTarget("r", "f");
    stepFor(sim, 1);
    expect(sim.requestSkill("r", BAR.indexOf(HUNTERS_SHOT))?.check).toEqual({ ok: true });
    const events = stepFor(sim, 2).flatMap((entry) => entry.events);
    expect(events.map(({ kind }) => kind)).not.toContain("interrupted");
    expect(get(sim, "f").combatant.statuses.get("bleeding")).toBeDefined();
  });
});

describe("Determined Shot (#1629)", () => {
  /** `r` has used Power Shot; then Determined Shot, blocked when `blocked`. */
  function after(blocked: boolean) {
    const sim = match();
    used(sim, POWER_SHOT);
    if (blocked) {
      get(sim, "f").combatant.statuses.apply("guardian", 1000, "f", NO_RANKS);
      // Guardian blocks 50%: keep the foe blocking until it has.
      get(sim, "f").combatant.statuses.apply("lightning-reflexes", 1000, "f", NO_RANKS);
    }
    const events = eventsOf(used(sim, DETERMINED_SHOT), DETERMINED_SHOT);
    return { sim, events };
  }

  it("on a hit, +17, and the other attack skills keep recharging", () => {
    const { sim, events } = after(false);
    expect(damageTo(events, "f")).toHaveLength(1);
    expect(get(sim, "r").combatant.cast.rechargeRemaining.has(POWER_SHOT)).toBe(true);
  });

  it("failing to hit recharges every other attack skill at once", () => {
    const misses = [];
    for (let n = 0; n < 10 && misses.length === 0; n += 1) {
      const { sim, events } = after(true);
      if (damageTo(events, "f").length === 0) {
        misses.push(n);
        expect(get(sim, "r").combatant.cast.rechargeRemaining.has(POWER_SHOT)).toBe(false);
      }
    }
    expect(misses).not.toEqual([]);
  });
});

describe("Keen Arrow (#1629)", () => {
  it("adds 25 piercing on a critical hit, nothing without", () => {
    const keen = (ruleset: Ruleset) => {
      const events = eventsOf(used(match([], { ruleset }), KEEN_ARROW), KEEN_ARROW);
      return damageTo(events, "f");
    };
    expect(keen(NO_CRIT)).toHaveLength(1);
    const crit = keen(ALL_CRIT);
    expect(crit).toHaveLength(2);
    expect(crit[1]).toBe(25);
  });
});

describe("Prepared Shot (#1629)", () => {
  function energyGained(prepare: string | undefined): number[] {
    const sim = match();
    if (prepare !== undefined) {
      useOnSelf(sim, prepare);
    }
    return eventsOf(used(sim, PREPARED_SHOT), PREPARED_SHOT).flatMap((event) =>
      event.kind === "energy-gain" && event.targetId === "r" ? [event.amount] : [],
    );
  }

  it("gains 7 energy under a preparation, none without", () => {
    expect(energyGained(KINDLE_ARROWS)).toEqual([7]);
    expect(energyGained(undefined)).toEqual([]);
  });
});

describe("Volley and Barrage (#1629)", () => {
  it("Volley shoots the target and 3 of the 5 foes adjacent to it", () => {
    // Five foes on a ring round `f`, apart enough that none is pushed off it.
    const ring = [0, 1, 2, 3, 4].map((n) => {
      const angle = (2 * Math.PI * n) / 5;
      return spec(`a${String(n)}`, 1, vec2(200 + 30 * Math.cos(angle), 30 * Math.sin(angle)));
    });
    const sim = match([spec("f", 1, vec2(200, 0)), ...ring]);
    const hit = new Set(
      eventsOf(used(sim, VOLLEY), VOLLEY).flatMap((event) =>
        event.kind === "damage" ? [event.targetId] : [],
      ),
    );
    expect(hit.size).toBe(4);
    expect(hit.has("f")).toBe(true);
  });

  it("removes the preparation before its arrows fly: none carries it", () => {
    const sim = match();
    useOnSelf(sim, KINDLE_ARROWS);
    const log = used(sim, VOLLEY);
    expect(get(sim, "r").combatant.statuses.get("kindle-arrows")).toBeUndefined();
    expect(eventsOf(log, VOLLEY)).toContainEqual({
      kind: "status-removed",
      targetId: "r",
      statusId: "kindle-arrows",
    });
    expect(damageTo(eventsOf(log, KINDLE_ARROWS), "f")).toEqual([]);
  });

  it("so a Prepared Shot after Volley gains nothing", () => {
    const sim = match();
    useOnSelf(sim, KINDLE_ARROWS);
    used(sim, VOLLEY);
    const gains = eventsOf(used(sim, PREPARED_SHOT), PREPARED_SHOT).filter(
      (event) => event.kind === "energy-gain",
    );
    expect(gains).toEqual([]);
  });

  it("Barrage removes it too", () => {
    expect(skill("ranger.barrage").attack?.removesPreparations).toBe(true);
    expect(skill(VOLLEY).attack?.removesPreparations).toBe(true);
    expect(skill(POWER_SHOT).attack?.removesPreparations).toBeUndefined();
  });
});

describe("Dust Trap and Spike Trap (#1629)", () => {
  /** `r` sets the trap; `f`, adjacent, springs it; what the spring did over `seconds`. */
  function sprung(trapId: string, seconds: number) {
    const sim = match([spec("f", 1, vec2(AREA_ADJACENT - 10, 0))]);
    expect(sim.requestSkill("r", BAR.indexOf(trapId))?.check).toEqual({ ok: true });
    const log = stepFor(sim, 2 + seconds);
    return { sim, events: eventsOf(log, trapId) };
  }

  it("Dust Trap blinds for 7 s and deals 22, every second for 5 s", () => {
    const { sim, events } = sprung(DUST_TRAP, 6);
    expect(damageTo(events, "f")).toEqual([22, 22, 22, 22, 22]);
    expect(get(sim, "f").combatant.statuses.get("blind")?.durationSeconds).toBe(7);
  });

  it("Spike Trap strikes for 34 and cripples 21 s twice; still down, the second knocks down no more", () => {
    const { sim, events } = sprung(SPIKE_TRAP, 3);
    expect(damageTo(events, "f")).toEqual([34, 34]);
    const knockdowns = events.filter(
      (event) => event.kind === "knocked-down" && event.targetId === "f",
    );
    // A knocked-down foe cannot be knocked down again (`canBeKnockedDown`),
    // and a knockdown outlasts the spring's 1 s.
    expect(KNOCKDOWN_SECONDS).toBeGreaterThan(1);
    expect(knockdowns).toEqual([
      { kind: "knocked-down", targetId: "f", durationSeconds: KNOCKDOWN_SECONDS },
    ]);
    expect(get(sim, "f").combatant.statuses.get("crippled")?.durationSeconds).toBe(21);
  });
});

describe("Antidote Signet (#1629)", () => {
  function cleansed(conditions: readonly ("poison" | "bleeding" | "weakness")[]): string[] {
    const sim = match();
    const { statuses } = get(sim, "r").combatant;
    for (const [at, id] of conditions.entries()) {
      statuses.apply(id, 20 + at, "f", NO_RANKS);
      stepFor(sim, DT);
    }
    useOnSelf(sim, ANTIDOTE_SIGNET);
    return (["poison", "bleeding", "weakness"] as const).filter(
      (id) => statuses.get(id) === undefined,
    );
  }

  it("removes Poison, then one other condition, the newest", () => {
    expect(cleansed(["poison", "bleeding", "weakness"])).toEqual(["poison", "weakness"]);
  });

  it("with nothing to remove, does nothing and still recharges", () => {
    const sim = match();
    useOnSelf(sim, ANTIDOTE_SIGNET);
    expect(get(sim, "r").combatant.cast.rechargeRemaining.has(ANTIDOTE_SIGNET)).toBe(true);
  });
});

describe("the texts (#1629)", () => {
  const ranks = ranger().attributeRanks;
  const text = (id: string): string[] =>
    describeSkill(skill(id), ranks).effects.map((effect) => effect.text);

  it("say what each does", () => {
    expect(text(PRECISION_SHOT)).toContain("Easily interrupted");
    expect(text(VOLLEY)[0]).toBe("All your preparations are removed");
    expect(describeStatus("kindle-arrows", ranks)).toBe(
      "bow attacks deal fire damage, foes your bow attacks hit take 20 fire damage",
    );
    expect(describeStatus("ignite-arrows", ranks)).toBe(
      "foes your bow attacks hit take 15 fire damage, and so do foes adjacent to them",
    );
  });
});
