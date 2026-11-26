import { describe, expect, it } from "vitest";

import { createScreenTurns } from "./screen-turns.js";

describe("screen turns (#1513)", () => {
  it("is current until the next screen change takes the screen", () => {
    const turns = createScreenTurns();
    const menu = turns.take();
    expect(menu()).toBe(true);
    // Host clicked while the menu awaited its roster: the menu's late draw is dropped.
    const lobby = turns.take();
    expect(menu()).toBe(false);
    expect(lobby()).toBe(true);
  });

  it("keeps a later menu's draw when two overlap: the newest wins", () => {
    const turns = createScreenTurns();
    const first = turns.take();
    const second = turns.take();
    expect([first(), second()]).toEqual([false, true]);
  });

  it("keeps each set of turns apart", () => {
    const one = createScreenTurns();
    const other = createScreenTurns();
    const turn = one.take();
    other.take();
    expect(turn()).toBe(true);
  });
});
