/**
 * Where e2e serves the client (#403): the static build, under the
 * sub-path `pages.yml` deploys `next` at. `playwright.config.ts` builds
 * and serves it there.
 */
export const E2E_BASE = "/VibeWars/next/";

/**
 * What the client prefixes its storage with under `E2E_BASE`, as
 * `apps/web/src/storage/namespace.ts` derives it: a test that seeds
 * localStorage or IndexedDB must use these names, or the game never
 * reads what it seeded.
 */
export const STORAGE_NAMESPACE = "vibewars" + E2E_BASE.replace(/\/$/, "");

/** The build id `playwright.config.ts` stamps into the e2e build (#1268). */
export const E2E_BUILD = "e2e";
