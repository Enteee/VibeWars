import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { auth, childEnv, plan, verdictLine } from "./auth.mjs";
import { paths } from "./creds.mjs";

/** @typedef {import("./creds.mjs").Identity} Identity */
/** @typedef {import("./doctor.mjs").Row} Row */
/** @typedef {import("./auth.mjs").Deps} Deps */

const TOKEN = "123456:sentinel-token-that-must-never-be-printed";

const CHAT = "-1001234567890";

/** What telegram answers, for a world whose group is fit (or not). */
function telegramAnswer(
  /** @type {string} */ url,
  /** @type {{ forum: boolean, topics: boolean, chats: string[], title?: string }} */ group,
) {
  const method = /\/([A-Za-z]+)\?/.exec(url)?.[1] ?? /\/([A-Za-z]+)$/.exec(url)?.[1];
  const result = {
    getMe: { id: 7, username: "vw_bot" },
    getUpdates: group.chats.map((id, n) => ({
      update_id: n + 1,
      my_chat_member: { chat: { id: Number(id), type: "supergroup" } },
    })),
    getChat: { type: "supergroup", title: group.title ?? "VW", is_forum: group.forum },
    getChatMember: { status: "administrator", can_manage_topics: group.topics },
  }[method ?? ""];
  return { ok: true, json: () => Promise.resolve({ ok: true, result }) };
}

/** @type {Identity} */
const NONE = { state: "not set up", who: null, expiry: null, scopes: null };

/**
 * @param {string} who
 * @returns {Identity}
 */
const ok = (who) => ({ state: "ok", who, expiry: null, scopes: null });

/**
 * @param {Partial<Record<"claude" | "github api" | "github push" | "telegram" | "telegram group", Identity>>} states
 * @param {Partial<Record<string, boolean | null>>} [operators]
 * @returns {Row[]}
 */
function rows(states, operators = {}) {
  return ["claude", "github api", "github push", "telegram", "telegram group"].map((name) => ({
    name,
    identity: /** @type {Record<string, Identity>} */ (states)[name] ?? NONE,
    stored: `/c/${name}`,
    operators: operators[name] ?? null,
  }));
}

const TG_OK = rows({
  claude: ok("c"),
  "github api": ok("g"),
  "github push": ok("g"),
  telegram: ok("@vw"),
  "telegram group": ok("VW"),
});

/** @type {string[]} */
const homes = [];

afterEach(() => {
  for (const home of homes.splice(0)) {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

/**
 * A fake world: a credential home on disk, children that do what `act` says,
 * and every line that would reach the terminal.
 *
 * @param {object} options
 * @param {Row[][]} options.tables what collect returns, in turn
 * @param {Partial<Record<string, Identity[]>>} [options.checks] what each re-check returns, in turn
 * @param {(command: string, args: string[], root: string) => import("./auth.mjs").Spawned} [options.act]
 * @param {string | null} [options.answer]
 * @param {boolean} [options.getMeOk]
 * @param {boolean} [options.tty]
 * @param {{ forum: boolean, topics: boolean, chats: string[], title?: string }} [options.group] what telegram says of the chats the bot sees
 * @param {string[]} [options.answers] prompt answers after the token
 */
function world({
  tables,
  checks = {},
  act,
  answer = TOKEN,
  getMeOk = true,
  tty = true,
  group = { forum: true, topics: true, chats: [CHAT] },
  answers = ["", "y"],
}) {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "auth-")), "creds");
  homes.push(path.dirname(root));
  /** @type {{ command: string, args: string[], env: Record<string, string>, input?: string }[]} */
  const spawned = [];
  /** @type {string[]} */
  const printed = [];
  /** @type {string[]} */
  const urls = [];
  let sleeps = 0;
  /**
   * @param {string} step
   * @returns {() => Identity}
   */
  const checker = (step) => () => checks[step]?.shift() ?? NONE;
  /** @type {Deps} */
  const deps = {
    root,
    tty,
    env: { PATH: "/bin", HOME: "/home/x", GH_TOKEN: TOKEN, ANTHROPIC_API_KEY: TOKEN },
    spawn: (command, args, env, input) => {
      spawned.push({ command, args, env, input });
      return Promise.resolve(
        act?.(command, args, root) ?? { code: 0, signal: null, missing: false },
      );
    },
    prompt: (question) => {
      printed.push(question);
      return Promise.resolve(question.startsWith("Manager") ? answer : (answers.shift() ?? ""));
    },
    collect: () =>
      Promise.resolve({ rows: tables.length > 1 ? (tables.shift() ?? []) : (tables[0] ?? []) }),
    check: {
      claude: checker("claude"),
      github: checker("github"),
      push: checker("push"),
      telegram: checker("telegram"),
      runners: checker("runners"),
    },
    get: (url) => {
      urls.push(url);
      if (!getMeOk) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ ok: false }) });
      }
      return Promise.resolve(telegramAnswer(url, group));
    },
    sleep: () => {
      sleeps += 1;
      return Promise.resolve();
    },
    out: (line) => printed.push(line),
    err: (line) => printed.push(line),
  };
  return { deps, root, spawned, printed, urls, sleeps: () => sleeps };
}

