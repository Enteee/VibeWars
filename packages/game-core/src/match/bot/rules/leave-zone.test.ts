import { describe, expect, it } from "vitest";

import { pointInPolygon } from "../../../geometry.js";
import { distance, vec2 } from "../../../vec2.js";
import { NO_OBJECTIVES, type BotObjectives, type HostileGround } from "../../behaviour.js";
import type { CapturePoint } from "../../capture-points.js";
import { MatchSimulation } from "../../simulation.js";
import type { MatchZone } from "../../zones.js";
import leaveZone, { EXIT_MARGIN } from "./leave-zone.js";
import {
  BOT,
  BOUNDS,
  DT,
  ELEMENTALIST,
  RULESET,
  askBot,
  body,
  fighter,
  match,
  ruleFor,
  slotOf,
} from "./test-support.js";

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

  it("keeps on a walk to a spot inside the strip, such as a shrine there", () => {
    const sim = match([body("bot", 0, vec2(330, 400), { behaviour: BOT })]);
    const rule = ruleFor(sim, "bot", {}, { objectives: burning });
    rule.cursor.heldMove = { moveDirection: vec2(-1, 0), moveTo: vec2(300, 400) };
    expect(leaveZone.decide(rule)).toBeUndefined();
  });

  it("keeps on its own way out, once it has turned to it", () => {
    const sim = match([body("bot", 0, vec2(340, 400), { behaviour: BOT })]);
    const rule = ruleFor(sim, "bot", {}, { objectives: burning });
    const exit = vec2(350 + EXIT_MARGIN, 400);
    rule.cursor.heldMove = { moveDirection: vec2(1, 0), moveTo: exit };
    expect(leaveZone.decide(rule)?.moveTo).toEqual(exit);
  });

  it("holds a shrine in the strip rather than step off it", () => {
    const sim = match([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("foe", 1, vec2(1500, 700)),
    ]);
    const shrine: CapturePoint = {
      position: vec2(300, 400),
      layer: 0,
      owner: null,
      capturer: null,
      progress: 0,
    };
    const intent = askBot(sim, "bot", { ...burning, capturePoints: [shrine] });
    expect(intent.moveTo).toBeUndefined();
  });
});

describe("leave-zone: a bot steps out of a foe's harmful ground effect (#4193)", () => {
  /** Team 1's well at (300, 400), radius 100. */
  const WELL: HostileGround = {
    team: 1,
    hits: "foes",
    position: vec2(300, 400),
    layer: 0,
    radius: 100,
  };
  const welled: BotObjectives = { ...NO_OBJECTIVES, hostileGround: [WELL] };

  it("steps a bot in a foe's well about EXIT_MARGIN past its edge", () => {
    const sim = match([body("bot", 0, vec2(380, 400), { behaviour: BOT })]);
    const exit = leaveZone.decide(ruleFor(sim, "bot", {}, { objectives: welled }))?.moveTo;
    if (exit === undefined) throw new Error("no exit");
    const away = distance(exit, WELL.position);
    expect(away).toBeGreaterThanOrEqual(WELL.radius + EXIT_MARGIN);
    expect(away).toBeLessThan(WELL.radius + EXIT_MARGIN + 3);
    expect(exit.x).toBeGreaterThan(380);
  });

  it("stays in its own team's well", () => {
    const sim = match([body("bot", 1, vec2(380, 400), { behaviour: BOT })]);
    expect(leaveZone.decide(ruleFor(sim, "bot", {}, { objectives: welled }))).toBeUndefined();
  });

  it("finishes its cast first", () => {
    const sim = match([
      fighter("bot", 0, ELEMENTALIST, vec2(380, 400), { behaviour: undefined }),
      fighter("foe", 1, ELEMENTALIST, vec2(560, 400), { behaviour: undefined }),
    ]);
    sim.setTarget("bot", "foe");
    sim.requestSkill("bot", slotOf(ELEMENTALIST, "elementalist.chain-lightning"));
    expect(sim.get("bot")?.combatant.cast.isCasting).toBe(true);
    expect(leaveZone.decide(ruleFor(sim, "bot", {}, { objectives: welled }))).toBeUndefined();
  });
});
