import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Staples (#2447): Deny Hexes, Renew Life, Signet of Disenchantment,
 * Ancestor's Visage, Flourish, Smoldering Embers and Bed of Coals, on
 * today's primitives. Every scaled number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const NO_RANKS: ReadonlyMap<string, number> = new Map();

const rankAll = (rank: number): ReadonlyMap<string, number> =>
  new Map([
    ["monk.healing-prayers", rank],
    ["mesmer.illusion-magic", rank],
    ["warrior.strength", rank],
    ["elementalist.fire-magic", rank],
  ]);
// Divine Favor stays at 0: its bonus would heal more than Renew Life does.
const R12 = rankAll(12);
const R0 = rankAll(0);

const DENY = "monk.deny-hexes";
const RENEW = "monk.renew-life";
const DISENCHANT = "mesmer.signet-of-disenchantment";
const ANCESTORS = "mesmer.ancestors-visage";
const SYMPATHETIC = "mesmer.sympathetic-visage";
const FLOURISH = "warrior.flourish";
const EMBERS = "elementalist.smoldering-embers";
const COALS = "elementalist.bed-of-coals";
const BLESSED_LIGHT = "monk.blessed-light";
const POWER_ATTACK = "warrior.power-attack";
const HAMSTRING = "warrior.hamstring";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the seven are the corpus's (#2447)", () => {
  it.each([
    [DENY, 991, "spell", false, "monk.divine-favor", 5, 1, 12, RANGE_SPELL, "single-ally"],
    [
      RENEW,
      1263,
      "spell",
      false,
      "monk.healing-prayers",
      15,
      4,
      5,
      RANGE_MELEE,
      "single-dead-ally",
    ],
    [
      ANCESTORS,
      1054,
      "enchantment",
      false,
      "mesmer.illusion-magic",
      10,
      1,
      20,
      RANGE_SPELL,
      "single-ally",
    ],
    [FLOURISH, 389, "skill", true, "warrior.strength", 5, 1, 8, RANGE_SPELL, "self"],
    [
      EMBERS,
      1090,
      "hex",
      false,
      "elementalist.fire-magic",
      10,
      1.5,
      7,
      RANGE_SPELL,
      "single-enemy",
    ],
    [COALS, 825, "spell", false, "elementalist.fire-magic", 10, 1, 15, RANGE_SPELL, "single-enemy"],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attributeId, energy, activation, recharge, range, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: { kind: "energy", amount: energy },
        overcast: 0,
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
        target,
      });
    },
  );

  it("Signet of Disenchantment: a free signet of no attribute", () => {
    expect(skill(DISENCHANT)).toMatchObject({
      gwId: 882,
      type: "signet",
      elite: false,
      attributeId: undefined,
      cost: undefined,
      activationSeconds: 1,
      rechargeSeconds: 15,
      target: "single-enemy",
    });
  });

  it("Renew Life is cast by touch", () => {
    expect(skill(RENEW).touch).toBe(true);
  });
});

const SWORD: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: WEAPONS.sword.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e5,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
}

