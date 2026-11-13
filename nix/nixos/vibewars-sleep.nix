# Hibernate the VibeWars company host (#2794, #3202): the root side of
# claude-llc-init, as a NixOS module. hubd can only write a wake time to
# /run/vibewars-sleep/request; this path unit starts a oneshot that validates
# it, sets the RTC alarm and hibernates. The script is the repo's one copy,
# scripts/bots/vibewars-sleep.sh, read when the system is rebuilt: after it
# changes, run nixos-rebuild switch again.
#
#   imports = [ /path/to/VibeWars/nix/nixos/vibewars-sleep.nix ];
#   services.vibewars-sleep = { enable = true; user = "alice"; };
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.vibewars-sleep;
  dir = "/run/vibewars-sleep";
in
{
  options.services.vibewars-sleep = {
    enable = lib.mkEnableOption "hibernating the VibeWars company host until its wake time";
    user = lib.mkOption {
      type = lib.types.str;
      description = "The user the company runs as; owns the request directory.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd = {
      tmpfiles.rules = [ "d ${dir} 0700 ${cfg.user} - -" ];
      paths.vibewars-sleep = {
        wantedBy = [ "multi-user.target" ];
        pathConfig.PathModified = "${dir}/request";
      };
      services.vibewars-sleep = {
        path = with pkgs; [
          coreutils
          util-linux
          systemd
        ];
        serviceConfig = {
          Type = "oneshot";
          TimeoutStartSec = 30;
        };
        script = builtins.readFile ../../scripts/bots/vibewars-sleep.sh;
      };
    };
  };
}
