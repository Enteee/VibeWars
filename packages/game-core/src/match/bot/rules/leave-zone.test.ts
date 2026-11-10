import { describe, expect, it } from "vitest";

import { pointInPolygon } from "../../../geometry.js";
import { vec2 } from "../../../vec2.js";
import { NO_OBJECTIVES, type BotObjectives } from "../../behaviour.js";
import { MatchSimulation } from "../../simulation.js";
import type { MatchZone } from "../../zones.js";
import leaveZone, { EXIT_MARGIN } from "./leave-zone.js";
import { BOT, BOUNDS, DT, RULESET, body, match, ruleFor } from "./test-support.js";

/** Scorched ground across the field, x 250..350. */
const STRIP: MatchZone = {
  id: "strip",
  kind: "scorched",
  layer: 0,
  polygon: [vec2(250, 0), vec2(350, 0), vec2(350, 800), vec2(250, 800)],
};

const burning: BotObjectives = { ...NO_OBJECTIVES, harmfulZones: [STRIP] };

describe("leave-zone: a bot steps out of harmful ground (#3026)", () => {
  it("walks a bot dropped in the strip out of it, and it stays out", () => {
    const sim = new MatchSimulation({
      seed: "bot",
      ruleset: RULESET,
      bounds: BOUNDS,
      zones: [STRIP],
      participants: [
        body("bot", 0, vec2(330, 400), { behaviour: BOT }),
        body("mate", 0, vec2(600, 400), { behaviour: BOT }),
      ],
    });
    for (let t = 0; t < 2; t += DT) sim.step(DT);
    const bot = sim.get("bot");
    if (bot === undefined) throw new Error("no bot");
    expect(pointInPolygon(bot.position, STRIP.polygon)).toBe(false);
    // Out by the nearer side, the east one, not across the strip.
    expect(bot.position.x).toBeGreaterThan(350);
  });

  it("steps to the nearest spot past the edge", () => {
    const sim = match([body("bot", 0, vec2(330, 400), { behaviour: BOT })]);
    const intent = leaveZone.decide(ruleFor(sim, "bot", {}, { objectives: burning }));
    expect(intent?.moveTo).toEqual(vec2(350 + EXIT_MARGIN, 400));
  });

  it("does not stop a bot carrying a relic", () => {
    const sim = match([body("bot", 0, vec2(330, 400), { behaviour: BOT })]);
    const carrying: BotObjectives = {
      ...burning,
      relics: [{ team: 0, place: { kind: "carried", carrierId: "bot" } }],
    };
    expect(leaveZone.decide(ruleFor(sim, "bot", {}, { objectives: carrying }))).toBeUndefined();
  });

  it("leaves a bot with a foe in reach to fight", () => {
    const sim = match([
      body("bot", 0, vec2(330, 400), { behaviour: BOT }),
      body("foe", 1, vec2(500, 400)),
    ]);
    const rule = ruleFor(sim, "bot", { targetId: "foe" }, { objectives: burning });
    expect(leaveZone.decide(rule)).toBeUndefined();
  });

  it("lets a bot walk on through to somewhere past the strip, and not back", () => {
    const sim = match([body("bot", 0, vec2(270, 400), { behaviour: BOT })]);
    const rule = ruleFor(sim, "bot", {}, { objectives: burning });
    rule.cursor.heldMove = { moveDirection: vec2(1, 0), moveTo: vec2(900, 400) };
    expect(leaveZone.decide(rule)).toBeUndefined();
  });
});
