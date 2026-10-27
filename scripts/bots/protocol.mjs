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

import { roleOf } from "./staff.mjs";

/**
 * @typedef {"bots" | "manager" | "operator" | "support"} TopicName
 */

/**
 * The forum topics the sidecar creates, each on first use (#85). Peer
 * messages are mirrored into one Bots topic, not a topic per role: agents
 * read their inboxes, not Telegram, so the copy is for the operator and
 * reads best as one conversation.
 *
 * @type {Readonly<Record<TopicName, string>>}
 */
export const TOPIC_TITLES = {
  bots: "🤖 Bots",
  manager: "📋 Manager",
  operator: "❓ Operator",
  support: "🛟 Support",
};

/**
 * @typedef {object} Registry
 * @property {number} offset getUpdates offset, so a restart does not replay.
 * @property {{ topicId: number }} [bots] every peer message's mirror
 * @property {{ topicId: number }} [manager] the operator and the manager
 * @property {{ topicId: number }} [operator] `tg ask` questions and answers
 * @property {{ topicId: number }} [support] people outside the company, and support's replies
 */

/**
 * @typedef {object} InboxLine
 * @property {number} ts
 * @property {string} from
 * @property {"peer" | "human" | "link" | "user"} kind `human` is the operator;
 *   `user` is anyone else in the group, heard only in the Support topic
 * @property {string} text
 * @property {number | null} topicId
 * @property {number} messageId
 * @property {boolean} broadcast sent with `tg broadcast`: it reaches every
 *   role, and wakes none of them unless it names one (`wakes`)
 * @property {string | null} nudge the id of the scheduled nudge this line is
 *   (#537), else `null`
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
 * Read `registry.json`, field by field. A missing file is a fresh company.
 * A field in the current shape is kept, so a numeric `offset` survives
 * whatever else is wrong with the file: dropping it would make getUpdates
 * replay up to a day of operator messages into the inboxes. Every other
 * field is dropped, not repaired (ADR-0016), and gone on the next write;
 * its topic is created again on first use. What was dropped comes back for
 * the sidecar to say once.
 *
 * @param {string | null} text the file's contents, or `null` if it does not exist
 * @returns {{ registry: Registry, dropped: string[] }}
 */
export function parseRegistry(text) {
  /** @type {Registry} */
  const registry = { offset: 0 };
  if (text === null) {
    return { registry, dropped: [] };
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { registry, dropped: ["the whole file, which is not JSON"] };
  }
  const record = obj(parsed);
  /** @type {string[]} */
  const dropped = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === "offset" && typeof value === "number" && Number.isInteger(value)) {
      registry.offset = value;
      continue;
    }
    const topic = obj(value);
    if (
      Object.hasOwn(TOPIC_TITLES, key) &&
      typeof topic.topicId === "number" &&
      Object.keys(topic).length === 1
    ) {
      registry[/** @type {TopicName} */ (key)] = { topicId: topic.topicId };
      continue;
    }
    dropped.push(`"${key}"`);
  }
  return { registry, dropped };
}

/* -------------------------------------------------------------------------- */
/* Inbound: Telegram to inboxes                                               */
/* -------------------------------------------------------------------------- */

/**
 * Who a message from the operator is for, and what they read.
 *
 * A message that starts with `<role>:` or `@<role>` is for that role, in
 * any topic, and one that starts `<role>@<n>:` for that employee. `to`
 * holds roles and employee ids; `inboxesOf` turns each into inboxes, a
 * role's being every employee of it (#62). Otherwise the topic decides (#85): General is for everyone,
 * and the Manager topic is the operator's line to the manager, so an
 * unaddressed message there is the manager's. Anywhere else, Bots
 * included, an unaddressed message is for nobody, and `whichRole` is the
 * reply to post under it, so it is never silently black-holed.
 *
 * Messages from bots are dropped. This bot never receives its own, and the
 * per-role bots of the old design may still sit in the group; a bot message
 * read as human would carry the operator's `*` mark.
 *
 * The Operator topic is not routed here at all: `routeAnswer` owns it, and
 * a message there that fell through to "everyone" would hand every agent
 * an answer meant for one.
 *
 * Only the operator is heard, with one exception. The `*` mark is the
 * operator's authority, so a message from any other member of the group is
 * dropped rather than delivered with it. In the Support topic, and only
 * there, another member is a user (#131): their message goes to SUPPORT
 * alone, as a `user` line that never carries the mark, and a `<role>:`
 * prefix in it is just text. Users can never address another role. The
 * operator's own messages in Support are theirs as anywhere else, and an
 * unaddressed one is support's.
 *
 * @param {unknown} raw one getUpdates entry
 * @param {{
 *   chatId: string,
 *   operatorId: number,
 *   roles: readonly string[],
 *   managerTopicId?: number,
 *   operatorTopicId?: number,
 *   supportTopicId?: number,
 * }} context `operatorId` is the operator's Telegram user id
 * @returns {{ to: string[], line: InboxLine, whichRole: string | null } | null}
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
  const inSupport = topicId !== null && topicId === context.supportTopicId;
  if (from.id !== context.operatorId) {
    return inSupport
      ? {
          to: [SUPPORT],
          line: {
            ts: typeof message.date === "number" ? message.date * 1000 : 0,
            from: `user:${String(from.id)}`,
            kind: "user",
            text: visible(cut(message.text, MAX_USER_CHARS)),
            topicId,
            messageId: message.message_id,
            broadcast: false,
            nudge: null,
          },
          whichRole: null,
        }
      : null;
  }
  if (topicId !== null && topicId === context.operatorTopicId) {
    return null;
  }
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
    broadcast: false,
    nudge: null,
  });

  // "developer: do X", "@developer do X", or "developer@2: do X" for
  // one employee of a role (#62).
  const named = addressee(message.text);
  if (named !== null && context.roles.includes(roleOf(named) ?? "")) {
    return { to: [named], line, whichRole: null };
  }
  if (topicId !== null && topicId === context.managerTopicId) {
    return { to: ["manager"], line, whichRole: null };
  }
  if (inSupport) {
    return { to: [SUPPORT], line, whichRole: null };
  }
  // A reply in a forum's General topic carries no thread id; every other
  // topic's message does.
  if (topicId === null) {
    return { to: [...context.roles], line, whichRole: null };
  }
  return {
    to: [],
    line,
    whichRole:
      `Delivered to nobody: which role? Start with "<role>:", or post in General for everyone. ` +
      `Roles: ${context.roles.join(", ")}`,
  };
}

/**
 * Who a message starts by naming, lowercased: `developer: …`,
 * `@developer …` or `developer@2: …`. The name must be followed by a
 * colon (spaces before it are fine: the operator types "manager : ..."),
 * or for an at-mention by a space.
 *
 * @param {string} text
 * @returns {string | null}
 */
