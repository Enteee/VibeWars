/**
 * What each employee of the company is allowed to do on GitHub.
 *
 * This file is the only thing standing between an autonomous agent and
 * `main`. Branch protection is unavailable on this repository's plan
 * ("Upgrade to GitHub Pro or make this repository public"), so GitHub will
 * happily let any token with `repo` push to `main`, merge an unreviewed pull
 * request, or delete a branch. The kanban rules — only QA merges, only the
 * reviewers approve, only the manager restructures the board — are therefore
 * not conventions that agents are asked to respect. They are enforced here,
 * before any credential is touched.
 *
 * Which is why it is a pure function with tests rather than a pile of `if`s
 * inside the daemon: every rule below is a failure mode somebody can assert
 * against. See docs/adr/0015-agent-company.md.
 *
 * Two things that are deliberately NOT decided here, because they need the
 * network and this must stay pure:
 *
 *   - whether a pull request's checks are green
 *   - whether the required reviews exist
 *
 * `authorize` returns those as named `guards` for hubd.mjs to evaluate. A
 * guard it does not recognise must be treated as a refusal, so that adding a
 * guard here can never silently widen what is permitted.
 */

/** The nine employees. Order is the org chart, roughly. */
export const ROLES = [
  "manager",
  "architect",
  "developer-1",
  "developer-2",
  "asset-designer",
  "cicd-engineer",
  "lead-dev",
  "perf-sec-qa",
  "qa-tester",
];

/** Roles that implement and therefore push branches and open pull requests. */
const IMPLEMENTERS = [
  "developer-1",
  "developer-2",
  "asset-designer",
  "cicd-engineer",
  "perf-sec-qa",
];

/** Roles that review code. Note: neither may merge. */
const REVIEWERS = ["lead-dev", "perf-sec-qa"];

/**
 * Paths whose contents define the automated quality gates. A change here can
 * make every downstream check pass by deleting the check, so pushes touching
 * them are tagged in the audit log and the reviewers are told to look harder.
 */
export const GATE_PATHS = [
  ".github/workflows/",
  "eslint.config.mjs",
  ".prettierrc.json",
  ".markdownlint.jsonc",
  "vitest.config.ts",
  "devenv.nix",
  "playwright.config.ts",
  "scripts/bots/hub-policy.mjs",
];

/**
 * `gh api` is a hole straight through every rule in this file — `gh api
 * repos/o/r/merges` merges, `gh api --method DELETE` deletes. It is refused
 * for everyone except the one role that genuinely has no subcommand for its
 * job (GitHub Environments), and then only under these path prefixes.
 *
 * @type {Record<string, string[] | undefined>}
 */
const API_ALLOWLIST = {
  "cicd-engineer": ["repos/{owner}/{repo}/environments", "repos/{owner}/{repo}/deployments"],
};

/**
 * The allowlist, as data.
 *
 * `argv` is matched as a prefix, so `["pr", "view"]` matches
 * `gh pr view 22 --json state` but NOT `gh pr merge`. Read verbs are
 * enumerated one by one on purpose: a blanket `["pr"]` read rule would also
 * match `pr merge`, which is exactly the mistake this table exists to avoid.
 *
 * @type {{ argv: string[], roles: string[] | "*", guards?: string[] }[]}
 */
