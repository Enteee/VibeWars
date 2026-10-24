/**
 * hubd against a fake `gh`: what it costs GitHub, and what it says when the
 * GraphQL budget is gone (issue #17).
 *
 * The real daemon runs as a child process exactly as claude-llc starts it,
 * with a stand-in `gh` first on PATH. The stand-in logs every call and plays
 * GitHub's rate limit, including the misleading "unknown owner type" that
 * `gh project` gives when the budget is empty. Requests go through the same
 * spool files `hub` writes.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const HUBD = path.join(path.dirname(fileURLToPath(import.meta.url)), "hubd.mjs");
const HUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "hub.mjs");

/**
 * The stand-in `gh`. GraphQL-bound commands fail the way the real one does
 * once `remaining` is 0; REST ones keep working, as on GitHub.
 */
const FAKE_GH = `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const state = process.env.FAKE_GH_STATE;
const argv = process.argv.slice(2);
fs.appendFileSync(path.join(state, "calls.log"), argv.join(" ") + "\\n");
const remaining = Number(fs.readFileSync(path.join(state, "remaining"), "utf8"));
const [group, sub] = argv;
if (group === "auth") { console.log("token"); process.exit(0); }
if (group === "api" && sub === "rate_limit") {
  const reset = Math.floor(Date.now() / 1000) + 3600;
  console.log(JSON.stringify({ resources: { core: {}, graphql: { limit: 5000, remaining, reset } } }));
  process.exit(0);
}
const REPO = "repos/Enteee/VibeWars/";
const issue7 = { number: 7, title: "seven", body: "the body", state: "open", html_url: "https://github.com/Enteee/VibeWars/issues/7", user: { login: "Enteee" }, labels: [{ node_id: "LA_bug", name: "bug" }], assignees: [], created_at: "2026-10-24T10:00:00Z", updated_at: "2026-10-24T11:00:00Z", closed_at: null };
const pull9 = { number: 9, title: "nine", body: "", state: "open", html_url: "https://github.com/Enteee/VibeWars/pull/9", user: { login: "Enteee" }, labels: [], assignees: [], created_at: "x", updated_at: "y", closed_at: null, merged_at: null, draft: false, head: { ref: "bot/x", sha: "abc123" }, base: { ref: "main" }, additions: 1, deletions: 2, changed_files: 3, mergeable: true, mergeable_state: "clean" };
if (group === "api" && sub !== "graphql") {
  const target = argv.find((word) => word.startsWith(REPO)) ?? "";
  const rel = target.slice(REPO.length);
  if (rel.startsWith("collaborators")) { console.log("enteee"); process.exit(0); }
  if (rel === "issues/7") { console.log(JSON.stringify(issue7)); process.exit(0); }
  if (rel.startsWith("issues/7/comments")) { console.log(JSON.stringify([{ user: { login: "Enteee" }, author_association: "OWNER", body: "first comment", created_at: "z", html_url: "u" }])); process.exit(0); }
  if (rel === "issues/9") { console.log(JSON.stringify({ ...pull9, pull_request: {} })); process.exit(0); }
  if (rel === "pulls/9") { console.log(JSON.stringify(pull9)); process.exit(0); }
  if (rel.startsWith("issues?")) { console.log(JSON.stringify([issue7, { ...pull9, pull_request: {} }])); process.exit(0); }
  console.log("rest ok"); process.exit(0);
}
if (group === "run") { console.log("rest ok"); process.exit(0); }
if (remaining === 0) { console.error("unknown owner type"); process.exit(1); }
if (group === "project" && sub === "item-list") {
  console.log(JSON.stringify({ items: [{ id: "PVTI_1", status: "Ready", content: { number: 8, title: "eight", repository: "Enteee/VibeWars" } }] }));
  process.exit(0);
}
console.log("ok");
`;

/** @type {{ child: import("node:child_process").ChildProcess, dir: string }[]} */
const running = [];

