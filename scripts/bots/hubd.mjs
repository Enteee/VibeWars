#!/usr/bin/env node
/**
 * `hubd` — the only process in the company that holds a GitHub credential.
 *
 * Runs OUTSIDE every jail. Watches each role's spool directory, authorizes
 * the request against `hub-policy.mjs`, evaluates the dynamic guards against
 * live GitHub state, runs the command, and audits the decision.
 *
 * It re-checks the policy even though `hub` already did. That is not
 * belt-and-braces paranoia: `hub` runs inside a sandbox, on a writable spool
 * directory, under an autonomous agent. Its check is a courtesy to the agent
 * so refusals are fast and specific. This one is the check that counts.
 *
 * See docs/adr/0015-agent-company.md.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { GIT_ENV, GIT_HARDENING } from "./git-hardening.mjs";
import {
  HINT_DELAY_MS,
  ISSUE_ITEMS_QUERY,
  ITEM_QUERY,
  answerBoard,
  applyFacts,
  listing,
  needsSweep,
  parseBoardRequest,
  parseIssueAnswer,
  parseItemAnswer,
  planHint,
  planMutation,
  readBoardState,
  sweep,
} from "./hub-board.mjs";
import {
  isBoardRead,
  limitedMessage,
  parseBoardIds,
  parseRateLimit,
  usesGraphql,
} from "./hub-budget.mjs";
import { alertRows, alertsFailure, alertsPath, parseAlerts, renderAlerts } from "./hub-alerts.mjs";
import { releaseLock, takeLock } from "./instance-lock.mjs";
import { openJailDir, withJailDir } from "./jail-fs.mjs";
import { hasFilter } from "./hub-filter.mjs";
import {
  approvalsSatisfied,
  checksSatisfied,
  explainGuard,
  pathsOutside,
  pathsWithin,
} from "./hub-guards.mjs";
import {
  checksFromRest,
  ghIssue,
  ghPull,
  listPath,
  listRows,
  pickJson,
  planList,
  planView,
  renderView,
} from "./hub-rest.mjs";
import { BOARD_QUERY, costBetween, parseBoardPage, recordSpend } from "./hub-spend.mjs";
import { obj } from "./protocol.mjs";
import {
  COMPANY_PATHSPECS,
  DRAIN_MS,
  announcement,
  clock,
  parseReboot,
  rebootAllowed,
} from "./reboot.mjs";
import { SKILLS_PREFIX, installSkills, skillFiles } from "./skills-sync.mjs";
import {
  RESTRICTED_PATHS,
  ROLES,
  authorize,
  parseMerge,
  parseReview,
  touchesGate,
} from "./hub-policy.mjs";
import {
  boardNumbers,
  isInternal,
  isVisible,
  itemAddUrl,
  namesItem,
  prepareList,
  renderList,
  selectorsOf,
} from "./hub-visibility.mjs";

/**
 * @param {string} name
 * @returns {string}
 */
