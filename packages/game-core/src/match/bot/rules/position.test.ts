import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../../../distances.js";
import { distance, vec2, type Vec2 } from "../../../vec2.js";
import { createCursor } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";
import position, { keptSpot } from "./position.js";
import { POSITION_SLACK, foeReach } from "./shared.js";
import { ELEMENTALIST, MONK, WARRIOR, fighter, match, ruleFor } from "./test-support.js";

describe("position (#2545)", () => {
  const FOE = vec2(1200, 400);
  const ranged = (x: number) =>
    match([fighter("e", 0, ELEMENTALIST, vec2(x, 400)), fighter("foe", 1, WARRIOR, FOE)]);

  it("walks a ranged bot in to the edge of its reach, and no nearer", () => {
    const far = ruleFor(ranged(100), "e", { targetId: "foe" });
    expect(far.role).toBe("ranged");
    const spot = position.decide(far)?.moveTo;
    if (spot === undefined) throw new Error("no spot");
    expect(spot.y).toBeCloseTo(400);
    expect(spot.x).toBeGreaterThan(100);
    expect(distance(spot, FOE)).toBeLessThan(RANGE_SPELL * 2);

    // At its spot, and within slack of it, it holds.
    for (const x of [spot.x, spot.x - POSITION_SLACK / 2]) {
      expect(position.decide(ruleFor(ranged(x), "e", { targetId: "foe" }))).toBeUndefined();
    }
    // Nearer than its spot, it does not back off: it stands and fights.
    expect(
      position.decide(ruleFor(ranged(spot.x + 100), "e", { targetId: "foe" })),
    ).toBeUndefined();
  });

  it("does not take a spot it could not see its target from", () => {
    const rule = ruleFor(ranged(100), "e", { targetId: "foe" }, { seesBetween: () => false });
    expect(position.decide(rule)).toBeUndefined();
  });

  it("stands a healer behind its hurt ally, away from the foes", () => {
    const fight = match([
      fighter("m", 0, MONK, vec2(200, 200)),
      fighter("mate", 0, WARRIOR, vec2(700, 400)),
      fighter("whole", 0, WARRIOR, vec2(300, 700)),
      fighter("foe", 1, WARRIOR, vec2(1000, 400)),
    ]);
    const mate = fight.get("mate");
    if (mate !== undefined) mate.combatant.health = mate.combatant.maxHealth * 0.4;
    const rule = ruleFor(fight, "m");
    expect(rule.role).toBe("healer");
    const spot = position.decide(rule)?.moveTo;
    if (spot === undefined) throw new Error("no spot");
    const ward = vec2(700, 400);
    expect(distance(spot, ward)).toBeLessThanOrEqual(0.8 * RANGE_SPELL + 1e-6);
    expect(spot.x).toBeLessThan(ward.x);
    expect(distance(spot, vec2(1000, 400))).toBeGreaterThan(distance(ward, vec2(1000, 400)));
  });

  it("leaves a frontline to close in", () => {
    const fight = match([
      fighter("w", 0, WARRIOR, vec2(100, 400)),
      fighter("foe", 1, WARRIOR, FOE),
    ]);
    expect(position.decide(ruleFor(fight, "w", { targetId: "foe" }))).toBeUndefined();
  });
});

