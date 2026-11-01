import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../../../distances.js";
import { unarmedResolvedEquipment } from "../../../equipment/resolve.js";
import { vec2, type Vec2 } from "../../../vec2.js";
import { type ParticipantSpec } from "../../simulation.js";
import { BOT, askBot, match } from "./test-support.js";

describe("play-build's way out (#1930)", () => {
  /** A bare body, a bot unless it is a creature. */
  const bare = (id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) =>
    ({
      id,
      team,
      skillBar: [],
      attributeRanks: new Map(),
      equipment: unarmedResolvedEquipment(60),
      maxEnergy: 60,
      spawn,
      facing: 0,
      ...extra,
    }) satisfies ParticipantSpec;
  const spirit = (id: string, spawn: Vec2): ParticipantSpec =>
    bare(id, 0, spawn, {
      creature: {
        ownerId: "sin",
        kind: "spirit",
        look: "spirit",
        name: id,
        expiresInSeconds: Number.POSITIVE_INFINITY,
        ageSeconds: 0,
        summonedAtTick: 0,
        skillId: undefined,
        aura: undefined,
        onDeath: "vanish",
        ownerDisableSeconds: 0,
        deathBurst: undefined,
        onDeathInRange: undefined,
        replacedBy: undefined,
        corpsesLeft: 0,
        companionSkillId: undefined,
        leaderId: undefined,
        mode: "guard",
      },
    });
  /** An assassin with Spirit Walk at `health`, a foe at its elbow, a spirit by the foe and one far off. */
  const cornered = (health: number) => {
    const sim = match([
      bare("sin", 0, vec2(0, 0), { skillBar: ["assassin.spirit-walk"], behaviour: BOT }),
      bare("foe", 1, vec2(AREA_ADJACENT, 0)),
      spirit("near", vec2(AREA_ADJACENT, 60)),
      spirit("far", vec2(-300, 0)),
    ]);
    const sin = sim.get("sin")?.combatant;
    if (sin === undefined) throw new Error("no sin");
    sin.health = sin.maxHealth * health;
    return sim;
  };

  it("steps to the spirit farthest from the foe when hurt", () => {
    expect(askBot(cornered(0.4), "sin")).toMatchObject({
      targetId: "far",
      useSkillId: "assassin.spirit-walk",
    });
  });

  it("stays while it is not hurt", () => {
    expect(askBot(cornered(0.9), "sin").useSkillId).toBeUndefined();
  });
});
