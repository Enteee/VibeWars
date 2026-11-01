import { describe, expect, it } from "vitest";

import { AREA_IN_THE_AREA } from "../distances.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { applyEffect, applySkillEffects, type CombatEvent } from "./effects.js";
import type { StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import { fireTriggers } from "./triggers.js";
import type { Combatant, DamageEffect, PerCount, Surroundings } from "./types.js";
import { NO_RANKS } from "./status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;

const RANKS = new Map([
  ["necromancer.curses", 12],
  ["warrior.tactics", 12],
  ["assassin.deadly-arts", 12],
  ["mesmer.inspiration-magic", 12],
  ["dervish.mysticism", 12],
]);

function caster(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "caster", attributeRanks: RANKS, energy: 20, ...overrides });
}

function foe(id: string, statuses: readonly StatusId[] = []): Combatant {
  const combatant = makeCombatant({ id, team: 1, health: 1000, maxHealth: 1000 });
  for (const status of statuses) {
    combatant.statuses.apply(status, 30, id, NO_RANKS);
  }
  return combatant;
}

function around(...placed: readonly (readonly [Combatant, Vec2])[]): Surroundings {
  return new Map(
    placed.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );
}

function use(
  user: Combatant,
  skillId: string,
  targets: readonly Combatant[],
  surroundings: Surroundings = new Map(),
): CombatEvent[] {
  const skill = getSkill(skillId);
  if (skill === undefined) {
    throw new Error(`unknown skill ${skillId}`);
  }
  return applySkillEffects({
    surroundings,
    skill,
    caster: user,
    targets,
    rng: createRng(1),
    rules: RULES,
  });
}

/** `bearer` casts a spell, and what its statuses answer with. */
function castsSpell(bearer: Combatant, surroundings: Surroundings): CombatEvent[] {
  return fireTriggers(
    bearer,
    "bearer-casts-spell",
    {
      sourceOf: (id) => (id === bearer.id ? bearer : undefined),
      rng: createRng(1),
      rules: RULES,
      surroundings,
      usedSkill: { skillId: "mesmer.empathy", key: "mesmer.empathy" },
    },
    new Set(),
  ).flatMap(({ events }) => events);
}

const lines = (skillId: string): string[] => {
  const skill = getSkill(skillId);
  if (skill === undefined) {
    throw new Error(`unknown skill ${skillId}`);
  }
  return describeSkill(skill, RANKS).effects.map((effect) => effect.text);
};

const ENCHANTMENTS: readonly StatusId[] = ["guardian", "regeneration"];
const CONDITIONS: readonly StatusId[] = ["bleeding", "poison", "weakness"];

