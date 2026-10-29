import type { StoredCharacter } from "./schema.js";

/**
 * A copy of `source` under a new `id`, named `<name> (copy)`: the build
 * editor's Duplicate. The rolled character's Clone rolls instead (#1457).
 */
export function cloneCharacter(source: StoredCharacter, id: string, now: number): StoredCharacter {
  return { ...source, id, name: `${source.name} (copy)`, updatedAt: now };
}
