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

## The Telegram token file

`vibewars.telegram.managerTokenFile` in `devenv.local.nix` must name a
file that exists and holds the manager bot's token before you run
`claude-llc`. Without it every employee refuses to start and retries.
Create it readable by you only:

```sh
mkdir -p ~/.secrets
install -m 600 /dev/null ~/.secrets/telegram-manager-token
$EDITOR ~/.secrets/telegram-manager-token   # paste the token, nothing else
```

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

## Scaling the company by hand

`claude-llc hire <role> [reason]` and `claude-llc fire <employee> [reason]`
change who is employed, with the manager's checks but no cooldowns. `hire`
also takes `--over-cap` to go past `maxAgents`. The reason is one word unless
you quote it: `claude-llc hire developer "more devs"`; unquoted extra words
are a usage error. The company is told in General, and the supervisor starts
or stops the employee. The company must be up: hubd answers the request.
