import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import type { Skill } from "./types.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Six from the dropped lists (#2453): Stoneflesh Aura's rank-scaled damage
 * reduction, Extinguish's heal for a removed Burning, Icy Shackles' slow
 * while enchanted, Smiter's Boon's doubled Divine Favor, Glyph of
 * Swiftness' faster recharge and projectiles, and Ward of Weakness'
 * Weakness on elemental damage. Numbers are the corpus's (PvP where
 * split), at rank 0 and rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const EARTH = "elementalist.earth-magic";
const WATER = "elementalist.water-magic";
const AIR = "elementalist.air-magic";
const FIRE = "elementalist.fire-magic";
const PROTECTION = "monk.protection-prayers";
const DIVINE_FAVOR = "monk.divine-favor";
const SMITING = "monk.smiting-prayers";
const HEALING = "monk.healing-prayers";
const STONEFLESH = "elementalist.stoneflesh-aura";
const EXTINGUISH = "monk.extinguish";
const SHACKLES = "elementalist.icy-shackles";
const BOON = "monk.smiters-boon";
const SWIFTNESS = "elementalist.glyph-of-swiftness";
const WARD = "elementalist.ward-of-weakness";
const FIREBALL = "elementalist.fireball";
const IMMOLATE = "elementalist.immolate";
const INSIGHT = "monk.judges-insight";
const ORISON = "monk.orison-of-healing";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

const SCYTHE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.scythe,
    attributeId: "dervish.scythe-mastery",
    damageType: weaponDamageType(WEAPONS.scythe, "dervish.scythe-mastery"),
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  bar: readonly string[],
  ranks: ReadonlyMap<string, number> = NO_RANKS,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: bar,
    attributeRanks: ranks,
    equipment: SCYTHE,
    maxHealth: 1e4,
    maxEnergy: 1000,
    startHealthFraction: 0.5,
    spawn,
    facing: 0,
  };
}

