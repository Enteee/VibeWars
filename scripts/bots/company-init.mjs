#!/usr/bin/env node
/**
 * `claude-llc-init` — set up the company's GitHub side, once.
 *
 * Idempotent throughout: every step checks the current state and does nothing
 * if it is already right, because this will be re-run whenever something
 * looks off and it must be safe to do that.
 *
 * Runs on the host, with the real credential. Four things:
 *
 *  1. adopt (or create) the Projects v2 board and give its Status field the
 *     six columns this company's workflow uses
 *  2. link the board to the repository
 *  3. protect `main` with a ruleset — newly possible now that the repository
 *     is public, and the one piece of enforcement that does not depend on our
 *     own code being correct
 *  4. write `.bots/company.json`, which hubd and the dashboard read
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const COLUMNS = ["Backlog", "Ready", "In Progress", "In Review", "QA", "Done"];

/**
 * The checks a pull request must carry before QA may merge it.
 *
 * Named explicitly rather than inferred from whatever ran, because "did
 * everything pass" is satisfied by a pull request with no checks at all —
 * which is what you get by deleting a job from the workflow. This is the list
 * hubd compares against. Keep it in step with `.github/workflows/`.
 */
//
// `git hooks` is the aggregate of the per-hook matrix jobs, and is required
// instead of them: their `hook (<id>)` names change whenever a hook is added.
const EXPECTED_CHECKS = ["format + lint + typecheck + test + build", "git hooks"];

const ROOT = process.env.VIBEWARS_BOT_ROOT ?? path.join(process.cwd(), ".bots");
const REPO = process.env.VIBEWARS_REPO ?? "Enteee/VibeWars";
const OWNER = REPO.split("/")[0] ?? "";
const NAME = REPO.split("/")[1] ?? "";

