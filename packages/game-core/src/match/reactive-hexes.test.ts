import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describeStatus } from "../skills/describe.js";
import { strikesOf } from "../skills/testing.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BACKFIRE = "mesmer.backfire";
const EMPATHY = "mesmer.empathy";
const SWIFT_CHOP = "warrior.swift-chop";
const FIREBALL = "elementalist.fireball";
const MALAISE = "necromancer.malaise";
const HEALING_SIGNET = "warrior.healing-signet";
const POWER_SPIKE = "mesmer.power-spike";
const SEVER_ARTERY = "warrior.sever-artery";
const DIVERSION = "mesmer.diversion";

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

/** A rank-12 fighter with `weapon`, Swift Chop, two spells and a signet. */
function fighter(id: string, spawn: Vec2, weapon: Weapon = WEAPONS.axe): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [SWIFT_CHOP, FIREBALL, MALAISE, HEALING_SIGNET],
    attributeRanks: new Map([
      ["warrior.axe-mastery", 12],
      ["ranger.marksmanship", 12],
      ["elementalist.fire-magic", 12],
      ["necromancer.curses", 12],
    ]),
    equipment: wielding(
      weapon,
      weapon === WEAPONS.flatbow ? "ranger.marksmanship" : "warrior.axe-mastery",
    ),
    maxHealth: 1e4,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** The Mesmer: Backfire, Empathy, Power Spike and Diversion, at rank 12. */
