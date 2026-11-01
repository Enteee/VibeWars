import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { NO_RANKS, StatusSet } from "../skills/status.js";
import { vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation } from "./simulation.js";

/**
 * Forms (#1437): a status of their own on the caster, no enchantment, one
 * at a time; the skill is disabled for 45 s after use, and the form's end
 * stops the attack, the walk and the cast.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const MELANDRU = "dervish.avatar-of-melandru";
const DWAYNA = "dervish.avatar-of-dwayna";

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
    seed: "form",
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

function dervish(match: MatchSimulation) {
  const participant = match.get("d");
  if (participant === undefined) throw new Error("no Dervish");
  return participant;
}

/** The Dervish in `skillId`'s form for `seconds`, as if just cast. */
function inForm(match: MatchSimulation, statusId: "avatar-of-melandru", seconds: number): void {
  dervish(match).combatant.statuses.apply(statusId, seconds, "d", NO_RANKS);
}

describe("a form (#1437)", () => {
  it("is disabled for 45 s after use, beyond its 20 s recharge", () => {
    const match = sim([MELANDRU]);
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    stepFor(match, 2.1);
    const { combatant } = dervish(match);
    expect(combatant.statuses.has("avatar-of-melandru")).toBe(true);
    expect(combatant.cast.rechargeRemaining.get(MELANDRU)).toBeGreaterThan(44);
    stepFor(match, 30);
    expect(match.requestSkill("d", 0)?.check.ok).toBe(false);
    stepFor(match, 15);
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
  });

  it("survives enchantment removal: it is no enchantment", () => {
    const match = sim([]);
    inForm(match, "avatar-of-melandru", 74);
    const { statuses } = dervish(match).combatant;
    statuses.removeByCategory("enchantment");
    expect(statuses.has("avatar-of-melandru")).toBe(true);
    expect(statuses.countByCategory("enchantment")).toBe(0);
  });

  it("stops the attack as it ends", () => {
    const match = sim([]);
    expect(match.requestAttack("d", "f")).toEqual({ ok: true });
    inForm(match, "avatar-of-melandru", 1);
    stepFor(match, 0.5);
    expect(dervish(match).combatant.attack).toBeDefined();
    stepFor(match, 1);
    expect(dervish(match).combatant.attack).toBeUndefined();
  });

  it("stops a walk to a clicked point, and held keys until they change", () => {
    const walked = sim([]);
    walked.walkTo("d", vec2(-400, 0));
    inForm(walked, "avatar-of-melandru", 0.5);
    stepFor(walked, 1);
    const stopped = dervish(walked).position.x;
    stepFor(walked, 0.5);
    expect(dervish(walked).position.x).toBe(stopped);

    const held = sim([]);
    held.setInputDirection("d", vec2(-1, 0));
    inForm(held, "avatar-of-melandru", 0.5);
    stepFor(held, 1);
    const still = dervish(held).position.x;
    stepFor(held, 0.5);
    expect(dervish(held).position.x).toBe(still);
    held.setInputDirection("d", vec2(0, 1));
    stepFor(held, 0.5);
    expect(dervish(held).position.y).toBeGreaterThan(0);
  });

  it("loses a skill being activated: paid for, not recharging", () => {
    const match = sim([DWAYNA]);
    inForm(match, "avatar-of-melandru", 1);
    const energy = dervish(match).combatant.energy;
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    const log = stepFor(match, 2.5);
    const { combatant } = dervish(match);
    expect(combatant.statuses.has("avatar-of-dwayna")).toBe(false);
    expect(combatant.energy).toBeLessThan(energy);
    expect(combatant.cast.rechargeRemaining.get(DWAYNA) ?? 0).toBe(0);
    expect(
      log.some((entry) =>
        entry.events.some((event) => event.kind === "cancelled" && event.skillId === DWAYNA),
      ),
    ).toBe(true);
  });

  it("stops nothing when recast: it is up again", () => {
    const match = sim([]);
    expect(match.requestAttack("d", "f")).toEqual({ ok: true });
    inForm(match, "avatar-of-melandru", 74);
    stepFor(match, 0.5);
    inForm(match, "avatar-of-melandru", 74);
    stepFor(match, 0.5);
    expect(dervish(match).combatant.attack).toBeDefined();
  });

  it("ends any other form: one at a time", () => {
    const statuses = new StatusSet();
    statuses.apply("avatar-of-melandru", 74, "d", NO_RANKS);
    statuses.apply("avatar-of-dwayna", 74, "d", NO_RANKS);
    expect(statuses.has("avatar-of-melandru")).toBe(false);
    expect(statuses.has("avatar-of-dwayna")).toBe(true);
  });
});
