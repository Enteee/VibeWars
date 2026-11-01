import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY, RANGE_NATURE_RITUAL, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Necromancer and Elementalist staples (#1540): Blood is Power, Order of
 * Pain, Plague Signet, Mark of Rodgort, Lava Font, Ward Against Elements,
 * Shock Arrow and Infuriating Heat (PvP). Numbers are the corpus's at
 * rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["necromancer.blood-magic", 12],
  ["necromancer.curses", 12],
  ["elementalist.fire-magic", 12],
  ["elementalist.earth-magic", 12],
  ["elementalist.air-magic", 12],
  ["elementalist.energy-storage", 12],
  ["ranger.expertise", 12],
  ["warrior.axe-mastery", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** `user` pays for `skillId` and it lands on `target`. */
function use(user: Combatant, skillId: string, target: Combatant): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings: new Map(),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

function damageIn(events: readonly CombatEvent[], id: string): number {
  return events.reduce(
    (sum, event) => (event.kind === "damage" && event.targetId === id ? sum + event.amount : sum),
    0,
  );
}

function described(id: string): string[] {
  return describeSkill(skill(id), RANKS).effects.map(({ text }) => text);
}

describe("the eight are the corpus's (#1540)", () => {
  it.each([
    ["necromancer.blood-is-power", 119, "enchantment", true, "blood-magic", 1, 0.25, 0],
    ["necromancer.order-of-pain", 134, "enchantment", false, "blood-magic", 10, 2, 0],
    ["necromancer.plague-signet", 132, "signet", true, "curses", 0, 1, 4],
    ["elementalist.mark-of-rodgort", 190, "hex", false, "fire-magic", 15, 1, 15],
    ["elementalist.lava-font", 195, "spell", false, "fire-magic", 10, 1.5, 4],
    ["elementalist.ward-against-elements", 175, "ward", false, "earth-magic", 10, 1, 20],
    ["elementalist.shock-arrow", 1082, "spell", false, "air-magic", 5, 1, 8],
    ["ranger.infuriating-heat", 1730, "nature-ritual", true, "expertise", 5, 2, 30],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attribute, energy, activation, recharge) => {
      const profession = id.split(".")[0];
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId: `${profession ?? ""}.${attribute}`,
        cost: energy === 0 ? undefined : { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
      });
    },
  );
});

describe("Blood is Power (#1540)", () => {
  it("costs the Necromancer 33% of their health and gives the ally +5 energy regeneration for 10 s", () => {
    const necro = makeCombatant({ id: "n", attributeRanks: RANKS, maxHealth: 600, health: 600 });
    const ally = makeCombatant({ id: "a" });
    use(necro, "necromancer.blood-is-power", ally);
    expect(necro.health).toBe(600 - 198);
    expect(ally.statuses.get("blood-is-power")?.durationSeconds).toBe(10);
    expect(getStatusDefinition("blood-is-power").energyPips).toBe(5);
    expect(skill("necromancer.blood-is-power").target).toBe("single-other-ally");
  });
});

describe("Plague Signet (#1540)", () => {
  it("moves every condition with 180% of the time it had left", () => {
    const necro = makeCombatant({ id: "n", attributeRanks: RANKS });
    const foe = makeCombatant({ id: "f", team: 1 });
    necro.statuses.apply("burning", 4, "x", NO_RANKS);
    necro.statuses.apply("bleeding", 10, "x", NO_RANKS);
    necro.statuses.apply("crippled", 6, "x", NO_RANKS);
    use(necro, "necromancer.plague-signet", foe);
    expect(necro.statuses.countByCategory("condition")).toBe(0);
    expect(foe.statuses.get("burning")?.remainingSeconds).toBeCloseTo(7.2, 5);
    expect(foe.statuses.get("bleeding")?.remainingSeconds).toBeCloseTo(18, 5);
    expect(foe.statuses.get("crippled")?.remainingSeconds).toBeCloseTo(10.8, 5);
  });

  it("with no condition on the Necromancer, moves nothing", () => {
    const necro = makeCombatant({ id: "n", attributeRanks: RANKS });
    const foe = makeCombatant({ id: "f", team: 1 });
    expect(use(necro, "necromancer.plague-signet", foe)).toEqual([]);
    expect(foe.statuses.size).toBe(0);
  });

  it("says so", () => {
    expect(described("necromancer.plague-signet")).toEqual([
      "Moves all of your conditions with 180% of their remaining durations to the target",
    ]);
  });
});

describe("Ward Against Elements (#1540)", () => {
  it("a Fireball meets 24 more armor inside it", () => {
    const ele = makeCombatant({ id: "e", attributeRanks: RANKS });
    const bare = makeCombatant({ id: "a", team: 1, health: 1000, maxHealth: 1000 });
    const warded = makeCombatant({ id: "b", team: 1, health: 1000, maxHealth: 1000 });
    warded.statuses.apply("ward-against-elements", 10, "ward", NO_RANKS);
    const open = damageIn(use(ele, "elementalist.fireball", bare), "a");
    const shielded = damageIn(use(ele, "elementalist.fireball", warded), "b");
    expect(shielded).toBeGreaterThan(0);
    expect(shielded).toBeLessThan(open);
    expect(getStatusDefinition("ward-against-elements").conditionalArmor).toEqual([
      { amount: 24, conditions: [{ kind: "vs-elemental" }] },
    ]);
  });
});

describe("Shock Arrow (#1540)", () => {
  it("strikes for 41 lightning at 25% penetration, and pays 11 energy back off Cracked Armor", () => {
    expect(skill("elementalist.shock-arrow").projectile).toEqual(
      skill("elementalist.lightning-orb").projectile,
    );
    const ele = makeCombatant({ id: "e", attributeRanks: RANKS, energy: 30, maxEnergy: 80 });
    const cracked = makeCombatant({ id: "f", team: 1, health: 1000, maxHealth: 1000 });
    cracked.statuses.apply("cracked-armor", 10, "x", NO_RANKS);
    const events = use(ele, "elementalist.shock-arrow", cracked);
    expect(damageIn(events, "f")).toBeGreaterThan(0);
    expect(ele.energy).toBe(30 - 5 + 11);
  });

  it("without Cracked Armor, damage only", () => {
    const ele = makeCombatant({ id: "e", attributeRanks: RANKS, energy: 30, maxEnergy: 80 });
    const foe = makeCombatant({ id: "f", team: 1, health: 1000, maxHealth: 1000 });
    expect(damageIn(use(ele, "elementalist.shock-arrow", foe), "f")).toBeGreaterThan(0);
    expect(ele.energy).toBe(25);
  });
});

describe("in a match (#1540)", () => {
  const BAR = [
    "necromancer.blood-is-power",
    "necromancer.order-of-pain",
    "elementalist.mark-of-rodgort",
    "elementalist.lava-font",
    "elementalist.shock-arrow",
    "ranger.infuriating-heat",
    "elementalist.ward-against-elements",
  ] as const;
  const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<
    (typeof BAR)[number],
    number
  >;

  function body(id: string, team: number, spawn: Vec2): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [...BAR],
      attributeRanks: RANKS,
      equipment: {
        ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
        mainHand: {
          weapon: WEAPONS.axe,
          attributeId: "warrior.axe-mastery",
          damageType: WEAPONS.axe.damageType,
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
   * Caster `c` and its ally `a` on one side; foe `f` adjacent to `c`, `g`
   * near `f`, and `far` beyond both, out of every area.
   */
  function match(): MatchSimulation {
    return new MatchSimulation({
      seed: "necro-ele-staples",
      participants: [
        body("c", 1, vec2(0, 0)),
        body("a", 1, vec2(0, 60)),
        body("f", 0, vec2(32, 0)),
        body("g", 0, vec2(32 + AREA_NEARBY - 10, 0)),
        body("far", 0, vec2(32 + AREA_NEARBY + 100, 0)),
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

  /** `c` uses `skillId` on `targetId`, and the steps until it has landed. */
  function cast(sim: MatchSimulation, skillId: (typeof BAR)[number], targetId = "f") {
    sim.setTarget("c", targetId);
    expect(sim.requestSkill("c", SLOT[skillId])?.check).toEqual({ ok: true });
    return stepFor(sim, skill(skillId).activationSeconds + 0.5);
  }

  function burns(sim: MatchSimulation, id: string): boolean {
    return get(sim, id).statuses.has("burning");
  }

  it("Blood is Power cannot target its caster", () => {
    const sim = match();
    sim.setTarget("c", "c");
    expect(sim.requestSkill("c", SLOT["necromancer.blood-is-power"])?.check).toEqual({
      ok: false,
      reason: "invalid-target-self",
    });
  });

  describe("Order of Pain", () => {
    it("costs the caster 17% once, and enchants the whole party for 5 s", () => {
      const sim = match();
      const caster = get(sim, "c");
      cast(sim, "necromancer.order-of-pain");
      expect(caster.health).toBe(1e4 - 1700);
      for (const id of ["c", "a"]) {
        expect(get(sim, id).statuses.has("order-of-pain"), id).toBe(true);
      }
      expect(get(sim, "f").statuses.has("order-of-pain")).toBe(false);
    });

    it("adds 13 to each axe blow that hits", () => {
      const sim = match();
      cast(sim, "necromancer.order-of-pain");
      expect(sim.requestAttack("c", "f")).toEqual({ ok: true });
      const log = stepFor(sim, 3);
      const riders = log.filter((entry) => entry.skillId === "necromancer.order-of-pain");
      expect(riders.length).toBeGreaterThan(0);
      for (const entry of riders) {
        expect(damageIn(entry.events, "f")).toBe(13);
      }
    });
  });

  describe("Mark of Rodgort", () => {
    it("hexes the target and the foes near it for 30 s, and no one further", () => {
      const sim = match();
      cast(sim, "elementalist.mark-of-rodgort");
      expect(get(sim, "f").statuses.get("mark-of-rodgort")?.durationSeconds).toBe(30);
      expect(get(sim, "g").statuses.has("mark-of-rodgort")).toBe(true);
      expect(get(sim, "far").statuses.has("mark-of-rodgort")).toBe(false);
    });

    it("Lava Font sets a marked foe on fire for 3 s, and an unmarked one not", () => {
      const sim = match();
      cast(sim, "elementalist.mark-of-rodgort");
      expect(burns(sim, "f")).toBe(false);
      const log = cast(sim, "elementalist.lava-font");
      expect(
        damageIn(
          log.flatMap((entry) => entry.events),
          "f",
        ),
      ).toBeGreaterThan(0);
      expect(get(sim, "f").statuses.get("burning")?.durationSeconds).toBe(3);

      const unmarked = match();
      cast(unmarked, "elementalist.lava-font");
      stepFor(unmarked, 1);
      expect(burns(unmarked, "f")).toBe(false);
    });

    it("a Shock Arrow's lightning does not burn a marked foe", () => {
      const sim = match();
      cast(sim, "elementalist.mark-of-rodgort");
      const log = cast(sim, "elementalist.shock-arrow");
      stepFor(sim, 1);
      expect(
        damageIn(
          log.flatMap((entry) => entry.events),
          "f",
        ),
      ).toBeGreaterThan(0);
      expect(burns(sim, "f")).toBe(false);
    });

    it("says so", () => {
      expect(described("elementalist.mark-of-rodgort")).toEqual([
        "Applies Mark of Rodgort for 30s (whenever it takes fire damage from a foe: applies Burning for 3s (−7 Health degeneration))",
      ]);
    });
  });

  it("Lava Font strikes the foes adjacent to where it was cast, each second for 5 s", () => {
    const sim = match();
    const log = cast(sim, "elementalist.lava-font");
    log.push(...stepFor(sim, 6));
    const hits = log
      .filter((entry) => entry.skillId === "elementalist.lava-font")
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "damage");
    expect(new Set(hits.map((event) => event.targetId))).toEqual(new Set(["f"]));
    expect(hits).toHaveLength(5);
    expect(AREA_ADJACENT).toBeLessThan(32 + AREA_NEARBY - 10);
    // Ground where the caster stood, not a symbol at a target.
    expect(described("elementalist.lava-font")[0]).toMatch(
      /^Marks the ground at your location for 5 seconds/,
    );
  });

  it("Ward Against Elements: the caster and the ally inside it are warded, a foe is not", () => {
    const sim = match();
    cast(sim, "elementalist.ward-against-elements", "c");
    expect(["c", "a", "f"].map((id) => get(sim, id).statuses.has("ward-against-elements"))).toEqual(
      [true, true, false],
    );
  });

  it("Infuriating Heat: a level-8 spirit for 102 s whose aura speeds both teams' adrenaline by 59%", () => {
    const sim = match();
    cast(sim, "ranger.infuriating-heat", "c");
    const spirits = [...sim.participants()].filter(
      (participant: Participant) => participant.creature?.kind === "spirit",
    );
    expect(spirits).toHaveLength(1);
    expect(spirits[0]?.combatant.maxHealth).toBe(210);
    expect(spirits[0]?.creature?.expiresInSeconds).toBeCloseTo(101.5 - DT, 5);
    for (const id of ["c", "a", "f", "far"]) {
      expect(get(sim, id).statuses.has("infuriating-heat"), id).toBe(true);
    }
    expect(32 + AREA_NEARBY + 100).toBeLessThan(RANGE_NATURE_RITUAL);
    expect(getStatusDefinition("infuriating-heat").adrenalineGainFaster).toBe(0.59);
  });
});
