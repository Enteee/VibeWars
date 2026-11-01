import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { resolveMagnitudeAtRanks } from "./scaling.js";
import {
  NO_RANKS,
  HEALING_MULTIPLIER_FLOOR,
  HEALTH_PER_PIP,
  aggregateModifiers,
  type StatusId,
} from "./status.js";

/**
 * Assassin Deadly Arts staples (#1234): Shroud of Silence, Expose
 * Defenses, Enduring Toxin, Mark of Death, Disrupting Dagger, Crippling
 * Dagger and Iron Palm. Durations and pips are each skill's rank-12
 * values, as every status's are; damage is the caster's rank.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const DEADLY = "assassin.deadly-arts";
const BAR = [
  "assassin.shroud-of-silence",
  "assassin.expose-defenses",
  "assassin.enduring-toxin",
  "assassin.mark-of-death",
  "assassin.disrupting-dagger",
  "assassin.crippling-dagger",
  "assassin.iron-palm",
  "assassin.fox-fangs",
] as const;
const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<
  (typeof BAR)[number],
  number
>;
/** The foes' bar. */
const FIREBALL = 0;
const REMOVE_HEX = 1;
const ORISON = 2;
const SPRINT = 3;

function armed(weapon: "daggers" | "axe", attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS[weapon],
      attributeId,
      damageType: WEAPONS[weapon].damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** The Assassin: the seven and Fox Fangs, with daggers, at `rank` in Deadly Arts. */
function assassin(rank: number): ParticipantSpec {
  return {
    id: "s",
    team: 1,
    skillBar: [...BAR],
    attributeRanks: new Map([
      [DEADLY, rank],
      ["assassin.dagger-mastery", 12],
    ]),
    equipment: armed("daggers", "assassin.dagger-mastery"),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn: vec2(0, 0),
    facing: 0,
  };
}

/** A foe of the Assassin's with an axe, Fireball, Remove Hex, Orison of Healing and Sprint. */
function fighter(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [
      "elementalist.fireball",
      "monk.remove-hex",
      "monk.orison-of-healing",
      "warrior.sprint",
    ],
    attributeRanks: new Map([
      ["warrior.axe-mastery", 12],
      ["elementalist.fire-magic", 12],
      ["monk.healing-prayers", 12],
    ]),
    equipment: armed("axe", "warrior.axe-mastery"),
    maxHealth: 1e4,
    maxEnergy: 1000,
    spawn,
    facing: Math.PI,
  };
}

/**
 * The Assassin `s` at the origin at `rank`; foe `a` in touch, its ally
 * `b` beside it, and `x`, a second attacker on the Assassin's side.
 */
