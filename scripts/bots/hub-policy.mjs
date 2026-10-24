/**
 * What each employee of the company is allowed to do on GitHub.
 *
 * GitHub's ruleset on `main` covers the mechanical invariants (no direct
 * push, CI must pass), but all ten agents share one GitHub identity, so it
 * cannot tell them apart. The kanban rules — only QA merges, only the
 * reviewers approve, only the manager restructures the board — are
 * therefore not conventions that agents are asked to respect. They are
 * enforced here, before any credential is touched.
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

import { shortFlag } from "./hub-filter.mjs";
import { SUPPORT } from "./protocol.mjs";

/**
 * The ten employees. Order is the org chart, roughly; support, the one
 * that talks to people outside the company (#131), comes last.
 */
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
  SUPPORT,
];

/**
 * Everyone but support. Support reads what everyone reads, but its only
 * write is a new, labelled issue: it is the one role driven by strangers,
 * so it gets no voice on existing work (#131).
 */
const STAFF = ROLES.filter((role) => role !== SUPPORT);

/** The label every issue support files must carry, so each is visibly a user's. */
export const SUPPORT_LABEL = "support";

/** Roles that implement and therefore push branches and open pull requests. */
const IMPLEMENTERS = [
  "developer-1",
  "developer-2",
  "asset-designer",
  "cicd-engineer",
  "perf-sec-qa",
];

/**
 * Roles that push only one kind of file, and where. The manager writes the
 * company's skills and nothing else (#27): its pushes carry a guard that
 * hubd checks against the branch's actual changes.
 *
 * @type {Readonly<Record<string, string | undefined>>}
 */
export const PUSH_SCOPES = { manager: ".claude/bots/skills/" };

/**
 * Paths only some roles may change, and which (#116). A workflow, or a
 * local action a workflow runs, executes as the same GitHub Actions app as
 * real CI: pushed on a side branch nobody reviews, it could post a passing
 * check run for another pull request's head. Every other role's pushes
 * carry a `paths-outside:` guard that hubd checks against the branch's
 * actual changes.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const RESTRICTED_PATHS = {
  ".github/workflows/": ["cicd-engineer"],
  ".github/actions/": ["cicd-engineer"],
};

/** Who may open and edit pull requests: whoever may push. */
const PR_OPENERS = [...IMPLEMENTERS, ...Object.keys(PUSH_SCOPES)];

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
  "scripts/bots/hubd.mjs",
  "scripts/bots/hub-guards.mjs",
  "scripts/bots/hub-filter.mjs",
  "scripts/bots/hub-budget.mjs",
  "scripts/bots/hub-rest.mjs",
  "scripts/bots/hub-visibility.mjs",
  "scripts/bots/protocol.mjs",
  "scripts/bots/git-hardening.mjs",
  "scripts/bots/reboot.mjs",
  "scripts/bots/restart.mjs",
  "scripts/bots/supervisor.mjs",
  "scripts/bots/hub.mjs",
  "nix/claude-bot.nix",
  "nix/claude-llc.nix",
  ".github/CODEOWNERS",
  // The briefings and skills: instructions to every agent, so a bad one can
  // tell them to skip a gate (#27).
  ".claude/bots/",
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

  /* ---- commenting. Everyone on staff can talk on an issue or a PR. ----- */
  { argv: ["issue", "comment"], roles: STAFF },
  { argv: ["pr", "comment"], roles: STAFF },

  /* ---- the manager runs the backlog and the board. --------------------- */
  // Support files users' reports, labelled (see `supportCreate`).
  { argv: ["issue", "create"], roles: ["manager", "architect", SUPPORT] },
  { argv: ["issue", "edit"], roles: ["manager", "architect"] },
  { argv: ["issue", "close"], roles: ["manager"] },
  { argv: ["issue", "reopen"], roles: ["manager"] },
  // Superseded pull requests: closed with a comment naming the replacement,
  // never with --delete-branch (see `deletesBranch`).
  { argv: ["pr", "close"], roles: ["manager"] },
  { argv: ["pr", "reopen"], roles: ["manager"] },
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
  { argv: ["pr", "create"], roles: PR_OPENERS },
  { argv: ["pr", "edit"], roles: PR_OPENERS },
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
 * Flags that retarget a command at another repository, or the board at
 * another owner. hubd pins both itself, so these are refused rather than
 * merged with — a conflicting `--repo` would otherwise either be silently
 * ignored or let an agent operate somewhere nobody is watching.
 */
