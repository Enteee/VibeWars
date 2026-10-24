/**
 * The wire contract between a sandboxed agent and Telegram.
 *
 * Everything in here is pure. That is deliberate: the two directions of the
 * bridge — a Telegram update becoming a line in an agent's inbox, and an
 * outbox file becoming sendMessage parameters — are the parts that are easy
 * to get subtly wrong and impossible to check against the live API in CI. So
 * they live apart from link.mjs, which owns the token, the sockets and the
 * environment, and they are covered by protocol.test.mjs.
 *
 * Typed with JSDoc because `scripts/` is linted with the same type-aware
 * rules as the rest of the repo, and ADR-0008 bans `any`.
 */

/**
 * @typedef {object} RoleEntry
 * @property {string} [token]     The role bot's own token.
 * @property {number} [id]        Its numeric user id.
 * @property {string} [username]  Its Telegram username, with no leading at-sign.
 * @property {number} [topicId]   message_thread_id of its forum topic.
 * @property {boolean} [promoted] Admin rights granted in the group.
 */

/**
 * @typedef {object} Registry
 * @property {number} managerOffset getUpdates offset for the manager bot.
 * @property {Record<string, RoleEntry>} roles
 */

/**
 * @typedef {object} InboxLine
 * @property {number} ts
 * @property {string} from
 * @property {"peer" | "human" | "link"} kind
 * @property {string} text
 * @property {number | null} topicId
 * @property {number} messageId
 */

/**
 * Narrow an unknown value to a plain object so property access stays checked.
 * Telegram payloads arrive as `unknown` and the repo bans `any`, so every
 * traversal step goes through here.
 *
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function obj(value) {
  return typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * The username to suggest for a role's bot.
 *
 * Suggested, not imposed: whatever the operator confirms is what gets
 * created, and provisioning reads the real username back out of the
 * `managed_bot` update. So this aims for the clean name and lets Telegram
 * object if it is taken, rather than pre-emptively uglifying it with a random
 * suffix — `vibewars_architect_bot` was free on the first real run, and the
 * operator edited the suffix out by hand, which settles the question.
 *
 * Telegram requires 5-32 characters, ending in `bot`, with no hyphens, so the
 * stem is truncated such that `_bot` always survives.
 *
 * @param {string} prefix
 * @param {string} role
 * @returns {string}
 */
export function suggestUsername(prefix, role) {
  const stem = `${prefix}_${role.replace(/-/g, "_")}`;
  return `${stem.slice(0, 28)}_bot`;
}

/**
 * The display name to suggest for a role's bot.
 *
 * @param {string} role
 * @returns {string}
 */
export function suggestName(role) {
  const titled = role
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
  return `VibeWars-${titled}-Bot`;
}

/**
 * Flatten the registry into the three lookups both directions need.
 *
 * @param {Registry} registry
 * @returns {{
 *   byId: Map<number, string>,
 *   topics: Map<string, number>,
 *   usernames: Map<string, string>,
 * }}
 */
export function indexRoles(registry) {
  /** @type {Map<number, string>} */
  const byId = new Map();
  /** @type {Map<string, number>} */
  const topics = new Map();
  /** @type {Map<string, string>} */
  const usernames = new Map();

  for (const [role, entry] of Object.entries(registry.roles)) {
    if (entry.id !== undefined) {
      byId.set(entry.id, role);
    }
    if (entry.topicId !== undefined) {
      topics.set(role, entry.topicId);
    }
    if (entry.username !== undefined) {
      usernames.set(role, entry.username);
    }
  }
  return { byId, topics, usernames };
}

/**
 * Turn one getUpdates entry into the line an agent reads, or null if it is
 * not something the agent should see.
 *
 * @param {unknown} raw
 * @param {{ chatId: string, selfId: number, byId: Map<number, string> }} context
 * @returns {InboxLine | null}
 */
