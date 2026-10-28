// @ts-check
import { builtinModules } from "node:module";

import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Type-aware linting is enabled repo-wide. It is slower than syntactic
 * linting, but it is the only way to catch the mistakes that actually matter
 * here — floating promises in the host's tick loop, unsafe `any` leaking in from
 * untyped network payloads, and unchecked union narrowing in the skill engine.
 *
 * Rules are never disabled globally (brief §41). Where an exception is
 * genuinely required it is a narrowly scoped block with a written reason.
 */
export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/dist-types/**",
    "**/dist-static/**",
    "**/node_modules/**",
    "**/coverage/**",
    ".pnpm-store/**",
    ".devenv/**",
    ".direnv/**",
    // Agent worktrees. Each claude-bot role gets a full checkout under here,
    // so without this every file in the repository is linted once per agent —
    // and a half-finished branch in someone's worktree fails the lint for
    // everybody, including CI.
    ".bots/**",
    "packages/game-data/generated/**",
    // Strudel source, not project JavaScript: it is evaluated by the music
    // host, where quotes carry meaning and `layer`/`INTENSITY` are globals.
    "apps/web/src/music/**/*.strudel.js",
  ]),

  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The brief forbids `any` shortcuts; these are errors, not warnings.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      // An unawaited promise in a fixed-tick host is silent state corruption.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Matches `verbatimModuleSyntax` in tsconfig.base.json.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "off",
    },
  },

  {
    files: [
      "packages/**/*.ts",
      "*.config.ts",
      "*.config.mjs",
      // Everything under scripts/ is a Node program. scripts/dev.mjs predates
      // this entry and still imports process/setTimeout explicitly, which is
      // harmless; the bot bridge needs `fetch` and `Buffer`, which have no
      // import form.
      "scripts/**/*.mjs",
      "apps/web/scripts/**/*.mjs",
      "apps/web/plugins/**/*.ts",
    ],
    languageOptions: { globals: globals.node },
  },

  {
    files: ["apps/web/src/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },

  // Trystero is one adapter behind `Transport` (#392): everything else
  // sees the interface, so swapping or patching the library touches one
  // file. First of the no-restricted-imports blocks, because a later block
  // replaces the rule rather than adding to it, so each later one repeats
  // this pattern.
  {
    files: ["**/*.ts", "**/*.mjs"],
    // Its unit test fakes Trystero's room, so it needs the types too.
    ignores: [
      "apps/web/src/net/transport/trystero.ts",
      "apps/web/src/net/transport/trystero.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["trystero", "trystero/*", "@trystero-p2p/*"],
              message:
                "Only apps/web/src/net/transport/trystero.ts (and its test) imports Trystero.",
            },
          ],
        },
      ],
    },
  },

  // The browser imports these through `@vibewars/game-maps/schema` and
  // `/geometry` (#8), so they must stay free of Node built-ins; `loader.ts`,
  // which reads `maps/` from disk, is behind `"."` only.
  {
    files: ["packages/game-maps/src/schema.ts", "packages/game-maps/src/geometry.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", ...builtinModules],
              message: "schema.ts and geometry.ts are imported by the browser; keep Node out.",
            },
            {
              group: ["trystero", "trystero/*", "@trystero-p2p/*"],
              message: "Only apps/web/src/net/transport/trystero.ts imports Trystero.",
            },
          ],
        },
      ],
    },
  },

  // The client never reaches the game-maps root, whose loader reads `maps/` with
  // node:fs and kills the page under vite dev (#646): only its subpaths.
  {
    files: ["apps/web/src/**/*.ts"],
    ignores: [
      "apps/web/src/net/transport/trystero.ts",
      "apps/web/src/net/transport/trystero.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@vibewars/game-maps",
              message:
                "The root loads maps with node:fs. In apps/web import /geometry, /schema, /maps/* or /training/*.",
            },
          ],
          patterns: [
            {
              group: ["trystero", "trystero/*", "@trystero-p2p/*"],
              message:
                "Only apps/web/src/net/transport/trystero.ts (and its test) imports Trystero.",
            },
          ],
        },
      ],
    },
  },

  // A session runs in a page, a worker and Node alike, and is handed its
  // Transport (#15): no Node built-ins, and no transport library. Its
  // tools/ are Node programs outside the build (the wire snapshot).
  {
    files: ["packages/game-session/src/**/*.ts"],
    ignores: ["packages/game-session/src/tools/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", ...builtinModules],
              message: "game-session runs in the browser too; keep Node out.",
            },
            {
              group: ["trystero", "trystero/*", "@trystero-p2p/*"],
              message: "game-session is handed a Transport; the Trystero one lives in apps/web.",
            },
          ],
        },
      ],
    },
  },

  // Tests deliberately feed wrong-typed values to validators to prove they are
  // rejected, so the rules that assume well-typed inputs only create noise.
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      // `expect(() => fn()).toThrow()` is the idiomatic shape for "this
      // call throws" across the whole test suite; the arrow is already as
      // clear as it gets, so requiring braces here is pure noise repeated
      // on every such assertion.
      "@typescript-eslint/no-confusing-void-expression": "off",
    },
  },

  // Must stay last: disables stylistic rules that would fight Prettier.
  prettier,
]);
