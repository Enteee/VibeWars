#!/usr/bin/env node
/**
 * `hub` — GitHub, from inside a sandbox, with no credential.
 *
 * This runs INSIDE the bubblewrap jail. It has no token, no SSH key and no
 * network client: it writes a request into its role's spool directory, waits
 * for the daemon outside to answer, and prints the answer. Same split as `tg`,
 * for the same reason — an agent that could read the token could use it for
 * anything, and nine autonomous agents with unrestricted repository write and
 * no branch protection is not a system, it is an accident waiting.
 *
 *   hub <gh command...>              e.g. hub issue list, hub pr create
 *   hub push <branch>                push your own branch
 *   hub approve <pr> --sha <commit> [note]          reviewers only
 *   hub request-changes <pr> --sha <commit> <note>  reviewers only
 *     <commit> is the head you reviewed; a verdict on a moved head is refused
 *   hub whoami                       who you are, your role, and what it may do
 *   hub board ls|show|changes ...    hubd's copy of the board, as JSON (what
 *                                    `board` reads; see hub-board.mjs)
 *   company reboot "<reason>"        manager only; also: company reboot --abort,
 *                                    company reboot --workday
 *   company ready                    your work is saved; the reboot may go ahead
 *   company hire <role> "<reason>"   manager only; prints the new employee id
 *   company fire <employee> "<reason>"  manager only
 *   company load                     manager only: the board, staff and tokens
 *                                    the staffing review is decided on
 *     (`company` is this script with `company` as its first word)
 *
 * `whoami` is answered locally, because the policy is pure and bundled in
 * here too: an agent should be able to find out what it is allowed to do
 * without spending a round trip, and more importantly without having to
 * discover it by being refused.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { parseAlive } from "./hub-health.mjs";
import { inlineBodyFile } from "./hub-body.mjs";
import { splitFilter } from "./hub-filter.mjs";
import { ROLES, authorize } from "./hub-policy.mjs";
import { visible } from "./protocol.mjs";

// The employee (`qa-tester@2`) is who pushes; the role is what it may do (#62).
const EMPLOYEE = process.env.VIBEWARS_BOT_EMPLOYEE;
const ROLE = process.env.VIBEWARS_BOT_ROLE;
const SPOOL = process.env.VIBEWARS_HUB;

if (EMPLOYEE === undefined || ROLE === undefined || SPOOL === undefined) {
  console.error("hub: not running inside a claude-bot sandbox");
  process.exit(1);
}

/** How long to wait for the daemon. `gh` can be slow; a hung daemon is not. */
const TIMEOUT_MS = 300_000;

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("hub: usage: hub <gh command...> | push <branch> | approve <pr> | whoami");
  process.exit(2);
}

/* -------------------------------------------------------------------------- */

const ACTING = (process.env.VIBEWARS_ACTING ?? "").split(",").filter((hat) => hat !== "");

