/**
 * The company's KPI snapshot (#891): facts in, `hub/kpis.json` out. hubd
 * computes it on the host, where session logs and systemd are; every jail
 * reads it. Nobody else computes KPIs, so the dashboard and the analyst
 * quote the same numbers.
 */

/** A reader of `kpis.json` that finds another value treats the file as absent. */
export const KPI_SCHEMA_VERSION = 6;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The columns `stageWaits` measures, and their keys (#1615). */
/** @type {ReadonlyMap<string, "ready" | "inProgress" | "inReview" | "qa">} */
const STAGE_COLUMNS = new Map([
  ["Ready", "ready"],
  ["In Progress", "inProgress"],
  ["In Review", "inReview"],
  ["QA", "qa"],
]);

/** The roles that take their work from Ready (#1615). */
const READY_ROLES = new Set(["developer", "asset-designer", "cicd-engineer"]);

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
 *   cards: readonly { issue: number, status: string }[],
 *   waits: ReadonlyMap<string, readonly import("./waits.mjs").WaitLine[]>,
 *   staff: { employees: Record<string, { role: string }> } }} facts
 * @returns {NonNullable<Kpis["flow"]>}
 */
export function flowKpis({ now, moves, cards, waits, staff }) {
  const week = now - 7 * DAY_MS;
  const histories = byIssue(moves);

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
  for (const history of histories.values()) {
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
      const arrivals = (histories.get(card.issue) ?? []).filter((move) => move.to === "Blocked");
      return arrivals.at(-1)?.ts ?? null;
    })
    .filter((ts) => ts !== null);
  const topBounced = [...bounced]
    .map(([issue, bounces]) => ({ issue, bounces }))
    .sort((a, b) => b.bounces - a.bounces || a.issue - b.issue)
    .slice(0, 3);
  return {
    historySince: moves.reduce(
      (first, move) => (first === null || move.ts < first ? move.ts : first),
      /** @type {number | null} */ (null),
    ),
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
    stageWait: stageWaits(now, moves),
    idleWhileReadyMs24h: idleWhileReady(now, moves, waits, staff),
  };
}

/**
 * How long cards sat in each column (#1615): every stay that ended, by
 * the card's next move, in `(now - 24 h, now]`, however long ago it began.
 *
 * @param {number} now
 * @param {readonly import("./board-history.mjs").Move[]} moves
 * @returns {Record<"ready" | "inProgress" | "inReview" | "qa", StageWait>}
 */
export function stageWaits(now, moves) {
  /** @type {Record<"ready" | "inProgress" | "inReview" | "qa", number[]>} */
  const stays = { ready: [], inProgress: [], inReview: [], qa: [] };
  for (const history of byIssue(moves).values()) {
    for (const [at, move] of history.entries()) {
      const key = STAGE_COLUMNS.get(move.to ?? "");
      const left = history[at + 1];
      if (key !== undefined && left !== undefined && left.ts > now - DAY_MS && left.ts <= now) {
        stays[key].push(left.ts - move.ts);
      }
    }
  }
  /** @param {number[]} values */
  const summary = (values) => ({ medianMs: median(values), p90Ms: p90(values), n: values.length });
  return {
    ready: summary(stays.ready),
    inProgress: summary(stays.inProgress),
    inReview: summary(stays.inReview),
    qa: summary(stays.qa),
  };
}

/**
 * Each employee's waits as a union, clipped to `(now - 24 h, now]` and to
 * start at its first wait in it (#1615): one hired or rebooted mid-day
 * was not idle before it existed. An employee with none in it is absent.
 *
 * @param {number} now
 * @param {ReadonlyMap<string, readonly import("./waits.mjs").WaitLine[]>} waits
 * @returns {Map<string, { from: number, waited: [number, number][] }>}
 */
function waitsInDay(now, waits) {
  /** @type {Map<string, { from: number, waited: [number, number][] }>} */
  const clipped = new Map();
  for (const [employee, lines] of waits) {
    const inDay = lines.filter((line) => line.end > now - DAY_MS && line.start <= now);
    if (inDay.length === 0) {
      continue;
    }
    const from = Math.max(now - DAY_MS, Math.min(...inDay.map((line) => line.start)));
    const waited = union(
      inDay.map(
        (line) =>
          /** @type {[number, number]} */ ([Math.max(from, line.start), Math.min(now, line.end)]),
      ),
    );
    clipped.set(employee, { from, waited });
  }
  return clipped;
}

