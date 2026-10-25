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
 *                     every employee's outbox: a peer message goes straight into
 *                     its recipients' inboxes, then a copy goes to Telegram
 *                     for the operator, paced so one bot stays under
 *                     Telegram's group rate limit. A second `serve` exits at
 *                     once, so any `claude-bot` may try to start it.
 *   presence <employee>
 *                     one per running agent. Keeps the employee's roster
 *                     entry fresh, which is what `tg roster` reads, and
 *                     removes it when the agent's session ends. Holds no
 *                     token.
 *
 * Inboxes, outboxes and roster entries are per employee (#62), and who is
 * employed is `staff.json`, re-read on every pass: a message to a role
 * reaches each of its employees.
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
import { takeLock } from "./instance-lock.mjs";
import { openJailDir, withJailDir } from "./jail-fs.mjs";
import { readRoster } from "./presence.mjs";
import {
  SUPPORT_BUSY,
  SYSTEM,
  TOPIC_TITLES,
  admitAll,
  admitUser,
  deliverPeer,
  deliverSystem,
  formatMirror,
  formatQuestion,
  inboxesOf,
  readInbox,
  skipNudge,
  isReadyOutboxEntry,
  mirrorTopic,
  obj,
  parseQuestions,
  parseRegistry,
  planSends,
  retryDelay,
  routeAnswer,
  routeInbound,
} from "./protocol.mjs";
import { roleOf, staffReader } from "./staff.mjs";

/**
 * Something for the mirror to send: a peer message still to be formatted,
 * an item for the Operator topic (a question, an edit of one, a hint), a
 * reply already bound for a topic (the "which role?" under a message
 * addressed to nobody), or support's answer to a user, for the Support
 * topic.
 *
 * @typedef {{ peer: import("./protocol.mjs").Mirrored }
 *   | { operator: Omit<import("./protocol.mjs").Queued, "topicId"> }
 *   | { reply: import("./protocol.mjs").Queued }
 *   | { support: import("./protocol.mjs").SupportReply }} Outgoing
 */

/** How long to leave a topic Telegram would not create before asking again. */
const TOPIC_RETRY_MS = 60_000;

/** Overridable so link.test.mjs can stand a fake Telegram in for the real one. */
const API = process.env.VIBEWARS_TELEGRAM_API ?? "https://api.telegram.org";

/** How long getUpdates parks server-side. Telegram's documented maximum. */
const LONG_POLL_SECONDS = 50;

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
 * @returns {{
 *   root: string, bus: string, link: string, registry: string, company: string,
 *   questions: string, staff: string,
 * }}
 */
function paths() {
  const root = required("VIBEWARS_BOT_ROOT");
  return {
    root,
    bus: required("VIBEWARS_BOT_BUS"),
    link: path.join(root, "link"),
    registry: path.join(root, "registry.json"),
    company: path.join(root, "company.json"),
    questions: path.join(root, "link", "questions.json"),
    staff: path.join(root, "staff.json"),
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
export async function api(token, method, params = {}) {
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
  if (parsed.dropped.length > 0) {
    console.error(
      `[link] registry.json: dropped ${parsed.dropped.join(", ")}, which is not the current ` +
        "shape; topics are created again as they are needed, and old per-role topics are " +
        "left for you to delete",
    );
  }
  return parsed.registry;
}

/**
 * The repository the mirror links `#<n>` to, from the company.json that
 * claude-llc-init writes and hubd reads. There is no default: a sidecar that
 * guessed would link every issue to the wrong place (ADR-0016).
 *
 * @param {string} file
 * @returns {string} `owner/name`
 */
function readRepo(file) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(`${file} is missing or not JSON; run claude-llc-init, which writes it.`);
  }
  const repo = obj(parsed).repo;
  if (typeof repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(`${file} has no "repo": "owner/name"; run claude-llc-init, which writes it.`);
  }
  return repo;
}

/**
 * @param {string} file
 * @param {unknown} value
 * @returns {void}
 */
function writeAtomically(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/**
 * @param {string} file
 * @returns {import("./protocol.mjs").QuestionStore}
 */
function readQuestions(file) {
  const parsed = parseQuestions(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
  if ("error" in parsed) {
    throw new Error(`${file}: ${parsed.error}`);
  }
  return parsed.store;
}

/**
 * @param {string} bus
 * @param {string} employee
 * @returns {{ dir: string, inbox: string, outbox: string, receipts: string, roster: string }}
 */
function busPaths(bus, employee) {
  const dir = path.join(bus, employee);
  return {
    dir,
    inbox: path.join(dir, "inbox.jsonl"),
    outbox: path.join(dir, "outbox"),
    // The sidecar's answer to each `tg ask`, named after its outbox entry.
    receipts: path.join(dir, "receipts"),
    roster: path.join(bus, "roster", `${employee}.json`),
  };
}

/** The most an outbox entry may be: one message. */
const OUTBOX_MAX_BYTES = 64 * 1024;

/**
 * An employee's bus directory, and its outbox and inbox in it. Below the employee's
 * directory is the jail's, so it goes through jail-fs.mjs (#329). What
 * the jail made unusable there is logged, and costs only that employee.
 *
 * @param {string} bus
 * @param {string} employee
 * @returns {void}
 */
function ensureBus(bus, employee) {
  const at = busPaths(bus, employee);
  fs.mkdirSync(at.dir, { recursive: true });
  fs.mkdirSync(path.dirname(at.roster), { recursive: true });
  try {
    withJailDir(at.dir, "outbox", { create: true }, () => undefined);
    withJailDir(at.dir, "", {}, (dir) => {
      dir.create("inbox.jsonl");
    });
  } catch (error) {
    refused(employee, "outbox/ or inbox.jsonl", error);
  }
}

/**
 * Append to an employee's inbox. One the jail made unwritable, such as a
 * symlink, costs that employee its messages and nothing else: logged, never
 * thrown into the delivery of everyone else's.
 *
 * @param {string} bus
 * @param {string} employee
 * @param {import("./protocol.mjs").InboxLine} line
 * @returns {void}
 */
function appendInbox(bus, employee, line) {
  ensureBus(bus, employee);
  try {
    withJailDir(busPaths(bus, employee).dir, "", {}, (dir) => {
      dir.append("inbox.jsonl", `${JSON.stringify(line)}\n`);
    });
  } catch (error) {
    refused(employee, "inbox.jsonl", error);
  }
}

/**
 * @param {string} employee
 * @param {string} site
 * @param {unknown} error
 * @returns {void}
 */
function refused(employee, site, error) {
  console.error(
    `[link] ${employee}: refused ${site}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

/**
 * The ready entries of an outbox, each read whole and removed: `take` gets
 * each one's name and parsed contents, and says whether it was handled.
 * An entry that is not a small regular file is refused and removed; one
 * that does not parse yet is left for the next pass.
 *
 * @param {string} dir the employee's (or the system's) bus directory
 * @param {string} employee for the log
 * @param {(name: string, payload: unknown) => void} take
 * @returns {boolean} whether anything was taken
 */
function takeOutbox(dir, employee, take) {
  /** @type {import("./jail-fs.mjs").JailDir} */
  let outbox;
  try {
    outbox = openJailDir(dir, "outbox");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      refused(employee, "outbox/", error);
    }
    return false;
  }
  let moved = false;
  try {
    for (const name of outbox.list().filter(isReadyOutboxEntry).sort()) {
      /** @type {string} */
      let text;
      try {
        text = outbox.readSmall(name, OUTBOX_MAX_BYTES);
      } catch (error) {
        refused(employee, `outbox/${name}`, error);
        try {
          outbox.remove(name);
        } catch (removal) {
          refused(employee, `outbox/${name} (remove)`, removal);
        }
        continue;
      }
      /** @type {unknown} */
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        // A half-written file from a `tg send` still in flight; next pass.
        continue;
      }
      // Removed before it is delivered: an outbox the jail made unwritable
      // would otherwise deliver the same message on every pass.
      try {
        outbox.remove(name);
      } catch (removal) {
        refused(employee, `outbox/${name} (remove)`, removal);
        continue;
      }
      take(name, payload);
      moved = true;
    }
  } finally {
    outbox.close();
  }
  return moved;
}

/**
 * Employees with a running agent right now, from their presence heartbeats.
 *
 * @param {string} bus
 * @param {ReadonlyMap<string, string>} employees
 * @returns {Set<string>}
 */
function present(bus, employees) {
  const roster = readRoster(path.join(bus, "roster"), [...employees.keys()], Date.now());
  return new Set([...roster].filter(([, entry]) => entry.fresh).map(([employee]) => employee));
}

/* -------------------------------------------------------------------------- */
/* serve                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The company's state as the sidecar holds it. Topic ids are added as the
 * topics are first needed; the getUpdates offset advances with every batch.
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
    this.repo = readRepo(at.company);
    this.questions = readQuestions(at.questions);
    /** The operator's Telegram user id; set by `findOperator` before serving. */
    this.operatorId = 0;
    /** @type {Map<import("./protocol.mjs").TopicName, number>} when to ask for a topic again */
    this.topicRetryAt = new Map();
    /** Who is employed, employee id to role: `staff.json` as of this call. */
    this.employees = staffReader(at.staff, (problem, kept) => {
      console.error(
        `[link] staff.json: ${problem}; still delivering to ${[...kept.keys()].join(", ") || "nobody"}`,
      );
    });
  }

  saveQuestions() {
    writeAtomically(this.at.questions, this.questions);
  }

  /**
   * One of the company's topics, created on first use. The bot must be an
   * admin with `can_manage_topics`, which the company bot already is. One
   * Telegram would not create is not asked for again for TOPIC_RETRY_MS, so
   * what waits on it is held back without hammering the API.
   *
   * @param {import("./protocol.mjs").TopicName} name
   * @returns {Promise<number | null>} `null` if the topic does not exist yet
   */
  async topic(name) {
    const known = this.registry[name]?.topicId;
    if (known !== undefined) {
      return known;
    }
    if (Date.now() < (this.topicRetryAt.get(name) ?? 0)) {
      return null;
    }
    try {
      const created = obj(
        await api(this.token, "createForumTopic", {
          chat_id: this.chatId,
          name: TOPIC_TITLES[name],
        }),
      );
      if (typeof created.message_thread_id !== "number") {
        throw new Error("no message_thread_id in the reply");
      }
      this.registry[name] = { topicId: created.message_thread_id };
      this.save();
      console.error(`[link] created the ${TOPIC_TITLES[name]} topic`);
      return created.message_thread_id;
    } catch (error) {
      this.topicRetryAt.set(name, Date.now() + TOPIC_RETRY_MS);
      console.error(
        `[link] could not create the ${TOPIC_TITLES[name]} topic: ${error instanceof Error ? error.message : ""}`,
      );
      return null;
    }
  }

  /**
   * Who the operator is: the group's creator. Only their messages are
   * delivered, and only they get the `*` mark (review of #28), so this is
   * asked of Telegram rather than taken from config that could drift.
   *
   * @returns {Promise<void>}
   */
  async findOperator() {
    const admins = /** @type {unknown[]} */ (
      await api(this.token, "getChatAdministrators", { chat_id: this.chatId })
    );
    for (const raw of admins) {
      const member = obj(raw);
      const user = obj(member.user);
      if (member.status === "creator" && typeof user.id === "number") {
        this.operatorId = user.id;
        return;
      }
    }
    throw new Error(
      "the company group has no creator Telegram will name, so there is nobody to " +
        "treat as the operator. Nothing is delivered without one.",
    );
  }

  save() {
    writeAtomically(this.at.registry, this.registry);
  }
}

/**
 * Operator messages, from Telegram into the inboxes they are for.
 *
 * Answers in the Operator topic go to `routeAnswer` first; everything else
 * to `routeInbound`. A user's message in the Support topic also has to get
 * past `admitUser`, its sender's own cap, and then `admitAll`, every
 * user's together. Both are in memory: a restart forgets who was flooding,
 * which costs at most one more minute of their messages.
 *
 * @param {Company} company
 * @param {Outgoing[]} mirror Operator-topic edits and hints, and "which role?" replies, go here
 * @returns {Promise<never>}
 */
async function pollInbound(company, mirror) {
  let backoff = 1000;
  /** @type {Map<string, import("./protocol.mjs").UserFlood>} keyed by `user:<id>` */
  const floods = new Map();
  /** @type {import("./protocol.mjs").SupportFlood | undefined} */
  let flood;
  for (;;) {
    try {
      const updates = /** @type {unknown[]} */ (
        await api(company.token, "getUpdates", {
          offset: company.registry.offset,
          timeout: LONG_POLL_SECONDS,
          allowed_updates: ["message", "callback_query"],
        })
      );
      const operatorTopicId = company.registry.operator?.topicId ?? null;
      const managerTopicId = company.registry.manager?.topicId;
      const supportTopicId = company.registry.support?.topicId;
      for (const raw of updates) {
        const update = obj(raw);
        if (typeof update.update_id === "number") {
          company.registry.offset = update.update_id + 1;
        }
        const answer = routeAnswer(raw, company.questions, {
          chatId: company.chatId,
          operatorId: company.operatorId,
          operatorTopicId,
          now: Date.now(),
        });
        if (answer !== null) {
          await answerOperator(company, mirror, answer);
          continue;
        }
        const routed = routeInbound(raw, {
          chatId: company.chatId,
          operatorId: company.operatorId,
          roles: ROLES,
          ...(managerTopicId === undefined ? {} : { managerTopicId }),
          ...(operatorTopicId === null ? {} : { operatorTopicId }),
          ...(supportTopicId === undefined ? {} : { supportTopicId }),
        });
        if (routed === null) {
          continue;
        }
        if (routed.line.kind === "user") {
          const now = Date.now();
          const gate = admitUser(floods.get(routed.line.from), now);
          if (gate.warn) {
            // Quoted, though the id is a number Telegram gave us (#115).
            console.error(
              `[link] support: dropping messages from ${JSON.stringify(routed.line.from)}, ` +
                "over the per-user cap",
            );
          }
          if (!gate.admit) {
            floods.set(routed.line.from, gate.state);
            continue;
          }
          // Only a message the global cap also lets through counts against
          // its sender: one dropped for everyone's flood is not theirs.
          const all = admitAll(flood, now);
          flood = all.state;
          if (all.busy !== null) {
            console.error(
              `[link] support: dropped ${String(all.busy)} user message(s) since the last ` +
                "such line, over the cap for all users together",
            );
            mirror.push({ support: { text: SUPPORT_BUSY, replyTo: routed.line.messageId } });
          }
          if (!all.admit) {
            continue;
          }
          floods.set(routed.line.from, gate.state);
        }
        const employees = company.employees();
        for (const employee of new Set(routed.to.flatMap((to) => inboxesOf(to, employees)))) {
          appendInbox(company.at.bus, employee, routed.line);
        }
        if (routed.whichRole !== null && routed.line.topicId !== null) {
          mirror.push({
            reply: {
              topicId: routed.line.topicId,
              text: routed.whichRole,
              entities: [],
              replyTo: routed.line.messageId,
            },
          });
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
 * Carry out what `routeAnswer` decided. The answered state is saved before
 * anything is sent, so a crash cannot deliver one answer twice.
 *
 * @param {Company} company
 * @param {Outgoing[]} mirror
 * @param {NonNullable<ReturnType<typeof routeAnswer>>} answer
 * @returns {Promise<void>}
 */
async function answerOperator(company, mirror, answer) {
  if (answer.answered !== null) {
    company.questions.questions[String(answer.answered.n)] = answer.answered.question;
    company.saveQuestions();
  }
  for (const { employee, line } of answer.deliveries) {
    appendInbox(company.at.bus, employee, line);
  }
  for (const { method, params } of answer.immediate) {
    try {
      await api(company.token, method, params);
    } catch (error) {
      console.error(`[link] ${error instanceof Error ? error.message : method}`);
    }
  }
  for (const item of answer.paced) {
    mirror.push({ operator: item });
  }
}

/**
 * Every employee's outbox: delivered locally at once, then queued for
 * Telegram. A fired employee's is no longer read.
 *
 * @param {Company} company
 * A question (`tg ask`) is numbered here, saved, and answered with a
 * receipt that `tg ask` prints: the Q number, or why it was refused.
 *
 * @param {Outgoing[]} mirror filled here, emptied by `mirrorOut`
 * @returns {Promise<never>}
 */
async function drainOutboxes(company, mirror) {
  for (;;) {
    let moved = false;
    const employees = company.employees();
    for (const sender of employees.keys()) {
      moved =
        takeOutbox(busPaths(company.at.bus, sender).dir, sender, (name, payload) => {
          const delivered = deliverPeer(payload, {
            from: sender,
            roles: ROLES,
            employees,
            present: present(company.at.bus, employees),
            now: Date.now(),
          });
          for (const { employee, line } of delivered.deliveries) {
            appendInbox(company.at.bus, employee, line);
          }
          if (delivered.notice !== null) {
            appendInbox(company.at.bus, sender, delivered.notice);
          }
          if (delivered.mirror !== null) {
            mirror.push({ peer: delivered.mirror });
          }
          if (delivered.reply !== null) {
            mirror.push({ support: delivered.reply });
          }
          if (obj(payload).kind === "ask") {
            /** @type {Record<string, unknown>} */
            let receipt = { error: delivered.notice?.text ?? "refused" };
            if (delivered.question !== null) {
              const n = company.questions.next;
              company.questions.next += 1;
              company.questions.questions[String(n)] = {
                ...delivered.question,
                messageId: null,
                answered: false,
              };
              company.saveQuestions();
              mirror.push({ operator: { ...formatQuestion(n, delivered.question), question: n } });
              receipt = { question: n };
            }
            try {
              withJailDir(
                busPaths(company.at.bus, sender).dir,
                "receipts",
                { create: true },
                (dir) => {
                  dir.writeAtomic(name, `${JSON.stringify(receipt, null, 2)}\n`);
                },
              );
            } catch (error) {
              refused(sender, `receipts/${name}`, error);
            }
          }
        }) || moved;
    }
    moved = drainSystem(company, mirror) || moved;
    if (!moved) {
      await sleep(250);
    }
  }
}

/**
 * The lines an employee has not read yet: its inbox from its cursor, read
 * without following links a jail may have planted. Unreadable is none.
 *
 * @param {string} bus
 * @param {string} employee
 * @returns {import("./protocol.mjs").InboxLine[]}
 */
function unreadOf(bus, employee) {
  try {
    return withJailDir(busPaths(bus, employee).dir, "", {}, (dir) => {
      let cursor = 0;
      try {
        cursor = Number.parseInt(dir.readSmall("cursor", 64).trim(), 10) || 0;
      } catch {
        // Never read: everything is unread.
      }
      return readInbox(dir.readSmall("inbox.jsonl", INBOX_READ_MAX_BYTES), cursor).lines;
    });
  } catch {
    return [];
  }
}

/** The most of an inbox read to tell whether a nudge is still unread. */
const INBOX_READ_MAX_BYTES = 16 * 1024 * 1024;

/**
 * The system outbox (#23): what host-side code says to everyone, such as a
 * daemon crash-looping. Delivered to every employee as a `link` line and
 * mirrored to General under the System header. Only the host can write
 * here; no jail binds this directory.
 *
 * @param {Company} company
 * @param {Outgoing[]} mirror
 * @returns {boolean} whether anything was delivered
 */
function drainSystem(company, mirror) {
  return takeOutbox(path.join(company.at.bus, SYSTEM), SYSTEM, (_name, payload) => {
    const delivered = deliverSystem(payload, {
      employees: company.employees(),
      now: Date.now(),
    });
    let sent = 0;
    for (const { employee, line } of delivered.deliveries) {
      if (line.nudge !== null && skipNudge(unreadOf(company.at.bus, employee), line.nudge)) {
        continue;
      }
      appendInbox(company.at.bus, employee, line);
      sent += 1;
    }
    if (delivered.mirror !== null && sent > 0) {
      mirror.push({ peer: delivered.mirror });
    }
  });
}

/**
 * The copy of every peer message the operator reads in Telegram, paced by
 * `planSends`. Losing one of these loses nothing an agent needed: it is
 * already in the recipient's inbox.
 *
 * @param {Company} company
 * Questions, edits and hints go only to the Operator topic: one that cannot
 * be created holds them back rather than posting them in General.
 *
 * @param {Outgoing[]} mirror
 * @returns {Promise<never>}
 */
async function mirrorOut(company, mirror) {
  /** @type {import("./protocol.mjs").Queued[]} */
  let queue = [];
  /** @type {number[]} */
  let sent = [];
  let blockedUntil = 0;

  for (;;) {
    // Resolve destinations to topics in arrival order. One whose topic does
    // not exist yet, and cannot be created now, is held back with everything
    // behind it, never posted to General instead: nothing jumps the queue.
    while (mirror.length > 0) {
      const outgoing = /** @type {Outgoing} */ (mirror[0]);
      if ("reply" in outgoing) {
        queue.push(outgoing.reply);
        mirror.shift();
        continue;
      }
      /** @type {import("./protocol.mjs").TopicName | null} */
      let name = "operator";
      if ("peer" in outgoing) {
        name = mirrorTopic(outgoing.peer);
      } else if ("support" in outgoing) {
        name = "support";
      }
      const topicId = name === null ? null : await company.topic(name);
      if (name !== null && topicId === null) {
        break;
      }
      if ("peer" in outgoing) {
        queue.push({ topicId, ...formatMirror(outgoing.peer, { repo: company.repo }) });
      } else if ("support" in outgoing) {
        // Plain text, no entities: what support writes is shown as written.
        const { text, replyTo } = outgoing.support;
        queue.push({ topicId, text, entities: [], ...(replyTo === null ? {} : { replyTo }) });
      } else {
        queue.push({ topicId, ...outgoing.operator });
      }
      mirror.shift();
    }

    const now = Date.now();
    sent = sent.filter((at) => now - at < 60_000);
    const plan = planSends(queue, sent, now, { blockedUntil });
    if (plan.batch === null) {
      await sleep(Math.min(Math.max(plan.waitMs, 100), 5000));
      continue;
    }
    const { batch } = plan;
    /** @type {unknown} */
    let failure;
    try {
      await sendBatch(company, batch);
    } catch (error) {
      failure = error;
    }
    // Entities are a new way to be refused (a bad offset, too many of them
    // in a coalesced batch). A message plain text would have delivered must
    // not be lost to its formatting, so retry once without it.
    if (failure !== undefined && !isRetryAfter(failure) && batch.entities.length > 0) {
      console.error(`[link] mirror: ${describe(failure)}; resending without formatting`);
      failure = undefined;
      try {
        await sendBatch(company, { ...batch, entities: [] });
      } catch (error) {
        failure = error;
      }
    }
    if (failure === undefined) {
      sent.push(Date.now());
      queue = plan.rest;
    } else if (failure instanceof TelegramError && failure.retryAfter !== undefined) {
      blockedUntil = Date.now() + failure.retryAfter * 1000;
    } else {
      console.error(
        `[link] mirror dropped ${String(batch.count)} message(s): ${describe(failure)}`,
      );
      queue = plan.rest;
    }
  }
}

/**
 * @param {unknown} error
 * @returns {boolean} whether Telegram asked us to wait and try again
 */
function isRetryAfter(error) {
  return error instanceof TelegramError && error.retryAfter !== undefined;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * No preview card under a message (#125): the company's messages carry
 * several issue and PR links, and the card for the first one is often
 * bigger than the text. An edit is rendered afresh, so it needs this too.
 */
const NO_LINK_PREVIEW = { is_disabled: true };

/**
 * Send one planned batch: a new message, or an edit of a posted question.
 * A posted question's message id is recorded, so its buttons can be matched.
 *
 * @param {Company} company
 * @param {import("./protocol.mjs").Queued} batch
 * @returns {Promise<void>}
 */
async function sendBatch(company, batch) {
  if (batch.edit !== undefined) {
    // No reply_markup: editing without one is what removes the buttons.
    await api(company.token, "editMessageText", {
      chat_id: company.chatId,
      message_id: batch.edit,
      text: batch.text,
      entities: batch.entities,
      link_preview_options: NO_LINK_PREVIEW,
    });
    return;
  }
  const result = obj(
    await api(company.token, "sendMessage", {
      chat_id: company.chatId,
      text: batch.text,
      entities: batch.entities,
      link_preview_options: NO_LINK_PREVIEW,
      ...(batch.topicId === null ? {} : { message_thread_id: batch.topicId }),
      ...(batch.replyMarkup === undefined ? {} : { reply_markup: batch.replyMarkup }),
      ...(batch.replyTo === undefined ? {} : { reply_parameters: { message_id: batch.replyTo } }),
    }),
  );
  const question =
    batch.question === undefined ? undefined : company.questions.questions[String(batch.question)];
  if (question !== undefined && typeof result.message_id === "number") {
    question.messageId = result.message_id;
    company.saveQuestions();
  }
}

/** @returns {Promise<void>} */
async function serve() {
  const at = paths();
  const token = required("TELEGRAM_MANAGER_TOKEN");
  const chatId = required("TELEGRAM_CHAT_ID");
  fs.mkdirSync(at.link, { recursive: true });

  // Telegram allows one getUpdates consumer per token; a second gets
  // "409 Conflict" and the company goes deaf.
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
  await company.findOperator();
  const employees = company.employees();
  for (const employee of employees.keys()) {
    ensureBus(at.bus, employee);
  }
  console.error(`[link] serving ${String(employees.size)} employees on one bot`);
  // The operator writes to the manager in the Manager topic, and users to
  // support in the Support topic, so both have to exist before either role
  // has said anything.
  await company.topic("manager");
  await company.topic("support");

  /** @type {Outgoing[]} */
  const mirror = [];
  // A question saved but never posted, because the sidecar stopped first.
  for (const [n, question] of Object.entries(company.questions.questions)) {
    if (question.messageId === null && !question.answered) {
      mirror.push({ operator: { ...formatQuestion(Number(n), question), question: Number(n) } });
    }
  }
  await Promise.race([
    pollInbound(company, mirror),
    drainOutboxes(company, mirror),
    mirrorOut(company, mirror),
  ]);
}

/* -------------------------------------------------------------------------- */
/* presence                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Keep `employee`'s roster entry fresh while its agent runs.
 *
 * claude-bot `exec`s into bwrap, so its EXIT trap never runs, and bwrap's
 * --die-with-parent does not reach us because we are outside the jail. So
 * claude-bot tells us its PID — which `exec` hands to bwrap, so it stays
 * alive exactly as long as the session does — and we exit when it goes.
 *
 * @param {string} employee
 * @returns {Promise<void>}
 */
async function presence(employee) {
  const at = paths();
  ensureBus(at.bus, employee);
  const { roster } = busPaths(at.bus, employee);
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
      `${JSON.stringify({ employee, pid: process.pid, lastSeen: Date.now() }, null, 2)}\n`,
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
  const [command, employee] = process.argv.slice(2);
  if (command === "serve") {
    await serve();
  } else if (
    command === "presence" &&
    employee !== undefined &&
    ROLES.includes(roleOf(employee) ?? "")
  ) {
    await presence(employee);
  } else {
    console.error("usage: link.mjs serve | link.mjs presence <employee>");
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
