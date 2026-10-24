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
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { ROLES } from "./hub-policy.mjs";
import { visible } from "./protocol.mjs";

const ROOT = process.env.VIBEWARS_BOT_ROOT ?? path.join(process.cwd(), ".bots");
const BUS = path.join(ROOT, "bus");
const HUB = path.join(ROOT, "hub");
const REFRESH_MS = 20_000;

/**
 * Which roles each column needs before work can leave it. Used to explain a
 * stalled board rather than to enforce anything.
 *
 * @type {Record<string, string[] | undefined>}
 */
const COLUMN_OWNERS = {
  Backlog: ["architect", "manager"],
  Ready: ["developer-1", "developer-2"],
  "In Progress": ["developer-1", "developer-2"],
  "In Review": ["lead-dev"],
  QA: ["perf-sec-qa", "qa-tester"],
};

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
 * @param {number} at epoch milliseconds
 * @returns {string}
 */
function hhmm(at) {
  const time = new Date(at);
  return `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
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
 * @returns {{ ts: number, to: string, from: string, text: string }[]}
 */
function feed(limit) {
  /** @type {{ ts: number, to: string, from: string, text: string }[]} */
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
          text: typeof record.text === "string" ? record.text : "",
        });
      } catch {
        /* skip */
      }
    }
  }
  return lines.sort((a, b) => a.ts - b.ts).slice(-limit);
}

/* -------------------------------------------------------------------------- */

function render() {
  const cfg = company();
  const live = hired();
  const absent = ROLES.filter((role) => !live.has(role));

  process.stdout.write("\u001B[2J\u001B[H");
  console.log("VibeWars — the company");
  console.log("=".repeat(72));
  console.log("");

  /* the board ------------------------------------------------------------- */
  if (cfg === null) {
    console.log("board: not set up yet — run claude-llc-init");
  } else {
    const snapshot = hubFile("board.json");
    /** @type {Record<string, { number: number, title: string }[]>} */
    const byColumn = {};
    const items = obj(snapshot?.board).items;
    for (const item of Array.isArray(items) ? items : []) {
      const row = obj(item);
      const content = obj(row.content);
      const column = typeof row.status === "string" && row.status !== "" ? row.status : "(none)";
      byColumn[column] ??= [];
      byColumn[column].push({
        number: typeof content.number === "number" ? content.number : 0,
        title: typeof content.title === "string" ? content.title : "",
      });
    }

    const at = snapshot?.at;
    // The snapshot is only refreshed when someone reads the board, so an old
    // one means a quiet company, not a broken dashboard.
    console.log(
      typeof at === "number"
        ? `BOARD  as of ${hhmm(at)}`
        : "BOARD  (no snapshot yet — hubd writes one on the first board read)",
    );
    let total = 0;
    for (const column of cfg.columns) {
      const cards = byColumn[column] ?? [];
      total += cards.length;
      const owners = COLUMN_OWNERS[column] ?? [];
      const blocked = owners.length > 0 && owners.every((role) => !live.has(role));
      const note = cards.length > 0 && blocked ? "  <- nobody hired to move this" : "";
      console.log(`  ${column.padEnd(13)} ${String(cards.length).padStart(3)}${note}`);
      for (const card of cards.slice(0, 3)) {
        console.log(`      #${String(card.number).padEnd(4)} ${card.title.slice(0, 48)}`);
      }
    }
    if (total === 0) {
      console.log("      (empty — tell the architect what you want built)");
    }
  }

  /* the GitHub budget ----------------------------------------------------- */
  const budget = hubFile("ratelimit.json");
  console.log("");
  if (
    budget === null ||
    typeof budget.remaining !== "number" ||
    typeof budget.limit !== "number" ||
    typeof budget.resetAt !== "number"
  ) {
    console.log("GITHUB  budget unknown (hubd has not checked yet)");
  } else {
    const empty = budget.remaining === 0;
    console.log(
      `GITHUB  GraphQL ${String(budget.remaining)}/${String(budget.limit)} left, ` +
        `resets ${hhmm(budget.resetAt)}${empty ? "  <- RATE-LIMITED, agents are waiting" : ""}`,
    );
  }

  /* the roster ------------------------------------------------------------ */
  console.log("");
  console.log(`ROSTER  ${String(live.size)}/${String(ROLES.length)} hired`);
  const columns = 3;
  for (let i = 0; i < ROLES.length; i += columns) {
    const row = ROLES.slice(i, i + columns)
      .map((role) => `${live.has(role) ? "+" : "-"} ${role.padEnd(16)}`)
      .join(" ");
    console.log(`  ${row}`);
  }
  if (absent.length > 0) {
    console.log("");
    console.log(`  not hired yet: ${absent.join(", ")}`);
    console.log("  (rate-limited? provision the rest later with: claude-bot <role>)");
  }

  /* the conversation ------------------------------------------------------ */
  console.log("");
  console.log("TELEGRAM");
  const recent = feed(12);
  if (recent.length === 0) {
    console.log("  (nothing said yet)");
  }
  for (const line of recent) {
    const when = line.ts === 0 ? "--:--" : new Date(line.ts).toISOString().slice(11, 16);
    // Agent-written text, printed into the operator's tmux; see `visible`.
    console.log(
      `  ${when} ${visible(line.from)} -> ${visible(line.to)}: ${visible(line.text).slice(0, 44)}`,
    );
  }

  console.log("");
  console.log("=".repeat(72));
  console.log("claude-llc stop  |  ctrl-b <n> to switch window  |  refreshes every 20s");
}

for (;;) {
  try {
    render();
  } catch (error) {
    console.error(`dashboard: ${error instanceof Error ? error.message : "failed"}`);
  }
  await sleep(REFRESH_MS);
}
