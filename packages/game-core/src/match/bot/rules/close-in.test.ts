import { describe, expect, it } from "vitest";

import { distance, vec2, type Vec2 } from "../../../vec2.js";
import { createCursor, type BehaviourCursor } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";
import closeIn, { REPRICE_SECONDS } from "./close-in.js";
import { WALK_CANDIDATES } from "./shared.js";
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
