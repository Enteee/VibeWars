/**
 * The lock behind `company heavy` (#3362): one heavy local job at a time,
 * company-wide, the rest queued first in, first out. hubd keeps it, because
 * jails share no writable path. It is a lease, not a flock: the holder renews
 * it, a queued client polls, and either one that goes quiet for TTL_MS is
 * dropped, so a killed job frees its slot without any PID check. Pure: the
 * clock is passed in, and nothing is stored, so a hubd restart empties it.
 */

import { randomUUID } from "node:crypto";

/** How long a holder, or a queue entry, lives without a renew or a poll. */
export const TTL_MS = 90_000;

/**
 * @typedef {object} Holder
 * @property {string} id
 * @property {string} employee
 * @property {string} cmd
 * @property {number} since
 * @property {number} expires
 *
 * @typedef {object} Waiting
 * @property {string} employee
 * @property {string} cmd
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

  /** @param {number} now */
  #expire(now) {
    if (this.holder !== null && this.holder.expires <= now) this.holder = null;
    this.queue = this.queue.filter((entry) => entry.expires > now);
  }

  /**
   * Asks for the slot. An employee has one queue entry: asking again
   * refreshes it. The head is granted the slot once nobody holds it.
   *
   * @param {string} employee
   * @param {string} cmd
   * @param {number} now
   * @returns {Acquired}
   */
  acquire(employee, cmd, now) {
    this.#expire(now);
    let index = this.queue.findIndex((entry) => entry.employee === employee);
    if (index === -1) {
      this.queue.push({ employee, cmd, expires: now + TTL_MS });
      index = this.queue.length - 1;
    } else {
      this.queue[index] = { employee, cmd, expires: now + TTL_MS };
    }
    if (index === 0 && this.holder === null) {
      this.queue.shift();
      const leaseId = randomUUID();
      this.holder = { id: leaseId, employee, cmd, since: now, expires: now + TTL_MS };
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
      queue: this.queue.map((entry) => `${entry.employee} ${entry.cmd}`),
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
