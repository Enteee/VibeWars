#!/usr/bin/env node
/**
 * The company dashboard: one window that answers "what is happening".
 *
 * Runs on the host, outside every jail, so it can read the board, the roster
 * and every role's inbox at once — which no single agent can do.
 *
 * It also states plainly which roles are not hired yet and what that blocks.
 * The company is designed to run on a partial roster, but a pipeline that
 * silently stops at `In Review` because there is no reviewer looks identical
 * to a pipeline where everyone is just slow, and the difference matters.
 *
 * The dashboard window is three tmux panes, each running this with its
 * section: `board`, `company` or `feed` (#165). No argument is `board`,
 * which is also what running `claude-llc-dash` by hand shows. What each
 * pane says is `dashboard-view.mjs`; this file reads and draws.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { readBoardState } from "./hub-board.mjs";
import { ROLES } from "./hub-policy.mjs";
import { formatSpend, readSpend } from "./hub-spend.mjs";
import { boardLines, companyLines, feedLines, groupFeed } from "./dashboard-view.mjs";
import { hubHealth, parseAlive, parseRestarts } from "./hub-health.mjs";

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

/** @returns {{ project: number, owner: string, columns: string[] } | null} */
function company() {
  try {
    /** @type {unknown} */
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "company.json"), "utf8"));
    const cfg = obj(raw);
    return {
      project: typeof cfg.project === "number" ? cfg.project : 0,
      owner: typeof cfg.owner === "string" ? cfg.owner : "",
      columns: Array.isArray(cfg.columns) ? cfg.columns.map(String) : [],
    };
  } catch {
    return null;
  }
}

/** @returns {Set<string>} */
function hired() {
  /** @type {Set<string>} */
  const live = new Set();
  try {
    for (const name of fs.readdirSync(path.join(BUS, "roster"))) {
      if (!name.endsWith(".json")) {
        continue;
      }
      live.add(name.replace(/\.json$/, ""));
    }
  } catch {
    /* no roster yet */
  }
  return live;
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
      // hubd's copy of the board (hub-board.mjs); one in another shape is
      // hubd's to discard, and shows here as no snapshot.
      return boardLines(readBoardState(hubFile("board.json")), cfg?.columns ?? null, hired(), pane);
    }
    case "company":
      return companyLines({ roles: ROLES, live: hired(), budget: budget(), hub: hub() }, pane);
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