function addressee(text) {
  const prefix = /^(@?)([a-z0-9-]+(?:@[0-9]+)?)\s*(:|\s|$)/i.exec(text);
  const named = prefix?.[2]?.toLowerCase();
  return named !== undefined && (prefix?.[3] === ":" || prefix?.[1] === "@") ? named : null;
}

/* -------------------------------------------------------------------------- */
/* Peer delivery                                                              */
/* -------------------------------------------------------------------------- */

/** `tg send operator`: the recipient that is the operator, in the Manager topic. */
export const TO_OPERATOR = "operator";

/** The one role that may `tg send operator` (#85); everyone else goes through it. */
export const OPERATOR_LINE = "manager";

/**
 * The one role that hears users in the Support topic and may `tg reply`
 * there (#131). Everyone else's way out stays the Bots topic and General.
 */
export const SUPPORT = "support";

/** The longest user message support reads; the rest is cut off. */
export const MAX_USER_CHARS = 2000;

/**
 * Support's answer to a user, posted in the Support topic.
 *
 * @typedef {object} SupportReply
 * @property {string} text
 * @property {number | null} replyTo the user's message it answers, if any
 */

/**
 * The inboxes a message addressed to `address` goes to (#62): a role's is
 * every employee of it, an employee's is its own, and anything else has
 * none.
 *
 * @param {string} address a role or an employee id
 * @param {ReadonlyMap<string, string>} employees employee id to role, from `staff.json`
 * @returns {string[]} employee ids
 */
export function inboxesOf(address, employees) {
  const ofRole = [...employees].filter(([, role]) => role === address).map(([id]) => id);
  return ofRole.length === 0 && employees.has(address) ? [address] : ofRole;
}

/**
 * Deliver one outbox entry from the employee `from` straight into the
 * recipients' inboxes.
 *
 * A message to a role reaches every employee of it (#62), and one to
 * `<role>@<n>` only that employee. A recipient that is employed but not
 * running right now still gets the message, in the inbox it will read when
 * it starts; the sender is told, so it does not wait on them. A role nobody
 * is employed in gets nothing, and the sender is told that too. A name that
 * is neither a role nor an employee is a mistake to correct, and only the
 * sender hears about it.
 *
 * What a sender may do is its role's: asking, writing to the operator and
 * replying to users are checked against the role, never the employee id.
 *
 * A question for the operator (`kind: "ask"`, from `tg ask`) is delivered to
 * nobody: it comes back as `question` for the sidecar to number and post.
 * Only ASKERS may ask, and a malformed one is refused with a notice to the
 * sender, before anything reaches Telegram.
 *
 * A message to TO_OPERATOR is the manager writing to the operator: it is
 * delivered to nobody and only mirrored, into the Manager topic. Any other
 * sender is refused here too, not only by `tg`, which runs in the jail.
 *
 * A reply (`kind: "reply"`, from `tg reply`) is SUPPORT answering a user:
 * delivered to nobody, it comes back as `reply` for the Support topic. It is
 * the only way an agent posts outside Bots, General and the Manager topic,
 * so any other sender is refused here, the way TO_OPERATOR is.
 *
 * @param {unknown} raw the outbox file's contents
 * @param {{
 *   from: string,
 *   roles: readonly string[],
 *   employees: ReadonlyMap<string, string>,
 *   present: ReadonlySet<string>,
 *   now: number,
 * }} context `employees` is employee id to role, from `staff.json`;
 *   `present` holds the employees running right now
 * @returns {{
 *   deliveries: { employee: string, line: InboxLine }[],
 *   notice: InboxLine | null,
 *   mirror: Mirrored | null,
 *   question: Ask | null,
 *   reply: SupportReply | null,
 * }}
 */
