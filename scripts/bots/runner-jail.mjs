/**
 * One company CI runner in a jail (#1889, ADR-0045): an ephemeral GitHub
 * Actions runner that takes one job and exits, inside bubblewrap, under a
 * CPU, memory and task cap, with no network but the egress proxy.
 *
 * A job runs whatever the workflow on its branch says, so it is treated as
 * hostile. Its jail holds nothing of the host's:
 *
 * - `--unshare-all` without `--share-net`: its only way out is a
 *   `runner-proxy.mjs` this launcher runs for it alone, on a unix socket
 *   bound in, which the jail's forwarder serves on 127.0.0.1:3128;
 * - no capabilities and no nested user namespaces (`--cap-drop ALL`,
 *   `--disable-userns`), the usual way from a sandbox into the kernel.
 *   Chromium's own sandbox needs one, so the e2e runs it with
 *   `--no-sandbox`: the jail is the sandbox;
 * - `/`, `/etc` and `/tmp` are tmpfs. `/nix`, `HOME` and the work dir are a
 *   fresh scratch directory on disk, so a Nix store restored from the
 *   Actions cache is not charged to the memory cap, and it is deleted when
 *   the runner exits;
 * - the runner's Nix closure and a base userland are mounted over that
 *   `/nix/store`, each path as an overlay on a tmpfs: the job cannot change
 *   the host's copy, and a cache restore that writes the same path still
 *   succeeds;
 * - never the operator's home, the hub, the company's credentials, the SSH
 *   key, `/run/user`, or any socket but the proxy's;
 * - a job-started hook, shipped here and not by the workflow, fails any job
 *   whose event is not on `runner-events.json`, or is a fork's pull request.
 *
 * The JIT config, the runner's one-job registration, is read by this
 * launcher and written to the jail's init on fd 3, which hands it to the
 * runner as `ACTIONS_RUNNER_INPUT_JITCONFIG`: never an argument, which any
 * host process could read and systemd would log as the scope's
 * description, and never a file in the jail. The host's copy is deleted as
 * soon as the runner has started. `--jitconfig -` reads it from stdin, as
 * the runner supervisor (#1890) hands it over: then there is no file at all.
 *
 * `--lifeline <fd>` is a pipe the supervisor holds the other end of. When
 * it breaks, the supervisor is gone, however it died, and the runner is
 * stopped: a restarted supervisor would otherwise start a second set.
 *
 *     node runner-jail.mjs --jitconfig <file | -> [--lifeline <fd>] [--cpus 2] [--memory-gib 6] [--tasks-max 2048]
 *
 * `VIBEWARS_RUNNER_JAIL` holds the jail's store paths as JSON, which the
 * `vibewars-runner-jail` wrapper in `nix/claude-bot.nix` sets.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

import { listenRunnerProxy, parseAllowlist } from "./runner-proxy.mjs";

/** Where the proxy's socket directory is bound inside the jail. */
export const PROXY_DIR = "/run/runner-proxy";

/** The proxy socket's name, in its directory on both sides. */
export const PROXY_SOCKET = "proxy.sock";

/** The loopback port the jail's forwarder serves the proxy on. */
export const PROXY_PORT = 3128;

/** The jail's user, from the `passwd` it is given. */
export const RUNNER_USER = "runner";
export const RUNNER_UID = 1001;

/** The runner's home and work directory inside the jail. */
export const HOME = "/home/runner";
export const WORK = "/work";

/** The cap on each runner when the supervisor names none. */
export const DEFAULT_CPUS = 2;
export const DEFAULT_MEMORY_GIB = 6;
export const DEFAULT_TASKS_MAX = 2048;

/**
 * @typedef {object} RunnerStore
 * @property {string} closure a file listing every store path the jail mounts, one per line
 * @property {string} runner the `github-runner` package
 * @property {string} bwrap bubblewrap's binary
 * @property {string} userland the base userland: its `bin` is PATH
 * @property {string} etc `passwd`, `group`, `hosts` and `nsswitch.conf`
 * @property {string} init the jail's entrypoint: starts the forwarder, then execs its arguments
 * @property {string} hook the job-started hook
 * @property {string} events the hook's event allowlist
 * @property {string} allow the proxy's allowlist
 * @property {string} scratch where each jail's scratch directory is made
 */

/**
 * @typedef {object} RunnerJail
 * @property {readonly string[]} storeDirs the closure's directories, each overlaid
 * @property {readonly string[]} storeFiles the closure's lone files, which an
 *   overlay cannot cover: bound read-only
 * @property {string} userland
 * @property {string} etc
 * @property {string} hook
 * @property {string} events
 * @property {string} proxyDir the host directory holding the proxy's socket
 * @property {string} scratch this jail's scratch directory: `nix`, `home` and `work`
 */

