import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Mesmer staples (#1570): Power Leak, Blackout, Shatter Hex, Psychic
 * Instability (PvP) and Arcane Conundrum. Numbers are the corpus's at
 * rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["mesmer.fast-casting", 12],
  ["mesmer.illusion-magic", 12],
  ["mesmer.domination-magic", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function mesmer(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "m", attributeRanks: RANKS, ...overrides });
}

/** A foe `id`, 1 s into casting `casting`, which takes 3 s; `undefined`: idle. */
function foe(id: string, casting?: string, bar: readonly string[] = []): Combatant {
  const combatant = makeCombatant({ id, team: 1, skillBar: bar, energy: 30 });
  if (casting !== undefined) {
    combatant.cast.beginCast(casting, id, 3, undefined);
  }
  return combatant;
}

/** Everyone in `row` stands on the x axis at the given distance from the first. */
function placed(row: readonly (readonly [Combatant, number])[]) {
  return new Map(
    row.map(([combatant, x]) => [
      combatant.id,
      { combatant, position: vec2(x, 0), creature: undefined, corpseExploited: false },
    ]),
  );
}

/** `user` pays for `skillId` and it lands on `target`, among `around`. */
function use(
  user: Combatant,
  skillId: string,
  target: Combatant,
  around: readonly (readonly [Combatant, number])[] = [],
): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings: placed([[user, -200], [target, 0], ...around]),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

function damageIn(events: readonly CombatEvent[], id: string): number {
  return events.reduce(
    (sum, event) => (event.kind === "damage" && event.targetId === id ? sum + event.amount : sum),
    0,
  );
}

function described(id: string): string[] {
  return describeSkill(skill(id), RANKS).effects.map(({ text }) => text);
}

