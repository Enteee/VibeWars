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
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { GITHUB_TOKEN_VARS, paths } from "./creds.mjs";
import { GIT_ENV, GIT_SSH_VARS, remoteHardening } from "./git-hardening.mjs";
import {
  HINT_DELAY_MS,
  flagValue,
  itemAddTarget,
  ISSUE_ITEMS_QUERY,
  ITEM_QUERY,
  answerBoard,
  applyFacts,
  blockedAfterMove,
  blockedSwept,
  readBlocked,
  itemNumber,
  LANDING_COLUMN,
  listing,
  needsSweep,
  parseBoardRequest,
  parseColumnFlag,
  parseIssueAnswer,
  parseItemAnswer,
  parseRankRequest,
  planHint,
  planLanding,
  planMutation,
  selectorNumber,
  RANK_MUTATION,
  rankCards,
  rankLine,
  rankTarget,
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
  boardMoveAllowed,
  commitRuns,
  landingAllowed,
  everyJobSucceeded,
  jobsSatisfied,
  judgingRuns,
  explainGuard,
  pathsOutside,
  pathsWithin,
  workflowAuthorAllowed,
} from "./hub-guards.mjs";
import {
  jobsFromRest,
  runsFromRest,
  ghIssue,
  ghPull,
  listPath,
  listRows,
  pickJson,
  planList,
  planView,
  renderView,
  VIEW_FIELDS,
} from "./hub-rest.mjs";
import { COMMENT_FIELDS, jsonFields, scrubJson, unknownField } from "./hub-strangers.mjs";
import {
  BOARD_QUERY,
  costBetween,
  parseBoardPage,
  recordSpend,
  summarizeSpend,
} from "./hub-spend.mjs";
import { HEARTBEAT_MS, HUBD_ALIVE } from "./hub-health.mjs";
import {
  closingPulls,
  ciMessage,
  endedMessage,
  failedSpecs,
  listWatches,
  parseWatches,
  parseWatchRequest,
  supersededMessage,
  WATCH_CAP_MS,
} from "./hub-watch.mjs";
import { SYSTEM, obj } from "./protocol.mjs";
import {
  COMPANY_PATHSPECS,
  DRAIN_MS,
  PROPOSAL_POLL_MS,
  announcement,
  clock,
  decideProposal,
  parseDecision,
  parseProposal,
  parseReboot,
  proposalName,
  rebootAllowed,
  WORKDAY,
} from "./reboot.mjs";
import { SKILLS_PREFIX, installSkills, skillFiles } from "./skills-sync.mjs";
import { createWebCache } from "./web-cache.mjs";
import { ARCHIVE_ORIGIN, LIVE_ORIGIN, runWiki } from "./wiki.mjs";
import {
  readLimit,
  readPresence,
  readStaffFile,
  readUsage,
  usageReader,
} from "./company-facts.mjs";
import { historyText, movesBetween, parseHistory } from "./board-history.mjs";
import { HOLD_BELOW, freeBytes } from "./disk.mjs";
import {
  addEdge,
  buildKpis,
  ciKpis,
  ciJobKpis,
  ciRunFromRest,
  ciRunJobsFromRest,
  cpuShare,
  employeeOfUnit,
  EDGES_SCHEMA_VERSION,
  flowKpis,
  parseCiHistory,
  parseCiJobs,
  planCiJobs,
  parseEdges,
  parseMeminfo,
  parseUnits,
  projectSevenDay,
  staffKpis,
  tokensByRole,
  unreadCiRunJobs,
} from "./kpi.mjs";
import { idleWaitsDir, parseWaits, WAITS_FILE } from "./waits.mjs";
import { loadLines } from "./company-load.mjs";
import { peekRows } from "./peek.mjs";
import {
  maxRunners,
  readAlertTold as readRunnersAlertTold,
  readStatus as readRunnersStatus,
  runnersLines,
  runnersStateDir,
  writeAlertTold as writeRunnersAlertTold,
  writeTarget as writeRunnersTarget,
} from "./runners-state.mjs";
import {
  dueNudges,
  ownNudges,
  parseNudgeClock,
  parseOwnSchedules,
  planScheduleCommand,
  scheduleReader,
} from "./schedule.mjs";
import { createIssueBatch, newIssueMessage, WINDOW_MS } from "./new-issues.mjs";
import {
  applyStaff,
  markReady,
  parseStaff,
  roleOf,
  staffAllowed,
  staffReader,
  withStaffLock,
} from "./staff.mjs";
import {
  RESTRICTED_PATHS,
  ROLES,
  SCHEDULERS,
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
/** The code the company runs: the locked tree (#1861), not the checkout. */
const CODE_DIR = required("VIBEWARS_CODE");
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
/**
 * The company's credential home (#864). hubd works on GitHub as the company
 * (#866): gh with its config directory, git with its push key.
 */
const CREDENTIALS = paths(process.env.VIBEWARS_CREDENTIALS ?? "");
// A token in the operator's environment beats GH_CONFIG_DIR, and an ssh
// command beats the pinned key: either would make calls the operator's.
// hubd never uses one.
for (const name of [...GITHUB_TOKEN_VARS, ...GIT_SSH_VARS]) {
  Reflect.deleteProperty(process.env, name);
}
/** git's pins, with the company's push key for whatever reaches GitHub. */
const GIT_PINS = remoteHardening(CREDENTIALS.sshKey);
/** The commit and time the company last started from (claude-llc writes it). */
const BOOT = path.join(ROOT, "boot.json");
/** A reboot the operator approved and the supervisor has not yet carried out. */
const REBOOT = path.join(ROOT, "reboot.json");
/**
 * A reboot the manager proposed and the operator has not decided (#960).
 * Host-only, like every file in `.bots/` itself: no jail mounts it.
 */
const PROPOSAL = path.join(ROOT, "reboot-proposal.json");
/** The operator's decision on it, written only by the sidecar, from a checked tap. */
const DECISION = path.join(ROOT, "link", "reboot-decision.json");
/** Who is employed (#62): hubd is its only writer. */
const STAFF = path.join(ROOT, "staff.json");
/** The heartbeat, `{ ts, inFlight }`: see `heartbeat`. */
const ALIVE = path.join(HUB, HUBD_ALIVE);
/** `schedules.json`: the schedulers' own recurring reminders to themselves (#678). Host-only. */
const SCHEDULES = path.join(HUB, "schedules.json");

/** `nudges.json`: when hubd began counting and what it sent, for the dashboard (#547). */
const NUDGES = path.join(HUB, "nudges.json");
/** Every column change, one JSON line each (#891); history starts at the file. */
const BOARD_HISTORY = path.join(HUB, "board-history.jsonl");
/** Every completed Actions run of the last 8 days, one JSON line each (#1612). */
const CI_HISTORY = path.join(HUB, "ci-history.jsonl");
/** Each run's jobs, a line per run (#1892), kept for 7 days. */
const CI_JOBS = path.join(HUB, "ci-jobs.jsonl");
/** The KPI snapshot (kpi.mjs), written every `KPI_EVERY_MS`; every jail reads it. */
const KPIS = path.join(HUB, "kpis.json");
/**
 * What `hub wiki` read (#1381). Beside hub/, not in it: every jail binds
 * hub/ read-only, and this is host-only.
 */
const WEB_CACHE = path.join(ROOT, "web-cache");
/** The 7-day utilization's step edges (#1313), kept across restarts for its projection. */
const KPI_EDGES = path.join(HUB, "kpi-edges.json");
/** `blocked.json`: the column each Blocked card came from, by project item id (#639). */
const BLOCKED = path.join(HUB, "blocked.json");
/** The CI watches agents asked for (#736), hubd's alone. */
const WATCHES = path.join(HUB, "watches.json");
const LOCK = path.join(HUB, "hubd.lock");
/** Every employee's last turn, as the manager's `peek` reads it (#19), for `company load`. */
const PEEK = path.join(ROOT, "peek");
/**
 * The runner supervisor's state (#1890): hubd writes its target and reads
 * its status, and makes no runner call of its own. Host-only, outside ROOT.
 */
const RUNNERS_STATE = runnersStateDir(process.env);
/** The most runners the operator allows; 0, its default, keeps them off. */
const MAX_RUNNERS = maxRunners(process.env);
/** The agents' Claude logs, for `company load`'s tokens (#747): the dashboard's reader. */
const usage = usageReader(process.env.VIBEWARS_CLAUDE_BOXES);

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
 *   board: import("./hub-board.mjs").BoardIds | null, maxAgents: number | null,
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
    // Required for hiring; `staff` refuses every request without it.
    maxAgents: typeof cfg.maxAgents === "number" ? cfg.maxAgents : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Running things                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The longest any gh or git child may run (#496). hubd serves one request at
 * a time, so a call that never returns would starve every other employee.
 * HUBD_CHILD_TIMEOUT_MS is for a test to shorten it.
 */
const CHILD_DEADLINE_MS = Number(process.env.HUBD_CHILD_TIMEOUT_MS ?? 120_000);
if (!Number.isFinite(CHILD_DEADLINE_MS) || CHILD_DEADLINE_MS <= 0) {
  throw new Error("HUBD_CHILD_TIMEOUT_MS must be a positive number of milliseconds");
}

/** How long a child has after SIGTERM before its group gets SIGKILL. */
const KILL_GRACE_MS = 5000;

/**
 * Ends a child and everything it started, once its deadline has passed.
 * Children run detached, as leaders of their own process group, because git's
 * remote helper and gh's credential helpers inherit the pipes: killing only
 * the child leaves `close` waiting for them (#496).
 *
 * @param {import("node:child_process").ChildProcess} child
 * @returns {void}
 */
function killGroup(child) {
  const pid = child.pid;
  if (pid === undefined) {
    return;
  }
  /** @param {NodeJS.Signals} signal */
  const send = (signal) => {
    try {
      process.kill(-pid, signal);
    } catch {
      // The group is already gone.
    }
  };
  send("SIGTERM");
  setTimeout(() => {
    send("SIGKILL");
  }, KILL_GRACE_MS).unref();
}

/**
 * @param {string} file
 * @param {string[]} args
 * @param {string} cwd
 * @param {Record<string, string>} [extraEnv]
 * @returns {Promise<{ code: number, stdout: string, stderr: string, timedOut?: boolean }>}
 */
function run(file, args, cwd, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd,
      env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0", ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, CHILD_DEADLINE_MS);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (/** @type {string} */ chunk) => (stdout += chunk));
    child.stderr.on("data", (/** @type {string} */ chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(deadline);
      resolve({ code: 127, stdout, stderr: `${stderr}${error.message}\n` });
    });
    child.on("close", (code, signal) => {
      clearTimeout(deadline);
      if (timedOut) {
        const seconds = String(Math.round(CHILD_DEADLINE_MS / 1000));
        resolve({
          code: 124,
          stdout,
          stderr: `${stderr}hubd: ${file} ${args.slice(0, 2).join(" ")} timed out after ${seconds} s\n`,
          timedOut: true,
        });
        return;
      }
      // Killed by a signal is a failure, never the success a null code reads as.
      resolve({
        code: code ?? 1,
        stdout,
        stderr: signal === null ? stderr : `${stderr}hubd: ${file} killed by ${signal}\n`,
      });
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
  return run("gh", args, GH_CWD, { GH_REPO: company().repo, GH_CONFIG_DIR: CREDENTIALS.gh });
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
 * The workflows whose jobs the merge gate reads. A constant, never taken
 * from a request. Each runs on every pull request.
 *
 * - NAMED: the jobs `expectedChecks` names, which must exist and succeed.
 * - EVERY_JOB: no job is named, but every job of the run must succeed. These
 *   are the workflows that used to block a merge as a failing or pending
 *   check: the repeated e2e specs, and CodeQL's job (whose steps are
 *   `continue-on-error`, so it fails only when the run itself breaks).
 */
const NAMED_WORKFLOWS = ["ci.yml", "dependency-review.yml"];
const EVERY_JOB_WORKFLOWS = ["e2e-repeat.yml", "codeql.yml"];
/** Workflows a path filter may leave unstarted: no run is then satisfied (#1884). */
const OPTIONAL_WORKFLOWS = ["e2e-repeat.yml"];
/** Every workflow the merge gate reads, the CI KPIs' "gate" (#1612). */
const GATE_WORKFLOWS = [...NAMED_WORKFLOWS, ...EVERY_JOB_WORKFLOWS];

/**
 * The jobs that judged one commit, read from the pull-request runs of the
 * given workflows for exactly that commit (#96, #123).
 *
 * Check runs and commit statuses are never read: any token with
 * `checks: write` can post one for any commit. A job exists only because a
 * workflow ran. When anything cannot be read it says why, and never answers
 * "none".
 *
 * @param {string} sha
 * @param {ReturnType<typeof company>} cfg
 * @param {string[]} files workflow files, by name under .github/workflows
 * @returns {Promise<{ runs: { id: number | null, name: string, status: string, conclusion: string | null }[][] } | { error: string } | { refusal: string }>}
 */
async function restJobs(sha, cfg, files) {
  /** @param {string} rel */
  const read = async (rel) => {
    const result = await gh(["api", `repos/${cfg.repo}/${rel}`]);
    if (result.code !== 0) {
      return { error: result.stderr.trim().split("\n")[0] ?? "" };
    }
    try {
      return { answer: /** @type {unknown} */ (JSON.parse(result.stdout)) };
    } catch {
      return { error: `${rel.replace(/\?.*/, "")} did not answer JSON` };
    }
  };

  /** @type {{ id: number | null, name: string, status: string, conclusion: string | null }[][]} */
  const jobs = [];
  for (const file of files) {
    const listed = await read(
      `actions/workflows/${file}/runs?head_sha=${sha}&event=pull_request&per_page=100`,
    );
    if ("error" in listed) {
      return listed;
    }
    const runs = runsFromRest(listed.answer);
    if ("error" in runs) {
      return runs;
    }
    const run = judgingRuns(runs.runs, {
      sha,
      repo: cfg.repo,
      file,
      optional: OPTIONAL_WORKFLOWS.includes(file),
    });
    if (!run.ok) {
      return { refusal: run.reason };
    }
    for (const id of run.ids) {
      const answered = await read(`actions/runs/${String(id)}/jobs?filter=latest&per_page=100`);
      if ("error" in answered) {
        return answered;
      }
      const parsed = jobsFromRest(answered.answer);
      if ("error" in parsed) {
        return parsed;
      }
      jobs.push(parsed.jobs);
    }
  }
  return { runs: jobs };
}

/** The most pages of comments or reviews hubd reads for one view. */
const MAX_PAGES = 10;

/**
 * Every row of a REST list, page by page.
 *
 * @param {string} rel e.g. `issues/17/comments`
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<unknown[] | undefined>} `undefined` if any page cannot be read
 */
async function restPages(rel, cfg) {
  /** @type {unknown[]} */
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const answer = await rest(`${rel}?per_page=100&page=${String(page)}`, cfg);
    if (!Array.isArray(answer)) {
      return undefined;
    }
    /** @type {unknown[]} */
    const got = answer;
    rows.push(...got);
    if (got.length < 100) {
      return rows;
    }
  }
  return undefined;
}

/**
 * Answer `gh issue|pr view` from REST, or `null` to let gh answer it.
 *
 * Comments are never left to gh, whose answer hubd cannot scrub of
 * strangers' text (hub-strangers.mjs): if REST cannot read them, the
 * request fails.
 *
 * @param {import("./hub-rest.mjs").ViewPlan} plan
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ code: number, stdout: string, stderr: string } | null>}
 */
async function restView(plan, cfg) {
  const unread = {
    code: 1,
    stdout: "",
    stderr: `hub: could not read the comments on ${plan.selector} from GitHub; try again\n`,
  };
  const number = plan.number ?? (await resolve(plan.group, plan.selector, cfg))?.number;
  if (number === undefined) {
    return unread;
  }
  const path_ = `${plan.group === "issue" ? "issues" : "pulls"}/${String(number)}`;
  const raw = await rest(path_, cfg);
  if (raw === undefined) {
    return plan.comments ? unread : null;
  }
  // `issues/{n}` also answers for a pull request; gh's `issue view` does
  // too, so that is not an error.
  /** @type {unknown[] | undefined} */
  let comments;
  /** @type {unknown[] | undefined} */
  let reviews;
  if (plan.comments) {
    comments = await restPages(`issues/${String(number)}/comments`, cfg);
    reviews = plan.group === "pr" ? await restPages(`pulls/${String(number)}/reviews`, cfg) : [];
    if (comments === undefined || reviews === undefined) {
      return unread;
    }
  }
  const item = plan.group === "issue" ? ghIssue(raw, comments) : ghPull(raw, comments, reviews);
  if (plan.fields === null) {
    return { code: 0, stdout: renderView(plan.group, item, plan.comments), stderr: "" };
  }
  return { code: 0, stdout: pickJson(item, plan.fields), stderr: "" };
}

/**
 * gh's `--json` answer with strangers' comments hidden, or `null` if it
 * cannot be read well enough to be sure.
 *
 * @param {string} stdout
 * @returns {string | null}
 */
function scrubbedOutput(stdout) {
  try {
    const scrubbed = scrubJson(/** @type {unknown} */ (JSON.parse(stdout)));
    return scrubbed === null ? null : `${JSON.stringify(scrubbed)}\n`;
  } catch {
    return null;
  }
}

/** Why hubd refuses an answer it could not scrub. */
const UNCHECKED = "could not check comment authors";

/** Why hubd refuses a `--json` field it does not know. */
const FIELD_CHECKED = "which checks every field for comments by people outside the project";

/**
 * Serve `gh issue|pr view`, with every comment by someone outside the
 * project replaced (hub-strangers.mjs, the operator's rule in #394). No gh
 * output that can hold a comment leaves here unless this code has parsed
 * and scrubbed it: `--comments` is answered from REST, comment fields of
 * `--json` are scrubbed, and a field hub does not know is refused.
 *
 * @param {string[]} argv
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ code: number, stdout: string, stderr: string, rest?: true } | { reason: string }>}
 */
async function serveView(argv, cfg) {
  const fields = jsonFields(argv);
  const unknown =
    fields === null ? null : unknownField(fields, VIEW_FIELDS[argv[0] === "pr" ? "pr" : "issue"]);
  if (unknown !== null) {
    return {
      reason: `--json ${unknown} is not available through hub, ${FIELD_CHECKED}`,
    };
  }
  const plan = planView(argv);
  if (plan !== null) {
    const answered = await restView(plan, cfg);
    if (answered !== null) {
      return { ...answered, rest: true };
    }
  } else if (fields === null && argv.some((word) => /^(--comments(=|$)|-[a-z]*c)/i.test(word))) {
    return {
      reason: "--comments is served by hub alone: issue|pr view <number, URL or branch> --comments",
    };
  }
  const result = await gh(pinRepo(argv, cfg));
  if (result.code !== 0 || !fields?.some((field) => COMMENT_FIELDS.has(field))) {
    return result;
  }
  const stdout = scrubbedOutput(result.stdout);
  return stdout === null ? { reason: UNCHECKED } : { ...result, stdout };
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
  return run("git", [...GIT_PINS, `--git-dir=${MIRROR}`, ...args], HUB, GIT_ENV);
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
    const child = spawn("git", [...GIT_PINS, `--git-dir=${MIRROR}`, ...args], {
      cwd: HUB,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...GIT_ENV },
      stdio: ["ignore", "pipe", "ignore"],
      detached: true,
    });
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, CHILD_DEADLINE_MS);
    /** @type {Buffer[]} */
    const chunks = [];
    child.stdout.on("data", (/** @type {Buffer} */ chunk) => chunks.push(chunk));
    child.on("error", () => {
      clearTimeout(deadline);
      resolve({ code: 127, stdout: Buffer.alloc(0) });
    });
    child.on("close", (code) => {
      clearTimeout(deadline);
      // A killed git left a truncated blob: it is a failure with no bytes.
      resolve(
        timedOut || code === null
          ? { code: timedOut ? 124 : 1, stdout: Buffer.alloc(0) }
          : { code, stdout: Buffer.concat(chunks) },
      );
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

/** The employee whose request is being served, for the audit log (#62). */
let servingEmployee = /** @type {string | null} */ (null);

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
 * Whether CI on `sha`, the head of `pr`, is green: the merge gate's verdict,
 * which the In Review gate and `hub watch` (#736) share.
 *
 * @param {string} pr
 * @param {string} sha
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ ok: true } | { ok: false, reason: string, unreadable: boolean }>}
 */
async function ciGreen(pr, sha, cfg) {
  const read = await restJobs(sha, cfg, NAMED_WORKFLOWS);
  const every = "runs" in read ? await restJobs(sha, cfg, EVERY_JOB_WORKFLOWS) : read;
  if ("refusal" in read) {
    return {
      ok: false,
      reason: `${read.refusal} (#${pr} at ${sha.slice(0, 7)})`,
      unreadable: false,
    };
  }
  if ("error" in read) {
    // An unreadable answer is never an empty one (#46). If the budget
    // is what ran out, handle() answers with the limit and its reset.
    return {
      ok: false,
      reason: `could not read CI jobs for #${pr} at ${sha.slice(0, 7)}: ${read.error}`,
      unreadable: true,
    };
  }
  if ("refusal" in every) {
    return {
      ok: false,
      reason: `${every.refusal} (#${pr} at ${sha.slice(0, 7)})`,
      unreadable: false,
    };
  }
  if ("error" in every) {
    return {
      ok: false,
      reason: `could not read CI jobs for #${pr} at ${sha.slice(0, 7)}: ${every.error}`,
      unreadable: true,
    };
  }
  const verdict = jobsSatisfied(read.runs, cfg.expectedChecks);
  if (!verdict.ok) {
    return { ok: false, reason: explainGuard("checks", verdict), unreadable: false };
  }
  const rest = everyJobSucceeded(every.runs);
  if (!rest.ok) {
    return { ok: false, reason: explainGuard("checks", rest), unreadable: false };
  }
  return { ok: true };
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
      const green = await ciGreen(pr, sha, cfg);
      if (!green.ok) {
        return { ok: false, reason: green.reason };
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

    if (guard.startsWith("workflow-author:")) {
      const refused = await refuseWorkflowMerge(
        merge.pr,
        sha,
        guard.slice("workflow-author:".length).split(","),
        cfg,
      );
      if (refused !== null) {
        return { ok: false, reason: refused };
      }
      continue;
    }

    return { ok: false, reason: `unknown guard "${guard}"; refusing rather than guessing` };
  }
  return { ok: true, pr: merge.pr, flags: merge.flags, sha };
}

/**
 * Why pull request `pr` must not be merged under a `workflow-author:` guard
 * (#1897), or null if it may: its head is fetched into the mirror at `sha`,
 * the commit every other guard validated, and its changes are judged by
 * `workflowAuthorAllowed`.
 *
 * It fails closed: a pull request it cannot read, a head it cannot fetch, or
 * a diff it cannot take, is a refusal.
 *
 * @param {number} pr
 * @param {string} sha
 * @param {string[]} authors the roles the guard names
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<string | null>}
 */
async function refuseWorkflowMerge(pr, sha, authors, cfg) {
  const unlisted = "could not list this pull request's changes; try again";
  const pull = obj(await rest(`pulls/${String(pr)}`, cfg));
  const head = obj(pull.head);
  const headRepo = obj(head.repo).full_name;
  const baseRepo = obj(obj(pull.base).repo).full_name;
  if (typeof head.ref !== "string" || typeof baseRepo !== "string") {
    return unlisted;
  }
  if (head.sha !== sha) {
    return `#${String(pr)} moved to a new head while it was being checked; try again`;
  }
  const ref = `refs/hub/merge/${String(pr)}`;
  const fetched = await git([
    "fetch",
    "-q",
    "--no-tags",
    remoteUrl(cfg),
    `+refs/pull/${String(pr)}/head:${ref}`,
  ]);
  if (fetched.code !== 0) {
    return unlisted;
  }
  const at = await git(["rev-parse", ref]);
  if (at.code !== 0 || at.stdout.trim() !== sha) {
    return unlisted;
  }
  const paths = await changedPaths(sha, cfg);
  if (paths === null) {
    return unlisted;
  }
  const verdict = workflowAuthorAllowed({
    pr,
    paths,
    headRefName: head.ref,
    crossRepository: headRepo !== baseRepo,
    authors,
    restricted: RESTRICTED_PATHS,
    roleOf: (employee) => staffed.get(employee),
  });
  return verdict.ok ? null : verdict.reason;
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
  const by = servingEmployee === null ? {} : { employee: servingEmployee };
  fs.appendFileSync(AUDIT, `${JSON.stringify({ ts: Date.now(), ...by, ...entry })}\n`);
}

/**
 * Which files would this push change, relative to main? Both sides of a
 * rename (--no-renames), so a file moved out of a directory is a change
 * to it. The push guards refuse on it (`refusePush`), as does the
 * workflow merge guard (`refuseWorkflowMerge`), and the audit log
 * is tagged with it, so that a change to the definition of a quality gate
 * is findable afterwards with one `grep`.
 *
 * Compared in the mirror, against `main` as GitHub has it: not against
 * whatever an agent's repository calls `origin/main`.
 *
 * @param {string} ref the pushed branch, as it is in the mirror, or a pull
 *   request's head commit fetched into it (#1897)
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
 * Where each Blocked card came from, by project item id (#639): the one
 * place its way back is written down. `blocked.json` keeps it across starts.
 *
 * @type {Record<string, string>}
 */
let blockedOrigins = {};
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
 * Tell the whole company through the sidecar's system outbox. It arrives as a
 * `link` line, which wakes a `tg wait`; an ordinary broadcast would not (#323).
 *
 * @param {string} name what the file is about, for whoever lists the outbox
 * @param {string} text
 * @param {{ to?: string, nudge?: string | null, direct?: boolean }} [addressed] a role
 *   instead of everyone, the scheduled nudge this is (#537), and whether it is
 *   for exactly the employee `to` names, in its inbox only (#736)
 * @returns {void}
 */
function tellCompany(name, text, { to = "all", nudge = null, direct = false } = {}) {
  const outbox = path.join(ROOT, "bus", SYSTEM, "outbox");
  fs.mkdirSync(outbox, { recursive: true });
  const file = `${String(Date.now())}-${name}.json`;
  writeAtomic(path.join(outbox, file), JSON.stringify({ to, text, nudge, direct }));
}

/**
 * Tell the sidecar about a reboot proposal (#960), through the same
 * host-only system outbox: `{ proposal }` posts it to the operator,
 * `{ proposalClosed, outcome, note }` edits its message. Its file is
 * named apart from `tellCompany`'s, so a notice and the company message
 * about the same thing, in the same millisecond, are two files, not one.
 *
 * @param {string} name what the file is about
 * @param {{ proposal: string } | { proposalClosed: string, outcome: string, note: string }} notice
 * @returns {void}
 */
function tellSidecar(name, notice) {
  const outbox = path.join(ROOT, "bus", SYSTEM, "outbox");
  fs.mkdirSync(outbox, { recursive: true });
  writeAtomic(
    path.join(outbox, `${String(Date.now())}-sidecar-${name}.json`),
    JSON.stringify(notice),
  );
}

/**
 * Take `next` as the board, and write it down for the dashboard and the
 * next start.
 *
 * @param {import("./hub-board.mjs").BoardState} next
 * @param {ReturnType<typeof company>} cfg
 * @param {string} [by] who moved the cards: the employee, or `github` for what a read found
 */
function keepBoard(next, cfg, by = "github") {
  if (next === board) {
    return;
  }
  if (board !== null) {
    keepHistory(movesBetween(board, next, { repo: cfg.repo, by, ts: Date.now() }));
  }
  board = next;
  boardSet = boardNumbers(listing(next), cfg.repo);
  writeAtomic(BOARD_SNAPSHOT, JSON.stringify(next));
  keepBlocked(blockedSwept(blockedOrigins, next.cards));
}

/**
 * Append the moves to the board history. A KPI is never worth the daemon.
 *
 * @param {import("./board-history.mjs").Move[]} moves
 */
function keepHistory(moves) {
  if (moves.length === 0) {
    return;
  }
  try {
    fs.appendFileSync(BOARD_HISTORY, historyText(moves));
  } catch (error) {
    console.error(
      `hubd: board-history.jsonl: ${error instanceof Error ? error.message : "failed"}`,
    );
  }
}

/**
 * Take `next` as the record of where Blocked cards came from, and write it
 * down if it changed.
 *
 * @param {Record<string, string>} next
 */
function keepBlocked(next) {
  if (JSON.stringify(next) === JSON.stringify(blockedOrigins)) {
    return;
  }
  blockedOrigins = next;
  writeAtomic(BLOCKED, JSON.stringify(next));
}

/**
 * `blocked.json` as the last hubd left it. A file in any other shape is
 * deleted: a Blocked card without a record comes out to the Backlog or Done.
 */
function loadBlocked() {
  if (!fs.existsSync(BLOCKED)) {
    return;
  }
  /** @type {unknown} */
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(BLOCKED, "utf8"));
  } catch {
    // Not JSON: discarded below, like any other shape.
  }
  const origins = readBlocked(raw);
  if (origins === null) {
    fs.rmSync(BLOCKED, { force: true });
    console.error("hubd: blocked.json is not a record of columns; discarded");
    return;
  }
  blockedOrigins = origins;
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
 * Why this `project item-edit` is refused, or `null` if it may run (#349).
 *
 * Roles only move cards: another field, a title or a body is refused for
 * everyone. The move is judged by `boardMoveAllowed` between the card's
 * column in hubd's copy, re-read once if the copy is stale or lacks the
 * card, and the column the request names.
 *
 * @param {string} role
 * @param {string[]} argv
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<string | null>}
 */
async function refuseCardEdit(role, argv, cfg) {
  const ids = cfg.board;
  if (ids === null) {
    return "the board's Status field is not known; run claude-llc-init";
  }
  // gh takes the last of a repeated flag and flagValue the first, so a
  // repeat would have hubd judge one move and gh run another: every flag is
  // one of these, once, and `--clear` is bare and alone.
  const names = argv.map((word) => word.split("=")[0] ?? "");
  const allowed = new Set([
    "--id",
    "--project-id",
    "--field-id",
    "--single-select-option-id",
    "--clear",
  ]);
  if (
    names.some(
      (name) =>
        name.startsWith("--") &&
        (!allowed.has(name) || names.indexOf(name) !== names.lastIndexOf(name)),
    ) ||
    argv.some((word) => word.startsWith("--clear=")) ||
    (argv.includes("--clear") && flagValue(argv, "--single-select-option-id") !== null)
  ) {
    return "hub only moves a card between columns: each flag once, and --clear alone";
  }
  const id = flagValue(argv, "--id");
  if (id === null || flagValue(argv, "--field-id") !== ids.fieldId) {
    return "hub only moves a card between columns: edit its Status, nothing else";
  }
  const optionId = flagValue(argv, "--single-select-option-id");
  const to = argv.includes("--clear")
    ? ""
    : ([...ids.options].find(([, option]) => option === optionId)?.[0] ?? null);
  if (to === null) {
    return "that is not a column of the board";
  }
  const lookup = () => board?.cards.find((card) => card.item.id === id);
  if (board === null || board.stale || lookup() === undefined) {
    await freshBoard(cfg);
    if (board === null || board.stale || lookup() === undefined) {
      await reread({ kind: "item", id }, cfg);
    }
  }
  const card = lookup();
  if (card === undefined || board?.stale === true) {
    return "could not tell which column that card is in; try again";
  }
  const status = card.item.status;
  const decision = boardMoveAllowed({
    role,
    from: typeof status === "string" ? status : "",
    to,
    blockedFrom: blockedOrigins[id] ?? null,
  });
  if (!decision.ok) {
    return decision.reason;
  }
  return to === "In Review" ? refuseInReview(card.item, cfg) : null;
}

/**
 * The column a card is in, in hubd's copy; `""` for none.
 *
 * @param {string} id project item id
 * @returns {string}
 */
function columnOf(id) {
  const status = board?.cards.find((card) => card.item.id === id)?.item.status;
  return typeof status === "string" ? status : "";
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
    keepBoard(
      applyFacts(board, plan.facts, Date.now(), cfg.repo),
      cfg,
      servingEmployee ?? "github",
    );
  } else if (plan.kind === "item" || plan.kind === "issue") {
    await reread(plan, cfg);
  } else if (plan.kind === "sweep") {
    keepBoard({ ...board, stale: true }, cfg);
  }
}

/**
 * Put a card in a column after `gh issue create` or `gh project item-add`
 * succeeded (#517), so nothing sits in "No Status". hubd's own calls, so the
 * caller's role was judged before gh ran. A failure here never fails the
 * caller's command: it comes back as one line to print.
 *
 * @param {string} role
 * @param {string[]} argv
 * @param {{ code: number, stdout: string }} result
 * @param {string} column
 * @param {ReturnType<typeof company>} cfg
 * @param {"pull" | "issue" | null} target what the caller's --url said it was
 * @returns {Promise<string>} a line for stderr, or ""
 */
async function land(role, argv, result, column, cfg, target) {
  const plan = planLanding(argv, result, cfg.repo);
  if (plan.kind === "none") {
    return "";
  }
  if (plan.kind === "unlanded") {
    return `hub: ${plan.why}; place the card with: board move <n> ${column}`;
  }
  const ids = cfg.board;
  const optionId = ids?.options.get(column);
  /** @type {import("./hub-board.mjs").Landing} */
  let landing = plan;
  let force = false;
  let label = "the card";
  if (plan.kind === "add") {
    label = `#${String(selectorNumber(plan.url, cfg.repo))}`;
    const addArgv = [
      "project",
      "item-add",
      String(cfg.project),
      "--url",
      plan.url,
      "--format",
      "json",
    ];
    const added = await gh(pinRepo(addArgv, cfg));
    audit({
      role,
      kind: "gh",
      argv: addArgv,
      decision: "allowed",
      code: added.code,
      landing: true,
    });
    if (added.code !== 0) {
      return `hub: ${label} was created but is not on the board: ${added.stderr.trim()}. Ask the manager to add it`;
    }
    const next = planLanding(addArgv, added, cfg.repo);
    if (next.kind !== "land" || next.id === null) {
      return `hub: ${label} was created but is not in ${column}: gh did not print the item. Run: board move ${label.slice(1)} ${column}`;
    }
    landing = next;
    force = true;
  } else if (plan.number !== null) {
    label = `#${String(plan.number)}`;
  }
  const isNot = force ? "was created but is not" : "is not";
  const move = `Run: board move ${label.startsWith("#") ? label.slice(1) : "<n>"} ${column}`;
  if (ids === null || optionId === undefined) {
    return `hub: ${label} ${isNot} in ${column}: the board's Status field is not known. ${move}`;
  }
  /** @type {string | null} */
  let id = landing.kind === "land" ? landing.id : null;
  if (!force) {
    const state = await freshBoard(cfg);
    const card = state?.cards.find(
      (candidate) =>
        candidate.item.id === id ||
        (landing.number !== null && itemNumber(candidate.item, cfg.repo) === landing.number),
    );
    if (card === undefined) {
      return `hub: ${label} ${isNot} in ${column}: could not find it on the board. ${move}`;
    }
    const status = card.item.status;
    if (typeof status === "string" && status !== "") {
      return "";
    }
    // GitHub resolves /pull/N to an issue; a pull request's rights are not
    // an issue's, so a card that is not what the URL said is left alone.
    const content = /** @type {{ type?: unknown } | null} */ (card.item.content);
    if (target !== null && (content?.type === "PullRequest") !== (target === "pull")) {
      return `hub: ${label} ${isNot} in ${column}: the URL named a ${target === "pull" ? "pull request" : "issue"} but the card is not one. ${move}`;
    }
    id = String(card.item.id);
  }
  const editArgv = [
    "project",
    "item-edit",
    "--id",
    String(id),
    "--project-id",
    ids.projectId,
    "--field-id",
    ids.fieldId,
    "--single-select-option-id",
    optionId,
  ];
  const edited = await gh(pinRepo(editArgv, cfg));
  audit({
    role,
    kind: "gh",
    argv: editArgv,
    decision: "allowed",
    code: edited.code,
    landing: true,
  });
  if (edited.code !== 0) {
    return `hub: ${label} ${isNot} in ${column}: ${edited.stderr.trim()}. ${move}`;
  }
  await afterProjectCommand(editArgv, edited, cfg);
  return "";
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
 * `company load` (#747): the manager's, policy says. Answered from what
 * hubd and the host already hold: the board's copy as it is, without a
 * sweep, and the files the dashboard reads. No GitHub call.
 *
 * @param {ReturnType<typeof company>} cfg
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function serveLoad(cfg) {
  const now = Date.now();
  const staff = readStaffFile(ROOT);
  const { live, stale } = readPresence(ROOT, staff, now);
  /** @type {import("./peek.mjs").PeekRow[]} */
  let peek = [];
  try {
    peek = peekRows(PEEK);
  } catch {
    // No employee has run a turn yet: each says so.
  }
  const lines = loadLines({
    now,
    roles: ROLES,
    board,
    staff,
    maxAgents: cfg.maxAgents,
    live,
    stale,
    peek,
    usage: readUsage(usage, now, null)?.summary ?? null,
    kpis: lastSnapshot,
  });
  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

/**
 * `company runners` (#1890): the supervisor's status, as the dashboard
 * shows it; `company runners <n>` sets the target it reads, within the
 * operator's max.
 *
 * @param {string[]} argv `[]` or `[n]`, checked by the policy
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function serveRunners(argv) {
  const [word] = argv;
  if (word !== undefined) {
    const n = Number(word);
    if (n > MAX_RUNNERS) {
      return {
        code: 1,
        stdout: "",
        stderr: `company runners: ${String(n)} is above the operator's max of ${String(MAX_RUNNERS)} (VIBEWARS_MAX_RUNNERS)\n`,
      };
    }
    writeRunnersTarget(RUNNERS_STATE, n);
    return {
      code: 0,
      stdout: `runners: target ${String(n)}; the supervisor follows within seconds\n`,
      stderr: "",
    };
  }
  const lines = runnersLines(readRunnersStatus(RUNNERS_STATE), MAX_RUNNERS);
  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

/**
 * The supervisor holds no Telegram: what the manager must hear about the
 * runners, their missing credential, hubd passes on, once. The alert told
 * is kept on disk, so a hubd restart does not repeat a standing one.
 *
 * @returns {void}
 */
function relayRunnersAlert() {
  const alert = readRunnersStatus(RUNNERS_STATE)?.alert ?? null;
  const told = readRunnersAlertTold(RUNNERS_STATE);
  if (alert === told) {
    return;
  }
  if (alert !== null) {
    tellCompany("runners-alert", `Company runners are down: ${alert}. Tell the operator.`, {
      to: "manager",
    });
  }
  writeRunnersAlertTold(RUNNERS_STATE, alert);
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

/**
 * `board rank` (#351): the manager's, policy says. The issues are found in
 * the copy, each re-read once if the copy lacks it, as a move's card is
 * (#349); then one mutation, and the copy reordered to match, for nothing.
 *
 * @param {string} role
 * @param {string[]} argv `[issue, "top" | "bottom"]` or `[issue, "after", other]`
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<Record<string, unknown>>}
 */
async function rank(role, argv, cfg) {
  const kind = "rank";
  const request = parseRankRequest(argv);
  if ("error" in request) {
    audit({ role, kind, argv, decision: "refused", reason: request.error });
    return { allow: false, reason: request.error, code: 77 };
  }
  await freshBoard(cfg);
  for (const number of request.place === "after"
    ? [request.number, request.after]
    : [request.number]) {
    if (board !== null && !board.cards.some((card) => itemNumber(card.item, cfg.repo) === number)) {
      await reread({ kind: "issue", number }, cfg);
    }
  }
  if (board === null || board.stale) {
    return Date.now() < limitedUntil
      ? limitedResponse()
      : {
          allow: true,
          code: 1,
          stdout: "",
          stderr: "board: could not read the board from GitHub\n",
        };
  }
  const target = rankTarget(board, request, cfg.repo);
  if ("error" in target) {
    audit({ role, kind, argv, decision: "refused", reason: target.error });
    return { allow: false, reason: target.error, code: 77 };
  }
  const result = await gh([
    "api",
    "graphql",
    "-f",
    `query=${RANK_MUTATION}`,
    "-f",
    `project=${cfg.projectId}`,
    "-f",
    `item=${target.id}`,
    ...(target.afterId === null ? [] : ["-f", `after=${target.afterId}`]),
  ]);
  audit({ role, kind, argv, decision: "allowed", code: result.code });
  if (result.code !== 0) {
    return { allow: true, code: result.code, stdout: "", stderr: result.stderr };
  }
  keepBoard(rankCards(board, target.id, target.afterId, Date.now()), cfg);
  return { allow: true, code: 0, stdout: `${rankLine(board, target.id, cfg.repo)}\n`, stderr: "" };
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
 * Comment fields are scrubbed as in `serveView`, and an unknown field is
 * refused.
 *
 * @param {string[]} argv
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ code: number, stdout: string, stderr: string } | { reason: string }>}
 */
async function filteredList(argv, cfg) {
  const prepared = prepareList(argv);
  if ("error" in prepared) {
    return { code: 1, stdout: "", stderr: `hub: ${prepared.error}\n` };
  }
  const group = argv[0] === "pr" ? "pr" : "issue";
  const unknown = unknownField(prepared.fields ?? [], VIEW_FIELDS[group]);
  if (unknown !== null) {
    return {
      reason: `--json ${unknown} is not available through hub, ${FIELD_CHECKED}`,
    };
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
    /** @type {unknown} */
    let raw;
    try {
      raw = JSON.parse(result.stdout);
    } catch {
      return { reason: UNCHECKED };
    }
    const scrubbed = scrubJson(raw);
    if (!Array.isArray(scrubbed)) {
      return { reason: UNCHECKED };
    }
    rows = scrubbed;
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
    stdout: renderList(group, visible, prepared.fields),
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
 * @param {{ employee: string, role: string, kind: string, argv: string[] }} request
 *   `role` is the employee's, from `staff.json`
 * @returns {Promise<Record<string, unknown>>}
 */
async function handle(request) {
  servingEmployee = request.employee;
  try {
    return await handleAs(request);
  } finally {
    servingEmployee = null;
  }
}

/**
 * @param {{ employee: string, role: string, kind: string, argv: string[] }} request
 * @returns {Promise<Record<string, unknown>>}
 */
async function handleAs(request) {
  const { employee, role, kind, argv } = request;
  const acting = actingFor(role);
  const verdict = authorize(role, { kind, argv }, { acting, employee });

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
 * The proposal waiting for the operator, if any (#960).
 *
 * @returns {import("./reboot.mjs").RebootProposal | null}
 */
function readProposal() {
  try {
    return parseProposal(JSON.parse(fs.readFileSync(PROPOSAL, "utf8")));
  } catch {
    return null;
  }
}

/** At most this many files are kept in a proposal's diffstat. */
const PROPOSAL_TOP_FILES = 8;

/**
 * What `main` on GitHub changed since `sha`, read in the mirror: the
 * commit it is at, which is what a proposal names (#960), the files, the
 * subjects of the commits that touched company code, how many commits
 * there are in all, and the company code's diffstat.
 *
 * @param {string} sha
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{
 *   targetSha: string, paths: string[], subjects: string[], allCommits: number,
 *   stat: import("./reboot.mjs").RebootProposal["stat"],
 * } | null>} `null` when that could not be worked out
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
  const target = await git(["rev-parse", "refs/heads/main"]);
  const targetSha = target.stdout.trim();
  if (target.code !== 0 || !/^[0-9a-f]{40}$/.test(targetSha)) {
    return null;
  }
  const range = `${sha}..${targetSha}`;
  const paths = await git(["log", "--format=", "--name-only", range]);
  const subjects = await git(["log", "--format=%s", range, "--", ...COMPANY_PATHSPECS]);
  const all = await git(["rev-list", "--count", range]);
  const numstat = await git(["diff", "--numstat", range, "--", ...COMPANY_PATHSPECS]);
  if (paths.code !== 0 || subjects.code !== 0 || all.code !== 0 || numstat.code !== 0) {
    return null;
  }
  /** @param {string} text */
  const lines = (text) => text.split("\n").filter((line) => line !== "");
  // A binary file counts `-` lines: none either way.
  const files = lines(numstat.stdout).map((line) => {
    const [insertions = "", deletions = "", ...rest] = line.split("\t");
    return {
      path: rest.join("\t"),
      insertions: Number(insertions) || 0,
      deletions: Number(deletions) || 0,
    };
  });
  return {
    targetSha,
    paths: lines(paths.stdout),
    subjects: lines(subjects.stdout),
    allCommits: Number(all.stdout.trim()),
    stat: {
      files: files.length,
      insertions: files.reduce((sum, file) => sum + file.insertions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
      top: [...files]
        .sort((a, b) => b.insertions + b.deletions - (a.insertions + a.deletions))
        .slice(0, PROPOSAL_TOP_FILES),
    },
  };
}

/**
 * An employee being fired ran `company ready`: record it in `staff.json`, so
 * the supervisor stops it (#383).
 *
 * @param {string} employee
 * @returns {boolean} whether `employee` is being fired
 */
function readyToStop(employee) {
  try {
    return withStaffLock(STAFF, () => {
      const marked = markReady(parseStaff(fs.readFileSync(STAFF, "utf8")), employee, Date.now());
      if (marked === null) {
        return false;
      }
      writeAtomic(STAFF, `${JSON.stringify(marked, null, 2)}\n`);
      return true;
    });
  } catch {
    return false;
  }
}

/**
 * A company reboot (#21): propose it, withdraw or abort it, or mark an
 * employee ready for it. The manager's request only proposes it to the
 * operator (#960): hubd writes `.bots/reboot-proposal.json` and tells the
 * sidecar, and nothing drains until the operator approves it in Telegram
 * (`decideProposals`). Only then is it recorded in `.bots/reboot.json`,
 * which the supervisor, watching the agents' restart loops, drains the
 * company for before it starts the restarter. A schedule or an abort is
 * announced to everyone through the system outbox, so it wakes every
 * `tg wait` (#323).
 *
 * @param {string} employee who asks; `ready` is kept per employee (#62)
 * @param {string} role the employee's
 * @param {string[]} argv `["request", reason]`, `["workday"]`, `["abort"]` or `["ready"]`
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<Record<string, unknown>>}
 */
async function reboot(employee, role, argv, cfg) {
  const kind = "reboot";
  const pending = readReboot();
  const proposal = readProposal();
  if (argv[0] === "ready" && readyToStop(employee) && pending === null) {
    audit({ role, kind, argv, decision: "allowed" });
    return { allow: true, code: 0, stdout: "Noted. You are being stopped now.\n", stderr: "" };
  }
  if (argv[0] === "abort" && proposal !== null) {
    audit({ role, kind, argv, decision: "allowed" });
    fs.rmSync(PROPOSAL, { force: true });
    tellSidecar("proposal-withdrawn", {
      proposalClosed: proposal.id,
      outcome: "withdrawn",
      note: "",
    });
    return {
      allow: true,
      code: 0,
      stdout: `Withdrew ${proposalName(proposal.id)}; the operator's message says so.\n`,
      stderr: "",
    };
  }
  if (argv[0] === "ready" || argv[0] === "abort") {
    if (pending === null) {
      return { allow: true, code: 1, stdout: "", stderr: "company: no reboot is scheduled\n" };
    }
    audit({ role, kind, argv, decision: "allowed" });
    if (argv[0] === "abort") {
      fs.rmSync(REBOOT, { force: true });
      const aborted = `The company reboot is aborted (${role}). Carry on.`;
      tellCompany("reboot-aborted", aborted);
      return { allow: true, code: 0, stdout: `${aborted}\n`, stderr: "" };
    }
    if (!pending.ready.includes(employee)) {
      writeAtomic(REBOOT, JSON.stringify({ ...pending, ready: [...pending.ready, employee] }));
    }
    return {
      allow: true,
      code: 0,
      stdout: `Noted. The company stops by ${clock(pending.deadline)} at the latest.\n`,
      stderr: "",
    };
  }

  if (proposal !== null) {
    const reason =
      `${proposalName(proposal.id)} awaits the operator since ${clock(proposal.proposedAt)}; ` +
      "company reboot --abort withdraws it.";
    audit({ role, kind, argv, decision: "refused", reason });
    return { allow: false, reason, code: 77 };
  }
  const boot = readBoot();
  const now = Date.now();
  const workday = argv[0] === "workday";
  const changed = boot === null ? null : await changedSince(boot.sha, cfg);
  const allowed = rebootAllowed({
    bootSha: boot?.sha ?? null,
    changedPaths: changed?.paths ?? null,
    lastRebootAt: boot?.at ?? null,
    now,
    pending,
    workday: workday ? { sentAt: nudgesSent.get(WORKDAY) ?? null } : null,
  });
  // Even a workday reboot needs main read: the proposal names the commit
  // that boots.
  if (!allowed.ok || boot === null || changed === null) {
    let reason = "the company's boot was not recorded";
    if (!allowed.ok) {
      reason = allowed.reason;
    } else if (changed === null) {
      reason = "could not read GitHub's main, which the proposal must name";
    }
    audit({ role, kind, argv, decision: "refused", reason });
    return { allow: false, reason, code: 77 };
  }

  /** @type {import("./reboot.mjs").RebootProposal} */
  const proposed = {
    id: randomBytes(16).toString("hex"),
    proposedAt: now,
    by: employee,
    kind: workday ? "workday" : "request",
    reason: workday ? WORKDAY : (argv[1] ?? ""),
    bootSha: boot.sha,
    targetSha: changed.targetSha,
    commits: changed.subjects.map((subject) => ({ subject })),
    allCommits: changed.allCommits,
    stat: changed.stat,
  };
  writeAtomic(PROPOSAL, JSON.stringify(proposed));
  tellSidecar("proposal", { proposal: proposed.id });
  audit({ role, kind, argv, decision: "allowed" });
  return {
    allow: true,
    code: 0,
    stdout:
      `Proposed to the operator as ${proposalName(proposed.id)}, onto ` +
      `${proposed.targetSha.slice(0, 8)}. Nothing happens until they approve. It stays ` +
      "open until they decide or `company reboot --abort` withdraws it.\n",
    stderr: "",
  };
}

/**
 * The operator's decision on the open proposal (#960), if the sidecar has
 * written one: schedule the reboot, or drop the proposal and tell the
 * manager. Read only from the host-only decision file the sidecar writes
 * after checking the tap, never from an inbox, which a jail can write. The
 * file is consumed once, so a second tap schedules nothing twice.
 *
 * @returns {void}
 */
function decideProposals() {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(DECISION, "utf8"));
  } catch {
    return;
  }
  fs.rmSync(DECISION, { force: true });
  const decision = parseDecision(raw);
  const proposal = readProposal();
  if (decision === null || proposal === null) {
    return;
  }
  const pending = readReboot();
  const decided = decideProposal({
    proposal,
    decision,
    bootSha: readBoot()?.sha ?? null,
    pending,
  });
  if (decided.action === "ignore") {
    return;
  }
  fs.rmSync(PROPOSAL, { force: true });
  const name = proposalName(proposal.id);
  if (decided.action === "drop") {
    tellSidecar("proposal-closed", {
      proposalClosed: proposal.id,
      outcome: decided.outcome,
      note: decided.note,
    });
    tellCompany(
      "proposal-closed",
      decided.outcome === "rejected"
        ? `The operator rejected reboot ${name}.`
        : `Reboot ${name} no longer applies: ${decided.note}. Propose again if it is still wanted.`,
      { to: proposal.by, direct: true },
    );
    return;
  }
  const now = Date.now();
  /** @type {import("./reboot.mjs").Reboot} */
  const scheduled = {
    requestedAt: now,
    reason: proposal.reason,
    by: proposal.by,
    deadline: now + DRAIN_MS,
    bootSha: proposal.bootSha,
    targetSha: proposal.targetSha,
    proposalId: proposal.id,
    ready: [],
  };
  writeAtomic(REBOOT, JSON.stringify(scheduled));
  audit({ role: "operator", kind: "reboot", argv: ["approve", name], decision: "allowed" });
  tellSidecar("proposal-approved", { proposalClosed: proposal.id, outcome: "approved", note: "" });
  tellCompany(
    "reboot",
    announcement(
      scheduled,
      proposal.commits.map(({ subject }) => subject),
    ),
  );
}

/**
 * What a fired employee is told (#383).
 *
 * @param {string} reason
 * @returns {string}
 */
function stopNotice(reason) {
  return (
    `You're being stopped (${reason}). WIP-commit and push your branch, move your In ` +
    "Progress card back to Ready with a comment naming the branch and its state, then " +
    "run `company ready`."
  );
}

/**
 * `company hire` and `company fire` (#380). hubd checks the request and
 * records it in `.bots/staff.json`; nothing starts or stops until the
 * supervisor reconciles that file (#383). An accepted change is told to
 * everyone through the system outbox, as a reboot is.
 *
 * @param {string} role the manager's, or `operator` for the host's spool (#385)
 * @param {string[]} argv `["hire", role, reason]` or `["fire", employee, reason]`;
 *   the operator's may end in `--over-cap`
 * @param {ReturnType<typeof company>} cfg
 * @returns {Record<string, unknown>}
 */
function staff(role, argv, cfg) {
  try {
    // Read to write under one lock: the supervisor also writes staff.json.
    return withStaffLock(STAFF, () => recordStaff(role, argv, cfg));
  } catch (error) {
    const reason = `staff.json: ${error instanceof Error ? error.message : String(error)}`;
    audit({ role, kind: "staff", argv, decision: "refused", reason });
    return { allow: false, reason, code: 77 };
  }
}

/**
 * @param {string} role
 * @param {string[]} argv
 * @param {ReturnType<typeof company>} cfg
 * @returns {Record<string, unknown>}
 */
function recordStaff(role, argv, cfg) {
  const kind = "staff";
  /** @param {string} reason */
  const refuse = (reason) => {
    audit({ role, kind, argv, decision: "refused", reason });
    return { allow: false, reason, code: 77 };
  };
  if (cfg.maxAgents === null) {
    return refuse("company.json has no maxAgents; add it");
  }
  /** @type {import("./staff.mjs").Staff} */
  let current;
  try {
    current = parseStaff(fs.readFileSync(STAFF, "utf8"));
  } catch (error) {
    return refuse(`staff.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  const by = role === OPERATOR_ROLE ? "operator" : "manager";
  // Only the operator may pass the cap, and only on a hire.
  const overCap = by === "operator" && argv.at(-1) === "--over-cap";
  const [verb, who, reason] = overCap ? argv.slice(0, -1) : argv;
  if ((verb !== "hire" && verb !== "fire") || who === undefined || reason === undefined) {
    return refuse('usage: company hire <role> "<reason>" | company fire <employee> "<reason>"');
  }
  /** @type {import("./staff.mjs").StaffRequest} */
  const request =
    verb === "hire"
      ? { verb, role: who, reason, by, ...(overCap ? { overCap } : {}) }
      : { verb, employee: who, reason, by };
  const now = Date.now();
  const allowed = staffAllowed(current, request, {
    roster: ROLES,
    maxAgents: cfg.maxAgents,
    rebootPending: readReboot() !== null,
    now,
    history: current.recent,
  });
  if (!allowed.ok) {
    return refuse(allowed.reason);
  }
  writeAtomic(
    STAFF,
    `${JSON.stringify(applyStaff(current, request, allowed.employee, now), null, 2)}\n`,
  );
  audit({ role, kind, argv, decision: "allowed" });
  tellCompany(
    kind,
    by === "operator"
      ? `operator ${verb === "hire" ? "hired" : "fired"} ${allowed.employee}: ${reason}`
      : `${verb === "hire" ? "Hired" : "Firing"} ${allowed.employee}: ${reason}`,
  );
  if (verb === "fire") {
    // Seat 1's id is its role's name: direct, or every seat of it stops (#756).
    tellCompany("staff-stop", stopNotice(reason), { to: allowed.employee, direct: true });
  }
  return {
    allow: true,
    code: 0,
    stdout: `recorded ${allowed.employee} (takes effect when the supervisor reconciles, #383)\n`,
    stderr: "",
  };
}

/**
 * `hub schedule add|ls|rm` (#678): the role's own recurring reminders. The
 * change is live: memory and file are updated in one step, the clock is set
 * or dropped at once, and `sendNudges` reads memory. Requests are served one
 * at a time, so read, plan and write cannot interleave.
 *
 * @param {string} role
 * @param {string[]} argv
 * @returns {Record<string, unknown>}
 */
function schedule(role, argv) {
  const kind = "schedule";
  const plan = planScheduleCommand({
    role,
    argv,
    own: ownSchedules,
    fixed: readSchedule(),
    now: Date.now(),
  });
  if ("refuse" in plan) {
    audit({ role, kind, argv, decision: "refused", reason: plan.refuse });
    return { allow: false, reason: plan.refuse, code: 77 };
  }
  if (plan.started !== undefined || plan.removed !== undefined) {
    ownSchedules = plan.next;
    writeAtomic(SCHEDULES, JSON.stringify({ schedules: ownSchedules }));
    if (plan.started !== undefined) {
      nudgesSent.set(plan.started, Date.now());
    }
    if (plan.removed !== undefined) {
      nudgesSent.delete(plan.removed);
    }
    writeNudges();
  }
  audit({ role, kind, argv, decision: "allowed" });
  return { allow: true, code: 0, stdout: plan.stdout, stderr: "" };
}

/* -------------------------------------------------------------------------- */
/* Watches (#736)                                                             */
/* -------------------------------------------------------------------------- */

/** @type {import("./hub-watch.mjs").Watch[]} */
let watches = [];
/** When the watches are next polled, epoch ms: at once after a start or a new watch. */
let nextWatchPoll = 0;
/** Whether a poll is running: one at a time, beside the requests it must not hold up. */
let watchPolling = false;
/** The pause between polls, doubled while GitHub cannot be read. */
const WATCH_POLL_MS = Number(process.env.HUBD_WATCH_POLL_MS ?? 60_000);
let watchPause = WATCH_POLL_MS;
const WATCH_PAUSE_MAX_MS = 10 * 60_000;

/** Read the watches a previous hubd left. One in another shape is discarded, and its owners told. */
function loadWatches() {
  if (!fs.existsSync(WATCHES)) {
    return;
  }
  const parsed = parseWatches(fs.readFileSync(WATCHES, "utf8"));
  if ("watches" in parsed) {
    watches = parsed.watches;
    return;
  }
  fs.rmSync(WATCHES, { force: true });
  for (const owner of parsed.owners) {
    tellCompany(
      "watches-discarded",
      "hub watch: hubd could not read its watches file and discarded it; register your watches again.",
      { to: owner, direct: true },
    );
  }
}

/** @param {import("./hub-watch.mjs").Watch[]} next */
function keepWatches(next) {
  watches = next;
  writeAtomic(WATCHES, JSON.stringify(watches));
}

/**
 * End a watch with its one message, unless it was removed meanwhile.
 *
 * @param {import("./hub-watch.mjs").Watch} watch
 * @param {string} text
 */
function finishWatch(watch, text) {
  if (!watches.some((kept) => kept.id === watch.id)) {
    return;
  }
  keepWatches(watches.filter((kept) => kept.id !== watch.id));
  tellCompany(`watch-${watch.id}`, text, { to: watch.employee, direct: true });
}

/**
 * `hub watch` for `employee`: register, list or remove its own watches.
 *
 * @param {string} employee
 * @param {string} role
 * @param {string[]} argv
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<Record<string, unknown>>}
 */
async function watch(employee, role, argv, cfg) {
  const kind = "watch";
  const plan = parseWatchRequest(argv);
  if ("error" in plan) {
    audit({ role, kind, argv, decision: "refused", reason: plan.error });
    return { allow: false, reason: plan.error, code: 77 };
  }
  const own = watches.filter((kept) => kept.employee === employee);
  if (plan.verb === "ls") {
    audit({ role, kind, argv, decision: "allowed" });
    return { allow: true, code: 0, stdout: listWatches(own, Date.now()), stderr: "" };
  }
  if (plan.verb === "rm") {
    if (!own.some((kept) => kept.id === plan.id)) {
      const reason = `you have no watch ${plan.id}; hub watch ls lists yours`;
      audit({ role, kind, argv, decision: "refused", reason });
      return { allow: false, reason, code: 77 };
    }
    keepWatches(watches.filter((kept) => kept.id !== plan.id));
    audit({ role, kind, argv, decision: "allowed" });
    return { allow: true, code: 0, stdout: `removed ${plan.id}\n`, stderr: "" };
  }
  const pr = String(plan.pr);
  const visibility = await checkVisibility("review", ["approve", pr], cfg);
  if (!visibility.ok) {
    audit({ role, kind, argv, decision: "hidden", reason: visibility.reason });
    return { allow: false, reason: visibility.reason, code: 77 };
  }
  const sha = await headSha(pr);
  if (sha === null) {
    return { allow: false, reason: `could not read pull request #${pr}`, code: 77 };
  }
  /** @type {import("./hub-watch.mjs").Watch} */
  const added = {
    id: `w${randomBytes(3).toString("hex")}`,
    employee,
    kind: "ci",
    pr: plan.pr,
    sha,
    note: plan.note,
    created: Date.now(),
  };
  // A second watch of the same pull request replaces the first: one answer, not two.
  keepWatches([
    ...watches.filter((kept) => kept.employee !== employee || kept.pr !== plan.pr),
    added,
  ]);
  nextWatchPoll = 0;
  audit({ role, kind, argv, decision: "allowed", sha });
  return {
    allow: true,
    code: 0,
    stdout: `watching #${pr} @ ${sha.slice(0, 7)} (${added.id}); the result arrives in your inbox\n`,
    stderr: "",
  };
}

/**
 * A pull request's state and head, or `null` if it cannot be read.
 *
 * @param {number} pr
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ open: boolean, merged: boolean, sha: string } | null>}
 */
async function pullState(pr, cfg) {
  const pull = obj(await rest(`pulls/${String(pr)}`, cfg));
  const sha = obj(pull.head).sha;
  if (typeof pull.state !== "string" || typeof sha !== "string") {
    return null;
  }
  return {
    open: pull.state === "open",
    merged: pull.merged === true || typeof pull.merged_at === "string",
    sha,
  };
}

/**
 * Where CI on `sha` stands: still going, or done with the merge gate's
 * verdict and, when red, the jobs that failed and what an e2e job's log says.
 *
 * @param {number} pr
 * @param {string} sha
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<{ kind: "pending" } | { kind: "unreadable" } | { kind: "done", verdict: { pass: true } | { pass: false, reason: string, failed: import("./hub-watch.mjs").FailedJob[] } }>}
 */
async function ciOutcome(pr, sha, cfg) {
  /** @type {Record<string, unknown>[]} */
  const finished = [];
  for (const file of GATE_WORKFLOWS) {
    const listed = runsFromRest(
      await rest(
        `actions/workflows/${file}/runs?head_sha=${sha}&event=pull_request&per_page=100`,
        cfg,
      ),
    );
    if ("error" in listed) {
      return { kind: "unreadable" };
    }
    const mine = commitRuns(listed.runs, { sha, repo: cfg.repo, file });
    if (mine.length === 0 || mine.some((run) => run.status !== "completed")) {
      return { kind: "pending" };
    }
    finished.push(...mine);
  }
  const green = await ciGreen(String(pr), sha, cfg);
  if (green.ok) {
    return { kind: "done", verdict: { pass: true } };
  }
  if (green.unreadable) {
    return { kind: "unreadable" };
  }
  /** @type {import("./hub-watch.mjs").FailedJob[]} */
  const failed = [];
  for (const run of finished) {
    const read = jobsFromRest(
      await rest(`actions/runs/${String(run.id)}/jobs?filter=latest&per_page=100`, cfg),
    );
    const jobs = "jobs" in read ? read.jobs : [];
    const bad = jobs.filter(
      (job) =>
        job.status === "completed" && job.conclusion !== "success" && job.conclusion !== "skipped",
    );
    if (bad.length === 0 && run.conclusion !== "success") {
      failed.push({
        name: `${String(run.name ?? run.path)} (run ${String(run.id)})`,
        conclusion: String(run.conclusion),
        log: null,
      });
    }
    for (const job of bad) {
      let log = null;
      if (job.name.startsWith("e2e") && job.id !== null) {
        const answered = await ghRaw([
          "api",
          `repos/${cfg.repo}/actions/jobs/${String(job.id)}/logs`,
        ]);
        log = answered.code === 0 ? failedSpecs(answered.stdout) : null;
      }
      failed.push({ name: job.name, conclusion: job.conclusion, log });
    }
  }
  return { kind: "done", verdict: { pass: false, reason: green.reason, failed } };
}

/**
 * One pass over every watch. A head polled for two watches is read once.
 *
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<boolean>} whether everything could be read
 */
async function pollWatches(cfg) {
  let readable = true;
  /** @type {Map<number, Awaited<ReturnType<typeof pullState>>>} */
  const pulls = new Map();
  /** @type {Map<string, Awaited<ReturnType<typeof ciOutcome>>>} */
  const outcomes = new Map();
  for (const watched of [...watches]) {
    if (!pulls.has(watched.pr)) {
      pulls.set(watched.pr, await pullState(watched.pr, cfg));
    }
    const pull = pulls.get(watched.pr) ?? null;
    if (pull !== null && !pull.open) {
      finishWatch(watched, endedMessage(watched, pull.merged ? "merged" : "closed"));
      continue;
    }
    if (pull !== null && pull.sha !== watched.sha) {
      // A push cancels the run in progress, as CI's cancel-in-progress does:
      // the new head is the one worth an answer.
      if (watches.some((kept) => kept.id === watched.id)) {
        keepWatches(
          watches.map((kept) =>
            kept.id === watched.id ? { ...kept, sha: pull.sha, created: Date.now() } : kept,
          ),
        );
        tellCompany(`watch-${watched.id}`, supersededMessage(watched, pull.sha), {
          to: watched.employee,
          direct: true,
        });
      }
      continue;
    }
    const outcome =
      pull === null
        ? { kind: /** @type {const} */ ("unreadable") }
        : (outcomes.get(watched.sha) ?? (await ciOutcome(watched.pr, watched.sha, cfg)));
    outcomes.set(watched.sha, outcome);
    if (outcome.kind === "done") {
      finishWatch(watched, ciMessage(watched, outcome.verdict));
      continue;
    }
    if (outcome.kind === "unreadable") {
      readable = false;
    }
    if (Date.now() - watched.created > WATCH_CAP_MS) {
      finishWatch(watched, endedMessage(watched, "cap"));
    }
  }
  return readable;
}

/** Start a poll if one is due and none is running. It never holds up a request. */
function maybePollWatches() {
  if (watchPolling || watches.length === 0 || Date.now() < nextWatchPoll) {
    return;
  }
  watchPolling = true;
  pollWatches(company())
    .then((readable) => {
      // GitHub unreadable: back off, but never drop a watch.
      watchPause = readable ? WATCH_POLL_MS : Math.min(watchPause * 2, WATCH_PAUSE_MAX_MS);
    })
    .catch((/** @type {unknown} */ error) => {
      console.error(`hubd: watch: ${error instanceof Error ? error.message : "failed"}`);
    })
    .finally(() => {
      watchPolling = false;
      nextWatchPoll = Date.now() + watchPause;
    });
}

/**
 * Every open pull request, page by page, so a flood of outsiders' cannot
 * push the company's off the first page.
 *
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<unknown[] | undefined>} `undefined` if any page cannot be read
 */
async function openPulls(cfg) {
  /** @type {unknown[]} */
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const answer = await rest(`pulls?state=open&per_page=100&page=${String(page)}`, cfg);
    if (!Array.isArray(answer)) {
      return undefined;
    }
    /** @type {unknown[]} */
    const got = answer;
    rows.push(...got);
    if (got.length < 100) {
      return rows;
    }
  }
  return undefined;
}

/**
 * Why a card may not go to In Review (#736), or `null`: every open pull
 * request that closes it must be green, by the merge gate's own verdict.
 *
 * @param {import("./hub-board.mjs").Item} item
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<string | null>}
 */
async function refuseInReview(item, cfg) {
  const number = itemNumber(item, cfg.repo);
  if (number === null) {
    return "could not tell which issue that card is";
  }
  /** @type {{ number: number, sha: string }[] | null} */
  let pulls;
  if (obj(item.content).type === "PullRequest") {
    const sha = await headSha(String(number));
    pulls = sha === null ? null : [{ number, sha }];
  } else {
    // Only pull requests the company may see: an outsider's "Closes #N"
    // must not be able to hold any card out of In Review.
    const seen = await viewer(cfg);
    const closing = closingPulls(await openPulls(cfg), number);
    pulls =
      seen === null || closing === null ? null : closing.filter((pull) => isVisible(pull, seen));
  }
  if (pulls === null) {
    return `could not read the pull requests for #${String(number)}; try again`;
  }
  if (pulls.length === 0) {
    return `no open PR closes #${String(number)}: open one whose body says "Closes #${String(number)}"`;
  }
  for (const pull of pulls) {
    const green = await ciGreen(String(pull.number), pull.sha, cfg);
    if (!green.ok) {
      return `In Review needs green CI on PR #${String(pull.number)}: ${green.reason}. Run \`hub watch ci ${String(pull.number)}\` and move the card when it passes`;
    }
  }
  return null;
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
 * @param {{ employee: string, role: string, kind: string, argv: string[] }} request
 * @param {ReturnType<typeof authorize>} verdict
 * @param {string[]} acting
 * @returns {Promise<Record<string, unknown>>}
 */
async function serve(request, verdict, acting) {
  const { employee, role, kind, argv } = request;
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
    return reboot(employee, role, argv, cfg);
  }

  if (kind === "staff") {
    return staff(role, argv, cfg);
  }

  if (kind === "schedule") {
    return schedule(role, argv);
  }

  if (kind === "rank") {
    return rank(role, argv, cfg);
  }

  if (kind === "load") {
    const answered = serveLoad(cfg);
    audit({ role, kind, argv, decision: "allowed", code: answered.code });
    return { allow: true, ...answered };
  }

  if (kind === "runners") {
    const answered = serveRunners(argv);
    audit({ role, kind, argv, decision: "allowed", code: answered.code });
    return { allow: true, ...answered };
  }

  if (kind === "watch") {
    return watch(employee, role, argv, cfg);
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
        by: employee,
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
    if ("reason" in listed) {
      audit({ role, kind, argv, decision: "refused", reason: listed.reason });
      return { allow: false, reason: listed.reason, code: 77 };
    }
    audit({ role, kind, argv, decision: "allowed", code: listed.code, filtered: true });
    return { allow: true, ...listed };
  }

  if ((argv[0] === "issue" || argv[0] === "pr") && argv[1] === "view") {
    const viewed = await serveView(argv, cfg);
    if ("reason" in viewed) {
      audit({ role, kind, argv, decision: "refused", reason: viewed.reason });
      return { allow: false, reason: viewed.reason, code: 77 };
    }
    const { rest: fromRest, ...answered } = viewed;
    audit({
      role,
      kind,
      argv,
      decision: "allowed",
      code: answered.code,
      ...(fromRest ? { rest: true } : {}),
    });
    return { allow: true, ...answered };
  }

  if (isBoardRead(argv, cfg.project)) {
    const state = await freshBoard(cfg);
    if (state !== null) {
      audit({ role, kind, argv, decision: "allowed", code: 0, cached: true });
      return { allow: true, code: 0, stdout: `${JSON.stringify(listing(state))}\n`, stderr: "" };
    }
  }

  if (kind === "gh" && argv[0] === "project" && argv[1] === "item-edit") {
    const refused = await refuseCardEdit(role, argv, cfg);
    if (refused !== null) {
      audit({ role, kind, argv, decision: "refused-by-guard", reason: refused });
      return { allow: false, reason: refused, code: 77 };
    }
  }

  // `--column` is hub's, not gh's: judged here, and gone before gh runs.
  let ghArgv = argv;
  let column = LANDING_COLUMN;
  /** @type {ReturnType<typeof itemAddTarget>} */
  let target = null;
  if (kind === "gh" && argv[0] === "project" && argv[1] === "item-add") {
    const parsed = parseColumnFlag(argv, cfg.board?.options.keys() ?? []);
    const named = "error" in parsed ? null : parsed.column;
    target = itemAddTarget(argv);
    const decision =
      "error" in parsed
        ? { ok: false, reason: parsed.error }
        : target === null
          ? { ok: false, reason: "item-add takes exactly one --url, of one issue or pull request" }
          : named !== null && cfg.board === null
            ? { ok: false, reason: "the board's Status field is not known; run claude-llc-init" }
            : landingAllowed({ role, to: named ?? LANDING_COLUMN, pull: target === "pull" });
    if (!decision.ok) {
      audit({ role, kind, argv, decision: "refused-by-guard", reason: decision.reason });
      return { allow: false, reason: decision.reason, code: 77 };
    }
    if (!("error" in parsed)) {
      ghArgv = parsed.argv;
      column = parsed.column ?? LANDING_COLUMN;
    }
  }

  const movedId =
    kind === "gh" && argv[0] === "project" && argv[1] === "item-edit"
      ? flagValue(argv, "--id")
      : null;
  const before = movedId === null ? "" : columnOf(movedId);
  let result = await gh(pinRepo(ghArgv, cfg));
  // An item just added, moved or archived must show up on the next read,
  // not when the copy happens to be swept.
  if (argv[0] === "project") {
    await afterProjectCommand(ghArgv, result, cfg);
    if (movedId !== null && result.code === 0) {
      keepBlocked(
        blockedAfterMove(blockedOrigins, { id: movedId, before, after: columnOf(movedId) }),
      );
    }
  }
  noteHint(argv, result.code, cfg);
  const hint = await land(role, ghArgv, result, column, cfg, target);
  noteNewIssue(role, ghArgv, result, hint, cfg);
  if (hint !== "") {
    result = { ...result, stderr: `${result.stderr}${hint}\n` };
  }
  audit({
    role,
    kind,
    argv,
    decision: "allowed",
    code: result.code,
    timedOut: result.timedOut === true,
  });
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
 * The command words the heartbeat shows every agent: `gh pr checks`. Peer
 * argv is never echoed, so only plain lowercase words pass (#496).
 *
 * @param {string} kind
 * @param {string[]} argv
 * @returns {string}
 */
function commandWords(kind, argv) {
  const word = /^[a-z][a-z-]{0,19}$/;
  return [kind, ...argv.slice(0, 2)].map((w) => (word.test(w) ? w : "?")).join(" ");
}

/** The request being served right now, for the heartbeat; null when idle. */
let current = /** @type {{ employee: string, command: string, startedAt: number } | null} */ (null);

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
 * @returns {void}
 */
function heartbeat() {
  let queued = 0;
  for (const employee of staffed.keys()) {
    try {
      queued += withJailDir(path.join(HUB, employee), "req", {}, (req) =>
        req.list().filter(isRequest),
      ).length;
    } catch {
      // This employee has never spoken to hubd, or its req/ is not a directory.
    }
  }
  /** @type {import("./hub-health.mjs").HubdAlive} */
  const alive = {
    ...health,
    heartbeatAt: Date.now(),
    inflight: (current === null ? 0 : 1) + wikiInFlight + queued,
    current,
  };
  writeAtomic(ALIVE, JSON.stringify(alive));
}

/**
 * Who hubd serves (#62): employee id to role, from `staff.json`. The spool
 * directory's name is the employee, and this is the only way from it to a
 * role, so a spool whose name nobody is employed under is never authorized.
 *
 * @type {ReadonlyMap<string, string>}
 */
let staffed = new Map();

/** `staff.json`, read the way `staffReader` reads it: a bad file keeps the last list. */
const readStaff = staffReader(STAFF, (problem, kept) => {
  console.error(
    `hubd: staff.json: ${problem}; still serving ${[...kept.keys()].join(", ") || "nobody"}`,
  );
});

/**
 * Re-reads `staff.json`, so a hire is served on hubd's next pass.
 *
 * @returns {void}
 */
function readStaffed() {
  staffed = readStaff();
}

/** `schedule.json` in the locked tree, read the way `scheduleReader` reads it. */
const readSchedule = scheduleReader(
  path.join(CODE_DIR, "scripts", "bots", "schedule.json"),
  (problem) => {
    console.error(`hubd: schedule.json: ${problem}; still on the last good schedule`);
  },
);

/**
 * Issues colleagues filed, for the manager to rank (#550). In memory only:
 * a restart drops a pending batch, and the groom nudge catches it.
 */
const newIssues = createIssueBatch({
  windowMs: Number(process.env.HUBD_NEW_ISSUES_WINDOW_MS ?? WINDOW_MS),
});

/**
 * Queue an issue someone other than the manager just created, landed in
 * Backlog or not (#550). The manager knows about their own.
 *
 * @param {string} role
 * @param {string[]} argv
 * @param {{ code: number, stdout: string }} result
 * @param {string} hint what `land` printed; "" when the card landed
 * @param {ReturnType<typeof company>} cfg
 * @returns {void}
 */
function noteNewIssue(role, argv, result, hint, cfg) {
  if (role === "manager" || argv[0] !== "issue" || argv[1] !== "create") {
    return;
  }
  const plan = planLanding(argv, result, cfg.repo);
  const number = plan.kind === "add" ? selectorNumber(plan.url, cfg.repo) : null;
  if (number === null) {
    return;
  }
  const title = flagValue(argv, "--title") ?? flagValue(argv, "-t") ?? "";
  newIssues.add({ number, title, landed: hint === "" }, Date.now());
}

/**
 * Tell the manager about a batch whose minute is up (#550).
 *
 * @returns {void}
 */
function sendNewIssues() {
  const now = Date.now();
  const issues = newIssues.take(now);
  if (issues.length > 0) {
    tellCompany(`new-issues-${String(now)}`, newIssueMessage(issues), { to: "manager" });
  }
}

/** When each scheduled nudge was last sent, and when hubd began counting. */
/** @type {Map<string, number>} */
let nudgesSent = new Map();
let nudgesSince = Date.now();

/**
 * Take the nudge clock the last hubd wrote, so a restart does not start every
 * interval over (#640). Missing (the first start ever) or malformed (told
 * once on stderr), it starts now.
 *
 * @returns {void}
 */
function loadNudges() {
  let text;
  try {
    text = fs.readFileSync(NUDGES, "utf8");
  } catch {
    return;
  }
  try {
    ({ since: nudgesSince, sent: nudgesSent } = parseNudgeClock(text));
  } catch (error) {
    console.error(
      `hubd: nudges.json is unusable (${error instanceof Error ? error.message : String(error)}); the clock starts now`,
    );
  }
}

/** The schedulers' own schedules, in memory; `schedules.json` is their copy (#678). */
/** @type {import("./schedule.mjs").OwnSchedule[]} */
let ownSchedules = [];

/**
 * Take the own schedules the last hubd wrote. A file that is not the current
 * shape is deleted and each scheduler told once; nothing is migrated.
 *
 * @returns {void}
 */
function loadOwnSchedules() {
  let text;
  try {
    text = fs.readFileSync(SCHEDULES, "utf8");
  } catch {
    return;
  }
  try {
    ownSchedules = parseOwnSchedules(text);
  } catch (error) {
    console.error(
      `hubd: schedules.json is unusable (${error instanceof Error ? error.message : String(error)}); deleted`,
    );
    fs.rmSync(SCHEDULES, { force: true });
    for (const role of SCHEDULERS) {
      tellCompany(
        `schedules-discarded-${role}`,
        "Your own schedules were discarded (stored in an old shape); add them again.",
        { to: role },
      );
    }
  }
}

/** How often the KPI snapshot is written (#891). */
const KPI_EVERY_MS = 5 * 60_000;

/** The jails' last CPU sample, per unit, for the share since then. */
let cpuSamples = /** @type {{ at: number, nsec: Map<string, number> }} */ ({
  at: 0,
  nsec: new Map(),
});

/** The 7-day utilization's step edges of the last 24 h (#1313), as `kpi-edges.json` holds them. */
let sevenDayEdges = /** @type {import("./kpi.mjs").SevenDayEdge[]} */ ([]);

/** Read the edges a previous hubd left. A file in another shape is discarded. */
function loadKpiEdges() {
  if (!fs.existsSync(KPI_EDGES)) {
    return;
  }
  const edges = parseEdges(fs.readFileSync(KPI_EDGES, "utf8"));
  if (edges === null) {
    fs.rmSync(KPI_EDGES, { force: true });
    console.error("hubd: kpi-edges.json is not a list of edges; discarded");
    return;
  }
  sevenDayEdges = edges;
}

const SLICE = "vibewars-jails.slice";

/** The user manager gets this long, in all, to answer; hubd's loop waits for it. */
const SYSTEMCTL_MS = 3000;

/**
 * Memory and CPU of every jail and of their slice, from the user manager, in
 * one `systemctl show` that is killed after `SYSTEMCTL_MS`: a stalled user
 * manager must not stall the hub commands behind it.
 *
 * @param {number} now
 * @param {readonly string[]} employees staff ids, to name a unit by
 * @returns {Promise<NonNullable<import("./kpi.mjs").Kpis["host"]>>}
 */
async function sampleHost(now, employees) {
  /** @type {string} */
  const shown = await new Promise((resolve, reject) => {
    execFile(
      "systemctl",
      [
        "--user",
        "show",
        "-p",
        "Id",
        "-p",
        "MemoryCurrent",
        "-p",
        "CPUUsageNSec",
        "vibewars-jail-*",
        SLICE,
      ],
      { timeout: SYSTEMCTL_MS, killSignal: "SIGKILL", encoding: "utf8" },
      (error, stdout) => {
        if (error === null) {
          resolve(stdout);
        } else {
          reject(new Error(`systemctl show: ${error.message.split("\n")[0] ?? "failed"}`));
        }
      },
    );
  });
  const units = parseUnits(shown);
  const elapsed = now - cpuSamples.at;
  /** @type {Map<string, number>} */
  const nsec = new Map();
  /** @type {Record<string, { memoryBytes: number, cpuShare: number | null }>} */
  const perEmployee = {};
  for (const [unit, { memoryBytes, cpuNSec }] of units) {
    const key = employeeOfUnit(unit);
    if (key === null || memoryBytes === null) {
      continue;
    }
    const employee = employees.find((id) => id.replace("@", "-") === key) ?? key;
    nsec.set(employee, cpuNSec ?? 0);
    perEmployee[employee] = {
      memoryBytes,
      cpuShare: cpuShare(cpuSamples.nsec.get(employee) ?? null, cpuNSec, elapsed),
    };
  }
  const total = units.get(SLICE) ?? { memoryBytes: null, cpuNSec: null };
  if (total.cpuNSec !== null) {
    nsec.set(SLICE, total.cpuNSec);
  }
  const host = {
    employees: perEmployee,
    slice: {
      memoryBytes: total.memoryBytes ?? 0,
      cpuShare: cpuShare(cpuSamples.nsec.get(SLICE) ?? null, total.cpuNSec, elapsed),
    },
    diskFreeBytes: freeBytes(ROOT),
    diskHoldBelow: HOLD_BELOW,
  };
  cpuSamples = { at: now, nsec };
  return host;
}

/**
 * How far before the newest recorded run each KPI tick reads Actions runs:
 * the 90-min e2e cap and queueing.
 */
const CI_LOOKBACK_MS = 3 * 3_600_000;
/** How far back the first read, and any read, goes, so the numbers exist from the first tick. */
const CI_FIRST_LOOKBACK_MS = 7 * 24 * 3_600_000;
/** `ci-history.jsonl` keeps runs created within this. */
const CI_KEEP_MS = 8 * 24 * 3_600_000;
/** The ids `ci-history.jsonl` holds, loaded from it on the first tick. */
let ciRunIds = /** @type {Set<number> | null} */ (null);

/**
 * Append the Actions runs completed since the last tick to
 * `ci-history.jsonl` (#1612), once per run id, then drop runs older than
 * 8 days. A failed read leaves the file as it is. Runs not yet completed
 * are skipped, and read again on a later tick.
 *
 * @param {number} now
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<import("./kpi.mjs").CiRun[]>} the history, after
 */
async function recordCiRuns(now, cfg) {
  const history = fs.existsSync(CI_HISTORY)
    ? parseCiHistory(fs.readFileSync(CI_HISTORY, "utf8"))
    : [];
  ciRunIds ??= new Set(history.map((run) => run.id));
  // Back past the newest run recorded, so runs that completed while hubd was down are read too.
  const newest = history.length === 0 ? null : Math.max(...history.map((run) => run.createdAt));
  const since = new Date(
    Math.max(
      now - CI_FIRST_LOOKBACK_MS,
      newest === null ? 0 : Math.min(now, newest) - CI_LOOKBACK_MS,
    ),
  );
  /** @type {import("./kpi.mjs").CiRun[]} */
  const read = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const answer = await rest(
      `actions/runs?created=${encodeURIComponent(`>=${since.toISOString()}`)}&per_page=100&page=${String(page)}`,
      cfg,
    );
    const rows =
      typeof answer === "object" && answer !== null && "workflow_runs" in answer
        ? answer.workflow_runs
        : undefined;
    if (!Array.isArray(rows)) {
      return history;
    }
    /** @type {unknown[]} */
    const got = rows;
    read.push(...got.flatMap((row) => ciRunFromRest(row, NAMED_RUN_WORKFLOWS) ?? []));
    if (got.length < 100) {
      break;
    }
  }
  /** @type {import("./kpi.mjs").CiRun[]} */
  const fresh = [];
  for (const run of read) {
    if (!ciRunIds.has(run.id)) {
      ciRunIds.add(run.id);
      fresh.push(run);
    }
  }
  if (fresh.length > 0) {
    fs.appendFileSync(CI_HISTORY, fresh.map((run) => `${JSON.stringify(run)}\n`).join(""));
  }
  const all = [...history, ...fresh];
  const kept = all.filter((run) => run.createdAt >= now - CI_KEEP_MS);
  if (kept.length < all.length) {
    writeAtomic(CI_HISTORY, kept.map((run) => `${JSON.stringify(run)}\n`).join(""));
  }
  return kept;
}

/**
 * The workflows that can run on company runners (#1891), the only ones whose
 * job waits say anything about runners (#1892). CodeQL, dependency review,
 * audit and Pages stay hosted, so their jobs are never read.
 */
const RUNNER_WORKFLOWS = ["ci.yml", "e2e-repeat.yml", "e2e-soak.yml", "music-measure.yml"];
/** The workflows `ci-history.jsonl` names; every other one is `"other"`. */
const NAMED_RUN_WORKFLOWS = [...new Set([...GATE_WORKFLOWS, ...RUNNER_WORKFLOWS])];
/**
 * The most runs whose jobs one KPI tick reads (#1892); a backfill past this
 * is reported as `coverage` until it catches up.
 */
const JOBS_PER_TICK = 10;
/** A run whose jobs fail this many reads is recorded as unread, never asked for again. */
const JOBS_MAX_FAILURES = 3;
/** Failed jobs reads per run id, since hubd started. */
const jobsFailures = /** @type {Map<number, number>} */ (new Map());
/** `ci-jobs.jsonl` as read once at the first tick, and kept since; null before. */
let ciJobsRead = /** @type {import("./kpi.mjs").CiRunJobs[] | null} */ (null);
/** Whether a `readCiJobs` is under way. */
let ciJobsReading = false;

/**
 * The runs' jobs read so far: `ci-jobs.jsonl`, parsed on the first call.
 *
 * @returns {import("./kpi.mjs").CiRunJobs[]}
 */
function ciJobsSoFar() {
  ciJobsRead ??= fs.existsSync(CI_JOBS) ? parseCiJobs(fs.readFileSync(CI_JOBS, "utf8")) : [];
  return ciJobsRead;
}

/**
 * Start reading the jobs `planCiJobs` names next, unless a read is still
 * under way. Never awaited: each read is a `gh api` call, and hubd's loop
 * serves every hub command. The next tick's snapshot uses what has landed.
 *
 * @param {number} now
 * @param {readonly import("./kpi.mjs").CiRun[]} runs `ci-history.jsonl`'s
 * @param {ReturnType<typeof company>} cfg
 * @returns {void}
 */
function startCiJobs(now, runs, cfg) {
  if (ciJobsReading) {
    return;
  }
  ciJobsReading = true;
  readCiJobs(now, runs, cfg)
    .catch((/** @type {unknown} */ error) => {
      console.error(`hubd: ci-jobs.jsonl: ${error instanceof Error ? error.message : "failed"}`);
    })
    .finally(() => {
      ciJobsReading = false;
    });
}

/**
 * Drop from `ci-jobs.jsonl` the runs past 7 days, then append the jobs of
 * the next runs, one at a time. The batch stops at the first failed read:
 * a rate limit fails the rest too. A run that failed `JOBS_MAX_FAILURES`
 * times is recorded with no jobs, as not whole.
 *
 * @param {number} now
 * @param {readonly import("./kpi.mjs").CiRun[]} runs
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<void>}
 */
async function readCiJobs(now, runs, cfg) {
  const read = ciJobsSoFar();
  const { keep, next } = planCiJobs({
    now,
    history: runs,
    read,
    workflows: RUNNER_WORKFLOWS,
    cap: JOBS_PER_TICK,
  });
  if (keep.length < read.length) {
    writeAtomic(CI_JOBS, keep.map((run) => `${JSON.stringify(run)}\n`).join(""));
    ciJobsRead = keep;
  }
  for (const run of next) {
    const answer = await rest(
      `actions/runs/${String(run.id)}/jobs?filter=latest&per_page=100`,
      cfg,
    );
    const jobs = ciRunJobsFromRest(run, answer);
    const failures = jobs === null ? (jobsFailures.get(run.id) ?? 0) + 1 : 0;
    const line = jobs ?? (failures >= JOBS_MAX_FAILURES ? unreadCiRunJobs(run) : null);
    if (line === null) {
      jobsFailures.set(run.id, failures);
      return;
    }
    jobsFailures.delete(run.id);
    fs.appendFileSync(CI_JOBS, `${JSON.stringify(line)}\n`);
    ciJobsRead = [...ciJobsSoFar(), line];
    if (jobs === null) {
      return;
    }
  }
}

/**
 * The host's instant load (#1892): CPUs, load averages, memory, and the free
 * disk under the hub's directory.
 *
 * @returns {NonNullable<import("./kpi.mjs").Kpis["machine"]>}
 */
function sampleMachine() {
  const memory = parseMeminfo(fs.readFileSync("/proc/meminfo", "utf8"));
  if (memory === null) {
    throw new Error("/proc/meminfo has no MemTotal or MemAvailable");
  }
  const [load1 = 0, load5 = 0, load15 = 0] = os.loadavg();
  return {
    cpus: os.availableParallelism(),
    load1,
    load5,
    load15,
    ...memory,
    hubDiskFreeBytes: freeBytes(HUB),
  };
}

/**
 * The most of one employee's wait log hubd reads: 8 days of a busy agent's
 * waits are some 200 KiB. A bigger one is forged, and is left out.
 */
const MAX_WAITS_BYTES = 1024 * 1024;

/**
 * Every employee's wait logs (#1615): `tg` and `board` waits from its bus,
 * read through jail-fs, as the bus is the jail's to write and a plain read
 * could follow a planted symlink; and its idle sleeps from its host-only
 * `agents/<employee>/`, which only the host writes. One missing or
 * unreadable is left out, never an error for the rest.
 *
 * @param {{ employees: Record<string, unknown> } | null} staff
 * @returns {Map<string, import("./waits.mjs").WaitLine[]>}
 */
function readWaits(staff) {
  /** @type {Map<string, import("./waits.mjs").WaitLine[]>} */
  const waits = new Map();
  for (const employee of Object.keys(staff?.employees ?? {})) {
    /** @type {import("./waits.mjs").WaitLine[]} */
    const lines = [];
    try {
      const text = withJailDir(path.join(ROOT, "bus", employee), "", {}, (dir) =>
        dir.readSmall(WAITS_FILE, MAX_WAITS_BYTES),
      );
      lines.push(...parseWaits(text));
    } catch {
      // No waits yet, or a file that is not one: nothing from the bus.
    }
    try {
      const file = path.join(idleWaitsDir(ROOT, employee), WAITS_FILE);
      if (fs.statSync(file).size <= MAX_WAITS_BYTES) {
        lines.push(...parseWaits(fs.readFileSync(file, "utf8")));
      }
    } catch {
      // Never idle yet: nothing from the loop.
    }
    if (lines.length > 0) {
      waits.set(employee, lines);
    }
  }
  return waits;
}

/** The last snapshot written, for `company load`; null before the first. */
let lastSnapshot = /** @type {import("./kpi.mjs").Kpis | null} */ (null);

/**
 * Write `kpis.json` (#891). A section that cannot be read is `null` with its
 * reason in `errors`; hubd never dies of a KPI.
 *
 * @param {ReturnType<typeof company>} cfg
 * @returns {Promise<void>}
 */
async function writeKpis(cfg) {
  try {
    const now = Date.now();
    const staff = readStaffFile(ROOT);
    const { live } = readPresence(ROOT, staff, now);
    /** @type {unknown} */
    let host;
    try {
      host = await sampleHost(now, Object.keys(staff?.employees ?? {}));
    } catch (error) {
      host = error;
    }
    /** @type {import("./kpi.mjs").CiRun[] | Error} */
    let ciRuns;
    try {
      ciRuns = await recordCiRuns(now, cfg);
    } catch (error) {
      ciRuns = error instanceof Error ? error : new Error("CI history unreadable");
    }
    const waits = readWaits(staff);
    const roles = { employees: staff?.employees ?? {} };
    const moves = () =>
      fs.existsSync(BOARD_HISTORY) ? parseHistory(fs.readFileSync(BOARD_HISTORY, "utf8")) : [];
    const kpis = buildKpis(now, {
      flow: () => {
        if (board === null) {
          throw new Error("no board yet");
        }
        const history = moves();
        const cards = board.cards.flatMap(({ item }) => {
          const issue = itemNumber(item, cfg.repo);
          return issue === null
            ? []
            : [{ issue, status: typeof item.status === "string" ? item.status : "" }];
        });
        return flowKpis({ now, moves: history, cards, waits, staff: roles });
      },
      claude: () => {
        const limit = readLimit(ROOT, staff, now);
        const sevenDay = limit?.sevenDay ?? null;
        sevenDayEdges = addEdge(sevenDayEdges, limit);
        writeAtomic(
          KPI_EDGES,
          JSON.stringify({ schemaVersion: EDGES_SCHEMA_VERSION, edges: sevenDayEdges }),
        );
        const read = readUsage(usage, now, limit);
        if (read === null) {
          throw new Error("no usage logs");
        }
        return {
          fiveHour: limit?.fiveHour ?? null,
          sevenDay:
            sevenDay === null ? null : { ...sevenDay, projectedAt: projectSevenDay(sevenDayEdges) },
          tokens5hByRole: tokensByRole(read.summary.roles),
        };
      },
      github: () => {
        if (lastBudget === null) {
          throw new Error("no budget read yet");
        }
        return {
          remaining: lastBudget.remaining,
          limit: lastBudget.limit,
          resetAt: lastBudget.resetAt,
          topSpend: summarizeSpend(spendWindow)
            .top.slice(0, 3)
            .map(({ cmd, cost }) => ({ command: cmd, points: cost })),
        };
      },
      host: () => {
        if (host instanceof Error) {
          throw host;
        }
        return /** @type {NonNullable<import("./kpi.mjs").Kpis["host"]>} */ (host);
      },
      staff: () => {
        if (staff === null || cfg.maxAgents === null) {
          throw new Error("no staff.json or maxAgents");
        }
        return staffKpis(staff, live, cfg.maxAgents, now, waits);
      },
      webCache: () => openWebCache().stats(),
      ci: () => {
        if (ciRuns instanceof Error) {
          throw ciRuns;
        }
        if (ciRuns.length === 0) {
          throw new Error("no CI history yet");
        }
        const history = moves();
        const { done7d } = flowKpis({ now, moves: history, cards: [], waits, staff: roles });
        return ciKpis({ now, runs: ciRuns, moves: history, done7d, gate: GATE_WORKFLOWS });
      },
      ciJobs: () => {
        if (ciRuns instanceof Error) {
          throw ciRuns;
        }
        const wanted = ciRuns.filter((run) => RUNNER_WORKFLOWS.includes(run.workflow));
        return ciJobKpis(now, ciJobsSoFar(), wanted);
      },
      machine: sampleMachine,
    });
    writeAtomic(KPIS, JSON.stringify(kpis));
    lastSnapshot = kpis;
    if (!(ciRuns instanceof Error)) {
      startCiJobs(now, ciRuns, cfg);
    }
  } catch (error) {
    console.error(`hubd: kpis.json: ${error instanceof Error ? error.message : "failed"}`);
  }
}

/**
 * Send the nudges that are due (#537). link decides per employee whether one
 * is still unread; hubd only keeps the clock.
 *
 * @returns {void}
 */
function sendNudges() {
  const schedule = [...readSchedule(), ...ownNudges(ownSchedules)];
  const now = Date.now();
  for (const nudge of dueNudges({ now, schedule, lastSent: nudgesSent, since: nudgesSince })) {
    nudgesSent.set(nudge.id, now);
    tellCompany(`nudge-${nudge.id}`, nudge.text, { to: nudge.to, nudge: nudge.id });
    writeNudges();
  }
}

/**
 * hubd's nudge clock, for the dashboard (#547) and the next start (`loadNudges`).
 *
 * @returns {void}
 */
function writeNudges() {
  // An own schedule that no longer exists (its role left SCHEDULERS) loses its clock.
  const live = new Set(ownNudges(ownSchedules).map((nudge) => nudge.id));
  for (const id of nudgesSent.keys()) {
    if (id.startsWith("own-") && !live.has(id)) {
      nudgesSent.delete(id);
    }
  }
  writeAtomic(NUDGES, JSON.stringify({ since: nudgesSince, sent: Object.fromEntries(nudgesSent) }));
}

/**
 * Spools named like an employee that nobody is employed under: a fired
 * employee's, or one made by hand. Their requests are answered, refused.
 *
 * @returns {string[]}
 */
function unstaffedSpools() {
  try {
    return fs
      .readdirSync(HUB, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && roleOf(entry.name) !== null)
      .map((entry) => entry.name)
      .filter((name) => !staffed.has(name));
  } catch {
    return [];
  }
}

/**
 * The host's own spool (#385): `claude-llc hire` and `fire` write here. The
 * jails mount `hub/` read-only, so only the operator's shell can.
 */
const OPERATOR_SPOOL = "_operator";
const OPERATOR_ROLE = "operator";

/**
 * @param {string} kind
 * @param {string[]} argv
 * @returns {Record<string, unknown>}
 */
function operatorRequest(kind, argv) {
  if (kind !== "staff") {
    const reason = `the operator's spool serves only hire and fire, not "${kind}"`;
    audit({ role: OPERATOR_ROLE, kind, argv, decision: "refused", reason });
    return { allow: false, reason, code: 77 };
  }
  return staff(OPERATOR_ROLE, argv, company());
}

/** The most wiki requests served at once, beside the gh lane (#1380). */
const WIKI_LANE = 2;
/** Wiki requests taken from their spool and not yet answered. */
let wikiInFlight = 0;
/**
 * Where hubd reads the wiki and Wayback. HUBD_WIKI_LIVE_ORIGIN and
 * HUBD_WIKI_ARCHIVE_ORIGIN are for a test to point them at itself.
 */
const WIKI_ORIGINS = {
  live: process.env.HUBD_WIKI_LIVE_ORIGIN ?? LIVE_ORIGIN,
  archive: process.env.HUBD_WIKI_ARCHIVE_ORIGIN ?? ARCHIVE_ORIGIN,
};

/** @type {import("./web-cache.mjs").WebCache | null} */
let webCache = null;

/**
 * The web cache, opened on first use: by a wiki request or the KPIs.
 *
 * @returns {import("./web-cache.mjs").WebCache}
 */
function openWebCache() {
  webCache ??= createWebCache({
    dir: WEB_CACHE,
    freeBytes: () => freeBytes(ROOT),
    holdBelow: HOLD_BELOW,
    log: (line) => {
      console.error(line);
    },
  });
  return webCache;
}

/**
 * Serve a `hub wiki` request on the side (#1380). A Wayback fetch can take
 * 30 s, and nothing in it touches GitHub, so it never holds up a merge or a
 * board move queued behind it in the one-at-a-time gh lane. The answer is
 * written whenever it is ready; the reboot's `inflight` counts it until then.
 *
 * @param {string} employee
 * @param {string} role
 * @param {string} id the request's, which names its answer
 * @param {string[]} argv the words after `hub wiki`
 * @returns {void}
 */
function startWiki(employee, role, id, argv) {
  wikiInFlight += 1;
  heartbeat();
  void serveWiki(employee, role, argv)
    .catch((/** @type {unknown} */ error) => {
      const message = error instanceof Error ? error.message : "failed";
      health.lastError = { at: Date.now(), message };
      return { allow: true, code: 1, stderr: `hubd: ${message}\n` };
    })
    .then((response) => {
      if (response.allow === false) {
        health.refused += 1;
      } else {
        health.served += 1;
      }
      try {
        withJailDir(path.join(HUB, employee), "res", { create: true }, (res) => {
          res.writeAtomic(`${id}.json`, JSON.stringify(response));
        });
      } catch (error) {
        refused(employee, `response ${id}.json`, error);
      }
    })
    .finally(() => {
      wikiInFlight -= 1;
      heartbeat();
    });
}

/**
 * @param {string} employee
 * @param {string} role
 * @param {string[]} argv
 * @returns {Promise<Record<string, unknown>>}
 */
async function serveWiki(employee, role, argv) {
  const kind = "wiki";
  const verdict = authorize(role, { kind, argv }, { acting: actingFor(role), employee });
  if (!verdict.allow) {
    audit({ employee, role, kind, argv, decision: "refused", reason: verdict.reason });
    return { allow: false, reason: verdict.reason, code: 77 };
  }
  const answer = await runWiki(argv, { fetch, origins: WIKI_ORIGINS, cache: openWebCache() });
  audit({ employee, role, kind, argv, decision: "allowed", code: answer.code });
  return { allow: true, ...answer };
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
 * Serve an employee's spool. req/ and res/ are the jail's (jail-fs.mjs,
 * #329): what is in them, and what they are, is up to the agent, so nothing
 * here goes through a path that a symlink could redirect.
 *
 * @param {string} employee the spool directory's name
 * @param {string | null} role the employee's, or `null` if nobody is employed
 *   under that name: then its requests are refused, and nothing is created
 * @returns {Promise<void>}
 */
async function drain(employee, role) {
  const home = path.join(HUB, employee);
  if (role === null && !fs.existsSync(path.join(home, "req"))) {
    return;
  }
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
    refused(employee, "req/ or res/", error);
    return;
  }
  try {
    await serveSpool(employee, role, req, res);
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
 * Removes a request already refused. A jail can make that fail (a mode it
 * set), and it must not stop the rest of the spool.
 *
 * @param {string} role
 * @param {import("./jail-fs.mjs").JailDir} req
 * @param {string} name
 * @returns {void}
 */
function dropRefused(role, req, name) {
  try {
    req.remove(name);
  } catch (error) {
    refused(role, `request ${name} (remove)`, error);
  }
}

/**
 * @param {string} employee
 * @param {string | null} role see `drain`
 * @param {import("./jail-fs.mjs").JailDir} req
 * @param {import("./jail-fs.mjs").JailDir} res
 * @returns {Promise<void>}
 */
async function serveSpool(employee, role, req, res) {
  const pending = req.list().filter(isRequest).sort();

  for (const name of pending) {
    const id = name.replace(/\.json$/, "");
    if (!REQUEST_ID.test(id)) {
      refused(employee, `request ${JSON.stringify(name)}`, "not a request id");
      dropRefused(employee, req, name);
      continue;
    }
    /** @type {string} */
    let text;
    try {
      text = req.readSmall(name, REQUEST_MAX_BYTES);
    } catch (error) {
      refused(employee, `request ${name}`, error);
      dropRefused(employee, req, name);
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
    const raw = /** @type {Record<string, unknown>} */ (parsed);
    const kind = typeof raw.kind === "string" ? raw.kind : "";
    const argv = Array.isArray(raw.argv) ? raw.argv.map(String) : [];
    if (kind === "wiki" && role !== null && employee !== OPERATOR_SPOOL) {
      // Left in the spool while the lane is full: the next pass takes it.
      if (wikiInFlight < WIKI_LANE) {
        req.remove(name);
        startWiki(employee, role, id, argv);
      }
      continue;
    }
    current = { employee, command: commandWords(kind, argv), startedAt: Date.now() };
    heartbeat();
    req.remove(name);
    /** @type {Record<string, unknown>} */
    let response;
    try {
      if (employee === OPERATOR_SPOOL) {
        response = operatorRequest(kind, argv);
      } else if (role === null) {
        const reason = `unknown employee "${employee}"`;
        audit({ employee, kind, argv, decision: "refused", reason });
        response = { allow: false, reason, code: 77 };
      } else {
        // The employee comes from the directory, never from the request
        // body, and the role from staff.json: a request claiming to be from
        // someone else would otherwise be authorized as them.
        response = await handle({ employee, role, kind, argv });
      }
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
      current = null;
      heartbeat();
    }

    try {
      res.writeAtomic(`${id}.json`, JSON.stringify(response));
    } catch (error) {
      refused(employee, `response ${id}.json`, error);
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
  if (process.env.VIBEWARS_CREDENTIALS === undefined || process.env.VIBEWARS_CREDENTIALS === "") {
    console.error("hubd: VIBEWARS_CREDENTIALS is not set");
    process.exit(1);
  }
  const login = await ghRaw(["api", "user", "--jq", ".login"]);
  if (login.code !== 0 || login.stdout.trim() === "") {
    console.error(`hubd: the company's gh in ${CREDENTIALS.gh} is not signed in`);
    process.exit(1);
  }
  console.error(
    `hubd: serving the employees in ${STAFF} on ${cfg.repo} (project ${String(cfg.project)}) as ${login.stdout.trim()}`,
  );

  fs.mkdirSync(HUB, { recursive: true });
  fs.mkdirSync(path.dirname(ALIVE), { recursive: true });
  fs.mkdirSync(path.join(HUB, OPERATOR_SPOOL, "req"), { recursive: true });
  fs.mkdirSync(path.join(HUB, OPERATOR_SPOOL, "res"), { recursive: true });
  // One hubd per spool: two would run every request twice (#23).
  if (!takeLock(LOCK)) {
    console.error(`hubd: another hubd holds ${LOCK}; not starting a second`);
    process.exit(1);
  }
  health.sha = readBoot()?.sha.slice(0, 7) ?? null;
  // A restart costs no sweep the board's age does not call for.
  loadBoard(cfg);
  loadBlocked();
  loadKpiEdges();
  loadNudges();
  loadOwnSchedules();
  loadWatches();
  readStaffed();
  heartbeat();
  const heartbeatMs = Number(process.env.HUBD_HEARTBEAT_MS ?? HEARTBEAT_MS);
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
    throw new Error("HUBD_HEARTBEAT_MS must be a positive number of milliseconds");
  }
  // On a timer, not between requests: a slow request must not look like a
  // dead daemon (#496).
  setInterval(() => {
    heartbeat();
  }, heartbeatMs).unref();
  // The dashboard's budget line. Free to ask (see `budgetExhausted`), and
  // it is also what lifts `limitedUntil` once GitHub resets the budget.
  const BUDGET_CHECK_MS = 60_000;
  const NUDGE_CHECK_MS = 10_000;
  await budgetExhausted();
  await syncSkills(cfg);
  let lastBudgetCheck = Date.now();
  let lastNudgeCheck = 0;
  let lastProposalCheck = 0;
  /** @param {string} why */
  const stop = (why) => {
    console.error(`hubd: stopping on ${why}`);
    webCache?.flush();
    fs.rmSync(ALIVE, { force: true });
    releaseLock(LOCK);
    process.exit(0);
  };
  process.on("SIGINT", () => {
    stop("SIGINT");
  });
  process.on("SIGTERM", () => {
    stop("SIGTERM");
  });
  // So the next "hubd exited (code N)" line in hubd.log is explained.
  for (const event of /** @type {const} */ (["uncaughtException", "unhandledRejection"])) {
    process.on(event, (error) => {
      console.error(
        `hubd: ${event}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      process.exit(1);
    });
  }

  writeNudges();
  let lastKpis = 0;
  for (;;) {
    readStaffed();
    /** @type {[string, string | null][]} */
    const spools = [
      ...staffed,
      ...unstaffedSpools().map((name) => /** @type {[string, null]} */ ([name, null])),
    ];
    for (const [employee, role] of [[OPERATOR_SPOOL, OPERATOR_ROLE], ...spools]) {
      try {
        await drain(employee, role);
      } catch (error) {
        console.error(`hubd: ${employee}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    if (hints.size > 0) {
      try {
        await flushHints(company());
      } catch (error) {
        console.error(`hubd: board: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    sendNewIssues();
    maybePollWatches();
    if (Date.now() - lastProposalCheck > PROPOSAL_POLL_MS) {
      lastProposalCheck = Date.now();
      decideProposals();
    }
    if (Date.now() - lastNudgeCheck > NUDGE_CHECK_MS) {
      lastNudgeCheck = Date.now();
      sendNudges();
      relayRunnersAlert();
    }
    if (Date.now() - lastKpis >= KPI_EVERY_MS) {
      lastKpis = Date.now();
      await writeKpis(cfg);
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
