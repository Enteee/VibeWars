# Host prerequisites for the agent company

`claude-llc` runs the agent company (ADR-0014, ADR-0015): one bubblewrap
jail per employee under a capped systemd user slice, in a tmux session.
It needs the host set up as below once. The scripts check most of this and
refuse to start when something is missing; they never fix host
configuration themselves and never run `sudo`.

Supported hosts: any Linux with what this page lists. NixOS is one of
them, not the assumed one; RHEL 9 with single-user Nix works too.

## Linux, cgroup v2 and a systemd user manager

The jails run in a user slice with memory, CPU, IO and task caps, so the
host needs the unified cgroup hierarchy (cgroup v2) and a running systemd
user manager (`systemctl --user status` answers).

## The cgroup controllers delegated to the user manager

A cap on the slice means nothing unless the kernel delegated the
controller to your user manager. `claude-bot` checks `memory`, `pids` and
`cpu`, and refuses to start a jail without them. `io` is not checked, but
the slice's `IOWeight` needs it. Some distributions (RHEL 9) delegate
only `pids memory`. Fix it as root, once per host:

```sh
sudo mkdir -p /etc/systemd/system/user@.service.d
printf '[Service]\nDelegate=cpu cpuset io memory pids\n' |
  sudo tee /etc/systemd/system/user@.service.d/delegate.conf
sudo systemctl daemon-reload
# then log out of every session, or:
sudo systemctl restart "user@$(id -u).service"
```

Check it; the list must include `cpu`:

```sh
cat "/sys/fs/cgroup/user.slice/user-$(id -u).slice/user@$(id -u).service/cgroup.controllers"
```

## Nix and devenv on PATH in non-login shells

tmux and byobu windows are non-login shells. Single-user Nix sources
`nix.sh` from `~/.bash_profile` only, so those windows have no `devenv`.
Add the same line to `~/.bashrc`:

```sh
. "$HOME/.nix-profile/etc/profile.d/nix.sh"
```

## The company's credential home

The company keeps what it authenticates with in one directory, mode 0700,
outside the checkout: `vibewars.claudeBot.credentials`, by default
`~/.claude-bot/creds`. `claude-llc-init` creates it and refuses one that
others can read. `claude-llc doctor` prints, per credential, the identity it
resolves to, its expiry and scopes, where it is stored and whether it is
yours; it writes nothing.

The Telegram manager bot's token lives there as `telegram-manager-token`,
and the company's group as `telegram-chat-id`; `claude-llc auth telegram`
writes both (mode 600). The group must be a supergroup with Topics on, where
the bot is an admin who can manage topics. They are read when an employee
starts, so a fix takes effect on the next turn. Without either file every
employee refuses to start and retries. To keep it elsewhere, set
`vibewars.telegram.managerTokenFile` in `devenv.local.nix`.

The agents run on the company's own Claude account (ADR-0031), never yours
(a separate account from yours is best, but not checked).

The first run, in a terminal:

```sh
claude-llc auth        # Claude, GitHub, the push key, the Telegram bot and group
claude-llc-init
```

`claude-llc auth` shows the doctor's table, signs in each credential that is
not signed in, each in the company's own directory and never with a token
from your shell, and shows the table again. `claude-llc auth claude` (or
`github`, `push`, `telegram`) does only that one. It prints no secret: the
public push key is the only key it shows. `claude-llc-init` then records the
Claude account, and `claude-llc` refuses to start unless it is signed in.

On GitHub the company works as its own machine account too: hubd's every
`gh` call, and every push and fetch (ADR-0031). `claude-llc-init` itself
stays yours, for the board and the ruleset, which need an admin. Create the
machine account and add it to the repository as a collaborator with Write.
`claude-llc auth github` signs it in, in its own `gh` config directory;
`claude-llc auth push` makes the company's push key (`ssh/id_ed25519`),
prints the public key, and waits until GitHub greets it as the machine
account: add it at <https://github.com/settings/ssh/new> while signed in as
that account.

