import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import type { Combatant } from "./types.js";

/**
 * Necromancer staples (#2313): Unholy Feast, Tainted Flesh, Dark Aura,
 * Life Transfer, Demonic Flesh, Feast of Corruption and Weaken Knees,
 * each scaled number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const R12 = new Map([
  ["necromancer.blood-magic", 12],
  ["necromancer.death-magic", 12],
  ["necromancer.curses", 12],
]);
const R0: ReadonlyMap<string, number> = new Map();

const UNHOLY = "necromancer.unholy-feast";
const TAINTED = "necromancer.tainted-flesh";
const AURA = "necromancer.dark-aura";
const TRANSFER = "necromancer.life-transfer";
const DEMONIC = "necromancer.demonic-flesh";
const FEAST = "necromancer.feast-of-corruption";
const KNEES = "necromancer.weaken-knees";
const BLOOD_RENEWAL = "necromancer.blood-renewal";
const FLARE = "elementalist.flare";

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
 * `c`, the Necromancer of team 0, with `bar` at `ranks`; `ally` beside it,
 * with Blood Renewal. Of team 1: `foe`, beside `c`, with an axe and Flare;
 * `foeAlly`, beside `foe` and `ally` but not `c`; `foeNear`, beside `c`
 * alone; `foeArea`, in the area of `c`, beside no one; `archer`, with a
 * longbow, and `foeFar`, out of the area.
 */
