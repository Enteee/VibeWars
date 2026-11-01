import { describe, expect, it } from "vitest";

import { AREA_NEARBY, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import { blockChanceOf, effectiveMaxHealth } from "./tick.js";
import type { Combatant, Skill } from "./types.js";
import { resolveAttackSkill } from "./weapon-attack.js";

/**
 * Dervish staples 2 (#1604): Irresistible Sweep, Crippling Sweep, Rending
 * Sweep, Pious Fury, Zealous Renewal, Mirage Cloak, Vital Boon and Guiding
 * Hands. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["dervish.scythe-mastery", 12],
  ["dervish.wind-prayers", 12],
  ["dervish.earth-prayers", 12],
  ["dervish.mysticism", 12],
]);
const SCYTHE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.scythe,
    attributeId: "dervish.scythe-mastery",
    damageType: WEAPONS.scythe.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function damageIn(events: readonly CombatEvent[], id: string): number {
  return events.reduce(
    (sum, event) => (event.kind === "damage" && event.targetId === id ? sum + event.amount : sum),
    0,
  );
}

describe("the eight are the corpus's (#1604)", () => {
  it.each([
    ["irresistible-sweep", 1489, "attack", false, "scythe-mastery", "adrenaline", 5, 0, 0],
    ["crippling-sweep", 1535, "attack", false, "scythe-mastery", "energy", 5, 0, 6],
    ["rending-sweep", 1753, "attack", false, "scythe-mastery", "adrenaline", 6, 0, 0],
    ["pious-fury", 2146, "stance", false, "mysticism", "energy", 5, 0, 15],
    ["zealous-renewal", 1763, "enchantment", true, "mysticism", "energy", 5, 0, 10],
    ["mirage-cloak", 1500, "enchantment", true, "earth-prayers", "energy", 10, 0, 15],
    ["vital-boon", 1506, "enchantment", false, "earth-prayers", "energy", 5, 1, 8],
    ["guiding-hands", 1513, "enchantment", false, "wind-prayers", "energy", 10, 0.25, 15],
  ] as const)(
    "%s: gwId %i, %s, flash %s, %s, %s %i, %d s, %i s recharge",
    (id, gwId, type, flash, attribute, cost, amount, activation, recharge) => {
      expect(skill(`dervish.${id}`)).toMatchObject({
        gwId,
        type,
        elite: false,
        flash,
        attributeId: `dervish.${attribute}`,
        cost: { kind: cost, amount },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: type === "attack" ? RANGE_MELEE : RANGE_SPELL,
      });
    },
  );

  it("the three sweeps are scythe attacks", () => {
    for (const id of ["irresistible-sweep", "crippling-sweep", "rending-sweep"]) {
      expect(skill(`dervish.${id}`).attack?.weapon, id).toBe("scythe");
    }
  });

  it("says Guiding Hands' next 2 attacks cannot be blocked", () => {
    expect(describeStatus("guiding-hands")).toMatch(/your next 2 attacks cannot be blocked/);
  });
});

describe("Crippling Sweep's extra damage (#1604)", () => {
  it("is 13 more on a moving foe, the same roll", () => {
    const dealt = (moving: boolean): number => {
      const dervish = makeCombatant({ id: "d", equipment: SCYTHE, attributeRanks: RANKS });
      const victim = makeCombatant({ id: "f", team: 1, maxHealth: 1e4, health: 1e4 });
      victim.moving = moving;
      const events = resolveAttackSkill(
        {
          skill: skill("dervish.crippling-sweep"),
          caster: dervish,
          targets: [victim],
          rng: createRng(1604),
          rules: RULES.combat,
          surroundings: new Map(),
        },
        () => false,
        [],
      );
      return damageIn(events, "f");
    };
    expect(dealt(true) - dealt(false)).toBe(13);
  });
});

describe("in a match (#1604)", () => {
  const BAR = [
    "dervish.irresistible-sweep",
    "dervish.crippling-sweep",
    "dervish.rending-sweep",
    "dervish.pious-fury",
    "dervish.zealous-renewal",
    "dervish.mirage-cloak",
    "dervish.vital-boon",
    "dervish.guiding-hands",
  ] as const;
  type BarSkill = (typeof BAR)[number];
  const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<BarSkill, number>;

  function body(id: string, team: number, spawn: Vec2): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [...BAR],
      attributeRanks: RANKS,
      equipment: SCYTHE,
      maxHealth: 1e4,
      maxEnergy: 1000,
      spawn,
      facing: 0,
    };
  }

  /**
   * Dervish `c`; foe `f` adjacent to it, `h` adjacent to `f` (a cleave's
   * second victim), `g` near `c` but adjacent to neither, and `far` out of
   * every area.
   */
  function match(): MatchSimulation {
    return new MatchSimulation({
      seed: "dervish-staples-2",
      participants: [
        body("c", 1, vec2(0, 0)),
        body("f", 0, vec2(32, 0)),
        body("h", 0, vec2(32, 35)),
        body("g", 0, vec2(-AREA_NEARBY + 10, 0)),
        body("far", 0, vec2(400, 0)),
      ],
    });
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

  /** `c` uses `skillId` on `targetId`, with adrenaline to pay, and the steps until it lands. */
  function use(sim: MatchSimulation, skillId: BarSkill, targetId = "f"): CombatLogEntry[] {
    const cost = skill(skillId).cost;
    if (cost?.kind === "adrenaline") {
      get(sim, "c").adrenaline.set(skillId, cost.amount * ADRENALINE_PER_STRIKE);
    }
    sim.setTarget("c", targetId);
    expect(sim.requestSkill("c", SLOT[skillId])?.check).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < 4 / DT; i += 1) {
      log.push(...sim.step(DT).log);
      if (log.some((entry) => entry.skillId === skillId)) {
        break;
      }
    }
    return log;
  }

  /** The damage `skillId`'s log entries dealt `id`. */
  function dealt(log: readonly CombatLogEntry[], skillId: string, id: string): number {
    return log
      .filter((entry) => entry.skillId === skillId)
      .reduce((sum, entry) => sum + damageIn(entry.events, id), 0);
  }

  function events(log: readonly CombatLogEntry[]): CombatEvent[] {
    return log.flatMap((entry) => entry.events);
  }

  function hasStatus(sim: MatchSimulation, id: string, statusId: string): boolean {
    return [...get(sim, id).statuses.active].some((status) => status.id === statusId);
  }

  function secondsOf(sim: MatchSimulation, id: string, statusId: string): number | undefined {
    return [...get(sim, id).statuses.active].find((status) => status.id === statusId)
      ?.remainingSeconds;
  }

  /** A Dervish enchantment on `c`, as if it had cast Mystic Regeneration. */
  function enchant(sim: MatchSimulation): void {
    get(sim, "c").statuses.apply("mystic-regeneration", 15, "c", NO_RANKS);
  }

  /** `f` blocks every melee attack (Riposte) and is in a stance (Bonetti's Defense). */
  function guard(sim: MatchSimulation): void {
    get(sim, "f").statuses.apply("riposte", 30, "f", NO_RANKS);
    get(sim, "f").statuses.apply("bonettis-defense", 30, "f", NO_RANKS);
  }

  describe("Irresistible Sweep", () => {
    it("spending a Dervish enchantment, cannot be blocked and ends the foe's stance", () => {
      const sim = match();
      enchant(sim);
      guard(sim);
      const log = use(sim, "dervish.irresistible-sweep");
      expect(events(log)).not.toContainEqual({ kind: "attack-blocked", targetId: "f" });
      expect(dealt(log, "dervish.irresistible-sweep", "f")).toBeGreaterThan(0);
      expect(hasStatus(sim, "f", "bonettis-defense")).toBe(false);
      expect(hasStatus(sim, "c", "mystic-regeneration")).toBe(false);
    });

    it("without one, is blocked as any attack, and the stance stays", () => {
      const sim = match();
      guard(sim);
      const log = use(sim, "dervish.irresistible-sweep");
      expect(events(log)).toContainEqual({ kind: "attack-blocked", targetId: "f" });
      expect(hasStatus(sim, "f", "bonettis-defense")).toBe(true);
    });

    it("a blind miss still spends the enchantment, and no stance comes off", () => {
      const sim = match();
      enchant(sim);
      guard(sim);
      get(sim, "c").statuses.apply("blind", 10, "f", NO_RANKS);
      const log = use(sim, "dervish.irresistible-sweep");
      expect(events(log)).toContainEqual({ kind: "attack-missed", targetId: "f" });
      expect(hasStatus(sim, "c", "mystic-regeneration")).toBe(false);
      expect(hasStatus(sim, "f", "bonettis-defense")).toBe(true);
    });
  });

  describe("Crippling Sweep", () => {
    it("cripples each foe it hits for 10 s", () => {
      const sim = match();
      use(sim, "dervish.crippling-sweep");
      for (const id of ["f", "h"]) {
        expect(secondsOf(sim, id, "crippled"), id).toBeCloseTo(10, 0);
      }
    });
  });

  describe("Rending Sweep", () => {
    it("spending a Dervish enchantment, strips an enchantment from each foe it hits", () => {
      const sim = match();
      enchant(sim);
      for (const id of ["f", "h"]) {
        get(sim, id).statuses.apply("mystic-regeneration", 30, id, NO_RANKS);
      }
      use(sim, "dervish.rending-sweep");
      expect(hasStatus(sim, "c", "mystic-regeneration")).toBe(false);
      for (const id of ["f", "h"]) {
        expect(hasStatus(sim, id, "mystic-regeneration"), id).toBe(false);
      }
    });

    it("without one, is a plain hit that strips nothing", () => {
      const sim = match();
      get(sim, "f").statuses.apply("mystic-regeneration", 30, "f", NO_RANKS);
      const log = use(sim, "dervish.rending-sweep");
      expect(dealt(log, "dervish.rending-sweep", "f")).toBeGreaterThan(0);
      expect(hasStatus(sim, "f", "mystic-regeneration")).toBe(true);
    });
  });

  describe("Pious Fury", () => {
    it("attacks 25% faster for 4 s, nothing lost without a Dervish enchantment", () => {
      const sim = match();
      get(sim, "c").statuses.apply("shadow-refuge", 4, "c", NO_RANKS);
      use(sim, "dervish.pious-fury", "c");
      expect(secondsOf(sim, "c", "pious-fury")).toBeCloseTo(4, 0);
      expect(aggregateModifiers(get(sim, "c").statuses.active).attackDurationMultiplier).toBe(0.75);
      expect(hasStatus(sim, "c", "shadow-refuge")).toBe(true);
    });

    it("lasts 8 s, spending a Dervish enchantment", () => {
      const sim = match();
      enchant(sim);
      use(sim, "dervish.pious-fury", "c");
      expect(secondsOf(sim, "c", "pious-fury")).toBeCloseTo(8, 0);
      expect(hasStatus(sim, "c", "mystic-regeneration")).toBe(false);
    });
  });

  describe("Zealous Renewal", () => {
    it("strikes nearby foes for 25 holy, and costs an energy pip for 21 s", () => {
      const sim = match();
      const log = use(sim, "dervish.zealous-renewal", "c");
      for (const id of ["f", "h", "g"]) {
        expect(dealt(log, "dervish.zealous-renewal", id), id).toBe(25);
      }
      expect(dealt(log, "dervish.zealous-renewal", "far")).toBe(0);
      expect(secondsOf(sim, "c", "zealous-renewal")).toBeCloseTo(21, 0);
      expect(aggregateModifiers(get(sim, "c").statuses.active).energyPips).toBe(-1);
    });

    it("gives 1 Energy for each foe a hit lands on: a cleave on two, 2", () => {
      const sim = match();
      use(sim, "dervish.zealous-renewal", "c");
      const log = use(sim, "dervish.crippling-sweep");
      const gains = log
        .filter((entry) => entry.skillId === "dervish.zealous-renewal")
        .flatMap((entry) => entry.events)
        .filter((event) => event.kind === "energy-gain" && event.targetId === "c");
      expect(gains.map((event) => (event.kind === "energy-gain" ? event.amount : 0))).toEqual([
        1, 1,
      ]);
    });

    it("gives 4 Energy when stripped early, nothing when it runs out", () => {
      const stripped = match();
      use(stripped, "dervish.zealous-renewal", "c");
      get(stripped, "c").energy = 0;
      get(stripped, "c").statuses.removeByCategory("enchantment");
      const early = stepFor(stripped, 0.1);
      expect(
        events(early).filter((event) => event.kind === "energy-gain" && event.targetId === "c"),
      ).toEqual([{ kind: "energy-gain", targetId: "c", amount: 4 }]);

      const ran = match();
      use(ran, "dervish.zealous-renewal", "c");
      const out = stepFor(ran, 22);
      expect(hasStatus(ran, "c", "zealous-renewal")).toBe(false);
      expect(
        events(out).filter((event) => event.kind === "energy-gain" && event.targetId === "c"),
      ).toEqual([]);
    });
  });

  describe("Mirage Cloak", () => {
    it("blocks 54% of attacks for 6 s and strikes nearby foes for 34 earth", () => {
      const sim = match();
      const log = use(sim, "dervish.mirage-cloak", "c");
      for (const id of ["f", "h", "g"]) {
        expect(dealt(log, "dervish.mirage-cloak", id), id).toBe(34);
      }
      expect(dealt(log, "dervish.mirage-cloak", "far")).toBe(0);
      expect(secondsOf(sim, "c", "mirage-cloak")).toBeCloseTo(6, 0);
      expect(blockChanceOf(get(sim, "c"), "melee")).toBeCloseTo(0.54, 5);
      expect(blockChanceOf(get(sim, "c"), "projectile")).toBeCloseTo(0.54, 5);
    });
  });

  describe("Vital Boon", () => {
    it("+88 maximum Health for 20 s, raising Health with it; the end heals 175", () => {
      const sim = match();
      const c = get(sim, "c");
      c.health = 5000;
      use(sim, "dervish.vital-boon", "c");
      expect(effectiveMaxHealth(c)).toBe(1e4 + 88);
      expect(c.health).toBe(5000 + 88);
      expect(secondsOf(sim, "c", "vital-boon")).toBeCloseTo(20, 0);
      const log = stepFor(sim, 21);
      expect(hasStatus(sim, "c", "vital-boon")).toBe(false);
      expect(effectiveMaxHealth(c)).toBe(1e4);
      const heals = log
        .filter((entry) => entry.skillId === "dervish.vital-boon")
        .flatMap((entry) => entry.events)
        .filter((event) => event.kind === "heal" && event.targetId === "c");
      expect(heals).toHaveLength(1);
      expect(heals[0]?.kind === "heal" ? heals[0].amount : 0).toBe(175);
    });

    it("on a full bar, the end leaves Health at the old maximum", () => {
      const sim = match();
      const c = get(sim, "c");
      use(sim, "dervish.vital-boon", "c");
      expect(c.health).toBe(1e4 + 88);
      stepFor(sim, 21);
      expect(c.health).toBe(1e4);
    });
  });

  describe("Guiding Hands", () => {
    it("ends the Dervish's Blindness, and its next 2 attacks cannot be blocked", () => {
      const sim = match();
      get(sim, "c").statuses.apply("blind", 10, "f", NO_RANKS);
      use(sim, "dervish.guiding-hands", "c");
      expect(hasStatus(sim, "c", "blind")).toBe(false);
      expect(secondsOf(sim, "c", "guiding-hands")).toBeCloseTo(20, 0);
      guard(sim);
      // Plain swings: an attack skill that spends a Dervish enchantment
      // could take Guiding Hands itself.
      expect(sim.requestAttack("c", "f")).toEqual({ ok: true });
      const outcomes: string[] = [];
      for (let i = 0; i < 10 / DT && outcomes.length < 3; i += 1) {
        for (const event of events(sim.step(DT).log)) {
          if (
            (event.kind === "damage" || event.kind === "attack-blocked") &&
            event.targetId === "f" &&
            outcomes.length < 3
          ) {
            outcomes.push(event.kind);
          }
        }
      }
      expect(outcomes).toEqual(["damage", "damage", "attack-blocked"]);
      expect(hasStatus(sim, "c", "guiding-hands")).toBe(false);
    });
  });
});
