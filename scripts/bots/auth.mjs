#!/usr/bin/env node
/**
 * `claude-llc auth` (#961): sign the company's accounts in, so the operator
 * never types a config-directory variable by hand. It shows the doctor's
 * table, runs the sign-in step of each credential that is not `ok`, and shows
 * the table again.
 *
 * Nothing secret is printed: children write straight to the TTY, never
 * through here; a token is read with echo off and handed on by file, never by
 * argv; a failed step says its exit code, never its output. The public push
 * key is the only key material this prints.
 */
import { spawn as spawnChild } from "node:child_process";
import fs from "node:fs";
import process from "node:process";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import {
  CLAUDE_TOKEN_VARS,
  GITHUB_TOKEN_VARS,
  claudeIdentity,
  ensureHome,
  githubIdentity,
  paths,
  pushIdentity,
  checkChat,
  readChatId,
  telegramBot,
  telegramGroupIdentity,
  telegramIdentity,
  telegramUpdates,
} from "./creds.mjs";
import { collect, renderTable } from "./doctor.mjs";

/** @typedef {import("./creds.mjs").Identity} Identity */
/** @typedef {import("./doctor.mjs").Row} Row */

/** The steps, in the order they run. */
export const STEPS = /** @type {const} */ (["claude", "github", "push", "telegram"]);

/** @typedef {(typeof STEPS)[number]} Step */

/** @type {Record<Step, string>} the doctor row each step signs in */
const ROW = { claude: "claude", github: "github api", push: "github push", telegram: "telegram" };

/** The telegram step signs in two rows: the bot, then its group. */
const GROUP_ROW = "telegram group";

const POLL_MS = 5_000;
const POLL_FOR_MS = 10 * 60_000;

export const USAGE = `claude-llc auth [claude | github | push | telegram]

  Sign the company's accounts in: Claude, GitHub, the push key, Telegram
  (the manager bot, then the group it runs in).
  Shows what is signed in (as claude-llc doctor does), runs the sign-in of
  each credential that is not, or only of the one named, and prints no
  secret. Interactive: run it in a terminal.`;

/**
 * @typedef {object} Planned
 * @property {Step} step
 * @property {Identity} identity what its row says now
 * @property {boolean} run whether its sign-in runs
 * @property {string | null} mismatch push only: the key is ok, but greeted
 *   as someone other than the company's GitHub login
 */

/**
 * @param {Row[]} rows
 * @param {Step} step
 * @returns {Identity}
 */
function identityOf(rows, step) {
  const token = rows.find((row) => row.name === ROW[step])?.identity;
  const group = step === "telegram" ? rows.find((row) => row.name === GROUP_ROW)?.identity : null;
  return (
    (token?.state === "ok" ? (group ?? token) : token) ?? {
      state: "error",
      who: null,
      expiry: null,
      scopes: null,
      note: "no such row",
    }
  );
}

/**
 * Which steps run, and why. An `ok` row runs nothing, whoever's account it
 * is: the operator's column is information only (#865).
 *
 * @param {Row[]} rows the doctor's
 * @param {Step | null} only the step named on the command line
 * @returns {Planned[]}
 */
export function plan(rows, only) {
  const github = identityOf(rows, "github");
  return STEPS.filter((step) => only === null || step === only).map((step) => {
    const identity = identityOf(rows, step);
    const mismatch =
      step === "push" &&
      identity.state === "ok" &&
      github.state === "ok" &&
      !sameLogin(identity.who, github.who)
        ? identity.who
        : null;
    return { step, identity, run: identity.state !== "ok", mismatch };
  });
}

/**
 * @param {string | null} a
 * @param {string | null} b
 * @returns {boolean}
 */
function sameLogin(a, b) {
  return a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
}

/**
 * One credential's state, in a line.
 *
 * @param {string} name
 * @param {Identity} identity
 * @returns {string}
 */
export function verdictLine(name, identity) {
  const label = name.padEnd(8);
  if (identity.state === "ok") {
    return `  ✓ ${label} ${identity.who ?? "(name unknown)"} (signed in)`;
  }
  return identity.state === "error"
    ? `  ✗ ${label} error: ${identity.note ?? "unknown"}`
    : `  ✗ ${label} not set up`;
}

/**
 * @param {string} key
 * @param {string} login
 * @returns {string}
 */
function mismatchLine(key, login) {
  return (
    `  ✗ push: GitHub knows this key as ${key}, not ${login}. The key is kept: ` +
    `remove it from ${key}'s GitHub account, then run claude-llc auth push again.`
  );
}

/**
 * @typedef {object} Spawned
 * @property {number | null} code
 * @property {string | null} signal
 * @property {boolean} missing the command is not on PATH
 */

