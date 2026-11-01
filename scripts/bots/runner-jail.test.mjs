/**
 * A company CI runner's jail (#1889): what its bwrap arguments must never
 * name, the job-started hook that turns a fork's job away, and the scratch
 * directory that leaves nothing behind.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  PROXY_DIR,
  lifelineFd,
  parseJitconfig,
  parseRunnerStore,
  removeScratch,
  runnerCommand,
  runnerJailArgs,
  sendJitconfig,
} from "./runner-jail.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const HOST_HOME = "/home/op";
const SCRATCH = `${HOST_HOME}/.local/state/vibewars/runners/0a1b2c3d`;

const JAIL = {
  storeDirs: ["/nix/store/aaa-github-runner", "/nix/store/bbb-userland", "/nix/store/ccc-glibc"],
  storeFiles: ["/nix/store/ddd-vibewars-runner-init"],
  userland: "/nix/store/bbb-userland",
  etc: "/nix/store/eee-runner-etc",
  hook: "/nix/store/fff-vibewars-runner-hook",
  events: "/nix/store/ggg-vibewars-runner-events.json",
  proxyDir: `${SCRATCH}/proxy`,
  scratch: SCRATCH,
};

const args = runnerJailArgs(JAIL);

/**
 * The host paths bind arguments mount into the jail.
 *
 * @param {readonly string[]} argv
 * @returns {string[]}
 */
function sources(argv) {
  /** @type {string[]} */
  const paths = [];
  argv.forEach((arg, i) => {
    if (/^--(ro-|dev-)?bind(-try)?$|^--overlay-src$/.test(arg)) {
      paths.push(/** @type {string} */ (argv[i + 1]));
    }
  });
  return paths;
}

/**
 * The value an argument pair sets, e.g. `--setenv HOME`.
 *
 * @param {readonly string[]} argv
 * @param {string} name
 * @returns {string | undefined}
 */
function env(argv, name) {
  const i = argv.findIndex((arg, at) => arg === "--setenv" && argv[at + 1] === name);
  return i === -1 ? undefined : argv[i + 2];
}

describe("runnerJailArgs", () => {
  it("has no network and dies with its launcher, in a session of its own", () => {
    expect(args).not.toContain("--share-net");
    expect(args).toContain("--unshare-all");
    expect(args).toContain("--die-with-parent");
    expect(args).toContain("--new-session");
    expect(args).toContain("--clearenv");
    // The user bus reaches systemd-run on the host, never the jail (#1988).
    expect(args).not.toContain("XDG_RUNTIME_DIR");
    expect(args).not.toContain("DBUS_SESSION_BUS_ADDRESS");
  });

  it("has no capabilities and cannot make a user namespace of its own", () => {
    expect(args).toContain("--disable-userns");
    expect(args[args.indexOf("--cap-drop") + 1]).toBe("ALL");
  });

  it("is never root", () => {
    const uid = args[args.indexOf("--uid") + 1];
    expect(Number(uid)).toBeGreaterThan(0);
    expect(args[args.indexOf("--gid") + 1]).toBe(uid);
  });

  it("binds nothing of the host but the store paths, its scratch and the proxy", () => {
    for (const source of sources(args)) {
      const allowed =
        JAIL.storeDirs.includes(source) ||
        JAIL.storeFiles.includes(source) ||
        source.startsWith(`${SCRATCH}/`);
      expect(allowed, source).toBe(true);
    }
    for (const forbidden of [
      HOST_HOME,
      "/nix/store",
      "/home",
      "/run/user",
      "/run",
      "/etc",
      "/var",
      "/tmp",
      "/",
    ]) {
      expect(sources(args), forbidden).not.toContain(forbidden);
    }
    for (const source of sources(args)) {
      expect(source).not.toMatch(/\.bots|\/hub|\.claude|\.ssh|credentials|\.config/);
    }
  });

  it("overlays every closure directory, so the host's copy cannot change", () => {
    for (const dir of JAIL.storeDirs) {
      const at = args.indexOf(dir);
      expect(args.slice(at - 1, at + 3)).toEqual(["--overlay-src", dir, "--tmp-overlay", dir]);
    }
    expect(args).not.toContain("--bind-try");
    const file = /** @type {string} */ (JAIL.storeFiles[0]);
    expect(args.slice(args.indexOf(file) - 1, args.indexOf(file) + 2)).toEqual([
      "--ro-bind",
      file,
      file,
    ]);
  });

  it("puts /nix, HOME and the work dir on its scratch directory", () => {
    const binds = args.flatMap((arg, i) =>
      arg === "--bind" ? [`${String(args[i + 1])} -> ${String(args[i + 2])}`] : [],
    );
    expect(binds).toEqual([
      `${SCRATCH}/nix -> /nix`,
      `${SCRATCH}/home -> /home/runner`,
      `${SCRATCH}/work -> /work`,
    ]);
    expect(args.slice(args.indexOf(JAIL.proxyDir) - 1, args.indexOf(JAIL.proxyDir) + 2)).toEqual([
      "--ro-bind",
      JAIL.proxyDir,
      PROXY_DIR,
    ]);
  });

  it("reaches out through the forwarder only, and runs the jail's hook", () => {
    for (const name of ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"]) {
      expect(env(args, name), name).toBe("http://127.0.0.1:3128");
    }
    expect(env(args, "NO_PROXY")).toBe("localhost,127.0.0.1,::1");
    expect(env(args, "ACTIONS_RUNNER_HOOK_JOB_STARTED")).toBe(JAIL.hook);
    expect(env(args, "VIBEWARS_RUNNER_EVENTS")).toBe(JAIL.events);
    // The only Node the nixpkgs runner has (#1889 spike: hashFiles() failed on node20).
    expect(env(args, "ACTIONS_RUNNER_FORCED_INTERNAL_NODE_VERSION")).toBe("node24");
    expect(env(args, "ACTIONS_RUNNER_FORCE_ACTIONS_NODE_VERSION")).toBe("node24");
    expect(env(args, "PATH")).toBe(`${JAIL.userland}/bin`);
    expect(env(args, "HOME")).toBe("/home/runner");
  });
});

