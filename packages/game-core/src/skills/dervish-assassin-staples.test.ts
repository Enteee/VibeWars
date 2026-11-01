import { describe, expect, it } from "vitest";

import { AREA_NEARBY, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import type { Combatant, Skill } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * Dervish and Assassin staples (#1551): Mystic Sandstorm, Grenth's Grasp,
 * Rending Aura, Reaper's Sweep, Pious Assault (PvP), Chilling Victory,
 * Wearying Strike and Shadow Prison. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["dervish.scythe-mastery", 12],
  ["dervish.wind-prayers", 12],
  ["dervish.earth-prayers", 12],
  ["dervish.mysticism", 12],
  ["assassin.deadly-arts", 12],
]);

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

describe("the eight are the corpus's (#1551)", () => {
  it.each([
    [
      "dervish.mystic-sandstorm",
      1532,
      "spell",
      false,
      false,
      "earth-prayers",
      "adrenaline",
      5,
      1,
      8,
    ],
    ["dervish.grenths-grasp", 1756, "enchantment", true, true, "wind-prayers", "energy", 5, 0, 10],
    ["dervish.rending-aura", 1765, "enchantment", false, true, "wind-prayers", "energy", 10, 0, 10],
    ["dervish.reapers-sweep", 1767, "attack", true, false, "scythe-mastery", "adrenaline", 7, 0, 0],
    ["dervish.pious-assault", 1490, "attack", false, false, "scythe-mastery", "energy", 5, 0, 12],
    [
      "dervish.chilling-victory",
      1539,
      "attack",
      false,
      false,
      "scythe-mastery",
      "adrenaline",
      6,
      0,
      0,
    ],
    [
      "dervish.wearying-strike",
      1537,
      "attack",
      false,
      false,
      "scythe-mastery",
      "adrenaline",
      6,
      0,
      0,
    ],
    ["assassin.shadow-prison", 1652, "hex", true, false, "deadly-arts", "energy", 5, 0.25, 15],
  ] as const)(
    "%s: gwId %i, %s, elite %s, flash %s, %s, %s %i, %d s, %i s recharge",
    (id, gwId, type, elite, flash, attribute, cost, amount, activation, recharge) => {
      const profession = id.split(".")[0];
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        flash,
        attributeId: `${profession ?? ""}.${attribute}`,
        cost: { kind: cost, amount },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: type === "attack" ? RANGE_MELEE : RANGE_SPELL,
      });
    },
  );

  it("Pious Assault is a melee attack, the others scythe attacks", () => {
    expect(skill("dervish.pious-assault").attack?.weapon).toBe("melee");
    for (const id of ["reapers-sweep", "chilling-victory", "wearying-strike"]) {
      expect(skill(`dervish.${id}`).attack?.weapon, id).toBe("scythe");
    }
  });

  it("says Grenth's Grasp rides attack skills, not every physical attack", () => {
    expect(describeStatus("grenths-grasp")).toMatch(/foes your attack skills hit get Crippled/);
    expect(describeStatus("grenths-grasp")).not.toMatch(/physical attacks/);
  });

  it("says Wearying Strike's Weakness comes without a Dervish enchantment", () => {
    const texts = describeSkill(skill("dervish.wearying-strike"), RANKS).effects.map(
      ({ text }) => text,
    );
    expect(texts.join(" ")).toMatch(/If you have no Dervish enchantment/);
  });
});