if (argv[0] === "whoami") {
  console.log(`employee: ${EMPLOYEE}`);
  console.log(`role: ${ROLE}`);
  console.log("");
  // Probed rather than hard-coded, so this can never drift from the policy
  // that is actually enforced.
  /** @type {[string, string[]][]} */
  const probes = [
    ["read issues and pull requests", ["issue", "list"]],
    ["comment on issues and pull requests", ["issue", "comment", "1"]],
    ["create and edit issues", ["issue", "create"]],
    ["close and reopen issues and pull requests", ["pr", "close", "1"]],
    ["open pull requests", ["pr", "create"]],
    ["move cards on the board", ["project", "item-edit"]],
    ["restructure the board", ["project", "item-add"]],
    ["operate the pipeline", ["workflow", "run", "ci.yml"]],
    ["cut releases", ["release", "create", "v1"]],
    ["merge pull requests", ["pr", "merge", "1"]],
  ];
  for (const [label, probe] of probes) {
    const verdict = authorize(ROLE, { kind: "gh", argv: probe }, { acting: ACTING });
    console.log(`  ${verdict.allow ? "yes" : "no "}  ${label}`);
  }
  const pushes = authorize(
    ROLE,
    { kind: "push", argv: [`bot/${EMPLOYEE}/x`] },
    { acting: ACTING, employee: EMPLOYEE },
  );
  console.log(`  ${pushes.allow ? "yes" : "no "}  push branches (bot/${EMPLOYEE}/*)`);
  const reviews = authorize(
    ROLE,
    { kind: "review", argv: ["approve", "1", "--sha", "0000000"] },
    { acting: ACTING },
  );
  console.log(`  ${reviews.allow ? "yes" : "no "}  record review verdicts`);
  const alerts = authorize(ROLE, { kind: "alerts", argv: [] }, { acting: ACTING });
  console.log(`  ${alerts.allow ? "yes" : "no "}  read code-scanning alerts`);
  const reboots = authorize(ROLE, { kind: "reboot", argv: ["abort"] }, { acting: ACTING });
  console.log(`  ${reboots.allow ? "yes" : "no "}  reboot the company (company reboot)`);
  const staff = authorize(ROLE, { kind: "staff", argv: ["hire", "x", "x"] }, { acting: ACTING });
  console.log(`  ${staff.allow ? "yes" : "no "}  hire and fire (company hire, company fire)`);
  const load = authorize(ROLE, { kind: "load", argv: [] }, { acting: ACTING });
  console.log(`  ${load.allow ? "yes" : "no "}  read the company's load (company load)`);
  const schedules = authorize(ROLE, { kind: "schedule", argv: ["ls"] }, { acting: ACTING });
  console.log(
    `  ${schedules.allow ? "yes" : "no "}  keep recurring reminders to yourself (hub schedule)`,
  );
  const ranks = authorize(ROLE, { kind: "rank", argv: ["1", "top"] }, { acting: ACTING });
  console.log(`  ${ranks.allow ? "yes" : "no "}  order the board (board rank)`);

  // Borrowed hats are stated loudly: an agent covering the merge seat as well
  // as both reviewer seats is self-certifying, and that should never be a
  // surprise to whoever reads this.
  if (ACTING.length > 0) {
    console.log("");
    console.log(`  TEMPORARILY ALSO COVERING: ${ACTING.join(", ")}`);
    console.log("  Those roles have no bot yet, so you hold their gates as well as");
    console.log("  your own. Sign off under a borrowed seat explicitly —");
    console.log("  `hub approve 22 --sha <commit> --as perf-sec-qa` — and actually");
    console.log("  do that role's review rather than letting one glance count as two.");
    console.log("  You are self-certifying while this lasts. Be stricter, not looser.");
  }
  console.log("");
  console.log(`colleagues: ${ROLES.filter((r) => r !== ROLE).join(", ")}`);
  process.exit(0);
}

