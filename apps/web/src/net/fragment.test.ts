import { EMBLEM_GRID, packEmblem } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { EMBLEM_PRESET_NAMES, presetEmblem } from "../render/cape-shape.js";
import { guildLink } from "../ui/player-section.js";
import {
  MAX_PASTED_LINK_LENGTH,
  parseGuildFragment,
  parseLobbyFragment,
  readPastedLobbyLink,
  takeFragmentPart,
} from "./fragment.js";
import { parseTurnFragment } from "./transport/turn-config.js";

const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

describe("takeFragmentPart (#972, #2100)", () => {
  it("takes every part of that name out, keeping the rest in order", () => {
    expect(takeFragmentPart("#a=1&lobby=x&b=2&lobby=y", "lobby")).toEqual({
      values: ["x", "y"],
      rest: "a=1&b=2",
    });
  });

  it("is nothing for a fragment without the part", () => {
    expect(takeFragmentPart("#turn=abc", "lobby")).toBeUndefined();
    expect(takeFragmentPart("", "lobby")).toBeUndefined();
  });
});

describe("parseLobbyFragment (#2100)", () => {
  it("reads an invite link's key, with or without the #", () => {
    expect(parseLobbyFragment(`#lobby=${KEY}`)).toEqual({ kind: "invite", code: KEY, rest: "" });
    expect(parseLobbyFragment(`lobby=${KEY}`)).toEqual({ kind: "invite", code: KEY, rest: "" });
  });

  it("is nothing for a page opened without one", () => {
    expect(parseLobbyFragment("")).toEqual({ kind: "none" });
    expect(parseLobbyFragment("#turn=abc")).toEqual({ kind: "none" });
  });

  it("consumes lobby= and leaves turn= to its own reader", () => {
    const lobby = parseLobbyFragment(`#lobby=${KEY}&turn=abc`);
    expect(lobby).toEqual({ kind: "invite", code: KEY, rest: "turn=abc" });
    if (lobby.kind === "invite") {
      // The relay reader takes its part from what is left, malformed or not.
      expect(parseTurnFragment(lobby.rest)).toEqual({ kind: "malformed", rest: "" });
    }
    expect(parseTurnFragment(`#turn=abc&lobby=${KEY}`)).toEqual({
      kind: "malformed",
      rest: `lobby=${KEY}`,
    });
  });

  it("calls a broken key malformed, and still consumes it", () => {
    for (const hash of [
      "#lobby=",
      "#lobby=ACDEFGHJKMNP",
      `#lobby=${KEY.slice(0, -1)}`,
      `#lobby=${KEY}=`,
      `#lobby=${KEY}&lobby=${KEY}`,
    ]) {
      expect(parseLobbyFragment(hash), hash).toEqual({ kind: "malformed", rest: "" });
    }
    expect(parseLobbyFragment("#x=1&lobby=nope")).toEqual({ kind: "malformed", rest: "x=1" });
  });
});

describe("readPastedLobbyLink (#2882)", () => {
  const here = { origin: "https://vibe.example", pathname: "/VibeWars/" };
  const good = `https://vibe.example/VibeWars/#lobby=${KEY}`;
  const read = (text: string): ReturnType<typeof readPastedLobbyLink> =>
    readPastedLobbyLink(text, here);

  it("takes this build's link, whitespace around it or not", () => {
    expect(read(`  ${good}\n`)).toEqual({ kind: "link", fragment: `#lobby=${KEY}` });
  });

  it("keeps the whole fragment of a link carrying a relay", () => {
    expect(read(`${good}&turn=abc`)).toEqual({
      kind: "link",
      fragment: `#lobby=${KEY}&turn=abc`,
    });
  });

  it.each([
    ["empty", "   "],
    ["no URL", "not a link"],
    ["no fragment", "https://vibe.example/VibeWars/"],
    ["a relay only", "https://vibe.example/VibeWars/#turn=abc"],
    ["a bad key", "https://vibe.example/VibeWars/#lobby=short"],
    ["two keys", `${good}&lobby=${KEY}`],
    ["javascript:", `javascript:alert(1)//#lobby=${KEY}`],
    ["data:", `data:text/html,x#lobby=${KEY}`],
  ])("is no link: %s", (_name, text) => {
    expect(read(text)).toEqual({ kind: "malformed" });
  });

  it("refuses anything longer than the limit", () => {
    const padded = `${good}&x=${"a".repeat(MAX_PASTED_LINK_LENGTH)}`.slice(
      0,
      MAX_PASTED_LINK_LENGTH + 1,
    );
    expect(padded).toHaveLength(2049);
    expect(read(padded)).toEqual({ kind: "malformed" });
  });

  it.each([
    ["another site", `https://evil.example/VibeWars/#lobby=${KEY}`],
    ["another scheme", `http://vibe.example/VibeWars/#lobby=${KEY}`],
    ["another build's path", `https://vibe.example/VibeWars/next/#lobby=${KEY}`],
    ["index.html", `https://vibe.example/VibeWars/index.html#lobby=${KEY}`],
  ])("is another build: %s", (_name, text) => {
    expect(read(text)).toEqual({ kind: "other-build" });
  });
});

