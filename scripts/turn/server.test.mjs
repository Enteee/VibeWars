/**
 * A real turnserver (#974), started from the module's generated config on
 * loopback ports picked free now, with its state in a temp dir. No network:
 * it runs in CI's devenv, which has coturn. DENIED_PEERS refuses 127/8, so
 * the allocation check allocates and releases; it relays to no peer. The
 * external IP is a documentation address mapped onto a private one, so the
 * permission checks ask for the host's own public address (#1266).
 */
import { spawn, spawnSync } from "node:child_process";
import dgram from "node:dgram";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { healthy, runChecks } from "./check.mjs";
import { files, parseSettings, turnserverConf } from "./settings.mjs";
import { allocate, binding, permissions } from "./stun.mjs";

const TURN = path.join(import.meta.dirname, "turn.mjs");

/** @returns {Promise<number>} a UDP port free right now */
function freeUdp() {
  return new Promise((resolve) => {
    const s = dgram.createSocket("udp4");
    s.bind(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => {
        resolve(port);
      });
    });
  });
}

/** @returns {Promise<number>} a TCP port free right now */
function freeTcp() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const address = s.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      s.close(() => {
        resolve(port);
      });
    });
  });
}

/** @type {string} */
let dir;
/** @type {import("./settings.mjs").TurnSettings} */
let settings;
/** @type {import("node:child_process").ChildProcess | null} */
let server = null;

/**
 * @param {string[]} args
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
function turn(args) {
  return spawnSync(process.execPath, [TURN, ...args], {
    encoding: "utf8",
    env: { ...process.env, VIBEWARS_TURN_SETTINGS: path.join(dir, "settings.json") },
  });
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibewars-turn-"));
  const relay = 40000 + Math.floor(Math.random() * 20000);
  settings = parseSettings({
    realm: "turn.test",
    host: "127.0.0.1",
    externalIp: "203.0.113.7/10.0.0.7",
    externalIp6: null,
    listeningIps: ["127.0.0.1"],
    listeningPort: await freeUdp(),
    tlsPort: await freeTcp(),
    // As wide as the deployed 49160-49200: each permission probe is an
    // allocation of its own (#1379), and a released one holds its port a moment.
    relayPorts: { min: relay, max: relay + 40 },
    cert: null,
    key: null,
    stateDir: path.join(dir, "state"),
    userQuota: 12,
    totalQuota: 100,
    maxBps: 100000,
    bpsCapacity: 0,
    prometheusPort: await freeTcp(),
    stunProbe: null,
  });
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify(settings));
  fs.mkdirSync(settings.stateDir, { mode: 0o700 });
  fs.writeFileSync(files(settings).conf, turnserverConf(settings));
  server = spawn("turnserver", ["-c", files(settings).conf], { stdio: "ignore" });
  // Ready is answering a Binding: the pid file does not mean the UDP
  // listener is up, and a check's single request would be lost to it.
  const give = Date.now() + 10_000;
  for (;;) {
    try {
      await binding("127.0.0.1", settings.listeningPort, 250);
      break;
    } catch (e) {
      if (Date.now() > give)
        throw new Error("turnserver answered no Binding in 10 s", { cause: e });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  while (!fs.existsSync(files(settings).pid)) {
    if (Date.now() > give) throw new Error("turnserver wrote no pid file in 10 s");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}, 20_000);

afterAll(async () => {
  if (server !== null && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise((resolve) => server?.once("exit", resolve));
    server.kill();
    await exited;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("a real turnserver", () => {
  /** @type {string} */
  let password = "";

  it("adds a user, prints the password once, and lists them", () => {
    const add = turn(["user", "add", "alice", "--base", "https://play.example/"]);
    expect(add.stderr).toBe("");
    expect(add.status).toBe(0);
    password = /^password: (\S+)$/m.exec(add.stdout)?.[1] ?? "";
    expect(password).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(add.stdout).toMatch(/^link: {5}https:\/\/play\.example\/#turn=[A-Za-z0-9_-]+$/m);
    expect(turn(["user", "list"]).stdout).toBe("alice\n");
  });

  it("passes turn-check, and hides the health user it made", async () => {
    const checks = await runChecks(settings);
    expect(checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(healthy(checks)).toBe(true);
    expect(fs.statSync(files(settings).healthSecret).mode & 0o777).toBe(0o600);
    expect(turn(["user", "list"]).stdout).toBe("alice\n");
    expect(turn(["check"]).status).toBe(0);
  });

  // #1266: `denied-peer-ip=::` refused every peer, and the host's own
  // address was refused, so two players on one relay never connected.
  it("grants a public peer and the host's own address, and refuses private ones", async () => {
    const res = await permissions({
      host: "127.0.0.1",
      port: settings.listeningPort,
      username: "alice",
      password,
      peers: ["198.51.100.20", "203.0.113.7", "10.0.0.1", "192.168.1.1", "127.0.0.1"],
    });
    // A 403's reason phrase is coturn's to word (4.x leaves it empty). Any
    // other code keeps its reason, so an unexpected one says why in the diff.
    const answers = res.ok
      ? res.answers.map((a) => (a.code === 403 ? { ...a, reason: "-" } : a))
      : res;
    expect(answers).toEqual([
      { peer: "198.51.100.20", code: null, reason: null },
      { peer: "203.0.113.7", code: null, reason: null },
      { peer: "10.0.0.1", code: 403, reason: "-" },
      { peer: "192.168.1.1", code: 403, reason: "-" },
      { peer: "127.0.0.1", code: 403, reason: "-" },
    ]);
    const checks = await runChecks(settings);
    expect(checks.find((c) => c.name === "permissions")).toMatchObject({ status: "ok" });
  });

  it("lets the user allocate until they are removed, then answers 401", async () => {
    const as = { host: "127.0.0.1", port: settings.listeningPort, username: "alice", password };
    expect(await allocate(as)).toMatchObject({ ok: true });
    expect(turn(["user", "remove", "alice"]).status).toBe(0);
    expect(await allocate(as)).toEqual({ ok: false, code: 401 });
    expect(turn(["user", "list"]).stdout).toBe("");
  });

  it("fails turn-check once the server is gone", async () => {
    server?.kill();
    await new Promise((resolve) => server?.once("exit", resolve));
    server = null;
    const checks = await runChecks(settings);
    expect(checks.find((c) => c.name === "process")?.status).toBe("fail");
    expect(healthy(checks)).toBe(false);
  });
});
