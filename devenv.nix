{ pkgs, config, ... }:

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
  ];

  env.VIBEWARS_ENV = "development";
  env.VIBEWARS_CHROMIUM = "${pkgs.chromium}/bin/chromium";

  enterShell = ''
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

  # ---------------------------------------------------------------------------
  # Production container (brief §27, docs/adr/0009-production-deployment.md).
  #
  # One process serves both the built web client and the Colyseus game
  # server. `copyToRoot` stages the build output next to a `node_modules`
  # tree at the same relative depth the monorepo already has, so Node's
  # normal upward node_modules resolution works unmodified.
  #
  # This intentionally ships the *whole* installed `node_modules` (including
  # devDependencies), not a pruned `pnpm deploy` output. `pnpm deploy --legacy`
  # was tried and produces a node_modules tree that **fails the exact same
  # integration test this ADR's networking fix was verified against** — a
  # fresh join reproducibly closes with "seat reservation expired" even
  # though only one physical @colyseus/core copy is present, so the cause is
  # some other difference in how `pnpm deploy` re-resolves the dependency
  # graph, not (this time) the duplicate-module bug from ADR-0002. Shipping
  # the already-tested root tree is slower to build and larger, but it is the
  # one tree actually proven to work; pruning devDependencies out of the
  # image is tracked as a Sprint 26/27 optimization, not attempted blind.
  # ---------------------------------------------------------------------------
  containers.prod = {
    name = "vibewars";
    startupCommand = [
      "${pkgs.nodejs_24}/bin/node"
      "/app/apps/server/dist/main.js"
    ];
    copyToRoot = pkgs.runCommand "vibewars-prod-root" { } ''
      mkdir -p $out/app
      cp -r ${./node_modules} $out/app/node_modules
      cp ${./package.json} $out/app/package.json
      mkdir -p $out/app/apps/server $out/app/apps/web
      cp -r ${./apps/server/dist} $out/app/apps/server/dist
      cp ${./apps/server/package.json} $out/app/apps/server/package.json
      cp -r ${./apps/web/dist} $out/app/apps/web/dist
      mkdir -p $out/app/packages/game-core $out/app/packages/game-protocol
      cp -r ${./packages/game-core/dist} $out/app/packages/game-core/dist
      cp ${./packages/game-core/package.json} $out/app/packages/game-core/package.json
      cp -r ${./packages/game-protocol/dist} $out/app/packages/game-protocol/dist
      cp ${./packages/game-protocol/package.json} $out/app/packages/game-protocol/package.json
    '';
  };
}
