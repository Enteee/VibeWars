import { describe, expect, it } from "vitest";

import { createLocalPeer } from "./local-peer.js";
import { createMemoryNetwork } from "./memory-transport.js";

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
  }
}

function setup() {
  const network = createMemoryNetwork();
  const remote = network.join("host");
  const other = network.join("other");
  const { host, local } = createLocalPeer(remote);
  return { host, local, other };
}

/**
 * The host's own player as one more peer (#375): the host cannot tell it
 * from a remote one, and it cannot tell the host from a remote host.
 */
describe("createLocalPeer", () => {
  it("shows each side the other as a peer, after the call returns", async () => {
    const { host, local } = setup();
    const atHost: string[] = [];
    const atLocal: string[] = [];
    host.onPeerJoin((id) => atHost.push(id));
    local.onPeerJoin((id) => atLocal.push(id));
    expect([atHost, atLocal]).toEqual([[], []]);
    await settle();
    expect(atHost.sort()).toEqual([local.selfId, "other"].sort());
    expect(atLocal).toEqual([host.selfId]);
  });

  it("delivers a broadcast to the local player and every remote one, a copy each", async () => {
    const { host, local, other } = setup();
    const got: [string, unknown][] = [];
    local.on("snapshot", (data) => got.push(["local", data]));
    other.on("snapshot", (data) => got.push(["other", data]));
    const message = { tick: 1 };
    host.send("snapshot", message);
    expect(got).toEqual([]);
    await settle();
    expect(got.sort()).toEqual([
      ["local", { tick: 1 }],
      ["other", { tick: 1 }],
    ]);
    expect(got[0]?.[1]).not.toBe(message);
  });

  it("sends to the local player alone, or past it to a remote one alone", async () => {
    const { host, local, other } = setup();
    const got: string[] = [];
    local.on("refused", () => got.push("local"));
    other.on("refused", () => got.push("other"));
    host.send("refused", null, local.selfId);
    host.send("refused", null, "other");
    await settle();
    expect(got.sort()).toEqual(["local", "other"]);
  });

  it("sends to a list that names the local player, a remote one, or both", async () => {
    const network = createMemoryNetwork();
    const remote = network.join("host");
    const other = network.join("other");
    const third = network.join("third");
    const { host, local } = createLocalPeer(remote);
    const got: string[] = [];
    local.on("refused", (data) => got.push(`local ${String(data)}`));
    other.on("refused", (data) => got.push(`other ${String(data)}`));
    third.on("refused", (data) => got.push(`third ${String(data)}`));
    host.send("refused", 1, [local.selfId, "other"]);
    host.send("refused", 2, [local.selfId]);
    host.send("refused", 3, ["third"]);
    host.send("refused", 4, []);
    await settle();
    expect(got.sort()).toEqual(["local 1", "local 2", "other 1", "third 3"]);
  });

  it("hands the host what the local player sends, from the local player", async () => {
    const { host, local, other } = setup();
    const got: [string, unknown][] = [];
    host.on("intent", (data, from) => got.push([from, data]));
    local.send("intent", { kind: "stop" });
    other.send("intent", { kind: "stop" }, "host");
    await settle();
    expect(got.sort()).toEqual([
      [local.selfId, { kind: "stop" }],
      ["other", { kind: "stop" }],
    ]);
  });

  it("shows the host the local player leave, and the local player the host leave", async () => {
    const first = setup();
    const left: string[] = [];
    first.host.onPeerLeave((id) => left.push(id));
    await settle();
    await first.local.leave();
    await settle();
    expect(left).toEqual([first.local.selfId]);

    const second = setup();
    const gone: string[] = [];
    second.local.onPeerLeave((id) => gone.push(id));
    await settle();
    await second.host.leave();
    await settle();
    expect(gone).toEqual([second.host.selfId]);
  });

  it("delivers nothing to a side that has left", async () => {
    const { host, local } = setup();
    const got: unknown[] = [];
    local.on("snapshot", (data) => got.push(data));
    host.send("snapshot", 1);
    await local.leave();
    await settle();
    expect(got).toEqual([]);
  });
});
