import { describe, expect, it } from "vitest";

import { add, distance, scale, sub, vec2, type Vec2 } from "../../../vec2.js";
import { createCursor, type BehaviourCursor } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";
import { flankParty } from "../plan.js";
import type { BotRole } from "../role.js";
import closeIn, { REPRICE_SECONDS } from "./close-in.js";
import { POSITION_SLACK, REGROUP_SPREAD, WALK_CANDIDATES } from "./shared.js";
import { body, contextFor, match, ruleFor } from "./test-support.js";

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

  it("spreads a team's spots evenly round the hold point", () => {
    const four = match([
      body("a", 0, vec2(100, 350)),
      body("b", 0, vec2(100, 450)),
      body("c", 0, vec2(100, 550)),
      body("d", 0, vec2(100, 650)),
      body("foe", 1, vec2(1100, 500)),
    ]);
    const spots = ["a", "b", "c", "d"].map(
      (id) => closeIn.decide(ruleFor(four, id, { plan: "hold" }))?.moveTo ?? vec2(0, 0),
    );
    // Four spots a quarter turn apart on a circle of REGROUP_SPREAD / 4.
    const apart = (REGROUP_SPREAD / 4) * Math.SQRT2;
    for (const [i, one] of spots.entries()) {
      for (const other of spots.slice(i + 1)) {
        expect(distance(one, other)).toBeGreaterThanOrEqual(apart - 1e-6);
      }
    }
  });

  it("stands once at its spot, give or take POSITION_SLACK", () => {
    const spot = closeIn.decide(ruleFor(sim, "bot", { plan: "hold" }))?.moveTo ?? vec2(0, 0);
    const base = ruleFor(sim, "bot");
    const there = { ...base.self, position: add(spot, vec2(POSITION_SLACK - 1, 0)) };
    const intent = closeIn.decide(ruleFor(sim, "bot", { plan: "hold", self: there }));
    expect(intent).toBeDefined();
    expect(intent?.moveTo).toBeUndefined();
  });

  it("brings mates from one spawn to rest on their own spots, apart", () => {
    // Each walks straight at what it is sent to, 10 a step, until it stands.
    const rest = (id: string): Vec2 => {
      const cursor = createCursor();
      let at = ruleFor(sim, id).self.position;
      for (let step = 0; step < 200; step += 1) {
        const base = ruleFor(sim, id, { plan: "hold", cursor });
        const to = closeIn.decide({ ...base, self: { ...base.self, position: at } })?.moveTo;
        if (to === undefined) return at;
        const left = distance(at, to);
        at = left <= 10 ? to : add(at, scale(sub(to, at), 10 / left));
      }
      throw new Error(`${id} never stood`);
    };
    const spot = (id: string): Vec2 =>
      closeIn.decide(ruleFor(sim, id, { plan: "hold" }))?.moveTo ?? vec2(0, 0);
    const [one, other] = [rest("bot"), rest("mate")];
    expect(distance(one, spot("bot"))).toBeLessThanOrEqual(POSITION_SLACK);
    expect(distance(other, spot("mate"))).toBeLessThanOrEqual(POSITION_SLACK);
    expect(distance(one, other)).toBeGreaterThanOrEqual(REGROUP_SPREAD / 2 - 2 * POSITION_SLACK);
  });

  it("walks on near the hold point until it reaches its own spot", () => {
    const spot = closeIn.decide(ruleFor(sim, "bot", { plan: "hold" }))?.moveTo ?? vec2(0, 0);
    // Across the hold point from its spot: by the centre, far from the spot.
    const across = sub(scale(centre, 2), spot);
    const base = ruleFor(sim, "bot");
    const intent = closeIn.decide(
      ruleFor(sim, "bot", { plan: "hold", self: { ...base.self, position: across } }),
    );
    expect(intent?.moveTo).toEqual(spot);
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

  it("pushes on a team with a human, whom holding would leave alone (#3833)", () => {
    const bot = (id: string): boolean => id !== "mate";
    const intent = closeIn.decide(ruleFor(sim, "bot", { plan: "hold" }, { isBot: bot }));
    expect(intent?.moveTo).toEqual(vec2(1100, 400));
  });

  it("pushes where it has no route to the hold point", () => {
    const walk = (to: Vec2): number =>
      distance(to, centre) <= REGROUP_SPREAD ? Number.POSITIVE_INFINITY : 1;
    const intent = closeIn.decide(ruleFor(sim, "bot", { plan: "hold" }, { routeLength: walk }));
    expect(intent?.moveTo).toEqual(vec2(1100, 400));
  });
  it("tries the hold point again in the next phase, not once for the match", () => {
    const cursor = createCursor();
    const none = (): number => Number.POSITIVE_INFINITY;
    const blocked = ruleFor(sim, "bot", { plan: "hold", cursor }, { routeLength: none, now: 50 });
    expect(closeIn.decide(blocked)?.moveTo).toEqual(vec2(1100, 400));
    // The same phase keeps the miss; the next places it again.
    const same = ruleFor(sim, "bot", { plan: "hold", cursor }, { now: 70 });
    expect(closeIn.decide(same)?.moveTo).toEqual(vec2(1100, 400));
    const next = ruleFor(sim, "bot", { plan: "hold", cursor }, { now: 90 });
    expect(distance(closeIn.decide(next)?.moveTo ?? vec2(0, 0), centre)).toBeLessThanOrEqual(
      REGROUP_SPREAD / 4 + 1e-9,
    );
  });
});

describe("close-in under a flank plan (#3832)", () => {
  // A team of two flanks with one of them; foe-front stands nearer the
  // waypoint than foe-heal, the healer.
  const sim = match([
    body("bot", 0, vec2(100, 400)),
    body("mate", 0, vec2(100, 600)),
    body("foe-front", 1, vec2(800, 500)),
    body("foe-heal", 1, vec2(1100, 500)),
  ]);
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

  it("pushes a flanker until the flank rule has it round", () => {
    const flanked = closeIn.decide(ruleFor(sim, flanker, { plan: "flank", roleOf }, { now: NOW }));
    expect(flanked?.moveTo).toEqual(vec2(800, 500));
  });

  it("makes for the foe healer once round, though a frontliner is nearer", () => {
    const cursor = createCursor();
    cursor.flankReached = 1;
    const on = { ...member(flanker), position: vec2(780, 500) };
    const later = closeIn.decide(
      ruleFor(sim, flanker, { plan: "flank", roleOf, cursor, self: on }, { now: NOW + 5 }),
    );
    expect(later?.moveTo).toEqual(vec2(1100, 500));
  });

  it("walks the rest of the team at the foes as under push", () => {
    const flanked = closeIn.decide(ruleFor(sim, pusher, { plan: "flank", roleOf }, { now: NOW }));
    const pushed = closeIn.decide(ruleFor(sim, pusher, { plan: "push", roleOf }, { now: NOW }));
    expect(flanked).toEqual(pushed);
    expect(flanked?.moveTo).toEqual(vec2(800, 500));
  });
});