function required(name) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set; run this through claude-llc`);
  }
  return value;
}

const ROOT = required("VIBEWARS_BOT_ROOT");
const REPO_DIR = required("DEVENV_ROOT");
const HUB = path.join(ROOT, "hub");
const AUDIT = path.join(HUB, "audit.jsonl");
const APPROVALS = path.join(HUB, "approvals.jsonl");
const COMPANY = path.join(ROOT, "company.json");
/** hubd's copy of the board (hub-board.mjs), for the dashboard and the next start. */
const BOARD_SNAPSHOT = path.join(HUB, "board.json");
/** GraphQL budget as of hubd's last check, for the dashboard. */
const RATE_LIMIT = path.join(HUB, "ratelimit.json");
/**
 * hubd's own bare clone: the only repository it runs git in with authority.
 * The hub directory is bound read-only into every jail, so no agent can plant
 * a hook, a config or a remote here (#26).
 */
const MIRROR = path.join(HUB, ".git-mirror");
/** An empty directory hubd owns, where gh runs, so gh reads no checkout. */
const GH_CWD = path.join(HUB, ".gh-cwd");
/** The commit and time the company last started from (claude-llc writes it). */
const BOOT = path.join(ROOT, "boot.json");
/** A reboot hubd has accepted and the supervisor has not yet carried out. */
const REBOOT = path.join(ROOT, "reboot.json");
/** The heartbeat, `{ ts, inFlight }`: see `heartbeat`. */
const ALIVE = path.join(HUB, "hubd.alive");
const LOCK = path.join(HUB, "hubd.lock");

/**
 * Commands that accept `--repo`. The repository is pinned by us rather than
 * taken from the request, and the policy refuses an agent-supplied `--repo`,
 * so there is exactly one repository this company can act on.
 */
const REPO_SCOPED = new Set(["issue", "pr", "label", "run", "workflow", "release"]);

/**
 * @returns {{
 *   repo: string, owner: string, project: number, projectId: string, expectedChecks: string[],
 *   columns: string[], acting: Record<string, string[] | undefined>,
 *   board: import("./hub-board.mjs").BoardIds | null,
 * }}
 */
function company() {
  const text = fs.readFileSync(COMPANY, "utf8");
  /** @type {unknown} */
  const raw = JSON.parse(text);
  const cfg = /** @type {Record<string, unknown>} */ (
    typeof raw === "object" && raw !== null ? raw : {}
  );
  const repo = typeof cfg.repo === "string" ? cfg.repo : "";
  const project = typeof cfg.project === "number" ? cfg.project : 0;
  // The Status field's ids, which `board move` sends and hubd reads back.
  const ids = parseBoardIds(text);
  return {
    repo,
    owner: repo.split("/")[0] ?? "",
    project,
    board: ids === null ? null : { project, ...ids },
    projectId: typeof cfg.projectId === "string" ? cfg.projectId : "",
    expectedChecks: Array.isArray(cfg.expectedChecks) ? cfg.expectedChecks.map(String) : [],
    acting: /** @type {Record<string, string[] | undefined>} */ (obj(cfg.acting)),
    columns: Array.isArray(cfg.columns) ? cfg.columns.map(String) : [],
  };
}

/* -------------------------------------------------------------------------- */
/* Running things                                                             */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} file
 * @param {string[]} args
 * @param {string} cwd
 * @param {Record<string, string>} [extraEnv]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function run(file, args, cwd, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd,
      env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0", ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (/** @type {string} */ chunk) => (stdout += chunk));
    child.stderr.on("data", (/** @type {string} */ chunk) => (stderr += chunk));
    child.on("error", (error) => {
      resolve({ code: 127, stdout, stderr: `${stderr}${error.message}\n` });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

/**
 * @param {string[]} args
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function ghRaw(args) {
  // GH_REPO answers gh api's `{owner}/{repo}` placeholders, which gh would
  // otherwise take from the git remote of the directory it runs in.
  return run("gh", args, GH_CWD, { GH_REPO: company().repo });
}

/**
 * One REST read, relative to the company's repository. Costs nothing from
 * the GraphQL budget (see hub-rest.mjs).
 *
 * @param {string} rel e.g. `issues/17`
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<unknown>} the parsed answer, or `undefined` on any failure
 */
async function rest(rel, cfg) {
  const result = await gh(["api", `repos/${cfg.repo}/${rel}`]);
  if (result.code !== 0) {
    return undefined;
  }
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(result.stdout);
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * The checks on one commit, read from REST for exactly that commit (#96).
 *
 * `gh pr checks` was GraphQL, so an exhausted budget read as "no checks"
 * and a merge was refused as "checks missing" while CI was green. It also
 * read the pull request's head *now*, not the commit the guards pinned.
 * This reads the pinned SHA and costs no GraphQL; when it cannot read, it
 * says why, and never answers "none".
 *
 * @param {string} sha
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ checks: { name: string, conclusion: string }[] } | { error: string }>}
 */
async function restChecks(sha, cfg) {
  /** @type {unknown[]} */
  const answers = [];
  for (const rel of [
    `commits/${sha}/check-runs?per_page=100`,
    `commits/${sha}/status?per_page=100`,
  ]) {
    const result = await gh(["api", `repos/${cfg.repo}/${rel}`]);
    if (result.code !== 0) {
      return { error: result.stderr.trim().split("\n")[0] ?? "" };
    }
    try {
      answers.push(JSON.parse(result.stdout));
    } catch {
      return { error: `${rel.replace(/\?.*/, "")} did not answer JSON` };
    }
  }
  return checksFromRest(answers[0], answers[1]);
}

/**
 * Answer `gh issue|pr view` from REST, or `null` to let gh answer it.
 *
 * @param {import("./hub-rest.mjs").ViewPlan} plan
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ code: number, stdout: string, stderr: string } | null>}
 */
async function restView(plan, cfg) {
  const path_ = `${plan.group === "issue" ? "issues" : "pulls"}/${String(plan.number)}`;
  const raw = await rest(path_, cfg);
  if (raw === undefined) {
    return null;
  }
  // `issues/{n}` also answers for a pull request; gh's `issue view` does
  // too, so that is not an error.
  /** @type {unknown[] | undefined} */
  let comments;
  if (plan.comments) {
    const page = await rest(`issues/${String(plan.number)}/comments?per_page=100`, cfg);
    // A full page may not be all of them. gh pages through; let it.
    if (!Array.isArray(page) || page.length >= 100) {
      return null;
    }
    comments = page;
  }
  const item = plan.group === "issue" ? ghIssue(raw, comments) : ghPull(raw, comments);
  if (plan.fields === null) {
    return { code: 0, stdout: renderView(plan.group, item, plan.comments), stderr: "" };
  }
  return { code: 0, stdout: pickJson(item, plan.fields), stderr: "" };
}

/**
 * Whether a request is a read hubd answers from REST, and so spends no
 * GraphQL budget even though its command is a GraphQL one.
 *
 * @param {string} kind
 * @param {string[]} argv
 * @returns {boolean}
 */
function servedByRest(kind, argv) {
  if (kind !== "gh") {
    return false;
  }
  if (planView(argv) !== null) {
    return true;
  }
  const prepared = argv[1] === "list" ? prepareList(argv) : null;
  return (
    prepared !== null &&
    "argv" in prepared &&
    planList(prepared.argv, prepared.fields ?? []) !== null
  );
}

/**
 * git in hubd's mirror, hardened, with no system or global config, so
 * nothing outside hubd changes what runs. The remote is SSH, so no
 * credential helper is needed.
 *
 * @param {string[]} args
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function git(args) {
  return run("git", [...GIT_HARDENING, `--git-dir=${MIRROR}`, ...args], HUB, GIT_ENV);
}

/**
 * `git` for output that need not be text, such as a blob: stdout as bytes,
 * never decoded, so a binary file in a skill is exported intact.
 *
 * @param {string[]} args
 * @returns {Promise<{ code: number, stdout: Buffer }>}
 */
function gitBytes(args) {
  return new Promise((resolve) => {
    const child = spawn("git", [...GIT_HARDENING, `--git-dir=${MIRROR}`, ...args], {
      cwd: HUB,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...GIT_ENV },
      stdio: ["ignore", "pipe", "ignore"],
    });
    /** @type {Buffer[]} */
    const chunks = [];
    child.stdout.on("data", (/** @type {Buffer} */ chunk) => chunks.push(chunk));
    child.on("error", () => {
      resolve({ code: 127, stdout: Buffer.alloc(0) });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout: Buffer.concat(chunks) });
    });
  });
}

/**
 * Where pushes go and where `main` comes from: the company's repository,
 * never a remote an agent configured. VIBEWARS_GIT_REMOTE is the host's to
 * set, for a test to point at a local bare repository.
 *
 * @param {ReturnType<typeof company>} cfg
 * @returns {string}
 */
function remoteUrl(cfg) {
  return process.env.VIBEWARS_GIT_REMOTE ?? `git@github.com:${cfg.repo}.git`;
}

/* -------------------------------------------------------------------------- */
/* The GraphQL budget                                                          */
/* -------------------------------------------------------------------------- */

/** Until when GitHub has told us the GraphQL budget is gone, epoch ms. */
let limitedUntil = 0;

/**
 * The budget as last read, and when. A reading this recent stands in for
 * the "before" of the next call, since hubd itself is the only spender.
 *
 * @type {{ limit: number, remaining: number, resetAt: number, at: number } | null}
 */
let lastBudget = null;
const BUDGET_FRESH_MS = 60_000;

/**
 * The last hour of GraphQL-bound calls, for the dashboard (#97).
 *
 * @type {import("./hub-spend.mjs").Spend[]}
 */
let spendWindow = [];

/** Whose request is being served, so its calls are written down as theirs. */
let servingRole = "hubd";

/** `ratelimit.json`: the budget, and where the last hour of it went. */
function writeBudget() {
  if (lastBudget !== null) {
    const { at, ...budget } = lastBudget;
    writeAtomic(RATE_LIMIT, JSON.stringify({ checkedAt: at, ...budget, spend: spendWindow }));
  }
}

/**
 * @param {string} role
 * @param {string} cmd
 * @param {number} ms
 * @param {number | null} cost
 */
function noteSpend(role, cmd, ms, cost) {
  const at = Date.now();
  spendWindow = recordSpend(spendWindow, { at, role, cmd, ms, cost }, at);
  writeBudget();
}

/**
 * Read the GraphQL budget. `rate_limit` is free: GitHub does not count it
 * against either bucket, so asking around every call costs nothing.
 *
 * @returns {Promise<{ limit: number, remaining: number, resetAt: number, at: number } | null>}
 */
async function readBudget() {
  const result = await ghRaw(["api", "rate_limit"]);
  const graphql = result.code === 0 ? parseRateLimit(result.stdout) : null;
  if (graphql === null) {
    return null;
  }
  lastBudget = { ...graphql, at: Date.now() };
  writeBudget();
  return lastBudget;
}

/**
 * Ask GitHub how much GraphQL budget is left, and remember an empty one.
 *
 * @returns {Promise<boolean>} whether the budget is exhausted right now
 */
async function budgetExhausted() {
  const graphql = await readBudget();
  if (graphql === null) {
    return false;
  }
  if (graphql.remaining > 0) {
    limitedUntil = 0;
    return false;
  }
  limitedUntil = graphql.resetAt;
  return true;
}

/**
 * The answer every GraphQL-bound request gets while the budget is gone.
 * `allow: true` because the policy allowed it: this is GitHub refusing, not
 * the company, and the agent should wait rather than ask someone else.
 *
 * @returns {Record<string, unknown>}
 */
function limitedResponse() {
  return { allow: true, code: 75, stdout: "", stderr: limitedMessage(limitedUntil) };
}

/**
 * gh, with every GraphQL-bound call written down (#97): its cost is the
 * drop in the budget across it, which is exact because hubd runs one call
 * at a time.
 *
 * @param {string[]} args
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
async function gh(args) {
  if (!usesGraphql("gh", args)) {
    return ghRaw(args);
  }
  const before =
    lastBudget !== null && Date.now() - lastBudget.at < BUDGET_FRESH_MS
      ? lastBudget
      : await readBudget();
  const started = Date.now();
  const result = await ghRaw(args);
  const ms = Date.now() - started;
  noteSpend(
    servingRole,
    `${args[0] ?? ""} ${args[1] ?? ""}`,
    ms,
    costBetween(before, await readBudget()),
  );
  return result;
}

/**
 * @param {string[]} argv
 * @param {ReturnType<typeof company>} cfg
 * @returns {string[]}
 */
function pinRepo(argv, cfg) {
  const [group] = argv;
  if (group !== undefined && REPO_SCOPED.has(group)) {
    return [...argv, "--repo", cfg.repo];
  }
  if (group === "project") {
    return [...argv, "--owner", cfg.owner];
  }
  return argv;
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

/** @returns {import("./hub-guards.mjs").Approval[]} */
function readApprovals() {
  try {
    return fs
      .readFileSync(APPROVALS, "utf8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => {
        /** @type {unknown} */
        const parsed = JSON.parse(line);
        return /** @type {import("./hub-guards.mjs").Approval} */ (parsed);
      });
  } catch {
    return [];
  }
}

/**
 * @param {string} pr
 * @returns {Promise<string | null>}
 */
async function headSha(pr) {
  if (/^\d+$/.test(pr)) {
    const head = obj(obj(await rest(`pulls/${pr}`, company())).head);
    return typeof head.sha === "string" ? head.sha : null;
  }
  const result = await gh(["pr", "view", pr, "--repo", company().repo, "--json", "headRefOid"]);
  if (result.code !== 0) {
    return null;
  }
  try {
    /** @type {unknown} */
    const raw = JSON.parse(result.stdout);
    const parsed = /** @type {Record<string, unknown>} */ (
      typeof raw === "object" && raw !== null ? raw : {}
    );
    return typeof parsed.headRefOid === "string" ? parsed.headRefOid : null;
  } catch {
    return null;
  }
}

/**
 * Evaluate the guards the policy attached to this request.
 *
 * An unrecognised guard is a refusal, never a pass. Adding a guard name in
 * the policy must not be able to silently widen what is permitted.
 *
 * The pull request is read with the policy's own parser, the one that also
 * decided the request was allowed, and the head the guards validated is
 * returned so the merge can be pinned to it (#26).
 *
 * @param {string[]} guards
 * @param {string[]} argv
 * @returns {Promise<{ ok: true, pr: number, flags: string[], sha: string } | { ok: false, reason: string }>}
 */
async function evaluateGuards(guards, argv) {
  const cfg = company();
  const merge = parseMerge(argv);
  if ("error" in merge) {
    return { ok: false, reason: merge.error };
  }
  const pr = String(merge.pr);

  const sha = await headSha(pr);
  if (sha === null) {
    return { ok: false, reason: `could not read pull request #${pr}` };
  }

  for (const guard of guards) {
    if (guard === "checks-green") {
      const read = await restChecks(sha, cfg);
      if ("error" in read) {
        // An unreadable answer is never an empty one (#46). If the budget
        // is what ran out, handle() answers with the limit and its reset.
        return {
          ok: false,
          reason: `could not read checks for #${pr} at ${sha.slice(0, 7)}: ${read.error}`,
        };
      }
      const verdict = checksSatisfied(read.checks, cfg.expectedChecks);
      if (!verdict.ok) {
        return { ok: false, reason: explainGuard("checks", verdict) };
      }
      continue;
    }

    if (guard.startsWith("approved-by:")) {
      const role = guard.slice("approved-by:".length);
      const verdict = approvalsSatisfied(readApprovals(), {
        pr: Number(pr),
        sha,
        required: [role],
      });
      if (!verdict.ok) {
        return { ok: false, reason: explainGuard(`approval from ${role}`, verdict) };
      }
      continue;
    }

    return { ok: false, reason: `unknown guard "${guard}"; refusing rather than guessing` };
  }
  return { ok: true, pr: merge.pr, flags: merge.flags, sha };
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @param {Record<string, unknown>} entry
 * @returns {void}
 */
