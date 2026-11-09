import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAX_SLEEP,
  MIN_SLEEP,
  MIN_WAKE,
  SLEEP_THRESHOLD,
  SLEEP_WARNING,
  exitedAfterWake,
  hibernateSetting,
  parseLimitPause,
  parseSleepPlan,
  sleepDecision,
  sleepInhibitors,
  wallClockJumped,
} from "./hub-sleep.mjs";
import { SLEEP_SCRIPT_TEXT, sleepNixosSnippet } from "./hub-sleep-units.mjs";

const NOW = 1_000_000;
const RESET = NOW + 3 * 60 * 60;
const PLAN = { id: "a".repeat(32), sleepAt: NOW + 60, wakeAt: RESET - 300, reset: RESET };

/** @param {Partial<import("./hub-sleep.mjs").SleepInput>} [over] */
function input(over = {}) {
  return {
    now: NOW,
    hibernate: { wakeMarginMinutes: 5 },
    pauses: [
      { employee: "manager", until: RESET },
      { employee: "developer", until: RESET + 600 },
    ],
    runnersBusy: false,
    rebootPending: false,
    inhibitors: 0,
    cancel: null,
    sleptFor: null,
    plan: null,
    ...over,
  };
}

describe("sleepDecision (#2794)", () => {
  it("plans a sleep for the earliest reset, less the margin, after the warning", () => {
    expect(sleepDecision(input())).toEqual({
      kind: "plan",
      reason: "",
      wakeAt: RESET - 300,
      sleepAt: NOW + SLEEP_WARNING,
      reset: RESET,
    });
  });

  it("takes the margin from company.json", () => {
    const decision = sleepDecision(input({ hibernate: { wakeMarginMinutes: 20 } }));
    expect(decision.wakeAt).toBe(RESET - 1200);
  });

  it.each(
    /** @type {[string, Partial<import("./hub-sleep.mjs").SleepInput>][]} */ ([
      ["hibernation off", { hibernate: null }],
      ["no agents", { pauses: [] }],
      ["an agent not paused", { pauses: [{ employee: "qa", until: null }] }],
      [
        "one of several with no known reset",
        {
          pauses: [
            { employee: "manager", until: RESET },
            { employee: "qa", until: null },
          ],
        },
      ],
      [
        "a reset exactly at the threshold",
        { pauses: [{ employee: "m", until: NOW + SLEEP_THRESHOLD }] },
      ],
      ["a reset past the cap", { pauses: [{ employee: "m", until: NOW + MAX_SLEEP + 3600 }] }],
      ["a busy runner", { runnersBusy: true }],
      ["a pending reboot", { rebootPending: true }],
      ["an inhibitor", { inhibitors: 1 }],
      ["a cancel for this reset", { cancel: { reset: RESET } }],
      ["a sleep already carried out for this reset", { sleptFor: RESET, cancel: { reset: 1 } }],
      [
        "an alarm too close at margin 60",
        {
          hibernate: { wakeMarginMinutes: 60 },
          pauses: [{ employee: "m", until: NOW + 61 * 60 }],
        },
      ],
    ]),
  )("does not plan with %s", (_name, over) => {
    expect(sleepDecision(input(over)).kind).toBe("none");
  });

  it("plans just past the threshold, and when a cancel was for another reset", () => {
    expect(
      sleepDecision(input({ pauses: [{ employee: "m", until: NOW + SLEEP_THRESHOLD + 1 }] })).kind,
    ).toBe("plan");
    expect(sleepDecision(input({ cancel: { reset: RESET - 1 } })).kind).toBe("plan");
  });

  it("keeps the alarm far enough off through the warning", () => {
    const margin = { hibernate: { wakeMarginMinutes: 60 } };
    const reset = NOW + 60 * 60 + MIN_SLEEP + SLEEP_WARNING;
    const pauses = [{ employee: "m", until: reset }];
    expect(sleepDecision(input({ ...margin, pauses })).kind).toBe("plan");
    expect(
      sleepDecision(input({ ...margin, pauses: [{ employee: "m", until: reset - 1 }] })).kind,
    ).toBe("none");
    const plan = { ...PLAN, sleepAt: NOW + SLEEP_WARNING, wakeAt: reset - 3600, reset };
    expect(sleepDecision(input({ ...margin, pauses, plan, now: plan.sleepAt })).kind).toBe("sleep");
    expect(sleepDecision(input({ ...margin, pauses, plan, now: plan.sleepAt + 1 })).kind).toBe(
      "abandon",
    );
  });

  it("waits out the warning, then sleeps", () => {
    expect(sleepDecision(input({ plan: PLAN })).kind).toBe("none");
    expect(sleepDecision(input({ plan: PLAN, now: PLAN.sleepAt }))).toEqual({
      kind: "sleep",
      reason: "",
      wakeAt: PLAN.wakeAt,
    });
  });

  it.each(
    /** @type {[string, Partial<import("./hub-sleep.mjs").SleepInput>, string][]} */ ([
      ["a cancel", { cancel: { reset: RESET } }, "cancelled"],
      ["a runner taking a job", { runnersBusy: true }, "a CI runner has a job"],
      ["hibernation turned off", { hibernate: null }, "hibernation is off"],
      ["a reset that moved", { pauses: [{ employee: "m", until: RESET + 60 }] }, "the reset moved"],
    ]),
  )("abandons a plan on %s", (_name, over, reason) => {
    expect(sleepDecision(input({ plan: PLAN, ...over }))).toEqual({
      kind: "abandon",
      reason,
      wakeAt: null,
    });
  });
});

