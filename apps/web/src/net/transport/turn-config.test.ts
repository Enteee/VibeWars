import { afterEach, describe, expect, it, vi } from "vitest";

import {
  credentialExpiry,
  encodeTurnFragment,
  forgetRelay,
  loadOfferedRelay,
  loadOwnTurnConfig,
  loadRelay,
  loadRelaySharing,
  mintTurnCredential,
  onRelaySharingChange,
  parseTurnFragment,
  relayHosts,
  saveRelay,
  saveRelaySharing,
  validateRelay,
  validateTurnConfig,
  type Relay,
  type SharedRelay,
  type TurnConfig,
} from "./turn-config.js";

const SECRET = "ab".repeat(32);

/** A relay from an invite link (#2240). */
const LINKED: SharedRelay = {
  urls: ["turn:turn.example:3478?transport=udp", "turns:turn.example:5349", "turn:[2001:db8::1]"],
  secret: SECRET,
};
const REST: Relay = { kind: "rest", ...LINKED };

/** A TURN login, as a static relay or a lobby offer carries it. */
const RELAY: TurnConfig = {
  urls: ["turn:turn.example:3478?transport=udp", "turns:turn.example:5349", "turn:[2001:db8::1]"],
  username: "ana",
  credential: "s3cret/+=&",
};
const STATIC: Relay = { kind: "static", ...RELAY };

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

