/**
 * The lock behind `company heavy` (#3362): one heavy local job at a time,
 * company-wide, the rest queued first in, first out. A job declared short
 * (`--short`, under 5 minutes) is granted ahead of waiting long ones, at
 * most SHORT_RUN_MAX in a row while a long one waits, so long ones cannot starve. hubd keeps it, because
 * jails share no writable path. It is a lease, not a flock: the holder renews
 * it, a queued client polls, and either one that goes quiet for TTL_MS is
 * dropped, so a killed job frees its slot without any PID check. Pure: the
 * clock is passed in, and nothing is stored, so a hubd restart empties it.
 */

import { randomUUID } from "node:crypto";

/** How long a holder, or a queue entry, lives without a renew or a poll. */
export const TTL_MS = 90_000;
/** A short job is killed by its client after this long (#3582). */
export const SHORT_KILL_MS = 10 * 60_000;
/** Short jobs granted in a row while a long job waits. */
export const SHORT_RUN_MAX = 3;

/**
 * @typedef {object} Holder
 * @property {string} id
 * @property {string} employee
 * @property {string} cmd
 * @property {boolean} short
 * @property {number} since
 * @property {number} expires
 *
 * @typedef {object} Waiting
 * @property {string} employee
 * @property {string} cmd
 * @property {boolean} short
 * @property {number} expires
 *
 * @typedef {{ granted: true, leaseId: string }
 *   | { granted: false, ahead: number, holder: string | null }} Acquired
 */

export class HeavyLeases {
  /** @type {Holder | null} */
  holder = null;
  /** @type {Waiting[]} */
  queue = [];
  /** Short jobs granted in a row while a long job waited. */
  shortRun = 0;

  /** @param {number} now */
  #expire(now) {
    if (this.holder !== null && this.holder.expires <= now) this.holder = null;
    this.queue = this.queue.filter((entry) => entry.expires > now);
  }

  /**
   * The queue in the order it will be granted: the first short entry while
   * fewer than SHORT_RUN_MAX shorts went in a row and a long one waits,
   * otherwise the head.
   *
   * @returns {Waiting[]}
   */
  #order() {
    const left = [...this.queue];
    const order = [];
    let run = this.shortRun;
    while (left.length > 0) {
      const short = left.findIndex((entry) => entry.short);
      const longWaits = left.some((entry) => !entry.short);
      const pick = longWaits && run < SHORT_RUN_MAX && short !== -1 ? short : 0;
      const [entry] = left.splice(pick, 1);
      run = entry.short && longWaits ? run + 1 : 0;
      order.push(entry);
    }
    return order;
  }

  /**
   * Asks for the slot. An employee has one queue entry: asking again
   * refreshes it, keeping its place. The first in the grant order gets the
   * slot once nobody holds it.
   *
   * @param {string} employee
   * @param {string} cmd
   * @param {boolean} short
   * @param {number} now
   * @returns {Acquired}
   */
  acquire(employee, cmd, short, now) {
    this.#expire(now);
    const at = this.queue.findIndex((entry) => entry.employee === employee);
    if (at === -1) {
      this.queue.push({ employee, cmd, short, expires: now + TTL_MS });
    } else {
      this.queue[at] = { employee, cmd, short, expires: now + TTL_MS };
    }
    const order = this.#order();
    const index = order.findIndex((entry) => entry.employee === employee);
    if (index === 0 && this.holder === null) {
      const longWaits = this.queue.some((entry) => !entry.short);
      this.shortRun = short && longWaits ? this.shortRun + 1 : 0;
      this.queue = this.queue.filter((entry) => entry.employee !== employee);
      const leaseId = randomUUID();
      this.holder = { id: leaseId, employee, cmd, short, since: now, expires: now + TTL_MS };
      return { granted: true, leaseId };
    }
    return {
      granted: false,
      ahead: index + (this.holder === null ? 0 : 1),
      holder: this.holder === null ? null : this.#describe(this.holder, now),
    };
  }

  /**
   * @param {string} employee
   * @param {string} leaseId
   * @param {number} now
   * @returns {boolean} whether the lease was the employee's and alive
   */
  renew(employee, leaseId, now) {
    this.#expire(now);
    if (this.holder?.id !== leaseId || this.holder.employee !== employee) return false;
    // The backstop for a client that ignores its own kill timer.
    if (this.holder.short && now > this.holder.since + SHORT_KILL_MS + TTL_MS) return false;
    this.holder.expires = now + TTL_MS;
    return true;
  }

  /**
   * @param {string} employee
   * @param {string} leaseId
   * @param {number} now
   * @returns {boolean} whether there was such a lease of the employee's to release
   */
  release(employee, leaseId, now) {
    this.#expire(now);
    if (this.holder?.id !== leaseId || this.holder.employee !== employee) return false;
    this.holder = null;
    return true;
  }

  /**
   * Takes the employee out of the queue, for a client that gives up waiting.
   *
   * @param {string} employee
   */
  leave(employee) {
    this.queue = this.queue.filter((entry) => entry.employee !== employee);
  }

  /**
   * @param {number} now
   * @returns {{ holder: string | null, queue: string[] }}
   */
  status(now) {
    this.#expire(now);
    return {
      holder: this.holder === null ? null : this.#describe(this.holder, now),
      queue: this.queue.map(
        (entry) => `${entry.employee} ${entry.short ? "[short] " : ""}${entry.cmd}`,
      ),
    };
  }

  /**
   * @param {Holder} holder
   * @param {number} now
   * @returns {string}
   */
  #describe(holder, now) {
    const minutes = Math.floor((now - holder.since) / 60_000);
    return `${holder.employee}, ${String(minutes)}m: ${holder.cmd}`;
  }
}
