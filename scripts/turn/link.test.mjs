import { describe, expect, it } from "vitest";

import { encodeTurnFragment, inviteLink, turnUrls } from "./link.mjs";
import { parseSettings } from "./settings.mjs";

const settings = parseSettings({
  realm: "turn.example",
  host: "turn.example",
  externalIp: null,
  externalIp6: null,
  listeningIps: [],
  listeningPort: 3478,
  tlsPort: 5349,
  relayPorts: { min: 49160, max: 49200 },
  cert: null,
  key: null,
  stateDir: "/state",
  userQuota: 12,
  totalQuota: 100,
  maxBps: 100000,
  bpsCapacity: 0,
  prometheusPort: 9641,
  stunProbe: null,
});

/**
 * #972's format, decoded by hand: base64url of the JSON, no padding.
 *
 * @param {string} link
 * @returns {unknown}
 */
function decode(link) {
  const m = /#turn=([A-Za-z0-9_-]+)$/.exec(link);
  if (m === null) throw new Error(`no #turn= in ${link}`);
  /** @type {unknown} */
  const config = JSON.parse(Buffer.from(m[1] ?? "", "base64url").toString("utf8"));
  return config;
}

describe("invite links", () => {
  const config = { urls: turnUrls(settings), username: "alice", credential: "s3cr+t/=" };

  it("carry the config as unpadded base64url JSON in the fragment", () => {
    const link = inviteLink("https://enteee.github.io/VibeWars/next/", config);
    expect(link.startsWith("https://enteee.github.io/VibeWars/next/#turn=")).toBe(true);
    expect(link).not.toMatch(/=$|[+/]\w*$/);
    expect(decode(link)).toEqual(config);
  });

  it("replace a fragment the base already has", () => {
    expect(inviteLink("https://x.example/#lobby", config)).toBe(
      `https://x.example/${encodeTurnFragment(config)}`,
    );
  });

  it("name UDP and TCP, and TLS only when it is configured", () => {
    expect(turnUrls(settings)).toEqual([
      "turn:turn.example:3478?transport=udp",
      "turn:turn.example:3478?transport=tcp",
    ]);
    expect(turnUrls({ ...settings, cert: "/c", key: "/k" })).toContain(
      "turns:turn.example:5349?transport=tcp",
    );
  });

  it("bracket an IPv6 host and fall back to the external IP's public part", () => {
    expect(turnUrls({ ...settings, host: "2001:db8::1" })[0]).toBe(
      "turn:[2001:db8::1]:3478?transport=udp",
    );
    expect(turnUrls({ ...settings, host: null, externalIp: "203.0.113.7/10.0.0.7" })[0]).toBe(
      "turn:203.0.113.7:3478?transport=udp",
    );
    expect(() => turnUrls({ ...settings, host: null })).toThrow(/host/);
  });
});
