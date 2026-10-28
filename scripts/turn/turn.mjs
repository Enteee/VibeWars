#!/usr/bin/env node
/**
 * The TURN server's commands (#974). nix/turn.nix exposes each as its own
 * command: turn-user, turn-link, turn-check and turn-dash. `conf` writes the
 * server's config for processes.turn, and `pane` is one of turn-dash's panes.
 * See docs/development/turn.md.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { healthy, runChecks, serverPid } from "./check.mjs";
import { DEFAULT_BASE, inviteLink, turnUrls } from "./link.mjs";
import { filterLog, lastAllocations, tailLines } from "./log.mjs";
import { formatBytes, procIo, rate, scrape } from "./metrics.mjs";
import { files, readSettings, turnserverConf } from "./settings.mjs";
import { HEALTH_USER, allUsers, newPassword, removeUser, setUser, validName } from "./users.mjs";

const HELP = {
  user: `usage: turn-user add <name> [--base <url>]   add a friend; prints their password and invite link once
       turn-user remove <name>                  remove them; their live sessions run on until they end
       turn-user list                           every user`,
  link: `usage: turn-link <name> [--base <url>]
  Prints <name>'s invite link. The password is not stored, so this sets a new
  one: the user's old link stops working. --base is the game's page
  (default ${DEFAULT_BASE}).`,
  check: `usage: turn-check
  Checks the TURN server once: process, STUN binding, an authenticated
  allocation, the external IP and the TLS certificate. Exit 0 when healthy.`,
  dash: `usage: turn-dash [stop]
  The TURN dashboard, a tmux session on a server of its own
  (tmux -L vibewars-turn): stats, health, users and the log. Running it again
  attaches. 'stop' closes it; the TURN server keeps running.`,
};

const TMUX_SOCKET = "vibewars-turn";
const SESSION = "turn";

const COLOR = process.stdout.isTTY;
const GREEN = COLOR ? "\x1b[32m" : "";
const RED = COLOR ? "\x1b[31m" : "";
const DIM = COLOR ? "\x1b[2m" : "";
const RESET = COLOR ? "\x1b[0m" : "";

/** @param {string} text */
function fail(text) {
  process.stderr.write(`${text}\n`);
  process.exit(2);
}

/**
 * Splits `--base <url>` out of the arguments.
 *
 * @param {string[]} args
 * @returns {{ rest: string[], base: string }}
 */
function baseOption(args) {
  const at = args.indexOf("--base");
  if (at === -1) return { rest: args, base: DEFAULT_BASE };
  const base = args[at + 1];
  if (base === undefined) fail("--base needs a URL");
  return {
    rest: [...args.slice(0, at), ...args.slice(at + 2)],
    base: /** @type {string} */ (base),
  };
}

/**
 * @param {string | undefined} name
 * @returns {string}
 */
function friendName(name) {
  if (name === undefined || !validName(name)) {
    fail("a name is letters, digits, '.', '_' or '-', at most 64, starting with a letter or digit");
  }
  if (name === HEALTH_USER) fail(`${HEALTH_USER} is turn-check's own user`);
  return /** @type {string} */ (name);
}

/**
 * Sets a fresh password for `name` and prints it with the link.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string} name
 * @param {string} base
 */
function issue(s, name, base) {
  const urls = turnUrls(s);
  const password = newPassword();
  setUser(s, name, password);
  process.stdout.write(
    `user:     ${name}\npassword: ${password}\nlink:     ${inviteLink(base, { urls, username: name, credential: password })}\n` +
      "Shown once: it is not stored. turn-link sets a new one.\n",
  );
}

/** @param {string[]} args */
function user(args) {
  const s = readSettings(process.env);
  const { rest, base } = baseOption(args);
  const [verb, name] = rest;
  if (verb === "add") {
    const friend = friendName(name);
    if (allUsers(s).includes(friend))
      fail(`${friend} exists; turn-link ${friend} gives them a new link`);
    issue(s, friend, base);
  } else if (verb === "remove") {
    const friend = friendName(name);
    if (!allUsers(s).includes(friend)) fail(`no user ${friend}`);
    removeUser(s, friend);
    process.stdout.write(`removed ${friend}. A session they have open runs on until it ends.\n`);
  } else if (verb === "list") {
    for (const n of allUsers(s)) if (n !== HEALTH_USER) process.stdout.write(`${n}\n`);
  } else {
    fail(HELP.user);
  }
}

