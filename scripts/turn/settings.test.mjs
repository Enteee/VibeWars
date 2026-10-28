import { describe, expect, it } from "vitest";

import { parseSettings, turnserverConf } from "./settings.mjs";

/** @type {import("./settings.mjs").TurnSettings} */
const BASE = {
  realm: "turn.example",
  host: "turn.example",
  externalIp: "203.0.113.7/10.0.0.7",
  externalIp6: null,
  listeningIps: [],
  listeningPort: 3478,
  tlsPort: 5349,
  relayPorts: { min: 49160, max: 49200 },
  cert: null,
  key: null,
  stateDir: "/state/turn",
  userQuota: 12,
  totalQuota: 100,
  maxBps: 100000,
  bpsCapacity: 0,
  prometheusPort: 9641,
  stunProbe: "stun.l.google.com:19302",
};

/** @param {string} conf */
const lines = (conf) => conf.split("\n");

describe("turnserverConf", () => {
  const conf = lines(turnserverConf(BASE));

  // A regression guard on the hardening: each of these is a network a relay
  // must never reach, written out here rather than read from DENIED_PEERS.
  it("denies every private, loopback, link-local, CGNAT, reserved, mapped and NAT64 peer", () => {
    for (const range of [
      "0.0.0.0-0.255.255.255",
      "10.0.0.0-10.255.255.255",
      "100.64.0.0-100.127.255.255",
      "127.0.0.0-127.255.255.255",
      "169.254.0.0-169.254.255.255",
      "172.16.0.0-172.31.255.255",
      "192.0.0.0-192.0.0.255",
      "192.168.0.0-192.168.255.255",
      "198.18.0.0-198.19.255.255",
      "240.0.0.0-255.255.255.255",
      "::",
      "::1",
      "::ffff:0.0.0.0-::ffff:255.255.255.255",
      "64:ff9b::-64:ff9b::ffff:ffff",
      "fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      "fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    ]) {
      expect(conf).toContain(`denied-peer-ip=${range}`);
    }
  });

  it("denies the host's own public, private, IPv6 and listening addresses as peers", () => {
    const own = lines(
      turnserverConf({
        ...BASE,
        externalIp: "203.0.113.5/10.0.0.5",
        externalIp6: "2001:db8::5",
        listeningIps: ["203.0.113.5", "198.51.100.9"],
      }),
    );
    for (const ip of ["203.0.113.5", "10.0.0.5", "2001:db8::5", "198.51.100.9"]) {
      expect(own.filter((l) => l === `denied-peer-ip=${ip}`)).toHaveLength(1);
    }
  });

  it("uses long-term credentials from the userdb, UDP relays only, and no CLI", () => {
    expect(conf).toEqual(
      expect.arrayContaining([
        "lt-cred-mech",
        "userdb=/state/turn/turndb",
        "realm=turn.example",
        "fingerprint",
        "no-multicast-peers",
        "no-tcp-relay",
      ]),
    );
    expect(conf.filter((l) => /^cli\b|^cli-/.test(l))).toEqual([]);
  });

  it("serves metrics on localhost only", () => {
    expect(conf).toContain("prometheus");
    expect(conf).toContain("prometheus-address=127.0.0.1");
    expect(conf.filter((l) => l.startsWith("prometheus-address="))).toHaveLength(1);
  });

  it("carries the ports, the external IP mapping and the quotas", () => {
    expect(conf).toEqual(
      expect.arrayContaining([
        "listening-port=3478",
        "min-port=49160",
        "max-port=49200",
        "external-ip=203.0.113.7/10.0.0.7",
        "user-quota=12",
        "total-quota=100",
        "max-bps=100000",
        "log-file=/state/turn/turn.log",
        "pidfile=/state/turn/turnserver.pid",
      ]),
    );
    expect(conf.some((l) => l.startsWith("bps-capacity="))).toBe(false);
  });

  it("listens for TLS only with a certificate", () => {
    expect(conf).toContain("no-tls");
    const withTls = lines(turnserverConf({ ...BASE, cert: "/c.pem", key: "/k.pem" }));
    expect(withTls).toEqual(
      expect.arrayContaining(["tls-listening-port=5349", "cert=/c.pem", "pkey=/k.pem"]),
    );
    expect(withTls).not.toContain("no-tls");
  });
});

describe("parseSettings", () => {
  it("accepts what nix/turn.nix writes", () => {
    expect(parseSettings(JSON.parse(JSON.stringify(BASE)))).toEqual(BASE);
  });

  it("rejects a cert without a key", () => {
    expect(() => parseSettings({ ...BASE, cert: "/c.pem" })).toThrow(/cert and key/);
  });

  it("rejects a backwards relay range", () => {
    expect(() => parseSettings({ ...BASE, relayPorts: { min: 50000, max: 49000 } })).toThrow(
      /relayPorts/,
    );
  });

  it("rejects a missing realm", () => {
    expect(() => parseSettings({ ...BASE, realm: undefined })).toThrow(/realm/);
  });
});
