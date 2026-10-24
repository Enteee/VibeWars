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
 * @property {{ topicId: number }} [operator] the Operator topic; absent until
 *   the first question creates it, exactly as for a role's topic
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
  /** @type {Registry} */
  const registry = {
    offset: typeof record.offset === "number" ? record.offset : 0,
    roles: topics,
  };
  if ("operator" in record) {
    const operator = obj(record.operator);
    if (typeof operator.topicId !== "number" || Object.keys(operator).length !== 1) {
      return { error: 'registry.json\'s "operator" must be { "topicId": <number> }.' };
    }
    registry.operator = { topicId: operator.topicId };
  }
  return { registry };
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
 * The Operator topic is not routed here at all: `routeAnswer` owns it, and
 * a message there that fell through to "everyone" would hand every agent
 * an answer meant for one.
 *
 * @param {unknown} raw one getUpdates entry
 * @param {{ chatId: string, topics: Map<number, string>, roles: readonly string[], operatorTopicId?: number }} context
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
 * A question for the operator (`kind: "ask"`, from `tg ask`) is delivered to
 * nobody: it comes back as `question` for the sidecar to number and post.
 * Only ASKERS may ask, and a malformed one is refused with a notice to the
 * sender, before anything reaches Telegram.
 *
 * @param {unknown} raw the outbox file's contents
 * @param {{ from: string, roles: readonly string[], present: ReadonlySet<string>, now: number }} context
 * @returns {{
 *   deliveries: { role: string, line: InboxLine }[],
 *   notice: InboxLine | null,
 *   mirror: Mirrored | null,
 *   question: Ask | null,
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

  if (message.kind === "ask") {
    const refused = refuseQuestion(context.from, text, message.options);
    if (refused !== null) {
      return {
        deliveries: [],
        notice: fromLink(`your question was NOT posted: ${refused}`),
        mirror: null,
        question: null,
      };
    }
    const options = /** @type {string[]} */ (message.options);
    return {
      deliveries: [],
      notice: null,
      mirror: null,
      question: { from: context.from, text, options },
    };
  }

  if (to !== "all" && !context.roles.includes(to)) {
    return {
      deliveries: [],
      notice: fromLink(
        `your last message was NOT delivered: "${to}" is not one of this company's roles. ` +
          `Roles: ${context.roles.join(", ")}`,
      ),
      mirror: null,
      question: null,
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
    mirror: { from: context.from, to, text },
    question: null,
  };
}

/* -------------------------------------------------------------------------- */
/* The mirror's format                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A peer message as delivered, before it is formatted for Telegram.
 *
 * @typedef {object} Mirrored
 * @property {string} from the sending role
 * @property {string} to a role, or "all"
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
  "developer-1": { emoji: "🛠", name: "Developer 1" },
  "developer-2": { emoji: "🔧", name: "Developer 2" },
  "asset-designer": { emoji: "🎨", name: "Asset Designer" },
  "cicd-engineer": { emoji: "⚙️", name: "CI/CD Engineer" },
  "lead-dev": { emoji: "🔍", name: "Lead Dev" },
  "perf-sec-qa": { emoji: "🛡", name: "Perf/Sec/QA" },
  "qa-tester": { emoji: "🧪", name: "QA Tester" },
};

/** How a broadcast's recipient is shown. */
const EVERYONE = { emoji: "📢", name: "Everyone" };

/**
 * @param {string} role
 * @returns {{ emoji: string, name: string }}
 */
function styleOf(role) {
  const style = ROLE_STYLE[role];
  if (style === undefined) {
    // deliverPeer refuses unknown roles, so reaching this is a bug, not data.
    throw new Error(`no ROLE_STYLE for "${role}"`);
  }
  return style;
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
 *     🧭 Architect → 🛠 Developer 1
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
  const sender = styleOf(message.from);
  const recipient = message.to === "all" ? EVERYONE : styleOf(message.to);

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
 * @property {string} from the asking role
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
 * and act on one. A tap counts only if a human pressed it, the rule
 * `routeInbound` applies to messages. A second tap on an answered question
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
 * @param {{ chatId: string, operatorTopicId: number | null, now: number }} context
 * @returns {{
 *   deliveries: { role: string, line: InboxLine }[],
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
   * @returns {{ role: string, line: InboxLine }}
   */
  const deliver = (n, question, who, answer, followUp) => ({
    role: question.from,
    line: {
      ts: context.now,
      from: who,
      kind: "human",
      text: `${followUp ? "follow-up to" : "answer to"} Q${String(n)} ("${excerpt(question.text, 40)}"): ${answer}`,
      topicId: context.operatorTopicId,
      messageId: 0,
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
    const data = typeof query.data === "string" ? /^q:(\d+):(\d+)$/.exec(query.data) : null;
    const n = Number(data?.[1]);
    const question = data === null ? undefined : store.questions[String(n)];
    const option = question?.options[Number(data?.[2])];
    // Forged or stale data: stop the button's spinner, change nothing.
    if (question === undefined || option === undefined || question.messageId === null) {
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
  if (from.is_bot !== false || typeof message.text !== "string" || message.text === "") {
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
