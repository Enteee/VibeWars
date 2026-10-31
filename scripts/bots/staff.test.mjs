import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { COLUMNS } from "./hub-board.mjs";
import { ROLES } from "./hub-policy.mjs";
import {
  COOLDOWN_MS,
  applyStaff,
  checkStaff,
  markReady,
  nextEmployeeId,
  parseStaff,
  roleOf,
  seedStaff,
  staffAllowed,
  staffReader,
  strangers,
  withStaffLock,
  withoutEmployees,
  WORK_COLUMN,
} from "./staff.mjs";

const STAFF = path.join(path.dirname(fileURLToPath(import.meta.url)), "staff.mjs");
const NOW = 1_800_000_000_000;
const MINUTE = 60_000;

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A company employing `ids`, each hired an hour ago, with `recent` changes.
 *
 * @param {string[]} ids
 * @param {import("./staff.mjs").Change[]} [recent]
 * @returns {import("./staff.mjs").Staff}
 */
function company(ids, recent = []) {
  /** @type {import("./staff.mjs").Staff["employees"]} */
  const employees = {};
  for (const id of ids) {
    employees[id] = {
      role: roleOf(id) ?? "",
      hiredAt: NOW - 60 * MINUTE,
      by: "operator",
      reason: "first boot",
      state: "working",
      readyAt: null,
    };
  }
  return { employees, recent };
}

/**
 * @param {import("./staff.mjs").Staff} staff
 * @param {import("./staff.mjs").StaffRequest} request
 * @param {{ maxAgents?: number, rebootPending?: boolean }} [options]
 */
function decide(staff, request, { maxAgents = 20, rebootPending = false } = {}) {
  return staffAllowed(staff, request, {
    roster: ROLES,
    maxAgents,
    rebootPending,
    now: NOW,
    history: staff.recent,
  });
}

/**
 * Why a request was refused, or "allowed".
 *
 * @param {ReturnType<typeof staffAllowed>} answer
 * @returns {string}
 */
const refusal = (answer) => (answer.ok ? "allowed" : answer.reason);

/** @param {string} role */
const hire = (role) => /** @type {const} */ ({ verb: "hire", role, reason: "r", by: "manager" });
/** @param {string} employee */
const fire = (employee) =>
  /** @type {const} */ ({ verb: "fire", employee, reason: "r", by: "manager" });

describe("WORK_COLUMN (#1694)", () => {
  it("names a column, or none, for every role and no other", () => {
    expect(Object.keys(WORK_COLUMN).sort()).toEqual([...ROLES].sort());
    for (const column of Object.values(WORK_COLUMN)) {
      expect(column === null || COLUMNS.includes(column)).toBe(true);
    }
  });
});

describe("roleOf", () => {
  it("is the role of a bare seat and of a numbered one", () => {
    expect(roleOf("qa-tester")).toBe("qa-tester");
    expect(roleOf("qa-tester@2")).toBe("qa-tester");
    expect(roleOf("developer@12")).toBe("developer");
  });

  it("is null for what is not an employee id", () => {
    for (const id of ["qa-tester@1", "qa-tester@0", "qa-tester@02", "qa-tester@", "@2", "QA"]) {
      expect(roleOf(id), id).toBeNull();
    }
  });
});

describe("nextEmployeeId", () => {
  it("takes the bare seat first, then the lowest free number from 2", () => {
    expect(nextEmployeeId("qa-tester", company([]))).toBe("qa-tester");
    expect(nextEmployeeId("qa-tester", company(["qa-tester"]))).toBe("qa-tester@2");
    expect(nextEmployeeId("qa-tester", company(["qa-tester", "qa-tester@2"]))).toBe("qa-tester@3");
  });

  it("fills a gap a fire left", () => {
    expect(nextEmployeeId("qa-tester", company(["qa-tester", "qa-tester@3"]))).toBe("qa-tester@2");
    expect(nextEmployeeId("qa-tester", company(["qa-tester@2"]))).toBe("qa-tester");
  });
});