export function inboundLine(raw, context) {
  const update = obj(raw);
  const message = obj(update.message);
  const chat = obj(message.chat);
  const from = obj(message.from);

  // Anything outside the swarm group is somebody DMing the bot directly.
  if (String(chat.id) !== context.chatId) {
    return null;
  }
  // Stickers, joins, topic-created service messages: nothing an agent can read.
  if (typeof message.text !== "string" || message.text === "") {
    return null;
  }
  // getUpdates does not echo a bot's own sends, but a forwarded or edited copy
  // can still carry our id, and an agent reading its own words back would loop.
  if (typeof from.id !== "number" || from.id === context.selfId) {
    return null;
  }
  if (typeof message.message_id !== "number") {
    return null;
  }

  const role = context.byId.get(from.id);
  let name;
  if (role !== undefined) {
    name = role;
  } else if (typeof from.username === "string") {
    name = `@${from.username}`;
  } else if (typeof from.first_name === "string") {
    name = from.first_name;
  } else {
    name = "someone";
  }

  return {
    ts: typeof message.date === "number" ? message.date * 1000 : 0,
    from: name,
    kind: role === undefined ? "human" : "peer",
    text: message.text,
    topicId: typeof message.message_thread_id === "number" ? message.message_thread_id : null,
    messageId: message.message_id,
  };
}

/**
 * Turn one outbox file's contents into sendMessage parameters.
 *
 * The at-mention on a directed message is not decoration: if the
 * recipient's group privacy mode is still on, the mention is what makes
 * Telegram deliver the update to it at all.
 *
 * @param {unknown} raw
 * @param {{
 *   chatId: string,
 *   from: string,
 *   topics: Map<string, number>,
 *   usernames: Map<string, string>,
 * }} context
 * @returns {Record<string, unknown>}
 */
export function outboundParams(raw, context) {
  const message = obj(raw);
  const to = typeof message.to === "string" ? message.to : "all";
  const text = typeof message.text === "string" ? message.text : "";

  /** @type {Record<string, unknown>} */
  const params = { chat_id: context.chatId };

  if (to === "all") {
    // General, i.e. no message_thread_id.
    params.text = `[${context.from}] ${text}`;
    return params;
  }

  const topicId = context.topics.get(to);
  if (topicId === undefined) {
    const known = [...context.topics.keys()].sort().join(", ");
    throw new Error(`unknown role "${to}"; known roles: ${known === "" ? "(none yet)" : known}`);
  }
  params.message_thread_id = topicId;
  const mention = context.usernames.get(to);
  params.text = `${mention === undefined ? "" : `@${mention} `}[${context.from}] ${text}`;
  return params;
}

/**
 * Has this role been provisioned all the way through?
 *
 * Checked BEFORE taking the provisioning lock. The lock is global on purpose
 * — concurrent creations would fight over the manager bot's single getUpdates
 * stream — but a role with nothing left to do must not queue behind one that
 * is waiting on a human, which is what made `claude-bot architect` fail while
 * `gameplay` sat waiting to be added to the group.
 *
 * @param {RoleEntry} entry
 * @returns {boolean}
 */
export function isProvisioned(entry) {
  return (
    entry.token !== undefined &&
    entry.id !== undefined &&
    entry.username !== undefined &&
    entry.promoted === true &&
    entry.topicId !== undefined
  );
}

/**
 * How long to wait before retrying a request that failed at the network
 * level, in milliseconds, or null to give up.
 *
 * Provisioning long-polls for as long as it takes a human to tap a button, so
 * a transient TCP reset is not an exceptional case — it is the expected cost
 * of holding a connection open for fifty seconds at a time. A reset must not
 * end the wait.
 *
 * @param {number} attempt 1 for the first retry.
 * @param {number} [maxAttempts]
 * @returns {number | null}
 */
export function retryDelay(attempt, maxAttempts = 6) {
  if (attempt < 1 || attempt > maxAttempts) {
    return null;
  }
  // 1s, 2s, 4s, 8s, 16s, 30s — capped, because a long-poll that drops is
  // usually immediately re-establishable and waiting longer just adds latency.
  return Math.min(1000 * 2 ** (attempt - 1), 30_000);
}

