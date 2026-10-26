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

import { ROLES, SCHEDULERS } from "./hub-policy.mjs";
import { visible } from "./protocol.mjs";

/** The shortest interval: a nudge is not a conversation. */
export const MIN_EVERY_MINUTES = 5;

/** The longest text a nudge may carry. */
export const MAX_TEXT = 500;

/** The shortest and longest an own schedule's interval may be (#678). */
export const MIN_OWN_EVERY_MINUTES = 15;
export const MAX_OWN_EVERY_MINUTES = 10_080;

/** How many own schedules one role may keep. */
export const MAX_OWN_PER_ROLE = 5;

/** The longest an own schedule's name may be. */
export const MAX_NAME = 32;

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Own schedules' ids start with this, checked-in ones' never do, so they cannot collide. */
const OWN_PREFIX = "own-";

/**
 * @typedef {object} OwnSchedule a role's own recurring reminder to itself (#678)
 * @property {string} role
 * @property {string} name kebab-case, at most MAX_NAME, unique within the role
 * @property {number} everyMinutes
 * @property {string} text
 * @property {number} addedAt
 */

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
    if (typeof id !== "string" || !KEBAB.test(id)) {
      throw new Error(`${at}.id is not kebab-case`);
    }
    if (id.startsWith(OWN_PREFIX)) {
      throw new Error(`${at}.id "${id}" starts with "${OWN_PREFIX}", which is for own schedules`);
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
 * `nudges.json`, which hubd writes and reads back on its next start (#640),
 * strictly: `{ since, sent }`, with numbers only.
 *
 * @param {string} json
 * @returns {{ since: number, sent: Map<string, number> }}
 */
export function parseNudgeClock(json) {
  /** @type {unknown} */
  const raw = JSON.parse(json);
  if (!isObject(raw)) {
    throw new Error("nudge clock is not an object");
  }
  exactKeys(raw, ["since", "sent"], "nudges");
  const { since, sent } = raw;
  if (typeof since !== "number" || !Number.isFinite(since)) {
    throw new Error("nudges.since is not a number");
  }
  if (!isObject(sent)) {
    throw new Error("nudges.sent is not an object");
  }
  const entries = Object.entries(sent);
  if (!entries.every(([, at]) => typeof at === "number" && Number.isFinite(at))) {
    throw new Error("nudges.sent has a value that is not a number");
  }
  return { since, sent: new Map(entries.map(([id, at]) => [id, Number(at)])) };
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

/**
 * `15m`, `2h`: minutes, or a throw saying why not.
 *
 * @param {string} every
 * @returns {number}
 */
export function parseEvery(every) {
  const match = /^([1-9][0-9]*)([mh])$/.exec(every);
  if (match === null) {
    throw new Error(`${every}: an interval is <N>m or <N>h, such as 90m or 2h`);
  }
  const minutes = Number(match[1]) * (match[2] === "h" ? 60 : 1);
  if (minutes < MIN_OWN_EVERY_MINUTES || minutes > MAX_OWN_EVERY_MINUTES) {
    throw new Error(
      `${every}: an interval is ${String(MIN_OWN_EVERY_MINUTES)} minutes to 7 days (${String(MAX_OWN_EVERY_MINUTES)}m)`,
    );
  }
  return minutes;
}

/**
 * `schedules.json`, strictly: anything that is not exactly the current shape,
 * a role that no longer keeps schedules, or a role over its limit throws.
 *
 * @param {string} json
 * @returns {OwnSchedule[]}
 */
export function parseOwnSchedules(json) {
  /** @type {unknown} */
  const raw = JSON.parse(json);
  if (!isObject(raw)) {
    throw new Error("schedules is not an object");
  }
  exactKeys(raw, ["schedules"], "schedules");
  const { schedules } = raw;
  if (!Array.isArray(schedules)) {
    throw new Error("schedules.schedules is not an array");
  }
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Map<string, number>} */
  const perRole = new Map();
  return /** @type {unknown[]} */ (schedules).map((entry, i) => {
    const at = `schedules.schedules[${String(i)}]`;
    if (!isObject(entry)) {
      throw new Error(`${at} is not an object`);
    }
    exactKeys(entry, ["role", "name", "everyMinutes", "text", "addedAt"], at);
    const { role, name, everyMinutes, text, addedAt } = entry;
    if (typeof role !== "string" || !SCHEDULERS.includes(role)) {
      throw new Error(`${at}.role is not a role that keeps schedules`);
    }
    if (typeof name !== "string" || name.length > MAX_NAME || !KEBAB.test(name)) {
      throw new Error(`${at}.name is not kebab-case of at most ${String(MAX_NAME)} characters`);
    }
    if (seen.has(`${role}/${name}`)) {
      throw new Error(`${at}.name "${name}" is used twice by ${role}`);
    }
    seen.add(`${role}/${name}`);
    perRole.set(role, (perRole.get(role) ?? 0) + 1);
    if ((perRole.get(role) ?? 0) > MAX_OWN_PER_ROLE) {
      throw new Error(`${at}: ${role} has more than ${String(MAX_OWN_PER_ROLE)} schedules`);
    }
    if (
      typeof everyMinutes !== "number" ||
      !Number.isInteger(everyMinutes) ||
      everyMinutes < MIN_OWN_EVERY_MINUTES ||
      everyMinutes > MAX_OWN_EVERY_MINUTES
    ) {
      throw new Error(`${at}.everyMinutes is not an integer within the own-schedule bounds`);
    }
    if (typeof text !== "string" || text.length < 1 || text.length > MAX_TEXT) {
      throw new Error(`${at}.text is not 1 to ${String(MAX_TEXT)} characters`);
    }
    if (typeof addedAt !== "number" || !Number.isFinite(addedAt)) {
      throw new Error(`${at}.addedAt is not a number`);
    }
    return { role, name, everyMinutes, text, addedAt };
  });
}

/**
 * The clock id of an own schedule.
 *
 * @param {{ role: string, name: string }} own
 * @returns {string}
 */
export function ownId({ role, name }) {
  return `${OWN_PREFIX}${role}-${name}`;
}

/**
 * Own schedules as nudges, for `dueNudges` and the dashboard. The prefix
 * says this is a note the agent wrote to itself, not the company's word.
 *
 * @param {readonly OwnSchedule[]} own
 * @returns {Nudge[]}
 */
export function ownNudges(own) {
  return own.map((schedule) => ({
    id: ownId(schedule),
    to: schedule.role,
    everyMinutes: schedule.everyMinutes,
    text: `(your schedule ${schedule.name}) ${schedule.text}`,
  }));
}

/**
 * @typedef {{ refuse: string } | { next: OwnSchedule[], stdout: string, started?: string, removed?: string }} SchedulePlan
 *   `started` is the clock id to set to now, `removed` the one to drop
 */

/**
 * `hub schedule add|ls|rm` (#678), decided without touching a file: hubd
 * serves requests one at a time, so reading `own`, applying this and
 * writing `next` is not racy.
 *
 * @param {{ role: string, argv: readonly string[], own: readonly OwnSchedule[], fixed: readonly Nudge[], now: number }} context
 * @returns {SchedulePlan}
 */
export function planScheduleCommand({ role, argv, own, fixed, now }) {
  if (!SCHEDULERS.includes(role)) {
    return { refuse: "schedule: only manager, architect and lead-dev keep schedules" };
  }
  const usage =
    "usage: hub schedule add <name> <every> <text...> | hub schedule ls | hub schedule rm <name>";
  const mine = own.filter((schedule) => schedule.role === role);
  const [verb, name, every, ...words] = argv;

  if (verb === "ls" && name === undefined) {
    const lines = [
      ...fixed
        .filter((nudge) => nudge.to === role)
        .map(
          (nudge) =>
            `${nudge.id}  every ${String(nudge.everyMinutes)}m  fixed  ${visible(nudge.text)}`,
        ),
      ...mine.map(
        (schedule) =>
          `${schedule.name}  every ${String(schedule.everyMinutes)}m  own  ${visible(schedule.text)}`,
      ),
    ];
    return {
      next: [...own],
      stdout: lines.length === 0 ? "no schedules\n" : `${lines.join("\n")}\n`,
    };
  }

  if (verb !== "add" && verb !== "rm") {
    return { refuse: usage };
  }
  if (name === undefined || !KEBAB.test(name) || name.length > MAX_NAME) {
    return {
      refuse: `schedule: a name is kebab-case, at most ${String(MAX_NAME)} characters\n${usage}`,
    };
  }
  if (fixed.some((nudge) => nudge.id === name && nudge.to === role)) {
    return { refuse: `schedule: ${name} is fixed by schedule.json; change it by pull request` };
  }
  const existing = mine.find((schedule) => schedule.name === name);

  if (verb === "rm") {
    if (every !== undefined) {
      return { refuse: usage };
    }
    if (existing === undefined) {
      return {
        refuse: `schedule: no schedule named ${name}; yours: ${mine.map((s) => s.name).join(", ") || "none"}`,
      };
    }
    return {
      next: own.filter((schedule) => schedule !== existing),
      stdout: `removed ${name}\n`,
      removed: ownId(existing),
    };
  }

  if (every === undefined || words.length === 0) {
    return { refuse: usage };
  }
  /** @type {number} */
  let everyMinutes;
  try {
    everyMinutes = parseEvery(every);
  } catch (error) {
    return { refuse: `schedule: ${error instanceof Error ? error.message : String(error)}` };
  }
  const text = visible(words.join(" "));
  if (text.trim() === "" || text.length > MAX_TEXT) {
    return { refuse: `schedule: the text is 1 to ${String(MAX_TEXT)} characters` };
  }
  if (existing === undefined && mine.length >= MAX_OWN_PER_ROLE) {
    return {
      refuse: `schedule: at most ${String(MAX_OWN_PER_ROLE)} own schedules; yours: ${mine.map((s) => s.name).join(", ")}. rm one first`,
    };
  }
  const added = { role, name, everyMinutes, text, addedAt: now };
  return {
    next: existing === undefined ? [...own, added] : own.map((s) => (s === existing ? added : s)),
    stdout: `${existing === undefined ? "added" : "replaced"} ${name}: every ${every}, first at the end of the first interval\n`,
    started: ownId(added),
  };
}