function arena(bar: readonly string[], ranks: ReadonlyMap<string, number> = R12) {
  return new MatchSimulation({
    seed: "staples-necro-a",
    participants: [
      spec("c", 0, vec2(0, 0), bar, ranks),
      spec("ally", 0, vec2(0, 30), [BLOOD_RENEWAL], R0),
      spec(
        "foe",
        1,
        vec2(30, 0),
        [FLARE],
        new Map([
          ["warrior.axe-mastery", 12],
          ["elementalist.fire-magic", 12],
        ]),
        wielding(WEAPONS.axe, "warrior.axe-mastery"),
      ),
      spec("foeAlly", 1, vec2(30, 30), [], R0),
      spec("foeNear", 1, vec2(0, -30), [], R0),
      spec("foeArea", 1, vec2(-90, 0), [], R0),
      spec(
        "archer",
        1,
        vec2(0, 300),
        [],
        new Map([["ranger.marksmanship", 12]]),
        wielding(WEAPONS.longbow, "ranger.marksmanship"),
      ),
      spec("foeFar", 1, vec2(300, 0), [], R0),
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
  seconds = 2.5,
): CombatLogEntry[] {
  match.setTarget(id, targetId);
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
  return stepFor(match, seconds);
}

function eventsOf(entries: readonly CombatLogEntry[], skillId: string) {
  return entries.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

/** The `kind` events of `skillId`, as target and amount. */
function amounts(entries: readonly CombatLogEntry[], skillId: string, kind: string) {
  return eventsOf(entries, skillId).flatMap((event) =>
    event.kind === kind && "amount" in event ? [[event.targetId, event.amount] as const] : [],
  );
}

describe("the seven are the corpus's (#2313)", () => {
  it.each([
    [UNHOLY, 110, "spell", false, "necromancer.blood-magic", 15, 0.75, 20],
    [TAINTED, 113, "enchantment", true, "necromancer.death-magic", 5, 1, 0],
    [AURA, 116, "enchantment", false, "necromancer.death-magic", 10, 1, 10],
    [TRANSFER, 126, "hex", true, "necromancer.blood-magic", 5, 1, 20],
    [DEMONIC, 130, "enchantment", false, "necromancer.blood-magic", 5, 1, 30],
    [FEAST, 151, "spell", true, "necromancer.curses", 15, 2, 15],
    [KNEES, 822, "hex", true, "necromancer.curses", 5, 1, 5],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, attributeId, energy, activationSeconds, rechargeSeconds) => {
      expect(getSkill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        profession: "necromancer",
        cost: { kind: "energy", amount: energy },
        activationSeconds,
        rechargeSeconds,
        range: RANGE_SPELL,
      });
    },
  );
});

describe("Unholy Feast (#2313)", () => {
  it.each([
    [R12, 54, ["foe", "foeNear", "foeAlly"]],
    [R0, 10, ["foe"]],
  ])("steals from the nearest foes in the area, no farther", (ranks, amount, robbed) => {
    const match = arena([UNHOLY], ranks);
    const c = get(match, "c");
    c.health = 5e4;
    const log = cast(match, "c", 0, "c", 1.5);
    expect(amounts(log, UNHOLY, "life-stolen")).toEqual(robbed.map((id) => [id, amount]));
    expect(c.health).toBe(5e4 + amount * robbed.length);
  });
});

describe("Tainted Flesh (#2313)", () => {
  it.each([
    [R12, 39, 13],
    [R0, 20, 3],
  ])(
    "enchants the allies in the area, and diseases whoever strikes one in melee",
    (ranks, seconds, disease) => {
      const match = arena([TAINTED], ranks);
      cast(match, "c", 0, "c", 1.5);
      const ally = get(match, "ally");
      expect(get(match, "c").statuses.get("tainted-flesh")?.durationSeconds).toBe(seconds);
      expect(ally.statuses.get("tainted-flesh")?.durationSeconds).toBe(seconds);
      expect(get(match, "foe").statuses.has("tainted-flesh")).toBe(false);
      expect(ally.statuses.apply("disease", 10, "foe", NO_RANKS)).toBe(false);

      expect(match.requestAttack("foe", "c")).toEqual({ ok: true });
      const log = stepFor(match, 3);
      expect(eventsOf(log, TAINTED)).toContainEqual(
        expect.objectContaining({ kind: "status-applied", targetId: "foe", statusId: "disease" }),
      );
      expect(get(match, "foe").statuses.get("disease")?.durationSeconds).toBe(disease);
    },
  );

  it("diseases no archer that hits, and no caster whose spell does", () => {
    const match = arena([TAINTED]);
    cast(match, "c", 0, "c", 1.5);
    const ally = get(match, "ally");
    ally.health = 5e4;
    expect(match.requestAttack("archer", "ally")).toEqual({ ok: true });
    stepFor(match, 6);
    expect(ally.health).toBeLessThan(5e4);
    expect(get(match, "archer").statuses.has("disease")).toBe(false);

    const health = ally.health;
    cast(match, "foe", 0, "ally", 2);
    expect(ally.health).toBeLessThan(health);
    expect(get(match, "foe").statuses.has("disease")).toBe(false);
  });
});

describe("Dark Aura (#2313)", () => {
  it.each([
    [R12, 41, 17],
    [R0, 5, 5],
  ])(
    "strikes the foes beside the ally each sacrifice, at its caster's cost",
    (ranks, damage, loss) => {
      const match = arena([AURA], ranks);
      const before = cast(match, "c", 0, "ally", 1.5);
      expect(get(match, "ally").statuses.get("dark-aura")?.durationSeconds).toBe(30);
      expect(amounts(before, AURA, "damage")).toEqual([]);
      const log = cast(match, "ally", 0, "ally", 1.5);
      expect(amounts(log, AURA, "damage")).toEqual([["foeAlly", damage]]);
      expect(amounts(log, AURA, "health-loss")).toEqual([["c", loss]]);
    },
  );

  it("on its own caster, answers a sacrifice once, as its loss is none", () => {
    const match = arena([AURA, BLOOD_RENEWAL]);
    cast(match, "c", 0, "c", 1.5);
    const log = cast(match, "c", 1, "c", 3);
    expect(amounts(log, AURA, "damage")).toEqual([
      ["foe", 41],
      ["foeNear", 41],
    ]);
    expect(amounts(log, AURA, "health-loss")).toEqual([["c", 17]]);
  });
});

describe("Life Transfer (#2313)", () => {
  it.each([
    [R12, 11, 7],
    [R0, 6, 3],
  ])("hexes the foe and those beside it, and regenerates its caster", (ranks, seconds, pips) => {
    const match = arena([TRANSFER], ranks);
    cast(match, "c", 0, "foe", 1.5);
    for (const id of ["foe", "foeAlly"]) {
      const hexed = get(match, id);
      expect(hexed.statuses.get("life-transfer")?.durationSeconds).toBe(seconds);
      expect(aggregateModifiers(hexed.statuses.active).healthPips).toBe(-pips);
    }
    expect(get(match, "foeNear").statuses.has("life-transfer")).toBe(false);
    expect(get(match, "ally").statuses.has("life-transfer")).toBe(false);
    const c = get(match, "c");
    expect(c.statuses.get("life-transfer-regen")?.durationSeconds).toBe(seconds);
    expect(aggregateModifiers(c.statuses.active).healthPips).toBe(pips);
  });
});

describe("Demonic Flesh (#2313)", () => {
  it.each([
    [R12, 54, 17],
    [R0, 30, 5],
  ])(
    "strikes the other foes beside its bearer when it uses a skill on a foe",
    (ranks, seconds, damage) => {
      const match = arena([DEMONIC, KNEES, AURA], ranks);
      cast(match, "c", 0, "c", 1.5);
      expect(get(match, "c").statuses.get("demonic-flesh")?.durationSeconds).toBe(seconds);
      const log = cast(match, "c", 1, "foe", 1.5);
      expect(amounts(log, DEMONIC, "damage")).toEqual([["foeNear", damage]]);
    },
  );

  it("strikes no one for a skill on an ally", () => {
    const match = arena([DEMONIC, KNEES, AURA]);
    cast(match, "c", 0, "c", 1.5);
    const log = cast(match, "c", 2, "ally", 1.5);
    expect(get(match, "ally").statuses.has("dark-aura")).toBe(true);
    expect(eventsOf(log, DEMONIC)).toEqual([]);
  });
});

describe("Feast of Corruption (#2313)", () => {
  it.each([
    [R12, 67, 34],
    [R0, 16, 8],
  ])("strikes the foe and those beside it, and steals from each hexed", (ranks, damage, steal) => {
    const match = arena([FEAST], ranks);
    get(match, "foeAlly").statuses.apply("life-siphon", 30, "c", NO_RANKS);
    const c = get(match, "c");
    c.health = 5e4;
    const log = cast(match, "c", 0, "foe", 2.5);
    expect(amounts(log, FEAST, "damage")).toEqual([
      ["foe", damage],
      ["foeAlly", damage],
    ]);
    expect(amounts(log, FEAST, "life-stolen")).toEqual([["foeAlly", steal]]);
    expect(c.health).toBe(5e4 + steal);
  });
});

describe("Weaken Knees (#2313)", () => {
  it.each([
    [R12, 13, -3],
    [R0, 1, -1],
  ])("hexes the foe with degeneration", (ranks, seconds, pips) => {
    const match = arena([KNEES], ranks);
    const foe = get(match, "foe");
    cast(match, "c", 0, "foe", 1.1);
    expect(foe.statuses.get("weaken-knees")?.durationSeconds).toBe(seconds);
    expect(aggregateModifiers(foe.statuses.active).healthPips).toBe(pips);
  });

  it.each([
    [R12, 17],
    [R0, 5],
  ])("strikes the foe each second it moves, never while it stands", (ranks, damage) => {
    const match = arena([KNEES], ranks);
    const foe = get(match, "foe");
    foe.statuses.apply("weaken-knees", 10, "c", ranks);
    expect(amounts(stepFor(match, 2.5), KNEES, "damage")).toEqual([]);
    match.setInputDirection("foe", vec2(0, -1));
    const hits = amounts(stepFor(match, 2.5), KNEES, "damage");
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every(([id, amount]) => id === "foe" && amount === damage)).toBe(true);
  });
});

describe("the new triggers read as the corpus does (#2313)", () => {
  it("names Tainted Flesh's melee hit and Dark Aura's loss as its caster's", () => {
    expect(describeStatus("tainted-flesh")).toMatch(/hit by a foe's melee attack/);
    expect(describeStatus("dark-aura")).toMatch(/sacrifices Health: you lose 5 Health/);
  });
});
