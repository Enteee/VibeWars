{
  pkgs,
  lib,
  ...
}:

let
  node = "${pkgs.nodejs_24}/bin/node";
  tmux = lib.getExe pkgs.tmux;

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
  llcScripts = pkgs.runCommand "vibewars-llc-scripts" { } ''
    mkdir -p $out
    for f in ${../scripts/bots}/*.mjs; do
      case "$f" in *.test.mjs) continue ;; esac
      cp "$f" "$out/$(basename "$f")"
    done
  '';

  # The org chart, in the order the windows are created. The architect is
  # listed first after the dashboard because that is the window the session
  # opens on: it is where the operator describes new features.
  roles = [
    "architect"
    "manager"
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
      claude-llc --help

    One tmux window per employee plus a dashboard. The session opens on the
    architect's window, because that is where you describe what you want built:
    say it to the architect and it becomes issues, which the board carries to
    main without you.

    Running it again attaches to the company already running rather than
    starting a second one. Bottom-right of the status bar has clickable
    "detach" (leave it running) and "stop" (shut every agent down). Ctrl-C in
    an employee's window restarts just that employee, keeping its memory.

    Employees coordinate over the Telegram group and take their work from the
    GitHub Projects board. Inside each sandbox: `tg` for colleagues, `board`
    for the kanban, `hub` for GitHub. The GitHub credential is NOT in the
    sandboxes — `hubd` holds it out here and enforces what each role may do.

    first time:
      claude-llc-init         create the board, protect main, write company.json
      claude-bot <role>       provision a role's Telegram bot (two taps each)

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

  claudeLlc = ''
        set -euo pipefail

        SESSION="${session}"
        export VIBEWARS_LLC_SESSION="$SESSION"
        export VIBEWARS_BOT_ROOT="$DEVENV_ROOT/.bots"

        usage() {
      cat ${llcUsage}
    }

        case "''${1-}" in
          -h | --help)
            usage
            exit 0
            ;;
          status)
            if ${tmux} has-session -t "$SESSION" 2>/dev/null; then
              echo "session $SESSION is up:"
              ${tmux} list-windows -t "$SESSION" -F '  #{window_index} #{window_name}'
            else
              echo "session $SESSION is not running"
            fi
            for d in hubd supervisor; do
              if pgrep -f "$d.mjs" >/dev/null 2>&1; then echo "  $d: running"; else echo "  $d: stopped"; fi
            done
            exit 0
            ;;
          stop)
            ${tmux} kill-session -t "$SESSION" 2>/dev/null && echo "stopped $SESSION" || echo "$SESSION was not running"
            pkill -f hubd.mjs 2>/dev/null && echo "stopped hubd" || true
            pkill -f supervisor.mjs 2>/dev/null && echo "stopped supervisor" || true
            exit 0
            ;;
          "") ;;
          *)
            echo "claude-llc: unknown argument: $1" >&2
            echo "claude-llc: try claude-llc --help" >&2
            exit 2
            ;;
        esac

        if [ ! -e "$VIBEWARS_BOT_ROOT/company.json" ]; then
          echo "claude-llc: the company has not been set up yet." >&2
          echo "claude-llc: run claude-llc-init first." >&2
          exit 1
        fi

        # Starting the company twice would build a second set of sandboxes and
        # a second sidecar per role — and two sidecars on one bot token means
        # 409 Conflict and a deaf agent. So a running session is joined, never
        # duplicated.
        if ${tmux} has-session -t "$SESSION" 2>/dev/null; then
          echo "claude-llc: $SESSION is already running; attaching to it."

          # A session can outlive its daemons: the machine slept, something
          # was killed, hubd crashed. Bring back whichever is missing, or you
          # attach to a company whose GitHub access silently does not work.
          if ! pgrep -f hubd.mjs >/dev/null 2>&1; then
            echo "claude-llc: hubd was not running; restarting it."
            mkdir -p "$VIBEWARS_BOT_ROOT/hub"
            VIBEWARS_JQ=${pkgs.jq}/bin/jq ${node} ${llcScripts}/hubd.mjs >>"$VIBEWARS_BOT_ROOT/hub/hubd.log" 2>&1 &
          fi
          if ! pgrep -f supervisor.mjs >/dev/null 2>&1; then
            echo "claude-llc: supervisor was not running; restarting it."
            ${node} ${llcScripts}/supervisor.mjs >>"$VIBEWARS_BOT_ROOT/hub/supervisor.log" 2>&1 &
          fi

          exec ${tmux} attach-session -t "$SESSION"
        fi

        # ------------------------------------------------------------------------
        # Which roles can actually start? A role whose Telegram bot has not been
        # provisioned would fail in its pane, so it is reported here instead,
        # where the message is readable.
        # ------------------------------------------------------------------------
        ready=""
        missing=""
        for role in ${lib.concatStringsSep " " roles}; do
          if ${pkgs.jq}/bin/jq -e --arg r "$role" \
               '.roles[$r] | (.token and .promoted and .topicId)' \
               "$VIBEWARS_BOT_ROOT/registry.json" >/dev/null 2>&1; then
            ready="$ready $role"
          else
            missing="$missing $role"
          fi
        done

        if [ -n "$missing" ]; then
          echo "claude-llc: not provisioned yet:$missing" >&2
          echo "claude-llc: run 'claude-bot <role>' for each, or let it provision on first start." >&2
          echo "" >&2
        fi
        if [ -z "$ready" ]; then
          echo "claude-llc: no roles are ready. Nothing to start." >&2
          exit 1
        fi

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

        # ------------------------------------------------------------------------
        # The daemons. hubd holds the only GitHub credential in the system.
        # ------------------------------------------------------------------------
        pkill -f hubd.mjs 2>/dev/null || true
        pkill -f supervisor.mjs 2>/dev/null || true

        mkdir -p "$VIBEWARS_BOT_ROOT/hub"
        VIBEWARS_JQ=${pkgs.jq}/bin/jq ${node} ${llcScripts}/hubd.mjs >>"$VIBEWARS_BOT_ROOT/hub/hubd.log" 2>&1 &
        echo "claude-llc: hubd started (log: .bots/hub/hubd.log)"

        # ------------------------------------------------------------------------
        # The session. One window per employee, each running claude-bot, which
        # builds the sandbox and starts that role's Telegram sidecar.
        # ------------------------------------------------------------------------
        ${tmux} new-session -d -s "$SESSION" -n dashboard -c "$DEVENV_ROOT" \
          "${node} ${llcScripts}/dashboard.mjs"

        for role in $ready; do
          ${tmux} new-window -t "$SESSION" -n "$role" -c "$DEVENV_ROOT" \
            "claude-llc-agent $role"
        done

        ${node} ${llcScripts}/supervisor.mjs >>"$VIBEWARS_BOT_ROOT/hub/supervisor.log" 2>&1 &
        echo "claude-llc: supervisor started (log: .bots/hub/supervisor.log)"

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
        ${tmux} set-option -t "$SESSION" status-left "#[bold] VibeWars LLC #[default]"
        ${tmux} set-option -t "$SESSION" status-right \
          "#[range=user|detach] detach #[norange]|#[range=user|stop] stop #[norange] "
        ${tmux} source-file ${llcTmuxConf}

        # Opens on the architect, which is where you type.
        if ${tmux} select-window -t "$SESSION:architect" 2>/dev/null; then
          :
        else
          ${tmux} select-window -t "$SESSION:dashboard"
        fi

        exec ${tmux} attach-session -t "$SESSION"
  '';
in
{
  config = {
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

      # One employee's window: claude-bot, restarted when it exits.
      #
      # Without this the pane dies with the agent. Ctrl-C in Claude Code
      # exits the process, tmux closes the window whose command returned,
      # and the employee is gone for the rest of the day — which is a harsh
      # penalty for interrupting a turn.
      #
      # So Ctrl-C now means "restart this agent": the pane stays, the agent
      # comes back in ten seconds with its kickoff prompt, and a second
      # Ctrl-C during that pause stops it for good. A crash loop is capped,
      # because an agent that cannot start at all should say so rather than
      # flicker forever.
      claude-llc-agent = {
        description = "Run one employee in a restart loop (used by claude-llc)";
        exec = ''
          set -uo pipefail

          role="''${1-}"
          if [ -z "$role" ]; then
            echo "claude-llc-agent: usage: claude-llc-agent <role>" >&2
            exit 2
          fi
          shift || true

          quick=0
          first=1
          while true; do
            started=$SECONDS
            if [ "$first" = "1" ]; then
              first=0
              claude-bot "$role" "$@" || true
            else
              # Keep the agent's memory across a restart. An employee that
              # forgets its half-finished branch whenever someone presses
              # Ctrl-C is worse than useless, because it starts over.
              claude-bot --continue "$role" "$@" || true
            fi
            ran=$(( SECONDS - started ))

            if [ "$ran" -lt 20 ]; then
              quick=$(( quick + 1 ))
            else
              quick=0
            fi

            echo ""
            if [ "$quick" -ge 5 ]; then
              echo "claude-llc-agent: $role exited immediately five times running."
              echo "claude-llc-agent: not restarting. Fix the cause, then:"
              echo "claude-llc-agent:   claude-llc-agent $role"
              exit 1
            fi

            echo "claude-llc-agent: $role stopped after ''${ran}s."
            echo "claude-llc-agent: restarting in 10s — Ctrl-C now to stop for good."
            if ! sleep 10; then
              echo "claude-llc-agent: stopped $role."
              exit 0
            fi
          done
        '';
      };

      claude-llc-dash = {
        description = "The company dashboard: board, Telegram feed and roster";
        exec = ''
          set -euo pipefail
          export VIBEWARS_BOT_ROOT="$DEVENV_ROOT/.bots"
          exec ${node} ${llcScripts}/dashboard.mjs "$@"
        '';
      };
    };
  };
}
