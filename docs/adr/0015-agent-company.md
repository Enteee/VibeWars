# ADR-0015: The agent company's GitHub boundary

## Status

Accepted (2026-10-24). Complements [ADR-0014](0014-agent-coordination.md),
which covers how agents talk; this covers how they reach GitHub.

## Context

Nine agents run in bubblewrap jails on one machine and share one GitHub
identity. GitHub cannot tell them apart, so it cannot enforce who merges,
who approves or who restructures the board. Whatever enforces that has to
sit between the agents and the credential.

The first version (#12) did, but the reviews of it found four ways through
(#26): `hubd`, which holds the credential and runs unjailed, ran git in the
agents' own writable repository (their hooks and config ran with its
authority); `gh` flags such as `--body-file` read files on the host; the
merge guard and `gh` could disagree about which pull request a merge was
for; and `--as` named any reviewer seat.

## Decision

Agents never hold a credential and never run `gh` or an authenticated git.
They write requests to a spool; `hubd` on the host decides each one with a
pure, tested policy (`scripts/bots/hub-policy.mjs`) and runs it. In
particular:

- **hubd runs git only in its own bare mirror** (`.bots/hub/.git-mirror`),
  inside a directory the jails see read-only. A push fetches the branch by
  name from the shared repository into the mirror and pushes it to the
  company's repository by URL. Every git it runs carries `-c` settings that
  make hooks, fsmonitor, SSH and proxy commands, credential and askpass
  helpers, external diffs and `ext::` inert, and no system or global config.
- **gh runs in an empty directory hubd owns**, with the repository and owner
  always pinned by hubd and never taken from the request.
- **No gh flag that reads a file is allowed**, in any spelling gh's parser
  accepts, including short flags clustered behind booleans. `hub` reads
  `--body-file` inside the jail and sends `--body`.
- **A merge is exactly one pull request by number**, squashed, pinned with
  `--match-head-commit` to the head the approvals and checks were checked
  against.
- **A verdict names the commit it reviewed** (`--sha`), is refused if the
  head has moved, and is cast only for the role's own seat or one it is
  covering.

- **Skills are code** (#27). They live in `.claude/bots/skills/` and change
  by pull request, reviewed as gate paths, because a skill is an
  instruction to every agent. The manager is the one role that may push
  them, and hubd refuses any manager push that changes a path outside that
  directory, judged against `main` fetched by URL, with renames counted on
  both sides. hubd exports `main`'s copy to `.bots/skills-main/` after
  each fetch. Every jail binds that directory read-only as its user-level
  `~/.claude/skills`, so no worktree carries a copy that drifts.

- **Sign-off is a column** (#349). A card leaves the Backlog for Ready
  only by the architect's `board move`; hubd refuses every other role that
  move, and the architect every move but `Backlog -> Ready` and `Ready ->
Backlog`, judged against the card's column in hubd's copy of the board
  (re-read once if the copy is stale). Work had reached developers unsigned
  while the rule lived only in briefings. Rejected: checking for an
  `ARCHITECTURE OK` comment on `Ready -> In Progress`, which costs an issue
  read per move and can be faked by any role that can comment.

- **The jails share one resource budget** (#358). Jails run as the
  operator's UID, so without a cap one runaway test run takes the host's RAM,
  CPU or process table with it. `claude-bot` starts every jail as a systemd
  user scope in `vibewars-jails.slice`, whose limits (set at runtime by
  `claude-bot --slice`, which `claude-llc start` runs first) are for all
  jails together, not per agent: `MemoryMax=90%`, `MemoryHigh=85%`,
  `MemorySwapMax=0` (the throttle is the soft landing; swap would hide a
  leak while the disk thrashes), `CPUQuota=90%` of all cores,
  `CPUWeight=20`, `IOWeight=20`, `TasksMax=8192` (well under the
  operator's own `ulimit -u`). Inside, `oom_score_adj=1000` makes the
  kernel kill a jailed process before any host process, `nice -n 10` keeps
  the jails below the host (a process cannot undo it), and `--core=0` stops
  core dumps. hubd, the supervisor, the dashboard, the Telegram sidecar and
  presence stay outside the slice: they must survive a jail's OOM. A host
  without a user manager or memory delegation is refused, never run
  uncapped. Known limits, accepted: a jailed process may lower its own
  `oom_score_adj` to 0 (pinning it needs CAP_SYS_RESOURCE), so the cap is
  the guarantee and the score the tie-breaker; `IOWeight` does nothing
  without the BFQ scheduler; network bandwidth has no cgroup controller. Not
  done: per-agent limits (they strand capacity), `memory.oom.group` (it
  would kill the whole session instead of the runaway subprocess), hard I/O
  bandwidth caps (they need device paths and fixed numbers), `CI=1` in jails
  (it changes how Playwright behaves, so tests would not mean what agents
  think). Disk space is outside cgroups: the agent loop starts no turn below
  10 GiB free on the repository's filesystem and resumes at 12 GiB, telling
  the company both times (`scripts/bots/disk.mjs`).
  On the operator's side, `IODeviceLatencyTargetSec=` on the session
  protects host I/O latency; that is host configuration, not ours.
  To check by hand, on the host: `systemctl --user show vibewars-jails.slice
-p MemoryMax,MemoryHigh,MemorySwapMax,CPUQuotaPerSecUSec,CPUWeight,TasksMax`;
  the `/proc/<pid>/cgroup` of a jail is under
  `vibewars-jails.slice/vibewars-jail-<role>-<pid>.scope`, hubd's is not; and
  `claude-bot --smoke <role>` checks the OOM score, nice and core limit.
  A memory hog (`node -e 'const a=[];for(;;)a.push(Buffer.alloc(1<<26,1))'`),
  a bounded fork bomb and a CPU burner in one jail must leave the other
  agents and hubd running.

## Consequences

- **The parts of the shared `.git` that git executes are read-only in
  every jail** (#61): `config`, `hooks/` and `info/`. The rest of `.git`
  stays writable, because worktrees commit into it. The mirror keeps hubd
  safe, but the operator's own git, `claude-llc`'s backup bundle and the
  restarter all run in the operator's checkout. They read that config
  (`core.fsmonitor`, `core.hooksPath`, filter and diff drivers,
  `insteadOf`, `sshCommand`) and those hooks, so an agent that could write
  them could run code on the host. The masks are bind mounts inside the
  jail only, so devenv still installs its pre-commit hook on the host. Two
  side effects:
  - A jail sees `config` as it was when it started. git replaces the file
    rather than writing into it, so a later change on the host reaches an
    agent at its next restart.
  - Agents cannot `git config` or `git remote add`. Branches are created
    without tracking (`branch.autoSetupMerge=false`, set through the
    jail's environment), so ordinary git never needs to write config.
- **Refs are still writable from a jail**, including `refs/heads/main` and
  `refs/remotes/origin/main`, so **on the host, never trust a local ref**.
  In the operator checkout, fetch before you trust `origin/main`, and
  never merge or fast-forward to a ref you did not just fetch. The
  restarter fast-forwards to `main` fetched by URL, not to a local ref, and
  hubd's push path already compares against main fetched by URL (#26).
  Agents writing each other's worktree state is a lower-severity follow-up
  to #61.
- A company reboot (#21) runs host git in the operator's checkout,
  unattended. So it takes nothing about `main` from that checkout: it
  fetches and builds main in hubd's mirror (built from `git archive`, never
  a checkout), and fast-forwards the checkout only to a fetched commit equal
  to the mirror's. Every git it runs there pins the settings that run
  commands (hooks, fsmonitor, ssh, gpg and signature checks, submodules,
  replace refs) and every filter driver the config names. The residual is
  a setting git adds in future that runs a command and is not pinned; the
  read-only masks above close that class instead of chasing it key by key.
- hubd no longer sets an upstream in the agent's repository on push, and the
  agent's `origin/<branch>` does not move. Agents compare against the branch
  on GitHub when they need to.
- Every new `gh` subcommand an agent needs is a policy change with a test.
  That is the point, and also the cost.

## Alternatives Considered

- **One GitHub identity per role.** Would let GitHub's own branch rules do
  most of this, but means nine accounts and tokens to keep, and it still
  would not stop host file reads through `gh`.
- **Hardening git in the agents' repository instead of a mirror.** The
  stopgap that shipped first. It cannot stop a remote pointing elsewhere,
  and every new git setting that runs a command reopens it.