describe("runnerCommand", () => {
  const command = runnerCommand({
    jail: JAIL,
    unit: "vibewars-runner-0a1b2c3d",
    bwrap: "/nix/store/ggg-bubblewrap/bin/bwrap",
    cpus: 2,
    memoryGib: 6,
    tasksMax: 2048,
    init: "/nix/store/ddd-vibewars-runner-init",
    runner: "/nix/store/aaa-github-runner",
  });

  it("caps the jail's scope at its CPUs, memory and tasks", () => {
    const scope = command.slice(0, command.indexOf("--"));
    expect(scope).toEqual([
      "systemd-run",
      "--user",
      "--scope",
      "--quiet",
      "--collect",
      "--unit=vibewars-runner-0a1b2c3d",
      "--description=vibewars-runner-0a1b2c3d",
      "-p",
      "CPUQuota=200%",
      "-p",
      "MemoryMax=6G",
      "-p",
      "TasksMax=2048",
    ]);
  });

  it("remounts externals/ with node24 and a node20 link, no write into the overlay (#2006)", () => {
    const ext = "/nix/store/aaa-github-runner/lib/externals";
    const at = command.indexOf(ext);
    expect(command.slice(at - 1, at + 7)).toEqual([
      "--tmpfs",
      ext,
      "--ro-bind",
      `${ext}/node24`,
      `${ext}/node24`,
      "--symlink",
      "node24",
      `${ext}/node20`,
    ]);
  });

  it("runs the runner through the init, with no JIT config in any argument", () => {
    expect(command.slice(-4)).toEqual([
      "--",
      "/nix/store/ddd-vibewars-runner-init",
      "/nix/store/aaa-github-runner/bin/Runner.Listener",
      "run",
    ]);
    for (const arg of command) {
      expect(arg).not.toMatch(/jitconfig|ZXhhbXBsZQ/i);
    }
  });
});

describe("parseRunnerStore and parseJitconfig", () => {
  const STORE = {
    closure: "/nix/store/x-closure/store-paths",
    runner: "/nix/store/aaa-github-runner",
    bwrap: "/nix/store/ggg-bubblewrap/bin/bwrap",
    userland: "/nix/store/bbb-userland",
    etc: "/nix/store/eee-runner-etc",
    init: "/nix/store/ddd-vibewars-runner-init",
    hook: "/nix/store/fff-vibewars-runner-hook",
    events: "/nix/store/ggg-vibewars-runner-events.json",
    allow: "/nix/store/x-scripts/runner-proxy-allow.json",
    scratch: `${HOST_HOME}/.local/state/vibewars/runners`,
  };

  it("takes every path, and refuses one missing or relative", () => {
    expect(parseRunnerStore(JSON.stringify(STORE))).toEqual(STORE);
    for (const name of Object.keys(STORE)) {
      expect(() => parseRunnerStore(JSON.stringify({ ...STORE, [name]: undefined })), name).toThrow(
        name,
      );
      expect(() => parseRunnerStore(JSON.stringify({ ...STORE, [name]: "x" })), name).toThrow(name);
    }
  });

  it("takes one base64 blob as the JIT config", () => {
    expect(parseJitconfig("ZXhhbXBsZQ==\n")).toBe("ZXhhbXBsZQ==");
    for (const text of ["", "a b", "--help", "$(id)"]) {
      expect(() => parseJitconfig(text), text).toThrow(/not base64/);
    }
  });

  it("takes a lifeline fd above stdin, stdout and stderr only", () => {
    expect(lifelineFd("3")).toBe(3);
    for (const value of ["0", "1", "2", "-1", "3.5", "x"]) {
      expect(() => lifelineFd(value), value).toThrow(/--lifeline/);
    }
  });
});

