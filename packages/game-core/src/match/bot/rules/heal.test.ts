import { describe, expect, it } from "vitest";

import type { MatchSimulation, ParticipantSpec } from "../../simulation.js";
import { NO_RANKS } from "../../../skills/status.js";

import { AREA_ADJACENT } from "../../../distances.js";
import { vec2 } from "../../../vec2.js";
import {
  DT,
  ELEMENTALIST,
  MONK,
  WARRIOR,
  askBot,
  fighter,
  match,
  skillsUsed,
  uses,
} from "./test-support.js";

const PROTECTIVE_SPIRIT = "monk.protective-spirit";

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

  {
    const skillId = "ritualist.shelter";
    const waitSeconds = 5 + 45 + 5;
    it("casts Shelter at full Health for an ally in its range, once while the spirit stands", () => {
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

  it("casts no Shelter while a teammate's stands in its aura, which it would only replace", () => {
    const ritualist = (id: string, x: number) =>
      fighter(id, 0, MONK, vec2(x, 400), {
        skillBar: ["ritualist.shelter"],
        attributeRanks: RITUALIST_RANKS,
        maxEnergy: 100,
        behaviour: undefined,
      });
    const sim = match([
      ritualist("rit", 400),
      ritualist("other", 440),
      fighter("ally", 0, WARRIOR, vec2(480, 400), {
        behaviour: undefined,
        startHealthFraction: 0.4,
      }),
    ]);
    expect(askBot(sim, "rit").useSkillId).toBe("ritualist.shelter");
    expect(sim.requestSkill("other", 0)?.check).toEqual({ ok: true });
    skillsUsed(sim, "other", 6);
    expect(
      [...sim.participants()].some(({ creature }) => creature?.skillId === "ritualist.shelter"),
    ).toBe(true);
    expect(askBot(sim, "rit").useSkillId).toBeUndefined();
  });

  it("casts no spirit for an ally outside its aura", () => {
    const sim = match([
      fighter("rit", 0, MONK, vec2(400, 400), {
        skillBar: ["ritualist.shelter"],
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

  it("never casts Second Wind at 0 Overcast, a real heal instead (#2504)", () => {
    const sim = match([
      fighter("ele", 0, ELEMENTALIST, vec2(400, 400), {
        skillBar: ["elementalist.second-wind", "monk.orison-of-healing"],
        startHealthFraction: 0.3,
      }),
      fighter("foe", 1, WARRIOR, vec2(1200, 400), { behaviour: undefined }),
    ]);
    expect(sim.get("ele")?.combatant.overcast).toBe(0);
    expect(askBot(sim, "ele")).toMatchObject({
      useSkillId: "monk.orison-of-healing",
      targetId: "ele",
    });
  });
});

describe("play-build protects the spiked ally (#2627)", () => {
  /**
   * A monk holding `skillBar`, a full-health "ally", an "other" ally at
   * `otherHealth`, and five idle foes, none targeting anyone yet.
   */
  function spike(
    skillBar: readonly string[],
    extra: Partial<ParticipantSpec> = {},
    otherHealth = 1,
  ): MatchSimulation {
    return match([
      fighter("monk", 0, MONK, vec2(400, 400), { skillBar: [...skillBar], ...extra }),
      fighter("ally", 0, WARRIOR, vec2(480, 400), { behaviour: undefined }),
      fighter("other", 0, WARRIOR, vec2(480, 480), {
        behaviour: undefined,
        startHealthFraction: otherHealth,
      }),
      ...[0, 1, 2, 3, 4].map((n) =>
        fighter(`foe${String(n)}`, 1, WARRIOR, vec2(700, 200 + 100 * n), { behaviour: undefined }),
      ),
    ]);
  }

  /** Points the foes `foeIds` at `targetId`. */
  function target(sim: MatchSimulation, targetId: string, ...foeIds: string[]): MatchSimulation {
    for (const foeId of foeIds) {
      const foe = sim.get(foeId);
      if (foe === undefined) throw new Error(`no ${foeId}`);
      foe.targetId = targetId;
    }
    return sim;
  }

  it("puts Protective Spirit on a full-health ally two foes target", () => {
    const sim = target(spike([PROTECTIVE_SPIRIT]), "ally", "foe0", "foe1");
    expect(askBot(sim, "monk")).toMatchObject({ useSkillId: PROTECTIVE_SPIRIT, targetId: "ally" });
  });

  it("leaves a full-health ally only one foe targets", () => {
    const sim = target(spike([PROTECTIVE_SPIRIT]), "ally", "foe0");
    expect(askBot(sim, "monk").useSkillId).toBeUndefined();
  });

  it("does not recast Protective Spirit on an ally that has it", () => {
    const sim = target(spike([PROTECTIVE_SPIRIT]), "ally", "foe0", "foe1");
    sim.get("ally")?.combatant.statuses.apply("protective-spirit", 10, "monk", NO_RANKS);
    expect(askBot(sim, "monk").useSkillId).toBeUndefined();
  });

  it("heals the hurt ally when it holds nothing to protect the spiked one", () => {
    const sim = target(spike(["monk.heal-other"], {}, 0.4), "ally", "foe0", "foe1");
    expect(askBot(sim, "monk")).toMatchObject({ useSkillId: "monk.heal-other", targetId: "other" });
  });

  it("protects the ally three foes target over the one two do", () => {
    const sim = target(spike([PROTECTIVE_SPIRIT]), "ally", "foe0", "foe1");
    target(sim, "other", "foe2", "foe3", "foe4");
    expect(askBot(sim, "monk").targetId).toBe("other");
  });

  it("protects at rank 0 in Protection Prayers", () => {
    const sim = target(
      spike([PROTECTIVE_SPIRIT], { attributeRanks: new Map() }),
      "ally",
      "foe0",
      "foe1",
    );
    expect(askBot(sim, "monk")).toMatchObject({ useSkillId: PROTECTIVE_SPIRIT, targetId: "ally" });
  });
});
