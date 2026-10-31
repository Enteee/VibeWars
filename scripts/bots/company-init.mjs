#!/usr/bin/env node
/**
 * `claude-llc-init` — set up the company's GitHub side, once.
 *
 * Idempotent throughout: every step checks the current state and does nothing
 * if it is already right, because this will be re-run whenever something
 * looks off and it must be safe to do that.
 *
 * Runs on the host. Step 0 is the company's credentials (#864): its home,
 * its Claude account, and the GitHub account and push key everything the
 * company does on GitHub at runtime runs as (#866). Then, as the operator,
 * who has the admin rights, four things:
 *
 *  1. adopt (or create) the Projects v2 board and give its Status field the
 *     seven columns this company's workflow uses
 *  2. link the board to the repository
 *  3. protect `main` with a ruleset — newly possible now that the repository
 *     is public, and the one piece of enforcement that does not depend on our
 *     own code being correct
 *  4. write `.bots/company.json`, which hubd and the dashboard read, with
 *     the most employees the company may have (`maxAgents`), asked once
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";

import {
  claudeVerdict,
  ensureHome,
  githubIdentity,
  missingGithubScopes,
  paths,
  projectAccess,
  pushIdentity,
  resetBoxesOnAccountChange,
} from "./creds.mjs";
import { COLUMNS, columnsPlan } from "./hub-board.mjs";
import { ROLES } from "./hub-policy.mjs";

/**
 * The checks a pull request must carry before QA may merge it.
 *
 * Named explicitly rather than inferred from whatever ran, because "did
 * everything pass" is satisfied by a pull request with no checks at all —
 * which is what you get by deleting a job from the workflow. This is the list
 * hubd compares against. Keep it in step with `.github/workflows/`.
 */
//
// `git hooks` runs every git hook in one job (#230). Its name is fixed;
// the hooks it runs come from devenv.nix.
// `dependency review` is dependency-review.yml, which runs on every pull
// request (#133). `e2e` is the Playwright suite, a job of its own in ci.yml
// (#132).
const EXPECTED_CHECKS = [
  "format + lint + typecheck + test + build",
  "git hooks",
  "dependency review",
  "e2e",
];

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

// Step 0 (#864): the credential directory, the Telegram token in it, the
// company's Claude account (#865) and its GitHub account and push key (#866).
const credentials = process.env.VIBEWARS_CREDENTIALS ?? "";
if (credentials === "") {
  console.error("VIBEWARS_CREDENTIALS is not set: run this through claude-llc-init.");
  process.exit(2);
}
const home = ensureHome(credentials);
for (const line of home.lines) {
  say(line.step, line.outcome);
}
if (!home.ok) {
  process.exit(1);
}
const claude = claudeVerdict(credentials);
if (!claude.ok) {
  say("claude account", "NOT READY");
  console.error(`claude-llc-init: ${claude.message}`);
  process.exit(1);
}
say("claude account", `${claude.who} (the company's own)`);
const reset = resetBoxesOnAccountChange(
  credentials,
  process.env.VIBEWARS_CLAUDE_BOXES ?? "",
  claude.who,
);
if (reset > 0) {
  say(
    "claude state",
    `${String(reset)} box(es) reset: the account changed, their Claude state starts over`,
  );
}

// Everything the company does on GitHub at runtime is done as its own
// account: hubd's gh with this directory, pushes with this key. Init itself
// stays the operator's, below, for what needs an admin: the board, the
// ruleset. Whose account it is, is not compared with the operator's (the
// operator's decision); the doctor shows it.
const githubHome = paths(credentials);
const github = githubIdentity(githubHome.gh);
if (github.state !== "ok" || github.who === null) {
  say("github", "NOT READY");
  console.error(
    github.state === "error"
      ? `claude-llc-init: the company's GitHub account could not be read: ${github.note ?? "?"}`
      : "claude-llc-init: the company's GitHub account is not set up. Sign it in: claude-llc auth github",
  );
  process.exit(1);
}
const companyLogin = github.who;
say("github", `${companyLogin} (the company's own)`);
const missingScopes = missingGithubScopes(github.scopes);
if (missingScopes.includes("project")) {
  say("github project scope", "MISSING");
  console.error("  The board cannot be worked without it. Sign in again: claude-llc auth github");
  process.exit(1);
}
say("github project scope", "present");
if (missingScopes.includes("workflow")) {
  say("github workflow scope", "MISSING");
  console.error(
    "  A pull request that changes a workflow cannot be merged without it. Sign in again: claude-llc auth github",
  );
  process.exit(1);
}
say("github workflow scope", "present");

