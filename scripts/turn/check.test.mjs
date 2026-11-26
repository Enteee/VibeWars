import { describe, expect, it } from "vitest";

import { permissionProbes } from "./check.mjs";

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
  stunProbe: "stun.example:19302",
};

/** @param {string} host */
const lookup = (host) => Promise.resolve(host === "stun.example" ? "198.51.100.20" : "?");

describe("permissionProbes", () => {
  it("wants the stunProbe and the own public address granted, a private one refused", async () => {
    expect(await permissionProbes(BASE, lookup)).toEqual([
      { label: "public", peer: "198.51.100.20", granted: true },
      { label: "own", peer: "203.0.113.7", granted: true },
      { label: "private", peer: "10.255.255.254", granted: false },
    ]);
  });

  it("asks for a private address that is not the host's own", async () => {
    const probes = await permissionProbes(
      { ...BASE, externalIp: "203.0.113.7/10.255.255.254" },
      lookup,
    );
    expect(probes.at(-1)).toEqual({ label: "private", peer: "192.168.255.254", granted: false });
  });

  it("asks only for the private address without an external IP or a stunProbe", async () => {
    expect(await permissionProbes({ ...BASE, externalIp: null, stunProbe: null }, lookup)).toEqual([
      { label: "private", peer: "10.255.255.254", granted: false },
    ]);
  });
});
