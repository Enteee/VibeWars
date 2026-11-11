import { describe, expect, it } from "vitest";

import type { Polygon } from "../geometry.js";
import { vec2, type Vec2 } from "../vec2.js";
import { body, BOUNDS, DT, RULESET } from "./bot/rules/test-support.js";
import { UPHILL } from "./layer-rules.js";
import { MatchSimulation, type MatchSimulationOptions, type Participant } from "./simulation.js";
import { SWITCH_COOLDOWN_SECONDS, switchTargetId, type SwitchField } from "./switches.js";
import {
  initialTeleports,
  stepTeleport,
  teleportTaken,
  TELEPORT_COOLDOWN_SECONDS,
  type TeleportField,
} from "./teleports.js";

const square = (centre: Vec2, half: number): Polygon => [
  vec2(centre.x - half, centre.y - half),
  vec2(centre.x + half, centre.y - half),
  vec2(centre.x + half, centre.y + half),
  vec2(centre.x - half, centre.y + half),
];

/** West to east, and east back to west. */
const OUT: TeleportField = {
  id: "out",
  from: { layer: 0, area: square(vec2(300, 400), 30) },
  to: { layer: 0, position: vec2(1200, 400) },
  enabled: true,
};
const BACK: TeleportField = {
  id: "back",
  from: { layer: 0, area: square(vec2(1300, 400), 30) },
  to: { layer: 0, position: vec2(150, 400) },
  enabled: true,
};
const LEVER_AT = vec2(200, 700);
const LEVER: SwitchField = {
  id: "lever",
  layer: 0,
  position: LEVER_AT,
  gates: [],
  teleports: [0],
  decks: [],
};

describe("teleportTaken (#3030)", () => {
  const [out] = initialTeleports([OUT]);
  if (out === undefined) throw new Error("no teleport");

  it("takes a body in its entry, on its layer, once its cooldown has passed", () => {
    expect(teleportTaken([out], vec2(310, 390), 0, 0, 1)).toBe(out);
    expect(teleportTaken([out], vec2(310, 390), 1, 0, 1)).toBeUndefined();
    expect(teleportTaken([out], vec2(400, 400), 0, 0, 1)).toBeUndefined();
    expect(teleportTaken([out], vec2(310, 390), 0, 1 + DT, 1)).toBeUndefined();
  });

  it("starts as its map says, a switch turns it, and an off one takes nobody", () => {
    const [off] = initialTeleports([{ ...OUT, enabled: false }]);
    if (off === undefined) throw new Error("no teleport");
    expect(off.on).toBe(false);
    expect(teleportTaken([off], vec2(300, 400), 0, 0, 1)).toBeUndefined();
    expect(stepTeleport(off, false)).toBe(off);
    expect(stepTeleport(off, true).on).toBe(true);
    expect(stepTeleport(stepTeleport(off, true), true).on).toBe(false);
  });
});

