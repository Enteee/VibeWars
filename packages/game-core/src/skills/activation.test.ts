import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type WeaponId } from "../equipment/weapons.js";
import { segment } from "../geometry.js";
import { vec2 } from "../vec2.js";
import {
  canActivate,
  hasAftercast,
  payCost,
  targetRuleAllows,
  type ActivationRequest,
} from "./activation.js";
import { getSkill } from "./catalog.js";
import { makeCombatant } from "./testing.js";
import type { Skill } from "./types.js";

const SPELL: Skill = {
  id: "test.spell",
  name: "Test Spell",
  type: "spell",
  elite: false,
  profession: "elementalist",
  attributeId: "elementalist.fire-magic",
  cost: { kind: "energy", amount: 10 },
  activationSeconds: 1,
  rechargeSeconds: 5,
  range: 400,
  target: "single-enemy",
  area: undefined,
  attack: undefined,
  whileActivating: undefined,
  projectile: undefined,
  effects: [{ kind: "damage", amount: { flat: 50 }, type: "typeless", armorPenetration: 0 }],
};

function request(overrides: Partial<ActivationRequest> = {}): ActivationRequest {
  return {
    skill: SPELL,
    caster: makeCombatant({ id: "caster", team: 0 }),
    casterPosition: vec2(0, 0),
    target: makeCombatant({ id: "target", team: 1 }),
    targetPosition: vec2(100, 0),
    rechargeRemaining: new Map(),
    isCasting: false,
    skillBar: [SPELL.id],
    losBlockers: [],
    ...overrides,
  };
}