afterEach(() => {
  for (const { child, dir } of running.splice(0)) {
    child.kill("SIGTERM");
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Start a daemon with its own root and fake GitHub.
 *
 * @param {number} remaining the GraphQL budget GitHub claims to have left
 */
async function startHubd(remaining) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hubd-test-"));
  const root = path.join(dir, "root");
  const bin = path.join(dir, "bin");
  const state = path.join(dir, "state");
  const repo = path.join(dir, "repo");
  for (const d of [root, bin, state, repo]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(bin, "gh"), FAKE_GH, { mode: 0o755 });
  fs.writeFileSync(path.join(state, "remaining"), String(remaining));
  fs.writeFileSync(path.join(state, "calls.log"), "");
  fs.writeFileSync(
    path.join(root, "company.json"),
    JSON.stringify({ repo: "Enteee/VibeWars", project: 2, columns: [], expectedChecks: [] }),
  );

  const child = spawn(process.execPath, [HUBD], {
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      VIBEWARS_BOT_ROOT: root,
      DEVENV_ROOT: repo,
      FAKE_GH_STATE: state,
      // Something only hubd's environment holds, to prove a filter cannot
      // reach it.
      HUBD_SECRET: "leaked",
    },
    stdio: "ignore",
  });
  running.push({ child, dir });

  const hub = path.join(root, "hub");
  await until(() => fs.existsSync(path.join(hub, "hubd.alive")), "hubd to start");

  let next = 0;
  return {
    root,
    hub,
    /** @param {number} left */
    setRemaining(left) {
      fs.writeFileSync(path.join(state, "remaining"), String(left));
    },
    /** @param {string} prefix */
    calls(prefix) {
      return fs
        .readFileSync(path.join(state, "calls.log"), "utf8")
        .split("\n")
        .filter((line) => line.startsWith(prefix)).length;
    },
    /**
     * Send one request as `hub` would, and wait for the answer.
     *
     * @param {string} role
     * @param {string} kind
     * @param {string[]} argv
     * @returns {Promise<Record<string, unknown>>}
     */
    async request(role, kind, argv) {
      next += 1;
      const id = `${String(Date.now())}-${String(next)}`;
      const req = path.join(hub, role, "req");
      const res = path.join(hub, role, "res", `${id}.json`);
      await until(() => fs.existsSync(req), "the spool to exist");
      fs.writeFileSync(
        path.join(req, `.${id}.json.part`),
        JSON.stringify({ id, role, kind, argv }),
      );
      fs.renameSync(path.join(req, `.${id}.json.part`), path.join(req, `${id}.json`));
      await until(() => fs.existsSync(res), `an answer to ${argv.join(" ")}`);
      return readJson(res);
    },
  };
}

/**
 * A JSON file hubd wrote, as a plain record.
 *
 * @param {string} file
 * @returns {Record<string, unknown>}
 */
function readJson(file) {
  /** @type {unknown} */
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return typeof parsed === "object" && parsed !== null
    ? /** @type {Record<string, unknown>} */ (parsed)
    : {};
}

/**
 * @param {() => boolean} condition
 * @param {string} label
 */
async function until(condition, label) {
  const deadline = Date.now() + 8000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await sleep(50);
  }
}

/** A real jq, as the jail has one. */
const JQ = (() => {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, "jq");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
})();

const BOARD_READ = ["project", "item-list", "2", "--format", "json", "--limit", "200"];

