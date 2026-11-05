import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import { aggregateModifiers } from "./status.js";
import type { Combatant } from "./types.js";

/**
 * Monk staples (#2286): Essence Bond, Life Barrier, Retribution, Scourge
 * Healing, Healing Seed, Succor, Divine Boon and Restful Breeze, each at
 * rank 12 and at rank 0. Balthazar's Spirit is left out: its adrenaline
 * is in points, 2...4 of a strike's 25, which whole strikes cannot hold.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const R12 = new Map([
  ["monk.healing-prayers", 12],
  ["monk.protection-prayers", 12],
  ["monk.smiting-prayers", 12],
  ["monk.divine-favor", 12],
]);
const R0: ReadonlyMap<string, number> = new Map();

const BOND = "monk.essence-bond";
const BARRIER = "monk.life-barrier";
const RETRIBUTION = "monk.retribution";
const SCOURGE = "monk.scourge-healing";
const SEED = "monk.healing-seed";
const SUCCOR = "monk.succor";
const BOON = "monk.divine-boon";
const BREEZE = "monk.restful-breeze";
const FLARE = "elementalist.flare";
const SMITE = "monk.smite";
const ORISON = "monk.orison-of-healing";
const GUARDIAN = "monk.guardian";
const AEGIS = "monk.aegis";

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[],
  attributeRanks: ReadonlyMap<string, number>,
  sword = false,
): ParticipantSpec {
  const unarmed = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel);
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks,
    equipment: sword
      ? {
          ...unarmed,
          mainHand: {
            weapon: WEAPONS.sword,
            attributeId: "warrior.swordsmanship",
            damageType: WEAPONS.sword.damageType,
            requirementMet: true,
            creatureDamageScale: undefined,
          },
        }
      : unarmed,
    maxHealth: 1e5,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/**
 * `c`, the Monk of team 0, with `bar` at `ranks`; `ally` beside it, with
 * a heal, and `ally2` beside that. `foe`, of team 1, at hand, with a
 * sword, a fire spell, a holy one and a heal; `foeAlly` beside it.
 */