/**
 * @param {RunnerJail} jail
 * @returns {string[]} bwrap's arguments, up to the command
 */
export function runnerJailArgs(jail) {
  const proxy = `http://127.0.0.1:${String(PROXY_PORT)}`;
  const certs = `${jail.userland}/etc/ssl/certs/ca-bundle.crt`;
  return [
    "--die-with-parent",
    "--new-session",
    "--unshare-all",
    "--unshare-user",
    "--disable-userns",
    ...["--cap-drop", "ALL"],
    ...["--uid", String(RUNNER_UID), "--gid", String(RUNNER_UID)],
    "--clearenv",
    ...["--bind", `${jail.scratch}/nix`, "/nix"],
    ...jail.storeDirs.flatMap((store) => ["--overlay-src", store, "--tmp-overlay", store]),
    ...jail.storeFiles.flatMap((store) => ["--ro-bind", store, store]),
    ...["--tmpfs", "/etc"],
    ...["passwd", "group", "hosts", "nsswitch.conf"].flatMap((name) => [
      "--symlink",
      `${jail.etc}/${name}`,
      `/etc/${name}`,
    ]),
    ...["--symlink", certs, "/etc/ssl/certs/ca-certificates.crt"],
    ...["--symlink", `${jail.userland}/bin/env`, "/usr/bin/env"],
    ...["--symlink", `${jail.userland}/bin/bash`, "/bin/bash"],
    ...["--symlink", `${jail.userland}/bin/bash`, "/bin/sh"],
    ...["--proc", "/proc"],
    ...["--dev", "/dev"],
    ...["--tmpfs", "/tmp"],
    ...["--bind", `${jail.scratch}/home`, HOME],
    ...["--bind", `${jail.scratch}/work`, WORK],
    ...["--ro-bind", jail.proxyDir, PROXY_DIR],
    ...["--chdir", WORK],
    ...["--setenv", "HOME", HOME],
    ...["--setenv", "USER", RUNNER_USER],
    ...["--setenv", "LOGNAME", RUNNER_USER],
    ...["--setenv", "PATH", `${jail.userland}/bin`],
    ...["--setenv", "LANG", "C.UTF-8"],
    ...["--setenv", "TMPDIR", "/tmp"],
    ...["--setenv", "SSL_CERT_FILE", certs],
    ...["--setenv", "NIX_SSL_CERT_FILE", certs],
    ...["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"].flatMap((name) => [
      "--setenv",
      name,
      proxy,
    ]),
    ...["NO_PROXY", "no_proxy"].flatMap((name) => ["--setenv", name, "localhost,127.0.0.1,::1"]),
    ...["--setenv", "RUNNER_ROOT", WORK],
    ...["--setenv", "ACTIONS_RUNNER_HOOK_JOB_STARTED", jail.hook],
    // nixpkgs ships the runner with Node 24 alone (Node 20 is gone from it),
    // and the runner still asks for externals/node20 by default: for
    // hashFiles() and for an action that says 'node20'. The spike failed so.
    ...["--setenv", "ACTIONS_RUNNER_FORCED_INTERNAL_NODE_VERSION", "node24"],
    ...["--setenv", "ACTIONS_RUNNER_FORCE_ACTIONS_NODE_VERSION", "node24"],
    ...["--setenv", "VIBEWARS_RUNNER_EVENTS", jail.events],
    ...["--setenv", "VIBEWARS_PROXY_SOCKET", `${PROXY_DIR}/${PROXY_SOCKET}`],
    ...["--setenv", "VIBEWARS_PROXY_PORT", String(PROXY_PORT)],
  ];
}

/**
 * The whole command line: the jail in its own capped scope, the
 * forwarder, and the runner. The JIT config is not in it: the init reads
 * it from fd 3.
 *
 * @param {object} launch
 * @param {RunnerJail} launch.jail
 * @param {string} launch.unit the scope's name
 * @param {string} launch.bwrap
 * @param {number} launch.cpus
 * @param {number} launch.memoryGib
 * @param {number} launch.tasksMax
 * @param {string} launch.init
 * @param {string} launch.runner
 * @returns {string[]}
 */