const RETARGET_FLAGS = { long: ["--repo", "--owner"], short: "R" };

/**
 * @param {string} word
 * @returns {boolean} whether it retargets the repository, in any spelling
 */
function isRepoFlag(word) {
  if (word.startsWith("--")) {
    return RETARGET_FLAGS.long.some((flag) => word === flag || word.startsWith(`${flag}=`));
  }
  return shortFlag(word, (letter) => RETARGET_FLAGS.short.includes(letter)) !== null;
}

/**
 * Flags with which gh reads a file. gh runs on the host, outside every jail,
 * so a path here is a path on the host: `--body-file ~/.ssh/id_ed25519`
 * would post a private key as a public comment (#26). `hub` reads
 * `--body-file` inside the sandbox and sends `--body` instead, so agents
 * keep the convenience; anything that still names a file is refused.
 *
 * Keyed by `<group> <subcommand>`; long flags match exactly or with `=`,
 * short ones are letters, found anywhere in a cluster as gh would find them
 * (`-eF/etc/passwd` is `-e -F /etc/passwd`).
 *
 * @type {Record<string, { long: string[], short: string } | undefined>}
 */
const FILE_FLAGS = {
  "issue create": { long: ["--body-file", "--recover"], short: "F" },
  "issue comment": { long: ["--body-file"], short: "F" },
  "issue edit": { long: ["--body-file"], short: "F" },
  "pr create": { long: ["--body-file", "--template", "--recover"], short: "FT" },
  "pr comment": { long: ["--body-file"], short: "F" },
  "pr edit": { long: ["--body-file"], short: "F" },
  "pr merge": { long: ["--body-file"], short: "F" },
  "release create": { long: ["--notes-file"], short: "F" },
  "release edit": { long: ["--notes-file"], short: "F" },
  api: { long: ["--input"], short: "" },
};

/**
 * The flags of `release create` that take a value, so that the value is not
 * mistaken for an asset. Missing one here refuses a release; it can never
 * let an asset through.
 */
const RELEASE_VALUE_FLAGS = {
  long: [
    "--title",
    "--notes",
    "--notes-file",
    "--target",
    "--discussion-category",
    "--notes-start-tag",
  ],
  short: "tnF",
};

/**
 * @param {string[]} argv
 * @returns {string | null} why the command would read a host file, if it would
 */
function readsHostFile(argv) {
  const key = argv[0] === "api" ? "api" : `${argv[0] ?? ""} ${argv[1] ?? ""}`;
  const flags = FILE_FLAGS[key];
  if (flags !== undefined) {
    for (const word of argv) {
      const long = flags.long.find((flag) => word === flag || word.startsWith(`${flag}=`));
      const short = word.startsWith("--")
        ? null
        : shortFlag(word, (letter) => flags.short.includes(letter));
      if (long !== undefined || short !== null) {
        const flag = long ?? `-${short?.letter ?? ""}`;
        return `${flag} reads a file on the host, outside your sandbox. Use --body (hub turns --body-file into it for you).`;
      }
    }
  }
  if (key === "api" || key === "workflow run") {
    // `-F key=@file` and `--field key=@file` read the file as the value, on
    // both commands that take typed fields.
    for (let i = 0; i < argv.length; i += 1) {
      const word = argv[i] ?? "";
      const short = word.startsWith("--") ? null : shortFlag(word, (letter) => letter === "F");
      const value =
        word === "--field"
          ? argv[i + 1]
          : word.startsWith("--field=")
            ? word.slice("--field=".length)
            : short !== null
              ? (short.glued ?? argv[i + 1])
              : undefined;
      if (value?.includes("=@") === true) {
        return "a field value of @file reads a file on the host, outside your sandbox";
      }
    }
  }
  if (key === "release create" && releasePositionals(argv.slice(2)) > 1) {
    // Positionals after the tag are asset files to upload, from the host.
    return "release assets are files on the host; upload them from CI instead";
  }
  return null;
}

/**
 * @param {string[]} words the words after `release create`
 * @returns {number} how many of them gh reads as positionals: the tag, then assets
 */