describe("parseGuildFragment (#3167)", () => {
  const here = { origin: "https://vibewars.example", pathname: "/play/" };
  const hashOf = (url: string): string => new URL(url).hash;

  /** 15 emblem colours (#3628), each its own. */
  const COLOURS = Array.from({ length: 15 }, (_, index) =>
    (index * 0x111111).toString(16).padStart(6, "0"),
  );
  /** An emblem grid of every pixel value (#3554), each colour in order of first use. */
  const GRID = packEmblem(Array.from({ length: EMBLEM_GRID * EMBLEM_GRID }, (_, i) => i % 16));
  /** `GRID`'s colours as a link runs them together. */
  const RUN = COLOURS.join("");

  it("reads back every starting emblem guildLink writes", () => {
    for (const name of EMBLEM_PRESET_NAMES) {
      const cape = {
        main: "e6c04a",
        trim: "23272e",
        emblemColours: ["a078e0"],
        emblem: packEmblem(presetEmblem(name)),
      };
      expect(parseGuildFragment(hashOf(guildLink("Vw", cape, here)))).toEqual({
        kind: "guild",
        tag: "Vw",
        cape,
        rest: "",
      });
    }
  });

  it("reads back a grid of every pixel value in 15 colours, and a blank one (#3554, #3628)", () => {
    for (const cape of [
      { main: "2fb8a0", trim: "e86fb4", emblemColours: COLOURS, emblem: GRID },
      { main: "2fb8a0", trim: "e86fb4", emblemColours: [], emblem: packEmblem([]) },
    ]) {
      expect(parseGuildFragment(hashOf(guildLink("VIBE", cape, here)))).toEqual({
        kind: "guild",
        tag: "VIBE",
        cape,
        rest: "",
      });
    }
  });

  it("reads a tag alone as a guild with no cape", () => {
    expect(guildLink("VIBE", null, here)).toBe("https://vibewars.example/play/#guild=VIBE");
    expect(parseGuildFragment("#guild=VIBE")).toEqual({
      kind: "guild",
      tag: "VIBE",
      cape: null,
      rest: "",
    });
  });

  it("is nothing for a page opened without one", () => {
    expect(parseGuildFragment("")).toEqual({ kind: "none" });
    expect(parseGuildFragment(`#lobby=${KEY}`)).toEqual({ kind: "none" });
  });

  it("calls a bad tag, colour, emblem or count of parts invalid", () => {
    for (const value of [
      "V",
      "V!B",
      "VIBES",
      "",
      "VW.e6c04a",
      "VW.e6c04a.23272e",
      `VW.e6c04a.23272e.${GRID}`,
      `VW.e6c04a.23272e.${GRID}.${RUN}.${RUN}`,
      `VW.gold.23272e.${GRID}.${RUN}`,
      `VW.e6c04a.black.${GRID}.${RUN}`,
      `VW.E6C04A.23272e.${GRID}.${RUN}`,
      `VW.e6c04a.23272e.${GRID}.${RUN.toUpperCase()}`,
      `VW.e6c04a.23272e.${GRID}.${RUN.slice(1)}`,
      `VW.e6c04a.23272e.${GRID}.${RUN.slice(6)}`,
      `VW.e6c04a.23272e.${GRID}.${RUN}ffffff`,
      `VW.#e6c04a.23272e.${GRID}.${RUN}`,
      "VW.e6c04a.23272e.cross.",
      `VW.e6c04a.23272e.${GRID.slice(1)}.${RUN}`,
    ]) {
      expect(parseGuildFragment(`#guild=${value}`), value).toEqual({ kind: "invalid", rest: "" });
    }
  });

  it("calls a fragment longer than any real link invalid", () => {
    const long = `#guild=VW&${"x".repeat(MAX_PASTED_LINK_LENGTH)}`;
    expect(parseGuildFragment(long).kind).toBe("invalid");
  });

  it("consumes every guild= part, the first valid one winning", () => {
    expect(parseGuildFragment(`#guild=V!&guild=AB.e6c04a.23272e.${GRID}.${RUN}&guild=CD`)).toEqual({
      kind: "guild",
      tag: "AB",
      cape: { main: "e6c04a", trim: "23272e", emblemColours: COLOURS, emblem: GRID },
      rest: "",
    });
  });

  it("leaves lobby= and turn= to their own readers", () => {
    const turn = "turn=abc";
    const read = parseGuildFragment(`#lobby=${KEY}&guild=VW.e6c04a.23272e.${GRID}.${RUN}&${turn}`);
    expect(read.kind === "none" ? undefined : read.rest).toBe(`lobby=${KEY}&${turn}`);
    expect(parseLobbyFragment(read.kind === "none" ? "" : read.rest)).toEqual({
      kind: "invite",
      code: KEY,
      rest: turn,
    });
  });
});
