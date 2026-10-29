import { describe, expect, it } from "vitest";
import { vec2, type FlagField, type RelicField } from "@vibewars/game-core";
import type { PlayerSnapshot } from "@vibewars/game-session";

import {
  FLAG_PICK_RADIUS,
  STAND_RADIUS,
  flagObjectAtPoint,
  renderableFlags,
  renderableRelics,
  renderableStand,
} from "./flag-objects.js";

/** The Guild Battle's flags as the arena draws and picks them (#1225). */

const FIELD: FlagField = {
  stand: vec2(1500, 1000),
  spawns: [
    { team: 0, position: vec2(560, 1000) },
    { team: 1, position: vec2(2440, 1000) },
  ],
};

const carrier = { sessionId: "x", x: 1200, y: 900 } as PlayerSnapshot;

describe("renderableFlags", () => {
  it("draws each flag where it is, in its side's colour from your team", () => {
    const flags = renderableFlags(
      [
        { team: 0, place: { kind: "spawn" } },
        { team: 1, place: { kind: "carried", carrierId: "x" } },
      ],
      FIELD,
      [carrier],
      1,
    );
    expect(flags).toEqual([
      { id: "flag/0", side: "enemy", position: vec2(560, 1000), carried: false, onStand: false },
      { id: "flag/1", side: "ally", position: vec2(1200, 900), carried: true, onStand: false },
    ]);
  });

  it("puts a planted flag on the stand, and one dropped where it lies", () => {
    const flags = renderableFlags(
      [
        { team: 0, place: { kind: "stand" } },
        { team: 1, place: { kind: "ground", position: vec2(10, 20) } },
      ],
      FIELD,
      [],
      0,
    );
    expect(flags.map((flag) => [flag.position, flag.onStand])).toEqual([
      [FIELD.stand, true],
      [vec2(10, 20), false],
    ]);
  });

  it("draws nothing for a carrier not in the snapshot, nor on a map without a stand", () => {
    const carried = [{ team: 1, place: { kind: "carried", carrierId: "gone" } }] as const;
    expect(renderableFlags(carried, FIELD, [], 0)).toEqual([]);
    expect(renderableFlags([{ team: 0, place: { kind: "spawn" } }], undefined, [], 0)).toEqual([]);
  });
});

describe("renderableStand", () => {
  it("is neutral with nobody holding it, and its holder's side once held", () => {
    expect(
      renderableStand({ holder: undefined, heldSeconds: 0 }, FIELD, 0)?.holder,
    ).toBeUndefined();
    expect(renderableStand({ holder: 1, heldSeconds: 4 }, FIELD, 0)?.holder).toBe("enemy");
    expect(renderableStand({ holder: 1, heldSeconds: 4 }, FIELD, 1)?.holder).toBe("ally");
    expect(renderableStand(undefined, undefined, 0)).toBeUndefined();
  });
});

describe("renderableRelics (#1374)", () => {
  const RELICS: RelicField = {
    altar: vec2(1100, 700),
    spawns: [
      { team: 0, position: vec2(110, 700) },
      { team: 1, position: vec2(2090, 700) },
    ],
  };

  it("draws each relic as a flag where it is, and a right click picks a lying one", () => {
    const relics = renderableRelics(
      [
        { team: 0, place: { kind: "ground", position: vec2(600, 400) } },
        { team: 1, place: { kind: "carried", carrierId: "x" } },
      ],
      RELICS,
      [carrier],
      0,
    );
    expect(relics).toEqual([
      { id: "relic/0", side: "ally", position: vec2(600, 400), carried: false, onStand: false },
      { id: "relic/1", side: "enemy", position: vec2(1200, 900), carried: true, onStand: false },
    ]);
    expect(flagObjectAtPoint(relics, undefined, vec2(605, 400))).toBe("relic/0");
    expect(renderableRelics([{ team: 0, place: { kind: "spawn" } }], undefined, [], 0)).toEqual([]);
  });
});

describe("flagObjectAtPoint", () => {
  const stand = renderableStand({ holder: 0, heldSeconds: 0 }, FIELD, 0);

  it("picks a flag lying near the point before the stand", () => {
    const flags = renderableFlags(
      [{ team: 0, place: { kind: "ground", position: vec2(1500, 1020) } }],
      FIELD,
      [],
      0,
    );
    expect(flagObjectAtPoint(flags, stand, vec2(1500, 1020 + FLAG_PICK_RADIUS - 1))).toBe("flag/0");
    expect(flagObjectAtPoint(flags, stand, vec2(1500 - STAND_RADIUS + 1, 1000))).toBe("flag-stand");
    expect(flagObjectAtPoint(flags, stand, vec2(1000, 1000))).toBeUndefined();
  });

  it("never picks a carried flag or one on the stand: the carrier and the stand are", () => {
    const flags = renderableFlags(
      [
        { team: 0, place: { kind: "stand" } },
        { team: 1, place: { kind: "carried", carrierId: "x" } },
      ],
      FIELD,
      [carrier],
      0,
    );
    expect(flagObjectAtPoint(flags, stand, vec2(1200, 900))).toBeUndefined();
    expect(flagObjectAtPoint(flags, stand, FIELD.stand)).toBe("flag-stand");
  });
});