Then run `claude-llc-init`. It checks the account, its `project` scope and
the push key, and points you back at `claude-llc auth` for whichever is
missing.
The board is a user project, which repository access does not reach, so init
also asks you to add the account to the board with Write, then to run it
again. `claude-llc` refuses to start without the token or the key.

A machine set up before this had the token wherever `managerTokenFile`
pointed and still has that line in `devenv.local.nix`, which keeps working.
Without that line, move the file once into the credential home.

## Unprivileged user namespaces for bubblewrap

Every jail is a `bwrap --unshare-all`, which needs unprivileged user
namespaces. Check that this is above 0:

```sh
sysctl user.max_user_namespaces
```

On distributions that have it, this must be 1:

```sh
sysctl kernel.unprivileged_userns_clone
```

## tmux and byobu

`claude-llc` may run inside an existing tmux or byobu session. It creates
its session on that server and switches your client to it, rather than
nesting an attach. Run without a terminal, from a Claude Code prompt say,
it brings the company up and tells you to attach with `claude-llc`.

## Pinning the commit the company runs

`claude-llc up` runs the commit in `.bots/company.lock` (ADR-0044), whatever
your checkout holds. It writes that commit's files from hubd's mirror into
`.bots/company/<sha>/`, checks them, and starts the company from a shell
built there; your `devenv.local.nix` is copied in. Pull, branch and edit in
the checkout as you like: if its HEAD is not the lock, `up` prints one
warning, such as `checkout HEAD fb15a33 is 63 commits ahead of the locked
c9f0b10; the company runs c9f0b10`, and carries on.

Run `claude-llc lock` once to pin the current HEAD (clean, on GitHub's
`main`, and built), and again whenever you want the company on what you
checked out. A reboot moves the lock on its own, onto the commit you
approved, once it built, and never touches your checkout. Until the first
lock exists, `up` refuses and says so. It also refuses when GitHub cannot
be reached, when the lock is not on `main`, and when the locked tree
still differs from the mirror after being written again.

## Approving reboots

The manager cannot reboot the company alone (ADR-0034). `company reboot`
posts a proposal in the Operator topic: why, the commit it boots onto,
the company commits and files it loads, and two buttons. **Approve** starts
the drain, and the company comes back on exactly that commit, even if
`main` has moved on since. **Reject** tells the manager. A reply to the
message reaches the manager and decides nothing. A proposal never lapses;
the manager withdraws it with `company reboot --abort`. Only your taps
count, on the proposal's own message: a button pressed by anyone else in
the group, or an "approved" typed anywhere, approves nothing.

## Scaling the company by hand

`claude-llc hire <role> [reason]` and `claude-llc fire <employee> [reason]`
change who is employed, with the manager's checks but no cooldowns. `hire`
also takes `--over-cap` to go past `maxAgents`. The reason is one word unless
you quote it: `claude-llc hire developer "more devs"`; unquoted extra words
are a usage error. The company is told in General, and the supervisor starts
or stops the employee. The company must be up: hubd answers the request.

## Picking the context ceiling

An agent whose context comes within `NEAR_MARGIN` of `CONTEXT_CEILING`
(`scripts/bots/agent-turn.mjs`) starts its next turn in a fresh session. Past
the ceiling, every `tg`, `board` and
`hub` command tells the agent to end its turn; within `NEAR_MARGIN` of it, a
`taking #N` comment or a move into In Progress advises against starting the
card (`scripts/bots/context.mjs`). Too high, and every call re-reads a
long conversation; too low, and agents re-orient (briefing, inbox, board) more
often. `node scripts/bots/context-report.mjs [--since 48h]` works out the
best ceiling, C\*, from the session logs in `$VIBEWARS_CLAUDE_BOXES` (or
`--boxes <dir>`). For each role, it takes the sessions that started in the
window and computes the context after orientation (P), what orientation cost
(R) and the growth per call (g). It then prints C\* and the modelled cost at
C\* as a share of today's. It prints counts, never log text. To move the
ceiling, change the constant in its own PR, citing the report.
