import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  askMaxRunners,
  maxRunners,
  parseMaxRunners,
  parseStatus,
  parseTarget,
  readAlertTold,
  readRunnerCap,
  readStatus,
  readTarget,
  runnersLines,
  runnersOff,
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
  it("maxRunners is company.json's whole number ≥ 0, and null when missing or malformed", () => {
    expect(maxRunners({ maxRunners: 3 })).toBe(3);
    expect(maxRunners({ maxRunners: 0 })).toBe(0);
    expect(maxRunners({})).toBeNull();
    expect(maxRunners(null)).toBeNull();
    expect(maxRunners({ maxRunners: "3" })).toBeNull();
    expect(maxRunners({ maxRunners: 2.5 })).toBeNull();
    expect(maxRunners({ maxRunners: -1 })).toBeNull();
  });

  it("an answer to the runner cap: Enter is 0, a whole number is itself, else null", () => {
    expect(parseMaxRunners("")).toBe(0);
    expect(parseMaxRunners(" 3 ")).toBe(3);
    expect(parseMaxRunners("-1")).toBeNull();
    expect(parseMaxRunners("abc")).toBeNull();
    expect(parseMaxRunners("2.5")).toBeNull();
  });

  /**
   * `askMaxRunners` with scripted answers.
   *
   * @param {unknown} stored
   * @param {string[]} answers
   * @param {boolean} [runnersSetUp]
   */
  async function ask(stored, answers, runnersSetUp = true) {
    /** @type {string[]} */
    const asked = [];
    /** @type {string[]} */
    const said = [];
    const cap = await askMaxRunners({
      stored,
      ask: (question) => {
        asked.push(question);
        return Promise.resolve(answers.shift() ?? "");
      },
      runnersSetUp: () => runnersSetUp,
      say: (line) => said.push(line),
    });
    return { cap, asked, said };
  }

  it("init asks for the cap on a first run, and keeps a stored one without asking", async () => {
    const first = await ask(null, ["2"]);
    expect(first.cap).toBe(2);
    expect(first.asked).toEqual(["  Most CI runners the company may run on this machine [0]: "]);
    expect(first.said).toEqual([
      "  Company runners run any branch's code on this machine: see ADR-0045.",
    ]);
    const again = await ask({ maxAgents: 12, maxRunners: 2 }, []);
    expect(again).toEqual({ cap: 2, asked: [], said: [] });
    const zero = await ask({ maxAgents: 12, maxRunners: 0 }, []);
    expect(zero.asked).toEqual([]);
    expect(zero.cap).toBe(0);
  });

  it("init stores 0 on Enter, says nothing, and asks again after -1 and abc", async () => {
    expect(await ask({ maxAgents: 12 }, [""])).toMatchObject({ cap: 0, said: [] });
    const retried = await ask(null, ["-1", "abc", "1"]);
    expect(retried.cap).toBe(1);
    expect(retried.asked).toHaveLength(3);
    expect(retried.said.filter((line) => line.includes("0 or more"))).toHaveLength(2);
  });

  it("init hints at claude-llc auth for a cap above 0 without the token, and keeps it", async () => {
    const unset = await ask(null, ["3"], false);
    expect(unset.cap).toBe(3);
    expect(unset.said.at(-1)).toBe(
      "  github runners: not set up. Run claude-llc auth before raising the target.",
    );
    const kept = await ask({ maxRunners: 2 }, [], false);
    expect(kept).toEqual({ cap: 2, asked: [], said: [unset.said.at(-1)] });
    expect((await ask(null, ["0"], false)).said).toEqual([]);
  });

  it("auth reads the cap from company.json: none is 0, a bad one is refused (#2765)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runners-"));
    const refused = { ok: false, reason: "company.json refused: run claude-llc-init" };
    try {
      expect(readRunnerCap(dir)).toEqual({ ok: true, max: 0 });
      const write = (/** @type {string} */ text) => {
        fs.writeFileSync(path.join(dir, "company.json"), text);
      };
      write(JSON.stringify({ maxAgents: 12, maxRunners: 4 }));
      expect(readRunnerCap(dir)).toEqual({ ok: true, max: 4 });
      write(JSON.stringify({ maxAgents: 12 }));
      expect(readRunnerCap(dir)).toEqual(refused);
      write(JSON.stringify({ maxRunners: "4" }));
      expect(readRunnerCap(dir)).toEqual(refused);
      write("{");
      expect(readRunnerCap(dir)).toEqual(refused);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect(runnersOff({ ok: true, max: 0 })).toBe("runners off");
    expect(runnersOff({ ok: true, max: 1 })).toBeNull();
    expect(runnersOff(refused)).toBe(refused.reason);
  });

  it("no jail binds company.json, nor a directory holding it (#2764)", () => {
    const nix = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../../nix/claude-bot.nix"),
      "utf8",
    );
    const sources = [...nix.matchAll(/--(?:ro-)?bind(?:-try)?\s+"([^"]+)"/g)].map(
      (match) => match[1] ?? "",
    );
    expect(sources).toContain("$VIBEWARS_BOT_ROOT/hub");
    for (const source of sources) {
      expect(source).not.toMatch(/company\.json/);
      expect(["$VIBEWARS_BOT_ROOT", "$DEVENV_ROOT", "$VIBEWARS_CODE", "$HOME"]).not.toContain(
        source.replace(/\/$/, ""),
      );
    }
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
    expect(runnersLines(null, null)).toEqual(["runners: not started (max ?)"]);
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
