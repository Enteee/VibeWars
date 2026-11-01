import { describe, expect, it } from "vitest";

import { parseLobbyFragment, takeFragmentPart } from "./fragment.js";
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
