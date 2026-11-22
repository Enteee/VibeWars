import { describe, expect, it } from "vitest";

import { distance, vec2, type Vec2 } from "../../../vec2.js";
import { createCursor, type BehaviourCursor } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";
import { flankParty, flankWaypoint, type TeamPlan } from "../plan.js";
import planMove, { HOLD_LEASH, PLAN_ELBOW } from "./plan-move.js";
import { body, contextFor, match, ruleFor } from "./test-support.js";

describe("plan-move (#3832)", () => {
  // Team 0 spawns round (100,500), team 1 round (950,500): the hold
  // point is 35% of the way across, near (397,500).
  const sim = match([
    body("bot", 0, vec2(100, 400)),
    body("mate", 0, vec2(100, 600)),
    body("foe-a", 1, vec2(950, 400)),
    body("foe-b", 1, vec2(950, 600)),
  ]);
  const NOW = 50;
  const member = (id: string): Participant => {
    const found = sim.get(id);
    if (found === undefined) throw new Error(`no ${id}`);
    return found;
  };
  const flanker =
    ["bot", "mate"].find((id) => flankParty(contextFor(sim, id, { now: NOW }), member(id), 1)) ??
    "bot";
  const waypoint =
    flankWaypoint(contextFor(sim, flanker, { now: NOW }), member(flanker), 1)?.point ?? vec2(0, 0);

  /** `id` at `at` with `health` of its health, under `plan`, foe-a at `foeAt`. */
  function moveOf(
    id: string,
    plan: TeamPlan,
    {
      at,
      foeAt = vec2(950, 400),
      health = 1,
      cursor = createCursor(),
    }: { at?: Vec2; foeAt?: Vec2; health?: number; cursor?: BehaviourCursor } = {},
  ) {
    const base = ruleFor(sim, id, {}, { now: NOW });
    const self = {
      ...base.self,
      position: at ?? base.self.position,
      combatant: { ...base.self.combatant, health: base.self.combatant.health * health },
    };
    const foes = base.foes.map((foe) => (foe.id === "foe-a" ? { ...foe, position: foeAt } : foe));
    return planMove.decide(ruleFor(sim, id, { plan, self, foes, cursor }, { now: NOW }));
  }

  /** `units` east of `id`'s spawn. */
  const eastOf = (id: string, units: number): Vec2 => {
    const at = member(id).position;
    return vec2(at.x + units, at.y);
  };

  it("walks a flanker to its waypoint past a foe in spell range", () => {
    expect(moveOf(flanker, "flank", { foeAt: eastOf(flanker, 300) })?.moveTo).toEqual(waypoint);
  });

  it("gives the swing up with a foe at its elbow", () => {
    expect(moveOf(flanker, "flank", { foeAt: eastOf(flanker, PLAN_ELBOW - 20) })).toBeUndefined();
  });

  it("gives the swing up for the phase once hurt", () => {
    const cursor = createCursor();
    expect(moveOf(flanker, "flank", { health: 0.4, cursor })).toBeUndefined();
    expect(moveOf(flanker, "flank", { health: 0.6, cursor })).toBeUndefined();
    expect(moveOf(flanker, "flank", { health: 0.6 })?.moveTo).toEqual(waypoint);
  });

  it("stops at the waypoint, and the swing is done for the phase", () => {
    const cursor = createCursor();
    expect(moveOf(flanker, "flank", { at: waypoint, cursor })).toBeUndefined();
    expect(cursor.flankReached).toBe(1);
    expect(moveOf(flanker, "flank", { cursor })).toBeUndefined();
  });

  it("leaves a bot outside the flank party, and one under push, to the fight", () => {
    const pusher = flanker === "bot" ? "mate" : "bot";
    expect(moveOf(pusher, "flank")).toBeUndefined();
    expect(moveOf(flanker, "push")).toBeUndefined();
  });

  it("walks a holder back from past its leash, past a foe in spell range", () => {
    const at = vec2(397 + 500, 500);
    const intent = moveOf("bot", "hold", { at, foeAt: vec2(at.x + 300, at.y) });
    expect(intent?.moveTo).toBeDefined();
    expect(distance(intent?.moveTo ?? at, vec2(397, 500))).toBeLessThan(HOLD_LEASH);
  });

  it("lets a holder within its leash fight from there", () => {
    expect(moveOf("bot", "hold", { at: vec2(397 + 200, 500) })).toBeUndefined();
  });
});