/**
 * Per role, the share of the last 24 h its employees spent in a wait
 * (#1615): waited ÷ observed, summed over the role's employees. A role
 * with no wait in the window is absent.
 *
 * @param {number} now
 * @param {ReadonlyMap<string, readonly import("./waits.mjs").WaitLine[]>} waits
 * @param {{ employees: Record<string, { role: string }> }} staff
 * @returns {Record<string, number>}
 */
export function idleShare(now, waits, staff) {
  /** @type {Map<string, { waited: number, observed: number }>} */
  const byRole = new Map();
  for (const [employee, { from, waited }] of waitsInDay(now, waits)) {
    const role = staff.employees[employee]?.role;
    if (role === undefined) {
      continue;
    }
    const row = byRole.get(role) ?? { waited: 0, observed: 0 };
    row.waited += overlap(from, now, waited);
    row.observed += now - from;
    byRole.set(role, row);
  }
  return Object.fromEntries(
    [...byRole]
      .filter(([, { observed }]) => observed > 0)
      .map(([role, { waited, observed }]) => [role, waited / observed]),
  );
}

/**
 * Ms of the last 24 h with a card in Ready while an employee of a role that
 * works from Ready was in a wait (#1615). A card still in Ready is there
 * until `now`.
 *
 * @param {number} now
 * @param {readonly import("./board-history.mjs").Move[]} moves
 * @param {ReadonlyMap<string, readonly import("./waits.mjs").WaitLine[]>} waits
 * @param {{ employees: Record<string, { role: string }> }} staff
 * @returns {number}
 */
export function idleWhileReady(now, moves, waits, staff) {
  /** @type {[number, number][]} */
  const ready = [];
  for (const history of byIssue(moves).values()) {
    for (const [at, move] of history.entries()) {
      if (move.to === "Ready") {
        ready.push([move.ts, history[at + 1]?.ts ?? now]);
      }
    }
  }
  const waiting = union(
    [...waitsInDay(now, waits)]
      .filter(([employee]) => READY_ROLES.has(staff.employees[employee]?.role ?? ""))
      .flatMap(([, { waited }]) => waited),
  );
  return union(ready).reduce(
    (sum, [start, end]) =>
      sum + overlap(Math.max(start, now - DAY_MS), Math.min(end, now), waiting),
    0,
  );
}

/**
 * @param {readonly import("./board-history.mjs").Move[]} moves
 * @returns {Map<number, import("./board-history.mjs").Move[]>} each issue's, oldest first
 */