export function deliverPeer(raw, context) {
  const message = obj(raw);
  const to = typeof message.to === "string" ? message.to : "all";
  const text = typeof message.text === "string" ? message.text : "";
  const role = roleOf(context.from);
  const none = { deliveries: [], notice: null, mirror: null, question: null, reply: null };
  /** @type {(body: string) => InboxLine} */
  const fromLink = (body) => ({
    ts: context.now,
    from: "link",
    kind: "link",
    text: body,
    topicId: null,
    messageId: 0,
    broadcast: false,
    nudge: null,
  });

  if (message.kind === "ask") {
    const refused = refuseQuestion(role ?? "", text, message.options);
    if (refused !== null) {
      return { ...none, notice: fromLink(`your question was NOT posted: ${refused}`) };
    }
    const options = /** @type {string[]} */ (message.options);
    return { ...none, question: { from: context.from, text, options } };
  }

  // Support's answer to a user: no inbox, only the Support topic.
  if (message.kind === "reply") {
    if (role !== SUPPORT) {
      return {
        ...none,
        notice: fromLink(`your reply was NOT posted: only ${SUPPORT} posts in the Support topic.`),
      };
    }
    if (text.trim() === "") {
      return { ...none, notice: fromLink("your reply was NOT posted: it is empty.") };
    }
    const replyTo =
      typeof message.replyTo === "number" && Number.isInteger(message.replyTo)
        ? message.replyTo
        : null;
    return { ...none, reply: { text, replyTo } };
  }

  // The manager's reply to the operator: no inbox, only the Manager topic.
  if (to === TO_OPERATOR) {
    if (role !== OPERATOR_LINE) {
      return {
        ...none,
        notice: fromLink(
          `your last message was NOT delivered: only the ${OPERATOR_LINE} writes to the ` +
            `operator. Tell the ${OPERATOR_LINE}, or ask with tg ask if you may.`,
        ),
      };
    }
    return { ...none, mirror: { from: context.from, to, text } };
  }

  if (to !== "all" && !context.roles.includes(to) && !context.employees.has(to)) {
    return {
      ...none,
      notice: fromLink(
        `your last message was NOT delivered: "${to}" is not one of this company's roles ` +
          `or employees. Employees: ${[...context.employees.keys()].join(", ")}`,
      ),
    };
  }

  // A role's first seat has the role's name, so a message to a role always
  // goes to its other employees; only an `@<n>` employee writing to its own
  // id gets the message back.
  /** @type {string[]} */
  let recipients = [to];
  if (to === "all") {
    recipients = [...context.employees.keys()].filter((id) => id !== context.from);
  } else if (context.roles.includes(to) || to !== context.from) {
    recipients = inboxesOf(to, context.employees).filter((id) => id !== context.from);
  }
  if (to !== "all" && recipients.length === 0) {
    return {
      ...none,
      notice: fromLink(`your last message was NOT delivered: nobody else in ${to} is hired.`),
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
    broadcast: to === "all",
    nudge: null,
  };
  const absent =
    to === "all" ? [] : recipients.filter((employee) => !context.present.has(employee));
  return {
    ...none,
    deliveries: recipients.map((employee) => ({ employee, line })),
    notice:
      absent.length > 0
        ? fromLink(
            `delivered to ${absent.join(", ")}'s inbox, but ${absent.join(", ")} ` +
              `${absent.length === 1 ? "is" : "are"} not running right now; ` +
              "they will read it when they start. Do not wait on them.",
          )
        : null,
    mirror: { from: context.from, to, text },
  };
}

/**
 * How one user's messages are let through to support's inbox (#131).
 *
 * @typedef {object} UserFlood
 * @property {number[]} admitted epoch ms of their messages admitted in the last minute
 * @property {number | null} warnedAt epoch ms of the last log line about dropping them, if any
 */

/** The most messages one user gets into support's inbox per minute. */
export const USER_MESSAGES_PER_MINUTE = 6;

/**
 * Whether one more message from a user reaches support, and whether the
 * sidecar should say it dropped one. A user is a stranger, and every
 * message they send costs an agent a turn, so beyond the cap a message is
 * dropped without a word to the user, and the log gets at most one line a
 * minute about each user rather than one per message.
 *
 * @param {UserFlood | undefined} state this user's so far; `undefined` for a first message
 * @param {number} now
 * @returns {{ admit: boolean, warn: boolean, state: UserFlood }}
 */
export function admitUser(state, now) {
  const admitted = (state?.admitted ?? []).filter((at) => now - at < 60_000);
  const warnedAt = state?.warnedAt ?? null;
  if (admitted.length < USER_MESSAGES_PER_MINUTE) {
    return { admit: true, warn: false, state: { admitted: [...admitted, now], warnedAt } };
  }
  const warn = warnedAt === null || now - warnedAt >= 60_000;
  return { admit: false, warn, state: { admitted, warnedAt: warn ? now : warnedAt } };
}

/**
 * How all users' messages together are let through to support's inbox.
 *
 * @typedef {object} SupportFlood
 * @property {number[]} admitted epoch ms of every user message admitted in the last minute
 * @property {number | null} busyAt epoch ms of the last "busy" line and reply, if any
 * @property {number} dropped messages dropped by this cap since then
 */

/** The most messages all users together get into support's inbox per minute. */
export const USERS_MESSAGES_PER_MINUTE = 30;

/** What support's topic is told, at most once a minute, while the global cap drops. */
export const SUPPORT_BUSY = "Support is busy, try again in a minute.";

/**
 * Whether one more user message, already past its sender's own cap, reaches
 * support. The per-user cap alone does not hold against many accounts, so
 * all users share this one too (#131 review). The operator is never counted:
 * their lines are `human`, not `user`. Past the cap a message is dropped,
 * and at most once a minute `busy` says how many were since the last time,
 * for the sidecar to log and to tell the Support topic.
 *
 * @param {SupportFlood | undefined} state `undefined` before the first user message
 * @param {number} now
 * @returns {{ admit: boolean, busy: number | null, state: SupportFlood }}
 */
export function admitAll(state, now) {
  const admitted = (state?.admitted ?? []).filter((at) => now - at < 60_000);
  const busyAt = state?.busyAt ?? null;
  const dropped = state?.dropped ?? 0;
  if (admitted.length < USERS_MESSAGES_PER_MINUTE) {
    return { admit: true, busy: null, state: { admitted: [...admitted, now], busyAt, dropped } };
  }
  if (busyAt === null || now - busyAt >= 60_000) {
    return { admit: false, busy: dropped + 1, state: { admitted, busyAt: now, dropped: 0 } };
  }
  return { admit: false, busy: null, state: { admitted, busyAt, dropped: dropped + 1 } };
}

/* -------------------------------------------------------------------------- */
/* The mirror's format                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A peer message as delivered, before it is formatted for Telegram.
 *
 * @typedef {object} Mirrored
 * @property {string} from the sending employee
 * @property {string} to a role, an employee, "all", or TO_OPERATOR
 * @property {string} text the body exactly as the sender wrote it
 */

/**
 * A Bot API `MessageEntity`. Offsets and lengths are UTF-16 code units, which
 * is what `String.length` counts.
 *
 * @typedef {object} MessageEntity
 * @property {"bold" | "blockquote" | "expandable_blockquote" | "text_link"} type
 * @property {number} offset
 * @property {number} length
 * @property {string} [url] for `text_link` only
 */

/** Telegram's limit on one message. */
export const MAX_MESSAGE_CHARS = 4096;

/**
 * How each role is shown in the mirror. Exactly the company's roles, with no
 * entry for anything else: `deliverPeer` refuses an unknown role before a
 * message gets this far. Single code points, or one plus a variation
 * selector, never ZWJ sequences, which render as several glyphs on some
 * clients.
 *
 * @type {Readonly<Record<string, { emoji: string, name: string }>>}
 */
export const ROLE_STYLE = {
  architect: { emoji: "🧭", name: "Architect" },
  manager: { emoji: "📋", name: "Manager" },
  developer: { emoji: "🛠", name: "Developer" },
  "asset-designer": { emoji: "🎨", name: "Asset Designer" },
  "cicd-engineer": { emoji: "⚙️", name: "CI/CD Engineer" },
  "lead-dev": { emoji: "🔍", name: "Lead Dev" },
  "perf-sec-qa": { emoji: "🛡", name: "Perf/Sec/QA" },
  "qa-tester": { emoji: "🧪", name: "QA Tester" },
  "business-analyst": { emoji: "📈", name: "Business Analyst" },
};

/**
 * The bus directory host-side code writes to when it has something to say to
 * the whole company: a daemon crash-looping (#23). No jail can reach it, since
 * each binds only its own role's directory, and no role is called this, so
 * a role's outbox can never produce a system message.
 */
export const SYSTEM = "_system";

/** How a system message is shown in the mirror: apart from every role. */
export const SYSTEM_STYLE = Object.freeze({ emoji: "⚠️", name: "System" });

/**
 * A system outbox entry, `{ to, text, nudge, direct }`, as a `link` line in
 * the inbox of everyone it is for. `to` is `"all"`, a role or one employee (#383), and `nudge` the id
 * of the scheduled nudge it is (#537) or `null`. To everyone it is a
 * broadcast in General; to a role it is mirrored as a message to that role.
 * An empty or malformed one goes nowhere; a role nobody is employed in gets
 * nothing, and nothing is mirrored.
 *
 * A `direct` one (#736) is for exactly the employee `to` names, even a
 * seat-1 id that is also its role's name, and only its inbox: never
 * mirrored, since it can carry text the employee chose and logs from a
 * pull request, which are not the System's to say on the operator's phone.
 *
 * @param {unknown} raw the outbox file's contents
 * @param {{ employees: ReadonlyMap<string, string>, now: number }} context
 *   employee id to role
 * @returns {{ deliveries: { employee: string, line: InboxLine }[], mirror: Mirrored | null }}
 */
export function deliverSystem(raw, context) {
  const { text, to, nudge, direct } = obj(raw);
  if (typeof text !== "string" || text.trim() === "" || typeof to !== "string") {
    return { deliveries: [], mirror: null };
  }
  if ((nudge !== null && typeof nudge !== "string") || typeof direct !== "boolean") {
    return { deliveries: [], mirror: null };
  }
  const recipients =
    to === "all" ? [...context.employees.keys()] : inboxesOf(to, context.employees);
  const employed =
    to === "all" || context.employees.has(to) || [...context.employees.values()].includes(to);
  if (recipients.length === 0 || !employed) {
    return { deliveries: [], mirror: null };
  }
  /** @type {InboxLine} */
  const line = {
    ts: context.now,
    from: "system",
    kind: "link",
    text,
    topicId: null,
    messageId: 0,
    broadcast: false,
    nudge,
  };
  if (direct) {
    return context.employees.has(to)
      ? { deliveries: [{ employee: to, line }], mirror: null }
      : { deliveries: [], mirror: null };
  }
  return {
    deliveries: recipients.map((employee) => ({ employee, line })),
    mirror: { from: SYSTEM, to: context.employees.get(to) ?? to, text },
  };
}

/**
 * Whether a scheduled nudge is to be skipped for an employee: one of the
 * same entry is still unread (#537), so nudges never pile up.
 *
 * @param {readonly InboxLine[]} unread the employee's lines after its cursor
 * @param {string | null} nudge the entry about to be delivered
 * @returns {boolean}
 */
export function skipNudge(unread, nudge) {
  return nudge !== null && unread.some((line) => line.nudge === nudge);
}

/** How a broadcast's recipient is shown. */
const EVERYONE = { emoji: "📢", name: "Everyone" };

/** How the operator is shown, as the recipient of the manager's replies. */
const OPERATOR = { emoji: "👤", name: "Operator" };

/**
 * Which topic a mirrored peer message goes to: a broadcast to General
 * (`null`), the manager's reply to the operator to the Manager topic, and
 * every other peer message to Bots, whoever it is for (#85).
 *
 * @param {Mirrored} message
 * @returns {TopicName | null}
 */
export function mirrorTopic(message) {
  if (message.to === "all") {
    return null;
  }
  return message.to === TO_OPERATOR ? "manager" : "bots";
}

/**
 * An employee as the mirror shows it: its role's style, and its seat after
 * the name from the second one on, `QA Tester 2` for `qa-tester@2`.
 *
 * @param {string} employee a role, its first employee, or `<role>@<n>`
 * @returns {{ emoji: string, name: string }}
 */
function styleOf(employee) {
  const role = roleOf(employee);
  const style = role === null ? undefined : ROLE_STYLE[role];
  if (style === undefined) {
    // deliverPeer refuses unknown roles, so reaching this is a bug, not data.
    throw new Error(`no ROLE_STYLE for "${employee}"`);
  }
  const seat = employee.slice(String(role).length + 1);
  return seat === "" ? style : { ...style, name: `${style.name} ${seat}` };
}

/**
 * `#34`, but not `foo#34`, a URL fragment `/#34` or an HTML entity `&#34;`.
 */
const ISSUE_REF = /(?<![\w/&])#(\d+)/g;

/**
 * Entities cut to the first `end` code units. One that would run past the
 * end is shortened, or dropped when nothing of it is left. A cut link is
 * always dropped: shortened, it would show #12 while linking #123.
 *
 * @param {readonly MessageEntity[]} entities
 * @param {number} end
 * @returns {MessageEntity[]}
 */
function fitEntities(entities, end) {
  return entities
    .filter(
      (entity) =>
        entity.offset < end &&
        (entity.type !== "text_link" || entity.offset + entity.length <= end),
    )
    .map((entity) => ({ ...entity, length: Math.min(entity.length, end - entity.offset) }));
}

/**
 * The first `max` code units of `text`, one fewer if that would split a
 * surrogate pair.
 *
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function cut(text, max) {
  if (text.length <= max) {
    return text;
  }
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

/**
 * One mirrored peer message as Telegram shows it:
 *
 *     🧭 Architect → 🛠 Developer
 *     ┃ the body, in an expandable blockquote
 *
 * All styling is entities built from `from` and `to`. The body is never
 * parsed as Markdown or HTML and `parse_mode` is never set, so nothing a peer
 * writes can forge a header or the operator's mark (the guarantee `visible`
 * gives the terminal, #28). The only thing read out of the body is `#<n>`,
 * which links to that issue; GitHub redirects it when `<n>` is a PR.
 *
 * The body is cut, ending in `…`, so the whole message fits in
 * MAX_MESSAGE_CHARS. A link cut by that is dropped rather than left pointing
 * at a different number than it shows.
 *
 * @param {Mirrored} message
 * @param {{ repo: string }} context `owner/name` on GitHub
 * @returns {{ text: string, entities: MessageEntity[] }}
 */
export function formatMirror(message, context) {
  const sender = message.from === SYSTEM ? SYSTEM_STYLE : styleOf(message.from);
  let recipient = EVERYONE;
  if (message.to === TO_OPERATOR) {
    recipient = OPERATOR;
  } else if (message.to !== "all") {
    recipient = styleOf(message.to);
  }

  /** @type {MessageEntity[]} */
  const entities = [];
  let header = `${sender.emoji} `;
  entities.push({ type: "bold", offset: header.length, length: sender.name.length });
  header += `${sender.name} → ${recipient.emoji} `;
  entities.push({ type: "bold", offset: header.length, length: recipient.name.length });
  header += recipient.name;

  if (message.text === "") {
    return { text: header, entities };
  }

  const start = header.length + 1;
  const room = MAX_MESSAGE_CHARS - start;
  const body = message.text.length <= room ? message.text : `${cut(message.text, room - 1)}…`;
  const kept = body === message.text ? body.length : body.length - 1;

  entities.push({ type: "expandable_blockquote", offset: start, length: body.length });
  for (const match of message.text.matchAll(ISSUE_REF)) {
    if (match.index + match[0].length > kept) {
      break;
    }
    entities.push({
      type: "text_link",
      offset: start + match.index,
      length: match[0].length,
      url: `https://github.com/${context.repo}/issues/${match[1] ?? ""}`,
    });
  }
  return { text: `${header}\n${body}`, entities };
}

/* -------------------------------------------------------------------------- */
/* The Operator topic: questions only the operator can answer                 */
/* -------------------------------------------------------------------------- */

/**
 * The roles that may ask the operator. A permission, so it changes by pull
 * request like any other; everyone else goes through the manager.
 */
export const ASKERS = ["manager", "architect", "lead-dev"];

/** Telegram shows at most a handful of buttons legibly on a phone. */
export const MAX_OPTIONS = 6;
export const MAX_OPTION_CHARS = 40;

/**
 * A question as `tg ask` sends it, once `deliverPeer` has accepted it.
 *
 * @typedef {object} Ask
 * @property {string} from the asking employee
 * @property {string} text
 * @property {string[]} options the buttons, possibly none
 */

/**
 * @typedef {Ask & { messageId: number | null, answered: boolean }} Question
 *   `messageId` is the posted question's, `null` until it has been sent
 */

/**
 * `questions.json`, which the sidecar owns. `next` survives restarts, so
 * Q numbers are never reused.
 *
 * @typedef {object} QuestionStore
 * @property {number} next
 * @property {Record<string, Question>} questions keyed by Q number
 */

/**
 * Why a question cannot be posted, or `null` if it can.
 *
 * @param {string} from
 * @param {string} text
 * @param {unknown} options
 * @returns {string | null}
 */
function refuseQuestion(from, text, options) {
  if (!ASKERS.includes(from)) {
    return `only ${ASKERS.join(", ")} may ask the operator. Ask the manager instead.`;
  }
  if (text.trim() === "") {
    return "the question is empty.";
  }
  if (!Array.isArray(options) || options.some((option) => typeof option !== "string")) {
    return "options must be a list of strings.";
  }
  if (options.length > MAX_OPTIONS) {
    return `at most ${String(MAX_OPTIONS)} options, not ${String(options.length)}.`;
  }
  for (const option of /** @type {string[]} */ (options)) {
    if (option.trim() === "" || option.length > MAX_OPTION_CHARS) {
      return `each option must be 1-${String(MAX_OPTION_CHARS)} characters: "${option}".`;
    }
  }
  return null;
}

/**
 * Read `questions.json`. A missing file is no questions yet; anything not in
 * the current shape is refused, like the registry.
 *
 * @param {string | null} text
 * @returns {{ store: QuestionStore } | { error: string }}
 */
export function parseQuestions(text) {
  if (text === null) {
    return { store: { next: 1, questions: {} } };
  }
  const refuse = { error: "questions.json is not in the current shape; delete it to start over." };
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return refuse;
  }
  const record = obj(parsed);
  if (typeof record.next !== "number") {
    return refuse;
  }
  /** @type {Record<string, Question>} */
  const questions = {};
  for (const [n, raw] of Object.entries(obj(record.questions))) {
    const q = obj(raw);
    if (
      typeof q.from !== "string" ||
      typeof q.text !== "string" ||
      !Array.isArray(q.options) ||
      !q.options.every((option) => typeof option === "string") ||
      !(typeof q.messageId === "number" || q.messageId === null) ||
      typeof q.answered !== "boolean"
    ) {
      return refuse;
    }
    questions[n] = {
      from: q.from,
      text: q.text,
      options: /** @type {string[]} */ (q.options),
      messageId: q.messageId,
      answered: q.answered,
    };
  }
  return { store: { next: record.next, questions } };
}

