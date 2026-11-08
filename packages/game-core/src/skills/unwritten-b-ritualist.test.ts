import { describe, expect, it } from "vitest";

import { AREA_IN_THE_AREA, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import type { MatchRules } from "../match-rules.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import { NO_RANKS, getStatusDefinition } from "./status.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Unwritten corpus skills (#2500), Ritualist: Lively Was Naomei, Vocal Was
 * Sogolon, Wielder's Zeal, Sight Beyond Sight, Wielder's Remedy and
 * Caretaker's Charge. The corpus's records, every scaled number at rank 0
 * and rank 12, and one behaviour each.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const STAY_DEAD: MatchRules = {
  victory: "kill-count",
  scoreToWin: 99,
  timeLimitSeconds: 600,
  deathRule: "resurrection-only",
  respawnSeconds: 1,
  respawnOnWave: false,
  deathPenalty: false,
};

const LIVELY = "ritualist.lively-was-naomei";
const VOCAL = "ritualist.vocal-was-sogolon";
const ZEAL = "ritualist.wielders-zeal";
const SIGHT = "ritualist.sight-beyond-sight";
const REMEDY = "ritualist.wielders-remedy";
const CARETAKER = "ritualist.caretakers-charge";
const WARDING = "ritualist.weapon-of-warding";
const JUSTICE = "warrior.for-great-justice";

const RESTORATION = "ritualist.restoration-magic";
const SPAWNING = "ritualist.spawning-power";
const CHANNELING = "ritualist.channeling-magic";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[] = [],
  rank = 0,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks: new Map([RESTORATION, SPAWNING, CHANNELING].map((a) => [a, rank])),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

function match(...participants: ParticipantSpec[]): MatchSimulation {
  const sim = new MatchSimulation({ seed: "unwritten-2500", matchRules: STAY_DEAD, participants });
  for (const participant of sim.participants()) {
    participant.combatant.energy = participant.combatant.maxEnergy;
  }
  return sim;
}

function get(sim: MatchSimulation, id: string): Combatant {
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

/** `casterId` uses the skill in `slot` on `targetId`, then steps past its activation and aftercast. */
function use(sim: MatchSimulation, casterId: string, slot: number, targetId: string, id: string) {
  sim.setTarget(casterId, targetId);
  expect(sim.requestSkill(casterId, slot)?.check).toEqual({ ok: true });
  return stepFor(sim, skill(id).activationSeconds + 1);
}

const eventsOf = (log: readonly CombatLogEntry[], skillId: string): CombatEvent[] =>
  log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);

/** The scaled duration `id` applies, its only effect. */
const durationOf = (id: string) => {
  const [effect] = skill(id).effects;
  return effect?.kind === "apply-status" ? effect.durationSeconds : undefined;
};

describe("the six are the corpus's (#2500)", () => {
  it.each([
    [LIVELY, 1222, "item-spell", false, RESTORATION, 15, 6, 20, "self"],
    [VOCAL, 1731, "item-spell", false, RESTORATION, 10, 1, 30, "self"],
    [ZEAL, 1737, "enchantment", true, SPAWNING, 5, 1, 10, "self"],
    [SIGHT, 1738, "enchantment", false, SPAWNING, 5, 0.25, 15, "self"],
    [REMEDY, 1740, "enchantment", false, SPAWNING, 3, 1, 10, "self"],
    [CARETAKER, 1744, "spell", true, CHANNELING, 5, 1, 4, "single-enemy"],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attributeId, energy, activation, recharge, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: { kind: "energy", amount: energy },
        overcast: 0,
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );
});

describe("the six describe themselves (#2500)", () => {
  it.each([LIVELY, VOCAL, ZEAL, SIGHT, REMEDY, CARETAKER])("%s at rank 12", (id) => {
    const ranks = new Map([RESTORATION, SPAWNING, CHANNELING].map((a) => [a, 12]));
    const text = describeSkill(skill(id), ranks).effects.map((line) => line.text);
    expect(text.length).toBeGreaterThan(0);
  });

  it.each([
    "lively-was-naomei",
    "vocal-was-sogolon",
    "wielders-zeal",
    "sight-beyond-sight",
    "wielders-remedy",
  ] as const)("status %s", (id) => {
    expect(describeStatus(id)).not.toBe("");
  });
});

describe("Lively Was Naomei (#2500)", () => {
  it("holds the ashes 45 s, raising at 15...75% Health: 15 at rank 0, 63 at rank 12", () => {
    expect(durationOf(LIVELY)).toEqual({ flat: 45 });
    expect(getStatusDefinition("lively-was-naomei")).toMatchObject({
      category: "item",
      triggers: [
        {
          on: "ends",
          effects: [
            {
              kind: "splash",
              hits: "party",
              radius: AREA_IN_THE_AREA,
              dead: true,
              includesCentre: true,
              effects: [
                {
                  kind: "resurrect",
                  health: {
                    kind: "percent",
                    percent: { scaling: { attributeId: RESTORATION, atZero: 15, atTwelve: 63 } },
                  },
                  energyPercent: { flat: 0 },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it.each([
    [12, 0.63],
    [0, 0.15],
  ])("at rank %i, dropped by another item spell, raises the dead ally at %d", (rank, fraction) => {
    const sim = match(
      spec("r", 0, vec2(0, 0), [LIVELY, VOCAL], rank),
      spec("a", 0, vec2(AREA_IN_THE_AREA - 20, 0)),
      spec("far", 0, vec2(0, AREA_IN_THE_AREA + 80)),
      spec("x", 1, vec2(900, 0)),
    );
    for (const id of ["a", "far"]) {
      const victim = get(sim, id);
      victim.statuses.apply("burning", 10, "x", NO_RANKS);
      victim.health = 0.2;
    }
    sim.step(DT);
    expect(get(sim, "a").dead).toBe(true);
    use(sim, "r", 0, "r", LIVELY);
    expect(get(sim, "r").statuses.has("lively-was-naomei")).toBe(true);
    const log = use(sim, "r", 1, "r", VOCAL);
    const raised = log
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "resurrected");
    expect(raised).toEqual([
      { kind: "resurrected", targetId: "a", healthFraction: fraction, energyFraction: 0 },
    ]);
    expect(get(sim, "far").dead).toBe(true);
  });

  it.each([
    [12, 0.63],
    [0, 0.15],
  ])("at rank %i, the holder who dies holding them rises at %d with the ally", (rank, fraction) => {
    const sim = match(
      spec("r", 0, vec2(0, 0), [LIVELY], rank),
      spec("a", 0, vec2(AREA_IN_THE_AREA - 20, 0)),
      spec("x", 1, vec2(900, 0)),
    );
    const ally = get(sim, "a");
    ally.statuses.apply("burning", 10, "x", NO_RANKS);
    ally.health = 0.2;
    sim.step(DT);
    expect(ally.dead).toBe(true);
    use(sim, "r", 0, "r", LIVELY);
    const holder = get(sim, "r");
    holder.statuses.apply("imagined-burden", 20, "x", NO_RANKS);
    holder.statuses.apply("burning", 10, "x", NO_RANKS);
    holder.health = 0.2;
    const raised = stepFor(sim, 1)
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "resurrected");
    expect(raised).toEqual([
      { kind: "resurrected", targetId: "r", healthFraction: fraction, energyFraction: 0 },
      { kind: "resurrected", targetId: "a", healthFraction: fraction, energyFraction: 0 },
    ]);
    // Raised after the death's own clears, not wiped by them.
    expect(holder.dead).toBe(false);
    expect(holder.health).toBeCloseTo(500 * fraction);
    expect(holder.energy).toBe(0);
    expect(holder.statuses.has("imagined-burden")).toBe(false);
    expect(holder.statuses.has("lively-was-naomei")).toBe(false);
  });
});

describe("Vocal Was Sogolon (#2500)", () => {
  it("lasts 60 s; shouts and chants last 20% longer at rank 0, 44% at rank 12", () => {
    expect(durationOf(VOCAL)).toEqual({ flat: 60 });
    const scaling = { scaling: { attributeId: RESTORATION, atZero: 1.2, atTwelve: 1.44 } };
    expect(getStatusDefinition("vocal-was-sogolon")).toMatchObject({
      category: "item",
      ownSkillModifiers: [
        { filter: { type: "shout" }, durationMultiplier: scaling },
        { filter: { type: "chant" }, durationMultiplier: scaling },
      ],
    });
  });

  it.each([
    [12, 8 * 1.44],
    [0, 8 * 1.2],
  ])("at rank %i, For Great Justice! lasts %d s", (rank, seconds) => {
    const sim = match(spec("r", 0, vec2(0, 0), [VOCAL, JUSTICE], rank), spec("x", 1, vec2(900, 0)));
    use(sim, "r", 0, "r", VOCAL);
    sim.setTarget("r", "r");
    expect(sim.requestSkill("r", 1)?.check).toEqual({ ok: true });
    sim.step(DT);
    expect(get(sim, "r").statuses.get("for-great-justice")?.durationSeconds).toBeCloseTo(seconds);
  });
});

describe("Wielder's Zeal (#2500)", () => {
  it("lasts 10...40 s and gives 1...5 Energy: 10 and 1 at rank 0, 34 and 4.2 at rank 12", () => {
    expect(durationOf(ZEAL)).toEqual({
      scaling: { attributeId: SPAWNING, atZero: 10, atTwelve: 34 },
    });
    expect(getStatusDefinition("wielders-zeal")).toMatchObject({
      category: "enchantment",
      triggers: [
        {
          on: "bearer-casts-spell",
          usedSkill: { type: "weapon-spell", targets: "ally" },
          effects: [
            {
              kind: "energy-gain",
              amount: { scaling: { attributeId: SPAWNING, atZero: 1, atTwelve: 4.2 } },
            },
          ],
          target: "bearer",
        },
      ],
    });
  });

  it.each([
    [12, 4],
    [0, 1],
  ])("at rank %i, a weapon spell on an ally gives %i Energy", (rank, energy) => {
    const sim = match(
      spec("r", 0, vec2(0, 0), [ZEAL, WARDING], rank),
      spec("a", 0, vec2(200, 0)),
      spec("x", 1, vec2(900, 0)),
    );
    use(sim, "r", 0, "r", ZEAL);
    get(sim, "r").energy = 30;
    const log = use(sim, "r", 1, "a", WARDING);
    expect(eventsOf(log, ZEAL)).toContainEqual({
      kind: "energy-gain",
      targetId: "r",
      amount: energy,
    });
  });
});

describe("Sight Beyond Sight (#2500)", () => {
  it("lasts 8...20 s: 8 at rank 0, 17.6 at rank 12", () => {
    expect(durationOf(SIGHT)).toEqual({
      scaling: { attributeId: SPAWNING, atZero: 8, atTwelve: 17.6 },
    });
    expect(getStatusDefinition("sight-beyond-sight")).toMatchObject({
      category: "enchantment",
      immuneTo: ["blind"],
    });
  });

  it("its bearer cannot be Blinded, and a Blindness on it ends", () => {
    const sim = match(spec("r", 0, vec2(0, 0), [SIGHT], 12), spec("x", 1, vec2(900, 0)));
    const r = get(sim, "r");
    r.statuses.apply("blind", 10, "x", NO_RANKS);
    expect(r.statuses.has("blind")).toBe(true);
    use(sim, "r", 0, "r", SIGHT);
    expect(r.statuses.has("sight-beyond-sight")).toBe(true);
    expect(r.statuses.has("blind")).toBe(false);
    expect(r.statuses.isImmuneTo("blind")).toBe(true);
  });
});

describe("Wielder's Remedy (#2500)", () => {
  it("lasts 10...30 s: 10 at rank 0, 26 at rank 12; the ally loses 2 conditions", () => {
    expect(durationOf(REMEDY)).toEqual({
      scaling: { attributeId: SPAWNING, atZero: 10, atTwelve: 26 },
    });
    expect(getStatusDefinition("wielders-remedy")).toMatchObject({
      category: "enchantment",
      triggers: [
        {
          on: "bearer-casts-spell",
          usedSkill: { type: "weapon-spell", targets: "ally" },
          effects: [{ kind: "remove-status", category: "condition", count: 2 }],
          target: "skill-target",
        },
      ],
    });
  });

  it("a weapon spell on an ally takes 2 of its 3 conditions", () => {
    const sim = match(
      spec("r", 0, vec2(0, 0), [REMEDY, WARDING], 12),
      spec("a", 0, vec2(200, 0)),
      spec("x", 1, vec2(900, 0)),
    );
    use(sim, "r", 0, "r", REMEDY);
    const a = get(sim, "a");
    for (const id of ["bleeding", "poison", "weakness"] as const) {
      a.statuses.apply(id, 20, "x", NO_RANKS);
    }
    use(sim, "r", 1, "a", WARDING);
    const left = ["bleeding", "poison", "weakness"].filter((id) =>
      a.statuses.has(id as "bleeding" | "poison" | "weakness"),
    );
    expect(left).toHaveLength(1);
  });
});

describe("Caretaker's Charge (#2500)", () => {
  it("strikes for 20...85 lightning, and holding an item gives 7 Energy and 5...50 Health", () => {
    expect(skill(CARETAKER).effects).toMatchObject([
      {
        kind: "damage",
        amount: { scaling: { attributeId: CHANNELING, atZero: 20, atTwelve: 72 } },
        type: "lightning",
      },
      {
        kind: "if",
        condition: { kind: "caster-holds-item" },
        effects: [
          { kind: "energy-gain", amount: { flat: 7 } },
          {
            kind: "heal",
            amount: { scaling: { attributeId: CHANNELING, atZero: 5, atTwelve: 41 } },
            recipient: "caster",
          },
        ],
      },
    ]);
  });

  function charge(rank: number, holding: boolean): CombatEvent[] {
    const sim = match(spec("r", 0, vec2(0, 0), [CARETAKER], rank), spec("x", 1, vec2(300, 0)));
    const r = get(sim, "r");
    if (holding) {
      r.statuses.apply("mighty-was-vorizun", 50, "r", NO_RANKS);
    }
    r.energy = 30;
    r.health = 100;
    return eventsOf(use(sim, "r", 0, "x", CARETAKER), CARETAKER);
  }

  it.each([
    [12, 41],
    [0, 5],
  ])("at rank %i, holding an item, the caster gains 7 Energy and %i Health", (rank, health) => {
    const events = charge(rank, true);
    expect(events).toContainEqual(expect.objectContaining({ kind: "damage", targetId: "x" }));
    expect(events).toContainEqual({ kind: "energy-gain", targetId: "r", amount: 7 });
    expect(events).toContainEqual({ kind: "heal", targetId: "r", amount: health });
  });

  it("with no item in hand, it only strikes", () => {
    const events = charge(12, false);
    expect(events).toContainEqual(expect.objectContaining({ kind: "damage", targetId: "x" }));
    expect(events.filter((e) => e.kind === "energy-gain" || e.kind === "heal")).toEqual([]);
  });
});