/** @type {import("./auth.mjs").Spawned} */
const DONE = { code: 0, signal: null, missing: false };

/**
 * ssh-keygen that writes a public key where it was asked to.
 *
 * @param {string} command
 * @param {string[]} args
 * @returns {import("./auth.mjs").Spawned}
 */
function keygen(command, args) {
  if (command === "ssh-keygen") {
    const key = args[args.indexOf("-f") + 1] ?? "";
    fs.writeFileSync(key, "PRIVATE");
    fs.writeFileSync(`${key}.pub`, "ssh-ed25519 AAAAPUBLIC vibewars-company");
  }
  return DONE;
}

describe("plan", () => {
  it("skips ok rows and runs not set up and error ones", () => {
    const steps = plan(
      rows({
        claude: ok("co@x.org"),
        "github api": { ...NONE, state: "error", note: "x" },
        telegram: ok("@vw"),
        "telegram group": ok("VW"),
      }),
      null,
    );
    expect(steps.map((s) => [s.step, s.run])).toEqual([
      ["claude", false],
      ["github", true],
      ["push", true],
      ["telegram", false],
    ]);
  });

  it("runs the telegram step while the bot is ok but its group is not", () => {
    const steps = plan(rows({ telegram: ok("@vw") }), "telegram");
    expect(steps.map((s) => [s.step, s.run])).toEqual([["telegram", true]]);
  });

  it("runs nothing for an ok row that is the operator's, or might be", () => {
    const table = rows(
      { claude: ok("me@x.org"), "github api": ok("me") },
      { claude: true, "github api": null },
    );
    expect(
      plan(table, null)
        .filter((s) => s.run)
        .map((s) => s.step),
    ).toEqual(["push", "telegram"]);
  });

  it("plans only the step named", () => {
    expect(plan(rows({}), "push").map((s) => s.step)).toEqual(["push"]);
  });

  it("calls a push key greeted as someone else a mismatch", () => {
    const [push] = plan(rows({ "github api": ok("company"), "github push": ok("me") }), "push");
    expect(push).toMatchObject({ run: false, mismatch: "me" });
  });
});

describe("verdictLine", () => {
  it("says who is signed in, or what is wrong", () => {
    expect(verdictLine("claude", ok("co@x.org"))).toBe("  ✓ claude   co@x.org (signed in)");
    expect(verdictLine("github", NONE)).toBe("  ✗ github   not set up");
    expect(verdictLine("push", { ...NONE, state: "error", note: "no greeting" })).toBe(
      "  ✗ push     error: no greeting",
    );
  });
});

