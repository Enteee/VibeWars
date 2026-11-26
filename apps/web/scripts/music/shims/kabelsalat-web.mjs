/**
 * Stand-in for `@kabelsalat/web`, which `@strudel/core` imports at module
 * scope and which does not load in Node. Mapped in Node only (a vitest alias,
 * `register-shims.mjs` for the CLI); the browser build keeps the real package.
 */
export function SalatRepl() {
  // Never constructed in Node: core only needs the name to exist.
}
export default { SalatRepl };