describe("hubd and the GraphQL budget", () => {
  it("serves every agent's board read from one snapshot", async () => {
    const hubd = await startHubd(5000);

    const first = await hubd.request("developer-1", "gh", BOARD_READ);
    const second = await hubd.request("lead-dev", "gh", BOARD_READ);

    expect(first.code).toBe(0);
    expect(String(first.stdout)).toContain('"number":8');
    expect(second.stdout).toBe(first.stdout);
    expect(hubd.calls("project item-list")).toBe(1);
    // ...and writes it where the dashboard reads it, instead of the
    // dashboard polling GitHub itself.
    const snapshot = readJson(path.join(hubd.hub, "board.json"));
    expect(JSON.stringify(snapshot.board)).toContain('"number":8');
  }, 20_000);

  it("drops the snapshot when a card moves, so the move shows at once", async () => {
    const hubd = await startHubd(5000);

    await hubd.request("developer-1", "gh", BOARD_READ);
    await hubd.request("developer-1", "gh", ["project", "item-edit", "--id", "PVTI_1"]);
    await hubd.request("developer-1", "gh", BOARD_READ);

    expect(hubd.calls("project item-list")).toBe(2);
  }, 20_000);

  it("says the budget is gone instead of GitHub's 'unknown owner type'", async () => {
    const hubd = await startHubd(5000);
    hubd.setRemaining(0);

    const answer = await hubd.request("developer-1", "gh", BOARD_READ);

    expect(answer.code).toBe(75);
    expect(String(answer.stderr)).toMatch(/rate-limited until \d\d:\d\d/);
    expect(String(answer.stderr)).not.toContain("unknown owner type");
  }, 20_000);

  it("answers GraphQL requests at once while the budget is gone, without asking GitHub", async () => {
    // hubd checks the budget when it starts, so it knows before the first
    // request and never spends a call finding out.
    const hubd = await startHubd(0);

    const board = await hubd.request("developer-1", "gh", BOARD_READ);
    const before = hubd.calls("pr view");
    // A field REST cannot answer, so this one really needs GraphQL.
    const answer = await hubd.request("developer-1", "gh", [
      "pr",
      "view",
      "9",
      "--json",
      "reviewDecision",
    ]);

    expect(answer.code).toBe(75);
    expect(String(answer.stderr)).toMatch(/rate-limited until/);
    expect(hubd.calls("pr view")).toBe(before);
    expect(board.code).toBe(75);
    expect(hubd.calls("project item-list")).toBe(0);
  }, 20_000);

  it("keeps serving REST commands while GraphQL is exhausted", async () => {
    const hubd = await startHubd(0);
    await hubd.request("developer-1", "gh", BOARD_READ);

    const answer = await hubd.request("developer-1", "gh", ["run", "list", "--limit", "1"]);

    expect(answer.code).toBe(0);
    expect(String(answer.stdout)).toContain("rest ok");
  }, 20_000);

  it("records the budget for the dashboard", async () => {
    const hubd = await startHubd(1234);

    await until(() => fs.existsSync(path.join(hubd.hub, "ratelimit.json")), "ratelimit.json");
    const budget = readJson(path.join(hubd.hub, "ratelimit.json"));
    expect(budget.remaining).toBe(1234);
    expect(budget.limit).toBe(5000);
  }, 20_000);
});

