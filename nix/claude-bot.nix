{
  pkgs,
  lib,
  config,
  ...
}:

let
  cfg = config.vibewars.telegram;

  bwrap = lib.getExe pkgs.bubblewrap;

  # Both halves of the Telegram bridge are copied into the store rather than
  # read out of the checkout. `tg` has to be, because the agent's worktree is
  # the only part of the repository mounted inside the jail and nothing
  # guarantees the agent's branch still contains a working copy of the script
  # it is being handed. `link` follows for symmetry and so that an agent that
  # rewrites scripts/bots/ on its branch cannot change what its own sidecar
  # runs. The cost is that editing either file needs a fresh `devenv shell`.
  # Staged as one directory rather than three loose files: each `${./x.mjs}`
  # would land at its own store path, and `tg.mjs`'s `import "./protocol.mjs"`
  # would then resolve to /nix/store/protocol.mjs, which does not exist.
  botScripts = pkgs.runCommand "vibewars-bot-scripts" { } ''
    mkdir -p $out
    cp ${../scripts/bots/protocol.mjs} $out/protocol.mjs
    cp ${../scripts/bots/tg.mjs} $out/tg.mjs
    cp ${../scripts/bots/link.mjs} $out/link.mjs
    cp ${../scripts/bots/setup.mjs} $out/setup.mjs
  '';

  node = "${pkgs.nodejs_24}/bin/node";

  # The in-jail CLI. Deliberately has no network access of its own: it only
  # reads and writes the two bus directories bound into the sandbox.
  tg = pkgs.writeShellApplication {
    name = "tg";
    text = ''
      exec ${node} ${botScripts}/tg.mjs "$@"
    '';
  };

  # Guaranteed to exist inside the jail regardless of the user profile, same
  # list as ~/nixos/programs/claude-sandbox.nix plus the toolchain this
  # repository's agents actually need to build and test it.
  corePath = lib.makeBinPath (
    with pkgs;
    [
      claude-code
      bashInteractive
      coreutils
      findutils
      diffutils
      gnugrep
      gnused
      gawk
      gnutar
      gzip
      git
      ripgrep
      jq
      curl
      less
      which
      nodejs_24
      pnpm_10
      tg
    ]
  );

  sandboxPath = "${corePath}:/etc/profiles/per-user/ente/bin:/run/current-system/sw/bin";

  claudeBot = ''
        # Files starting with "_" are shared fragments, not roles. _protocol.md is
        # the coordination contract every agent gets; the per-role file is what
        # distinguishes them.
        listRoles() {
          for f in "$DEVENV_ROOT"/.claude/bots/*.md; do
            [ -e "$f" ] || continue
            b="''${f##*/}"
            case "$b" in _*) continue ;; esac
            echo "  ''${b%.md}"
          done
        }

        # The scripts are staged into /nix/store, and devenv's evaluation cache
        # keys on .nix files only — so editing scripts/bots/*.mjs silently keeps
        # running the previous copy until the cache is cleared. That is a
        # genuinely confusing hour to lose, so say it out loud.
        for f in protocol.mjs tg.mjs link.mjs setup.mjs; do
          if [ -e "$DEVENV_ROOT/scripts/bots/$f" ] &&
             ! ${pkgs.diffutils}/bin/cmp -s "$DEVENV_ROOT/scripts/bots/$f" "${botScripts}/$f"; then
            echo "claude-bot: warning: scripts/bots/$f differs from the staged copy being run." >&2
            echo "claude-bot: warning: rm .devenv/nix-eval-cache.db and re-enter the shell to pick it up." >&2
            break
          fi
        done

        usage() {
          cat <<'USAGE'
    claude-bot — run a sandboxed Claude agent in a role, coordinating over Telegram

    usage:
      claude-bot <role> [claude args...]
      claude-bot --help

    Each role runs in its own bubblewrap sandbox, on its own git worktree
    (branch bot/<role>), and talks to its peers through its own Telegram topic.
    Your checkout is not mounted inside the sandbox. Any extra arguments are
    passed straight through to `claude`.

    roles:
    USAGE
          listRoles
          cat <<'USAGE'

    A role whose Telegram bot does not exist yet is provisioned on first run:
    you confirm a creation button in Telegram, then add the new bot to the
    group. Add a role by writing .claude/bots/<name>.md — the file is that
    agent's charter, and is appended to its system prompt.

    inside the sandbox:
      tg roster                  who else is working right now
      tg inbox                   messages since you last looked
      tg wait --timeout 300      block until someone says something
      tg send <role> <text>      message one agent, in its own topic
      tg broadcast <text>        message everyone, in General

    first-time setup:
      claude-bot-setup <token-file>
          Verifies the manager bot, waits for the group, writes devenv.local.nix.

    state (all gitignored, tokens are 0600):
      .bots/registry.json        role bots and their tokens
      .bots/bus/<role>/          that role's inbox and outbox
      .bots/wt/<role>/           that role's git worktree

    See docs/adr/0014-agent-coordination.md for why it is built this way.
    USAGE
        }

        # Handled before role validation, which would otherwise reject the leading
        # dashes of --help as an invalid role name.
        case "''${1-}" in
          -h | --help)
            usage
            exit 0
            ;;
        esac

        role="''${1-}"
        if [ -z "$role" ]; then
          usage >&2
          exit 2
        fi
        shift

        case "$role" in
          *[!a-z0-9-]* | -* | _*)
            echo "claude-bot: a role is a plain name: [a-z0-9-]+, no leading dash or underscore." >&2
            echo "claude-bot: got: $role" >&2
            echo "claude-bot: try: claude-bot --help" >&2
            exit 2
            ;;
        esac

        brief="$DEVENV_ROOT/.claude/bots/$role.md"
        if [ ! -e "$brief" ]; then
          echo "claude-bot: no briefing at $brief" >&2
          echo "claude-bot: write that file to define the role, or pick one of:" >&2
          listRoles >&2
          exit 2
        fi

        # ----------------------------------------------------------------------
        # The manager bot's token. Read from a file at runtime when one is
        # configured; a token written inline into devenv.local.nix is baked into a
        # world-readable /nix/store path, which is worth saying out loud exactly
        # once per invocation rather than burying in a comment.
        # ----------------------------------------------------------------------
        tokenFile="${if cfg.managerTokenFile == null then "" else toString cfg.managerTokenFile}"
        tokenLiteral="${if cfg.managerToken == null then "" else cfg.managerToken}"

        if [ -n "$tokenFile" ]; then
          if [ ! -r "$tokenFile" ]; then
            echo "claude-bot: vibewars.telegram.managerTokenFile is set to $tokenFile, which is not readable" >&2
            exit 1
          fi
          TELEGRAM_MANAGER_TOKEN="$(tr -d '[:space:]' < "$tokenFile")"
        elif [ -n "$tokenLiteral" ]; then
          echo "claude-bot: warning: using vibewars.telegram.managerToken, which is readable by any local user via /nix/store." >&2
          echo "claude-bot: warning: prefer managerTokenFile = \"/path/to/secret\";" >&2
          TELEGRAM_MANAGER_TOKEN="$tokenLiteral"
        else
          echo "claude-bot: no Telegram manager token configured." >&2
          echo "claude-bot: add to devenv.local.nix:" >&2
          echo "" >&2
          echo "  { vibewars.telegram = {" >&2
          echo "      managerTokenFile = \"/path/to/secret\";" >&2
          echo "      managerUsername  = \"your_manager_bot\";" >&2
          echo "      chatId           = \"-1001234567890\";" >&2
          echo "    }; }" >&2
          exit 1
        fi
        export TELEGRAM_MANAGER_TOKEN

        if [ -z "${cfg.managerUsername}" ] || [ -z "${cfg.chatId}" ]; then
          echo "claude-bot: vibewars.telegram.managerUsername and .chatId must both be set in devenv.local.nix" >&2
          exit 1
        fi

        # Every agent gets the shared coordination contract plus its own charter.
        briefing="$(cat "$DEVENV_ROOT/.claude/bots/_protocol.md" "$brief")"

        export VIBEWARS_BOT_ROOT="$DEVENV_ROOT/.bots"
        export VIBEWARS_BOT_ROLE="$role"
        export VIBEWARS_BOT_BUS="$DEVENV_ROOT/.bots/bus"
        export TELEGRAM_MANAGER_USERNAME="${cfg.managerUsername}"
        export TELEGRAM_CHAT_ID="${cfg.chatId}"
        export VIBEWARS_BOT_USERNAME_PREFIX="${cfg.usernamePrefix}"

        mkdir -p "$VIBEWARS_BOT_ROOT" "$VIBEWARS_BOT_BUS" "$VIBEWARS_BOT_ROOT/link" "$VIBEWARS_BOT_ROOT/wt"
        chmod 700 "$VIBEWARS_BOT_ROOT"

        # ----------------------------------------------------------------------
        # Claude's own credential, handled exactly as claude-box does: it is the
        # one real secret the jail gets, bound read-write because Claude rewrites
        # it on token refresh.
        # ----------------------------------------------------------------------
        boxDir="$HOME/.claude-bot/$role"
        mkdir -p "$boxDir/config"
        [ -e "$boxDir/claude.json" ] || printf '{}' > "$boxDir/claude.json"

        creds="$HOME/.claude/.credentials.json"
        if [ ! -e "$creds" ]; then
          echo "claude-bot: $creds not found. Run 'claude' once unsandboxed to log in." >&2
          exit 1
        fi

        # ----------------------------------------------------------------------
        # Provision: blocks on human taps the first time a role is seen, returns
        # immediately on every run after that.
        # ----------------------------------------------------------------------
        ${node} ${botScripts}/link.mjs provision "$role"

        # ----------------------------------------------------------------------
        # The worktree. The agent edits this, never your checkout.
        # ----------------------------------------------------------------------
        worktree="$VIBEWARS_BOT_ROOT/wt/$role"
        if [ ! -e "$worktree" ]; then
          if git -C "$DEVENV_ROOT" show-ref --verify --quiet "refs/heads/bot/$role"; then
            git -C "$DEVENV_ROOT" worktree add "$worktree" "bot/$role"
          else
            git -C "$DEVENV_ROOT" worktree add -b "bot/$role" "$worktree"
          fi
        fi

        # ----------------------------------------------------------------------
        # The sidecar. Owns the role's bot token, which is why it stays out here.
        # ----------------------------------------------------------------------
        # $$ is this shell's PID, which `exec` below hands to bwrap — so it stays
        # alive for exactly the length of the session, and is what the sidecar
        # watches to know when to exit. See watchLauncher in link.mjs.
        VIBEWARS_BOT_LAUNCHER_PID="$$"
        export VIBEWARS_BOT_LAUNCHER_PID

        ${node} ${botScripts}/link.mjs serve "$role" &
        linkPid=$!
        # This trap covers only the gap between here and the exec below: once exec
        # replaces this shell with bwrap, no trap of ours can ever run. What ends
        # the sidecar at the end of a real session is its own watchLauncher, which
        # watches $VIBEWARS_BOT_LAUNCHER_PID above.
        #
        # shellcheck disable=SC2064
        # Expanded now on purpose: $linkPid must be captured at trap-setting time.
        trap "kill $linkPid 2>/dev/null || true" EXIT INT TERM

        # ----------------------------------------------------------------------
        # dev.tty.legacy_tiocsti is 0 on this kernel, so terminal injection is
        # already blocked and --new-session can be omitted; omitting it keeps the
        # controlling terminal attached, which the Claude TUI needs for Ctrl-C.
        #
        # $HOME is a tmpfs, so ~/.ssh, ~/.gnupg, ~/.kube, ~/.npmrc and friends are
        # simply not there, and neither is the Telegram token: `tg` reaches the
        # network only through the sidecar above. $DEVENV_ROOT is a tmpfs too, so
        # the only paths that survive back to the host are the worktree, this
        # role's bus directory, and the git object store.
        # ----------------------------------------------------------------------
        exec ${bwrap} \
          --die-with-parent \
          --unshare-all \
          --share-net \
          --clearenv \
          --ro-bind /nix/store /nix/store \
          --ro-bind /etc /etc \
          --ro-bind /bin /bin \
          --ro-bind /usr /usr \
          --ro-bind /run/current-system /run/current-system \
          --proc /proc \
          --dev /dev \
          --tmpfs /tmp \
          --tmpfs "/run/user/$(id -u)" \
          --tmpfs "$HOME" \
          --tmpfs "$DEVENV_ROOT" \
          --bind "$boxDir/config" "$HOME/.claude" \
          --bind "$boxDir/claude.json" "$HOME/.claude.json" \
          --bind "$creds" "$HOME/.claude/.credentials.json" \
          --ro-bind-try "$HOME/.config/git" "$HOME/.config/git" \
          --bind "$DEVENV_ROOT/.git" "$DEVENV_ROOT/.git" \
          --ro-bind "$VIBEWARS_BOT_BUS" "$VIBEWARS_BOT_BUS" \
          --bind "$VIBEWARS_BOT_BUS/$role" "$VIBEWARS_BOT_BUS/$role" \
          --bind "$worktree" "$worktree" \
          --chdir "$worktree" \
          --setenv HOME "$HOME" \
          --setenv USER "$USER" \
          --setenv SHELL "${lib.getExe pkgs.bashInteractive}" \
          --setenv PATH "${sandboxPath}" \
          --setenv TERM "''${TERM:-xterm-256color}" \
          --setenv LANG "''${LANG:-C.UTF-8}" \
          --setenv COLORTERM "''${COLORTERM:-truecolor}" \
          --setenv XDG_RUNTIME_DIR "/run/user/$(id -u)" \
          --setenv VIBEWARS_BOT_ROLE "$role" \
          --setenv VIBEWARS_BOT_BUS "$VIBEWARS_BOT_BUS" \
          --setenv VIBEWARS_ENV "development" \
          -- claude --append-system-prompt "$briefing" "$@"
  '';