/** `c` of team 0 at the origin with `bar` at `ranks`; `others` as given. */
function arena(
  bar: readonly string[],
  ranks: ReadonlyMap<string, number>,
  ...others: ParticipantSpec[]
): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "staples-2447",
    participants: [spec("c", 0, vec2(0, 0), { skillBar: bar, attributeRanks: ranks }), ...others],
  });
  for (const participant of sim.participants()) {
    participant.combatant.health = participant.combatant.maxHealth;
    participant.combatant.energy = 50;
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

/** `c` uses `skillId` on `targetId`, and steps until it has landed. */
function use(sim: MatchSimulation, skillId: string, targetId = "c"): CombatLogEntry[] {
  sim.setTarget("c", targetId);
  expect(sim.requestSkill("c", get(sim, "c").skillBar.indexOf(skillId))?.check).toEqual({
    ok: true,
  });
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "c" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(10 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `remaining` is `seconds`, less a step or two. */
function lasts(remaining: number | undefined, seconds: number): void {
  expect(remaining).toBeGreaterThan(seconds - 0.2);
  expect(remaining).toBeLessThanOrEqual(seconds + 1e-9);
}

/** Amounts of `kind` each target took from `skillId` in `log`. */
function totals(
  log: readonly CombatLogEntry[],
  skillId: string,
  kind: "damage" | "heal",
): Map<string, number> {
  const taken = new Map<string, number>();
  for (const entry of log) {
    if (entry.skillId !== skillId) {
      continue;
    }
    for (const event of entry.events) {
      if (event.kind === kind) {
        taken.set(event.targetId, (taken.get(event.targetId) ?? 0) + event.amount);
      }
    }
  }
  return taken;
}

const HEXES = [
  "conjure-phantasm",
  "imagined-burden",
  "ether-lord",
  "air-of-disenchantment",
] as const;

function hexCount(combatant: Combatant): number {
  return combatant.statuses.active.filter((status) =>
    (HEXES as readonly string[]).includes(status.id),
  ).length;
}

describe("Deny Hexes (#2447)", () => {
  function hexed(bar: readonly string[]): MatchSimulation {
    const sim = arena(bar, R12, spec("ally", 0, vec2(0, 200)));
    const ally = get(sim, "ally");
    HEXES.forEach((id) => ally.statuses.apply(id, 60, "foe", NO_RANKS));
    return sim;
  }

  it("removes two hexes alone: itself is a recharging Divine Favor skill", () => {
    const sim = hexed([DENY]);
    use(sim, DENY, "ally");
    expect(hexCount(get(sim, "ally"))).toBe(HEXES.length - 2);
  });

  it("one more for each other recharging Divine Favor skill", () => {
    const sim = hexed([DENY, BLESSED_LIGHT]);
    get(sim, "c").cast.startRecharge(BLESSED_LIGHT, 30);
    use(sim, DENY, "ally");
    expect(hexCount(get(sim, "ally"))).toBe(HEXES.length - 3);
  });

  it("a Divine Favor skill that is ready counts nothing", () => {
    const sim = hexed([DENY, BLESSED_LIGHT]);
    use(sim, DENY, "ally");
    expect(hexCount(get(sim, "ally"))).toBe(HEXES.length - 2);
  });
});

describe("Renew Life (#2447)", () => {
  /** `ally` dead beside `c`; `near` within earshot of it, `far` beyond. */
  function fallen(ranks: ReadonlyMap<string, number>): MatchSimulation {
    const sim = arena(
      [RENEW],
      ranks,
      spec("ally", 0, vec2(40, 0)),
      spec("near", 0, vec2(40, 300)),
      spec("far", 0, vec2(40, 400)),
    );
    for (const participant of sim.participants()) {
      participant.combatant.health = participant.combatant.maxHealth / 2;
    }
    const ally = get(sim, "ally");
    ally.statuses.apply("burning", 10, "foe", NO_RANKS);
    ally.health = 0.2;
    stepFor(sim, DT);
    expect(ally.dead).toBe(true);
    return sim;
  }

  it.each([
    ["rank 12", R12, 0.17, 115],
    ["rank 0", R0, 0.05, 55],
  ] as const)(
    "%s: raises at half Health and %d Energy, then heals it and allies in earshot for %i",
    (_, ranks, energyFraction, heal) => {
      const sim = fallen(ranks);
      const log = use(sim, RENEW, "ally");
      const events = log.flatMap((entry) => entry.events);
      expect(events).toContainEqual({
        kind: "resurrected",
        targetId: "ally",
        healthFraction: 0.5,
        energyFraction,
      });
      const healed = totals(log, RENEW, "heal");
      expect(healed.get("ally")).toBe(heal);
      expect(healed.get("near")).toBe(heal);
      expect(healed.get("c")).toBe(heal);
      expect(healed.has("far")).toBe(false);
    },
  );
});

describe("Signet of Disenchantment (#2447)", () => {
  it("takes all the caster's Energy and the foe's newest enchantment", () => {
    const sim = arena([DISENCHANT], R12, spec("foe", 1, vec2(0, 200)));
    const foe = get(sim, "foe");
    foe.statuses.apply("protective-spirit", 60, "foe", NO_RANKS);
    stepFor(sim, 0.5);
    foe.statuses.apply("sympathetic-visage", 60, "foe", NO_RANKS);
    use(sim, DISENCHANT, "foe");
    expect(get(sim, "c").energy).toBeLessThan(1);
    expect(foe.statuses.has("sympathetic-visage")).toBe(false);
    expect(foe.statuses.has("protective-spirit")).toBe(true);
  });

  it("takes all the Energy with no enchantment on the foe", () => {
    const sim = arena([DISENCHANT], R12, spec("foe", 1, vec2(0, 200)));
    use(sim, DISENCHANT, "foe");
    expect(get(sim, "c").energy).toBeLessThan(1);
  });
});

describe("Ancestor's Visage (#2447)", () => {
  /** `ally` enchanted by `c`; `brute`, a sworded foe beside it; `away`, a foe far off. */
  function visaged(ranks: ReadonlyMap<string, number>): MatchSimulation {
    const sim = arena(
      [ANCESTORS, SYMPATHETIC],
      ranks,
      spec("ally", 0, vec2(0, 200)),
      spec("brute", 1, vec2(30, 200), { equipment: SWORD }),
      spec("away", 1, vec2(300, 200)),
    );
    use(sim, ANCESTORS, "ally");
    return sim;
  }

  it.each([
    // Whole seconds as it lands: 8.8 is 9.
    ["rank 12", R12, 9],
    ["rank 0", R0, 4],
  ] as const)("%s: lasts %i seconds on the ally", (_, ranks, seconds) => {
    const sim = visaged(ranks);
    lasts(get(sim, "ally").statuses.get("ancestors-visage")?.remainingSeconds, seconds);
  });

  it("sits beside Sympathetic Visage on the same ally", () => {
    const sim = visaged(R12);
    use(sim, SYMPATHETIC, "ally");
    const ally = get(sim, "ally");
    expect(ally.statuses.has("ancestors-visage")).toBe(true);
    expect(ally.statuses.has("sympathetic-visage")).toBe(true);
  });

  it("a melee hit on the ally takes a flat 3 Energy from the foes beside it, at rank 0 too", () => {
    const sim = visaged(R0);
    const ally = get(sim, "ally");
    expect(sim.requestAttack("brute", "ally")).toEqual({ ok: true });
    for (let i = 0; ally.health === ally.maxHealth; i++) {
      expect(i).toBeLessThan(5 * RULES.tickRateHz);
      sim.step(DT);
    }
    const brute = get(sim, "brute");
    expect(brute.energy).toBeLessThanOrEqual(47);
    expect(brute.energy).toBeGreaterThan(46);
    expect(get(sim, "away").energy).toBeGreaterThan(47);
  });
});

describe("Flourish (#2447)", () => {
  it.each([
    ["rank 12", R12, 12],
    ["rank 0", R0, 4],
  ] as const)("%s: recharges both attacks and gains %i Energy", (_, ranks, gain) => {
    const sim = arena([FLOURISH, POWER_ATTACK, HAMSTRING], ranks);
    const self = get(sim, "c");
    self.cast.startRecharge(POWER_ATTACK, 30);
    self.cast.startRecharge(HAMSTRING, 30);
    const before = self.energy;
    use(sim, FLOURISH);
    expect(self.cast.isRecharging(POWER_ATTACK)).toBe(false);
    expect(self.cast.isRecharging(HAMSTRING)).toBe(false);
    // Its 5 Energy paid, a step of regeneration at most.
    expect(Math.floor(self.energy - (before - 5))).toBe(gain);
  });

  it("nothing recharging, nothing gained; Flourish never counts itself", () => {
    const sim = arena([FLOURISH, POWER_ATTACK], R12);
    const self = get(sim, "c");
    const before = self.energy;
    use(sim, FLOURISH);
    expect(Math.floor(self.energy - (before - 5))).toBe(0);
  });
});

describe("Smoldering Embers (#2447)", () => {
  function embers(ranks: ReadonlyMap<string, number>, overcast: number) {
    const sim = arena([EMBERS], ranks, spec("foe", 1, vec2(0, 300)));
    get(sim, "c").overcast = overcast;
    const log = use(sim, EMBERS, "foe");
    return { sim, log };
  }

  it.each([
    ["rank 12", R12, 58],
    ["rank 0", R0, 10],
  ] as const)("%s: strikes for %i, and no hex when the caster is not Overcast", (_, ranks, hit) => {
    const { sim, log } = embers(ranks, 0);
    expect(totals(log, EMBERS, "damage").get("foe")).toBe(hit);
    expect(get(sim, "foe").statuses.has("smoldering-embers")).toBe(false);
  });

  it.each([
    ["rank 12", R12, 21],
    ["rank 0", R0, 5],
  ] as const)("%s: Overcast, a 3 s hex burning for %i each second", (_, ranks, tick) => {
    const { sim } = embers(ranks, 5);
    const foe = get(sim, "foe");
    lasts(foe.statuses.get("smoldering-embers")?.remainingSeconds, 3);
    const pulses = totals(stepFor(sim, 1), EMBERS, "damage").get("foe");
    expect(pulses).toBe(tick);
  });
});

describe("Bed of Coals (#2447)", () => {
  /** `foe` the target; `down` beside it, knocked down; `away` far off. */
  function bed(ranks: ReadonlyMap<string, number>) {
    const sim = arena(
      [COALS],
      ranks,
      spec("foe", 1, vec2(0, 300)),
      spec("down", 1, vec2(30, 300)),
      spec("away", 1, vec2(0, 900)),
    );
    get(sim, "down").knockdownRemaining = 30;
    const log = use(sim, COALS, "foe");
    return { sim, log };
  }

  it.each([
    ["rank 12", R12, 24, 6],
    ["rank 0", R0, 5, 3],
  ] as const)(
    "%s: the first pulse lands at once for %i; the downed foe burns %i s",
    (_, ranks, hit, burning) => {
      const { sim, log } = bed(ranks);
      const struck = totals(log, COALS, "damage");
      expect(struck.get("foe")).toBe(hit);
      expect(struck.get("down")).toBe(hit);
      expect(struck.has("away")).toBe(false);
      lasts(get(sim, "down").statuses.get("burning")?.remainingSeconds, burning);
      expect(get(sim, "foe").statuses.has("burning")).toBe(false);
    },
  );

  it("pulses five times, a second apart, and a foe that walks off takes no more", () => {
    const { sim } = bed(R12);
    const foe = sim.get("foe");
    const rest = stepFor(sim, 2.5);
    expect(totals(rest, COALS, "damage").get("down")).toBe(48);
    if (foe === undefined) {
      throw new Error("no foe");
    }
    foe.position = vec2(0, 1500);
    const later = stepFor(sim, 5);
    expect(totals(later, COALS, "damage").get("down")).toBe(48);
    expect(totals(later, COALS, "damage").has("foe")).toBe(false);
  });
});
