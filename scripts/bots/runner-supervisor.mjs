#!/usr/bin/env node
/**
 * The runner supervisor (#1890, part 2 of #1888, ADR-0045): keeps the
 * number of company CI runners the manager asked for alive, one
 * `runner-jail.mjs` per runner, each good for one job.
 *
 * It is its own host daemon, not part of hubd, because it holds the
 * runners' admin credential and hubd parses every jail's spool. hubd and
 * it share two host-only files (runners-state.mjs): the target `n`, which
 * hubd writes for `company runners <n>`, and the status this writes back.
 *
 * - For each missing runner it mints a JIT config and hands it to the
 *   launcher on stdin, never in argv, a file or a log line. A runner that
 *   exits, after its job, a crash or a kill, is replaced with a fresh one.
 *   Repeated failures back off, 5 s doubling to 5 min; a runner GitHub
 *   saw take its job resets that. Every runner that did not take one has
 *   its registration removed.
 * - Each launcher holds a lifeline to this process and stops its runner
 *   when it breaks, so a supervisor that crashes leaves no runner behind.
 * - No runner starts while scratch is not a filesystem of its own (the disk
 *   cap), or while the host is short of memory or overloaded.
 * - `COMPANY_RUNNERS` is "1" while a runner is up and `n > 0`, otherwise
 *   "0". Scaling to 0 flips it to "0" first and keeps one runner until no
 *   queued job asks for `vibewars-company`, for at most 10 minutes.
 * - Scaling down kills idle runners first; busy ones finish their job.
 * - At start and at stop, every offline runner with our host's name and
 *   our label that is not one of ours alive is deleted: what a host crash
 *   leaves behind.
 * - `VIBEWARS_MAX_RUNNERS` of 0, its default, makes no GitHub call at all.
 *
 * GitHub calls run one at a time, with the runners' own `GH_CONFIG_DIR`
 * (`claude-llc auth runners`) and nothing of the company's. A missing or
 * refused credential is said once, in the status, which hubd relays to the
 * manager.
 *
 * claude-llc runs it in the hub window, under run-forever.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { releaseLock, takeLock } from "./instance-lock.mjs";
import {
  STATUS_FILE,
  ensureStateDir,
  maxRunners,
  readTarget,
  runnersStateDir,
  writePrivate,
} from "./runners-state.mjs";

/** The label part 3's workflows ask for. */
export const LABEL = "vibewars-company";
export const LABELS = ["self-hosted", LABEL];
/** The repository's Default runner group: repository runners have no other. */
const RUNNER_GROUP = 1;

export const BACKOFF_MIN_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
/** A runner is not started with less memory free than its cap plus this. */
export const MEMORY_HEADROOM = 2 * 1024 ** 3;
/** How often GitHub is asked which runners are busy, and which jobs wait. */
export const POLL_MS = 60_000;
/** How long scaling to 0 waits for queued company jobs. */
export const DRAIN_MS = 10 * 60_000;
/** How often the daemon reconciles. */
const TICK_MS = 5_000;

export const CREDENTIAL_ALERT = "runners need their admin credential: claude-llc auth runners";

/** A GitHub call that failed, with its HTTP status when gh said one. */
export class ApiError extends Error {
  /**
   * @param {string} message never a JIT config
   * @param {number | null} status
   */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * @typedef {object} GithubRunner
 * @property {number} id
 * @property {string} name
 * @property {"online" | "offline"} status
 * @property {boolean} busy
 * @property {string[]} labels
 */

/**
 * @typedef {object} Api
 * @property {(name: string) => Promise<{ id: number, jitconfig: string }>} mint
 * @property {() => Promise<GithubRunner[]>} list
 * @property {(id: number) => Promise<void>} remove
 * @property {(on: boolean) => Promise<void>} setVariable
 * @property {() => Promise<boolean>} queuedCompanyJobs
 */

/**
 * @typedef {object} Launched
 * @property {Promise<number>} exited the launcher's exit code
 * @property {() => void} kill
 */

/**
 * @typedef {object} Host
 * @property {() => number} freeBytes
 * @property {() => number} load1
 * @property {() => number} cpus
 * @property {() => string | null} diskCapRefusal why scratch has no disk cap, null when it has one
 */

/**
 * @typedef {object} Deps
 * @property {() => number} now
 * @property {Api} api
 * @property {(jitconfig: string) => Launched} launch
 * @property {Host} host
 * @property {() => { n: number, reason: string | null }} readTarget
 * @property {(status: import("./runners-state.mjs").RunnersStatus) => void} writeStatus
 * @property {(line: string) => void} log
 * @property {{ max: number, hostName: string, memoryBytes: number }} config
 */

/**
 * @typedef {object} Runner
 * @property {string} name
 * @property {number} id
 * @property {number} started
 * @property {boolean} busy
 * @property {boolean} killed
 * @property {Launched} launched
 */

/**
 * The back-off after `failures` failures in a row: 5 s, 10 s, 20 s … 5 min.
 *
 * @param {number} failures at least 1
 * @returns {number}
 */
export function backoffMs(failures) {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, failures - 1));
}

