/**
 * Manifest hygiene (#369): ids unique and kebab-case, a source file for each
 * entry and none without one, `layers` 1–4, `phraseCycles` 4 or 8, moods
 * non-empty and valid.
 */

/**
 * What `manifest.json` is supposed to hold per track. Fields are `unknown`
 * where this file's job is to reject a wrong value.
 *
 * @typedef {object} ManifestEntry
 * @property {string} id
 * @property {string} title
 * @property {unknown} layers
 * @property {unknown} phraseCycles
 * @property {unknown} moods
 * @property {unknown} colour
 * @property {number} bpm
 * @property {string} key
 */

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SOURCE = /^(.+)\.strudel\.js$/;

/**
 * @param {readonly ManifestEntry[]} manifest parsed `manifest.json`
 * @param {readonly string[]} files file names in the tracks directory
 * @param {readonly string[]} moods the valid `Mood` values
 * @returns {string[]} problems
 */
export function checkManifest(manifest, files, moods) {
  /** @type {string[]} */
  const problems = [];
  const sources = new Set(files.flatMap((f) => SOURCE.exec(f)?.[1] ?? []));
  const seen = new Set();
  for (const t of manifest) {
    const id = t.id;
    if (seen.has(id)) problems.push(`${id}: id appears twice in the manifest`);
    seen.add(id);
    if (!KEBAB.test(id)) problems.push(`${id}: id is not kebab-case`);
    if (!sources.has(id)) problems.push(`${id}: ${id}.strudel.js does not exist`);
    if (![1, 2, 3, 4].includes(t.layers))
      problems.push(`${id}: layers is ${String(t.layers)}, want 1–4`);
    if (![4, 8].includes(t.phraseCycles))
      problems.push(`${id}: phraseCycles is ${String(t.phraseCycles)}, want 4 or 8`);
    if (!Array.isArray(t.moods) || t.moods.length === 0) {
      problems.push(`${id}: moods is empty`);
    } else {
      for (const m of t.moods) {
        if (!moods.includes(String(m))) problems.push(`${id}: "${String(m)}" is not a mood`);
      }
    }
    if (!Array.isArray(t.colour)) problems.push(`${id}: colour is required, use [] for none`);
  }
  for (const id of sources) {
    if (!seen.has(id)) problems.push(`${id}: ${id}.strudel.js has no manifest entry`);
  }
  return problems;
}
