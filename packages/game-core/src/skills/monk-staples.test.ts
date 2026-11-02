import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { mitigate, skillDamage } from "./damage.js";
import { describeSkill, describeStatus } from "./describe.js";
import { applyDamage, applyEffect, applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, StatusSet } from "./status.js";
import { makeCombatant } from "./testing.js";
import { advanceStatuses } from "./tick.js";
import type { Combatant, Skill, Surroundings } from "./types.js";

/**
 * The Monk staples (#987): Heal Other, Reversal of Fortune turning the
 * next hit into a heal, Smite Hex's burst when it removes a hex, and
 * Restore Condition's heal per condition removed. A blow on a reversed
 * ally in a match: `match/monk-staples.test.ts`.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([
  ["monk.healing-prayers", 12],
  ["monk.protection-prayers", 12],
  ["monk.smiting-prayers", 12],
  ["necromancer.blood-magic", 12],
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

/** `user` pays for `skillId` and it lands on `targets`, among `surroundings`. */
function use(
  user: Combatant,
  skillId: string,
  targets: readonly Combatant[],
  surroundings: Surroundings = new Map(),
): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings,
    skill: skill(skillId),
    caster: user,
    targets,
    rng: createRng(1),
    rules: RULES,
  });
}

/** `target` under Reversal of Fortune. */
function reversed(target: Combatant): Combatant {
  target.statuses.apply("reversal-of-fortune", 8, "monk", NO_RANKS);
  return target;
}

describe("Heal Other (#987)", () => {
  it("is a 10 e, ¾ s, 3 s spell on another ally", () => {
    expect(skill("monk.heal-other")).toMatchObject({
      type: "spell",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: "monk.healing-prayers",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 0.75,
      rechargeSeconds: 3,
      target: "single-other-ally",
    });
  });

  it("heals 151 at rank 12", () => {
    const target = ally();
    expect(use(monk(), "monk.heal-other", [target])).toEqual([
      { kind: "heal", targetId: "ally", amount: 151 },
    ]);
  });
});