const RULES = [
  /* ---- reading. Everyone needs to see the state of the world. ---------- */
  { argv: ["issue", "view"], roles: "*" },
  { argv: ["issue", "list"], roles: "*" },
  { argv: ["pr", "view"], roles: "*" },
  { argv: ["pr", "list"], roles: "*" },
  { argv: ["pr", "diff"], roles: "*" },
  { argv: ["pr", "checks"], roles: "*" },
  // Not `pr status`: it prints free text that includes pull requests from
  // strangers asking this account for review, which hubd cannot filter. See
  // hub-visibility.mjs; `pr list --author @me` covers the same need.
  { argv: ["pr", "status"], roles: [] },
  { argv: ["project", "view"], roles: "*" },
  { argv: ["project", "list"], roles: "*" },
  { argv: ["project", "item-list"], roles: "*" },
  { argv: ["project", "field-list"], roles: "*" },
  { argv: ["label", "list"], roles: "*" },
  { argv: ["release", "list"], roles: "*" },
  { argv: ["release", "view"], roles: "*" },
  // A developer must be able to read why its own pipeline failed, or it
  // cannot do the job it is given.
  { argv: ["run", "list"], roles: "*" },
  { argv: ["run", "view"], roles: "*" },
  { argv: ["run", "watch"], roles: "*" },
  { argv: ["workflow", "list"], roles: "*" },
  { argv: ["workflow", "view"], roles: "*" },

  /* ---- commenting. Everyone can talk on an issue or a PR. -------------- */
  { argv: ["issue", "comment"], roles: "*" },
  { argv: ["pr", "comment"], roles: "*" },

  /* ---- the manager runs the backlog and the board. --------------------- */
  { argv: ["issue", "create"], roles: ["manager", "architect"] },
  { argv: ["issue", "edit"], roles: ["manager", "architect"] },
  { argv: ["issue", "close"], roles: ["manager"] },
  { argv: ["issue", "reopen"], roles: ["manager"] },
  { argv: ["issue", "pin"], roles: ["manager"] },
  { argv: ["issue", "transfer"], roles: [] },
  { argv: ["issue", "delete"], roles: [] },
  { argv: ["label", "create"], roles: ["manager"] },
  { argv: ["label", "edit"], roles: ["manager"] },

  /* ---- the board. Reads are above; these are the mutations. ------------ */
  { argv: ["project", "item-add"], roles: ["manager"] },
  { argv: ["project", "item-create"], roles: ["manager"] },
  { argv: ["project", "item-archive"], roles: ["manager"] },
  { argv: ["project", "field-create"], roles: ["manager"] },
  { argv: ["project", "edit"], roles: ["manager"] },
  { argv: ["project", "create"], roles: ["manager"] },
  { argv: ["project", "close"], roles: [] },
  { argv: ["project", "delete"], roles: [] },
  // Moving a card is the one board mutation the workflow roles must do
  // themselves, since each hand-off is a column change.
  {
    argv: ["project", "item-edit"],
    roles: [
      "manager",
      "developer-1",
      "developer-2",
      "asset-designer",
      "cicd-engineer",
      "lead-dev",
      "perf-sec-qa",
      "qa-tester",
    ],
  },

  /* ---- opening work. --------------------------------------------------- */
  { argv: ["pr", "create"], roles: IMPLEMENTERS },
  { argv: ["pr", "edit"], roles: IMPLEMENTERS },
  { argv: ["pr", "ready"], roles: IMPLEMENTERS },

  /* ---- reviewing. ------------------------------------------------------
     `gh pr review` is refused for EVERY role, which looks wrong until you
     notice that all nine agents share one GitHub identity: hubd holds a
     single token and `gh api user` is `Enteee` for all of them. Two
     consequences, neither avoidable:

       - GitHub refuses to let an account approve its own pull request, and
         every pull request here is authored by that same account.
       - GitHub counts one review per user, so "two approving reviews" is
         unsatisfiable no matter who asks for it.

     So role approvals cannot live in GitHub's review system. They live in
     hub's own ledger instead (request kind "review"), mirrored to a PR
     comment so a human reading the pull request still sees who signed off.
     See authorizeReview below. */
  {
    argv: ["pr", "review"],
    roles: [],
  },

  /* ---- merging. The single most consequential action in the company. --- */
  {
    argv: ["pr", "merge"],
    roles: ["qa-tester"],
    guards: ["checks-green", "approved-by:lead-dev", "approved-by:perf-sec-qa"],
  },

  /* ---- pipeline and delivery. ------------------------------------------ */
  { argv: ["run", "rerun"], roles: ["cicd-engineer"] },
  { argv: ["run", "cancel"], roles: ["cicd-engineer"] },
  { argv: ["workflow", "run"], roles: ["cicd-engineer"] },
  { argv: ["workflow", "enable"], roles: ["cicd-engineer"] },
  { argv: ["workflow", "disable"], roles: ["cicd-engineer"] },
  { argv: ["release", "create"], roles: ["cicd-engineer"] },
  { argv: ["release", "edit"], roles: ["cicd-engineer"] },
  { argv: ["release", "delete"], roles: [] },
];

