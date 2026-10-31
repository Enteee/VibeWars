/**
 * One company CI runner in a jail (#1889, ADR-0045): an ephemeral GitHub
 * Actions runner that takes one job and exits, inside bubblewrap, under a
 * CPU and memory cap, with no network but the egress proxy.
 *
 * A job runs whatever the workflow on its branch says, so it is treated as
 * hostile. Its jail holds nothing of the host's:
 *
 * - `--unshare-all` without `--share-net`: its only way out is a
 *   `runner-proxy.mjs` this launcher runs for it alone, on a unix socket
 *   bound in, which the jail's forwarder serves on 127.0.0.1:3128;
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
 *   that is not a push or a same-repository pull request.
 *
 * The JIT config, the runner's one-job registration, is read by this
 * launcher and handed to the runner as an argument, never as a file in the
 * jail; the host's copy is deleted as soon as the runner has started.
 *
 *     node runner-jail.mjs --jitconfig <file> [--cpus 2] [--memory-gib 6]
 *
 * `VIBEWARS_RUNNER_JAIL` holds the jail's store paths as JSON, which the
 * `vibewars-runner-jail` wrapper in `nix/claude-bot.nix` sets.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
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

/**
 * @typedef {object} RunnerStore
 * @property {string} closure a file listing every store path the jail mounts, one per line
 * @property {string} runner the `github-runner` package
 * @property {string} bwrap bubblewrap's binary
 * @property {string} userland the base userland: its `bin` is PATH
 * @property {string} etc `passwd`, `group`, `hosts` and `nsswitch.conf`
 * @property {string} init the jail's entrypoint: starts the forwarder, then execs its arguments
 * @property {string} hook the job-started hook
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
    ...["--setenv", "VIBEWARS_PROXY_SOCKET", `${PROXY_DIR}/${PROXY_SOCKET}`],
    ...["--setenv", "VIBEWARS_PROXY_PORT", String(PROXY_PORT)],
  ];
}

/**
 * The whole command line: the jail in its own capped scope, the
 * forwarder, and the runner with its JIT config as its argument.
 *
 * @param {object} launch
 * @param {RunnerJail} launch.jail
 * @param {string} launch.unit the scope's name
 * @param {string} launch.bwrap
 * @param {number} launch.cpus
 * @param {number} launch.memoryGib
 * @param {string} launch.init
 * @param {string} launch.runner
 * @param {string} launch.jitconfig
 * @returns {string[]}
 */
export function runnerCommand({ jail, unit, bwrap, cpus, memoryGib, init, runner, jitconfig }) {
  return [
    "systemd-run",
    ...["--user", "--scope", "--quiet", "--collect", `--unit=${unit}`],
    ...["-p", `CPUQuota=${String(cpus * 100)}%`],
    ...["-p", `MemoryMax=${String(memoryGib)}G`],
    "--",
    bwrap,
    ...runnerJailArgs(jail),
    "--",
    init,
    `${runner}/bin/Runner.Listener`,
    "run",
    "--jitconfig",
    jitconfig,
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
 * Runs one runner to its end: the proxy, the scratch directory and the
 * jail, all gone when it exits.
 *
 * @param {object} options
 * @param {RunnerStore} options.store
 * @param {string} options.jitconfigFile
 * @param {number} options.cpus
 * @param {number} options.memoryGib
 * @returns {Promise<number>} the runner's exit code
 */
export async function runRunner({ store, jitconfigFile, cpus, memoryGib }) {
  const jitconfig = parseJitconfig(fs.readFileSync(jitconfigFile, "utf8"));
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
        proxyDir,
        scratch,
      },
      unit: `vibewars-runner-${id}`,
      bwrap: store.bwrap,
      cpus,
      memoryGib,
      init: store.init,
      runner: store.runner,
      jitconfig,
    });
    const child = spawn(/** @type {string} */ (command), args, { stdio: "inherit" });
    child.once("spawn", () => {
      fs.rmSync(jitconfigFile, { force: true });
    });
    const stop = () => {
      child.kill("SIGTERM");
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
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

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      jitconfig: { type: "string" },
      cpus: { type: "string" },
      "memory-gib": { type: "string" },
    },
  });
  const storeJson = process.env.VIBEWARS_RUNNER_JAIL;
  if (values.jitconfig === undefined || storeJson === undefined) {
    console.error("usage: runner-jail.mjs --jitconfig <file> [--cpus 2] [--memory-gib 6]");
    console.error("       (VIBEWARS_RUNNER_JAIL is set by the vibewars-runner-jail wrapper)");
    process.exit(2);
  }
  process.exitCode = await runRunner({
    store: parseRunnerStore(storeJson),
    jitconfigFile: values.jitconfig,
    cpus: positive(values.cpus, "cpus", DEFAULT_CPUS),
    memoryGib: positive(values["memory-gib"], "memory-gib", DEFAULT_MEMORY_GIB),
  });
}