describe("a TURN relay invite link (#972, #2240)", () => {
  it("round-trips through the fragment, with no base64 padding or URL-unsafe characters", () => {
    const fragment = encodeTurnFragment(LINKED);
    expect(fragment).toMatch(/^turn=[A-Za-z0-9_-]+$/);
    expect(parseTurnFragment(`#${fragment}`)).toEqual({ kind: "config", relay: REST, rest: "" });
  });

  it("carries exactly { urls, secret }", () => {
    const [, value = ""] = encodeTurnFragment(LINKED).split("=");
    const json = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    expect(json).toBe(JSON.stringify({ urls: LINKED.urls, secret: SECRET }));
  });

  it("consumes only turn=, and leaves the rest of the fragment in order", () => {
    const fragment = encodeTurnFragment(LINKED);
    expect(parseTurnFragment(`#a=1&${fragment}&b=2`)).toEqual({
      kind: "config",
      relay: REST,
      rest: "a=1&b=2",
    });
    expect(parseTurnFragment("#a=1")).toEqual({ kind: "none" });
    expect(parseTurnFragment("")).toEqual({ kind: "none" });
  });

  it("takes out every turn= part, and two of them are malformed", () => {
    const fragment = encodeTurnFragment(LINKED);
    const other = encodeTurnFragment({ ...LINKED, secret: "f".repeat(64) });
    expect(parseTurnFragment(`#${fragment}&a=1&${other}`)).toEqual({
      kind: "malformed",
      rest: "a=1",
    });
  });

  it.each([
    ["bad base64", "turn=%%%"],
    ["not JSON", fragmentOf("{urls:")],
    ["not an object", fragmentOf("[]")],
    ["a missing secret", fragmentOf(JSON.stringify({ urls: ["turn:a.example"] }))],
    ["an extra key", fragmentOf(JSON.stringify({ ...LINKED, extra: true }))],
    ["a kind in it", fragmentOf(JSON.stringify(REST))],
    ["a username and credential", fragmentOf(JSON.stringify(RELAY))],
    ["a static relay", fragmentOf(JSON.stringify(STATIC))],
    [
      "an uppercase secret",
      fragmentOf(JSON.stringify({ ...LINKED, secret: SECRET.toUpperCase() })),
    ],
    ["a 63-character secret", fragmentOf(JSON.stringify({ ...LINKED, secret: SECRET.slice(1) }))],
    ["a non-hex secret", fragmentOf(JSON.stringify({ ...LINKED, secret: `${SECRET.slice(1)}g` }))],
    ["a numeric secret", fragmentOf(JSON.stringify({ ...LINKED, secret: 1 }))],
    ["a stun: URL", fragmentOf(JSON.stringify({ ...LINKED, urls: ["stun:a.example"] }))],
    ["an https: URL", fragmentOf(JSON.stringify({ ...LINKED, urls: ["https://a.example"] }))],
    ["a URL with no host", fragmentOf(JSON.stringify({ ...LINKED, urls: ["turn::3478"] }))],
    ["a private host", fragmentOf(JSON.stringify({ ...LINKED, urls: ["turn:192.168.1.2"] }))],
    ["no URLs", fragmentOf(JSON.stringify({ ...LINKED, urls: [] }))],
    [
      "five URLs",
      fragmentOf(JSON.stringify({ ...LINKED, urls: Array<string>(5).fill("turn:a.example") })),
    ],
    ["over 4 KB", fragmentOf(JSON.stringify({ ...LINKED, pad: "x".repeat(5000) }))],
    ["not UTF-8", `turn=${btoa("\xff\xfe").replace(/=+$/, "")}`],
    [
      "a port over 65535",
      fragmentOf(JSON.stringify({ ...LINKED, urls: ["turn:a.example:65536"] })),
    ],
  ])("is rejected for %s", (_, fragment) => {
    expect(parseTurnFragment(`#x&${fragment}`)).toEqual({ kind: "malformed", rest: "x" });
  });

  it("shows each URL's host once, never the username, credential or secret", () => {
    expect(relayHosts(RELAY)).toBe("turn.example, [2001:db8::1]");
    expect(relayHosts(RELAY)).not.toContain("ana");
    expect(relayHosts(REST)).not.toContain(SECRET);
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

describe("a relay as kept (#2240)", () => {
  it.each([
    ["a rest relay", REST],
    ["a static relay", STATIC],
  ])("takes %s", (_, relay) => {
    expect(validateRelay(relay)).toEqual(relay);
  });

  it.each([
    ["a bare TURN login", RELAY],
    ["a bare { urls, secret }", LINKED],
    ["an unknown kind", { ...LINKED, kind: "shared" }],
    ["a rest relay with a username", { ...REST, username: "u" }],
    ["a static relay with a secret", { ...STATIC, secret: SECRET }],
    ["a static relay's login under rest", { ...RELAY, kind: "rest" }],
    ["a rest relay's secret under static", { ...LINKED, kind: "static" }],
    ["a rest relay with a short secret", { ...REST, secret: "s" }],
    ["a static relay with an empty username", { ...STATIC, username: "" }],
    ["a static relay with a 257-character credential", { ...STATIC, credential: "x".repeat(257) }],
    ["a private host", { ...REST, urls: ["turn:10.0.0.1"] }],
  ])("refuses %s", (_, value) => {
    expect(validateRelay(value)).toBeUndefined();
  });
});

describe("a minted credential (#2091)", () => {
  const SHARED: SharedRelay = { urls: ["turns:turn.example:5349"], secret: "s" };

  it("mints coturn's REST credential: the username's HMAC-SHA1 under the secret", () => {
    // Computed with Node's crypto, outside `mintTurnCredential`, and pinned.
    const minted = mintTurnCredential(SHARED, "0123456789abcdef", 1_700_000_000_000);
    expect(minted).toEqual({
      urls: SHARED.urls,
      username: "1700014400:0123456789abcdef",
      credential: "eG+hjha+bFActl+XrrtyAd0VTe4=", // pragma: allowlist secret
    });
    expect(validateTurnConfig(minted)).toEqual(minted);
    expect(credentialExpiry(minted)).toBe(1_700_014_400_000);
  });
});

describe("the saved relay (#972, #2240)", () => {
  afterEach(() => {
    forgetRelay();
    vi.unstubAllGlobals();
  });

  it("is none until saved, survives a reload once saved, and is gone once forgotten", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadRelay()).toBeUndefined();
    saveRelay(STATIC);
    expect(loadRelay()).toEqual(STATIC);
    saveRelay(REST);
    expect(loadRelay()).toEqual(REST);
    forgetRelay();
    expect(loadRelay()).toBeUndefined();
  });

  it.each([
    ["a TURN login without a kind", RELAY],
    ["a { urls, secret } without a kind", LINKED],
    ["a malformed one", { urls: "turn:a.example" }],
    ["a rest relay with a bad secret", { ...REST, secret: "s" }],
  ])("removes a stored value that is %s, and says so", (_, value) => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    saveRelay(STATIC);
    const [key] = storage.items.keys();
    storage.setItem(key ?? "", JSON.stringify(value));
    const removed = vi.fn();
    expect(loadRelay(removed)).toBeUndefined();
    expect(removed).toHaveBeenCalledOnce();
    expect(storage.items.size).toBe(0);
    expect(loadRelay(removed)).toBeUndefined();
    expect(removed).toHaveBeenCalledOnce();
  });

  it("is kept for the visit when storage refuses it", () => {
    const refuse = (): never => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: refuse, setItem: refuse, removeItem: refuse });
    saveRelay(STATIC);
    expect(loadRelay()).toEqual(STATIC);
    forgetRelay();
    expect(loadRelay()).toBeUndefined();
  });
});