describe("the shapes hubd reads (#2794)", () => {
  it("treats a missing or malformed hibernate as off", () => {
    expect(hibernateSetting({ hibernate: { wakeMarginMinutes: 7 } })).toEqual({
      wakeMarginMinutes: 7,
    });
    for (const config of [{}, null, { hibernate: null }, { hibernate: { wakeMarginMinutes: 0 } }]) {
      expect(hibernateSetting(config)).toBeNull();
    }
  });

  it("reads an empty limit-pause as an unknown reset", () => {
    expect(parseLimitPause("123\n")).toBe(123);
    expect(parseLimitPause("")).toBeNull();
    expect(parseLimitPause("soon")).toBeNull();
  });

  it("refuses a plan of another shape", () => {
    expect(parseSleepPlan(PLAN)).toEqual(PLAN);
    expect(parseSleepPlan({ ...PLAN, id: "x" })).toBeNull();
    expect(parseSleepPlan({ ...PLAN, wakeAt: "1" })).toBeNull();
  });

  it("counts only inhibitors of sleep", () => {
    const listing = [
      "gdm 0 root 1 x shutdown:sleep why block",
      "x 0 root 2 y idle:handle-lid-switch mentions sleep-ish things block",
      "",
    ].join("\n");
    expect(sleepInhibitors(listing)).toBe(1);
  });
});

describe("waking (#2794)", () => {
  it("sees a jump of over two minutes", () => {
    expect(wallClockJumped(0, 120_000)).toBe(false);
    expect(wallClockJumped(0, 120_001)).toBe(true);
  });

  it("forgives an exit within 60 s of a wake only", () => {
    expect(exitedAfterWake(null, 1000)).toBe(false);
    expect(exitedAfterWake(1000, 61_000)).toBe(true);
    expect(exitedAfterWake(1000, 61_001)).toBe(false);
  });
});

describe("the root oneshot's check (#2794)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibewars-sleep-"));
  const script = path.join(dir, "vibewars-sleep");
  fs.writeFileSync(script, SLEEP_SCRIPT_TEXT);

  /** @param {string} wake */
  const check = (wake) =>
    spawnSync("bash", ["-c", 'source "$1"; valid_wake "$2" 1000', "_", script, wake]).status;

  it("takes a future time within the cap", () => {
    expect(check(String(1000 + MIN_WAKE))).toBe(0);
    expect(check(String(1000 + MAX_SLEEP))).toBe(0);
  });

  it.each([
    ["the past", "999"],
    ["now", "1000"],
    ["one second ahead", "1001"],
    ["just under the floor", String(999 + MIN_WAKE)],
    ["over the cap", String(1001 + MAX_SLEEP)],
    ["empty", ""],
    ["not a number", "abc"],
    ["negative", "-5"],
    ["a command", "$(reboot)"],
    ["too long for arithmetic", "9".repeat(30)],
  ])("refuses %s", (_name, wake) => {
    expect(check(wake)).toBe(1);
  });

  /**
   * Run the oneshot on a request file, with the root commands stubbed.
   *
   * @param {(request: string) => void} write
   * @returns {string} what it did
   */
  const main = (write) => {
    const request = path.join(fs.mkdtempSync(path.join(dir, "run-")), "request");
    write(request);
    const stubs =
      'rtcwake() { echo "rtcwake $*"; }; systemctl() { echo "systemctl $*"; }; ' +
      'source "$1"; request="$2"; main';
    const { stdout } = spawnSync("bash", ["-c", stubs, "_", script, request], {
      encoding: "utf8",
    });
    expect(fs.existsSync(request)).toBe(false);
    return stdout;
  };

  it("sets the alarm and hibernates through systemd", () => {
    const wake = Math.floor(Date.now() / 1000) + 3600;
    expect(
      main((request) => {
        fs.writeFileSync(request, `${String(wake)}\n`);
      }),
    ).toBe(`rtcwake -m no -t ${String(wake)}\nsystemctl hibernate\n`);
  });

  it("does not follow a symlink, and does nothing with no request", () => {
    expect(
      main((request) => {
        fs.symlinkSync("/etc/passwd", request);
      }),
    ).toContain("refused");
    expect(
      main(() => {
        /* none */
      }),
    ).toBe("");
  });

  it("escapes the script for a Nix string", () => {
    const snippet = sleepNixosSnippet("ente");
    expect(snippet).toContain("''${BASH_SOURCE[0]}");
    expect(snippet).not.toMatch(/[^']\$\{BASH_SOURCE/);
  });
});
