/**
 * Hibernating the company host while every agent waits out Claude's usage
 * limit (#2794): the decision hubd acts on, and the shapes it reads.
 *
 * An agent's loop holds `<state>/limit-pause` for as long as its limit pause
 * lasts, with the wall-clock reset in it; that file and not `limited-until`
 * or `usage-limit.json`, which outlive the limit. Before sleeping hubd
 * writes `sleep-plan.json`, the sidecar posts it with a Cancel button, and a
 * press comes back as `link/sleep-cancel.json`.
 *
 * Pure functions only, so the decisions are tested without a machine to
 * hibernate.
 */

/** A shorter pause than this is not worth a hibernate cycle, in seconds. */
export const SLEEP_THRESHOLD = 60 * 60;
/** How long the operator has to cancel, in seconds. */
export const SLEEP_WARNING = 5 * 60;
/**
 * The wake alarm must be at least this far off when the machine goes down,
 * in seconds: writing the image takes time, and an alarm that passes before
 * power-off never wakes it.
 */
export const MIN_SLEEP = 15 * 60;
/**
 * The nearest wake time the root oneshot accepts, in seconds: a little under
 * `MIN_SLEEP`, as hubd can plan right at it and the oneshot runs moments later.
 */
export const MIN_WAKE = MIN_SLEEP - 60;
/** Wake this long before the reset when `company.json` says no other, in minutes. */
export const DEFAULT_WAKE_MARGIN = 5;
/** The furthest ahead the root oneshot accepts a wake time, in seconds. */
export const MAX_SLEEP = 7 * 24 * 60 * 60 + 60 * 60;
/** A wall clock that moved this much between two looks was asleep, in ms. */
export const WAKE_JUMP_MS = 2 * 60_000;
/** A daemon that exits this soon after a wake is no crash, in ms. */
export const AFTER_WAKE_MS = 60_000;

/**
 * `company.json`'s `hibernate`: `null`, missing and malformed all mean off.
 *
 * @param {unknown} config the parsed file
 * @returns {{ wakeMarginMinutes: number } | null}
 */
export function hibernateSetting(config) {
  const value =
    typeof config === "object" && config !== null
      ? /** @type {Record<string, unknown>} */ (config).hibernate
      : null;
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { wakeMarginMinutes } = /** @type {Record<string, unknown>} */ (value);
  return validMargin(wakeMarginMinutes) ? { wakeMarginMinutes } : null;
}

/**
 * @param {unknown} minutes
 * @returns {minutes is number}
 */
export function validMargin(minutes) {
  return typeof minutes === "number" && Number.isInteger(minutes) && minutes >= 1 && minutes <= 60;
}

/**
 * The text of `<state>/limit-pause`; `null` when the reset is not known.
 *
 * @param {string} text
 * @returns {number | null} unix seconds
 */
export function parseLimitPause(text) {
  const trimmed = text.trim();
  const until = Number(trimmed);
  return /^\d+$/.test(trimmed) && until > 0 ? until : null;
}

