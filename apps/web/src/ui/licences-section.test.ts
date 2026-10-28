import { describe, expect, it } from "vitest";

import { THIRD_PARTY_LICENCES, parseBundledLicences } from "./licences-section.js";

describe("THIRD_PARTY_LICENCES (#1235)", () => {
  it("carries gw-skilldata's MIT notice verbatim from the vendored file", () => {
    const corpus = THIRD_PARTY_LICENCES.find((entry) => entry.name === "gw-skilldata");
    expect(corpus?.spdx).toBe("MIT");
    expect(corpus?.text).toContain("Copyright (c) 2024 smiley");
    expect(corpus?.text).toContain("Permission is hereby granted");
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

describe("THIRD_PARTY_LICENCES (#1242)", () => {
  it("credits the VCSL music samples, CC0", () => {
    const vcsl = THIRD_PARTY_LICENCES.find((entry) => entry.name === "VCSL");
    expect(vcsl?.spdx).toBe("CC0-1.0");
    expect(vcsl?.url).toBe("https://github.com/sgossner/VCSL");
  });

  it("is sorted by name", () => {
    const names = THIRD_PARTY_LICENCES.map((entry) => entry.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("parseBundledLicences (#1242)", () => {
  const phaser = {
    name: "phaser",
    version: "4.2.1",
    spdx: "MIT",
    url: "https://github.com/phaserjs/phaser",
    text: "The MIT License",
  };

  it("reads the build's list", () => {
    expect(parseBundledLicences([phaser])).toEqual([phaser]);
  });

  it("refuses anything else: a dev server's HTML page, or an entry missing a field", () => {
    expect(parseBundledLicences("<!doctype html>")).toBeUndefined();
    expect(parseBundledLicences([{ ...phaser, text: undefined }])).toBeUndefined();
    expect(parseBundledLicences([null])).toBeUndefined();
  });
});