/**
 * A short, one-line excerpt.
 *
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function excerpt(text, max) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${cut(line, max - 1)}…`;
}

/** The longest excerpt of an answer shown on the answered question. */
const ANSWER_EXCERPT_CHARS = 80;

/**
 * A question as it is posted in the Operator topic, or as it is edited once
 * answered (`answer` set: the buttons go, and a line says what was chosen).
 *
 *     ❓ 🧭 Architect asks · Q7
 *     ┃ the question
 *     [ option ] …
 *     Tap an option, or reply to this message to answer in your own words.
 *
 * Built with entities, never `parse_mode`, for the same reason as the mirror.
 *
 * @param {number} n
 * @param {Ask} question
 * @param {string | null} [answer]
 * @returns {Pick<Queued, "text" | "entities" | "replyMarkup">}
 */
export function formatQuestion(n, question, answer = null) {
  const asker = styleOf(question.from);
  /** @type {MessageEntity[]} */
  const entities = [];
  let header = `❓ ${asker.emoji} `;
  entities.push({ type: "bold", offset: header.length, length: asker.name.length });
  header += `${asker.name} asks · Q${String(n)}`;

  let footer;
  if (answer !== null) {
    footer = `✅ Answered: ${excerpt(answer, ANSWER_EXCERPT_CHARS)}`;
  } else if (question.options.length > 0) {
    footer = "Tap an option, or reply to this message to answer in your own words.";
  } else {
    footer = "Reply to this message to answer.";
  }

  const room = MAX_MESSAGE_CHARS - header.length - footer.length - 2;
  const body = question.text.length <= room ? question.text : `${cut(question.text, room - 1)}…`;
  entities.push({ type: "blockquote", offset: header.length + 1, length: body.length });
  const text = `${header}\n${body}\n${footer}`;

  if (answer !== null || question.options.length === 0) {
    return { text, entities };
  }
  return {
    text,
    entities,
    replyMarkup: {
      inline_keyboard: question.options.map((option, i) => [
        { text: option, callback_data: `q:${String(n)}:${String(i)}` },
      ]),
    },
  };
}

