import { describe, expect, it } from "vitest";

import { mayRun, WEBRTC_GLOBALS, withoutWebRtc } from "./guard.js";

describe("mayRun", () => {
  const frame = {};
  const game = {};

  it("runs only sandboxed and framed", () => {
    expect(mayRun("null", frame, game)).toBe(true);
  });

  it("refuses the game's own origin, framed without a sandbox (ADR-0028)", () => {
    expect(mayRun("http://127.0.0.1:2577", frame, game)).toBe(false);
  });

  it("refuses a top-level page, even one with an opaque origin", () => {
    expect(mayRun("null", frame, frame)).toBe(false);
    expect(mayRun("https://enteee.github.io", frame, frame)).toBe(false);
  });
});

describe("withoutWebRtc", () => {
  it("deletes every WebRTC constructor, and says none is left (#2745)", () => {
    const global: Record<string, unknown> = { fetch: () => undefined };
    for (const name of WEBRTC_GLOBALS) {
      global[name] = () => undefined;
    }
    expect(withoutWebRtc(global)).toBe(true);
    expect(WEBRTC_GLOBALS.filter((name) => name in global)).toEqual([]);
    expect("fetch" in global).toBe(true);
  });

  it("refuses when one cannot be deleted", () => {
    const global = {};
    Object.defineProperty(global, "RTCPeerConnection", {
      value: () => undefined,
      configurable: false,
    });
    expect(withoutWebRtc(global)).toBe(false);
  });

  it("refuses when one is still reachable through the prototype", () => {
    const global = Object.create({ RTCDataChannel: () => undefined }) as object;
    expect(withoutWebRtc(global)).toBe(false);
  });
});
