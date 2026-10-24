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
  # Every script, staged as one directory.
  #
  # This was a hand-written list of `cp` lines, and it went wrong twice: once
  # when a lone file was staged without the module it imports, and again when
  # `hubd.mjs` gained an import of protocol.mjs that the list did not mention —
  # which made hubd die on startup and every agent correctly report that the
  # hub was unreachable. A list that has to be kept in step with the imports is
  # a list that will drift, so the whole directory goes in and the tests are
  # filtered out.
  botScripts = pkgs.runCommand "vibewars-bot-scripts" { } ''
    mkdir -p $out
    for f in ${../scripts/bots}/*.mjs; do
      case "$f" in *.test.mjs) continue ;; esac
      cp "$f" "$out/$(basename "$f")"
    done
  '';

  node = "${pkgs.nodejs_24}/bin/node";

  # The in-jail CLI. Deliberately has no network access of its own: it only
  # reads and writes the two bus directories bound into the sandbox.
  # GitHub, from inside the jail. Like `tg`, it speaks to a spool directory
  # rather than the network: the credential lives in hubd, outside.
  hub = pkgs.writeShellApplication {
    name = "hub";
    text = ''
      exec ${node} ${botScripts}/hub.mjs "$@"
    '';
  };

  board = pkgs.writeShellApplication {
    name = "board";
    text = ''
      exec ${node} ${botScripts}/board.mjs "$@"
    '';
  };

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
      hub
      board
    ]
  );

  # The shell the Bash tool runs, and so the parent of every command an agent
  # types. nixpkgs wraps `claude` with LD_LIBRARY_PATH=<alsa-lib>/lib (for
  # voice input), and that reaches every child: an alsa-lib built against one
  # glibc forced into a binary built against another kills it on load, which
  # is how Chromium died in every jail (issue #29). claude keeps the variable;
  # its children do not. Named `bash` because Claude Code picks its shell
  # dialect from the name.
  jailShell = pkgs.writeShellScriptBin "bash" ''
    unset LD_LIBRARY_PATH
    exec ${lib.getExe pkgs.bashInteractive} "$@"
  '';

  # The jail's entrypoint. Worktrees are created bare, and a worktree with no
  # node_modules cannot build or test anything. Run inside the jail rather
  # than by claude-bot on the host, so dependency install scripts never run
  # unsandboxed. A frozen install on an up-to-date tree takes about a second,
  # so this runs on every start and also catches a branch that changed the
  # lockfile while the agent was away. A failure is reported, not fatal: an
  # agent on a branch with a broken lockfile can still fix it. pnpm asks before
  # it rebuilds a stale node_modules, and nobody is there to answer.
  jailInit = pkgs.writeShellScript "vibewars-jail-init" ''
    if ! pnpm install --frozen-lockfile --config.confirmModulesPurge=false; then
      echo "claude-bot: warning: pnpm install failed; this worktree has no usable node_modules." >&2
    fi
    exec "$@"
  '';

  # Every role that builds or tests the game. They get the Chromium devenv.nix
  # pins, from the same `pkgs`, on PATH and as VIBEWARS_CHROMIUM, which
  # playwright.config.ts prefers. A case pattern, because the developers are
  # numbered.
  testRoles = "developer-* | asset-designer | cicd-engineer | lead-dev | perf-sec-qa | qa-tester";
  chromium = lib.getExe pkgs.chromium;

  # `claude-bot --smoke <role>` runs this inside the role's jail instead of
  # claude, as the regression check for issue #29. LD_LIBRARY_PATH is set by
  # hand, to what claude's own wrapper sets it to, because the smoke test has
  # no claude in between. /dev/shm is checked in the mount table: `stat -f`
  # says tmpfs either way, since /dev is one.
  jailSmoke = pkgs.writeShellScript "vibewars-jail-smoke" ''
    # Single-quoted commands throughout: the inner $SHELL is the one under test.
    # shellcheck disable=SC2016
    failed=0
    check() {
      if [ "$2" = "$3" ]; then
        echo "ok    $1"
      else
        echo "FAIL  $1: expected '$3', got '$2'"
        failed=1
      fi
    }

    check "the shell drops LD_LIBRARY_PATH" \
      "$(LD_LIBRARY_PATH=${lib.getLib pkgs.alsa-lib}/lib "$SHELL" -c 'printenv LD_LIBRARY_PATH || true')" ""
    check "no per-user host profile on PATH" \
      "$(case ":$PATH:" in (*:/etc/profiles/per-user/*) echo present ;; esac)" ""
    check "/dev/shm is its own mount" "$(awk '$5 == "/dev/shm" { print $9 }' /proc/self/mountinfo)" "tmpfs"
    if [ -n "''${VIBEWARS_CHROMIUM-}" ]; then
      check "chromium on PATH is VIBEWARS_CHROMIUM" "$(command -v chromium)" "$VIBEWARS_CHROMIUM"
      check "VIBEWARS_CHROMIUM renders a page" \
        "$("$SHELL" -c '"$VIBEWARS_CHROMIUM" --headless=new --no-sandbox --dump-dom "data:text/html,<p>ok</p>" 2>/dev/null')" \
        "<html><head></head><body><p>ok</p></body></html>"
    else
      echo "skip  chromium: $VIBEWARS_BOT_ROLE does not run tests"
    fi

    # Issue #61: what the host executes out of .git is read-only in here,
    # and everyday git still works. The commit happens in a throwaway
    # worktree, so the agent's own checkout is never touched.
    refused() {
      if "$SHELL" -c "$2" >/dev/null 2>&1; then
        echo "FAIL  $1: it was allowed"
        failed=1
      else
        echo "ok    $1 is refused"
      fi
    }
    common="$(git rev-parse --path-format=absolute --git-common-dir)"
    refused "git config --local" 'git config --local vibewars.smoke 1'
    refused "writing a hook" "echo x > '$common/hooks/post-checkout'"
    refused "writing info/attributes" "touch '$common/info/attributes'"
    scratch="$(mktemp -d)"
    branch="smoke-$"
    check "checkout -b from origin/main, and commit" \
      "$("$SHELL" -c "git worktree add -q -b '$branch' '$scratch/wt' origin/main &&
        git -C '$scratch/wt' commit -q --allow-empty -m smoke && echo committed" 2>&1)" \
      "committed"
    git worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true
    git branch -q -D "$branch" >/dev/null 2>&1 || true
    exit "$failed"
  '';

  # Tools only one role needs. Everything here is reachable from inside the
  # jail only because /nix/store is bind-mounted, so adding a role's tools
  # costs nothing for the other eight.
  roleTools = {
    asset-designer = with pkgs; [
      imagemagick
      inkscape
      sox
      ffmpeg
    ];
    # Judges the pipeline, so it needs the same linters CI runs.
    cicd-engineer = with pkgs; [
      actionlint
      shellcheck
      skopeo
    ];
    # GitHub's scanners are unavailable to us (Dependabot disabled, code
    # scanning needs Advanced Security), so this role's local tooling is the
    # whole of our automated security posture.
    perf-sec-qa = with pkgs; [
      semgrep
      trivy
      gitleaks
      osv-scanner
      hyperfine
    ];
  };

  # No per-user profile: it named the operator's account, and it put the
  # host's Chromium ahead of the pinned one. A host tool an agent genuinely
  # needs belongs in corePath or roleTools, from nixpkgs.
  basePath = "${corePath}:/run/current-system/sw/bin";

  # The role is a runtime shell value, not a Nix one, so the per-role PATHs are
  # emitted as a `case` and selected inside the script.
  selectPath = ''
    case "$role" in
    ${lib.concatStringsSep "\n    " (
      lib.mapAttrsToList (
        role: tools: "${role}) sandboxPath=\"${lib.makeBinPath tools}:${basePath}\" ;;"
      ) roleTools
    )}
      *) sandboxPath="${basePath}" ;;
    esac
    chromiumEnv=()
    case "$role" in
      ${testRoles})
        sandboxPath="${lib.makeBinPath [ pkgs.chromium ]}:$sandboxPath"
        chromiumEnv=(--setenv VIBEWARS_CHROMIUM "${chromium}")
        ;;
    esac
  '';

  claudeBot = ''
        # devenv does not wrap scripts in `set -e`, so without this a failing
        # step was simply ignored and the agent launched anyway. Every command
        # below either must succeed or handles failure itself.
        set -euo pipefail

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
      claude-bot --smoke <role>  check that role's jail can run the browser tests
      claude-bot --help

    Each role runs in its own bubblewrap sandbox, on its own git worktree
    (branch bot/<role>), and talks to its peers through its own Telegram topic.
    Your checkout is not mounted inside the sandbox. Any extra arguments are
    passed straight through to `claude`.

    roles:
    USAGE
          listRoles
          cat <<'USAGE'

    The company has one Telegram bot. Hiring a role needs no Telegram step:
    its forum topic is created the first time someone messages it. Add a role
    by writing .claude/bots/<name>.md — the file is that agent's charter, and
    is appended to its system prompt.

    inside the sandbox:
      tg roster                  who else is working right now
      tg inbox                   messages since you last looked
      tg wait --timeout 300      block until someone says something
      tg send <role> <text>      message one agent (mirrored into its topic)
      tg broadcast <text>        message everyone, in General

    first-time setup:
      claude-bot-setup <token-file>
          Verifies the manager bot, waits for the group, writes devenv.local.nix.

    state (all gitignored, 0600):
      .bots/registry.json        each role's forum topic, and the update offset
      .bots/bus/<role>/          that role's inbox and outbox
      .bots/wt/<role>/           that role's git worktree

    See docs/adr/0014-agent-coordination.md and docs/adr/0023-one-telegram-bot.md
    for why it is built this way.
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

        # On a restart we want the agent to pick up where it left off rather
        # than re-reading the whole world, so claude-llc-agent passes
        # --continue on every iteration after the first.
        resume=0
        if [ "''${1-}" = "--continue" ]; then
          resume=1
          shift
        fi

        # --smoke runs the jail checks instead of claude: the regression test
        # for issue #29, and the quickest way to see what an agent's shell sees.
        smoke=0
        if [ "''${1-}" = "--smoke" ]; then
          smoke=1
          shift
        fi

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
          echo "      chatId           = \"-1001234567890\";" >&2
          echo "    }; }" >&2
          exit 1
        fi
        export TELEGRAM_MANAGER_TOKEN

        if [ -z "${cfg.chatId}" ]; then
          echo "claude-bot: vibewars.telegram.chatId must be set in devenv.local.nix" >&2
          exit 1
        fi

        # Every agent gets the shared coordination contract plus its own charter.
        briefing="$(cat "$DEVENV_ROOT/.claude/bots/_protocol.md" "$brief")"

        # A system prompt gives an agent a role; it does not give it a turn.
        # Claude Code starts interactive and waits, so nine agents with
        # perfect briefings and nobody speaking to them do precisely nothing —
        # which is exactly what happened the first time the company was
        # started. The positional prompt argument is the ignition: it runs as
        # the first user turn and the session stays interactive afterwards, so
        # the operator can still type into the pane.
        #
        # Overridable: `claude-bot architect "look at issue 14"` wins, so the
        # command is still useful by hand.
        kickoff="You are the $role. Start work now, on your own, without waiting to be asked.

        First, orient yourself:
          1. \`hub whoami\` — what you are allowed to do
          2. \`tg roster\` — who else is working, and who has not been hired yet
          3. \`tg inbox\` — anything already waiting for you
          4. \`board ls\` — the state of the work

        Then do your job as described in your role briefing: pick the single
        most valuable thing you can finish end to end, do it, move the card,
        and tell whoever is next in the chain on Telegram.

        When you genuinely have nothing to do, run \`tg wait --timeout 900\` to
        block until a colleague or the operator says something, then continue.
        Do not stop and wait for a prompt; nobody is going to send you one."

        # `claude --continue` on its own reopens the conversation and then
        # waits, which would leave a restarted agent exactly as idle as an
        # unprompted one. The flag and a turn have to go together.
        if [ "$resume" = "1" ]; then
          continueFlag=(--continue)
          prompt="You were interrupted and have just been restarted. Check \`tg inbox\`
        and \`board ls\` in case something changed while you were gone, then carry on
        with the most valuable thing you can finish. If you were mid-task, finish
        that first."
        else
          continueFlag=()
          prompt="$kickoff"
        fi

        export VIBEWARS_BOT_ROOT="$DEVENV_ROOT/.bots"
        export VIBEWARS_BOT_ROLE="$role"
        export VIBEWARS_BOT_BUS="$DEVENV_ROOT/.bots/bus"
        export TELEGRAM_CHAT_ID="${cfg.chatId}"

        mkdir -p "$VIBEWARS_BOT_ROOT" "$VIBEWARS_BOT_BUS" "$VIBEWARS_BOT_ROOT/link" "$VIBEWARS_BOT_ROOT/wt"
        mkdir -p "$VIBEWARS_BOT_ROOT/hub/$role/req" "$VIBEWARS_BOT_ROOT/hub/$role/res"
        # Skills are shared and live outside every worktree on purpose: they
        # are the manager's instrument for steering the company, and if they
        # sat in the manager's worktree nobody would see a new one until it
        # was merged.
        mkdir -p "$VIBEWARS_BOT_ROOT/skills"
        chmod 700 "$VIBEWARS_BOT_ROOT"

        # claude-bot works standalone, without the company having been set up,
        # so a missing company.json is not an error here — `board` will simply
        # say so if an agent tries to use it.
        projectNumber="$(${pkgs.jq}/bin/jq -r '.project // ""' "$VIBEWARS_BOT_ROOT/company.json" 2>/dev/null || true)"
        # The board's node ids, so `board move` is a single mutation rather
        # than four lookups and a mutation (issue #17). Empty until
        # claude-llc-init has recorded them; `board move` says so then.
        boardIds="$(${pkgs.jq}/bin/jq -c '{projectId, statusField}' "$VIBEWARS_BOT_ROOT/company.json" 2>/dev/null || true)"

        # Roles this one is covering for while they have no bot. Passed in so
        # `hub whoami` can say so out loud — an agent holding both reviewer
        # seats and the merge seat is self-certifying, and that should never
        # be something it has to infer.
        acting="$(${pkgs.jq}/bin/jq -r --arg r "$role" \
          '(.acting[$r] // []) | join(",")' "$VIBEWARS_BOT_ROOT/company.json" 2>/dev/null || true)"

        # ----------------------------------------------------------------------
        # Claude's own credential, handled exactly as claude-box does: it is the
        # one real secret the jail gets, bound read-write because Claude rewrites
        # it on token refresh.
        # ----------------------------------------------------------------------
        boxDir="$HOME/.claude-bot/$role"
        mkdir -p "$boxDir/config"
        [ -e "$boxDir/claude.json" ] || printf '{}' > "$boxDir/claude.json"

        # An autonomous agent cannot answer a question, so every first-run
        # prompt has to be pre-answered or it sits at a menu forever. Three
        # separate prompts from three different mechanisms: the theme picker
        # (gated on hasCompletedOnboarding), "is this a project you trust?"
        # (per project path, set below once the worktree exists), and the
        # confirmation for --dangerously-skip-permissions itself.
        #
        # None of this grants an agent anything it would not have had after
        # the operator clicked through. It only removes the clicking.
        #
        # MERGED, not written-if-absent: a box that was once started
        # interactively already has a settings.json holding the theme the
        # operator picked, and a create-if-absent guard silently skips it —
        # which is exactly how the bypass-permissions prompt survived the
        # first attempt at this.
        [ -e "$boxDir/config/settings.json" ] || printf '{}' > "$boxDir/config/settings.json"
        if merged="$(${pkgs.jq}/bin/jq \
             '.theme //= "dark"
              | .skipDangerousModePermissionPrompt = true
              | .skipWorkflowUsageWarning = true' \
             "$boxDir/config/settings.json" 2>/dev/null)"; then
          printf '%s\n' "$merged" > "$boxDir/config/settings.json"
        fi

        creds="$HOME/.claude/.credentials.json"
        if [ ! -e "$creds" ]; then
          echo "claude-bot: $creds not found. Run 'claude' once unsandboxed to log in." >&2
          exit 1
        fi

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

        # Marks onboarding done and this worktree trusted. Merged rather than
        # overwritten, so an agent's accumulated state survives.
        claudeVersion="$(claude --version 2>/dev/null | ${pkgs.gawk}/bin/awk '{print $1}')"
        if seeded="$(${pkgs.jq}/bin/jq \
             --arg v "$claudeVersion" --arg wt "$worktree" \
             '.hasCompletedOnboarding = true
              | .lastOnboardingVersion = $v
              | .projects[$wt].hasTrustDialogAccepted = true' \
             "$boxDir/claude.json" 2>/dev/null)"; then
          printf '%s\n' "$seeded" > "$boxDir/claude.json"
        else
          echo "claude-bot: warning: could not pre-accept the first-run prompts;" >&2
          echo "claude-bot: warning: $role may stop and wait for input." >&2
        fi

        # ----------------------------------------------------------------------
        # Telegram. One sidecar for the whole company holds the one bot token
        # (docs/adr/0023-one-telegram-bot.md). Starting it is always safe: a
        # second one finds the lock and exits, so whichever claude-bot comes
        # first brings it up. setsid, so it outlives this role's pane.
        # ----------------------------------------------------------------------
        if [ "$smoke" = "0" ]; then
          ${pkgs.util-linux}/bin/setsid ${node} ${botScripts}/link.mjs serve \
            >>"$VIBEWARS_BOT_ROOT/link/serve.log" 2>&1 </dev/null &

          # This role's presence: its roster entry, which `tg roster` reads. $$ is
          # this shell's PID, which `exec` below hands to bwrap, so it stays alive
          # exactly as long as the session; presence exits when it goes. See
          # `presence` in link.mjs.
          VIBEWARS_BOT_LAUNCHER_PID="$$"
          export VIBEWARS_BOT_LAUNCHER_PID
          ${node} ${botScripts}/link.mjs presence "$role" &
          presencePid=$!
          # Covers only the gap until exec; after that, presence watches the PID.
          #
          # shellcheck disable=SC2064
          # Expanded now on purpose: $presencePid must be captured at trap-setting time.
          trap "kill $presencePid 2>/dev/null || true" EXIT INT TERM
        fi

        ${selectPath}

        # One role writes the skills; the other eight read them.
        if [ "$role" = "manager" ]; then
          skillsBind="--bind $VIBEWARS_BOT_ROOT/skills $worktree/.claude/skills"
        else
          skillsBind="--ro-bind $VIBEWARS_BOT_ROOT/skills $worktree/.claude/skills"
        fi

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
        #
        # /dev/shm gets a real tmpfs: --dev leaves it a bare directory, and
        # Chromium keeps its shared memory there. Chromium's own sandbox cannot
        # work in here, which is why playwright.config.ts passes --no-sandbox;
        # this jail is the sandbox.
        #
        # The operator's .git is bound read-write, because a worktree commits
        # into it, but the parts of it the host EXECUTES are masked read-only on
        # top (issue #61): config (fsmonitor, hooksPath, filter and diff
        # drivers, insteadOf, sshCommand), hooks, and info (attributes, which
        # select those drivers). Every git command the operator, claude-llc or
        # hubd runs in the checkout reads them, so a jail that could write them
        # could run code on the host. --ro-bind, not -try: a missing one fails
        # the start rather than leaving a hole, so they are made here first.
        # Branches therefore never write tracking config: autoSetupMerge is
        # off for every git in the jail, through the environment.
        # ----------------------------------------------------------------------
        mkdir -p "$DEVENV_ROOT/.git/hooks" "$DEVENV_ROOT/.git/info"

        if [ "$smoke" = "1" ]; then
          jailCommand=(${jailSmoke})
        else
          jailCommand=(${jailInit} claude
            --dangerously-skip-permissions
            --append-system-prompt "$briefing"
            "''${continueFlag[@]}"
            "''${@:-$prompt}")
        fi

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
          --tmpfs /dev/shm \
          --tmpfs /tmp \
          --tmpfs "/run/user/$(id -u)" \
          --tmpfs "$HOME" \
          --tmpfs "$DEVENV_ROOT" \
          --bind "$boxDir/config" "$HOME/.claude" \
          --bind "$boxDir/claude.json" "$HOME/.claude.json" \
          --bind "$creds" "$HOME/.claude/.credentials.json" \
          --ro-bind-try "$HOME/.config/git" "$HOME/.config/git" \
          --bind "$DEVENV_ROOT/.git" "$DEVENV_ROOT/.git" \
          --ro-bind "$DEVENV_ROOT/.git/config" "$DEVENV_ROOT/.git/config" \
          --ro-bind "$DEVENV_ROOT/.git/hooks" "$DEVENV_ROOT/.git/hooks" \
          --ro-bind "$DEVENV_ROOT/.git/info" "$DEVENV_ROOT/.git/info" \
          --ro-bind "$VIBEWARS_BOT_BUS" "$VIBEWARS_BOT_BUS" \
          --bind "$VIBEWARS_BOT_BUS/$role" "$VIBEWARS_BOT_BUS/$role" \
          --ro-bind "$VIBEWARS_BOT_ROOT/hub" "$VIBEWARS_BOT_ROOT/hub" \
          --bind "$VIBEWARS_BOT_ROOT/hub/$role" "$VIBEWARS_BOT_ROOT/hub/$role" \
          --bind "$worktree" "$worktree" \
          $skillsBind \
          --chdir "$worktree" \
          --setenv HOME "$HOME" \
          --setenv USER "$USER" \
          --setenv SHELL "${jailShell}/bin/bash" \
          --setenv PATH "$sandboxPath" \
          --setenv TERM "''${TERM:-xterm-256color}" \
          --setenv LANG "''${LANG:-C.UTF-8}" \
          --setenv COLORTERM "''${COLORTERM:-truecolor}" \
          --setenv XDG_RUNTIME_DIR "/run/user/$(id -u)" \
          --setenv VIBEWARS_BOT_ROLE "$role" \
          --setenv VIBEWARS_BOT_BUS "$VIBEWARS_BOT_BUS" \
          --setenv VIBEWARS_HUB "$VIBEWARS_BOT_ROOT/hub/$role" \
          --setenv VIBEWARS_PROJECT "$projectNumber" \
          --setenv VIBEWARS_BOARD "$boardIds" \
          --setenv VIBEWARS_ACTING "$acting" \
          --setenv VIBEWARS_ENV "development" \
          --setenv GIT_CONFIG_COUNT 1 \
          --setenv GIT_CONFIG_KEY_0 branch.autoSetupMerge \
          --setenv GIT_CONFIG_VALUE_0 false \
          "''${chromiumEnv[@]}" \
          -- "''${jailCommand[@]}"
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

    chatId = lib.mkOption {
      type = lib.types.str;
      default = "";
      example = "-1001234567890";
      description = ''
        Numeric id of the forum supergroup the company lives in. Topics must
        be enabled on it, and the bot must be an admin there with
        `can_manage_topics`.
      '';
    };

  };

  config = {
    packages = [
      pkgs.bubblewrap
      pkgs.claude-code
      # Also on the dev shell's PATH, not just the sandbox's: when an agent
      # reports that `hub` refused something, the quickest way to understand
      # why is to run the same command yourself.
      tg
      hub
      board
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
