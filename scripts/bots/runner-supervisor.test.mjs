import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ApiError,
  BACKOFF_MAX_MS,
  CREDENTIAL_ALERT,
  DRAIN_MS,
  LABEL,
  MEMORY_HEADROOM,
  POLL_MS,
  RunnerSupervisor,
  backoffMs,
  diskCapRefusal,
  ghEnv,
  launcherArgs,
  launcherEnvOf,
  parseRunners,
  spawnLauncher,
} from "./runner-supervisor.mjs";

const GIB = 1024 ** 3;
const JIT = "c2VjcmV0LWppdC1jb25maWc=";

/**
 * A supervisor on a fake clock, API, launcher and host. Every call is
 * recorded in `calls`, in order.
 *
 * @param {{ max?: number, target?: number }} [options]
 */
function rig({ max = 4, target = 1 } = {}) {
  const t = { now: 1_000_000 };
  /** @type {string[]} */
  const calls = [];
  /** @type {string[]} */
  const logs = [];
  /** @type {import("./runners-state.mjs").RunnersStatus[]} */
  const statuses = [];
  /** @type {{ jitconfig: string, exit: (code: number) => void, killed: boolean }[]} */
  const launched = [];
  /** @type {import("./runner-supervisor.mjs").GithubRunner[]} */
  let github = [];
  /** @type {Error | null} */
  let mintError = null;
  let queued = false;
  const host = { free: 64 * GIB, load: 0.5, cpus: 8, disk: /** @type {string | null} */ (null) };
  const state = { target: { n: target, reason: /** @type {string | null} */ (null) } };
  let ids = 100;

  /** @type {import("./runner-supervisor.mjs").Api} */
  const api = {
    async mint(name) {
      await Promise.resolve();
      calls.push(`mint ${name}`);
      if (mintError !== null) {
        throw mintError;
      }
      ids += 1;
      github.push({ id: ids, name, status: "online", busy: false, labels: ["self-hosted", LABEL] });
      return { id: ids, jitconfig: JIT };
    },
    async list() {
      await Promise.resolve();
      calls.push("list");
      return github.map((runner) => ({ ...runner }));
    },
    async remove(id) {
      await Promise.resolve();
      calls.push(`remove ${String(id)}`);
      github = github.filter((runner) => runner.id !== id);
    },
    async setVariable(on) {
      await Promise.resolve();
      calls.push(`variable ${on ? "1" : "0"}`);
    },
    async queuedCompanyJobs() {
      await Promise.resolve();
      calls.push("queued?");
      return queued;
    },
  };
  const supervisor = new RunnerSupervisor({
    now: () => t.now,
    api,
    launch(jitconfig) {
      /** @type {(code: number) => void} */
      let resolve = Number;
      /** @type {Promise<number>} */
      const promise = new Promise((done) => {
        resolve = done;
      });
      const entry = {
        jitconfig,
        killed: false,
        exit: (/** @type {number} */ code) => {
          resolve(code);
        },
      };
      launched.push(entry);
      return {
        exited: promise,
        kill: () => {
          entry.killed = true;
          resolve(143);
        },
      };
    },
    host: {
      freeBytes: () => host.free,
      load1: () => host.load,
      cpus: () => host.cpus,
      diskCapRefusal: () => host.disk,
    },
    readTarget: () => state.target,
    writeStatus: (status) => statuses.push(status),
    log: (line) => logs.push(line),
    config: { max, hostName: "box", memoryBytes: 6 * GIB },
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    t,
    calls,
    logs,
    statuses,
    launched,
    host,
    state,
    supervisor,
    settle,
    get github() {
      return github;
    },
    set github(value) {
      github = value;
    },
    /** @param {Error | null} error */
    failMint(error) {
      mintError = error;
    },
    /** @param {boolean} value */
    setQueued(value) {
      queued = value;
    },
    last: () => statuses.at(-1),
  };
}

describe("runner supervisor", () => {
  it("starts the target, then sets COMPANY_RUNNERS to 1", async () => {
    const r = rig({ target: 2 });
    await r.supervisor.tick();
    expect(r.calls.filter((call) => !call.startsWith("list"))).toEqual([
      expect.stringMatching(/^mint vibewars-box-/),
      expect.stringMatching(/^mint vibewars-box-/),
      "variable 1",
    ]);
    expect(r.launched).toHaveLength(2);
    expect(r.last()).toMatchObject({ target: 2, max: 4, variable: true, reason: null });
    expect(r.last()?.runners).toHaveLength(2);
  });

  it("replaces a runner that took its job and exited", async () => {
    const r = rig();
    await r.supervisor.tick();
    r.launched[0]?.exit(0);
    await r.settle();
    expect(r.supervisor.alive).toBe(0);
    await r.supervisor.tick();
    expect(r.launched).toHaveLength(2);
    expect(r.calls.filter((call) => call.startsWith("mint"))).toHaveLength(2);
  });

  it("backs off on repeated failures, doubling to 5 min, and a job resets it", async () => {
    const r = rig();
    await r.supervisor.tick();
    r.launched[0]?.exit(1);
    await r.settle();
    expect(r.last()?.reason).toMatch(/backing off 5 s after 1 failure/);
    await r.supervisor.tick();
    expect(r.launched).toHaveLength(1);
    r.t.now += 5_000;
    await r.supervisor.tick();
    expect(r.launched).toHaveLength(2);
    r.launched[1]?.exit(1);
    await r.settle();
    expect(r.last()?.reason).toMatch(/backing off 10 s after 2 failure/);
    expect([1, 2, 3, 7, 20].map(backoffMs)).toEqual([
      5_000,
      10_000,
      20_000,
      BACKOFF_MAX_MS,
      BACKOFF_MAX_MS,
    ]);
    r.t.now += 10_000;
    await r.supervisor.tick();
    for (const runner of r.github) {
      runner.busy = true;
    }
    await r.supervisor.refreshBusy();
    r.launched[2]?.exit(0);
    await r.settle();
    expect(r.supervisor.failures).toBe(0);
    await r.supervisor.tick();
    expect(r.launched).toHaveLength(4);
    expect(r.last()?.reason).toBeNull();
  });

  it("removes the registration of a runner that exits without a job", async () => {
    const r = rig({ target: 2 });
    await r.supervisor.tick();
    const [failed, idle] = r.github.map((runner) => runner.id);
    r.launched[0]?.exit(1);
    r.launched[1]?.exit(0);
    await r.settle();
    expect(r.calls).toContain(`remove ${String(failed)}`);
    expect(r.calls).toContain(`remove ${String(idle)}`);
    expect(r.github).toHaveLength(0);
  });

  it("an exit 0 GitHub never saw busy does not reset the back-off", async () => {
    const r = rig();
    await r.supervisor.tick();
    r.launched[0]?.exit(1);
    await r.settle();
    r.t.now += 5_000;
    await r.supervisor.tick();
    // An expired JIT config: the runner exits 0 without taking a job.
    r.launched[1]?.exit(0);
    await r.settle();
    expect(r.supervisor.failures).toBe(1);
  });

  it("does not start a runner on an overloaded host, and that is no failure", async () => {
    const r = rig();
    r.host.free = 6 * GIB + MEMORY_HEADROOM - 1;
    await r.supervisor.tick();
    expect(r.launched).toHaveLength(0);
    expect(r.last()?.reason).toBe("not starting a runner: host memory is short");
    r.host.free = 64 * GIB;
    r.host.load = 9;
    await r.supervisor.tick();
    expect(r.last()?.reason).toBe("not starting a runner: host load is above its CPU count");
    expect(r.supervisor.failures).toBe(0);
    r.host.load = 1;
    await r.supervisor.tick();
    expect(r.launched).toHaveLength(1);
    expect(r.last()?.reason).toBeNull();
  });

  it("refuses to start without the disk cap, and says why", async () => {
    const r = rig();
    r.host.disk = "no disk cap: /s is on the same filesystem as /home; mount one of its own there";
    await r.supervisor.tick();
    expect(r.launched).toHaveLength(0);
    expect(r.calls.some((call) => call.startsWith("mint"))).toBe(false);
    expect(r.last()).toMatchObject({ reason: r.host.disk, variable: false });
  });

  it("scaling to 0 flips the variable to 0 first, and keeps a runner while company jobs queue", async () => {
    const r = rig({ target: 2 });
    await r.supervisor.tick();
    r.calls.length = 0;
    r.setQueued(true);
    r.state.target = { n: 0, reason: null };
    await r.supervisor.tick();
    expect(r.calls[0]).toBe("variable 0");
    expect(r.calls).toContain("queued?");
    await r.settle();
    expect(r.supervisor.alive).toBe(1);
    expect(r.launched.filter((l) => l.killed)).toHaveLength(1);
    // Polled at most once a minute.
    r.calls.length = 0;
    await r.supervisor.tick();
    expect(r.calls).not.toContain("queued?");
    r.t.now += POLL_MS;
    r.setQueued(false);
    await r.supervisor.tick();
    expect(r.calls).toContain("queued?");
    await r.settle();
    expect(r.supervisor.alive).toBe(0);
    expect(r.last()).toMatchObject({ target: 0, variable: false, runners: [] });
  });

  it("gives up waiting for queued jobs after 10 minutes", async () => {
    const r = rig();
    await r.supervisor.tick();
    r.setQueued(true);
    r.state.target = { n: 0, reason: null };
    await r.supervisor.tick();
    expect(r.supervisor.alive).toBe(1);
    r.t.now += DRAIN_MS;
    await r.supervisor.tick();
    await r.settle();
    expect(r.supervisor.alive).toBe(0);
    expect(r.logs).toContain("runners: gave up waiting for queued company jobs");
  });

  it("scaling down kills idle runners and lets busy ones finish", async () => {
    const r = rig({ target: 3 });
    await r.supervisor.tick();
    const [first] = r.github;
    if (first !== undefined) {
      first.busy = true;
    }
    r.state.target = { n: 1, reason: null };
    await r.supervisor.tick();
    await r.settle();
    expect(r.launched.map((l) => l.killed)).toEqual([false, true, true]);
    expect(r.supervisor.alive).toBe(1);
    // The killed idle runners' registrations go too.
    expect(r.calls.filter((call) => call.startsWith("remove"))).toHaveLength(2);
  });

  it("removes only our offline leftovers, at start and at stop", async () => {
    const r = rig({ target: 0 });
    r.github = [
      { id: 1, name: "vibewars-box-old-1", status: "offline", busy: false, labels: [LABEL] },
      { id: 2, name: "vibewars-box-old-2", status: "online", busy: true, labels: [LABEL] },
      { id: 3, name: "someone-else", status: "offline", busy: false, labels: ["self-hosted"] },
      { id: 4, name: "vibewars-boxer-old-1", status: "offline", busy: false, labels: [LABEL] },
    ];
    await r.supervisor.tick();
    expect(r.calls.filter((call) => call.startsWith("remove"))).toEqual(["remove 1"]);
    r.state.target = { n: 1, reason: null };
    await r.supervisor.tick();
    const ours = r.github.find(
      (runner) => runner.name.startsWith("vibewars-box-") && runner.id > 100,
    );
    if (ours !== undefined) {
      ours.status = "offline";
    }
    r.calls.length = 0;
    await r.supervisor.stop();
    // "0" first, then the runners stop, then the leftovers go.
    expect(r.calls[0]).toBe("variable 0");
    expect(r.launched[0]?.killed).toBe(true);
    expect(r.calls).toContain(`remove ${String(ours?.id)}`);
    expect(r.calls).not.toContain("remove 2");
    expect(r.calls).not.toContain("remove 3");
    expect(r.calls).not.toContain("remove 4");
  });

  it("reports a refused credential once, and clears it when it works", async () => {
    const r = rig();
    r.failMint(new ApiError("POST …/generate-jitconfig: HTTP 403", 403));
    await r.supervisor.tick();
    r.t.now += BACKOFF_MAX_MS;
    await r.supervisor.tick();
    expect(r.last()?.alert).toBe(CREDENTIAL_ALERT);
    expect(r.logs.filter((line) => line.includes(CREDENTIAL_ALERT))).toHaveLength(1);
    expect(r.statuses.filter((s) => s.alert !== null).length).toBeGreaterThan(0);
    r.failMint(null);
    r.t.now += BACKOFF_MAX_MS;
    await r.supervisor.tick();
    expect(r.last()?.alert).toBeNull();
  });

  it("a rate limit backs off without blaming the credential", async () => {
    const r = rig();
    r.failMint(new ApiError("POST …: HTTP 403 (rate limit)", 403));
    await r.supervisor.tick();
    expect(r.last()?.alert).toBeNull();
    expect(r.last()?.reason).toMatch(/backing off/);
  });

  it("makes no GitHub call when the max is 0", async () => {
    const r = rig({ max: 0, target: 0 });
    await r.supervisor.tick();
    await r.supervisor.stop();
    expect(r.calls).toEqual([]);
    expect(r.last()?.reason).toBe("runners are off: VIBEWARS_MAX_RUNNERS is 0");
  });

  it("shows a refused target as the reason, at 0", async () => {
    const r = rig();
    r.state.target = { n: 0, reason: "the target is not a whole number; treated as 0" };
    await r.supervisor.tick();
    expect(r.launched).toHaveLength(0);
    expect(r.last()).toMatchObject({ target: 0, reason: r.state.target.reason });
  });

  it("hands the JIT config to the launcher alone: no log line or status holds it", async () => {
    const r = rig({ target: 2 });
    await r.supervisor.tick();
    r.launched[0]?.exit(1);
    await r.settle();
    expect(r.launched.map((l) => l.jitconfig)).toEqual([JIT, JIT]);
    expect(r.logs.join("\n")).not.toContain(JIT);
    expect(JSON.stringify(r.statuses)).not.toContain(JIT);
    const args = launcherArgs({ cpus: 2, memoryGib: 6, tasksMax: 2048 });
    expect(args.slice(0, 2)).toEqual(["--jitconfig", "-"]);
    expect(args.some((arg) => arg.includes(JIT))).toBe(false);
  });

  it("a runner the stop's signal reaches first is no failure", async () => {
    const r = rig();
    await r.supervisor.tick();
    const stopping = r.supervisor.stop();
    // The group's SIGTERM, before `stop` has marked it.
    r.launched[0]?.exit(128);
    await stopping;
    expect(r.supervisor.failures).toBe(0);
    expect(r.last()?.reason).toBeNull();
  });

  it("starts nothing once stopped", async () => {
    const r = rig();
    await r.supervisor.stop();
    await r.supervisor.tick();
    expect(r.launched).toHaveLength(0);
  });
});

describe("launchers", () => {
  const url = (/** @type {string} */ name) => new URL(name, import.meta.url).href;
  /** Stands in for runner-jail.mjs: reads its JIT config, then waits on its lifeline. */
  const LAUNCHER = `
    import fs from "node:fs";
    import { watchLifeline } from ${JSON.stringify(url("./runner-jail.mjs"))};
    fs.readFileSync(0, "utf8");
    await watchLifeline(3).cut;
    fs.writeFileSync(process.argv[2], "stopped");
  `;
  /** Stands in for the supervisor: two launchers, then nothing until it is killed. */
  const SUPERVISOR = `
    import { spawnLauncher } from ${JSON.stringify(url("./runner-supervisor.mjs"))};
    const [launcher, ...markers] = process.argv.slice(2);
    for (const marker of markers) {
      spawnLauncher(process.execPath, [launcher, marker], {}, "jit");
    }
    process.stdout.write("up\\n");
    setInterval(() => {}, 60_000);
  `;

  it("stop when their supervisor dies, even of a SIGKILL", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeline-"));
    const markers = ["a", "b"].map((name) => path.join(dir, name));
    // Files, not `-e`: the supervisor's own main checks its argv[1].
    const launcher = path.join(dir, "launcher.mjs");
    const fake = path.join(dir, "supervisor.mjs");
    fs.writeFileSync(launcher, LAUNCHER);
    fs.writeFileSync(fake, SUPERVISOR);
    const supervisor = spawn(process.execPath, [fake, launcher, ...markers], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    await new Promise((resolve) => supervisor.stdout.once("data", resolve));
    expect(markers.filter((marker) => fs.existsSync(marker))).toEqual([]);
    supervisor.kill("SIGKILL");
    const deadline = Date.now() + 10_000;
    while (!markers.every((marker) => fs.existsSync(marker)) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(markers.filter((marker) => fs.existsSync(marker))).toEqual(markers);
  });

  it("one that exits unread, or never starts, is an exit code, not a crash", async () => {
    // More than a pipe holds, so the write breaks once the launcher is gone.
    const jitconfig = "x".repeat(1 << 20);
    const unread = spawnLauncher(process.execPath, ["-e", "process.exit(2)"], {}, jitconfig);
    expect(await unread.exited).toBe(2);
    const missing = spawnLauncher(path.join(os.tmpdir(), "no-such-launcher"), [], {}, jitconfig);
    expect(await missing.exited).toBe(1);
  });
});

describe("gh environment", () => {
  it("carries the runners' config dir and nothing of the company's", () => {
    const env = ghEnv(
      {
        PATH: "/bin",
        HOME: "/home/op",
        GH_CONFIG_DIR: "/creds/gh",
        GH_TOKEN: "company",
        GITHUB_TOKEN: "x",
        VIBEWARS_CREDENTIALS: "/creds",
      },
      "/creds/runners-gh",
    );
    expect(env.GH_CONFIG_DIR).toBe("/creds/runners-gh");
    expect(Object.keys(env).sort()).toEqual([
      "GH_CONFIG_DIR",
      "GH_NO_UPDATE_NOTIFIER",
      "GH_PROMPT_DISABLED",
      "HOME",
      "PATH",
    ]);
    expect(JSON.stringify(env)).not.toContain('/creds/gh"');
  });
});

describe("gh api", () => {
  /** Fifty mints at once against a gh that answers 403 and never reads stdin. */
  const MINTS = `
    import { ApiError, ghEnv, githubApi } from ${JSON.stringify(new URL("./runner-supervisor.mjs", import.meta.url).href)};
    const [dir] = process.argv.slice(2);
    const api = githubApi("o/r", ghEnv({ PATH: \`\${dir}:\${process.env.PATH ?? ""}\` }, dir));
    const minted = await Promise.allSettled(Array.from({ length: 50 }, (_, i) => api.mint(\`r\${i}\`)));
    const statuses = minted.map((m) => (m.status === "rejected" && m.reason instanceof ApiError ? m.reason.status : null));
    process.stdout.write(JSON.stringify(statuses));
  `;

  it("a gh that exits before reading its body is an ApiError, not a crash", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-gh-"));
    // An expired credential: gh answers at once and never reads stdin.
    fs.writeFileSync(path.join(dir, "gh"), '#!/bin/sh\necho "HTTP 403" >&2\nexit 1\n', {
      mode: 0o755,
    });
    // A file, not \`-e\`: the supervisor's own main checks its argv[1]. Its own
    // process, too: inside the test worker the writes win the race.
    const script = path.join(dir, "mints.mjs");
    fs.writeFileSync(script, MINTS);
    const child = spawn(process.execPath, [script, dir], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (/** @type {Buffer} */ chunk) => (out += chunk.toString("utf8")));
    child.stderr.on("data", (/** @type {Buffer} */ chunk) => (err += chunk.toString("utf8")));
    /** @type {number | null} */
    const code = await new Promise((resolve) => {
      child.once("close", (/** @type {number | null} */ exit) => {
        resolve(exit);
      });
    });
    expect({ code, err }).toEqual({ code: 0, err: "" });
    expect(/** @type {unknown} */ (JSON.parse(out))).toEqual(Array(50).fill(403));
  });
});

describe("disk cap", () => {
  /** @param {Record<string, number>} devs */
  const stat = (devs) => (/** @type {string} */ file) => {
    const dev = devs[file];
    if (dev === undefined) {
      throw new Error("ENOENT");
    }
    return { dev };
  };

  it("passes a scratch dir on a filesystem of its own", () => {
    expect(
      diskCapRefusal("/s", ["/bots", "/home"], stat({ "/s": 3, "/bots": 1, "/home": 1 })),
    ).toBeNull();
  });

  it("refuses one that shares a disk with the company, or is missing", () => {
    expect(diskCapRefusal("/s", ["/bots", "/home"], stat({ "/s": 1, "/bots": 1 }))).toMatch(
      /same filesystem as \/bots/,
    );
    expect(diskCapRefusal("/s", ["/bots"], stat({ "/bots": 1 }))).toMatch(/does not exist/);
  });
});

describe("parseRunners", () => {
  it("reads GitHub's runner list", () => {
    expect(
      parseRunners({
        runners: [
          { id: 7, name: "a", status: "online", busy: true, labels: [{ name: LABEL }] },
          { id: "x", name: "bad" },
        ],
      }),
    ).toEqual([{ id: 7, name: "a", status: "online", busy: true, labels: [LABEL] }]);
  });
});

describe("launcherEnvOf (#1988)", () => {
  const base = { PATH: "/bin", HOME: "/home/op", VIBEWARS_RUNNER_SCRATCH: "/s" };
  const company = { PATH: "/bin", HOME: "/home/op", VIBEWARS_CREDENTIALS: "/secret" };

  it("passes the user bus when both are set, and nothing else of the env", () => {
    const env = {
      ...company,
      XDG_RUNTIME_DIR: "/run/user/1000",
      DBUS_SESSION_BUS_ADDRESS: "unix:x",
    };
    expect(launcherEnvOf(env, "/s")).toEqual({
      ...base,
      XDG_RUNTIME_DIR: "/run/user/1000",
      DBUS_SESSION_BUS_ADDRESS: "unix:x",
    });
  });

  it("passes the one that is set", () => {
    const env = { ...company, XDG_RUNTIME_DIR: "/run/user/1000" };
    expect(launcherEnvOf(env, "/s")).toEqual({ ...base, XDG_RUNTIME_DIR: "/run/user/1000" });
  });

  it("passes neither when neither is set", () => {
    expect(launcherEnvOf(company, "/s")).toEqual(base);
  });
});