describe("staffAllowed", () => {
  const everyone = company([...ROLES]);

  it("hires into the next free seat", () => {
    expect(decide(everyone, hire("qa-tester"))).toEqual({ ok: true, employee: "qa-tester@2" });
    expect(decide(company(["manager"]), hire("qa-tester"))).toEqual({
      ok: true,
      employee: "qa-tester",
    });
  });

  it("fires an employee who is working", () => {
    expect(decide(everyone, fire("asset-designer"))).toEqual({
      ok: true,
      employee: "asset-designer",
    });
  });

  it("lets the operator skip the cooldowns, and pass the cap only with overCap", () => {
    const busy = company(
      ["manager", "qa-tester"],
      [
        { at: NOW - MINUTE, change: "hire", id: "a" },
        { at: NOW - MINUTE, change: "hire", id: "b" },
        { at: NOW - MINUTE, change: "hire", id: "c" },
        { at: NOW - MINUTE, change: "fire", id: "qa-tester" },
      ],
    );
    const hireAs = /** @type {const} */ ({
      verb: "hire",
      role: "qa-tester",
      reason: "r",
      by: "operator",
    });
    expect(refusal(decide(busy, hire("qa-tester")))).toMatch(/3 hires in the last 10 min/);
    expect(decide(busy, hireAs)).toEqual({ ok: true, employee: "qa-tester@2" });
    expect(
      decide(busy, { verb: "fire", employee: "qa-tester", reason: "r", by: "operator" }),
    ).toEqual({
      ok: true,
      employee: "qa-tester",
    });

    expect(refusal(decide(busy, hireAs, { maxAgents: 2 }))).toMatch(/maxAgents is 2/);
    expect(decide(busy, { ...hireAs, overCap: true }, { maxAgents: 2 })).toEqual({
      ok: true,
      employee: "qa-tester@2",
    });
    expect(
      refusal(decide(busy, { ...hire("qa-tester"), overCap: true }, { maxAgents: 2 })),
    ).toMatch(/maxAgents is 2/);
    expect(refusal(decide(busy, { ...hireAs, role: "manager" }))).toMatch(/exactly one/);
  });

  it("refuses a role that is not in the roster", () => {
    const answer = decide(everyone, hire("developer-3"));
    expect(refusal(answer)).toMatch(/not a role/);
  });

  it("refuses to hire or fire the manager", () => {
    expect(decide(company(["qa-tester"]), hire("manager"))).toMatchObject({ ok: false });
    expect(refusal(decide(everyone, fire("manager")))).toMatch(/always exactly one/);
  });

  it("refuses to fire an unknown employee, or one already being fired", () => {
    expect(refusal(decide(everyone, fire("qa-tester@2")))).toMatch(/not an employee/);
    expect(decide(everyone, fire("nobody@2"))).toMatchObject({ ok: false });
    const firing = applyStaff(everyone, fire("qa-tester"), "qa-tester", NOW - 20 * MINUTE);
    expect(refusal(decide(firing, fire("qa-tester")))).toMatch(/already being fired/);
  });

  it("caps the headcount, counting the manager and anyone being fired", () => {
    const three = company(["manager", "qa-tester", "lead-dev"]);
    expect(decide(three, hire("architect"), { maxAgents: 3 })).toMatchObject({
      ok: false,
      reason: "the company has 3 employees, maxAgents is 3",
    });
    expect(decide(three, hire("architect"), { maxAgents: 4 })).toMatchObject({ ok: true });
    const firing = applyStaff(three, fire("qa-tester"), "qa-tester", NOW - 20 * MINUTE);
    expect(decide(firing, hire("architect"), { maxAgents: 3 })).toMatchObject({ ok: false });
    // A fire is never refused by the cap.
    expect(decide(three, fire("lead-dev"), { maxAgents: 1 })).toMatchObject({ ok: true });
  });

  it("refuses while a reboot is pending", () => {
    for (const request of [hire("qa-tester"), fire("qa-tester")]) {
      expect(refusal(decide(everyone, request, { rebootPending: true }))).toMatch(
        /reboot is pending/,
      );
    }
  });

  it("leaves an employee id alone for 10 min after it changed", () => {
    const fired = company(
      [...ROLES.filter((r) => r !== "qa-tester")],
      [{ id: "qa-tester", change: "fire", at: NOW - 9 * MINUTE }],
    );
    expect(refusal(decide(fired, hire("qa-tester")))).toMatch(
      /^qa-tester changed at \d\d:\d\d; the next change/,
    );
    const hired = company(
      ["qa-tester", "qa-tester@2"],
      [{ id: "qa-tester@2", change: "hire", at: NOW - 1 * MINUTE }],
    );
    expect(decide(hired, fire("qa-tester@2"))).toMatchObject({ ok: false });
    // Another seat of the same role is not held back.
    expect(decide(hired, fire("qa-tester"))).toMatchObject({ ok: true });
    // Ten minutes on, it is free again.
    const later = company(
      [...ROLES.filter((r) => r !== "qa-tester")],
      [{ id: "qa-tester", change: "fire", at: NOW - COOLDOWN_MS }],
    );
    expect(decide(later, hire("qa-tester"))).toMatchObject({ ok: true });
  });

  it("takes at most 3 hires in 10 min company-wide, and fires do not count", () => {
    const busy = company(
      [...ROLES],
      [
        { id: "qa-tester@2", change: "hire", at: NOW - 8 * MINUTE },
        { id: "developer@2", change: "hire", at: NOW - 5 * MINUTE },
        { id: "lead-dev", change: "fire", at: NOW - 4 * MINUTE },
        { id: "architect@2", change: "hire", at: NOW - 2 * MINUTE },
      ],
    );
    expect(refusal(decide(busy, hire("perf-sec-qa")))).toMatch(/^3 hires in the last 10 min/);
    expect(decide(busy, fire("perf-sec-qa"))).toMatchObject({ ok: true });
    const cooled = company(
      [...ROLES],
      [
        { id: "qa-tester@2", change: "hire", at: NOW - 11 * MINUTE },
        { id: "developer@2", change: "hire", at: NOW - 5 * MINUTE },
        { id: "architect@2", change: "hire", at: NOW - 2 * MINUTE },
      ],
    );
    expect(decide(cooled, hire("perf-sec-qa"))).toMatchObject({ ok: true });
  });
});