function releasePositionals(words) {
  let count = 0;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? "";
    if (word.startsWith("--")) {
      if (!word.includes("=") && RELEASE_VALUE_FLAGS.long.includes(word)) {
        i += 1;
      }
    } else if (/^-./.test(word)) {
      const short = shortFlag(word, (letter) => RELEASE_VALUE_FLAGS.short.includes(letter));
      if (short !== null && short.glued === null) {
        i += 1;
      }
    } else {
      count += 1;
    }
  }
  return count;
}

/**
 * The words of a `pr merge` request, or why they are not acceptable.
 *
 * The merge guard and gh must agree on which pull request is being merged,
 * so the target is exactly one positional, a number: no URL, no branch,
 * nothing a second parser could read differently (#26). And only the flags
 * a squash merge needs are allowed: `--auto` would merge later, after the
 * guards stopped looking; `--admin` would bypass the ruleset.
 *
 * @param {string[]} argv `["pr", "merge", ...]`
 * @returns {{ pr: number, flags: string[] } | { error: string }}
 */
export function parseMerge(argv) {
  const words = argv.slice(2);
  /** @type {string[]} */
  const positional = [];
  /** @type {string[]} */
  const flags = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? "";
    if (!word.startsWith("-")) {
      positional.push(word);
      continue;
    }
    const name = word.includes("=") ? word.slice(0, word.indexOf("=")) : word;
    if (name === "--squash" || name === "-s") {
      if (word !== name) {
        return { error: `${word}: --squash takes no value` };
      }
      flags.push("--squash");
      continue;
    }
    if (["--subject", "-t", "--body", "-b"].includes(name)) {
      const value = word === name ? words[(i += 1)] : word.slice(name.length + 1);
      if (value === undefined) {
        return { error: `${name} needs a value` };
      }
      flags.push(name.startsWith("--") ? name : name === "-t" ? "--subject" : "--body", value);
      continue;
    }
    return {
      error: `${word} is not allowed on a merge; only --squash, --subject and --body are`,
    };
  }
  if (positional.length !== 1 || !/^[0-9]+$/.test(positional[0] ?? "")) {
    return { error: "a merge names exactly one pull request, by number" };
  }
  return { pr: Number(positional[0]), flags };
}

/**
 * Whether a `pr close` would also delete the branch. A branch is a
 * developer's work, and closing a pull request is not a decision to throw
 * it away. Read as gh reads flags: `--delete-branch` in any spelling, and
 * `d` anywhere in a short cluster (`-cd`), erring on the side of refusing.
 *
 * @param {string[]} argv `["pr", "close", ...]`
 * @returns {boolean}
 */
function deletesBranch(argv) {
  return argv
    .slice(2)
    .some((word) =>
      word.startsWith("--")
        ? word === "--delete-branch" || word.startsWith("--delete-branch=")
        : shortFlag(word, (letter) => letter === "d") !== null,
    );
}

/**
 * Who to ask instead, for a refusal: a refused agent should not have to
 * guess whose job the thing it tried is.
 *
 * @param {string[]} roles
 * @returns {string}
 */
function whoMay(roles) {
  return roles.length === 0 ? "no role may" : `ask the ${roles.join(" or the ")}`;
}

/**
 * The words of a review verdict: `<verb> <pr> --sha <commit> [--as <seat>]
 * [note...]`.
 *
 * `--sha` is the commit the reviewer read. hubd records it and refuses the
 * verdict unless it is still the pull request's head, so a commit pushed
 * between reading and approving is never approved unseen (#26, item 6).
 *
 * @param {string[]} argv
 * @returns {{ verb: string, pr: string, sha: string | null, seat: string | null, note: string[] }}
 */
