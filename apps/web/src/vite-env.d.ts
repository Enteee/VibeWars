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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