function byIssue(moves) {
  /** @type {Map<number, import("./board-history.mjs").Move[]>} */
  const grouped = new Map();
  for (const move of [...moves].sort((a, b) => a.ts - b.ts)) {
    grouped.set(move.issue, [...(grouped.get(move.issue) ?? []), move]);
  }
  return grouped;
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
 * @param {number} now
 * @param {ReadonlyMap<string, readonly import("./waits.mjs").WaitLine[]>} waits
 * @returns {NonNullable<Kpis["staff"]>}
 */
export function staffKpis(staff, live, maxAgents, now, waits) {
  /** @type {Record<string, { employed: number, live: number }>} */
  const byRole = {};
  for (const [id, { role }] of Object.entries(staff.employees)) {
    const row = (byRole[role] ??= { employed: 0, live: 0 });
    row.employed += 1;
    row.live += live.has(id) ? 1 : 0;
  }
  return { byRole, maxAgents, idleShare24h: idleShare(now, waits, staff) };
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
 * One completed Actions run, a line of `ci-history.jsonl` (#1612). Times in
 * epoch ms. Every jail reads the file, and a fork's pull request names its
 * own title, branch and workflow files: so no free text is kept. `issue`
 * is the `#N` a run's title starts with, `onMain` whether it ran on main,
 * and `workflow` a gate workflow's file name or `"other"`.
 *
 * @typedef {{ id: number, workflow: string, event: string, onMain: boolean,
 *   sha: string, issue: number | null, createdAt: number, completedAt: number,
 *   conclusion: string }} CiRun
 */

/** What an Actions enum (event, conclusion) looks like; anything else is not one. */
const ENUM = /^[a-z_]{1,40}$/;

/**
 * @param {unknown} value
 * @returns {value is CiRun}
 */
function isCiRun(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const run = /** @type {Record<string, unknown>} */ (value);
  return (
    Number.isInteger(run.id) &&
    typeof run.workflow === "string" &&
    /^[\w.-]{1,64}$/.test(run.workflow) &&
    typeof run.event === "string" &&
    ENUM.test(run.event) &&
    typeof run.onMain === "boolean" &&
    typeof run.sha === "string" &&
    /^[0-9a-f]{40}$/.test(run.sha) &&
    (run.issue === null || Number.isInteger(run.issue)) &&
    Number.isFinite(run.createdAt) &&
    Number.isFinite(run.completedAt) &&
    typeof run.conclusion === "string" &&
    ENUM.test(run.conclusion)
  );
}

/**
 * The runs in `ci-history.jsonl`. A line that is not one is skipped.
 *
 * @param {string} text
 * @returns {CiRun[]}
 */
export function parseCiHistory(text) {
  /** @type {CiRun[]} */
  const runs = [];
  for (const line of text.split("\n")) {
    if (line === "") {
      continue;
    }
    try {
      /** @type {unknown} */
      const parsed = JSON.parse(line);
      if (isCiRun(parsed)) {
        const { id, workflow, event, onMain, sha, issue, createdAt, completedAt, conclusion } =
          parsed;
        runs.push({ id, workflow, event, onMain, sha, issue, createdAt, completedAt, conclusion });
      }
    } catch {
      // A torn or foreign line: skipped.
    }
  }
  return runs;
}

/**
 * A run of the REST `actions/runs` list as a history line. A re-run keeps
 * its `id`, so the history holds a run's first completion and later
 * attempts are never seen: close enough for KPIs.
 *
 * @param {unknown} value
 * @param {readonly string[]} gate the merge gate's workflow files
 * @returns {CiRun | null} null for a run not yet completed, or malformed
 */
export function ciRunFromRest(value, gate) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const run = /** @type {Record<string, unknown>} */ (value);
  if (run.status !== "completed" || typeof run.path !== "string") {
    return null;
  }
  const file = run.path.split("/").at(-1) ?? "";
  const issue =
    typeof run.display_title === "string" ? /^#(\d+)\b/.exec(run.display_title)?.[1] : undefined;
  const line = {
    id: run.id,
    workflow: gate.includes(file) ? file : "other",
    event: run.event,
    onMain: run.head_branch === "main",
    sha: run.head_sha,
    issue: issue === undefined ? null : Number(issue),
    createdAt: typeof run.created_at === "string" ? Date.parse(run.created_at) : NaN,
    completedAt: typeof run.updated_at === "string" ? Date.parse(run.updated_at) : NaN,
    conclusion: run.conclusion,
  };
  return isCiRun(line) ? line : null;
}

/**
 * A union of intervals.
 *
 * @param {readonly (readonly [number, number])[]} intervals `[start, end]`
 * @returns {[number, number][]} disjoint, in order, empty ones dropped
 */
function union(intervals) {
  /** @type {[number, number][]} */
  const merged = [];
  for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (end <= start) {
      continue;
    }
    if (last !== undefined && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/**
 * How much of `[start, end]` the disjoint `intervals` cover.
 *
 * @param {number} start
 * @param {number} end
 * @param {readonly (readonly [number, number])[]} intervals
 */
function overlap(start, end, intervals) {
  return intervals.reduce(
    (sum, [from, to]) => sum + Math.max(0, Math.min(end, to) - Math.max(start, from)),
    0,
  );
}

/** The columns `cycleShare` splits a card's time between, besides CI. */
/** @type {ReadonlyMap<string, "inProgress" | "review" | "qa">} */
const SHARE_COLUMNS = new Map([
  ["In Progress", "inProgress"],
  ["In Review", "review"],
  ["QA", "qa"],
]);

/**
 * Minutes in `(now - 24 h, now]` that main's `ci.yml` was red. Main takes a
 * run's conclusion when it completes, unless a newer run already set it:
 * an old slow run does not overwrite a newer one. Cancelled and skipped
 * runs change nothing.
 *
 * @param {number} now
 * @param {readonly CiRun[]} runs
 */
function mainRedMinutes(now, runs) {
  const since = now - DAY_MS;
  const pushes = runs
    .filter((run) => run.workflow === "ci.yml" && run.event === "push" && run.onMain)
    .filter((run) => run.conclusion !== "cancelled" && run.conclusion !== "skipped")
    .sort((a, b) => a.completedAt - b.completedAt);
  let red = 0;
  /** @type {CiRun | null} */
  let state = null;
  for (const run of pushes) {
    if (state !== null && run.createdAt <= state.createdAt) {
      continue;
    }
    if (state !== null && state.conclusion !== "success") {
      red += overlap(since, now, [[state.completedAt, run.completedAt]]);
    }
    state = run;
  }
  if (state !== null && state.conclusion !== "success") {
    red += overlap(since, now, [[state.completedAt, now]]);
  }
  return Math.round(red / 60_000);
}

/**
 * The CI numbers (#1612). A "CI run" is one PR head commit, all its gate
 * runs together. Windows are `(now - w, now]`, by a run's completion.
 *
 * @param {{ now: number, runs: readonly CiRun[],
 *   moves: readonly import("./board-history.mjs").Move[], done7d: number,
 *   gate: readonly string[] }} facts `gate`: the merge gate's workflow files
 * @returns {NonNullable<Kpis["ci"]>}
 */
export function ciKpis({ now, runs, moves, done7d, gate }) {
  const day = now - DAY_MS;
  const week = now - 7 * DAY_MS;
  const gated = runs.filter((run) => run.event === "pull_request" && gate.includes(run.workflow));
  /** @type {Map<string, CiRun[]>} */
  const bySha = new Map();
  for (const run of gated) {
    bySha.set(run.sha, [...(bySha.get(run.sha) ?? []), run]);
  }
  /** @param {number} since */
  const commitsSince = (since) =>
    [...bySha].filter(([, shaRuns]) =>
      shaRuns.some((run) => run.completedAt > since && run.completedAt <= now),
    );

  const day24 = commitsSince(day);
  const kept = day24.filter(
    ([, shaRuns]) => !shaRuns.some((run) => run.conclusion === "cancelled"),
  );
  const waits = kept.map(
    ([, shaRuns]) =>
      Math.max(...shaRuns.map((run) => run.completedAt)) -
      Math.min(...shaRuns.map((run) => run.createdAt)),
  );

  return {
    historySince: runs.length === 0 ? null : Math.min(...runs.map((run) => run.createdAt)),
    runs24h: day24.length,
    superseded24h: day24.length - kept.length,
    waitMedianMs: median(waits),
    waitP90Ms: p90(waits),
    runsPerDone: done7d === 0 ? null : commitsSince(week).length / done7d,
    mainRedMinutes24h: mainRedMinutes(now, runs),
    cycleShare: cycleShare({ now, gated, moves }),
  };
}

/**
 * Where the cycle of every card Done in the week went (#1612): its time in
 * In Progress, In Review and QA between its first Ready and last Done, with
 * the time its PR's CI ran taken out of those columns into `ci`. A run is a
 * card's when its title starts `#<issue>` (`CiRun.issue`).
 *
 * @param {{ now: number, gated: readonly CiRun[],
 *   moves: readonly import("./board-history.mjs").Move[] }} facts
 * @returns {{ inProgress: number, ci: number, review: number, qa: number } | null}
 *   fractions summing to 1, null when no card was Done or none spent time
 */
function cycleShare({ now, gated, moves }) {
  const week = now - 7 * DAY_MS;
  /** @type {Map<number, import("./board-history.mjs").Move[]>} */
  const byIssue = new Map();
  for (const move of [...moves].sort((a, b) => a.ts - b.ts)) {
    byIssue.set(move.issue, [...(byIssue.get(move.issue) ?? []), move]);
  }
  /** @type {Map<number, [number, number][]>} */
  const ciByIssue = new Map();
  for (const run of gated) {
    if (run.issue !== null) {
      ciByIssue.set(run.issue, [
        ...(ciByIssue.get(run.issue) ?? []),
        [run.createdAt, run.completedAt],
      ]);
    }
  }

  const totals = { inProgress: 0, ci: 0, review: 0, qa: 0 };
  for (const [issue, history] of byIssue) {
    const firstReady = history.find((move) => move.to === "Ready")?.ts;
    const lastDone = history.findLast(
      (move) => move.to === "Done" && move.ts > week && move.ts <= now,
    )?.ts;
    if (firstReady === undefined || lastDone === undefined) {
      continue;
    }
    const ci = union(ciByIssue.get(issue) ?? []);
    for (const [at, move] of history.entries()) {
      const column = move.to === null ? undefined : SHARE_COLUMNS.get(move.to);
      const left = history[at + 1]?.ts;
      if (column === undefined || left === undefined) {
        continue;
      }
      const start = Math.max(move.ts, firstReady);
      const end = Math.min(left, lastDone);
      if (end > start) {
        const inCi = overlap(start, end, ci);
        totals.ci += inCi;
        totals[column] += end - start - inCi;
      }
    }
  }
  const total = totals.inProgress + totals.ci + totals.review + totals.qa;
  return total === 0
    ? null
    : {
        inProgress: totals.inProgress / total,
        ci: totals.ci / total,
        review: totals.review / total,
        qa: totals.qa / total,
      };
}

/**
 * @typedef {{ medianMs: number | null, p90Ms: number | null, n: number }} StageWait
 */

/**
 * @typedef {object} Kpis
 * @property {number} schemaVersion
 * @property {number} at
 * @property {{ historySince: number | null, columns: Record<string, number>, done24h: number,
 *   done7d: number, cycleMedianMs: number | null, cycleP90Ms: number | null,
 *   reviewWaitMedianMs: number | null, qaWaitMedianMs: number | null, bounces24h: number,
 *   bounces7d: number, topBounced: { issue: number, bounces: number }[],
 *   blocked: number, oldestBlockedMs: number | null,
 *   stageWait: Record<"ready" | "inProgress" | "inReview" | "qa", StageWait>,
 *   idleWhileReadyMs24h: number } | null} flow
 * @property {{ fiveHour: import("./stream-format.mjs").LimitWindow | null,
 *   sevenDay: (import("./stream-format.mjs").LimitWindow & { projectedAt: number | null }) | null,
 *   tokens5hByRole: Record<string, number> } | null} claude
 * @property {{ remaining: number, limit: number, resetAt: number,
 *   topSpend: { command: string, points: number }[] } | null} github
 * @property {{ employees: Record<string, { memoryBytes: number, cpuShare: number | null }>,
 *   slice: { memoryBytes: number, cpuShare: number | null }, diskFreeBytes: number,
 *   diskHoldBelow: number } | null} host
 * @property {{ byRole: Record<string, { employed: number, live: number }>,
 *   maxAgents: number, idleShare24h: Record<string, number> } | null} staff
 * @property {import("./web-cache.mjs").WebCacheStats | null} webCache `hub wiki`'s (#1381)
 * @property {{ historySince: number | null, runs24h: number, superseded24h: number,
 *   waitMedianMs: number | null, waitP90Ms: number | null, runsPerDone: number | null,
 *   mainRedMinutes24h: number, cycleShare: { inProgress: number, ci: number, review: number,
 *   qa: number } | null } | null} ci the merge gate's runs (#1612)
 * @property {Record<string, string>} errors section → one line
 */

/**
 * The snapshot. A reader that throws leaves its section `null` and a line in
 * `errors`; the rest is still written.
 *
 * @param {number} now
 * @param {{ [K in "flow" | "claude" | "github" | "host" | "staff" | "webCache" | "ci"]: () => Kpis[K] }} readers
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
    ci: section("ci", readers.ci),
    errors,
  };
}
