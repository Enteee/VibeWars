/**
 * Who hubd wakes for a card that is already waiting (#3100).
 *
 * `idleWait` wakes an idle employee for a card that *arrives* in its column.
 * A card that was there before the employee went idle wakes nobody, so hubd
 * sweeps for those. Pure: no clock, no files.
 */

/**
 * The one role swept for each column. Roles that share a column keep the arrival
 * wake and direct messages only: a card is usually one role's.
 */
export const SWEEP_ROLE = Object.freeze(
  /** @type {Record<string, string>} */ ({
    Backlog: "architect",
    Ready: "developer",
    "In Review": "lead-dev",
    QA: "qa-tester",
  }),
);
/** In `bus/<employee>/`: the time (ms) the employee went idle; there while it is. */
export const IDLING_FILE = "idling";
/** An employee must have been idle this long (ms): a turn that just ended is not woken back. */
export const IDLE_GRACE_MS = 2 * 60_000;
/** A `taking #N` claim keeps its card from being waiting this long (ms). */
export const CLAIM_HOLD_MS = 2 * 60 * 60_000;
/** The same employee is not woken for the same card again within this (ms). */
export const REWAKE_MS = 3 * 60 * 60_000;
/** How often hubd sweeps (ms). */
export const WAKE_CHECK_MS = 60_000;
/** The architect is woken for Backlog only while Ready holds fewer cards than this. */
export const READY_LOW = 2;

/**
 * @typedef {{ number: number, title: string, status: string }} WakeCard
 * @typedef {{ issue: number, employee: string, at: number, status: string | null }} Claim
 *   `status`: the card's column when claimed; a card found elsewhere has moved since
 * @typedef {{ employee: string, issue: number, column: string, title: string }} WakeTarget
 */

/**
 * The key of `sent`.
 *
 * @param {string} employee
 * @param {number} issue
 * @returns {string}
 */
export function sentKey(employee, issue) {
  return `${employee}#${String(issue)}`;
}

/**
 * @param {WakeCard} card
 * @param {readonly Claim[]} claims
 * @param {number} now
 * @returns {boolean}
 */
function claimed(card, claims, now) {
  return claims.some(
    (claim) =>
      claim.issue === card.number &&
      now - claim.at < CLAIM_HOLD_MS &&
      (claim.status === null || claim.status === card.status),
  );
}

/**
 * @param {{
 *   cards: readonly WakeCard[],
 *   staff: ReadonlyMap<string, string>,
 *   idle: ReadonlyMap<string, number>,
 *   claims: readonly Claim[],
 *   sent: ReadonlyMap<string, number>,
 *   now: number,
 * }} input
 *   `cards` in board order; `staff` employee → role; `idle` employee → when it went idle
 * @returns {WakeTarget[]} one employee per card, never one employee twice
 */
export function wakeTargets({ cards, staff, idle, claims, sent, now }) {
  /** @type {WakeTarget[]} */
  const targets = [];
  const picked = new Set();
  const readyCount = cards.filter((card) => card.status === "Ready").length;
  for (const [column, role] of Object.entries(SWEEP_ROLE)) {
    let waiting = cards.filter((card) => card.status === column && !claimed(card, claims, now));
    if (role === "architect") {
      // Backlog also holds epics, releases and held cards.
      waiting =
        readyCount < READY_LOW
          ? waiting.filter((card) => !/^(epic|release)/i.test(card.title)).slice(0, 1)
          : [];
    }
    const sleepers = [...staff]
      .filter(([employee, r]) => {
        const since = idle.get(employee);
        return r === role && since !== undefined && now - since >= IDLE_GRACE_MS;
      })
      .map(([employee]) => employee)
      .sort();
    for (const card of waiting) {
      const employee = sleepers.find((name) => {
        const last = sent.get(sentKey(name, card.number));
        return !picked.has(name) && (last === undefined || now - last >= REWAKE_MS);
      });
      if (employee !== undefined) {
        picked.add(employee);
        targets.push({ employee, issue: card.number, column, title: card.title });
      }
    }
  }
  return targets;
}

/**
 * @param {WakeTarget} target
 * @returns {string}
 */
export function wakeText(target) {
  return `Work waiting: #${String(target.issue)} in ${target.column} — ${target.title}.`;
}
