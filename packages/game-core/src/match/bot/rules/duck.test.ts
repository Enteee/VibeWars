import { describe, expect, it } from "vitest";

import { hasLineOfSight, segment } from "../../../geometry.js";
import { vec2, type Vec2 } from "../../../vec2.js";
import { NO_OBJECTIVES, type BehaviourContext, type HostileGround } from "../../behaviour.js";
import { coverSpots, type MatchSimulation } from "../../simulation.js";
import { botUses } from "../skill-intent.js";
import duck, { DUCK_COOLDOWN, DUCK_SECONDS } from "./duck.js";
import { ELEMENTALIST, MONK, RANGER, WARRIOR, fighter, match, ruleFor } from "./test-support.js";
import type { RuleContext } from "./types.js";

/** A wall 100 east of the bot, between it and its foes. */
const WALL = segment(vec2(700, 250), vec2(700, 550));
/** `coverSpots`' spot on the bot's side of `WALL`. */
const BEHIND = vec2(670, 400);

/** The bot `self` at (600, 400) on team 0, two Rangers 300 east of it; `hunters` of them target it. */
function fight(self = ELEMENTALIST, hunters = 2): MatchSimulation {
  const sim = match([
    fighter("self", 0, self, vec2(600, 400)),
    fighter("r1", 1, RANGER, vec2(900, 350)),
    fighter("r2", 1, RANGER, vec2(900, 450)),
  ]);
  ["r1", "r2"].slice(0, hunters).forEach((id) => {
    get(sim, id).targetId = "self";
  });
  return sim;
}

function get(sim: MatchSimulation, id: string) {
  const body = sim.get(id);
  if (body === undefined) throw new Error(`no ${id}`);
  return body;
}

/** `id` at `fraction` of its health. */
function hurt(sim: MatchSimulation, id: string, fraction: number): void {
  const body = get(sim, id);
  body.combatant.health = body.combatant.maxHealth * fraction;
}

/** `self` 10 units nearer `BEHIND`, short of arriving: some way a think's walk takes it. */
function walk(sim: MatchSimulation): void {
  const self = get(sim, "self");
  self.position = vec2(Math.min(self.position.x + 10, BEHIND.x), BEHIND.y);
}

/** Sight stopped by `WALL` alone, and its cover spots. */
const WALLED: Partial<BehaviourContext> = {
  seesBetween: (from, to) => hasLineOfSight(from, to, [WALL]),
  cover: coverSpots([[WALL]], [], () => true),
};

function ruleOf(sim: MatchSimulation, extra: Partial<RuleContext> = {}, context = WALLED) {
  return ruleFor(sim, "self", extra, context);
}