export function runnerCommand({ jail, unit, bwrap, cpus, memoryGib, tasksMax, init, runner }) {
  return [
    "systemd-run",
    ...["--user", "--scope", "--quiet", "--collect", `--unit=${unit}`, `--description=${unit}`],
    ...["-p", `CPUQuota=${String(cpus * 100)}%`],
    ...["-p", `MemoryMax=${String(memoryGib)}G`],
    ...["-p", `TasksMax=${String(tasksMax)}`],
    "--",
    bwrap,
    ...runnerJailArgs(jail),
    // The runner's hashFiles() starts externals/node20/bin/node whatever the
    // env says (#2006), and nixpkgs ships node24 alone. A symlink written into
    // the overlay fails: its copy-up must chown to root, unmapped in the jail.
    // So a fresh tmpfs goes over externals/, with node24 bound back in.
    ...["--tmpfs", `${runner}/lib/externals`],
    ...["--ro-bind", `${runner}/lib/externals/node24`, `${runner}/lib/externals/node24`],
    ...["--symlink", "node24", `${runner}/lib/externals/node20`],
    "--",
    init,
    `${runner}/bin/Runner.Listener`,
    "run",
  ];
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {string}
 */
function storePath(value, name) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`runner-jail: ${name} must be an absolute path`);
  }
  return value;
}

/**
 * The jail's store paths, from the wrapper's JSON: every field present and
 * a path, or nothing.
 *
 * @param {string} json
 * @returns {RunnerStore}
 */
export function parseRunnerStore(json) {
  /** @type {unknown} */
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("runner-jail: not an object");
  }
  const fields = /** @type {Record<string, unknown>} */ (parsed);
  const get = (/** @type {string} */ name) => storePath(fields[name], name);
  return {
    closure: get("closure"),
    runner: get("runner"),
    bwrap: get("bwrap"),
    userland: get("userland"),
    etc: get("etc"),
    init: get("init"),
    hook: get("hook"),
    events: get("events"),
    allow: get("allow"),
    scratch: get("scratch"),
  };
}

/**
 * The JIT config from its file: one base64 blob, or nothing.
 *
 * @param {string} text
 * @returns {string}
 */
export function parseJitconfig(text) {
  const jitconfig = text.trim();
  if (!/^[A-Za-z0-9+/]+=*$/.test(jitconfig)) {
    throw new Error("runner-jail: the JIT config is not base64");
  }
  return jitconfig;
}

/**
 * Deletes a scratch directory, including the read-only directories a Nix
 * store leaves in it.
 *
 * @param {string} dir
 */