describe("the five are the corpus's (#1570)", () => {
  it.each([
    ["mesmer.power-leak", 24, "spell", false, "domination-magic", 10, 0.25, 20, RANGE_SPELL],
    ["mesmer.blackout", 29, "skill", false, "domination-magic", 10, 1, 12, RANGE_MELEE],
    ["mesmer.shatter-hex", 67, "spell", false, "domination-magic", 10, 1, 10, RANGE_SPELL],
    ["mesmer.psychic-instability", 1057, "spell", true, "fast-casting", 5, 0.25, 20, RANGE_SPELL],
    ["mesmer.arcane-conundrum", 36, "hex", false, "illusion-magic", 10, 2, 30, RANGE_SPELL],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attribute, energy, activation, recharge, range) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId: `mesmer.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
      });
    },
  );
});

describe("Power Leak (#1570)", () => {
  it("interrupts a spell and drains 14 energy", () => {
    const target = foe("f", "elementalist.fireball");
    const events = use(mesmer(), "mesmer.power-leak", target);
    expect(events).toContainEqual({
      kind: "interrupted",
      targetId: "f",
      skillId: "elementalist.fireball",
    });
    expect(target.energy).toBe(30 - 14);
  });

  it("on a foe using a signet: no interrupt, no energy lost", () => {
    const target = foe("f", "warrior.healing-signet");
    const events = use(mesmer(), "mesmer.power-leak", target);
    expect(events.some((event) => event.kind === "interrupted")).toBe(false);
    expect(target.cast.activeCast?.skillId).toBe("warrior.healing-signet");
    expect(target.energy).toBe(30);
  });
});

describe("Blackout (#1570)", () => {
  const FOE_BAR = ["elementalist.fireball", "warrior.healing-signet", "warrior.sprint"];
  const OWN_BAR = ["mesmer.blackout", "mesmer.power-leak", "mesmer.shatter-hex"];

  it("disables every skill on the foe's bar for 7 s, and every one on the Mesmer's for 5 s", () => {
    const user = mesmer({ skillBar: OWN_BAR });
    const target = foe("f", undefined, FOE_BAR);
    use(user, "mesmer.blackout", target);
    for (const id of FOE_BAR) {
      expect(target.cast.rechargeRemaining.get(id), id).toBe(7);
    }
    for (const id of OWN_BAR) {
      expect(user.cast.rechargeRemaining.get(id), id).toBe(5);
    }
  });

  it("does not interrupt a cast in progress", () => {
    const target = foe("f", "elementalist.fireball", FOE_BAR);
    const events = use(mesmer({ skillBar: OWN_BAR }), "mesmer.blackout", target);
    expect(events.some((event) => event.kind === "interrupted")).toBe(false);
    expect(target.cast.activeCast?.skillId).toBe("elementalist.fireball");
  });

  it("says so", () => {
    expect(described("mesmer.blackout")).toEqual([
      "All of the target's skills are disabled for 7 seconds",
      "All of your skills are disabled for 5 seconds",
    ]);
  });
});

describe("Shatter Hex (#1570)", () => {
  it("removes a hex from the ally and hits foes nearby it for 102", () => {
    const ally = makeCombatant({ id: "a" });
    ally.statuses.apply("empathy", 10, "x", NO_RANKS);
    const near = foe("near");
    const far = foe("far");
    const events = use(mesmer(), "mesmer.shatter-hex", ally, [
      [near, AREA_NEARBY],
      [far, AREA_NEARBY + 1],
    ]);
    expect(ally.statuses.has("empathy")).toBe(false);
    expect(damageIn(events, "near")).toBe(102);
    expect(damageIn(events, "far")).toBe(0);
    expect(damageIn(events, "a")).toBe(0);
  });

  it("on an unhexed ally: no damage", () => {
    const near = foe("near");
    const events = use(mesmer(), "mesmer.shatter-hex", makeCombatant({ id: "a" }), [
      [near, AREA_NEARBY],
    ]);
    expect(damageIn(events, "near")).toBe(0);
  });
});

describe("Psychic Instability (#1570)", () => {
  it("interrupting a skill knocks its user and every adjacent foe down for 3 s", () => {
    const target = foe("f", "warrior.healing-signet");
    const adjacent = foe("adj");
    const beyond = foe("beyond");
    use(mesmer(), "mesmer.psychic-instability", target, [
      [adjacent, AREA_ADJACENT],
      [beyond, AREA_ADJACENT + 1],
    ]);
    expect(target.knockdownRemaining).toBe(3);
    expect(adjacent.knockdownRemaining).toBe(3);
    expect(beyond.knockdownRemaining).toBe(0);
  });

  it("on a foe using no skill: a miss, nobody goes down", () => {
    const target = foe("f");
    const adjacent = foe("adj");
    const events = use(mesmer(), "mesmer.psychic-instability", target, [[adjacent, AREA_ADJACENT]]);
    expect(events).toContainEqual({
      kind: "interrupt-missed",
      targetId: "f",
      refusedSkillId: null,
    });
    expect(target.knockdownRemaining).toBe(0);
    expect(adjacent.knockdownRemaining).toBe(0);
  });

  it("says so", () => {
    expect(described("mesmer.psychic-instability")).toEqual([
      "Interrupts the target's action: a skill or an attack",
      "If it interrupts a skill: knocks down for 3s",
      "If it interrupts a skill: adjacent foes are knocked down for 3s",
    ]);
  });
});

describe("Arcane Conundrum (#1570)", () => {
  it("hexes the target and its adjacent foes for 13 s", () => {
    const target = foe("f");
    const adjacent = foe("adj");
    const beyond = foe("beyond");
    use(mesmer(), "mesmer.arcane-conundrum", target, [
      [adjacent, AREA_ADJACENT],
      [beyond, AREA_ADJACENT + 1],
    ]);
    expect(target.statuses.get("arcane-conundrum")?.durationSeconds).toBe(13);
    expect(adjacent.statuses.get("arcane-conundrum")?.durationSeconds).toBe(13);
    expect(beyond.statuses.has("arcane-conundrum")).toBe(false);
  });

  it("doubles spell cast time, and with Dazed makes it 4×", () => {
    expect(
      aggregateModifiers([{ id: "arcane-conundrum", ranks: NO_RANKS }]).castTimeMultiplier,
    ).toBe(2);
    expect(
      aggregateModifiers([
        { id: "arcane-conundrum", ranks: NO_RANKS },
        { id: "dazed", ranks: NO_RANKS },
      ]).castTimeMultiplier,
    ).toBe(4);
    expect(describeStatus("arcane-conundrum")).toBe(
      "spells take 2× as long to cast, its caster gains 6 energy when it ends",
    );
  });

  /** A rank-12 Mesmer with Arcane Conundrum alone, lots of energy. */
  function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
    return {
      id,
      team,
      skillBar: ["mesmer.arcane-conundrum"],
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxHealth: 500,
      maxEnergy: 1000,
      startHealthFraction: 1,
      spawn,
      facing: 0,
    };
  }

  function get(match: MatchSimulation, id: string): Participant {
    const found = match.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found;
  }

  function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      log.push(...match.step(DT).log);
    }
    return log;
  }

  const gains = (log: readonly CombatLogEntry[]) =>
    log
      .filter((entry) => entry.skillId === "mesmer.arcane-conundrum" && entry.cause === "skill")
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "energy-gain");

  /** `m` hexes `a`, with `b` adjacent to it. */
  function hexed(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "arcane-conundrum",
      participants: [
        spec("m", 0, vec2(0, 0)),
        spec("a", 1, vec2(200, 0)),
        spec("b", 1, vec2(200 + AREA_ADJACENT / 2, 0)),
      ],
    });
    match.setTarget("m", "a");
    expect(match.requestSkill("m", 0)?.check).toEqual({ ok: true });
    stepFor(match, 2.5);
    expect(get(match, "a").combatant.statuses.get("arcane-conundrum")?.sourceId).toBe("m");
    expect(get(match, "b").combatant.statuses.has("arcane-conundrum")).toBe(true);
    // Room for every gain: none is cut short at a full bar.
    get(match, "m").combatant.energy = 0;
    return match;
  }

  it("gives its caster 6 energy for each hex that runs out", () => {
    const match = hexed();
    expect(gains(stepFor(match, 10))).toEqual([]);
    expect(gains(stepFor(match, 3))).toEqual([
      { kind: "energy-gain", targetId: "m", amount: 6 },
      { kind: "energy-gain", targetId: "m", amount: 6 },
    ]);
  });

  it("and for one removed early, at once", () => {
    const match = hexed();
    get(match, "a").combatant.statuses.removeByCategory("hex");
    expect(gains(stepFor(match, DT))).toEqual([{ kind: "energy-gain", targetId: "m", amount: 6 }]);
  });
});
