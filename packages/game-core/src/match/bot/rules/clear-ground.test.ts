import { describe, expect, it } from "vitest";

import { pointInPolygon } from "../../../geometry.js";
import { vec2 } from "../../../vec2.js";
import { NO_OBJECTIVES, type BotObjectives } from "../../behaviour.js";
import type { CapturePoint } from "../../capture-points.js";
import { MatchSimulation } from "../../simulation.js";
import type { MatchZone } from "../../zones.js";
import clearGround from "./clear-ground.js";
import { EXIT_MARGIN } from "./leave-zone.js";
import {
  BOT,
  BOUNDS,
  DT,
  ELEMENTALIST,
  RANGER,
  RULESET,
  body,
  fighter,
  match,
  ruleFor,
} from "./test-support.js";

/** Scorched ground across the field, x 250..350. */
const STRIP: MatchZone = {
  id: "strip",
  kind: "scorched",
  layer: 0,
  polygon: [vec2(250, 0), vec2(350, 0), vec2(350, 800), vec2(250, 800)],
};

const burning: BotObjectives = { ...NO_OBJECTIVES, harmfulZones: [STRIP] };

describe("clear-ground: a bot in a fight steps out of harmful ground (#3026)", () => {
  it("steps to the nearest spot past the edge, its foe still in reach", () => {
    const sim = match([
      body("bot", 0, vec2(330, 400), { behaviour: BOT }),
      body("foe", 1, vec2(500, 400)),
    ]);
    const rule = ruleFor(sim, "bot", { targetId: "foe" }, { objectives: burning });
    expect(clearGround.decide(rule)?.moveTo).toEqual(vec2(350 + EXIT_MARGIN, 400));
  });

  it("leaves a bot with no foe in reach to leave-zone", () => {
    const sim = match([body("bot", 0, vec2(330, 400), { behaviour: BOT })]);
    expect(clearGround.decide(ruleFor(sim, "bot", {}, { objectives: burning }))).toBeUndefined();
  });

  it("fights in the fire when the way out takes it out of its weapon's reach", () => {
    // Unarmed, so melee; its foe deep in the strip, the way out 50 units off it.
    const sim = match([
      body("bot", 0, vec2(335, 400), { behaviour: BOT }),
      body("foe", 1, vec2(320, 400)),
    ]);
    const rule = ruleFor(sim, "bot", { targetId: "foe" }, { objectives: burning });
    expect(clearGround.decide(rule)).toBeUndefined();
  });

  it("holds a shrine in the strip its team has not filled", () => {
    const sim = match([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("foe", 1, vec2(500, 400)),
    ]);
    const shrine: CapturePoint = {
      position: vec2(300, 400),
      layer: 0,
      owner: null,
      capturer: null,
      progress: 0,
    };
    const rule = ruleFor(
      sim,
      "bot",
      { targetId: "foe" },
      { objectives: { ...burning, capturePoints: [shrine] } },
    );
    expect(clearGround.decide(rule)).toBeUndefined();
  });

  it("gets a caster fighting a foe out of the strip within a few seconds", () => {
    const sim = new MatchSimulation({
      seed: "bot",
      ruleset: RULESET,
      bounds: BOUNDS,
      zones: [STRIP],
      participants: [
        fighter("bot", 0, ELEMENTALIST, vec2(300, 400)),
        fighter("foe", 1, RANGER, vec2(700, 400)),
      ],
    });
    for (let t = 0; t < 3; t += DT) sim.step(DT);
    const bot = sim.get("bot");
    if (bot === undefined) throw new Error("no bot");
    expect(pointInPolygon(bot.position, STRIP.polygon)).toBe(false);
  });
});
