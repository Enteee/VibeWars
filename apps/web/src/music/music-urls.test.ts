import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { musicHostUrl, samplesBaseUrl } from "./music-urls.js";

describe("music URLs", () => {
  it("live under the client's base, on the LAN server and on Pages", () => {
    expect(musicHostUrl("/")).toBe("/music-host.html");
    expect(musicHostUrl("/VibeWars/next/")).toBe("/VibeWars/next/music-host.html");
    expect(samplesBaseUrl("/", "http://127.0.0.1:2567/music-host.html")).toBe(
      "http://127.0.0.1:2567/music/samples/",
    );
    expect(
      samplesBaseUrl("/VibeWars/next/", "https://enteee.github.io/VibeWars/next/music-host.html"),
    ).toBe("https://enteee.github.io/VibeWars/next/music/samples/");
  });
});

describe("strudel.json", () => {
  /** Every string in the sample map, at any depth. */
  const strings = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : typeof value === "object" && value !== null
        ? Object.values(value).flatMap(strings)
        : [];

  it("names only our own files, relative to it: nothing loads from another host", () => {
    const map: unknown = JSON.parse(
      fs.readFileSync(new URL("../../public/music/samples/strudel.json", import.meta.url), "utf8"),
    );
    expect(typeof map === "object" && map !== null && "_base" in map).toBe(false);
    for (const url of strings(map)) {
      expect(url, url).not.toMatch(/^[a-z][a-z0-9+.-]*:|^\/|\.\./i);
    }
  });
});
