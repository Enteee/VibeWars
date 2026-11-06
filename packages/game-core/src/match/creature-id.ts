/**
 * A creature's id (#2483): `<ownerId>/c<n>` for one a player or bot owns,
 * `masterless/c<n>` for one nobody does (#2092). The format lives here
 * once, so a reader can name a creature's owner from its id alone, even
 * after the creature has left the snapshot.
 */

const MASTERLESS = "masterless";

const CREATURE_ID = /^(.+)\/c(\d+)$/;

/** The id of the `n`th creature, owned by `ownerId` or masterless. */
export function mintCreatureId(ownerId: string | undefined, n: number): string {
  return `${ownerId ?? MASTERLESS}/c${String(n)}`;
}

/**
 * Who owns the creature `id`, or `undefined` for a masterless creature
 * or an id that is no creature's.
 */
export function creatureOwnerOf(id: string): string | undefined {
  const owner = CREATURE_ID.exec(id)?.[1];
  return owner === MASTERLESS ? undefined : owner;
}
