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

  # `company reboot "<reason>"`: the manager reboots the company onto new
  # main (#21). A hub request like any other; the policy says who may.
  company = pkgs.writeShellApplication {
    name = "company";
    text = ''
      exec ${node} ${botScripts}/hub.mjs company "$@"
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
      company
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

  # The jails' shared resource budget (#358, ADR-0015): one systemd user slice
  # that every jail's scope is placed in, so the limits are for all jails
  # together and no agent has a fixed share. Runtime properties: they last
  # until reboot and touch nothing under ~/.config. The host's systemctl, not
  # one from nixpkgs: it has to talk to the running user manager. A host that
  # cannot enforce the cap (no user manager, no memory delegation) is refused
  # with a plain message; an unlimited jail is never started quietly.
  jailSlice = pkgs.writeShellScript "vibewars-jail-slice" ''
    systemctl="$(command -v systemctl || true)"
    if [ -z "$systemctl" ]; then
      echo "claude-bot: no systemctl on PATH; the jails' resource cap cannot be set, so no jail starts." >&2
      exit 1
    fi
    cpus="$(${pkgs.coreutils}/bin/nproc)"
    if ! "$systemctl" --user set-property --runtime vibewars-jails.slice \
      MemoryMax=90% MemoryHigh=85% MemorySwapMax=0 \
      CPUQuota="$(( cpus * 90 ))%" CPUWeight=20 IOWeight=20 TasksMax=8192; then
      echo "claude-bot: could not set the jails' resource cap (is the systemd user manager running?), so no jail starts." >&2
      exit 1
    fi
    # A property stored on the slice proves nothing: without the controller
    # delegated to the user manager the kernel ignores it. So ask the
    # manager's own cgroup which controllers it has.
    managerCgroup="$("$systemctl" show "user@$(${pkgs.coreutils}/bin/id -u).service" -p ControlGroup --value)"
    controllers="$(cat "/sys/fs/cgroup$managerCgroup/cgroup.controllers" 2>/dev/null || true)"
    for controller in memory pids cpu; do
      case " $controllers " in
        (*" $controller "*) ;;
        (*)
          echo "claude-bot: the systemd user manager does not have the $controller controller delegated; the jails would be uncapped, so no jail starts." >&2
          exit 1
          ;;
      esac
    done
  '';

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
    # and everyday git still works. Issue #69: so are the other worktrees'
    # admin dirs, but not this one's. The commit is made with plumbing onto
    # a throwaway branch, so the agent's own checkout is never touched, and
    # nothing here would destroy anything if a check failed.
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
    refused "adding a worktree" "mkdir '$common/worktrees/smoke-$$'"
    for other in "$common"/worktrees/*/; do
      other="''${other%/}"
      [ "$other" = "$common/worktrees/$VIBEWARS_BOT_EMPLOYEE" ] && continue
      refused "writing another worktree's HEAD" "touch '$other/HEAD'"
      break
    done
    check "auto-gc never prunes worktrees" "$(git config gc.worktreePruneExpire)" "never"
    own="$(git rev-parse --absolute-git-dir)"
    check "this worktree's admin dir is writable" \
      "$("$SHELL" -c "touch '$own/smoke-$$' && rm '$own/smoke-$$' && echo writable" 2>&1)" \
      "writable"
    branch="smoke-$$"
    check "commit onto a new branch" \
      "$("$SHELL" -c "c=\$(git commit-tree -m smoke 'HEAD^{tree}' -p HEAD) &&
        git update-ref 'refs/heads/$branch' \"\$c\" && echo committed" 2>&1)" \
      "committed"
    git update-ref -d "refs/heads/$branch" >/dev/null 2>&1 || true

    # #358: the launch line has the kernel kill a jailed process before any
    # host process, and runs it at lower priority than the host's own. The
    # slice itself cannot be seen from here (the jail has its own cgroup
    # namespace, so /proc/self/cgroup says "/"): see docs/adr/0015.
    check "oom_score_adj is 1000" "$(cat /proc/self/oom_score_adj)" "1000"
    check "oom_score_adj is 1000 in a grandchild" \
      "$("$SHELL" -c 'cat /proc/self/oom_score_adj')" "1000"
    check "nice is 10" "$(${pkgs.coreutils}/bin/nice)" "10"
    refused "lowering nice back to 0" '${pkgs.util-linux}/bin/renice -n 0 $$'
    check "core dumps are off" "$(ulimit -c)" "0"
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
            echo "claude-bot: warning: re-enter the shell with devenv shell --refresh-eval-cache to pick it up." >&2
            break
          fi
        done

        usage() {
          cat <<'USAGE'
    claude-bot — run a sandboxed Claude agent in a role, coordinating over Telegram

    usage:
      claude-bot [--resume <session-id>] <employee> [claude args...]
      claude-bot --smoke <employee>  check that employee's jail can run the browser tests
      claude-bot --slice         set the jails' shared resource cap and exit
      claude-bot --help

    An employee is a role's first seat, its bare name (qa-tester), or a
    further one, <role>@<n> (qa-tester@2). Each runs in its own bubblewrap
    sandbox, on its own git worktree (detached at main), and talks to its peers through its inbox; Telegram
    carries the operator's copy. Your checkout is not mounted inside the
    sandbox. Any extra arguments are passed straight through to `claude`.

    One run is one turn: `claude -p`, printing stream-json, exiting when the
    agent ends its turn. claude-llc-agent runs turn after turn and shows them
    readably (ADR-0027).

    roles:
    USAGE
          listRoles
          cat <<'USAGE'

    The company has one Telegram bot. Hiring a role needs no Telegram step:
    it has no topic of its own, and the operator addresses it as
    "<role>: ...". Add a role by writing .claude/bots/<name>.md — the file is
    that agent's charter, and is appended to its system prompt. A first
    line of `---`, then `model: claude-…` and `---`, picks its model;
    without one it runs on claude-opus-5-5.

    inside the sandbox:
      tg roster                  who else is working right now
      tg inbox                   messages since you last looked
      tg wait --timeout 300      block until someone says something
      tg send <role> <text>      message one agent (mirrored into 🤖 Bots)
      tg send operator <text>    manager only: answer the operator in 📋 Manager
      tg broadcast <text>        message everyone, in General

    first-time setup:
      claude-bot-setup <token-file>
          Verifies the manager bot, waits for the group, writes devenv.local.nix.

    state (all gitignored, 0600):
      .bots/registry.json        the Bots, Manager and Operator topics, and the
                                 update offset
      .bots/bus/<role>/          that role's inbox and outbox
      .bots/wt/<employee>/       that employee's git worktree
      .bots/hub/<employee>/      that employee's GitHub spool

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

        # Every turn after the first resumes the role's conversation, so an
        # agent picks up where it left off rather than re-reading the whole
        # world. agent-turn.mjs passes the id it recorded (#146).
        resume=""
        if [ "''${1-}" = "--resume" ]; then
          resume="''${2-}"
          shift 2
        fi

        # --smoke runs the jail checks instead of claude: the regression test
        # for issue #29, and the quickest way to see what an agent's shell sees.
        # --slice sets the shared resource cap for every jail (jailSlice) and
        # exits; claude-llc start runs it once before any window opens.
        if [ "''${1-}" = "--slice" ]; then
          exec ${jailSlice}
        fi

        smoke=0
        if [ "''${1-}" = "--smoke" ]; then
          smoke=1
          shift
        fi

        # The employee (#62): `qa-tester`, the role's first seat, or
        # `qa-tester@2`. Permissions, briefing and Telegram are the role's;
        # the worktree, the hub spool and the push prefix are the employee's.
        employee="''${1-}"
        if [ -z "$employee" ]; then
          usage >&2
          exit 2
        fi
        shift
        role="''${employee%%@*}"
        seat="''${employee#"$role"}"

        case "$role" in
          "" | *[!a-z0-9-]* | -* | _*)
            echo "claude-bot: a role is a plain name: [a-z0-9-]+, no leading dash or underscore." >&2
            echo "claude-bot: got: $employee" >&2
            echo "claude-bot: try: claude-bot --help" >&2
            exit 2
            ;;
        esac
        case "$seat" in
          "" | @[2-9] | @[1-9][0-9] | @[1-9][0-9][0-9]) ;;
          *)
            echo "claude-bot: a further employee is <role>@<n>, n from 2: qa-tester@2." >&2
            echo "claude-bot: got: $employee" >&2
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

        # The role's model, from its briefing's frontmatter, or the default
        # (#322). One that is not a model id stops the start, loudly.
        model="$(${node} ${botScripts}/briefing.mjs model "$brief")" || exit 2

        # Every agent gets the shared coordination contract plus its own
        # charter, without the charter's frontmatter.
        briefing="$(cat "$DEVENV_ROOT/.claude/bots/_protocol.md"; ${node} ${botScripts}/briefing.mjs body "$brief")"

        # A system prompt gives an agent a role; it does not give it a turn.
        # The positional prompt argument is the turn: claude -p runs it and
        # exits when the agent ends its turn, and claude-llc-agent starts the
        # next one (ADR-0027). Nobody types into the pane; Telegram is the
        # only input.
        #
        # Overridable: `claude-bot architect "look at issue 14"` wins, so the
        # command is still useful by hand.
        kickoff="You are the $role. Start work now, on your own, without waiting to be asked.

        First, orient yourself:
          1. \`tg roster\` — who else is working, and who has not been hired yet
          2. \`tg inbox\` — anything already waiting for you
          3. \`board ls\` — the state of the work

        Then do your job as described in your role briefing: pick the single
        most valuable thing you can finish end to end, do it, move the card,
        and tell whoever is next in the chain on Telegram.

        When you genuinely have nothing to do, run \`tg wait --timeout 540\` (Bash timeout 600000) to
        block until a colleague or the operator says something, then continue.
        Do not stop and wait for a prompt; nobody is going to send you one."

        # After a company reboot, claude-llc hands the manager what it loaded
        # (scripts/bots/restart.mjs), for the manager to pass on.
        if [ -n "''${VIBEWARS_KICKOFF_NOTE-}" ]; then
          kickoff="$kickoff

        The company was just rebooted: $VIBEWARS_KICKOFF_NOTE
        Tell everyone with \`tg broadcast\` first, word for word."
        fi

        # A resumed conversation needs a turn too, or claude -p has nothing
        # to run. It is the same prompt whether the last turn ended on its
        # own or someone pressed Ctrl-C.
        if [ -n "$resume" ]; then
          resumeFlag=(--resume "$resume")
          prompt="Your last turn ended and this is the next one. Check \`tg inbox\`
        and \`board ls <your column>\` in case something changed, then carry on
        with the most valuable thing you can finish. If you were mid-task,
        finish that first.
        Do not end your turn while waiting on background work or a colleague:
        block on it, or on \`tg wait --timeout 540\` (Bash timeout 600000), instead."
        else
          resumeFlag=()
          prompt="$kickoff"
        fi

        export VIBEWARS_BOT_ROOT="$DEVENV_ROOT/.bots"
        export VIBEWARS_BOT_EMPLOYEE="$employee"
        export VIBEWARS_BOT_ROLE="$role"
        export VIBEWARS_BOT_BUS="$DEVENV_ROOT/.bots/bus"
        export TELEGRAM_CHAT_ID="${cfg.chatId}"

        mkdir -p "$VIBEWARS_BOT_ROOT" "$VIBEWARS_BOT_BUS" "$VIBEWARS_BOT_ROOT/link" "$VIBEWARS_BOT_ROOT/wt"
        mkdir -p "$VIBEWARS_BOT_ROOT/hub/$employee/req" "$VIBEWARS_BOT_ROOT/hub/$employee/res"
        # Main's skills, which hubd exports here after each fetch (#27). Made
        # now so the bind below has something to bind before hubd's first run.
        mkdir -p "$VIBEWARS_BOT_ROOT/skills-main"
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
        boxDir="$HOME/${config.vibewars.claudeBot.boxes}/$employee"
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
        # Created, or repaired if its admin dir is gone, here on the host: the
        # jail cannot write .git/worktrees (#69, see the binds below).
        worktree="$VIBEWARS_BOT_ROOT/wt/$employee"
        ${node} ${botScripts}/worktree.mjs "$DEVENV_ROOT" "$employee" ${config.git-hooks.configFile}

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
          echo "claude-bot: warning: $employee may stop and wait for input." >&2
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

        # Skills are versioned in the repository, in .claude/bots/skills/, and
        # loaded as the jail's user-level ~/.claude/skills, never from a
        # worktree's .claude/skills (#27): every agent gets main's merged copy,
        # live, with nothing in its worktree changing. The manager, who writes
        # them, gets its own branch's drafts instead, read-only like everyone
        # else's: they change by commit, through review. The manager controls
        # its worktree, so the drafts directory is checked first: a symlink
        # anywhere in .claude/bots/skills would make bwrap bind whatever it
        # points at on the host, such as the operator's home.
        if [ "$role" = "manager" ]; then
          if ! drafts="$(${node} ${botScripts}/skills-drafts.mjs "$worktree")"; then
            echo "claude-bot: refusing to start $role: its draft skills are not a plain directory in its worktree" >&2
            exit 1
          fi
          skillsBind=(--ro-bind "$drafts" "$HOME/.claude/skills")
        else
          skillsBind=(--ro-bind "$VIBEWARS_BOT_ROOT/skills-main" "$HOME/.claude/skills")
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
        #
        # .git/worktrees is read-only too, except this role's own admin dir
        # (#69). A jail sees only its own worktree, so to git every other one
        # looks deleted, and one `git worktree prune` in a jail once removed
        # the admin dir of every other agent's worktree. Now that fails with
        # EROFS, and so does writing another worktree's HEAD or index. The
        # order matters: bwrap applies binds in sequence, so the rw bind of
        # the role's own dir goes after the ro one. gc.worktreePruneExpire
        # keeps an auto-gc from even trying.
        # ----------------------------------------------------------------------
        mkdir -p "$DEVENV_ROOT/.git/hooks" "$DEVENV_ROOT/.git/info"

        if [ "$smoke" = "1" ]; then
          jailCommand=(${jailSmoke})
        else
          # Print mode cannot show a permission prompt, so the skip is
          # required, and nobody can answer AskUserQuestion: questions go
          # through `tg ask`. --disallowedTools takes several values, so an
          # option has to follow it, or it would swallow the prompt.
          jailCommand=(${jailInit} claude
            -p --output-format stream-json --verbose
            --dangerously-skip-permissions
            --disallowedTools AskUserQuestion
            --model "$model"
            --append-system-prompt "$briefing"
            "''${resumeFlag[@]}"
            "''${@:-$prompt}")
        fi

        # Every jail, smoke included, starts in the shared slice (#358) with the
        # kernel's OOM killer told to take it first, at a lower priority than
        # the host and without core dumps. Each wrapper execs, so $$ is still
        # the jail's PID for the presence process and the turn runner. Only
        # what is forked above (the Telegram sidecar, presence) is outside the
        # slice, and hubd and the supervisor are never started from here. No
        # memory.oom.group: the biggest process dies, not the whole session.
        ${jailSlice} || exit 1
        systemdRun="$(command -v systemd-run || true)"
        if [ -z "$systemdRun" ]; then
          echo "claude-bot: no systemd-run on PATH; the jail cannot be capped, so it does not start." >&2
          exit 1
        fi
        exec "$systemdRun" --user --scope --quiet --collect \
          --unit="vibewars-jail-''${employee/@/-}-$$" --slice=vibewars-jails.slice \
          -- ${pkgs.util-linux}/bin/choom -n 1000 \
          -- ${pkgs.coreutils}/bin/nice -n 10 \
          -- ${pkgs.util-linux}/bin/prlimit --core=0 \
          -- ${bwrap} \
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
          --ro-bind "$DEVENV_ROOT/.git/worktrees" "$DEVENV_ROOT/.git/worktrees" \
          --bind "$DEVENV_ROOT/.git/worktrees/$employee" "$DEVENV_ROOT/.git/worktrees/$employee" \
          --ro-bind "$VIBEWARS_BOT_BUS" "$VIBEWARS_BOT_BUS" \
          --bind "$VIBEWARS_BOT_BUS/$role" "$VIBEWARS_BOT_BUS/$role" \
          --ro-bind "$VIBEWARS_BOT_ROOT/hub" "$VIBEWARS_BOT_ROOT/hub" \
          --bind "$VIBEWARS_BOT_ROOT/hub/$employee" "$VIBEWARS_BOT_ROOT/hub/$employee" \
          --bind "$worktree" "$worktree" \
          "''${skillsBind[@]}" \
          --chdir "$worktree" \
          --setenv HOME "$HOME" \
          --setenv USER "$USER" \
          --setenv SHELL "${jailShell}/bin/bash" \
          --setenv PATH "$sandboxPath" \
          --setenv TERM "''${TERM:-xterm-256color}" \
          --setenv LANG "''${LANG:-C.UTF-8}" \
          --setenv COLORTERM "''${COLORTERM:-truecolor}" \
          --setenv XDG_RUNTIME_DIR "/run/user/$(id -u)" \
          --setenv VIBEWARS_BOT_EMPLOYEE "$employee" \
          --setenv VIBEWARS_BOT_ROLE "$role" \
          --setenv VIBEWARS_BOT_BUS "$VIBEWARS_BOT_BUS" \
          --setenv VIBEWARS_HUB "$VIBEWARS_BOT_ROOT/hub/$employee" \
          --setenv VIBEWARS_PROJECT "$projectNumber" \
          --setenv VIBEWARS_BOARD "$boardIds" \
          --setenv VIBEWARS_ACTING "$acting" \
          --setenv VIBEWARS_ENV "development" \
          --setenv GIT_CONFIG_COUNT 2 \
          --setenv GIT_CONFIG_KEY_0 branch.autoSetupMerge \
          --setenv GIT_CONFIG_VALUE_0 false \
          --setenv GIT_CONFIG_KEY_1 gc.worktreePruneExpire \
          --setenv GIT_CONFIG_VALUE_1 never \
          "''${chromiumEnv[@]}" \
          -- "''${jailCommand[@]}"
  '';
in
{
  options.vibewars.claudeBot = {
    # Off in CI: the checks need the toolchain, not the agent tooling, and
    # claude-code alone is a large unfree download. CI writes a
    # devenv.local.nix that sets this to false; see .github/actions/devenv.
    enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Whether to put claude-bot, claude-llc and their tools (claude-code,
        bubblewrap, tg, hub, board, tmux) into the shell.
      '';
    };

    # Where each role's Claude keeps its config and session logs, as
    # `$HOME/<boxes>/<role>/config`: claude-bot makes them, and claude-llc's
    # dashboard reads the logs for tokens per role (#50).
    boxes = lib.mkOption {
      type = lib.types.str;
      default = ".claude-bot";
      readOnly = true;
      description = ''
        The directory under $HOME holding one Claude config dir per role.
      '';
    };
  };

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

  config = lib.mkIf config.vibewars.claudeBot.enable {
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
