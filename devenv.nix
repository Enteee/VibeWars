{ pkgs, config, ... }:

let
  # Only Playwright's Firefox, for scripts/music-stress.mjs (#519).
  playwrightFirefox = pkgs.playwright-driver.selectBrowsers {
    withFirefox = true;
    withChromium = false;
    withChromiumHeadlessShell = false;
    withWebkit = false;
    withFfmpeg = false;
  };
in
{
  name = "vibewars";

  # `claude-bot <role>` — a sandboxed Claude agent that coordinates with its
  # peers over Telegram. Kept in its own module because it is orthogonal to
  # the build toolchain below and carries its own options, which you set in
  # devenv.local.nix. See docs/adr/0014-agent-coordination.md.
  imports = [
    ./nix/claude-bot.nix
    # `claude-llc` — the nine of them at once, in a tmux session, taking work
    # from a GitHub kanban board. See docs/adr/0015-agent-company.md.
    ./nix/claude-llc.nix
    # A TURN relay for friends behind NAT (#974), off unless enabled in
    # devenv.local.nix. See docs/development/turn.md.
    ./nix/turn.nix
  ];

  # ---------------------------------------------------------------------------
  # Toolchain
  #
  # See docs/adr/0007-development-environment.md and
  # docs/adr/0008-monorepo-and-typescript.md for why these exact versions.
  # ---------------------------------------------------------------------------
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    pnpm = {
      enable = true;
      # Pinned to the 10.x line to match package.json's `packageManager`
      # (CI runs inside this shell, so it gets this same pnpm). Left to
      # nixpkgs' default, devenv would hand us pnpm 12.x.
      package = pkgs.pnpm_10;
      install.enable = true;
    };
  };

  packages = [
    pkgs.jq
    # The supervisor test (#722) runs a tmux server of its own, in CI too.
    pkgs.tmux
    pkgs.git
    # Issues, PRs and release work against github.com/Enteee/Vibewars. Pinned
    # here rather than installed ad hoc so that anything scripted against it
    # (and any agent doing repository chores) gets the same version everyone
    # else has.
    pkgs.gh
    pkgs.shellcheck
    pkgs.actionlint
    # Browser tests (brief §31 "Browser tests") drive this Chromium rather
    # than one Playwright downloads: pinning it here makes the browser part
    # of the reproducible environment like every other tool, instead of an
    # unversioned binary fetched on first run.
    pkgs.chromium
    # scripts/assets/sfx.sh synthesises the sound effects with sox and
    # encodes them to MP3 with ffmpeg (#104). Pinned here so anyone can
    # re-run it and get the committed bytes.
    pkgs.sox
    pkgs.ffmpeg-headless
    # scripts/music-stress.mjs (#519): Firefox is the browser that crackles,
    # and its Playwright build only talks to the Playwright release it was
    # made for, so package.json pins @playwright/test to nixpkgs' version
    # (1.63.0). Firefox only: the e2e suite stays Chromium-only. No browser is
    # ever downloaded at runtime. PulseAudio gives both browsers a null sink,
    # so they render to a real-time stream (`music-stress.mjs --pulse`).
    playwrightFirefox
    pkgs.pulseaudio
  ];

  env = {
    VIBEWARS_ENV = "development";
    VIBEWARS_CHROMIUM = "${pkgs.chromium}/bin/chromium";
    # Playwright's Firefox loads libpulse at run time to reach PulseAudio.
    VIBEWARS_PULSE_LIB = "${pkgs.pulseaudio}/lib";
  };

  enterShell = ''
    # The revision in the directory name is the Playwright release's, so a
    # glob finds it. Unset if the browser is missing: the script then says so.
    for firefox in ${playwrightFirefox}/firefox-*/firefox/firefox; do
      [ -x "$firefox" ] && export VIBEWARS_FIREFOX="$firefox"
    done
    echo "vibewars dev shell — node $(node --version), pnpm $(pnpm --version)"
  '';

  # ---------------------------------------------------------------------------
  # `devenv test` — the single command the brief requires to pass at the end
  # of every sprint (brief §37, §39). Mirrors the root package.json's `ci`
  # script, which exists so the exact same checks can run in environments
  # without a working devenv realization (see docs/adr/0007, which documents
  # the sandbox this repository is currently authored in).
  #
  # CI mirrors this list, step for step, in .github/workflows/ci.yml; keep
  # the two in step. The git hooks below need no such mirror: CI reads them
  # from the generated .pre-commit-config.yaml (docs/adr/0021).
  # ---------------------------------------------------------------------------
  enterTest = ''
    pnpm run format:check
    pnpm run lint
    pnpm run typecheck
    pnpm run test
    pnpm run build
    # Last, because it needs the built client and a real browser. The
    # unit/integration suite failing first is the faster signal. CI runs it
    # as a job of its own, `e2e`, alongside the rest (#132).
    pnpm run test:e2e
  '';

  # ---------------------------------------------------------------------------
  # Git hooks — fast, local checks on every commit. Deliberately a strict
  # subset of `enterTest`: anything slow enough to make developers reach for
  # `--no-verify` belongs in CI instead (brief §29).
  # ---------------------------------------------------------------------------
  git-hooks.hooks = {
    prettier = {
      enable = true;
      excludes = [
        "docs/product/master-brief\\.md$"
        "pnpm-lock\\.yaml$"
      ];
    };
    eslint = {
      enable = true;
      files = "\\.(ts|mts|cts|mjs|cjs)$";
      excludes = [
        "dist/"
        "dist-types/"
      ];
      # Builds the declarations first, as `pnpm run lint` does. Type-aware
      # rules resolve cross-package imports through each package's `types`
      # entry, which points into the gitignored dist/: without them every
      # cross-package symbol is `error`-typed and the hook reports hundreds
      # of bogus `no-unsafe-*` errors on a fresh checkout, while passing
      # wherever an earlier build left dist/ behind. Serial, so concurrent
      # batches of files never race one `tsc --build` against another.
      entry = toString (
        pkgs.writeShellScript "eslint-with-declarations" ''
          set -euo pipefail
          export PATH=${pkgs.nodejs_24}/bin:$PATH
          ${pkgs.pnpm_10}/bin/pnpm exec tsc --build tsconfig.build.json
          exec ${config.git-hooks.hooks.eslint.package}/bin/eslint --fix "$@"
        ''
      );
      require_serial = true;
    };

    nixfmt.enable = true;
    deadnix.enable = true;
    statix.enable = true;

    shellcheck.enable = true;
    actionlint.enable = true;

    check-json = {
      enable = true;
      # tsconfig*.json is JSONC by TypeScript's own convention (we rely on
      # this for the "why" comments in tsconfig.base.json) — not strict JSON,
      # so a strict-JSON validator would reject every project's tsconfig.
      excludes = [ "tsconfig.*\\.json$" ];
    };
    check-yaml = {
      enable = true;
      # pnpm-lock.yaml is machine-generated and validated by pnpm itself
      # (`pnpm install --frozen-lockfile` accepts it). It contains keys
      # like `uWebSockets.js@https://...` whose unquoted colons the
      # strict PyYAML-based checker cannot parse — a false positive on a
      # file no human edits.
      excludes = [ "pnpm-lock\\.yaml$" ];
    };
    markdownlint = {
      enable = true;
      excludes = [ "docs/product/master-brief\\.md$" ];
    };

    # Secret scanning: a LAN game still has no business committing tokens,
    # keys, or .env files.
    detect-private-keys.enable = true;
    ripsecrets.enable = true;

    # TypeScript project build is too slow for every keystroke-adjacent
    # commit; it is covered by `enterTest`/CI instead. What IS cheap enough
    # for a hook is making sure nobody commits a skill/map data file that
    # fails schema validation once that validator exists (Sprint 6/9).
  };
}
