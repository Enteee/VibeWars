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

import { parseAlive } from "./hub-health.mjs";

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
  const reset = Number(fs.readFileSync(path.join(state, "reset"), "utf8"));
  console.log(JSON.stringify({ resources: { core: {}, graphql: { limit: 5000, remaining, reset } } }));
  process.exit(0);
}
const REPO = "repos/Enteee/VibeWars/";
const issue7 = { number: 7, title: "seven", body: "the body", state: "open", html_url: "https://github.com/Enteee/VibeWars/issues/7", user: { login: "Enteee" }, labels: [{ node_id: "LA_bug", name: "bug" }], assignees: [], created_at: "2026-10-24T10:00:00Z", updated_at: "2026-10-24T11:00:00Z", closed_at: null };
const pull9 = { number: 9, title: "nine", body: "", state: "open", html_url: "https://github.com/Enteee/VibeWars/pull/9", user: { login: "Enteee" }, labels: [], assignees: [], created_at: "x", updated_at: "y", closed_at: null, merged_at: null, draft: false, head: { ref: "bot/x", sha: "abc1234def" }, base: { ref: "main" }, additions: 1, deletions: 2, changed_files: 3, mergeable: true, mergeable_state: "clean" };
if (group === "api" && sub !== "graphql") {
  const target = argv.find((word) => word.startsWith(REPO)) ?? "";
  const rel = target.slice(REPO.length);
  if (rel.startsWith("collaborators")) { console.log("enteee"); process.exit(0); }
  if (rel === "issues/7") { console.log(JSON.stringify(issue7)); process.exit(0); }
  if (rel.startsWith("issues/7/comments")) { console.log(JSON.stringify([{ user: { login: "Enteee" }, author_association: "OWNER", body: "first comment", created_at: "z", html_url: "u" }])); process.exit(0); }
  if (rel === "issues/9") { console.log(JSON.stringify({ ...pull9, pull_request: {} })); process.exit(0); }
  if (rel === "pulls/9") { console.log(JSON.stringify(pull9)); process.exit(0); }
  // A commit's checks: what the test planted for that SHA, or none.
  const commit = /^commits\\/([0-9a-f]+)\\/(check-runs|status)/.exec(rel);
  if (commit !== null) {
    if (fs.existsSync(path.join(state, "rest-fails"))) { console.error("HTTP 500: Server Error"); process.exit(1); }
    const planted = path.join(state, commit[2] + "-" + commit[1] + ".json");
    if (fs.existsSync(planted)) { console.log(fs.readFileSync(planted, "utf8")); process.exit(0); }
    console.log(JSON.stringify(commit[2] === "status" ? { state: "pending", total_count: 0, statuses: [] } : { total_count: 0, check_runs: [] }));
    process.exit(0);
  }
  // Code scanning: what the test planted, or no alerts.
  if (rel.startsWith("code-scanning/alerts")) {
    const planted = path.join(state, "alerts.json");
    const answer = fs.existsSync(planted) ? JSON.parse(fs.readFileSync(planted, "utf8")) : { code: 0, stdout: "[]", stderr: "" };
    if (answer.stderr) { console.error(answer.stderr); }
    if (answer.stdout) { console.log(answer.stdout); }
    process.exit(answer.code);
  }
  if (rel.startsWith("issues?")) { console.log(JSON.stringify([issue7, { ...pull9, pull_request: {} }])); process.exit(0); }
  console.log("rest ok"); process.exit(0);
}
if (group === "run") { console.log("rest ok"); process.exit(0); }
if (remaining === 0) { console.error("unknown owner type"); process.exit(1); }
// Every GraphQL call costs a point, so hubd's measuring has something to see.
fs.writeFileSync(path.join(state, "remaining"), String(remaining - 1));
if (group === "api" && sub === "graphql" && argv.some((word) => word.includes("node(id: $project)"))) {
  const later = argv.includes("cursor=c1");
  const issue = later ? 10 : 8;
  const resetAt = new Date(Number(fs.readFileSync(path.join(state, "reset"), "utf8")) * 1000).toISOString();
  console.log(JSON.stringify({ data: {
    rateLimit: { cost: 1, remaining: remaining - 1, resetAt },
    node: { items: {
      totalCount: 2,
      pageInfo: { hasNextPage: !later, endCursor: later ? null : "c1" },
      nodes: [{ id: "PVTI_" + issue, status: { name: "Ready" }, content: { __typename: "Issue", number: issue, title: "item " + issue, url: "https://github.com/Enteee/VibeWars/issues/" + issue, repository: { nameWithOwner: "Enteee/VibeWars" } } }],
    } },
  } }));
  process.exit(0);
}
// What hubd asks of an issue named by URL, to see who raised it.
if (group === "issue" && sub === "view" && argv[2] === issue7.html_url) {
  console.log(JSON.stringify({ number: 7, url: issue7.html_url, author: { login: "Enteee" } }));
  process.exit(0);
}
// One issue's items, as hubd re-reads them: every issue is in Backlog.
if (group === "api" && sub === "graphql" && argv.some((word) => word.includes("issueOrPullRequest"))) {
  const number = Number((argv.find((word) => word.startsWith("number=")) ?? "").slice(7));
  const resetAt = new Date(Number(fs.readFileSync(path.join(state, "reset"), "utf8")) * 1000).toISOString();
  console.log(JSON.stringify({ data: {
    rateLimit: { cost: 1, remaining: remaining - 1, resetAt },
    repository: { issueOrPullRequest: { number, projectItems: { nodes: [{
      id: "PVTI_" + number, isArchived: false, project: { id: "PVT_2" }, status: { name: "Backlog" },
      content: { __typename: "Issue", number, title: "item " + number, url: "https://github.com/Enteee/VibeWars/issues/" + number, repository: { nameWithOwner: "Enteee/VibeWars" } },
    }] } } },
  } }));
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
/**
 * @param {string} message
 * @param {string} cwd
 */
const commit = (message, cwd) =>
  sh(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message], cwd);

