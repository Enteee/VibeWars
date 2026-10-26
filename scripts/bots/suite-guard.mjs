#!/usr/bin/env node
/**
 * The suite guard (#737): a PreToolUse hook on Bash that refuses a local
 * run of what CI runs (ci-is-truth, #35). The jail's settings.json points
 * at it; it reads the hook's JSON on stdin and the role from
 * VIBEWARS_BOT_ROLE.
 *
 * - cicd-engineer: unrestricted, it owns the pipeline.
 * - qa-tester: selected specs and files only; an unfiltered run is refused.
 * - every other role: no suite at all. `vitest run <one file>` stays.
 *
 * Not a security boundary: `node …/cli.js test` gets past it. It stops the
 * habit. Anything it cannot read, or an unknown role, is allowed: wrong
 * data is no reason to block a whole jail.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ROLES } from "./hub-policy.mjs";

export const DENY_REASON =
  "CI runs this for you (ci-is-truth, #35). Push and `hub watch ci <pr>`. " +
  "Allowed: `pnpm dev`, typecheck, lint, format, `vitest run <one file>`.";

/** package.json scripts that are a suite: `test` is `vitest run`, the rest wrap it or e2e. */
const SUITE_SCRIPTS = new Set(["ci", "ci:full", "test", "test:e2e"]);

/** Run before the command they wrap; their own arguments are skipped. */
const WRAPPERS = new Set(["timeout", "nice", "env", "command", "exec", "time", "nohup"]);

/** Shell reserved words that can stand before a command: `for …; do pnpm run ci; done`. */
const KEYWORDS = new Set(["do", "then", "else", "elif", "while", "until", "if", "!", "{"]);

/** pnpm and npm options that take a value, so the value is not the command. */
const PACKAGE_VALUE_OPTIONS = new Set(["-C", "--dir", "--filter", "-F", "--prefix"]);

/** Playwright options that take a value, so the value is not a spec filter. */
const PLAYWRIGHT_VALUE_OPTIONS = new Set([
  "-c",
  "--config",
  "-g",
  "--grep",
  "-G",
  "--grep-invert",
  "-j",
  "--workers",
  "--project",
  "--reporter",
  "--repeat-each",
  "--retries",
  "--timeout",
  "--shard",
  "--output",
  "--max-failures",
]);

/** vitest options that take a value, so the value is not a file filter. */
const VITEST_VALUE_OPTIONS = new Set([
  "-c",
  "--config",
  "-t",
  "--testNamePattern",
  "--project",
  "--reporter",
  "--root",
  "--dir",
  "--pool",
]);

/**
 * The simple commands in a shell line: heredoc bodies dropped, each quoted
 * string one word `Q` (a commit message that names `pnpm run ci` runs
 * nothing), then split on `&&`, `||`, `;`, `|`, `&`, newlines and the
 * parentheses and backticks of subshells. Good enough for the habit, not a
 * parser.
 *
 * @param {string} line
 * @returns {string[][]}
 */
