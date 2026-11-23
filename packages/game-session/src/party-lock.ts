/**
 * Whether the party a lock kept is still the one here (#3815): the
 * lock's members, its non-vacant `claimers`, are exactly `humans`, and
 * none of them is away. Bots' and vacant slots are `null` and count for
 * nothing.
 */
export const keepsParty = (
  lock: { readonly claimers: readonly (string | null)[] },
  humans: readonly { readonly id: string; readonly away: boolean }[],
): boolean => {
  const held = new Set(lock.claimers.filter((holder) => holder !== null));
  return humans.length === held.size && humans.every((human) => held.has(human.id) && !human.away);
};
