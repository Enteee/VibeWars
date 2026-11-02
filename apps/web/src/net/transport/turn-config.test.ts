import { afterEach, describe, expect, it, vi } from "vitest";

import {
  credentialExpiry,
  encodeTurnFragment,
  forgetSharedRelay,
  forgetTurnConfig,
  loadRelaySharing,
  loadSharedRelay,
  loadTurnConfig,
  mintTurnCredential,
  parseTurnFragment,
  relayHosts,
  saveRelaySharing,
  saveSharedRelay,
  saveTurnConfig,
  validateSharedRelay,
  validateTurnConfig,
  type SharedRelay,
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

describe("the URL rule for a relay from anywhere (#2091)", () => {
  const withHost = (host: string): TurnConfig => ({ ...RELAY, urls: [`turn:${host}:3478`] });

  it.each([
    ["IPv4 loopback", "127.0.0.1"],
    ["IPv4 0/8", "0.0.0.0"],
    ["RFC1918 10/8", "10.1.2.3"],
    ["RFC1918 172.16/12", "172.31.255.1"],
    ["RFC1918 192.168/16", "192.168.0.10"],
    ["IPv4 link-local", "169.254.169.254"],
    ["CGNAT 100.64/10", "100.100.1.1"],
    ["a short IPv4 form", "127.1"],
    ["a hex IPv4 form", "0x7f.0.0.1"],
    ["an octal-looking IPv4 octet", "010.0.0.1"],
    ["IPv6 loopback", "[::1]"],
    ["IPv6 unspecified", "[::]"],
    ["IPv6 ULA fc00::/7", "[fd12:3456::1]"],
    ["IPv6 link-local", "[fe80::1]"],
    ["a v4-mapped refused IPv4", "[::ffff:192.168.1.1]"],
    ["a v4-mapped refused IPv4 in hex", "[::ffff:c0a8:101]"],
    ["NAT64 with a refused IPv4", "[64:ff9b::10.0.0.1]"],
    ["a malformed IPv6", "[1::2::3]"],
    ["localhost", "localhost"],
    ["a *.localhost name", "relay.localhost"],
    ["a *.local name", "printer.LOCAL"],
  ])("refuses %s", (_, host) => {
    expect(validateTurnConfig(withHost(host))).toBeUndefined();
  });

  it.each([
    ["a public IPv4", "203.0.113.7"],
    ["an IPv4 just past CGNAT", "100.128.0.1"],
    ["a public IPv6", "[2001:db8::1]"],
    ["a v4-mapped public IPv4", "[::ffff:203.0.113.7]"],
    ["NAT64 with a public IPv4", "[64:ff9b::203.0.113.7]"],
    ["a name", "turn.example"],
    ["a name with a numeric label", "1.turn.example"],
  ])("takes %s", (_, host) => {
    expect(validateTurnConfig(withHost(host))).toEqual(withHost(host));
  });
});

describe("a shared relay (#2091)", () => {
  const SHARED: SharedRelay = { urls: ["turns:turn.example:5349"], secret: "s" };

  it("mints coturn's REST credential: the username's HMAC-SHA1 under the secret", () => {
    // Computed with Node's crypto, outside `mintTurnCredential`, and pinned.
    const minted = mintTurnCredential(SHARED, "0123456789abcdef", 1_700_000_000_000);
    expect(minted).toEqual({
      urls: SHARED.urls,
      username: "1700007200:0123456789abcdef",
      credential: "CMjsAVviRjf3czWnWgj9pgoCtDY=", // pragma: allowlist secret
    });
    expect(validateTurnConfig(minted)).toEqual(minted);
    expect(credentialExpiry(minted)).toBe(1_700_007_200_000);
  });

  it.each([
    ["an extra key", { ...SHARED, share: true }],
    ["a missing secret", { urls: SHARED.urls }],
    ["an empty secret", { ...SHARED, secret: "" }],
    ["a private host", { ...SHARED, urls: ["turn:192.168.1.2"] }],
    ["a stun: URL", { ...SHARED, urls: ["stun:turn.example"] }],
  ])("is rejected for %s", (_, value) => {
    expect(validateSharedRelay(value)).toBeUndefined();
  });

  it("is saved apart from the static relay, and sharing is off until ticked", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    expect(loadRelaySharing()).toBe(false);
    saveSharedRelay(SHARED);
    saveRelaySharing(true);
    expect(loadSharedRelay()).toEqual(SHARED);
    expect(loadTurnConfig()).toBeUndefined();
    expect(loadRelaySharing()).toBe(true);
    saveRelaySharing(false);
    forgetSharedRelay();
    expect(storage.items.size).toBe(0);
    vi.unstubAllGlobals();
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

describe("the relay on a sub-path, as on GitHub Pages (#1269)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("is saved, and a fresh load of the page reads it back", async () => {
    vi.stubEnv("BASE_URL", "/VibeWars/next/");
    vi.resetModules();
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const visit = await import("./turn-config.js");
    visit.saveTurnConfig(RELAY);
    expect(storage.getItem("vibewars/VibeWars/next.turn-relay")).toBe(JSON.stringify(RELAY));

    vi.resetModules();
    const reloaded = await import("./turn-config.js");
    expect(reloaded.loadTurnConfig()).toEqual(RELAY);
    reloaded.forgetTurnConfig();
    expect(storage.items.size).toBe(0);
  });
});
