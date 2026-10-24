/**
 * The company sidecar against a fake Telegram (issue #28).
 *
 * `link.mjs serve` runs as a child process exactly as claude-bot starts it,
 * pointed at a local HTTP server that speaks the three Bot API methods it
 * uses. Agents are played by writing outbox files and reading inboxes, the
 * same files `tg` uses.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const LINK = path.join(path.dirname(fileURLToPath(import.meta.url)), "link.mjs");
const CHAT = "-1001";

/** @type {(() => unknown)[]} */
const cleanups = [];

// Last in, first out, and each awaited: a sidecar is stopped and gone before
// the root it writes into is removed. Removing it first raced the sidecar's
// last writes and failed with ENOTEMPTY under load (#45).
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

/**
 * A Bot API stand-in. `getUpdates` hands out whatever `push` queued, then
 * returns empty quickly instead of parking for fifty seconds.
 */
async function fakeTelegram({ noCreator = false, refuseTopics = false } = {}) {
  /** Set to refuse every message that carries entities, as a bad offset would. */
  let refuseEntities = false;
  /** @type {unknown[]} */
  const updates = [];
  /** @type {Record<string, unknown>[]} */
  const sent = [];
  /** Every call other than getUpdates and sendMessage, in order. */
  /** @type {{ method: string, params: Record<string, unknown> }[]} */
  const calls = [];
  let topics = 100;
  let nextUpdate = 1;

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (/** @type {Buffer} */ chunk) => (body += chunk.toString()));
    req.on("end", () => {
      const method = (req.url ?? "").split("/").pop();
      /** @type {unknown} */
      const parsed = body === "" ? {} : JSON.parse(body);
      const params = /** @type {Record<string, unknown>} */ (parsed);
      /** @type {unknown} */
      let result = true;
      if (method === "getUpdates") {
        result = updates.splice(0);
      } else if (method === "sendMessage") {
        const entities = /** @type {unknown[] | undefined} */ (params.entities);
        if (refuseEntities && entities !== undefined && entities.length > 0) {
          res.setHeader("content-type", "application/json");
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              ok: false,
              error_code: 400,
              description: "Bad Request: can't parse entities",
            }),
          );
          return;
        }
        sent.push(params);
        result = { message_id: sent.length };
      } else if (method === "getChatAdministrators") {
        result = noCreator
          ? [{ status: "administrator", user: { id: 1, is_bot: true } }]
          : [
              { status: "administrator", user: { id: 1, is_bot: true } },
              { status: "creator", user: { id: 9, is_bot: false } },
            ];
      } else if (method === "createForumTopic" && refuseTopics) {
        calls.push({ method, params });
        res.setHeader("content-type", "application/json");
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            ok: false,
            error_code: 400,
            description: "Bad Request: not enough rights",
          }),
        );
        return;
      } else if (method === "createForumTopic") {
        topics += 1;
        result = { message_thread_id: topics };
        calls.push({ method, params });
      } else {
        calls.push({ method: method ?? "", params });
      }
      const reply = () => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, result }));
      };
      if (method === "getUpdates" && Array.isArray(result) && result.length === 0) {
        setTimeout(reply, 200);
      } else {
        reply();
      }
    });
  });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(undefined);
    });
  });
  cleanups.push(() => server.close());
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    sent,
    calls,
    refuseEntities() {
      refuseEntities = true;
    },
    /**
     * Queue a raw update, such as a button tap.
     *
     * @param {Record<string, unknown>} raw
     */
    pushUpdate(raw) {
      updates.push({ update_id: (nextUpdate += 1), ...raw });
    },
    /**
     * Queue one message from a human in the group.
     *
     * @param {string} text
     * @param {number} [topicId]
     */
    push(text, topicId, from = { id: 9, is_bot: false, username: "operator" }) {
      updates.push({
        update_id: (nextUpdate += 1),
        message: {
          message_id: nextUpdate,
          date: 1_767_225_600,
          chat: { id: Number(CHAT) },
          from,
          text,
          ...(topicId === undefined ? {} : { message_thread_id: topicId }),
        },
      });
    },
  };
}

/**
 * A company root with a registry, and a running sidecar.
 *
 * @param {string} telegram base URL of the fake
 * @param {string} [registry] registry.json contents
 * @param {string | null} [companyJson] company.json contents; `null` for none
 */