describe("the login a player joins with (#2240)", () => {
  afterEach(() => {
    forgetRelay();
    vi.unstubAllGlobals();
  });

  it("is none without a relay, and a static relay's login as saved", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadOwnTurnConfig()).toBeUndefined();
    saveRelay(STATIC);
    expect(loadOwnTurnConfig()).toEqual(RELAY);
  });

  it("is minted fresh from a rest relay for every join, and never carries the secret", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    saveRelay(REST);
    const now = 1_700_000_000_000;
    const first = loadOwnTurnConfig(now);
    const second = loadOwnTurnConfig(now);
    expect(first?.urls).toEqual(LINKED.urls);
    expect(first?.username).toMatch(/^1700007200:[0-9a-f]{16}$/);
    expect(second?.username).toMatch(/^1700007200:[0-9a-f]{16}$/);
    expect(second?.username).not.toBe(first?.username);
    expect(JSON.stringify([first, second])).not.toContain(SECRET);
    // Each verifies as coturn checks it: the HMAC-SHA1 of its username under the secret.
    for (const login of [first, second]) {
      const tag = login?.username.split(":")[1] ?? "";
      expect(login).toEqual(mintTurnCredential(LINKED, tag, now));
    }
  });
});

describe("sharing the relay with this player's lobbies (#2091, #2240)", () => {
  afterEach(() => {
    forgetRelay();
    vi.unstubAllGlobals();
  });

  it("is on by default, and only an unticked box is stored", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    expect(loadRelaySharing()).toBe(true);
    saveRelaySharing(false);
    expect(loadRelaySharing()).toBe(false);
    expect([...storage.items.values()]).toEqual(["off"]);
    saveRelaySharing(true);
    expect(loadRelaySharing()).toBe(true);
    expect(storage.items.size).toBe(0);
  });

  it("offers a rest relay's URLs and secret while on, and nothing once off", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadOfferedRelay()).toBeUndefined();
    saveRelay(REST);
    expect(loadOfferedRelay()).toEqual(LINKED);
    saveRelaySharing(false);
    expect(loadOfferedRelay()).toBeUndefined();
  });

  it("never offers a static relay", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    saveRelay(STATIC);
    expect(loadRelaySharing()).toBe(true);
    expect(loadOfferedRelay()).toBeUndefined();
  });

  it("tells an open lobby when the relay or the box changes", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const heard = vi.fn();
    const stop = onRelaySharingChange(heard);
    saveRelay(REST);
    saveRelaySharing(false);
    forgetRelay();
    expect(heard).toHaveBeenCalledTimes(3);
    stop();
    saveRelay(REST);
    expect(heard).toHaveBeenCalledTimes(3);
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
    visit.saveRelay(REST);
    expect(storage.getItem("vibewars/VibeWars/next.turn-relay")).toBe(JSON.stringify(REST));

    vi.resetModules();
    const reloaded = await import("./turn-config.js");
    expect(reloaded.loadRelay()).toEqual(REST);
    reloaded.forgetRelay();
    expect(storage.items.size).toBe(0);
  });
});
