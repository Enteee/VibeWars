/**
 * The supervisor's loop and the pane starter, together, against a tmux server
 * of their own and a stub in place of the agent (#722). Never the default
 * socket: TMUX_TMPDIR points at a scratch directory and TMUX is dropped,
 * which would otherwise name the operator's server when this runs inside one.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseStaff } from "./staff.mjs";
import { startEmployee } from "./start-employee.mjs";
import { afterManagerStart, supervise } from "./supervisor.mjs";

const HOLDOFF_MS = 1500;
const SAMPLE_MS = 100;
// The stub stamps its own exec time, a little after the supervisor stamps the start it holds off from.
const MARGIN_MS = 2 * SAMPLE_MS;
const SESSION = `vibewars-llc-test-${String(process.pid)}`;

/** @type {{ dir: string, root: string, cwd: string, run: () => void, stop: () => Promise<void> } | null} */
let rig = null;
const saved = { tmpdir: process.env.TMUX_TMPDIR, tmux: process.env.TMUX, path: process.env.PATH };

/**
 * @param {string[]} args
 * @returns {string}
 */
function tmux(args) {
  return spawnSync("tmux", args, { encoding: "utf8" }).stdout;
}

/** @returns {string[]} one "window employee" line per pane, sorted */
function panes() {
  return tmux(["list-panes", "-s", "-t", `=${SESSION}`, "-F", "#{window_name} #{@employee}"])
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("dashboard"))
    .sort();
}

/**
 * @param {() => boolean} done
 * @param {string} what
 * @returns {Promise<void>}
 */
