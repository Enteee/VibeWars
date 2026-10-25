/**
 * Where the music lives, under the client's base: `/` on the LAN server,
 * `/VibeWars/next/` on GitHub Pages (#103). Every URL is our own; nothing
 * of the music loads from another host (ADR-0028).
 *
 * @param base `import.meta.env.BASE_URL`, which ends in `/`
 */
export function musicHostUrl(base: string): string {
  return `${base}music-host.html`;
}

/**
 * The palette's directory, absolute, with the trailing slash `samples()`
 * needs to resolve `strudel.json`'s relative paths against.
 *
 * @param base `import.meta.env.BASE_URL`
 * @param page the host page's own URL
 */
export function samplesBaseUrl(base: string, page: string): string {
  return new URL(`${base}music/samples/`, page).href;
}