function match(...participants: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({ seed: "dropped-4", participants });
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

/** `caster` uses the skill in `slot` on `target`, and the steps until it has landed. */
function use(sim: MatchSimulation, caster: string, slot: number, target: string) {
  sim.setTarget(caster, target);
  expect(sim.requestSkill(caster, slot)?.check).toEqual({ ok: true });
  const id = get(sim, caster).skillBar[slot] ?? "";
  return stepFor(sim, skill(id).activationSeconds + 1);
}

function amountsTo(log: readonly CombatLogEntry[], targetId: string, kind: "heal" | "damage") {
  return log
    .flatMap((entry) => entry.events)
    .flatMap((event) => (event.kind === kind && event.targetId === targetId ? [event.amount] : []));
}

describe("#2453's data", () => {
  it.each([
    [STONEFLESH, 1375, "enchantment", false, EARTH, 10, 2, 15, "self"],
    [EXTINGUISH, 943, "spell", false, PROTECTION, 15, 1, 12, "self"],
    [SHACKLES, 939, "hex", true, WATER, 10, 1, 12, "single-enemy"],
    [BOON, 2005, "enchantment", false, DIVINE_FAVOR, 25, 0.25, 90, "self"],
    [SWIFTNESS, 2002, "glyph", false, AIR, 5, 1, 10, "self"],
    [WARD, 2001, "ward", false, EARTH, 5, 1, 20, "self"],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attributeId, energy, activation, recharge, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );

  it("Extinguish reaches the whole party", () => {
    expect(skill(EXTINGUISH).area).toEqual({ origin: "party" });
  });
});

describe("Stoneflesh Aura (#2453)", () => {
  it.each([
    [0, 5, 1],
    [12, 13, 25],
  ])("at Earth Magic %i: %i s, %i off each packet, no crits", (rank, seconds, reduction) => {
    const sim = match(spec("e", 0, vec2(0, 0), [STONEFLESH], new Map([[EARTH, rank]])));
    use(sim, "e", 0, "e");
    const self = get(sim, "e");
    const left = self.statuses.get("stoneflesh-aura")?.remainingSeconds ?? 0;
    expect(left).toBeLessThanOrEqual(seconds);
    expect(left).toBeGreaterThan(seconds - 1.5);
    expect(aggregateModifiers(self.statuses.active).damageReduction).toBe(reduction);
    expect(aggregateModifiers(self.statuses.active).preventsCriticalHits).toBe(true);
  });

  it("takes 25 off a foe's Immolate after armor", () => {
    const hit = (aura: boolean) => {
      const sim = match(
        spec("e", 0, vec2(0, 0), [STONEFLESH], new Map([[EARTH, 12]])),
        spec("f", 1, vec2(300, 0), [IMMOLATE], new Map([[FIRE, 12]])),
      );
      if (aura) {
        use(sim, "e", 0, "e");
      }
      return amountsTo(use(sim, "f", 0, "e"), "e", "damage")[0] ?? 0;
    };
    expect(hit(false) - hit(true)).toBe(25);
  });
});

describe("Extinguish (#2453)", () => {
  it.each([
    [0, 10],
    [12, 82],
  ])(
    "at Protection Prayers %i: one condition off each member, %i to one relieved of Burning",
    (rank, heal) => {
      const sim = match(
        spec("m", 0, vec2(0, 0), [EXTINGUISH], new Map([[PROTECTION, rank]])),
        spec("a", 0, vec2(200, 0), []),
      );
      get(sim, "m").statuses.apply("burning", 10, "x", NO_RANKS);
      get(sim, "a").statuses.apply("bleeding", 10, "x", NO_RANKS);
      const log = use(sim, "m", 0, "m");
      expect(get(sim, "m").statuses.has("burning")).toBe(false);
      expect(get(sim, "a").statuses.has("bleeding")).toBe(false);
      expect(amountsTo(log, "m", "heal").filter((amount) => amount > 0)).toEqual([heal]);
      expect(amountsTo(log, "a", "heal")).toEqual([]);
    },
  );
});

describe("Icy Shackles (#2453)", () => {
  it("says it is 90% slower while enchanted", () => {
    expect(describeStatus("icy-shackles", NO_RANKS, EN_WORDS, EN_NAMES)).toContain(
      "moves at 10% speed while enchanted",
    );
  });

  it.each([
    [0, 1],
    [12, 8.2],
  ])("at Water Magic %i: %f s, 66% slower, 90% while enchanted", (rank, seconds) => {
    const sim = match(
      spec("e", 0, vec2(0, 0), [SHACKLES], new Map([[WATER, rank]])),
      spec("f", 1, vec2(300, 0), []),
    );
    sim.setTarget("e", "f");
    expect(sim.requestSkill("e", 0)?.check).toEqual({ ok: true });
    stepFor(sim, skill(SHACKLES).activationSeconds + DT);
    const foe = get(sim, "f");
    const left = foe.statuses.get("icy-shackles")?.remainingSeconds ?? 0;
    expect(left).toBeLessThanOrEqual(seconds);
    expect(left).toBeGreaterThan(seconds - 0.5);
    expect(aggregateModifiers(foe.statuses.active).moveSpeedMultiplier).toBeCloseTo(0.34);
    foe.statuses.apply("stoneflesh-aura", 10, "f", NO_RANKS);
    expect(aggregateModifiers(foe.statuses.active).moveSpeedMultiplier).toBeCloseTo(0.1, 2);
  });
});

describe("Smiter's Boon (#2453)", () => {
  function monk(bar: readonly string[]) {
    return match(
      spec(
        "m",
        0,
        vec2(0, 0),
        bar,
        new Map([
          [DIVINE_FAVOR, 12],
          [SMITING, 12],
          [HEALING, 12],
        ]),
      ),
      spec("a", 0, vec2(200, 0), []),
    );
  }

  it("doubles the Divine Favor of a Smiting Prayers spell: 76, not 38", () => {
    const plain = monk([INSIGHT]);
    expect(amountsTo(use(plain, "m", 0, "a"), "a", "heal")).toEqual([38]);
    const boosted = monk([BOON, INSIGHT]);
    use(boosted, "m", 0, "m");
    expect(get(boosted, "m").statuses.has("smiters-boon")).toBe(true);
    expect(amountsTo(use(boosted, "m", 1, "a"), "a", "heal")).toEqual([76]);
  });

  it("leaves another line's Divine Favor alone", () => {
    const plain = monk([ORISON]);
    const boosted = monk([BOON, ORISON]);
    use(boosted, "m", 0, "m");
    expect(amountsTo(use(boosted, "m", 1, "a"), "a", "heal")).toEqual(
      amountsTo(use(plain, "m", 0, "a"), "a", "heal"),
    );
  });

  it("says what it doubles", () => {
    expect(describeStatus("smiters-boon", NO_RANKS, EN_WORDS, EN_NAMES)).toBe(
      "Smiting Prayers spells have double the Divine Favor bonus",
    );
  });

  it("lasts 4 seconds", () => {
    const sim = monk([BOON]);
    sim.setTarget("m", "m");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 0.25 + DT);
    expect(get(sim, "m").statuses.get("smiters-boon")?.remainingSeconds).toBeCloseTo(4, 0);
  });
});

describe("Glyph of Swiftness (#2453)", () => {
  function caster(rank: number, glyph: boolean) {
    return match(
      spec(
        "e",
        0,
        vec2(0, 0),
        glyph ? [SWIFTNESS, FIREBALL, IMMOLATE] : [FIREBALL, IMMOLATE],
        new Map([[AIR, rank]]),
      ),
      spec("f", 1, vec2(400, 0), []),
    );
  }

  it.each([
    [0, 1],
    [12, 4],
  ])("at Air Magic %i holds the next %i spells", (rank, count) => {
    const sim = caster(rank, true);
    use(sim, "e", 0, "e");
    expect(get(sim, "e").statuses.get("glyph-of-swiftness")?.spellsLeft).toBe(count);
  });

  it("recharges its last spell 25% faster: Fireball's 7 s is 5.25", () => {
    const recharge = (glyph: boolean) => {
      const sim = caster(0, glyph);
      if (glyph) {
        use(sim, "e", 0, "e");
      }
      use(sim, "e", glyph ? 1 : 0, "f");
      return get(sim, "e").cast.rechargeRemaining.get(FIREBALL) ?? 0;
    };
    expect(recharge(false) - recharge(true)).toBeCloseTo(1.75, 1);
  });

  it("flies the spell's projectile 3 times as fast", () => {
    const flight = (glyph: boolean) => {
      const sim = caster(12, glyph);
      if (glyph) {
        use(sim, "e", 0, "e");
      }
      sim.setTarget("e", "f");
      expect(sim.requestSkill("e", glyph ? 1 : 0)?.check).toEqual({ ok: true });
      stepFor(sim, skill(FIREBALL).activationSeconds);
      let ticks = 0;
      while (amountsTo(sim.step(DT).log, "f", "damage").length === 0) {
        ticks += 1;
        expect(ticks).toBeLessThan(10 * RULES.tickRateHz);
      }
      return ticks;
    };
    const slow = flight(false);
    const fast = flight(true);
    expect(fast).toBeLessThan(slow);
    expect(fast).toBeCloseTo(slow / 3, -1);
  });

  it("spends a charge on a spell that does not fly", () => {
    const sim = caster(12, true);
    use(sim, "e", 0, "e");
    use(sim, "e", 2, "f");
    expect(get(sim, "e").statuses.get("glyph-of-swiftness")?.spellsLeft).toBe(3);
  });
});

describe("Ward of Weakness (#2453)", () => {
  function warded(rank: number, foeAt: Vec2) {
    const sim = match(
      spec(
        "e",
        0,
        vec2(0, 0),
        [WARD, IMMOLATE],
        new Map([
          [EARTH, rank],
          [FIRE, 12],
        ]),
      ),
      spec("f", 1, foeAt, []),
    );
    use(sim, "e", 0, "e");
    return sim;
  }

  it.each([
    [0, 5],
    [12, 17],
  ])("at Earth Magic %i: a foe in it struck by fire is Weakened %i s", (rank, seconds) => {
    const sim = warded(rank, vec2(60, 0));
    use(sim, "e", 1, "f");
    const left = get(sim, "f").statuses.get("weakness")?.remainingSeconds ?? 0;
    expect(left).toBeLessThanOrEqual(seconds);
    expect(left).toBeGreaterThan(seconds - 1.5);
  });

  it("does nothing to a foe outside it", () => {
    const sim = warded(12, vec2(300, 0));
    use(sim, "e", 1, "f");
    expect(get(sim, "f").statuses.has("weakness")).toBe(false);
  });

  it("does nothing on physical damage", () => {
    const sim = warded(12, vec2(30, 0));
    expect(sim.requestAttack("e", "f")).toEqual({ ok: true });
    const log = stepFor(sim, 3);
    expect(amountsTo(log, "f", "damage").length).toBeGreaterThan(0);
    expect(get(sim, "f").statuses.has("weakness")).toBe(false);
  });

  it("says what it answers", () => {
    expect(
      describeStatus("ward-of-weakness", new Map([[EARTH, 12]]), EN_WORDS, EN_NAMES),
    ).toContain("takes elemental damage");
  });
});
