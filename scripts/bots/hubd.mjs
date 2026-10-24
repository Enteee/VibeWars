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

import { approvalsSatisfied, checksSatisfied, explainGuard } from "./hub-guards.mjs";
import { ROLES, authorize, touchesGate } from "./hub-policy.mjs";

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

/**
 * Commands that accept `--repo`. The repository is pinned by us rather than
 * taken from the request, and the policy refuses an agent-supplied `--repo`,
 * so there is exactly one repository this company can act on.
 */
const REPO_SCOPED = new Set(["issue", "pr", "label", "run", "workflow", "release"]);

/**
 * @returns {{ repo: string, owner: string, project: number, expectedChecks: string[], columns: string[] }}
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
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function run(file, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd,
      env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" },
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
  return run("gh", args, REPO_DIR);
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
  if (group === "project" && !argv.includes("--owner")) {
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
 * @param {string[]} guards
 * @param {string[]} argv
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function evaluateGuards(guards, argv) {
  const cfg = company();
  // `pr merge <n>` — the number is the first argument that looks like one.
  const pr = argv.find((word) => /^[0-9]+$/.test(word));
  if (pr === undefined) {
    return { ok: false, reason: "could not tell which pull request this is about" };
  }

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
  return { ok: true };
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
 * @param {string} worktree
 * @returns {Promise<string[]>}
 */
async function changedPaths(worktree) {
  const result = await run("git", ["diff", "--name-only", "origin/main...HEAD"], worktree);
  return result.code === 0 ? result.stdout.split("\n").filter((line) => line !== "") : [];
}

/* -------------------------------------------------------------------------- */
/* Handling                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @param {{ role: string, kind: string, argv: string[] }} request
 * @returns {Promise<Record<string, unknown>>}
 */
async function handle(request) {
  const { role, kind, argv } = request;
  const verdict = authorize(role, { kind, argv });

  if (!verdict.allow) {
    audit({ role, kind, argv, decision: "refused", reason: verdict.reason });
    return { allow: false, reason: verdict.reason, code: 77 };
  }

  if (verdict.guards !== undefined) {
    const guarded = await evaluateGuards(verdict.guards, argv);
    if (!guarded.ok) {
      audit({ role, kind, argv, decision: "refused-by-guard", reason: guarded.reason });
      return { allow: false, reason: guarded.reason, code: 77 };
    }
  }

  const cfg = company();

  if (kind === "review") {
    const [promptVerb, pr, ...note] = argv;
    const sha = await headSha(String(pr));
    if (sha === null) {
      return { allow: false, reason: `could not read pull request #${String(pr)}`, code: 77 };
    }
    fs.appendFileSync(
      APPROVALS,
      `${JSON.stringify({
        pr: Number(pr),
        role,
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
    const body = `**${mark}** by \`${role}\`\n\n${note.join(" ") || "(no note)"}\n\n<sub>recorded by hub against ${sha.slice(0, 8)}</sub>`;
    const posted = await gh(["pr", "comment", String(pr), "--repo", cfg.repo, "--body", body]);
    audit({ role, kind, argv, decision: "allowed", sha });
    return {
      allow: true,
      code: 0,
      stdout: `${mark} recorded for #${String(pr)} against ${sha.slice(0, 8)}\n`,
      stderr: posted.code === 0 ? "" : posted.stderr,
    };
  }

  if (kind === "push") {
    const [branch] = argv;
    const worktree = path.join(ROOT, "wt", role);
    const paths = await changedPaths(worktree);
    const gateChange = touchesGate(paths);
    const result = await run("git", ["push", "--set-upstream", "origin", String(branch)], worktree);
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

  const result = await gh(pinRepo(argv, cfg));
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
  const token = await run("gh", ["auth", "token"], REPO_DIR);
  if (token.code !== 0) {
    console.error("hubd: gh is not authenticated on this machine");
    process.exit(1);
  }
  console.error(
    `hubd: serving ${String(ROLES.length)} roles on ${cfg.repo} (project ${String(cfg.project)})`,
  );

  for (;;) {
    for (const role of ROLES) {
      try {
        await drain(role);
      } catch (error) {
        console.error(`hubd: ${role}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    await sleep(300);
  }
}

await main();
