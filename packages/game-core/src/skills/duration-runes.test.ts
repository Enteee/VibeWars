import { describe, expect, it } from "vitest";

import { bareArmorSet } from "../equipment/armor.js";
import { resolveLoadout } from "../equipment/resolve.js";
import type { UniversalRuneId } from "../equipment/runes.js";
import { ARMOR_SLOTS } from "../equipment/types.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "./catalog.js";
import { applyEffect, applySkillEffects } from "./effects.js";
import { NO_RANKS, scaledStatusDuration } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;

/** A combatant wearing these universal runes, one per armor piece. */
function wearing(id: string, team: number, ...runeIds: UniversalRuneId[]): Combatant {
  const armor = { ...bareArmorSet() };
  ARMOR_SLOTS.forEach((slot, index) => {
    const runeId = runeIds[index];
    if (runeId !== undefined) {
      armor[slot] = {
        insigniaId: null,
        rune: { kind: "universal", runeId, tier: "minor" },
        headgearAttributeId: null,
      };
    }
  });
  const resolved = resolveLoadout(
    {
      primaryProfession: "warrior",
      secondaryProfession: undefined,
      allocatedRanks: new Map(),
      equipment: {
        weaponSets: [
          { mainHand: { weaponId: "sword", requirementAttributeId: null }, offHand: null },
          null,
          null,
          null,
        ],
        armor,
      },
    },
    RULES,
  );
  return makeCombatant({ id, team, equipment: resolved.weaponSets[0].equipment });
}

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

function land(skillId: string, caster: Combatant, target: Combatant) {
  return applySkillEffects({
    surroundings: new Map(),
    skill: skill(skillId),
    caster,
    targets: [target],
    rng: createRng(1),
    rules: RULES,
  });
}

describe("condition-duration runes (#464)", () => {
  it("a Restoration wearer hit by Sever Artery bleeds 16.8 s, and the event says 16.8", () => {
    const target = wearing("target", 1, "restoration");
    const events = land("warrior.sever-artery", makeCombatant({ id: "caster" }), target);

    expect(target.statuses.get("bleeding")?.remainingSeconds).toBeCloseTo(16.8, 9);
    const applied = events.find((event) => event.kind === "status-applied");
    expect(applied).toMatchObject({ statusId: "bleeding" });
    expect(applied?.kind === "status-applied" && applied.durationSeconds).toBeCloseTo(16.8, 9);
  });

  it("a Recovery wearer is dazed by Broad Head Arrow for 13.6 s", () => {
    const target = wearing("target", 1, "recovery");
    land("ranger.broad-head-arrow", makeCombatant({ id: "caster" }), target);
    expect(target.statuses.get("dazed")?.remainingSeconds).toBeCloseTo(13.6, 9);
  });

  it("Recovery shortens deep wound too", () => {
    const target = wearing("target", 1, "recovery");
    applyEffect(
      { kind: "apply-status", statusId: "deep-wound", durationSeconds: { flat: 10 } },
      {
        surroundings: new Map(),
        caster: makeCombatant({ id: "caster" }),
        target,
        rng: createRng(1),
        rules: RULES,
      },
    );
    expect(target.statuses.get("deep-wound")?.remainingSeconds).toBeCloseTo(8, 9);
  });

  it("Purity takes poison and disease to 80%, and leaves burning alone (#765)", () => {
    const target = wearing("target", 1, "purity");
    expect(scaledStatusDuration(target, "poison", 10)).toBeCloseTo(8, 9);
    expect(scaledStatusDuration(target, "disease", 10)).toBeCloseTo(8, 9);
    expect(scaledStatusDuration(target, "burning", 10)).toBe(10);
  });

  it("Clarity takes blind and weakness to 80%", () => {
    const target = wearing("target", 1, "clarity");
    expect(scaledStatusDuration(target, "blind", 10)).toBeCloseTo(8, 9);
    expect(scaledStatusDuration(target, "weakness", 10)).toBeCloseTo(8, 9);
    expect(scaledStatusDuration(target, "bleeding", 10)).toBe(10);
  });

  it("two Runes of Clarity give 80%, not 64% (GW1: non-stacking)", () => {
    const target = wearing("target", 1, "clarity", "clarity");
    expect(target.equipment.statusDurationScale.get("blind")).toBeCloseTo(0.8, 9);
  });

  it("different duration runes still each apply", () => {
    const target = wearing("target", 1, "clarity", "restoration");
    expect(scaledStatusDuration(target, "blind", 10)).toBeCloseTo(8, 9);
    expect(scaledStatusDuration(target, "bleeding", 10)).toBeCloseTo(8, 9);
  });

  it("leaves statuses that are not conditions alone, whatever is worn", () => {
    const target = wearing("target", 1, "clarity", "purity", "recovery", "restoration");
    expect(scaledStatusDuration(target, "armor-boost", 10)).toBe(10);
    expect(scaledStatusDuration(target, "regeneration", 10)).toBe(10);
  });

  it("the caster's own Restoration does not shorten the bleeding they inflict", () => {
    const target = makeCombatant({ id: "target", team: 1 });
    land("warrior.sever-artery", wearing("caster", 0, "restoration"), target);
    expect(target.statuses.get("bleeding")?.remainingSeconds).toBe(21);
  });

  it("compares the scaled duration against a longer bleed already running", () => {
    const target = wearing("target", 1, "restoration");
    target.statuses.apply("bleeding", 17, "earlier", NO_RANKS);
    land("warrior.sever-artery", makeCombatant({ id: "caster" }), target);
    // 21 s scaled is 16.8 s, shorter than the 17 s left, so the 17 s stays.
    expect(target.statuses.get("bleeding")).toMatchObject({
      remainingSeconds: 17,
      sourceId: "earlier",
    });
  });
});
