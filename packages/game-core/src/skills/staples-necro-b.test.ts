import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { energyCostOf } from "./activation.js";
import { describeSkill, describeStatus } from "./describe.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Necromancer staples (#2314): Ulcerous Lungs, Blood Bond, Poisoned Heart,
 * Vile Miasma, Depravity, Cultist's Fervor and Blood Drinker, each scaled
 * number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const R12 = new Map([
  ["necromancer.blood-magic", 12],
  ["necromancer.death-magic", 12],
  ["necromancer.curses", 12],
  ["necromancer.soul-reaping", 12],
]);
const R0: ReadonlyMap<string, number> = new Map();

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

const LUNGS = "necromancer.ulcerous-lungs";
const BOND = "necromancer.blood-bond";
const HEART = "necromancer.poisoned-heart";
const MIASMA = "necromancer.vile-miasma";
const DEPRAVITY = "necromancer.depravity";
const FERVOR = "necromancer.cultists-fervor";
const DRINKER = "necromancer.blood-drinker";
const FLARE = "elementalist.flare";
const FALL_BACK = "paragon.fall-back";
const ANTHEM = "paragon.anthem-of-flame";

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
 * `c`, the Necromancer of team 0, with `bar` at `ranks`; `ally`, with an
 * axe, adjacent to `foe` and not to `c`. Of team 1: `foe`, adjacent to `c`,
 * with Flare, a shout and a chant; `foeAlly` and `foeNear`, adjacent to
 * `foe` and not to `c`; `foeFar`, out of every area.
 */