describe("Reversal of Fortune (#987)", () => {
  it("is a 5 e, ¼ s, 2 s enchantment on any ally for 8 s", () => {
    expect(skill("monk.reversal-of-fortune")).toMatchObject({
      type: "enchantment",
      attributeId: "monk.protection-prayers",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0.25,
      rechargeSeconds: 2,
      target: "single-ally",
      effects: [
        { kind: "apply-status", statusId: "reversal-of-fortune", durationSeconds: { flat: 8 } },
      ],
    });
  });

  it("turns a 200 hit into a heal of 67, and the next hit lands", () => {
    const target = reversed(ally());
    const events: CombatEvent[] = [];
    applyDamage(target, 200, "typeless", false, events, undefined);
    expect(events).toEqual([
      { kind: "status-expired", targetId: "ally", statusId: "reversal-of-fortune" },
      { kind: "heal", targetId: "ally", amount: 67 },
    ]);
    expect(target.health).toBe(167);
    expect(target.statuses.has("reversal-of-fortune")).toBe(false);

    const next: CombatEvent[] = [];
    applyDamage(target, 30, "typeless", false, next, undefined);
    expect(next).toEqual([{ kind: "damage", targetId: "ally", amount: 30, critical: false }]);
  });

  it("heals a 30 hit for 30", () => {
    const target = reversed(ally());
    applyDamage(target, 30, "typeless", false, [], undefined);
    expect(target.health).toBe(130);
  });

  it("is spent on an ally at full health, healing nothing", () => {
    const target = reversed(ally({ health: 500 }));
    const events: CombatEvent[] = [];
    applyDamage(target, 100, "typeless", false, events, undefined);
    expect(events).toEqual([
      { kind: "status-expired", targetId: "ally", statusId: "reversal-of-fortune" },
    ]);
    expect(target.health).toBe(500);
  });

  it("a deep wound cuts the heal by 20%", () => {
    const target = reversed(ally());
    target.statuses.apply("deep-wound", 20, "foe", NO_RANKS);
    applyDamage(target, 200, "typeless", false, [], undefined);
    expect(target.health).toBeCloseTo(100 + 67 * 0.8);
  });

  it("reverses a killing blow: the ally lives", () => {
    const target = reversed(ally({ health: 10 }));
    const events: CombatEvent[] = [];
    applyDamage(target, 200, "typeless", false, events, undefined);
    expect(target.dead).toBe(false);
    expect(target.health).toBe(77);
    expect(events.some((event) => event.kind === "death")).toBe(false);
  });

  it("under Protective Spirit reverses the capped hit: 48 of 480", () => {
    const target = reversed(ally({ health: 300, maxHealth: 480 }));
    target.statuses.apply("protective-spirit", 19, "monk", NO_RANKS);
    applyDamage(
      target,
      mitigate(skillDamage(200, "typeless", 0), target, RULES, null, createRng(1)),
      "typeless",
      false,
      [],
      undefined,
    );
    expect(target.health).toBe(348);
  });

  it("records no physical damage, so nothing that answers it fires", () => {
    const target = reversed(ally());
    applyDamage(target, 50, "slashing", false, [], undefined);
    expect(target.statuses.drainChanges()).toEqual([
      {
        kind: "ended",
        id: "reversal-of-fortune",
        sourceId: "monk",
        expired: false,
        death: false,
        returnPoint: null,
        stepTargetId: null,
      },
    ]);
  });

  it("turns life steal into a heal: the ally loses nothing, the stealer gains nothing", () => {
    const necromancer = makeCombatant({
      id: "necro",
      team: 1,
      health: 100,
      attributeRanks: RANKS,
    });
    const target = reversed(ally());
    const events = use(necromancer, "necromancer.vampiric-gaze", [target]);
    expect(events.some((event) => event.kind === "life-stolen")).toBe(false);
    expect(necromancer.health).toBe(100);
    expect(target.health).toBeGreaterThan(100);
  });

  it("does not pass to degeneration", () => {
    const target = reversed(ally());
    target.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    advanceStatuses(target, 1, 0);
    expect(target.statuses.has("reversal-of-fortune")).toBe(true);
  });

  it("refreshes on a recast: still one reversal", () => {
    const target = reversed(reversed(ally()));
    applyDamage(target, 50, "typeless", false, [], undefined);
    expect(target.health).toBe(150);
    applyDamage(target, 50, "typeless", false, [], undefined);
    expect(target.health).toBe(100);
  });

  it("takeReversal spends it and returns its cap; nothing without one", () => {
    const statuses = new StatusSet();
    expect(statuses.takeReversal()).toBeUndefined();
    statuses.apply("reversal-of-fortune", 8, "monk", NO_RANKS);
    expect(statuses.takeReversal()).toEqual({ id: "reversal-of-fortune", cap: 67 });
    expect(statuses.has("reversal-of-fortune")).toBe(false);
  });

  it("says so", () => {
    expect(describeStatus("reversal-of-fortune")).toBe(
      "the next damage or life steal heals for that much instead, up to 67",
    );
  });
});