/** @param {string[]} args */
function link(args) {
  const s = readSettings(process.env);
  const { rest, base } = baseOption(args);
  const friend = friendName(rest[0]);
  if (!allUsers(s).includes(friend)) fail(`no user ${friend}; turn-user add ${friend}`);
  issue(s, friend, base);
}

/**
 * @param {import("./check.mjs").Check[]} checks
 * @returns {string}
 */
function formatChecks(checks) {
  return checks
    .map((c) => {
      const mark =
        c.status === "ok" ? `${GREEN}ok  ` : c.status === "fail" ? `${RED}FAIL` : `${DIM}skip`;
      return `${mark}${RESET} ${c.name.padEnd(16)} ${c.detail}`;
    })
    .join("\n");
}

async function check() {
  const checks = await runChecks(readSettings(process.env));
  process.stdout.write(`${formatChecks(checks)}\n`);
  process.exit(healthy(checks) ? 0 : 1);
}

/**
 * @param {string[]} args
 * @param {{ inherit?: boolean }} [opts]
 */
function tmux(args, opts = {}) {
  return spawnSync("tmux", ["-L", TMUX_SOCKET, ...args], {
    encoding: "utf8",
    stdio: opts.inherit === true ? "inherit" : "pipe",
  });
}

/** @param {string[]} args */
function dash(args) {
  if (args[0] === "stop") {
    tmux(["kill-server"]);
    return;
  }
  if (args.length > 0) fail(HELP.dash);
  const settings = process.env.VIBEWARS_TURN_SETTINGS ?? "";
  readSettings(process.env);
  if (tmux(["has-session", "-t", `=${SESSION}`]).status !== 0) {
    const self = fileURLToPath(import.meta.url);
    /** @param {string} pane */
    const cmd = (pane) => `exec '${process.execPath}' '${self}' pane ${pane}`;
    const env = [
      "-e",
      `VIBEWARS_TURN_SETTINGS=${settings}`,
      "-e",
      `PATH=${process.env.PATH ?? ""}`,
    ];
    // Stats takes the tall pane on the right: it prints about 16 lines, and
    // health only 6.
    tmux(["new-session", "-d", "-s", SESSION, "-x", "160", "-y", "45", ...env, cmd("health")]);
    tmux(["set-option", "-t", SESSION, "status-left", "[turn-dash] "]);
    tmux(["split-window", "-h", "-t", `${SESSION}:0.0`, ...env, cmd("stats")]);
    tmux(["split-window", "-v", "-t", `${SESSION}:0.0`, ...env, cmd("users")]);
    tmux(["split-window", "-v", "-f", "-l", "40%", "-t", `${SESSION}:0`, ...env, cmd("log")]);
  }
  if (process.stdout.isTTY) {
    tmux(["attach-session", "-t", `=${SESSION}`], { inherit: true });
  } else {
    process.stdout.write(`turn-dash is running: tmux -L ${TMUX_SOCKET} attach\n`);
  }
}

/** @param {string} text */
function paint(text) {
  process.stdout.write(`\x1b[2J\x1b[H${text}\n`);
}

/** @returns {string} */
function clock() {
  return new Date().toTimeString().slice(0, 8);
}

/**
 * One of turn-dash's panes, refreshed until the pane closes. A pane says
 * what is wrong; it does not exit.
 *
 * @param {string | undefined} which
 */
