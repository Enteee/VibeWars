/// <reference types="vite/client" />

/**
 * Compile-time environment the client is allowed to read.
 *
 * Declared explicitly rather than leaning on Vite's catch-all index
 * signature, so a typo in a variable name is a type error instead of
 * `undefined` at runtime. Every entry must be prefixed `VITE_` or Vite
 * will not expose it to the bundle at all.
 */
interface ImportMetaEnv {
  /**
   * `broadcast` for the build e2e runs against, whose pages share one
   * browser (#403); `trystero`, or unset, for every other build. Read only
   * by `net/transport/index.ts`; `vite.config.ts` refuses anything else.
   */
  readonly VITE_VIBEWARS_TRANSPORT?: "trystero" | "broadcast";
  /**
   * `on` only in the build scripts/music-stress.mjs makes, the one build
   * where `?stress=` works (#420). Read only by `music/stress.ts`.
   */
  readonly VITE_VIBEWARS_STRESS?: string;
  /**
   * A decimal integer only in the build e2e runs against: every Team Lobby
   * draws from an RNG seeded with it, so a solo match always meets the same
   * foe (#2213). Unset for every other build. Read only by `net/session.ts`;
   * `vite.config.ts` refuses anything else.
   */
  readonly VITE_VIBEWARS_LOBBY_SEED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * This build's id (#1268): the commit `pages.yml` builds, the e2e build's
 * own, or `dev` for every other build, which never checks for a newer
 * one. `vite.config.ts` stamps it from `VIBEWARS_BUILD`.
 */
declare const __VIBEWARS_BUILD__: string;

/**
 * The release this build ships as (#2798): `0.1.0`, `0.2.0-rc` or `next`
 * from `pages.yml`, `dev` for every other build. `vite.config.ts` stamps
 * it from `VIBEWARS_RELEASE`.
 */
declare const __VIBEWARS_RELEASE__: string;
