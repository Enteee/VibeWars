import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { resolveSkillEffects, type CombatEvent, type SkillOutcome } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * Necromancer staples 3 (#1640): Dark Pact, Lifebane Strike, Taste of
 * Pain, Signet of Lost Souls, Fetid Ground, Toxic Chill, Bitter Chill,
 * Rip Enchantment and Gaze of Contempt. Numbers are the corpus's at
 * rank 12. Everyone has 500 maximum health.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const RANKS = new Map([
  ["necromancer.blood-magic", 12],
  ["necromancer.death-magic", 12],
  ["necromancer.soul-reaping", 12],
  ["necromancer.curses", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function necro(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "n", attributeRanks: RANKS, health: 300, ...overrides });
}

function foe(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "f", team: 1, ...overrides });
}

/** `user` pays for `skillId` and it lands on `target`, 200 away. */
function use(user: Combatant, skillId: string, target: Combatant): SkillOutcome {
  payCost(skill(skillId), user);
  return resolveSkillEffects({
    surroundings: new Map(
      [user, target].map((combatant, i) => [
        combatant.id,
        { combatant, position: vec2(i * 200, 0), creature: undefined, corpseExploited: false },
      ]),
    ),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

function damages(events: readonly CombatEvent[]): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === "f" ? [event.amount] : [],
  );
}

function described(id: string): string {
  return describeSkill(skill(id), RANKS)
    .effects.map(({ text }) => text)
    .join(" | ");
}

describe("the nine are the corpus's (#1640)", () => {
  it.each([
    ["dark-pact", 133, "spell", false, "blood-magic", 1, 1, 2],
    ["lifebane-strike", 1067, "spell", false, "blood-magic", 10, 2, 15],
    ["taste-of-pain", 1069, "spell", false, "death-magic", 5, 0.25, 10],
    ["fetid-ground", 841, "spell", false, "death-magic", 5, 0.75, 10],
    ["toxic-chill", 1659, "spell", true, "death-magic", 5, 1, 5],
    ["bitter-chill", 1068, "spell", false, "death-magic", 5, 1, 10],
    ["rip-enchantment", 955, "spell", false, "curses", 5, 1, 15],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attribute, energy, activation, recharge) => {
      expect(skill(`necromancer.${id}`)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId: `necromancer.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target: "single-enemy",
      });
    },
  );

  it("Signet of Lost Souls: free, Soul Reaping, ¼ s, 8 s recharge", () => {
    expect(skill("necromancer.signet-of-lost-souls")).toMatchObject({
      gwId: 1365,
      type: "signet",
      attributeId: "necromancer.soul-reaping",
      cost: undefined,
      activationSeconds: 0.25,
      rechargeSeconds: 8,
      target: "single-enemy",
    });
  });

  it("Gaze of Contempt: no attribute, 10 energy, 2 s, 10 s recharge", () => {
    expect(skill("necromancer.gaze-of-contempt")).toMatchObject({
      gwId: 766,
      type: "spell",
      attributeId: undefined,
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 2,
      rechargeSeconds: 10,
    });
  });
});

describe("Dark Pact (#1640)", () => {
  it("sacrifices 10% and deals 52 shadow", () => {
    const n = necro({ health: 500 });
    const { events } = use(n, "necromancer.dark-pact", foe());
    expect(events).toContainEqual({ kind: "sacrifice", targetId: "n", amount: 50 });
    expect(n.health).toBe(450);
    expect(described("necromancer.dark-pact")).toMatch(/52/);
  });

  it("can kill its caster", () => {
    const n = necro({ health: 40 });
    use(n, "necromancer.dark-pact", foe());
    expect(n.health).toBe(0);
  });
});

describe("Lifebane Strike (#1640)", () => {
  it("above half health: shadow damage, then steals 41", () => {
    const n = necro();
    const { events } = use(n, "necromancer.lifebane-strike", foe());
    expect(damages(events)).toHaveLength(1);
    expect(events).toContainEqual({ kind: "life-stolen", targetId: "f", amount: 41 });
    expect(n.health).toBe(341);
  });

  it("at exactly half health: no steal", () => {
    const { events } = use(necro(), "necromancer.lifebane-strike", foe({ health: 250 }));
    expect(damages(events)).toHaveLength(1);
    expect(events.some((event) => event.kind === "life-stolen")).toBe(false);
  });
});

describe("Taste of Pain (#1640)", () => {
  it("on a foe below half: the caster gains 126", () => {
    const n = necro();
    use(n, "necromancer.taste-of-pain", foe({ health: 249 }));
    expect(n.health).toBe(426);
  });

  it("on a foe at half: nothing, and the energy is spent", () => {
    const n = necro({ energy: 20 });
    const { events } = use(n, "necromancer.taste-of-pain", foe({ health: 250 }));
    expect(n.health).toBe(300);
    expect(events).toEqual([]);
    expect(n.energy).toBe(15);
  });
});

describe("Signet of Lost Souls (#1640)", () => {
  it("on a foe below half: the caster gains 82 health and 8 energy", () => {
    const n = necro({ energy: 0 });
    use(n, "necromancer.signet-of-lost-souls", foe({ health: 100 }));
    expect(n.health).toBe(382);
    expect(n.energy).toBe(8);
  });

  it("on a foe at half: nothing", () => {
    const n = necro({ energy: 0 });
    use(n, "necromancer.signet-of-lost-souls", foe({ health: 250 }));
    expect(n.health).toBe(300);
    expect(n.energy).toBe(0);
  });
});

describe("Fetid Ground (#1640)", () => {
  it("strikes for cold, and poisons a knocked-down foe for 17 s", () => {
    const f = foe({ knockdownRemaining: 1 });
    const { events } = use(necro(), "necromancer.fetid-ground", f);
    expect(damages(events)).toHaveLength(1);
    expect(f.statuses.get("poison")?.remainingSeconds).toBe(17);
    expect(described("necromancer.fetid-ground")).toMatch(/55/);
  });

  it("a standing foe is not poisoned", () => {
    const f = foe();
    use(necro(), "necromancer.fetid-ground", f);
    expect(f.statuses.has("poison")).toBe(false);
  });
});

describe("Toxic Chill (#1640)", () => {
  it.each(["blood-is-power", "wither"] as const)(
    "a foe bearing %s is poisoned for 22 s",
    (statusId) => {
      const f = foe();
      f.statuses.apply(statusId, 10, "x", NO_RANKS);
      use(necro(), "necromancer.toxic-chill", f);
      expect(f.statuses.get("poison")?.remainingSeconds).toBe(22);
    },
  );

  it("a foe with neither: cold only", () => {
    const f = foe();
    const { events } = use(necro(), "necromancer.toxic-chill", f);
    expect(damages(events)).toHaveLength(1);
    expect(f.statuses.has("poison")).toBe(false);
    expect(described("necromancer.toxic-chill")).toMatch(/63/);
  });
});

describe("Bitter Chill (#1640)", () => {
  it("a foe with more health than you before the hit: recharges instantly", () => {
    // 310 against 300: the hit brings it below the caster, the read is before.
    const outcome = use(necro(), "necromancer.bitter-chill", foe({ health: 310 }));
    expect(damages(outcome.events)).toHaveLength(1);
    expect(outcome.rechargeFraction).toBe(1);
  });

  it("equal health: the normal recharge", () => {
    expect(use(necro(), "necromancer.bitter-chill", foe({ health: 300 })).rechargeFraction).toBe(0);
  });

  it("says it recharges instantly", () => {
    expect(described("necromancer.bitter-chill")).toMatch(/recharges instantly/);
  });
});

describe("Rip Enchantment (#1640)", () => {
  it("removes one enchantment and bleeds the foe for 21 s", () => {
    const f = foe();
    f.statuses.apply("blood-is-power", 10, "x", NO_RANKS);
    f.statuses.apply("order-of-pain", 10, "x", NO_RANKS);
    use(necro(), "necromancer.rip-enchantment", f);
    expect(Number(f.statuses.has("blood-is-power")) + Number(f.statuses.has("order-of-pain"))).toBe(
      1,
    );
    expect(f.statuses.get("bleeding")?.remainingSeconds).toBe(21);
  });

  it("on an unenchanted foe: no Bleeding", () => {
    const f = foe();
    use(necro(), "necromancer.rip-enchantment", f);
    expect(f.statuses.has("bleeding")).toBe(false);
  });
});

describe("Gaze of Contempt (#1640)", () => {
  function enchanted(health: number): Combatant {
    const f = foe({ health });
    f.statuses.apply("blood-is-power", 10, "x", NO_RANKS);
    f.statuses.apply("order-of-pain", 10, "x", NO_RANKS);
    return f;
  }

  it("above half health: every enchantment is removed", () => {
    const f = enchanted(251);
    use(necro(), "necromancer.gaze-of-contempt", f);
    expect(f.statuses.has("blood-is-power")).toBe(false);
    expect(f.statuses.has("order-of-pain")).toBe(false);
  });

  it("at exactly half: nothing", () => {
    const f = enchanted(250);
    use(necro(), "necromancer.gaze-of-contempt", f);
    expect(f.statuses.has("blood-is-power")).toBe(true);
    expect(f.statuses.has("order-of-pain")).toBe(true);
  });
});