describe("a healer keeps its ward and its spot (#2615)", () => {
  const FOE = vec2(1000, 400);
  /** A healer well behind two warriors that trade hits, `a` at `a` and `b` at `b` of their health. */
  const trading = (a: number, b: number, extra: Parameters<typeof fighter>[] = []) => {
    const fight = match([
      fighter("m", 0, MONK, vec2(100, 400)),
      fighter("a", 0, WARRIOR, vec2(700, 300), { startHealthFraction: a }),
      fighter("b", 0, WARRIOR, vec2(700, 500), { startHealthFraction: b }),
      fighter("foe", 1, WARRIOR, FOE),
      ...extra.map((spec) => fighter(...spec)),
    ]);
    return fight;
  };

  it("keeps its ward while the two trade hits, and switches once the other is clearly worse off", () => {
    const cursor = createCursor();
    position.decide(ruleFor(trading(0.5, 0.45), "m", { cursor }));
    expect(cursor.wardId).toBe("b");
    position.decide(ruleFor(trading(0.45, 0.5), "m", { cursor }));
    expect(cursor.wardId).toBe("b");
    position.decide(ruleFor(trading(0.3, 0.5), "m", { cursor }));
    expect(cursor.wardId).toBe("a");
  });

  it("keeps walking to its spot until a fresh one is clearly elsewhere or a foe stands at it", () => {
    const fresh = () => {
      const cursor = createCursor();
      position.decide(ruleFor(trading(1, 0.5), "m", { cursor }));
      if (cursor.coverSpot === undefined) throw new Error("no spot");
      return { cursor, spot: cursor.coverSpot };
    };
    const { spot } = fresh();
    const kept = (offset: number, sim = trading(1, 0.5)) => {
      const { cursor } = fresh();
      cursor.coverSpot = vec2(spot.x, spot.y + offset);
      return position.decide(ruleFor(sim, "m", { cursor }))?.moveTo;
    };
    expect(kept(50)).toEqual(vec2(spot.x, spot.y + 50));
    expect(kept(100)).toEqual(spot);
  });

  it("leaves its kept spot for the fresh one once a foe stands at its elbow there", () => {
    const sim = trading(1, 0.5);
    const foe = sim.get("foe");
    if (foe === undefined) throw new Error("no foe");
    const kept = vec2(foe.position.x - 90, foe.position.y);
    const fresh = vec2(kept.x - 50, kept.y);
    expect(keptSpot(kept, fresh, [foe])).toBe(fresh);
    expect(keptSpot(vec2(kept.x - 20, kept.y), fresh, [foe])).toEqual(vec2(kept.x - 20, kept.y));
  });
});

