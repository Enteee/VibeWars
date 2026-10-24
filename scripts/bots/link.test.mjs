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

/** @type {(() => void)[]} */
const cleanups = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

/**
 * A Bot API stand-in. `getUpdates` hands out whatever `push` queued, then
 * returns empty quickly instead of parking for fifty seconds.
 */
async function fakeTelegram() {
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
        sent.push(params);
        result = { message_id: sent.length };
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
    push(text, topicId) {
      updates.push({
        update_id: (nextUpdate += 1),
        message: {
          message_id: nextUpdate,
          date: 1_767_225_600,
          chat: { id: Number(CHAT) },
          from: { id: 9, is_bot: false, username: "operator" },
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
    registry ?? JSON.stringify({ offset: 0, roles: { architect: { topicId: 11 } } }),
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
    cleanups.push(() => child.kill("SIGTERM"));
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
  it("delivers a peer message straight into the inbox, then mirrors it to the topic", async () => {
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

  it("refuses to start without the repository to link issues to", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url, undefined, JSON.stringify({ project: 2 }));

    const { code, stderr } = await co.start().exited;

    expect(code).toBe(1);
    expect(stderr).toMatch(/company\.json has no "repo"/);
  }, 20_000);

  it("routes operator messages by topic, by 'role:' prefix, and to everyone otherwise", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.start();

    telegram.push("only for you", 11);
    telegram.push("lead-dev: pick up #26");
    telegram.push("everyone, standup");

    await until(() => co.inbox("manager").length === 1, "the broadcast");
    await until(() => co.inbox("lead-dev").length === 2, "lead-dev's two messages");
    expect(co.inbox("architect").map((line) => line.text)).toEqual([
      "only for you",
      "everyone, standup",
    ]);
    expect(co.inbox("lead-dev").map((line) => line.text)).toEqual([
      "lead-dev: pick up #26",
      "everyone, standup",
    ]);
    expect(co.inbox("manager")[0]).toMatchObject({ kind: "human", from: "@operator" });
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

  it("creates a role's topic the first time it is messaged, and remembers it", async () => {
    const telegram = await fakeTelegram();
    const co = company(telegram.url);
    co.present("developer-1");
    co.start();

    co.send("manager", "developer-1", "welcome");

    await until(() => telegram.sent.length === 1, "the mirror");
    expect(telegram.sent[0]?.message_thread_id).toBe(101);
    /** @type {unknown} */
    const registry = JSON.parse(fs.readFileSync(path.join(co.root, "registry.json"), "utf8"));
    expect(registry).toMatchObject({ roles: { "developer-1": { topicId: 101 } } });
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
      JSON.stringify({ offset: 0, roles: {}, operator: { topicId: 77 } }),
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

  it("refuses a per-role-bot registry, saying how to fix it", async () => {
    const telegram = await fakeTelegram();
    const co = company(
      telegram.url,
      JSON.stringify({ managerOffset: 3, roles: { architect: { token: "t", topicId: 11 } } }),
    );

    const run = await co.start().exited;

    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/before the company had one bot/);
  }, 20_000);
});
