import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_IN_THE_AREA, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill, Surroundings } from "./types.js";

/**
 * Monk staples 3 (#1039): Cure Hex heals what it cleanses, Smite
 * Condition burns the foes around the ally, Mending Touch takes two
 * conditions and heals for each, Vigorous Spirit heals on each attack or
 * spell. Vigorous Spirit in a match: `match/monk-staples-3.test.ts`.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
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

function monk(): Combatant {
  return makeCombatant({ id: "monk", attributeRanks: RANKS });
}

function ally(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "ally", health: 100, maxHealth: 500, ...overrides });
}

/** `user` pays for `skillId` and it lands on `target`, among `surroundings`. */
function use(
  user: Combatant,
  skillId: string,
  target: Combatant,
  surroundings: Surroundings = new Map(),
): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings,
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES,
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

describe("Cure Hex (#1039)", () => {
  it("is a 5 e, 1 s, 12 s Healing Prayers spell on any ally", () => {
    expect(skill("monk.cure-hex")).toMatchObject({
      type: "spell",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: "monk.healing-prayers",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 12,
      range: RANGE_SPELL,
      target: "single-ally",
    });
  });

  it("removes the newest hex and heals 86", () => {
    const target = ally();
    target.statuses.apply("empathy", 13, "foe", NO_RANKS);
    target.statuses.apply("malaise", 10, "foe", NO_RANKS);
    const events = use(monk(), "monk.cure-hex", target);
    expect(target.statuses.has("empathy")).toBe(true);
    expect(target.statuses.has("malaise")).toBe(false);
    expect(healed(events)).toBe(86);
    expect(target.health).toBe(186);
  });

  it("with no hex heals nothing, and the energy is spent", () => {
    const target = ally();
    const user = monk();
    expect(use(user, "monk.cure-hex", target)).toEqual([]);
    expect(target.health).toBe(100);
    expect(user.energy).toBe(45);
  });

  it("says so", () => {
    expect(described("monk.cure-hex")).toEqual([
      "Removes 1 hex",
      "If it removes a hex: heals for 86",
    ]);
  });
});

describe("Smite Condition (#1039)", () => {
  /** A Poisoned ally, a foe beside it, one out of the area and a friend in it. */
  function crowd() {
    const target = ally({ health: 500 });
    const heavy = unarmedResolvedEquipment(200);
    const near = makeCombatant({ id: "near", team: 1, health: 500, equipment: heavy });
    const far = makeCombatant({ id: "far", team: 1, health: 500 });
    const friend = makeCombatant({ id: "friend", health: 500 });
    const surroundings: Surroundings = new Map([
      [
        "ally",
        { combatant: target, position: vec2(0, 0), creature: undefined, corpseExploited: false },
      ],
      [
        "near",
        {
          combatant: near,
          position: vec2(AREA_ADJACENT, 0),
          creature: undefined,
          corpseExploited: false,
        },
      ],
      [
        "far",
        {
          combatant: far,
          position: vec2(2 * AREA_IN_THE_AREA, 0),
          creature: undefined,
          corpseExploited: false,
        },
      ],
      [
        "friend",
        {
          combatant: friend,
          position: vec2(0, AREA_ADJACENT),
          creature: undefined,
          corpseExploited: false,
        },
      ],
    ]);
    return { target, near, far, friend, surroundings };
  }

  it("is a 5 e, 1 s, 7 s Smiting Prayers spell on any ally", () => {
    expect(skill("monk.smite-condition")).toMatchObject({
      type: "spell",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: "monk.smiting-prayers",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 7,
      range: RANGE_SPELL,
      target: "single-ally",
    });
  });

  it("removes Poison, and a foe in the area takes 50 holy through armor; nobody else", () => {
    const { target, near, far, friend, surroundings } = crowd();
    target.statuses.apply("poison", 10, "near", NO_RANKS);
    use(monk(), "monk.smite-condition", target, surroundings);
    expect(target.statuses.has("poison")).toBe(false);
    expect([near.health, far.health, friend.health, target.health]).toEqual([450, 500, 500, 500]);
  });

  it("with no condition: no damage, and the energy is spent", () => {
    const { target, near, surroundings } = crowd();
    const user = monk();
    expect(use(user, "monk.smite-condition", target, surroundings)).toEqual([]);
    expect(near.health).toBe(500);
    expect(user.energy).toBe(45);
  });

  it("says so", () => {
    expect(described("monk.smite-condition")).toEqual([
      "Removes 1 condition",
      "If it removes a condition: foes in the area take 50 holy damage",
    ]);
  });
});

