/**
 * Scheduled nudges (#537): `scripts/bots/schedule.json` names a fixed
 * message hubd sends to a role on an interval, through the system outbox,
 * for the thing a role keeps forgetting.
 *
 * The file is checked in, so changing the schedule is a pull request. This
 * module holds every decision about it as a pure function; hubd keeps the
 * clock and the reader.
 */
import fs from "node:fs";

import { ROLES } from "./hub-policy.mjs";

/** The shortest interval: a nudge is not a conversation. */
export const MIN_EVERY_MINUTES = 5;

/** The longest text a nudge may carry. */
export const MAX_TEXT = 500;

/**
 * @typedef {object} Nudge
 * @property {string} id kebab-case, unique
 * @property {string} to a role
 * @property {number} everyMinutes
 * @property {string} text
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
      throw new Error(`${at}.${key} is not a schedule.json field`);
    }
  }
}

/**
 * `schedule.json`, strictly: anything that is not exactly the current shape
 * throws, naming where.
 *
 * @param {string} json
 * @returns {Nudge[]}
 */
export function parseSchedule(json) {
  /** @type {unknown} */
  const raw = JSON.parse(json);
  if (!isObject(raw)) {
    throw new Error("schedule is not an object");
  }
  exactKeys(raw, ["nudges"], "schedule");
  const { nudges } = raw;
  if (!Array.isArray(nudges)) {
    throw new Error("schedule.nudges is not an array");
  }
  /** @type {Set<string>} */
  const seen = new Set();
  return /** @type {unknown[]} */ (nudges).map((entry, i) => {
    const at = `schedule.nudges[${String(i)}]`;
    if (!isObject(entry)) {
      throw new Error(`${at} is not an object`);
    }
    exactKeys(entry, ["id", "to", "everyMinutes", "text"], at);
    const { id, to, everyMinutes, text } = entry;
    if (typeof id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      throw new Error(`${at}.id is not kebab-case`);
    }
    if (seen.has(id)) {
      throw new Error(`${at}.id "${id}" is used twice`);
    }
    seen.add(id);
    if (typeof to !== "string" || !ROLES.includes(to)) {
      throw new Error(`${at}.to is not a role`);
    }
    if (
      typeof everyMinutes !== "number" ||
      !Number.isInteger(everyMinutes) ||
      everyMinutes < MIN_EVERY_MINUTES
    ) {
      throw new Error(
        `${at}.everyMinutes is not an integer of at least ${String(MIN_EVERY_MINUTES)}`,
      );
    }
    if (typeof text !== "string" || text.length < 1 || text.length > MAX_TEXT) {
      throw new Error(`${at}.text is not 1 to ${String(MAX_TEXT)} characters`);
    }
    return { id, to, everyMinutes, text };
  });
}

/**
 * The nudges due now: those whose interval has run since they were last
 * sent. An entry never sent counts from `since`, hubd's start, so the first
 * nudge comes one interval after a (re)start.
 *
 * @param {{ now: number, schedule: readonly Nudge[], lastSent: ReadonlyMap<string, number>, since: number }} context
 * @returns {Nudge[]}
 */
export function dueNudges({ now, schedule, lastSent, since }) {
  return schedule.filter(
    (nudge) => now - (lastSent.get(nudge.id) ?? since) >= nudge.everyMinutes * 60_000,
  );
}

/**
 * `schedule.json`, re-read on every call, so a merged change counts on the
 * next pass. A file it cannot read leaves the last good schedule in force
 * and is reported once through `complain`; a missing file is no nudges (it
 * is checked in, so missing means deliberately deleted).
 *
 * @param {string} file
 * @param {(problem: string) => void} complain
 * @returns {() => Nudge[]}
 */
export function scheduleReader(file, complain) {
  /** @type {Nudge[]} */
  let schedule = [];
  let last = "";
  return () => {
    try {
      schedule = parseSchedule(fs.readFileSync(file, "utf8"));
      last = "";
    } catch (error) {
      if ((error instanceof Error && "code" in error ? error.code : null) === "ENOENT") {
        schedule = [];
        last = "";
        return schedule;
      }
      const problem = error instanceof Error ? error.message : String(error);
      if (problem !== last) {
        last = problem;
        complain(problem);
      }
    }
    return schedule;
  };
}
