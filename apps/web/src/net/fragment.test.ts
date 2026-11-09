import { describe, expect, it } from "vitest";

import {
  MAX_PASTED_LINK_LENGTH,
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