/** @type {{ kind: string, argv: string[] }} */
let request;
if (argv[0] === "push") {
  request = { kind: "push", argv: argv.slice(1) };
} else if (argv[0] === "approve" || argv[0] === "request-changes") {
  request = { kind: "review", argv };
} else if (argv[0] === "alerts") {
  // Code-scanning alerts on main or a pull request (#184): a hub verb,
  // because gh has none and `gh api` is refused.
  request = { kind: "alerts", argv: argv.slice(1) };
} else if (argv[0] === "schedule") {
  // Your own recurring reminders (#678): add, ls, rm. hubd checks the words.
  request = { kind: "schedule", argv: argv.slice(1) };
} else if (argv[0] === "board" && argv[1] === "rank") {
  // The manager ordering the board (#351), for `board rank`.
  request = { kind: "rank", argv: argv.slice(2) };
} else if (argv[0] === "board") {
  // Reads of hubd's copy of the board, for `board` (board.mjs).
  request = { kind: "board", argv: argv.slice(1) };
} else if (argv[0] === "company") {
  // `company reboot "<reason>"`, `company reboot --abort` and
  // `company ready` (#21); `company hire` and `company fire` (#380);
  // `company load` (#747).
  const [, verb, ...rest] = argv;
  const [who, ...reason] = rest;
  if (verb === "load" && rest.length === 0) {
    request = { kind: "load", argv: [] };
  } else if ((verb === "hire" || verb === "fire") && who !== undefined && reason.length > 0) {
    request = { kind: "staff", argv: [verb, who, reason.join(" ")] };
  } else if (verb === "ready" && rest.length === 0) {
    request = { kind: "reboot", argv: ["ready"] };
  } else if (verb === "reboot" && rest.length > 0) {
    request = {
      kind: "reboot",
      argv:
        rest.length === 1 && rest[0] === "--abort"
          ? ["abort"]
          : rest.length === 1 && rest[0] === "--workday"
            ? ["workday"]
            : ["request", rest.join(" ")],
    };
  } else {
    console.error(
      'company: usage: company reboot "<reason>" | company reboot --abort | company reboot --workday | company ready\n' +
        '       company hire <role> "<reason>" | company fire <employee> "<reason>" | company load',
    );
    process.exit(2);
  }
} else {
  request = { kind: "gh", argv };
}

// An output filter is run here, in the jail, never by the daemon. See
// hub-filter.mjs for why.
/** @type {string | null} */
let jqFilter = null;
if (request.kind === "gh") {
  // Read here, in the jail; gh on the host never sees a path (hub-body.mjs).
  const inlined = inlineBodyFile(request.argv, (file) =>
    fs.readFileSync(file === "-" ? 0 : file, "utf8"),
  );
  if ("error" in inlined) {
    console.error(`hub: ${inlined.error}`);
    process.exit(2);
  }
  request = { kind: "gh", argv: inlined.argv };
  const split = splitFilter(request.argv);
  if ("error" in split) {
    console.error(`hub: ${split.error}`);
    process.exit(2);
  }
  if (split.template !== null) {
    console.error("hub: --template/-t is not available here. Use --json with --jq instead.");
    process.exit(2);
  }
  if (
    split.jq !== null &&
    request.argv[0] !== "api" &&
    !split.argv.some((w) => w.startsWith("--json"))
  ) {
    console.error("hub: --jq needs --json <fields>, as with gh.");
    process.exit(2);
  }
  jqFilter = split.jq;
  request = { kind: "gh", argv: split.argv };
}

// Refused locally where possible. The daemon checks again — it must, since it
// is the only side that is trustworthy — but failing here gives the agent an
// immediate, specific reason instead of a round trip ending in "denied".
const local = authorize(ROLE, request, { acting: ACTING, employee: EMPLOYEE });
if (!local.allow) {
  console.error(`hub: refused — ${local.reason ?? "not allowed"}`);
  console.error("hub: this is someone else's job; ask them on Telegram.");
  process.exit(77);
}

/* -------------------------------------------------------------------------- */

// Checked before spooling anything. A request to a daemon that is not running
// would otherwise sit here for the full timeout, and an agent that appears
// hung for five minutes is worse than one told plainly what is wrong.
//
// Liveness is a heartbeat age, not a pid. The sandbox runs with
// --unshare-all, so it has its own PID namespace and cannot see the host
// process at all: checking a pid here reported every running daemon as dead.
const HEARTBEAT_MAX_AGE_MS = 60_000;
const beatFile = path.join(SPOOL, "..", "hubd.alive");
let daemonAlive = false;
/** @type {import("./hub-health.mjs").HubdAlive | null} */
let beat = null;
try {
  // A `HubdAlive`, written by hubd (#23). Only its time means anything here.
  beat = parseAlive(fs.readFileSync(beatFile, "utf8"));
  daemonAlive = beat !== null && Date.now() - beat.heartbeatAt < HEARTBEAT_MAX_AGE_MS;
} catch {
  /* never started, or its directory is not visible from here */
}
if (!daemonAlive) {
  console.error("hub: the hub daemon is not answering, so GitHub is unreachable from here.");
  console.error("hub: it is started by `claude-llc`. If you started this agent by hand");
  console.error("hub: with `claude-bot`, GitHub will not work until claude-llc is up.");
  console.error("hub: everything else — tg, the repo, the tests — works as normal.");
  process.exit(75);
}