/**
 * @param {unknown} error
 * @returns {boolean} whether it is the credential's fault, not GitHub's mood
 */
function credentialRefused(error) {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403) &&
    !/rate limit/i.test(error.message)
  );
}

/**
 * The state machine. `tick` reconciles once and is never run twice at a
 * time; `stop` is the clean shutdown.
 */
export class RunnerSupervisor {
  /** @param {Deps} deps */
  constructor(deps) {
    this.deps = deps;
    /** @type {Map<string, Runner>} */
    this.runners = new Map();
    this.seq = 0;
    this.prefix = `vibewars-${deps.config.hostName}-${deps.now().toString(36)}`;
    this.target = 0;
    this.failures = 0;
    this.retryAt = 0;
    /** @type {boolean | null} what COMPANY_RUNNERS was last set to; null before the first */
    this.variable = null;
    this.reconciled = false;
    /** @type {string | null} the last refusal or back-off, as the status says it */
    this.reason = null;
    /** @type {string | null} why the back-off runs, while it does */
    this.backoffReason = null;
    /** @type {string | null} */
    this.alert = null;
    /** @type {string | null} the call whose refusal raised it */
    this.alertOn = null;
    this.stopped = false;
    /** @type {number | null} when scaling to 0 began waiting for queued jobs */
    this.drainSince = null;
    this.lastList = -Infinity;
    this.lastQueuedPoll = -Infinity;
    this.queued = true;
    this.lastStatus = "";
    /** @type {Promise<unknown>} the GitHub call in flight; `attempt` never rejects */
    this.queue = Promise.resolve();
  }

  /** @returns {boolean} whether `stop` began, which an await may have seen happen */
  halted() {
    return this.stopped;
  }

  /** @returns {number} */
  get alive() {
    return this.runners.size;
  }

  /**
   * One GitHub call, its failure counted. Returns null when it failed. A
   * refused credential is cleared by the same call working, not another:
   * minting and the variable need different permissions. Calls queue, so
   * one runs at a time, a runner's exit's included.
   *
   * @template T
   * @param {string} what
   * @param {() => Promise<T>} call
   * @returns {Promise<{ value: T } | null>}
   */
  call(what, call) {
    const turn = this.queue.then(() => this.attempt(what, call));
    this.queue = turn;
    return turn;
  }