describe("canActivate", () => {
  it("accepts a valid activation", () => {
    expect(canActivate(request())).toEqual({ ok: true });
  });

  it("rejects a dead caster", () => {
    const caster = makeCombatant({ id: "caster", dead: true });
    expect(canActivate(request({ caster }))).toEqual({ ok: false, reason: "caster-dead" });
  });

  it("rejects a knocked-down caster (#544)", () => {
    const caster = makeCombatant({ id: "caster", knockdownRemaining: 2 });
    expect(canActivate(request({ caster }))).toEqual({
      ok: false,
      reason: "caster-knocked-down",
    });
  });

  it("rejects a skill the caster does not have equipped", () => {
    expect(canActivate(request({ skillBar: ["some.other.skill"] }))).toEqual({
      ok: false,
      reason: "skill-not-on-bar",
    });
  });

  it("rejects while the skill is still recharging", () => {
    expect(canActivate(request({ rechargeRemaining: new Map([[SPELL.id, 2.5]]) }))).toEqual({
      ok: false,
      reason: "still-recharging",
    });
  });

  it("accepts once recharge has elapsed to exactly zero", () => {
    expect(canActivate(request({ rechargeRemaining: new Map([[SPELL.id, 0]]) }))).toEqual({
      ok: true,
    });
  });

  it("rejects while already casting something else", () => {
    expect(canActivate(request({ isCasting: true }))).toEqual({
      ok: false,
      reason: "already-casting",
    });
  });

  it("rejects insufficient energy", () => {
    const caster = makeCombatant({ id: "caster", energy: 9 });
    expect(canActivate(request({ caster }))).toEqual({
      ok: false,
      reason: "insufficient-energy",
    });
  });

  it("accepts energy exactly equal to the cost", () => {
    const caster = makeCombatant({ id: "caster", energy: 10 });
    expect(canActivate(request({ caster }))).toEqual({ ok: true });
  });

  it("rejects insufficient adrenaline for an adrenaline skill", () => {
    const adrenalineSkill: Skill = { ...SPELL, cost: { kind: "adrenaline", amount: 9 } };
    const caster = makeCombatant({ id: "caster", adrenaline: 5 });
    expect(canActivate(request({ skill: adrenalineSkill, caster, skillBar: [SPELL.id] }))).toEqual({
      ok: false,
      reason: "insufficient-adrenaline",
    });
  });

  it("accepts a free skill with no cost at all", () => {
    const freeSkill: Skill = { ...SPELL, cost: undefined };
    const caster = makeCombatant({ id: "caster", energy: 0 });
    expect(canActivate(request({ skill: freeSkill, caster }))).toEqual({ ok: true });
  });

  it("rejects when no target is selected for a targeted skill", () => {
    expect(canActivate(request({ target: undefined, targetPosition: undefined }))).toEqual({
      ok: false,
      reason: "no-target",
    });
  });

  it("rejects a dead target", () => {
    const target = makeCombatant({ id: "target", team: 1, dead: true });
    expect(canActivate(request({ target }))).toEqual({
      ok: false,
      reason: "invalid-target-dead",
    });
  });

  it("rejects targeting an ally with an enemy-only skill", () => {
    const target = makeCombatant({ id: "ally", team: 0 });
    expect(canActivate(request({ target }))).toEqual({
      ok: false,
      reason: "invalid-target-ally",
    });
  });

  it("rejects targeting yourself with an enemy-only skill", () => {
    const caster = makeCombatant({ id: "same", team: 0 });
    const target = makeCombatant({ id: "same", team: 0 });
    expect(canActivate(request({ caster, target }))).toEqual({
      ok: false,
      reason: "invalid-target-self",
    });
  });

  it("rejects targeting an enemy with an ally-only skill", () => {
    const healSkill: Skill = { ...SPELL, target: "single-ally" };
    expect(canActivate(request({ skill: healSkill }))).toEqual({
      ok: false,
      reason: "invalid-target-enemy",
    });
  });

  it("allows self-targeting an ally-only skill (self-healing is intended play)", () => {
    const healSkill: Skill = { ...SPELL, target: "single-ally" };
    const caster = makeCombatant({ id: "same", team: 0 });
    const target = makeCombatant({ id: "same", team: 0 });
    expect(canActivate(request({ skill: healSkill, caster, target }))).toEqual({ ok: true });
  });

  it("allows an ally-only skill on a different ally", () => {
    const healSkill: Skill = { ...SPELL, target: "single-ally" };
    const target = makeCombatant({ id: "ally", team: 0 });
    expect(canActivate(request({ skill: healSkill, target }))).toEqual({ ok: true });
  });

  it("allows an other-ally skill on an ally, never on yourself or a foe (#503)", () => {
    const otherAlly: Skill = { ...SPELL, target: "single-other-ally" };
    const caster = makeCombatant({ id: "same", team: 0 });
    expect(
      canActivate(request({ skill: otherAlly, target: makeCombatant({ id: "ally", team: 0 }) })),
    ).toEqual({ ok: true });
    expect(
      canActivate(
        request({ skill: otherAlly, caster, target: makeCombatant({ id: "same", team: 0 }) }),
      ),
    ).toEqual({ ok: false, reason: "invalid-target-self" });
    expect(canActivate(request({ skill: otherAlly }))).toEqual({
      ok: false,
      reason: "invalid-target-enemy",
    });
  });

  it("ignores target rules entirely for a self-targeted skill", () => {
    const selfSkill: Skill = { ...SPELL, target: "self" };
    expect(
      canActivate(request({ skill: selfSkill, target: undefined, targetPosition: undefined })),
    ).toEqual({ ok: true });
  });

  it("rejects a target beyond the skill's range", () => {
    expect(canActivate(request({ targetPosition: vec2(401, 0) }))).toEqual({
      ok: false,
      reason: "out-of-range",
    });
  });

  it("accepts a target at exactly maximum range", () => {
    expect(canActivate(request({ targetPosition: vec2(400, 0) }))).toEqual({ ok: true });
  });

  it("rejects when a wall blocks line of sight", () => {
    const wall = segment(vec2(50, -50), vec2(50, 50));
    expect(canActivate(request({ losBlockers: [wall] }))).toEqual({
      ok: false,
      reason: "no-line-of-sight",
    });
  });

  it("accepts when a wall is beside, not between, caster and target", () => {
    const wall = segment(vec2(50, 50), vec2(50, 150));
    expect(canActivate(request({ losBlockers: [wall] }))).toEqual({ ok: true });
  });

  it("checks cost before range, so a player out of energy AND out of range hears about energy", () => {
    // Ordering matters for UX: the most-actionable failure should win.
    const caster = makeCombatant({ id: "caster", energy: 0 });
    expect(canActivate(request({ caster, targetPosition: vec2(9999, 0) }))).toEqual({
      ok: false,
      reason: "insufficient-energy",
    });
  });
});

describe("targetRuleAllows (#599)", () => {
  const caster = { id: "me", team: 0 };
  const targets = [
    { id: "me", team: 0 },
    { id: "ally", team: 0 },
    { id: "foe", team: 1 },
  ];
  const verdicts = (rule: Parameters<typeof targetRuleAllows>[0]) =>
    targets.map((target) => targetRuleAllows(rule, caster, target));

  it("says, for self, an ally and a foe, why each rule refuses them", () => {
    expect(verdicts("self")).toEqual([undefined, undefined, undefined]);
    expect(verdicts("single-any")).toEqual([undefined, undefined, undefined]);
    expect(verdicts("single-enemy")).toEqual([
      "invalid-target-self",
      "invalid-target-ally",
      undefined,
    ]);
    expect(verdicts("single-ally")).toEqual([undefined, undefined, "invalid-target-enemy"]);
    expect(verdicts("single-other-ally")).toEqual([
      "invalid-target-self",
      undefined,
      "invalid-target-enemy",
    ]);
  });
});

