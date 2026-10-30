/**
 * The company's KPI snapshot (#891): facts in, `hub/kpis.json` out. hubd
 * computes it on the host, where session logs and systemd are; every jail
 * reads it. Nobody else computes KPIs, so the dashboard and the analyst
 * quote the same numbers.
 */

/** A reader of `kpis.json` that finds another value treats the file as absent. */
export const KPI_SCHEMA_VERSION = 4;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** A bounce is work sent back: from one of these to In Progress. */
const SENT_BACK_FROM = new Set(["In Review", "QA"]);

/**
 * @param {readonly number[]} values
 * @returns {number | null} the middle value, the mean of the two middle ones for an even count
 */
export function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * @param {readonly number[]} values
 * @returns {number | null} the nearest-rank 90th percentile
 */
export function p90(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.9) - 1] ?? null;
}

/**
 * The flow numbers. Windows are `(now - w, now]`.
 *
 * @param {{ now: number, moves: readonly import("./board-history.mjs").Move[],
 *   cards: readonly { issue: number, status: string }[] }} facts
 * @returns {NonNullable<Kpis["flow"]>}
 */
export function flowKpis({ now, moves, cards }) {
  const week = now - 7 * DAY_MS;
  const ordered = [...moves].sort((a, b) => a.ts - b.ts);
  /** @type {Map<number, import("./board-history.mjs").Move[]>} */
  const byIssue = new Map();
  for (const move of ordered) {
    byIssue.set(move.issue, [...(byIssue.get(move.issue) ?? []), move]);
  }

  /** @type {Record<string, number>} */
  const columns = {};
  for (const { status } of cards) {
    if (status !== "") {
      columns[status] = (columns[status] ?? 0) + 1;
    }
  }

  let done24h = 0;
  let done7d = 0;
  let bounces24h = 0;
  /** @type {Map<number, number>} issue → bounces in the week */
  const bounced = new Map();
  /** @type {number[]} */
  const cycles = [];
  /** @type {number[]} */
  const reviewWaits = [];
  /** @type {number[]} */
  const qaWaits = [];
  for (const history of byIssue.values()) {
    const firstReady = history.find((move) => move.to === "Ready")?.ts ?? null;
    /** @type {number | null} */
    let lastDone = null;
    for (const [at, move] of history.entries()) {
      if (move.to === "Done" && move.ts > week && move.ts <= now) {
        done7d += 1;
        done24h += move.ts > now - DAY_MS ? 1 : 0;
        lastDone = move.ts;
      }
      if (
        move.ts > week &&
        move.ts <= now &&
        move.to === "In Progress" &&
        move.from !== null &&
        SENT_BACK_FROM.has(move.from)
      ) {
        bounced.set(move.issue, (bounced.get(move.issue) ?? 0) + 1);
        bounces24h += move.ts > now - DAY_MS ? 1 : 0;
      }
      const left = history[at + 1];
      if (left !== undefined && left.ts > week && (move.to === "In Review" || move.to === "QA")) {
        (move.to === "QA" ? qaWaits : reviewWaits).push(left.ts - move.ts);
      }
    }
    if (lastDone !== null && firstReady !== null) {
      cycles.push(lastDone - firstReady);
    }
  }

  const blockedSince = cards
    .filter((card) => card.status === "Blocked")
    .map((card) => {
      const arrivals = (byIssue.get(card.issue) ?? []).filter((move) => move.to === "Blocked");
      return arrivals.at(-1)?.ts ?? null;
    })
    .filter((ts) => ts !== null);
  const topBounced = [...bounced]
    .map(([issue, bounces]) => ({ issue, bounces }))
    .sort((a, b) => b.bounces - a.bounces || a.issue - b.issue)
    .slice(0, 3);
  return {
    historySince: ordered[0]?.ts ?? null,
    columns,
    done24h,
    done7d,
    cycleMedianMs: median(cycles),
    cycleP90Ms: p90(cycles),
    reviewWaitMedianMs: median(reviewWaits),
    qaWaitMedianMs: median(qaWaits),
    bounces24h,
    bounces7d: [...bounced.values()].reduce((sum, count) => sum + count, 0),
    topBounced,
    blocked: columns.Blocked ?? 0,
    oldestBlockedMs: blockedSince.length === 0 ? null : now - Math.min(...blockedSince),
  };
}

/**
 * `systemctl show -p Id -p MemoryCurrent -p CPUUsageNSec` for several units:
 * blocks separated by a blank line. `[not set]` and the unsigned-max "no
 * value" of systemd are absent.
 *
 * @param {string} text
 * @returns {Map<string, { memoryBytes: number | null, cpuNSec: number | null }>}
 */
