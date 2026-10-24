#!/usr/bin/env node
/**
 * `claude-bot-setup` — one-time preparation of the Telegram side.
 *
 * Separate from `claude-bot` because of a chicken-and-egg problem: the
 * `claude-bot` command needs `vibewars.telegram.chatId` from
 * devenv.local.nix, and the whole point of this script is to find out what
 * that value is. So it takes the manager token as an argument and depends on
 * nothing in the devenv config.
 *
 * It checks what it can and waits on what it cannot. Creating a Telegram
 * group is the one step with no API at all — `createChat` does not exist for
 * bots, by design — so this polls until the group appears, then validates it
 * and writes devenv.local.nix. Leave it running while you set the group up on
 * your phone and watch the checklist turn green.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { obj } from "./protocol.mjs";

const API = "https://api.telegram.org";

/**
 * @param {string} token
 * @param {string} method
 * @param {Record<string, unknown>} [params]
 * @returns {Promise<{ ok: true, result: unknown } | { ok: false, description: string }>}
 */
async function api(token, method, params = {}) {
  try {
    const response = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const envelope = obj(await response.json());
    if (envelope.ok === true) {
      return { ok: true, result: envelope.result };
    }
    return {
      ok: false,
      description:
        typeof envelope.description === "string" ? envelope.description : "malformed response",
    };
  } catch (error) {
    return { ok: false, description: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * @param {boolean} good
 * @param {string} text
 * @returns {string}
 */
function check(good, text) {
  return `  ${good ? "✓" : "✗"} ${text}`;
}

/* -------------------------------------------------------------------------- */

const USAGE = `claude-bot-setup — prepare the Telegram side, once

usage:
  claude-bot-setup <path-to-manager-token-file> [options]

The token file holds the manager bot's token and nothing else. Create that
bot in @BotFather, then enable Bot Management Mode for it in BotFather's
mini app — that is what lets it create the per-role bots.

This verifies the token, waits for you to make the swarm group, checks the
group has everything it needs, and writes devenv.local.nix. Leave it running
while you set the group up; the checklist updates as you go.

options:
  --chat <id>   Skip discovery and use this chat id, for when the discovery
                update has already been consumed.
  --force       Overwrite an existing vibewars.telegram block in
                devenv.local.nix.
  -h, --help    This text.

What you have to do by hand, because no Bot API method can do it:
  - create the group and add the manager bot to it
  - enable Topics on it
  - make the manager bot an admin, with Manage Topics and Add New Admins

After this: claude-bot <role>`;

const [tokenArg, ...flags] = process.argv.slice(2);
if (tokenArg === "-h" || tokenArg === "--help") {
  console.log(USAGE);
  process.exit(0);
}
if (tokenArg === undefined) {
  console.error(USAGE);
  process.exit(2);
}

const tokenFile = path.resolve(tokenArg);
if (!fs.existsSync(tokenFile)) {
  console.error(`claude-bot-setup: ${tokenFile} does not exist`);
  process.exit(1);
}
const token = fs.readFileSync(tokenFile, "utf8").trim();
const force = flags.includes("--force");

// An escape hatch for when the discovery update has already been consumed:
// pass the id straight in (Telegram shows it in the group's web URL, and
// @RawDataBot or the group's exported link will also give it up).
const chatFlag = flags.indexOf("--chat");
const givenChat = chatFlag === -1 ? undefined : flags[chatFlag + 1];

/* 1. The manager bot itself. ----------------------------------------------- */

const me = await api(token, "getMe");
if (!me.ok) {
  console.error(`claude-bot-setup: getMe failed: ${me.description}`);
  process.exit(1);
}
const bot = obj(me.result);
const username = String(bot.username);
const canManageBots = bot.can_manage_bots === true;

console.log("");
console.log(`Manager bot: @${username}`);
console.log(check(true, "token works"));
console.log(check(canManageBots, "Bot Management Mode enabled (can_manage_bots)"));

if (!canManageBots) {
  console.log("");
  console.log("  Bot Management Mode is what lets this bot create the role bots.");
  console.log("  Open @BotFather, launch its mini app, pick this bot, and enable it.");
  console.log("");
  process.exit(1);
}

/* 2. The group. No API can create one, so wait for it. --------------------- */

console.log("");
console.log("Waiting for the swarm group. On your phone:");
console.log("");
console.log("  1. New Group, name it anything, add @" + username);
console.log("  2. Open the group -> Edit -> enable Topics");
console.log("  3. Edit -> Administrators -> add @" + username + ", and grant it");
console.log("     at least: Manage Topics, Add New Admins, Delete Messages");
console.log("");
console.log("This will keep checking until all of that is true. Ctrl-C to stop.");
console.log("");

// Discovered chats are persisted, because getUpdates is destructive: polling
// with an offset confirms those updates and Telegram will never hand them
// back. A restart of this script would otherwise forget the group it had
// already been told about and wait forever for an event that cannot repeat.
const seenFile = path.join(
  process.env.DEVENV_ROOT ?? process.cwd(),
  ".bots",
  "setup-seen-chats.json",
);

/** @returns {Set<string>} */
function loadSeen() {
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(fs.readFileSync(seenFile, "utf8"));
    return new Set(Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : []);
  } catch {
    return new Set();
  }
}

/**
 * @param {Set<string>} chats
 * @returns {void}
 */
function saveSeen(chats) {
  fs.mkdirSync(path.dirname(seenFile), { recursive: true });
  fs.writeFileSync(seenFile, `${JSON.stringify([...chats], null, 2)}\n`);
}

const seen = loadSeen();
if (givenChat !== undefined) {
  seen.add(givenChat);
}
if (seen.size > 0) {
  console.log(`Remembering ${String(seen.size)} chat(s) from an earlier run.`);
  console.log("");
}

let offset = 0;
/** @type {string | null} */
let ready = null;

while (ready === null) {
  const updates = await api(token, "getUpdates", { offset, timeout: 25 });
  if (updates.ok) {
    for (const raw of /** @type {unknown[]} */ (updates.result)) {
      const update = obj(raw);
      if (typeof update.update_id === "number") {
        offset = update.update_id + 1;
      }
      // Any update at all tells us about a chat: being added fires
      // my_chat_member, and a message works just as well if it was added
      // before this script started.
      for (const key of ["my_chat_member", "message", "chat_member"]) {
        const chat = obj(obj(update[key]).chat);
        if (typeof chat.id === "number" && chat.type !== "private") {
          seen.add(String(chat.id));
          saveSeen(seen);
        }
      }
    }
  }

  for (const chatId of seen) {
    const chatInfo = await api(token, "getChat", { chat_id: chatId });
    if (!chatInfo.ok) {
      continue;
    }
    const chat = obj(chatInfo.result);
    const isForum = chat.is_forum === true;

    const membership = await api(token, "getChatMember", { chat_id: chatId, user_id: bot.id });
    const member = membership.ok ? obj(membership.result) : {};
    const isAdmin = member.status === "administrator" || member.status === "creator";
    const canTopics = member.can_manage_topics === true;
    const canPromote = member.can_promote_members === true;

    const title = typeof chat.title === "string" ? chat.title : chatId;
    const status = typeof member.status === "string" ? member.status : "unknown";

    console.log(`Chat "${title}" (${chatId}):`);
    console.log(check(true, `bot is a member (${status})`));
    console.log(check(isForum, "Topics enabled on the group"));
    console.log(check(isAdmin, "bot is an administrator"));
    console.log(check(canTopics, "bot can Manage Topics"));
    console.log(check(canPromote, "bot can Add New Admins (needed to promote role bots)"));
    console.log("");

    if (isForum && isAdmin && canTopics && canPromote) {
      ready = chatId;
      break;
    }
  }

  if (ready === null) {
    await sleep(3000);
  }
}

/* 3. Write the config. ----------------------------------------------------- */

const local = path.join(process.env.DEVENV_ROOT ?? process.cwd(), "devenv.local.nix");
const contents = `# Written by \`claude-bot-setup\`. Gitignored; this machine only.
#
# managerTokenFile rather than managerToken: the token is read at runtime and
# never reaches the world-readable /nix/store. See
# docs/adr/0014-agent-coordination.md.
{
  vibewars.telegram = {
    managerTokenFile = "${tokenFile}";
    chatId = "${ready}";
  };
}
`;

if (fs.existsSync(local) && !force) {
  const existing = fs.readFileSync(local, "utf8");
  if (existing.includes("vibewars.telegram")) {
    console.log(`${local} already configures vibewars.telegram; not overwriting it.`);
    console.log("Pass --force to replace it, or set these by hand:");
    console.log("");
    console.log(contents);
    process.exit(0);
  }
  console.log(`${local} exists and does not mention vibewars.telegram.`);
  console.log("Merge this in by hand:");
  console.log("");
  console.log(contents);
  process.exit(0);
}

fs.writeFileSync(local, contents);
console.log(`Wrote ${local}:`);
console.log("");
console.log(contents);
console.log("Now: rm -f .devenv/nix-eval-cache.db && devenv shell");
console.log("Then: claude-bot architect");