in
{
  options.vibewars.telegram = {
    managerTokenFile = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "/home/you/.secrets/telegram-manager-token";
      description = ''
        Path to a file containing the manager bot's token, read at runtime.
        Preferred over `managerToken`: the value never reaches the Nix store.
      '';
    };

    managerToken = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = ''
        The manager bot's token, inline. Convenient, but it is interpolated
        into a world-readable /nix/store path; `managerTokenFile` is safer.
      '';
    };

    managerUsername = lib.mkOption {
      type = lib.types.str;
      default = "";
      example = "vibewars_manager_bot";
      description = ''
        Username of the manager bot, without the leading `@`. Used to build
        the `t.me/newbot/<manager>/<suggested>` provisioning links.
      '';
    };

    chatId = lib.mkOption {
      type = lib.types.str;
      default = "";
      example = "-1001234567890";
      description = ''
        Numeric id of the forum supergroup the swarm lives in. Topics must be
        enabled on it, and the manager bot must be an admin there with
        `can_promote_members` and `can_manage_topics`.
      '';
    };

    usernamePrefix = lib.mkOption {
      type = lib.types.str;
      default = "vibewars";
      description = ''
        Prefix for suggested usernames of newly provisioned role bots, as in
        `vibewars_qa_7f3a_bot`.
      '';
    };
  };

  config = {
    packages = [
      pkgs.bubblewrap
      pkgs.claude-code
      tg
    ];

    scripts.claude-bot = {
      description = "Run a sandboxed Claude agent in a given role, on Telegram";
      exec = claudeBot;
    };

    # Deliberately not driven by the options below: it exists to discover the
    # values those options need, so it takes the token file as an argument and
    # reads no config at all.
    scripts.claude-bot-setup = {
      description = "One-time Telegram setup: verify the manager bot, find the group, write devenv.local.nix";
      exec = ''
        exec ${node} ${botScripts}/setup.mjs "$@"
      '';
    };
  };
}
