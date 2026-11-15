import { describe, expect, it } from "vitest";

import {
  cameBack,
  DEATH_SECONDS,
  deathAt,
  FLASH_SECONDS,
  flashAt,
  RESPAWN_SECONDS,
  respawnAt,
  slideAt,
} from "./body-reactions.js";

describe("body reactions (#3365)", () => {
  it("flashes from its peak down to nothing at 0.12 s", () => {
    expect(flashAt(0, 0.55)).toBe(0.55);
    expect(flashAt(FLASH_SECONDS / 2, 0.55)).toBeCloseTo(0.275);
    expect(flashAt(FLASH_SECONDS, 0.55)).toBe(0);
  });

  it("slides away from the source and comes back", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: 0 };
    expect(slideAt(0, from, to, 3)).toEqual({ x: 0, y: 0 });
    expect(slideAt(FLASH_SECONDS / 2, from, to, 3).x).toBeCloseTo(3);
    expect(slideAt(FLASH_SECONDS, from, to, 3)).toEqual({ x: 0, y: 0 });
  });

  it("does not slide a body its source stands on", () => {
    const at = { x: 5, y: 5 };
    expect(slideAt(FLASH_SECONDS / 2, at, at, 3)).toEqual({ x: 0, y: 0 });
  });

  it("drains a death fully, fallen and turned to the corpse, by 0.45 s", () => {
    expect(deathAt(0)).toEqual({ fall: 0, drain: 0, corpse: 0 });
    expect(deathAt(DEATH_SECONDS)).toEqual({ fall: 1, drain: 1, corpse: 1 });
  });

  it("fades a respawned body in from 0 to 1, its ring out as it widens", () => {
    expect(respawnAt(0)).toMatchObject({ alpha: 0, ringRadius: 18, ringAlpha: 0.7 });
    expect(respawnAt(RESPAWN_SECONDS)).toMatchObject({ alpha: 1, ringRadius: 34, ringAlpha: 0 });
    expect(respawnAt(RESPAWN_SECONDS).columnAlpha).toBe(0);
  });
});

describe("cameBack (#3365)", () => {
  it("finds a body dead last snapshot and alive in this one", () => {
    const wasDead = new Map([
      ["back", true],
      ["alive", false],
      ["still", true],
    ]);
    const actors = [
      { id: "back", dead: false },
      { id: "alive", dead: false },
      { id: "still", dead: true },
    ];
    expect(cameBack(wasDead, actors)).toEqual(["back"]);
  });

  it("finds none in the first snapshot", () => {
    expect(cameBack(new Map(), [{ id: "new", dead: false }])).toEqual([]);
  });
});
