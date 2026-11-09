import { describe, expect, it } from "vitest";

import cs from "./cs/describe.js";
import pl from "./pl/describe.js";

describe("case changes around non-ASCII letters", () => {
  it("declines a word that ends in an accented letter", () => {
    expect(cs.from({ text: "poškození", from: "ostatní spojenci" })).toBe(
      "poškození od ostatních spojenců",
    );
  });

  it("declines a word that starts with an accented letter", () => {
    expect(cs.from({ text: "poškození", from: "útoky" })).toBe("poškození od útoků");
  });

  it("does not take a word for the start of a longer one", () => {
    expect(cs.from({ text: "poškození", from: "bodyček" })).toBe("poškození od bodyček");
  });

  it("changes a Polish word with an inner accented letter", () => {
    expect(pl.appliesAnAToAFoe({ words: "klątwa" })).toBe("nakłada na wroga klątwę");
  });
});