describe("payCost", () => {
  it("deducts energy", () => {
    const caster = makeCombatant({ id: "caster", energy: 50 });
    payCost(SPELL, caster);
    expect(caster.energy).toBe(40);
  });

  it("deducts adrenaline", () => {
    const skill: Skill = { ...SPELL, cost: { kind: "adrenaline", amount: 9 } };
    const caster = makeCombatant({ id: "caster", adrenaline: 12 });
    payCost(skill, caster);
    expect(caster.adrenaline).toBe(3);
  });

  it("is a no-op for a free skill", () => {
    const skill: Skill = { ...SPELL, cost: undefined };
    const caster = makeCombatant({ id: "caster", energy: 50, adrenaline: 5 });
    payCost(skill, caster);
    expect(caster.energy).toBe(50);
    expect(caster.adrenaline).toBe(5);
  });
});

describe("hasAftercast (#317)", () => {
  it("follows a skill with an activation time", () => {
    expect(hasAftercast(SPELL)).toBe(true);
    expect(hasAftercast({ ...SPELL, type: "skill" })).toBe(true);
  });

  it("never follows an attack skill, or an instant one like a shout", () => {
    expect(hasAftercast({ ...SPELL, type: "attack" })).toBe(false);
    expect(hasAftercast({ ...SPELL, type: "skill", activationSeconds: 0 })).toBe(false);
  });
});

describe("canActivate, an attack skill's weapon (ADR-0029)", () => {
  function holding(weaponId: WeaponId) {
    return makeCombatant({
      id: "caster",
      team: 0,
      energy: 50,
      equipment: {
        ...unarmedResolvedEquipment(60),
        mainHand: {
          weapon: WEAPONS[weaponId],
          attributeId: undefined,
          damageType: WEAPONS[weaponId].damageType,
          requirementMet: true,
        },
      },
    });
  }

  function check(skill: Skill | undefined, weaponId: WeaponId) {
    if (skill === undefined) {
      throw new Error("missing skill");
    }
    return canActivate(
      request({
        skill,
        skillBar: [skill.id],
        caster: holding(weaponId),
        targetPosition: vec2(40, 0),
      }),
    );
  }

  const MELEE: Skill = {
    ...SPELL,
    id: "test.melee-attack",
    type: "attack",
    cost: undefined,
    activationSeconds: 0,
    range: 100,
    attack: {
      weapon: "melee",
      weaponDamage: 1,
      bonusDamage: undefined,
      unblockable: false,
      onBlocked: [],
    },
    effects: [],
  };

  it("refuses Swift Chop with a sword, before anything else is wrong with it", () => {
    expect(check(getSkill("warrior.swift-chop"), "sword")).toEqual({
      ok: false,
      reason: "wrong-weapon",
    });
    expect(check(getSkill("warrior.swift-chop"), "axe")).toEqual({ ok: true });
  });

  it("refuses Barrage with a staff, and takes any bow", () => {
    expect(check(getSkill("ranger.barrage"), "staff")).toEqual({
      ok: false,
      reason: "wrong-weapon",
    });
    expect(check(getSkill("ranger.barrage"), "hornbow")).toEqual({ ok: true });
  });

  it("refuses a melee attack skill bare-handed, and takes any melee weapon", () => {
    expect(check(MELEE, "unarmed")).toEqual({ ok: false, reason: "wrong-weapon" });
    expect(check(MELEE, "spear")).toEqual({ ok: true });
    expect(check(MELEE, "longbow")).toEqual({ ok: false, reason: "wrong-weapon" });
  });

  it("takes Distracting Blow with any melee weapon, not bare-handed or with a bow (#445)", () => {
    const blow = getSkill("warrior.distracting-blow");
    expect(check(blow, "sword")).toEqual({ ok: true });
    expect(check(blow, "hammer")).toEqual({ ok: true });
    expect(check(blow, "unarmed")).toEqual({ ok: false, reason: "wrong-weapon" });
    expect(check(blow, "longbow")).toEqual({ ok: false, reason: "wrong-weapon" });
  });

  it("checks the weapon before the cost", () => {
    const caster = holding("sword");
    caster.energy = 0;
    const skill = getSkill("warrior.swift-chop");
    expect(skill && canActivate(request({ skill, skillBar: [skill.id], caster }))).toEqual({
      ok: false,
      reason: "wrong-weapon",
    });
  });
});