describe("a count's amount (#1760)", () => {
  const damage = (per: PerCount, amount = 10): DamageEffect => ({
    kind: "damage",
    amount: { flat: amount },
    type: "typeless",
    armorPenetration: 0,
    per,
  });
  const enchantmentsOn = (on: "target" | "caster", max?: number): PerCount => ({
    count: { kind: "statuses", on, categories: ["enchantment"] },
    amount: { flat: 5 },
    max: max === undefined ? undefined : { flat: max },
  });
  const hit = (events: readonly CombatEvent[]): number[] =>
    events.flatMap((event) => (event.kind === "damage" ? [event.amount] : []));
  const context = (target: Combatant, user = caster(), surroundings: Surroundings = new Map()) => ({
    caster: user,
    target,
    rng: createRng(1),
    rules: RULES,
    surroundings,
  });

  it("is base and count in one packet", () => {
    const events = applyEffect(damage(enchantmentsOn("target")), context(foe("f", ENCHANTMENTS)));
    expect(hit(events)).toEqual([10 + 2 * 5]);
  });

  it("counts the caster's statuses with on: caster", () => {
    const user = caster();
    user.statuses.apply("guardian", 30, user.id, NO_RANKS);
    expect(
      hit(applyEffect(damage(enchantmentsOn("caster")), context(foe("f", ENCHANTMENTS), user))),
    ).toEqual([15]);
  });

  it("caps the whole at max, even below the base", () => {
    const target = foe("f", ENCHANTMENTS);
    expect(hit(applyEffect(damage(enchantmentsOn("target", 12)), context(target)))).toEqual([12]);
    expect(hit(applyEffect(damage(enchantmentsOn("target", 4)), context(target)))).toEqual([4]);
  });

  it("is nothing at all for a zero base and a zero count: no event", () => {
    expect(applyEffect(damage(enchantmentsOn("target"), 0), context(foe("f")))).toEqual([]);
    expect(
      applyEffect(
        {
          kind: "heal",
          amount: { flat: 0 },
          per: {
            count: { kind: "statuses", on: "target", categories: ["hex"] },
            amount: { flat: 9 },
            max: undefined,
          },
        },
        context(makeCombatant({ id: "ally", health: 100 })),
      ),
    ).toEqual([]);
  });

  it("counts only living foes of the caster within the radius, with foes-within", () => {
    const user = caster();
    const near = foe("near");
    const dead = foe("dead");
    dead.dead = true;
    const far = foe("far");
    const ally = makeCombatant({ id: "ally" });
    const surroundings = around(
      [user, vec2(0, 0)],
      [near, vec2(AREA_IN_THE_AREA - 1, 0)],
      [dead, vec2(0, 10)],
      [far, vec2(AREA_IN_THE_AREA + 1, 0)],
      [ally, vec2(10, 0)],
    );
    const per: PerCount = {
      count: { kind: "foes-within", radius: AREA_IN_THE_AREA },
      amount: { flat: 3 },
      max: undefined,
    };
    expect(
      applyEffect(
        { kind: "energy-gain", amount: { flat: 0 }, per },
        context(near, user, surroundings),
      ),
    ).toEqual([{ kind: "energy-gain", targetId: "caster", amount: 3 }]);
  });
});

describe("Desecrate and Defile Enchantments (#1760)", () => {
  it.each(["necromancer.desecrate-enchantments", "necromancer.defile-enchantments"])(
    "%s: 49 shadow damage and 17 for each enchantment, counted on each foe",
    (id) => {
      const bare = foe("bare");
      const enchanted = foe("enchanted", ENCHANTMENTS);
      const events = use(caster(), id, [enchanted, bare]);
      expect(
        events.flatMap((event) =>
          event.kind === "damage" ? [[event.targetId, event.amount]] : [],
        ),
      ).toEqual([
        ["enchanted", 49 + 2 * 17],
        ["bare", 49],
      ]);
      expect(lines(id)).toEqual([
        "Deals 49 shadow damage, +17 shadow damage for each enchantment on them",
      ]);
    },
  );

  it("are GW1's: 10 energy, 2 s, 15 s recharge, target foe and foes nearby", () => {
    for (const [id, gwId] of [
      ["necromancer.desecrate-enchantments", 112],
      ["necromancer.defile-enchantments", 1070],
    ] as const) {
      expect(getSkill(id)).toMatchObject({
        gwId,
        elite: false,
        cost: { kind: "energy", amount: 10 },
        activationSeconds: 2,
        rechargeSeconds: 15,
        target: "single-enemy",
        area: { origin: "target", affects: "enemies" },
      });
    }
  });
});

describe('"Victory Is Mine!" (#1760)', () => {
  it("gains 56 Health and 6 Energy for each condition on the foe", () => {
    const warrior = caster({ health: 100 });
    const events = use(warrior, "warrior.victory-is-mine", [foe("f", CONDITIONS)]);
    expect(events).toEqual([
      { kind: "heal", targetId: "caster", amount: 3 * 56 },
      { kind: "energy-gain", targetId: "caster", amount: 3 * 6 },
    ]);
  });

  it("does nothing on a foe with no conditions", () => {
    expect(use(caster({ health: 100 }), "warrior.victory-is-mine", [foe("f")])).toEqual([]);
  });

  it("is an elite shout, and says so per condition", () => {
    expect(getSkill("warrior.victory-is-mine")).toMatchObject({
      gwId: 365,
      type: "shout",
      elite: true,
      cost: { kind: "energy", amount: 5 },
      rechargeSeconds: 10,
    });
    expect(lines("warrior.victory-is-mine")).toEqual([
      "You gain 56 Health for each condition on target foe",
      "Gain 6 energy for each condition on target foe",
    ]);
  });
});

