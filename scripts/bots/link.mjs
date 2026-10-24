#!/usr/bin/env node
/**
 * The company's Telegram sidecar, and each agent's presence.
 *
 * Runs OUTSIDE every bubblewrap jail, and is the only process that holds the
 * bot token. Agents inside the jails talk to Telegram by dropping JSON files
 * into their outbox and reading lines out of their inbox; this process turns
 * those into real API calls. That split is the whole point: an agent that
 * could read the token out of its own environment could be prompt-injected
 * into deleting the group.
 *
 * The company has ONE bot (docs/adr/0023-one-telegram-bot.md):
 *
 *   serve             one per company. Long-polls the single token and routes
 *                     each operator message to the inboxes it is for. Drains
 *                     every role's outbox: a peer message goes straight into
 *                     its recipients' inboxes, then a copy goes to Telegram
 *                     for the operator, paced so one bot stays under
 *                     Telegram's group rate limit. A second `serve` exits at
 *                     once, so any `claude-bot` may try to start it.
 *   presence <role>   one per running agent. Keeps the role's roster entry
 *                     fresh, which is what `tg roster` reads, and removes it
 *                     when the agent's session ends. Holds no token.
 *
 * The pure half of this lives in protocol.mjs and is unit-tested; what is
 * left here is the part that needs a token, a socket or a clock.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { ROLES } from "./hub-policy.mjs";
import {
  deliverPeer,
  isReadyOutboxEntry,
  obj,
  parseRegistry,
  planSends,
  retryDelay,
  routeInbound,
} from "./protocol.mjs";

/** Overridable so link.test.mjs can stand a fake Telegram in for the real one. */
const API = process.env.VIBEWARS_TELEGRAM_API ?? "https://api.telegram.org";

/** How long getUpdates parks server-side. Telegram's documented maximum. */
const LONG_POLL_SECONDS = 50;

/** A roster entry older than this belongs to an agent that is gone. */
const PRESENCE_STALE_MS = 60_000;

/* -------------------------------------------------------------------------- */
/* Environment                                                                */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} name
 * @returns {string}
 */
function required(name) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set; run this through the claude-bot command`);
  }
  return value;
}

/**
 * Resolved lazily so that `presence`, which needs no token, does not demand
 * one.
 *
 * @returns {{ root: string, bus: string, link: string, registry: string }}
 */
function paths() {
  const root = required("VIBEWARS_BOT_ROOT");
  return {
    root,
    bus: required("VIBEWARS_BOT_BUS"),
    link: path.join(root, "link"),
    registry: path.join(root, "registry.json"),
  };
}

/* -------------------------------------------------------------------------- */
/* Bot API                                                                    */
/* -------------------------------------------------------------------------- */

/** A Telegram API call that came back with ok:false. */
class TelegramError extends Error {
  /**
   * @param {string} method
   * @param {string} description
   * @param {number} code
   * @param {number | undefined} retryAfter
   */
  constructor(method, description, code, retryAfter) {
    super(`${method}: ${description} (${String(code)})`);
    this.name = "TelegramError";
    this.description = description;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/**
 * One Bot API call.
 *
 * @param {string} token
 * @param {string} method
 * @param {Record<string, unknown>} [params]
 * @returns {Promise<unknown>}
 */
async function api(token, method, params = {}) {
  /** @type {Response} */
  let response;
  /** @type {unknown} */
  let body;

  // Retries cover transport failures only — a connection reset, a DNS blip, a
  // dropped long-poll. A Telegram-level `ok: false` is a real answer and is
  // thrown to the caller untouched.
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await fetch(`${API}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
      });
      body = await response.json();
      break;
    } catch (error) {
      const delay = retryDelay(attempt + 1);
      if (delay === null) {
        throw new TelegramError(
          method,
          `network failure after retries: ${error instanceof Error ? error.message : "unknown"}`,
          0,
          undefined,
        );
      }
      console.error(
        `[link] ${method}: ${error instanceof Error ? error.message : "network error"}; retrying in ${String(delay / 1000)}s`,
      );
      await sleep(delay);
    }
  }

  const envelope = obj(body);
  if (envelope.ok !== true) {
    const parameters = obj(envelope.parameters);
    const retryAfter =
      typeof parameters.retry_after === "number" ? parameters.retry_after : undefined;
    throw new TelegramError(
      method,
      typeof envelope.description === "string" ? envelope.description : "malformed response",
      response.status,
      retryAfter,
    );
  }
  return envelope.result;
}

