/**
 * A creature's id (#1052, #2092, #2483): `<ownerId>/c<n>` for one with a
 * master, `masterless/c<n>` for one without. The format lives here alone,
 * so the simulation that mints it and the readouts that read it agree.
 */

const MASTERLESS = "masterless";
const SEPARATOR = "/c";

/** The id of the `n`th creature, `owner`'s or, `undefined`, masterless. */
export function creatureId(ownerId: string | undefined, n: number): string {
  return `${ownerId ?? MASTERLESS}${SEPARATOR}${String(n)}`;
}

/**
 * Whose creature `id` is: its owner's id, or `undefined` for a masterless
 * one or an id that is not a creature's. Read from the id, not a
 * snapshot, so a creature that died this step still has its owner.
 */
export function creatureOwnerOf(id: string): string | undefined {
  const at = id.lastIndexOf(SEPARATOR);
  if (at <= 0 || !/^\d+$/.test(id.slice(at + SEPARATOR.length))) {
    return undefined;
  }
  const owner = id.slice(0, at);
  return owner === MASTERLESS ? undefined : owner;
}