/**
 * Flags that retarget a command at another repository. hubd pins the
 * repository itself, so these are refused rather than merged with — a
 * conflicting `--repo` would otherwise either be silently ignored or let an
 * agent operate somewhere nobody is watching.
 */
const REPO_FLAGS = new Set(["-R", "--repo"]);

/**
 * @param {string[]} argv
 * @param {string[]} prefix
 * @returns {boolean}
 */
function matchesPrefix(argv, prefix) {
  return prefix.every((word, index) => argv[index] === word);
}

/**
 * @param {string} role
 * @param {string[] | "*"} roles
 * @returns {boolean}
 */
function permits(roles, role) {
  return roles === "*" || roles.includes(role);
}

/**
 * Roles one role is temporarily covering for.
 *
 * A company short of bots can have one agent wear several hats. This is a
 * real loss and worth naming: the three approval gates exist so that the role
 * holding the merge button cannot manufacture the approvals that unlock it,
 * and an agent covering both reviewer seats and the merge seat is
 * self-certifying. It is the operator's call to make, not ours to refuse, but
 * it must be visible rather than quietly folded into the policy.
 *
 * Two things keep it honest. The delegation is data, not a change to the
 * table below — so the base policy stays the thing we test. And hubd only
 * honours a hat whose real wearer is **not hired yet**, so the override
 * expires on its own the moment the proper bot comes online; nobody has to
 * remember to take it back.
 *
 * Sign-off under a borrowed hat has to be explicit — `hub approve 22 --as
 * perf-sec-qa` — so the ledger still records two distinct reviews and the
 * agent has to actually do both passes rather than one glance counting twice.
 *
 * @param {string} role
 * @param {{ kind: string, argv: string[] }} request
 * @param {{ acting?: string[] }} [options]
 * @returns {{ allow: boolean, reason?: string, guards?: string[], as?: string }}
 */
export function authorize(role, request, options = {}) {
  const direct = authorizeAs(role, request);
  if (direct.allow) {
    return direct;
  }

  for (const hat of options.acting ?? []) {
    const borrowed = authorizeAs(hat, request);
    if (borrowed.allow) {
      return { ...borrowed, as: hat };
    }
  }
  return direct;
}

/**
 * @param {string} role
 * @param {{ kind: string, argv: string[] }} request
 * @returns {{ allow: boolean, reason?: string, guards?: string[] }}
 */
function authorizeAs(role, request) {
  if (!ROLES.includes(role)) {
    return { allow: false, reason: `unknown role "${role}"` };
  }
  const argv = Array.isArray(request.argv) ? request.argv : [];

  if (request.kind === "push") {
    return authorizePush(role, argv);
  }
  if (request.kind === "review") {
    return authorizeReview(role, argv);
  }
  if (request.kind !== "gh") {
    return { allow: false, reason: `unknown request kind "${request.kind}"` };
  }
  if (argv.length === 0) {
    return { allow: false, reason: "empty command" };
  }

  for (const word of argv) {
    if (REPO_FLAGS.has(word)) {
      return {
        allow: false,
        reason: `${word} is not yours to set; hub always targets the company repository`,
      };
    }
  }

  if (argv[0] === "api") {
    return authorizeApi(role, argv);
  }

  // Longest matching prefix wins, so a specific rule always beats a general
  // one regardless of the order they are written in above.
  /** @type {{ argv: string[], roles: string[] | "*", guards?: string[] } | null} */
  let best = null;
  for (const rule of RULES) {
    if (matchesPrefix(argv, rule.argv) && (best === null || rule.argv.length > best.argv.length)) {
      best = rule;
    }
  }

  if (best === null) {
    return {
      allow: false,
      reason: `"gh ${argv.slice(0, 2).join(" ")}" is not on any role's allowlist`,
    };
  }
  if (!permits(best.roles, role)) {
    return {
      allow: false,
      reason: `role "${role}" may not run "gh ${best.argv.join(" ")}"`,
    };
  }
  return best.guards === undefined ? { allow: true } : { allow: true, guards: best.guards };
}