function audit(entry) {
  fs.mkdirSync(path.dirname(AUDIT), { recursive: true });
  fs.appendFileSync(AUDIT, `${JSON.stringify({ ts: Date.now(), ...entry })}\n`);
}

/**
 * Which files would this push change, relative to main? Both sides of a
 * rename (--no-renames), so a file moved out of a directory is a change
 * to it. The push guards refuse on it (`refusePush`), and the audit log
 * is tagged with it, so that a change to the definition of a quality gate
 * is findable afterwards with one `grep`.
 *
 * Compared in the mirror, against `main` as GitHub has it: not against
 * whatever an agent's repository calls `origin/main`.
 *
 * @param {string} ref the pushed branch, as it is in the mirror
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<string[] | null>} `null` when they could not be worked out
 */
async function changedPaths(ref, cfg) {
  const main = await git([
    "fetch",
    "-q",
    "--no-tags",
    remoteUrl(cfg),
    "+refs/heads/main:refs/heads/main",
  ]);
  if (main.code !== 0) {
    return null;
  }
  // --no-ext-diff and --no-textconv: a `.gitattributes` on the branch can
  // name a diff driver, which is a command.
  const result = await git([
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    "--name-only",
    "-z",
    `main...${ref}`,
  ]);
  // -z: without it git C-quotes any name with a non-ASCII byte or a
  // quote, and "\".github/workflows/\303\274.yml\"" starts with no prefix.
  return result.code === 0 ? result.stdout.split("\0").filter((name) => name !== "") : null;
}

/**
 * Why a push must not go through under `guard`, or null if it may.
 *
 * It fails closed: a main it cannot fetch, or a diff it cannot take, is a
 * refusal.
 *
 * @param {string} guard
 * @param {string} ref the pushed branch, already fetched into the mirror
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<string | null>}
 */
async function refusePush(guard, ref, cfg) {
  const [kind, list] = guard.split(/:(.*)/s);
  if ((kind !== "paths-within" && kind !== "paths-outside") || list === undefined) {
    return `unknown guard "${guard}"; refusing rather than guessing`;
  }
  const paths = await changedPaths(ref, cfg);
  if (paths === null) {
    return "could not compare this branch with main, so its changes cannot be checked; try again";
  }
  if (kind === "paths-within") {
    const verdict = pathsWithin(list, paths);
    return verdict.ok
      ? null
      : `this role may only change ${list}; this push also changes: ${verdict.outside.join(", ")}`;
  }
  const prefixes = list.split(",");
  const verdict = pathsOutside(prefixes, paths);
  if (verdict.ok) {
    return null;
  }
  const owners = [...new Set(prefixes.flatMap((prefix) => RESTRICTED_PATHS[prefix] ?? []))];
  return `only ${owners.join(", ")} changes ${prefixes.join(" and ")}; ask them on Telegram. This push changes: ${verdict.offending.join(", ")}`;
}

/* -------------------------------------------------------------------------- */
/* Skills                                                                     */
/* -------------------------------------------------------------------------- */

/** Main's skills, bound read-only into every jail but the manager's (#27). */
const SKILLS_MAIN = path.join(ROOT, "skills-main");

/** The main commit the exported skills came from, so an unchanged main costs nothing. */
let skillsSha = "";

/**
 * Export main's `.claude/bots/skills/` into SKILLS_MAIN. main is fetched by
 * URL into the mirror, never read from the shared repository's refs, which
 * any jail can write (#61). Blobs are read with `cat-file`, so no checkout
 * and no attribute-selected filter ever runs.
 *
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<void>}
 */
