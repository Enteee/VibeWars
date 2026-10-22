{ pkgs, lib, config, ... }:

{
  name = "vibewars";

  # ---------------------------------------------------------------------------
  # Toolchain
  # ---------------------------------------------------------------------------
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    pnpm = {
      enable = true;
      install.enable = true;
    };
  };

  packages = [
    pkgs.jq
    pkgs.git
  ];

  env.VIBEWARS_ENV = "development";

  enterShell = ''
    echo "vibewars dev shell — node $(node --version), pnpm $(pnpm --version)"
  '';
}
