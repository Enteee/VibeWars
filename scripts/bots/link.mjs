#!/usr/bin/env node
/**
 * The Telegram sidecar for one `claude-bot` role.
 *
 * Runs OUTSIDE the bubblewrap jail, and is the only process that holds the
 * role's bot token. The agent inside the jail talks to Telegram by dropping
 * JSON files into its outbox and reading lines out of its inbox; this process
 * is what turns those into real API calls. That split is the whole point: an
 * agent that could read the token out of its own environment could be
 * prompt-injected into deleting the group.
 *
 * Two subcommands:
 *
 *   provision <role>   one-time setup. Blocks on two human taps (confirm the
 *                      bot-creation link, add the new bot to the group) and is
 *                      resumable — rerunning it picks up at the first step
 *                      that has not completed.
 *   serve <role>       the steady-state loop: long-poll getUpdates into
 *                      inbox.jsonl, drain outbox/ via sendMessage, heartbeat.
 *
 * Relies on two 2026 additions to the Bot API, both explained in
 * docs/adr/0014-agent-coordination.md:
 *   - Managed Bots (9.6)         — getManagedBotToken, t.me/newbot links
 *   - bot-to-bot messages (10.0) — a bot sees another bot's group messages
 *                                  when it is an admin there
 *
 * The pure half of this file lives in protocol.mjs and is unit-tested; what
 * is left here is the part that needs a token, a socket or a clock.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// The company's roster, so that messaging a colleague who has not been hired
// yet can say so, rather than reporting an unknown role.
import { ROLES as COMPANY_ROLES } from "./hub-policy.mjs";
import {
  acceptsManagedBot,
  indexRoles,
  inboundLine,
  isProvisioned,
  isReadyOutboxEntry,
  obj,
  outboundParams,
  retryDelay,
  suggestName,
  suggestUsername,
} from "./protocol.mjs";

const API = "https://api.telegram.org";

/** How long getUpdates parks server-side. Telegram's documented maximum. */
const LONG_POLL_SECONDS = 50;

/** Telegram tolerates ~20 messages/minute into one group. Stay under it. */
const MIN_SEND_INTERVAL_MS = 3100;

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
/* Paths and registry                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Resolved lazily rather than at import time so that importing this module
 * (as the tests do, transitively) does not require the whole environment.
 *
 * @returns {{
 *   root: string, bus: string, registry: string, lock: string,
 *   managerToken: string, managerUsername: string, chatId: string, prefix: string,
 * }}
 */
function environment() {
  const root = required("VIBEWARS_BOT_ROOT");
  return {
    root,
    bus: required("VIBEWARS_BOT_BUS"),
    registry: path.join(root, "registry.json"),
    lock: path.join(root, "registry.lock"),
    managerToken: required("TELEGRAM_MANAGER_TOKEN"),
    managerUsername: required("TELEGRAM_MANAGER_USERNAME"),
    chatId: required("TELEGRAM_CHAT_ID"),
    prefix: process.env.VIBEWARS_BOT_USERNAME_PREFIX ?? "vibewars",
  };
}

/**
 * @param {string} file
 * @returns {import("./protocol.mjs").Registry}
 */
