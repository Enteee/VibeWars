import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation } from "./simulation.js";

/**
 * Shouts and stances mid-action (#1725, GW1): "they can be activated in
 * the middle of other actions or while knocked down", at once and
 * outside the skill queue, leaving the action they interrupt alone.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const AFTERCAST = RULES.combat.aftercastSeconds;
/** A 2 s self-heal: the activation everything else goes off in. */
const HEALING_SIGNET = "warrior.healing-signet";
const BALANCED_STANCE = "warrior.balanced-stance";
const FOR_GREAT_JUSTICE = "warrior.for-great-justice";
/** An instant signet: no shout, no stance. */
const DOLYAK_SIGNET = "warrior.dolyak-signet";

const SWORD: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: weaponDamageType(WEAPONS.sword, "warrior.swordsmanship"),
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

const BAR = [HEALING_SIGNET, BALANCED_STANCE, FOR_GREAT_JUSTICE, DOLYAK_SIGNET];

/** A Warrior, `w`, with `BAR`, and a sturdy foe, `f`, in reach. */
function sim(): MatchSimulation {
  const spec = (id: string, team: number, x: number, bar: string[]) => ({
    id,
    team,
    skillBar: bar,
    attributeRanks: new Map([
      ["warrior.swordsmanship", 12],
      ["warrior.tactics", 12],
      ["warrior.strength", 12],
    ]),
    equipment: SWORD,
    maxHealth: 1e5,
    maxEnergy: 1000,
    spawn: vec2(x, 0),
    facing: 0,
  });
  return new MatchSimulation({
    seed: "shouts-mid-action",
    participants: [spec("w", 0, 0, BAR), spec("f", 1, 40, [])],
  });
}