async function syncSkills(cfg) {
  const fetched = await git([
    "fetch",
    "-q",
    "--no-tags",
    remoteUrl(cfg),
    "+refs/heads/main:refs/heads/main",
  ]);
  const sha = fetched.code === 0 ? (await git(["rev-parse", "main"])).stdout.trim() : "";
  if (sha === "" || sha === skillsSha) {
    return;
  }
  const listing = await git(["ls-tree", "-r", "-z", "main", "--", SKILLS_PREFIX]);
  if (listing.code !== 0) {
    return;
  }
  /** @type {Map<string, Map<string, Uint8Array>>} */
  const skills = new Map();
  for (const { skill, file, oid } of skillFiles(listing.stdout, SKILLS_PREFIX)) {
    const blob = await gitBytes(["cat-file", "blob", oid]);
    if (blob.code !== 0) {
      return;
    }
    /** @type {Map<string, Uint8Array>} */
    const files = skills.get(skill) ?? new Map();
    files.set(file, blob.stdout);
    skills.set(skill, files);
  }
  // A full disk or a permission error must not take hub down for every
  // role: the agents keep the previous export, and the next sync retries.
  try {
    installSkills(SKILLS_MAIN, skills);
  } catch (error) {
    console.error(
      `hubd: skills from main ${sha.slice(0, 7)} not exported: ${error instanceof Error ? error.message : "failed"}`,
    );
    return;
  }
  skillsSha = sha;
  console.error(
    `hubd: skills from main ${sha.slice(0, 7)}: ${[...skills.keys()].join(", ") || "none"}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Visibility                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The board changes rarely and is read constantly: by every visibility check,
 * by every agent's `board ls`, and by the dashboard. One copy serves all
 * three. hubd patches it with what its own mutations did, re-reads single
 * items where it can only guess, and sweeps the whole board once
 * `BOARD_TTL_MS` has passed (hub-board.mjs). The copy survives a restart in
 * `board.json`.
 *
 * @type {import("./hub-board.mjs").BoardState | null}
 */
let board = null;
/**
 * The repository's numbers on the board, for visibility checks.
 *
 * @type {Set<number>}
 */
let boardSet = new Set();
/**
 * Issues to re-read once GitHub's workflows have had their turn: number → due.
 *
 * @type {Map<number, number>}
 */
const hints = new Map();

/**
 * Write a file whole or not at all, so the dashboard never reads half of one.
 *
 * @param {string} file
 * @param {string} contents
 */
function writeAtomic(file, contents) {
  const tmp = `${file}.part`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
}

/**
 * Take `next` as the board, and write it down for the dashboard and the
 * next start.
 *
 * @param {import("./hub-board.mjs").BoardState} next
 * @param {ReturnType<typeof company>} cfg
 */
function keepBoard(next, cfg) {
  if (next === board) {
    return;
  }
  board = next;
  boardSet = boardNumbers(listing(next), cfg.repo);
  writeAtomic(BOARD_SNAPSHOT, JSON.stringify(next));
}

/**
 * The board as the last hubd left it. A file in any other shape is deleted,
 * and the board read afresh on first use (ADR-0016).
 *
 * @param {ReturnType<typeof company>} cfg
 */
function loadBoard(cfg) {
  if (!fs.existsSync(BOARD_SNAPSHOT)) {
    return;
  }
  /** @type {unknown} */
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(BOARD_SNAPSHOT, "utf8"));
  } catch {
    // Not JSON: discarded below, like any other shape.
  }
  const state = readBoardState(raw);
  if (state === null) {
    fs.rmSync(BOARD_SNAPSHOT, { force: true });
    console.error("hubd: board.json is from another build; discarded, the board is read afresh");
    return;
  }
  board = state;
  boardSet = boardNumbers(listing(state), cfg.repo);
}

/**
 * The board, swept first if it is due and GitHub can be asked, or `null`
 * when there is none at all. Out of date beats nothing: while GitHub is
 * unreachable or the budget is gone, the last copy is served.
 *
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<import("./hub-board.mjs").BoardState | null>}
 */
async function freshBoard(cfg) {
  if (needsSweep(board, Date.now()) && Date.now() >= limitedUntil) {
    const items = await boardListing(cfg);
    if (items !== null) {
      const epoch = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
      keepBoard(sweep(board, items, Date.now(), epoch, cfg.repo), cfg);
    }
  }
  return board;
}

/**
 * Every item on the board, from BOARD_QUERY a page at a time (#97). Its
 * cost comes back with the answer, so it is written down exactly.
 *
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<Record<string, unknown>[] | null>}
 */
async function boardListing(cfg) {
  /** @type {Record<string, unknown>[]} */
  const items = [];
  /** @type {string | null} */
  let cursor = null;
  for (;;) {
    const started = Date.now();
    const result = await ghRaw([
      "api",
      "graphql",
      "-f",
      `query=${BOARD_QUERY}`,
      "-f",
      `project=${cfg.projectId}`,
      ...(cursor === null ? [] : ["-f", `cursor=${cursor}`]),
    ]);
    const page = result.code === 0 ? parseBoardPage(result.stdout) : null;
    noteSpend("hubd", "board snapshot", Date.now() - started, page?.cost ?? null);
    if (page === null) {
      return null;
    }
    noteBudget(page.budget);
    items.push(...page.items);
    if (page.next === null) {
      return items;
    }
    cursor = page.next;
  }
}

/**
 * A budget reading that came back with one of hubd's own queries.
 *
 * @param {import("./hub-spend.mjs").Budget | null} budget
 */
function noteBudget(budget) {
  if (budget !== null && lastBudget !== null) {
    lastBudget = { ...lastBudget, ...budget, at: Date.now() };
  }
}

/**
 * Re-read one item, or one issue's items, and apply what came back: a
 * point, where a sweep is a point per hundred cards. If GitHub cannot be
 * asked, the next read sweeps instead.
 *
 * @param {{ kind: "item", id: string } | { kind: "issue", number: number }} target
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<void>}
 */
async function reread(target, cfg) {
  if (board === null) {
    // The next read sweeps anyway.
    return;
  }
  const [owner = "", name = ""] = cfg.repo.split("/");
  const started = Date.now();
  const result =
    Date.now() < limitedUntil
      ? null
      : target.kind === "item"
        ? await ghRaw(["api", "graphql", "-f", `query=${ITEM_QUERY}`, "-f", `item=${target.id}`])
        : await ghRaw([
            "api",
            "graphql",
            "-f",
            `query=${ISSUE_ITEMS_QUERY}`,
            "-f",
            `owner=${owner}`,
            "-f",
            `name=${name}`,
            "-F",
            `number=${String(target.number)}`,
          ]);
  const answer =
    result?.code !== 0
      ? null
      : target.kind === "item"
        ? parseItemAnswer(result.stdout, target.id, cfg.projectId)
        : parseIssueAnswer(result.stdout, target.number, cfg.projectId, cfg.repo);
  if (result !== null) {
    noteSpend(servingRole, "board item", Date.now() - started, answer?.cost ?? null);
  }
  if (answer === null) {
    keepBoard({ ...board, stale: true }, cfg);
    return;
  }
  noteBudget(answer.budget);
  keepBoard(applyFacts(board, answer.facts, Date.now(), cfg.repo), cfg);
}

/**
 * Bring the copy up to date with a `gh project ...` command hubd just ran.
 *
 * @param {string[]} argv
 * @param {{ code: number, stdout: string }} result
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<void>}
 */
async function afterProjectCommand(argv, result, cfg) {
  if (board === null) {
    return;
  }
  if (cfg.board === null) {
    // Without the Status field's ids no move can be read; sweep instead.
    keepBoard({ ...board, stale: true }, cfg);
    return;
  }
  const plan = planMutation(argv, result, cfg.board, board, cfg.repo);
  if (plan.kind === "apply") {
    keepBoard(applyFacts(board, plan.facts, Date.now(), cfg.repo), cfg);
  } else if (plan.kind === "item" || plan.kind === "issue") {
    await reread(plan, cfg);
  } else if (plan.kind === "sweep") {
    keepBoard({ ...board, stale: true }, cfg);
  }
}

/**
 * Remember to re-read an issue hubd just closed, merged or renamed, once
 * GitHub's workflows have moved its card. Only one that is on the board:
 * a merged pull request that is not would cost a point per merge (~16 an
 * hour) to learn about the issues it closes, which the agents move to Done
 * themselves and the next sweep catches anyway.
 *
 * @param {string[]} argv
 * @param {number} code
 * @param {ReturnType<typeof company>} cfg
 */
function noteHint(argv, code, cfg) {
  const number = planHint(argv, code, cfg.repo);
  if (number !== null && boardSet.has(number)) {
    hints.set(number, Date.now() + HINT_DELAY_MS);
  }
}

/**
 * Re-read every issue whose hint is due.
 *
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<void>}
 */
async function flushHints(cfg) {
  for (const [number, due] of hints) {
    if (Date.now() >= due) {
      hints.delete(number);
      await reread({ kind: "issue", number }, cfg);
    }
  }
}

/**
 * Answer `board ls`, `board show` or `board changes` from the copy.
 *
 * @param {string[]} argv
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
async function serveBoard(argv, cfg) {
  const request = parseBoardRequest(argv);
  if ("error" in request) {
    return { code: 2, stdout: "", stderr: `board: ${request.error}\n` };
  }
  const asked = Date.now();
  let state = await freshBoard(cfg);
  if (state !== null && request.verb === "show" && request.fresh && state.sweptAt < asked) {
    // The operator moved it by hand, say: one point to see it now.
    await reread({ kind: "issue", number: request.number }, cfg);
    state = board;
  }
  if (state === null) {
    return Date.now() < limitedUntil
      ? limitedResponse()
      : { code: 1, stdout: "", stderr: "board: could not read the board from GitHub\n" };
  }
  return {
    code: 0,
    stdout: `${JSON.stringify(answerBoard(state, request, cfg.repo))}\n`,
    stderr: "",
  };
}

/** Who counts as a member changes more rarely still. */
const MEMBERS_TTL_MS = 300_000;
/** @type {{ at: number, logins: Set<string> } | null} */
let membersCache = null;

/**
 * Collaborator logins, lowercased. `null` when GitHub cannot be asked, which
 * callers turn into a loud refusal rather than an empty set: an empty set
 * would quietly hide the company's own work, which is the one thing this
 * filter must never do.
 *
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<Set<string> | null>}
 */
async function members(cfg) {
  if (membersCache === null || Date.now() - membersCache.at > MEMBERS_TTL_MS) {
    const result = await gh([
      "api",
      "--paginate",
      `repos/${cfg.repo}/collaborators?per_page=100`,
      "--jq",
      ".[].login",
    ]);
    const logins = result.stdout
      .split("\n")
      .map((login) => login.trim().toLowerCase())
      .filter((login) => login !== "");
    if (result.code !== 0 || logins.length === 0) {
      return null;
    }
    membersCache = { at: Date.now(), logins: new Set(logins) };
  }
  return membersCache.logins;
}

/**
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<import("./hub-visibility.mjs").Viewer | null>}
 */
async function viewer(cfg) {
  if ((await freshBoard(cfg)) === null) {
    return null;
  }
  const numbers = boardSet;
  const logins = await members(cfg);
  if (logins === null) {
    return null;
  }
  return { members: logins, repo: cfg.repo, board: numbers };
}

/**
 * @param {"issue" | "pr"} group
 * @param {string} selector A number, a URL, or for a pull request a branch.
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<import("./hub-visibility.mjs").Item | null>}
 */
async function resolve(group, selector, cfg) {
  if (/^\d+$/.test(selector)) {
    // REST, so a visibility check costs no GraphQL. `issues/{n}` answers
    // for pull requests too, with the pull request's own URL.
    const raw = obj(await rest(`issues/${selector}`, cfg));
    const user = obj(raw.user);
    return typeof raw.number === "number" && typeof raw.html_url === "string"
      ? {
          number: raw.number,
          url: raw.html_url,
          author: { login: typeof user.login === "string" ? user.login : "" },
        }
      : null;
  }
  const result = await gh([
    group,
    "view",
    selector,
    "--repo",
    cfg.repo,
    "--json",
    "number,author,url",
  ]);
  if (result.code !== 0) {
    return null;
  }
  try {
    const parsed = obj(/** @type {unknown} */ (JSON.parse(result.stdout)));
    return typeof parsed.number === "number" && typeof parsed.url === "string"
      ? {
          number: parsed.number,
          url: parsed.url,
          author: /** @type {{ login?: string }} */ (obj(parsed.author)),
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * Refuse a request that names an issue or pull request the company may not
 * see. The refusal reads the same as for one that does not exist: an agent
 * has no use for knowing which, and a stranger's title has no business in its
 * context.
 *
 * @param {string} kind
 * @param {string[]} argv
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
async function checkVisibility(kind, argv, cfg) {
  /** @type {{ group: "issue" | "pr", selector: string }[]} */
  let named;
  /** @type {((item: import("./hub-visibility.mjs").Item, seen: import("./hub-visibility.mjs").Viewer) => boolean)} */
  let allowed = isVisible;

  if (kind === "review") {
    named = [{ group: "pr", selector: String(argv[1]) }];
  } else if (kind === "alerts") {
    // A pull request's alerts describe it: the same visibility as `pr view`.
    const plan = parseAlerts(argv);
    if ("error" in plan || plan.pr === null) {
      return { ok: true };
    }
    named = [{ group: "pr", selector: String(plan.pr) }];
  } else if (kind === "gh" && namesItem(argv)) {
    const parsed = selectorsOf(argv);
    if ("error" in parsed) {
      return { ok: false, reason: parsed.error };
    }
    const group = argv[0] === "pr" ? "pr" : "issue";
    named = parsed.selectors.map((selector) => ({ group, selector }));
  } else if (kind === "gh" && argv[0] === "project" && argv[1] === "item-add") {
    // Putting an item on the board is what makes outside work visible, so for
    // that work the step belongs to a human project member.
    const url = itemAddUrl(argv);
    if (url === null) {
      return { ok: false, reason: "project item-add needs --url" };
    }
    named = [{ group: url.includes("/pull/") ? "pr" : "issue", selector: url }];
    allowed = isInternal;
  } else {
    return { ok: true };
  }

  const seen = await viewer(cfg);
  if (seen === null) {
    return {
      ok: false,
      reason: "could not read the board or the collaborator list to check what is visible",
    };
  }
  for (const { group, selector } of named) {
    const item = await resolve(group, selector, cfg);
    if (item === null || !allowed(item, seen)) {
      return {
        ok: false,
        reason:
          allowed === isInternal
            ? `${selector} was raised outside the project; only a project member can put it on the board`
            : `${selector} does not exist or is not on the board yet`,
      };
    }
  }
  return { ok: true };
}

/**
 * Run an `issue list` / `pr list` and drop every row the company may not see.
 *
 * @param {string[]} argv
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
async function filteredList(argv, cfg) {
  const prepared = prepareList(argv);
  if ("error" in prepared) {
    return { code: 1, stdout: "", stderr: `hub: ${prepared.error}\n` };
  }
  const seen = await viewer(cfg);
  if (seen === null) {
    return {
      code: 1,
      stdout: "",
      stderr: "hub: could not read the board or the collaborator list to filter the list\n",
    };
  }
  /** @type {Record<string, unknown>[]} */
  let rows;
  let stderr = "";
  const plan = planList(prepared.argv, prepared.fields ?? []);
  const page = plan === null ? undefined : await rest(listPath(plan), cfg);
  if (plan !== null && Array.isArray(page)) {
    rows = listRows(plan, page);
  } else {
    const result = await gh(pinRepo(prepared.argv, cfg));
    if (result.code !== 0) {
      return result;
    }
    stderr = result.stderr;
    try {
      /** @type {unknown} */
      const raw = JSON.parse(result.stdout);
      rows = Array.isArray(raw) ? raw.map((row) => obj(row)) : [];
    } catch {
      return { code: 1, stdout: "", stderr: "hub: gh returned a list hub could not read\n" };
    }
  }
  const visible = rows.filter((row) =>
    isVisible(
      {
        number: typeof row.number === "number" ? row.number : -1,
        url: typeof row.url === "string" ? row.url : "",
        author: /** @type {{ login?: string }} */ (obj(row.author)),
      },
      seen,
    ),
  );
  return {
    code: 0,
    stdout: renderList(argv[0] === "pr" ? "pr" : "issue", visible, prepared.fields),
    stderr,
  };
}

/* -------------------------------------------------------------------------- */
/* Handling                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Which hats is this role covering for?
 *
 * Straight from `company.json`, with no cleverness: the operator decides when
 * a role stops wearing a borrowed hat and edits `acting` to say so. An
 * earlier version revoked a hat automatically as soon as its real wearer was
 * hired, which sounds tidy but changes the company's permissions underneath
 * it without anyone asking — and a delegation that vanishes on its own is
 * harder to reason about than one that is written down.
 *
 * It stays visible rather than silent: `hub whoami` prints the borrowed hats,
 * every sign-off records which seat it was cast for, and the audit log
 * carries both the agent and the seat.
 *
 * @param {string} role
 * @returns {string[]}
 */
function actingFor(role) {
  return company().acting[role] ?? [];
}

/**
 * @param {{ role: string, kind: string, argv: string[] }} request
 * @returns {Promise<Record<string, unknown>>}
 */
async function handle(request) {
  const { role, kind, argv } = request;
  const acting = actingFor(role);
  const verdict = authorize(role, { kind, argv }, { acting });

  if (!verdict.allow) {
    audit({ role, kind, argv, decision: "refused", reason: verdict.reason, acting });
    return { allow: false, reason: verdict.reason, code: 77 };
  }
  // A board read the copy can answer spends nothing, budget or not.
  const fromCopy = board !== null && kind === "gh" && isBoardRead(argv, company().project);
  const spendsGraphql = usesGraphql(kind, argv) && !servedByRest(kind, argv) && !fromCopy;
  if (spendsGraphql && Date.now() < limitedUntil) {
    audit({ role, kind, argv, decision: "rate-limited" });
    return limitedResponse();
  }

  servingRole = role;
  /** @type {Record<string, unknown>} */
  let response;
  try {
    response = await serve(request, verdict, acting);
  } finally {
    servingRole = "hubd";
  }

  // GitHub's own error for an exhausted budget is often something else
  // entirely ("unknown owner type"), and a visibility or guard check that
  // could not reach GitHub fails as a refusal. Either way, if the budget is
  // what ran out, say that instead.
  if (spendsGraphql && response.code !== 0 && (await budgetExhausted())) {
    audit({ role, kind, argv, decision: "rate-limited" });
    return limitedResponse();
  }
  return response;
}

/* -------------------------------------------------------------------------- */
/* Company reboot                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The commit the company was started from, and when: written by claude-llc
 * on every start, read here to decide whether a reboot has anything to load.
 *
 * @returns {{ sha: string, at: number } | null}
 */
function readBoot() {
  try {
    const raw = obj(JSON.parse(fs.readFileSync(BOOT, "utf8")));
    return typeof raw.sha === "string" &&
      /^[0-9a-f]{40}$/.test(raw.sha) &&
      typeof raw.at === "number"
      ? { sha: raw.sha, at: raw.at }
      : null;
  } catch {
    return null;
  }
}

/**
 * The reboot waiting for the supervisor to carry it out, if any.
 *
 * @returns {import("./reboot.mjs").Reboot | null}
 */
function readReboot() {
  try {
    return parseReboot(JSON.parse(fs.readFileSync(REBOOT, "utf8")));
  } catch {
    return null;
  }
}

/**
 * What `main` on GitHub changed since `sha`, read in the mirror: the files,
 * and the subjects of the commits that touched company code.
 *
 * @param {string} sha
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ paths: string[], subjects: string[] } | null>} `null`
 *   when that could not be worked out
 */
async function changedSince(sha, cfg) {
  const main = await git([
    "fetch",
    "-q",
    "--no-tags",
    remoteUrl(cfg),
    "+refs/heads/main:refs/heads/main",
  ]);
  if (main.code !== 0) {
    return null;
  }
  const paths = await git(["log", "--format=", "--name-only", `${sha}..main`]);
  const subjects = await git(["log", "--format=%s", `${sha}..main`, "--", ...COMPANY_PATHSPECS]);
  if (paths.code !== 0 || subjects.code !== 0) {
    return null;
  }
  /** @param {string} text */
  const lines = (text) => text.split("\n").filter((line) => line !== "");
  return { paths: lines(paths.stdout), subjects: lines(subjects.stdout) };
}

/**
 * A company reboot (#21): schedule it, abort it, or mark a role ready for
 * it. hubd only checks and records it, in `.bots/reboot.json`; the
 * supervisor, which watches the agents' restart loops, drains the company
 * and starts the restarter. What a schedule or an abort answers is the announcement, which
 * `company` broadcasts.
 *
 * @param {string} role
 * @param {string[]} argv `["request", reason]`, `["abort"]` or `["ready"]`
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<Record<string, unknown>>}
 */
async function reboot(role, argv, cfg) {
  const kind = "reboot";
  const pending = readReboot();
  if (argv[0] === "ready" || argv[0] === "abort") {
    if (pending === null) {
      return { allow: true, code: 1, stdout: "", stderr: "company: no reboot is scheduled\n" };
    }
    audit({ role, kind, argv, decision: "allowed" });
    if (argv[0] === "abort") {
      fs.rmSync(REBOOT, { force: true });
      return {
        allow: true,
        code: 0,
        stdout: `The company reboot is aborted (${role}). Carry on.\n`,
        stderr: "",
      };
    }
    if (!pending.ready.includes(role)) {
      writeAtomic(REBOOT, JSON.stringify({ ...pending, ready: [...pending.ready, role] }));
    }
    return {
      allow: true,
      code: 0,
      stdout: `Noted. The company stops by ${clock(pending.deadline)} at the latest.\n`,
      stderr: "",
    };
  }

  const boot = readBoot();
  const now = Date.now();
  const changed = boot === null ? null : await changedSince(boot.sha, cfg);
  const allowed = rebootAllowed({
    bootSha: boot?.sha ?? null,
    changedPaths: changed?.paths ?? null,
    lastRebootAt: boot?.at ?? null,
    now,
    pending,
  });
  if (!allowed.ok || boot === null || changed === null) {
    const reason = allowed.ok ? "the company's boot was not recorded" : allowed.reason;
    audit({ role, kind, argv, decision: "refused", reason });
    return { allow: false, reason, code: 77 };
  }

  /** @type {import("./reboot.mjs").Reboot} */
  const scheduled = {
    requestedAt: now,
    reason: argv[1] ?? "",
    by: role,
    deadline: now + DRAIN_MS,
    bootSha: boot.sha,
    ready: [],
  };
  writeAtomic(REBOOT, JSON.stringify(scheduled));
  audit({ role, kind, argv, decision: "allowed" });
  return {
    allow: true,
    code: 0,
    stdout: `${announcement(scheduled, changed.subjects)}\n`,
    stderr: "",
  };
}

/**
 * `hub alerts` (#184): one REST read of the code-scanning alerts, rendered.
 * A failure says what failed, and never reads as "no alerts".
 *
 * @param {string[]} argv
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
async function serveAlerts(argv, cfg) {
  const plan = parseAlerts(argv);
  if ("error" in plan) {
    return { code: 2, stdout: "", stderr: `hub alerts: ${plan.error}\n` };
  }
  const result = await gh(["api", alertsPath(plan, cfg.repo)]);
  if (result.code !== 0) {
    return { code: 1, stdout: "", stderr: alertsFailure(result.code, result.stderr, plan) };
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { code: 1, stdout: "", stderr: "code scanning did not answer JSON\n" };
  }
  return { code: 0, stdout: renderAlerts(alertRows(parsed), plan), stderr: "" };
}

/**
 * Serve a request the policy has already allowed.
 *
 * @param {{ role: string, kind: string, argv: string[] }} request
 * @param {ReturnType<typeof authorize>} verdict
 * @param {string[]} acting
 * @returns {Promise<Record<string, unknown>>}
 */
async function serve(request, verdict, acting) {
  const { role, kind, argv } = request;
  // The hat this request is being served under, if it is not the role's own.
  const as = typeof verdict.as === "string" ? verdict.as : role;

  if (kind === "gh" && hasFilter(argv)) {
    // hub strips output filters and applies them in the jail; one arriving
    // here did not come through hub. Run on the host, by gh's jq or anyone
    // else's, it could read hubd's environment and files (hub-filter.mjs).
    const reason =
      "output filters (--jq, --template) are applied inside the sandbox by hub, never here";
    audit({ role, kind, argv, decision: "refused", reason });
    return { allow: false, reason, code: 77 };
  }

  const cfg = company();

  if (kind === "reboot") {
    return reboot(role, argv, cfg);
  }

  if (kind === "board") {
    const answered = await serveBoard(argv, cfg);
    audit({ role, kind, argv, decision: "allowed", code: answered.code, cached: true });
    return { allow: true, ...answered };
  }

  // Before the guards, whose refusals would otherwise describe a pull request
  // the company is not supposed to know about.
  const visibility = await checkVisibility(kind, argv, cfg);
  if (!visibility.ok) {
    audit({ role, kind, argv, decision: "hidden", reason: visibility.reason });
    return { allow: false, reason: visibility.reason, code: 77 };
  }

  // A push's guard is about what it changes, and is checked on the push
  // path below, once the branch is in the mirror.
  if (kind === "gh" && verdict.guards !== undefined) {
    const guarded = await evaluateGuards(verdict.guards, argv);
    if (!guarded.ok) {
      audit({ role, kind, argv, decision: "refused-by-guard", reason: guarded.reason });
      return { allow: false, reason: guarded.reason, code: 77 };
    }
    // The merge gh runs is the one the guards checked: that pull request,
    // squashed, and only if its head is still the commit the approvals and
    // checks were validated against. A push in between fails the merge.
    // Every guarded gh request is a merge, and it never reaches the unpinned
    // call below.
    const flags = guarded.flags.includes("--squash")
      ? guarded.flags
      : ["--squash", ...guarded.flags];
    const pinned = [
      "pr",
      "merge",
      String(guarded.pr),
      ...flags,
      "--match-head-commit",
      guarded.sha,
    ];
    const result = await gh(pinRepo(pinned, cfg));
    noteHint(pinned, result.code, cfg);
    audit({ role, kind, argv, decision: "allowed", code: result.code, sha: guarded.sha });
    return { allow: true, ...result };
  }

  if (kind === "alerts") {
    const answered = await serveAlerts(argv, cfg);
    audit({ role, kind, argv, decision: "allowed", code: answered.code });
    return { allow: true, ...answered };
  }

  if (kind === "review") {
    const { verb: promptVerb, pr, sha: reviewed, seat: named, note } = parseReview(argv);
    const sha = await headSha(pr);
    if (sha === null) {
      return { allow: false, reason: `could not read pull request #${pr}`, code: 77 };
    }
    // A verdict is for the commit the reviewer read. If the head has moved
    // since, it describes code nobody has reviewed (#26, item 6).
    if (reviewed === null || !sha.startsWith(reviewed)) {
      const reason = `the head of #${pr} moved to ${sha.slice(0, 8)} since you reviewed ${String(reviewed)}; re-review`;
      audit({ role, kind, argv, decision: "refused", reason });
      return { allow: false, reason, code: 77 };
    }
    const seat = named ?? as;
    fs.appendFileSync(
      APPROVALS,
      `${JSON.stringify({
        pr: Number(pr),
        // The seat, not the agent: the merge guard asks "has perf-sec-qa
        // signed off", and while lead-dev is covering that seat its sign-off
        // has to answer that question. `by` keeps who actually did it.
        role: seat,
        by: role,
        verdict: promptVerb === "approve" ? "approve" : "request-changes",
        sha,
        ts: Date.now(),
        note: note.join(" "),
      })}\n`,
    );
    // Mirrored to the pull request so a human reading it sees who signed off.
    // It has to be a comment, not a review: all nine agents share one GitHub
    // identity, which cannot approve its own pull request or cast two
    // distinguishable reviews.
    const mark = promptVerb === "approve" ? "APPROVED" : "CHANGES REQUESTED";
    const wearing = seat === role ? `\`${role}\`` : `\`${role}\` acting as \`${seat}\``;
    const body = `**${mark}** by ${wearing}\n\n${note.join(" ") || "(no note)"}\n\n<sub>recorded by hub against ${sha.slice(0, 8)}</sub>`;
    const posted = await gh(["pr", "comment", pr, "--repo", cfg.repo, "--body", body]);
    audit({ role, kind, argv, decision: "allowed", sha, seat, acting });
    return {
      allow: true,
      code: 0,
      stdout: `${mark} recorded for #${pr} as ${seat} against ${sha.slice(0, 8)}\n`,
      stderr: posted.code === 0 ? "" : posted.stderr,
    };
  }

  if (kind === "push") {
    const [branch = ""] = argv;
    const ref = `refs/heads/${branch}`;
    // Through the mirror. The branch is taken by name from the shared
    // repository, never from a path or remote the agent chose, and pushed to
    // the company's repository by URL, so nothing an agent planted runs and
    // no remote it configured is used (#26).
    const fetched = await git([
      "fetch",
      "-q",
      "--no-tags",
      path.join(REPO_DIR, ".git"),
      `+${ref}:${ref}`,
    ]);
    if (fetched.code !== 0) {
      audit({ role, kind, argv, decision: "allowed", code: fetched.code });
      return { allow: true, ...fetched };
    }
    for (const guard of verdict.guards ?? []) {
      const refused = await refusePush(guard, ref, cfg);
      if (refused !== null) {
        audit({ role, kind, argv, decision: "refused-by-guard", reason: refused });
        return { allow: false, reason: refused, code: 77 };
      }
    }
    const paths = await changedPaths(ref, cfg);
    // Not knowing what a push changes is treated as a gate change: the tag
    // exists so a weakened check is findable, and a failed diff must not
    // be the way to hide one (#46).
    const gate =
      paths === null
        ? { tag: "gate-change", paths: "unknown" }
        : touchesGate(paths)
          ? { tag: "gate-change", paths: paths.filter((p) => touchesGate([p])) }
          : {};
    const result = await git(["push", remoteUrl(cfg), `${ref}:${ref}`]);
    audit({
      role,
      kind,
      argv,
      decision: "allowed",
      code: result.code,
      ...gate,
    });
    return { allow: true, ...result };
  }

  if ((argv[0] === "issue" || argv[0] === "pr") && argv[1] === "list") {
    const listed = await filteredList(argv, cfg);
    audit({ role, kind, argv, decision: "allowed", code: listed.code, filtered: true });
    return { allow: true, ...listed };
  }

  const view = planView(argv);
  if (view !== null) {
    const answered = await restView(view, cfg);
    if (answered !== null) {
      audit({ role, kind, argv, decision: "allowed", code: answered.code, rest: true });
      return { allow: true, ...answered };
    }
  }

  if (isBoardRead(argv, cfg.project)) {
    const state = await freshBoard(cfg);
    if (state !== null) {
      audit({ role, kind, argv, decision: "allowed", code: 0, cached: true });
      return { allow: true, code: 0, stdout: `${JSON.stringify(listing(state))}\n`, stderr: "" };
    }
  }

  const result = await gh(pinRepo(argv, cfg));
  // An item just added, moved or archived must show up on the next read,
  // not when the copy happens to be swept.
  if (argv[0] === "project") {
    await afterProjectCommand(argv, result, cfg);
  }
  noteHint(argv, result.code, cfg);
  audit({ role, kind, argv, decision: "allowed", code: result.code });
  return { allow: true, ...result };
}

