import { describe, expect, it } from "vitest";

import { createScreenNotices } from "./screen-notices.js";

describe("screen notices (#1807)", () => {
  it("keeps a notice across redraws of the entry it was drawn on", () => {
    const notices = createScreenNotices(["Saved relay was unreadable and was removed."]);
    expect(notices.draw("random-arena")).toEqual(["Saved relay was unreadable and was removed."]);
    // The player's own lobby reports in and redraws the same screen.
    expect(notices.draw("random-arena")).toEqual(["Saved relay was unreadable and was removed."]);
  });

  it("drops a notice the first time another entry is drawn, for good", () => {
    const notices = createScreenNotices(["framed"]);
    notices.draw("random-arena");
    expect(notices.draw("team-builder")).toEqual([]);
    expect(notices.draw("random-arena")).toEqual([]);
  });

  it("drops a notice once the player leaves the screen, even back to the same entry", () => {
    const notices = createScreenNotices(["framed"]);
    notices.draw("random-arena");
    notices.leave();
    expect(notices.draw("random-arena")).toEqual([]);
  });

  it("shows a notice added on a screen at its next draw, after the kept ones, in order", () => {
    const notices = createScreenNotices(["first", "second"]);
    notices.draw("random-arena");
    notices.add("music stopped");
    expect(notices.draw("random-arena")).toEqual(["first", "second", "music stopped"]);
  });

  it("holds a notice added off the rail for the next screen's draw", () => {
    const notices = createScreenNotices([]);
    notices.leave();
    notices.add("music stopped");
    notices.leave();
    expect(notices.draw("characters")).toEqual(["music stopped"]);
  });
});
