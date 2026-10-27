import { afterEach, describe, expect, it, vi } from "vitest";

import {
  encodeTurnFragment,
  forgetTurnConfig,
  loadTurnConfig,
  parseTurnFragment,
  relayHosts,
  saveTurnConfig,
  savesRelay,
  validateTurnConfig,
  type TurnConfig,
} from "./turn-config.js";

const RELAY: TurnConfig = {
  urls: ["turn:turn.example:3478?transport=udp", "turns:turn.example:5349", "turn:[2001:db8::1]"],
  username: "ana",
  credential: "s3cret/+=&",
};

/** `value` as an invite link's fragment value would carry it, whatever it is. */
function fragmentOf(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const binary = String.fromCharCode(...bytes);
  return `turn=${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  readonly items: Map<string, string>;
} {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

describe("a TURN relay invite link (#972)", () => {
  it("round-trips through the fragment, with no base64 padding or URL-unsafe characters", () => {
    const fragment = encodeTurnFragment(RELAY);
    expect(fragment).toMatch(/^turn=[A-Za-z0-9_-]+$/);
    expect(parseTurnFragment(`#${fragment}`)).toEqual({ kind: "config", config: RELAY, rest: "" });
  });

  it("consumes only turn=, and leaves the rest of the fragment in order", () => {
    const fragment = encodeTurnFragment(RELAY);
    expect(parseTurnFragment(`#a=1&${fragment}&b=2`)).toEqual({
      kind: "config",
      config: RELAY,
      rest: "a=1&b=2",
    });
    expect(parseTurnFragment("#a=1")).toEqual({ kind: "none" });
    expect(parseTurnFragment("")).toEqual({ kind: "none" });
  });

  it("takes out every turn= part, and two of them are malformed", () => {
    const fragment = encodeTurnFragment(RELAY);
    const other = encodeTurnFragment({ ...RELAY, credential: "other" });
    expect(parseTurnFragment(`#${fragment}&a=1&${other}`)).toEqual({
      kind: "malformed",
      rest: "a=1",
    });
  });

  it.each([
    ["bad base64", "turn=%%%"],
    ["not JSON", fragmentOf("{urls:")],
    ["not an object", fragmentOf("[]")],
    ["a missing field", fragmentOf(JSON.stringify({ urls: ["turn:a.example"], username: "u" }))],
    [
      "an extra key",
      fragmentOf(JSON.stringify({ ...RELAY, urls: ["turn:a.example"], extra: true })),
    ],
    ["a stun: URL", fragmentOf(JSON.stringify({ ...RELAY, urls: ["stun:a.example"] }))],
    ["an https: URL", fragmentOf(JSON.stringify({ ...RELAY, urls: ["https://a.example"] }))],
    ["a URL with no host", fragmentOf(JSON.stringify({ ...RELAY, urls: ["turn::3478"] }))],
    ["no URLs", fragmentOf(JSON.stringify({ ...RELAY, urls: [] }))],
    [
      "five URLs",
      fragmentOf(JSON.stringify({ ...RELAY, urls: Array<string>(5).fill("turn:a.example") })),
    ],
    ["an empty username", fragmentOf(JSON.stringify({ ...RELAY, username: "" }))],
    [
      "a 257-character credential",
      fragmentOf(JSON.stringify({ ...RELAY, credential: "x".repeat(257) })),
    ],
    ["over 4 KB", fragmentOf(JSON.stringify({ ...RELAY, pad: "x".repeat(5000) }))],
    ["not UTF-8", `turn=${btoa("\xff\xfe").replace(/=+$/, "")}`],
    ["a port over 65535", fragmentOf(JSON.stringify({ ...RELAY, urls: ["turn:a.example:65536"] }))],
  ])("is rejected for %s", (_, fragment) => {
    expect(parseTurnFragment(`#x&${fragment}`)).toEqual({ kind: "malformed", rest: "x" });
  });

  it("shows each URL's host once, never the username or credential", () => {
    expect(relayHosts(RELAY)).toBe("turn.example, [2001:db8::1]");
    expect(relayHosts(RELAY)).not.toContain("ana");
    expect(validateTurnConfig({ ...RELAY, urls: ["turn:a.example", "turn:b.example:80"] })).toEqual(
      { ...RELAY, urls: ["turn:a.example", "turn:b.example:80"] },
    );
  });
});

describe("the saved relay (#972)", () => {
  afterEach(() => {
    forgetTurnConfig();
    vi.unstubAllGlobals();
  });

  it("is none until saved, survives a reload once saved, and is gone once forgotten", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadTurnConfig()).toBeUndefined();
    saveTurnConfig(RELAY);
    expect(loadTurnConfig()).toEqual(RELAY);
    forgetTurnConfig();
    expect(loadTurnConfig()).toBeUndefined();
  });

  it("removes a stored value of the wrong shape, and says so", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    saveTurnConfig(RELAY);
    const [key] = storage.items.keys();
    storage.setItem(key ?? "", JSON.stringify({ urls: "turn:a.example" }));
    const removed = vi.fn();
    expect(loadTurnConfig(removed)).toBeUndefined();
    expect(removed).toHaveBeenCalledOnce();
    expect(storage.items.size).toBe(0);
  });

  it("is kept for the visit when storage refuses it", () => {
    const refuse = (): never => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: refuse, setItem: refuse, removeItem: refuse });
    saveTurnConfig(RELAY);
    expect(loadTurnConfig()).toEqual(RELAY);
    forgetTurnConfig();
    expect(loadTurnConfig()).toBeUndefined();
  });
});

describe("the relay on a sub-path, as on GitHub Pages (#972)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("is saved only by a build at the origin's root", () => {
    expect(savesRelay("/")).toBe(true);
    expect(savesRelay("/VibeWars/")).toBe(false);
    expect(savesRelay("/VibeWars/next/")).toBe(false);
  });

  it("lasts for the visit, never touches storage, and ignores a relay another site planted", async () => {
    vi.stubEnv("BASE_URL", "/VibeWars/next/");
    vi.resetModules();
    const pages = await import("./turn-config.js");
    const storage = memoryStorage();
    storage.setItem("vibewars/VibeWars/next.turn-relay", JSON.stringify(RELAY));
    vi.stubGlobal("localStorage", storage);

    expect(pages.RELAY_IS_SAVED).toBe(false);
    expect(pages.loadTurnConfig()).toBeUndefined();
    const own = { ...RELAY, credential: "own" };
    pages.saveTurnConfig(own);
    expect(pages.loadTurnConfig()).toEqual(own);
    expect(storage.getItem("vibewars/VibeWars/next.turn-relay")).toBe(JSON.stringify(RELAY));
    pages.forgetTurnConfig();
    expect(pages.loadTurnConfig()).toBeUndefined();
    expect(storage.items.size).toBe(1);
  });
});