function match(rank = 12, at: Vec2 = vec2(30, 0)): MatchSimulation {
  return new MatchSimulation({
    seed: "deadly-arts",
    participants: [
      assassin(rank),
      fighter("a", at),
      fighter("b", vec2(at.x, at.y + 30)),
      { ...fighter("x", vec2(at.x, at.y - 30)), team: 1 },
    ],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `s` uses `skillId` on `targetId`, and the steps until it has landed. */
function use(sim: MatchSimulation, skillId: (typeof BAR)[number], targetId = "a") {
  sim.setTarget("s", targetId);
  expect(sim.requestSkill("s", SLOT[skillId])?.check).toEqual({ ok: true });
  return stepFor(sim, (getSkill(skillId)?.activationSeconds ?? 0) + 0.5);
}

/** `id`'s `statusId`, as who put it on and for how long. */
function worn(sim: MatchSimulation, id: string, statusId: StatusId) {
  const status = get(sim, id).statuses.get(statusId);
  return status === undefined
    ? undefined
    : { sourceId: status.sourceId, seconds: status.durationSeconds };
}

/** The events `skillId` caused in `log`. */
function eventsOf(log: readonly CombatLogEntry[], skillId: string) {
  return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

function damageTo(log: readonly CombatLogEntry[], skillId: string, id: string): number[] {
  return eventsOf(log, skillId).flatMap((event) =>
    event.kind === "damage" && event.targetId === id ? [event.amount] : [],
  );
}

describe("the seven are the corpus's (#1234)", () => {
  it.each([
    ["assassin.shroud-of-silence", "hex", true, 10, 0.75, 30],
    ["assassin.expose-defenses", "hex", false, 5, 1, 25],
    ["assassin.enduring-toxin", "hex", false, 5, 0.25, 10],
    ["assassin.mark-of-death", "hex", false, 10, 0.25, 20],
    ["assassin.disrupting-dagger", "spell", false, 5, 0.25, 10],
    ["assassin.crippling-dagger", "spell", false, 5, 1, 5],
    ["assassin.iron-palm", "skill", false, 5, 0.75, 20],
  ])("%s: a %s, elite %s, %i energy, %i s, %i s recharge", (id, type, elite, energy, act, rech) => {
    expect(getSkill(id)).toMatchObject({
      type,
      elite,
      profession: "assassin",
      attributeId: DEADLY,
      cost: { kind: "energy", amount: energy },
      activationSeconds: act,
      rechargeSeconds: rech,
    });
  });

  it.each([
    ["assassin.disrupting-dagger", [10, 30, 35]],
    ["assassin.crippling-dagger", [15, 51, 60]],
    ["assassin.iron-palm", [5, 41, 50]],
  ] as const)("%s deals %j at Deadly Arts 0, 12 and 15", (id, damage) => {
    const effect = getSkill(id)?.effects[0];
    if (effect?.kind !== "damage") {
      throw new Error(`${id} leads with no damage`);
    }
    expect(
      [0, 12, 15].map((rank) => resolveMagnitudeAtRanks(effect.amount, new Map([[DEADLY, rank]]))),
    ).toEqual(damage);
  });
});

describe("Shroud of Silence (#1234)", () => {
  it("disables the caster's spells for 15 s, not Iron Palm nor its attacks", () => {
    const sim = match();
    use(sim, "assassin.shroud-of-silence");
    const waits = get(sim, "s").cast.rechargeRemaining;
    expect(waits.get("assassin.expose-defenses")).toBeGreaterThan(14);
    expect(waits.get("assassin.disrupting-dagger")).toBeGreaterThan(14);
    expect(waits.has("assassin.iron-palm")).toBe(false);
    expect(sim.requestAttack("s", "a")).toEqual({ ok: true });
    stepFor(sim, 14.5);
    expect(get(sim, "s").cast.rechargeRemaining.has("assassin.expose-defenses")).toBe(false);
  });

  it("the touched foe cannot start a spell for 5 s, and can start anything else", () => {
    const sim = match();
    use(sim, "assassin.shroud-of-silence");
    expect(worn(sim, "a", "shroud-of-silence")).toEqual({ sourceId: "s", seconds: 5 });
    sim.setTarget("a", "s");
    expect(sim.requestSkill("a", FIREBALL)?.check).toEqual({
      ok: false,
      reason: "cannot-cast-spells",
    });
    expect(sim.requestSkill("a", SPRINT)?.check).toEqual({ ok: true });
    stepFor(sim, 5);
    expect(sim.requestSkill("a", FIREBALL)?.check).toEqual({ ok: true });
  });

  it("an ally's Remove Hex frees it at once", () => {
    const sim = match();
    use(sim, "assassin.shroud-of-silence");
    sim.setTarget("b", "a");
    expect(sim.requestSkill("b", REMOVE_HEX)?.check).toEqual({ ok: true });
    stepFor(sim, 1.5);
    expect(get(sim, "a").statuses.has("shroud-of-silence")).toBe(false);
    sim.setTarget("a", "s");
    expect(sim.requestSkill("a", FIREBALL)?.check).toEqual({ ok: true });
  });

  it("leaves a spell already being cast to go off", () => {
    const sim = match();
    sim.setTarget("a", "s");
    expect(sim.requestSkill("a", FIREBALL)?.check).toEqual({ ok: true });
    stepFor(sim, 0.25);
    const log = use(sim, "assassin.shroud-of-silence");
    log.push(...stepFor(sim, 2));
    expect(damageTo(log, "elementalist.fireball", "s").length).toBe(1);
  });
});

describe("Expose Defenses (#1234)", () => {
  it("the caster's blows are never blocked; another attacker's still are", () => {
    const sim = match();
    get(sim, "a").statuses.apply("lightning-reflexes", 60, "a", NO_RANKS);
    use(sim, "assassin.expose-defenses");
    expect(worn(sim, "a", "expose-defenses")).toEqual({ sourceId: "s", seconds: 9 });
    expect(sim.requestAttack("s", "a")).toEqual({ ok: true });
    expect(sim.requestAttack("x", "a")).toEqual({ ok: true });
    const log = stepFor(sim, 8);
    const blocked = (sourceId: string) =>
      log
        .filter((entry) => entry.sourceId === sourceId)
        .flatMap((entry) => entry.events)
        .filter((event) => event.kind === "attack-blocked").length;
    expect(blocked("s")).toBe(0);
    expect(blocked("x")).toBeGreaterThan(0);
  });
});

describe("Enduring Toxin (#1234)", () => {
  it("-4 Health degeneration for 5 s, ending on a foe standing still", () => {
    const sim = match();
    use(sim, "assassin.enduring-toxin");
    expect(worn(sim, "a", "enduring-toxin")).toEqual({ sourceId: "s", seconds: 5 });
    expect(aggregateModifiers(get(sim, "a").statuses.active).healthPips).toBe(-4);
    const before = get(sim, "a").health;
    stepFor(sim, 2);
    expect(before - get(sim, "a").health).toBeCloseTo(2 * 4 * HEALTH_PER_PIP, 0);
    stepFor(sim, 3);
    expect(get(sim, "a").statuses.has("enduring-toxin")).toBe(false);
  });

  it("renews for 5 s on a foe moving as it would end, and ends once it stands", () => {
    const sim = match();
    use(sim, "assassin.enduring-toxin");
    sim.setInputDirection("a", vec2(1, 0));
    stepFor(sim, 5);
    expect(worn(sim, "a", "enduring-toxin")).toEqual({ sourceId: "s", seconds: 5 });
    sim.setInputDirection("a", vec2(0, 0));
    stepFor(sim, 5.5);
    expect(get(sim, "a").statuses.has("enduring-toxin")).toBe(false);
  });

  it("a strip ends it for good, moving or not", () => {
    const sim = match();
    use(sim, "assassin.enduring-toxin");
    sim.setInputDirection("a", vec2(1, 0));
    sim.setTarget("b", "a");
    expect(sim.requestSkill("b", REMOVE_HEX)?.check).toEqual({ ok: true });
    stepFor(sim, 1.5);
    expect(get(sim, "a").statuses.has("enduring-toxin")).toBe(false);
  });
});

describe("Mark of Death (#1234)", () => {
  it("halves a heal for 8.8 s, as far as the 40% floor on heal cuts lets it", () => {
    const healed = (marked: boolean): number => {
      const sim = match();
      if (marked) {
        use(sim, "assassin.mark-of-death");
        expect(worn(sim, "a", "mark-of-death")).toEqual({ sourceId: "s", seconds: 8.8 });
      }
      get(sim, "a").health = 1000;
      sim.setTarget("a", "a");
      expect(sim.requestSkill("a", ORISON)?.check).toEqual({ ok: true });
      return eventsOf(stepFor(sim, 1.5), "monk.orison-of-healing").reduce(
        (sum, event) => sum + (event.kind === "heal" && event.targetId === "a" ? event.amount : 0),
        0,
      );
    };
    expect(healed(true)).toBeCloseTo(healed(false) * HEALING_MULTIPLIER_FLOOR, 0);
  });
});

describe.each([
  ["assassin.disrupting-dagger", 30],
  ["assassin.crippling-dagger", 51],
] as const)("%s (#1234)", (skillId, damage) => {
  it(`strikes for ${String(damage)} earth damage at Deadly Arts 12`, () => {
    const sim = match();
    expect(damageTo(use(sim, skillId), skillId, "a")).toEqual([damage]);
  });

  it("has half the normal range: from farther, the caster walks in first", () => {
    expect(getSkill(skillId)?.range).toBe(RANGE_SPELL / 2);
    const sim = match(12, vec2(RANGE_SPELL / 2 + 40, 0));
    sim.setTarget("s", "a");
    expect(sim.requestSkill("s", SLOT[skillId])?.check).toEqual({ ok: true });
    const from = (): number => {
      const at = sim.get("s")?.position;
      return at === undefined ? Number.NaN : RANGE_SPELL / 2 + 40 - at.x;
    };
    const log: CombatLogEntry[] = [];
    for (let tick = 0; tick < 4 / DT && damageTo(log, skillId, "a").length === 0; tick += 1) {
      log.push(...sim.step(DT).log);
    }
    expect(damageTo(log, skillId, "a")).toEqual([damage]);
    expect(from()).toBeLessThanOrEqual(RANGE_SPELL / 2);
  });
});

describe("Disrupting Dagger (#1234)", () => {
  it("interrupts whatever the foe is activating, a spell or not", () => {
    const sim = match();
    sim.setTarget("a", "s");
    expect(sim.requestSkill("a", FIREBALL)?.check).toEqual({ ok: true });
    stepFor(sim, 0.25);
    const log = use(sim, "assassin.disrupting-dagger");
    log.push(...stepFor(sim, 2));
    expect(eventsOf(log, "assassin.disrupting-dagger")).toContainEqual(
      expect.objectContaining({ kind: "interrupted", targetId: "a" }),
    );
    expect(damageTo(log, "elementalist.fireball", "s")).toEqual([]);
  });
});

describe("Crippling Dagger (#1234)", () => {
  it("cripples a moving foe for 12.6 s, read as it hits, and a still one not", () => {
    const still = match();
    use(still, "assassin.crippling-dagger");
    expect(get(still, "a").statuses.has("crippled")).toBe(false);

    const moving = match();
    moving.setInputDirection("a", vec2(1, 0));
    stepFor(moving, 0.1);
    use(moving, "assassin.crippling-dagger");
    expect(worn(moving, "a", "crippled")).toEqual({ sourceId: "s", seconds: 12.6 });
  });
});

describe("Iron Palm (#1234)", () => {
  const knockedDown = (log: readonly CombatLogEntry[]) =>
    eventsOf(log, "assassin.iron-palm").some(
      (event) => event.kind === "knocked-down" && event.targetId === "a",
    );

  it("strikes for 41 at Deadly Arts 12, and knocks down only a hexed or conditioned foe", () => {
    const clean = match();
    const log = use(clean, "assassin.iron-palm");
    expect(damageTo(log, "assassin.iron-palm", "a")).toEqual([41]);
    expect(knockedDown(log)).toBe(false);

    const hexed = match();
    get(hexed, "a").statuses.apply("mark-of-death", 10, "s", NO_RANKS);
    expect(knockedDown(use(hexed, "assassin.iron-palm"))).toBe(true);

    const bleeding = match();
    get(bleeding, "a").statuses.apply("bleeding", 10, "s", NO_RANKS);
    expect(knockedDown(use(bleeding, "assassin.iron-palm"))).toBe(true);
  });

  it("is no attack: a blocking stance does not stop it", () => {
    const sim = match();
    get(sim, "a").statuses.apply("lightning-reflexes", 60, "a", NO_RANKS);
    const log = use(sim, "assassin.iron-palm");
    expect(damageTo(log, "assassin.iron-palm", "a")).toEqual([41]);
  });

  it("counts as a lead attack: Fox Fangs follows it", () => {
    const sim = match();
    use(sim, "assassin.iron-palm");
    // Up and about again before the off-hand.
    stepFor(sim, 1);
    const log = use(sim, "assassin.fox-fangs");
    expect(
      eventsOf(log, "assassin.fox-fangs").some(
        (event) => event.kind === "attack-missed" && event.reason === "out-of-sequence",
      ),
    ).toBe(false);
    expect(damageTo(log, "assassin.fox-fangs", "a").length).toBeGreaterThan(0);
  });
});