describe("teleports in a match (#3030)", () => {
  const foe = body("foe", 1, vec2(1500, 100));

  function arena(
    participants: Parameters<typeof body>[],
    options: Partial<MatchSimulationOptions> = {},
  ): MatchSimulation {
    return new MatchSimulation({
      seed: "teleports",
      ruleset: RULESET,
      bounds: BOUNDS,
      participants: [...participants.map((args) => body(...args)), foe],
      teleports: [OUT, BACK],
      ...options,
    });
  }

  function get(sim: MatchSimulation, id: string): Participant {
    const found = sim.get(id);
    if (found === undefined) throw new Error(`no ${id}`);
    return found;
  }

  /** Steps until `id` has teleported, or `seconds` run out; the seconds it took. */
  function untilPorted(sim: MatchSimulation, id: string, seconds: number): number {
    const before = get(sim, id).teleportReadyAt;
    let taken = 0;
    while (taken < seconds && get(sim, id).teleportReadyAt === before) {
      sim.step(DT);
      taken += DT;
    }
    return taken;
  }

  it("moves a body that walks into its entry to its exit on the same tick, its walk over", () => {
    const sim = arena([["walker", 0, vec2(200, 400)]]);
    sim.walkTo("walker", vec2(320, 400));
    untilPorted(sim, "walker", 3);
    const walker = get(sim, "walker");
    expect(walker.position).toEqual(vec2(1200, 400));
    expect(walker.layer).toBe(0);
    expect(walker.walkGoal).toBeUndefined();
    expect(walker.teleportReadyAt).toBeCloseTo(sim.elapsedSeconds + TELEPORT_COOLDOWN_SECONDS);
  });

  it("takes no teleport for its cooldown, and the one it stands in once it has passed", () => {
    const sim = arena([["walker", 0, vec2(270, 400)]]);
    sim.step(DT);
    expect(get(sim, "walker").position).toEqual(vec2(1200, 400));
    const ported = sim.elapsedSeconds;
    sim.walkTo("walker", vec2(1300, 400));
    const waited = untilPorted(sim, "walker", TELEPORT_COOLDOWN_SECONDS + 1);
    expect(get(sim, "walker").position).toEqual(vec2(150, 400));
    expect(ported + waited).toBeCloseTo(ported + TELEPORT_COOLDOWN_SECONDS, 1);
  });

  it("takes two that enter on one tick, both, the second pushed clear of the first", () => {
    const sim = arena([
      ["one", 0, vec2(290, 400)],
      ["two", 0, vec2(310, 400)],
    ]);
    sim.step(DT);
    const one = get(sim, "one").position;
    const two = get(sim, "two").position;
    expect(one.x).toBeGreaterThan(1100);
    expect(two.x).toBeGreaterThan(1100);
    expect(one).not.toEqual(two);
  });

  it("leaves the dead where they fell", () => {
    const sim = arena([["corpse", 0, vec2(300, 400)]]);
    const corpse = get(sim, "corpse");
    corpse.combatant.dead = true;
    corpse.respawnInSeconds = 60;
    sim.step(DT);
    expect(get(sim, "corpse").position).toEqual(vec2(300, 400));
  });

  it("is turned on and off by a switch that names it; off, it takes nobody", () => {
    const sim = arena(
      [
        ["stander", 0, vec2(300, 400)],
        ["puller", 0, vec2(200, 650)],
      ],
      { teleports: [{ ...OUT, enabled: false }, BACK], switches: [LEVER] },
    );
    sim.step(DT);
    expect(sim.teleports.map(({ on }) => on)).toEqual([false, true]);
    expect(get(sim, "stander").position).toEqual(vec2(300, 400));

    sim.requestAttack("puller", switchTargetId("lever"));
    untilPorted(sim, "stander", 2);
    expect(sim.teleports[0]?.on).toBe(true);
    expect(get(sim, "stander").position).toEqual(vec2(1200, 400));

    for (let t = 0; t < SWITCH_COOLDOWN_SECONDS; t += DT) {
      sim.step(DT);
    }
    sim.requestAttack("puller", switchTargetId("lever"));
    for (let t = 0; t < 1 && sim.teleports[0]?.on === true; t += DT) {
      sim.step(DT);
    }
    expect(sim.teleports[0]?.on).toBe(false);
  });

  it("is a way a walk is routed through when it is on, past a wall it would walk round", () => {
    // The wall's one gap is at its foot, 400 down and back.
    const divide = [vec2(796, -10), vec2(804, -10), vec2(804, 760), vec2(796, 760)];
    const sim = arena([["walker", 0, vec2(150, 300)]], {
      teleports: [OUT],
      walls: divide.map((a, at) => ({ a, b: divide[(at + 1) % divide.length] ?? a })),
    });
    sim.walkTo("walker", vec2(1300, 300));
    expect(untilPorted(sim, "walker", 3)).toBeLessThan(3);
    expect(get(sim, "walker").position).toEqual(vec2(1200, 400));
  });

  it("takes a body onto its exit's layer", () => {
    const deck: Polygon = square(vec2(800, 400), 100);
    const sim = arena([["walker", 0, vec2(300, 400)]], {
      walls: [],
      layers: {
        count: 2,
        ground: 0,
        pits: [],
        walls: [[], []],
        decks: [{ layer: 1, footprint: deck }],
        transitions: [
          { from: 0, to: 1, area: square(vec2(650, 400), 50), uphill: UPHILL.e, pace: 1 },
        ],
        outline: undefined,
        deepWater: [[], []],
        dropOffs: [],
      },
      teleports: [{ ...OUT, to: { layer: 1, position: vec2(800, 400) } }],
    });
    sim.step(DT);
    expect(get(sim, "walker")).toMatchObject({ position: vec2(800, 400), layer: 1 });
  });
});