describe("applyStaff", () => {
  it("adds a hire as working, and marks a fire firing without removing it", () => {
    const start = company(["manager", "qa-tester"]);
    const hired = applyStaff(
      start,
      { verb: "hire", role: "qa-tester", reason: "QA column at 4", by: "manager" },
      "qa-tester@2",
      NOW,
    );
    expect(hired.employees["qa-tester@2"]).toEqual({
      role: "qa-tester",
      hiredAt: NOW,
      by: "manager",
      reason: "QA column at 4",
      state: "working",
      readyAt: null,
    });
    const fired = applyStaff(hired, fire("qa-tester"), "qa-tester", NOW);
    expect(fired.employees["qa-tester"]).toMatchObject({ state: "firing", reason: "first boot" });
    expect(Object.keys(fired.employees)).toHaveLength(3);
    expect(fired.recent).toEqual([
      { id: "qa-tester@2", change: "hire", at: NOW },
      { id: "qa-tester", change: "fire", at: NOW },
    ]);
  });

  it("keeps only the last 10 min of changes", () => {
    const old = company(
      ["manager"],
      [
        { id: "qa-tester", change: "fire", at: NOW - COOLDOWN_MS - 1 },
        { id: "lead-dev", change: "fire", at: NOW - MINUTE },
      ],
    );
    expect(applyStaff(old, hire("qa-tester"), "qa-tester", NOW).recent).toEqual([
      { id: "lead-dev", change: "fire", at: NOW - MINUTE },
      { id: "qa-tester", change: "hire", at: NOW },
    ]);
  });

  it("writes what parseStaff reads back", () => {
    const next = applyStaff(company(["manager"]), hire("qa-tester"), "qa-tester", NOW);
    expect(parseStaff(JSON.stringify(next))).toEqual(next);
  });
});

describe("seedStaff", () => {
  it("employs one of each role under its bare id, by the operator", () => {
    const seeded = seedStaff(["manager", "qa-tester"], NOW);
    expect(seeded).toEqual({
      employees: {
        manager: {
          role: "manager",
          hiredAt: NOW,
          by: "operator",
          reason: "first boot",
          state: "working",
          readyAt: null,
        },
        "qa-tester": {
          role: "qa-tester",
          hiredAt: NOW,
          by: "operator",
          reason: "first boot",
          state: "working",
          readyAt: null,
        },
      },
      recent: [],
    });
  });

  it("employs two developers, developer and developer@2 (#749)", () => {
    const seeded = seedStaff(["manager", "developer"], NOW);
    expect(Object.keys(seeded.employees)).toEqual(["manager", "developer", "developer@2"]);
    expect(seeded.employees["developer@2"]).toMatchObject({ role: "developer", by: "operator" });
    expect(Object.keys(seedStaff(ROLES, NOW).employees)).toHaveLength(10);
  });
});

