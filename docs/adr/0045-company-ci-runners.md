# ADR-0045: Company-hosted CI runners

## Status

Accepted (2026-10-31). Issue #1889, part 1 of #1888, requested by the
operator. Reviewed by perf-sec-qa.

## Context

CI runs on GitHub's hosted runners, and an end-to-end run takes the best
part of an hour (#1888). The operator's host has CPU and memory to spare,
so the company wants to run CI jobs there too.

A self-hosted runner runs whatever the workflow on the triggering branch
says. Every role in the company can push a branch, and an agent can be
prompt-injected or simply wrong, so a job is treated as hostile: it must not
reach the host, the company's credentials, the other jails, or anything on
the network a CI job does not need.

## Decision

`scripts/bots/runner-jail.mjs` runs **one ephemeral runner, for one job**,
in bubblewrap. nixpkgs' `github-runner` is started with `run --jitconfig`,
so it takes one job and exits, and the next job gets a fresh jail. The
`vibewars-runner-jail` wrapper in `nix/claude-bot.nix` hands it the store
paths. A supervisor that keeps runners going is part 2 (#1888).

**The sandbox.**

- `--unshare-all` without `--share-net`, `--die-with-parent`,
  `--new-session`, `--clearenv` with an explicit environment, and uid 1001,
  never root.
- `--cap-drop ALL` and `--disable-userns`: no capabilities, and no nested
  user namespace, the usual way from an unprivileged sandbox into the
  kernel. Chromium's own sandbox needs one, so the e2e runs it with
  `--no-sandbox`, as every jail already does: the jail is the sandbox.
- A cgroup cap: `systemd-run --user --scope -p CPUQuota= -p MemoryMax=
-p TasksMax=`, by default 2 CPUs, 6 GiB and 2048 tasks per runner. An
  over-memory job is OOM-killed inside its scope; a fork bomb stops at the
  task cap.
- `/`, `/etc` and `/tmp` are tmpfs; `/etc` holds the jail's own `passwd`,
  `group`, `hosts` and `nsswitch.conf`.
- `/nix`, `HOME` and the work dir are a fresh per-jail **scratch directory
  on disk** (mode 0700, under `$XDG_STATE_HOME/vibewars/runners/`, never
  under the hub, a worktree or the credentials), deleted when the runner
  exits. Not tmpfs:
  tmpfs is charged to the scope's memory, and devenv's restored store
  alone is several GiB.
- The runner's Nix closure and a base userland (bash, coreutils, findutils,
  grep, sed, git, tar, zstd, gzip, xz, curl, cacert, jq) are mounted over
  that `/nix/store`, each directory as an overlay with a tmpfs upper layer
  (`--overlay-src` / `--tmp-overlay`). The job sees them writable and cannot
  change the host's copy. This matters: `.github/actions/devenv` installs
  Nix into `/nix` and restores the store from the Actions cache with tar,
  and that store holds paths from the same nixpkgs, glibc among them. Over a
  read-only bind, the restore fails.
- Never bound in: the operator's home, the hub, the company's credentials,
  the SSH key, `/run/user`, or any socket but the proxy's.
- The JIT config is read by the launcher and passed to the runner as its
  argument. The host's file is deleted as soon as the runner starts, and
  the jail never has it as a file.

**Egress.** `scripts/bots/runner-proxy.mjs`, an HTTP CONNECT proxy on a unix
socket, one per jail, run by the launcher. Inside, socat serves it on
`127.0.0.1:3128`, and `HTTPS_PROXY`/`HTTP_PROXY` (both cases) point there.
It tunnels to port 443 only, of a host in `runner-proxy-allow.json`: an
entry matches exactly, or, starting with a dot, any host below it, never by
substring. IP literals are refused, and so is an allowed name that resolves
to a loopback, private, link-local or unique-local address. A host is
matched lower-cased and without its trailing dot; userinfo, a raw IDN or
anything else that is not a plain host name is refused, and refusals are
logged with control characters masked. It never adds a credential,
and it logs every host it refuses, so a missing entry shows in the log.
Loopback inside the jail (Playwright's dev server) needs no proxy.

The list is the issue's, plus two that a job cannot run without:
`codeload.github.com`, where `uses:` downloads an action's tarball, and
`devenv.cachix.org`, devenv's binary cache.

**The job-started hook.** `runner-hook-job-started.sh`, set as
`ACTIONS_RUNNER_HOOK_JOB_STARTED` by the jail, not by the workflow, fails
any job whose event is not on `runner-events.json`: `push`, `schedule`
and `workflow_dispatch` always, `pull_request` only when its head is a
branch of this repository. Everything else fails closed, notably
`pull_request_target`, `workflow_run`, `issue_comment` and
`merge_group`, and so does an event file or allowlist jq cannot read.
The test of #1891 reads the same file beside the workflows' `runs-on`, so the
two cannot drift apart.

## Threat model

- **Who can get a job onto these runners.** A branch of this repository:
  the company's agents and the operator. A fork's pull request is stopped
  twice: by the operator's GitHub setting "Require approval for **all**
  outside collaborators" (not the default, first-time contributors only),
  and, if a fork edits `runs-on` to target us, by the hook. The runners
  sit in a runner group restricted to this one repository, so a JIT config
  is no use to another repository of the account.
- **The cost of a public repository.** GitHub advises against self-hosted
  runners on public repositories. We accept it because the runners are
  ephemeral and jailed, and a fork's pull request is refused twice.
- **What a hostile job can reach.** The allowlisted hosts on port 443, its
  own scratch directory and tmpfs, and CPU and memory up to its cap. It can
  push to what its job's `GITHUB_TOKEN` allows, exactly as on GitHub's
  runners.
- **What it cannot reach.** The host's filesystem, the hub, the company's
  credentials, the SSH key, the other jails, the host's network and
  loopback services, any other host on the internet.
- **Egress filtering is not exfiltration-proof.** A job can send what it
  can read (its checkout, its token) to an allowlisted host it controls
  content on: a gist, a GitHub repository, an npm package, an Azure blob.
  That is true on GitHub's hosted runners too. What protects us is that
  the jail holds nothing secret: the source is public, there are no
  secrets, and the JIT credential is good for one job. The filter stops a
  hostile job scanning the LAN, attacking the host's services, or using
  the host to attack arbitrary hosts.
- **The Actions cache is unverified input**, the restored Nix and pnpm
  stores included, exactly as on hosted runners. A branch's run writes
  only its branch's scope, so it cannot poison `main`'s; only a run on
  `main` writes there.
- **Residual.** A kernel bug in user namespaces or overlayfs is a
  host escape.

## What was rejected

- **A persistent shared `/nix/store`** across jobs: one job could poison
  what the next one runs.
- **The host's Nix daemon socket** in the jail: a build the daemon runs
  outside the jail is a host escape.
- **Docker**: its socket is root on the host.
- **Long-lived, non-ephemeral runners**: a job could leave something
  running, or in the work dir, for the next one.
- **Read-only binds of the closure under a writable `/nix`**: the Actions
  cache restore writes the same paths and fails on them. Overlays fix it.
- **tmpfs for `/nix` and the work dir**: charged to the memory cap.

## Consequences

- Every agent's shell realises `github-runner`; only the operator's host
  runs it.
- Part 2 (#1888) supervises and scales the runners, part 3 points
  workflows at them, part 4 measures them.
- A host a job needs and the list lacks is found in the launcher's log as
  `runner-proxy: host refused: <host>`, and added here with its reason.