/**
 * @typedef {object} Deps
 * @property {string} root the credential home
 * @property {boolean} tty whether stdin is a terminal
 * @property {Record<string, string | undefined>} env the environment children start from
 * @property {(command: string, args: string[], env: Record<string, string>) => Promise<Spawned>} spawn
 *   runs a child on the TTY
 * @property {(question: string) => Promise<string | null>} prompt reads a
 *   line with echo off; `null` is Ctrl-C
 * @property {(root: string) => Promise<{ rows: Row[] }>} collect the doctor's rows
 * @property {Record<Step, () => Identity | Promise<Identity>>} check one credential again
 * @property {import("./creds.mjs").Get} get
 * @property {(ms: number) => Promise<void>} sleep
 * @property {(line: string) => void} out
 * @property {(line: string) => void} err
 */

/**
 * The environment a child runs in: the shell's, plus the company's directory
 * variable, minus every token variable that would beat that directory.
 *
 * @param {Record<string, string | undefined>} base
 * @param {Record<string, string>} set
 * @returns {Record<string, string>}
 */
export function childEnv(base, set) {
  const unset = [...CLAUDE_TOKEN_VARS, ...GITHUB_TOKEN_VARS];
  /** @type {Record<string, string>} */
  const env = {};
  for (const [name, value] of Object.entries(base)) {
    if (value !== undefined && !unset.includes(name)) {
      env[name] = value;
    }
  }
  return { ...env, ...set };
}

/**
 * Creates a directory closed to everyone else, if it is not there.
 *
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { mode: 0o700 });
    fs.chmodSync(dir, 0o700);
  }
}

/** Ctrl-C: `auth` stops at once. */
const INTERRUPTED = Symbol("interrupted");

/**
 * Runs a child and says how it went, by its exit code alone.
 *
 * @param {Deps} deps
 * @param {Step} step
 * @param {string} command
 * @param {string[]} args
 * @param {Record<string, string>} set
 * @returns {Promise<boolean | typeof INTERRUPTED>}
 */
async function run(deps, step, command, args, set) {
  const result = await deps.spawn(command, args, childEnv(deps.env, set));
  if (result.signal === "SIGINT") {
    return INTERRUPTED;
  }
  if (result.missing) {
    deps.err(`  ✗ ${step}: ${command} not found on PATH`);
    return false;
  }
  if (result.code !== 0) {
    deps.err(`  ✗ ${step}: ${command} exited ${String(result.code ?? result.signal ?? "?")}`);
    return false;
  }
  return true;
}

/**
 * One sign-in step. Returns `INTERRUPTED` on Ctrl-C, anything else when it is
 * over: whether it worked is checked again afterwards.
 *
 * @param {Deps} deps
 * @param {Step} step
 * @param {string | null} githubLogin the company's, if known
 * @returns {Promise<unknown>}
 */
async function signIn(deps, step, githubLogin) {
  const p = paths(deps.root);
  if (step === "claude") {
    ensureDir(p.claude);
    deps.out("Sign in as the company's Claude account (not yours). A browser opens.");
    return run(deps, step, "claude", ["auth", "login", "--claudeai"], {
      CLAUDE_CONFIG_DIR: p.claude,
    });
  }
  if (step === "github") {
    deps.out(
      "Sign in as the company's GitHub machine account, not yours. " +
        "If your browser is logged in as you, use a private window.",
    );
    return run(
      deps,
      step,
      "gh",
      [
        "auth",
        "login",
        "--hostname",
        "github.com",
        "--git-protocol",
        "ssh",
        "--insecure-storage",
        "--scopes",
        "project,read:project",
        "--skip-ssh-key",
      ],
      { GH_CONFIG_DIR: p.gh },
    );
  }
  if (step === "push") {
    return pushKey(deps, githubLogin);
  }
  return telegramToken(deps);
}

/**
 * The push key: made if absent, shown, then waited for until GitHub greets it
 * as the company's login.
 *
 * @param {Deps} deps
 * @param {string | null} login
 * @returns {Promise<unknown>}
 */
async function pushKey(deps, login) {
  const p = paths(deps.root);
  if (login === null) {
    deps.err("  ✗ push: needs the github step first");
    return false;
  }
  if (!fs.existsSync(p.sshKey)) {
    ensureDir(p.ssh);
    const made = await run(
      deps,
      "push",
      "ssh-keygen",
      ["-t", "ed25519", "-N", "", "-C", "vibewars-company", "-f", p.sshKey],
      {},
    );
    if (made !== true) {
      return made;
    }
  }
  deps.out("The company's public push key:");
  deps.out(fs.readFileSync(p.sshPub, "utf8").trim());
  deps.out(`Add it at https://github.com/settings/ssh/new while signed in as ${login}`);
  for (let waited = 0; waited <= POLL_FOR_MS; waited += POLL_MS) {
    const identity = await deps.check.push();
    if (identity.state === "ok") {
      if (!sameLogin(identity.who, login)) {
        deps.err(mismatchLine(identity.who ?? "?", login));
      }
      return true;
    }
    if (waited > 0 && waited % 60_000 === 0) {
      deps.out("waiting…");
    }
    await deps.sleep(POLL_MS);
  }
  deps.err("  ✗ push: GitHub did not greet the key within 10 minutes");
  return false;
}

