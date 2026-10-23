// @ts-check
import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Type-aware linting is enabled repo-wide. It is slower than syntactic
 * linting, but it is the only way to catch the mistakes that actually matter
 * here — floating promises in the server loop, unsafe `any` leaking in from
 * untyped network payloads, and unchecked union narrowing in the skill engine.
 *
 * Rules are never disabled globally (brief §41). Where an exception is
 * genuinely required it is a narrowly scoped block with a written reason.
 */
export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/dist-types/**",
    "**/node_modules/**",
    "**/coverage/**",
    ".pnpm-store/**",
    ".devenv/**",
    ".direnv/**",
    "packages/game-data/generated/**",
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
      // An unawaited promise in a fixed-tick server is silent state corruption.
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
    files: ["apps/server/**/*.ts", "packages/**/*.ts", "*.config.ts", "*.config.mjs"],
    languageOptions: { globals: globals.node },
  },

  {
    files: ["apps/web/src/**/*.ts"],
    languageOptions: { globals: globals.browser },
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
    },
  },

  // Must stay last: disables stylistic rules that would fight Prettier.
  prettier,
]);