/** What a stray message in the Operator topic gets back, once. */
export const OPERATOR_HINT = "Reply to a question to answer it.";

/**
 * Turn an operator's answer into its effects. The Operator topic is the only
 * place answers come from: a button tap on a question, or a Telegram reply
 * to one. Pure, like `routeInbound`, so all of it is tested.
 *
 * The answer goes to the asker only, as an operator line (`*`): answers are
 * decisions for the role that asked, and in General every role would read
 * and act on one. Only the operator is heard, the rule `routeInbound`
 * applies to messages: an answer carries the `*` mark, so a tap or a reply
 * from anyone else in the group changes nothing, and gets no hint either,
 * so a stranger cannot spend the mirror's budget. A second tap on an answered question
 * only gets a toast; a second reply is a follow-up to the same asker. A
 * message in the topic that answers nothing goes to no one and gets one hint
 * back, because one silently handed to an agent would be worse than one that
 * bounces.
 *
 * `immediate` calls post nothing to the group (`answerCallbackQuery`), so
 * they skip the mirror's budget; `paced` ones are for the Operator topic and
 * go through `planSends`.
 *
 * @param {unknown} raw one getUpdates entry
 * @param {QuestionStore} store
 * @param {{ chatId: string, operatorId: number, operatorTopicId: number | null, now: number }} context
 *   `operatorId` is the operator's Telegram user id
 * @returns {{
 *   deliveries: { employee: string, line: InboxLine }[],
 *   immediate: { method: string, params: Record<string, unknown> }[],
 *   paced: Omit<Queued, "topicId">[],
 *   answered: { n: number, question: Question } | null,
 * } | null} `null` when the update is not for the Operator topic
 */