function simpleCommands(line) {
  return line
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, "")
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, " Q ")
    .split(/&&|\|\||[;|&\n()`]|\$\(/)
    .map((part) => part.split(/\s+/).filter((word) => word !== ""))
    .filter((words) => words.length > 0);
}

/**
 * Drops `FOO=bar` assignments and wrappers like `timeout 590`, so what is
 * left starts with the command that runs.
 *
 * @param {string[]} words
 * @returns {string[]}
 */
function unwrap(words) {
  let rest = words;
  for (;;) {
    const [first, ...tail] = rest;
    if (first === undefined) {
      return rest;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first) || KEYWORDS.has(first)) {
      rest = tail;
    } else if (WRAPPERS.has(path.basename(first))) {
      // A wrapper's options, and timeout's duration, before the command.
      let i = 0;
      while (i < tail.length && (tail[i]?.startsWith("-") || /^\d/.test(tail[i] ?? ""))) {
        i += 1;
      }
      rest = tail.slice(i);
    } else {
      return rest;
    }
  }
}

/**
 * Whether any word after the first is a positional argument, not an
 * option or an option's value.
 *
 * @param {string[]} args
 * @param {Set<string>} valueOptions
 * @returns {boolean}
 */
function hasPositional(args, valueOptions) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--") {
      continue;
    }
    if (arg.startsWith("-")) {
      if (valueOptions.has(arg)) {
        i += 1;
      }
      continue;
    }
    return true;
  }
  return false;
}

/**
 * What one simple command runs, if it is a suite.
 *
 * @param {string[]} words
 * @returns {{ filtered: boolean } | undefined}
 */
function suiteRun(words) {
  let rest = unwrap(words);
  const head = path.basename(rest[0] ?? "");
  if (head === "npx") {
    return suiteRun(rest.slice(1).filter((word) => word !== "--yes" && word !== "-y"));
  }
  if (head === "pnpm" || head === "npm") {
    rest = rest.slice(1);
    while (rest[0]?.startsWith("-")) {
      rest = rest.slice(PACKAGE_VALUE_OPTIONS.has(rest[0]) ? 2 : 1);
    }
    const [sub, ...args] = rest;
    if (sub === "exec" || sub === "dlx" || sub === "x") {
      return suiteRun(args);
    }
    const script = sub === "run" || sub === "run-script" ? args[0] : sub;
    const scriptArgs = sub === "run" || sub === "run-script" ? args.slice(1) : args;
    if (script !== undefined && SUITE_SCRIPTS.has(script)) {
      // `pnpm run test:e2e -- e2e/x.spec.ts` selects, `pnpm run ci` never does.
      const selects = script === "test" || script === "test:e2e";
      const values = script === "test" ? VITEST_VALUE_OPTIONS : PLAYWRIGHT_VALUE_OPTIONS;
      return { filtered: selects && hasPositional(scriptArgs, values) };
    }
    // pnpm runs a binary it does not know as a command: `pnpm vitest run`.
    return head === "pnpm" && sub !== undefined ? suiteRun(rest) : undefined;
  }
  if (head === "playwright" && rest[1] === "test") {
    return { filtered: hasPositional(rest.slice(2), PLAYWRIGHT_VALUE_OPTIONS) };
  }
  if (head === "vitest") {
    // `vitest` alone watches every file; `vitest run`, `vitest related` too.
    const args = ["run", "watch", "dev", "related"].includes(rest[1] ?? "")
      ? rest.slice(2)
      : rest.slice(1);
    return { filtered: hasPositional(args, VITEST_VALUE_OPTIONS) };
  }
  return undefined;
}

/**
 * The decision for one Bash command line.
 *
 * @param {string} command
 * @param {string | undefined} role
 * @returns {"allow" | "deny"}
 */
export function suiteGuard(command, role) {
  if (role === undefined || role === "cicd-engineer" || !ROLES.includes(role)) {
    return "allow";
  }
  for (const words of simpleCommands(command)) {
    const run = suiteRun(words);
    if (run === undefined) {
      continue;
    }
    // A developer may still run the one vitest file it edits.
    const oneFile = run.filtered && !isE2e(words);
    if (role === "qa-tester" ? !run.filtered : !oneFile) {
      return "deny";
    }
  }
  return "allow";
}

/**
 * @param {string[]} words
 * @returns {boolean}
 */
function isE2e(words) {
  return words.some((word) => path.basename(word) === "playwright" || word === "test:e2e");
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const role = process.env.VIBEWARS_BOT_ROLE;
  if (role === undefined || !ROLES.includes(role)) {
    console.error(`suite-guard: unknown role ${JSON.stringify(role ?? "")}, allowing`);
  }
  /** @type {unknown} */
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    input = undefined;
  }
  const command =
    typeof input === "object" &&
    input !== null &&
    "tool_input" in input &&
    typeof input.tool_input === "object" &&
    input.tool_input !== null &&
    "command" in input.tool_input &&
    typeof input.tool_input.command === "string"
      ? input.tool_input.command
      : undefined;
  if (command !== undefined && suiteGuard(command, role) === "deny") {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: DENY_REASON,
        },
      })}\n`,
    );
  }
}