/**
 * Start a daemon with its own root and fake GitHub.
 *
 * @param {number} remaining the GraphQL budget GitHub claims to have left
 * @param {(at: { root: string, repo: string, remote: string }) => void} [before]
 *   runs before hubd starts, for state it reads at startup
 */
async function startHubd(remaining, before) {
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
  fs.writeFileSync(path.join(state, "reset"), String(Math.floor(Date.now() / 1000) + 3600));
  fs.writeFileSync(path.join(state, "calls.log"), "");
  fs.writeFileSync(
    path.join(root, "company.json"),
    JSON.stringify({
      repo: "Enteee/VibeWars",
      project: 2,
      projectId: "PVT_2",
      statusField: {
        id: "F_status",
        options: { Backlog: "o_backlog", Ready: "o_ready", Done: "o_done" },
      },
      columns: [],
      expectedChecks: [],
    }),
  );

  before?.({ root, repo, remote: path.join(dir, "remote.git") });
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    VIBEWARS_BOT_ROOT: root,
    DEVENV_ROOT: repo,
    VIBEWARS_GIT_REMOTE: path.join(dir, "remote.git"),
    FAKE_GH_STATE: state,
    // Something only hubd's environment holds, to prove a filter cannot
    // reach it.
    HUBD_SECRET: "leaked",
  };
  const child = spawn(process.execPath, [HUBD], { env, stdio: "ignore" });
  running.push({ child, dir });

  const hub = path.join(root, "hub");
  await until(() => fs.existsSync(path.join(hub, "hubd.alive")), "hubd to start");

  let next = 0;
  return {
    root,
    hub,
    repo,
    remote: path.join(dir, "remote.git"),
    /**
     * What GitHub answers about one commit's checks.
     *
     * @param {string} sha
     * @param {{ runs?: Record<string, unknown>[], statuses?: Record<string, unknown>[] }} checks
     */
    setChecks(sha, checks) {
      const runs = checks.runs ?? [];
      fs.writeFileSync(
        path.join(state, `check-runs-${sha}.json`),
        JSON.stringify({
          total_count: runs.length,
          check_runs: runs.map((run) => ({ check_suite: { id: 1 }, ...run })),
        }),
      );
      fs.writeFileSync(
        path.join(state, `status-${sha}.json`),
        JSON.stringify({
          state: "pending",
          total_count: (checks.statuses ?? []).length,
          statuses: checks.statuses ?? [],
        }),
      );
    },
    /**
     * What GitHub answers a code-scanning read (#184).
     *
     * @param {{ code: number, stdout: string, stderr: string }} answer
     */
    setAlerts(answer) {
      fs.writeFileSync(path.join(state, "alerts.json"), JSON.stringify(answer));
    },
    /** Start another hubd on the same root, and wait for it to give up. */
    secondHubd() {
      return spawnSync(process.execPath, [HUBD], { env, encoding: "utf8", timeout: 15_000 });
    },
    /** The heartbeat as hubd last wrote it. */
    alive() {
      return parseAlive(fs.readFileSync(path.join(root, "hub", "hubd.alive"), "utf8"));
    },
    /** Every REST read of a commit's checks fails, as on a GitHub outage. */
    failRest() {
      fs.writeFileSync(path.join(state, "rest-fails"), "");
    },
    /** @param {string[]} expectedChecks */
    expectChecks(expectedChecks) {
      fs.writeFileSync(
        path.join(root, "company.json"),
        JSON.stringify({ repo: "Enteee/VibeWars", project: 2, columns: [], expectedChecks }),
      );
    },
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
 * What hubd printed: `board`'s JSON answer, or a board listing.
 *
 * @param {Record<string, unknown>} response
 * @returns {{ token: string, reset: boolean, totalCount: number, card: unknown, cards: { number: number }[] }}
 */
function printed(response) {
  /** @type {unknown} */
  const parsed = JSON.parse(String(response.stdout));
  return /** @type {{ token: string, reset: boolean, totalCount: number, card: unknown, cards: { number: number }[] }} */ (
    parsed
  );
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
/** What `board move 8 Done` sends. */
const MOVE_8_TO_DONE = [
  "project",
  "item-edit",
  "--id",
  "PVTI_8",
  "--project-id",
  "PVT_2",
  "--field-id",
  "F_status",
  "--single-select-option-id",
  "o_done",
];

describe("hubd and the GraphQL budget", () => {
  it("serves every agent's board read from one snapshot", async () => {
    const hubd = await startHubd(5000);

    const first = await hubd.request("developer-1", "gh", BOARD_READ);
    const second = await hubd.request("lead-dev", "gh", BOARD_READ);

    expect(first.code).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    // Both pages of the hand-written query, never gh's every-field item-list.
    expect(hubd.calls("api graphql")).toBe(2);
    expect(hubd.calls("project item-list")).toBe(0);
    expect(JSON.parse(String(first.stdout))).toEqual({
      items: [8, 10].map((n) => ({
        id: `PVTI_${String(n)}`,
        title: `item ${String(n)}`,
        status: "Ready",
        content: {
          type: "Issue",
          number: n,
          title: `item ${String(n)}`,
          url: `https://github.com/Enteee/VibeWars/issues/${String(n)}`,
          repository: "Enteee/VibeWars",
        },
      })),
      totalCount: 2,
    });
    // ...and writes it where the dashboard reads it, instead of the
    // dashboard polling GitHub itself.
    const snapshot = readJson(path.join(hubd.hub, "board.json"));
    expect(JSON.stringify(snapshot.cards)).toContain('"number":10');
  }, 20_000);

  it("applies a move it ran to its copy, so the move shows at once and costs no re-read", async () => {
    const hubd = await startHubd(5000);

    await hubd.request("developer-1", "gh", BOARD_READ);
    await hubd.request("developer-1", "gh", MOVE_8_TO_DONE);
    const after = await hubd.request("developer-1", "board", ["show", "8"]);

    expect(hubd.calls("api graphql")).toBe(2);
    expect(printed(after).card).toMatchObject({ number: 8, status: "Done" });
  }, 20_000);

  it("re-reads only the one issue an item-add put on the board", async () => {
    const hubd = await startHubd(5000);

    await hubd.request("developer-1", "board", ["ls"]);
    const added = await hubd.request("manager", "gh", [
      "project",
      "item-add",
      "2",
      "--url",
      "https://github.com/Enteee/VibeWars/issues/7",
    ]);
    expect(added.code).toBe(0);
    const backlog = await hubd.request("developer-1", "board", ["ls", "Backlog"]);

    // Two pages for the board, one small query for the new card.
    expect(hubd.calls("api graphql")).toBe(3);
    expect(printed(backlog).cards).toEqual([
      { id: "PVTI_7", number: 7, title: "item 7", status: "Backlog", type: "Issue" },
    ]);
    const spend = /** @type {Record<string, unknown>[]} */ (
      readJson(path.join(hubd.hub, "ratelimit.json")).spend
    );
    expect(spend.at(-1)).toMatchObject({ role: "manager", cmd: "board item", cost: 1 });
  }, 20_000);

  it("answers board ls with one column, and changes with only what moved", async () => {
    const hubd = await startHubd(5000);

    const ready = printed(await hubd.request("qa-tester", "board", ["ls", "Ready"]));
    expect(ready.cards.map((card) => card.number)).toEqual([8, 10]);
    const done = printed(await hubd.request("qa-tester", "board", ["ls", "Done"]));
    expect(done.cards).toEqual([]);

    await hubd.request("developer-1", "gh", MOVE_8_TO_DONE);
    const changes = printed(
      await hubd.request("qa-tester", "board", ["changes", "--since", ready.token]),
    );

    expect(changes.reset).toBe(false);
    expect(changes.cards).toEqual([
      { id: "PVTI_8", number: 8, title: "item 8", status: "Done", type: "Issue" },
    ]);
    expect(hubd.calls("api graphql")).toBe(2);
  }, 20_000);

  it("starts from the board.json it left, without reading the board again", async () => {
    const first = await startHubd(5000);
    await first.request("developer-1", "board", ["ls"]);
    const saved = fs.readFileSync(path.join(first.hub, "board.json"), "utf8");

    const second = await startHubd(5000, ({ root }) => {
      fs.mkdirSync(path.join(root, "hub"), { recursive: true });
      fs.writeFileSync(path.join(root, "hub", "board.json"), saved);
    });
    const answer = await second.request("developer-1", "gh", BOARD_READ);

    expect(printed(answer).totalCount).toBe(2);
    expect(second.calls("api graphql")).toBe(0);
  }, 20_000);

  it("discards a board.json in another shape and reads the board afresh", async () => {
    const hubd = await startHubd(5000, ({ root }) => {
      fs.mkdirSync(path.join(root, "hub"), { recursive: true });
      // What an earlier build wrote.
      fs.writeFileSync(
        path.join(root, "hub", "board.json"),
        JSON.stringify({ at: Date.now(), board: { items: [], totalCount: 0 } }),
      );
    });

    const answer = await hubd.request("developer-1", "gh", BOARD_READ);

    expect(printed(answer).totalCount).toBe(2);
    expect(hubd.calls("api graphql")).toBe(2);
    expect(readJson(path.join(hubd.hub, "board.json")).format).toBe(1);
  }, 20_000);

  it("keeps answering board reads from its copy while the budget is gone", async () => {
    const first = await startHubd(5000);
    await first.request("developer-1", "board", ["ls"]);
    const saved = readJson(path.join(first.hub, "board.json"));

    const hubd = await startHubd(0, ({ root }) => {
      fs.mkdirSync(path.join(root, "hub"), { recursive: true });
      // Due for a sweep, which cannot happen until the budget is back.
      fs.writeFileSync(
        path.join(root, "hub", "board.json"),
        JSON.stringify({ ...saved, sweptAt: 0 }),
      );
    });
    const listed = await hubd.request("developer-1", "gh", BOARD_READ);
    const shown = await hubd.request("developer-1", "board", ["show", "10"]);

    expect(listed.code).toBe(0);
    expect(printed(shown).card).toMatchObject({ number: 10 });
    expect(hubd.calls("api graphql")).toBe(0);
  }, 20_000);

  it("writes down what every GraphQL call cost, and whose it was (#97)", async () => {
    const hubd = await startHubd(5000);

    await hubd.request("developer-1", "gh", BOARD_READ);
    await hubd.request("lead-dev", "gh", ["pr", "view", "9", "--json", "reviewDecision"]);
    // REST: free, so not written down.
    await hubd.request("lead-dev", "gh", ["issue", "view", "7", "--json", "title"]);

    const spend = /** @type {Record<string, unknown>[]} */ (
      readJson(path.join(hubd.hub, "ratelimit.json")).spend
    );
    expect(spend.map(({ role, cmd, cost }) => ({ role, cmd, cost }))).toEqual([
      // From the query's own rateLimit { cost }.
      { role: "hubd", cmd: "board snapshot", cost: 1 },
      { role: "hubd", cmd: "board snapshot", cost: 1 },
      // From the budget's drop across the call.
      { role: "lead-dev", cmd: "pr view", cost: 1 },
    ]);
    expect(readJson(path.join(hubd.hub, "ratelimit.json")).remaining).toBe(4997);
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
    expect(hubd.calls("api graphql")).toBe(0);
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
      headRefOid: "abc1234def",
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

describe("hubd running once, and saying how it is (#23)", () => {
  it("refuses to start a second hubd on the same spool", async () => {
    const hubd = await startHubd(5000);

    const second = hubd.secondHubd();

    expect(second.status).toBe(1);
    expect(second.stderr).toContain("another hubd holds");
  }, 30_000);

  it("writes a heartbeat with its pid, start, and what it served and refused", async () => {
    const hubd = await startHubd(5000);
    await hubd.request("developer-1", "gh", ["issue", "view", "7"]);
    await hubd.request("developer-1", "gh", ["pr", "merge", "1"]);

    const alive = hubd.alive();
    expect(alive).not.toBeNull();
    expect(alive?.served).toBeGreaterThanOrEqual(1);
    expect(alive?.refused).toBeGreaterThanOrEqual(1);
    expect(alive?.inflight).toBe(0);
    expect(alive?.lastError).toBeNull();
    expect(Date.now() - (alive?.heartbeatAt ?? 0)).toBeLessThan(10_000);
  }, 20_000);
});

describe("hubd serving hub alerts (#184)", () => {
  const alert = {
    number: 12,
    state: "open",
    html_url: "https://github.com/Enteee/VibeWars/security/code-scanning/12",
    rule: { id: "js/xss", severity: "error", security_severity_level: "high" },
    most_recent_instance: {
      location: { path: "apps/web/src/ui/hud.ts", start_line: 204 },
      message: { text: "Cross-site scripting" },
    },
  };

  it("reads main's alerts from REST and prints one line each", async () => {
    const hubd = await startHubd(5000);
    hubd.setAlerts({ code: 0, stdout: JSON.stringify([alert]), stderr: "" });

    const answer = await hubd.request("developer-1", "alerts", []);

    expect(answer.code).toBe(0);
    expect(String(answer.stdout)).toContain("#12  high  js/xss  apps/web/src/ui/hud.ts:204");
    expect(String(answer.stdout)).toContain("1 open alert on refs/heads/main");
    expect(hubd.calls("api graphql")).toBe(0);
  }, 20_000);

  it("says CodeQL has not run, never that there are no alerts, on a 404", async () => {
    const hubd = await startHubd(5000);
    hubd.setAlerts({ code: 1, stdout: "", stderr: "gh: no analysis found (HTTP 404)" });

    const answer = await hubd.request("developer-1", "alerts", []);

    expect(answer.code).toBe(1);
    expect(String(answer.stderr)).toBe("CodeQL has not analysed refs/heads/main yet\n");
  }, 20_000);

  it("says the token cannot read code scanning on a 403", async () => {
    const hubd = await startHubd(5000);
    hubd.setAlerts({
      code: 1,
      stdout: "",
      stderr: "gh: Resource not accessible by integration (HTTP 403)",
    });

    const answer = await hubd.request("developer-1", "alerts", []);

    expect(answer.code).toBe(1);
    expect(String(answer.stderr)).toBe(
      "gh: Resource not accessible by integration (HTTP 403)\n" +
        "the company token cannot read code scanning; ask the operator\n",
    );
  }, 20_000);

  it("refuses the alerts of a pull request the company cannot see", async () => {
    const hubd = await startHubd(5000);

    const answer = await hubd.request("developer-1", "alerts", ["--pr", "4242"]);

    expect(answer.allow).toBe(false);
    expect(String(answer.reason)).toBe("4242 does not exist or is not on the board yet");
  }, 20_000);
});

describe("hubd pushing through its own mirror", () => {
  it("runs nothing the agent planted, ignores its remote, and still pushes", async () => {
    const hubd = await startHubd(5000);
    const { repo, remote } = hubd;
    const decoy = path.join(hubd.root, "decoy.git");
    sh(["init", "--bare", "-q", remote], hubd.root);
    sh(["init", "--bare", "-q", decoy], hubd.root);
    sh(["init", "-q", "-b", "main", repo], hubd.root);
    fs.writeFileSync(path.join(repo, "README.md"), "x\n");
    sh(["add", "README.md"], repo);
    commit("main", repo);
    sh(["push", "-q", remote, "main"], repo);

    // A branch that changes a gate file, so the audit has to tag it.
    sh(["checkout", "-q", "-b", "bot/developer-1/x"], repo);
    fs.mkdirSync(path.join(repo, "scripts", "bots"), { recursive: true });
    fs.writeFileSync(path.join(repo, "scripts", "bots", "hubd.mjs"), "// weakened\n");
    sh(["add", "scripts"], repo);
    commit("gate", repo);

    // Planted every way an agent could: in .git/hooks, through a hooksPath
    // of its choosing, and an origin that points somewhere else.
    const marker = path.join(hubd.root, "hook-ran");
    const hook = `#!/bin/sh\ntouch ${marker}\n`;
    fs.writeFileSync(path.join(repo, ".git", "hooks", "pre-push"), hook, { mode: 0o755 });
    fs.writeFileSync(path.join(repo, ".git", "hooks", "reference-transaction"), hook, {
      mode: 0o755,
    });
    const planted = path.join(repo, "planted-hooks");
    fs.mkdirSync(planted);
    fs.writeFileSync(path.join(planted, "pre-push"), hook, { mode: 0o755 });
    sh(["config", "core.hooksPath", planted], repo);
    sh(["remote", "add", "origin", decoy], repo);

    // The hook is real: a plain git push runs it.
    sh(["push", "-q", "origin", "HEAD:refs/heads/plain"], repo);
    expect(fs.existsSync(marker)).toBe(true);
    fs.rmSync(marker);

    const answer = await hubd.request("developer-1", "push", ["bot/developer-1/x"]);

    expect(answer.code, String(answer.stderr)).toBe(0);
    expect(fs.existsSync(marker)).toBe(false);
    expect(sh(["branch", "--list", "bot/developer-1/x"], remote)).toContain("bot/developer-1/x");
    expect(sh(["branch", "--list", "bot/developer-1/x"], decoy)).toBe("");
    const audit = fs.readFileSync(path.join(hubd.hub, "audit.jsonl"), "utf8");
    expect(audit).toContain('"tag":"gate-change"');
    expect(audit).toContain('"paths":["scripts/bots/hubd.mjs"]');
  }, 20_000);

  it("tags a push as a gate change when it cannot tell what changed", async () => {
    const hubd = await startHubd(5000);
    const { repo, remote } = hubd;
    // A remote with no main: fetching it fails, so there is nothing to diff
    // against. cicd-engineer, because its pushes carry no guard: any other
    // role's would be refused outright (#116).
    sh(["init", "--bare", "-q", remote], hubd.root);
    sh(["init", "-q", "-b", "bot/cicd-engineer/y", repo], hubd.root);
    fs.writeFileSync(path.join(repo, "README.md"), "x\n");
    sh(["add", "README.md"], repo);
    commit("only", repo);

    const answer = await hubd.request("cicd-engineer", "push", ["bot/cicd-engineer/y"]);

    expect(answer.code, String(answer.stderr)).toBe(0);
    const audit = fs.readFileSync(path.join(hubd.hub, "audit.jsonl"), "utf8");
    expect(audit).toContain('"tag":"gate-change","paths":"unknown"');
  }, 20_000);
});

describe("hubd and workflows (#116)", () => {
  /** A remote whose main has CI's workflow and its local action. */
  const withCi = async () => {
    const hubd = await startHubd(5000);
    const { repo, remote } = hubd;
    sh(["init", "--bare", "-q", remote], hubd.root);
    sh(["init", "-q", "-b", "main", repo], hubd.root);
    for (const file of [".github/workflows/ci.yml", ".github/actions/devenv/action.yml"]) {
      fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      fs.writeFileSync(path.join(repo, file), "name: x\n");
    }
    sh(["add", "."], repo);
    commit("main", repo);
    sh(["push", "-q", remote, "main"], repo);
    return hubd;
  };
  /**
   * A branch off main with one change, pushed as `role`.
   *
   * @param {Awaited<ReturnType<typeof withCi>>} hubd
   * @param {string} role
   * @param {string} name
   * @param {(repo: string) => void} change
   */
  const pushChange = (hubd, role, name, change) => {
    sh(["checkout", "-q", "-b", `bot/${role}/${name}`, "main"], hubd.repo);
    change(hubd.repo);
    sh(["add", "-A"], hubd.repo);
    commit(name, hubd.repo);
    return hubd.request(role, "push", [`bot/${role}/${name}`]);
  };
  /** @param {string} file */
  const add = (file) => (/** @type {string} */ repo) => {
    fs.writeFileSync(path.join(repo, file), "on: push\npermissions:\n  checks: write\n");
  };

  it("refuses a new workflow from anyone but cicd-engineer", async () => {
    const hubd = await withCi();

    const refused = await pushChange(hubd, "developer-1", "wf", add(".github/workflows/x.yml"));
    expect(refused.allow).toBe(false);
    expect(String(refused.reason)).toBe(
      "only cicd-engineer changes .github/workflows/ and .github/actions/; ask them on Telegram. This push changes: .github/workflows/x.yml",
    );
    expect(sh(["branch", "--list", "bot/developer-1/wf"], hubd.remote)).toBe("");

    const allowed = await pushChange(hubd, "cicd-engineer", "wf", add(".github/workflows/x.yml"));
    expect(allowed.code, String(allowed.stderr)).toBe(0);
    expect(fs.readFileSync(path.join(hubd.hub, "audit.jsonl"), "utf8")).toContain(
      '"tag":"gate-change"',
    );
  }, 30_000);

  it("refuses a changed local action, and a workflow moved out", async () => {
    const hubd = await withCi();

    const action = await pushChange(
      hubd,
      "developer-2",
      "action",
      add(".github/actions/devenv/action.yml"),
    );
    expect(action.allow).toBe(false);
    expect(String(action.reason)).toContain(".github/actions/devenv/action.yml");

    const moved = await pushChange(hubd, "perf-sec-qa", "move", (repo) => {
      sh(["mv", ".github/workflows/ci.yml", "ci.yml"], repo);
    });
    expect(moved.allow).toBe(false);
    expect(String(moved.reason)).toContain(".github/workflows/ci.yml");

    // Names git would C-quote without -z.
    for (const [branch, file] of [
      ["umlaut", ".github/workflows/ü.yml"],
      ["quote", '.github/workflows/a"b.yml'],
    ]) {
      const quoted = await pushChange(hubd, "developer-1", branch, add(file));
      expect(quoted.allow, file).toBe(false);
      expect(String(quoted.reason)).toContain(file);
    }

    const elsewhere = await pushChange(hubd, "developer-1", "fine", add("README.md"));
    expect(elsewhere.code, String(elsewhere.stderr)).toBe(0);
  }, 30_000);

  it("refuses when main cannot be fetched", async () => {
    const hubd = await startHubd(5000);
    sh(["init", "--bare", "-q", hubd.remote], hubd.root);
    sh(["init", "-q", "-b", "bot/developer-1/y", hubd.repo], hubd.root);
    fs.writeFileSync(path.join(hubd.repo, "README.md"), "x\n");
    sh(["add", "README.md"], hubd.repo);
    commit("only", hubd.repo);

    const answer = await hubd.request("developer-1", "push", ["bot/developer-1/y"]);

    expect(answer.allow).toBe(false);
    expect(String(answer.reason)).toMatch(/could not compare this branch with main/);
  }, 20_000);
});

describe("hubd and the company's skills (#27)", () => {
  /**
   * @param {string[]} args
   * @param {string} cwd
   */
  const sh = (args, cwd) => {
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
  /**
   * @param {string} message
   * @param {string} cwd
   */
  const commit = (message, cwd) =>
    sh(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message], cwd);
  /**
   * @param {string} repo
   * @param {string} file
   * @param {string} contents
   */
  const write = (repo, file, contents) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), contents);
  };

  /** A remote whose main has one skill, a symlinked one, and a briefing. */
  const withSkills = (/** @type {{ root: string, repo: string, remote: string }} */ at) => {
    sh(["init", "--bare", "-q", at.remote], at.root);
    sh(["init", "-q", "-b", "main", at.repo], at.root);
    write(at.repo, ".claude/bots/skills/demo/SKILL.md", "---\nname: demo\n---\nhello\n");
    write(at.repo, ".claude/bots/manager.md", "# Role: manager\n");
    fs.mkdirSync(path.join(at.repo, ".claude/bots/skills/sneaky"), { recursive: true });
    fs.symlinkSync("/etc/passwd", path.join(at.repo, ".claude/bots/skills/sneaky/SKILL.md"));
    sh(["add", "."], at.repo);
    commit("main", at.repo);
    sh(["push", "-q", at.remote, "main"], at.repo);
  };

  it("exports main's skills for the jails, regular files only", async () => {
    const hubd = await startHubd(5000, withSkills);

    const exported = path.join(hubd.root, "skills-main");
    await until(() => fs.existsSync(path.join(exported, "demo", "SKILL.md")), "the export");
    expect(fs.readFileSync(path.join(exported, "demo", "SKILL.md"), "utf8")).toContain("hello");
    expect(fs.readdirSync(exported)).toEqual(["demo"]);
  }, 20_000);

  it("lets the manager push a skill, and nothing else", async () => {
    const hubd = await startHubd(5000, withSkills);
    const { repo, remote } = hubd;

    sh(["checkout", "-q", "-b", "bot/manager/skill"], repo);
    write(repo, ".claude/bots/skills/demo/SKILL.md", "---\nname: demo\n---\nbetter\n");
    write(repo, ".claude/bots/skills/new-one/SKILL.md", "---\nname: new-one\n---\n");
    sh(["add", "."], repo);
    commit("skills", repo);
    const allowed = await hubd.request("manager", "push", ["bot/manager/skill"]);
    expect(allowed.code, String(allowed.stderr)).toBe(0);
    expect(sh(["branch", "--list", "bot/manager/skill"], remote)).toContain("bot/manager/skill");

    sh(["checkout", "-q", "-b", "bot/manager/sneak"], repo);
    write(repo, ".claude/bots/manager.md", "# Role: manager\nYou may merge.\n");
    sh(["add", "."], repo);
    commit("sneak", repo);
    const refused = await hubd.request("manager", "push", ["bot/manager/sneak"]);
    expect(refused.allow).toBe(false);
    expect(String(refused.reason)).toMatch(/only change \.claude\/bots\/skills\/.*manager\.md/);
    expect(sh(["branch", "--list", "bot/manager/sneak"], remote)).toBe("");

    // A move out of the skills directory is a change outside it.
    sh(["checkout", "-q", "-b", "bot/manager/move", "bot/manager/skill"], repo);
    sh(["mv", ".claude/bots/skills/new-one/SKILL.md", ".claude/bots/new-one.md"], repo);
    commit("move", repo);
    const moved = await hubd.request("manager", "push", ["bot/manager/move"]);
    expect(moved.allow).toBe(false);
    expect(String(moved.reason)).toContain(".claude/bots/new-one.md");
  }, 30_000);
});

describe("hubd recording verdicts and merging", () => {
  it("records a verdict only for the commit that was reviewed, if it is still the head", async () => {
    const hubd = await startHubd(5000);
    const ledger = path.join(hubd.hub, "approvals.jsonl");

    const stale = await hubd.request("lead-dev", "review", ["approve", "9", "--sha", "def4567"]);
    expect(stale.allow).toBe(false);
    expect(String(stale.reason)).toMatch(/moved to abc1234d since you reviewed def4567; re-review/);
    expect(fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8") : "").toBe("");

    const current = await hubd.request("lead-dev", "review", [
      "approve",
      "9",
      "--sha",
      "abc1234def",
    ]);
    expect(current.allow, String(current.reason)).toBe(true);
    const recorded = readJson(ledger);
    expect(recorded).toMatchObject({
      pr: 9,
      role: "lead-dev",
      verdict: "approve",
      sha: "abc1234def",
    });
  }, 20_000);

  it("merges exactly the pull request the guards checked, squashed, pinned to its head", async () => {
    const hubd = await startHubd(5000);
    // Both sign-offs on the current head; the fake reports no checks and
    // company.json expects none, so the gate is open.
    for (const role of ["lead-dev", "perf-sec-qa"]) {
      fs.appendFileSync(
        path.join(hubd.hub, "approvals.jsonl"),
        `${JSON.stringify({ pr: 9, role, verdict: "approve", sha: "abc1234def", ts: 1 })}\n`,
      );
    }

    const answer = await hubd.request("qa-tester", "gh", ["pr", "merge", "9"]);

    expect(answer.code).toBe(0);
    expect(hubd.calls("pr merge 9 --squash --match-head-commit abc1234def")).toBe(1);
  }, 20_000);

  /**
   * A daemon where #9 carries both sign-offs, so only the checks decide.
   *
   * @param {number} remaining
   */
  const approved = async (remaining) => {
    const hubd = await startHubd(remaining);
    for (const role of ["lead-dev", "perf-sec-qa"]) {
      fs.appendFileSync(
        path.join(hubd.hub, "approvals.jsonl"),
        `${JSON.stringify({ pr: 9, role, verdict: "approve", sha: "abc1234def", ts: 1 })}\n`,
      );
    }
    hubd.expectChecks(["ci", "legacy"]);
    return hubd;
  };
  const GREEN = {
    runs: [{ id: 1, name: "ci", status: "completed", conclusion: "success" }],
    statuses: [{ context: "legacy", state: "success" }],
  };

  it("reads the checks of the commit it pinned, from REST, never gh pr checks", async () => {
    const hubd = await approved(5000);
    hubd.setChecks("abc1234def", GREEN);
    // Whatever a newer head says must not matter: only the pinned SHA is read.
    hubd.setChecks("fffffff000", {
      runs: [{ id: 2, name: "ci", status: "completed", conclusion: "failure" }],
    });

    const answer = await hubd.request("qa-tester", "gh", ["pr", "merge", "9"]);

    expect(answer.code, String(answer.reason)).toBe(0);
    expect(hubd.calls("api repos/Enteee/VibeWars/commits/abc1234def/check-runs")).toBe(1);
    expect(hubd.calls("api repos/Enteee/VibeWars/commits/fffffff000")).toBe(0);
    expect(hubd.calls("pr checks")).toBe(0);
  }, 20_000);

  it("refuses a check still running, from a mix of check runs and legacy statuses", async () => {
    const hubd = await approved(5000);
    hubd.setChecks("abc1234def", {
      runs: [{ id: 1, name: "ci", status: "in_progress", conclusion: null }],
      statuses: [{ context: "legacy", state: "success" }],
    });

    const answer = await hubd.request("qa-tester", "gh", ["pr", "merge", "9"]);

    expect(answer.allow).toBe(false);
    expect(String(answer.reason)).toMatch(/still running: ci/);
    expect(hubd.calls("pr merge")).toBe(0);
  }, 20_000);

  it("refuses a failing run that a passing status of the same name would shadow", async () => {
    const hubd = await approved(5000);
    hubd.setChecks("abc1234def", {
      runs: [{ id: 1, name: "ci", status: "completed", conclusion: "failure" }],
      statuses: [
        { context: "ci", state: "success" },
        { context: "legacy", state: "success" },
      ],
    });

    const answer = await hubd.request("qa-tester", "gh", ["pr", "merge", "9"]);

    expect(answer.allow).toBe(false);
    expect(String(answer.reason)).toMatch(/reported by more than one source: ci/);
    expect(hubd.calls("pr merge")).toBe(0);
  }, 20_000);

  it("says GitHub is rate-limited, and until when, rather than that checks are missing", async () => {
    // The budget was fine when the merge was let through, and ran out
    // while the guard read the checks: the case pre-flight cannot catch.
    const hubd = await approved(5000);
    hubd.failRest();
    hubd.setRemaining(0);

    const answer = await hubd.request("qa-tester", "gh", ["pr", "merge", "9"]);

    expect(answer.code).toBe(75);
    expect(String(answer.stderr)).toMatch(/rate-limited until \d\d:\d\d/);
    expect(String(answer.stderr)).not.toMatch(/missing/);
    expect(hubd.calls("pr merge")).toBe(0);
  }, 20_000);

  it("says it could not read the checks when GitHub fails for another reason", async () => {
    const hubd = await approved(5000);
    hubd.failRest();

    const answer = await hubd.request("qa-tester", "gh", ["pr", "merge", "9"]);

    expect(answer.allow).toBe(false);
    expect(String(answer.reason)).toBe(
      "could not read checks for #9 at abc1234: HTTP 500: Server Error",
    );
  }, 20_000);
});

describe("hubd scheduling a company reboot", () => {
  /**
   * A remote whose main has a boot commit and then `changed` on top of it,
   * and a boot record pointing at the boot commit `bootedAgo` ago.
   *
   * @param {Awaited<ReturnType<typeof startHubd>>} hubd
   * @param {string} changed
   * @param {number} bootedAgo
   */
  const company = (hubd, changed, bootedAgo) => {
    const { repo, remote } = hubd;
    sh(["init", "--bare", "-q", remote], hubd.root);
    sh(["init", "-q", "-b", "main", repo], hubd.root);
    fs.writeFileSync(path.join(repo, "README.md"), "x\n");
    sh(["add", "README.md"], repo);
    commit("boot", repo);
    const boot = sh(["rev-parse", "HEAD"], repo).trim();
    fs.mkdirSync(path.dirname(path.join(repo, changed)), { recursive: true });
    fs.writeFileSync(path.join(repo, changed), "new\n");
    sh(["add", changed], repo);
    commit("change", repo);
    sh(["push", "-q", remote, "main"], repo);
    fs.writeFileSync(
      path.join(hubd.root, "boot.json"),
      JSON.stringify({ sha: boot, at: Date.now() - bootedAgo }),
    );
  };
  const reboots = "reboot.json";
  const HOUR = 3_600_000;

  it("records a reboot that loads new company code, once, and aborts it", async () => {
    const hubd = await startHubd(5000);
    company(hubd, "scripts/bots/new.mjs", HOUR);
    const record = path.join(hubd.root, reboots);

    const asked = await hubd.request("manager", "reboot", ["request", "load #21"]);
    expect(asked.code, String(asked.reason)).toBe(0);
    // The announcement company broadcasts, with what the reboot loads.
    expect(String(asked.stdout)).toMatch(/load #21\. It loads: change\./);
    // And it wakes everyone, through the system outbox, once.
    const outbox = path.join(hubd.root, "bus", "_system", "outbox");
    const sent = fs.readdirSync(outbox).filter((n) => n.endsWith(".json"));
    expect(sent).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(outbox, sent[0] ?? ""), "utf8"))).toEqual({
      to: "all",
      text: String(asked.stdout).trim(),
    });
    expect(JSON.parse(fs.readFileSync(record, "utf8"))).toMatchObject({
      reason: "load #21",
      by: "manager",
      ready: [],
    });

    for (const role of ["qa-tester", "qa-tester", "developer-1"]) {
      const ready = await hubd.request(role, "reboot", ["ready"]);
      expect(ready.code, role).toBe(0);
    }
    expect(JSON.parse(fs.readFileSync(record, "utf8"))).toMatchObject({
      ready: ["qa-tester", "developer-1"],
    });

    const again = await hubd.request("manager", "reboot", ["request", "again"]);
    expect(String(again.reason)).toMatch(/already scheduled/);

    const aborted = await hubd.request("manager", "reboot", ["abort"]);
    expect(aborted.code).toBe(0);
    expect(String(aborted.stdout)).toMatch(/aborted/);
    expect(fs.existsSync(record)).toBe(false);

    const late = await hubd.request("developer-1", "reboot", ["ready"]);
    expect(late.code).toBe(1);
  }, 20_000);

  it("refuses when main changed no company code, or inside the cooldown", async () => {
    const hubd = await startHubd(5000);
    company(hubd, "apps/web/src/new.ts", HOUR);
    const game = await hubd.request("manager", "reboot", ["request", "x"]);
    expect(String(game.reason)).toMatch(/no company code changes/);

    const recent = await startHubd(5000);
    company(recent, "scripts/bots/new.mjs", 60_000);
    const early = await recent.request("manager", "reboot", ["request", "x"]);
    expect(String(early.reason)).toMatch(/next reboot is possible at/);
    expect(fs.existsSync(path.join(recent.root, reboots))).toBe(false);
  }, 20_000);

  it("refuses anyone but the manager", async () => {
    const hubd = await startHubd(5000);
    company(hubd, "scripts/bots/new.mjs", HOUR);
    const answer = await hubd.request("developer-1", "reboot", ["request", "x"]);
    expect(answer.allow).toBe(false);
  }, 20_000);
});