/* -------------------------------------------------------------------------- */

/** What the heartbeat reports about this run of hubd (#23). */
const health = {
  pid: process.pid,
  startedAt: Date.now(),
  /** The commit the company was started from, short, if claude-llc wrote it. */
  sha: /** @type {string | null} */ (null),
  served: 0,
  refused: 0,
  /** @type {{ at: number, message: string } | null} */
  lastError: null,
};

/**
 * The heartbeat, a `HubdAlive` (`hub-health.mjs`).
 *
 * `heartbeatAt` lets `hub` tell "the daemon is busy" from "the daemon was
 * never started"; without it, every call inside a sandbox blocks for the
 * full request timeout and the agent looks hung. `hub` reads the time, never
 * the pid: the sandboxes run in their own PID namespace, where a pid
 * written here is meaningless. That is how the first version of this made
 * every agent announce that the hub was down. The pid is for the host's
 * dashboard.
 *
 * `inflight` counts the requests queued or being served. A reboot waits for
 * it to reach 0, so a merge or a push is not cut off by the company stopping
 * underneath it (#21). The rest is the dashboard's hub line (#23).
 *
 * @param {boolean} serving whether a request is being served right now
 * @returns {void}
 */
function heartbeat(serving) {
  let queued = 0;
  for (const role of ROLES) {
    try {
      queued += withJailDir(path.join(HUB, role), "req", {}, (req) =>
        req.list().filter(isRequest),
      ).length;
    } catch {
      // This role has never spoken to hubd, or its req/ is not a directory.
    }
  }
  /** @type {import("./hub-health.mjs").HubdAlive} */
  const alive = {
    ...health,
    heartbeatAt: Date.now(),
    inflight: (serving ? 1 : 0) + queued,
  };
  writeAtomic(ALIVE, JSON.stringify(alive));
}