export function parseReview(argv) {
  const [verb = "", pr = "", ...rest] = argv;
  /** @type {string | null} */
  let sha = null;
  /** @type {string | null} */
  let seat = null;
  /** @type {string[]} */
  const note = [];
  for (let i = 0; i < rest.length; i += 1) {
    const word = rest[i] ?? "";
    if (word === "--sha" || word === "--as") {
      const value = rest[(i += 1)] ?? null;
      if (word === "--sha") {
        sha = value;
      } else {
        seat = value;
      }
    } else if (word.startsWith("--sha=")) {
      sha = word.slice("--sha=".length);
    } else if (word.startsWith("--as=")) {
      seat = word.slice("--as=".length);
    } else {
      note.push(word);
    }
  }
  return { verb, pr, sha, seat, note };
}

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
 * table below — so the base policy stays the thing we test. And it is
 * written down in `company.json`, where the operator gives it and takes it
 * back; nothing grants or revokes a hat on its own.
 *
 * Sign-off under a borrowed hat has to be explicit — `hub approve 22 --sha
 * <commit> --as perf-sec-qa` — so the ledger still records two distinct
 * reviews and the agent has to actually do both passes rather than one
 * glance counting twice.
 *
 * @param {string} role
 * @param {{ kind: string, argv: string[] }} request
 * @param {{ acting?: string[] }} [options]
 * @returns {{ allow: boolean, reason?: string, guards?: string[], as?: string }}
 */
export function authorize(role, request, options = {}) {
  const acting = options.acting ?? [];
  const direct = authorizeAs(role, request, acting);
  if (direct.allow) {
    return direct;
  }

  for (const hat of acting) {
    const borrowed = authorizeAs(hat, request, acting);
    if (borrowed.allow) {
      return { ...borrowed, as: hat };
    }
  }
  return direct;
}

/**
 * @param {string} role
 * @param {{ kind: string, argv: string[] }} request
 * @param {string[]} acting the hats the requesting role holds
 * @returns {{ allow: boolean, reason?: string, guards?: string[] }}
 */
function authorizeAs(role, request, acting) {
  if (!ROLES.includes(role)) {
    return { allow: false, reason: `unknown role "${role}"` };
  }
  const argv = Array.isArray(request.argv) ? request.argv : [];

  if (request.kind === "push") {
    return authorizePush(role, argv);
  }
  if (request.kind === "review") {
    return authorizeReview(role, argv, acting);
  }
  if (request.kind === "reboot") {
    return authorizeReboot(role, argv);
  }
  if (request.kind !== "gh") {
    return { allow: false, reason: `unknown request kind "${request.kind}"` };
  }
  if (argv.length === 0) {
    return { allow: false, reason: "empty command" };
  }

  for (const word of argv) {
    if (isRepoFlag(word)) {
      return {
        allow: false,
        reason: `${word} is not yours to set; hub always targets the company repository`,
      };
    }
    // After `--`, gh stops reading flags, so a word hub checked as a value
    // could be read by gh as something else.
    if (word === "--") {
      return { allow: false, reason: '"--" is not allowed; hub reads every word as gh would' };
    }
  }
  const fileRead = readsHostFile(argv);
  if (fileRead !== null) {
    return { allow: false, reason: fileRead };
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
  if (best.roles !== "*" && !permits(best.roles, role)) {
    return {
      allow: false,
      reason: `role "${role}" may not run "gh ${best.argv.join(" ")}"; ${whoMay(best.roles)}`,
    };
  }
  if (best.argv.join(" ") === "pr close" && deletesBranch(argv)) {
    return {
      allow: false,
      reason: "--delete-branch is not allowed: close the pull request and leave its branch",
    };
  }
  if (best.argv.join(" ") === "pr merge") {
    const merge = parseMerge(argv);
    if ("error" in merge) {
      return { allow: false, reason: merge.error };
    }
  }
  // A role scoped to one kind of file opens pull requests for its own
  // branches only, which are the only ones its guard has checked.
  if (best.argv.join(" ") === "pr create" && PUSH_SCOPES[role] !== undefined) {
    // Exactly one: gh takes the last of several, so checking any one of
    // them would let a second --head name a branch nobody checked.
    const heads = headsOf(argv.slice(best.argv.length));
    if (heads?.length !== 1 || heads[0]?.startsWith(`bot/${role}/`) !== true) {
      const flags = [...SCOPED_CREATE_FLAGS.keys()].join(", ");
      return {
        allow: false,
        reason: `role "${role}" opens pull requests only with one --head bot/${role}/<branch>, and only these flags, unclustered: ${flags}`,
      };
    }
  }
  if (best.argv.join(" ") === "issue create" && role === SUPPORT) {
    const refused = refuseSupportCreate(argv.slice(best.argv.length));
    if (refused !== null) {
      return { allow: false, reason: refused };
    }
  }
  return best.guards === undefined ? { allow: true } : { allow: true, guards: best.guards };
}

/**
 * The `gh issue create` flags support may pass, by long name, and their
 * shorthand. All take a value. `--body-file` is not among them because hub
 * has already turned it into `--body` by the time a request gets here.
 */
const SUPPORT_CREATE_FLAGS = new Map([
  ["--title", "t"],
  ["--body", "b"],
  ["--label", "l"],
]);

/**
 * Why support may not file this issue, or `null` if it may. Every issue
 * support files carries SUPPORT_LABEL, so one a user talked it into is
 * plainly marked as a user's. Read the way `headsOf` reads a scoped pull
 * request: every word must be one of SUPPORT_CREATE_FLAGS or its value,
 * and clusters are refused, because a parser that disagrees with gh's about
 * which word is a label is a way to file one unlabelled.
 *
 * @param {string[]} argv the words after `issue create`
 * @returns {string | null}
 */
function refuseSupportCreate(argv) {
  const usage =
    `support files issues with only --title, --body and --label, unclustered, ` +
    `and always --label ${SUPPORT_LABEL}`;
  /** @type {string[]} */
  const labels = [];
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i] ?? "";
    /** @type {string | undefined} */
    let name;
    /** @type {string | undefined} */
    let inline;
    if (word.startsWith("--")) {
      const eq = word.indexOf("=");
      name = eq === -1 ? word : word.slice(0, eq);
      inline = eq === -1 ? undefined : word.slice(eq + 1);
    } else if (word.startsWith("-") && word.length >= 2) {
      const letter = word.slice(1, 2);
      name = [...SUPPORT_CREATE_FLAGS].find(([, short]) => short === letter)?.[0];
      // gh reads `-lx` and `-l=x` alike.
      inline = word.length > 2 ? word.slice(2).replace(/^=/, "") : undefined;
    }
    if (name === undefined || !SUPPORT_CREATE_FLAGS.has(name)) {
      return usage;
    }
    const value = inline ?? argv[(i += 1)];
    if (value === undefined) {
      return usage;
    }
    if (name === "--label") {
      // gh splits a label list on commas: `--label bug,support` is two.
      labels.push(...value.split(",").map((label) => label.trim()));
    }
  }
  return labels.includes(SUPPORT_LABEL) ? null : usage;
}