describe("childEnv", () => {
  it("sets the company's directory and drops every token variable", () => {
    const env = childEnv(
      { PATH: "/bin", GH_TOKEN: "t", CLAUDE_CODE_OAUTH_TOKEN: "t" },
      { GH_CONFIG_DIR: "/c/gh" },
    );
    expect(env).toEqual({ PATH: "/bin", GH_CONFIG_DIR: "/c/gh" });
  });
});

describe("auth", () => {
  it("refuses without a terminal and spawns nothing", async () => {
    const w = world({ tables: [rows({})], tty: false });
    expect(await auth([], w.deps)).toBe(2);
    expect(w.spawned).toEqual([]);
    expect(w.printed.join("\n")).toContain("interactive");
  });

  it("does nothing when everything is signed in, the operator's or not", async () => {
    const all = rows(
      {
        claude: ok("me@x.org"),
        "github api": ok("co"),
        "github push": ok("co"),
        telegram: ok("@vw"),
        "telegram group": ok("VW"),
      },
      { claude: true },
    );
    const w = world({ tables: [all] });
    expect(await auth([], w.deps)).toBe(0);
    expect(w.spawned).toEqual([]);
    expect(w.printed).toContain("  ✓ claude   me@x.org (signed in)");
  });

  it("signs everything in, with the company's directories and no token in any child", async () => {
    const signedIn = rows({
      claude: ok("co@x.org"),
      "github api": ok("co"),
      "github push": ok("co"),
      telegram: ok("@vw_bot"),
      "telegram group": ok("VW"),
    });
    const w = world({
      tables: [rows({}), signedIn],
      checks: {
        claude: [ok("co@x.org")],
        github: [ok("co")],
        push: [{ ...NONE, state: "error", note: "not greeted" }, ok("co"), ok("co")],
        telegram: [ok("@vw_bot")],
      },
      act: keygen,
    });
    expect(await auth([], w.deps)).toBe(0);
    const p = paths(w.root);

    expect(w.spawned.map((s) => s.command)).toEqual(["claude", "gh", "ssh-keygen"]);
    expect(w.spawned[0]?.env.CLAUDE_CONFIG_DIR).toBe(p.claude);
    expect(w.spawned[1]?.env.GH_CONFIG_DIR).toBe(p.gh);
    for (const child of w.spawned) {
      expect(child.env.GH_TOKEN).toBeUndefined();
      expect(child.env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(child.args.join(" ")).not.toContain(TOKEN);
    }
    expect(fs.statSync(p.claude).mode & 0o777).toBe(0o700);
    expect(fs.statSync(p.ssh).mode & 0o777).toBe(0o700);

    expect(fs.readFileSync(p.telegram, "utf8").trim()).toBe(TOKEN);
    expect(fs.statSync(p.telegram).mode & 0o777).toBe(0o600);
    expect(w.urls[0]).toBe(`https://api.telegram.org/bot${TOKEN}/getMe`);
    expect(fs.readFileSync(p.telegramChat, "utf8").trim()).toBe(CHAT);
    expect(fs.statSync(p.telegramChat).mode & 0o777).toBe(0o600);

    const screen = w.printed.join("\n");
    expect(screen).not.toContain(TOKEN);
    expect(screen).not.toContain("PRIVATE");
    expect(screen).toContain("ssh-ed25519 AAAAPUBLIC vibewars-company");
    expect(screen).toContain("while signed in as co");
  });

  it("signs the runners' token in only when named, into its own dir, on stdin (#1890)", async () => {
    const signed = rows({
      claude: ok("c"),
      "github api": ok("co"),
      "github push": ok("co"),
      telegram: ok("@vw"),
      "telegram group": ok("VW"),
    });
    const runnersRow = (/** @type {Identity} */ identity) => ({
      name: "github runners",
      identity,
      stored: "/c/runners-gh",
      operators: null,
    });
    const plain = world({ tables: [[...signed, runnersRow(NONE)]] });
    expect(await auth([], plain.deps)).toBe(0);
    expect(plain.spawned).toEqual([]);

    const w = world({
      tables: [
        [...signed, runnersRow(NONE)],
        [...signed, runnersRow(ok("co"))],
      ],
      checks: { runners: [ok("co")] },
      answers: [TOKEN],
    });
    expect(await auth(["runners"], w.deps)).toBe(0);
    expect(w.spawned).toHaveLength(1);
    const [gh] = w.spawned;
    expect(gh?.command).toBe("gh");
    expect(gh?.args).toContain("--with-token");
    expect(gh?.args.join(" ")).not.toContain(TOKEN);
    expect(gh?.input).toBe(`${TOKEN}\n`);
    expect(gh?.env.GH_CONFIG_DIR).toBe(path.join(w.root, "runners-gh"));
    expect(gh?.env.GH_TOKEN).toBeUndefined();
    expect(w.printed.join("\n")).not.toContain(TOKEN);
  });

  it("writes no telegram token that getMe refuses", async () => {
    const w = world({ tables: [rows({})], getMeOk: false });
    expect(await auth(["telegram"], w.deps)).toBe(1);
    expect(fs.existsSync(paths(w.root).telegram)).toBe(false);
    expect(w.printed.join("\n")).not.toContain(TOKEN);
  });

  it("keeps a group that still checks out and does not poll", async () => {
    const w = world({ tables: [rows({}), TG_OK] });
    fs.mkdirSync(w.root, { recursive: true, mode: 0o700 });
    fs.writeFileSync(paths(w.root).telegramChat, `${CHAT}\n`);
    expect(await auth(["telegram"], w.deps)).toBe(0);
    expect(w.urls.some((u) => u.includes("getUpdates"))).toBe(false);
    expect(w.printed.join("\n")).toContain("already set up");
  });

  it("looks again when the kept group is no longer fit", async () => {
    const w = world({
      tables: [rows({})],
      group: { forum: false, topics: true, chats: [] },
    });
    fs.mkdirSync(w.root, { recursive: true, mode: 0o700 });
    fs.writeFileSync(paths(w.root).telegramChat, CHAT);
    expect(await auth(["telegram"], w.deps)).toBe(1);
    expect(w.urls.some((u) => u.includes("getUpdates"))).toBe(true);
  });

  it("treats a malformed chat id file as missing", async () => {
    const w = world({ tables: [rows({}), TG_OK] });
    fs.mkdirSync(w.root, { recursive: true, mode: 0o700 });
    fs.writeFileSync(paths(w.root).telegramChat, "not-a-number");
    expect(await auth(["telegram"], w.deps)).toBe(0);
    expect(fs.readFileSync(paths(w.root).telegramChat, "utf8").trim()).toBe(CHAT);
  });

  it("writes no group that is not a forum", async () => {
    const w = world({
      tables: [rows({})],
      group: { forum: false, topics: true, chats: [CHAT] },
    });
    expect(await auth(["telegram"], w.deps)).toBe(1);
    expect(fs.existsSync(paths(w.root).telegramChat)).toBe(false);
    expect(w.printed).toContain("  ✗ Topics enabled");
  });

  it("writes no group where the bot cannot manage topics", async () => {
    const w = world({
      tables: [rows({})],
      group: { forum: true, topics: false, chats: [CHAT] },
    });
    expect(await auth(["telegram"], w.deps)).toBe(1);
    expect(fs.existsSync(paths(w.root).telegramChat)).toBe(false);
    expect(w.printed).toContain("  ✗ bot can Manage Topics");
  });

  it("takes a pasted chat id", async () => {
    const w = world({
      tables: [rows({}), TG_OK],
      group: { forum: true, topics: true, chats: [] },
      answers: ["-1009", "y"],
    });
    expect(await auth(["telegram"], w.deps)).toBe(0);
    expect(fs.readFileSync(paths(w.root).telegramChat, "utf8").trim()).toBe("-1009");
  });

  it("writes nothing when the operator declines the only candidate", async () => {
    const w = world({ tables: [rows({})], answers: ["", "n"] });
    expect(await auth(["telegram"], w.deps)).toBe(1);
    expect(fs.existsSync(paths(w.root).telegramChat)).toBe(false);
  });

  it("prints a group title with its control characters made visible", async () => {
    const w = world({
      tables: [rows({}), TG_OK],
      group: { forum: true, topics: true, chats: [CHAT], title: "x\u001b]0;pwned\u0007y" },
    });
    expect(await auth(["telegram"], w.deps)).toBe(0);
    const screen = w.printed.join("\n");
    expect(screen).not.toContain("\u001b");
    expect(screen).toContain("␛");
  });

  it("lists several groups and takes the one picked", async () => {
    const w = world({
      tables: [rows({}), TG_OK],
      group: { forum: true, topics: true, chats: ["-1001", "-1002"] },
      answers: ["", "2"],
    });
    expect(await auth(["telegram"], w.deps)).toBe(0);
    expect(w.printed).toContain('  1. "VW" (-1001)');
    expect(fs.readFileSync(paths(w.root).telegramChat, "utf8").trim()).toBe("-1002");
  });

  it("stops at once on Ctrl-C at the token prompt", async () => {
    const w = world({ tables: [rows({})], answer: null });
    expect(await auth(["telegram"], w.deps)).toBe(130);
  });

  it("stops at once when a child is interrupted", async () => {
    const w = world({
      tables: [rows({})],
      act: () => ({ code: null, signal: "SIGINT", missing: false }),
    });
    expect(await auth([], w.deps)).toBe(130);
    expect(w.spawned.map((s) => s.command)).toEqual(["claude"]);
  });

  it("goes on to the next step when a command is not on PATH", async () => {
    const w = world({
      tables: [rows({})],
      act: (command) => (command === "claude" ? { code: null, signal: null, missing: true } : DONE),
    });
    expect(await auth([], w.deps)).toBe(1);
    expect(w.printed).toContain("  ✗ claude: claude not found on PATH");
    expect(w.spawned.map((s) => s.command)).toContain("gh");
  });

  it("skips push without the company's github login", async () => {
    const w = world({ tables: [rows({})] });
    expect(await auth(["push"], w.deps)).toBe(1);
    expect(w.spawned).toEqual([]);
    expect(w.printed).toContain("  ✗ push: needs the github step first");
  });

  it("polls the push key until GitHub greets it as the company", async () => {
    const pending = { ...NONE, state: /** @type {const} */ ("error"), note: "not greeted" };
    const w = world({
      tables: [rows({ "github api": ok("co") })],
      checks: { push: [pending, pending, pending, ok("co"), ok("co")] },
      act: keygen,
    });
    await auth(["push"], w.deps);
    expect(w.sleeps()).toBe(3);
    expect(w.printed).toContain("  ✓ push     co (signed in)");
  });

  it("stops polling when the key is greeted as someone else, and keeps the key", async () => {
    const w = world({
      tables: [
        rows({ "github api": ok("co") }),
        rows({ "github api": ok("co"), "github push": ok("me") }),
      ],
      checks: { push: [ok("me"), ok("me")] },
      act: keygen,
    });
    expect(await auth(["push"], w.deps)).toBe(1);
    expect(w.sleeps()).toBe(0);
    expect(w.printed.join("\n")).toContain("GitHub knows this key as me, not co");
    expect(fs.existsSync(paths(w.root).sshKey)).toBe(true);
  });

  it("refuses a credential home others can read", async () => {
    const w = world({ tables: [rows({})] });
    fs.mkdirSync(w.root, { mode: 0o755 });
    fs.chmodSync(w.root, 0o755);
    expect(await auth([], w.deps)).toBe(1);
    expect(w.spawned).toEqual([]);
  });
});
