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
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { GIT_ENV, GIT_HARDENING } from "./git-hardening.mjs";
import { isBoardRead, limitedMessage, parseRateLimit, usesGraphql } from "./hub-budget.mjs";
import { hasFilter } from "./hub-filter.mjs";
import { approvalsSatisfied, checksSatisfied, explainGuard } from "./hub-guards.mjs";
import {
  ghIssue,
  ghPull,
  listPath,
  listRows,
  pickJson,
  planList,
  planView,
  renderView,
} from "./hub-rest.mjs";
import { obj } from "./protocol.mjs";
import { DRAIN_MS, clock, rebootAllowed } from "./reboot.mjs";
import { ROLES, authorize, parseMerge, parseReview, touchesGate } from "./hub-policy.mjs";
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
/** The board as hubd last read it, for the dashboard. Never read by agents. */
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
/** Present while hubd is serving a request, so a reboot waits for it. */
const BUSY = path.join(HUB, "hubd.busy");

/**
 * Commands that accept `--repo`. The repository is pinned by us rather than
 * taken from the request, and the policy refuses an agent-supplied `--repo`,
 * so there is exactly one repository this company can act on.
 */
const REPO_SCOPED = new Set(["issue", "pr", "label", "run", "workflow", "release"]);

/**
 * @returns {{
 *   repo: string, owner: string, project: number, expectedChecks: string[],
 *   columns: string[], acting: Record<string, string[] | undefined>,
 * }}
 */
function company() {
  /** @type {unknown} */
  const raw = JSON.parse(fs.readFileSync(COMPANY, "utf8"));
  const cfg = /** @type {Record<string, unknown>} */ (
    typeof raw === "object" && raw !== null ? raw : {}
  );
  const repo = typeof cfg.repo === "string" ? cfg.repo : "";
  return {
    repo,
    owner: repo.split("/")[0] ?? "",
    project: typeof cfg.project === "number" ? cfg.project : 0,
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
function gh(args) {
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
 * Ask GitHub how much GraphQL budget is left, and remember an empty one.
 *
 * `rate_limit` is free: GitHub does not count it against either bucket, so
 * asking after every failure costs nothing.
 *
 * @returns {Promise<boolean>} whether the budget is exhausted right now
 */
async function budgetExhausted() {
  const result = await gh(["api", "rate_limit"]);
  const graphql = result.code === 0 ? parseRateLimit(result.stdout) : null;
  if (graphql === null) {
    return false;
  }
  writeAtomic(RATE_LIMIT, JSON.stringify({ checkedAt: Date.now(), ...graphql }));
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
      const result = await gh(["pr", "checks", pr, "--repo", cfg.repo, "--json", "name,bucket"]);
      /** @type {{ name: string, conclusion: string }[]} */
      let checks = [];
      if (result.code === 0 || result.stdout !== "") {
        try {
          /** @type {unknown} */
          const raw = JSON.parse(result.stdout);
          const rows = /** @type {Record<string, unknown>[]} */ (Array.isArray(raw) ? raw : []);
          checks = rows.map((row) => ({
            name: String(row.name),
            conclusion: String(row.bucket),
          }));
        } catch {
          checks = [];
        }
      }
      const verdict = checksSatisfied(checks, cfg.expectedChecks);
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
 * Which files would this push change, relative to main? Used only to tag the
 * audit log, so that a change to the definition of a quality gate is findable
 * afterwards with one `grep` instead of being indistinguishable from ordinary
 * work.
 *
 * Compared in the mirror, against `main` as GitHub has it: not against
 * whatever an agent's repository calls `origin/main`.
 *
 * @param {string} ref the pushed branch, as it is in the mirror
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<string[]>}
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
    return [];
  }
  // --no-ext-diff and --no-textconv: a `.gitattributes` on the branch can
  // name a diff driver, which is a command.
  const result = await git([
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--name-only",
    `main...${ref}`,
  ]);
  return result.code === 0 ? result.stdout.split("\n").filter((line) => line !== "") : [];
}

/* -------------------------------------------------------------------------- */
/* Visibility                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The board changes rarely and is read constantly: by every visibility check,
 * by every agent's `board ls`, and by the dashboard. One snapshot serves all
 * three, so the whole company costs at most one board query a minute. Any
 * board mutation through hubd drops it, so a move shows up on the next read.
 */
const BOARD_TTL_MS = 60_000;
/** @type {{ at: number, stdout: string, numbers: Set<number> } | null} */
let boardCache = null;

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
 * The project's item list as JSON, fresh within `BOARD_TTL_MS`, or `null`
 * when GitHub cannot be asked.
 *
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<string | null>}
 */
