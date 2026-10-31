/**
 * `tg wait` and the context ceiling (#321): an agent past it is told to end
 * its turn instead of waiting, and never loses a message for it.
 */
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const TG = path.join(path.dirname(fileURLToPath(import.meta.url)), "tg.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * An employee's bus directory, with `context` as its context.json if given
 * and `messages` in its inbox. The sidecar's heartbeat is `sidecar`, epoch
 * ms, fresh unless given; `null` for none (#583).
 *
 * @param {{ context?: unknown, messages?: string[], employee?: string, sidecar?: number | null }} [options]
 */
function bus({ context, messages = [], employee = "developer", sidecar = Date.now() } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-"));
  dirs.push(root);
  if (sidecar !== null) {
    fs.mkdirSync(path.join(root, "_alive"));
    fs.writeFileSync(
      path.join(root, "_alive", "sidecar.json"),
      JSON.stringify({ lastSeen: sidecar }),
    );
  }
  const dir = path.join(root, employee);
  fs.mkdirSync(dir);
  if (context !== undefined) {
    fs.writeFileSync(path.join(dir, "context.json"), JSON.stringify(context));
  }
  fs.writeFileSync(
    path.join(dir, "inbox.jsonl"),
    messages.map((text) => `${JSON.stringify({ ts: 1, from: "manager", text })}\n`).join(""),
  );
  const env = {
    ...process.env,
    VIBEWARS_BOT_EMPLOYEE: employee,
    VIBEWARS_BOT_ROLE: employee.split("@")[0],
    VIBEWARS_BOT_BUS: root,
  };
  return { root, dir, env };
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {number} timeout seconds
 */
function wait(env, timeout) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [TG, "wait", "--timeout", String(timeout)], {
    env,
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, ms: Date.now() - started };
}

describe("tg wait --timeout (#325)", () => {
  it("caps a longer wait at 540 s and says so first", () => {
    const { env } = bus({ context: { tokens: 134_000, ceiling: 120_000 } });

    expect(wait(env, 9999).stdout).toMatch(/^\(tg wait: --timeout capped at 540 s\)\n/);
  });
});

const OVER = { tokens: 134_000, ceiling: 120_000 };

/** What an empty wait adds for a developer, whose work arrives in Ready (#1694). */
const IDLE =
  " You are idle: END YOUR TURN now. A message, or a card arriving in Ready, starts your next turn.";

describe("tg wait, past the context ceiling", () => {
  it("returns at once with an empty inbox, and says to end the turn", () => {
    const { env } = bus({ context: OVER });

    const result = wait(env, 20);

    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(10_000);
    expect(result.stdout).toBe(
      "Your context is over the ceiling (134k of 120k). Commit and push any WIP, put anything that lives only in this conversation on the card or in a memory, then END YOUR TURN. The next turn starts fresh; your inbox is kept.\n",
    );
  });

  it("prints the messages already waiting, and nothing else", () => {
    const { env } = bus({ context: OVER, messages: ["review #12"] });

    const result = wait(env, 20);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/manager: review #12\n$/);
    expect(result.stdout).not.toMatch(/ceiling/);
  });

  it("stops waiting when the context passes the ceiling mid-wait", async () => {
    const { dir, env } = bus({ context: { tokens: 0, ceiling: 120_000 } });
    const child = spawn(process.execPath, [TG, "wait", "--timeout", "20"], { env });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    const exited = once(child, "exit");
    setTimeout(() => {
      fs.writeFileSync(path.join(dir, "context.json"), JSON.stringify(OVER));
    }, 1500);

    await exited;

    expect(child.exitCode).toBe(0);
    expect(stdout).toMatch(/^Your context is over the ceiling \(134k of 120k\)/);
  }, 15_000);
});

describe("tg wait, under the ceiling or without a context file", () => {
  it("waits as before when there is no file", () => {
    const { env } = bus();

    const result = wait(env, 1);

    expect(result.stdout).toBe(`(nothing new in 1s)${IDLE}\n`);
    expect(result.ms).toBeGreaterThanOrEqual(1000);
  });

  it("waits as before when the file is not JSON", () => {
    const { dir, env } = bus();
    fs.writeFileSync(path.join(dir, "context.json"), "{");

    expect(wait(env, 1).stdout).toBe(`(nothing new in 1s)${IDLE}\n`);
  });

  it("waits as before under the ceiling", () => {
    const { env } = bus({ context: { tokens: 119_999, ceiling: 120_000 } });

    expect(wait(env, 1).stdout).toBe(`(nothing new in 1s)${IDLE}\n`);
  });
});

describe("tg wait, and an idle agent (#1694)", () => {
  it("leaves the idle marker when it finds nothing", () => {
    const { dir, env } = bus();

    wait(env, 1);

    expect(fs.existsSync(path.join(dir, "idle"))).toBe(true);
  });

  it("tells a role with no column that only a message wakes it", () => {
    const { env } = bus({ employee: "manager" });

    expect(wait(env, 1).stdout).toBe(
      "(nothing new in 1s) You are idle: END YOUR TURN now. A message starts your next turn.\n",
    );
  });

  it("says the ceiling, not idle, past it, and leaves no marker", () => {
    const { dir, env } = bus({ context: OVER });

    expect(wait(env, 1).stdout).toMatch(/^Your context is over the ceiling/);
    expect(fs.existsSync(path.join(dir, "idle"))).toBe(false);
  });

  it("takes an earlier idle back when a message ends the wait", () => {
    const { dir, env } = bus({ messages: ["review #12"] });
    fs.writeFileSync(path.join(dir, "idle"), "");

    expect(wait(env, 1).stdout).toMatch(/manager: review #12\n$/);
    expect(fs.existsSync(path.join(dir, "idle"))).toBe(false);
  });
});

describe("tg wait, and General broadcasts (#323)", () => {
  /**
   * @param {string} text
   * @param {boolean} broadcast
   * @returns {string}
   */
  const line = (text, broadcast) =>
    `${JSON.stringify({ ts: 1, from: "manager", kind: "peer", text, broadcast })}\n`;

  /**
   * @param {Record<string, string | undefined>} env
   * @param {string[]} args
   */
  const tg = (env, args) =>
    spawnSync(process.execPath, [TG, ...args], { env, encoding: "utf8" }).stdout;

  it("times out on a plain broadcast, says so, and leaves it unread", () => {
    const { dir, env } = bus();
    fs.appendFileSync(path.join(dir, "inbox.jsonl"), line("FYI #9 merged", true));

    expect(tg(env, ["wait", "--timeout", "1"])).toBe(
      `(nothing for you in 1s; 1 General messages queued, tg inbox shows them)${IDLE}\n`,
    );
    expect(tg(env, ["inbox"])).toContain("FYI #9 merged");
  });

  it("is ended by a later directed line, which prints both in order", () => {
    const { dir, env } = bus();
    const inbox = path.join(dir, "inbox.jsonl");
    fs.appendFileSync(inbox, line("FYI #9 merged", true));
    fs.appendFileSync(inbox, line("developer: take #12", true));
    fs.appendFileSync(inbox, line("direct", false));

    const out = tg(env, ["wait", "--timeout", "1"]);

    expect(out.indexOf("FYI #9 merged")).toBeGreaterThan(-1);
    expect(out.indexOf("FYI #9 merged")).toBeLessThan(out.indexOf("take #12"));
    expect(out.indexOf("take #12")).toBeLessThan(out.indexOf("direct"));
  });

  it("wakes a further employee on its role's name and its own, not another's (#62)", () => {
    const { dir, env } = bus({ employee: "developer@2" });
    const inbox = path.join(dir, "inbox.jsonl");
    fs.appendFileSync(inbox, line("developer@3: take #13", true));
    expect(tg(env, ["wait", "--timeout", "1"])).toMatch(/^\(nothing for you in 1s/);

    fs.appendFileSync(inbox, line("developer: who takes #12?", true));
    expect(tg(env, ["wait", "--timeout", "1"])).toContain("who takes #12?");

    fs.appendFileSync(inbox, line("developer@2: take #12", true));
    expect(tg(env, ["wait", "--timeout", "1"])).toContain("developer@2: take #12");
  });

  it("--all wakes on a plain broadcast", () => {
    const { dir, env } = bus();
    fs.appendFileSync(path.join(dir, "inbox.jsonl"), line("FYI #9 merged", true));

    expect(tg(env, ["wait", "--timeout", "1", "--all"])).toContain("FYI #9 merged");
  });
});

describe("tg wait, and a company reboot (#345)", () => {
  it("ends within seconds on the announcement, prints it and advances the cursor", async () => {
    const { dir, env } = bus();
    const started = Date.now();
    const child = spawn(process.execPath, [TG, "wait", "--timeout", "30"], { env });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    // deliverSystem's line: a link from the system, not a broadcast.
    const announcement = {
      ts: 1,
      from: "system",
      kind: "link",
      text: "Company reboot by 12:41: load #345. Run `company ready`.",
      topicId: null,
      messageId: 0,
      broadcast: false,
    };
    await new Promise((resolve) => setTimeout(resolve, 1500));
    fs.appendFileSync(path.join(dir, "inbox.jsonl"), `${JSON.stringify(announcement)}\n`);
    const code = await new Promise((/** @type {(code: number | null) => void} */ resolve) => {
      child.on("exit", resolve);
    });

    expect(code).toBe(0);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(out).toContain("Company reboot by 12:41");
    const again = spawnSync(process.execPath, [TG, "inbox"], { env, encoding: "utf8" });
    expect(again.stdout).not.toContain("Company reboot by");
  });
});

describe("tg roster (#62)", () => {
  it("lists every employee online, in seat order, and roles nobody runs", () => {
    const { root, env } = bus({ employee: "developer@2" });
    const roster = path.join(root, "roster");
    fs.mkdirSync(roster);
    const now = Date.now();
    for (const [employee, lastSeen] of /** @type {const} */ ([
      ["developer@10", now],
      ["developer@2", now],
      ["developer", now],
      ["architect", now - 120_000],
    ])) {
      fs.writeFileSync(
        path.join(roster, `${employee}.json`),
        JSON.stringify({ employee, lastSeen }),
      );
    }
    fs.writeFileSync(path.join(roster, "not an id.json"), JSON.stringify({ lastSeen: now }));

    const out = spawnSync(process.execPath, [TG, "roster"], { env, encoding: "utf8" }).stdout;

    const lines = out.split("\n");
    expect(lines.filter((l) => l.startsWith("developer")).map((l) => l.split(/\s+/)[0])).toEqual([
      "developer",
      "developer@2",
      "developer@10",
    ]);
    expect(out).toMatch(/^developer@2 +online, \d+s ago \(you\)$/m);
    expect(lines).toContain("architect        stale");
    expect(lines).toContain("manager          not hired yet");
    expect(out).not.toContain("not an id");
  });
});

describe("tg, while the Telegram sidecar is down (#583)", () => {
  /**
   * @param {Record<string, string | undefined>} env
   * @param {string[]} args
   */
  const tg = (env, args) => spawnSync(process.execPath, [TG, ...args], { env, encoding: "utf8" });

  it.each([
    ["no heartbeat", null, "no heartbeat"],
    ["a heartbeat 31 s old", 31_000, "last seen 31 s ago"],
  ])("send exits 2 with %s, says so, and still queues the message", (_name, age, seen) => {
    const { dir, env } = bus({ sidecar: age === null ? null : Date.now() - age });

    const result = tg(env, ["send", "manager", "hello"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe(
      `tg: the Telegram sidecar is down (${seen}); your message is queued but nobody is reading. Tell the operator: claude-llc status\n`,
    );
    const queued = fs.readdirSync(path.join(dir, "outbox"));
    expect(queued).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "outbox", queued[0] ?? ""), "utf8"))).toEqual({
      to: "manager",
      text: "hello",
    });
  });

  it("broadcast exits 2 too, and send with a fresh heartbeat exits 0", () => {
    expect(tg(bus({ sidecar: null }).env, ["broadcast", "hi"]).status).toBe(2);
    expect(tg(bus().env, ["send", "manager", "hello"]).status).toBe(0);
  });

  it("wait prints what was already waiting, and exits 0, as ever", () => {
    const { env } = bus({ sidecar: null, messages: ["developer: are you there?"] });

    const result = tg(env, ["wait", "--timeout", "20"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("are you there?");
  });

  it("wait warns once, blocks to its timeout rather than busy-looping, then exits 2", () => {
    const { env } = bus({ sidecar: null });

    const started = Date.now();
    const result = tg(env, ["wait", "--timeout", "2"]);

    expect(Date.now() - started).toBeGreaterThanOrEqual(2000);
    expect(result.status).toBe(2);
    expect(result.stderr).toBe(
      "tg: the Telegram sidecar is down (no heartbeat); nothing can arrive until it is back. Tell the operator: claude-llc status\n",
    );
    expect(result.stdout).toBe("(nothing for you in 2s; the sidecar is still down)\n");
  });

  it("wait past the context ceiling still says to end the turn while the sidecar is down", () => {
    const { env } = bus({ sidecar: null, context: OVER });

    const result = tg(env, ["wait", "--timeout", "20"]);

    expect(result.stdout).toMatch(/END YOUR TURN/);
  });

  it("inbox still works", () => {
    const { env } = bus({ sidecar: null, messages: ["hello"] });

    const result = tg(env, ["inbox"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("hello");
  });
});
