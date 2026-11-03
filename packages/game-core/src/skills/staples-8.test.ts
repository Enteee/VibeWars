import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { effectiveArmor, skillDamage } from "./damage.js";
import { describeStatus } from "./describe.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import type { Combatant } from "./types.js";

/**
 * Staples (#2278): Lightning Surge, Ward Against Harm, Mark of
 * Subversion, Signet of Mystic Wrath, Dwayna's Touch, Mantra of Recall
 * and Shove, each at rank 12 and at rank 0. Air Attunement shipped with
 * the attunements (#1614).
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const R12 = new Map([
  ["elementalist.air-magic", 12],
  ["elementalist.water-magic", 12],
  ["necromancer.blood-magic", 12],
  ["monk.smiting-prayers", 12],
  ["dervish.wind-prayers", 12],
  ["mesmer.inspiration-magic", 12],
  ["warrior.tactics", 12],
]);
const R0: ReadonlyMap<string, number> = new Map();

const SURGE = "elementalist.lightning-surge";
const WARD = "elementalist.ward-against-harm";
const SUBVERSION = "necromancer.mark-of-subversion";
const WRATH = "monk.signet-of-mystic-wrath";
const TOUCH = "dervish.dwaynas-touch";
const RECALL = "mesmer.mantra-of-recall";
const SHOVE = "warrior.shove";
const ORISON = "monk.orison-of-healing";
const BARBS = "necromancer.barbs";

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[],
  attributeRanks: ReadonlyMap<string, number>,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e5,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/**
 * `c`, of team 0, with `bar` at `ranks`; `ally` beside it. `foe`, of team
 * 1, at hand, with a heal for an ally and a hex for a foe; `foeAlly` beside
 * it.
 */