export function parseUnits(text) {
  /** @type {Map<string, { memoryBytes: number | null, cpuNSec: number | null }>} */
  const units = new Map();
  for (const block of text.split(/\n\s*\n/)) {
    /** @param {string} key */
    const field = (key) =>
      block
        .split("\n")
        .find((line) => line.startsWith(`${key}=`))
        ?.slice(key.length + 1);
    /** @param {string} key */
    const number = (key) => {
      const value = Number(field(key));
      return Number.isFinite(value) && value < 2 ** 63 ? value : null;
    };
    const id = field("Id");
    if (id !== undefined && id !== "") {
      units.set(id, { memoryBytes: number("MemoryCurrent"), cpuNSec: number("CPUUsageNSec") });
    }
  }
  return units;
}

/**
 * Cores' worth of CPU used between two samples, `null` without a previous one.
 *
 * @param {number | null} before CPUUsageNSec
 * @param {number | null} after
 * @param {number} elapsedMs
 * @returns {number | null}
 */
export function cpuShare(before, after, elapsedMs) {
  if (before === null || after === null || elapsedMs <= 0 || after < before) {
    return null;
  }
  return (after - before) / (elapsedMs * 1e6);
}

/**
 * The employee a jail unit is for: `vibewars-jail-qa-tester-4242.service`.
 * An `@` in the id was a `-` in the unit name, so `qa-tester@2` reads
 * `qa-tester-2`.
 *
 * @param {string} unit
 * @returns {string | null}
 */
export function employeeOfUnit(unit) {
  const match = /^vibewars-jail-(.+)-\d+(?:\.\w+)?$/.exec(unit);
  return match?.[1] ?? null;
}

/**
 * Tokens per role over the window: fresh input plus output. Cache reads are
 * left out, as they would drown the rest.
 *
 * @param {ReadonlyMap<string, { output: number, input: number }>} roles
 * @returns {Record<string, number>}
 */
export function tokensByRole(roles) {
  return Object.fromEntries([...roles].map(([role, use]) => [role, use.output + use.input]));
}

/**
 * Staff by role, from `staff.json` and the roster.
 *
 * @param {{ employees: Record<string, { role: string }> }} staff
 * @param {ReadonlySet<string>} live
 * @param {number} maxAgents
 * @returns {NonNullable<Kpis["staff"]>}
 */
export function staffKpis(staff, live, maxAgents) {
  /** @type {Record<string, { employed: number, live: number }>} */
  const byRole = {};
  for (const [id, { role }] of Object.entries(staff.employees)) {
    const row = (byRole[role] ??= { employed: 0, live: 0 });
    row.employed += 1;
    row.live += live.has(id) ? 1 : 0;
  }
  return { byRole, maxAgents };
}

/** How far back the 7-day projection keeps its step edges (#1313), in s. */
const EDGE_WINDOW_S = 24 * 3600;

/** Under this many edges, two steps, the burn rate is noise (#1313). */
const PROJECTION_MIN_EDGES = 3;

/** Under this span of edges, in s, the burn rate is noise (#1313). */
const PROJECTION_MIN_SPAN_S = 2 * 3600;

/** `kpi-edges.json`'s shape: a file with another is discarded (#1313). */
export const EDGES_SCHEMA_VERSION = 1;

/**
 * The first reading of a new 7-day utilization (#1313): `utilization`
 * arrives in 0.01 steps, so the burn is measured between the steps.
 *
 * @typedef {{ at: number, utilization: number, resetsAt: number }} SevenDayEdge
 *   `at` and `resetsAt` in unix seconds
 */

/**
 * `edges` with `reading` recorded (#1313): an edge at the reading's own
 * `at`, never the write's, if its utilization is not the newest edge's.
 * Then edges older than 24 h before the reading, or of another window
 * than the newest edge's (`resetsAt`), are dropped. No 7-day reading
 * records nothing and drops nothing.
 *
 * @param {readonly SevenDayEdge[]} edges oldest first
 * @param {{ at: number, sevenDay: { utilization: number, resetsAt: number } | null } | null} reading
 *   `at` in ms, as `readLimit`'s
 * @returns {SevenDayEdge[]}
 */
export function addEdge(edges, reading) {
  const sevenDay = reading?.sevenDay ?? null;
  if (reading === null || sevenDay === null) {
    return [...edges];
  }
  const at = Math.floor(reading.at / 1000);
  const recorded =
    edges.at(-1)?.utilization === sevenDay.utilization
      ? edges
      : [...edges, { at, utilization: sevenDay.utilization, resetsAt: sevenDay.resetsAt }];
  const newest = recorded.at(-1);
  return recorded.filter(
    (edge) => at - edge.at <= EDGE_WINDOW_S && edge.resetsAt === newest?.resetsAt,
  );
}

