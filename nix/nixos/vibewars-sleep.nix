# Lets the VibeWars company hibernate this NixOS host while every agent waits
# on the usage limit (#2794, #3202). hubd writes a wake time to
# /run/vibewars-sleep/request; this path unit starts a root oneshot that
# checks it, sets the RTC alarm and hibernates. Import it and set
#   services.vibewars-sleep = { enable = true; user = "<you>"; };
# The script is read when the system is built: a change to it needs a
# nixos-rebuild.
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.vibewars-sleep;
  script = builtins.readFile ../../scripts/bots/vibewars-sleep.sh;
in
{
  options.services.vibewars-sleep = {
    enable = lib.mkEnableOption "hibernation requests from the VibeWars company";
    user = lib.mkOption {
      type = lib.types.str;
      description = "The user the company runs as: it owns the request directory.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd = {
      tmpfiles.rules = [ "d /run/vibewars-sleep 0700 ${cfg.user} - -" ];

      paths.vibewars-sleep = {
        description = "Hibernate requests from the VibeWars company";
        wantedBy = [ "multi-user.target" ];
        pathConfig.PathModified = "/run/vibewars-sleep/request";
      };

      services.vibewars-sleep = {
        description = "Hibernate the VibeWars company host until its wake time";
        path = with pkgs; [
          coreutils
          util-linux
          systemd
        ];
        serviceConfig = {
          Type = "oneshot";
          TimeoutStartSec = 30;
          ExecStart = pkgs.writeShellScript "vibewars-sleep" script;
        };
      };
    };
  };
}
