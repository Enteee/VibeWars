import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import { NO_RANKS } from "./status.js";
import { effectiveMaxHealth } from "./tick.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Dervish staples (#2207): Mystic Healing, Imbue Health, Intimidating
 * Aura, Eremite's Zeal and Vow of Silence. Numbers are the corpus's at
 * rank 12; the PvP ones where GW1 splits them.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["dervish.wind-prayers", 12],
  ["dervish.mysticism", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** What `id` reads as at rank 12, its lines joined. */
function text(id: string): string {
  return describeSkill(skill(id), RANKS)
    .effects.map((line) => line.text)
    .join(" | ");
}

describe("the five are the corpus's (#2207)", () => {
  it.each([
    ["mystic-healing", 1527, "spell", false, "wind-prayers", 5, 1, 10],
    ["imbue-health", 1526, "spell", false, "mysticism", 10, 0.25, 10],
    ["intimidating-aura", 1531, "enchantment", false, "mysticism", 10, 0.75, 20],
    ["eremites-zeal", 1524, "enchantment", false, "mysticism", 5, 0.25, 15],
    ["vow-of-silence", 1517, "enchantment", true, "mysticism", 5, 0.25, 10],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attribute, amount, activation, recharge) => {
      expect(skill(`dervish.${id}`)).toMatchObject({
        gwId,
        type,
        elite,
        flash: false,
        attributeId: `dervish.${attribute}`,
        cost: { kind: "energy", amount },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
      });
    },
  );

  it("Imbue Health cannot target its caster", () => {
    expect(skill("dervish.imbue-health").target).toBe("single-other-ally");
  });
});

describe("they read as GW1 words them (#2207)", () => {
  it("Mystic Healing heals you and every enchanted party member for 53", () => {
    expect(text("dervish.mystic-healing")).toMatch(/53/);
    expect(text("dervish.mystic-healing")).toMatch(/All party members with an enchantment/);
  });

  it("Imbue Health heals for 41% of your current Health, at most 300", () => {
    expect(text("dervish.imbue-health")).toBe(
      "Heals for 41% of your current Health (maximum 300 Health)",
    );
  });

  it("Intimidating Aura gives +88 maximum Health and −8 from weaker foes", () => {
    const words = describeStatus("intimidating-aura", RANKS);
    expect(words).toMatch(/\+88/);
    expect(words).toMatch(/−8 damage taken from foes with less Health/);
  });

  it("Eremite's Zeal gains 3 Energy a foe in earshot, now and as it ends", () => {
    expect(text("dervish.eremites-zeal")).toMatch(/3 energy for each foe/i);
    expect(describeStatus("eremites-zeal")).toMatch(/ends/i);
  });

  it("Vow of Silence: no spell targets you, and you cast none", () => {
    const words = describeStatus("vow-of-silence");
    expect(words).toMatch(/cannot be the target of spells/);
    expect(words).toMatch(/cannot cast spells/i);
  });
});

describe("in a match (#2207)", () => {
  const BAR = [
    "dervish.mystic-healing",
    "dervish.imbue-health",
    "dervish.intimidating-aura",
    "dervish.eremites-zeal",
    "dervish.vow-of-silence",
    "monk.orison-of-healing",
    "elementalist.flare",
  ] as const;
  type BarSkill = (typeof BAR)[number];
  const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<BarSkill, number>;

  function body(
    id: string,
    team: number,
    spawn: Vec2,
    ranks: ReadonlyMap<string, number> = RANKS,
  ): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [...BAR],
      attributeRanks: id === "c" ? ranks : new Map(),
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxHealth: 1000,
      maxEnergy: 100,
      spawn,
      facing: 0,
    };
  }

  /**
   * Dervish `c`; allies `a` in spell range and `b` far off; foes `f` and
   * `g` in earshot of `c`, `far` outside it.
   */
  function match(foesNear = true, ranks?: ReadonlyMap<string, number>): MatchSimulation {
    return new MatchSimulation({
      seed: "dervish-staples",
      participants: [
        body("c", 1, vec2(0, 0), ranks),
        body("a", 1, vec2(200, 0)),
        body("b", 1, vec2(1500, 0)),
        ...(foesNear ? [body("f", 0, vec2(0, 200)), body("g", 0, vec2(0, -200))] : []),
        body("far", 0, vec2(-(AREA_EARSHOT + 300), 0)),
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

  /** `caster` uses `skillId` on `targetId`, and the steps until it lands. */
  function use(
    sim: MatchSimulation,
    skillId: BarSkill,
    targetId = "c",
    caster = "c",
  ): CombatLogEntry[] {
    sim.setTarget(caster, targetId);
    expect(sim.requestSkill(caster, SLOT[skillId])?.check).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < 4 / DT; i += 1) {
      log.push(...sim.step(DT).log);
      if (log.some((entry) => entry.skillId === skillId)) {
        break;
      }
    }
    return log;
  }

  function events(log: readonly CombatLogEntry[]): CombatEvent[] {
    return log.flatMap((entry) => entry.events);
  }

  /** What `skillId` healed `id`, natural regeneration left out. */
  function healed(log: readonly CombatLogEntry[], id: string, skillId: string): number {
    return events(log.filter((entry) => entry.skillId === skillId)).reduce(
      (sum, event) => (event.kind === "heal" && event.targetId === id ? sum + event.amount : sum),
      0,
    );
  }

  function gained(log: readonly CombatLogEntry[], id: string): number {
    return events(log).reduce(
      (sum, event) =>
        event.kind === "energy-gain" && event.targetId === id ? sum + event.amount : sum,
      0,
    );
  }

  function hasStatus(sim: MatchSimulation, id: string, statusId: string): boolean {
    return [...get(sim, id).statuses.active].some((status) => status.id === statusId);
  }

  /** A Dervish enchantment on `id`, as if it had cast Mystic Regeneration. */
  function enchant(sim: MatchSimulation, id: string): void {
    get(sim, id).statuses.apply("mystic-regeneration", 30, id, NO_RANKS);
  }

  function hurt(sim: MatchSimulation, ...ids: string[]): void {
    for (const id of ids) {
      get(sim, id).health = 500;
    }
  }

  describe("Mystic Healing", () => {
    it("heals the unenchanted caster and every enchanted ally, however far, for 53", () => {
      const sim = match();
      enchant(sim, "b");
      hurt(sim, "c", "a", "b");
      const log = use(sim, "dervish.mystic-healing");
      expect(healed(log, "c", "dervish.mystic-healing")).toBe(53);
      expect(healed(log, "b", "dervish.mystic-healing")).toBe(53);
      expect(healed(log, "a", "dervish.mystic-healing")).toBe(0);
    });
  });

  describe("Imbue Health", () => {
    it("heals the ally for 41% of the caster's current Health", () => {
      const sim = match();
      get(sim, "a").health = 100;
      get(sim, "c").health = 100;
      const log = use(sim, "dervish.imbue-health", "a");
      expect(healed(log, "a", "dervish.imbue-health")).toBe(41);
    });

    it("at Mysticism 8 heals 29 of 100, no float loss", () => {
      const sim = match(true, new Map([...RANKS, ["dervish.mysticism", 8]]));
      get(sim, "a").health = 100;
      get(sim, "c").health = 100;
      const log = use(sim, "dervish.imbue-health", "a");
      expect(healed(log, "a", "dervish.imbue-health")).toBe(29);
    });

    it("heals at most 300", () => {
      const sim = match();
      get(sim, "c").maxHealth = 1000;
      get(sim, "c").health = 1000;
      get(sim, "a").health = 100;
      const log = use(sim, "dervish.imbue-health", "a");
      expect(healed(log, "a", "dervish.imbue-health")).toBe(300);
    });
  });

  describe("Intimidating Aura", () => {
    it("adds 88 maximum Health, and dropping it clamps Health", () => {
      const sim = match();
      use(sim, "dervish.intimidating-aura");
      const dervish = get(sim, "c");
      expect(effectiveMaxHealth(dervish)).toBe(1088);
      dervish.health = 1088;
      dervish.statuses.remove("intimidating-aura");
      stepFor(sim, DT);
      expect(dervish.health).toBeLessThanOrEqual(1000);
    });

    it("takes 8 off a weaker foe's spell damage, nothing off an equal one's", () => {
      const flare = (foeHealth: number): number => {
        const sim = match();
        use(sim, "dervish.intimidating-aura");
        get(sim, "c").health = 800;
        get(sim, "f").health = foeHealth;
        // Flare flies: its damage lands after the cast.
        const log = [...use(sim, "elementalist.flare", "c", "f"), ...stepFor(sim, 1)];
        return events(log).reduce(
          (sum, event) =>
            event.kind === "damage" && event.targetId === "c" ? sum + event.amount : sum,
          0,
        );
      };
      const plain = flare(800);
      expect(plain).toBeGreaterThan(8);
      expect(flare(799)).toBe(plain - 8);
    });
  });

  describe("Eremite's Zeal", () => {
    it("gains 3 Energy for each foe in earshot as it is cast, and again as it ends", () => {
      const sim = match();
      get(sim, "c").energy = 20;
      const cast = use(sim, "dervish.eremites-zeal");
      expect(gained(cast, "c")).toBe(6);
      expect(hasStatus(sim, "c", "eremites-zeal")).toBe(true);
      get(sim, "c").energy = 20;
      const end = stepFor(sim, 10.5);
      expect(gained(end, "c")).toBeGreaterThanOrEqual(6);
      expect(hasStatus(sim, "c", "eremites-zeal")).toBe(false);
    });

    it("stripped early, still pays as it ends", () => {
      const sim = match();
      use(sim, "dervish.eremites-zeal");
      get(sim, "c").energy = 20;
      get(sim, "c").statuses.remove("eremites-zeal");
      expect(gained(stepFor(sim, DT), "c")).toBe(6);
    });

    it("at Mysticism 0 pays 1 for each foe, as cast and as it ends", () => {
      const sim = match(true, new Map([...RANKS, ["dervish.mysticism", 0]]));
      get(sim, "c").energy = 20;
      expect(gained(use(sim, "dervish.eremites-zeal"), "c")).toBe(2);
      get(sim, "c").energy = 20;
      get(sim, "c").statuses.remove("eremites-zeal");
      expect(gained(stepFor(sim, DT), "c")).toBe(2);
    });

    it("with no foe in earshot, gains nothing", () => {
      const sim = match(false);
      get(sim, "c").energy = 20;
      expect(gained(use(sim, "dervish.eremites-zeal"), "c")).toBe(0);
    });
  });

  describe("Vow of Silence", () => {
    it("lasts 9 s; no ally nor foe spell may target the bearer", () => {
      const sim = match();
      use(sim, "dervish.vow-of-silence");
      const vow = [...get(sim, "c").statuses.active].find(({ id }) => id === "vow-of-silence");
      expect(vow?.remainingSeconds).toBeCloseTo(9, 0);
      for (const [caster, spell] of [
        ["a", "monk.orison-of-healing"],
        ["f", "elementalist.flare"],
      ] as const) {
        sim.setTarget(caster, "c");
        expect(sim.requestSkill(caster, SLOT[spell])?.check, caster).toEqual({
          ok: false,
          reason: "invalid-target-untargetable",
        });
      }
    });

    it("the bearer casts no spell, its own self-targeted ones included", () => {
      const sim = match();
      use(sim, "dervish.vow-of-silence");
      expect(sim.requestSkill("c", SLOT["dervish.mystic-healing"])?.check).toEqual({
        ok: false,
        reason: "cannot-cast-spells",
      });
    });
  });
});