export function removeScratch(dir) {
  /** @param {string} at */
  const writable = (at) => {
    const stat = fs.lstatSync(at, { throwIfNoEntry: false });
    if (!stat?.isDirectory()) {
      return;
    }
    fs.chmodSync(at, 0o700);
    for (const entry of fs.readdirSync(at)) {
      writable(path.join(at, entry));
    }
  };
  writable(dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Watches a lifeline: an fd nothing is written to, which ends when the
 * process holding its other end exits.
 *
 * @param {number} fd
 * @returns {{ cut: Promise<void>, close: () => void }}
 */
export function watchLifeline(fd) {
  const socket = new net.Socket({ fd, readable: true, writable: false });
  /** @type {Promise<void>} */
  const cut = new Promise((resolve) => {
    socket.once("close", () => {
      resolve();
    });
  });
  socket.on("error", () => {
    // Either way the other end is gone.
    socket.destroy();
  });
  socket.resume();
  return { cut, close: () => socket.destroy() };
}

/**
 * Runs one runner to its end: the proxy, the scratch directory and the
 * jail, all gone when it exits.
 *
 * @param {object} options
 * @param {RunnerStore} options.store
 * @param {string} options.jitconfigFile `-` for stdin
 * @param {Promise<void> | null} options.lifeline stops the runner when it resolves
 * @param {number} options.cpus
 * @param {number} options.memoryGib
 * @param {number} options.tasksMax
 * @returns {Promise<number>} the runner's exit code
 */
export async function runRunner({ store, jitconfigFile, lifeline, cpus, memoryGib, tasksMax }) {
  const fromStdin = jitconfigFile === "-";
  const jitconfig = parseJitconfig(fs.readFileSync(fromStdin ? 0 : jitconfigFile, "utf8"));
  const id = crypto.randomBytes(4).toString("hex");
  fs.mkdirSync(store.scratch, { recursive: true, mode: 0o700 });
  fs.chmodSync(store.scratch, 0o700);
  const scratch = path.join(store.scratch, id);
  const proxyDir = path.join(scratch, "proxy");
  for (const dir of [scratch, proxyDir, `${scratch}/nix`, `${scratch}/home`, `${scratch}/work`]) {
    fs.mkdirSync(dir, { mode: 0o700 });
  }
  const log = (/** @type {string} */ line) => {
    console.error(`[runner ${id}] ${line}`);
  };
  const proxy = await listenRunnerProxy(
    path.join(proxyDir, PROXY_SOCKET),
    parseAllowlist(fs.readFileSync(store.allow, "utf8")),
    log,
  );
  try {
    const storePaths = fs
      .readFileSync(store.closure, "utf8")
      .split("\n")
      .filter((line) => line !== "");
    const [command, ...args] = runnerCommand({
      jail: {
        storeDirs: storePaths.filter((store) => fs.statSync(store).isDirectory()),
        storeFiles: storePaths.filter((store) => !fs.statSync(store).isDirectory()),
        userland: store.userland,
        etc: store.etc,
        hook: store.hook,
        events: store.events,
        proxyDir,
        scratch,
      },
      unit: `vibewars-runner-${id}`,
      bwrap: store.bwrap,
      cpus,
      memoryGib,
      tasksMax,
      init: store.init,
      runner: store.runner,
    });
    const child = spawn(/** @type {string} */ (command), args, {
      stdio: ["inherit", "inherit", "inherit", "pipe"],
    });
    child.once("spawn", () => {
      sendJitconfig(/** @type {import("node:stream").Writable} */ (child.stdio[3]), jitconfig, log);
      if (!fromStdin) {
        fs.rmSync(jitconfigFile, { force: true });
      }
    });
    const stop = () => {
      child.kill("SIGTERM");
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    void lifeline?.then(() => {
      if (child.exitCode === null && child.signalCode === null) {
        log("the supervisor is gone; stopping");
        stop();
      }
    });
    return await new Promise((resolve) => {
      child.once("error", (error) => {
        log(`could not start: ${error.message}`);
        resolve(1);
      });
      child.once("exit", (code, signal) => {
        process.off("SIGTERM", stop);
        process.off("SIGINT", stop);
        resolve(code ?? (signal === null ? 1 : 128));
      });
    });
  } finally {
    proxy.close();
    removeScratch(scratch);
  }
}

/**
 * Write the JIT config to the runner's fd 3. A runner already dead closes
 * the pipe under it (#1988): that is said once and otherwise ignored, so
 * the exit path reports the runner's own code rather than a crash.
 *
 * @param {import("node:stream").Writable} pipe
 * @param {string} jitconfig
 * @param {(line: string) => void} log
 */
export function sendJitconfig(pipe, jitconfig, log) {
  let said = false;
  pipe.on("error", (error) => {
    if (said) {
      return;
    }
    said = true;
    const code = /** @type {NodeJS.ErrnoException} */ (error).code ?? error.message;
    log(`launcher: jitconfig pipe: ${code}`);
  });
  pipe.end(`${jitconfig}\n`);
}

/**
 * @param {string | undefined} value
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function positive(value, name, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const number = Number(value);
  if (!(Number.isInteger(number) && number > 0)) {
    throw new Error(`runner-jail: --${name} must be a positive whole number`);
  }
  return number;
}

/**
 * The lifeline's fd: never stdin, stdout or stderr, which are not one.
 *
 * @param {string} value
 * @returns {number}
 */
export function lifelineFd(value) {
  const fd = Number(value);
  if (!(Number.isInteger(fd) && fd >= 3)) {
    throw new Error("runner-jail: --lifeline must be an fd of 3 or more");
  }
  return fd;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      jitconfig: { type: "string" },
      lifeline: { type: "string" },
      cpus: { type: "string" },
      "memory-gib": { type: "string" },
      "tasks-max": { type: "string" },
    },
  });
  const storeJson = process.env.VIBEWARS_RUNNER_JAIL;
  if (values.jitconfig === undefined || storeJson === undefined) {
    console.error(
      "usage: runner-jail.mjs --jitconfig <file | -> [--lifeline <fd>] [--cpus 2] [--memory-gib 6] [--tasks-max 2048]",
    );
    console.error("       (VIBEWARS_RUNNER_JAIL is set by the vibewars-runner-jail wrapper)");
    process.exit(2);
  }
  const lifeline =
    values.lifeline === undefined ? null : watchLifeline(lifelineFd(values.lifeline));
  process.exitCode = await runRunner({
    store: parseRunnerStore(storeJson),
    jitconfigFile: values.jitconfig,
    lifeline: lifeline?.cut ?? null,
    cpus: positive(values.cpus, "cpus", DEFAULT_CPUS),
    memoryGib: positive(values["memory-gib"], "memory-gib", DEFAULT_MEMORY_GIB),
    tasksMax: positive(values["tasks-max"], "tasks-max", DEFAULT_TASKS_MAX),
  });
  lifeline?.close();
}
