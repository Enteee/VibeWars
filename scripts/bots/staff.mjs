#!/usr/bin/env node
/**
 * Who is employed (#62, part 1 of 7): `.bots/staff.json`, and the manager's
 * `company hire` and `company fire`.
 *
 * A role (briefing, policy seat, Telegram topic) still arrives by pull
 * request. What the manager changes at runtime is how many employees each
 * role has. The first employee of a role is the bare role name, "seat 1";
 * further ones are `<role>@<n>`.
 *
 * hubd writes `staff.json`, and the supervisor takes out the employees it
 * has stopped (#383); both do it inside `withStaffLock`, so neither loses
 * the other's change. Every decision about it is here,
 * as a pure function; the CLI at the bottom is what `claude-llc up` runs to
 * seed the file on the first boot and to check it on every boot.
 *
 *   node scripts/bots/staff.mjs seed <role...>   write staff.json if absent
 *   node scripts/bots/staff.mjs check            validate it against the roster
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ROLES } from "./hub-policy.mjs";

/** How long an employee id stays untouched after a change, and the hire window. */
export const COOLDOWN_MS = 10 * 60_000;

/** The most hires the company takes within `COOLDOWN_MS`. */
export const HIRES_PER_WINDOW = 3;

/**
 * @typedef {{
 *   role: string, hiredAt: number, by: "manager" | "operator", reason: string,
 *   state: "working" | "firing", readyAt: number | null,
 * }} Employee
 *
 * @typedef {{ id: string, change: "hire" | "fire", at: number }} Change
 *
 * @typedef {{ employees: Record<string, Employee>, recent: Change[] }} Staff
 *
 * `recent` is every change of the last `COOLDOWN_MS`, for the cooldowns.
 *
 * @typedef {{ verb: "hire", role: string, reason: string, by: "manager" | "operator" }
 *   | { verb: "fire", employee: string, reason: string, by: "manager" | "operator" }} StaffRequest
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {Record<string, unknown>} value
 * @param {string[]} keys
 * @param {string} at
 */
function exactKeys(value, keys, at) {
  for (const key of keys) {
    if (!(key in value)) {
      throw new Error(`${at}.${key} is missing`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      throw new Error(`${at}.${key} is not a staff.json field`);
    }
  }
}

/**
 * The role an employee id belongs to: `qa-tester` and `qa-tester@2` are
 * both `qa-tester`'s.
 *
 * @param {string} id
 * @returns {string | null} `null` if `id` is not an employee id
 */
export function roleOf(id) {
  const match = /^([a-z][a-z0-9-]*)(?:@([2-9]|[1-9][0-9]+))?$/.exec(id);
  return match === null ? null : (match[1] ?? null);
}

/**
 * `.bots/staff.json`, strictly: anything that is not exactly the current
 * shape throws, naming where.
 *
 * @param {string} json
 * @returns {Staff}
 */
export function parseStaff(json) {
  /** @type {unknown} */
  const raw = JSON.parse(json);
  if (!isObject(raw)) {
    throw new Error("staff is not an object");
  }
  exactKeys(raw, ["employees", "recent"], "staff");
  const { employees, recent } = raw;
  if (!isObject(employees)) {
    throw new Error("staff.employees is not an object");
  }
  if (!Array.isArray(recent)) {
    throw new Error("staff.recent is not an array");
  }

  /** @type {Record<string, Employee>} */
  const parsed = {};
  for (const [id, entry] of Object.entries(employees)) {
    const at = `staff.employees["${id}"]`;
    if (!isObject(entry)) {
      throw new Error(`${at} is not an object`);
    }
    exactKeys(entry, ["role", "hiredAt", "by", "reason", "state", "readyAt"], at);
    const { role, hiredAt, by, reason, state, readyAt } = entry;
    if (typeof role !== "string" || roleOf(id) !== role) {
      throw new Error(`${at}.role is not the role of "${id}"`);
    }
    if (typeof hiredAt !== "number") {
      throw new Error(`${at}.hiredAt is not a number`);
    }
    if (by !== "manager" && by !== "operator") {
      throw new Error(`${at}.by is not "manager" or "operator"`);
    }
    if (typeof reason !== "string") {
      throw new Error(`${at}.reason is not a string`);
    }
    if (state !== "working" && state !== "firing") {
      throw new Error(`${at}.state is not "working" or "firing"`);
    }
    if (readyAt !== null && typeof readyAt !== "number") {
      throw new Error(`${at}.readyAt is not a number or null`);
    }
    parsed[id] = { role, hiredAt, by, reason, state, readyAt };
  }

  /** @type {Change[]} */
  const changes = recent.map((change, i) => {
    const at = `staff.recent[${String(i)}]`;
    if (!isObject(change)) {
      throw new Error(`${at} is not an object`);
    }
    exactKeys(change, ["id", "change", "at"], at);
    const { id, change: kind, at: when } = change;
    if (typeof id !== "string" || roleOf(id) === null) {
      throw new Error(`${at}.id is not an employee id`);
    }
    if (kind !== "hire" && kind !== "fire") {
      throw new Error(`${at}.change is not "hire" or "fire"`);
    }
    if (typeof when !== "number") {
      throw new Error(`${at}.at is not a number`);
    }
    return { id, change: kind, at: when };
  });
  return { employees: parsed, recent: changes };
}

/**
 * Who is employed, employee id to role, re-read from `file` on every call,
 * so a hire counts on the next pass of whoever reads it (hubd, link). A
 * file it cannot read leaves the last list it could in force, and is
 * reported once through `complain`; until it has read one, nobody is
 * employed.
 *
 * @param {string} file `staff.json`
 * @param {(problem: string, kept: ReadonlyMap<string, string>) => void} complain
 * @returns {() => ReadonlyMap<string, string>}
 */
export function staffReader(file, complain) {
  /** @type {ReadonlyMap<string, string>} */
  let employed = new Map();
  let last = "";
  return () => {
    try {
      const { employees } = parseStaff(fs.readFileSync(file, "utf8"));
      employed = new Map(Object.entries(employees).map(([id, { role }]) => [id, role]));
      last = "";
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error);
      if (problem !== last) {
        last = problem;
        complain(problem, employed);
      }
    }
    return employed;
  };
}

