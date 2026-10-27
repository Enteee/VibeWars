import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/**
 * The Ritualist's heals (#955): Mend Body and Soul, Spirit Light and
 * Wielder's Boon, at Restoration Magic 12. There are no spirits yet
 * (#467), so neither spirit clause ever applies.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([["ritualist.restoration-magic", 12]]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function ritualist(): Combatant {
  return makeCombatant({
    id: "caster",
    attributeRanks: RANKS,
    energy: 30,
    maxHealth: 500,
    health: 500,
  });
}

/** An ally well below its maximum, so no heal is cut short. */
function ally(): Combatant {
  return makeCombatant({ id: "ally", maxHealth: 500, health: 100 });
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
    rules: RULES,
  });
}

describe("Mend Body and Soul (#955)", () => {
  it("heals 96 and leaves the ally's conditions alone, with no spirit in earshot", () => {
    const target = ally();
    target.statuses.apply("bleeding", 10, "foe");
    target.statuses.apply("weakness", 10, "foe");
    const events = use(ritualist(), "ritualist.mend-body-and-soul", target);
    expect(events).toEqual([{ kind: "heal", targetId: "ally", amount: 96 }]);
    expect(target.health).toBe(196);
    expect(target.statuses.countByCategory("condition")).toBe(2);
  });
});

describe("Spirit Light (#955)", () => {
  it("sacrifices 17% of the caster's health, then heals the ally 156", () => {
    const caster = ritualist();
    const target = ally();
    const events = use(caster, "ritualist.spirit-light", target);
    expect(events).toEqual([
      { kind: "sacrifice", targetId: "caster", amount: 85 },
      { kind: "heal", targetId: "ally", amount: 156 },
    ]);
    expect(caster.health).toBe(415);
    expect(target.health).toBe(256);
  });

  it("cast on yourself, sacrifices and then heals the caster", () => {
    const caster = ritualist();
    caster.health = 200;
    const events = use(caster, "ritualist.spirit-light", caster);
    expect(events).toEqual([
      { kind: "sacrifice", targetId: "caster", amount: 85 },
      { kind: "heal", targetId: "caster", amount: 156 },
    ]);
    expect(caster.health).toBe(271);
  });
});

describe("Wielder's Boon (#955)", () => {
  const BOON = "ritualist.wielders-boon";

  it("heals a bare ally 51", () => {
    const target = ally();
    expect(use(ritualist(), BOON, target)).toEqual([
      { kind: "heal", targetId: "ally", amount: 51 },
    ]);
    expect(target.health).toBe(151);
  });

  it("heals 63 more an ally under a weapon spell", () => {
    const target = ally();
    target.statuses.apply("weapon-of-warding", 7, "caster");
    expect(use(ritualist(), BOON, target)).toEqual([
      { kind: "heal", targetId: "ally", amount: 51 },
      { kind: "heal", targetId: "ally", amount: 63 },
    ]);
    expect(target.health).toBe(214);
  });

  it("gives no bonus for an enchantment", () => {
    const target = ally();
    target.statuses.apply("regeneration", 10, "caster");
    expect(use(ritualist(), BOON, target)).toEqual([
      { kind: "heal", targetId: "ally", amount: 51 },
    ]);
  });
});