describe("parseStaff", () => {
  const good = seedStaff(["qa-tester"], NOW);
  const entry = good.employees["qa-tester"];

  /**
   * @param {unknown} value
   * @returns {() => unknown}
   */
  const parse = (value) => () => parseStaff(JSON.stringify(value));

  it("throws on anything malformed, naming where", () => {
    expect(() => parseStaff("{")).toThrow();
    expect(parse([])).toThrow("staff is not an object");
    expect(parse({ employees: {} })).toThrow("staff.recent is missing");
    expect(parse({ ...good, extra: 1 })).toThrow("staff.extra is not a staff.json field");
    expect(parse({ employees: [], recent: [] })).toThrow("staff.employees is not an object");
    const at = 'staff.employees["qa-tester"]';
    const { readyAt: _readyAt, ...absent } = entry ?? {};
    expect(parse({ employees: { "qa-tester": absent }, recent: [] })).toThrow(
      `${at}.readyAt is missing`,
    );
    for (const [field, value, message] of [
      ["role", "lead-dev", "role is not the role"],
      ["hiredAt", "now", "hiredAt is not a number"],
      ["by", "lead-dev", "by is not"],
      ["reason", null, "reason is not a string"],
      ["state", "fired", "state is not"],
      ["readyAt", "soon", "readyAt is not a number or null"],
    ]) {
      expect(
        parse({ employees: { "qa-tester": { ...entry, [String(field)]: value } }, recent: [] }),
        String(field),
      ).toThrow(`${at}.${String(message)}`);
    }
    expect(parse({ employees: { "qa-tester@1": entry }, recent: [] })).toThrow(
      'staff.employees["qa-tester@1"].role',
    );
    expect(parse({ employees: {}, recent: [{ id: "x@1", change: "hire", at: 1 }] })).toThrow(
      "staff.recent[0].id is not an employee id",
    );
    expect(parse({ employees: {}, recent: [{ id: "x", change: "promote", at: 1 }] })).toThrow(
      "staff.recent[0].change",
    );
    expect(parse({ employees: {}, recent: [{ id: "x", change: "hire" }] })).toThrow(
      "staff.recent[0].at is missing",
    );
  });

  it("reads a firing employee who has said ready", () => {
    const firing = { ...entry, state: "firing", readyAt: NOW };
    expect(parseStaff(JSON.stringify({ employees: { "qa-tester": firing }, recent: [] }))).toEqual({
      employees: { "qa-tester": firing },
      recent: [],
    });
  });
});

describe("checkStaff (#749)", () => {
  it("keeps a staff.json whose roles are all roles, untouched", () => {
    const staff = company(["manager", "qa-tester", "qa-tester@2"]);
    expect(checkStaff(staff, ROLES, ["manager"], NOW)).toEqual({ staff, notice: null });
  });

  it("names each stale role once, and seeds the default staff of the boot's roles", () => {
    const checked = checkStaff(
      company(["manager", "developer-3", "developer-3@2", "intern"]),
      ROLES,
      ["manager", "developer"],
      NOW,
    );
    expect(checked.staff).toEqual(seedStaff(["manager", "developer"], NOW));
    expect(checked.notice).toMatch(
      /^staff\.json named roles that no longer exist \(developer-3, intern\);/,
    );
  });
});

describe("strangers", () => {
  it("names the employees whose role left the roster", () => {
    expect(strangers(company(["qa-tester", "developer-3@2"]), ROLES)).toEqual(["developer-3@2"]);
  });
});