describe("in a match (#1551)", () => {
  const BAR = [
    "dervish.mystic-sandstorm",
    "dervish.grenths-grasp",
    "dervish.rending-aura",
    "dervish.reapers-sweep",
    "dervish.pious-assault",
    "dervish.chilling-victory",
    "dervish.wearying-strike",
    "assassin.shadow-prison",
  ] as const;
  type BarSkill = (typeof BAR)[number];
  const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<BarSkill, number>;

  function body(id: string, team: number, spawn: Vec2): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [...BAR],
      attributeRanks: RANKS,
      equipment: {
        ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
        mainHand: {
          weapon: WEAPONS.scythe,
          attributeId: "dervish.scythe-mastery",
          damageType: WEAPONS.scythe.damageType,
          requirementMet: true,
          creatureDamageScale: undefined,
        },
      },
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
      seed: "dervish-assassin-staples",
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

  describe("Mystic Sandstorm", () => {
    it("strikes the foes near where it was cast 3 times, 34 earth each", () => {
      const sim = match();
      const log = use(sim, "dervish.mystic-sandstorm", "c");
      log.push(...stepFor(sim, 7));
      const hits = log
        .filter((entry) => entry.skillId === "dervish.mystic-sandstorm")
        .flatMap((entry) => entry.events)
        .filter((event) => event.kind === "damage");
      expect(hits.filter((event) => event.targetId === "f").map((event) => event.amount)).toEqual([
        34, 34, 34,
      ]);
      expect(new Set(hits.map((event) => event.targetId))).toEqual(new Set(["f", "h", "g"]));
    });

    it("lasts twice as long, 6 strikes, if the Dervish is enchanted as it is cast", () => {
      const sim = match();
      enchant(sim);
      const log = use(sim, "dervish.mystic-sandstorm", "c");
      // The enchantment going now does not shorten it: read at cast.
      get(sim, "c").statuses.removeByCategory("enchantment");
      log.push(...stepFor(sim, 8));
      expect(dealt(log, "dervish.mystic-sandstorm", "f")).toBe(6 * 34);
    });

    it("strikes an attacking foe for 18 more", () => {
      const sim = match();
      expect(sim.requestAttack("f", "c")).toEqual({ ok: true });
      stepFor(sim, 0.2);
      const log = use(sim, "dervish.mystic-sandstorm", "c");
      log.push(...stepFor(sim, 4));
      expect(dealt(log, "dervish.mystic-sandstorm", "f")).toBe(3 * 52);
    });
  });

  describe("Grenth's Grasp", () => {
    it("cripples nobody on a plain swing", () => {
      const sim = match();
      use(sim, "dervish.grenths-grasp", "c");
      expect(sim.requestAttack("c", "f")).toEqual({ ok: true });
      const log = stepFor(sim, 3);
      expect(log.some((entry) => entry.events.some((event) => event.kind === "damage"))).toBe(true);
      expect(hasStatus(sim, "f", "crippled")).toBe(false);
      expect(log.some((entry) => entry.skillId === "dervish.grenths-grasp")).toBe(false);
    });

    it("cripples each foe an attack skill hits for 9 s, and moves the Dervish's conditions onto them", () => {
      const sim = match();
      use(sim, "dervish.grenths-grasp", "c");
      const caster = get(sim, "c");
      caster.statuses.apply("bleeding", 10, "far", NO_RANKS);
      caster.statuses.apply("poison", 10, "far", NO_RANKS);
      use(sim, "dervish.chilling-victory");
      // The cleave's second victim too.
      for (const id of ["f", "h"]) {
        expect(secondsOf(sim, id, "crippled"), id).toBeCloseTo(9, 0);
      }
      expect(hasStatus(sim, "c", "bleeding") || hasStatus(sim, "c", "poison")).toBe(false);
      const moved = ["f", "h"].flatMap((id) =>
        ["bleeding", "poison"].filter((statusId) => hasStatus(sim, id, statusId)),
      );
      expect(moved.sort()).toEqual(["bleeding", "poison"]);
    });
  });

  describe("Rending Aura", () => {
    it("strikes the foes near the Dervish for 34 cold as it is cast", () => {
      const sim = match();
      const log = use(sim, "dervish.rending-aura", "c");
      for (const id of ["f", "h", "g"]) {
        expect(dealt(log, "dervish.rending-aura", id), id).toBe(34);
      }
      expect(dealt(log, "dervish.rending-aura", "far")).toBe(0);
      expect(hasStatus(sim, "c", "rending-aura")).toBe(true);
    });

    it("strips an enchantment from a knocked-down foe an attack skill hits, not from a standing one", () => {
      const sim = match();
      use(sim, "dervish.rending-aura", "c");
      get(sim, "f").statuses.apply("mystic-regeneration", 30, "f", NO_RANKS);
      // Reaper's Sweep's own knockdown comes after the blow: too late.
      enchant(sim);
      use(sim, "dervish.reapers-sweep");
      expect(hasStatus(sim, "f", "mystic-regeneration")).toBe(true);
      expect(get(sim, "f").knockdownRemaining).toBeGreaterThan(0);
      stepFor(sim, 0.5);
      use(sim, "dervish.wearying-strike");
      expect(hasStatus(sim, "f", "mystic-regeneration")).toBe(false);
    });

    it("cracks the armor of the foes near the Dervish for 8 s when it ends, early or not", () => {
      const sim = match();
      use(sim, "dervish.rending-aura", "c");
      get(sim, "c").statuses.removeByCategory("enchantment");
      stepFor(sim, 0.1);
      for (const id of ["f", "h", "g"]) {
        expect(secondsOf(sim, id, "cracked-armor"), id).toBeCloseTo(8, 0);
      }
      expect(hasStatus(sim, "far", "cracked-armor")).toBe(false);
    });
  });

  describe("Reaper's Sweep", () => {
    it("cripples for 13 s and, spending a Dervish enchantment, knocks down for 3 s", () => {
      const sim = match();
      enchant(sim);
      use(sim, "dervish.reapers-sweep");
      expect(secondsOf(sim, "f", "crippled")).toBeCloseTo(13, 0);
      expect(get(sim, "f").knockdownRemaining).toBeCloseTo(3, 0);
      expect(hasStatus(sim, "c", "mystic-regeneration")).toBe(false);
    });

    it("knocks nobody down without one", () => {
      const sim = match();
      use(sim, "dervish.reapers-sweep");
      expect(hasStatus(sim, "f", "crippled")).toBe(true);
      expect(get(sim, "f").knockdownRemaining).toBe(0);
    });
  });

  describe("Pious Assault (PvP)", () => {
    it("spends a Dervish enchantment even on a miss: recharges in 3 s, 35 to the target's adjacent foes", () => {
      const sim = match();
      enchant(sim);
      get(sim, "c").statuses.apply("blind", 10, "f", NO_RANKS);
      const log = use(sim, "dervish.pious-assault");
      expect(log.flatMap((entry) => entry.events).some((e) => e.kind === "attack-missed")).toBe(
        true,
      );
      expect(hasStatus(sim, "c", "mystic-regeneration")).toBe(false);
      expect(dealt(log, "dervish.pious-assault", "h")).toBe(35);
      expect(dealt(log, "dervish.pious-assault", "g")).toBe(0);
      const recharge = get(sim, "c").cast.rechargeRemaining.get("dervish.pious-assault");
      expect(recharge).toBeGreaterThan(2.5);
      expect(recharge).toBeLessThanOrEqual(3);
    });

    it("does nothing more without one", () => {
      const sim = match();
      const log = use(sim, "dervish.pious-assault");
      // h takes the cleave's blow, and no splash.
      expect(
        log
          .filter((entry) => entry.skillId === "dervish.pious-assault")
          .flatMap((entry) => entry.events)
          .filter((event) => event.kind === "damage" && event.targetId === "h"),
      ).toHaveLength(1);
      expect(get(sim, "c").cast.rechargeRemaining.get("dervish.pious-assault")).toBeGreaterThan(11);
    });
  });

  describe("Chilling Victory", () => {
    /** The damage `id` took from the use, blow first. */
    const taken = (log: readonly CombatLogEntry[], id: string): number[] =>
      log
        .filter((entry) => entry.skillId === "dervish.chilling-victory")
        .flatMap((entry) => entry.events)
        .flatMap((event) =>
          event.kind === "damage" && event.targetId === id ? [event.amount] : [],
        );

    it("strikes each victim with less Health than the Dervish, and the foes adjacent to it, for 26 cold", () => {
      const sim = match();
      // Read after the blow, as Victorious Sweep's: f is the low one, h
      // still above the Dervish once its cleave blow lands.
      get(sim, "c").health = 6000;
      get(sim, "f").health = 5000;
      const log = use(sim, "dervish.chilling-victory");
      // f: its blow, then 26. h: its cleave blow, then f's splash.
      for (const id of ["f", "h"]) {
        const hits = taken(log, id);
        expect(hits, id).toHaveLength(2);
        expect(hits[1], id).toBe(26);
      }
      expect(taken(log, "g")).toEqual([]);
    });

    it("adds nothing when no victim has less Health than the Dervish", () => {
      const sim = match();
      get(sim, "c").health = 3000;
      const log = use(sim, "dervish.chilling-victory");
      expect(taken(log, "f")).toHaveLength(1);
      expect(taken(log, "h")).toHaveLength(1);
    });
  });

  describe("Wearying Strike", () => {
    it("spends a Dervish enchantment for a 9 s Deep Wound, and no Weakness", () => {
      const sim = match();
      enchant(sim);
      use(sim, "dervish.wearying-strike");
      expect(secondsOf(sim, "f", "deep-wound")).toBeCloseTo(9, 0);
      expect(hasStatus(sim, "c", "mystic-regeneration")).toBe(false);
      expect(hasStatus(sim, "c", "weakness")).toBe(false);
    });

    it("weakens the Dervish for 10 s with only another profession's enchantment on", () => {
      const sim = match();
      get(sim, "c").statuses.apply("shadow-refuge", 4, "c", NO_RANKS);
      use(sim, "dervish.wearying-strike");
      expect(secondsOf(sim, "c", "weakness")).toBeCloseTo(10, 0);
      expect(hasStatus(sim, "c", "shadow-refuge")).toBe(true);
      expect(hasStatus(sim, "f", "deep-wound")).toBe(false);
    });
  });

  describe("Shadow Prison", () => {
    it("steps the Assassin to the foe and slows it 66% for 6 s", () => {
      const sim = match();
      use(sim, "assassin.shadow-prison", "far");
      const caster = sim.get("c");
      const foe = sim.get("far");
      expect(
        caster && foe
          ? Math.hypot(caster.position.x - foe.position.x, caster.position.y - foe.position.y)
          : Infinity,
      ).toBeLessThan(RANGE_MELEE);
      expect(secondsOf(sim, "far", "shadow-prison")).toBeCloseTo(6, 0);
    });
  });
});