  /**
   * @template T
   * @param {string} what
   * @param {() => Promise<T>} call
   * @returns {Promise<{ value: T } | null>}
   */
  async attempt(what, call) {
    try {
      const result = await call();
      if (this.alert !== null && this.alertOn === what) {
        this.deps.log("runners: the admin credential works again");
        this.alert = null;
      }
      return { value: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (credentialRefused(error)) {
        if (this.alert === null) {
          this.deps.log(`runners: ${CREDENTIAL_ALERT} (${message})`);
        }
        this.alert = CREDENTIAL_ALERT;
        this.alertOn = what;
      }
      this.fail(message);
      return null;
    }
  }

  /** @param {string} why */
  fail(why) {
    this.failures += 1;
    const delay = backoffMs(this.failures);
    this.retryAt = this.deps.now() + delay;
    this.backoffReason = `backing off ${String(Math.round(delay / 1000))} s after ${String(this.failures)} failure(s): ${why}`;
    this.reason = this.backoffReason;
    this.deps.log(`runners: ${this.backoffReason}`);
  }

  /** @returns {Promise<void>} */
  async tick() {
    const { now, readTarget: target, config } = this.deps;
    if (this.stopped) {
      return;
    }
    const read = target();
    const draining = this.target > 0 && read.n === 0 && this.alive > 0;
    this.target = read.n;
    this.reason = read.reason ?? (now() < this.retryAt ? this.backoffReason : null);
    if (config.max === 0) {
      this.reason = "runners are off: VIBEWARS_MAX_RUNNERS is 0";
      this.writeStatus();
      return;
    }
    if (now() < this.retryAt) {
      this.writeStatus();
      return;
    }

    if (!this.reconciled) {
      if ((await this.call("removeLeftovers", () => this.removeLeftovers())) === null) {
        this.writeStatus();
        return;
      }
      this.reconciled = true;
    }

    if (draining) {
      this.drainSince = now();
      this.lastQueuedPoll = -Infinity;
    }
    if (this.target > 0) {
      this.drainSince = null;
    }
    // "0" first, before any runner goes.
    if (this.target === 0 && this.variable !== false) {
      if ((await this.call("setVariable", () => this.deps.api.setVariable(false))) === null) {
        this.writeStatus();
        return;
      }
      this.variable = false;
    }
    const want = this.target > 0 ? this.target : await this.drainWant();

    if (this.alive > want) {
      await this.scaleDown(want);
    }
    while (this.alive < want) {
      if (!(await this.startOne())) {
        break;
      }
    }
    if (this.alive > 0 && now() - this.lastList >= POLL_MS) {
      await this.refreshBusy();
    }

    const on = this.target > 0 && this.alive > 0;
    if (this.variable !== on) {
      if ((await this.call("setVariable", () => this.deps.api.setVariable(on))) !== null) {
        this.variable = on;
      }
    }
    this.writeStatus();
  }

  /**
   * While scaling to 0: one runner as long as a queued job asks for our
   * label, polled at most once a minute, for at most 10 minutes.
   *
   * @returns {Promise<number>}
   */
  async drainWant() {
    const { now } = this.deps;
    if (this.drainSince === null) {
      return 0;
    }
    if (now() - this.drainSince >= DRAIN_MS) {
      this.deps.log("runners: gave up waiting for queued company jobs");
      this.drainSince = null;
      return 0;
    }
    if (now() - this.lastQueuedPoll >= POLL_MS) {
      this.lastQueuedPoll = now();
      const queued = await this.call("queuedCompanyJobs", () => this.deps.api.queuedCompanyJobs());
      // Not knowing is waiting: the drain gives up at its deadline anyway.
      this.queued = queued === null ? true : queued.value;
    }
    if (!this.queued) {
      this.drainSince = null;
      return 0;
    }
    return 1;
  }

  /**
   * Kills idle runners until `want` are left; busy ones finish their job.
   *
   * @param {number} want
   * @returns {Promise<void>}
   */
  async scaleDown(want) {
    await this.refreshBusy();
    let excess = this.alive - want;
    for (const runner of this.runners.values()) {
      if (excess <= 0) {
        break;
      }
      if (!runner.busy && !runner.killed) {
        this.deps.log(`runners: stopping idle ${runner.name}`);
        runner.killed = true;
        runner.launched.kill();
        excess -= 1;
      }
    }
  }

  /** @returns {Promise<void>} */
  async refreshBusy() {
    const listed = await this.call("list", () => this.deps.api.list());
    if (listed === null) {
      return;
    }
    this.lastList = this.deps.now();
    const busy = new Map(listed.value.map((runner) => [runner.name, runner.busy]));
    for (const runner of this.runners.values()) {
      runner.busy = busy.get(runner.name) ?? false;
    }
  }

  /**
   * Starts one runner, unless something says not to now.
   *
   * @returns {Promise<boolean>} whether one started
   */
  async startOne() {
    const { host, config, api, launch, now, log } = this.deps;
    if (this.stopped) {
      return false;
    }
    const disk = host.diskCapRefusal();
    if (disk !== null) {
      this.reason = disk;
      return false;
    }
    if (host.freeBytes() < config.memoryBytes + MEMORY_HEADROOM) {
      this.overloaded("host memory is short");
      return false;
    }
    if (host.load1() > host.cpus()) {
      this.overloaded("host load is above its CPU count");
      return false;
    }
    if (now() < this.retryAt) {
      return false;
    }
    this.seq += 1;
    const name = `${this.prefix}-${String(this.seq)}`;
    const minted = await this.call("mint", () => api.mint(name));
    if (minted === null) {
      return false;
    }
    if (this.halted()) {
      // Stopped while minting: its registration goes, unused.
      await this.call("remove", () => api.remove(minted.value.id));
      return false;
    }
    const launched = launch(minted.value.jitconfig);
    /** @type {Runner} */
    const runner = {
      name,
      id: minted.value.id,
      started: now(),
      busy: false,
      killed: false,
      launched,
    };
    this.runners.set(name, runner);
    log(`runners: started ${name}`);
    void launched.exited.then((code) => {
      this.exited(runner, code);
    });
    return true;
  }

  /** @param {string} why */
  overloaded(why) {
    if (this.reason !== `not starting a runner: ${why}`) {
      this.deps.log(`runners: not starting a runner: ${why}`);
    }
    this.reason = `not starting a runner: ${why}`;
  }

  /**
   * @param {Runner} runner
   * @param {number} code
   */
  exited(runner, code) {
    this.runners.delete(runner.name);
    this.deps.log(`runners: ${runner.name} exited ${String(code)}`);
    // A signal to the whole group can reach a runner before `stop` marks it.
    const halted = runner.killed || this.stopped;
    if (halted || code !== 0 || !runner.busy) {
      // Only a job ends an ephemeral registration: any other exit leaves it.
      void this.call("remove", () => this.deps.api.remove(runner.id));
    }
    // Asked to go is no failure; an exit 0 GitHub never saw busy (an
    // expired JIT config) proves nothing works.
    if (!halted && code !== 0) {
      this.fail(`${runner.name} exited ${String(code)}`);
    } else if (!halted && runner.busy) {
      // GitHub saw it take its job: whatever was failing works.
      this.failures = 0;
      this.retryAt = 0;
      this.backoffReason = null;
    }
    this.writeStatus();
  }

  /** @returns {Promise<void>} what a crash left: offline, ours by host and label, not alive */
  async removeLeftovers() {
    const listed = await this.deps.api.list();
    const ours = `vibewars-${this.deps.config.hostName}-`;
    for (const runner of listed) {
      if (
        runner.status === "offline" &&
        runner.name.startsWith(ours) &&
        runner.labels.includes(LABEL) &&
        !this.runners.has(runner.name)
      ) {
        this.deps.log(`runners: removing leftover ${runner.name}`);
        await this.deps.api.remove(runner.id);
      }
    }
  }

  /**
   * The clean stop: "0" first, then the runners, then what they left.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    this.stopped = true;
    if (this.deps.config.max > 0) {
      if ((await this.call("setVariable", () => this.deps.api.setVariable(false))) !== null) {
        this.variable = false;
      }
    }
    const exits = [...this.runners.values()].map((runner) => {
      runner.killed = true;
      runner.launched.kill();
      return runner.launched.exited;
    });
    await Promise.all(exits);
    if (this.deps.config.max > 0) {
      await this.call("removeLeftovers", () => this.removeLeftovers());
    }
    this.writeStatus();
  }

  /** Rewrites the status when anything but its time changed. */
  writeStatus() {
    const status = {
      target: this.target,
      max: this.deps.config.max,
      runners: [...this.runners.values()].map(({ name, started, busy }) => ({
        name,
        started,
        busy,
      })),
      variable: this.variable === true,
      reason: this.reason,
      alert: this.alert,
    };
    const key = JSON.stringify(status);
    if (key !== this.lastStatus) {
      this.lastStatus = key;
      this.deps.writeStatus({ at: this.deps.now(), ...status });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The host: gh, the launcher, the machine                                     */
/* -------------------------------------------------------------------------- */

/**
 * The environment of every gh this runs: PATH and HOME, and the runners'
 * own config dir. Nothing else of the host's, so the company's
 * `GH_CONFIG_DIR` and any `GH_TOKEN` never reach it.
 *
 * @param {Record<string, string | undefined>} base
 * @param {string} configDir
 * @returns {Record<string, string>}
 */
export function ghEnv(base, configDir) {
  return {
    PATH: base.PATH ?? "",
    HOME: base.HOME ?? "",
    GH_CONFIG_DIR: configDir,
    GH_PROMPT_DISABLED: "1",
    GH_NO_UPDATE_NOTIFIER: "1",
  };
}

/**
 * Runs `gh api`, with an optional JSON body on stdin, and parses its JSON.
 * Its error says the route and the HTTP status, never the output.
 *
 * @param {Record<string, string>} env
 * @param {string} method
 * @param {string} route
 * @param {unknown} [body]
 * @returns {Promise<unknown>}
 */
function ghApi(env, method, route, body) {
  return new Promise((resolve, reject) => {
    const args = [
      "api",
      "--method",
      method,
      route,
      ...(body === undefined ? [] : ["--input", "-"]),
    ];
    const child = spawn("gh", args, { env, stdio: ["pipe", "pipe", "pipe"] });
    /** @type {Buffer[]} */
    const out = [];
    let err = "";
    child.stdout.on("data", (/** @type {Buffer} */ chunk) => out.push(chunk));
    child.stderr.on("data", (/** @type {Buffer} */ chunk) => {
      err += chunk.toString("utf8");
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new ApiError(`${method} ${route}: ${error.message}`, null));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const status = /HTTP (\d{3})/.exec(err);
        const limited = /rate limit/i.test(err) ? " (rate limit)" : "";
        reject(
          new ApiError(
            `${method} ${route}: ${status === null ? `gh exited ${String(code)}` : `HTTP ${status[1] ?? ""}`}${limited}`,
            status === null ? null : Number(status[1]),
          ),
        );
        return;
      }
      const text = Buffer.concat(out).toString("utf8");
      try {
        resolve(text.trim() === "" ? null : JSON.parse(text));
      } catch {
        reject(new ApiError(`${method} ${route}: not JSON`, null));
      }
    });
    child.stdin.once("error", () => {
      // A gh that fails fast, like on an expired credential, exits before it
      // reads and breaks the pipe: its close reports that, not this crash.
    });
    child.stdin.end(body === undefined ? "" : JSON.stringify(body));
  });
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
const obj = (value) =>
  typeof value === "object" && value !== null ? /** @type {Record<string, unknown>} */ (value) : {};

/**
 * @param {unknown} raw
 * @returns {GithubRunner[]}
 */
export function parseRunners(raw) {
  const runners = obj(raw).runners;
  return (Array.isArray(runners) ? runners : []).flatMap((value) => {
    const r = obj(value);
    if (typeof r.id !== "number" || typeof r.name !== "string") {
      return [];
    }
    const labels = Array.isArray(r.labels) ? r.labels.map((label) => String(obj(label).name)) : [];
    return [
      {
        id: r.id,
        name: r.name,
        status: r.status === "online" ? "online" : "offline",
        busy: r.busy === true,
        labels,
      },
    ];
  });
}

/**
 * The supervisor's GitHub, through gh with the runners' credential.
 *
 * @param {string} repo `owner/name`
 * @param {Record<string, string>} env from `ghEnv`
 * @returns {Api}
 */
export function githubApi(repo, env) {
  const base = `repos/${repo}/actions`;
  return {
    async mint(name) {
      const raw = obj(
        await ghApi(env, "POST", `${base}/runners/generate-jitconfig`, {
          name,
          runner_group_id: RUNNER_GROUP,
          labels: LABELS,
          work_folder: "_work",
        }),
      );
      const runner = obj(raw.runner);
      if (typeof raw.encoded_jit_config !== "string" || typeof runner.id !== "number") {
        throw new ApiError("generate-jitconfig: no JIT config in the answer", null);
      }
      return { id: runner.id, jitconfig: raw.encoded_jit_config };
    },
    async list() {
      return parseRunners(await ghApi(env, "GET", `${base}/runners?per_page=100`));
    },
    async remove(id) {
      try {
        await ghApi(env, "DELETE", `${base}/runners/${String(id)}`);
      } catch (error) {
        // Already gone: an ephemeral runner deregisters itself.
        if (!(error instanceof ApiError && error.status === 404)) {
          throw error;
        }
      }
    },
    async setVariable(on) {
      const value = on ? "1" : "0";
      try {
        await ghApi(env, "PATCH", `${base}/variables/COMPANY_RUNNERS`, {
          name: "COMPANY_RUNNERS",
          value,
        });
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) {
          throw error;
        }
        await ghApi(env, "POST", `${base}/variables`, { name: "COMPANY_RUNNERS", value });
      }
    },
    async queuedCompanyJobs() {
      for (const status of ["queued", "in_progress"]) {
        const runs = obj(
          await ghApi(env, "GET", `${base}/runs?status=${status}&per_page=30`),
        ).workflow_runs;
        for (const run of Array.isArray(runs) ? runs : []) {
          const id = obj(run).id;
          if (typeof id !== "number") {
            continue;
          }
          const jobs = obj(
            await ghApi(env, "GET", `${base}/runs/${String(id)}/jobs?per_page=100`),
          ).jobs;
          for (const job of Array.isArray(jobs) ? jobs : []) {
            const j = obj(job);
            if (j.status === "queued" && Array.isArray(j.labels) && j.labels.includes(LABEL)) {
              return true;
            }
          }
        }
      }
      return false;
    },
  };
}

/**
 * Where each runner's scratch directory is made: `VIBEWARS_RUNNER_SCRATCH`,
 * or the jail wrapper's default.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function runnerScratchDir(env) {
  const set = env.VIBEWARS_RUNNER_SCRATCH;
  if (set !== undefined && set !== "") {
    return set;
  }
  const state = env.XDG_STATE_HOME ?? "";
  const base = state === "" ? path.join(env.HOME ?? os.homedir(), ".local", "state") : state;
  return path.join(base, "vibewars", "runners");
}

/**
 * The launcher's env: PATH, HOME and the scratch dir, and the user bus
 * `systemd-run --user` needs, when set (#1988). Nothing else of the
 * company's env; the jail clears even these.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} scratch
 * @returns {Record<string, string>}
 */
export function launcherEnvOf(env, scratch) {
  /** @type {Record<string, string>} */
  const out = { PATH: env.PATH ?? "", HOME: env.HOME ?? "", VIBEWARS_RUNNER_SCRATCH: scratch };
  for (const name of ["XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"]) {
    const value = env[name];
    if (value !== undefined && value !== "") {
      out[name] = value;
    }
  }
  return out;
}

/**
 * The disk cap (ADR-0045): scratch must be a filesystem of its own, such as
 * a partition or a dataset with a quota, so a job that fills it cannot fill
 * the disk hubd, git and the jails live on. It compares device numbers, so
 * a pooled dataset without a quota, a btrfs subvolume, passes it: the
 * quota is the operator's part.
 *
 * @param {string} scratch
 * @param {readonly string[]} shared the company's and the operator's directories
 * @param {(file: string) => { dev: number }} [stat]
 * @returns {string | null} the refusal, null when scratch is capped
 */
export function diskCapRefusal(scratch, shared, stat = fs.statSync) {
  let dev;
  try {
    dev = stat(scratch).dev;
  } catch {
    return `no disk cap: ${scratch} does not exist; mount a filesystem of its own there`;
  }
  for (const dir of shared) {
    try {
      if (stat(dir).dev === dev) {
        return `no disk cap: ${scratch} is on the same filesystem as ${dir}; mount one of its own there`;
      }
    } catch {
      // Not there: nothing to share a disk with.
    }
  }
  return null;
}

/**
 * @param {string | undefined} value
 * @param {number} fallback the jail's own default
 * @returns {number}
 */
function positive(value, fallback) {
  const number = Number(value);
  return value !== undefined && /^\d+$/.test(value) && number > 0 ? number : fallback;
}

/** The launcher's fd this process holds the other end of, and never writes. */
export const LIFELINE_FD = 3;

/**
 * Starts one launcher, the JIT config on its stdin. Its lifeline is a pipe
 * only this process holds open: when it exits, however it dies, the kernel
 * closes it, and the launcher stops its runner. A restarted supervisor
 * never finds the last one's runners still going.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {Record<string, string>} env
 * @param {string} jitconfig
 * @returns {Launched}
 */
export function spawnLauncher(command, args, env, jitconfig) {
  const child = spawn(command, args, {
    env,
    stdio: ["pipe", "inherit", "inherit", "pipe"],
  });
  child.stdin.once("error", () => {
    // A launcher that exits before it reads, or never starts, breaks the
    // pipe: that is its exit, which `exited` reports, not this one's crash.
  });
  child.stdin.end(`${jitconfig}\n`);
  child.stdio[LIFELINE_FD]?.once("error", () => {
    // Likewise: the launcher went first.
  });
  return {
    exited: new Promise((resolve) => {
      child.once("error", () => {
        resolve(1);
      });
      child.once("exit", (code, signal) => {
        resolve(code ?? (signal === null ? 1 : 128));
      });
    }),
    kill: () => child.kill("SIGTERM"),
  };
}

/**
 * The launcher's command line: no JIT config in it, ever; that goes on stdin.
 *
 * @param {{ cpus: number, memoryGib: number, tasksMax: number }} cap
 * @returns {string[]}
 */
export function launcherArgs({ cpus, memoryGib, tasksMax }) {
  return [
    ...["--jitconfig", "-"],
    ...["--lifeline", String(LIFELINE_FD)],
    ...["--cpus", String(cpus)],
    ...["--memory-gib", String(memoryGib)],
    ...["--tasks-max", String(tasksMax)],
  ];
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const env = process.env;
  const root = env.VIBEWARS_BOT_ROOT ?? path.join(process.cwd(), ".bots");
  const credentials = env.VIBEWARS_CREDENTIALS ?? "";
  const state = runnersStateDir(env);
  ensureStateDir(state);
  const lock = path.join(state, "supervisor.lock");
  // Two would each start runners, and fight over the variable.
  if (!takeLock(lock)) {
    console.error(`runner-supervisor: another holds ${lock}; not starting a second`);
    process.exit(1);
  }
  const max = maxRunners(env);
  const cap = {
    cpus: positive(env.VIBEWARS_RUNNER_CPUS, 2),
    memoryGib: positive(env.VIBEWARS_RUNNER_MEMORY_GIB, 6),
    tasksMax: positive(env.VIBEWARS_RUNNER_TASKS_MAX, 2048),
  };
  const scratch = runnerScratchDir(env);
  if (env.XDG_RUNTIME_DIR === undefined && env.DBUS_SESSION_BUS_ADDRESS === undefined) {
    console.error(
      "runner-supervisor: neither XDG_RUNTIME_DIR nor DBUS_SESSION_BUS_ADDRESS is set; systemd-run --user will fail",
    );
  }
  /** @type {unknown} */
  const company = JSON.parse(fs.readFileSync(path.join(root, "company.json"), "utf8"));
  const named = obj(company).repo;
  const repo = typeof named === "string" ? named : "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    console.error("runner-supervisor: company.json names no repository");
    process.exit(1);
  }
  const gh = ghEnv(env, path.join(credentials, "runners-gh"));
  const launcherEnv = launcherEnvOf(env, scratch);
  const supervisor = new RunnerSupervisor({
    now: () => Date.now(),
    api: githubApi(repo, gh),
    launch: (jitconfig) =>
      spawnLauncher("vibewars-runner-jail", launcherArgs(cap), launcherEnv, jitconfig),
    host: {
      freeBytes: () => os.freemem(),
      load1: () => os.loadavg()[0] ?? 0,
      cpus: () => os.availableParallelism(),
      diskCapRefusal: () => diskCapRefusal(scratch, [root, env.HOME ?? os.homedir()]),
    },
    readTarget: () => readTarget(state, max),
    writeStatus: (status) => {
      writePrivate(path.join(state, STATUS_FILE), JSON.stringify(status));
    },
    log: (line) => {
      console.error(line);
    },
    config: {
      max,
      hostName: os
        .hostname()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .slice(0, 24),
      memoryBytes: cap.memoryGib * 1024 ** 3,
    },
  });
  console.error(`runner-supervisor: ${repo}, max ${String(max)}, scratch ${scratch}`);
  let stopping = false;
  /** @param {string} why */
  const stop = async (why) => {
    if (stopping) {
      return;
    }
    stopping = true;
    console.error(`runner-supervisor: stopping on ${why}`);
    await supervisor.stop();
    releaseLock(lock);
    process.exit(0);
  };
  for (const signal of /** @type {const} */ (["SIGTERM", "SIGINT", "SIGHUP"])) {
    process.on(signal, () => void stop(signal));
  }
  // Until a signal: `stop` exits, and a tick after it does nothing.
  for (;;) {
    await supervisor.tick();
    await sleep(TICK_MS);
  }
}
