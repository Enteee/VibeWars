import { describe, expect, it } from "vitest";

import { distance, vec2, type Vec2 } from "../../../vec2.js";
import { createCursor, type BehaviourCursor } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";
import closeIn, { REPRICE_SECONDS } from "./close-in.js";
import { REGROUP_JOINED, REGROUP_SPREAD, WALK_CANDIDATES } from "./shared.js";
import { body, match, ruleFor } from "./test-support.js";

/** The bot at (100,400) on the ground, layer 1; foes far beyond reach to the east, each on its layer. */
function closeInTo(
  foes: readonly (readonly [Vec2, number])[],
  routeLength: (to: Vec2, layer: number) => number,
  { cursor = createCursor(), now = 0 }: { cursor?: BehaviourCursor; now?: number } = {},
) {
  const sim = match([
    body("bot", 0, vec2(100, 400)),
    ...foes.map(([at], index) => body(`foe-${String(index)}`, 1, at)),
  ]);
  const placed = ruleFor(sim, "bot").foes.map((foe, index): Participant => ({
    ...foe,
    layer: foes[index]?.[1] ?? foe.layer,
  }));
  const base = ruleFor(sim, "bot");
  const view = ruleFor(
    sim,
    "bot",
    { foes: placed, self: { ...base.self, layer: 1 }, cursor },
    { routeLength, now },
  );
  return closeIn.decide(view);
}

describe("close-in: a bot walks to the foe nearest to walk to (#3353)", () => {
  // Straight under the bot is a tunnel, its stairs 800 away and back.
  const tunnel = vec2(1100, 400);
  const deck = vec2(1400, 400);
  const walk = (to: Vec2, layer: number): number =>
    layer === 0 ? 1600 + distance(vec2(100, 400), to) : distance(vec2(100, 400), to);

  it("takes the foe on the deck, further as the crow flies, over the one in the tunnel", () => {
    const intent = closeInTo(
      [
        [tunnel, 0],
        [deck, 1],
      ],
      walk,
    );
    expect(intent?.moveTo).toEqual(deck);
    expect(intent?.moveToLayer).toBe(1);
  });

  it("walks onto the tunnel's layer when the tunnel foe is the only one", () => {
    const intent = closeInTo([[tunnel, 0]], walk);
    expect(intent?.moveTo).toEqual(tunnel);
    expect(intent?.moveToLayer).toBe(0);
  });

  it("skips a foe it cannot walk to", () => {
    const intent = closeInTo(
      [
        [tunnel, 0],
        [deck, 1],
      ],
      (to, layer) => (layer === 1 ? Number.POSITIVE_INFINITY : walk(to, layer)),
    );
    expect(intent?.moveTo).toEqual(tunnel);
  });

  it("goes to the nearest by straight line when it can walk to none", () => {
    const intent = closeInTo(
      [
        [deck, 1],
        [tunnel, 0],
      ],
      () => Number.POSITIVE_INFINITY,
    );
    expect(intent?.moveTo).toEqual(tunnel);
  });

  it(`prices only the ${String(WALK_CANDIDATES)} nearest by straight line`, () => {
    const priced: Vec2[] = [];
    const far = vec2(1500, 700);
    closeInTo(
      [
        [vec2(1100, 400), 0],
        [vec2(1150, 400), 1],
        [vec2(1200, 400), 1],
        [far, 1],
      ],
      (to, layer) => {
        priced.push(to);
        return walk(to, layer);
      },
    );
    expect(priced).toHaveLength(WALK_CANDIDATES);
    expect(priced).not.toContainEqual(far);
  });

  it("prices nothing when every candidate is on the bot's layer", () => {
    let priced = 0;
    const intent = closeInTo(
      [
        [deck, 1],
        [tunnel, 1],
      ],
      (to, layer) => {
        priced += 1;
        return walk(to, layer);
      },
    );
    expect(priced).toBe(0);
    expect(intent?.moveTo).toEqual(tunnel);
  });

  it(`keeps a priced foe ${String(REPRICE_SECONDS)} s, then prices again`, () => {
    const cursor = createCursor();
    const foes = [
      [tunnel, 0],
      [deck, 1],
    ] as const;
    let priced = 0;
    const tunnelCheap = (to: Vec2, layer: number): number => {
      priced += 1;
      return layer === 0 ? 0 : walk(to, layer);
    };
    expect(closeInTo(foes, walk, { cursor, now: 10 })?.moveTo).toEqual(deck);
    expect(closeInTo(foes, tunnelCheap, { cursor, now: 10 + REPRICE_SECONDS / 2 })?.moveTo).toEqual(
      deck,
    );
    expect(priced).toBe(0);
    expect(closeInTo(foes, tunnelCheap, { cursor, now: 10 + REPRICE_SECONDS })?.moveTo).toEqual(
      tunnel,
    );
    expect(priced).toBe(2);
  });
});

describe("close-in under a hold plan (#3831)", () => {
  // Team 0 starts round (100,500), team 1 round (1100,500): the hold
  // point is 35% of the way, at (450,500).
  const centre = vec2(450, 500);
  const sim = match([
    body("bot", 0, vec2(100, 400)),
    body("mate", 0, vec2(100, 600)),
    body("foe-a", 1, vec2(1100, 400)),
    body("foe-b", 1, vec2(1100, 600)),
  ]);

  it("walks to its spot by the hold point, on its spawn's layer", () => {
    const intent = closeIn.decide(ruleFor(sim, "bot", { plan: "hold" }));
    expect(intent?.moveToLayer).toBe(0);
    expect(distance(intent?.moveTo ?? vec2(0, 0), centre)).toBeLessThanOrEqual(
      REGROUP_SPREAD / 4 + 1e-9,
    );
  });

  it("puts each bot of the team on its own spot", () => {
    const one = closeIn.decide(ruleFor(sim, "bot", { plan: "hold" }))?.moveTo;
    const other = closeIn.decide(ruleFor(sim, "mate", { plan: "hold" }))?.moveTo;
    expect(one).not.toEqual(other);
  });

  it("stands once within REGROUP_JOINED of the hold point", () => {
    const base = ruleFor(sim, "bot");
    const near = { ...base.self, position: vec2(450 - REGROUP_JOINED + 1, 500) };
    const intent = closeIn.decide(ruleFor(sim, "bot", { plan: "hold", self: near }));
    expect(intent).toBeDefined();
    expect(intent?.moveTo).toBeUndefined();
  });

  it("walks at the foes as ever under push", () => {
    expect(closeIn.decide(ruleFor(sim, "bot", { plan: "push" }))?.moveTo).toEqual(vec2(1100, 400));
  });

  it("pushes on a team of one", () => {
    const alone = match([body("bot", 0, vec2(100, 400)), body("foe", 1, vec2(1100, 400))]);
    expect(closeIn.decide(ruleFor(alone, "bot", { plan: "hold" }))?.moveTo).toEqual(
      vec2(1100, 400),
    );
  });

  it("pushes where it has no route to the hold point", () => {
    const walk = (to: Vec2): number =>
      distance(to, centre) <= REGROUP_SPREAD ? Number.POSITIVE_INFINITY : 1;
    const intent = closeIn.decide(ruleFor(sim, "bot", { plan: "hold" }, { routeLength: walk }));
    expect(intent?.moveTo).toEqual(vec2(1100, 400));
  });
});