export function routeAnswer(raw, store, context) {
  const update = obj(raw);
  const none = { deliveries: [], immediate: [], paced: [], answered: null };

  /**
   * @param {number} n
   * @param {Question} question
   * @param {string} who
   * @param {string} answer
   * @param {boolean} followUp
   * @returns {{ employee: string, line: InboxLine }}
   */
  const deliver = (n, question, who, answer, followUp) => ({
    employee: question.from,
    line: {
      ts: context.now,
      from: who,
      kind: "human",
      text: `${followUp ? "follow-up to" : "answer to"} Q${String(n)} ("${excerpt(question.text, 40)}"): ${answer}`,
      topicId: context.operatorTopicId,
      messageId: 0,
      broadcast: false,
      nudge: null,
    },
  });

  /**
   * @param {Record<string, unknown>} from
   * @returns {string}
   */
  const nameOf = (from) => {
    if (typeof from.username === "string") {
      return `@${from.username}`;
    }
    return typeof from.first_name === "string" ? from.first_name : "someone";
  };

  if ("callback_query" in update) {
    const query = obj(update.callback_query);
    const from = obj(query.from);
    const message = obj(query.message);
    if (
      typeof query.id !== "string" ||
      from.is_bot !== false ||
      String(obj(message.chat).id) !== context.chatId
    ) {
      return none;
    }
    const ack = (/** @type {string | undefined} */ toast) => ({
      method: "answerCallbackQuery",
      params: { callback_query_id: query.id, ...(toast === undefined ? {} : { text: toast }) },
    });
    // Someone else's tap: stop their spinner, nothing more.
    if (from.id !== context.operatorId) {
      return { ...none, immediate: [ack(undefined)] };
    }
    const data = typeof query.data === "string" ? /^q:(\d+):(\d+)$/.exec(query.data) : null;
    const n = Number(data?.[1]);
    const question = data === null ? undefined : store.questions[String(n)];
    const option = question?.options[Number(data?.[2])];
    // Forged or stale data: stop the button's spinner, change nothing. A
    // client can send any callback_data, so the tap must also be on this
    // question's own message.
    if (
      question === undefined ||
      option === undefined ||
      question.messageId === null ||
      message.message_id !== question.messageId
    ) {
      return { ...none, immediate: [ack(undefined)] };
    }
    if (question.answered) {
      return { ...none, immediate: [ack(`Q${String(n)} is already answered`)] };
    }
    return {
      deliveries: [deliver(n, question, nameOf(from), option, false)],
      immediate: [ack(undefined)],
      paced: [
        {
          ...formatQuestion(n, question, option),
          edit: question.messageId,
        },
      ],
      answered: { n, question: { ...question, answered: true } },
    };
  }

  const message = obj(update.message);
  const from = obj(message.from);
  if (
    context.operatorTopicId === null ||
    message.message_thread_id !== context.operatorTopicId ||
    String(obj(message.chat).id) !== context.chatId
  ) {
    return null;
  }
  if (
    from.is_bot !== false ||
    from.id !== context.operatorId ||
    typeof message.text !== "string" ||
    message.text === ""
  ) {
    return none;
  }
  // In a forum every message replies to the topic's first message, so only a
  // reply to a question's own message counts as an answer.
  const repliedTo = obj(message.reply_to_message).message_id;
  const found = Object.entries(store.questions).find(
    ([, question]) => question.messageId !== null && question.messageId === repliedTo,
  );
  if (found === undefined) {
    return {
      ...none,
      paced: [
        {
          text: OPERATOR_HINT,
          entities: [],
          ...(typeof message.message_id === "number" ? { replyTo: message.message_id } : {}),
        },
      ],
    };
  }
  const [key, question] = found;
  const n = Number(key);
  const delivery = deliver(n, question, nameOf(from), message.text, question.answered);
  if (question.answered) {
    return { ...none, deliveries: [delivery] };
  }
  return {
    deliveries: [delivery],
    immediate: [],
    paced: [
      {
        ...formatQuestion(n, question, message.text),
        edit: question.messageId,
      },
    ],
    answered: { n, question: { ...question, answered: true } },
  };
}