// The key is made, and added to GitHub, by `claude-llc auth push`, which
// waits until GitHub greets it as the company's login.
const greeted = pushIdentity(githubHome.sshKey);
if (greeted.who?.toLowerCase() !== companyLogin.toLowerCase()) {
  say("github push key", "NOT READY");
  console.error(
    greeted.who === null
      ? "claude-llc-init: the company's push key is not set up. Add it: claude-llc auth push"
      : `claude-llc-init: GitHub greets the push key as ${greeted.who}, not ${companyLogin}. Fix it: claude-llc auth push`,
  );
  process.exit(1);
}
say("github push key", `accepted as ${companyLogin}`);
console.log("");

/* 1. the operator, for the admin steps ------------------------------------ */

const who = gh(["api", "user", "--jq", ".login"]);
if (who.code !== 0) {
  console.error("claude-llc-init: your gh is not authenticated. Run: gh auth login");
  process.exit(1);
}
say("admin steps as", who.stdout.trim());

const scopes = gh(["api", "--include", "user"]);
if (!/x-oauth-scopes:.*\bproject\b/i.test(scopes.stdout)) {
  console.error("");
  console.error("  Your token is missing the 'project' scope, so the board cannot be");
  console.error("  set up. Run:  gh auth refresh -s project,read:project");
  process.exit(1);
}
say("admin project scope", "present");

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

// The board is a user project, so the company's account reaches it only
// when the owner adds it there: being a collaborator on the repository does
// not (#866). Checked here, the first point the board is known.
if (projectAccess(credentials, OWNER, projectNumber)) {
  say("github project access", `${companyLogin} can work the board`);
} else {
  say("github project access", "MISSING");
  console.error(`  Add ${companyLogin} to the board with Write access, then run this again:`);
  console.error(
    `  https://github.com/users/${OWNER}/projects/${String(projectNumber)}/settings/access`,
  );
  process.exit(1);
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
const itemList = gh([
  "project",
  "item-list",
  String(projectNumber),
  "--owner",
  OWNER,
  "--format",
  "json",
  "--limit",
  "1",
]);
if (itemList.code !== 0) {
  console.error(`claude-llc-init: could not read the board's cards\n${itemList.stderr}`);
  process.exit(1);
}
const listedItems = obj(parse(itemList.stdout)).items;
const plan = columnsPlan({
  current: status.options.map((option) => option.name),
  wanted: COLUMNS,
  items: Array.isArray(listedItems) ? listedItems.length : 0,
});
if (plan.kind === "refuse") {
  console.error(`claude-llc-init: ${plan.message}`);
  process.exit(1);
} else if (plan.kind === "ok") {
  say("columns", "already correct");
} else {
  // A fresh board comes with Todo / In Progress / Done. Replacing the option
  // set is the only way to get ours; `gh` has no field-edit, so this is
  // GraphQL. Refused above once a card is on the board, because it would
  // clear every card's column.
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
/**
 * The most employees the company may have, manager included (#62): a cost
 * the operator decides, so it is asked, not assumed. Kept across re-runs.
 *
 * @type {number | null}
 */
let maxAgents = null;
try {
  /** @type {unknown} */
  const previous = JSON.parse(fs.readFileSync(path.join(ROOT, "company.json"), "utf8"));
  const existing = obj(previous).acting;
  if (typeof existing === "object" && existing !== null) {
    acting = /** @type {typeof acting} */ (existing);
  }
  const cap = obj(previous).maxAgents;
  if (typeof cap === "number" && Number.isInteger(cap) && cap > 0) {
    maxAgents = cap;
  }
} catch {
  /* first run */
}
while (maxAgents === null) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (
    await prompt.question(`  Most employees the company may have [${String(ROLES.length)}]: `)
  ).trim();
  prompt.close();
  const cap = answer === "" ? ROLES.length : Number(answer);
  if (Number.isInteger(cap) && cap > 0) {
    maxAgents = cap;
  } else {
    console.error("  A whole number above 0, please.");
  }
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
  maxAgents,
};
fs.writeFileSync(path.join(ROOT, "company.json"), `${JSON.stringify(config, null, 2)}\n`);
say("company.json", path.join(ROOT, "company.json"));

console.log("");
console.log(`  Board: https://github.com/users/${OWNER}/projects/${String(projectNumber)}`);
console.log("");
