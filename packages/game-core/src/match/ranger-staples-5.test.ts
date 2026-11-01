import { describe, expect, it } from "vitest";

import { AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "../skills/status.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * The Ranger staples 4 (#1742): four preparations and two bow attacks, on
 * three new primitives: a status that ends when its bearer fails to hit,
 * one that speeds its bearer's arrows, and a condition that an ally of
 * the caster's stands near the target.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const SEEKING_ARROWS = "ranger.seeking-arrows";
const BARBED_ARROWS = "ranger.barbed-arrows";
const MELANDRUS_ARROWS = "ranger.melandrus-arrows";
const READ_THE_WIND = "ranger.read-the-wind";
const CROSSFIRE = "ranger.crossfire";
const PENETRATING_ATTACK = "ranger.penetrating-attack";
const BAR = [
  SEEKING_ARROWS,
  BARBED_ARROWS,
  MELANDRUS_ARROWS,
  READ_THE_WIND,
  CROSSFIRE,
  PENETRATING_ATTACK,
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
function ranger(): ParticipantSpec {
  return spec("r", 0, vec2(0, 0), {
    skillBar: BAR,
    attributeRanks: new Map([
      ["ranger.marksmanship", 12],
      ["ranger.wilderness-survival", 12],
    ]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
  });
}

/** `r` and `more`; `f`, its foe, 200 east unless `more` places it. */
function match(more: readonly ParticipantSpec[] = [], seed = "ranger-staples-5") {
  const participants = [ranger(), ...more];
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

/** `r` uses the self-targeted skill `skillId`, and steps until it is done. */
function useOnSelf(sim: MatchSimulation, skillId: string): CombatLogEntry[] {
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  return stepFor(sim, skill(skillId).activationSeconds + 1);
}

/** `r` uses `skillId` on `f`: its events until it landed. */
function shot(sim: MatchSimulation, skillId: string): CombatEvent[] {
  sim.setTarget("r", "f");
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  const events: CombatEvent[] = [];
  for (let tick = 1; tick <= 10 * RULES.tickRateHz; tick += 1) {
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "r" && entry.skillId === skillId)
      .flatMap((entry) => entry.events);
    events.push(...logged);
    if (logged.length > 0 && sim.projectiles.length === 0) {
      return events;
    }
  }
  throw new Error(`${skillId} never landed`);
}

/** `r` shoots plain arrows at `f` until one reaches it: everything logged until then. */
function arrow(sim: MatchSimulation): CombatLogEntry[] {
  expect(sim.requestAttack("r", "f")).toEqual({ ok: true });
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim.step(DT).log;
    log.push(...logged);
    const reached = logged.some(
      (entry) => entry.sourceId === "r" && entry.skillId === undefined && entry.events.length > 0,
    );
    if (reached && sim.projectiles.length === 0) {
      return log;
    }
  }
  throw new Error("r never shot f");
}

/** The speed of `r`'s next plain arrow, read as it leaves the bow. */
function releasedSpeed(sim: MatchSimulation): number {
  expect(sim.requestAttack("r", "f")).toEqual({ ok: true });
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    sim.step(DT);
    const speed = sim.projectiles[0]?.speed;
    if (speed !== undefined) {
      return speed;
    }
  }
  throw new Error("r never released");
}

function events(log: readonly CombatLogEntry[]): CombatEvent[] {
  return log.flatMap((entry) => entry.events);
}

function damageTo(all: readonly CombatEvent[], targetId: string): number[] {
  return all.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

function blocked(all: readonly CombatEvent[]): boolean {
  return all.some((event) => event.kind === "attack-blocked");
}

describe("the corpus's numbers (#1742)", () => {
  it("are each skill's, Read the Wind's and Penetrating Attack's the PvP ones", () => {
    const rows = BAR.map((id) => {
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
      [SEEKING_ARROWS, 893, "preparation", false, M, 10, 2, 15],
      [BARBED_ARROWS, 1470, "preparation", false, W, 10, 2, 12],
      [MELANDRUS_ARROWS, 429, "preparation", true, W, 5, 2, 12],
      [READ_THE_WIND, 432, "preparation", false, M, 5, 2, 12],
      [CROSSFIRE, 1469, "attack", false, M, 5, 0, 4],
      [PENETRATING_ATTACK, 398, "attack", false, M, 10, 1, 4],
    ]);
  });

  it("each preparation lasts as long as GW1's at rank 12", () => {
    const preparations: [string, StatusId][] = [
      [SEEKING_ARROWS, "seeking-arrows"],
      [BARBED_ARROWS, "barbed-arrows"],
      [MELANDRUS_ARROWS, "melandrus-arrows"],
      [READ_THE_WIND, "read-the-wind"],
    ];
    const durations = preparations.map(([skillId, statusId]) => {
      const sim = match();
      useOnSelf(sim, skillId);
      return get(sim, "r").combatant.statuses.get(statusId)?.durationSeconds;
    });
    expect(durations).toEqual([12, 24, 18, 24]);
  });
});

describe("Seeking Arrows and endsWhenBearerMisses (#1742)", () => {
  it("its arrows land through a 75% block every time", () => {
    for (let n = 0; n < 10; n += 1) {
      const sim = match([], `seeking-${String(n)}`);
      get(sim, "r").combatant.statuses.apply("seeking-arrows", 1000, "r", NO_RANKS);
      get(sim, "f").combatant.statuses.apply("guardian", 1000, "f", NO_RANKS);
      const log = arrow(sim);
      expect(blocked(events(log)), String(n)).toBe(false);
      expect(damageTo(events(log), "f"), String(n)).toHaveLength(1);
    }
  });

  it("the first arrow that fails to hit ends it: a blinded one", () => {
    const sim = match();
    const archer = get(sim, "r").combatant;
    archer.statuses.apply("seeking-arrows", 1000, "r", NO_RANKS);
    archer.statuses.apply("blind", 1000, "f", NO_RANKS);
    expect(sim.requestAttack("r", "f")).toEqual({ ok: true });
    const shots = stepFor(sim, 10).filter(
      (entry) => entry.sourceId === "r" && entry.skillId === undefined && entry.events.length > 0,
    );
    const missed = shots.findIndex((entry) =>
      entry.events.some((event) => event.kind === "attack-missed"),
    );
    expect(missed).toBeGreaterThanOrEqual(0);
    expect(shots[missed]?.events).toContainEqual({
      kind: "status-expired",
      targetId: "r",
      statusId: "seeking-arrows",
    });
    expect(archer.statuses.get("seeking-arrows")).toBeUndefined();
  });

  it("a dodged arrow ends it too", () => {
    const sim = match([spec("f", 1, vec2(600, 0))]);
    const archer = get(sim, "r").combatant;
    archer.statuses.apply("seeking-arrows", 1000, "r", NO_RANKS);
    releasedSpeed(sim);
    sim.setInputDirection("f", vec2(0, 1));
    const log = stepFor(sim, 3);
    expect(events(log)).toContainEqual({ kind: "attack-dodged", targetId: "f" });
    expect(events(log)).toContainEqual({
      kind: "status-expired",
      targetId: "r",
      statusId: "seeking-arrows",
    });
  });

  it("a hit keeps it", () => {
    const sim = match();
    const archer = get(sim, "r").combatant;
    archer.statuses.apply("seeking-arrows", 1000, "r", NO_RANKS);
    arrow(sim);
    expect(archer.statuses.get("seeking-arrows")).toBeDefined();
  });

  it("says so", () => {
    expect(describeStatus("seeking-arrows")).toContain("attacks cannot be blocked");
    expect(describeStatus("seeking-arrows")).toContain("ends if the bearer fails to hit");
  });
});

describe("Barbed Arrows (#1742)", () => {
  it("its arrows cause Bleeding for 13 s", () => {
    const sim = match();
    useOnSelf(sim, BARBED_ARROWS);
    arrow(sim);
    expect(get(sim, "f").combatant.statuses.get("bleeding")?.durationSeconds).toBe(13);
  });

  it("-40 armor while it is activated, and none after", () => {
    const sim = match();
    const archer = get(sim, "r").combatant;
    expect(sim.requestSkill("r", BAR.indexOf(BARBED_ARROWS))?.check).toEqual({ ok: true });
    stepFor(sim, 1);
    expect(aggregateModifiers(archer.statuses.active).armorModifier).toBe(-40);
    stepFor(sim, 2);
    expect(archer.statuses.get("barbed-arrows")).toBeDefined();
    expect(aggregateModifiers(archer.statuses.active).armorModifier).toBe(0);
  });
});

describe("Melandru's Arrows (#1742)", () => {
  it("its arrows cause Bleeding for 21 s, and no more damage on a foe with no enchantment", () => {
    const sim = match();
    get(sim, "r").combatant.statuses.apply("melandrus-arrows", 1000, "r", NO_RANKS);
    const log = arrow(sim);
    expect(get(sim, "f").combatant.statuses.get("bleeding")?.durationSeconds).toBe(21);
    const melandru = log.filter((entry) => entry.skillId === MELANDRUS_ARROWS);
    expect(damageTo(events(melandru), "f")).toEqual([]);
  });

  it("+24 damage on an enchanted foe", () => {
    const sim = match();
    get(sim, "r").combatant.statuses.apply("melandrus-arrows", 1000, "r", NO_RANKS);
    get(sim, "f").combatant.statuses.apply("regeneration", 1000, "f", NO_RANKS);
    const melandru = arrow(sim).filter((entry) => entry.skillId === MELANDRUS_ARROWS);
    expect(damageTo(events(melandru), "f")).toEqual([24]);
  });
});

describe("Read the Wind and projectileSpeedMultiplier (#1742)", () => {
  it("its arrows fly twice as fast as the bow's", () => {
    const bow = releasedSpeed(match());
    const sim = match();
    get(sim, "r").combatant.statuses.apply("read-the-wind", 1000, "r", NO_RANKS);
    expect(releasedSpeed(sim)).toBeCloseTo(2 * bow, 9);
  });

  it("an arrow in flight keeps the speed it left with when it ends", () => {
    const sim = match([spec("f", 1, vec2(600, 0))]);
    const archer = get(sim, "r").combatant;
    archer.statuses.apply("read-the-wind", 1000, "r", NO_RANKS);
    const fast = releasedSpeed(sim);
    archer.statuses.remove("read-the-wind");
    sim.step(DT);
    expect(sim.projectiles[0]?.speed).toBe(fast);
  });

  it("says so", () => {
    expect(describeStatus("read-the-wind")).toContain("arrows move 2× as fast");
  });
});

describe("Crossfire and target-near-caster-ally (#1742)", () => {
  /** How many of 20 Crossfires `f`, blocking 75%, blocked; `ally` stands where it is told. */
  function blocks(ally: Vec2 | undefined): number {
    let count = 0;
    for (let n = 0; n < 20; n += 1) {
      // `f` within `AREA_NEARBY` of `r`: the caster is no ally of its own.
      const more = [spec("f", 1, vec2(70, 0))];
      if (ally !== undefined) {
        more.push(spec("a", 0, ally));
      }
      const sim = match(more, `crossfire-${String(n)}`);
      get(sim, "f").combatant.statuses.apply("guardian", 1000, "f", NO_RANKS);
      if (blocked(shot(sim, CROSSFIRE))) {
        count += 1;
      }
    }
    return count;
  }

  it("is blocked as ever with no ally of yours near the foe", () => {
    expect(blocks(undefined)).toBeGreaterThan(0);
    expect(blocks(vec2(70, AREA_NEARBY + 40))).toBeGreaterThan(0);
  });

  it("cannot be blocked with an ally of yours near the foe", () => {
    expect(blocks(vec2(70, AREA_NEARBY - 20))).toBe(0);
  });

  it("deals +17 at rank 12", () => {
    expect(skill(CROSSFIRE).attack?.bonusDamage).toMatchObject({ scaling: { atTwelve: 17 } });
  });

  it("says so", () => {
    const texts = describeSkill(skill(CROSSFIRE)).effects.map((effect) => effect.text);
    expect(texts).toContain("If target is near any of your allies: cannot be blocked");
  });
});

describe("Penetrating Attack (#1742)", () => {
  it("+13 damage and 10% armor penetration at rank 12", () => {
    const { attack } = skill(PENETRATING_ATTACK);
    expect(attack?.bonusDamage).toMatchObject({ scaling: { atTwelve: 13 } });
    expect(attack?.armorPenetration).toBe(0.1);
  });

  it("hits harder than a plain arrow", () => {
    const plain = damageTo(events(arrow(match())), "f");
    const penetrating = damageTo(shot(match(), PENETRATING_ATTACK), "f");
    expect(plain).toHaveLength(1);
    expect(penetrating).toHaveLength(1);
    expect(penetrating[0] ?? 0).toBeGreaterThan((plain[0] ?? 0) + 13);
  });
});