function get(match: MatchSimulation, id: string) {
  const record = match.get(id);
  if (record === undefined) {
    throw new Error(`no ${id}`);
  }
  return record;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `w` `seconds` into Healing Signet's 2 s activation. */
function casting(seconds: number): MatchSimulation {
  const match = sim();
  expect(match.requestSkill("w", 0)?.check).toEqual({ ok: true });
  stepFor(match, seconds);
  expect(get(match, "w").combatant.cast.activeCast?.skillId).toBe(HEALING_SIGNET);
  return match;
}

/** The ticks `w`'s skill `skillId` resolved on, in `log`. */
function usedTicks(log: readonly CombatLogEntry[], skillId: string): number[] {
  return log
    .filter(
      (entry) => entry.cause === "skill" && entry.sourceId === "w" && entry.skillId === skillId,
    )
    .map((entry) => entry.tick);
}

describe("shouts and stances mid-action (#1725)", () => {
  it("a stance during a spell's activation goes off at once, and the cast completes on time", () => {
    const untouched = casting(0.5);
    const onTime = usedTicks(stepFor(untouched, 2), HEALING_SIGNET);
    expect(onTime).toHaveLength(1);

    const match = casting(0.5);
    const energy = get(match, "w").combatant.energy;
    expect(match.requestSkill("w", 1)).toEqual({ skillId: BALANCED_STANCE, check: { ok: true } });
    const w = get(match, "w").combatant;
    // Paid, up and recharging before another tick passes; the cast and
    // the queue as they were.
    expect(w.energy).toBe(energy - 5);
    expect(w.statuses.has("balanced-stance")).toBe(true);
    expect(w.cast.rechargeRemaining.get(BALANCED_STANCE)).toBe(30);
    expect(w.cast.activeCast?.skillId).toBe(HEALING_SIGNET);
    expect(w.cast.activeCast?.remainingSeconds).toBeCloseTo(1.5, 6);
    expect(w.cast.queuedSlot).toBeUndefined();
    expect(usedTicks(stepFor(match, 2), HEALING_SIGNET)).toEqual(onTime);
  });

  it("a shout while knocked down goes off, and the knockdown keeps its length", () => {
    const match = sim();
    const w = get(match, "w").combatant;
    w.knockdownRemaining = 2;
    stepFor(match, 0.5);
    expect(match.requestSkill("w", 2)).toEqual({ skillId: FOR_GREAT_JUSTICE, check: { ok: true } });
    expect(w.statuses.has("for-great-justice")).toBe(true);
    expect(w.knockdownRemaining).toBeCloseTo(1.5, 6);
    // Anything else is still refused while down.
    expect(match.requestSkill("w", 3)?.check).toEqual({
      ok: false,
      reason: "caster-knocked-down",
    });
  });

  it("a shout during an aftercast goes at once, and the aftercast runs on", () => {
    /** `w` 0.25 s into Healing Signet's aftercast, shouting if `shout`: the ticks it has left. */
    const aftercastLeft = (shout: boolean): number => {
      const match = casting(2 - DT);
      const w = get(match, "w").combatant;
      stepFor(match, DT + 0.25);
      const pressed = match.tick;
      expect(w.cast.inAftercast).toBe(true);
      if (shout) {
        expect(match.requestSkill("w", 2)).toEqual({
          skillId: FOR_GREAT_JUSTICE,
          check: { ok: true },
        });
        expect(w.statuses.has("for-great-justice")).toBe(true);
        expect(w.cast.activeCast).toBeUndefined();
      }
      const log: CombatLogEntry[] = [];
      let ticks = 0;
      while (w.cast.inAftercast) {
        log.push(...match.step(DT).log);
        ticks += 1;
      }
      // Resolved once, on the press: logged under the tick it fell in.
      expect(usedTicks(log, FOR_GREAT_JUSTICE)).toEqual(shout ? [pressed] : []);
      return ticks;
    };
    expect(aftercastLeft(true)).toBe(aftercastLeft(false));
    expect(aftercastLeft(false) * DT).toBeLessThan(AFTERCAST);
  });

  it("a signet mid-cast is not used at once: it queues, as any other skill (#1722)", () => {
    const match = casting(0.5);
    // Pressed mid-cast it queues (#1722): checked as if nothing were casting.
    expect(match.requestSkill("w", 3)).toEqual({
      skillId: DOLYAK_SIGNET,
      check: { ok: true },
      queued: true,
    });
    const w = get(match, "w").combatant;
    expect(w.statuses.has("dolyak-signet")).toBe(false);
    expect(w.cast.rechargeRemaining.get(DOLYAK_SIGNET) ?? 0).toBe(0);
  });

  it("a recharging stance mid-cast is refused still-recharging", () => {
    const match = sim();
    expect(match.requestSkill("w", 1)?.check).toEqual({ ok: true });
    stepFor(match, 0.5);
    expect(match.requestSkill("w", 0)?.check).toEqual({ ok: true });
    stepFor(match, 0.5);
    expect(match.requestSkill("w", 1)?.check).toEqual({ ok: false, reason: "still-recharging" });
  });

  it("pressed twice in one tick standing, a shout goes off once", () => {
    const match = sim();
    const energy = get(match, "w").combatant.energy;
    expect(match.requestSkill("w", 2)?.check).toEqual({ ok: true });
    match.requestSkill("w", 2);
    const log = stepFor(match, 0.5);
    expect(usedTicks(log, FOR_GREAT_JUSTICE)).toHaveLength(1);
    expect(get(match, "w").combatant.energy).toBeGreaterThanOrEqual(energy - 5);
  });

  it("dead, a shout is still refused", () => {
    const match = sim();
    const w = get(match, "w").combatant;
    w.dead = true;
    expect(match.requestSkill("w", 2)?.check).toEqual({ ok: false, reason: "caster-dead" });
  });

  it("leaves the attack and its swing as they were", () => {
    const match = sim();
    expect(match.requestAttack("w", "f")).toEqual({ ok: true });
    stepFor(match, 0.5);
    expect(match.requestSkill("w", 0)?.check).toEqual({ ok: true });
    stepFor(match, 0.5);
    const w = get(match, "w").combatant;
    const attack = { ...w.attack };
    expect(attack.targetId).toBe("f");
    expect(match.requestSkill("w", 1)?.check).toEqual({ ok: true });
    expect(w.attack).toEqual(attack);
  });
});
