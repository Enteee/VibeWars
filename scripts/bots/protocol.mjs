/**
 * The wire contract between the sandboxed agents and Telegram.
 *
 * Everything in here is pure. That is deliberate: routing a Telegram update
 * to the right inboxes, delivering a peer message, and pacing the mirror to
 * Telegram are the parts that are easy to get subtly wrong and impossible to
 * check against the live API in CI. So they live apart from link.mjs, which
 * owns the token, the sockets and the environment, and they are covered by
 * protocol.test.mjs.
 *
 * The company has one Telegram bot (ADR-0023). Agents never talk through
 * Telegram to each other: a bot does not receive its own messages, so peer
 * messages are delivered straight into the recipient's inbox, and Telegram
 * only gets a copy for the operator to read.
 *
 * Typed with JSDoc because `scripts/` is linted with the same type-aware
 * rules as the rest of the repo, and ADR-0008 bans `any`.
 */

/**
 * @typedef {object} Registry
 * @property {number} offset getUpdates offset, so a restart does not replay.
 * @property {Record<string, { topicId: number }>} roles each role's forum topic
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

/* -------------------------------------------------------------------------- */
/* The registry                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How to turn a per-role-bot registry into this one, for the error message.
 * A one-off command for the operator, not a code path (CLAUDE.md).
 */
const REGISTRY_FIX =
  "Keep the topics and drop the per-role bots: " +
  "mv .bots/registry.json .bots/registry.json.old && " +
  "jq '{offset: 0, roles: (.roles | map_values({topicId}) | with_entries(select(.value.topicId != null)))}' " +
  ".bots/registry.json.old > .bots/registry.json";

/**
 * Read `registry.json`. A missing file is a fresh company; anything not in
 * the current shape is refused, saying how to fix it.
 *
 * @param {string | null} text the file's contents, or `null` if it does not exist
 * @returns {{ registry: Registry } | { error: string }}
 */
export function parseRegistry(text) {
  if (text === null) {
    return { registry: { offset: 0, roles: {} } };
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "registry.json is not valid JSON." };
  }
  const record = obj(parsed);
  const roles = obj(record.roles);
  /** @type {Record<string, { topicId: number }>} */
  const topics = {};
  for (const [role, raw] of Object.entries(roles)) {
    const entry = obj(raw);
    const keys = Object.keys(entry);
    if (typeof entry.topicId !== "number" || keys.some((key) => key !== "topicId")) {
      return {
        error:
          `registry.json is from before the company had one bot (its "${role}" entry is ` +
          `${JSON.stringify(keys)}). ${REGISTRY_FIX}`,
      };
    }
    topics[role] = { topicId: entry.topicId };
  }
  if ("managerOffset" in record) {
    return { error: `registry.json is from before the company had one bot. ${REGISTRY_FIX}` };
  }
  return {
    registry: { offset: typeof record.offset === "number" ? record.offset : 0, roles: topics },
  };
}

/* -------------------------------------------------------------------------- */
/* Inbound: Telegram to inboxes                                               */
/* -------------------------------------------------------------------------- */

/**
 * Who a message from the operator is for, and what they read.
 *
 * Topics are real routing. A message in a role's topic is for that role
 * only. A message in General is for everyone, unless it starts with
 * `<role>:` or `@<role>`, which is how the operator talks to one role
 * without opening its topic. An unknown topic, or a prefix that is not a
 * role, goes to everyone: a message must never be silently black-holed.
 *
 * Messages from bots are dropped. This bot never receives its own, and the
 * per-role bots of the old design may still sit in the group; a bot message
 * read as human would carry the operator's `*` mark.
 *
 * @param {unknown} raw one getUpdates entry
 * @param {{ chatId: string, topics: Map<number, string>, roles: readonly string[] }} context
 *   `topics` maps a topic id to the role that owns it
 * @returns {{ to: string[], line: InboxLine } | null}
 */
