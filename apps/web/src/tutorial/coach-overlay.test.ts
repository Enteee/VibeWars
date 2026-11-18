import { describe, expect, it } from "vitest";

import { FakeElement } from "../ui/fake-dom.test-support.js";

import {
  bubblePlace,
  cutOut,
  cycleFocus,
  lockLets,
  panelCorner,
  tutorialTargetSelector,
} from "./coach-overlay.js";

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
    expect(panelCorner(undefined, PANEL, VIEWPORT, false)).toBe("end");
    expect(panelCorner({ left: 0, top: 0, width: 80, height: 800 }, PANEL, VIEWPORT, false)).toBe(
      "end",
    );
    expect(
      panelCorner({ left: 1100, top: 650, width: 100, height: 60 }, PANEL, VIEWPORT, false),
    ).toBe("start");
  });

  it("reads the end corner as the left one right to left", () => {
    expect(panelCorner({ left: 0, top: 650, width: 80, height: 100 }, PANEL, VIEWPORT, true)).toBe(
      "start",
    );
    expect(
      panelCorner({ left: 1100, top: 650, width: 100, height: 60 }, PANEL, VIEWPORT, true),
    ).toBe("end");
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
