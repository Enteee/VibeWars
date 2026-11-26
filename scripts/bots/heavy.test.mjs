import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  EXIT_GAVE_UP,
  EXIT_SHORT_KILLED,
  RENEW_MS,
  SHORT_KILL_MS,
  parseHeavy,
  runHeavy,
  spawnInGroup,
} from "./heavy.mjs";

/**
 * A fake world: a clock that only sleep advances, a scripted hubd, a child
 * that ends when told to.
 *
 * @param {{ answers?: Record<string, unknown>[], childCode?: number, childMs?: number, failAcquires?: number, env?: Record<string, string> }} [options]
 */
const world = (options = {}) => {
  let clock = 0;
  const calls = /** @type {[string, string[]][]} */ ([]);
  const said = /** @type {string[]} */ ([]);
  const spawned = /** @type {{ argv: string[], env: Record<string, string | undefined> }[]} */ ([]);
  const answers = [...(options.answers ?? [{ granted: true, leaseId: "L1" }])];
  /** @type {Record<string, unknown> | undefined} */
  let renewAnswer;
  let failures = options.failAcquires ?? 0;
  const kills = /** @type {string[]} */ ([]);
  return {
    kills,
    calls,
    said,
    spawned,
    setRenew: (/** @type {Record<string, unknown>} */ answer) => {
      renewAnswer = answer;
    },
    run: (/** @type {string[]} */ argv) =>
      runHeavy({
        argv,
        env: options.env ?? {},
        request: (op, args) => {
          calls.push([op, args]);
          if (op === "acquire" && failures > 0) {
            failures -= 1;
            return Promise.reject(new Error("hubd down"));
          }
          if (op === "acquire")
            return Promise.resolve(answers.length > 1 ? answers.shift() : answers[0]);
          if (op === "renew") return Promise.resolve(renewAnswer ?? { ok: true });
          if (op === "status") return Promise.resolve({ holder: "qa 3m: bench", queue: ["dev x"] });
          return Promise.resolve({ ok: true });
        },
        spawnChild: (childArgv, env) => {
          spawned.push({ argv: childArgv, env });
          const started = clock;
          let dead = false;
          return {
            exited: new Promise((resolve) => {
              const poll = () => {
                if (dead) resolve(143);
                else if (clock - started >= (options.childMs ?? 0)) resolve(options.childCode ?? 0);
                else setImmediate(poll);
              };
              poll();
            }),
            kill: (signal) => {
              kills.push(signal);
              dead = true;
            },
          };
        },
        sleep: (ms) => {
          clock += ms;
          return new Promise((resolve) => setImmediate(resolve));
        },
        now: () => clock,
        say: (line) => said.push(line),
        onSignal: () => undefined,
      }),
  };
};

describe("runHeavy", () => {
  it("runs only after it is granted, with the lease id in the child's env", async () => {
    const w = world({
      answers: [
        { granted: false, ahead: 2, holder: "qa, 3m: bench" },
        { granted: false, ahead: 1, holder: "qa, 3m: bench" },
        { granted: true, leaseId: "L9" },
      ],
    });
    expect(await w.run(["pnpm", "bench"])).toBe(0);
    expect(w.said).toEqual([
      "heavy: queued, 2 ahead (holder: qa, 3m: bench)",
      "heavy: queued, 1 ahead (holder: qa, 3m: bench)",
    ]);
    expect(w.spawned[0]?.env.VIBEWARS_HEAVY).toBe("L9");
    expect(w.calls.at(-1)).toEqual(["release", ["L9"]]);
  });

  it("retries when hubd does not answer an acquire", async () => {
    const w = world({ failAcquires: 1 });
    expect(await w.run(["x"])).toBe(0);
    expect(w.said).toEqual(["heavy: hubd did not answer; retrying"]);
    expect(w.spawned).toHaveLength(1);
  });

  it("passes the child's exit code through", async () => {
    expect(await world({ childCode: 3 }).run(["false"])).toBe(3);
  });

  it("gives up after --max-wait with 75 and runs nothing", async () => {
    const w = world({ answers: [{ granted: false, ahead: 1, holder: "qa, 3m: x" }] });
    expect(await w.run(["--max-wait", "1", "x"])).toBe(EXIT_GAVE_UP);
    expect(w.spawned).toEqual([]);
    expect(w.said.at(-1)).toBe("heavy: gave up after 1 min (holder: qa, 3m: x)");
    expect(w.calls.some(([op]) => op === "leave")).toBe(true);
  });

  it("skips the lock when the nested variable is set", async () => {
    const w = world({ env: { VIBEWARS_HEAVY: "L1" } });
    expect(await w.run(["x"])).toBe(0);
    expect(w.calls).toEqual([]);
  });

  it("renews while the child runs", async () => {
    const w = world({ childMs: RENEW_MS * 2 + 1 });
    await w.run(["x"]);
    expect(w.calls.filter(([op]) => op === "renew").length).toBeGreaterThanOrEqual(2);
  });

  it("warns once when the lease is lost and keeps running", async () => {
    const w = world({ childMs: RENEW_MS * 3 + 1 });
    w.setRenew({ ok: false });
    expect(await w.run(["x"])).toBe(0);
    expect(w.said.filter((line) => line.includes("lost the lease"))).toHaveLength(1);
  });

  it("asks for a short or a long slot", async () => {
    const long = world();
    await long.run(["x"]);
    expect(long.calls[0]).toEqual(["acquire", ["x", "long"]]);
    const short = world();
    await short.run(["--short", "x"]);
    expect(short.calls[0]).toEqual(["acquire", ["x", "short"]]);
  });

  it("kills a short job at 10 minutes, exits 124 and releases the lease", async () => {
    const w = world({ childMs: SHORT_KILL_MS * 2 });
    expect(await w.run(["--short", "x"])).toBe(EXIT_SHORT_KILLED);
    expect(w.kills[0]).toBe("SIGTERM");
    expect(w.said).toContain("heavy: short job killed at 10 min; run it without --short");
    expect(w.calls.at(-1)).toEqual(["release", ["L1"]]);
  });

  it("sets no timer on a long job", async () => {
    const w = world({ childMs: SHORT_KILL_MS * 2 });
    expect(await w.run(["x"])).toBe(0);
    expect(w.kills).toEqual([]);
  });

  it("prints the holder and the queue with no command", async () => {
    const w = world();
    expect(await w.run([])).toBe(0);
    expect(w.said).toEqual(["holder: qa 3m: bench", "queued: dev x"]);
  });
});

describe("parseHeavy", () => {
  it("reads --short and --max-wait in either order", () => {
    expect(parseHeavy(["--short", "--max-wait", "5", "x"])).toEqual({
      maxWaitMin: 5,
      short: true,
      cmd: ["x"],
    });
    expect(parseHeavy(["--max-wait", "5", "--short", "x"])).toEqual({
      maxWaitMin: 5,
      short: true,
      cmd: ["x"],
    });
  });
});

describe("spawnInGroup", () => {
  it("kills what a wrapper started, not only the wrapper", async () => {
    const marker = `sleep ${String(4000 + (process.pid % 1000))}`;
    const child = spawnInGroup(["bash", "-c", `${marker}; true`], process.env);
    await new Promise((r) => setTimeout(r, 300));
    const alive = () => {
      try {
        return execFileSync("pgrep", ["-f", marker]).length > 0;
      } catch {
        return false;
      }
    };
    expect(alive()).toBe(true);
    child.kill("SIGTERM");
    await child.exited;
    await new Promise((r) => setTimeout(r, 200));
    expect(alive()).toBe(false);
  });
});
