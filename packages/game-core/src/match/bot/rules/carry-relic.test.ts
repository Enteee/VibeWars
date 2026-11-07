import { describe, expect, it } from "vitest";

import { vec2 } from "../../../vec2.js";
import { NO_OBJECTIVES, type BotObjectives } from "../../behaviour.js";
import { relicId, type RelicState } from "../../relics.js";
import { askBot, body, BOT, match } from "./test-support.js";

const ALTAR = vec2(800, 400);

/** Relic Run with `relics`, the spawns at the field's ends. */
const running = (...relics: RelicState[]): BotObjectives => ({
  ...NO_OBJECTIVES,
  relics,
  relicSpawns: [
    { team: 0, position: vec2(100, 400) },
    { team: 1, position: vec2(1500, 400) },
  ],
  altar: ALTAR,
});

describe("carry-relic: a bot runs its relic to the altar (#2581)", () => {
  it("walks to the altar with its relic, a foe in spell range or not", () => {
    const sim = match([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("foe", 1, vec2(500, 400)),
    ]);
    const carrying = running({ team: 0, place: { kind: "carried", carrierId: "bot" } });
    const intent = askBot(sim, "bot", carrying);
    expect(intent.moveTo).toEqual(ALTAR);
    expect(intent.attackTargetId).toBeUndefined();
    expect(intent.useSkillId).toBeUndefined();
  });

  it("fights a foe in spell range while a teammate carries the relic", () => {
    const sim = match([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("mate", 0, vec2(200, 400), { behaviour: BOT }),
      body("foe", 1, vec2(500, 400)),
    ]);
    const intent = askBot(
      sim,
      "bot",
      running({ team: 0, place: { kind: "carried", carrierId: "mate" } }),
    );
    expect(intent.moveTo).not.toEqual(ALTAR);
    expect(intent.attackTargetId).not.toBe(relicId(0));
  });
});