/**
 * When the 7-day budget reaches 100% if the burn between the kept edges
 * goes on (#1313), in unix seconds, anchored at the newest edge so it does
 * not drift between steps.
 *
 * @param {readonly SevenDayEdge[]} edges oldest first, as `addEdge` keeps them
 * @returns {number | null} null for fewer than 3 edges or a span under
 *   2 h, a flat or falling burn, or a window that resets first
 */
export function projectSevenDay(edges) {
  const first = edges[0];
  const last = edges.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  if (last.utilization >= 1) {
    return last.at;
  }
  if (edges.length < PROJECTION_MIN_EDGES || last.at - first.at < PROJECTION_MIN_SPAN_S) {
    return null;
  }
  const perSecond = (last.utilization - first.utilization) / (last.at - first.at);
  if (perSecond <= 0) {
    return null;
  }
  const projectedAt = Math.floor(last.at + (1 - last.utilization) / perSecond);
  return projectedAt >= last.resetsAt ? null : projectedAt;
}

/**
 * `kpi-edges.json`'s edges (#1313), or null for a file that does not parse
 * or has another `schemaVersion`: it is discarded, not adapted.
 *
 * @param {string} text
 * @returns {SevenDayEdge[] | null}
 */
export function parseEdges(text) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { schemaVersion, edges } = /** @type {Record<string, unknown>} */ (raw);
  if (schemaVersion !== EDGES_SCHEMA_VERSION || !Array.isArray(edges) || !edges.every(isEdge)) {
    return null;
  }
  return edges;
}

/**
 * @param {unknown} value
 * @returns {value is SevenDayEdge}
 */
function isEdge(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { at, utilization, resetsAt } = /** @type {Record<string, unknown>} */ (value);
  return [at, utilization, resetsAt].every(
    (field) => typeof field === "number" && Number.isFinite(field),
  );
}

/**
 * @typedef {object} Kpis
 * @property {number} schemaVersion
 * @property {number} at
 * @property {{ historySince: number | null, columns: Record<string, number>, done24h: number,
 *   done7d: number, cycleMedianMs: number | null, cycleP90Ms: number | null,
 *   reviewWaitMedianMs: number | null, qaWaitMedianMs: number | null, bounces24h: number,
 *   bounces7d: number, topBounced: { issue: number, bounces: number }[],
 *   blocked: number, oldestBlockedMs: number | null } | null} flow
 * @property {{ fiveHour: import("./stream-format.mjs").LimitWindow | null,
 *   sevenDay: (import("./stream-format.mjs").LimitWindow & { projectedAt: number | null }) | null,
 *   tokens5hByRole: Record<string, number> } | null} claude
 * @property {{ remaining: number, limit: number, resetAt: number,
 *   topSpend: { command: string, points: number }[] } | null} github
 * @property {{ employees: Record<string, { memoryBytes: number, cpuShare: number | null }>,
 *   slice: { memoryBytes: number, cpuShare: number | null }, diskFreeBytes: number,
 *   diskHoldBelow: number } | null} host
 * @property {{ byRole: Record<string, { employed: number, live: number }>,
 *   maxAgents: number } | null} staff
 * @property {import("./web-cache.mjs").WebCacheStats | null} webCache `hub wiki`'s (#1381)
 * @property {Record<string, string>} errors section → one line
 */

/**
 * The snapshot. A reader that throws leaves its section `null` and a line in
 * `errors`; the rest is still written.
 *
 * @param {number} now
 * @param {{ [K in "flow" | "claude" | "github" | "host" | "staff" | "webCache"]: () => Kpis[K] }} readers
 * @returns {Kpis}
 */
export function buildKpis(now, readers) {
  /** @type {Record<string, string>} */
  const errors = {};
  /**
   * @template T
   * @param {string} name
   * @param {() => T} read
   * @returns {T | null}
   */
  const section = (name, read) => {
    try {
      return read();
    } catch (error) {
      errors[name] = (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
      return null;
    }
  };
  return {
    schemaVersion: KPI_SCHEMA_VERSION,
    at: now,
    flow: section("flow", readers.flow),
    claude: section("claude", readers.claude),
    github: section("github", readers.github),
    host: section("host", readers.host),
    staff: section("staff", readers.staff),
    webCache: section("webCache", readers.webCache),
    errors,
  };
}