/**
 * @param {string[]} args
 * @param {string} [stdin]
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function gh(args, stdin) {
  const result = spawnSync("gh", args, { encoding: "utf8", input: stdin });
  return {
    code: result.status ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parse(text) {
  /** @type {unknown} */
  const parsed = JSON.parse(text);
  return parsed;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function obj(value) {
  return typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {string} step
 * @param {string} outcome
 */
function say(step, outcome) {
  console.log(`  ${step.padEnd(34)} ${outcome}`);
}

/* -------------------------------------------------------------------------- */

console.log("");
console.log(`Setting up the company on ${REPO}`);
console.log("");

/* 1. authentication -------------------------------------------------------- */

const who = gh(["api", "user", "--jq", ".login"]);
if (who.code !== 0) {
  console.error("claude-llc-init: gh is not authenticated. Run: gh auth login");
  process.exit(1);
}
say("authenticated as", who.stdout.trim());

const scopes = gh(["api", "--include", "user"]);
if (!/x-oauth-scopes:.*\bproject\b/i.test(scopes.stdout)) {
  console.error("");
  console.error("  The token is missing the 'project' scope, so the board cannot be");
  console.error("  managed. Run:  gh auth refresh -s project,read:project");
  process.exit(1);
}
say("project scope", "present");

/* 2. the board ------------------------------------------------------------- */

let projectNumber = 0;
let projectId = "";

const existing = gh(["project", "list", "--owner", OWNER, "--format", "json"]);
if (existing.code === 0) {
  const data = obj(parse(existing.stdout));
  for (const raw of Array.isArray(data.projects) ? data.projects : []) {
    const project = obj(raw);
    if (project.title === "VibeWars") {
      projectNumber = Number(project.number);
      projectId = String(project.id);
      break;
    }
  }
}

if (projectNumber === 0) {
  const created = gh([
    "project",
    "create",
    "--owner",
    OWNER,
    "--title",
    "VibeWars",
    "--format",
    "json",
  ]);
  if (created.code !== 0) {
    console.error(`claude-llc-init: could not create the board\n${created.stderr}`);
    process.exit(1);
  }
  const project = obj(parse(created.stdout));
  projectNumber = Number(project.number);
  projectId = String(project.id);
  say("board", `created as #${String(projectNumber)}`);
} else {
  say("board", `adopted existing #${String(projectNumber)}`);
}

/* 3. the Status column set ------------------------------------------------- */

/**
 * The Status field, with every option's id, as GitHub has it now.
 *
 * @returns {{ id: string, options: { name: string, id: string }[] }}
 */
function readStatus() {
  const fields = gh([
    "project",
    "field-list",
    String(projectNumber),
    "--owner",
    OWNER,
    "--format",
    "json",
    "--limit",
    "50",
  ]);
  if (fields.code !== 0) {
    console.error(`claude-llc-init: could not read the board's fields\n${fields.stderr}`);
    process.exit(1);
  }
  const listed = obj(parse(fields.stdout)).fields;
  for (const raw of Array.isArray(listed) ? listed : []) {
    const field = obj(raw);
    if (field.name === "Status") {
      return {
        id: String(field.id),
        options: (Array.isArray(field.options) ? field.options : []).map((o) => ({
          name: String(obj(o).name),
          id: String(obj(o).id),
        })),
      };
    }
  }
  console.error("claude-llc-init: the board has no Status field, which should not happen");
  process.exit(1);
}

let status = readStatus();
const wanted = COLUMNS.join("|");
if (status.options.map((option) => option.name).join("|") === wanted) {
  say("columns", "already correct");
} else {
  // A fresh board comes with Todo / In Progress / Done. Replacing the option
  // set is the only way to get our six; `gh` has no field-edit, so this is
  // GraphQL. Done before any issue is on the board, so nothing is unassigned
  // by it.
  const options = COLUMNS.map(
    (name) => `{name: ${JSON.stringify(name)}, color: GRAY, description: ""}`,
  ).join(", ");
  const mutation = `mutation { updateProjectV2Field(input: {fieldId: ${JSON.stringify(status.id)}, singleSelectOptions: [${options}]}) { projectV2Field { ... on ProjectV2SingleSelectField { id name options { name } } } } }`;
  const updated = gh(["api", "graphql", "-f", `query=${mutation}`]);
  if (updated.code !== 0) {
    console.error(`claude-llc-init: could not set the columns\n${updated.stderr}`);
    process.exit(1);
  }
  say("columns", `set to ${COLUMNS.join(" -> ")}`);
  // Replacing the option set gives every option a new id.
  status = readStatus();
}

/* 4. link the board to the repository ------------------------------------- */

const linked = gh(["project", "link", String(projectNumber), "--owner", OWNER, "--repo", REPO]);
say("board linked to repo", linked.code === 0 ? "yes" : "already linked");

/* 5. protect main ---------------------------------------------------------- */

const rulesets = gh(["api", `repos/${REPO}/rulesets`]);
/** @type {unknown[]} */
let existingRulesets = [];
if (rulesets.code === 0) {
  const parsed = parse(rulesets.stdout);
  existingRulesets = Array.isArray(parsed) ? parsed : [];
}
const mainRuleset = existingRulesets.map(obj).find((entry) => entry.name === "main");

// Deliberately requires a pull request but ZERO approving reviews. All nine
// agents share one GitHub identity, which GitHub will not let approve its
// own pull request — so any non-zero requirement here would deadlock the
// company permanently. Our own review gates live in hub's ledger instead.
// What this ruleset does enforce is the part that does not depend on
// identity, and that our code cannot be talked out of: no direct push to
// main, no force-push, no deletion, and CI must pass.
const ruleset = {
  name: "main",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
  rules: [
    { type: "deletion" },
    { type: "non_fast_forward" },
    {
      type: "pull_request",
      parameters: {
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_review_thread_resolution: false,
      },
    },
    {
      type: "required_status_checks",
      parameters: {
        // A branch behind main may merge as long as it does not conflict:
        // the operator dropped "must be up to date" (#64), because every
        // merge otherwise sent every open PR round CI and re-review again.
        strict_required_status_checks_policy: false,
        required_status_checks: EXPECTED_CHECKS.map((context) => ({ context })),
      },
    },
  ],
};

// Written every run, not only when missing, so that re-running init brings
// GitHub in line with this file — the required checks above included.
const rulesetId = typeof mainRuleset?.id === "number" ? String(mainRuleset.id) : undefined;
const written =
  rulesetId === undefined
    ? gh(
        ["api", `repos/${REPO}/rulesets`, "--method", "POST", "--input", "-"],
        JSON.stringify(ruleset),
      )
    : gh(
        ["api", `repos/${REPO}/rulesets/${rulesetId}`, "--method", "PUT", "--input", "-"],
        JSON.stringify(ruleset),
      );
if (written.code === 0) {
  say(
    "ruleset on main",
    `${rulesetId === undefined ? "created" : "updated"} (no direct push, no force-push, CI required)`,
  );
} else {
  say("ruleset on main", "FAILED");
  console.error(written.stderr.trim().split("\n").slice(0, 3).join("\n"));
  console.error("  The company still works — hub enforces the role rules — but main");
  console.error("  is not protected by GitHub itself. Worth fixing.");
}

/* 6. company.json ---------------------------------------------------------- */

fs.mkdirSync(ROOT, { recursive: true });
/**
 * Hats a role may borrow while the real wearer has not been hired.
 *
 * Preserved across re-runs rather than reset, since this is an operator
 * decision and `claude-llc-init` is re-run whenever something looks off.
 * hubd only honours a hat whose wearer is genuinely absent, so these entries
 * are inert once the proper bots exist and need no cleanup.
 */
let acting = { "lead-dev": ["perf-sec-qa", "qa-tester"] };
try {
  /** @type {unknown} */
  const previous = JSON.parse(fs.readFileSync(path.join(ROOT, "company.json"), "utf8"));
  const existing = obj(previous).acting;
  if (typeof existing === "object" && existing !== null) {
    acting = /** @type {typeof acting} */ (existing);
  }
} catch {
  /* first run */
}

const config = {
  acting,
  repo: REPO,
  owner: OWNER,
  name: NAME,
  project: projectNumber,
  projectId,
  // Stored so `board move` is one mutation instead of four lookups and one
  // mutation, which mattered once the company kept hitting GitHub's rate
  // limit (issue #17).
  statusField: {
    id: status.id,
    options: Object.fromEntries(status.options.map((option) => [option.name, option.id])),
  },
  columns: COLUMNS,
  expectedChecks: EXPECTED_CHECKS,
};
fs.writeFileSync(path.join(ROOT, "company.json"), `${JSON.stringify(config, null, 2)}\n`);
say("company.json", path.join(ROOT, "company.json"));

console.log("");
console.log(`  Board: https://github.com/users/${OWNER}/projects/${String(projectNumber)}`);
console.log("");
