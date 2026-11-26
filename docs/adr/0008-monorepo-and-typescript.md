# ADR-0008: Monorepo Tooling and TypeScript Configuration

## Status

Accepted (2026-10-23).

## Context

The brief requires strict TypeScript, no `any`/`as any` shortcuts, no
circular dependencies, and a package manager with reproducible lockfiles
(§28, §30). Package-manager and compiler choices were verified against their
actual currently-published versions rather than assumed.

## Decision

- **pnpm** as the package manager (workspace via `pnpm-workspace.yaml`),
  pinned via `packageManager` in `package.json`. pnpm's content-addressable
  store and strict-by-default dependency resolution is what _caught_ the
  Colyseus dual-module-copy bug documented in ADR-0002 — a looser resolver
  (plain npm/yarn classic hoisting) would likely have hidden the same
  structural problem instead of surfacing it as a concrete bug.
- **TypeScript 6.0.3**, not the newly-released TypeScript 7 (checked via
  `npm view typescript dist-tags`: `latest` is `7.0.2`). TypeScript 7 ships a
  from-scratch native (Go) compiler with **no stable programmatic API yet**
  (confirmed via release coverage: "no stable programmatic API yet... 7.1"),
  and `typescript-eslint@8.72.0` — needed for type-aware linting, which this
  project relies on — declares a peer range of
  `typescript: ">=4.8.4 <6.1.0"`. **6.0.3 is the newest version satisfying
  that range**, confirmed by listing all published `typescript` versions and
  intersecting with the peer range by hand. This is revisited once
  `typescript-eslint` ships TS7 support.
- `tsconfig.base.json` is intentionally stricter than bare `strict: true`:
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noUnusedLocals`/`noUnusedParameters`, and `erasableSyntaxOnly` (which
  forbids legacy decorators, `enum`, and namespaces — see ADR-0002's
  `@colyseus/schema` builder-syntax decision, which this setting directly
  motivated) are all on from day one, because turning them on _after_ a
  codebase exists is far more expensive than starting with them.
- Each package/app has **two** tsconfigs: `tsconfig.build.json` (the
  project-referenced build used by `tsc --build`, emitting only `src/**`) and
  `tsconfig.json` (a `noEmit` superset that also typechecks `*.test.ts` and
  that package's own config files, so lint/typecheck coverage is not
  accidentally narrower than what ships). The root `tsconfig.json` similarly
  typechecks the repo's own tooling configs (`eslint.config.mjs`,
  `vitest.config.ts`, ...) — a config file with a type error is a real bug
  class this setup catches, which plain `tsc --build` alone would miss since
  such files are deliberately excluded from the shipped build graph.
- **ESLint 10** flat config (`eslint.config.mjs`, using `defineConfig` from
  `eslint/config` — the non-deprecated entry point as of ESLint 10, not the
  bare array export already deprecated under `typescript-eslint`'s own
  lint rules) with `typescript-eslint`'s `strictTypeChecked` +
  `stylisticTypeChecked` presets, project-service-based (no manually
  maintained `project` glob). `no-explicit-any`, `no-non-null-assertion`,
  `no-floating-promises`, and `no-misused-promises` are errors, not warnings,
  directly enforcing brief §30/§41 ("never silently weaken type safety").
- **Prettier 3.9** for formatting, run as a separate `format`/`format:check`
  script rather than folded into ESLint, so the two tools' jobs (style vs.
  correctness) stay separable in CI output.
- **Vitest 5** for tests — colocated `*.test.ts` files, a single root
  `vitest.config.ts` scanning `{apps,packages}/*/src/**/*.test.ts`, Node
  environment only (no jsdom): rendering-dependent behavior is a Playwright
  concern (brief §31), not something to fake with a simulated DOM.

## Consequences

- Every one of these choices was verified against a real install and a real
  build in this repository (see Sprint 0 report), not asserted from
  documentation alone — concretely, this process is what found the TS7/
  typescript-eslint incompatibility and the two Phaser/Colyseus/pnpm
  dependency-resolution issues documented in ADR-0002, before they could
  reach a developer's machine as a confusing first-run failure.
- The two-tsconfig-per-package pattern is more files to maintain than a
  single config, in exchange for lint/typecheck coverage that matches what
  is actually in the repository (tests and tool configs included) rather
  than only what ships in `dist/`.
- Pinning TypeScript below `7.x` is a deliberate, temporary constraint with a
  named unblocking condition (`typescript-eslint` TS7 support), not an
  indefinite policy; revisit when that lands.

## Alternatives Considered

- **npm or Yarn instead of pnpm.** Rejected: pnpm's non-hoisting-by-default
  resolution is strictly more likely to surface real dependency-shape bugs
  (as it did here) than to hide them; the one case where hoisting is
  genuinely needed (ADR-0002) is handled with a scoped, documented
  `public-hoist-pattern`, not a blanket `node-linker=hoisted`.
- **TypeScript 7 now, accept broken type-aware linting.** Rejected: the brief
  explicitly requires strict linting as part of the Definition of Done
  (§39); shipping TS7 today would mean disabling exactly the lint tier the
  brief cares most about.
