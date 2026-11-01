import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  maxRunners,
  parseStatus,
  parseTarget,
  readAlertTold,
  readStatus,
  readTarget,
  runnersLines,
  runnersStateDir,
  writeAlertTold,
  writeTarget,
} from "./runners-state.mjs";

const STATUS = {
  at: 1,
  target: 2,
  max: 4,
  runners: [
    { name: "vibewars-box-a-1", started: 1, busy: true },
    { name: "vibewars-box-a-2", started: 1, busy: false },
  ],
  variable: true,
  reason: null,
  alert: null,
};

describe("runners state", () => {
  it("VIBEWARS_MAX_RUNNERS unset or not a whole number is 0", () => {
    expect(maxRunners({})).toBe(0);
    expect(maxRunners({ VIBEWARS_MAX_RUNNERS: "" })).toBe(0);
    expect(maxRunners({ VIBEWARS_MAX_RUNNERS: "2.5" })).toBe(0);
    expect(maxRunners({ VIBEWARS_MAX_RUNNERS: "-1" })).toBe(0);
    expect(maxRunners({ VIBEWARS_MAX_RUNNERS: "3" })).toBe(3);
  });

  it("refuses a target that is not a whole number in 0..max", () => {
    expect(parseTarget("2\n", 4)).toEqual({ ok: true, n: 2 });
    expect(parseTarget("0", 0)).toEqual({ ok: true, n: 0 });
    expect(parseTarget("5", 4)).toEqual({
      ok: false,
      reason: "the target 5 is above the max 4; treated as 0",
    });
    expect(parseTarget("1", 0)).toMatchObject({ ok: false });
    for (const garbage of ["", "x", "-1", "1.5", "1e3", "2 3", "99999"]) {
      expect(parseTarget(garbage, 4)).toMatchObject({ ok: false });
    }
  });

  it("a written target is read back; a missing one is 0, a refused one 0 with its reason", () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "runners-")), "state");
    expect(readTarget(dir, 4)).toEqual({ n: 0, reason: null });
    writeTarget(dir, 3);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dir, "target")).mode & 0o777).toBe(0o600);
    expect(readTarget(dir, 4)).toEqual({ n: 3, reason: null });
    expect(readTarget(dir, 2)).toEqual({
      n: 0,
      reason: "the target 3 is above the max 2; treated as 0",
    });
  });

  it("keeps the alert told across a restart, and forgets it once cleared", () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "runners-")), "state");
    expect(readAlertTold(dir)).toBeNull();
    writeAlertTold(dir, "the runners' credential was refused");
    expect(fs.statSync(path.join(dir, "alert-told")).mode & 0o777).toBe(0o600);
    expect(readAlertTold(dir)).toBe("the runners' credential was refused");
    writeAlertTold(dir, null);
    expect(readAlertTold(dir)).toBeNull();
  });

  it("reads only a status of the current shape", () => {
    expect(parseStatus(JSON.stringify(STATUS))).toEqual(STATUS);
    expect(parseStatus("{")).toBeNull();
    expect(parseStatus(JSON.stringify({ ...STATUS, target: -1 }))).toBeNull();
    expect(parseStatus(JSON.stringify({ ...STATUS, runners: [{ name: 1 }] }))).toBeNull();
    const { alert: _alert, ...noAlert } = STATUS;
    expect(parseStatus(JSON.stringify(noAlert))).toBeNull();
  });

  it("a missing status file means the supervisor has not run", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runners-"));
    expect(readStatus(dir)).toBeNull();
    expect(runnersLines(null, 0)).toEqual(["runners: not started (max 0)"]);
  });

  it("says online/target, busy and max, and the last reason", () => {
    expect(runnersLines(STATUS, 4)).toEqual(["runners: 2/2 (busy 1, max 4)"]);
    expect(runnersLines({ ...STATUS, runners: [], reason: "no disk cap: x" }, 4)).toEqual([
      "runners: 0/2 (busy 0, max 4)",
      "  no disk cap: x",
    ]);
  });

  it("lives in its own state dir, outside the company's", () => {
    expect(runnersStateDir({ HOME: "/h" })).toBe("/h/.local/state/vibewars/runner-supervisor");
    expect(runnersStateDir({ HOME: "/h", XDG_STATE_HOME: "/s" })).toBe(
      "/s/vibewars/runner-supervisor",
    );
    expect(runnersStateDir({ VIBEWARS_RUNNERS_STATE: "/r" })).toBe("/r");
  });
});
