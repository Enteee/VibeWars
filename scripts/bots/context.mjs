/**
 * The context ceiling, said by every `tg`, `board` and `hub` command (#1695).
 *
 * agent-turn.mjs writes the context of the agent's last call to
 * `<bus>/<employee>/context.json` (#321). `tg wait` used to be the only
 * reader, and only when nothing arrived: a busy agent, or one that never
 * waits, ran far past the ceiling. Every command now says it on stderr
 * after its output, so stdout stays what scripts parse.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/** How far under the ceiling a card is too big to start (#1695). */
export const NEAR_MARGIN = 20_000;

/**
 * Set by `board` on the `hub` it runs, so the line is said once, by
 * `board`, not by both.
 */
export const QUIET_ENV = "VIBEWARS_CONTEXT_QUIET";

/**
 * @typedef {{ tokens: number, ceiling: number }} ContextState
 */

/**
 * This agent's context file, from the sandbox's bus; `null` outside one.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function contextFile(env = process.env) {
  const bus = env.VIBEWARS_BOT_BUS;
  const employee = env.VIBEWARS_BOT_EMPLOYEE;
  return bus === undefined || employee === undefined
    ? null
    : path.join(bus, employee, "context.json");
}

/**
 * The context of the agent's last call and its ceiling. A missing,
 * unreadable or malformed file means no ceiling: `null`.
 *
 * @param {string | null} file
 * @returns {ContextState | null}
 */
export function contextState(file) {
  if (file === null) {
    return null;
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const { tokens, ceiling } = /** @type {Record<string, unknown>} */ (parsed);
  return typeof tokens === "number" && typeof ceiling === "number" ? { tokens, ceiling } : null;
}

/**
 * @param {ContextState | null} state
 * @returns {boolean}
 */
export function isOver(state) {
  return state !== null && state.tokens >= state.ceiling;
}

/**
 * @param {ContextState | null} state
 * @returns {boolean}
 */
export function isNear(state) {
  return state !== null && state.tokens >= state.ceiling - NEAR_MARGIN;
}

/**
 * @param {number} tokens
 * @returns {string}
 */
export function kilo(tokens) {
  return `${String(Math.round(tokens / 1000))}k`;
}

/**
 * The line every command says past the ceiling; `null` under it.
 *
 * @param {ContextState | null} state
 * @returns {string | null}
 */
export function overLine(state) {
  return state !== null && isOver(state)
    ? `context ${kilo(state.tokens)} of ${kilo(state.ceiling)}: finish this step, commit and push, then end your turn.`
    : null;
}

/**
 * The advice on starting a card near the ceiling; `null` with room to.
 *
 * @param {ContextState | null} state
 * @returns {string | null}
 */
export function startLine(state) {
  return state !== null && isNear(state)
    ? `context ${kilo(state.tokens)} of ${kilo(state.ceiling)}: too little room to start a card; end your turn and start it fresh.`
    : null;
}

/**
 * Whether a `gh` command line is a `taking #N` comment: the claim that
 * starts a card (_protocol.md).
 *
 * @param {readonly string[]} argv a gh command line, without `gh`
 * @returns {boolean}
 */
export function isTakingComment(argv) {
  if (argv[0] !== "issue" || argv[1] !== "comment") {
    return false;
  }
  for (let i = 2; i < argv.length; i += 1) {
    const word = argv[i] ?? "";
    const body =
      word === "--body" || word === "-b"
        ? argv[i + 1]
        : word.startsWith("--body=")
          ? word.slice("--body=".length)
          : undefined;
    if (body !== undefined && /^\s*taking #\d+/i.test(body)) {
      return true;
    }
  }
  return false;
}

/**
 * Say `lines`' non-null entries on stderr when the process exits, after
 * whatever it printed, by any of its exits. Nothing under `QUIET_ENV`.
 *
 * @param {() => (string | null)[]} lines read at exit, so a command can
 *   decide late whether it starts a card
 * @returns {void}
 */
export function sayAtExit(lines) {
  if (process.env[QUIET_ENV] === "1") {
    return;
  }
  process.on("exit", () => {
    for (const line of lines()) {
      if (line !== null) {
        // Synchronous: an exit handler's asynchronous writes are lost.
        fs.writeSync(2, `${line}\n`);
      }
    }
  });
}
