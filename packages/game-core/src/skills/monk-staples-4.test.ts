import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Monk staples 4 (#1511): Aegis, Shield of Deflection, Shielding Hands,
 * Zealous Benediction, Draw Conditions, Spell Breaker, Blessed Light,
 * Words of Comfort, Light of Deliverance (PvP) and Signet of
 * Rejuvenation. Numbers are the corpus's at rank 12; Divine Favor is at 0,
 * so no heal carries its bonus, but where it scales Blessed Light.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["monk.healing-prayers", 12],
  ["monk.protection-prayers", 12],
  ["monk.smiting-prayers", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function monk(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "monk", attributeRanks: RANKS, ...overrides });
}

function ally(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "ally", health: 100, maxHealth: 500, ...overrides });
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

/** What `events` healed `id` for. */
function healed(events: readonly CombatEvent[], id = "ally"): number {
  return events.reduce(
    (sum, event) => (event.kind === "heal" && event.targetId === id ? sum + event.amount : sum),
    0,
  );
}

function described(id: string): string[] {
  return describeSkill(skill(id), RANKS).effects.map(({ text }) => text);
}

describe("the ten are the corpus's (#1511)", () => {
  it.each([
    ["monk.aegis", 257, "enchantment", false, "protection-prayers", 10, 2, 30, "self"],
    [
      "monk.shield-of-deflection",
      259,
      "enchantment",
      true,
      "protection-prayers",
      10,
      0.25,
      5,
      "single-ally",
    ],
    [
      "monk.shielding-hands",
      299,
      "enchantment",
      false,
      "protection-prayers",
      5,
      0.25,
      15,
      "single-ally",
    ],
    [
      "monk.zealous-benediction",
      1687,
      "spell",
      true,
      "protection-prayers",
      10,
      0.75,
      4,
      "single-ally",
    ],
    [
      "monk.draw-conditions",
      311,
      "spell",
      false,
      "protection-prayers",
      5,
      0.25,
      4,
      "single-other-ally",
    ],
    ["monk.spell-breaker", 273, "enchantment", true, "divine-favor", 15, 1, 45, "single-ally"],
    ["monk.blessed-light", 941, "spell", true, "divine-favor", 5, 0.75, 5, "single-ally"],
    ["monk.words-of-comfort", 1396, "spell", false, "healing-prayers", 5, 1, 4, "single-ally"],
    ["monk.light-of-deliverance", 1397, "spell", true, "healing-prayers", 5, 1, 8, "self"],
    [
      "monk.signet-of-rejuvenation",
      887,
      "signet",
      false,
      "healing-prayers",
      0,
      1,
      8,
      "single-ally",
    ],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge, on %s",
    (id, gwId, type, elite, attribute, energy, activation, recharge, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        profession: "monk",
        attributeId: `monk.${attribute}`,
        cost: energy === 0 ? undefined : { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );
});

describe("the enchantments (#1511)", () => {
  it("Aegis: everyone in earshot, the Monk too, blocks half of all attacks for 13 s", () => {
    expect(skill("monk.aegis")).toMatchObject({
      area: { radius: AREA_EARSHOT, origin: "caster", affects: "allies", includesCaster: true },
      effects: [{ kind: "apply-status", statusId: "aegis", durationSeconds: 13 }],
    });
    expect(getStatusDefinition("aegis").block).toEqual({ chance: 0.5, against: "all" });
  });

  it("Shield of Deflection: 75% block and +27 armor for 9 s", () => {
    const target = ally();
    use(monk(), "monk.shield-of-deflection", target);
    expect(target.statuses.get("shield-of-deflection")?.durationSeconds).toBe(9);
    expect(getStatusDefinition("shield-of-deflection").block).toEqual({
      chance: 0.75,
      against: "all",
    });
    // Protection Prayers 12 (#1976).
    expect(aggregateModifiers(target.statuses.active).armorModifier).toBe(27);
  });

  it("Shielding Hands: 15 off damage and life steal for 8 s", () => {
    const definition = getStatusDefinition("shielding-hands");
    expect([definition.damageReduction, definition.lifeStealReduction]).toEqual([15, 15]);
  });

  it("say so", () => {
    expect(described("monk.spell-breaker")).toEqual([
      "Applies Spell Breaker for 15s (cannot be the target of enemy spells)",
    ]);
    expect(described("monk.shielding-hands")).toEqual([
      "Applies Shielding Hands for 8s (−15 damage taken, −15 life stolen. When it ends: heals for 41)",
    ]);
  });
});

describe("Zealous Benediction (#1511)", () => {
  it("heals 150, and an ally below half gives the Monk 7 energy", () => {
    const user = monk();
    const target = ally({ health: 200 });
    expect(healed(use(user, "monk.zealous-benediction", target))).toBe(150);
    expect(user.energy).toBe(47);
  });

  it("an ally at 60% is healed, and no energy comes back", () => {
    const user = monk();
    const target = ally({ health: 300 });
    expect(healed(use(user, "monk.zealous-benediction", target))).toBe(150);
    expect(user.energy).toBe(40);
  });
});

describe("Draw Conditions (#1511)", () => {
  it("takes all three of the ally's conditions, with their time left, and heals 22 each", () => {
    const user = monk({ health: 100 });
    const target = ally();
    target.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    target.statuses.apply("poison", 8, "foe", NO_RANKS);
    target.statuses.apply("burning", 3, "foe", NO_RANKS);
    const events = use(user, "monk.draw-conditions", target);
    expect(target.statuses.countByCategory("condition")).toBe(0);
    expect(
      (["bleeding", "poison", "burning"] as const).map(
        (id) => user.statuses.get(id)?.remainingSeconds,
      ),
    ).toEqual([10, 8, 3]);
    expect(healed(events, "monk")).toBe(66);
  });

  it("with none, does nothing, and the energy is spent", () => {
    const user = monk();
    expect(use(user, "monk.draw-conditions", ally())).toEqual([]);
    expect(user.energy).toBe(45);
  });

  it("a Bleeding the Monk already has for longer stays", () => {
    const user = monk();
    user.statuses.apply("bleeding", 20, "foe", NO_RANKS);
    const target = ally();
    target.statuses.apply("bleeding", 5, "foe", NO_RANKS);
    use(user, "monk.draw-conditions", target);
    expect(user.statuses.get("bleeding")?.remainingSeconds).toBe(20);
    expect(target.statuses.has("bleeding")).toBe(false);
  });

  it("says so, as Plague Touch still does", () => {
    expect(described("monk.draw-conditions")).toEqual([
      "Moves all of target's conditions to you; you are healed for 22 for each",
    ]);
    expect(described("necromancer.plague-touch")).toEqual([
      "Moves up to 3 of your conditions to the target",
    ]);
  });
});

describe("Blessed Light (#1511)", () => {
  it("heals 98, and Divine Favor's 38, and takes one condition and one hex", () => {
    const user = monk({ attributeRanks: new Map([["monk.divine-favor", 12]]) });
    const target = ally();
    target.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    target.statuses.apply("poison", 10, "foe", NO_RANKS);
    target.statuses.apply("empathy", 10, "foe", NO_RANKS);
    target.statuses.apply("malaise", 10, "foe", NO_RANKS);
    expect(healed(use(user, "monk.blessed-light", target))).toBe(98 + 38);
    expect(target.statuses.countByCategory("condition")).toBe(1);
    expect(target.statuses.countByCategory("hex")).toBe(1);
  });
});

describe("Words of Comfort (#1511)", () => {
  it("heals 56, and 44 more on an ally with a condition", () => {
    expect(healed(use(monk(), "monk.words-of-comfort", ally()))).toBe(56);
    const conditioned = ally();
    conditioned.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    expect(healed(use(monk(), "monk.words-of-comfort", conditioned))).toBe(100);
  });
});

describe("Signet of Rejuvenation (#1511)", () => {
  const SWING = { targetId: "foe", swingElapsed: 0, unreachableSeconds: 0 };

  it("heals 63, and 63 more on an ally casting a spell or attacking, never 63 twice more", () => {
    expect(healed(use(monk(), "monk.signet-of-rejuvenation", ally()))).toBe(63);
    const attacking = ally({ attack: SWING });
    expect(healed(use(monk(), "monk.signet-of-rejuvenation", attacking))).toBe(126);
    const casting = ally();
    casting.cast.beginCast("elementalist.fireball", "foe", 2, undefined);
    expect(healed(use(monk(), "monk.signet-of-rejuvenation", casting))).toBe(126);
    const both = ally({ attack: SWING });
    both.cast.beginCast("elementalist.fireball", "foe", 2, undefined);
    expect(healed(use(monk(), "monk.signet-of-rejuvenation", both))).toBe(126);
  });

  it("a chant is no spell: the base heal only", () => {
    const chanting = ally();
    chanting.cast.beginCast("paragon.defensive-anthem", "ally", 2, undefined);
    expect(healed(use(monk(), "monk.signet-of-rejuvenation", chanting))).toBe(63);
  });

  it("says so", () => {
    expect(described("monk.signet-of-rejuvenation")).toEqual([
      "Heals for 63",
      "If target is casting a spell or attacking: heals for 63",
    ]);
  });
});

describe("in a match (#1511)", () => {
  const MONK_BAR = [
    "monk.spell-breaker",
    "monk.shielding-hands",
    "monk.light-of-deliverance",
    "monk.smite-hex",
    "monk.symbol-of-wrath",
    "monk.words-of-comfort",
  ] as const;
  const SLOT = Object.fromEntries(MONK_BAR.map((id, slot) => [id, slot])) as Record<
    (typeof MONK_BAR)[number],
    number
  >;
  /** The foe's bar. */
  const FIREBALL = 0;

  function body(id: string, team: number, spawn: Vec2, skillBar: string[]): ParticipantSpec {
    return {
      id,
      team,
      skillBar,
      attributeRanks: new Map([
        ...RANKS,
        ["elementalist.fire-magic", 12],
        ["warrior.axe-mastery", 12],
      ]),
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
   * Monk `m`; its ally `a`, and `x` beside `a`, with Orison of Healing;
   * foe `f` in touch of both, with Fireball and an axe.
   */
  function match(): MatchSimulation {
    return new MatchSimulation({
      seed: "monk-staples-4",
      participants: [
        body("m", 1, vec2(0, 0), [...MONK_BAR]),
        body("a", 1, vec2(100, 0), ["monk.orison-of-healing"]),
        body("x", 1, vec2(100, 30), ["monk.orison-of-healing"]),
        body("f", 0, vec2(130, 0), ["elementalist.fireball"]),
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

  /** `m` uses `skillId` on `targetId`, and the steps until it has landed. */
  function cast(sim: MatchSimulation, skillId: (typeof MONK_BAR)[number], targetId = "a") {
    sim.setTarget("m", targetId);
    expect(sim.requestSkill("m", SLOT[skillId])?.check).toEqual({ ok: true });
    return stepFor(sim, skill(skillId).activationSeconds + 0.5);
  }

  function damageTo(log: readonly CombatLogEntry[], skillId: string, id: string): number {
    return log
      .filter((entry) => entry.skillId === skillId)
      .flatMap((entry) => entry.events)
      .reduce(
        (sum, event) =>
          event.kind === "damage" && event.targetId === id ? sum + event.amount : sum,
        0,
      );
  }

  describe("Spell Breaker", () => {
    it("refuses a foe's Fireball at the bearer for 15 s, nothing spent", () => {
      const sim = match();
      cast(sim, "monk.spell-breaker");
      expect(get(sim, "a").statuses.get("spell-breaker")?.durationSeconds).toBe(15);
      sim.setTarget("f", "a");
      const energy = get(sim, "f").energy;
      expect(sim.requestSkill("f", FIREBALL)?.check).toEqual({
        ok: false,
        reason: "invalid-target-untargetable",
      });
      expect(get(sim, "f").energy).toBe(energy);
      stepFor(sim, 15);
      expect(sim.requestSkill("f", FIREBALL)?.check).toEqual({ ok: true });
    });

    it("lets an ally's spell, a foe's attack and a Fireball beside it through", () => {
      const sim = match();
      cast(sim, "monk.spell-breaker");
      sim.setTarget("x", "a");
      expect(sim.requestSkill("x", 0)?.check).toEqual({ ok: true });
      expect(sim.requestAttack("f", "a")).toEqual({ ok: true });
      stepFor(sim, 2);
      sim.setTarget("f", "x");
      expect(sim.requestSkill("f", FIREBALL)?.check).toEqual({ ok: true });
      const log = stepFor(sim, 4);
      expect(damageTo(log, "elementalist.fireball", "a")).toBeGreaterThan(0);
    });

    it("stops a foe walking in to Fireball the bearer when it lands mid-walk", () => {
      const sim = new MatchSimulation({
        seed: "monk-staples-4",
        participants: [
          body("m", 1, vec2(0, 0), [...MONK_BAR]),
          body("a", 1, vec2(100, 0), ["monk.orison-of-healing"]),
          body("f", 0, vec2(100 + RANGE_SPELL * 2, 0), ["elementalist.fireball"]),
        ],
      });
      const foe = sim.get("f");
      if (foe === undefined) {
        throw new Error("no participant f");
      }
      sim.setTarget("f", "a");
      expect(sim.requestSkill("f", FIREBALL)?.check).toEqual({ ok: true });
      expect(foe.pendingSkill).toBeDefined();
      cast(sim, "monk.spell-breaker");
      expect(get(sim, "a").statuses.has("spell-breaker")).toBe(true);
      expect(foe.pendingSkill).toBeUndefined();
      const stopped = foe.position.x;
      stepFor(sim, 1);
      expect(foe.position.x).toBe(stopped);
      expect(get(sim, "f").cast.activeCast).toBeUndefined();
    });

    it("leaves a Fireball already being cast at the bearer to go off", () => {
      const sim = match();
      sim.setTarget("f", "a");
      expect(sim.requestSkill("f", FIREBALL)?.check).toEqual({ ok: true });
      const log = cast(sim, "monk.spell-breaker");
      expect(get(sim, "a").statuses.has("spell-breaker")).toBe(true);
      log.push(...stepFor(sim, 3));
      expect(damageTo(log, "elementalist.fireball", "a")).toBeGreaterThan(0);
    });
  });

  it("Shielding Hands heals its bearer 41 when it ends", () => {
    const sim = match();
    get(sim, "a").health = 1000;
    cast(sim, "monk.shielding-hands");
    const log = stepFor(sim, 8);
    expect(get(sim, "a").statuses.has("shielding-hands")).toBe(false);
    const heals = log
      .filter((entry) => entry.skillId === "monk.shielding-hands")
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "heal" && event.targetId === "a");
    expect(heals.map((event) => (event.kind === "heal" ? event.amount : 0))).toEqual([41]);
  });

  it("Light of Deliverance heals the party 57 and disables the Smiting Prayers for 20 s", () => {
    const sim = match();
    for (const id of ["m", "a", "x"]) {
      get(sim, id).health = 1000;
    }
    get(sim, "f").health = 1000;
    cast(sim, "monk.light-of-deliverance", "m");
    expect(["m", "a", "x", "f"].map((id) => get(sim, id).health)).toEqual([1057, 1057, 1057, 1000]);
    const waits = get(sim, "m").cast.rechargeRemaining;
    expect(waits.get("monk.smite-hex")).toBeGreaterThan(19);
    expect(waits.get("monk.symbol-of-wrath")).toBeGreaterThan(19);
    expect(waits.get("monk.light-of-deliverance")).toBeLessThan(8);
    expect(waits.has("monk.words-of-comfort")).toBe(false);
    expect(described("monk.light-of-deliverance")).toEqual([
      "Heals for 57",
      "All of your Smiting Prayers are disabled for 20 seconds",
    ]);
  });
});
