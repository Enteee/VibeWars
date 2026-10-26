#!/usr/bin/env node
/**
 * The company dashboard: one window that answers "what is happening".
 *
 * Runs on the host, outside every jail, so it can read the board, the roster
 * and every role's inbox at once — which no single agent can do.
 *
 * It also states plainly which roles have nobody employed and what that blocks.
 * The company is designed to run on a partial roster, but a pipeline that
 * silently stops at `In Review` because there is no reviewer looks identical
 * to a pipeline where everyone is just slow, and the difference matters.
 *
 * The dashboard window is three tmux panes, each running this with its
 * section: `board`, `company` or `feed` (#165). No argument is `board`,
 * which is also what running `claude-llc-dash` by hand shows. What each
 * pane says is `dashboard-view.mjs`; this file reads and draws.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { readBoardState } from "./hub-board.mjs";
import { WINDOW_MS, createUsageReader, summarize } from "./claude-usage.mjs";
import { ROLES } from "./hub-policy.mjs";
import { formatSpend, readSpend } from "./hub-spend.mjs";
import { readRoster } from "./presence.mjs";
import { betweenTurns, parseReboot } from "./reboot.mjs";
import { parseSchedule } from "./schedule.mjs";
import { readSidecar, sidecarDown } from "./sidecar.mjs";
import { unreadOf } from "./unread.mjs";
import { boardLines, companyLines, feedLines, groupFeed } from "./dashboard-view.mjs";
import { hubHealth, parseAlive, parseRestarts } from "./hub-health.mjs";
import { parseStaff, roleOf } from "./staff.mjs";

const ROOT = process.env.VIBEWARS_BOT_ROOT ?? path.join(process.cwd(), ".bots");
const BUS = path.join(ROOT, "bus");
const HUB = path.join(ROOT, "hub");
const REFRESH_MS = 10_000;

/**
 * A JSON file hubd writes, or `null` before it has written one.
 *
 * The dashboard never calls GitHub itself. It used to poll the board every
 * 20 s, which was the largest single drain on the shared GraphQL budget
 * (issue #17); hubd's own snapshot is at most a minute old whenever anyone is
 * working, and costs nothing extra to read.
 *
 * @param {string} name
 * @returns {Record<string, unknown> | null}
 */
function hubFile(name) {
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(fs.readFileSync(path.join(HUB, name), "utf8"));
    return obj(parsed);
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function obj(value) {
  return typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * What the company is doing about a reboot: one handed to the restarter, or
 * one waiting to drain. A file `parseReboot` rejects is no reboot.
 *
 * @param {ReadonlySet<string>} live
 * @returns {import("./dashboard-view.mjs").CompanyFacts["reboot"]}
 */
function reboot(live) {
  /** @param {string} name */
  const record = (name) => {
    try {
      return parseReboot(JSON.parse(fs.readFileSync(path.join(ROOT, name), "utf8")));
    } catch {
      return null;
    }
  };
  const rebooting = record("rebooting.json");
  if (rebooting !== null) {
    return { rebooting: rebooting.reason };
  }
  const pending = record("reboot.json");
  return pending === null
    ? null
    : { record: pending, between: betweenTurns(ROOT, [...live]), now: Date.now() };
}

/** @returns {{ project: number, owner: string, columns: string[], maxAgents: number | null } | null} */
function company() {
  try {
    /** @type {unknown} */
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "company.json"), "utf8"));
    const cfg = obj(raw);
    return {
      project: typeof cfg.project === "number" ? cfg.project : 0,
      owner: typeof cfg.owner === "string" ? cfg.owner : "",
      columns: Array.isArray(cfg.columns) ? cfg.columns.map(String) : [],
      maxAgents: typeof cfg.maxAgents === "number" ? cfg.maxAgents : null,
    };
  } catch {
    return null;
  }
}

/**
 * `staff.json`, or null while it is missing or not the current shape:
 * hubd is its only writer, and the dashboard never repairs it (#386).
 *
 * @returns {import("./staff.mjs").Staff | null}
 */