export function routeInbound(raw, context) {
  const update = obj(raw);
  const message = obj(update.message);
  const chat = obj(message.chat);
  const from = obj(message.from);

  // Anything outside the company's group is somebody DMing the bot.
  if (String(chat.id) !== context.chatId) {
    return null;
  }
  // Stickers, joins, topic-created service messages: nothing an agent can read.
  if (typeof message.text !== "string" || message.text === "") {
    return null;
  }
  if (typeof from.id !== "number" || from.is_bot === true) {
    return null;
  }
  if (typeof message.message_id !== "number") {
    return null;
  }

  const topicId = typeof message.message_thread_id === "number" ? message.message_thread_id : null;
  /** @type {string} */
  let name;
  if (typeof from.username === "string") {
    name = `@${from.username}`;
  } else if (typeof from.first_name === "string") {
    name = from.first_name;
  } else {
    name = "someone";
  }
  const line = /** @type {InboxLine} */ ({
    ts: typeof message.date === "number" ? message.date * 1000 : 0,
    from: name,
    kind: "human",
    text: message.text,
    topicId,
    messageId: message.message_id,
  });

  // A reply in a forum's General topic carries no thread id, but a message
  // in a role's topic always does.
  const owner = topicId === null ? undefined : context.topics.get(topicId);
  if (owner !== undefined) {
    return { to: [owner], line };
  }
  // "developer-1: do X" or "@developer-1 do X". The name must be a role,
  // and must be followed by a colon (spaces before it are fine: the
  // operator types "manager : ..."), or for an at-mention by a space.
  const prefix = /^(@?)([a-z0-9-]+)\s*(:|\s|$)/i.exec(message.text);
  const named = prefix?.[2]?.toLowerCase();
  if (
    prefix !== null &&
    named !== undefined &&
    context.roles.includes(named) &&
    (prefix[3] === ":" || prefix[1] === "@")
  ) {
    return { to: [named], line };
  }
  return { to: [...context.roles], line };
}

/* -------------------------------------------------------------------------- */
/* Peer delivery                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Deliver one outbox entry from `from` straight into the recipients'
 * inboxes.
 *
 * A colleague who is a real role but not running right now still gets the
 * message, in the inbox they will read when they start; the sender is told,
 * so it does not wait on them. A name that is not a role at all is a mistake
 * to correct, and only the sender hears about it.
 *
 * @param {unknown} raw the outbox file's contents
 * @param {{ from: string, roles: readonly string[], present: ReadonlySet<string>, now: number }} context
 * @returns {{
 *   deliveries: { role: string, line: InboxLine }[],
 *   notice: InboxLine | null,
 *   mirror: { to: string, text: string } | null,
 * }}
 */
export function deliverPeer(raw, context) {
  const message = obj(raw);
  const to = typeof message.to === "string" ? message.to : "all";
  const text = typeof message.text === "string" ? message.text : "";
  /** @type {(body: string) => InboxLine} */
  const fromLink = (body) => ({
    ts: context.now,
    from: "link",
    kind: "link",
    text: body,
    topicId: null,
    messageId: 0,
  });

  if (to !== "all" && !context.roles.includes(to)) {
    return {
      deliveries: [],
      notice: fromLink(
        `your last message was NOT delivered: "${to}" is not one of this company's roles. ` +
          `Roles: ${context.roles.join(", ")}`,
      ),
      mirror: null,
    };
  }

  /** @type {InboxLine} */
  const line = {
    ts: context.now,
    from: context.from,
    kind: "peer",
    text,
    topicId: null,
    messageId: 0,
  };
  const recipients = to === "all" ? context.roles.filter((role) => role !== context.from) : [to];
  const absent = to !== "all" && !context.present.has(to);
  return {
    deliveries: recipients.map((role) => ({ role, line })),
    notice: absent
      ? fromLink(
          `delivered to ${to}'s inbox, but ${to} is not running right now; ` +
            "they will read it when they start. Do not wait on them.",
        )
      : null,
    mirror: { to, text: `[${context.from}] ${text}` },
  };
}

/* -------------------------------------------------------------------------- */
/* Outbound pacing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {object} Queued
 * @property {number | null} topicId where it goes in the group; `null` is General
 * @property {string} text
 */

