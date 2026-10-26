{
  pkgs,
  lib,
  config,
  ...
}:

let
  node = "${pkgs.nodejs_24}/bin/node";
  tmux = lib.getExe pkgs.tmux;
  tg = config.vibewars.telegram;

  # Same staging as claude-bot.nix: copied into the store so that an agent
  # cannot change what the orchestrator and the daemon holding the credential
  # actually run. The duplication is deliberate — these two modules are
  # independent, and claude-bot works on its own without the company.
  # Every script, staged as one directory.
  #
  # This was a hand-written list of `cp` lines, and it went wrong twice: once
  # when a lone file was staged without the module it imports, and again when
  # `hubd.mjs` gained an import of protocol.mjs that the list did not mention —
  # which made hubd die on startup and every agent correctly report that the
  # hub was unreachable. A list that has to be kept in step with the imports is
  # a list that will drift, so the whole directory goes in and the tests are
  # filtered out.
  #
  # With them goes `build-manifest.json`: what this build was built from
  # (#557). Every claude-llc compares it with the checkout and rebuilds
  # itself when they differ, because a shell keeps the store paths it was
  # entered with, and a `git pull` changes nothing about them. The inputs are
  # copied into a tree laid out as the checkout is, so the build and the
  # runtime check run fingerprint.mjs's one function over one layout.
  llcScripts = pkgs.runCommand "vibewars-llc-scripts" { } ''
    mkdir -p $out
    for f in ${../scripts/bots}/*.mjs; do
      case "$f" in *.test.mjs) continue ;; esac
      cp "$f" "$out/$(basename "$f")"
    done

    tree="$(mktemp -d)"
    mkdir -p "$tree/scripts/bots" "$tree/nix"
    cp ${../scripts/bots}/*.mjs "$tree/scripts/bots/"
    cp ${../nix}/*.nix "$tree/nix/"
    cp ${../devenv.nix} "$tree/devenv.nix"
    cp ${../devenv.yaml} "$tree/devenv.yaml"
    cp ${../devenv.lock} "$tree/devenv.lock"
    ${node} $out/fingerprint.mjs manifest "$tree" >$out/build-manifest.json
  '';

  # The org chart, in the order the windows are created: dashboard 0, then
  # the manager 1 and the architect 2. The session opens on the dashboard,
  # which says what the company is doing at a glance (#165); the manager,
  # where feature requests go, is one window over.
  roles = [
    "manager"
    "architect"
    "developer-1"
    "developer-2"
    "asset-designer"
    "cicd-engineer"
    "lead-dev"
    "perf-sec-qa"
    "qa-tester"
  ];

  session = "vibewars-llc";

  # `range=user|X` marks a clickable span and puts X in mouse_status_range.
  # Every such click arrives on the same `Status` mouse key, so this dispatches
  # on the value — and it has to handle "window" too, because overriding
  # MouseDown1Status otherwise breaks clicking a window name to switch to it,
  # which is how you move between employees.
  # Kept in a file rather than a heredoc inside the script. A heredoc in a Nix
  # `''` string is a trap: Nix strips the minimum indentation found across the
  # whole string, so a single under-indented line anywhere leaves the `USAGE`
  # terminator indented, the heredoc never ends, and the script dies with a
  # syntax error at its last line. Which is exactly what happened.
  llcUsage = pkgs.writeText "claude-llc-usage.txt" ''
    claude-llc — a company of nine Claude agents building VibeWars

    usage:
      claude-llc              bring the company up and attach
      claude-llc status       what is running, without attaching
      claude-llc stop         stop everything
      claude-llc up           bring the company up without attaching (a reboot uses this)
      claude-llc reboot --abort  cancel a reboot the manager scheduled
      claude-llc --help

    One tmux window per role (a pane per employee) plus a dashboard. The session opens on the
    dashboard: the board, the company and the Telegram feed. Window 1 is the
    manager, where you describe what you want built: say it to the manager and
    it becomes issues, which the architect specs and the board carries to main
    without you.

    Running it again attaches to the company already running rather than
    starting a second one. Bottom-right of the status bar has clickable
    "detach" (leave it running) and "stop" (shut every agent down). Ctrl-C in
    an employee's window restarts just that employee, keeping its memory.

    After company code changes land on main, the manager can reboot the
    company onto it (`company reboot "<reason>"`): everyone is told, gets up
    to ten minutes to commit and run `company ready`, and the company comes
    back on the new main, if your checkout is a clean main that
    fast-forwards to it. `claude-llc reboot --abort` cancels it.

    Employees coordinate over the Telegram group and take their work from the
    GitHub Projects board. Inside each sandbox: `tg` for colleagues, `board`
    for the kanban, `hub` for GitHub. The GitHub credential is NOT in the
    sandboxes — `hubd` holds it out here and enforces what each role may do.

    first time:
      claude-llc-init         create the board, protect main, write company.json
      CLAUDE_LLC_ROLES="..."  employ only these roles (default: all of them);
                              later boots start who .bots/staff.json employs

    See docs/adr/0015-agent-company.md.
  '';

  llcTmuxConf = pkgs.writeText "claude-llc.tmux" ''
    bind-key -n MouseDown1Status {
      if-shell -F "#{==:#{mouse_status_range},detach}" {
        detach-client
      }
      if-shell -F "#{==:#{mouse_status_range},stop}" {
        confirm-before -p "Shut the company down? All agents stop. (y/n) " {
          run-shell -b "claude-llc stop"
        }
      }
      if-shell -F "#{==:#{mouse_status_range},window}" {
        select-window -t=
      }
    }
  '';

  # The last step of a company reboot (#21), started by the supervisor in a
  # session of its own: see scripts/bots/restart.mjs.
  # It holds the bot token, as the Telegram sidecar does, for one message:
  # if the company does not come back up, no sidecar is left to carry one.
  restarter = pkgs.writeShellScript "claude-llc-restart" ''
    tokenFile="${lib.optionalString (tg.managerTokenFile != null) (toString tg.managerTokenFile)}"
    if [ -n "$tokenFile" ] && [ -r "$tokenFile" ]; then
      TELEGRAM_MANAGER_TOKEN="$(tr -d '[:space:]' < "$tokenFile")"
    else
      TELEGRAM_MANAGER_TOKEN="${lib.optionalString (tg.managerToken != null) tg.managerToken}"
    fi
    export TELEGRAM_MANAGER_TOKEN
    export TELEGRAM_CHAT_ID="${tg.chatId}"
    exec ${node} ${llcScripts}/restart.mjs
  '';

  claudeLlc = ''
        set -euo pipefail

        SESSION="${session}"
        export VIBEWARS_LLC_SESSION="$SESSION"
        export VIBEWARS_BOT_ROOT="$DEVENV_ROOT/.bots"
        # Where each role's Claude logs are, for the dashboard's tokens (#50).
        export VIBEWARS_CLAUDE_BOXES="$HOME/${config.vibewars.claudeBot.boxes}"

        usage() {
      cat ${llcUsage}
    }

        # The hub window (#23), last in the session: hubd and the supervisor,
        # each under run-forever. This is the only way either daemon starts,
        # and it opens first so hubd is answering before any agent asks it
        # anything. scripts/bots/hub-window.mjs has the rest.
        export VIBEWARS_TMUX="${tmux}"
        export VIBEWARS_LLC_RESTART="${restarter}"
        hub_window() {
          mkdir -p "$VIBEWARS_BOT_ROOT/hub"
          ${node} ${llcScripts}/hub-window.mjs open
          echo "claude-llc: hubd and supervisor started in the hub window (logs: .bots/hub/)"
        }

        # One employee's pane (#383, #722), the only way an agent starts:
        # start-employee.mjs has the rules. If VIBEWARS_KICKOFF_NOTE is set,
        # this agent gets the reboot note.
        start_employee() {
          ${node} ${llcScripts}/start-employee.mjs "$1"
        }

        # The loops first, so stopping a daemon does not restart it.
        stop_daemons() {
          pkill -f run-forever.mjs 2>/dev/null || true
          pkill -f hubd.mjs 2>/dev/null || true
          pkill -f supervisor.mjs 2>/dev/null || true
        }

        # The build the running company was started from, against the
        # checkout: one `build: ...` line, and exit 3 if it is stale (#557).
        running_build() {
          local build
          build="$(${tmux} show-environment -t "=$SESSION" VIBEWARS_LLC_BUILD 2>/dev/null)" || {
            echo "build: unknown (the session does not say)"
            return 0
          }
          ${node} ${llcScripts}/fingerprint.mjs status "''${build#*=}" "$DEVENV_ROOT"
        }

        # A shell keeps the store paths it was entered with, so a claude-llc
        # typed after a `git pull` or a merged reboot builds the company from
        # old code (#557). If this build is not the checkout's, rebuild from
        # the checkout and run that instead, once: the guard survives `devenv
        # shell`, and is unset here so it never reaches the session, where a
        # reboot's restarter must be free to rebuild too.
        reexec="''${VIBEWARS_LLC_REEXEC-}"
        unset VIBEWARS_LLC_REEXEC
        case "''${1-}" in
          -h | --help | start-employee) ;;
          *)
            stale=0
            differ="$(${node} ${llcScripts}/fingerprint.mjs check ${llcScripts} "$DEVENV_ROOT" 2>&1)" || stale=$?
            if [ "$stale" = 3 ] && [ -z "$reexec" ]; then
              count="$(printf '%s\n' "$differ" | wc -l)"
              if [ "$count" = 1 ]; then files="1 file differs"; else files="$count files differ"; fi
              echo "claude-llc: this build is stale ($files), rebuilding from the checkout" >&2
              # As the restarter's devenv(): a shell built from the checkout
              # and nothing else. VIBEWARS_REBOOTED stays, if it is set.
              cd "$DEVENV_ROOT"
              for name in $(compgen -e); do
                case "$name" in DEVENV_* | IN_NIX_SHELL) unset "$name" ;; esac
              done
              # And the host's PATH: devenv prepends to the one it finds, so
              # this shell's entries would come along (host-path.mjs).
              PATH="$(${node} ${llcScripts}/host-path.mjs)"
              export VIBEWARS_LLC_REEXEC=1
              exec devenv shell --refresh-eval-cache -- claude-llc "$@"
            elif [ "$stale" = 3 ]; then
              echo "claude-llc: still stale after a rebuild: $(printf '%s\n' "$differ" | paste -sd ' '); running anyway" >&2
            elif [ "$stale" != 0 ]; then
              echo "claude-llc: warning: could not compare this build with the checkout: $differ" >&2
            fi
            ;;
        esac

        attach=1

        case "''${1-}" in
          -h | --help)
            usage
            exit 0
            ;;
          status)
            if ${tmux} has-session -t "=$SESSION" 2>/dev/null; then
              echo "session $SESSION is up:"
              ${tmux} list-windows -t "=$SESSION" -F '  #{window_index} #{window_name}'
              echo "  $(running_build)"
            else
              echo "session $SESSION is not running"
            fi
            for d in hubd supervisor; do
              if pgrep -f "run-forever.mjs $d" >/dev/null 2>&1; then echo "  $d: running (restarted on exit)"; else echo "  $d: stopped"; fi
            done
            # Running, and its heartbeat fresh: a hung sidecar is stopped too (#583).
            # Red when it is not, since every agent message waits on it.
            if pgrep -f "link.mjs serve" >/dev/null 2>&1 && ${node} ${llcScripts}/sidecar.mjs fresh "$VIBEWARS_BOT_ROOT/bus"; then
              echo "  telegram: running"
            else
              printf "  \033[1;31mtelegram: stopped\033[0m\n"
            fi
            exit 0
            ;;
          up)
            attach=0
            ;;
          start-employee)
            # The supervisor's way to start a hired employee (#383).
            if [ -z "''${2-}" ]; then
              echo "claude-llc: usage: claude-llc start-employee <employee>" >&2
              exit 2
            fi
            if ! ${tmux} has-session -t "=$SESSION" 2>/dev/null; then
              echo "claude-llc: $SESSION is not running" >&2
              exit 1
            fi
            start_employee "$2"
            exit 0
            ;;
          reboot)
            if [ "''${2-}" != "--abort" ]; then
              echo "claude-llc: usage: claude-llc reboot --abort (the manager schedules reboots)" >&2
              exit 2
            fi
            if [ -e "$VIBEWARS_BOT_ROOT/reboot.json" ]; then
              # Removing the record is the abort; the supervisor stops
              # draining. Everyone is told the way the manager would tell
              # them: a broadcast from the manager's outbox.
              rm -f "$VIBEWARS_BOT_ROOT/reboot.json"
              outbox="$VIBEWARS_BOT_ROOT/bus/manager/outbox"
              name="$(date +%s%3N)-operator-abort.json"
              mkdir -p "$outbox"
              echo '{"to":"all","text":"The company reboot is aborted (operator). Carry on."}' >"$outbox/.$name.part"
              mv "$outbox/.$name.part" "$outbox/$name"
              echo "reboot aborted; everyone is told"
            else
              echo "no reboot is scheduled"
            fi
            exit 0
            ;;
          stop)
            # Before the session goes: the supervisor must not restart the
            # manager into a company being stopped (#384).
            touch "$VIBEWARS_BOT_ROOT/stopping"
            ${tmux} kill-session -t "=$SESSION" 2>/dev/null && echo "stopped $SESSION" || echo "$SESSION was not running"
            stop_daemons
            echo "stopped hubd and supervisor"
            pkill -f "link.mjs serve" 2>/dev/null && echo "stopped the Telegram sidecar" || true
            exit 0
            ;;
          "") ;;
          *)
            echo "claude-llc: unknown argument: $1" >&2
            echo "claude-llc: try claude-llc --help" >&2
            exit 2
            ;;
        esac

        # A reboot in progress has the company stopped on purpose. Starting
        # one into that gap is how a reboot ended up on the old code
        # (#557): wait for it instead, then join what it brought up, or say
        # it failed. The restarter's own `up` is let through.
        waited=0
        ${node} ${llcScripts}/reboot-wait.mjs || waited=$?

        if [ ! -e "$VIBEWARS_BOT_ROOT/company.json" ]; then
          echo "claude-llc: the company has not been set up yet." >&2
          echo "claude-llc: run claude-llc-init first." >&2
          exit 1
        fi

        # Starting the company twice would build a second set of sandboxes and
        # a second sidecar per role — and two sidecars on one bot token means
        # 409 Conflict and a deaf agent. So a running session is joined, never
        # duplicated.
        if ${tmux} has-session -t "=$SESSION" 2>/dev/null; then
          # A reboot's restarter stopped the session before it ran this. If
          # it is still here, joining it would bring the company back on the
          # old code and call that a reboot (#315): fail, so the restarter
          # stops it again and says so.
          if [ -n "''${VIBEWARS_REBOOTED-}" ]; then
            echo "claude-llc: $SESSION is still running after the restarter stopped it; not joining it." >&2
            exit 1
          fi
          echo "claude-llc: $SESSION is already running; attaching to it."
          if ! line="$(running_build)"; then
            echo "claude-llc: the running company's $line" >&2
          fi

          # run-forever brings a daemon back on its own, but not its window:
          # if someone closed it, open it again, or you attach to a company
          # whose GitHub access silently does not work.
          if ! ${node} ${llcScripts}/hub-window.mjs check; then
            echo "claude-llc: the hub window was gone; opening it again."
            stop_daemons
            hub_window
          fi

          if [ "$attach" = 0 ]; then
            exit 0
          fi
          exec ${tmux} attach-session -t "$SESSION"
        fi

        # The reboot this waited for did not bring the company up. Never
        # start one in its place: the operator runs claude-llc again, on
        # purpose, once they have read why.
        if [ "$waited" = 4 ]; then
          echo "claude-llc: the reboot did not bring the company back up: $(${lib.getExe pkgs.jq} -r '.note // "no note"' "$VIBEWARS_BOT_ROOT/boot.json" 2>/dev/null || echo "boot.json unreadable")" >&2
          echo "claude-llc: run claude-llc again to start it." >&2
          exit 1
        fi

        # ------------------------------------------------------------------------
        # Which roles to start. With one Telegram bot for the company
        # (docs/adr/0023-one-telegram-bot.md) hiring needs no setup, so every
        # role can start. Nine agents is a real cost, so CLAUDE_LLC_ROLES can
        # name a subset, e.g. CLAUDE_LLC_ROLES="manager architect developer-1".
        # That subset only seeds .bots/staff.json on the first boot (#62);
        # from then on the company starts who staff.json employs, and the
        # manager hires and fires.
        # ------------------------------------------------------------------------
        seed="''${CLAUDE_LLC_ROLES:-${lib.concatStringsSep " " roles}}"
        for role in $seed; do
          case " ${lib.concatStringsSep " " roles} " in
            *" $role "*) ;;
            *)
              echo "claude-llc: CLAUDE_LLC_ROLES names \"$role\", which is not a role" >&2
              exit 1
              ;;
          esac
        done
        # shellcheck disable=SC2086 # one word per role
        ${node} ${llcScripts}/staff.mjs seed $seed || exit 1
        ${node} ${llcScripts}/staff.mjs check || exit 1
        # Who staff.json employs and is not firing, roles in roster order.
        ready=""
        for role in ${lib.concatStringsSep " " roles}; do
          ready="$ready $(${lib.getExe pkgs.jq} -r --arg r "$role" \
            '.employees | to_entries | map(select(.value.role == $r and .value.state == "working")) | map(.key) | sort[]' \
            "$VIBEWARS_BOT_ROOT/staff.json")"
        done

        # Replace refs live under .git/refs, which every jail can write, and
        # make git read another object under a reviewed sha (#67). Our own
        # scripts set GIT_NO_REPLACE_OBJECTS; this covers the operator's git.
        git -C "$DEVENV_ROOT" config core.useReplaceRefs false

        # ------------------------------------------------------------------------
        # A restore point, taken before nine agents with push rights start work.
        # This repository was corrupted by an interrupted write once already; a
        # bundle is cheap and is the difference between an inconvenience and a
        # bad afternoon.
        # ------------------------------------------------------------------------
        mkdir -p "$VIBEWARS_BOT_ROOT/backups"
        backup="$VIBEWARS_BOT_ROOT/backups/$(date +%Y%m%d-%H%M%S).bundle"
        if git -C "$DEVENV_ROOT" bundle create "$backup" --all >/dev/null 2>&1; then
          echo "claude-llc: backed up all refs to $backup"
        else
          echo "claude-llc: warning: could not create a backup bundle" >&2
        fi

        # What this boot loaded, and when. hubd reads it to decide whether a
        # reboot has new company code to load, and to keep reboots 30 minutes
        # apart (scripts/bots/reboot.mjs). After a reboot the restarter has
        # already written it, with a note on what it loaded.
        if [ -z "''${VIBEWARS_REBOOTED-}" ]; then
          printf '{"sha":"%s","at":%s,"previousSha":null,"updated":false,"note":null}\n' \
            "$(git -C "$DEVENV_ROOT" rev-parse HEAD)" "$(date +%s%3N)" \
            >"$VIBEWARS_BOT_ROOT/boot.json"
        fi
        # devenv's evaluation cache does not track scripts/bots (ADR-0014), so
        # this shell may run an older checkout's scripts than the one it is
        # in. If so, boot.json's note says it, loudly, instead of what the
        # boot claims to have loaded.
        if ! ${node} ${llcScripts}/boot-check.mjs ${llcScripts}; then
          echo "claude-llc: warning: could not compare the running scripts with scripts/bots" >&2
        fi
        # The manager's first prompt says what a reboot loaded, so the
        # manager can tell everyone.
        note="$(${lib.getExe pkgs.jq} -r '.note // empty' "$VIBEWARS_BOT_ROOT/boot.json")"

        # ------------------------------------------------------------------------
        # The daemons. hubd holds the only GitHub credential in the system.
        # ------------------------------------------------------------------------
        stop_daemons
        # The jails' shared resource budget (#358), set before any window
        # opens so a host that cannot enforce it fails here, once, not in
        # every role. claude-bot sets it again before each launch.
        claude-bot --slice || exit 1
        # The Telegram sidecar is started by the first claude-bot below, which
        # has the token. Stopping the old one here is what makes a restart
        # pick up new sidecar code.
        pkill -f "link.mjs serve" 2>/dev/null || true


        # ------------------------------------------------------------------------
        # The session. One window per role, a pane per employee, each running
        # claude-bot, which builds the sandbox and starts the Telegram sidecar.
        # ------------------------------------------------------------------------
        # The dashboard is three titled panes (#165): BOARD and COMPANY side
        # by side, the TELEGRAM feed full width along the bottom. Each runs
        # dashboard.mjs with its section and redraws when its pane resizes.
        rm -f "$VIBEWARS_BOT_ROOT/stopping"
        ${tmux} new-session -d -s "$SESSION" -n dashboard -c "$DEVENV_ROOT" \
          "${node} ${llcScripts}/dashboard.mjs board"
        # Which build this company runs, for `claude-llc status` and an
        # attach from a newer checkout (#557).
        ${tmux} set-environment -t "$SESSION" VIBEWARS_LLC_BUILD ${llcScripts}
        board_pane="$(${tmux} display-message -p -t "$SESSION:dashboard" '#{pane_id}')"
        feed_pane="$(${tmux} split-window -v -l 30% -t "$board_pane" -P -F '#{pane_id}' \
          -c "$DEVENV_ROOT" "${node} ${llcScripts}/dashboard.mjs feed")"
        company_pane="$(${tmux} split-window -h -l 40% -t "$board_pane" -P -F '#{pane_id}' \
          -c "$DEVENV_ROOT" -e "VIBEWARS_CLAUDE_BOXES=$VIBEWARS_CLAUDE_BOXES" \
          "${node} ${llcScripts}/dashboard.mjs company")"
        ${tmux} select-pane -t "$feed_pane" -T TELEGRAM
        ${tmux} select-pane -t "$company_pane" -T COMPANY
        ${tmux} select-pane -t "$board_pane" -T BOARD
        # The 16 ANSI colours only, so a light terminal reads them too.
        ${tmux} set-option -w -t "$SESSION:dashboard" pane-border-status top
        ${tmux} set-option -w -t "$SESSION:dashboard" pane-border-format " #[bold]#{pane_title}#[nobold] "
        ${tmux} set-option -w -t "$SESSION:dashboard" pane-border-lines heavy
        ${tmux} set-option -w -t "$SESSION:dashboard" pane-border-style fg=blue
        ${tmux} set-option -w -t "$SESSION:dashboard" pane-active-border-style fg=cyan
        hub_window

        for employee in $ready; do
          if [ "$employee" = manager ] && [ -n "$note" ]; then
            VIBEWARS_KICKOFF_NOTE="$note" start_employee "$employee"
          else
            start_employee "$employee"
          fi
        done


        # ----------------------------------------------------------------------
        # A clickable status bar: leave the company running and walk away,
        # or stop the whole thing, without hunting for the command.
        #
        # The key binding lives in a tmux config file rather than inline.
        # tmux command blocks use braces, and bash passes a bare `{` to
        # tmux as a literal argument while trying to run the following
        # lines as shell commands — which parses cleanly and does nothing.
        # ----------------------------------------------------------------------
        ${tmux} set-option -t "$SESSION" mouse on
        ${tmux} set-option -t "$SESSION" status-interval 5
        ${tmux} set-option -t "$SESSION" status-style "bg=blue,fg=white"
        ${tmux} set-option -t "$SESSION" window-status-format " #I:#W "
        ${tmux} set-option -t "$SESSION" window-status-current-format " #I:#W "
        ${tmux} set-option -t "$SESSION" window-status-current-style "bg=cyan,fg=black,bold"
        ${tmux} set-option -t "$SESSION" status-left "#[bold] VibeWars LLC #[default]"
        ${tmux} set-option -t "$SESSION" status-right \
          "#[range=user|detach] detach #[norange]|#[range=user|stop] stop #[norange] "
        ${tmux} source-file ${llcTmuxConf}

        # Opens on the dashboard, a reboot's `claude-llc up` included: the
        # operator comes back to what the company is doing.
        ${tmux} select-window -t "$SESSION:dashboard"

        if [ "$attach" = 0 ]; then
          echo "claude-llc: the company is up; attach with claude-llc"
          exit 0
        fi

        exec ${tmux} attach-session -t "$SESSION"
  '';
in
{
  # Shares claude-bot's switch: the company is nothing without its agents.
  config = lib.mkIf config.vibewars.claudeBot.enable {
    packages = [ pkgs.tmux ];

    scripts = {
      claude-llc = {
        description = "Bring up the agent company in a tmux session";
        exec = claudeLlc;
      };

      claude-llc-init = {
        description = "One-time: create the kanban board, protect main, write company.json";
        exec = ''
          set -euo pipefail
          export VIBEWARS_BOT_ROOT="$DEVENV_ROOT/.bots"
          exec ${node} ${llcScripts}/company-init.mjs "$@"
        '';
      };

      # One employee's window: one turn after another (#146, ADR-0027).
      #
      # claude-bot runs a single turn in print mode and exits when the agent
      # ends it. agent-turn.mjs makes its output readable and resumes the
      # employee's conversation by the id it recorded in .bots/agents/<employee>/,
      # which no jail can see. Then a pause, and the next turn, whose prompt
      # sends the agent back to its inbox and the board.
      #
      # Ctrl-C ends the current turn, and the next one starts after the
      # pause; a second Ctrl-C during the pause stops the agent for good.
      # A run that failed (agent-turn.mjs decides) counts; five in a row and
      # the loop gives up, because an agent that cannot start at all should
      # say so rather than flicker forever, and the company is told. A turn
      # that ended normally, however short, resets the count.
      #
      # The pause is agent-loop.mjs's: at least 10 s, doubling up to 5 min
      # while turns stay short or runs fail, because idle agents do end
      # turns and each resume re-reads the whole conversation. A message to
      # the agent ends the pause early, after the first 10 s.
      #
      # A run that hit Claude's usage limit (agent-turn.mjs exits 3) is not
      # a failure (#308): the loop waits until the limit resets, or retries
      # every 5 to 30 min if it does not know when, and no message wakes it
      # early. The company is told once when the limit is reached and once
      # when it is over. agent-loop.test.mjs runs this loop for real.
      #
      # `between-turns` exists exactly while the loop is not running a turn.
      # The supervisor reads it to drain the company for a reboot, and while
      # a reboot is pending no new turn starts, so a drained agent stays
      # drained.
      claude-llc-agent = {
        description = "Run one employee, one turn after another (used by claude-llc)";
        exec = ''
          set -uo pipefail

          # An employee (#62): `qa-tester` or `qa-tester@2`. Its state, and
          # with it `between-turns`, is its own; claude-bot checks the id.
          employee="''${1-}"
          if [ -z "$employee" ]; then
            echo "claude-llc-agent: usage: claude-llc-agent <employee>" >&2
            exit 2
          fi
          shift || true

          root="$DEVENV_ROOT/.bots"
          export VIBEWARS_BOT_ROOT="$root"
          state="$root/agents/$employee"
          mkdir -p "$state"
          between="$state/between-turns"
          # The context of the turn's last call (#321), in the employee's bus
          # directory, which its jail sees: `tg wait` reads it there.
          export VIBEWARS_CONTEXT_FILE="$root/bus/$employee/context.json"
          # Every line the turn prints, for the manager's `peek` (#19).
          mkdir -p "$root/peek" && chmod 700 "$root/peek"
          export VIBEWARS_PEEK_DIR="$root/peek"
          # However the loop ends, Ctrl-C and a killed window included, it is
          # no longer between turns.
          trap 'rm -f "$between"' EXIT

          stopped() {
            echo "claude-llc-agent: stopped $employee."
            exit 0
          }

          failures=0
          pause=0
          limitPause=0
          while true; do
            rm -f "$between"
            # A nearly full disk holds the next turn (#358); a turn already
            # running is not stopped.
            ${node} ${llcScripts}/agent-loop.mjs disk || true
            started=$SECONDS
            ${node} ${llcScripts}/agent-turn.mjs "$state" -- claude-bot "$employee" "$@"
            turn=$?
            # The reboot note is for the first turn after the reboot, not
            # for each fresh session the context ceiling starts (#321).
            unset VIBEWARS_KICKOFF_NOTE
            touch "$between"

            echo ""
            if [ "$turn" -eq 3 ]; then
              # Claude's usage limit: not this agent's fault, so it neither
              # counts toward the five nor resets them.
              limitPause="$(${node} ${llcScripts}/agent-loop.mjs limited "$employee" "$state" "$limitPause")" || limitPause=300
              echo "claude-llc-agent: Claude usage limit reached; next turn for $employee in ''${limitPause}s."
              echo "claude-llc-agent: messages do not wake it. Ctrl-C now to stop for good."
              ${node} ${llcScripts}/agent-loop.mjs sleep "$limitPause" || stopped
            else
              if [ "$turn" -eq 0 ]; then
                failures=0
                failed=0
                limitPause=0
                ${node} ${llcScripts}/agent-loop.mjs resumed "$employee" || true
              else
                failures=$(( failures + 1 ))
                failed=1
              fi
              pause="$(${node} ${llcScripts}/agent-loop.mjs pause "$pause" $(( SECONDS - started )) "$failed")"

              # The manager never gives up (#384): it says so once, at the
              # fifth failure, and keeps trying at the longest pause.
              if [ "$failures" -ge 5 ] && [ "$employee" = manager ]; then
                if [ "$failures" -eq 5 ]; then
                  echo "claude-llc-agent: $employee failed five runs in a row; it keeps trying."
                  ${node} ${llcScripts}/agent-loop.mjs gave-up "$employee" || true
                fi
              elif [ "$failures" -ge 5 ]; then
                echo "claude-llc-agent: $employee failed five runs in a row."
                echo "claude-llc-agent: not restarting. Fix the cause, then:"
                echo "claude-llc-agent:   claude-llc-agent $employee"
                ${node} ${llcScripts}/agent-loop.mjs gave-up "$employee" || true
                exit 1
              fi

              echo "claude-llc-agent: next turn for $employee in ''${pause}s, or when a message arrives."
              echo "claude-llc-agent: Ctrl-C now to stop for good."
              ${node} ${llcScripts}/agent-loop.mjs wait "$employee" "$pause" || stopped
            fi
            # The marker goes before the reboot check, not after: a reboot
            # requested between the two would otherwise see this agent
            # between turns while it starts one. So the marker is only ever
            # up while no turn can start.
            rm -f "$between"
            if [ -e "$root/reboot.json" ]; then
              echo "claude-llc-agent: a company reboot is pending; $employee waits for it."
            fi
            while [ -e "$root/reboot.json" ]; do
              touch "$between"
              sleep 5 || stopped
              rm -f "$between"
            done
          done
        '';
      };

      claude-llc-dash = {
        description = "The company dashboard: board, Telegram feed and roster";
        exec = ''
          set -euo pipefail
          export VIBEWARS_BOT_ROOT="$DEVENV_ROOT/.bots"
          export VIBEWARS_CLAUDE_BOXES="$HOME/${config.vibewars.claudeBot.boxes}"
          exec ${node} ${llcScripts}/dashboard.mjs "$@"
        '';
      };
    };
  };
}