function readRegistry(file) {
  if (!fs.existsSync(file)) {
    return { managerOffset: 0, roles: {} };
  }
  const parsed = obj(JSON.parse(fs.readFileSync(file, "utf8")));
  return {
    managerOffset: typeof parsed.managerOffset === "number" ? parsed.managerOffset : 0,
    // Remembered so that provisioning the second and third role can offer the
    // creation button immediately, instead of making the operator start a new
    // conversation with the manager bot every single time.
    operatorChatId: typeof parsed.operatorChatId === "number" ? parsed.operatorChatId : null,
    roles: /** @type {Record<string, import("./protocol.mjs").RoleEntry>} */ (obj(parsed.roles)),
  };
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
 * Exclusive lock around provisioning. Two roles provisioning at once would
 * race on the manager bot's single getUpdates stream and steal each other's
 * `managed_bot` updates.
 *
 * @param {string} lock
 * @param {string} role
 * @returns {void}
 */
function acquireLock(lock, role) {
  const mine = `${String(process.pid)} ${role}\n`;
  try {
    fs.writeFileSync(lock, mine, { flag: "wx" });
    return;
  } catch {
    const [pid, heldFor] = fs.readFileSync(lock, "utf8").trim().split(" ");
    const holder = Number.parseInt(pid ?? "", 10);
    try {
      process.kill(holder, 0);
    } catch {
      // The holder died without cleaning up; the lock is ours to take.
      fs.rmSync(lock, { force: true });
      fs.writeFileSync(lock, mine, { flag: "wx" });
      return;
    }
    throw new Error(
      `the "${heldFor ?? "?"}" role is still being provisioned (pid ${String(holder)}), ` +
        `and creating two bots at once would make them fight over the manager ` +
        `bot's update stream. Finish that one first, or stop it.`,
    );
  }
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
  const paths = busPaths(bus, role);
  fs.mkdirSync(paths.outbox, { recursive: true });
  fs.mkdirSync(path.dirname(paths.roster), { recursive: true });
  if (!fs.existsSync(paths.inbox)) {
    fs.writeFileSync(paths.inbox, "");
  }
}

/* -------------------------------------------------------------------------- */
/* Provisioning                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Wait for the manager bot to be told that a new managed bot exists.
 *
 * Two routes lead here, because the obvious one does not work everywhere:
 *
 *  - The `t.me/newbot/...` link, which resolves to a `tg://` URL. Fine on a
 *    phone; useless on a desktop with no native client registered for that
 *    scheme, where the "Create bot" button simply does nothing.
 *  - A `request_managed_bot` keyboard button, which lives entirely inside
 *    Telegram and therefore works in every client, including the web one.
 *    Telegram only permits it in private chats ("managed bots can be
 *    requested in private chats only"), so it cannot be posted to the swarm
 *    group — instead, any private message to the manager bot gets the button
 *    back as a reply.
 *
 * So this watches for both, and offers the button to whoever says hello.
 *
 * @param {ReturnType<typeof environment>} env
 * @param {import("./protocol.mjs").Registry} registry
 * @param {string} role
 * @param {string} suggested
 * @param {number | null} recoverableId Id already on record for this role, if
 *   a previous run discovered the bot but died before storing its token.
 * @returns {Promise<{ id: number, username: string }>}
 */
async function awaitManagedBot(env, registry, role, suggested, recoverableId) {
  /** @type {Set<string>} */
  const offered = new Set();

  /**
   * @param {string} chatId
   * @returns {Promise<void>}
   */
  const offerButton = async (chatId) => {
    if (offered.has(chatId)) {
      return;
    }
    offered.add(chatId);
    try {
      await api(env.managerToken, "sendMessage", {
        chat_id: chatId,
        text:
          `Tap below to create the bot for the "${role}" role.\n\n` +
          `Suggested username: @${suggested} — edit it on the confirmation ` +
          `screen if Telegram says it is taken.`,
        reply_markup: {
          keyboard: [
            [
              {
                text: `Create the ${role} bot`,
                // `suggested_username` / `suggested_name`, NOT username/name:
                // Telegram silently ignores unknown fields here, so the wrong
                // spelling prefills nothing and gives no error to notice.
                request_managed_bot: {
                  request_id: hashRequestId(role),
                  suggested_username: suggested,
                  suggested_name: suggestName(role),
                },
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      console.log(
        `  sent a "Create the ${role} bot" button to your chat with @${env.managerUsername}`,
      );
    } catch (error) {
      console.log(
        `  could not send the button: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  };

  if (registry.operatorChatId !== null && registry.operatorChatId !== undefined) {
    await offerButton(String(registry.operatorChatId));
  }

  // Rewinding the offset recovers a `managed_bot` update that was confirmed
  // and then lost to a crash — without it, the bot exists in the operator's
  // account and nothing can name it again.
  //
  // But a rewind replays EVERY retained update, including the one that
  // created a different role's bot, which is how `gameplay` once got
  // provisioned as `@vibewars_architect_bot`. So it is only done when there is
  // something to recover (an id on record with no token beside it), and a
  // bot already claimed by another role is refused outright.
  const recovering = recoverableId !== null;
  let offset = recovering ? Math.max(0, registry.managerOffset - 16) : registry.managerOffset;
  let rewound = recovering;

  /** @type {Set<number>} */
  const claimed = new Set(
    Object.entries(registry.roles)
      .filter(([other]) => other !== role)
      .map(([, entry]) => entry.id)
      .filter((id) => id !== undefined),
  );

  for (;;) {
    const updates = /** @type {unknown[]} */ (
      await api(env.managerToken, "getUpdates", {
        offset,
        timeout: rewound ? 0 : LONG_POLL_SECONDS,
        // "message" is here only to notice someone opening a private chat, so
        // the button can be offered to them.
        allowed_updates: ["managed_bot", "message"],
      })
    );
    rewound = false;

    /** @type {{ id: number, username: string } | null} */
    let found = null;
    /** @type {Set<string>} */
    const greeted = new Set();

    for (const raw of updates) {
      const update = obj(raw);
      if (typeof update.update_id === "number") {
        offset = update.update_id + 1;
        registry.managerOffset = offset;
      }

      const bot = obj(obj(update.managed_bot).bot);
      if (typeof bot.id === "number" && typeof bot.username === "string") {
        if (acceptsManagedBot(bot.id, { claimed, recoverableId })) {
          found = { id: bot.id, username: bot.username };
        } else {
          // A replayed update from some other role's creation. Skipping it is
          // the safety net: accepting it hands two roles one identity.
          console.log(`  ignoring @${bot.username}, not this role's bot`);
        }
      }

      const chat = obj(obj(update.message).chat);
      if (chat.type === "private" && typeof chat.id === "number") {
        greeted.add(String(chat.id));
        registry.operatorChatId = chat.id;
      }
    }

    // Persist the advanced offset either way: a crash here must not replay
    // updates we have already consumed.
    writeRegistry(env.registry, registry);
    if (found !== null) {
      return found;
    }

    for (const chatId of greeted) {
      await offerButton(chatId);
    }
  }
}

/**
 * A small stable positive integer per role, for the button's request_id.
 * Telegram only uses it to correlate the reply with the request, so it needs
 * to be stable within one conversation, not globally unique.
 *
 * @param {string} role
 * @returns {number}
 */
function hashRequestId(role) {
  let hash = 0;
  for (const char of role) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2_000_000_000;
  }
  return hash === 0 ? 1 : hash;
}

/**
 * Report what the new bot can actually see in the group.
 *
 * This used to try to disable group privacy mode through
 * `setManagedBotAccessSettings`, on the assumption that the `BotAccessSettings`
 * class added beside it in Bot API 10.0 covered the BotFather privacy
 * toggles. It does not: the object is `{is_access_restricted: boolean}`, about
 * who may use the bot, and has nothing to do with which messages it receives.
 * The privacy toggle has no API at all — it is BotFather-only.
 *
 * Survivable, because Bot API 10.0 delivers another bot's group messages to a
 * bot that *either* has privacy disabled *or* has admin rights, and
 * provisioning grants admin rights. Directed messages also at-mention their
 * recipient, which privacy mode never filters. So this states the position and
 * names the manual toggle instead of quietly assuming it away.
 *
 * @param {string} token The role bot's own token.
 * @param {string} username
 * @returns {Promise<void>}
 */
async function reportAccess(token, username) {
  try {
    const me = obj(await api(token, "getMe"));
    if (me.can_read_all_group_messages === true) {
      console.log("  group privacy is off: it sees every message in the group");
      return;
    }
    console.log("  group privacy is on (the default, and not settable over the API).");
    console.log("  Admin rights cover peer traffic and directed messages at-mention");
    console.log("  their recipient, so this is usually fine. If messages from humans");
    console.log(`  do not reach \`tg inbox\`, open @BotFather -> /mybots -> @${username}`);
    console.log("  -> Bot Settings -> Group Privacy -> Turn off.");
  } catch (error) {
    console.log(
      `  could not read the bot's own settings: ${error instanceof Error ? error.message : ""}`,
    );
  }
}

/**
 * Give an existing managed bot a role.
 *
 * Creating a bot is the rate-limited, human-tapping part of hiring; the rest
 * is bookkeeping. When a bot already exists — a retired role, or one created
 * for a role that got renamed — there is no reason to burn a creation on it.
 * `adopt` writes the registry entry from a bot id and then hands over to
 * `provision`, which picks up at the first step that has not been done.
 *
 * The display name is reset to match the new role, because a bot called
 * "VibeWars-Gameplay-Bot" reviewing pull requests as `lead-dev` is the kind
 * of mismatch that wastes a minute every time someone reads the chat. The
 * @username cannot be changed over the API — that is BotFather only — so it
 * stays wrong, and that is the honest cost of repurposing.
 *
 * @param {string} role
 * @param {string} botId
 * @returns {Promise<void>}
 */
async function adopt(role, botId) {
  const env = environment();
  ensureBus(env.bus, role);

  const registry = readRegistry(env.registry);
  const claimed = Object.entries(registry.roles).find(
    ([other, entry]) => other !== role && entry.id === Number(botId),
  );
  if (claimed !== undefined) {
    throw new Error(`bot ${botId} is already the "${claimed[0]}" role; pick another`);
  }

  const me = obj(
    await api(
      String(await api(env.managerToken, "getManagedBotToken", { user_id: Number(botId) })),
      "getMe",
    ),
  );
  if (typeof me.id !== "number" || typeof me.username !== "string") {
    throw new Error(`could not read bot ${botId}; is it managed by @${env.managerUsername}?`);
  }

  const token = String(
    await api(env.managerToken, "getManagedBotToken", { user_id: Number(botId) }),
  );
  const entry = registry.roles[role] ?? {};
  entry.token = token;
  entry.id = me.id;
  entry.username = me.username;
  registry.roles[role] = entry;
  writeRegistry(env.registry, registry);
  console.log(`  adopted @${me.username} as "${role}"`);

  try {
    await api(token, "setMyName", { name: suggestName(role) });
    console.log(`  renamed it to ${suggestName(role)}`);
  } catch (error) {
    console.log(`  could not rename it: ${error instanceof Error ? error.message : "?"}`);
  }

  await provision(role);
}

/**
 * @param {string} role
 * @returns {Promise<void>}
 */
async function provision(role) {
  const env = environment();
  ensureBus(env.bus, role);

  // Nothing to do is the common case — every run after the first — and it must
  // not touch the lock. Otherwise starting one agent fails for as long as some
  // other role is waiting on a human tap.
  const existing = readRegistry(env.registry).roles[role] ?? {};
  if (isProvisioned(existing)) {
    console.log(`[link:${role}] ready as @${String(existing.username)}`);
    return;
  }

  acquireLock(env.lock, role);
  try {
    const registry = readRegistry(env.registry);
    const entry = registry.roles[role] ?? {};
    registry.roles[role] = entry;

    /* 1. The bot itself. --------------------------------------------------- */
    if (entry.token === undefined) {
      const suggested = suggestUsername(env.prefix, role);
      const link =
        `https://t.me/newbot/${env.managerUsername}/${suggested}` +
        `?name=${encodeURIComponent(suggestName(role))}`;

      console.log("");
      console.log(`  No Telegram bot exists for the role "${role}" yet.`);
      console.log("  Either open this link and confirm, once:");
      console.log("");
      console.log(`      ${link}`);
      console.log("");
      console.log(`  ...or, if that link does nothing (it needs a native client`);
      console.log(`  registered for tg:// URLs), send any message to`);
      console.log(`  @${env.managerUsername} in a private chat and tap the button`);
      console.log("  it replies with.");
      console.log("");
      console.log("  waiting...");

      const bot = await awaitManagedBot(env, registry, role, suggested, entry.id ?? null);
      // Persisted BEFORE fetching the token, because the `managed_bot` update
      // that carried this id has already been confirmed and Telegram will not
      // reliably hand it back. Losing it here leaves a bot in your account
      // that nothing can name again.
      entry.id = bot.id;
      entry.username = bot.username;
      writeRegistry(env.registry, registry);
      console.log(`  created @${bot.username} (${String(bot.id)})`);

      // `user_id`, not `bot_id`: the managed-bot methods address the bot by
      // its user id, like any other account.
      entry.token = String(await api(env.managerToken, "getManagedBotToken", { user_id: bot.id }));
      writeRegistry(env.registry, registry);
    }

    // `token` is narrowed to a string by the branch above; `id` and
    // `username` are not, because a registry hand-edited into an inconsistent
    // state can still reach here with the token set and the rest missing.
    const { token, id: botId, username } = entry;
    if (botId === undefined || username === undefined) {
      throw new Error(
        `registry entry for "${role}" is incomplete; remove it from ${env.registry} and retry`,
      );
    }

    /* 2. Membership. There is no Bot API method to add a bot to a group, so
          this is the one step that genuinely cannot be automated. ---------- */
    if (entry.promoted !== true) {
      let announced = false;
      for (;;) {
        const status = obj(
          await api(env.managerToken, "getChatMember", { chat_id: env.chatId, user_id: botId }),
        ).status;
        if (status !== "left" && status !== "kicked") {
          break;
        }
        if (!announced) {
          console.log("");
          console.log(`  Now add @${username} to the swarm group, once.`);
          console.log("  (group -> Members -> Add Member -> search the username)");
          console.log("");
          console.log("  waiting...");
          announced = true;
        }
        await sleep(3000);
      }

      /* 3. Admin rights: what lets it manage topics and, per Bot API 10.0,
            see the messages the other role bots send. --------------------- */
      await api(env.managerToken, "promoteChatMember", {
        chat_id: env.chatId,
        user_id: botId,
        can_manage_topics: true,
        can_delete_messages: true,
        can_pin_messages: true,
        can_invite_users: true,
      });
      entry.promoted = true;
      writeRegistry(env.registry, registry);
      console.log(`  @${username} is an admin in the group`);

      await reportAccess(token, username);
    }

    /* 4. Its subchannel. --------------------------------------------------- */
    if (entry.topicId === undefined) {
      const topic = obj(await api(token, "createForumTopic", { chat_id: env.chatId, name: role }));
      if (typeof topic.message_thread_id !== "number") {
        throw new Error("createForumTopic returned no message_thread_id");
      }
      entry.topicId = topic.message_thread_id;
      writeRegistry(env.registry, registry);
      console.log(`  topic "${role}" created`);
    }

    console.log(`[link:${role}] provisioned as @${username}`);
  } finally {
    fs.rmSync(env.lock, { force: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Serving                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @param {ReturnType<typeof environment>} env
 * @param {string} role
 * @param {() => import("./protocol.mjs").Registry} reload
 * @returns {Promise<never>}
 */
async function pollInbound(env, role, reload) {
  const paths = busPaths(env.bus, role);
  let offset = 0;
  let backoff = 1000;

  for (;;) {
    try {
      const registry = reload();
      const entry = registry.roles[role] ?? {};
      if (entry.token === undefined || entry.id === undefined) {
        throw new Error(`role "${role}" is not provisioned`);
      }
      const { byId } = indexRoles(registry);

      const updates = /** @type {unknown[]} */ (
        await api(entry.token, "getUpdates", {
          offset,
          timeout: LONG_POLL_SECONDS,
          allowed_updates: ["message"],
        })
      );

      for (const raw of updates) {
        const update = obj(raw);
        if (typeof update.update_id === "number") {
          offset = update.update_id + 1;
        }
        const line = inboundLine(raw, { chatId: env.chatId, selfId: entry.id, byId });
        if (line !== null) {
          fs.appendFileSync(paths.inbox, `${JSON.stringify(line)}\n`);
        }
      }
      backoff = 1000;
    } catch (error) {
      const retryAfter = error instanceof TelegramError ? error.retryAfter : undefined;
      console.error(`[link:${role}] inbound: ${error instanceof Error ? error.message : ""}`);
      await sleep(retryAfter === undefined ? backoff : retryAfter * 1000);
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}

/**
 * @param {ReturnType<typeof environment>} env
 * @param {string} role
 * @param {() => import("./protocol.mjs").Registry} reload
 * @returns {Promise<never>}
 */
async function drainOutbound(env, role, reload) {
  const paths = busPaths(env.bus, role);
  let lastSend = 0;

  for (;;) {
    const pending = fs.readdirSync(paths.outbox).filter(isReadyOutboxEntry).sort();

    if (pending.length === 0) {
      await sleep(250);
      continue;
    }

    const registry = reload();
    const entry = registry.roles[role] ?? {};
    const { topics, usernames } = indexRoles(registry);

    for (const name of pending) {
      const file = path.join(paths.outbox, name);
      /** @type {unknown} */
      let payload;
      try {
        payload = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        // A half-written file from a `tg send` still in flight; next pass.
        continue;
      }

      try {
        if (entry.token === undefined) {
          throw new Error(`role "${role}" is not provisioned`);
        }
        const params = outboundParams(payload, {
          chatId: env.chatId,
          from: role,
          topics,
          usernames,
          roster: COMPANY_ROLES,
        });
        const since = Date.now() - lastSend;
        if (since < MIN_SEND_INTERVAL_MS) {
          await sleep(MIN_SEND_INTERVAL_MS - since);
        }
        await api(entry.token, "sendMessage", params);
        lastSend = Date.now();
        fs.rmSync(file, { force: true });
      } catch (error) {
        if (error instanceof TelegramError && error.retryAfter !== undefined) {
          await sleep(error.retryAfter * 1000);
          continue;
        }
        // Undeliverable rather than transient. Tell the agent in its own
        // inbox — it is the only channel it reads — and drop the message
        // rather than retrying it forever.
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[link:${role}] outbound: ${reason}`);
        fs.appendFileSync(
          paths.inbox,
          `${JSON.stringify({
            ts: Date.now(),
            from: "link",
            kind: "link",
            text: `your last message was NOT delivered: ${reason}`,
            topicId: null,
            messageId: 0,
          })}\n`,
        );
        fs.rmSync(file, { force: true });
      }
    }
  }
}

/**
 * Exit when the claude-bot that started us goes away.
 *
 * claude-bot `exec`s into bwrap, so its EXIT trap never runs and cannot kill
 * us, and bwrap's --die-with-parent does not reach us because we are outside
 * the jail. Watching our own ppid is not enough either: reparenting lands us
 * on whatever subreaper is in play, and `process.ppid` does not reliably
 * reflect it. So claude-bot tells us its PID — which `exec` hands to bwrap,
 * so it stays alive exactly as long as the session does — and we watch for
 * that process to disappear. Without this, every session leaves a sidecar
 * long-polling Telegram forever.
 *
 * @param {() => void} cleanup
 * @returns {Promise<never>}
 */
async function watchLauncher(cleanup) {
  const raw = process.env.VIBEWARS_BOT_LAUNCHER_PID;
  const launcher = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  for (;;) {
    await sleep(5000);
    if (!Number.isFinite(launcher)) {
      continue;
    }
    try {
      process.kill(launcher, 0);
    } catch {
      cleanup();
      process.exit(0);
    }
  }
}

/**
 * @param {ReturnType<typeof environment>} env
 * @param {string} role
 * @param {() => import("./protocol.mjs").Registry} reload
 * @returns {Promise<never>}
 */
async function heartbeat(env, role, reload) {
  const paths = busPaths(env.bus, role);
  for (;;) {
    const entry = reload().roles[role] ?? {};
    fs.writeFileSync(
      paths.roster,
      `${JSON.stringify(
        {
          role,
          username: entry.username ?? null,
          topicId: entry.topicId ?? null,
          pid: process.pid,
          lastSeen: Date.now(),
        },
        null,
        2,
      )}\n`,
    );
    await sleep(15_000);
  }
}

/**
 * @param {string} role
 * @returns {Promise<void>}
 */
async function serve(role) {
  const env = environment();
  ensureBus(env.bus, role);
  const paths = busPaths(env.bus, role);

  /** @type {{ mtime: number, value: import("./protocol.mjs").Registry } | null} */
  let cached = null;
  const reload = () => {
    const mtime = fs.statSync(env.registry).mtimeMs;
    if (cached?.mtime !== mtime) {
      cached = { mtime, value: readRegistry(env.registry) };
    }
    return cached.value;
  };

  // Leftovers from a previous session would be sent out of order and out of
  // context, so each run starts with an empty outbox.
  for (const name of fs.readdirSync(paths.outbox)) {
    fs.rmSync(path.join(paths.outbox, name), { force: true });
  }

  const entry = reload().roles[role] ?? {};
  console.error(`[link:${role}] online as @${entry.username ?? "?"}`);

  const cleanup = () => {
    fs.rmSync(paths.roster, { force: true });
  };
  const stop = () => {
    cleanup();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  await Promise.race([
    pollInbound(env, role, reload),
    drainOutbound(env, role, reload),
    heartbeat(env, role, reload),
    watchLauncher(cleanup),
  ]);
}

/* -------------------------------------------------------------------------- */

/** @returns {Promise<void>} */
async function main() {
  const [command, role] = process.argv.slice(2);
  if (command === undefined || role === undefined) {
    console.error("usage: link.mjs <provision|serve|adopt> <role> [bot-user-id]");
    process.exit(2);
  }

  if (command === "provision") {
    await provision(role);
  } else if (command === "adopt") {
    const botId = process.argv[4];
    if (botId === undefined || !/^[0-9]+$/.test(botId)) {
      console.error("usage: link.mjs adopt <role> <bot-user-id>");
      process.exit(2);
    }
    await adopt(role, botId);
  } else if (command === "serve") {
    await serve(role);
  } else {
    console.error(`link.mjs: unknown command "${command}"`);
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
    // A stack trace through the Bot API wrapper tells the operator nothing.
    // The messages thrown here are deliberately actionable — which role holds
    // the provisioning lock, which registry entry is inconsistent — so print
    // the message and keep the trace for when it is actually a crash.
    const [, role] = process.argv.slice(2);
    console.error(
      `[link:${role ?? "?"}] ${error instanceof Error ? error.message : String(error)}`,
    );
    if (process.env.VIBEWARS_BOT_DEBUG === "1" && error instanceof Error) {
      console.error(error.stack);
    } else {
      console.error("[link] set VIBEWARS_BOT_DEBUG=1 for the stack trace");
    }
    process.exit(1);
  }
}