function mesmer(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [BACKFIRE, EMPATHY, POWER_SPIKE, DIVERSION],
    attributeRanks: new Map([["mesmer.domination-magic", 12]]),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** A fighter `a` next to Mesmer `m`. */
function sim(weapon: Weapon = WEAPONS.axe, at: Vec2 = vec2(40, 0)): MatchSimulation {
  return new MatchSimulation({
    seed: "reactive-hexes",
    participants: [fighter("a", vec2(0, 0), weapon), mesmer("m", at)],
  });
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `a` uses its skill in `slot` on `m`. */
function use(match: MatchSimulation, slot: number): void {
  match.setTarget("a", "m");
  expect(match.requestSkill("a", slot)?.check).toEqual({ ok: true });
}

/** Every entry a hex's trigger logged. */
function fired(log: readonly CombatLogEntry[], skillId: string): CombatLogEntry[] {
  return log.filter((entry) => entry.skillId === skillId && entry.sourceId === "m");
}

function damageTo(entries: readonly CombatLogEntry[], id: string): number[] {
  return entries.flatMap((entry) =>
    entry.events.flatMap((event) =>
      event.kind === "damage" && event.targetId === id ? [event.amount] : [],
    ),
  );
}

describe("Backfire (#469)", () => {
  it("is cast as the backfire hex", () => {
    const match = sim(WEAPONS.axe, vec2(200, 0));
    match.setTarget("m", "a");
    expect(match.requestSkill("m", 0)?.check).toEqual({ ok: true });
    stepFor(match, 3.5);
    expect(get(match, "a").statuses.get("backfire")?.sourceId).toBe("m");
    expect(describeStatus("backfire")).toBe("takes 119 damage whenever it casts a spell");
  });

  it("a finished spell costs its caster 119, credited to the Mesmer, after the spell", () => {
    const match = sim();
    get(match, "a").statuses.apply("backfire", 10, "m", NO_RANKS);
    use(match, 2);
    const log = stepFor(match, 2.5);
    expect(damageTo(fired(log, BACKFIRE), "a")).toEqual([119]);
    const spell = log.findIndex((entry) => entry.skillId === MALAISE);
    const backfire = log.findIndex((entry) => entry.skillId === BACKFIRE);
    expect(spell).toBeGreaterThanOrEqual(0);
    expect(backfire).toBeGreaterThan(spell);
    expect(get(match, "m").statuses.has("malaise")).toBe(true);
  });

  it("fires once for each of two spells", () => {
    const match = sim();
    get(match, "a").statuses.apply("backfire", 10, "m", NO_RANKS);
    use(match, 2);
    stepFor(match, 3);
    use(match, 1);
    expect(damageTo(fired(stepFor(match, 3), BACKFIRE), "a")).toEqual([119]);
  });

  it("fires as a flying spell is released, not when it lands", () => {
    const match = sim(WEAPONS.axe, vec2(400, 0));
    get(match, "a").statuses.apply("backfire", 10, "m", NO_RANKS);
    use(match, 1);
    const log = stepFor(match, 1 + 2 * DT);
    expect(damageTo(fired(log, BACKFIRE), "a")).toEqual([119]);
    expect(damageTo(log, "m")).toEqual([]);
  });

  it("an interrupted spell does nothing", () => {
    const match = sim();
    get(match, "a").statuses.apply("backfire", 10, "m", NO_RANKS);
    use(match, 2);
    match.setTarget("m", "a");
    expect(match.requestSkill("m", 2)?.check).toEqual({ ok: true });
    const log = stepFor(match, 2);
    expect(log.some((entry) => entry.events.some((event) => event.kind === "interrupted"))).toBe(
      true,
    );
    expect(fired(log, BACKFIRE)).toEqual([]);
  });

  it("a signet or an attack skill does nothing", () => {
    const match = sim();
    get(match, "a").statuses.apply("backfire", 10, "m", NO_RANKS);
    expect(match.requestSkill("a", 3)?.check).toEqual({ ok: true });
    stepFor(match, 2.5);
    use(match, 0);
    expect(fired(stepFor(match, 2), BACKFIRE)).toEqual([]);
  });

  it("a kill by Backfire is the Mesmer's", () => {
    const match = sim();
    const bearer = get(match, "a");
    bearer.health = 100;
    bearer.statuses.apply("backfire", 10, "m", NO_RANKS);
    use(match, 2);
    const entries = fired(stepFor(match, 2.5), BACKFIRE);
    expect(entries.flatMap((entry) => entry.events.map((event) => event.kind))).toEqual([
      "damage",
      "death",
    ]);
    expect(bearer.dead).toBe(true);
  });

  it("its damage charges the bearer's adrenaline as a foe's hit (#827)", () => {
    const a = fighter("a", vec2(0, 0));
    const match = new MatchSimulation({
      seed: "reactive-hexes",
      participants: [
        { ...a, skillBar: [...a.skillBar, SEVER_ARTERY], maxHealth: 4 * 119 },
        mesmer("m", vec2(40, 0)),
      ],
    });
    get(match, "a").statuses.apply("backfire", 10, "m", NO_RANKS);
    use(match, 2);
    expect(damageTo(fired(stepFor(match, 2.5), BACKFIRE), "a")).toEqual([119]);
    expect(strikesOf(get(match, "a"), SEVER_ARTERY)).toBe(1);
  });

  it("does nothing once the Mesmer has left the match", () => {
    const match = sim();
    get(match, "a").statuses.apply("backfire", 10, "m", NO_RANKS);
    match.remove("m");
    expect(match.requestSkill("a", 3)?.check).toEqual({ ok: true });
    const log = stepFor(match, 2.5);
    expect(log.some((entry) => entry.skillId === BACKFIRE)).toBe(false);
    expect(get(match, "a").statuses.has("backfire")).toBe(true);
  });
});

describe("Empathy (#469)", () => {
  it("is cast as the empathy hex", () => {
    const match = sim(WEAPONS.axe, vec2(200, 0));
    match.setTarget("m", "a");
    expect(match.requestSkill("m", 1)?.check).toEqual({ ok: true });
    stepFor(match, 2.5);
    expect(get(match, "a").statuses.get("empathy")?.sourceId).toBe("m");
    expect(describeStatus("empathy")).toBe("takes 39 damage whenever it attacks");
  });

  it("each melee swing costs 39, armor or not, credited to the Mesmer", () => {
    const match = sim();
    get(match, "a").statuses.apply("empathy", 13, "m", NO_RANKS);
    expect(match.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(match, 3);
    const swings = log.filter((entry) => entry.cause === "weapon" && entry.sourceId === "a");
    expect(swings.length).toBeGreaterThanOrEqual(2);
    expect(damageTo(fired(log, EMPATHY), "a")).toEqual(swings.map(() => 39));
  });

  it("each ranged release costs 39, before the arrow lands", () => {
    const match = sim(WEAPONS.flatbow, vec2(600, 0));
    get(match, "a").statuses.apply("empathy", 13, "m", NO_RANKS);
    expect(match.requestAttack("a", "m")).toEqual({ ok: true });
    // Up to the first release, and not a tick further.
    const log: CombatLogEntry[] = [];
    for (let tick = 0; tick < 100 && fired(log, EMPATHY).length === 0; tick += 1) {
      log.push(...match.step(DT).log);
    }
    expect(damageTo(fired(log, EMPATHY), "a")).toEqual([39]);
    expect(damageTo(log, "m")).toEqual([]);
  });

  it("an attack skill costs 39 once", () => {
    const match = sim();
    get(match, "a").statuses.apply("empathy", 13, "m", NO_RANKS);
    use(match, 0);
    expect(damageTo(fired(stepFor(match, 1), EMPATHY), "a")).toEqual([39]);
  });

  it("a blinded miss and a blocked blow cost 39 all the same", () => {
    for (const status of ["blind", "guardian"] as const) {
      const match = sim();
      const bearer = get(match, "a");
      bearer.statuses.apply("empathy", 13, "m", NO_RANKS);
      if (status === "blind") {
        bearer.statuses.apply("blind", 13, "m", NO_RANKS);
      } else {
        get(match, "m").statuses.apply("guardian", 13, "m", NO_RANKS);
      }
      expect(match.requestAttack("a", "m")).toEqual({ ok: true });
      const log = stepFor(match, 3);
      const swings = log.filter((entry) => entry.cause === "weapon" && entry.sourceId === "a");
      expect(swings.length).toBeGreaterThanOrEqual(2);
      expect(damageTo(fired(log, EMPATHY), "a")).toEqual(swings.map(() => 39));
    }
  });

  it("a spell does nothing", () => {
    const match = sim();
    get(match, "a").statuses.apply("empathy", 13, "m", NO_RANKS);
    use(match, 2);
    expect(fired(stepFor(match, 2.5), EMPATHY)).toEqual([]);
  });
});

/** Every `recharge-lengthened` event in `log` (#949). */
function lengthened(log: readonly CombatLogEntry[]) {
  return log.flatMap((entry) =>
    entry.events.flatMap((event) =>
      event.kind === "recharge-lengthened" ? [{ entry, event }] : [],
    ),
  );
}

/** Steps until a recharge is lengthened, at most `seconds`, and returns that tick's log. */
function untilLengthened(match: MatchSimulation, seconds = 3): readonly CombatLogEntry[] {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    const { log } = match.step(DT);
    if (lengthened(log).length > 0) {
      return log;
    }
  }
  throw new Error("no recharge was lengthened");
}

describe("Diversion (#949)", () => {
  it("is cast as the diversion hex, for 6 s", () => {
    const match = sim(WEAPONS.axe, vec2(200, 0));
    match.setTarget("m", "a");
    expect(match.requestSkill("m", 3)?.check).toEqual({ ok: true });
    stepFor(match, 3 + 2 * DT);
    const hex = get(match, "a").statuses.get("diversion");
    expect(hex?.sourceId).toBe("m");
    expect(hex?.remainingSeconds).toBeGreaterThan(5.8);
    expect(describeStatus("diversion")).toBe(
      "the next skill it uses takes 47 seconds longer to recharge",
    );
  });

  it("the next skill used recharges 47 s longer, credited to the Mesmer, and the hex ends", () => {
    const match = sim();
    get(match, "a").statuses.apply("diversion", 6, "m", NO_RANKS);
    use(match, 2);
    const log = untilLengthened(match);
    const [only, ...rest] = lengthened(log);
    expect(rest).toEqual([]);
    expect(only?.entry).toMatchObject({ sourceId: "m", skillId: DIVERSION });
    expect(only?.event).toEqual({
      kind: "recharge-lengthened",
      targetId: "a",
      skillId: MALAISE,
      seconds: 47,
    });
    expect(get(match, "a").cast.rechargeRemaining.get(MALAISE)).toBeCloseTo(2 + 47, 5);
    expect(get(match, "a").statuses.has("diversion")).toBe(false);
    expect(log).toContainEqual(
      expect.objectContaining({
        sourceId: "a",
        skillId: MALAISE,
        events: [{ kind: "status-expired", targetId: "a", statusId: "diversion" }],
      }),
    );
  });

  it("leaves the skill used after it alone", () => {
    const match = sim();
    get(match, "a").statuses.apply("diversion", 6, "m", NO_RANKS);
    use(match, 2);
    stepFor(match, 2.5);
    expect(match.requestSkill("a", 3)?.check).toEqual({ ok: true });
    const log = stepFor(match, 2.5);
    expect(log.some((entry) => entry.skillId === HEALING_SIGNET)).toBe(true);
    expect(lengthened(log)).toEqual([]);
    expect(get(match, "a").cast.rechargeRemaining.get(HEALING_SIGNET)).toBeLessThanOrEqual(4);
  });

  it("an interrupted skill is not used: the hex stays", () => {
    const match = sim();
    get(match, "a").statuses.apply("diversion", 6, "m", NO_RANKS);
    use(match, 2);
    match.setTarget("m", "a");
    expect(match.requestSkill("m", 2)?.check).toEqual({ ok: true });
    const log = stepFor(match, 2);
    expect(log.some((entry) => entry.events.some((event) => event.kind === "interrupted"))).toBe(
      true,
    );
    expect(lengthened(log)).toEqual([]);
    expect(get(match, "a").statuses.has("diversion")).toBe(true);
  });

  it("a plain attack is not a skill: the hex stays", () => {
    const match = sim();
    get(match, "a").statuses.apply("diversion", 6, "m", NO_RANKS);
    expect(match.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(match, 3);
    expect(log.some((entry) => entry.cause === "weapon" && entry.sourceId === "a")).toBe(true);
    expect(lengthened(log)).toEqual([]);
    expect(get(match, "a").statuses.has("diversion")).toBe(true);
  });

  it("an attack skill is lengthened once", () => {
    const match = sim();
    get(match, "a").statuses.apply("diversion", 6, "m", NO_RANKS);
    use(match, 0);
    const log = untilLengthened(match);
    expect(lengthened(log).map(({ event }) => event.skillId)).toEqual([SWIFT_CHOP]);
    expect(get(match, "a").cast.rechargeRemaining.get(SWIFT_CHOP)).toBeCloseTo(4 + 47, 5);
  });

  it("expires unused after 6 s, changing nothing", () => {
    const match = sim();
    get(match, "a").statuses.apply("diversion", 6, "m", NO_RANKS);
    stepFor(match, 6 + DT);
    expect(get(match, "a").statuses.has("diversion")).toBe(false);
    use(match, 2);
    expect(lengthened(stepFor(match, 2.5))).toEqual([]);
    expect(get(match, "a").cast.rechargeRemaining.get(MALAISE) ?? 0).toBeLessThanOrEqual(2);
  });
});

describe("reactive hexes together (#469)", () => {
  it("both on one bearer fire once each, and trigger damage fires neither", () => {
    const match = sim();
    const bearer = get(match, "a");
    bearer.statuses.apply("empathy", 13, "m", NO_RANKS);
    bearer.statuses.apply("backfire", 10, "m", NO_RANKS);
    use(match, 0);
    const log = stepFor(match, 1);
    expect(damageTo(fired(log, EMPATHY), "a")).toEqual([39]);
    expect(fired(log, BACKFIRE)).toEqual([]);
  });
});

const SPITEFUL_SPIRIT = "necromancer.spiteful-spirit";
const INSIDIOUS_PARASITE = "necromancer.insidious-parasite";
const MARK_OF_PAIN = "necromancer.mark-of-pain";
const VAMPIRIC_GAZE = "necromancer.vampiric-gaze";

/** The Necromancer: the three curses and Vampiric Gaze, at rank 12. */
function necro(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [SPITEFUL_SPIRIT, INSIDIOUS_PARASITE, MARK_OF_PAIN, VAMPIRIC_GAZE],
    attributeRanks: new Map([
      ["necromancer.curses", 12],
      ["necromancer.blood-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e4,
    startHealthFraction: 0.5,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** Every entry `skillId`'s trigger logged, whoever put it on. */
function triggered(log: readonly CombatLogEntry[], skillId: string): CombatLogEntry[] {
  return log.filter((entry) => entry.skillId === skillId && entry.cause === "skill");
}

function eventsOf<K extends CombatLogEntry["events"][number]["kind"]>(
  entries: readonly CombatLogEntry[],
  kind: K,
): Extract<CombatLogEntry["events"][number], { kind: K }>[] {
  return entries.flatMap((entry) =>
    entry.events.filter(
      (event): event is Extract<CombatLogEntry["events"][number], { kind: K }> =>
        event.kind === kind,
    ),
  );
}

/** Each weapon blow `a` landed on `m`. */
function weaponHits(log: readonly CombatLogEntry[]): number {
  return damageTo(
    log.filter((entry) => entry.cause === "weapon" && entry.sourceId === "a"),
    "m",
  ).length;
}

describe("the Necromancer's curses are cast as their hexes (#935)", () => {
  it("each lands its hex for its rank-12 duration, from range", () => {
    const match = new MatchSimulation({
      seed: "curses",
      participants: [fighter("a", vec2(0, 0)), necro("n", vec2(300, 0))],
    });
    match.setTarget("n", "a");
    for (const [slot, statusId, seconds] of [
      [0, "spiteful-spirit", 22],
      [1, "insidious-parasite", 13],
      [2, "mark-of-pain", 30],
    ] as const) {
      expect(match.requestSkill("n", slot)?.check).toEqual({ ok: true });
      const log = stepFor(match, 3);
      expect(log.flatMap((entry) => entry.events)).toContainEqual({
        kind: "status-applied",
        targetId: "a",
        statusId,
        durationSeconds: seconds,
      });
      expect(get(match, "a").statuses.get(statusId)?.sourceId).toBe("n");
    }
  });
});

describe("Spiteful Spirit (#935)", () => {
  /**
   * Bearer `a` with ally `b` beside it and ally `far` at twice adjacent;
   * the hex's source `m` and its ally `m2`, both beside `a`.
   */
  function spiteful(weapon: Weapon = WEAPONS.axe): MatchSimulation {
    const match = new MatchSimulation({
      seed: "spiteful-spirit",
      participants: [
        fighter("a", vec2(0, 0), weapon),
        fighter("b", vec2(0, 35)),
        fighter("far", vec2(0, -80)),
        mesmer("m", vec2(40, 0)),
        mesmer("m2", vec2(-35, 0)),
      ],
    });
    get(match, "a").statuses.apply("spiteful-spirit", 22, "m", NO_RANKS);
    return match;
  }

  it("a spell costs the bearer and each ally beside it 39 shadow, once", () => {
    const match = spiteful();
    use(match, 2);
    const entries = fired(stepFor(match, 2.5), SPITEFUL_SPIRIT);
    expect(entries).toHaveLength(1);
    expect(damageTo(entries, "a")).toEqual([39]);
    expect(damageTo(entries, "b")).toEqual([39]);
    expect(damageTo(entries, "far")).toEqual([]);
    expect(damageTo(entries, "m2")).toEqual([]);
    expect(describeStatus("spiteful-spirit")).toBe(
      "takes 39 shadow damage whenever it uses a skill or attacks, " +
        "its adjacent allies take 39 shadow damage whenever it uses a skill or attacks",
    );
  });

  it("a signet fires it once, an attack skill twice", () => {
    const match = spiteful();
    expect(match.requestSkill("a", 3)?.check).toEqual({ ok: true });
    expect(damageTo(fired(stepFor(match, 2.5), SPITEFUL_SPIRIT), "a")).toEqual([39]);
    use(match, 0);
    expect(damageTo(fired(stepFor(match, 1), SPITEFUL_SPIRIT), "a")).toEqual([39, 39]);
  });

  it("each auto-attack swing fires it once", () => {
    const match = spiteful();
    expect(match.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(match, 3);
    const swings = log.filter((entry) => entry.cause === "weapon" && entry.sourceId === "a");
    expect(swings.length).toBeGreaterThanOrEqual(2);
    expect(damageTo(fired(log, SPITEFUL_SPIRIT), "a")).toEqual(swings.map(() => 39));
  });

  it("a kill by its own damage comes after the skill has landed", () => {
    const match = spiteful();
    get(match, "a").health = 30;
    use(match, 2);
    const log = stepFor(match, 2.5);
    expect(get(match, "m").statuses.has("malaise")).toBe(true);
    expect(eventsOf(fired(log, SPITEFUL_SPIRIT), "death")).toContainEqual({
      kind: "death",
      targetId: "a",
    });
  });
});

describe("Mark of Pain (#935)", () => {
  /**
   * Bearer `m`, put on by `a`, with its ally `m2` beside it and its ally
   * `m3` at twice adjacent; `a` beside `m`.
   */
  function marked(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "mark-of-pain",
      participants: [
        fighter("a", vec2(0, 0)),
        mesmer("m", vec2(40, 0)),
        mesmer("m2", vec2(75, 0)),
        mesmer("m3", vec2(40, 80)),
      ],
    });
    get(match, "m").statuses.apply("mark-of-pain", 30, "a", NO_RANKS);
    return match;
  }

  it("each physical blow costs the allies beside the bearer 34 shadow, never the bearer", () => {
    const match = marked();
    expect(match.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(match, 3);
    const hits = weaponHits(log);
    expect(hits).toBeGreaterThanOrEqual(2);
    const entries = triggered(log, MARK_OF_PAIN);
    expect(entries.map((entry) => entry.sourceId)).toEqual(entries.map(() => "a"));
    expect(damageTo(entries, "m2")).toEqual(Array.from({ length: hits }, () => 34));
    expect(damageTo(entries, "m")).toEqual([]);
    expect(damageTo(entries, "m3")).toEqual([]);
    expect(describeStatus("mark-of-pain")).toBe(
      "its adjacent allies take 34 shadow damage whenever it takes physical damage",
    );
  });

  it("the blow that kills the bearer still splashes, from where it fell (#953)", () => {
    const match = marked();
    get(match, "m").health = 1;
    expect(match.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(match, 3);
    expect(get(match, "m").dead).toBe(true);
    expect(get(match, "m").statuses.active).toEqual([]);
    const entries = triggered(log, MARK_OF_PAIN);
    expect(damageTo(entries, "m2")).toEqual([34]);
    expect(damageTo(entries, "m")).toEqual([]);
    expect(damageTo(entries, "m3")).toEqual([]);
  });

  it("two bearers side by side never chain: its damage is shadow", () => {
    const match = marked();
    get(match, "m2").statuses.apply("mark-of-pain", 30, "a", NO_RANKS);
    use(match, 0);
    const entries = triggered(stepFor(match, 1), MARK_OF_PAIN);
    expect(entries).toHaveLength(1);
    expect(damageTo(entries, "m2")).toEqual([34]);
    expect(damageTo(entries, "m")).toEqual([]);
  });

  it("an attack skill's blow is one firing, though it carries its bonus", () => {
    const match = marked();
    use(match, 0);
    expect(damageTo(triggered(stepFor(match, 1), MARK_OF_PAIN), "m2")).toEqual([34]);
  });

  it("an earth blow fires nothing: Staggering Force makes the axe's swing earth (#1021)", () => {
    const match = marked();
    get(match, "a").statuses.apply("staggering-force", 30, "a", NO_RANKS);
    expect(match.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(match, 3);
    expect(weaponHits(log)).toBeGreaterThanOrEqual(2);
    expect(triggered(log, MARK_OF_PAIN)).toEqual([]);
  });

  it("a blocked blow, a Fireball and bleeding fire nothing", () => {
    const blocked = marked();
    get(blocked, "m").statuses.apply("guardian", 30, "m", NO_RANKS);
    get(blocked, "m").statuses.apply("bleeding", 30, "a", NO_RANKS);
    expect(blocked.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(blocked, 6);
    const blocks = log.flatMap((entry) =>
      entry.events.filter((event) => event.kind === "attack-blocked"),
    );
    expect(blocks.length).toBeGreaterThan(0);
    expect(weaponHits(log)).toBeGreaterThan(0);
    // Only the blows that landed fire it; bleeding never does.
    expect(triggered(log, MARK_OF_PAIN).length).toBe(weaponHits(log));

    const fire = marked();
    use(fire, 1);
    const fireLog = stepFor(fire, 4);
    expect(damageTo(fireLog, "m").length).toBeGreaterThan(0);
    expect(triggered(fireLog, MARK_OF_PAIN)).toEqual([]);
  });
});

describe("Insidious Parasite (#935)", () => {
  /** Bearer `a`, hexed by `n`, beside its target `m`. */
  function parasite(weapon: Weapon = WEAPONS.axe): MatchSimulation {
    const match = new MatchSimulation({
      seed: "insidious-parasite",
      participants: [
        fighter("a", vec2(0, 0), weapon),
        mesmer("m", vec2(40, 0)),
        necro("n", vec2(0, 300)),
      ],
    });
    get(match, "a").statuses.apply("insidious-parasite", 13, "n", NO_RANKS);
    return match;
  }

  it("each landed blow, double strikes included, steals 39 for its caster", () => {
    for (const weapon of [WEAPONS.axe, WEAPONS.daggers]) {
      const match = parasite(weapon);
      expect(match.requestAttack("a", "m")).toEqual({ ok: true });
      const log = stepFor(match, 4);
      const hits = weaponHits(log);
      expect(hits).toBeGreaterThanOrEqual(2);
      const entries = triggered(log, INSIDIOUS_PARASITE);
      expect(entries.map((entry) => entry.sourceId)).toEqual(entries.map(() => "n"));
      expect(eventsOf(entries, "life-stolen")).toEqual(
        Array.from({ length: hits }, () => ({ kind: "life-stolen", targetId: "a", amount: 39 })),
      );
      expect(eventsOf(entries, "heal")).toEqual(
        Array.from({ length: hits }, () => ({ kind: "heal", targetId: "n", amount: 39 })),
      );
      expect(get(match, "n").health).toBe(5000 + 39 * hits);
    }
    expect(describeStatus("insidious-parasite")).toBe(
      "its caster steals 39 Health whenever it hits with an attack",
    );
  });

  it("a blocked blow and a spell steal nothing", () => {
    const blocked = parasite();
    get(blocked, "m").statuses.apply("guardian", 30, "m", NO_RANKS);
    expect(blocked.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(blocked, 4);
    expect(log.some((entry) => entry.events.some((event) => event.kind === "attack-blocked"))).toBe(
      true,
    );
    expect(triggered(log, INSIDIOUS_PARASITE).length).toBe(weaponHits(log));

    const spell = parasite();
    use(spell, 2);
    expect(triggered(stepFor(spell, 2.5), INSIDIOUS_PARASITE)).toEqual([]);
  });

  it("a dead caster steals nothing", () => {
    const match = new MatchSimulation({
      seed: "insidious-parasite",
      participants: [fighter("a", vec2(0, 0)), mesmer("m", vec2(40, 0)), necro("n", vec2(0, 300))],
      matchRules: {
        victory: "kill-count",
        scoreToWin: 10,
        timeLimitSeconds: 600,
        deathRule: "respawn",
        respawnSeconds: 100,
        deathPenalty: false,
      },
    });
    get(match, "a").statuses.apply("insidious-parasite", 13, "n", NO_RANKS);
    const caster = get(match, "n");
    caster.health = 1;
    caster.statuses.apply("bleeding", 10, "a", NO_RANKS);
    stepFor(match, 0.5);
    expect(caster.dead).toBe(true);
    expect(match.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(match, 3);
    expect(weaponHits(log)).toBeGreaterThan(0);
    expect(triggered(log, INSIDIOUS_PARASITE)).toEqual([]);
    expect(get(match, "a").health).toBe(1e4);
  });
});

describe("Vampiric Gaze (#935)", () => {
  it("steals 52 at rank 12: no armor, no adrenaline for the victim, no Mark of Pain", () => {
    const a = fighter("a", vec2(0, 0));
    const match = new MatchSimulation({
      seed: "vampiric-gaze",
      participants: [
        { ...a, skillBar: [...a.skillBar, SEVER_ARTERY], maxHealth: 4 * 52 },
        fighter("b", vec2(0, 35)),
        necro("n", vec2(300, 0)),
      ],
    });
    get(match, "a").statuses.apply("mark-of-pain", 30, "n", NO_RANKS);
    match.setTarget("n", "a");
    expect(match.requestSkill("n", 3)?.check).toEqual({ ok: true });
    const log = stepFor(match, 2);
    const gaze = log.filter((entry) => entry.skillId === VAMPIRIC_GAZE);
    expect(gaze.flatMap((entry) => entry.events)).toEqual([
      { kind: "skill-used", casterId: "n", skillId: VAMPIRIC_GAZE, targetId: "a" },
      { kind: "life-stolen", targetId: "a", amount: 52 },
      { kind: "heal", targetId: "n", amount: 52 },
    ]);
    expect(get(match, "a").health).toBe(4 * 52 - 52);
    expect(strikesOf(get(match, "a"), SEVER_ARTERY)).toBe(0);
    expect(triggered(log, MARK_OF_PAIN)).toEqual([]);
  });
});
