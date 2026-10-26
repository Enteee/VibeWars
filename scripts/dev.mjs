#!/usr/bin/env node
/**
 * `pnpm run dev` — the whole game, reloading as you edit.
 *
 * Three watchers, because the client and the server want different kinds
 * of reload:
 *
 *   1. tsc --build --watch   rebuilds packages/ and apps/server on change
 *   2. node --watch          restarts the game server when its dist changes
 *   3. vite                  serves the client, reloading it on save
 *
 * The client reloads the page on save rather than hot-patching modules:
 * nothing in it declares an `import.meta.hot` boundary, so Vite falls
 * back to a full refresh. That is the honest description — it is not
 * state-preserving HMR, and since the authoritative state lives on the
 * server a refreshed client just reconnects to the match anyway.
 *
 * Editing the *server* restarts it, which does end any match in progress.
 * Unavoidable: the simulation is the process.
 *
 * A plain script rather than a `concurrently` dependency: it is short, it
 * gives prefixed interleaved output, and it guarantees that killing this
 * process kills all three children rather than orphaning them.
 *
 * Typed with JSDoc because `scripts/` is linted with the same type-aware
 * rules as the rest of the repo, and ADR-0008 bans `any`.
 */
import { spawn } from "node:child_process";
import process from "node:process";
// Imported explicitly rather than relied on as a global: this file is a
// plain .mjs, where the lint config does not assume Node globals exist.
import { setTimeout } from "node:timers";

const SERVER_PORT = process.env.PORT ?? "2567";
const CLIENT_PORT = process.env.VIBEWARS_CLIENT_PORT ?? "5173";

/** @type {Record<string, string>} */
const COLOURS = { tsc: "[36m", server: "[32m", client: "[35m" };
const RESET = "[0m";

/**
 * Prefix every line so three interleaved streams stay readable.
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
  `\nvibewars dev\n` +
    `  client  http://localhost:${CLIENT_PORT}   (reloads on save)\n` +
    `  server  ws://localhost:${SERVER_PORT}     (restarts on change)\n\n`,
);

// Only the server's project graph: that transitively builds game-core,
// game-protocol and game-maps. Building apps/web here too would emit a
// second copy of the client that Vite does not use.
//
// `--preserveWatchOutput` stops tsc clearing the screen on every rebuild,
// which would wipe the other two streams' output.
start("tsc", "pnpm", [
  "exec",
  "tsc",
  "--build",
  "apps/server/tsconfig.build.json",
  "--watch",
  "--preserveWatchOutput",
]);

start("server", "node", ["--watch", "apps/server/dist/main.js"], {
  PORT: SERVER_PORT,
  HOST: "127.0.0.1",
  VIBEWARS_DEV: "1",
  VIBEWARS_DEV_ORIGIN: `http://localhost:${CLIENT_PORT}`,
  // The server must not also serve a stale built client: in dev that is
  // Vite's job, and serving both is how you end up debugging a bundle
  // from an hour ago.
  VIBEWARS_WEB_ROOT: "none",
});

// The client plays peer to peer (#403); it never talks to the server.
start("client", "pnpm", ["--filter", "@vibewars/web", "exec", "vite", "--port", CLIENT_PORT]);