/* -------------------------------------------------------------------------- */
/* Outbound pacing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {object} Queued
 * @property {number | null} topicId where it goes in the group; `null` is General
 * @property {string} text
 * @property {MessageEntity[]} entities
 * @property {{ inline_keyboard: { text: string, callback_data: string }[][] }} [replyMarkup]
 *   buttons under the message
 * @property {number} [question] the Q number, whose message id must be recorded
 * @property {number} [edit] edit this message instead of sending a new one
 * @property {number} [replyTo] send as a reply to this message
 */

/**
 * Whether a queued item must go out on its own: its message id is needed, it
 * has buttons, or it is not a fresh message at all.
 *
 * @param {Queued} item
 * @returns {boolean}
 */
function standsAlone(item) {
  return (
    item.replyMarkup !== undefined ||
    item.question !== undefined ||
    item.edit !== undefined ||
    item.replyTo !== undefined
  );
}

/**
 * What the Telegram mirror should send next.
 *
 * One bot may post about 20 messages a minute into one group, and the whole
 * company now shares that. So: a budget of `limit` per rolling `windowMs`,
 * at most one message per `minGapMs`, and when more is queued than the
 * budget allows, consecutive messages to the same topic are joined into one,
 * a blank line apart, up to Telegram's 4,096 characters, each message's
 * entities moved along with it. Messages to different topics are never
 * merged, nothing is reordered, and an item that stands alone (a question,
 * an edit, a reply) is never joined with anything. Agents never wait on this: their inboxes
 * were already written.
 *
 * @param {readonly Queued[]} queue
 * @param {readonly number[]} sent epoch ms of recent sends
 * @param {number} now
 * @param {{ limit?: number, windowMs?: number, minGapMs?: number, blockedUntil?: number }} [options]
 * @returns {{ batch: (Queued & { count: number }) | null, rest: Queued[], waitMs: number }}
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
  // formatMirror already keeps a message within the limit, so this is only a
  // backstop; whatever it cuts, it cuts out of the entities too.
  let text = first.text;
  let entities = first.entities;
  if (text.length > MAX_MESSAGE_CHARS) {
    text = `${cut(text, MAX_MESSAGE_CHARS - 1)}…`;
    entities = fitEntities(entities, text.length - 1);
  }
  let count = 1;
  // Only coalesce when backlogged; otherwise each message goes out as sent.
  if (standsAlone(first)) {
    return { batch: { ...first, text, entities, count }, rest: queue.slice(1), waitMs: 0 };
  }
  if (queue.length > budget) {
    for (const next of others) {
      if (standsAlone(next)) {
        break;
      }
      const joined = `${text}\n\n${next.text}`;
      if (next.topicId !== first.topicId || joined.length > MAX_MESSAGE_CHARS) {
        break;
      }
      const shift = text.length + 2;
      entities = [
        ...entities,
        ...next.entities.map((entity) => ({ ...entity, offset: entity.offset + shift })),
      ];
      text = joined;
      count += 1;
    }
  }
  return {
    batch: { topicId: first.topicId, text, entities, count },
    rest: queue.slice(count),
    waitMs: 0,
  };
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
    kind:
      record.kind === "human" || record.kind === "link" || record.kind === "user"
        ? record.kind
        : "peer",
    text: record.text,
    topicId: typeof record.topicId === "number" ? record.topicId : null,
    messageId: typeof record.messageId === "number" ? record.messageId : 0,
    broadcast: record.broadcast === true,
    nudge: typeof record.nudge === "string" ? record.nudge : null,
  };
}

/**
 * Does this line end a `tg wait` for `employee`? Everything does but a
 * plain broadcast: one that does not start `<role>:` or `@<role>`, with
 * the employee's role or its own id, the prefix rule of `routeInbound`. It
 * is still delivered, and printed with the next line that does wake, but it
 * costs no turn by itself (#323).
 *
 * @param {InboxLine} line
 * @param {string} employee
 * @returns {boolean}
 */
