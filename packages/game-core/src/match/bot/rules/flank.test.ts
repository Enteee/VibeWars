import { describe, expect, it } from "vitest";

import { vec2 } from "../../../vec2.js";
import { createCursor } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";
import { flankParty, flankWaypoint } from "../plan.js";
import type { BotRole } from "../role.js";
import flank, { FLANK_GIVE_UP_FRACTION, backlineFoe } from "./flank.js";
import { body, contextFor, match, ruleFor } from "./test-support.js";

// A team of two flanks with one of them; foe-front stands between it and
// foe-heal, the healer.
const setUp = () =>
  match([
    body("bot", 0, vec2(100, 400)),
    body("mate", 0, vec2(100, 600)),
    body("foe-front", 1, vec2(800, 500)),
    body("foe-heal", 1, vec2(1100, 500)),
  ]);
const sim = setUp();
const NOW = 50;
const roleOf = (one: Participant): BotRole => (one.id === "foe-heal" ? "healer" : "frontline");
const member = (id: string): Participant => {
  const found = sim.get(id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
};
const [flanker = "bot", pusher = "mate"] = ["bot", "mate"].sort(
  (one, other) =>
    Number(flankParty(contextFor(sim, other, { now: NOW }), member(other), 1)) -
    Number(flankParty(contextFor(sim, one, { now: NOW }), member(one), 1)),
);
const waypoint =
  flankWaypoint(contextFor(sim, flanker, { now: NOW }), member(flanker), 1)?.point ?? vec2(0, 0);

describe("flank (#3832)", () => {
  it("walks a flanker to its waypoint", () => {
    const intent = flank.decide(ruleFor(sim, flanker, { plan: "flank", roleOf }, { now: NOW }));
    expect(intent?.moveTo).toEqual(waypoint);
    expect(intent?.moveToLayer).toBe(0);
  });

  it("goes before fight, so a foe in reach does not stop the swing", () => {
    expect(flank.order).toBeLessThan(100);
  });

  it("is done at its waypoint for the rest of the phase", () => {
    const cursor = createCursor();
    const there = { ...member(flanker), position: waypoint };
    expect(
      flank.decide(ruleFor(sim, flanker, { plan: "flank", cursor, self: there }, { now: NOW })),
    ).toBeUndefined();
    expect(cursor.flankReached).toBe(1);
    expect(
      flank.decide(ruleFor(sim, flanker, { plan: "flank", cursor }, { now: NOW + 5 })),
    ).toBeUndefined();
  });

  it("gives the swing up for the phase once hurt", () => {
    const cursor = createCursor();
    const own = setUp();
    const self = own.get(flanker);
    if (self === undefined) throw new Error("no flanker");
    self.combatant.health = self.combatant.maxHealth * FLANK_GIVE_UP_FRACTION - 1;
    expect(
      flank.decide(ruleFor(own, flanker, { plan: "flank", cursor }, { now: NOW })),
    ).toBeUndefined();
    expect(cursor.flankAbandoned).toBe(1);
    // Healed, it does not take the swing up again this phase.
    expect(
      flank.decide(ruleFor(sim, flanker, { plan: "flank", cursor }, { now: NOW })),
    ).toBeUndefined();
  });

  it("gives the swing up with a foe at its elbow", () => {
    const cursor = createCursor();
    const self = member(flanker);
    const caught = {
      ...member("foe-front"),
      position: vec2(self.position.x + 50, self.position.y),
      targetId: flanker,
    };
    expect(
      flank.decide(ruleFor(sim, flanker, { plan: "flank", cursor, foes: [caught] }, { now: NOW })),
    ).toBeUndefined();
    expect(cursor.flankAbandoned).toBe(1);
  });

  it("leaves the rest of the team, and every other plan, alone", () => {
    expect(
      flank.decide(ruleFor(sim, pusher, { plan: "flank", roleOf }, { now: NOW })),
    ).toBeUndefined();
    expect(
      flank.decide(ruleFor(sim, flanker, { plan: "push", roleOf }, { now: NOW })),
    ).toBeUndefined();
  });

  it("leaves a flanker alone where neither side has a route", () => {
    const none = (): number => Number.POSITIVE_INFINITY;
    expect(
      flank.decide(ruleFor(sim, flanker, { plan: "flank" }, { now: NOW, routeLength: none })),
    ).toBeUndefined();
  });
});

describe("backlineFoe (#3832)", () => {
  const foes = [member("foe-front"), member("foe-heal")];

  it("takes the healer, though a frontliner is nearer", () => {
    expect(backlineFoe(member("bot"), foes, roleOf)?.id).toBe("foe-heal");
  });

  it("takes the nearest foe with no healer or ranged among them", () => {
    expect(backlineFoe(member("bot"), foes, () => "frontline")?.id).toBe("foe-front");
  });
});