describe("Smite Hex (#987)", () => {
  /** The ally at the origin, two foes beside it in heavy armor, a friend beside them. */
  function crowd() {
    const target = ally({ health: 500 });
    const heavy = unarmedResolvedEquipment(200);
    const left = makeCombatant({ id: "foe-1", team: 1, health: 500, equipment: heavy });
    const right = makeCombatant({ id: "foe-2", team: 1, health: 500, equipment: heavy });
    const foes = [left, right];
    const friend = makeCombatant({ id: "friend", health: 500 });
    const surroundings: Surroundings = new Map([
      [
        "ally",
        { combatant: target, position: vec2(0, 0), creature: undefined, corpseExploited: false },
      ],
      [
        "foe-1",
        {
          combatant: left,
          position: vec2(AREA_ADJACENT, 0),
          creature: undefined,
          corpseExploited: false,
        },
      ],
      [
        "foe-2",
        {
          combatant: right,
          position: vec2(-AREA_ADJACENT, 0),
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
    return { target, foes, friend, surroundings };
  }

  it("is a 5 e, 1 s, 12 s spell on any ally", () => {
    expect(skill("monk.smite-hex")).toMatchObject({
      type: "spell",
      attributeId: "monk.smiting-prayers",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 12,
      target: "single-ally",
    });
  });

  it("removes Empathy, and foes in the area take 70 holy through armor; the friend none", () => {
    const { target, foes, friend, surroundings } = crowd();
    target.statuses.apply("empathy", 13, "foe-1", NO_RANKS);
    use(monk(), "monk.smite-hex", [target], surroundings);
    expect(target.statuses.has("empathy")).toBe(false);
    expect(foes.map((foe) => foe.health)).toEqual([430, 430]);
    expect(friend.health).toBe(500);
    expect(target.health).toBe(500);
  });

  it("takes only one hex, the newest", () => {
    const { target, surroundings } = crowd();
    target.statuses.apply("empathy", 13, "foe-1", NO_RANKS);
    target.statuses.apply("parasitic-bond", 20, "foe-1", NO_RANKS);
    use(monk(), "monk.smite-hex", [target], surroundings);
    expect(target.statuses.has("empathy")).toBe(true);
    expect(target.statuses.has("parasitic-bond")).toBe(false);
  });

  it("with no hex: no damage, and the energy is spent", () => {
    const { target, foes, surroundings } = crowd();
    const user = monk();
    expect(use(user, "monk.smite-hex", [target], surroundings)).toEqual([]);
    expect(foes.map((foe) => foe.health)).toEqual([500, 500]);
    expect(user.energy).toBe(45);
  });
});

describe("Restore Condition (#987)", () => {
  it("is an elite 5 e, ¾ s, 2 s spell on another ally", () => {
    expect(skill("monk.restore-condition")).toMatchObject({
      type: "spell",
      elite: true,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: "monk.protection-prayers",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0.75,
      rechargeSeconds: 2,
      target: "single-other-ally",
    });
  });

  it("removes bleeding, poison and a deep wound, and heals 3 × 58 uncut", () => {
    const target = ally();
    target.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    target.statuses.apply("poison", 10, "foe", NO_RANKS);
    target.statuses.apply("deep-wound", 20, "foe", NO_RANKS);
    use(monk(), "monk.restore-condition", [target]);
    expect(target.statuses.countByCategory("condition")).toBe(0);
    expect(target.health).toBe(100 + 174);
  });

  it("with no condition: no heal, and the energy is spent", () => {
    const target = ally();
    const user = monk();
    expect(use(user, "monk.restore-condition", [target])).toEqual([]);
    expect(target.health).toBe(100);
    expect(user.energy).toBe(45);
  });

  it("counts only conditions removed from the heal's target", () => {
    const target = ally();
    const heal = skill("monk.restore-condition").effects[1];
    if (heal?.kind !== "heal") {
      throw new Error("Restore Condition's second effect is its heal");
    }
    const earlier: CombatEvent[] = [
      { kind: "status-removed", targetId: "someone-else", statusId: "bleeding" },
      { kind: "status-removed", targetId: "ally", statusId: "empathy" },
      { kind: "status-removed", targetId: "ally", statusId: "poison" },
    ];
    const context = {
      caster: monk(),
      target,
      rng: createRng(1),
      rules: RULES,
      surroundings: new Map(),
    };
    expect(applyEffect(heal, context, earlier)).toEqual([
      { kind: "heal", targetId: "ally", amount: 58 },
    ]);
  });

  it("says so", () => {
    const described = describeSkill(skill("monk.restore-condition"), RANKS);
    expect(described.effects.map(({ text }) => text)).toEqual([
      "Removes all conditions",
      "Heals 58 for each condition removed",
    ]);
  });
});