/* -------------------------------------------------------------------------- */
/* Files                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} file
 * @returns {import("./protocol.mjs").Registry}
 */
function readRegistry(file) {
  const parsed = parseRegistry(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
  if ("error" in parsed) {
    throw new Error(parsed.error);
  }
  return parsed.registry;
}

/**
 * @param {string} file
 * @param {import("./protocol.mjs").Registry} registry
 * @returns {void}
 */
function writeRegistry(file, registry) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/**
 * @param {string} bus
 * @param {string} role
 * @returns {{ dir: string, inbox: string, outbox: string, roster: string }}
 */
function busPaths(bus, role) {
  const dir = path.join(bus, role);
  return {
    dir,
    inbox: path.join(dir, "inbox.jsonl"),
    outbox: path.join(dir, "outbox"),
    roster: path.join(bus, "roster", `${role}.json`),
  };
}

/**
 * @param {string} bus
 * @param {string} role
 * @returns {void}
 */
function ensureBus(bus, role) {
  const at = busPaths(bus, role);
  fs.mkdirSync(at.outbox, { recursive: true });
  fs.mkdirSync(path.dirname(at.roster), { recursive: true });
  if (!fs.existsSync(at.inbox)) {
    fs.writeFileSync(at.inbox, "");
  }
}

/**
 * @param {string} bus
 * @param {string} role
 * @param {import("./protocol.mjs").InboxLine} line
 * @returns {void}
 */
function appendInbox(bus, role, line) {
  ensureBus(bus, role);
  fs.appendFileSync(busPaths(bus, role).inbox, `${JSON.stringify(line)}\n`);
}

/**
 * Roles with a running agent right now, from their presence heartbeats.
 *
 * @param {string} bus
 * @returns {Set<string>}
 */
function present(bus) {
  /** @type {Set<string>} */
  const live = new Set();
  for (const role of ROLES) {
    try {
      const record = obj(JSON.parse(fs.readFileSync(busPaths(bus, role).roster, "utf8")));
      if (typeof record.lastSeen === "number" && Date.now() - record.lastSeen < PRESENCE_STALE_MS) {
        live.add(role);
      }
    } catch {
      /* not running */
    }
  }
  return live;
}

/* -------------------------------------------------------------------------- */
/* serve                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Become the company's only sidecar, or say there already is one.
 *
 * Telegram allows one getUpdates consumer per token; a second gets
 * "409 Conflict" and the company goes deaf. `wx` makes taking the lock
 * atomic, and a lock whose holder has died is taken over by renaming it. This runs on the
 * host, so a pid is meaningful here, unlike inside the jails.
 *
 * @param {string} lock
 * @returns {boolean} whether this process now holds it
 */
function takeLock(lock) {
  const mine = `${String(process.pid)}\n`;
  try {
    fs.writeFileSync(lock, mine, { flag: "wx" });
    return true;
  } catch {
    /* held, or left behind; see below */
  }
  const seen = fs.readFileSync(lock, "utf8");
  try {
    process.kill(Number.parseInt(seen.trim(), 10), 0);
    return false;
  } catch {
    /* the holder is dead */
  }
  // Take over a dead holder's lock by renaming it away. Only one rename of
  // that file can succeed, so two sidecars racing here cannot both win, and
  // checking the contents makes sure the file renamed is the stale one we
  // looked at, not a lock a faster sidecar has just written.
  const stale = `${lock}.stale-${String(process.pid)}`;
  try {
    fs.renameSync(lock, stale);
  } catch {
    return false;
  }
  if (fs.readFileSync(stale, "utf8") !== seen) {
    fs.renameSync(stale, lock);
    return false;
  }
  fs.rmSync(stale, { force: true });
  try {
    fs.writeFileSync(lock, mine, { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

/**
 * The company's state as the sidecar holds it. Topic ids are added as roles
 * need them; the getUpdates offset advances with every batch.
 */
class Company {
  /**
   * @param {ReturnType<typeof paths>} at
   * @param {string} token
   * @param {string} chatId
   */
  constructor(at, token, chatId) {
    this.at = at;
    this.token = token;
    this.chatId = chatId;
    this.registry = readRegistry(at.registry);
  }

  save() {
    writeRegistry(this.at.registry, this.registry);
  }

  /** @returns {Map<number, string>} topic id to the role that owns it */
  topicOwners() {
    return new Map(
      Object.entries(this.registry.roles).map(([role, { topicId }]) => [topicId, role]),
    );
  }

  /**
   * The role's forum topic, created on first use. The bot must be an admin
   * with `can_manage_topics`, which the company bot already is.
   *
   * @param {string} role
   * @returns {Promise<number | null>} `null` if Telegram would not create it
   */
  async topicFor(role) {
    const known = this.registry.roles[role]?.topicId;
    if (known !== undefined) {
      return known;
    }
    try {
      const created = obj(
        await api(this.token, "createForumTopic", { chat_id: this.chatId, name: role }),
      );
      if (typeof created.message_thread_id !== "number") {
        return null;
      }
      this.registry.roles[role] = { topicId: created.message_thread_id };
      this.save();
      console.error(`[link] created the ${role} topic`);
      return created.message_thread_id;
    } catch (error) {
      console.error(
        `[link] could not create the ${role} topic: ${error instanceof Error ? error.message : ""}`,
      );
      return null;
    }
  }
}

/**
 * Operator messages, from Telegram into the inboxes they are for.
 *
 * @param {Company} company
 * @returns {Promise<never>}
 */
async function pollInbound(company) {
  let backoff = 1000;
  for (;;) {
    try {
      const updates = /** @type {unknown[]} */ (
        await api(company.token, "getUpdates", {
          offset: company.registry.offset,
          timeout: LONG_POLL_SECONDS,
          allowed_updates: ["message"],
        })
      );
      const owners = company.topicOwners();
      for (const raw of updates) {
        const update = obj(raw);
        if (typeof update.update_id === "number") {
          company.registry.offset = update.update_id + 1;
        }
        const routed = routeInbound(raw, { chatId: company.chatId, topics: owners, roles: ROLES });
        for (const role of routed?.to ?? []) {
          if (routed !== null) {
            appendInbox(company.at.bus, role, routed.line);
          }
        }
      }
      if (updates.length > 0) {
        // So a restart does not hand everyone the same messages again.
        company.save();
      }
      backoff = 1000;
    } catch (error) {
      const retryAfter = error instanceof TelegramError ? error.retryAfter : undefined;
      console.error(`[link] inbound: ${error instanceof Error ? error.message : ""}`);
      await sleep(retryAfter === undefined ? backoff : retryAfter * 1000);
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}

/**
 * Every role's outbox: delivered locally at once, then queued for Telegram.
 *
 * @param {Company} company
 * @param {{ to: string, text: string }[]} mirror filled here, emptied by `mirrorOut`
 * @returns {Promise<never>}
 */
async function drainOutboxes(company, mirror) {
  for (;;) {
    let moved = false;
    for (const role of ROLES) {
      const { outbox } = busPaths(company.at.bus, role);
      /** @type {string[]} */
      let pending;
      try {
        pending = fs.readdirSync(outbox).filter(isReadyOutboxEntry).sort();
      } catch {
        continue;
      }
      for (const name of pending) {
        const file = path.join(outbox, name);
        /** @type {unknown} */
        let payload;
        try {
          payload = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
          // A half-written file from a `tg send` still in flight; next pass.
          continue;
        }
        const delivered = deliverPeer(payload, {
          from: role,
          roles: ROLES,
          present: present(company.at.bus),
          now: Date.now(),
        });
        for (const { role: recipient, line } of delivered.deliveries) {
          appendInbox(company.at.bus, recipient, line);
        }
        if (delivered.notice !== null) {
          appendInbox(company.at.bus, role, delivered.notice);
        }
        if (delivered.mirror !== null) {
          mirror.push(delivered.mirror);
        }
        fs.rmSync(file, { force: true });
        moved = true;
      }
    }
    if (!moved) {
      await sleep(250);
    }
  }
}

/**
 * The copy of every peer message the operator reads in Telegram, paced by
 * `planSends`. Losing one of these loses nothing an agent needed: it is
 * already in the recipient's inbox.
 *
 * @param {Company} company
 * @param {{ to: string, text: string }[]} mirror
 * @returns {Promise<never>}
 */
async function mirrorOut(company, mirror) {
  /** @type {import("./protocol.mjs").Queued[]} */
  let queue = [];
  /** @type {number[]} */
  let sent = [];
  let blockedUntil = 0;

  for (;;) {
    // Resolve destinations to topics in arrival order, so a role whose topic
    // has to be created first does not jump the queue.
    for (const { to, text } of mirror.splice(0)) {
      queue.push({ topicId: to === "all" ? null : await company.topicFor(to), text });
    }

    const now = Date.now();
    sent = sent.filter((at) => now - at < 60_000);
    const plan = planSends(queue, sent, now, { blockedUntil });
    if (plan.batch === null) {
      await sleep(Math.min(Math.max(plan.waitMs, 100), 5000));
      continue;
    }
    const { batch } = plan;
    try {
      await api(company.token, "sendMessage", {
        chat_id: company.chatId,
        text: batch.text,
        ...(batch.topicId === null ? {} : { message_thread_id: batch.topicId }),
      });
      sent.push(Date.now());
      queue = plan.rest;
    } catch (error) {
      if (error instanceof TelegramError && error.retryAfter !== undefined) {
        blockedUntil = Date.now() + error.retryAfter * 1000;
        continue;
      }
      console.error(
        `[link] mirror dropped ${String(batch.count)} message(s): ${error instanceof Error ? error.message : ""}`,
      );
      queue = plan.rest;
    }
  }
}

/** @returns {Promise<void>} */
async function serve() {
  const at = paths();
  const token = required("TELEGRAM_MANAGER_TOKEN");
  const chatId = required("TELEGRAM_CHAT_ID");
  fs.mkdirSync(at.link, { recursive: true });

  const lock = path.join(at.link, "serve.pid");
  if (!takeLock(lock)) {
    console.error("[link] the company sidecar is already running");
    return;
  }
  const release = () => {
    fs.rmSync(lock, { force: true });
    process.exit(0);
  };
  process.on("SIGINT", release);
  process.on("SIGTERM", release);

  const company = new Company(at, token, chatId);
  for (const role of ROLES) {
    ensureBus(at.bus, role);
  }
  console.error(`[link] serving ${String(ROLES.length)} roles on one bot`);
  // Topics for whoever is already running, so a message the operator
  // writes in a role's topic routes to it from the start.
  for (const role of present(at.bus)) {
    await company.topicFor(role);
  }

  /** @type {{ to: string, text: string }[]} */
  const mirror = [];
  await Promise.race([
    pollInbound(company),
    drainOutboxes(company, mirror),
    mirrorOut(company, mirror),
  ]);
}

/* -------------------------------------------------------------------------- */
/* presence                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Keep `role`'s roster entry fresh while its agent runs.
 *
 * claude-bot `exec`s into bwrap, so its EXIT trap never runs, and bwrap's
 * --die-with-parent does not reach us because we are outside the jail. So
 * claude-bot tells us its PID — which `exec` hands to bwrap, so it stays
 * alive exactly as long as the session does — and we exit when it goes.
 *
 * @param {string} role
 * @returns {Promise<void>}
 */
async function presence(role) {
  const at = paths();
  ensureBus(at.bus, role);
  const { roster } = busPaths(at.bus, role);
  const raw = process.env.VIBEWARS_BOT_LAUNCHER_PID;
  const launcher = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);

  const leave = () => {
    fs.rmSync(roster, { force: true });
    process.exit(0);
  };
  process.on("SIGINT", leave);
  process.on("SIGTERM", leave);

  for (;;) {
    fs.writeFileSync(
      roster,
      `${JSON.stringify({ role, pid: process.pid, lastSeen: Date.now() }, null, 2)}\n`,
    );
    await sleep(15_000);
    if (Number.isFinite(launcher)) {
      try {
        process.kill(launcher, 0);
      } catch {
        leave();
      }
    }
  }
}

/* -------------------------------------------------------------------------- */

/** @returns {Promise<void>} */
async function main() {
  const [command, role] = process.argv.slice(2);
  if (command === "serve") {
    await serve();
  } else if (command === "presence" && role !== undefined && ROLES.includes(role)) {
    await presence(role);
  } else {
    console.error("usage: link.mjs serve | link.mjs presence <role>");
    process.exit(2);
  }
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    // The messages thrown here are deliberately actionable — a registry in
    // the old shape says exactly how to fix it — so print the message and
    // keep the trace for when it is actually a crash.
    console.error(`[link] ${error instanceof Error ? error.message : String(error)}`);
    if (process.env.VIBEWARS_BOT_DEBUG === "1" && error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}