async function until(done, what) {
  const give = Date.now() + 10_000;
  while (!done()) {
    if (Date.now() > give) {
      throw new Error(`timed out waiting for ${what}; panes: ${JSON.stringify(panes())}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * @param {string[]} working
 * @param {{ firing?: string[] }} [options]
 */
function writeStaff(working, { firing = [] } = {}) {
  const now = Date.now();
  /** @type {Record<string, unknown>} */
  const employees = {};
  for (const id of [...working, ...firing]) {
    employees[id] = {
      role: id.split("@")[0],
      hiredAt: now - 3_600_000,
      by: "operator",
      reason: "test",
      state: firing.includes(id) ? "firing" : "working",
      readyAt: null,
    };
  }
  const recent = firing.map((id) => ({ id, change: "fire", at: now }));
  fs.writeFileSync(path.join(rig?.root ?? "", "staff.json"), JSON.stringify({ employees, recent }));
}

/** @returns {string[]} the employees in staff.json */
function staffed() {
  return Object.keys(
    parseStaff(fs.readFileSync(path.join(rig?.root ?? "", "staff.json"), "utf8")).employees,
  ).sort();
}

/** @param {string} employee @returns {number[]} the stub's start times for it, in ms */
function starts(employee) {
  const log = path.join(rig?.dir ?? "", "starts.log");
  return fs.existsSync(log)
    ? fs
        .readFileSync(log, "utf8")
        .split("\n")
        .filter((line) => line.startsWith(`${employee} `))
        .map((line) => Number(line.split(" ")[1]) / 1e6)
    : [];
}

/** @param {string} pid @returns {boolean} */
function alive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sv-"));
  const root = path.join(dir, "root");
  const cwd = path.join(dir, "cwd");
  const bin = path.join(dir, "bin");
  for (const d of [root, cwd, bin, path.join(dir, "t")]) {
    fs.mkdirSync(d);
  }
  // The stub agent logs its start, leaves a child behind (the jail's stand-in)
  // and waits; one with a crash-<id> file exits at once.
  fs.writeFileSync(
    path.join(bin, "claude-llc-agent"),
    [
      "#!/bin/sh",
      `echo "$1 $(date +%s%N)" >>${dir}/starts.log`,
      `[ -e ${dir}/crash-$1 ] && exit 1`,
      "sleep 600 &",
      `echo $! >${dir}/child-$1`,
      "wait",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  delete process.env.TMUX;
  process.env.TMUX_TMPDIR = path.join(dir, "t");
  process.env.PATH = `${bin}:${saved.path ?? ""}`;
  spawnSync("tmux", ["new-session", "-d", "-s", SESSION, "-n", "dashboard", "sleep 600"], {
    encoding: "utf8",
  });
  const abort = new AbortController();
  /** @type {Promise<void> | null} */
  let running = null;
  rig = {
    dir,
    root,
    cwd,
    run: () => {
      running = supervise({
        root,
        session: SESSION,
        tmux: "tmux",
        cwd,
        sampleMs: SAMPLE_MS,
        killGraceMs: 300,
        holdoffMs: HOLDOFF_MS,
        restarter: undefined,
        signal: abort.signal,
      });
    },
    stop: async () => {
      abort.abort();
      await running;
    },
  };
});

afterEach(async () => {
  // rig is set only once the private server's environment is: without it,
  // kill-server would name the caller's own server.
  if (rig !== null) {
    await rig.stop();
    spawnSync("tmux", ["kill-server"], { encoding: "utf8" });
    // The stubs' children outlive their panes unless the supervisor stopped them.
    for (const file of fs.readdirSync(rig.dir).filter((f) => f.startsWith("child-"))) {
      try {
        process.kill(Number(fs.readFileSync(path.join(rig.dir, file), "utf8")), "SIGKILL");
      } catch {
        /* gone */
      }
    }
    fs.rmSync(rig.dir, { recursive: true, force: true });
    rig = null;
  }
  for (const [name, value] of [
    ["TMUX_TMPDIR", saved.tmpdir],
    ["TMUX", saved.tmux],
    ["PATH", saved.path],
  ]) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, name ?? "");
    } else {
      process.env[name ?? ""] = value;
    }
  }
});

/** Start the supervisor loop under test. */
function run() {
  rig?.run();
}

describe("the supervisor against a real tmux server (#722)", () => {
  it("boots one pane per employee, tiled by role, and a hire adds one", async () => {
    writeStaff(["developer", "developer@2", "qa-tester"]);
    run();
    await until(() => panes().length === 3, "three panes");
    expect(panes()).toEqual([
      "developer developer",
      "developer developer@2",
      "qa-tester qa-tester",
    ]);
    expect(tmux(["list-windows", "-t", `=${SESSION}`, "-F", "#{window_name}"])).toContain(
      "developer",
    );

    writeStaff(["developer", "developer@2", "qa-tester", "qa-tester@2"]);
    await until(() => panes().length === 4, "the hire's pane");
    expect(panes()).toContain("qa-tester qa-tester@2");

    // Starting one that has a pane is a no-op.
    const where = { tmux: "tmux", session: SESSION, root: rig?.root ?? "", cwd: rig?.cwd ?? "" };
    expect(startEmployee("qa-tester@2", where)).toBe("running");
    expect(startEmployee("qa-tester@2", where)).toBe("running");
    expect(panes()).toHaveLength(4);
  });

  it("stops a fired employee only once it is between turns, and clears what it left", async () => {
    const wt = path.join(rig?.dir ?? "", "wt-developer@2");
    fs.mkdirSync(wt);
    writeStaff(["developer", "developer@2"]);
    run();
    await until(() => panes().length === 2, "two panes");
    await until(() => fs.existsSync(path.join(rig?.dir ?? "", "child-developer@2")), "its child");
    const child = fs.readFileSync(path.join(rig?.dir ?? "", "child-developer@2"), "utf8").trim();
    const agents = path.join(rig?.root ?? "", "agents", "developer@2");
    for (const dir of [
      agents,
      path.join(rig?.root ?? "", "bus", "developer@2"),
      path.join(rig?.root ?? "", "hub", "developer@2"),
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }

    writeStaff(["developer"], { firing: ["developer@2"] });
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(panes()).toContain("developer developer@2");
    expect(alive(child)).toBe(true);

    fs.writeFileSync(path.join(agents, "between-turns"), "");
    await until(() => !panes().includes("developer developer@2"), "the pane to go");
    await until(() => !alive(child), "its child to go");
    await until(() => !staffed().includes("developer@2"), "it to leave staff.json");
    expect(fs.existsSync(agents)).toBe(false);
    expect(fs.existsSync(path.join(rig?.root ?? "", "bus", "developer@2"))).toBe(false);
    expect(fs.existsSync(path.join(rig?.root ?? "", "hub", "developer@2"))).toBe(false);
    expect(fs.existsSync(wt)).toBe(true);
    expect(panes()).toEqual(["developer developer"]);
  });

  it("also stops one that ran `company ready`", async () => {
    writeStaff(["qa-tester", "qa-tester@2"]);
    run();
    await until(() => panes().length === 2, "two panes");
    const now = Date.now();
    fs.writeFileSync(
      path.join(rig?.root ?? "", "staff.json"),
      JSON.stringify({
        employees: {
          "qa-tester": {
            role: "qa-tester",
            hiredAt: now,
            by: "operator",
            reason: "t",
            state: "working",
            readyAt: null,
          },
          "qa-tester@2": {
            role: "qa-tester",
            hiredAt: now,
            by: "operator",
            reason: "t",
            state: "firing",
            readyAt: now,
          },
        },
        recent: [{ id: "qa-tester@2", change: "fire", at: now }],
      }),
    );
    await until(() => panes().length === 1, "the pane to go");
    expect(panes()).toEqual(["qa-tester qa-tester"]);
  });

  it("restarts a crashed employee once after the holdoff, and a crash loop once per holdoff", async () => {
    writeStaff(["qa-tester", "developer"]);
    run();
    await until(() => panes().length === 2, "two panes");
    await until(() => starts("qa-tester").length === 1, "the first start");

    // Killing its stub closes the pane; the holdoff keeps the restart a
    // holdoff after the start before it.
    fs.writeFileSync(path.join(rig?.dir ?? "", "crash-qa-tester"), "");
    const pid = tmux(["list-panes", "-s", "-t", `=${SESSION}`, "-F", "#{@employee} #{pane_pid}"])
      .split("\n")
      .find((line) => line.startsWith("qa-tester "))
      ?.split(" ")[1];
    spawnSync("kill", [String(pid)]);

    // It crashes at once after each restart, so the starts keep coming.
    await until(() => starts("qa-tester").length === 3, "two restarts");
    const [first = 0, second = 0, third = 0] = starts("qa-tester");
    expect(second - first).toBeGreaterThanOrEqual(HOLDOFF_MS - MARGIN_MS);
    expect(third - second).toBeGreaterThanOrEqual(HOLDOFF_MS - MARGIN_MS);
  });

  it("kills a pane for nobody and leaves one still being set up", async () => {
    writeStaff(["developer"]);
    run();
    await until(() => panes().length === 1, "the first pane");
    const stranger = tmux([
      "split-window",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      "-t",
      `=${SESSION}:=developer`,
      "sleep 600",
    ]).trim();
    const forming = tmux([
      "split-window",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      "-t",
      `=${SESSION}:=developer`,
      "sleep 600",
    ]).trim();
    tmux(["set-option", "-p", "-t", stranger, "@employee", "developer@7"]);
    await until(
      () => !tmux(["list-panes", "-s", "-t", `=${SESSION}`, "-F", "#{pane_id}"]).includes(stranger),
      "the stranger to go",
    );
    expect(tmux(["list-panes", "-s", "-t", `=${SESSION}`, "-F", "#{pane_id}"])).toContain(forming);
  });

  it("starts nobody while a reboot is pending", async () => {
    fs.writeFileSync(path.join(rig?.root ?? "", "reboot.json"), "{}");
    writeStaff(["qa-tester"]);
    run();
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(panes()).toEqual([]);
    expect(starts("qa-tester")).toHaveLength(0);
  });
});

describe("a start that found the pane already there (#728)", () => {
  it("returns started, then running, and leaves one pane", () => {
    const where = { tmux: "tmux", session: SESSION, root: rig?.root ?? "", cwd: rig?.cwd ?? "" };
    expect(startEmployee("qa-tester", where)).toBe("started");
    expect(startEmployee("qa-tester", where)).toBe("running");
    expect(panes()).toEqual(["qa-tester qa-tester"]);
  });

  it("records and announces a manager start, but not a no-op one", () => {
    const cfg = {
      root: rig?.root ?? "",
      session: SESSION,
      tmux: "tmux",
      cwd: rig?.cwd ?? "",
      sampleMs: 100,
      killGraceMs: 300,
      holdoffMs: HOLDOFF_MS,
      restarter: undefined,
    };
    const when = { restarts: [], now: Date.now(), action: /** @type {const} */ ("start") };
    const record = path.join(cfg.root, "manager-restarts.json");
    const outbox = path.join(cfg.root, "bus");

    afterManagerStart(cfg, "running", when);
    expect(fs.existsSync(record)).toBe(false);
    expect(fs.existsSync(outbox)).toBe(false);

    afterManagerStart(cfg, "started", when);
    expect(JSON.parse(fs.readFileSync(record, "utf8"))).toEqual({ restarts: [when.now] });
    expect(fs.existsSync(outbox)).toBe(true);
  });
});