/**
 * The manager bot's token: asked with echo off, checked with `getMe`, and
 * only then written.
 *
 * @param {Deps} deps
 * @returns {Promise<unknown>}
 */
async function telegramToken(deps) {
  const p = paths(deps.root);
  const token = await deps.prompt("Manager bot token (from @BotFather): ");
  if (token === null) {
    return INTERRUPTED;
  }
  const bot = await telegramBot(token.trim(), deps.get);
  if (bot.state !== "ok") {
    deps.err(`  ✗ telegram: ${bot.note ?? "refused"}; nothing written`);
    return false;
  }
  writePrivate(p.telegram, token.trim());
  return telegramGroup(deps, token.trim());
}

/**
 * Atomically, mode 600, like the credentials beside it.
 *
 * @param {string} file
 * @param {string} value
 */
function writePrivate(file, value) {
  const temp = `${file}.${String(process.pid)}.tmp`;
  fs.writeFileSync(temp, `${value}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}

/**
 * @param {Deps} deps
 * @param {string} token
 * @param {string} chatId
 * @returns {Promise<string | null>} the chat's title (safe to print) if it is
 *   fit for the company; the checklist is printed either way
 */
async function showChat(deps, token, chatId) {
  const checked = await checkChat(token, chatId, deps.get);
  deps.out(`Chat "${checked.title}" (${chatId}):`);
  for (const c of checked.checks) {
    deps.out(`  ${c.good ? "✓" : "✗"} ${c.text}`);
  }
  return checked.ok ? checked.title : null;
}

/**
 * The company's group, after the bot: kept as it is if it still checks out,
 * else found by waiting for the bot to be added to one (no API creates a
 * group), or taken pasted. Several candidates are listed and the operator
 * picks; nothing is written for a chat that is not fit.
 *
 * @param {Deps} deps
 * @param {string} token
 * @returns {Promise<unknown>}
 */
async function telegramGroup(deps, token) {
  const p = paths(deps.root);
  const kept = readChatId(p.telegramChat);
  if (kept !== null && (await showChat(deps, token, kept)) !== null) {
    deps.out("The company's Telegram group is already set up.");
    return true;
  }
  deps.out("");
  deps.out("The company needs a Telegram group. On your phone:");
  deps.out("  1. New Group, add the manager bot");
  deps.out("  2. Open the group -> Edit -> enable Topics");
  deps.out("  3. Edit -> Administrators -> add the bot, with Manage Topics");
  deps.out("Waiting for the bot to see it. Ctrl-C to stop.");
  const pasted = await deps.prompt("Or paste the group's chat id (Enter to wait): ");
  if (pasted === null) {
    return INTERRUPTED;
  }
  /** @type {Map<string, string>} chat id -> title, of the fit ones */
  const fit = new Map();
  if (/^-?\d+$/.test(pasted.trim())) {
    // The operator named it: it is the only candidate, not one of a backlog.
    const title = await showChat(deps, token, pasted.trim());
    if (title !== null) {
      fit.set(pasted.trim(), title);
    }
  } else {
    // getUpdates hands back a day of backlog, and anyone can add a bot to a
    // group, so what turns up here is a candidate, never a decision.
    /** @type {Set<string>} */
    const seen = new Set();
    let offset = 0;
    for (let waited = 0; waited <= POLL_FOR_MS; waited += POLL_MS) {
      const updates = await telegramUpdates(token, offset, deps.get);
      offset = updates.offset;
      for (const chat of updates.chats) {
        seen.add(chat);
      }
      for (const chat of seen) {
        const title = fit.has(chat) ? null : await showChat(deps, token, chat);
        if (title !== null) {
          fit.set(chat, title);
        }
      }
      if (fit.size > 0) {
        break;
      }
      await deps.sleep(POLL_MS);
    }
  }
  const options = [...fit];
  /** @type {string | undefined} */
  let chosen;
  if (options.length === 1) {
    const [id, title] = options[0] ?? ["", ""];
    const answer = await deps.prompt(`Use "${title}" (${id}) as the company's group? [y/N]: `);
    if (answer === null) {
      return INTERRUPTED;
    }
    chosen = /^y(es)?$/i.test(answer.trim()) ? id : undefined;
  } else if (options.length > 1) {
    deps.out("Several groups fit:");
    for (const [i, [id, title]] of options.entries()) {
      deps.out(`  ${String(i + 1)}. "${title}" (${id})`);
    }
    const answer = await deps.prompt("Which one (number): ");
    if (answer === null) {
      return INTERRUPTED;
    }
    chosen = options[Number(answer.trim()) - 1]?.[0];
  }
  if (chosen === undefined) {
    deps.err("  ✗ telegram: no group chosen; nothing written");
    return false;
  }
  writePrivate(p.telegramChat, chosen);
  return true;
}

