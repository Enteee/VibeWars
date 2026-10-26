#!/usr/bin/env node
/**
 * `pnpm run dev` — the whole game, reloading as you edit.
 *
 * Two watchers. There is no server: the game plays peer to peer in the
 * browser (ADR-0022), so the client is the whole game.
 *
 *   1. tsc --build --watch   rebuilds packages/ on change
 *   2. vite                  serves the client, reloading it on save
 *
 * The client reloads the page on save rather than hot-patching modules:
 * nothing in it declares an `import.meta.hot` boundary, so Vite falls
 * back to a full refresh. That is the honest description — it is not
 * state-preserving HMR, and a refresh ends a match the page was hosting.
 *
 * A plain script rather than a `concurrently` dependency: it is short, it
 * gives prefixed interleaved output, and it guarantees that killing this
 * process kills both children rather than orphaning them.
 *
 * Typed with JSDoc because `scripts/` is linted with the same type-aware
 * rules as the rest of the repo, and ADR-0008 bans `any`.
 */
import { spawn } from "node:child_process";
import process from "node:process";
// Imported explicitly rather than relied on as a global: this file is a
// plain .mjs, where the lint config does not assume Node globals exist.
import { setTimeout } from "node:timers";

const CLIENT_PORT = process.env.VIBEWARS_CLIENT_PORT ?? "5173";

/** @type {Record<string, string>} */
const COLOURS = { tsc: "[36m", client: "[35m" };
const RESET = "[0m";

/**
 * Prefix every line so the interleaved streams stay readable.
 *
 * @param {string} name
 * @param {import("node:stream").Readable | null} stream
 * @returns {void}
 */
function pipe(name, stream) {
  if (stream === null) {
    return;
  }
  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (/** @type {string} */ chunk) => {
    buffered += chunk;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      process.stdout.write(`${COLOURS[name] ?? ""}[${name}]${RESET} ${line}\n`);
    }
  });
}

/** @type {import("node:child_process").ChildProcess[]} */
const children = [];
let shuttingDown = false;

/**
 * @param {number} [code]
 * @returns {void}
 */
function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  // Give them a moment to go quietly, then stop waiting.
  setTimeout(() => {
    for (const child of children) {
      child.kill("SIGKILL");
    }
    process.exit(code);
  }, 2000).unref();
}

/**
 * @param {string} name
 * @param {string} command
 * @param {readonly string[]} args
 * @param {Record<string, string>} [env]
 * @returns {void}
 */
function start(name, command, args, env = {}) {
  const child = spawn(command, [...args], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipe(name, child.stdout);
  pipe(name, child.stderr);
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    // One watcher dying means the dev environment is no longer what it
    // claims to be, so take the rest down instead of leaving a half-
    // working setup that looks fine.
    process.stdout.write(
      `${COLOURS[name] ?? ""}[${name}]${RESET} exited (${String(signal ?? code)}); stopping everything\n`,
    );
    shutdown(typeof code === "number" && code !== 0 ? code : 1);
  });
  children.push(child);
}

/** @type {const} */
const SIGNALS = ["SIGINT", "SIGTERM"];
for (const signal of SIGNALS) {
  process.on(signal, () => {
    shutdown(0);
  });
}

process.stdout.write(
  `\nvibewars dev\n` + `  client  http://localhost:${CLIENT_PORT}   (reloads on save)\n\n`,
);

// Only the packages: building apps/web here too would emit a second copy
// of the client that Vite does not use. game-session references
// game-core and game-protocol; game-maps and game-data stand alone.
//
// `--preserveWatchOutput` stops tsc clearing the screen on every rebuild,
// which would wipe the other stream's output.
start("tsc", "pnpm", [
  "exec",
  "tsc",
  "--build",
  "packages/game-session/tsconfig.build.json",
  "packages/game-maps/tsconfig.build.json",
  "packages/game-data/tsconfig.build.json",
  "--watch",
  "--preserveWatchOutput",
]);

start("client", "pnpm", ["--filter", "@vibewars/web", "exec", "vite", "--port", CLIENT_PORT]);