/** A request's id, as hub.mjs makes them: it names the response file. */
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

/** The most a request may be: argv for one command. */
const REQUEST_MAX_BYTES = 64 * 1024;

/**
 * @param {string} name
 * @returns {boolean}
 */
function isRequest(name) {
  return name.endsWith(".json") && !name.startsWith(".");
}

/**
 * Serve a role's spool. req/ and res/ are the jail's (jail-fs.mjs, #329):
 * what is in them, and what they are, is up to the agent, so nothing here
 * goes through a path that a symlink could redirect.
 *
 * @param {string} role
 * @returns {Promise<void>}
 */
async function drain(role) {
  const home = path.join(HUB, role);
  fs.mkdirSync(home, { recursive: true });
  /** @type {import("./jail-fs.mjs").JailDir | undefined} */
  let req;
  /** @type {import("./jail-fs.mjs").JailDir | undefined} */
  let res;
  try {
    req = openJailDir(home, "req", { create: true });
    res = openJailDir(home, "res", { create: true });
  } catch (error) {
    req?.close();
    refused(role, "req/ or res/", error);
    return;
  }
  try {
    await serveSpool(role, req, res);
  } finally {
    req.close();
    res.close();
  }
}

/**
 * A request the jail made unservable: logged, and the agent gets no answer.
 *
 * @param {string} role
 * @param {string} site
 * @param {unknown} error
 * @returns {void}
 */
