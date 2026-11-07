import { describe, expect, it } from "vitest";

import { vec2, type Vec2 } from "../../../vec2.js";
import { NO_OBJECTIVES, type BotObjectives } from "../../behaviour.js";
import type { CapturePoint } from "../../capture-points.js";
import {
  ANNIHILATION_MATCH_RULES,
  CAPTURE_POINTS_MATCH_RULES,
  type MatchRules,
} from "../../../match-rules.js";
import { MatchSimulation } from "../../simulation.js";
import { askBot, body, BOT, BOUNDS, DT, match, RULESET } from "./test-support.js";

/** A shrine at `position`, `owner`'s at `progress`; neutral and empty by default. */
function shrine(position: Vec2, owner: number | null = null, progress = 0): CapturePoint {
  return { position, owner, capturer: owner, progress };
}

const playing = (...capturePoints: CapturePoint[]): BotObjectives => ({
  ...NO_OBJECTIVES,
  capturePoints,
});

describe("shrines: Capture Points bots take and hold shrines (#2580)", () => {
  // The foe is well beyond spell range (420) unless a test says otherwise.
  const far = (extra: Parameters<typeof body>[3] = {}) => body("foe", 1, vec2(1500, 700), extra);

  it("stands on a shrine its team does not own, with no foe in reach, to fill it", () => {
    const sim = match([body("bot", 0, vec2(100, 100), { behaviour: BOT }), far()]);
    const intent = askBot(sim, "bot", playing(shrine(vec2(110, 100))));
    expect(intent.moveTo).toBeUndefined();
    expect(intent.useSkillId).toBeUndefined();
  });

  it("walks to the one shrine it does not own", () => {
    const sim = match([body("bot", 0, vec2(100, 100), { behaviour: BOT }), far()]);
    const intent = askBot(sim, "bot", playing(shrine(vec2(600, 100))));
    expect(intent.moveTo).toEqual(vec2(600, 100));
  });

  it("moves on from a shrine its team holds at full to the next", () => {
    const sim = match([body("bot", 0, vec2(100, 100), { behaviour: BOT }), far()]);
    const held = shrine(vec2(100, 100), 0, 1);
    const intent = askBot(sim, "bot", playing(held, shrine(vec2(400, 100))));
    expect(intent.moveTo).not.toEqual(vec2(100, 600));
  });

  it("splits two bots over two shrines, the nearer bot keeping its nearest", () => {
    const sim = match([
      body("a", 0, vec2(100, 300), { behaviour: BOT }),
      body("b", 0, vec2(150, 300), { behaviour: BOT }),
      far(),
    ]);
    const objectives = playing(shrine(vec2(400, 100)), shrine(vec2(400, 500)));
    // Both shrines are as near to each; b is nearer to the first, so a takes the other.
    expect(askBot(sim, "a", objectives).moveTo).toEqual(vec2(400, 500));
    expect(askBot(sim, "b", objectives).moveTo).toEqual(vec2(400, 100));
  });

  it("joins a shrine a teammate holds when every one is taken", () => {
    const sim = match([
      body("a", 0, vec2(400, 100), { behaviour: BOT }),
      body("b", 0, vec2(100, 100), { behaviour: BOT }),
      far(),
    ]);
    expect(askBot(sim, "b", playing(shrine(vec2(400, 100)))).moveTo).toEqual(vec2(400, 100));
  });

  it("leaves shrines to the fight when a foe is within spell range", () => {
    const sim = match([
      body("bot", 0, vec2(100, 100), { behaviour: BOT }),
      body("foe", 1, vec2(400, 100)),
    ]);
    // The fight has it: it never walks off to the shrine.
    const intent = askBot(sim, "bot", playing(shrine(vec2(100, 600))));
    expect(intent.moveTo).not.toEqual(vec2(100, 600));
  });

  it("holds its shrine while a teammate fights a foe beyond its own reach", () => {
    const sim = match([
      body("bot", 0, vec2(100, 100), { behaviour: BOT }),
      body("mate", 0, vec2(1000, 100), { behaviour: BOT }),
      body("foe", 1, vec2(1300, 100)),
    ]);
    sim.setTarget("mate", "foe");
    const intent = askBot(sim, "bot", playing(shrine(vec2(100, 100))));
    expect(intent.moveTo).toBeUndefined();
    expect(intent.targetId).toBeUndefined();
  });

  it("leaves the rest to close-in when every shrine is its team's", () => {
    const sim = match([body("bot", 0, vec2(100, 100), { behaviour: BOT }), far()]);
    const intent = askBot(sim, "bot", playing(shrine(vec2(600, 100), 0, 1)));
    expect(intent.moveTo).toEqual(vec2(1500, 700));
  });

  it("in a match, walks to a shrine only when the match is Capture Points", () => {
    const heading = (matchRules: MatchRules): number => {
      const sim = new MatchSimulation({
        seed: "shrines",
        ruleset: RULESET,
        bounds: BOUNDS,
        matchRules,
        capturePoints: [vec2(100, 100)],
        participants: [body("bot", 0, vec2(100, 400), { behaviour: BOT }), far()],
      });
      for (let t = 0; t < 2; t += DT) sim.step(DT);
      return sim.get("bot")?.position.y ?? Number.NaN;
    };
    expect(heading(CAPTURE_POINTS_MATCH_RULES)).toBeLessThan(350);
    expect(heading(ANNIHILATION_MATCH_RULES)).toBeGreaterThan(400);
  });
});