/**
 * The id the next employee of `role` gets: the bare role while that seat is
 * free, else `<role>@<n>` with the lowest free n from 2.
 *
 * @param {string} role
 * @param {Staff} staff
 * @returns {string}
 */
export function nextEmployeeId(role, staff) {
  if (!(role in staff.employees)) {
    return role;
  }
  let n = 2;
  while (`${role}@${String(n)}` in staff.employees) {
    n += 1;
  }
  return `${role}@${String(n)}`;
}

/**
 * May this hire or fire happen now?
 *
 * @param {Staff} staff
 * @param {StaffRequest} request
 * @param {{
 *   roster: readonly string[], maxAgents: number, rebootPending: boolean, now: number,
 *   history: readonly Change[],
 * }} context `history` is `staff.recent`
 * @returns {{ ok: true, employee: string } | { ok: false, reason: string }}
 */
export function staffAllowed(staff, request, { roster, maxAgents, rebootPending, now, history }) {
  const hiring = request.verb === "hire";
  const role = hiring ? request.role : roleOf(request.employee);
  if (role === null || !roster.includes(role)) {
    return {
      ok: false,
      reason: hiring
        ? `"${request.role}" is not a role; the roster is ${roster.join(", ")}`
        : `"${request.employee}" is not an employee`,
    };
  }
  if (role === "manager") {
    return { ok: false, reason: "the manager is always exactly one employee" };
  }
  if (rebootPending) {
    return { ok: false, reason: "a company reboot is pending; hire or fire after it" };
  }

  const recent = history.filter((change) => now - change.at < COOLDOWN_MS);
  let employee;
  if (hiring) {
    const headcount = Object.keys(staff.employees).length;
    if (headcount >= maxAgents) {
      return {
        ok: false,
        reason: `the company has ${String(headcount)} employees, maxAgents is ${String(maxAgents)}`,
      };
    }
    const hires = recent.filter((change) => change.change === "hire");
    if (hires.length >= HIRES_PER_WINDOW) {
      const next = Math.min(...hires.map((change) => change.at)) + COOLDOWN_MS;
      return {
        ok: false,
        reason: `${String(hires.length)} hires in the last 10 min; the next is possible at ${clock(next)}`,
      };
    }
    employee = nextEmployeeId(role, staff);
  } else {
    employee = request.employee;
    const current = staff.employees[employee];
    if (current === undefined) {
      return { ok: false, reason: `"${employee}" is not an employee` };
    }
    if (current.state === "firing") {
      return { ok: false, reason: `${employee} is already being fired` };
    }
  }

  const last = recent.filter((change) => change.id === employee).at(-1);
  if (last !== undefined) {
    return {
      ok: false,
      reason: `${employee} changed at ${clock(last.at)}; the next change is possible at ${clock(last.at + COOLDOWN_MS)}`,
    };
  }
  return { ok: true, employee };
}

/**
 * `staff` with an allowed request applied. A fire only marks the employee
 * `firing`; the supervisor removes it once it has drained (#383).
 *
 * @param {Staff} staff
 * @param {StaffRequest} request
 * @param {string} employee the id `staffAllowed` answered
 * @param {number} now
 * @returns {Staff}
 */
