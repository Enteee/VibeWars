import { describe, expect, it } from "vitest";

import { segment } from "../geometry.js";
import { vec2 } from "../vec2.js";
import { canActivate, payCost, type ActivationRequest } from "./activation.js";
import { makeCombatant } from "./testing.js";
import type { Skill } from "./types.js";

const SPELL: Skill = {
  id: "test.spell",
  name: "Test Spell",
  cost: { kind: "energy", amount: 10 },
  activationSeconds: 1,
  rechargeSeconds: 5,
  range: 400,
  target: "single-enemy",
  effects: [{ kind: "damage", amount: { flat: 50 } }],
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
