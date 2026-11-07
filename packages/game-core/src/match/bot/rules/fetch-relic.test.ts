import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../../../distances.js";
import { vec2 } from "../../../vec2.js";
import { NO_OBJECTIVES, type BotObjectives } from "../../behaviour.js";
import { AT_SPAWN } from "../../carried.js";
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

const BOTH_HOME = running({ team: 0, place: AT_SPAWN }, { team: 1, place: AT_SPAWN });

describe("fetch-relic: Relic Run bots fetch their relic and return the foe's (#2581)", () => {
  // The foe is well beyond spell range (420) unless a test says otherwise.
  const far = () => body("foe", 1, vec2(1550, 750));

  it("sends the bot nearest its relic for it, the other to escort at the altar", () => {
    const sim = match([
      body("near", 0, vec2(300, 400), { behaviour: BOT }),
      body("other", 0, vec2(500, 400), { behaviour: BOT }),
      far(),
    ]);
    expect(askBot(sim, "near", BOTH_HOME).attackTargetId).toBe(relicId(0));
    const escort = askBot(sim, "other", BOTH_HOME);
    expect(escort.attackTargetId).toBeUndefined();
    expect(escort.moveTo).toEqual(ALTAR);
  });

  it("waits by the altar once there, escorting", () => {
    const sim = match([
      body("near", 0, vec2(300, 400), { behaviour: BOT }),
      body("other", 0, vec2(800 - RANGE_SPELL / 2 + 10, 400), { behaviour: BOT }),
      far(),
    ]);
    const intent = askBot(sim, "other", BOTH_HOME);
    expect(intent.moveTo).toBeUndefined();
    expect(intent.attackTargetId).toBeUndefined();
  });

  it("fetches its relic where it fell", () => {
    const sim = match([
      body("bot", 0, vec2(800, 400), { behaviour: BOT }),
      body("mate", 0, vec2(150, 400), { behaviour: BOT }),
      far(),
    ]);
    const fallen = running(
      { team: 0, place: { kind: "ground", position: vec2(900, 300) } },
      { team: 1, place: AT_SPAWN },
    );
    expect(askBot(sim, "bot", fallen).attackTargetId).toBe(relicId(0));
    expect(askBot(sim, "mate", fallen).moveTo).toEqual(ALTAR);
  });

  it("returns a foe's relic on the ground before fetching its own", () => {
    const sim = match([body("bot", 0, vec2(300, 400), { behaviour: BOT }), far()]);
    const dropped = running(
      { team: 0, place: AT_SPAWN },
      { team: 1, place: { kind: "ground", position: vec2(600, 400) } },
    );
    expect(askBot(sim, "bot", dropped).attackTargetId).toBe(relicId(1));
  });

  it("leaves a fighting teammate to its fight and fetches the relic itself", () => {
    const sim = match([
      body("bot", 0, vec2(600, 400), { behaviour: BOT }),
      body("mate", 0, vec2(150, 400), { behaviour: BOT }),
      body("foe", 1, vec2(150, 200)),
    ]);
    expect(askBot(sim, "bot", BOTH_HOME).attackTargetId).toBe(relicId(0));
  });

  it("fetches its relic past a human idle at their base, out of reach of it", () => {
    const sim = match([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("human", 0, vec2(200, 400)),
      far(),
    ]);
    const intent = askBot(sim, "bot", BOTH_HOME, (id) => id !== "human");
    expect(intent.attackTargetId).toBe(relicId(0));
  });

  it("leaves its relic to a human teammate within reach of it", () => {
    const sim = match([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("human", 0, vec2(150, 400)),
      far(),
    ]);
    const intent = askBot(sim, "bot", BOTH_HOME, (id) => id !== "human");
    expect(intent.attackTargetId).toBeUndefined();
    expect(intent.moveTo).toEqual(ALTAR);
  });

  it("never fetches the relic a teammate carries", () => {
    const sim = match([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("mate", 0, vec2(400, 400), { behaviour: BOT }),
      far(),
    ]);
    const carried = running(
      { team: 0, place: { kind: "carried", carrierId: "mate" } },
      { team: 1, place: AT_SPAWN },
    );
    const intent = askBot(sim, "bot", carried);
    expect(intent.attackTargetId).toBeUndefined();
    expect(intent.moveTo).toEqual(ALTAR);
  });

  it("leaves the relic to the fight when a foe is within spell range", () => {
    const sim = match([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("foe", 1, vec2(500, 400)),
    ]);
    const intent = askBot(sim, "bot", BOTH_HOME);
    expect(intent.attackTargetId).not.toBe(relicId(0));
    expect(intent.moveTo).not.toEqual(ALTAR);
  });

  it("does nothing outside Relic Run", () => {
    const sim = match([body("bot", 0, vec2(300, 400), { behaviour: BOT }), far()]);
    const intent = askBot(sim, "bot", NO_OBJECTIVES);
    expect(intent.attackTargetId).toBeUndefined();
    expect(intent.moveTo).not.toEqual(ALTAR);
  });
});