describe("the job-started hook", () => {
  /** @type {string[]} */
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Runs the hook on an event, as the runner would.
   *
   * @param {string} name GITHUB_EVENT_NAME
   * @param {object | string} event the event payload, or its file's text
   * @param {string} [events] the event allowlist's text
   */
  function hook(
    name,
    event,
    events = fs.readFileSync(path.join(HERE, "runner-events.json"), "utf8"),
  ) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-hook-"));
    dirs.push(dir);
    const file = path.join(dir, "event.json");
    fs.writeFileSync(file, typeof event === "string" ? event : JSON.stringify(event));
    const allow = path.join(dir, "events.json");
    fs.writeFileSync(allow, events);
    return spawnSync("bash", [path.join(HERE, "runner-hook-job-started.sh")], {
      env: {
        PATH: String(process.env.PATH),
        GITHUB_REPOSITORY: "Enteee/VibeWars",
        GITHUB_EVENT_NAME: name,
        GITHUB_EVENT_PATH: file,
        VIBEWARS_RUNNER_EVENTS: allow,
      },
      encoding: "utf8",
    });
  }

  const repository = { full_name: "Enteee/VibeWars" };

  it("lets a push, a schedule and a dispatch run", () => {
    expect(hook("push", { ref: "refs/heads/main", repository }).status).toBe(0);
    // A schedule's payload names no repository.
    expect(hook("schedule", { schedule: "17 3 * * *" }).status).toBe(0);
    expect(
      hook("workflow_dispatch", { ref: "refs/heads/main", inputs: {}, repository }).status,
    ).toBe(0);
  });

  it("lets a pull request from a branch of this repository run", () => {
    const pr = { pull_request: { head: { repo: { full_name: "Enteee/VibeWars" } } }, repository };
    expect(hook("pull_request", pr).status).toBe(0);
  });

  it("fails a fork's pull request, saying why", () => {
    const pr = { pull_request: { head: { repo: { full_name: "mallory/VibeWars" } } }, repository };
    const result = hook("pull_request", pr);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pull request from 'mallory/VibeWars'");
  });

  it("fails a pull request whose head repository is gone, and any other event", () => {
    expect(
      hook("pull_request", { pull_request: { head: { repo: null } }, repository }).status,
    ).toBe(1);
    for (const name of [
      "pull_request_target",
      "workflow_run",
      "issue_comment",
      "merge_group",
      "",
    ]) {
      const result = hook(name, { repository });
      expect(result.status, name).toBe(1);
      expect(result.stderr, name).toContain(`event '${name}'`);
    }
  });

  it("fails closed on a malformed event file or allowlist", () => {
    expect(hook("push", "{ not json").stderr).toContain("unreadable event file");
    expect(hook("push", "[]").status).toBe(1);
    for (const events of ["{ not json", "{}", '{"any": "push", "sameRepository": []}']) {
      const result = hook("push", { repository }, events);
      expect(result.status, events).toBe(1);
      expect(result.stderr, events).toContain("unreadable event allowlist");
    }
  });
});

describe("removeScratch", () => {
  it("deletes a scratch directory with a read-only Nix store in it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-scratch-"));
    const store = path.join(dir, "nix", "store", "aaa-thing", "bin");
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(path.join(store, "tool"), "");
    fs.chmodSync(path.join(store, "tool"), 0o555);
    fs.chmodSync(store, 0o555);
    fs.chmodSync(path.dirname(store), 0o555);
    removeScratch(dir);
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe("sendJitconfig (#1988)", () => {
  it("logs once, and does not throw, when the runner dies before it reads fd 3", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(1)"], {
      stdio: ["ignore", "ignore", "ignore", "pipe"],
    });
    const pipe = /** @type {import("node:stream").Writable} */ (child.stdio[3]);
    const closed = new Promise((resolve) => pipe.once("close", resolve));
    /** @type {string[]} */
    const lines = [];
    child.once("spawn", () => {
      sendJitconfig(pipe, "x".repeat(1 << 20), (line) => lines.push(line));
    });
    const code = await new Promise(
      /** @param {(code: number | null) => void} resolve */ (resolve) => {
        child.once("exit", (exit) => {
          resolve(exit);
        });
      },
    );
    await closed;
    expect(code).toBe(1);
    expect(lines.length).toBeLessThanOrEqual(1);
    for (const line of lines) {
      expect(line).toMatch(/^launcher: jitconfig pipe: /);
    }
  });
});
