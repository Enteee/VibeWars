import { describe, expect, it } from "vitest";

import { FakeElement } from "../ui/fake-dom.test-support.js";

import {
  bubblePlace,
  cutOut,
  cycleFocus,
  lockLets,
  panelSpot,
  tutorialTargetSelector,
} from "./coach-overlay.js";
import type { PanelSpot } from "./coach-overlay.js";

const VIEWPORT = { width: 1280, height: 800 };
const PANEL = { width: 320, height: 200 };

/** A menu with a rail of two entries, the target, and the coach's panel. */
function menu(): {
  menu: FakeElement;
  target: FakeElement;
  other: FakeElement;
  panel: FakeElement;
} {
  const root = new FakeElement();
  const rail = root.appendChild(new FakeElement());
  const target = rail.appendChild(new FakeElement());
  const other = rail.appendChild(new FakeElement());
  const panel = root.appendChild(new FakeElement());
  return { menu: root, target, other, panel };
}

describe("the coach's lock", () => {
  it("swallows a click outside the cut-out, so it never reaches the menu", () => {
    const { other, target, panel } = menu();
    expect(lockLets(other, [target, panel])).toBe(false);
  });

  it("lets a click on the target through, and one inside it", () => {
    const { target, panel } = menu();
    const inside = target.appendChild(new FakeElement());
    expect(lockLets(target, [target, panel])).toBe(true);
    expect(lockLets(inside, [target, panel])).toBe(true);
  });

  it("always lets the panel through, Skip with it, even with no target drawn yet", () => {
    const { panel } = menu();
    const skip = panel.appendChild(new FakeElement());
    expect(lockLets(skip, [panel])).toBe(true);
  });

  it("swallows an event at nothing", () => {
    const { target } = menu();
    expect(lockLets(null, [target])).toBe(false);
  });
});

describe("the coach's focus trap", () => {
  it("cycles Tab round the open controls and never out of them", () => {
    const list = ["target", "gotIt", "skip"];
    expect(cycleFocus(list, "target", false)).toBe("gotIt");
    expect(cycleFocus(list, "skip", false)).toBe("target");
    expect(cycleFocus(list, "target", true)).toBe("skip");
  });

  it("brings a focus from outside back in, first or last", () => {
    const list = ["target", "skip"];
    expect(cycleFocus(list, "menu", false)).toBe("target");
    expect(cycleFocus(list, undefined, true)).toBe("skip");
    expect(cycleFocus([], "menu", false)).toBeUndefined();
  });
});

describe("the coach's layout", () => {
  it("pads the cut-out 8 px round its target", () => {
    expect(cutOut({ left: 10, top: 20, width: 100, height: 40 })).toEqual({
      left: 2,
      top: 12,
      width: 116,
      height: 56,
    });
  });

  it("puts the panel in the bottom end corner, and in the other when the cut-out is there", () => {
    const bottom = (corner: "end" | "start"): PanelSpot => ({ edge: "bottom", corner });
    expect(panelSpot([], PANEL, VIEWPORT, false)).toEqual(bottom("end"));
    expect(
      panelSpot([{ left: 0, top: 0, width: 80, height: 800 }], PANEL, VIEWPORT, false),
    ).toEqual(bottom("end"));
    expect(
      panelSpot([{ left: 1100, top: 650, width: 100, height: 60 }], PANEL, VIEWPORT, false),
    ).toEqual(bottom("start"));
  });

  it("reads the end corner as the left one right to left", () => {
    expect(
      panelSpot([{ left: 0, top: 650, width: 80, height: 100 }], PANEL, VIEWPORT, true),
    ).toEqual({ edge: "bottom", corner: "start" });
    expect(
      panelSpot([{ left: 1100, top: 650, width: 100, height: 60 }], PANEL, VIEWPORT, true),
    ).toEqual({ edge: "bottom", corner: "end" });
  });

  it("moves the panel up when the cut-out and bubble fill both bottom corners", () => {
    const hole = { left: 0, top: 650, width: 80, height: 100 };
    const bubble = { left: 1000, top: 650, width: 280, height: 120 };
    expect(panelSpot([hole, bubble], PANEL, VIEWPORT, false)).toEqual({
      edge: "top",
      corner: "end",
    });
  });

  it("docks a full-width panel to the top edge when the bubble is at the bottom (800x600)", () => {
    const viewport = { width: 800, height: 600 };
    const docked = { width: 800, height: 103 };
    const hole = { left: 0, top: 120, width: 200, height: 60 };
    const bubble = { left: 216, top: 520, width: 288, height: 64 };
    expect(panelSpot([], docked, viewport, false).edge).toBe("bottom");
    expect(panelSpot([hole, bubble], docked, viewport, false).edge).toBe("top");
    expect(
      panelSpot([{ left: 0, top: 540, width: 200, height: 50 }], docked, viewport, false).edge,
    ).toBe("top");
  });

  it("leaves the cut-out clear when nothing clears both", () => {
    const viewport = { width: 800, height: 600 };
    const docked = { width: 800, height: 103 };
    const hole = { left: 0, top: 540, width: 200, height: 50 };
    const bubble = { left: 0, top: 0, width: 800, height: 600 };
    expect(panelSpot([hole, bubble], docked, viewport, false).edge).toBe("top");
  });

  it("keeps the bubble clear when the cut-out is as tall as the window", () => {
    const viewport = { width: 800, height: 600 };
    const docked = { width: 800, height: 103 };
    const rail = { left: 0, top: 0, width: 200, height: 600 };
    const bubble = { left: 216, top: 16, width: 288, height: 64 };
    expect(panelSpot([rail, bubble], docked, viewport, false).edge).toBe("bottom");
    expect(panelSpot([rail, { ...bubble, top: 520 }], docked, viewport, false).edge).toBe("top");
  });

  it("sets the bubble beside the cut-out, before it where there is no room after", () => {
    const bubble = { width: 288, height: 120 };
    expect(bubblePlace({ left: 0, top: 100, width: 92, height: 400 }, bubble, VIEWPORT)).toEqual({
      left: 104,
      top: 100,
    });
    expect(bubblePlace({ left: 1100, top: 100, width: 150, height: 40 }, bubble, VIEWPORT)).toEqual(
      { left: 800, top: 100 },
    );
  });

  it("keeps the bubble on screen, below a cut-out as wide as the window", () => {
    const at = bubblePlace(
      { left: 0, top: 700, width: 1280, height: 60 },
      { width: 288, height: 120 },
      VIEWPORT,
    );
    expect(at).toEqual({ left: 16, top: 664 });
  });

  it("finds a target by its data-tutorial id, never by class", () => {
    expect(tutorialTargetSelector("rail-teams")).toBe('[data-tutorial="rail-teams"]');
  });
});
