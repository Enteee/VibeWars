import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import { FLASH_LOCKOUT_SECONDS, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation } from "./simulation.js";

/**
 * Flash enchantments (#1421): instant, they keep the Dervish's swing and
 * stride, and lock the Dervish's other flash skills for 1 s.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ENCHANTED_HASTE = "dervish.enchanted-haste";
const HARRIERS_HASTE = "dervish.harriers-haste";
const AURA_OF_THORNS = "dervish.aura-of-thorns";
/** An instant stance: not a flash skill, so it costs the swing. */
const PIOUS_HASTE = "dervish.pious-haste";

const SCYTHE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.scythe,
    attributeId: "dervish.scythe-mastery",
    damageType: weaponDamageType(WEAPONS.scythe, "dervish.scythe-mastery"),
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

/** A Dervish, `d`, with `skillBar`, and a sturdy foe, `f`, beside it. */
function sim(skillBar: string[]): MatchSimulation {
  const ranks = new Map([
    ["dervish.scythe-mastery", 12],
    ["dervish.mysticism", 12],
    ["dervish.wind-prayers", 12],
    ["dervish.earth-prayers", 12],
  ]);
  const spec = (id: string, team: number, x: number, bar: string[]) => ({
    id,
    team,
    skillBar: bar,
    attributeRanks: ranks,
    equipment: SCYTHE,
    maxHealth: 1e5,
    maxEnergy: 1000,
    spawn: vec2(x, 0),
    facing: 0,
  });
  return new MatchSimulation({
    seed: "flash-enchantment",
    participants: [spec("d", 0, 0, skillBar), spec("f", 1, 40, [])],
  });
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** The ticks the Dervish's weapon blows landed on, in `entries`. */
function blowTicks(entries: readonly CombatLogEntry[]): number[] {
  return entries
    .filter((entry) => entry.cause === "weapon" && entry.sourceId === "d")
    .map((entry) => entry.tick);
}

/** The first blow's tick, the skill in `slot` used `seconds` into the swing. */
function firstBlowWith(slot: number | undefined, seconds: number): number | undefined {
  const match = sim([ENCHANTED_HASTE, PIOUS_HASTE]);
  expect(match.requestAttack("d", "f")).toEqual({ ok: true });
  const log = stepFor(match, seconds);
  if (slot !== undefined) {
    expect(match.requestSkill("d", slot)?.check).toEqual({ ok: true });
  }
  return blowTicks([...log, ...stepFor(match, 3)])[0];
}

function recharge(match: MatchSimulation, skillId: string): number {
  return match.get("d")?.combatant.cast.rechargeRemaining.get(skillId) ?? 0;
}

function disabled(entries: readonly CombatLogEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.events.flatMap((event) => (event.kind === "skill-disabled" ? [event.skillId] : [])),
  );
}

describe("flash enchantments (#1421)", () => {
  it("keep the swing in progress: the blow lands on time", () => {
    const untouched = firstBlowWith(undefined, 0.5);
    expect(untouched).toBeDefined();
    expect(firstBlowWith(0, 0.5)).toBe(untouched);
    // Any other skill loses the swing, instant or not.
    expect(firstBlowWith(1, 0.5)).toBeGreaterThan(untouched ?? Infinity);
  });

  it("leave a walk to a clicked point walking", () => {
    const match = sim([ENCHANTED_HASTE]);
    match.walkTo("d", vec2(-400, 0));
    stepFor(match, 0.5);
    const before = match.get("d")?.position.x ?? 0;
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    stepFor(match, 0.5);
    expect(match.get("d")?.position.x).toBeLessThan(before - 50);
  });

  it("disable the other flash skills for 1 s, and no other skill", () => {
    const match = sim([ENCHANTED_HASTE, HARRIERS_HASTE, AURA_OF_THORNS, PIOUS_HASTE]);
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    const log = match.step(DT).log;
    expect(disabled(log).sort()).toEqual([AURA_OF_THORNS, HARRIERS_HASTE]);
    expect(recharge(match, HARRIERS_HASTE)).toBeCloseTo(FLASH_LOCKOUT_SECONDS - DT, 5);
    expect(recharge(match, PIOUS_HASTE)).toBe(0);
    // Pressed in the lockout, a flash skill is refused; the other is not.
    expect(match.requestSkill("d", 1)?.check.ok).toBe(false);
    expect(match.requestSkill("d", 3)?.check).toEqual({ ok: true });
    stepFor(match, FLASH_LOCKOUT_SECONDS);
    expect(match.requestSkill("d", 1)?.check).toEqual({ ok: true });
  });

  it("lock out a second flash skill pressed in the same tick", () => {
    const match = sim([ENCHANTED_HASTE, HARRIERS_HASTE]);
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    expect(match.requestSkill("d", 1)?.check.ok).toBe(false);
    stepFor(match, 0.5);
    const statuses = match.get("d")?.combatant.statuses;
    expect(statuses?.has("enchanted-haste")).toBe(true);
    expect(statuses?.has("harriers-haste")).toBe(false);
  });

  it("never shorten a longer recharge", () => {
    const match = sim([HARRIERS_HASTE, ENCHANTED_HASTE]);
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    stepFor(match, 2);
    const waiting = recharge(match, HARRIERS_HASTE);
    expect(waiting).toBeGreaterThan(FLASH_LOCKOUT_SECONDS);
    expect(match.requestSkill("d", 1)?.check).toEqual({ ok: true });
    const log = match.step(DT).log;
    expect(disabled(log)).toEqual([]);
    expect(recharge(match, HARRIERS_HASTE)).toBeCloseTo(waiting - DT, 5);
  });
});
