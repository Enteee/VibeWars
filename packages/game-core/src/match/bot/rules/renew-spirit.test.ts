import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../../../equipment/resolve.js";
import { vec2, type Vec2 } from "../../../vec2.js";
import { type ParticipantSpec } from "../../simulation.js";
import { BOT, askBot, match } from "./test-support.js";

describe("play-build renews a spirit near its end (#1947)", () => {
  const ritualist = (id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) =>
    ({
      id,
      team,
      skillBar: ["ritualist.gaze-of-fury"],
      attributeRanks: new Map([["ritualist.channeling-magic", 12]]),
      equipment: unarmedResolvedEquipment(60),
      maxEnergy: 60,
      spawn,
      facing: 0,
      ...extra,
    }) satisfies ParticipantSpec;
  /** `r`'s spirit with `left` of its 60 s, and a foe `foeAt` away from it. */
  const ending = (left: number, foeAt: number) =>
    match([
      ritualist("r", 0, vec2(0, 0), { behaviour: BOT }),
      ritualist("foe", 1, vec2(300 + foeAt, 0), { skillBar: [] }),
      ritualist("s", 0, vec2(300, 0), {
        skillBar: [],
        creature: {
          ownerId: "r",
          kind: "spirit",
          look: "spirit",
          name: "s",
          expiresInSeconds: left,
          ageSeconds: 60 - left,
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
      }),
    ]);

  it("casts Gaze of Fury on its own spirit with under a quarter of its life left, a foe in its reach", () => {
    expect(askBot(ending(10, 200), "r")).toMatchObject({
      targetId: "s",
      useSkillId: "ritualist.gaze-of-fury",
    });
  });

  it("leaves a spirit with most of its life, or one no foe is near", () => {
    expect(askBot(ending(30, 200), "r").useSkillId).toBeUndefined();
    expect(askBot(ending(10, 2000), "r").useSkillId).toBeUndefined();
  });
});
