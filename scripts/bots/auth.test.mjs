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

/** @type {Identity} */
const NONE = { state: "not set up", who: null, expiry: null, scopes: null };

/**
 * @param {string} who
 * @returns {Identity}
 */
const ok = (who) => ({ state: "ok", who, expiry: null, scopes: null });

/**
 * @param {Partial<Record<"claude" | "github api" | "github push" | "telegram", Identity>>} states
 * @param {Partial<Record<string, boolean | null>>} [operators]
 * @returns {Row[]}
 */
function rows(states, operators = {}) {
  return ["claude", "github api", "github push", "telegram"].map((name) => ({
    name,
    identity: /** @type {Record<string, Identity>} */ (states)[name] ?? NONE,
    stored: `/c/${name}`,
    operators: operators[name] ?? null,
  }));
}

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
 */
function world({ tables, checks = {}, act, answer = TOKEN, getMeOk = true, tty = true }) {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "auth-")), "creds");
  homes.push(path.dirname(root));
  /** @type {{ command: string, args: string[], env: Record<string, string> }[]} */
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
    spawn: (command, args, env) => {
      spawned.push({ command, args, env });
      return Promise.resolve(
        act?.(command, args, root) ?? { code: 0, signal: null, missing: false },
      );
    },
    prompt: (question) => {
      printed.push(question);
      return Promise.resolve(answer);
    },
    collect: () =>
      Promise.resolve({ rows: tables.length > 1 ? (tables.shift() ?? []) : (tables[0] ?? []) }),
    check: {
      claude: checker("claude"),
      github: checker("github"),
      push: checker("push"),
      telegram: checker("telegram"),
    },
    get: (url) => {
      urls.push(url);
      return Promise.resolve({
        ok: getMeOk,
        json: () =>
          Promise.resolve(getMeOk ? { ok: true, result: { username: "vw_bot" } } : { ok: false }),
      });
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
    expect(w.urls).toEqual([`https://api.telegram.org/bot${TOKEN}/getMe`]);

    const screen = w.printed.join("\n");
    expect(screen).not.toContain(TOKEN);
    expect(screen).not.toContain("PRIVATE");
    expect(screen).toContain("ssh-ed25519 AAAAPUBLIC vibewars-company");
    expect(screen).toContain("while signed in as co");
  });

  it("writes no telegram token that getMe refuses", async () => {
    const w = world({ tables: [rows({})], getMeOk: false });
    expect(await auth(["telegram"], w.deps)).toBe(1);
    expect(fs.existsSync(paths(w.root).telegram)).toBe(false);
    expect(w.printed.join("\n")).not.toContain(TOKEN);
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
