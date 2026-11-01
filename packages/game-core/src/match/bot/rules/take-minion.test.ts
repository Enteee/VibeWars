import { describe, expect, it } from "vitest";

import { vec2, type Vec2 } from "../../../vec2.js";
import { MASTERLESS_TEAM } from "../../minions.js";
import { BOT, askBot, body, match } from "./test-support.js";

describe("play-build takes foe minions (#2092)", () => {
  const minion = (id: string, ownerId: string | undefined, team: number, spawn: Vec2) =>
    body(id, team, spawn, {
      creature: {
        ownerId,
        kind: "minion",
        look: "bone-minion",
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
        bondStatusId: undefined,
        mode: "guard",
      },
    });
  const necromancer = (skillBar: string[]) =>
    body("n", 0, vec2(0, 0), { behaviour: BOT, skillBar });

  it("Gazes a masterless minion before a foe's minion near it", () => {
    const sim = match([
      necromancer(["necromancer.veratas-gaze"]),
      body("foe", 1, vec2(1500, 0)),
      minion("theirs", "foe", 1, vec2(40, 0)),
      minion("loose", undefined, MASTERLESS_TEAM, vec2(400, 0)),
    ]);
    expect(askBot(sim, "n")).toMatchObject({
      targetId: "loose",
      useSkillId: "necromancer.veratas-gaze",
    });
  });

  it("casts Verata's Aura with two foe minions round it, not with one", () => {
    const aura = (count: number) =>
      match([
        necromancer(["necromancer.veratas-aura"]),
        body("foe", 1, vec2(1500, 0)),
        ...Array.from({ length: count }, (_, i) =>
          minion(`m${String(i)}`, "foe", 1, vec2(50, i * 20)),
        ),
      ]);
    expect(askBot(aura(2), "n").useSkillId).toBe("necromancer.veratas-aura");
    expect(askBot(aura(1), "n").useSkillId).toBeUndefined();
  });
});