describe("the CLI claude-llc up runs", () => {
  /**
   * @param {string} root
   * @param {string[]} args
   */
  const run = (root, ...args) =>
    spawnSync(process.execPath, [STAFF, ...args], {
      encoding: "utf8",
      env: { ...process.env, VIBEWARS_BOT_ROOT: root },
    });

  const tmp = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "staff-test-"));
    dirs.push(dir);
    return dir;
  };

  it("seeds staff.json once, and checks it", () => {
    const root = tmp();
    const file = path.join(root, "staff.json");
    expect(run(root, "seed", "manager", "qa-tester").status).toBe(0);
    const seeded = parseStaff(fs.readFileSync(file, "utf8"));
    expect(Object.keys(seeded.employees)).toEqual(["manager", "qa-tester"]);

    // Present: a later boot's CLAUDE_LLC_ROLES changes nothing.
    expect(run(root, "seed", "architect").status).toBe(0);
    expect(parseStaff(fs.readFileSync(file, "utf8"))).toEqual(seeded);
    expect(run(root, "check", "manager", "qa-tester").status).toBe(0);
    expect(parseStaff(fs.readFileSync(file, "utf8"))).toEqual(seeded);
    expect(fs.existsSync(path.join(root, "bus"))).toBe(false);
  });

  it("refuses to seed a role that is not in the roster", () => {
    const root = tmp();
    expect(run(root, "seed", "developer-3").status).toBe(1);
    expect(fs.existsSync(path.join(root, "staff.json"))).toBe(false);
  });

  it("resets a staff.json with a stale role to the default staff, and tells General (#749)", () => {
    const root = tmp();
    const file = path.join(root, "staff.json");
    const stale = seedStaff(["manager"], NOW);
    stale.employees["developer-3@2"] = { ...stale.employees.manager, role: "developer-3" };
    fs.writeFileSync(file, JSON.stringify(stale));

    const checked = run(root, "check", "manager", "developer");
    expect(checked.status).toBe(0);
    const notice =
      "staff.json named roles that no longer exist (developer-3); it was reset to the default " +
      "staff. Hires made since are gone; the manager re-hires.";
    expect(checked.stderr).toBe(`staff: ${notice}\n`);
    expect(Object.keys(parseStaff(fs.readFileSync(file, "utf8")).employees)).toEqual([
      "manager",
      "developer",
      "developer@2",
    ]);
    const outbox = path.join(root, "bus", "_system", "outbox");
    const entries = fs.readdirSync(outbox);
    expect(entries).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(outbox, entries[0] ?? ""), "utf8"))).toEqual({
      to: "all",
      text: notice,
      nudge: null,
      direct: false,
    });

    // Said once: the reset file is clean on the next boot.
    expect(run(root, "check", "manager", "developer").stderr).toBe("");
    expect(fs.readdirSync(outbox)).toHaveLength(1);
  });

  it("fails the check on a malformed file, and on a seed role that is not a role", () => {
    const root = tmp();
    const file = path.join(root, "staff.json");
    fs.writeFileSync(file, JSON.stringify({ employees: {} }));
    const malformed = run(root, "check", "manager");
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toMatch(/staff.recent is missing/);

    fs.writeFileSync(file, JSON.stringify(seedStaff(["manager"], NOW)));
    expect(run(root, "check", "intern").status).toBe(1);
  });
});

describe("staffReader (#62)", () => {
  it("reads every call, keeps the last good list through a bad file, and says so once", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "staff-reader-"));
    dirs.push(root);
    const file = path.join(root, "staff.json");
    /** @type {string[]} */
    const problems = [];
    const read = staffReader(file, (problem, kept) => {
      problems.push(`${problem}; kept ${[...kept.keys()].join(",")}`);
    });

    expect(read()).toEqual(new Map());
    fs.writeFileSync(file, JSON.stringify(seedStaff(["manager", "qa-tester"], NOW)));
    expect(read()).toEqual(
      new Map([
        ["manager", "manager"],
        ["qa-tester", "qa-tester"],
      ]),
    );
    fs.writeFileSync(file, "{");
    expect([...read().keys()]).toEqual(["manager", "qa-tester"]);
    expect([...read().keys()]).toEqual(["manager", "qa-tester"]);
    expect(problems).toHaveLength(2);
    expect(problems[1]).toMatch(/; kept manager,qa-tester$/);
  });
});

