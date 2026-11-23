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
  /**
   * The zero bits a ranked stamp needs (#3746), in place of
   * `RANKED_WORK_BITS`: e2e only, so its ranked matches do not wait on a
   * search. Read only by `net/transport/ranked-work.ts`; `vite.config.ts`
   * refuses anything but a count up to 32.
   */
  readonly VITE_VIBEWARS_WORK_BITS?: string;
  /** `off` skips the splash screen (#2884) unless the URL has `?splash`: e2e only. */
  readonly VITE_VIBEWARS_SPLASH?: string;
  /** `off` draws no menu background fight (#3156) unless the URL has `?menu-background`: e2e only. */
  readonly VITE_VIBEWARS_MENU_BACKGROUND?: string;
  /** `on` starts the tutorial at the URL's `?tutorial-station=N`, 1 for the first (#3383): e2e only. */
  readonly VITE_VIBEWARS_TUTORIAL_STATION?: string;
  /** `short` counts a hosted match down in 1 s (#3855) unless the URL has `?pre-match=real`: e2e only. */
  readonly VITE_VIBEWARS_PRE_MATCH?: string;
  /** `on` shows the HUD's end of a match from a fixed summary at the URL's `?summary-fixture` (#3563): e2e only. */
  readonly VITE_VIBEWARS_SUMMARY_FIXTURE?: string;
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

/**
 * True only in the build `scripts/bench/render-bench.mjs` makes: the lobby
 * offers the bench's reference map (#3255). `vite.config.ts` stamps it from
 * `VIBEWARS_BENCH_REFERENCE=1`; undefined in Node, where nothing stamps it.
 */
declare const __VIBEWARS_BENCH_REFERENCE__: boolean | undefined;
