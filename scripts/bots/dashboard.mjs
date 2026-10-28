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
import { fileURLToPath } from "node:url";

import { buildLine, head, manifest, readManifest } from "./fingerprint.mjs";
import { readBoardState } from "./hub-board.mjs";
import { ROLES } from "./hub-policy.mjs";
import { readSpend } from "./hub-spend.mjs";
import { betweenTurns, parseReboot } from "./reboot.mjs";
import { ownNudges, parseOwnSchedules, parseSchedule } from "./schedule.mjs";
import { readSidecar, sidecarDown } from "./sidecar.mjs";
import { unreadOf } from "./unread.mjs";
import {
  readLimit,
  readPresence,
  readStaffFile,
  readUsage,
  usageReader,
} from "./company-facts.mjs";
import { boardScreenLines, companyLines, feedLines, groupFeed } from "./dashboard-view.mjs";
import { HUBD_ALIVE, hubHealth, parseAlive, parseRestarts } from "./hub-health.mjs";
import { roleOf } from "./staff.mjs";

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

/**
 * The build this dashboard runs, which is the company's (claude-llc starts
 * it from the same store copy), against the checkout (#557). `null` when it
 * runs from the checkout itself, which has no build manifest.
 *
 * @returns {import("./dashboard-view.mjs").CompanyFacts["build"]}
 */
function build() {
  /** @type {import("./fingerprint.mjs").Manifest} */
  let built;
  try {
    built = readManifest(path.dirname(fileURLToPath(import.meta.url)));
  } catch {
    return null;
  }
  const repo = process.env.DEVENV_ROOT ?? path.dirname(ROOT);
  return buildLine({ build: built, checkout: manifest(repo), head: head(repo) });
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
  /** hubd writes `schedules.json`; one that is not readable shows no own schedules. */
  const own = () => {
    try {
      return parseOwnSchedules(fs.readFileSync(path.join(HUB, "schedules.json"), "utf8"));
    } catch {
      return [];
    }
  };
  /** @type {import("./dashboard-view.mjs").NudgeFacts["schedule"]} */
  let schedule;
  try {
    schedule = [
      // The checkout's copy, as hubd reads it: the staged scripts (nix store)
      // hold only the .mjs files, so nothing sits beside this one.
      ...parseSchedule(
        fs.readFileSync(
          path.join(
            process.env.DEVENV_ROOT ?? path.dirname(ROOT),
            "scripts",
            "bots",
            "schedule.json",
          ),
          "utf8",
        ),
      ),
      ...ownNudges(own()),
    ];
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
  return hubHealth(parseAlive(read(HUBD_ALIVE)), parseRestarts(read("hubd.restarts")), Date.now());
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
 * `ratelimit.json` as hubd wrote it, or null; the view formats it (#963).
 *
 * @returns {import("./dashboard-view.mjs").GithubBudget | null}
 */
function budget() {
  const raw = hubFile("ratelimit.json");
  if (
    raw === null ||
    typeof raw.remaining !== "number" ||
    typeof raw.limit !== "number" ||
    typeof raw.resetAt !== "number" ||
    typeof raw.checkedAt !== "number"
  ) {
    return null;
  }
  // Where it went, measured by hubd (#97).
  return {
    remaining: raw.remaining,
    limit: raw.limit,
    resetAt: raw.resetAt,
    checkedAt: raw.checkedAt,
    spend: readSpend(raw.spend),
    now: Date.now(),
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
      const now = Date.now();
      const cfg = company();
      const staff = readStaffFile(ROOT);
      const roles = new Set([...readPresence(ROOT, staff, now).live].map((id) => roleOf(id) ?? id));
      // hubd's copy of the board (hub-board.mjs); one in another shape is
      // hubd's to discard, and shows here as no snapshot.
      return boardScreenLines(
        readBoardState(hubFile("board.json")),
        cfg?.columns ?? null,
        roles,
        nudges(staff, now),
        pane,
      );
    }
    case "company": {
      const now = Date.now();
      const staff = readStaffFile(ROOT);
      const { live, stale } = readPresence(ROOT, staff, now);
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
          build: build(),
          claude: readUsage(usage, now, readLimit(ROOT, staff, now)),
          telegram: telegram(),
          kpi: { file: hubFile("kpis.json"), now },
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

/** The agents' Claude logs, read as they grow (#50). */
const usage = usageReader(process.env.VIBEWARS_CLAUDE_BOXES);

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
