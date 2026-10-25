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
 * looked up, from hubd's copy of the board, which makes a move one GraphQL
 * mutation (issue #17).
 *
 * Reads are answered by hubd from that copy, column by column or card by
 * card, so neither the whole board nor a GitHub call comes back for a look
 * at one column (hub-board.mjs).
 *
 *   board ls [column]           what is on the board
 *   board show <issue> [--fresh]
 *                               which column one issue is in; --fresh asks
 *                               GitHub, for a card someone moved by hand
 *   board move <issue> <column>
 *   board wait <column> [--timeout N]
 *                               block until a card arrives in the column
 *   board changes [--since <token>]
 *                               what changed since a token `ls` printed
 *   board columns               the valid column names
 *
 * Everything goes through `hub`, so the role's permissions still apply and
 * there is no credential in here.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { COLUMNS, arrivals, boardLines } from "./hub-board.mjs";
import { parseBoardIds } from "./hub-budget.mjs";

/** How often `board wait` asks hubd. Free: hubd answers from its copy. */
const WAIT_POLL_MS = 15_000;

/**
 * @typedef {import("./hub-board.mjs").Summary} Summary
 */

/**
 * @param {string[]} args
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function hub(args) {
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
 * hubd's answer to `hub board <args>`.
 *
 * @param {string[]} args
 * @returns {Record<string, unknown>}
 */
function ask(args) {
  const result = hub(["board", ...args]);
  if (result.code !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.code);
  }
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(result.stdout);
    return typeof parsed === "object" && parsed !== null
      ? /** @type {Record<string, unknown>} */ (parsed)
      : {};
  } catch {
    process.stderr.write(`board: could not parse the answer to "board ${args.join(" ")}"\n`);
    process.exit(1);
  }
}

/**
 * @param {Record<string, unknown>} answer
 * @returns {Summary[]}
 */
function cardsOf(answer) {
  /** @type {unknown} */
  const cards = answer.cards;
  return Array.isArray(cards) ? /** @type {Summary[]} */ (cards) : [];
}

/**
 * @param {string} column
 */
function checkColumn(column) {
  if (!COLUMNS.includes(column)) {
    console.error(`board: "${column}" is not a column. Valid: ${COLUMNS.join(", ")}`);
    process.exit(2);
  }
}

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
    const shown = cardsOf(ask(["ls", ...(wanted === "" ? [] : [wanted])]));
    if (shown.length === 0) {
      console.log(wanted === "" ? "(board is empty)" : `(nothing in ${wanted})`);
      break;
    }
    console.log(boardLines(shown, wanted === "").join("\n"));
    break;
  }

  case "show": {
    const issue = Number(rest[0]);
    const card = /** @type {Summary | null} */ (ask(["show", ...rest]).card ?? null);
    console.log(
      card === null
        ? `#${String(issue)} is not on the board`
        : `#${String(issue)} ${card.status || "(no column)"} — ${card.title}`,
    );
    break;
  }

  case "move": {
    const issue = Number(rest[0]);
    const column = rest.slice(1).join(" ").trim();
    if (!Number.isInteger(issue) || column === "") {
      console.error('board: usage: board move <issue> "<column>"');
      process.exit(2);
    }
    checkColumn(column);

    const found = /** @type {Summary | null} */ (ask(["show", String(issue)]).card ?? null);
    if (found === null) {
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

  case "changes": {
    const answer = ask(["changes", ...rest]);
    const cards = cardsOf(answer);
    const removed = /** @type {{ number: number | null }[]} */ (
      Array.isArray(answer.removed) ? answer.removed : []
    );
    if (answer.reset === true && rest.length > 0) {
      console.log("(that token is too old; this is the whole board)");
    }
    boardLines(cards, false).forEach((text) => {
      console.log(text);
    });
    for (const { number } of removed) {
      console.log(`  #${String(number ?? "-").padEnd(4)} (off the board)`);
    }
    if (cards.length === 0 && removed.length === 0) {
      console.log("(no changes)");
    }
    console.log(`token: ${String(answer.token)}`);
    break;
  }

  case "wait": {
    const flag = rest.indexOf("--timeout");
    const raw = flag === -1 ? undefined : rest[flag + 1];
    const timeout = raw === undefined ? 900 : Number.parseInt(raw, 10);
    const column = (flag === -1 ? rest : rest.slice(0, flag)).join(" ").trim();
    if (!Number.isFinite(timeout) || timeout <= 0 || column === "") {
      console.error("board: usage: board wait <column> [--timeout <seconds>]");
      process.exit(2);
    }
    checkColumn(column);
    const deadline = Date.now() + timeout * 1000;
    const start = ask(["ls", column]);
    let token = String(start.token);
    let known = new Set(cardsOf(start).map((card) => card.id));
    for (;;) {
      if (Date.now() >= deadline) {
        console.log(`(nothing new in ${column} in ${String(timeout)}s)`);
        break;
      }
      await sleep(Math.min(WAIT_POLL_MS, Math.max(0, deadline - Date.now())));
      const changes = ask(["changes", "--since", token]);
      token = String(changes.token);
      const seen = arrivals(known, changes, column);
      known = seen.known;
      if (seen.arrived.length > 0) {
        console.log(boardLines(seen.arrived, false).join("\n"));
        break;
      }
    }
    break;
  }

  default:
    console.error("board: usage: board <ls|show|move|wait|changes|columns> ...");
    process.exit(2);
}