/**
 * @param {string} role
 * @param {string[]} argv
 * @returns {{ allow: boolean, reason?: string }}
 */
function authorizeApi(role, argv) {
  const allowed = API_ALLOWLIST[role];
  if (allowed === undefined) {
    return { allow: false, reason: `role "${role}" may not use "gh api"` };
  }
  const path = argv[1];
  if (path === undefined) {
    return { allow: false, reason: "gh api with no path" };
  }
  if (!allowed.some((prefix) => path.startsWith(prefix))) {
    return {
      allow: false,
      reason: `"gh api ${path}" is outside the paths role "${role}" may touch`,
    };
  }
  return { allow: true };
}

/**
 * Sign-off, recorded in hub's ledger rather than GitHub's review system,
 * because one shared identity cannot cast two distinguishable reviews.
 *
 * Only the two reviewers may record a verdict, and `qa-tester` — the role
 * that merges — deliberately cannot, so that the role holding the merge
 * button cannot also manufacture the approvals that unlock it.
 *
 * @param {string} role
 * @param {string[]} argv `[verb, pr]`
 * @returns {{ allow: boolean, reason?: string }}
 */
function authorizeReview(role, argv) {
  if (!REVIEWERS.includes(role)) {
    return { allow: false, reason: `role "${role}" does not record review verdicts` };
  }
  const [verb, pr] = argv.filter((word) => word !== "--as" && !REVIEWERS.includes(word));
  if (verb !== "approve" && verb !== "request-changes") {
    return { allow: false, reason: `unknown review verdict "${String(verb)}"` };
  }
  if (pr === undefined || !/^[0-9]+$/.test(pr)) {
    return { allow: false, reason: "a review needs a pull request number" };
  }
  return { allow: true };
}

/**
 * A push is the one operation that can rewrite shared history, so it is
 * checked by shape rather than by allowlist.
 *
 * @param {string} role
 * @param {string[]} argv `[branch, ...flags]`
 * @returns {{ allow: boolean, reason?: string }}
 */
function authorizePush(role, argv) {
  if (!IMPLEMENTERS.includes(role)) {
    return { allow: false, reason: `role "${role}" does not push branches` };
  }

  const [branch, ...flags] = argv;
  if (branch === undefined || branch === "") {
    return { allow: false, reason: "push with no branch" };
  }

  // Refused for every role, including qa-tester. Merging happens through
  // `gh pr merge`, which is GitHub's own squash/fast-forward path and leaves
  // a reviewable record; a local push to main leaves none.
  if (branch === "main" || branch === "HEAD" || branch.startsWith("refs/heads/main")) {
    return { allow: false, reason: "nobody pushes to main; merge through a pull request" };
  }

  const mine = `bot/${role}/`;
  if (!branch.startsWith(mine)) {
    return {
      allow: false,
      reason: `role "${role}" may only push branches under ${mine}`,
    };
  }

  // A colon in a refspec means "push this local ref to that remote ref",
  // which would let any of the above be sidestepped entirely.
  if (branch.includes(":")) {
    return { allow: false, reason: "explicit refspecs are not allowed; push a branch name" };
  }

  for (const flag of flags) {
    if (/^(-f|--force|--force-with-lease|--mirror|--prune|--delete|-d)$/.test(flag)) {
      return { allow: false, reason: `${flag} is never allowed` };
    }
  }
  return { allow: true };
}

/**
 * Does this set of changed paths touch the definition of a quality gate?
 *
 * Used for the audit log rather than for refusal: the CI/CD engineer is
 * supposed to change these files. The point is that weakening a check is
 * visible in one `grep` afterwards instead of being indistinguishable from
 * ordinary work.
 *
 * @param {string[]} paths
 * @returns {boolean}
 */
export function touchesGate(paths) {
  return paths.some((path) => GATE_PATHS.some((gate) => path === gate || path.startsWith(gate)));
}
