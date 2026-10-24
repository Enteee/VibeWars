/**
 * The prefix every piece of browser storage this build writes lives under.
 *
 * GitHub Pages serves the release at `/VibeWars/` and the latest `main` at
 * `/VibeWars/next/`, both on the same origin, so without a namespace they
 * would share one IndexedDB and one set of localStorage keys, and a
 * character saved by a newer `next` could be unreadable by the release.
 * Deriving the name from the base path gives each deploy its own saves.
 * The server-served build and dev run at `/` and keep the plain
 * `vibewars` name.
 */
export function storageNamespace(base: string): string {
  return "vibewars" + base.replace(/\/$/, "");
}

/** This build's namespace, from the base path Vite was configured with. */
export const STORAGE_NAMESPACE = storageNamespace(import.meta.env.BASE_URL);
