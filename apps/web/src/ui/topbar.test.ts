import { describe, expect, it } from "vitest";

import type { ShownBar } from "./kit.js";
import { paintStatus, putsMoreAway, type StatusElement } from "./topbar.js";

function status(): StatusElement {
  return { textContent: "", hidden: false, dataset: {} };
}

describe("the top bar's status (#454)", () => {
  it("says nothing and takes no space when idle", () => {
    const element = status();
    paintStatus(element, "", "offline");
    expect(element.textContent).toBe("");
    expect(element.hidden).toBe(true);
  });

  it("shows what is worth a word, in its state's colour", () => {
    const element = status();
    paintStatus(element, "", "offline");
    paintStatus(element, "could not join", "error");
    expect(element.textContent).toBe("could not join");
    expect(element.dataset.state).toBe("error");
    expect(element.hidden).toBe(false);
  });
});

describe("the top bar's ⋯ on a repaint (#1305)", () => {
  const lobby: ShownBar = { place: "VibeWars / Lobby", own: undefined, overlay: false };

  it("stays open when the same screen repaints, as a lobby does when someone readies", () => {
    expect(putsMoreAway(lobby, { ...lobby }, true)).toBe(false);
  });

  it("goes away on another place, or an overlay over the same place", () => {
    expect(putsMoreAway(lobby, { ...lobby, place: "VibeWars / Teams" }, true)).toBe(true);
    expect(putsMoreAway(lobby, { ...lobby, overlay: true }, true)).toBe(true);
    expect(putsMoreAway(lobby, { ...lobby, own: "options" }, true)).toBe(true);
  });

  it("goes away on the first bar, and when nothing is left in it", () => {
    expect(putsMoreAway(undefined, lobby, true)).toBe(true);
    expect(putsMoreAway(lobby, { ...lobby }, false)).toBe(true);
  });
});