describe("markReady and withoutEmployees (#383)", () => {
  const firing = applyStaff(
    company(["qa-tester", "qa-tester@2"]),
    fire("qa-tester@2"),
    "qa-tester@2",
    NOW,
  );

  it("stamps a firing employee once, and refuses one that is not being fired", () => {
    const ready = markReady(firing, "qa-tester@2", NOW + 1);
    expect(ready?.employees["qa-tester@2"]?.readyAt).toBe(NOW + 1);
    expect(
      markReady(ready ?? firing, "qa-tester@2", NOW + 2)?.employees["qa-tester@2"]?.readyAt,
    ).toBe(NOW + 1);
    expect(markReady(firing, "qa-tester", NOW)).toBeNull();
    expect(markReady(firing, "nobody", NOW)).toBeNull();
  });

  it("drops the employees named and keeps the cooldown record", () => {
    const left = withoutEmployees(firing, ["qa-tester@2"]);
    expect(Object.keys(left.employees)).toEqual(["qa-tester"]);
    expect(left.recent).toEqual(firing.recent);
  });
});

describe("withStaffLock (#383)", () => {
  /** @returns {string} */
  function staffFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "staff-lock-"));
    dirs.push(dir);
    return path.join(dir, "staff.json");
  }

  it("lets go afterwards, even after a throw", () => {
    const file = staffFile();
    expect(withStaffLock(file, () => fs.existsSync(`${file}.lock`))).toBe(true);
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
    expect(() =>
      withStaffLock(file, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
  });

  it("makes a writer wait, so a hire made meanwhile survives a forget", async () => {
    const file = staffFile();
    fs.writeFileSync(file, JSON.stringify(company(["qa-tester", "qa-tester@2"])));
    // The other writer holds the lock for 300 ms between its read and its write.
    const child = spawn(
      process.execPath,
      [
        "-e",
        `import(${JSON.stringify(STAFF)}).then(({ withStaffLock }) => {
          const fs = require("node:fs");
          withStaffLock(${JSON.stringify(file)}, () => {
            const s = JSON.parse(fs.readFileSync(${JSON.stringify(file)}, "utf8"));
            fs.writeFileSync(${JSON.stringify(`${file}.held`)}, "");
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
            s.employees["qa-tester@3"] = s.employees["qa-tester"];
            fs.writeFileSync(${JSON.stringify(file)}, JSON.stringify(s));
          });
        })`,
      ],
      { stdio: "inherit" },
    );
    const exited = new Promise((resolve) => child.on("exit", resolve));
    while (!fs.existsSync(`${file}.held`)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    withStaffLock(file, () => {
      const current = parseStaff(fs.readFileSync(file, "utf8"));
      fs.writeFileSync(file, JSON.stringify(withoutEmployees(current, ["qa-tester@2"])));
    });
    expect(await exited).toBe(0);
    expect(Object.keys(parseStaff(fs.readFileSync(file, "utf8")).employees).sort()).toEqual([
      "qa-tester",
      "qa-tester@3",
    ]);
  });
});

describe("withStaffLock, a lock left behind (#742)", () => {
  /** @returns {string} */
  function staffFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "staff-lock-"));
    dirs.push(dir);
    return path.join(dir, "staff.json");
  }

  it("breaks a lock whose holder is gone, and says so", () => {
    const file = staffFile();
    const gone = spawnSync(process.execPath, ["-e", ""]);
    fs.mkdirSync(`${file}.lock`);
    fs.writeFileSync(`${file}.lock/pid`, String(gone.pid));
    const said = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(withStaffLock(file, () => "ran")).toBe("ran");
    expect(said).toHaveBeenCalledWith(expect.stringContaining(`pid ${String(gone.pid)} is gone`));
    said.mockRestore();
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
  });

  it("waits for a live holder, then names its pid", () => {
    const file = staffFile();
    fs.mkdirSync(`${file}.lock`);
    fs.writeFileSync(`${file}.lock/pid`, String(process.pid));
    expect(() => withStaffLock(file, () => "ran", 100)).toThrow(`by pid ${String(process.pid)}`);
    expect(fs.existsSync(`${file}.lock`)).toBe(true);
  });

  it("breaks a lock with no pid only once it is old", () => {
    const file = staffFile();
    fs.mkdirSync(`${file}.lock`);
    expect(() => withStaffLock(file, () => "ran", 100)).toThrow("is held");
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(`${file}.lock`, old, old);
    const said = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(withStaffLock(file, () => "ran")).toBe("ran");
    said.mockRestore();
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
  });
});