function pane(which) {
  const s = readSettings(process.env);
  /** @type {{ at: number, io: { rchar: number, wchar: number } | null, m: Map<string, number> | null } | null} */
  let last = null;

  const stats = async () => {
    const running = serverPid(s);
    const m = await scrape(s.prometheusPort);
    const io = running.pid === null ? null : procIo(running.pid);
    const at = Date.now();
    const secs = last === null ? 0 : (at - last.at) / 1000;
    /** @param {string} name */
    const per = (name) => rate(last?.m?.get(name), m?.get(name), secs);
    const inRate = rate(last?.io?.rchar, io?.rchar, secs);
    const outRate = rate(last?.io?.wchar, io?.wchar, secs);
    last = { at, io, m };
    /** @param {number | null} r */
    const bps = (r) => (r === null ? "…" : `${formatBytes(r)}/s`);
    /** @param {string} name */
    const total = (name) => m?.get(name) ?? 0;
    /** @param {number | null} r */
    const ps = (r) => (r === null ? "…" : `${r.toFixed(1)}/s`);
    const lines = [
      `TURN ${s.realm}  ${DIM}${clock()}${RESET}`,
      running.pid === null
        ? `${RED}turnserver ${running.why}${RESET}`
        : `turnserver pid ${String(running.pid)}`,
      "",
    ];
    if (m === null) {
      lines.push(`${RED}metrics: no answer on 127.0.0.1:${String(s.prometheusPort)}${RESET}`);
    } else {
      lines.push(
        `allocations now    ${String(total("turn_total_allocations"))}`,
        "",
        `throughput         ${io === null && running.pid !== null ? "n/a" : `in ${bps(inRate)}  out ${bps(outRate)}`}`,
        `${DIM}                   approx. (includes control traffic)${RESET}`,
        "",
        "finished sessions",
        `  client in        ${formatBytes(total("turn_total_traffic_rcvb"))}  ${String(total("turn_total_traffic_rcvp"))} pkts`,
        `  client out       ${formatBytes(total("turn_total_traffic_sentb"))}  ${String(total("turn_total_traffic_sentp"))} pkts`,
        `  peer in          ${formatBytes(total("turn_total_traffic_peer_rcvb"))}  ${String(total("turn_total_traffic_peer_rcvp"))} pkts`,
        `  peer out         ${formatBytes(total("turn_total_traffic_peer_sentb"))}  ${String(total("turn_total_traffic_peer_sentp"))} pkts`,
        "",
        `401 responses      ${ps(per("turn_unauthenticated_401_responses"))}  (total ${String(total("turn_unauthenticated_401_responses"))})`,
        `dropped packets    ${ps(per("turn_packet_dropped"))}  (total ${String(total("turn_packet_dropped"))})`,
      );
    }
    paint(lines.join("\n"));
  };

  const health = async () => {
    const checks = await runChecks(s);
    paint(`health  ${DIM}checked ${clock()}${RESET}\n\n${formatChecks(checks)}`);
  };

  const users = () => {
    let names;
    try {
      names = allUsers(s).filter((n) => n !== HEALTH_USER);
    } catch (e) {
      paint(`users\n\n${RED}${e instanceof Error ? e.message : String(e)}${RESET}`);
      return;
    }
    const seen = lastAllocations(tailLines(files(s).log));
    const rows = names.map(
      (n) => `${n.padEnd(24)} ${seen.get(n) ?? `${DIM}no allocation in the log${RESET}`}`,
    );
    paint(
      `users  ${DIM}last allocation${RESET}\n\n${rows.length === 0 ? "none: turn-user add <name>" : rows.join("\n")}`,
    );
  };

  const log = () => {
    const rows = Math.max(5, (process.stdout.rows || 20) - 2);
    const lines = filterLog(tailLines(files(s).log, 256 * 1024)).slice(-rows);
    const width = Math.max(40, process.stdout.columns || 160);
    paint(
      lines.length === 0
        ? `log  ${DIM}${files(s).log}: nothing yet${RESET}`
        : lines.map((l) => (l.length > width ? `${l.slice(0, width - 1)}…` : l)).join("\n"),
    );
  };

  /** @type {Record<string, [() => void | Promise<void>, number]>} */
  const panes = {
    stats: [stats, 3000],
    health: [health, 15_000],
    users: [users, 10_000],
    log: [log, 2000],
  };
  const chosen = which === undefined ? undefined : panes[which];
  if (chosen === undefined) fail(`no pane ${String(which)}`);
  const [draw, every] = /** @type {[() => void | Promise<void>, number]} */ (chosen);
  const tick = async () => {
    try {
      await draw();
    } catch (e) {
      paint(`${RED}${e instanceof Error ? e.message : String(e)}${RESET}`);
    }
    setTimeout(() => void tick(), every);
  };
  void tick();
}

const [command, ...args] = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  const help = command === undefined ? undefined : HELP[/** @type {keyof typeof HELP} */ (command)];
  process.stdout.write(`${help ?? Object.values(HELP).join("\n\n")}\n`);
  process.exit(0);
}
try {
  if (command === "conf") process.stdout.write(turnserverConf(readSettings(process.env)));
  else if (command === "user") user(args);
  else if (command === "link") link(args);
  else if (command === "check") await check();
  else if (command === "dash") dash(args);
  else if (command === "pane") pane(args[0]);
  else fail(Object.values(HELP).join("\n\n"));
} catch (e) {
  fail(`turn: ${e instanceof Error ? e.message : String(e)}`);
}