function arena(bar: readonly string[], ranks: ReadonlyMap<string, number> = R12) {
  return new MatchSimulation({
    seed: "staples-8",
    participants: [
      spec("c", 0, vec2(0, 0), bar, ranks),
      spec("ally", 0, vec2(0, 30), [], R0),
      spec("foe", 1, vec2(30, 0), [ORISON, BARBS], new Map([["monk.healing-prayers", 12]])),
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
  seconds = 2.5,
): CombatLogEntry[] {
  match.setTarget(id, targetId);
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
  return stepFor(match, seconds);
}

function eventsOf(entries: readonly CombatLogEntry[], skillId: string) {
  return entries.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

/** `combatant` enchanted `count` times, each a different enchantment. */
function enchant(combatant: Combatant, count: number): void {
  for (const id of ["aegis", "mending", "shielding-hands", "protective-spirit"].slice(0, count)) {
    combatant.statuses.apply(id as "aegis", 60, combatant.id, NO_RANKS);
  }
}

describe("the seven are the corpus's (#2278)", () => {
  it.each([
    [SURGE, 205, "hex", true, 10, 1, 10, RANGE_SPELL],
    [WARD, 239, "ward", true, 15, 1, 20, RANGE_SPELL],
    [SUBVERSION, 127, "hex", false, 10, 2, 30, RANGE_SPELL],
    [WRATH, 1689, "signet", false, undefined, 2, 20, RANGE_SPELL],
    [TOUCH, 1528, "spell", false, 5, 0.75, 5, RANGE_MELEE],
    [RECALL, 82, "enchantment", true, 10, 1, 30, RANGE_SPELL],
    [SHOVE, 1146, "skill", true, 5, 0.75, 10, RANGE_MELEE],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, energy, activationSeconds, rechargeSeconds, range) => {
      expect(getSkill(id)).toMatchObject({
        gwId,
        type,
        elite,
        cost: energy === undefined ? undefined : { kind: "energy", amount: energy },
        activationSeconds,
        rechargeSeconds,
        range,
      });
    },
  );

  it("Ward Against Harm is disabled for 30 s, Dwayna's Touch and Shove touch", () => {
    expect(getSkill(WARD)?.disabledAfterUseSeconds).toBe(30);
    expect(getSkill(TOUCH)?.touch).toBe(true);
    expect(getSkill(SHOVE)?.touch).toBe(true);
  });
});

describe("Lightning Surge (#2278)", () => {
  // 83 and 14 through an unarmored foe's armor, 25% of it pierced.
  it.each([
    [R12, 108, 17],
    [R0, 18, 5],
  ])("after 3 s knocks down, strikes and cracks armor", (ranks, damage, cracked) => {
    const match = arena([SURGE], ranks);
    cast(match, "c", 0, "foe", 1.5);
    const foe = get(match, "foe");
    expect(foe.statuses.has("lightning-surge")).toBe(true);
    expect(foe.health).toBe(1e5);

    const log = stepFor(match, 3);
    const events = eventsOf(log, SURGE);
    expect(events.findIndex(({ kind }) => kind === "knocked-down")).toBeLessThan(
      events.findIndex(({ kind }) => kind === "damage"),
    );
    expect(events).toContainEqual(expect.objectContaining({ kind: "damage", amount: damage }));
    expect(foe.statuses.get("cracked-armor")?.durationSeconds).toBe(cracked);
  });

  it("does nothing when it is removed before its 3 s", () => {
    const match = arena([SURGE]);
    cast(match, "c", 0, "foe", 1.5);
    const foe = get(match, "foe");
    foe.statuses.remove("lightning-surge");
    const log = stepFor(match, 3);
    expect(eventsOf(log, SURGE)).toEqual([]);
    expect(foe.health).toBe(1e5);
    expect(foe.statuses.has("cracked-armor")).toBe(false);
  });
});

describe("Ward Against Harm (#2278)", () => {
  const LIGHTNING = skillDamage(100, "lightning", 0);
  const SLASHING = skillDamage(100, "slashing", 0);

  it.each([
    [R12, 13, 3, 22],
    [R0, 5, 1, 12],
  ])(
    "allies inside gain regeneration, armor and more against elements",
    (ranks, seconds, pips, armor) => {
      const match = arena([WARD], ranks);
      const ally = get(match, "ally");
      const lightning = effectiveArmor(ally, LIGHTNING, "chest");
      const slashing = effectiveArmor(ally, SLASHING, "chest");
      cast(match, "c", 0, "c", 1.5);

      expect(ally.statuses.has("ward-against-harm")).toBe(true);
      expect(aggregateModifiers(ally.statuses.active).healthPips).toBe(pips);
      expect(effectiveArmor(ally, SLASHING, "chest")).toBe(slashing + armor);
      expect(effectiveArmor(ally, LIGHTNING, "chest")).toBe(lightning + 2 * armor);
      expect(get(match, "foeAlly").statuses.has("ward-against-harm")).toBe(false);

      stepFor(match, seconds);
      expect(ally.statuses.has("ward-against-harm")).toBe(false);
    },
  );

  it("describes its status at its caster's rank", () => {
    expect(describeStatus("ward-against-harm", R12)).toContain("+22 elemental armor");
    expect(describeStatus("ward-against-harm", R0)).toContain("+12 elemental armor");
  });
});

describe("Mark of Subversion (#2278)", () => {
  it.each([
    [R12, 76],
    [R0, 10],
  ])("fails the foe's spell on its ally and steals Health", (ranks, stolen) => {
    const match = arena([SUBVERSION], ranks);
    cast(match, "c", 0, "foe");
    const foe = get(match, "foe");
    expect(foe.statuses.has("mark-of-subversion")).toBe(true);

    const log = cast(match, "foe", 0, "foeAlly", 1.2);
    expect(eventsOf(log, SUBVERSION)).toEqual([
      { kind: "spell-failed", targetId: "foe", skillId: ORISON },
      { kind: "life-stolen", targetId: "foe", amount: stolen },
    ]);
    expect(foe.health).toBe(1e5 - stolen);
    expect(foe.statuses.has("mark-of-subversion")).toBe(false);
  });

  it("fails one the foe casts on itself, as GW1's 'even if the caster targets itself'", () => {
    const match = arena([SUBVERSION]);
    cast(match, "c", 0, "foe");
    const log = cast(match, "foe", 0, "foe", 1.2);
    expect(eventsOf(log, SUBVERSION)[0]).toEqual({
      kind: "spell-failed",
      targetId: "foe",
      skillId: ORISON,
    });
  });

  it("lets a spell on an enemy through, and stays", () => {
    const match = arena([SUBVERSION]);
    cast(match, "c", 0, "foe");
    cast(match, "foe", 1, "c");
    expect(get(match, "c").statuses.has("barbs")).toBe(true);
    expect(get(match, "foe").statuses.has("mark-of-subversion")).toBe(true);
  });
});

describe("Signet of Mystic Wrath (#2278)", () => {
  it.each([
    [R12, 0, 0],
    [R12, 1, 25],
    [R12, 4, 100],
    [R0, 4, 30],
  ])("with %#: %i enchantments on its caster, %i holy damage", (ranks, count, damage) => {
    const match = arena([WRATH], ranks);
    enchant(get(match, "c"), count);
    const log = cast(match, "c", 0, "foe");
    expect(get(match, "foe").health).toBe(1e5 - damage);
    expect(eventsOf(log, WRATH).some(({ kind }) => kind === "damage")).toBe(damage > 0);
  });

  it("caps at 102 at rank 12", () => {
    const match = arena([WRATH]);
    const c = get(match, "c");
    enchant(c, 4);
    c.statuses.apply("vital-blessing", 60, "c", NO_RANKS);
    cast(match, "c", 0, "foe");
    expect(get(match, "foe").health).toBe(1e5 - 102);
  });
});

describe("Dwayna's Touch (#2278)", () => {
  it.each([
    [R12, 0, 0],
    [R12, 2, 120],
    [R12, 4, 204],
    [R0, 2, 60],
  ])("with %#: %i enchantments on its caster, heals %i", (ranks, count, healed) => {
    const match = arena([TOUCH], ranks);
    enchant(get(match, "c"), count);
    const ally = get(match, "ally");
    ally.health = 1000;
    cast(match, "c", 0, "ally", 1.5);
    expect(ally.health).toBe(1000 + healed);
  });
});

describe("Mantra of Recall (#2278)", () => {
  it.each([
    [R12, 22],
    [R0, 10],
  ])("gains its Energy when its 20 s end", (ranks, energy) => {
    const match = arena([RECALL], ranks);
    const c = get(match, "c");
    cast(match, "c", 0, "c", 1.5);
    expect(c.statuses.get("mantra-of-recall")?.durationSeconds).toBe(20);
    stepFor(match, 18);
    c.energy = 0;
    const log = stepFor(match, 2);
    expect(eventsOf(log, RECALL)).toContainEqual({
      kind: "energy-gain",
      targetId: "c",
      amount: energy,
    });
    expect(c.statuses.has("mantra-of-recall")).toBe(false);
  });

  it("gains it too when it is removed early", () => {
    const match = arena([RECALL]);
    const c = get(match, "c");
    cast(match, "c", 0, "c", 1.5);
    c.energy = 0;
    c.statuses.remove("mantra-of-recall");
    stepFor(match, DT);
    expect(c.energy).toBeGreaterThanOrEqual(22);
  });
});

describe("Shove (#2278)", () => {
  it.each([
    [R12, 63],
    [R0, 15],
  ])("strikes, ends the foe's stance and knocks it down", (ranks, damage) => {
    const match = arena([SHOVE], ranks);
    const foe = get(match, "foe");
    foe.statuses.apply("balanced-stance", 30, "foe", NO_RANKS);
    const log = cast(match, "c", 0, "foe", 1.2);
    expect(foe.health).toBe(1e5 - damage);
    expect(foe.statuses.has("balanced-stance")).toBe(false);
    expect(eventsOf(log, SHOVE)).toContainEqual(
      expect.objectContaining({ kind: "knocked-down", targetId: "foe" }),
    );
  });
});
