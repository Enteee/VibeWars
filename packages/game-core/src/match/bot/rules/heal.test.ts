import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../../../distances.js";
import { vec2 } from "../../../vec2.js";
import { DT, MONK, WARRIOR, askBot, fighter, match, skillsUsed, uses } from "./test-support.js";

describe("play-build heals (#1189, #1870)", () => {
  it("heals the ally at 40% rather than attacking", () => {
    const sim = match([
      fighter("monk", 0, MONK, vec2(400, 400)),
      fighter("ally", 0, WARRIOR, vec2(480, 400), {
        behaviour: undefined,
        startHealthFraction: 0.4,
      }),
      fighter("foe", 1, WARRIOR, vec2(600, 400), { behaviour: undefined }),
    ]);
    sim.step(DT);
    const cast = sim.get("monk")?.combatant.cast.activeCast;
    expect(cast?.targetId).toBe("ally");
    expect(uses(cast?.skillId)).toContain("healing");
    expect(sim.get("monk")?.combatant.attack).toBeUndefined();
  });

  it("casts Healing Ring for a hurt ally beside it, never for itself alone (#1870)", () => {
    const ring = { skillBar: ["monk.healing-ring"], startHealthFraction: 0.3 };
    const alone = match([
      fighter("monk", 0, MONK, vec2(400, 400), ring),
      fighter("foe", 1, WARRIOR, vec2(400 + AREA_ADJACENT / 2, 400), { behaviour: undefined }),
    ]);
    expect(askBot(alone, "monk").useSkillId).toBeUndefined();
    const beside = match([
      fighter("monk", 0, MONK, vec2(400, 400), { ...ring, startHealthFraction: 1 }),
      fighter("ally", 0, WARRIOR, vec2(400 + AREA_ADJACENT / 2, 400), {
        behaviour: undefined,
        startHealthFraction: 0.3,
      }),
    ]);
    expect(askBot(beside, "monk")).toMatchObject({
      useSkillId: "monk.healing-ring",
      targetId: "monk",
    });
  });

  it("walks in to an out-of-range ally to heal them", () => {
    const sim = match([
      fighter("monk", 0, MONK, vec2(400, 400)),
      fighter("ally", 0, WARRIOR, vec2(1550, 400), {
        behaviour: undefined,
        startHealthFraction: 0.4,
      }),
    ]);
    sim.step(DT);
    expect(sim.get("monk")?.pendingSkill?.targetId).toBe("ally");
    const before = sim.get("ally")?.combatant.health ?? 0;
    const used = skillsUsed(sim, "monk", 15);
    expect(used.some((id) => uses(id).includes("healing"))).toBe(true);
    expect(sim.get("ally")?.combatant.health).toBeGreaterThan(before);
  });
});

describe("play-build spirits for a hurt ally (#2491)", () => {
  const RITUALIST_RANKS = new Map([
    ["ritualist.restoration-magic", 12],
    ["ritualist.communing", 12],
  ]);

  for (const [skillId, waitSeconds] of [
    ["ritualist.recovery", 3 + 30 + 5],
    ["ritualist.shelter", 5 + 45 + 5],
  ] as const) {
    it(`casts ${skillId} at full Health for an ally in its range, once while the spirit stands`, () => {
      const sim = match([
        fighter("rit", 0, MONK, vec2(400, 400), {
          skillBar: [skillId],
          attributeRanks: RITUALIST_RANKS,
          maxEnergy: 100,
        }),
        fighter("ally", 0, WARRIOR, vec2(480, 400), {
          behaviour: undefined,
          startHealthFraction: 0.4,
        }),
        fighter("foe", 1, WARRIOR, vec2(600, 400), { behaviour: undefined, skillBar: [] }),
      ]);
      expect(askBot(sim, "rit")).toMatchObject({ useSkillId: skillId, targetId: "rit" });
      expect(skillsUsed(sim, "rit", waitSeconds)).toEqual([skillId]);
      const spirit = [...sim.participants()].find(
        ({ creature }) => creature?.ownerId === "rit" && creature.skillId === skillId,
      );
      expect(spirit?.combatant.dead).toBe(false);
    });
  }

  it("casts no spirit for an ally outside its aura", () => {
    const sim = match([
      fighter("rit", 0, MONK, vec2(400, 400), {
        skillBar: ["ritualist.recovery"],
        attributeRanks: RITUALIST_RANKS,
        maxEnergy: 100,
      }),
      fighter("ally", 0, WARRIOR, vec2(1500, 400), {
        behaviour: undefined,
        startHealthFraction: 0.4,
      }),
    ]);
    expect(askBot(sim, "rit").useSkillId).toBeUndefined();
  });
});