// A fresh heartbeat with a slow request in flight is a busy daemon, not a dead
// one: say so, once, and wait as usual (#496).
const BUSY_AFTER_MS = 10_000;
if (beat?.current != null && Date.now() - beat.current.startedAt > BUSY_AFTER_MS) {
  const seconds = String(Math.round((Date.now() - beat.current.startedAt) / 1000));
  console.error(
    visible(
      `hub: hubd is busy with ${beat.current.employee}'s \`${beat.current.command}\` for ${seconds} s; queued`,
    ),
  );
}

const id = `${String(Date.now()).padStart(14, "0")}-${String(process.pid)}`;
const reqDir = path.join(SPOOL, "req");
const resFile = path.join(SPOOL, "res", `${id}.json`);
fs.mkdirSync(reqDir, { recursive: true });
fs.mkdirSync(path.dirname(resFile), { recursive: true });

// Written under a name the daemon ignores, then renamed, so it can never read
// a half-written request.
const tmp = path.join(reqDir, `.${id}.json.part`);
fs.writeFileSync(tmp, JSON.stringify({ id, role: ROLE, ...request }));
fs.renameSync(tmp, path.join(reqDir, `${id}.json`));

// The answer goes out through process.stdout, which is asynchronous when it is
// a pipe: process.exit() straight after the write drops whatever the reader has
// not taken yet, so `hub … | jq` saw truncated JSON (issue #37). From here on
// the exit status is set and the loop left, and Node exits once it has flushed.
//
// Waiting for the flush means a reader that stops early, `hub … | head -1`,
// now gets an EPIPE to us rather than being outrun by the exit. That is the
// reader's choice, not a failure: stop quietly, with the status already set.
process.stdout.on("error", (error) => {
  if ("code" in error && error.code === "EPIPE") {
    process.exit();
  }
  throw error;
});

const deadline = Date.now() + TIMEOUT_MS;
for (;;) {
  let raw;
  try {
    raw = fs.readFileSync(resFile, "utf8");
  } catch {
    if (Date.now() > deadline) {
      console.error("hub: no answer from the hub daemon. Is claude-llc still running?");
      process.exit(75);
    }
    await sleep(200);
    continue;
  }

  /** @type {unknown} */
  let response;
  try {
    response = JSON.parse(raw);
  } catch {
    // Mid-write; the daemon renames into place, but be forgiving anyway.
    await sleep(100);
    continue;
  }

  fs.rmSync(resFile, { force: true });
  const result = /** @type {Record<string, unknown>} */ (response);

  const code = typeof result.code === "number" ? result.code : 0;
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  if (typeof result.stderr === "string" && result.stderr !== "") {
    process.stderr.write(result.stderr);
  }
  if (result.allow === false) {
    console.error(`hub: refused — ${typeof result.reason === "string" ? result.reason : "?"}`);
    process.exitCode = 77;
    break;
  }
  if (jqFilter !== null && code === 0) {
    // `-r` because gh's --jq prints strings raw. No maxBuffer: the default
    // 1 MiB fails a large board outright.
    const filtered = spawnSync("jq", ["-r", jqFilter], {
      input: stdout,
      encoding: "utf8",
      maxBuffer: Infinity,
    });
    if (filtered.error !== undefined) {
      console.error(`hub: jq failed: ${filtered.error.message}`);
      process.exitCode = 1;
      break;
    }
    process.stdout.write(filtered.stdout);
    process.stderr.write(filtered.stderr);
    process.exitCode = filtered.status ?? 1;
    break;
  }
  process.stdout.write(stdout);
  process.exitCode = code;
  break;
}
