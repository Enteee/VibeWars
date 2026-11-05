import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { gainStrikes } from "./adrenaline.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import type { Combatant } from "./types.js";

/**
 * Mesmer staples (#2287): Ether Lord, Spirit of Failure, Spirit Shackles,
 * Soothing Images, Chaos Storm, Psychic Distraction, Arcane Languor,
 * Illusion of Pain, Feedback and Ether Phantom, each scaled number at
 * rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const R12 = new Map([
  ["mesmer.inspiration-magic", 12],
  ["mesmer.illusion-magic", 12],
  ["mesmer.domination-magic", 12],
  ["mesmer.fast-casting", 12],
]);
const R0: ReadonlyMap<string, number> = new Map();

const ETHER_LORD = "mesmer.ether-lord";
const FAILURE = "mesmer.spirit-of-failure";
const SHACKLES = "mesmer.spirit-shackles";
const SOOTHING = "mesmer.soothing-images";
const CHAOS = "mesmer.chaos-storm";
const PSYCHIC = "mesmer.psychic-distraction";
const LANGUOR = "mesmer.arcane-languor";
const PAIN = "mesmer.illusion-of-pain";
const FEEDBACK = "mesmer.feedback";
const PHANTOM = "mesmer.ether-phantom";
const ORISON = "monk.orison-of-healing";
const SEVER = "warrior.sever-artery";

const AXE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.axe,
    attributeId: "warrior.axe-mastery",
    damageType: WEAPONS.axe.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[],
  attributeRanks: ReadonlyMap<string, number>,
  equipment = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks,
    equipment,
    maxHealth: 1e5,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/**
 * `c`, the Mesmer of team 0, with `bar` at `ranks`; `ally` beside it.
 * `foe`, of team 1, at hand with an axe, a heal and an adrenaline attack;
 * `foeAlly` beside it.
 */
function arena(bar: readonly string[], ranks: ReadonlyMap<string, number> = R12) {
  return new MatchSimulation({
    seed: "staples-mesmer-10",
    participants: [
      spec("c", 0, vec2(0, 0), bar, ranks),
      spec("ally", 0, vec2(0, 30), [], R0),
      spec(
        "foe",
        1,
        vec2(30, 0),
        [ORISON, SEVER],
        new Map([
          ["monk.healing-prayers", 12],
          ["warrior.axe-mastery", 12],
        ]),
        AXE,
      ),
      spec("foeAlly", 1, vec2(30, 30), [], R0),
    ],
  });
}