function arena(bar: readonly string[], ranks: ReadonlyMap<string, number> = R12) {
  return new MatchSimulation({
    seed: "staples-monk-9",
    participants: [
      spec("c", 0, vec2(0, 0), bar, ranks),
      spec("ally", 0, vec2(0, 30), [ORISON, FLARE], new Map([["monk.healing-prayers", 12]])),
      spec("ally2", 0, vec2(20, 40), [], R0),
      spec(
        "foe",
        1,
        vec2(30, 0),
        [FLARE, SMITE, ORISON],
        new Map([
          ["elementalist.fire-magic", 12],
          ["monk.smiting-prayers", 12],
          ["monk.healing-prayers", 12],
        ]),
        true,
      ),
      spec("foeAlly", 1, vec2(60, 0), [], R0),
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
  seconds = 3,
): CombatLogEntry[] {
  match.setTarget(id, targetId);
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
  return stepFor(match, seconds);
}

function eventsOf(entries: readonly CombatLogEntry[], skillId: string) {
  return entries.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

describe("the eight are the corpus's (#2286)", () => {
  it.each([
    [BOND, 250, "enchantment", false, 10, 2, 0, "single-ally"],
    [BARRIER, 270, "enchantment", true, 15, 2, 5, "single-other-ally"],
    [RETRIBUTION, 248, "enchantment", false, 10, 2, 0, "single-ally"],
    [SCOURGE, 251, "hex", false, 10, 2, 5, "single-enemy"],
    [SEED, 274, "enchantment", false, 10, 2, 25, "single-other-ally"],
    [SUCCOR, 308, "enchantment", false, 5, 1, 10, "single-other-ally"],
    [BOON, 284, "enchantment", false, 5, 0.25, 10, "self"],
    [BREEZE, 886, "enchantment", false, 5, 1, 8, "single-ally"],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, energy, activationSeconds, rechargeSeconds, target) => {
      expect(getSkill(id)).toMatchObject({
        gwId,
        type,
        elite,
        cost: { kind: "energy", amount: energy },
        activationSeconds,
        rechargeSeconds,
        range: RANGE_SPELL,
        target,
      });
    },
  );
});

describe("Essence Bond (#2286)", () => {
  it.each([
    ["fire", FLARE, 1],
    ["holy", SMITE, 0],
  ] as const)("a foe's %s spell on the ally gives its Monk %i Energy", (_, skill, gained) => {
    const match = arena([BOND]);
    cast(match, "c", 0, "ally");
    expect(get(match, "ally").statuses.has("essence-bond")).toBe(true);
    // Low, not empty: a Monk with none drops what it maintains.
    get(match, "c").energy = 20;
    const log = cast(match, "foe", skill === FLARE ? 0 : 1, "ally");
    const gains = eventsOf(log, BOND).filter(({ kind }) => kind === "energy-gain");
    expect(gains).toEqual(
      Array.from({ length: gained }, () => expect.objectContaining({ amount: 1 })),
    );
  });

  it("gives one Energy for each blow of a sword", () => {
    const match = arena([BOND]);
    cast(match, "c", 0, "ally");
    get(match, "c").energy = 20;
    expect(match.requestAttack("foe", "ally")?.ok).toBe(true);
    const log = stepFor(match, 6);
    const hits = log.filter(
      (entry) =>
        entry.sourceId === "foe" &&
        entry.skillId === undefined &&
        entry.events.some((event) => event.kind === "damage" && event.targetId === "ally"),
    ).length;
    expect(hits).toBeGreaterThan(1);
    expect(eventsOf(log, BOND).filter(({ kind }) => kind === "energy-gain")).toHaveLength(hits);
  });
});

describe("Life Barrier (#2286)", () => {
  it.each([
    ["rank 12", R12, 0.56],
    ["rank 0", R0, 0.8],
  ])("at %s, the ally takes %d of its damage", (_, ranks, multiplier) => {
    const match = arena([BARRIER], ranks);
    cast(match, "c", 0, "ally");
    const modifiers = aggregateModifiers(get(match, "ally").statuses.active);
    expect(modifiers.damageTakenMultiplier).toBeCloseTo(multiplier, 6);
  });

  it("cannot target its own caster", () => {
    const match = arena([BARRIER]);
    match.setTarget("c", "c");
    expect(match.requestSkill("c", 0)?.check).not.toEqual({ ok: true });
  });

  it.each([
    [0.6, true],
    [0.4, false],
  ])("with its Monk at %d of its Health, the ally's next hurt leaves it %s", (share, stays) => {
    const match = arena([BARRIER]);
    cast(match, "c", 0, "ally");
    const c = get(match, "c");
    c.health = Math.round(1e5 * share);
    const ally = get(match, "ally");
    cast(match, "foe", 0, "ally");
    expect(ally.health).toBeLessThan(1e5);
    expect(ally.statuses.has("life-barrier")).toBe(stays);
  });
});

describe("Retribution (#2286)", () => {
  it.each([
    ["rank 12", R12, 100, 17],
    ["rank 12", R12, 30, 10],
    ["rank 0", R0, 100, 5],
  ])("at %s, a blow that took %i sends back %i", (_, ranks, took, sent) => {
    const match = arena([]);
    const ally = get(match, "ally");
    ally.statuses.apply("retribution", 60, "c", ranks);
    ally.statuses.recordHitByAttack("foe", took, undefined);
    expect(ally.statuses.drainChanges()).toContainEqual(
      expect.objectContaining({ kind: "reflected", damage: sent }),
    );
  });

  it.each([
    ["rank 12", 17, R12],
    ["rank 0", 5, R0],
  ])("cast at %s, caps what it sends back at %i", (_, sent, ranks) => {
    const match = arena([RETRIBUTION], ranks);
    cast(match, "c", 0, "ally");
    const ally = get(match, "ally");
    ally.statuses.drainChanges();
    ally.statuses.recordHitByAttack("foe", 100, undefined);
    expect(ally.statuses.drainChanges()).toContainEqual(
      expect.objectContaining({ kind: "reflected", damage: sent }),
    );
  });

  it("sends back every blow while maintained", () => {
    const match = arena([RETRIBUTION]);
    cast(match, "c", 0, "ally");
    const foe = get(match, "foe");
    expect(match.requestAttack("foe", "ally")?.ok).toBe(true);
    const log = stepFor(match, 8);
    const sent = eventsOf(log, RETRIBUTION).filter(
      (event) => event.kind === "damage" && event.targetId === "foe",
    );
    expect(sent.length).toBeGreaterThan(3);
    expect(foe.health).toBeLessThan(1e5);
    expect(get(match, "ally").statuses.has("retribution")).toBe(true);
  });

  it("describes its cap at its caster's rank", () => {
    expect(describeStatus("retribution", R12)).toContain("of every attack");
    expect(describeStatus("retribution", R12)).toContain("17");
    expect(describeStatus("retribution")).toContain("5...17");
  });
});

describe("Scourge Healing (#2286)", () => {
  it.each([
    ["rank 12", R12, 67],
    ["rank 0", R0, 15],
  ])("at %s, a foe that heals the hexed foe takes %i holy damage", (_, ranks, damage) => {
    const match = arena([SCOURGE], ranks);
    cast(match, "c", 0, "foe");
    expect(get(match, "foe").statuses.get("scourge-healing")?.durationSeconds).toBeGreaterThan(26);
    const foe = get(match, "foe");
    foe.health = 5e4;
    const log = cast(match, "foe", 2, "foe");
    const hurt = eventsOf(log, SCOURGE).filter((event) => event.kind === "damage");
    expect(hurt).toEqual([expect.objectContaining({ targetId: "foe", amount: damage })]);
  });

  it("deals the scaled amount, before armor, at rank 12 and rank 0", () => {
    const describedAt12 = describeStatus("scourge-healing", R12);
    const describedAt0 = describeStatus("scourge-healing", R0);
    expect(describedAt12).toContain("67");
    expect(describedAt0).toContain("15");
  });
});

describe("Healing Seed (#2286)", () => {
  it.each([
    ["rank 12", R12, 25],
    ["rank 0", R0, 3],
  ])("at %s, the hurt ally and the ally beside it gain %i", (_, ranks, healed) => {
    const match = arena([SEED], ranks);
    cast(match, "c", 0, "ally");
    expect(get(match, "ally").statuses.get("healing-seed")?.durationSeconds).toBeLessThanOrEqual(
      10,
    );
    get(match, "ally2").health = 5e4;
    const log = cast(match, "foe", 0, "ally");
    const heals = eventsOf(log, SEED).filter((event) => event.kind === "heal");
    expect(heals).toEqual([
      expect.objectContaining({ targetId: "ally", amount: healed }),
      expect.objectContaining({ targetId: "ally2", amount: healed }),
    ]);
  });

  it("cannot target its own caster", () => {
    const match = arena([SEED]);
    match.setTarget("c", "c");
    expect(match.requestSkill("c", 0)?.check).not.toEqual({ ok: true });
  });
});

describe("Succor (#2286)", () => {
  it("gives the ally +1 Health and +1 Energy regeneration", () => {
    const match = arena([SUCCOR]);
    cast(match, "c", 0, "ally");
    const modifiers = aggregateModifiers(get(match, "ally").statuses.active);
    expect(modifiers.healthPips).toBe(1);
    expect(modifiers.energyPips).toBe(1);
  });

  it("costs its Monk 1 Energy each time the ally casts a spell", () => {
    const match = arena([SUCCOR]);
    cast(match, "c", 0, "ally");
    get(match, "ally").health = 5e4;
    const log = cast(match, "ally", 0, "ally");
    expect(eventsOf(log, SUCCOR)).toEqual([
      expect.objectContaining({ kind: "energy-loss", targetId: "c", amount: 1 }),
    ]);
  });
});

describe("Divine Boon (#2286)", () => {
  function boonOn(bar: readonly string[], ranks: ReadonlyMap<string, number> = R12) {
    const match = arena([BOON, ...bar], ranks);
    cast(match, "c", 0, "c");
    expect(get(match, "c").statuses.has("divine-boon")).toBe(true);
    return match;
  }

  it.each([
    ["rank 12", R12, 51],
    ["rank 0", R0, 15],
  ])("at %s, a Protection spell on an ally heals it %i more", (_, ranks, healed) => {
    const match = boonOn([GUARDIAN], ranks);
    get(match, "ally").health = 5e4;
    const log = cast(match, "c", 1, "ally");
    expect(eventsOf(log, BOON)).toEqual([
      expect.objectContaining({ kind: "heal", targetId: "ally", amount: healed }),
      expect.objectContaining({ kind: "energy-loss", targetId: "c", amount: 1 }),
    ]);
  });

  it("answers one on itself too", () => {
    const match = boonOn([AEGIS]);
    const c = get(match, "c");
    c.health = 5e4;
    const log = cast(match, "c", 1, "c");
    expect(eventsOf(log, BOON).some(({ kind }) => kind === "heal")).toBe(true);
  });

  it("does nothing for a spell of another attribute", () => {
    const match = boonOn([ORISON]);
    get(match, "ally").health = 5e4;
    const log = cast(match, "c", 1, "ally");
    expect(eventsOf(log, BOON)).toEqual([]);
  });
});

describe("Restful Breeze (#2286)", () => {
  it.each([
    ["rank 12", R12, 16],
    ["rank 0", R0, 8],
  ])("at %s, gives +10 Health regeneration for %i s", (_, ranks, seconds) => {
    const match = arena([BREEZE], ranks);
    match.setTarget("c", "ally");
    expect(match.requestSkill("c", 0)?.check).toEqual({ ok: true });
    stepFor(match, 1 + DT);
    const ally = get(match, "ally");
    expect(ally.statuses.get("restful-breeze")?.durationSeconds).toBe(seconds);
    expect(aggregateModifiers(ally.statuses.active).healthPips).toBe(10);
  });

  it("ends when the ally uses a skill", () => {
    const match = arena([BREEZE]);
    cast(match, "c", 0, "ally");
    const ally = get(match, "ally");
    expect(ally.statuses.has("restful-breeze")).toBe(true);
    cast(match, "ally", 0, "ally");
    expect(ally.statuses.has("restful-breeze")).toBe(false);
  });
});
