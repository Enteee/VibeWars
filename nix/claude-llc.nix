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
  llcScripts = pkgs.runCommand "vibewars-llc-scripts" { } ''
    mkdir -p $out
    cp ${../scripts/bots/hub-policy.mjs} $out/hub-policy.mjs
    cp ${../scripts/bots/hub-guards.mjs} $out/hub-guards.mjs
    cp ${../scripts/bots/hubd.mjs} $out/hubd.mjs
    cp ${../scripts/bots/supervisor.mjs} $out/supervisor.mjs
    cp ${../scripts/bots/company-init.mjs} $out/company-init.mjs
    cp ${../scripts/bots/dashboard.mjs} $out/dashboard.mjs
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

  claudeLlc = ''
        set -euo pipefail

        SESSION="${session}"
        export VIBEWARS_LLC_SESSION="$SESSION"
        export VIBEWARS_BOT_ROOT="$DEVENV_ROOT/.bots"

        usage() {
          cat <<'USAGE'
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

    Employees coordinate over the Telegram group and take their work from the
    GitHub Projects board. Inside each sandbox: `tg` for colleagues, `board` for
    the kanban, `hub` for GitHub. The GitHub credential is NOT in the sandboxes —
    `hubd` holds it out here and enforces what each role may do.

    first time:
      claude-llc-init         create the board, protect main, write company.json
      claude-bot <role>       provision each role's Telegram bot (two taps each)

    See docs/adr/0015-agent-company.md.
    USAGE
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

        if ${tmux} has-session -t "$SESSION" 2>/dev/null; then
          echo "claude-llc: $SESSION is already up; attaching."
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
        ${node} ${llcScripts}/hubd.mjs >>"$VIBEWARS_BOT_ROOT/hub/hubd.log" 2>&1 &
        echo "claude-llc: hubd started (log: .bots/hub/hubd.log)"

        # ------------------------------------------------------------------------
        # The session. One window per employee, each running claude-bot, which
        # builds the sandbox and starts that role's Telegram sidecar.
        # ------------------------------------------------------------------------
        ${tmux} new-session -d -s "$SESSION" -n dashboard -c "$DEVENV_ROOT" \
          "${node} ${llcScripts}/dashboard.mjs"

        for role in $ready; do
          ${tmux} new-window -t "$SESSION" -n "$role" -c "$DEVENV_ROOT" \
            "claude-bot $role"
        done

        ${node} ${llcScripts}/supervisor.mjs >>"$VIBEWARS_BOT_ROOT/hub/supervisor.log" 2>&1 &
        echo "claude-llc: supervisor started (log: .bots/hub/supervisor.log)"

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