function staffFile() {
  try {
    return parseStaff(fs.readFileSync(path.join(ROOT, "staff.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * The manager watchdog's restarts since local midnight (#384), from
 * `.bots/manager-restarts.json`: a JSON array of epoch milliseconds, one
 * per restart. No file, or one in another shape, is none.
 *
 * @param {number} now
 * @returns {number}
 */
function managerRestarts(now) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(ROOT, "manager-restarts.json"), "utf8"));
  } catch {
    return 0;
  }
  if (!Array.isArray(raw)) {
    return 0;
  }
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return raw.filter((at) => typeof at === "number" && at >= midnight.getTime() && at <= now).length;
}

/**
 * The roster as it stands (#363): which employees are running, and which
 * died without cleaning up, with when they were last seen.
 *
 * @param {import("./staff.mjs").Staff | null} staff
 * @returns {{ live: Set<string>, stale: Map<string, number> }}
 */
function presence(staff) {
  /** @type {Set<string>} */
  const live = new Set();
  /** @type {Map<string, number>} */
  const stale = new Map();
  const employees = Object.keys(staff?.employees ?? {});
  for (const [id, entry] of readRoster(path.join(BUS, "roster"), employees, Date.now())) {
    if (entry.fresh) {
      live.add(id);
    } else {
      stale.set(id, entry.lastSeen);
    }
  }
  return { live, stale };
}

/**
 * The last few lines across every role's inbox, newest last, so the dashboard
 * reads like a conversation rather than nine separate logs.
 *
 * @param {number} limit
 * @returns {import("./dashboard-view.mjs").FeedLine[]} one row per message (#189)
 */
function feed(limit) {
  /** @type {import("./dashboard-view.mjs").InboxRow[]} */
  const lines = [];
  for (const role of ROLES) {
    let contents;
    try {
      contents = fs.readFileSync(path.join(BUS, role, "inbox.jsonl"), "utf8");
    } catch {
      continue;
    }
    for (const line of contents.split("\n")) {
      if (line === "") {
        continue;
      }
      try {
        /** @type {unknown} */
        const raw = JSON.parse(line);
        const record = obj(raw);
        lines.push({
          ts: typeof record.ts === "number" ? record.ts : 0,
          to: role,
          from: typeof record.from === "string" ? record.from : "?",
          kind: typeof record.kind === "string" ? record.kind : "",
          text: typeof record.text === "string" ? record.text : "",
        });
      } catch {
        /* skip */
      }
    }
  }
  // Group first: slicing first would fill the pane with one broadcast's copies.
  return groupFeed(lines).slice(-limit);
}

/**
 * The scheduled nudges (#547): the checked-in schedule, hubd's clock for it,
 * and who has each unread, by the rule link uses (inbox past `cursor`).
 *
 * @param {import("./staff.mjs").Staff | null} staff
 * @param {number} now
 * @returns {import("./dashboard-view.mjs").NudgeFacts}
 */
function nudges(staff, now) {
  /** @type {import("./dashboard-view.mjs").NudgeFacts["schedule"]} */
  let schedule;
  try {
    schedule = parseSchedule(
      fs.readFileSync(path.join(import.meta.dirname, "schedule.json"), "utf8"),
    );
  } catch (error) {
    schedule = error instanceof Error ? error.message : String(error);
  }
  const clock = hubFile("nudges.json");
  /** @type {Map<string, number>} */
  const sent = new Map();
  for (const [id, at] of Object.entries(obj(clock?.sent))) {
    if (typeof at === "number") {
      sent.set(id, at);
    }
  }
  /** @type {Map<string, string[]>} */
  const unread = new Map();
  for (const employee of Object.keys(staff?.employees ?? {})) {
    const lines = unreadOf(BUS, employee);
    for (const { nudge } of lines) {
      if (nudge !== null) {
        unread.set(nudge, [...new Set([...(unread.get(nudge) ?? []), employee])]);
      }
    }
  }
  return {
    schedule,
    since: typeof clock?.since === "number" ? clock.since : null,
    sent,
    unread,
    now,
  };
}

/* -------------------------------------------------------------------------- */

/** @typedef {"board" | "company" | "feed"} Section */

/** @type {readonly Section[]} */
const SECTIONS = ["board", "company", "feed"];

/**
 * @param {string | undefined} arg
 * @returns {Section}
 */
function sectionOf(arg) {
  const found = SECTIONS.find((section) => section === arg);
  if (arg !== undefined && found === undefined) {
    throw new Error(`dashboard: unknown section ${arg}; one of ${SECTIONS.join(", ")}`);
  }
  return found ?? "board";
}

/** @returns {import("./dashboard-view.mjs").Budget | null} */
/**
 * hubd's health, from its heartbeat and its runner's restarts: local files,
 * never a GitHub call (#23).
 *
 * @returns {ReturnType<typeof hubHealth>}
 */
function hub() {
  /** @param {string} name */
  const read = (name) => {
    try {
      return fs.readFileSync(path.join(HUB, name), "utf8");
    } catch {
      return "";
    }
  };
  return hubHealth(
    parseAlive(read("hubd.alive")),
    parseRestarts(read("hubd.restarts")),
    Date.now(),
  );
}

/**
 * The Telegram sidecar (#583): down if no `link.mjs serve` runs, or if
 * its heartbeat is too old, which is a hung one.
 *
 * @returns {import("./dashboard-view.mjs").TelegramFacts}
 */
function telegram() {
  const now = Date.now();
  const record = readSidecar(BUS);
  const running = spawnSync("pgrep", ["-f", "link.mjs serve"]).status === 0;
  return { down: !running || sidecarDown(now, record), lastSeen: record?.lastSeen ?? null, now };
}

/**
 * Each agent's Claude config dir is `<boxes>/<role>/config`, and its logs
 * are under that; `claude-llc` says where `<boxes>` is (#50).
 */
const usage =
  process.env.VIBEWARS_CLAUDE_BOXES === undefined
    ? null
    : createUsageReader(process.env.VIBEWARS_CLAUDE_BOXES, ROLES);

/**
 * Tokens per role over the last 5 hours, and today's output (#50): read
 * from the agents' own logs, never an API.
 *
 * @returns {import("./dashboard-view.mjs").ClaudeUsage | null}
 */
function claude() {
  const now = Date.now();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const dayStart = midnight.getTime();
  const read = usage?.read(Math.min(dayStart, now - WINDOW_MS), now) ?? null;
  if (read === null) {
    return null;
  }
  return {
    summary: summarize(read.records, { now, windowMs: WINDOW_MS, dayStart }),
    capped: read.capped,
    now,
  };
}

function budget() {
  const raw = hubFile("ratelimit.json");
  if (
    raw === null ||
    typeof raw.remaining !== "number" ||
    typeof raw.limit !== "number" ||
    typeof raw.resetAt !== "number"
  ) {
    return null;
  }
  // Where it went, measured by hubd (#97).
  return {
    remaining: raw.remaining,
    limit: raw.limit,
    resetAt: raw.resetAt,
    spend: formatSpend(readSpend(raw.spend)),
  };
}

/**
 * @param {Section} section
 * @param {import("./dashboard-view.mjs").Pane} pane
 * @returns {string[]}
 */
function linesOf(section, pane) {
  switch (section) {
    case "board": {
      const cfg = company();
      const roles = new Set([...presence(staffFile()).live].map((id) => roleOf(id) ?? id));
      // hubd's copy of the board (hub-board.mjs); one in another shape is
      // hubd's to discard, and shows here as no snapshot.
      return boardLines(readBoardState(hubFile("board.json")), cfg?.columns ?? null, roles, pane);
    }
    case "company": {
      const staff = staffFile();
      const { live, stale } = presence(staff);
      const now = Date.now();
      return companyLines(
        {
          roles: ROLES,
          live,
          stale,
          staff:
            staff === null
              ? null
              : {
                  staff,
                  maxAgents: company()?.maxAgents ?? null,
                  managerRestarts: managerRestarts(now),
                  now,
                },
          budget: budget(),
          hub: hub(),
          reboot: reboot(live),
          claude: claude(),
          nudges: nudges(staff, now),
          telegram: telegram(),
        },
        pane,
      );
    }
    case "feed":
      return feedLines(feed(pane.rows), pane);
  }
}

/**
 * One whole screen, drawn from the top. No newline after the last line:
 * on the bottom row it would scroll the pane by one.
 *
 * @param {Section} section
 */
function render(section) {
  // Not a TTY, as when piped: an ordinary terminal's size.
  const pane = { rows: process.stdout.rows || 24, width: process.stdout.columns || 80 };
  let lines;
  try {
    lines = linesOf(section, pane);
  } catch (error) {
    // A broken section shows in its own pane and leaves the others alone.
    lines = [
      `dashboard: ${error instanceof Error ? error.message : "failed"}`.slice(0, pane.width),
    ];
  }
  process.stdout.write(`\u001B[H\u001B[2J${lines.join("\n")}`);
}

const section = sectionOf(process.argv[2]);
/** @type {() => void} */
let wake = () => undefined;
// A resized pane redraws at once, at its new size, rather than wrapping
// until the next refresh.
process.on("SIGWINCH", () => {
  wake();
});
for (;;) {
  render(section);
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, REFRESH_MS);
    wake = () => {
      clearTimeout(timer);
      resolve(undefined);
    };
  });
}