describe("Mending Touch (#1039)", () => {
  it("is a 5 e, ¾ s, 6 s Protection Prayers spell at touch range, on any ally", () => {
    expect(skill("monk.mending-touch")).toMatchObject({
      type: "spell",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: "monk.protection-prayers",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0.75,
      rechargeSeconds: 6,
      range: RANGE_MELEE,
      target: "single-ally",
    });
  });

  it("with three conditions removes the newest two and heals 2 × 51", () => {
    const target = ally();
    target.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    target.statuses.apply("poison", 10, "foe", NO_RANKS);
    target.statuses.apply("burning", 3, "foe", NO_RANKS);
    const events = use(monk(), "monk.mending-touch", target);
    expect(target.statuses.has("bleeding")).toBe(true);
    expect(target.statuses.has("poison")).toBe(false);
    expect(target.statuses.has("burning")).toBe(false);
    expect(healed(events)).toBe(102);
  });

  it("with one condition heals 51, with none nothing", () => {
    const one = ally();
    one.statuses.apply("poison", 10, "foe", NO_RANKS);
    expect(healed(use(monk(), "monk.mending-touch", one))).toBe(51);
    expect(use(monk(), "monk.mending-touch", ally())).toEqual([]);
  });

  it("heals in full when a Deep Wound is among the two it removes", () => {
    const target = ally();
    target.statuses.apply("poison", 10, "foe", NO_RANKS);
    target.statuses.apply("deep-wound", 20, "foe", NO_RANKS);
    expect(healed(use(monk(), "monk.mending-touch", target))).toBe(102);
  });

  it("is cut by a Deep Wound it leaves behind", () => {
    const target = ally();
    target.statuses.apply("deep-wound", 20, "foe", NO_RANKS);
    target.statuses.apply("poison", 10, "foe", NO_RANKS);
    target.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    expect(healed(use(monk(), "monk.mending-touch", target))).toBeLessThan(102);
  });

  it("says so", () => {
    expect(described("monk.mending-touch")).toEqual([
      "Removes up to 2 conditions",
      "Heals 51 for each condition removed",
    ]);
  });
});

describe("Vigorous Spirit (#1039)", () => {
  it("is a 5 e, ¼ s, 4 s Healing Prayers enchantment on any ally", () => {
    expect(skill("monk.vigorous-spirit")).toMatchObject({
      type: "enchantment",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: "monk.healing-prayers",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0.25,
      rechargeSeconds: 4,
      range: RANGE_SPELL,
      target: "single-ally",
    });
  });

  it("is a Monk enchantment that heals its bearer 5...17 when it attacks or casts a spell", () => {
    const status = getStatusDefinition("vigorous-spirit");
    expect([status.category, status.profession]).toEqual(["enchantment", "monk"]);
    expect(status.triggers).toEqual(
      (["bearer-attacks", "bearer-casts-spell"] as const).map((on) => ({
        on,
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 5, atTwelve: 17 } },
          },
        ],
        target: "bearer",
        skillId: "monk.vigorous-spirit",
      })),
    );
  });

  it("puts itself on the ally for 30 s", () => {
    const target = ally();
    use(monk(), "monk.vigorous-spirit", target);
    expect(target.statuses.get("vigorous-spirit")?.remainingSeconds).toBe(30);
  });

  it("says so", () => {
    expect(described("monk.vigorous-spirit")).toEqual([
      "Applies Vigorous Spirit for 30s (whenever it attacks or casts a spell: heals for 17)",
    ]);
  });
});