function get(match: MatchSimulation, id: string): Combatant {
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

/** `id` uses the skill in `slot` on `targetId`, and what follows for `seconds`. */
function cast(
  match: MatchSimulation,
  id: string,
  slot: number,
  targetId: string,
  seconds = 3.5,
): CombatLogEntry[] {
  match.setTarget(id, targetId);
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
  return stepFor(match, seconds);
}

function eventsOf(entries: readonly CombatLogEntry[], skillId: string) {
  return entries.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

function kinds(entries: readonly CombatLogEntry[], kind: string): number {
  return entries.flatMap((entry) => entry.events).filter((event) => event.kind === kind).length;
}

describe("the ten are the corpus's (#2287)", () => {
  it.each([
    [ETHER_LORD, 41, "hex", false, 5, 2, 20],
    [FAILURE, 48, "hex", false, 15, 3, 20],
    [SHACKLES, 66, "hex", false, 10, 3, 8],
    [SOOTHING, 56, "hex", false, 15, 2, 8],
    [CHAOS, 77, "spell", false, 5, 2, 30],
    [PSYCHIC, 1053, "spell", true, 10, 0.25, 2],
    [LANGUOR, 804, "hex", true, 10, 2, 15],
    [PAIN, 879, "hex", false, 10, 2, 5],
    [FEEDBACK, 1061, "spell", false, 10, 1, 30],
    [PHANTOM, 1343, "hex", false, 5, 1, 10],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, energy, activationSeconds, rechargeSeconds) => {
      expect(getSkill(id)).toMatchObject({
        gwId,
        type,
        elite,
        cost: { kind: "energy", amount: energy },
        activationSeconds,
        rechargeSeconds,
        range: RANGE_SPELL,
      });
    },
  );
});

describe("Ether Lord (#2287)", () => {
  it.each([
    [R12, 9, 3],
    [R0, 5, 1],
  ])(
    "drains its caster, degenerates the foe and regenerates the caster",
    (ranks, seconds, pips) => {
      const match = arena([ETHER_LORD], ranks);
      const c = get(match, "c");
      const foe = get(match, "foe");
      c.energy = 40;
      cast(match, "c", 0, "foe", 2.1);
      expect(c.energy).toBeLessThan(1);
      expect(foe.statuses.get("ether-lord")?.durationSeconds).toBe(seconds);
      expect(c.statuses.get("ether-lord-regeneration")?.durationSeconds).toBe(seconds);
      expect(aggregateModifiers(foe.statuses.active).energyPips).toBe(-pips);
      expect(aggregateModifiers(c.statuses.active).energyPips).toBe(pips);
    },
  );

  it("casts on its bare cost, leaving nothing", () => {
    const match = arena([ETHER_LORD]);
    const c = get(match, "c");
    c.energy = 5;
    cast(match, "c", 0, "foe", 2.1);
    expect(get(match, "foe").statuses.has("ether-lord")).toBe(true);
    expect(c.energy).toBeLessThan(1);
  });
});

describe("Spirit of Failure (#2287)", () => {
  it.each([
    [R12, 3],
    [R0, 1],
  ])("pays its caster for each blow that fails, never for one that lands", (ranks, energy) => {
    const match = arena([FAILURE], ranks);
    const c = get(match, "c");
    cast(match, "c", 0, "foe");
    expect(get(match, "foe").statuses.get("spirit-of-failure")?.durationSeconds).toBe(30);
    c.statuses.apply("guardian", 30, "c", NO_RANKS);
    c.energy = 0;
    expect(match.requestAttack("foe", "c")).toEqual({ ok: true });
    const log = stepFor(match, 20);
    const failed = kinds(log, "attack-missed") + kinds(log, "attack-blocked");
    expect(failed).toBeGreaterThan(0);
    expect(kinds(log, "damage")).toBeGreaterThan(0);
    expect(eventsOf(log, FAILURE)).toEqual(
      Array.from({ length: failed }, () => ({
        kind: "energy-gain",
        targetId: "c",
        amount: energy,
      })),
    );
  });
});

describe("Spirit Shackles (#2287)", () => {
  it.each([
    [R12, 17],
    [R0, 5],
  ])("costs the foe 5 Energy for each attack, nothing while it does not", (ranks, seconds) => {
    const match = arena([SHACKLES], ranks);
    const foe = get(match, "foe");
    cast(match, "c", 0, "foe");
    expect(foe.statuses.get("spirit-shackles")?.durationSeconds).toBe(seconds);
    foe.energy = 50;
    expect(eventsOf(stepFor(match, 1), SHACKLES)).toEqual([]);
    expect(match.requestAttack("foe", "c")).toEqual({ ok: true });
    const losses = eventsOf(stepFor(match, 3), SHACKLES);
    expect(losses.length).toBeGreaterThan(0);
    expect(losses.every((event) => event.kind === "energy-loss" && event.amount === 5)).toBe(true);
  });
});

describe("Soothing Images (#2287)", () => {
  it.each([
    [R12, 18],
    [R0, 8],
  ])("hexes the foe and the foes adjacent, not an ally", (ranks, seconds) => {
    const match = arena([SOOTHING], ranks);
    cast(match, "c", 0, "foe");
    expect(get(match, "foe").statuses.get("soothing-images")?.durationSeconds).toBe(seconds);
    expect(get(match, "foeAlly").statuses.get("soothing-images")?.durationSeconds).toBe(seconds);
    expect(get(match, "ally").statuses.has("soothing-images")).toBe(false);
    expect(describeStatus("soothing-images")).toBe("cannot gain adrenaline");
  });

  it("keeps the adrenaline held, gains none, and gains again once it ends", () => {
    const match = arena([SOOTHING]);
    const foe = get(match, "foe");
    gainStrikes(foe, 1, 0);
    const held = foe.adrenaline.get(SEVER);
    expect(held).toBeGreaterThan(0);
    cast(match, "c", 0, "foe");
    expect(gainStrikes(foe, 1, 0)).toBe(false);
    expect(foe.adrenaline.get(SEVER)).toBe(held);
    foe.statuses.remove("soothing-images");
    expect(gainStrikes(foe, 1, 0)).toBe(true);
    expect(foe.adrenaline.get(SEVER)).toBeGreaterThan(held ?? 0);
  });
});

describe("Chaos Storm (#2287)", () => {
  it.each([
    [R12, 21, 2],
    [R0, 5, 0],
  ])(
    "strikes and drains the foes at the spot each second, never an ally",
    (ranks, damage, energy) => {
      const match = arena([CHAOS], ranks);
      const foe = get(match, "foe");
      const log = cast(match, "c", 0, "foe", 6);
      const events = eventsOf(log, CHAOS);
      const hits = events.filter((event) => event.kind === "damage" && event.targetId === "foe");
      expect(hits.length).toBeGreaterThan(2);
      expect(hits.every((event) => event.kind === "damage" && event.amount === damage)).toBe(true);
      expect(events.some((event) => event.kind === "damage" && event.targetId === "foeAlly")).toBe(
        true,
      );
      expect(events.some((event) => event.targetId === "ally" || event.targetId === "c")).toBe(
        false,
      );
      const losses = events.filter(
        (event) => event.kind === "energy-loss" && event.targetId === "foe",
      );
      expect(losses.every((event) => event.kind === "energy-loss" && event.amount === energy)).toBe(
        true,
      );
      expect(losses.length > 0).toBe(energy > 0);
      expect(foe.energy < 100).toBe(energy > 0);
    },
  );
});

describe("Psychic Distraction (#2287)", () => {
  it.each([
    [R12, 11],
    [R0, 5],
  ])("interrupts a skill in use and disables it the more", (ranks, seconds) => {
    const match = arena([PSYCHIC, FEEDBACK], ranks);
    match.setTarget("foe", "foeAlly");
    expect(match.requestSkill("foe", 0)?.check).toEqual({ ok: true });
    stepFor(match, 0.2);
    const log = cast(match, "c", 0, "foe", 0.5);
    expect(eventsOf(log, PSYCHIC)).toContainEqual({
      kind: "interrupted",
      targetId: "foe",
      skillId: ORISON,
    });
    const wait = get(match, "foe").cast.rechargeRemaining.get(ORISON) ?? 0;
    expect(wait).toBeGreaterThan(seconds - 1);
    expect(wait).toBeLessThanOrEqual(seconds);
  });

  it("disables its caster's other skills 8 s, not itself, whether or not it interrupts", () => {
    const match = arena([PSYCHIC, FEEDBACK]);
    const log = cast(match, "c", 0, "foe", 0.5);
    expect(log.flatMap((entry) => entry.events)).not.toContainEqual(
      expect.objectContaining({ kind: "interrupted" }),
    );
    expect(get(match, "foe").cast.rechargeRemaining.get(ORISON)).toBeUndefined();
    const waits = get(match, "c").cast.rechargeRemaining;
    expect(waits.get(FEEDBACK)).toBeGreaterThan(7);
    expect(waits.get(PSYCHIC)).toBeLessThanOrEqual(2);
  });
});

describe("Arcane Languor (#2287)", () => {
  it.each([
    [R12, 8],
    [R0, 1],
  ])("overcasts the foe 10 for a spell it casts while hexed", (ranks, seconds) => {
    const match = arena([LANGUOR], ranks);
    const foe = get(match, "foe");
    cast(match, "c", 0, "foe", 2);
    expect(foe.statuses.get("arcane-languor")?.durationSeconds).toBe(seconds);
    cast(match, "foe", 0, "foeAlly", 2);
    // Overcast wears off as it goes: 10 as the spell lands, a little less since.
    expect(foe.overcast > 9).toBe(seconds > 2);
  });
});

describe("Illusion of Pain (#2287)", () => {
  it.each([
    [R12, 9, 103],
    [R0, 3, 36],
  ])("degenerates, strikes each second, and heals as it ends", (ranks, damage, heal) => {
    const match = arena([PAIN], ranks);
    const foe = get(match, "foe");
    foe.health = 5e4;
    cast(match, "c", 0, "foe", 2);
    expect(foe.statuses.get("illusion-of-pain")?.durationSeconds).toBe(8);
    expect(aggregateModifiers(foe.statuses.active).healthPips).toBeLessThan(0);
    const log = stepFor(match, 9);
    const events = eventsOf(log, PAIN);
    const hits = events.filter((event) => event.kind === "damage");
    expect(hits.length).toBe(8);
    expect(hits.every((event) => event.amount === damage)).toBe(true);
    expect(events.filter((event) => event.kind === "heal")).toEqual([
      { kind: "heal", targetId: "foe", amount: heal },
    ]);
    expect(foe.statuses.has("illusion-of-pain")).toBe(false);
  });

  it("heals once when reapplied, and the new hex runs its full 8 s", () => {
    const match = arena([PAIN]);
    const foe = get(match, "foe");
    foe.health = 5e4;
    const first = cast(match, "c", 0, "foe", 7.5);
    expect(eventsOf(first, PAIN).filter((event) => event.kind === "heal")).toEqual([]);
    const second = cast(match, "c", 0, "foe", 2);
    expect(eventsOf(second, PAIN).filter((event) => event.kind === "heal")).toEqual([
      { kind: "heal", targetId: "foe", amount: 103 },
    ]);
    expect(foe.statuses.get("illusion-of-pain")?.remainingSeconds).toBeGreaterThan(6);
  });
});

describe("Feedback (#2287)", () => {
  it.each([
    [R12, 9],
    [R0, 4],
  ])("drains the foe only if it took an enchantment", (ranks, energy) => {
    const match = arena([FEEDBACK], ranks);
    const foe = get(match, "foe");
    foe.energy = 50;
    expect(eventsOf(cast(match, "c", 0, "foe", 1.5), FEEDBACK)).not.toContainEqual(
      expect.objectContaining({ kind: "energy-loss" }),
    );

    const enchanted = arena([FEEDBACK], ranks);
    const target = get(enchanted, "foe");
    target.energy = 50;
    target.statuses.apply("aegis", 60, "foe", NO_RANKS);
    const log = cast(enchanted, "c", 0, "foe", 1.5);
    expect(target.statuses.has("aegis")).toBe(false);
    expect(eventsOf(log, FEEDBACK)).toContainEqual({
      kind: "energy-loss",
      targetId: "foe",
      amount: energy,
    });
  });
});

describe("Ether Phantom (#2287)", () => {
  it.each([
    [R12, 4],
    [R0, 1],
  ])("drains the foe when removed early", (ranks, energy) => {
    const match = arena([PHANTOM], ranks);
    const foe = get(match, "foe");
    cast(match, "c", 0, "foe", 1.5);
    expect(aggregateModifiers(foe.statuses.active).energyPips).toBe(-1);
    foe.energy = 50;
    foe.statuses.remove("ether-phantom");
    expect(eventsOf(stepFor(match, DT), PHANTOM)).toContainEqual({
      kind: "energy-loss",
      targetId: "foe",
      amount: energy,
    });
  });

  it("costs nothing when it runs its 10 s", () => {
    const match = arena([PHANTOM]);
    const foe = get(match, "foe");
    cast(match, "c", 0, "foe", 1.5);
    foe.energy = 50;
    const log = stepFor(match, 10);
    expect(foe.statuses.has("ether-phantom")).toBe(false);
    expect(eventsOf(log, PHANTOM)).not.toContainEqual(
      expect.objectContaining({ kind: "energy-loss" }),
    );
  });
});