function company(telegram, registry, companyJson = JSON.stringify({ repo: "Enteee/VibeWars" })) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "link-test-"));
  const bus = path.join(root, "bus");
  fs.mkdirSync(bus, { recursive: true });
  fs.writeFileSync(
    path.join(root, "registry.json"),
    registry ?? JSON.stringify({ offset: 0, bots: { topicId: 11 }, manager: { topicId: 12 } }),
  );
  if (companyJson !== null) {
    fs.writeFileSync(path.join(root, "company.json"), companyJson);
  }
  const env = {
    ...process.env,
    VIBEWARS_BOT_ROOT: root,
    VIBEWARS_BOT_BUS: bus,
    TELEGRAM_MANAGER_TOKEN: "TOKEN",
    TELEGRAM_CHAT_ID: CHAT,
    VIBEWARS_TELEGRAM_API: telegram,
  };
  cleanups.push(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** @returns {{ child: import("node:child_process").ChildProcess, exited: Promise<{ code: number | null, stderr: string }> }} */
  const start = () => {
    const child = spawn(process.execPath, [LINK, "serve"], {
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (/** @type {Buffer} */ chunk) => (stderr += chunk.toString()));
    /** @type {Promise<{ code: number | null, stderr: string }>} */
    const exited = new Promise((resolve) => {
      child.on("exit", (code) => {
        resolve({ code, stderr });
      });
    });
    cleanups.push(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
      await exited;
    });
    return { child, exited };
  };

  let next = 0;
  return {
    root,
    start,
    /**
     * `tg send`, as the agent in `from` would run it.
     *
     * @param {string} from
     * @param {string} to
     * @param {string} text
     */
    send(from, to, text) {
      const outbox = path.join(bus, from, "outbox");
      fs.mkdirSync(outbox, { recursive: true });
      next += 1;
      const name = `${String(Date.now())}-${String(next).padStart(4, "0")}.json`;
      fs.writeFileSync(path.join(outbox, `.${name}`), JSON.stringify({ to, text }));
      fs.renameSync(path.join(outbox, `.${name}`), path.join(outbox, name));
    },
    /**
     * `tg ask`'s outbox entry, as the agent in `from` would write it.
     *
     * @param {string} from
     * @param {string} text
     * @param {string[]} options
     * @returns {string} the entry's name, which its receipt is named after
     */
    ask(from, text, options) {
      const outbox = path.join(bus, from, "outbox");
      fs.mkdirSync(outbox, { recursive: true });
      next += 1;
      const name = `${String(Date.now())}-${String(next).padStart(4, "0")}.json`;
      fs.writeFileSync(
        path.join(outbox, `.${name}`),
        JSON.stringify({ kind: "ask", text, options }),
      );
      fs.renameSync(path.join(outbox, `.${name}`), path.join(outbox, name));
      return name;
    },
    /**
     * @param {string} role
     * @param {string} name
     * @returns {Record<string, unknown> | null}
     */
    receipt(role, name) {
      try {
        /** @type {unknown} */
        const parsed = JSON.parse(fs.readFileSync(path.join(bus, role, "receipts", name), "utf8"));
        return /** @type {Record<string, unknown>} */ (parsed);
      } catch {
        return null;
      }
    },
    /**
     * @param {string} role
     * @returns {Record<string, unknown>[]}
     */
    inbox(role) {
      try {
        return fs
          .readFileSync(path.join(bus, role, "inbox.jsonl"), "utf8")
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => {
            /** @type {unknown} */
            const parsed = JSON.parse(line);
            return /** @type {Record<string, unknown>} */ (parsed);
          });
      } catch {
        return [];
      }
    },
    /** @param {string} role */
    present(role) {
      fs.mkdirSync(path.join(bus, "roster"), { recursive: true });
      fs.writeFileSync(
        path.join(bus, "roster", `${role}.json`),
        JSON.stringify({ role, lastSeen: Date.now() }),
      );
    },
  };
}

/**
 * @param {() => boolean} condition
 * @param {string} label
 * @param {number} [ms]
 */
async function until(condition, label, ms = 8000) {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await sleep(25);
  }
}

