import { describe, expect, it } from "vitest";

import { THIRD_PARTY_LICENCES } from "./licences-section.js";

describe("THIRD_PARTY_LICENCES (#1235)", () => {
  it("carries gw-skilldata's MIT notice verbatim from the vendored file", () => {
    const corpus = THIRD_PARTY_LICENCES.find((entry) => entry.name === "gw-skilldata");
    expect(corpus?.spdx).toBe("MIT");
    expect(corpus?.text).toContain("Copyright (c) 2024 smiley");
    expect(corpus?.text).toContain("Permission is hereby granted");
  });

  it("carries marked's notice, which renders the Help pages (#1257)", () => {
    const marked = THIRD_PARTY_LICENCES.find((entry) => entry.name === "marked");
    expect(marked?.spdx).toBe("MIT");
    expect(marked?.text).toContain("Copyright (c) 2018+, MarkedJS");
  });

  it("names every work once, with its use, source and text", () => {
    const names = THIRD_PARTY_LICENCES.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of THIRD_PARTY_LICENCES) {
      expect(entry.use).not.toBe("");
      expect(entry.url).toMatch(/^https:\/\//);
      expect(entry.text.trim()).not.toBe("");
    }
  });
});
