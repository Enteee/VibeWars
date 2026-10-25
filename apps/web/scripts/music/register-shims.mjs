/**
 * Node-only module-resolution hook for the CLI: sends `@kabelsalat/web`, which
 * `@strudel/core` imports at module scope and which does not load in Node, to
 * the shim. Everything else resolves as usual. (`vitest.config.ts` does the
 * same with an alias.)
 */

import { registerHooks } from "node:module";

const SHIM = new URL("./shims/kabelsalat-web.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@kabelsalat/web") return { url: SHIM, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