export function wakes(line, employee) {
  if (line.kind !== "peer" || !line.broadcast) {
    return true;
  }
  const named = addressee(line.text);
  return named !== null && (named === employee || named === roleOf(employee));
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
 * A user's line also shows the Telegram message id, which is what
 * `tg reply --to` answers: `21:02:11 user:4711 (msg 932): <text>`.
 *
 * @param {InboxLine} line
 * @returns {string}
 */
export function formatLine(line) {
  const when = line.ts === 0 ? "--:--:--" : new Date(line.ts).toISOString().slice(11, 19);
  // The mark comes from `kind` alone, never from anything in the text.
  const mark = line.kind === "human" ? "*" : " ";
  const msg = line.kind === "user" ? ` (msg ${String(line.messageId)})` : "";
  return `${when}${mark}${visible(line.from)}${msg}: ${visible(line.text)}`;
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

/** Hangul fillers: letters by category, blank on screen. */
const HANGUL_FILLERS = new Set([0x115f, 0x1160, 0x3164, 0xffa0]);

/**
 * Characters that change how text around them is shown without being seen
 * themselves. All of Unicode's format characters (`\p{Cf}`): bidirectional
 * overrides and isolates, which can make text read in a different order
 * than it is (the Trojan Source class); zero-width characters, which can
 * hide inside a word; and the tag characters U+E0000–E007F, which spell out
 * ASCII nobody sees, so a message can show "LGTM" and carry a prompt for
 * the agents reading it (found in review of #39). Plus the blank-rendering
 * Hangul fillers, and the supplementary variation selectors, which can
 * carry hidden bytes the same way. The sixteen ordinary variation
 * selectors stay: emoji need them.
 *
 * @param {string} char
 * @param {number} code its code point
 * @returns {boolean}
 */
function isInvisible(char, code) {
  return (
    /\p{Cf}/u.test(char) ||
    HANGUL_FILLERS.has(code) ||
    (code >= 0xe0000 && code <= 0xe007f) ||
    (code >= 0xe0100 && code <= 0xe01ef)
  );
}

/**
 * Text with nothing in it that can fake a line or move the cursor.
 *
 * An inbox line is one line on an agent's terminal, and its first
 * characters say who spoke: `*` is the operator. A message containing a
 * newline and `HH:MM:SS*Ente: …` would otherwise print as a second line
 * the operator never wrote, and an ESC sequence could move the cursor up
 * and overwrite one (found in review of #28). So line breaks become `⏎`,
 * ESC becomes `␛`, a tab a space, and any other control, bidi override
 * or other invisible character `�`, in every message, from anyone.
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
    } else if (isControl(code) || isInvisible(char, code)) {
      out += "�";
    } else {
      out += char;
    }
  }
  return out;
}
