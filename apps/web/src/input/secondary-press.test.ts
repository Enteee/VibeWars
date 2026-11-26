import { describe, expect, it } from "vitest";

import {
  CLICK_MAX_MS,
  DRAG_THRESHOLD_PX,
  createSecondaryPress,
  type SecondaryOutcome,
} from "./secondary-press.js";

const at = (x: number, y: number) => ({ x, y });

describe("createSecondaryPress (#442)", () => {
  it("is a click when released within 300 ms and 7 px, at the press point", () => {
    const press = createSecondaryPress();
    press.down(at(100, 100), 0);
    expect(press.move(at(104, 105))).toEqual({ kind: "none" });
    expect(press.up(CLICK_MAX_MS)).toEqual({ kind: "click", at: at(100, 100) });
  });

  it("is a pan past 7 px: start, every move, end, and never a click", () => {
    const press = createSecondaryPress();
    press.down(at(100, 100), 0);
    const outcomes: SecondaryOutcome[] = [
      press.move(at(100 + DRAG_THRESHOLD_PX + 1, 100)),
      press.move(at(120, 110)),
      press.move(at(115, 110)),
      press.up(50),
    ];
    expect(outcomes.map((outcome) => outcome.kind)).toEqual([
      "pan-start",
      "pan-move",
      "pan-move",
      "pan-end",
    ]);
    expect(outcomes[1]).toEqual({ kind: "pan-move", delta: at(12, 10) });
    expect(outcomes[2]).toEqual({ kind: "pan-move", delta: at(-5, 0) });
  });

  it("starts the pan with the whole way from the press, so the view does not jump", () => {
    const press = createSecondaryPress();
    press.down(at(100, 100), 0);
    expect(press.move(at(103, 104))).toEqual({ kind: "none" });
    expect(press.move(at(106, 108))).toEqual({ kind: "pan-start", delta: at(6, 8) });
  });

  it("is nothing when held 500 ms without moving", () => {
    const press = createSecondaryPress();
    press.down(at(100, 100), 0);
    expect(press.up(500)).toEqual({ kind: "none" });
  });

  it("is nothing for a move or a release with no press", () => {
    const press = createSecondaryPress();
    expect(press.move(at(500, 500))).toEqual({ kind: "none" });
    expect(press.up(0)).toEqual({ kind: "none" });
  });
});