function arena(bar: readonly string[], ranks: ReadonlyMap<string, number> = R12) {
  return new MatchSimulation({
    seed: "staples-necro-b",
    participants: [
      spec("c", 0, vec2(0, 0), bar, ranks),
      spec(
        "ally",
        0,
        vec2(30, -30),
        [],
        new Map([["warrior.axe-mastery", 12]]),
        wielding(WEAPONS.axe, "warrior.axe-mastery"),
      ),
      spec(
        "foe",
        1,
        vec2(30, 0),
        [FLARE, FALL_BACK, ANTHEM],
        new Map([["elementalist.fire-magic", 12]]),
      ),
      spec("foeAlly", 1, vec2(30, 30), [], R0),
      spec("foeNear", 1, vec2(60, 0), [], R0),
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

describe("the seven are the corpus's (#2314)", () => {
  it.each([
    [LUNGS, 1358, "hex", false, "necromancer.curses", 10, 1, 10],
    [BOND, 835, "hex", false, "necromancer.blood-magic", 5, 1, 8],
    [HEART, 840, "spell", false, "necromancer.curses", 5, 0.25, 12],
    [MIASMA, 828, "hex", false, "necromancer.death-magic", 10, 1, 15],
    [DEPRAVITY, 820, "hex", true, "necromancer.curses", 10, 1, 15],
    [FERVOR, 806, "enchantment", true, "necromancer.blood-magic", 5, 1, 15],
    [DRINKER, 1076, "spell", false, "necromancer.blood-magic", 5, 2, 8],
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

describe("Ulcerous Lungs (#2314)", () => {
  it.each([
    [R12, 26, 17],
    [R0, 10, 5],
  ])(
    "hexes the foe and those nearby; a shout or a chant makes the bearer bleed",
    (ranks, seconds, bleeding) => {
      const match = arena([LUNGS], ranks);
      cast(match, "c", 0, "foe");
      for (const id of ["foe", "foeAlly", "foeNear"]) {
        expect(get(match, id).statuses.get("ulcerous-lungs")?.durationSeconds, id).toBe(seconds);
      }
      expect(get(match, "foeFar").statuses.has("ulcerous-lungs")).toBe(false);

      cast(match, "foe", 1, "foe", 0.5);
      expect(get(match, "foe").statuses.get("bleeding")?.durationSeconds).toBe(bleeding);
    },
  );

  it("a chant makes it bleed too, and no other skill does", () => {
    const match = arena([LUNGS]);
    cast(match, "c", 0, "foe");
    const foe = get(match, "foe");
    cast(match, "foe", 0, "c", 2);
    expect(foe.statuses.has("bleeding")).toBe(false);
    cast(match, "foe", 2, "foe", 1.5);
    expect(foe.statuses.has("bleeding")).toBe(true);
  });

  it("takes 4 pips more only while the bearer bleeds", () => {
    const match = arena([LUNGS]);
    cast(match, "c", 0, "foe");
    const foe = get(match, "foe");
    expect(aggregateModifiers(foe.statuses.active).healthPips).toBe(0);
    foe.statuses.apply("bleeding", 5, "c", NO_RANKS);
    expect(aggregateModifiers(foe.statuses.active).healthPips).toBe(-7);
  });
});

describe("Blood Bond (#2314)", () => {
  it.each([
    [R12, 10, 17, 84],
    [R0, 3, 5, 20],
  ])(
    "an ally hitting a bearer is healed; one dying heals the allies adjacent to it",
    (ranks, seconds, perHit, onDeath) => {
      const match = arena([BOND], ranks);
      cast(match, "c", 0, "foe", 1.5);
      for (const id of ["foe", "foeAlly", "foeNear"]) {
        expect(get(match, id).statuses.get("blood-bond")?.durationSeconds, id).toBe(seconds);
      }
      expect(get(match, "foeFar").statuses.has("blood-bond")).toBe(false);

      get(match, "ally").health = 5e4;
      expect(match.requestAttack("ally", "foe")).toEqual({ ok: true });
      const hits = stepFor(match, 1.5);
      expect(amounts(hits, BOND, "heal")[0]).toEqual(["ally", perHit]);

      const killed = arena([BOND], ranks);
      cast(killed, "c", 0, "foe", 1.5);
      get(killed, "ally").health = 5e4;
      get(killed, "c").health = 5e4;
      get(killed, "foe").health = 1;
      expect(killed.requestAttack("ally", "foe")).toEqual({ ok: true });
      const death = stepFor(killed, 1.5);
      expect(get(killed, "foe").dead).toBe(true);
      const heals = amounts(death, BOND, "heal").filter(([, amount]) => amount === onDeath);
      expect(heals.map(([id]) => id).sort()).toEqual(["ally", "c"]);
    },
  );
});

describe("Poisoned Heart (#2314)", () => {
  it.each([
    [R12, 13],
    [R0, 5],
  ])("poisons the caster and the foes adjacent to it", (ranks, seconds) => {
    const match = arena([HEART], ranks);
    cast(match, "c", 0, "c", 1);
    expect(get(match, "c").statuses.get("poison")?.durationSeconds).toBe(seconds);
    expect(get(match, "foe").statuses.get("poison")?.durationSeconds).toBe(seconds);
    for (const id of ["ally", "foeAlly", "foeNear"]) {
      expect(get(match, id).statuses.has("poison"), id).toBe(false);
    }
  });
});

describe("Vile Miasma (#2314)", () => {
  it.each([
    [R12, 54, 4],
    [R0, 10, 1],
  ])("strikes, and hexes only a foe with a condition", (ranks, damage, pips) => {
    const clean = arena([MIASMA], ranks);
    const struck = cast(clean, "c", 0, "foe");
    expect(amounts(struck, MIASMA, "damage")).toEqual([["foe", damage]]);
    expect(get(clean, "foe").statuses.has("vile-miasma")).toBe(false);

    const sick = arena([MIASMA], ranks);
    const foe = get(sick, "foe");
    foe.statuses.apply("weakness", 20, "c", NO_RANKS);
    cast(sick, "c", 0, "foe");
    expect(foe.statuses.get("vile-miasma")?.durationSeconds).toBe(10);
    expect(aggregateModifiers(foe.statuses.active).healthPips).toBe(-pips);
  });
});

describe("Depravity (#2314)", () => {
  it.each([
    [R12, 17, 4],
    [R0, 5, 1],
  ])("a spell the bearer casts costs it and one foe beside it Energy", (ranks, seconds, energy) => {
    const match = arena([DEPRAVITY], ranks);
    cast(match, "c", 0, "foe");
    expect(get(match, "foe").statuses.get("depravity")?.durationSeconds).toBe(seconds);

    const log = cast(match, "foe", 0, "c", 2);
    const lost = amounts(log, DEPRAVITY, "energy-loss");
    expect(lost).toHaveLength(2);
    expect(lost[0]).toEqual(["foe", energy]);
    expect(["foeAlly", "foeNear"]).toContain(lost[1]?.[0]);
    expect(lost[1]?.[1]).toBe(energy);
  });

  it("a shout is no spell: nobody loses Energy", () => {
    const match = arena([DEPRAVITY]);
    cast(match, "c", 0, "foe");
    expect(amounts(cast(match, "foe", 1, "foe", 0.5), DEPRAVITY, "energy-loss")).toEqual([]);
  });
});

describe("Cultist's Fervor (#2314)", () => {
  it.each([
    [R12, 41, 5],
    [R0, 5, 9],
  ])(
    "lasts by Soul Reaping, cheapens Necromancer spells and bleeds you for each",
    (ranks, seconds, cost) => {
      const match = arena([FERVOR, MIASMA, FLARE], ranks);
      const c = get(match, "c");
      cast(match, "c", 0, "c", 1.5);
      expect(c.statuses.get("cultists-fervor")?.durationSeconds).toBe(seconds);
      expect(energyCostOf(skill(MIASMA), c)).toBe(cost);
      expect(energyCostOf(skill(FLARE), c)).toBe(5);
      expect(c.statuses.has("bleeding")).toBe(false);

      cast(match, "c", 2, "foe", 1.5);
      expect(c.statuses.has("bleeding")).toBe(false);
      cast(match, "c", 1, "foe", 1.5);
      expect(c.statuses.get("bleeding")?.durationSeconds).toBe(10);
    },
  );
});

describe("Blood Drinker (#2314)", () => {
  it.each([
    [R12, 56],
    [R0, 20],
  ])("steals; above 90% Health you bleed first", (ranks, amount) => {
    const full = arena([DRINKER], ranks);
    const log = cast(full, "c", 0, "foe", 2.5);
    expect(amounts(log, DRINKER, "life-stolen")).toEqual([["foe", amount]]);
    expect(get(full, "c").statuses.get("bleeding")?.durationSeconds).toBe(6);

    const hurt = arena([DRINKER], ranks);
    const c = get(hurt, "c");
    c.health = 8.9e4;
    cast(hurt, "c", 0, "foe", 2.5);
    expect(c.statuses.has("bleeding")).toBe(false);
  });
});

describe("their tooltips (#2314)", () => {
  it.each([
    [
      "blood-bond",
      "whenever it is hit by a foe's attack, that attacker is healed for 17. If target foe dies while hexed with this, adjacent allies are healed for 84",
    ],
    [
      "depravity",
      "whenever it casts a spell: it and the nearest of its allies nearby lose 4 energy",
    ],
    ["cultists-fervor", "Whenever it casts a Necromancer spell"],
  ])("%s reads as the corpus says it", (id, text) => {
    expect(describeStatus(id, R12)).toContain(text);
  });

  it("Blood Drinker bleeds you at 90% Health or more", () => {
    expect(describeSkill(skill(DRINKER), R12).effects[0]?.text).toMatch(
      /^If you have at least 90% Health: /,
    );
  });
});