async function boardSnapshot(cfg) {
  if (boardCache === null || Date.now() - boardCache.at > BOARD_TTL_MS) {
    const result = await gh([
      "project",
      "item-list",
      String(cfg.project),
      "--owner",
      cfg.owner,
      "--format",
      "json",
      "--limit",
      "1000",
    ]);
    if (result.code !== 0) {
      // Board membership changes rarely. A snapshot a little out of date
      // serves visibility checks better than refusing every read while
      // GitHub is unreachable or the GraphQL budget is gone.
      return boardCache?.stdout ?? null;
    }
    try {
      /** @type {unknown} */
      const items = JSON.parse(result.stdout);
      const at = Date.now();
      boardCache = { at, stdout: result.stdout, numbers: boardNumbers(items, cfg.repo) };
      writeAtomic(BOARD_SNAPSHOT, JSON.stringify({ at, board: items }));
    } catch {
      return null;
    }
  }
  return boardCache.stdout;
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
  if ((await boardSnapshot(cfg)) === null || boardCache === null) {
    return null;
  }
  const { numbers } = boardCache;
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
  const spendsGraphql = usesGraphql(kind, argv) && !servedByRest(kind, argv);
  if (spendsGraphql && Date.now() < limitedUntil) {
    audit({ role, kind, argv, decision: "rate-limited" });
    return limitedResponse();
  }

  const response = await serve(request, verdict, acting);

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
    const raw = obj(JSON.parse(fs.readFileSync(REBOOT, "utf8")));
    return typeof raw.requestedAt === "number" &&
      typeof raw.reason === "string" &&
      typeof raw.by === "string" &&
      typeof raw.deadline === "number" &&
      typeof raw.bootSha === "string"
      ? {
          requestedAt: raw.requestedAt,
          reason: raw.reason,
          by: raw.by,
          deadline: raw.deadline,
          bootSha: raw.bootSha,
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * The files `main` on GitHub changed since `sha`, read in the mirror.
 *
 * @param {string} sha
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<string[] | null>} `null` when that could not be worked out
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
  const log = await git(["log", "--format=", "--name-only", `${sha}..main`]);
  return log.code === 0 ? log.stdout.split("\n").filter((line) => line !== "") : null;
}

/**
 * Schedule or abort a company reboot (#21). hubd only checks and records
 * it in `.bots/reboot.json`; the supervisor, which watches every pane,
 * drains the company and starts the restarter.
 *
 * @param {string} role
 * @param {string[]} argv `["request", reason]` or `["abort"]`
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<Record<string, unknown>>}
 */
