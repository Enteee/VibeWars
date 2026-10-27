import { describe, expect, it } from "vitest";

import { paintStatus, type StatusElement } from "./topbar.js";

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