describe("duck (#3369)", () => {
  it("walks a bot two foes target behind the wall none of them sees past", () => {
    const rule = ruleOf(fight());
    const intent = duck.decide(rule);
    expect(intent?.moveTo).toEqual(BEHIND);
    expect(intent?.moveToLayer).toBe(0);
    expect(rule.cursor.duck?.spot.point).toEqual(BEHIND);
    for (const id of ["r1", "r2"]) {
      const foe = get(fight(), id);
      expect(rule.context.seesBetween(foe.position, BEHIND, 0, 0)).toBe(false);
    }
  });

  it("does not duck when it is not focused", () => {
    expect(duck.decide(ruleOf(fight(ELEMENTALIST, 1)))).toBeUndefined();
  });

  it("ducks with one foe on it when it is low and its health falls fast", () => {
    const sim = fight(ELEMENTALIST, 1);
    hurt(sim, "self", 0.4);
    const rule = ruleOf(sim);
    rule.cursor.healthMarks.push({ at: -1, health: 0.6 });
    expect(duck.decide(rule)?.moveTo).toEqual(BEHIND);
  });

  it("does not duck with no cover in reach", () => {
    expect(duck.decide(ruleOf(fight(), {}, { ...WALLED, cover: [] }))).toBeUndefined();
    const far = segment(vec2(300, 0), vec2(300, 100));
    const away = { ...WALLED, cover: coverSpots([[far]], [], () => true) };
    expect(duck.decide(ruleOf(fight(), {}, away))).toBeUndefined();
  });

  it("skips a spot inside a foe's well (#4193)", () => {
    const well: HostileGround = { team: 1, hits: "foes", position: BEHIND, layer: 0, radius: 60 };
    const objectives = { ...NO_OBJECTIVES, hostileGround: [well] };
    expect(duck.decide(ruleOf(fight(), {}, { ...WALLED, objectives }))).toBeUndefined();
    const own = { ...NO_OBJECTIVES, hostileGround: [{ ...well, team: 0 }] };
    expect(duck.decide(ruleOf(fight(), {}, { ...WALLED, objectives: own }))?.moveTo).toEqual(
      BEHIND,
    );
  });

  it("does not take cover past its foes' centre", () => {
    const beyond = segment(vec2(780, 250), vec2(780, 550));
    const past = {
      seesBetween: (from: Vec2, to: Vec2) => hasLineOfSight(from, to, [beyond]),
      cover: coverSpots([[beyond]], [], () => true),
    };
    // Its far side, (810, 400), both foes see; its near side, (750, 400), hides it until that is past their centre.
    expect(duck.decide(ruleOf(fight(), {}, past))?.moveTo).toEqual(vec2(750, 400));
    const behind = { ...past, foeCentroid: vec2(740, 400) };
    expect(duck.decide(ruleOf(fight(), { foeCentroid: vec2(740, 400) }, behind))).toBeUndefined();
  });

  it("does not take a spot whose walk is far longer than the straight line", () => {
    const detour = { ...WALLED, routeLength: () => 1e6 };
    expect(duck.decide(ruleOf(fight(), {}, detour))).toBeUndefined();
  });

  it("does not duck a frontliner in reach of its target", () => {
    const sim = fight(WARRIOR);
    get(sim, "r1").position = vec2(650, 400);
    expect(duck.decide(ruleOf(sim, { targetId: "r1" }))).toBeUndefined();
    expect(duck.decide(ruleOf(fight(WARRIOR), { targetId: "r1" }))?.moveTo).toEqual(BEHIND);
  });

  it("comes back out once healed above 70 %, then waits out the cooldown", () => {
    const sim = fight();
    hurt(sim, "self", 0.4);
    const rule = ruleOf(sim);
    duck.decide(rule);
    hurt(sim, "self", 0.6);
    walk(sim);
    expect(duck.decide(rule)?.moveTo).toEqual(BEHIND);
    hurt(sim, "self", 0.8);
    expect(duck.decide(rule)).toBeUndefined();
    expect(rule.cursor.duck).toBeUndefined();
    expect(rule.cursor.duckReadyAt).toBe(DUCK_COOLDOWN);
    hurt(sim, "self", 0.3);
    expect(duck.decide(rule)).toBeUndefined();
  });

  it("stays ducked, focused at full health, until something else ends it", () => {
    const sim = fight();
    const rule = ruleOf(sim);
    duck.decide(rule);
    walk(sim);
    expect(duck.decide(rule)?.moveTo).toEqual(BEHIND);
    get(sim, "self").position = BEHIND;
    const there = duck.decide(rule);
    expect(there).toBeDefined();
    expect(there?.moveTo).toBeUndefined();
    expect(rule.cursor.duck?.spot.point).toEqual(BEHIND);
  });

  it("gives up a spot it gets no nearer to, as at a wall its route did not know of", () => {
    const sim = fight();
    const rule = ruleOf(sim);
    duck.decide(rule);
    expect(duck.decide(rule)).toBeUndefined();
    expect(rule.cursor.duck).toBeUndefined();
    expect(rule.cursor.duckReadyAt).toBe(DUCK_COOLDOWN);
  });

  it("comes back out after 3 s", () => {
    const sim = fight();
    const rule = ruleOf(sim);
    duck.decide(rule);
    const later = ruleOf(sim, { cursor: rule.cursor }, { ...WALLED, now: DUCK_SECONDS });
    expect(duck.decide(later)).toBeUndefined();
    expect(rule.cursor.duckReadyAt).toBe(DUCK_SECONDS + DUCK_COOLDOWN);
  });

  it("picks again, cooldown or not, once a hunter walks round to see its spot", () => {
    const sim = fight();
    const rule = ruleOf(sim);
    duck.decide(rule);
    get(sim, "r1").position = vec2(670, 600);
    expect(duck.decide(rule)).toBeUndefined();
    expect(rule.cursor.duck).toBeUndefined();
    expect(rule.cursor.duckReadyAt).toBe(0);
  });

  it("comes back out when its team calls a foe it cannot hit from there", () => {
    const sim = fight();
    const rule = ruleOf(sim);
    duck.decide(rule);
    const called = ruleOf(sim, { cursor: rule.cursor }, { ...WALLED, calledTargetId: "r1" });
    expect(duck.decide(called)).toBeUndefined();
  });

  it("casts on itself once in cover", () => {
    const sim = fight(MONK);
    hurt(sim, "self", 0.4);
    const rule = ruleOf(sim);
    duck.decide(rule);
    get(sim, "self").position = BEHIND;
    const intent = duck.decide(rule);
    expect(intent?.targetId).toBe("self");
    const skill = rule.bar.find((each) => each.id === intent?.useSkillId);
    const used = skill === undefined ? [] : botUses(skill);
    expect(used.includes("healing") || used.includes("defence")).toBe(true);
  });
});