/**
 * The `gh pr create` flags a scoped role may pass, by long name: their
 * shorthand, and whether they take a value.
 */
const SCOPED_CREATE_FLAGS = new Map([
  ["--head", { short: "H", value: true }],
  ["--title", { short: "t", value: true }],
  ["--body", { short: "b", value: true }],
  ["--base", { short: "B", value: true }],
  ["--label", { short: "l", value: true }],
  ["--draft", { short: "d", value: false }],
]);

/**
 * Every branch a scoped role's `gh pr create` names with --head / -H, read
 * the way gh's flag parser reads them, or null for anything this cannot
 * read exactly that way. Scanning for --head is not enough: gh takes the
 * last of several, a flag's value is consumed whatever it looks like (so
 * `--title --head=x` names no head), and `-dH x` is a head in a cluster.
 * So every word must be a known flag or its value, and clusters of
 * shorthands are refused rather than parsed.
 *
 * @param {string[]} argv the words after `pr create`
 * @returns {string[] | null}
 */
function headsOf(argv) {
  /** @type {string[]} */
  const heads = [];
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i] ?? "";
    /** @type {string | undefined} */
    let name;
    /** @type {string | undefined} */
    let inline;
    if (word.startsWith("--")) {
      const eq = word.indexOf("=");
      name = eq === -1 ? word : word.slice(0, eq);
      inline = eq === -1 ? undefined : word.slice(eq + 1);
    } else if (word.startsWith("-") && word.length >= 2) {
      const letter = word.slice(1, 2);
      name = [...SCOPED_CREATE_FLAGS].find(([, flag]) => flag.short === letter)?.[0];
      // gh reads `-Hx` and `-H=x` alike.
      inline = word.length > 2 ? word.slice(2).replace(/^=/, "") : undefined;
    }
    const flag = name === undefined ? undefined : SCOPED_CREATE_FLAGS.get(name);
    if (flag === undefined) {
      return null;
    }
    /** @type {string | undefined} */
    let value;
    if (flag.value) {
      value = inline ?? argv[i + 1];
      if (inline === undefined) {
        i += 1;
      }
      if (value === undefined) {
        return null;
      }
    } else if (inline !== undefined) {
      return null;
    }
    if (name === "--head" && value !== undefined) {
      heads.push(value);
    }
  }
  return heads;
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
  // A prefix check means nothing if the path can climb back out of it.
  if (/\.\.|%2e/i.test(path)) {
    return { allow: false, reason: `"gh api ${path}": no ".." in an API path` };
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
 * A verdict may be cast for a seat other than the role's own only when that
 * seat is a reviewer's and the role is covering for it (`acting`), so a
 * self-review stays visible in the ledger as "lead-dev acting as
 * perf-sec-qa" and can never be cast for a seat nobody handed over (#26).
 *
 * @param {string} role
 * @param {string[]} argv see `parseReview`
 * @param {string[]} acting
 * @returns {{ allow: boolean, reason?: string }}
 */
function authorizeReview(role, argv, acting) {
  if (!REVIEWERS.includes(role)) {
    return { allow: false, reason: `role "${role}" does not record review verdicts` };
  }
  const { verb, pr, sha, seat } = parseReview(argv);
  if (verb !== "approve" && verb !== "request-changes") {
    return { allow: false, reason: `unknown review verdict "${verb}"` };
  }
  if (!/^[0-9]+$/.test(pr)) {
    return { allow: false, reason: "a review needs a pull request number" };
  }
  if (sha === null || !/^[0-9a-f]{7,40}$/.test(sha)) {
    return {
      allow: false,
      reason:
        "a verdict names the commit you reviewed: --sha <sha> " +
        "(hub pr view <pr> --json headRefOid when you start reading)",
    };
  }
  if (seat !== null && seat !== role && !(acting.includes(seat) && REVIEWERS.includes(seat))) {
    return { allow: false, reason: `you do not hold the "${seat}" seat` };
  }
  return { allow: true };
}

/**
 * A company reboot (#21): `["request", reason]` and `["abort"]` are the
 * manager's, who decides when the company is quiet enough to stop; the
 * operator acts on the host directly and needs no permission from here.
 * `["ready"]` is everyone's: it is how an agent says its work is saved.
 * Whether a reboot is warranted right now is hubd's to decide: that needs
 * the network.
 *
 * @param {string} role
 * @param {string[]} argv
 * @returns {{ allow: boolean, reason?: string }}
 */
function authorizeReboot(role, argv) {
  const [verb, reason, ...rest] = argv;
  if (verb === "ready" && reason === undefined) {
    return { allow: true };
  }
  if (verb !== "request" && verb !== "abort") {
    return {
      allow: false,
      reason: 'usage: company reboot "<reason>" | company reboot --abort | company ready',
    };
  }
  if (role !== "manager") {
    return { allow: false, reason: "only the manager reboots the company" };
  }
  if (verb === "abort" && reason === undefined) {
    return { allow: true };
  }
  if (verb === "request" && reason !== undefined && reason.trim() !== "" && rest.length === 0) {
    return { allow: true };
  }
  return { allow: false, reason: 'usage: company reboot "<reason>" | company reboot --abort' };
}

/**
 * A push is the one operation that can rewrite shared history, so it is
 * checked by shape rather than by allowlist.
 *
 * @param {string} role
 * @param {string[]} argv `[branch, ...flags]`
 * @returns {{ allow: boolean, reason?: string, guards?: string[] }}
 */
function authorizePush(role, argv) {
  const scope = PUSH_SCOPES[role];
  if (!IMPLEMENTERS.includes(role) && scope === undefined) {
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
  const guards = scope === undefined ? [] : [`paths-within:${scope}`];
  const restricted = Object.keys(RESTRICTED_PATHS).filter(
    (prefix) => RESTRICTED_PATHS[prefix]?.includes(role) !== true,
  );
  if (restricted.length > 0) {
    guards.push(`paths-outside:${restricted.join(",")}`);
  }
  return guards.length === 0 ? { allow: true } : { allow: true, guards };
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