/**
 * The whole command. Returns its exit code.
 *
 * @param {string[]} argv
 * @param {Deps} deps
 * @returns {Promise<number>}
 */
export async function auth(argv, deps) {
  if (argv.includes("-h") || argv.includes("--help")) {
    deps.out(USAGE);
    return 0;
  }
  const named = argv[0] ?? null;
  const only = STEPS.find((step) => step === named) ?? null;
  if (argv.length > 1 || (named !== null && only === null)) {
    deps.err(USAGE);
    return 2;
  }
  if (!deps.tty) {
    deps.err("claude-llc auth is interactive; run it in a terminal.");
    return 2;
  }
  const home = ensureHome(deps.root);
  if (!home.ok) {
    for (const line of home.lines) {
      deps.err(`claude-llc auth: ${line.outcome}`);
    }
    return 1;
  }

  const before = (await deps.collect(deps.root)).rows;
  deps.out(renderTable(before));
  deps.out("");
  let githubLogin =
    identityOf(before, "github").state === "ok" ? identityOf(before, "github").who : null;
  for (const planned of plan(before, only)) {
    if (planned.mismatch !== null) {
      deps.err(mismatchLine(planned.mismatch, githubLogin ?? "?"));
      continue;
    }
    deps.out(verdictLine(planned.step, planned.identity));
    if (!planned.run) {
      continue;
    }
    if ((await signIn(deps, planned.step, githubLogin)) === INTERRUPTED) {
      return 130;
    }
    const after = await deps.check[planned.step]();
    const mismatched =
      planned.step === "push" && after.state === "ok" && !sameLogin(after.who, githubLogin);
    // A mismatched key has said so already.
    if (!mismatched) {
      deps.out(verdictLine(planned.step, after));
    }
    if (planned.step === "github" && after.state === "ok") {
      githubLogin = after.who;
    }
  }

  const rows = (await deps.collect(deps.root)).rows;
  deps.out("");
  deps.out(renderTable(rows));
  const failing = plan(rows, only).filter((p) => p.run || p.mismatch !== null);
  if (failing.length > 0) {
    deps.err(`not signed in: ${failing.map((p) => p.step).join(", ")}`);
    return 1;
  }
  return 0;
}

/**
 * Reads a line from the terminal without echoing it.
 *
 * @param {string} question
 * @returns {Promise<string | null>}
 */
function promptHidden(question) {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted && Buffer.isBuffer(chunk)) {
        process.stdout.write(chunk);
      }
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.on("SIGINT", () => {
      rl.close();
      process.stdout.write("\n");
      resolve(null);
    });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

/** @type {Deps["spawn"]} */
function spawnOnTty(command, args, env) {
  return new Promise((resolve) => {
    const child = spawnChild(command, args, { stdio: "inherit", env });
    child.on("error", (error) => {
      resolve({
        code: null,
        signal: null,
        missing: "code" in error && error.code === "ENOENT",
      });
    });
    child.on("close", (code, signal) => {
      resolve({ code, signal, missing: false });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.env.VIBEWARS_CREDENTIALS;
  if (root === undefined || root === "") {
    console.error("claude-llc auth: VIBEWARS_CREDENTIALS is not set (run it through claude-llc).");
    process.exit(2);
  }
  const p = paths(root);
  // The children on the TTY get Ctrl-C too; this stops auth with them.
  process.on("SIGINT", () => process.exit(130));
  process.exitCode = await auth(process.argv.slice(2), {
    root,
    tty: process.stdin.isTTY,
    env: process.env,
    spawn: spawnOnTty,
    prompt: promptHidden,
    collect,
    check: {
      claude: () => claudeIdentity(p.claude),
      github: () => githubIdentity(p.gh),
      push: () => pushIdentity(p.sshKey),
      telegram: async () => {
        const bot = await telegramIdentity(p.telegram);
        return bot.state === "ok" ? telegramGroupIdentity(p.telegram, p.telegramChat) : bot;
      },
    },
    get: (url) => fetch(url),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    out: (line) => {
      console.log(line);
    },
    err: (line) => {
      console.error(line);
    },
  });
}
