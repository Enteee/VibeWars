import { describe, expect, it } from "vitest";

import { vec2, type Vec2 } from "../../../vec2.js";
import { BOT, askBot, body, match } from "./test-support.js";

describe("play-build binds a foe's spirit (#1965)", () => {
  const spirit = (id: string, ownerId: string, team: number, spawn: Vec2) =>
    body(id, team, spawn, {
      creature: {
        ownerId,
        kind: "spirit",
        look: "spirit",
        name: id,
        expiresInSeconds: 60,
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

  it("casts Signet of Binding on a foe's spirit in reach, with Health to spare", () => {
    const binder = () =>
      match([
        body("r", 0, vec2(0, 0), { behaviour: BOT, skillBar: ["ritualist.signet-of-binding"] }),
        body("foe", 1, vec2(1500, 0)),
        spirit("s", "foe", 1, vec2(300, 0)),
      ]);
    expect(askBot(binder(), "r")).toMatchObject({
      targetId: "s",
      useSkillId: "ritualist.signet-of-binding",
    });
    const hurt = binder();
    const r = hurt.get("r");
    if (r !== undefined) {
      r.combatant.health = 200;
    }
    expect(askBot(hurt, "r").useSkillId).toBeUndefined();
  });
});
