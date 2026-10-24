import { describe, expect, it } from "vitest";

import { storageNamespace } from "./namespace.js";

describe("storageNamespace", () => {
  it("keeps the plain name for a build served at the root", () => {
    expect(storageNamespace("/")).toBe("vibewars");
  });

  it("gives the release on GitHub Pages its own name", () => {
    expect(storageNamespace("/VibeWars/")).toBe("vibewars/VibeWars");
  });

  it("gives next a name apart from the release on the same origin", () => {
    expect(storageNamespace("/VibeWars/next/")).toBe("vibewars/VibeWars/next");
  });
});