describe("Sadist's Signet (#1760)", () => {
  it("gains 34 Health for each condition on the foe", () => {
    const assassin = caster({ health: 100 });
    expect(use(assassin, "assassin.sadists-signet", [foe("f", CONDITIONS.slice(0, 2))])).toEqual([
      { kind: "heal", targetId: "caster", amount: 2 * 34 },
    ]);
    expect(lines("assassin.sadists-signet")).toEqual([
      "You gain 34 Health for each condition on target foe",
    ]);
    expect(getSkill("assassin.sadists-signet")).toMatchObject({
      gwId: 1991,
      type: "signet",
      cost: undefined,
      activationSeconds: 1,
      rechargeSeconds: 8,
    });
  });
});

describe("Channeling (#1760)", () => {
  it("gains 1 Energy for each foe in the area as its bearer casts a spell", () => {
    const mesmer = caster();
    use(mesmer, "mesmer.channeling", [mesmer]);
    const surroundings = around(
      [mesmer, vec2(0, 0)],
      [foe("a"), vec2(50, 0)],
      [foe("b"), vec2(0, 50)],
      [foe("c"), vec2(AREA_IN_THE_AREA + 5, 0)],
    );
    expect(castsSpell(mesmer, surroundings)).toEqual([
      { kind: "energy-gain", targetId: "caster", amount: 2 },
    ]);
    expect(describeStatus("channeling")).toMatch(/gain 1 energy for each foe in the area/);
  });
});

describe("Arcane Zeal (#1760)", () => {
  it("gains 2 Energy for each enchantment, itself counted, at most 6", () => {
    const dervish = caster();
    use(dervish, "dervish.arcane-zeal", [dervish]);
    expect(castsSpell(dervish, new Map())).toEqual([
      { kind: "energy-gain", targetId: "caster", amount: 2 },
    ]);
    for (const status of ["guardian", "regeneration", "mystic-vigor"] as const) {
      dervish.statuses.apply(status, 30, dervish.id, NO_RANKS);
    }
    expect(castsSpell(dervish, new Map())).toEqual([
      { kind: "energy-gain", targetId: "caster", amount: 6 },
    ]);
    expect(describeStatus("arcane-zeal")).toMatch(
      /gain 2 energy for each enchantment on you \(maximum 6\)/,
    );
  });
});

describe("Mystic Vigor (#1760)", () => {
  it("heals 13 for each enchantment, itself counted, at most 25, on a hit", () => {
    const dervish = caster({ health: 100 });
    use(dervish, "dervish.mystic-vigor", [dervish]);
    const hits = (): CombatEvent[] =>
      fireTriggers(
        dervish,
        "bearer-hits",
        {
          sourceOf: (id) => (id === dervish.id ? dervish : undefined),
          rng: createRng(1),
          rules: RULES,
          surroundings: new Map(),
          usedSkill: undefined,
        },
        new Set(),
      ).flatMap(({ events }) => events);
    expect(hits()).toEqual([{ kind: "heal", targetId: "caster", amount: 13 }]);
    dervish.statuses.apply("guardian", 30, dervish.id, NO_RANKS);
    dervish.statuses.apply("regeneration", 30, dervish.id, NO_RANKS);
    expect(hits()).toEqual([{ kind: "heal", targetId: "caster", amount: 25 }]);
    expect(describeStatus("mystic-vigor")).toMatch(
      /heals 13 Health for each enchantment on you \(maximum 25\)/,
    );
  });
});
