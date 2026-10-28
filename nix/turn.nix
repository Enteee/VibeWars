{
  pkgs,
  lib,
  config,
  ...
}:

# A TURN relay for friends behind symmetric NAT or CGNAT (#974), whose invite
# links #972 reads. Off unless `vibewars.turn.enable` is set in
# devenv.local.nix. See docs/development/turn.md.

let
  cfg = config.vibewars.turn;
  node = "${pkgs.nodejs_24}/bin/node";

  # Copied into the store without the tests, like claude-llc's scripts.
  turnScripts = pkgs.runCommand "vibewars-turn-scripts" { } ''
    mkdir -p $out
    for f in ${../scripts/turn}/*.mjs; do
      case "$f" in *.test.mjs) continue ;; esac
      cp "$f" "$out/$(basename "$f")"
    done
  '';

  # The options, as scripts/turn/settings.mjs reads them. No secret is in
  # here: passwords live in the userdb (as keys) and in health.secret.
  settingsFile = pkgs.writeText "vibewars-turn.json" (
    builtins.toJSON {
      inherit (cfg)
        realm
        host
        externalIp
        externalIp6
        listeningIps
        listeningPort
        tlsPort
        cert
        key
        stateDir
        userQuota
        totalQuota
        maxBps
        bpsCapacity
        prometheusPort
        stunProbe
        ;
      relayPorts = {
        inherit (cfg.relayPorts) min max;
      };
    }
  );

  # Every command finds the same settings, coturn and tmux.
  preamble = ''
    export VIBEWARS_TURN_SETTINGS=${settingsFile}
    export PATH=${pkgs.coturn}/bin:${pkgs.tmux}/bin:$PATH
  '';

  command = sub: ''
    ${preamble}
    exec ${node} ${turnScripts}/turn.mjs ${sub} "$@"
  '';
in
{
  options.vibewars.turn = {
    enable = lib.mkEnableOption "the coturn TURN relay (processes.turn) and the turn-* commands";

    realm = lib.mkOption {
      type = lib.types.str;
      example = "turn.example.org";
      description = "The TURN realm. Usually the server's DNS name.";
    };

    host = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "turn.example.org";
      description = ''
        The name or address invite links point at. Must match the certificate
        when TLS is on. Defaults to the public part of `externalIp`.
      '';
    };

    externalIp = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "203.0.113.7/10.0.0.7";
      description = ''
        The public IPv4 address, or `public/private` behind 1:1 NAT (most
        VPSs). Unset on a host whose interface has the public address.
      '';
    };

    externalIp6 = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = "The public IPv6 address, when it differs from the interface's.";
    };

    listeningIps = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = "Addresses to listen on. Empty is every interface.";
    };

    listeningPort = lib.mkOption {
      type = lib.types.port;
      default = 3478;
      description = "TURN over UDP and TCP.";
    };

    tlsPort = lib.mkOption {
      type = lib.types.port;
      default = 5349;
      description = "TURN over TLS (`turns:`), only when `cert` and `key` are set.";
    };

    relayPorts = {
      min = lib.mkOption {
        type = lib.types.port;
        default = 49160;
        description = "Lowest UDP relay port. Forward the whole range.";
      };
      max = lib.mkOption {
        type = lib.types.port;
        default = 49200;
        description = "Highest UDP relay port.";
      };
    };

    cert = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = "PEM certificate path for `turns:`. Read at runtime, never copied to the store.";
    };

    key = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = "PEM private key path for `turns:`. Read at runtime, never copied to the store.";
    };

    stateDir = lib.mkOption {
      type = lib.types.str;
      default = "${config.devenv.state}/turn";
      description = "The userdb, the log, the pid file and health.secret.";
    };

    userQuota = lib.mkOption {
      type = lib.types.ints.unsigned;
      default = 12;
      description = "Concurrent allocations per user. A browser makes one per peer connection.";
    };

    totalQuota = lib.mkOption {
      type = lib.types.ints.unsigned;
      default = 100;
      description = "Concurrent allocations in all.";
    };

    maxBps = lib.mkOption {
      type = lib.types.ints.unsigned;
      default = 100000;
      description = "Bytes per second per session. A match needs about 20-40 KB/s per relayed player.";
    };

    bpsCapacity = lib.mkOption {
      type = lib.types.ints.unsigned;
      default = 0;
      description = "Bytes per second for the whole server; 0 is no limit.";
    };

    prometheusPort = lib.mkOption {
      type = lib.types.port;
      default = 9641;
      description = "Metrics port, on 127.0.0.1 only. turn-dash reads it.";
    };

    stunProbe = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = "stun.l.google.com:19302";
      description = ''
        A public STUN server turn-check asks what address this host is seen
        from, to compare with `externalIp`. null skips the comparison.
      '';
    };
  };

  config = lib.mkMerge [
    {
      # Always in the shell, so CI can run scripts/turn/server.test.mjs
      # against the real server.
      packages = [ pkgs.coturn ];
    }

    (lib.mkIf cfg.enable {
      processes.turn.exec = ''
        set -euo pipefail
        ${preamble}
        mkdir -p ${lib.escapeShellArg cfg.stateDir}
        chmod 700 ${lib.escapeShellArg cfg.stateDir}
        ${node} ${turnScripts}/turn.mjs conf > ${lib.escapeShellArg "${cfg.stateDir}/turnserver.conf"}
        exec turnserver -c ${lib.escapeShellArg "${cfg.stateDir}/turnserver.conf"}
      '';

      scripts = {
        turn-user = {
          description = "TURN users: add <name>, remove <name>, list";
          exec = command "user";
        };
        turn-link = {
          description = "Print a TURN user's invite link (sets a new password)";
          exec = command "link";
        };
        turn-check = {
          description = "Check the TURN server once; exit 0 when healthy";
          exec = command "check";
        };
        turn-dash = {
          description = "The TURN dashboard in tmux: stats, health, users, log";
          exec = command "dash";
        };
      };
    })
  ];
}