describe("position by threat (#2598)", () => {
  const TARGET = vec2(1200, 400);
  /** A ranged bot `e` far west of its target, and a second foe `f2` placed later. */
  const setUp = () => {
    const fight = match([
      fighter("e", 0, ELEMENTALIST, vec2(100, 400)),
      fighter("foe", 1, WARRIOR, TARGET),
      fighter("f2", 1, ELEMENTALIST, vec2(1500, 700)),
    ]);
    const f2 = fight.get("f2");
    if (f2 === undefined) throw new Error("no f2");
    return { fight, f2 };
  };
  /** Its card-1 spot, with `f2` out of the way. */
  const straightSpot = (): Vec2 => {
    const { fight, f2 } = setUp();
    f2.position = vec2(3000, 3000);
    const spot = position.decide(ruleFor(fight, "e", { targetId: "foe" }))?.moveTo;
    if (spot === undefined) throw new Error("no spot");
    return spot;
  };

  it("takes the spot turned away from a second foe whose reach covers the straight one", () => {
    const straight = straightSpot();
    const { fight, f2 } = setUp();
    const reach = ruleFor(fight, "e").foeReach(f2);
    // Just within its reach of the straight spot, south of it: the -20° turn
    // swings nearer, the +20° one north and out of it.
    f2.position = vec2(straight.x, straight.y + reach + POSITION_SLACK / 2);
    const rule = ruleFor(fight, "e", { targetId: "foe" });
    const spot = position.decide(rule)?.moveTo;
    if (spot === undefined) throw new Error("no spot");
    expect(spot.y).toBeLessThan(straight.y - 50);
    expect(distance(spot, TARGET)).toBeCloseTo(distance(straight, TARGET));
    expect(distance(spot, f2.position)).toBeGreaterThan(reach + POSITION_SLACK);
  });

  it("stays on the straight spot when a pillar hides it from that foe", () => {
    const straight = straightSpot();
    const { fight, f2 } = setUp();
    const reach = ruleFor(fight, "e").foeReach(f2);
    f2.position = vec2(straight.x, straight.y + reach + POSITION_SLACK / 2);
    const pillar = (from: Vec2, to: Vec2) =>
      !(from === f2.position && distance(to, straight) < 1e-6);
    const rule = ruleFor(fight, "e", { targetId: "foe" }, { seesBetween: pillar });
    const spot = position.decide(rule)?.moveTo;
    if (spot === undefined) throw new Error("no spot");
    expect(distance(spot, straight)).toBeLessThan(1e-6);
  });

  /**
   * `e` at its spot, its target in reach, `f3` and `f4` on it from the
   * south; a pillar hides each of `hidden` from everything.
   */
  const idle = (hidden: readonly string[] = []) => {
    const straight = straightSpot();
    const fight = match([
      fighter("e", 0, ELEMENTALIST, straight),
      fighter("foe", 1, WARRIOR, TARGET),
      fighter("f3", 1, ELEMENTALIST, vec2(straight.x - 30, straight.y + 300)),
      fighter("f4", 1, ELEMENTALIST, vec2(straight.x + 30, straight.y + 300)),
    ]);
    const behind = hidden.map((id) => fight.get(id)?.position);
    return ruleFor(
      fight,
      "e",
      { targetId: "foe" },
      { seesBetween: (from) => !behind.includes(from) },
    );
  };

  it("at its spot under two foes, moves to one under fewer", () => {
    const rule = idle();
    const spot = position.decide(rule)?.moveTo;
    if (spot === undefined) throw new Error("no move");
    expect(spot.y).toBeLessThan(rule.self.position.y);
  });

  it("at its spot under two foes, stays when no spot is under fewer", () => {
    // Every foe reaches every turn of its spot.
    expect(position.decide({ ...idle(), foeReach: () => 10_000 })).toBeUndefined();
  });

  it("at its spot under one foe, stays", () => {
    expect(position.decide(idle(["f4"]))).toBeUndefined();
  });

  it("moves a healer behind its ward to the side fewer foes cover", () => {
    const fight = match([
      fighter("m", 0, MONK, vec2(100, 400)),
      fighter("mate", 0, WARRIOR, vec2(700, 400)),
      fighter("foe", 1, WARRIOR, vec2(1000, 400)),
      fighter("f2", 1, ELEMENTALIST, vec2(1100, 400)),
    ]);
    const mate = fight.get("mate");
    if (mate !== undefined) mate.combatant.health = mate.combatant.maxHealth * 0.4;
    const open = ruleFor(fight, "m");
    const straight = position.decide(open)?.moveTo;
    if (straight === undefined) throw new Error("no spot");
    const f2 = fight.get("f2");
    if (f2 === undefined) throw new Error("no f2");
    const reach = open.foeReach(f2);
    f2.position = vec2(straight.x, straight.y - reach - POSITION_SLACK / 2);
    const spot = position.decide(ruleFor(fight, "m"))?.moveTo;
    if (spot === undefined) throw new Error("no spot");
    expect(spot.y).toBeGreaterThan(straight.y + 10);
    expect(distance(spot, vec2(700, 400))).toBeCloseTo(distance(straight, vec2(700, 400)));
  });

  it("stands and fights a foe at its elbow, however many cover it", () => {
    const rule = idle();
    const foe = rule.foes.find((other) => other.id === "foe");
    if (foe === undefined) throw new Error("no foe");
    foe.position = vec2(rule.self.position.x + 50, rule.self.position.y);
    foe.targetId = "e";
    expect(position.decide(rule)).toBeUndefined();
  });
});

describe("foeReach (#2598)", () => {
  const fight = match([
    fighter("e", 0, ELEMENTALIST, vec2(100, 400)),
    fighter("w", 1, WARRIOR, vec2(600, 400)),
  ]);
  const warrior = fight.get("w");
  if (warrior === undefined) throw new Error("no w");
  const withWeaponRange = (range: number): Participant => {
    const { equipment } = warrior.combatant;
    return {
      ...warrior,
      combatant: {
        ...warrior.combatant,
        equipment: {
          ...equipment,
          mainHand: { ...equipment.mainHand, weapon: { ...equipment.mainHand.weapon, range } },
        },
      },
    };
  };

  it("is a bow's range over its short skills", () => {
    expect(foeReach(new Map(), withWeaponRange(1000))).toBe(1000);
  });

  it("is a melee foe's weapon's, never under RANGE_MELEE", () => {
    const reach = foeReach(new Map(), warrior);
    expect(reach).toBeGreaterThanOrEqual(RANGE_MELEE);
    expect(reach).toBeLessThan(RANGE_SPELL);
    expect(foeReach(new Map(), withWeaponRange(1))).toBeGreaterThanOrEqual(RANGE_MELEE);
  });

  it("reads a foe's bar once", () => {
    const cache = new Map<string, number>();
    const first = foeReach(cache, warrior);
    expect(foeReach(cache, withWeaponRange(1000))).toBe(first);
  });
});
