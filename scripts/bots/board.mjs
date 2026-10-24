#!/usr/bin/env node
/**
 * `board` — the kanban board, from inside a sandbox.
 *
 * Moving a card on a Projects v2 board means a project node id, an item id, a
 * field id and a single-select option id, passed to `gh project item-edit`.
 * That is a GraphQL shape no agent should have to hold in its head on every
 * hand-off, and an agent that finds it awkward will quietly stop updating the
 * board — which breaks the one thing every other role polls to find its work.
 *
 * The project, field and option ids never change, so `claude-llc-init`
 * records them and they arrive here in `VIBEWARS_BOARD`. Only the item id is
 * looked up, from the board snapshot hubd already holds, which makes a move
 * one GraphQL mutation (issue #17).
 *
 * So: `board move 14 "In Review"`.
 *
 * Everything goes through `hub`, so the role's permissions still apply and
 * there is no credential in here.
 *
 *   board ls [column]      what is on the board
 *   board show <issue>     which column one issue is in
 *   board move <issue> <column>
 *   board columns          the valid column names
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

import { parseBoardIds } from "./hub-budget.mjs";

const COLUMNS = ["Backlog", "Ready", "In Progress", "In Review", "QA", "Done"];

/**
 * @param {string[]} args
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function hub(args) {
  // No maxBuffer: the default 1 MiB is about 200 cards with their bodies, and
  // past it spawnSync fails instead of returning the board.
  const result = spawnSync("hub", args, { encoding: "utf8", maxBuffer: Infinity });
  return {
    code: result.status ?? 1,
    // Typed as string because `encoding` is set, but absent if the process
    // could not be spawned at all.
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

/**
 * @param {string[]} args
 * @returns {unknown}
 */
function hubJson(args) {
  const result = hub(args);
  if (result.code !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.code);
  }
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(result.stdout);
    return parsed;
  } catch {
    process.stderr.write(`board: could not parse the answer to "${args.join(" ")}"\n`);
    process.exit(1);
  }
}

/**
 * `String(x)` on an unknown that happens to be an object gives
 * "[object Object]", which would silently become an item id. Narrow instead.
 *
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
function str(value, fallback = "") {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
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

const PROJECT = process.env.VIBEWARS_PROJECT ?? "2";

/**
 * @returns {{ projectId: string, fieldId: string, options: Map<string, string> }}
 */
function statusField() {
  const ids = parseBoardIds(process.env.VIBEWARS_BOARD);
  if (ids === null) {
    process.stderr.write(
      "board: this sandbox has no board ids. Ask the operator to re-run " +
        "claude-llc-init, which records them, and restart the company.\n",
    );
    process.exit(1);
  }
  return ids;
}

/**
 * @returns {{ number: number, title: string, status: string, id: string }[]}
 */
function items() {
  const data = obj(
    hubJson(["project", "item-list", PROJECT, "--format", "json", "--limit", "200"]),
  );
  const rows = Array.isArray(data.items) ? data.items : [];
  return rows.map((raw) => {
    const item = obj(raw);
    const content = obj(item.content);
    return {
      id: str(item.id),
      number: typeof content.number === "number" ? content.number : 0,
      title: str(content.title, str(item.title)),
      status: str(item.status),
    };
  });
}

/* -------------------------------------------------------------------------- */

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "columns":
    for (const column of COLUMNS) {
      console.log(column);
    }
    break;

  case "ls": {
    const wanted = rest.join(" ").trim();
    const all = items();
    const shown = wanted === "" ? all : all.filter((item) => item.status === wanted);
    if (shown.length === 0) {
      console.log(wanted === "" ? "(board is empty)" : `(nothing in ${wanted})`);
      break;
    }
    // Grouped by column in workflow order, so the output reads like the board
    // rather than like a database dump.
    for (const column of COLUMNS) {
      const group = shown.filter((item) => item.status === column);
      if (group.length === 0) {
        continue;
      }
      console.log(`${column}:`);
      for (const item of group) {
        console.log(`  #${String(item.number).padEnd(4)} ${item.title}`);
      }
    }
    const loose = shown.filter((item) => !COLUMNS.includes(item.status));
    if (loose.length > 0) {
      console.log("(no column):");
      for (const item of loose) {
        console.log(`  #${String(item.number).padEnd(4)} ${item.title}`);
      }
    }
    break;
  }

  case "show": {
    const issue = Number(rest[0]);
    const found = items().find((item) => item.number === issue);
    console.log(
      found === undefined
        ? `#${String(issue)} is not on the board`
        : `#${String(issue)} ${found.status || "(no column)"} — ${found.title}`,
    );
    break;
  }

  case "move": {
    const issue = Number(rest[0]);
    const column = rest.slice(1).join(" ").trim();
    if (!Number.isFinite(issue) || column === "") {
      console.error('board: usage: board move <issue> "<column>"');
      process.exit(2);
    }
    if (!COLUMNS.includes(column)) {
      console.error(`board: "${column}" is not a column. Valid: ${COLUMNS.join(", ")}`);
      process.exit(2);
    }

    const found = items().find((item) => item.number === issue);
    if (found === undefined) {
      console.error(`board: #${String(issue)} is not on the board. Ask the manager to add it.`);
      process.exit(1);
    }
    const { projectId, fieldId, options } = statusField();
    const optionId = options.get(column);
    if (optionId === undefined) {
      console.error(`board: the board has no "${column}" option; run claude-llc-init`);
      process.exit(1);
    }

    const result = hub([
      "project",
      "item-edit",
      "--id",
      found.id,
      "--project-id",
      projectId,
      "--field-id",
      fieldId,
      "--single-select-option-id",
      optionId,
    ]);
    if (result.code !== 0) {
      process.stderr.write(result.stderr);
      process.exit(result.code);
    }
    console.log(`#${String(issue)}: ${found.status || "(no column)"} -> ${column}`);
    break;
  }

  default:
    console.error("board: usage: board <ls|show|move|columns> ...");
    process.exit(2);
}