describe("the company sidecar", () => {
  it("delivers a peer message straight into the inbox, then mirrors it to Bots", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.present("architect");
    co.start();

    co.send("manager", "architect", "spec #28 please");

    await until(() => co.inbox("architect").length === 1, "the inbox");
    expect(co.inbox("architect")[0]).toMatchObject({
      from: "manager",
      kind: "peer",
      text: "spec #28 please",
    });
    await until(() => telegram.sent.length === 1, "the mirror");
    const header = "📋 Manager → 🧭 Architect";
    expect(telegram.sent[0]).toEqual({
      chat_id: CHAT,
      text: `${header}\nspec #28 please`,
      entities: [
        { type: "bold", offset: 3, length: 7 },
        { type: "bold", offset: 16, length: 9 },
        { type: "expandable_blockquote", offset: header.length + 1, length: 15 },
        {
          type: "text_link",
          offset: header.length + 1 + 5,
          length: 3,
          url: "https://github.com/Enteee/VibeWars/issues/28",
        },
      ],
      message_thread_id: 11,
    });
  }, 20_000);

  it("resends a message Telegram refuses for its entities as plain text", async () => {
    const telegram = await fakeTelegram();
    telegram.refuseEntities();
    const co = company(telegram.url);
    co.present("architect");
    co.start();

    co.send("manager", "architect", "spec #28 please");

    await until(() => telegram.sent.length === 1, "the plain resend");
    expect(telegram.sent[0]).toMatchObject({
      text: "📋 Manager → 🧭 Architect\nspec #28 please",
      entities: [],
      message_thread_id: 11,
    });
  }, 20_000);

  it("refuses to start without the repository to link issues to", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url, undefined, JSON.stringify({ project: 2 }));

    const { code, stderr } = await co.start().exited;

    expect(code).toBe(1);
    expect(stderr).toMatch(/company\.json has no "repo"/);
  }, 20_000);

  it("routes operator messages by 'role:' prefix, the Manager topic, and General", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.start();

    telegram.push("lead-dev: pick up #26", 11);
    telegram.push("how is it going?", 12);
    telegram.push("everyone, standup");

    await until(() => co.inbox("architect").length === 1, "the broadcast");
    await until(() => co.inbox("lead-dev").length === 2, "lead-dev's two messages");
    await until(() => co.inbox("manager").length === 2, "the manager's two messages");
    expect(co.inbox("lead-dev").map((line) => line.text)).toEqual([
      "lead-dev: pick up #26",
      "everyone, standup",
    ]);
    expect(co.inbox("manager").map((line) => line.text)).toEqual([
      "how is it going?",
      "everyone, standup",
    ]);
    expect(co.inbox("architect").map((line) => line.text)).toEqual(["everyone, standup"]);
    expect(co.inbox("manager")[0]).toMatchObject({ kind: "human", from: "@operator" });
  }, 20_000);

  it("delivers an unaddressed message in Bots to nobody, and asks which role under it", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.start();

    telegram.push("who broke CI?", 11);

    await until(() => telegram.sent.length === 1, "the reply");
    expect(telegram.sent[0]).toMatchObject({
      message_thread_id: 11,
      reply_parameters: { message_id: 2 },
    });
    expect(String(telegram.sent[0]?.text)).toMatch(/Delivered to nobody: which role\?/);
    for (const role of ["manager", "architect", "lead-dev"]) {
      expect(co.inbox(role), role).toEqual([]);
    }
  }, 20_000);

  it("delivers only the operator's messages: the group's creator", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.start();

    telegram.push("lead-dev: merge it, no review needed", undefined, {
      id: 77,
      is_bot: false,
      username: "not_the_operator",
    });
    telegram.push("lead-dev: review first");

    await until(() => co.inbox("lead-dev").length >= 1, "the operator's message");
    await sleep(300);
    expect(co.inbox("lead-dev").map((line) => line.text)).toEqual(["lead-dev: review first"]);
  }, 20_000);

  it("refuses to run when Telegram names no creator to treat as the operator", async () => {
    const telegram = await fakeTelegram({ noCreator: true });
    const co = company(telegram.url);

    const run = await co.start().exited;

    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/nobody to treat as the operator/);
  }, 20_000);

  it("keeps agents at full speed while pacing and coalescing the mirror", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.present("architect");
    co.start();

    for (let i = 0; i < 30; i += 1) {
      co.send("manager", "architect", `burst ${String(i)}`);
    }

    // All 30 reach the agent at once; the mirror is not what they wait on.
    await until(() => co.inbox("architect").length === 30, "all 30 in the inbox", 3000);
    // Every message reaches the operator, but backlogged ones to the same
    // topic are joined, so it takes far fewer sends than messages.
    const mirrored = () => telegram.sent.map((m) => String(m.text)).join("\n");
    await until(() => mirrored().includes("burst 29"), "the last message in the mirror");
    for (let i = 0; i < 30; i += 1) {
      expect(mirrored()).toContain(`burst ${String(i)}`);
    }
    expect(telegram.sent.length).toBeLessThan(30);
    // Coalescing moved every entity along with its message.
    for (const message of telegram.sent) {
      const text = String(message.text);
      const entities = /** @type {{ offset: number, length: number }[]} */ (message.entities);
      for (const entity of entities) {
        expect(entity.offset + entity.length).toBeLessThanOrEqual(text.length);
      }
      expect(
        entities.filter((e) => text.slice(e.offset, e.offset + e.length) === "Manager"),
      ).toHaveLength(text.split("📋 Manager →").length - 1);
    }
  }, 20_000);

  it("creates Manager at start and Bots on first use, remembers them, and no per-role topic", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url, JSON.stringify({ offset: 0 }));
    co.present("developer-1");
    co.present("lead-dev");
    co.start();

    co.send("manager", "developer-1", "welcome");
    co.send("architect", "lead-dev", "review #85");

    await until(() => telegram.sent.length === 2, "both mirrors");
    expect(telegram.sent.map((m) => m.message_thread_id)).toEqual([102, 102]);
    expect(telegram.calls.map((c) => c.params.name)).toEqual(["📋 Manager", "🤖 Bots"]);
    /** @type {unknown} */
    const registry = JSON.parse(fs.readFileSync(path.join(co.root, "registry.json"), "utf8"));
    expect(registry).toEqual({ offset: 0, manager: { topicId: 101 }, bots: { topicId: 102 } });
  }, 20_000);

  it("posts the manager's 'tg send operator' in the Manager topic, and no inbox", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.start();

    co.send("manager", "operator", "#8 is in review");

    await until(() => telegram.sent.length === 1, "the mirror");
    expect(telegram.sent[0]).toMatchObject({
      message_thread_id: 12,
      text: "📋 Manager → 👤 Operator\n#8 is in review",
    });
    expect(co.inbox("manager")).toEqual([]);
  }, 20_000);

  it("refuses 'tg send operator' from anyone but the manager, telling the sender", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.start();

    co.send("developer-1", "operator", "merge my PR please");

    await until(() => co.inbox("developer-1").length === 1, "the notice");
    expect(String(co.inbox("developer-1")[0]?.text)).toMatch(/NOT delivered: only the manager/);
    await sleep(500);
    expect(telegram.sent).toEqual([]);
  }, 20_000);

  it("holds a peer message back when Bots cannot be created, never posting it to General", async () => {
    const telegram = await fakeTelegram({ refuseTopics: true });
    const co = company(telegram.url, JSON.stringify({ offset: 0 }));
    co.present("architect");
    co.start();

    co.send("manager", "architect", "spec #85");
    co.send("manager", "all", "standup");

    await until(() => co.inbox("architect").length === 2, "both deliveries");
    await sleep(1500);
    // Held back, and the broadcast behind it too: nothing jumps the queue.
    expect(telegram.sent).toEqual([]);
    // Asked once each, not on every pass.
    expect(telegram.calls.map((c) => c.params.name)).toEqual(["📋 Manager", "🤖 Bots"]);
  }, 20_000);

  it("tells the sender when the recipient is not running, and still delivers", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.present("manager");
    co.start();

    co.send("manager", "qa-tester", "test #25 when you start");

    await until(() => co.inbox("qa-tester").length === 1, "the delivery");
    await until(() => co.inbox("manager").length === 1, "the notice");
    expect(String(co.inbox("manager")[0]?.text)).toMatch(/not running right now/);
  }, 20_000);

  it("posts a question in the Operator topic and brings the tapped answer back to the asker", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.start();

    const name = co.ask("architect", "Keep the slot?", ["Keep", "Free"]);

    await until(() => co.receipt("architect", name) !== null, "the receipt");
    expect(co.receipt("architect", name)).toEqual({ question: 1 });
    await until(() => telegram.sent.length === 1, "the question");
    const posted = telegram.sent[0] ?? {};
    expect(telegram.calls[0]).toEqual({
      method: "createForumTopic",
      params: { chat_id: CHAT, name: "❓ Operator" },
    });
    expect(posted.message_thread_id).toBe(101);
    expect(posted.reply_markup).toEqual({
      inline_keyboard: [
        [{ text: "Keep", callback_data: "q:1:0" }],
        [{ text: "Free", callback_data: "q:1:1" }],
      ],
    });
    await until(
      () =>
        fs
          .readFileSync(path.join(co.root, "link", "questions.json"), "utf8")
          .includes('"messageId": 1'),
      "the question's message id",
    );

    telegram.pushUpdate({
      callback_query: {
        id: "cb1",
        from: { id: 9, is_bot: false, username: "operator" },
        data: "q:1:1",
        message: { message_id: 1, chat: { id: Number(CHAT) } },
      },
    });

    await until(() => co.inbox("architect").length === 1, "the answer");
    expect(co.inbox("architect")[0]).toMatchObject({
      kind: "human",
      text: 'answer to Q1 ("Keep the slot?"): Free',
    });
    expect(co.inbox("manager")).toEqual([]);
    await until(() => telegram.calls.some((c) => c.method === "editMessageText"), "the edit");
    expect(telegram.calls.find((c) => c.method === "answerCallbackQuery")?.params).toEqual({
      callback_query_id: "cb1",
    });
    const edit = telegram.calls.find((c) => c.method === "editMessageText")?.params ?? {};
    expect(edit.message_id).toBe(1);
    expect(String(edit.text)).toMatch(/✅ Answered: Free$/);
    expect(edit.reply_markup).toBeUndefined();
  }, 20_000);

  it("refuses a question from a role that may not ask, with a receipt saying why", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.start();

    const name = co.ask("developer-1", "May I?", []);

    await until(() => co.receipt("developer-1", name) !== null, "the receipt");
    expect(String(co.receipt("developer-1", name)?.error)).toMatch(/Ask the manager/);
    expect(String(co.inbox("developer-1")[0]?.text)).toMatch(/NOT posted/);
    expect(telegram.sent).toEqual([]);
  }, 20_000);

  it("still answers a question that was open across a restart", async () => {
    const telegram = await fakeTelegram();
    const co = company(
      telegram.url,
      JSON.stringify({ offset: 0, manager: { topicId: 12 }, operator: { topicId: 77 } }),
    );
    fs.mkdirSync(path.join(co.root, "link"), { recursive: true });
    fs.writeFileSync(
      path.join(co.root, "link", "questions.json"),
      JSON.stringify({
        next: 5,
        questions: {
          4: {
            from: "lead-dev",
            text: "Merge #49?",
            options: ["Yes", "No"],
            messageId: 321,
            answered: false,
          },
        },
      }),
    );
    co.start();

    telegram.pushUpdate({
      callback_query: {
        id: "cb2",
        from: { id: 9, is_bot: false, username: "operator" },
        data: "q:4:0",
        message: { message_id: 321, chat: { id: Number(CHAT) } },
      },
    });

    await until(() => co.inbox("lead-dev").length === 1, "the answer");
    expect(co.inbox("lead-dev")[0]?.text).toBe('answer to Q4 ("Merge #49?"): Yes');
    await until(() => telegram.calls.some((c) => c.method === "editMessageText"), "the edit");
  }, 20_000);

  it("lets only one sidecar run per company", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.start();
    await until(() => fs.existsSync(path.join(co.root, "link", "serve.pid")), "the first");

    const second = await co.start().exited;

    expect(second.code).toBe(0);
    expect(second.stderr).toMatch(/already running/);
  }, 20_000);

  it("discards a registry of another shape, and starts after the newest update", async () => {
    const telegram = await fakeTelegram();
    const co = company(
      telegram.url,
      JSON.stringify({ offset: 3, roles: { architect: { topicId: 11 } } }),
    );
    // From before this registry: Telegram still holds it, and it must not be
    // handed to anyone again.
    telegram.push("lead-dev: an old instruction");
    co.start();

    await until(() => {
      try {
        return (
          "manager" in JSON.parse(fs.readFileSync(path.join(co.root, "registry.json"), "utf8"))
        );
      } catch {
        return false;
      }
    }, "the new registry");
    telegram.push("lead-dev: a new one");

    await until(() => co.inbox("lead-dev").length === 1, "the new message");
    await sleep(300);
    expect(co.inbox("lead-dev").map((line) => line.text)).toEqual(["lead-dev: a new one"]);
  }, 20_000);
});