/**
 * Should this `managed_bot` update be accepted as the bot for `role`?
 *
 * Provisioning rewinds the getUpdates offset to recover a bot it discovered
 * and then lost to a crash. The hazard is that a rewind replays every retained
 * update, including the one that created a different role's bot — which is
 * exactly how `gameplay` once ended up provisioned as the architect's bot,
 * two roles sharing one identity and one token.
 *
 * @param {number} botId Id from the replayed or fresh update.
 * @param {{
 *   claimed: Set<number>,
 *   recoverableId: number | null,
 * }} context `claimed` holds ids already belonging to OTHER roles;
 *   `recoverableId` is this role's own id if we are recovering one.
 * @returns {boolean}
 */
export function acceptsManagedBot(botId, context) {
  if (context.claimed.has(botId)) {
    return false;
  }
  if (context.recoverableId !== null) {
    return botId === context.recoverableId;
  }
  return true;
}

/**
 * Is this outbox entry finished and ready to send?
 *
 * `tg send` writes to a dotted temporary name and renames it into place, so
 * the sidecar never reads a half-written file. The subtlety is that the
 * temporary name still ends in `.json`, so a naive extension filter picks it
 * up mid-write — which is exactly the race the rename was there to avoid.
 *
 * @param {string} name A bare filename, not a path.
 * @returns {boolean}
 */
export function isReadyOutboxEntry(name) {
  return name.endsWith(".json") && !name.startsWith(".");
}

/**
 * Narrow a parsed inbox record, or reject it.
 *
 * The inbox is a file on disk that two processes in different mount
 * namespaces touch, so a line that parses as JSON but is not a message is a
 * real possibility — and a reason to skip that line, not to crash the agent's
 * only way of reading its mail.
 *
 * @param {unknown} value
 * @returns {InboxLine | null}
 */
function toInboxLine(value) {
  const record = obj(value);
  if (typeof record.text !== "string" || typeof record.from !== "string") {
    return null;
  }
  return {
    ts: typeof record.ts === "number" ? record.ts : 0,
    from: record.from,
    kind: record.kind === "human" || record.kind === "link" ? record.kind : "peer",
    text: record.text,
    topicId: typeof record.topicId === "number" ? record.topicId : null,
    messageId: typeof record.messageId === "number" ? record.messageId : 0,
  };
}

/**
 * Read the unread tail of an inbox.
 *
 * The cursor is a byte offset rather than a line count because the inbox is
 * append-only: a byte offset stays valid no matter how much the sidecar wrote
 * between two reads, and needs no coordination with it. A cursor past the end
 * means the file was truncated or replaced, so it restarts from zero rather
 * than silently returning nothing forever.
 *
 * @param {string} contents Whole inbox file.
 * @param {number} cursor Byte offset already consumed.
 * @returns {{ lines: InboxLine[], cursor: number }}
 */
export function readInbox(contents, cursor) {
  const size = Buffer.byteLength(contents, "utf8");
  const from = cursor > size || cursor < 0 ? 0 : cursor;
  const tail = Buffer.from(contents, "utf8").subarray(from).toString("utf8");

  /** @type {InboxLine[]} */
  const lines = [];
  let consumed = from;

  for (const line of tail.split("\n")) {
    // A trailing empty segment is the newline the sidecar has yet to follow
    // with a record; a partial write is skipped and picked up next time.
    if (line === "") {
      continue;
    }
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      // A partial write still in flight. Leave the cursor where it is and
      // pick this line up whole on the next read.
      break;
    }
    // Complete but unreadable: step over it rather than wedging the cursor.
    consumed += Buffer.byteLength(line, "utf8") + 1;
    const record = toInboxLine(parsed);
    if (record !== null) {
      lines.push(record);
    }
  }
  return { lines, cursor: consumed };
}

/**
 * Render one inbox line for a terminal.
 *
 * @param {InboxLine} line
 * @returns {string}
 */
export function formatLine(line) {
  const when = line.ts === 0 ? "--:--:--" : new Date(line.ts).toISOString().slice(11, 19);
  const mark = line.kind === "human" ? "*" : " ";
  return `${when}${mark}${line.from}: ${line.text}`;
}