function refused(role, site, error) {
  console.error(
    `hubd: ${role}: refused ${site}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

/**
 * @param {string} role
 * @param {import("./jail-fs.mjs").JailDir} req
 * @param {import("./jail-fs.mjs").JailDir} res
 * @returns {Promise<void>}
 */
async function serveSpool(role, req, res) {
  const pending = req.list().filter(isRequest).sort();

  for (const name of pending) {
    const id = name.replace(/\.json$/, "");
    if (!REQUEST_ID.test(id)) {
      refused(role, `request ${JSON.stringify(name)}`, "not a request id");
      req.remove(name);
      continue;
    }
    /** @type {string} */
    let text;
    try {
      text = req.readSmall(name, REQUEST_MAX_BYTES);
    } catch (error) {
      refused(role, `request ${name}`, error);
      req.remove(name);
      continue;
    }
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    // Before the request leaves the spool, so a reboot waiting for hubd to
    // go quiet never sees it as neither queued nor in flight.
    heartbeat(true);
    req.remove(name);

    const raw = /** @type {Record<string, unknown>} */ (parsed);
    /** @type {Record<string, unknown>} */
    let response;
    try {
      response = await handle({
        // The role comes from the directory, never from the request body: a
        // request claiming to be from another role would otherwise be
        // authorized as that role.
        role,
        kind: typeof raw.kind === "string" ? raw.kind : "",
        argv: Array.isArray(raw.argv) ? raw.argv.map(String) : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed";
      health.lastError = { at: Date.now(), message };
      response = { allow: true, code: 1, stderr: `hubd: ${message}\n` };
    } finally {
      if (response.allow === false) {
        health.refused += 1;
      } else {
        health.served += 1;
      }
      heartbeat(false);
    }

    try {
      res.writeAtomic(`${id}.json`, JSON.stringify(response));
    } catch (error) {
      refused(role, `response ${id}.json`, error);
    }
  }
}

async function main() {
  if (!fs.existsSync(COMPANY)) {
    console.error(`hubd: ${COMPANY} not found; run claude-llc-init first`);
    process.exit(1);
  }
  const cfg = company();
  fs.mkdirSync(GH_CWD, { recursive: true });
  if (!fs.existsSync(MIRROR)) {
    const init = await run("git", ["init", "--bare", "-q", MIRROR], HUB, GIT_ENV);
    if (init.code !== 0) {
      console.error(`hubd: could not create ${MIRROR}: ${init.stderr}`);
      process.exit(1);
    }
  }
  const token = await run("gh", ["auth", "token"], GH_CWD);
  if (token.code !== 0) {
    console.error("hubd: gh is not authenticated on this machine");
    process.exit(1);
  }
  console.error(
    `hubd: serving ${String(ROLES.length)} roles on ${cfg.repo} (project ${String(cfg.project)})`,
  );

  fs.mkdirSync(HUB, { recursive: true });
  // One hubd per spool: two would run every request twice (#23).
  if (!takeLock(LOCK)) {
    console.error(`hubd: another hubd holds ${LOCK}; not starting a second`);
    process.exit(1);
  }
  health.sha = readBoot()?.sha.slice(0, 7) ?? null;
  // A restart costs no sweep the board's age does not call for.
  loadBoard(cfg);
  heartbeat(false);
  let lastBeat = Date.now();
  // The dashboard's budget line. Free to ask (see `budgetExhausted`), and
  // it is also what lifts `limitedUntil` once GitHub resets the budget.
  const BUDGET_CHECK_MS = 60_000;
  await budgetExhausted();
  await syncSkills(cfg);
  let lastBudgetCheck = Date.now();
  const stop = () => {
    fs.rmSync(ALIVE, { force: true });
    releaseLock(LOCK);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  for (;;) {
    for (const role of ROLES) {
      try {
        await drain(role);
      } catch (error) {
        console.error(`hubd: ${role}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    if (hints.size > 0) {
      try {
        await flushHints(company());
      } catch (error) {
        console.error(`hubd: board: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    // Cheap enough at this interval, and far below the staleness window hub
    // allows, so a busy daemon is never mistaken for a dead one.
    if (Date.now() - lastBeat > 5000) {
      heartbeat(false);
      lastBeat = Date.now();
    }
    if (Date.now() - lastBudgetCheck > BUDGET_CHECK_MS) {
      await budgetExhausted();
      // A merged skill reaches every running agent within this interval.
      await syncSkills(cfg);
      lastBudgetCheck = Date.now();
    }
    await sleep(300);
  }
}

await main();