async function reboot(role, argv, cfg) {
  const kind = "reboot";
  const pending = readReboot();
  if (argv[0] === "abort") {
    if (pending === null) {
      return { allow: true, code: 1, stdout: "", stderr: "company: no reboot is scheduled\n" };
    }
    fs.rmSync(REBOOT, { force: true });
    audit({ role, kind, argv, decision: "allowed" });
    return {
      allow: true,
      code: 0,
      stdout: "Reboot aborted. The supervisor tells everyone.\n",
      stderr: "",
    };
  }

  const boot = readBoot();
  const now = Date.now();
  const allowed = rebootAllowed({
    bootSha: boot?.sha ?? null,
    changedPaths: boot === null ? null : await changedSince(boot.sha, cfg),
    lastRebootAt: boot?.at ?? null,
    now,
    pending,
  });
  if (!allowed.ok || boot === null) {
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
  };
  writeAtomic(REBOOT, JSON.stringify(scheduled));
  audit({ role, kind, argv, decision: "allowed" });
  return {
    allow: true,
    code: 0,
    stdout:
      `Reboot scheduled. The supervisor announces it within 30 s, and the company stops by ` +
      `${clock(scheduled.deadline)} at the latest.\nAbort: company reboot --abort\n`,
    stderr: "",
  };
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

  // Before the guards, whose refusals would otherwise describe a pull request
  // the company is not supposed to know about.
  const visibility = await checkVisibility(kind, argv, cfg);
  if (!visibility.ok) {
    audit({ role, kind, argv, decision: "hidden", reason: visibility.reason });
    return { allow: false, reason: visibility.reason, code: 77 };
  }

  if (verdict.guards !== undefined) {
    const guarded = await evaluateGuards(verdict.guards, argv);
    if (!guarded.ok) {
      audit({ role, kind, argv, decision: "refused-by-guard", reason: guarded.reason });
      return { allow: false, reason: guarded.reason, code: 77 };
    }
    // The merge gh runs is the one the guards checked: that pull request,
    // squashed, and only if its head is still the commit the approvals and
    // checks were validated against. A push in between fails the merge.
    // Every guarded request is a merge, and it never reaches the unpinned
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
    audit({ role, kind, argv, decision: "allowed", code: result.code, sha: guarded.sha });
    return { allow: true, ...result };
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
    const paths = await changedPaths(ref, cfg);
    const gateChange = touchesGate(paths);
    const result = await git(["push", remoteUrl(cfg), `${ref}:${ref}`]);
    audit({
      role,
      kind,
      argv,
      decision: "allowed",
      code: result.code,
      ...(gateChange ? { tag: "gate-change", paths: paths.filter((p) => touchesGate([p])) } : {}),
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
    const snapshot = await boardSnapshot(cfg);
    if (snapshot !== null) {
      audit({ role, kind, argv, decision: "allowed", code: 0, cached: true });
      return { allow: true, code: 0, stdout: snapshot, stderr: "" };
    }
  }

  const result = await gh(pinRepo(argv, cfg));
  if (
    argv[0] === "project" &&
    !["item-list", "field-list", "list", "view"].includes(argv[1] ?? "")
  ) {
    // An item just added, moved or archived must show up on the next list,
    // not when the snapshot happens to expire.
    boardCache = null;
  }
  audit({ role, kind, argv, decision: "allowed", code: result.code });
  return { allow: true, ...result };
}

/* -------------------------------------------------------------------------- */

/**
 * @param {string} role
 * @returns {Promise<void>}
 */
async function drain(role) {
  const reqDir = path.join(HUB, role, "req");
  const resDir = path.join(HUB, role, "res");
  fs.mkdirSync(reqDir, { recursive: true });
  fs.mkdirSync(resDir, { recursive: true });

  const pending = fs
    .readdirSync(reqDir)
    .filter((name) => name.endsWith(".json") && !name.startsWith("."))
    .sort();

  for (const name of pending) {
    const file = path.join(reqDir, name);
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    // Written before the request leaves the spool, so a reboot waiting for
    // the company to go quiet never sees neither (#21): a merge or a push is
    // not cut off by the company stopping underneath it.
    fs.writeFileSync(BUSY, `${role}\n`);
    fs.rmSync(file, { force: true });

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
      response = {
        allow: true,
        code: 1,
        stderr: `hubd: ${error instanceof Error ? error.message : "failed"}\n`,
      };
    } finally {
      fs.rmSync(BUSY, { force: true });
    }

    const id = name.replace(/\.json$/, "");
    const tmp = path.join(resDir, `.${id}.json.part`);
    fs.writeFileSync(tmp, JSON.stringify(response));
    fs.renameSync(tmp, path.join(resDir, `${id}.json`));
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

  // A heartbeat, so `hub` can distinguish "the daemon is busy" from "the
  // daemon was never started". Without it, every call inside a sandbox blocks
  // for the full request timeout and the agent looks hung.
  //
  // A timestamp rather than a pid, because the sandboxes run with
  // --unshare-all, which includes a PID namespace: a pid written here is
  // meaningless inside a jail, where `process.kill(pid, 0)` would report
  // every live daemon as dead. That is exactly how the first version of this
  // made every agent announce that the hub was down.
  const alive = path.join(HUB, "hubd.alive");
  fs.mkdirSync(HUB, { recursive: true });
  const beat = () => {
    fs.writeFileSync(alive, `${String(Date.now())}\n`);
  };
  beat();
  let lastBeat = Date.now();
  // The dashboard's budget line. Free to ask (see `budgetExhausted`), and
  // it is also what lifts `limitedUntil` once GitHub resets the budget.
  const BUDGET_CHECK_MS = 60_000;
  await budgetExhausted();
  let lastBudgetCheck = Date.now();
  const stop = () => {
    fs.rmSync(alive, { force: true });
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
    // Cheap enough at this interval, and far below the staleness window hub
    // allows, so a busy daemon is never mistaken for a dead one.
    if (Date.now() - lastBeat > 5000) {
      beat();
      lastBeat = Date.now();
    }
    if (Date.now() - lastBudgetCheck > BUDGET_CHECK_MS) {
      await budgetExhausted();
      lastBudgetCheck = Date.now();
    }
    await sleep(300);
  }
}

await main();