describe("hubd answering issue and PR reads from REST", () => {
  it("serves issue view as gh's exact JSON, without a GraphQL call", async () => {
    const hubd = await startHubd(5000);

    const answer = await hubd.request("developer-1", "gh", [
      "issue",
      "view",
      "7",
      "--json",
      "title,body,state,labels",
    ]);

    expect(answer.code).toBe(0);
    expect(JSON.parse(String(answer.stdout))).toEqual({
      title: "seven",
      body: "the body",
      state: "OPEN",
      labels: [{ id: "LA_bug", name: "bug", description: "", color: "" }],
    });
    // The visibility lookup went to REST too.
    expect(hubd.calls("issue ")).toBe(0);
  }, 20_000);

  it("serves the plain comments view from REST", async () => {
    const hubd = await startHubd(5000);

    const answer = await hubd.request("developer-1", "gh", ["issue", "view", "7", "--comments"]);

    expect(String(answer.stdout)).toContain("author:\tEnteee\nassociation:\towner");
    expect(String(answer.stdout)).toContain("first comment");
    expect(hubd.calls("issue ")).toBe(0);
  }, 20_000);

  it("serves pr view with gh's names for mergeability", async () => {
    const hubd = await startHubd(5000);

    const answer = await hubd.request("developer-1", "gh", [
      "pr",
      "view",
      "9",
      "--json",
      "state,mergeable,mergeStateStatus,headRefOid",
    ]);

    expect(JSON.parse(String(answer.stdout))).toEqual({
      state: "OPEN",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      headRefOid: "abc123",
    });
    expect(hubd.calls("pr ")).toBe(0);
  }, 20_000);

  it("refuses a request carrying an output filter, and never runs it", async () => {
    // hub strips filters; these did not come through hub. The glued form is
    // the one found in review of #32.
    const hubd = await startHubd(5000);

    for (const filter of [["--jq", "$ENV"], ["-q$ENV"], ["-cq$ENV"]]) {
      const answer = await hubd.request("developer-1", "gh", [
        "issue",
        "view",
        "7",
        "--json",
        "title",
        ...filter,
      ]);
      expect(answer.allow, filter.join(" ")).toBe(false);
      expect(String(answer.reason)).toMatch(/inside the sandbox/);
    }
    expect(hubd.calls("api repos/Enteee/VibeWars/issues/7")).toBe(0);
  }, 20_000);

  it.skipIf(JQ === "")(
    "lets hub apply --jq in the jail, where hubd's environment is out of reach",
    async () => {
      const hubd = await startHubd(5000);
      /** @param {string} filter */
      const hub = (filter) =>
        new Promise((resolve) => {
          const child = spawn(
            process.execPath,
            [HUB, "issue", "view", "7", "--json", "title", "--jq", filter],
            {
              env: {
                PATH: process.env.PATH ?? "",
                VIBEWARS_BOT_ROLE: "developer-1",
                VIBEWARS_HUB: path.join(hubd.hub, "developer-1"),
              },
            },
          );
          let out = "";
          child.stdout.on("data", (/** @type {Buffer} */ chunk) => (out += chunk.toString()));
          child.on("exit", () => {
            resolve(out);
          });
        });

      expect(await hub(".title")).toBe("seven\n");
      expect(await hub("$ENV.HUBD_SECRET")).toBe("null\n");
    },
    20_000,
  );

  it("serves issue list from REST and leaves pull requests out of it", async () => {
    const hubd = await startHubd(5000);

    const answer = await hubd.request("developer-1", "gh", [
      "issue",
      "list",
      "--json",
      "number,title",
    ]);

    expect(JSON.parse(String(answer.stdout))).toEqual([{ number: 7, title: "seven" }]);
    expect(hubd.calls("issue list")).toBe(0);
  }, 20_000);

  it("keeps serving those reads while the GraphQL budget is gone", async () => {
    // Visibility needs the board, which is GraphQL-only. A snapshot taken
    // while the budget lasted keeps serving once it is gone.
    const hubd = await startHubd(5000);
    await hubd.request("developer-1", "gh", BOARD_READ);
    hubd.setRemaining(0);

    const answer = await hubd.request("developer-1", "gh", ["issue", "view", "7"]);

    expect(answer.code).toBe(0);
    expect(String(answer.stdout)).toContain("title:\tseven");
  }, 20_000);

  it("leaves what REST cannot answer to gh", async () => {
    const hubd = await startHubd(5000);

    await hubd.request("developer-1", "gh", ["pr", "view", "9", "--json", "reviewDecision"]);

    expect(hubd.calls("pr view 9")).toBe(1);
  }, 20_000);
});

describe("hubd running git in an agent's worktree", () => {
  /**
   * @param {string[]} args
   * @param {string} cwd
   */
  const sh = (args, cwd) => {
    // The test's own git ignores this machine's config (signing, hooks).
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    }
    return result.stdout;
  };

  it("does not run a hook the agent planted, and still pushes", async () => {
    const hubd = await startHubd(5000);
    const remote = path.join(hubd.root, "remote.git");
    const worktree = path.join(hubd.root, "wt", "developer-1");
    sh(["init", "--bare", "-q", remote], hubd.root);
    sh(["init", "-q", "-b", "main", worktree], hubd.root);
    sh(
      ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "x"],
      worktree,
    );
    sh(["remote", "add", "origin", remote], worktree);

    // Planted both ways an agent could: in .git/hooks, and through a
    // hooksPath of its choosing.
    const marker = path.join(hubd.root, "hook-ran");
    const hook = `#!/bin/sh\ntouch ${marker}\n`;
    fs.writeFileSync(path.join(worktree, ".git", "hooks", "pre-push"), hook, { mode: 0o755 });
    const planted = path.join(worktree, "planted-hooks");
    fs.mkdirSync(planted);
    fs.writeFileSync(path.join(planted, "pre-push"), hook, { mode: 0o755 });
    sh(["config", "core.hooksPath", planted], worktree);

    // The hook is real: a plain git push runs it.
    sh(["push", "-q", "origin", "HEAD:refs/heads/plain"], worktree);
    expect(fs.existsSync(marker)).toBe(true);
    fs.rmSync(marker);

    sh(["branch", "bot/developer-1/x"], worktree);
    const answer = await hubd.request("developer-1", "push", ["bot/developer-1/x"]);

    expect(answer.code).toBe(0);
    expect(fs.existsSync(marker)).toBe(false);
    expect(sh(["branch", "--list", "bot/developer-1/x"], remote)).toContain("bot/developer-1/x");
  }, 20_000);
});