/**
 * @typedef {{ id: string, sleepAt: number, wakeAt: number, reset: number }} SleepPlan
 *   every time in unix seconds
 */

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isSleepId(value) {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

/**
 * `sleep-plan.json`, or `null` if it is not one.
 *
 * @param {unknown} value
 * @returns {SleepPlan | null}
 */
export function parseSleepPlan(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { id, sleepAt, wakeAt, reset } = /** @type {Record<string, unknown>} */ (value);
  return isSleepId(id) &&
    typeof sleepAt === "number" &&
    typeof wakeAt === "number" &&
    typeof reset === "number"
    ? { id, sleepAt, wakeAt, reset }
    : null;
}

/**
 * `link/sleep-cancel.json`, or `null` if it is not one.
 *
 * @param {unknown} value
 * @returns {{ id: string, reset: number } | null}
 */
export function parseSleepCancel(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { id, reset } = /** @type {Record<string, unknown>} */ (value);
  return isSleepId(id) && typeof reset === "number" ? { id, reset } : null;
}

/**
 * How many inhibitors in `systemd-inhibit --list --mode=block --no-legend`
 * hold off sleep: its WHAT column is a colon-separated list.
 *
 * @param {string} listing
 * @returns {number}
 */
export function sleepInhibitors(listing) {
  return listing
    .split("\n")
    .filter((line) => line.split(/\s+/).some((word) => /^([a-z-]+:)*sleep(:[a-z-]+)*$/.test(word)))
    .length;
}

/**
 * @typedef {object} SleepInput
 * @property {number} now unix seconds
 * @property {{ wakeMarginMinutes: number } | null} hibernate
 * @property {{ employee: string, until: number | null }[]} pauses one per
 *   employee; `until` is `null` for one not paused or with an unknown reset
 * @property {boolean} runnersBusy
 * @property {boolean} rebootPending
 * @property {number} inhibitors
 * @property {{ reset: number } | null} cancel
 * @property {number | null} sleptFor the reset a sleep was already carried out for
 * @property {SleepPlan | null} plan
 */

/**
 * @param {SleepInput} input
 * @returns {{ reset: number | null, blocker: string | null }} why not to sleep, if so
 */
function assess({ now, hibernate, pauses, runnersBusy, rebootPending, inhibitors, plan }) {
  const waiting = pauses.find((pause) => pause.until === null);
  const reset =
    pauses.length === 0 || waiting !== undefined
      ? null
      : Math.min(...pauses.map((pause) => pause.until ?? 0));
  /** @param {string} blocker */
  const blocked = (blocker) => ({ reset, blocker });
  if (hibernate === null) {
    return blocked("hibernation is off");
  }
  if (pauses.length === 0) {
    return blocked("no agents");
  }
  if (waiting !== undefined || reset === null) {
    return blocked(`${waiting?.employee ?? "an agent"} is not paused until a known reset`);
  }
  if (reset - now <= SLEEP_THRESHOLD) {
    return blocked("the reset is under an hour away");
  }
  // A new plan still has its warning to wait out.
  const nearest = MIN_SLEEP + (plan === null ? SLEEP_WARNING : 0);
  if (reset - hibernate.wakeMarginMinutes * 60 - now < nearest) {
    return blocked("the wake alarm would be too close");
  }
  if (reset - hibernate.wakeMarginMinutes * 60 - now > MAX_SLEEP) {
    return blocked("the reset is further away than the wake alarm may be set");
  }
  if (runnersBusy) {
    return blocked("a CI runner has a job");
  }
  if (rebootPending) {
    return blocked("a reboot is pending");
  }
  if (inhibitors > 0) {
    return blocked("a systemd inhibitor is held");
  }
  return { reset, blocker: null };
}

/**
 * What hubd does about hibernating now. An open plan is carried out at its
 * `sleepAt` only if nothing has changed since it was announced.
 *
 * @param {SleepInput} input
 * @returns {{ kind: "none" | "abandon", reason: string, wakeAt: null }
 *   | { kind: "plan", reason: string, wakeAt: number, sleepAt: number, reset: number }
 *   | { kind: "sleep", reason: string, wakeAt: number }}
 */
export function sleepDecision(input) {
  const { now, hibernate, cancel, plan, sleptFor } = input;
  const { reset, blocker } = assess(input);
  if (plan !== null) {
    /** @type {string | null} */
    let reason = blocker;
    if (cancel?.reset === plan.reset) {
      reason = "cancelled";
    } else if (reason === null && reset !== plan.reset) {
      reason = "the reset moved";
    }
    if (reason !== null) {
      return { kind: "abandon", reason, wakeAt: null };
    }
    return now >= plan.sleepAt
      ? { kind: "sleep", reason: "", wakeAt: plan.wakeAt }
      : { kind: "none", reason: "waiting out the warning", wakeAt: null };
  }
  if (blocker !== null || reset === null || hibernate === null) {
    return { kind: "none", reason: blocker ?? "", wakeAt: null };
  }
  if (cancel?.reset === reset) {
    return { kind: "none", reason: "cancelled for this reset", wakeAt: null };
  }
  if (sleptFor === reset) {
    return { kind: "none", reason: "already slept for this reset", wakeAt: null };
  }
  return {
    kind: "plan",
    reason: "",
    wakeAt: reset - hibernate.wakeMarginMinutes * 60,
    sleepAt: now + SLEEP_WARNING,
    reset,
  };
}

/**
 * Did the machine sleep between two looks at the wall clock?
 *
 * @param {number} previous ms
 * @param {number} now ms
 * @returns {boolean}
 */
export function wallClockJumped(previous, now) {
  return now - previous > WAKE_JUMP_MS;
}

/**
 * Should an exit at `exitedAt` be left out of the crash-loop count?
 *
 * @param {number | null} wokeAt ms, the last wake seen
 * @param {number} exitedAt ms
 * @returns {boolean}
 */
export function exitedAfterWake(wokeAt, exitedAt) {
  return wokeAt !== null && exitedAt >= wokeAt && exitedAt - wokeAt <= AFTER_WAKE_MS;
}