/** Telegram's limit on one message. */
export const MAX_MESSAGE_CHARS = 4096;

/**
 * What the Telegram mirror should send next.
 *
 * One bot may post about 20 messages a minute into one group, and the whole
 * company now shares that. So: a budget of `limit` per rolling `windowMs`,
 * at most one message per `minGapMs`, and when more is queued than the
 * budget allows, consecutive messages to the same topic are joined into one,
 * up to Telegram's 4,096 characters. Messages to different topics are never
 * merged, and nothing is reordered. Agents never wait on this: their inboxes
 * were already written.
 *
 * @param {readonly Queued[]} queue
 * @param {readonly number[]} sent epoch ms of recent sends
 * @param {number} now
 * @param {{ limit?: number, windowMs?: number, minGapMs?: number, blockedUntil?: number }} [options]
 * @returns {{ batch: Queued & { count: number } | null, rest: Queued[], waitMs: number }}
 */
export function planSends(queue, sent, now, options = {}) {
  const limit = options.limit ?? 18;
  const windowMs = options.windowMs ?? 60_000;
  const minGapMs = options.minGapMs ?? 1100;
  const blockedUntil = options.blockedUntil ?? 0;

  if (queue.length === 0) {
    return { batch: null, rest: [], waitMs: 0 };
  }
  if (now < blockedUntil) {
    return { batch: null, rest: [...queue], waitMs: blockedUntil - now };
  }
  const recent = sent.filter((at) => now - at < windowMs).sort((a, b) => a - b);
  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < minGapMs) {
    return { batch: null, rest: [...queue], waitMs: minGapMs - (now - last) };
  }
  const budget = limit - recent.length;
  if (budget <= 0) {
    const oldest = recent[0] ?? now;
    return { batch: null, rest: [...queue], waitMs: oldest + windowMs - now };
  }

  const [first, ...others] = queue;
  if (first === undefined) {
    return { batch: null, rest: [], waitMs: 0 };
  }
  const clip = (/** @type {string} */ text) =>
    text.length <= MAX_MESSAGE_CHARS ? text : `${text.slice(0, MAX_MESSAGE_CHARS - 1)}…`;

  let text = clip(first.text);
  let count = 1;
  // Only coalesce when backlogged; otherwise each message goes out as sent.
  if (queue.length > budget) {
    for (const next of others) {
      const joined = `${text}\n${next.text}`;
      if (next.topicId !== first.topicId || joined.length > MAX_MESSAGE_CHARS) {
        break;
      }
      text = joined;
      count += 1;
    }
  }
  return { batch: { topicId: first.topicId, text, count }, rest: queue.slice(count), waitMs: 0 };
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
  // The mark comes from `kind` alone, never from anything in the text.
  const mark = line.kind === "human" ? "*" : " ";
  return `${when}${mark}${visible(line.from)}: ${visible(line.text)}`;
}

/** Everything that ends a line in some renderer. */
const LINE_BREAKS = new Set([0x0a, 0x0d, 0x0b, 0x0c, 0x85, 0x2028, 0x2029]);

/**
 * @param {number} code
 * @returns {boolean} whether it is a C0 or C1 control, or DEL
 */
function isControl(code) {
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

/**
 * Text with nothing in it that can fake a line or move the cursor.
 *
 * An inbox line is one line on an agent's terminal, and its first
 * characters say who spoke: `*` is the operator. A message containing a
 * newline and `HH:MM:SS*Ente: …` would otherwise print as a second line
 * the operator never wrote, and an ESC sequence could move the cursor up
 * and overwrite one (found in review of #28). So line breaks become `⏎`,
 * ESC becomes `␛`, a tab a space, and any other control `�`, in every
 * message, from anyone.
 *
 * @param {string} text
 * @returns {string}
 */
export function visible(text) {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (LINE_BREAKS.has(code)) {
      out += "⏎";
    } else if (code === 0x1b) {
      out += "␛";
    } else if (code === 0x09) {
      out += " ";
    } else if (isControl(code)) {
      out += "�";
    } else {
      out += char;
    }
  }
  return out;
}
