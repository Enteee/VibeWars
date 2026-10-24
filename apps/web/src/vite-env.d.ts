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
   * WebSocket URL of the game server, e.g. `ws://localhost:2567`.
   *
   * Only set during `pnpm run dev`, where Vite serves the client on its
   * own port. Unset in production, where the server serves the client
   * and same-origin is correct.
   */
  readonly VITE_VIBEWARS_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