export function applyStaff(staff, request, employee, now) {
  /** @type {Record<string, Employee>} */
  const employees = { ...staff.employees };
  if (request.verb === "hire") {
    employees[employee] = {
      role: request.role,
      hiredAt: now,
      by: request.by,
      reason: request.reason,
      state: "working",
      readyAt: null,
    };
  } else {
    const current = employees[employee];
    if (current === undefined) {
      throw new Error(`"${employee}" is not an employee`);
    }
    employees[employee] = { ...current, state: "firing" };
  }
  const recent = [
    ...staff.recent.filter((change) => now - change.at < COOLDOWN_MS),
    { id: employee, change: request.verb, at: now },
  ];
  return { employees, recent };
}

/**
 * `staff` with a firing employee marked ready: it ran `company ready`, so
 * the supervisor may stop it (#383).
 *
 * @param {Staff} staff
 * @param {string} employee
 * @param {number} now
 * @returns {Staff | null} `null` if `employee` is not being fired
 */
export function markReady(staff, employee, now) {
  const current = staff.employees[employee];
  if (current?.state !== "firing") {
    return null;
  }
  return {
    ...staff,
    employees: { ...staff.employees, [employee]: { ...current, readyAt: current.readyAt ?? now } },
  };
}

/**
 * `staff` without the employees in `gone`: the supervisor stopped them (#383).
 * Their entries in `recent` stay, for the cooldowns.
 *
 * @param {Staff} staff
 * @param {readonly string[]} gone
 * @returns {Staff}
 */
export function withoutEmployees(staff, gone) {
  return {
    ...staff,
    employees: Object.fromEntries(
      Object.entries(staff.employees).filter(([id]) => !gone.includes(id)),
    ),
  };
}

/** How long to wait for the lock before giving up. */
const LOCK_WAIT_MS = 5_000;

/**
 * Run `change`, which reads, modifies and writes `file`, while holding the
 * one lock of `staff.json`. hubd and the supervisor both write it, and a
 * read-modify-write of one that runs between the other's read and rename
 * would lose that change. The lock is a directory: `mkdir` is atomic. One
 * left behind by a crash is removed by hand: taking it over would let two
 * waiters steal it from each other.
 *
 * @template T
 * @param {string} file `staff.json`
 * @param {() => T} change
 * @returns {T}
 */
export function withStaffLock(file, change) {
  const lock = `${file}.lock`;
  const give = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
      if (Date.now() > give) {
        throw new Error(`${lock} is held; if no process is changing staff.json, remove it`, {
          cause: error,
        });
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    return change();
  } finally {
    fs.rmdirSync(lock);
  }
}

/**
 * The company on its first boot: one employee per role, under the bare id.
 *
 * @param {readonly string[]} roles
 * @param {number} now
 * @returns {Staff}
 */
export function seedStaff(roles, now) {
  /** @type {Record<string, Employee>} */
  const employees = {};
  for (const role of roles) {
    employees[role] = {
      role,
      hiredAt: now,
      by: "operator",
      reason: "first boot",
      state: "working",
      readyAt: null,
    };
  }
  return { employees, recent: [] };
}

/**
 * The employees whose role is not in `roster`.
 *
 * @param {Staff} staff
 * @param {readonly string[]} roster
 * @returns {string[]}
 */
export function strangers(staff, roster) {
  return Object.entries(staff.employees)
    .filter(([, employee]) => !roster.includes(employee.role))
    .map(([id]) => id);
}

/**
 * @param {number} ms epoch milliseconds
 * @returns {string} `HH:MM`, local time
 */
function clock(ms) {
  return new Date(ms).toTimeString().slice(0, 5);
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = process.env.VIBEWARS_BOT_ROOT;
  if (root === undefined || root === "") {
    console.error("staff: VIBEWARS_BOT_ROOT is not set; run this through claude-llc");
    process.exit(2);
  }
  const file = path.join(root, "staff.json");
  const [command, ...roles] = process.argv.slice(2);
  if (command === "seed" && roles.length > 0) {
    const unknown = roles.filter((role) => !ROLES.includes(role));
    if (unknown.length > 0) {
      console.error(`staff: not a role: ${unknown.join(", ")}`);
      process.exit(1);
    }
    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        `${file}.part`,
        `${JSON.stringify(seedStaff(roles, Date.now()), null, 2)}\n`,
      );
      fs.renameSync(`${file}.part`, file);
      console.log(`staff: seeded ${file} with ${roles.join(", ")}`);
    }
  } else if (command === "check" && roles.length === 0) {
    try {
      const staff = parseStaff(fs.readFileSync(file, "utf8"));
      const unknown = strangers(staff, ROLES);
      if (unknown.length > 0) {
        console.error(
          `staff: ${file} lists ${unknown.join(", ")}, whose role is not in the roster. ` +
            "Remove them from the file.",
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(`staff: ${file}: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  } else {
    console.error("usage: staff.mjs seed <role...> | check");
    process.exit(2);
  }
}
