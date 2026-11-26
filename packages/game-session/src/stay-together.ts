/**
 * Stay together (#882): after a queued 2v2 or 4v4 match, its host asks
 * nothing and decides everything. Each winner sends a fresh member key,
 * or `null`; once every winner of a whole side has sent a key, each of
 * them is proposed the party, and signs its consent to it (#1078,
 * `lobby-host.ts`). One no, one winner gone, or
 * the window running out, and those who said yes are told the team split.
 * The host may be a winner too, and votes like one.
 */

/** What the host knows of the vote so far. */
export interface StayTogetherInput {
  /** Players a side; a party is all of them. */
  readonly teamSize: number;
  /** The winning side's peers as the match ended, the host's own player included if it won. */
  readonly winners: readonly string[];
  /** Each winner's vote by peer id: a member key, or `null` for no; one per winner. */
  readonly votes: ReadonlyMap<string, string | null>;
  /** Winners whose peer has left since. */
  readonly gone: ReadonlySet<string>;
  /** The window ran out. */
  readonly timedOut: boolean;
}

export type StayTogetherDecision =
  /** Not every winner has voted yet, and nobody has said no. */
  | { readonly kind: "waiting" }
  /** Every winner sent a key: `members` sorted, sent to each of `to`. */
  | { readonly kind: "formed"; readonly members: readonly string[]; readonly to: readonly string[] }
  /** The party is off: each of `to` said yes, and is told to queue alone. */
  | { readonly kind: "split"; readonly to: readonly string[] };

export function decideStayTogether(input: StayTogetherInput): StayTogetherDecision {
  const { teamSize, winners, votes, gone, timedOut } = input;
  /** Winners still here who sent a key, and each key. */
  const yes = winners.flatMap((peerId) => {
    const memberKey = votes.get(peerId);
    return memberKey === undefined || memberKey === null || gone.has(peerId)
      ? []
      : [{ peerId, memberKey }];
  });
  const to = yes.map(({ peerId }) => peerId);
  const keys = new Set(yes.map(({ memberKey }) => memberKey));
  if (
    yes.length === teamSize &&
    winners.length === teamSize &&
    // Two winners with one key are no party: neither could seat on it.
    keys.size === teamSize
  ) {
    return { kind: "formed", members: [...keys].sort(), to };
  }
  const off =
    timedOut ||
    winners.length !== teamSize ||
    winners.some((peerId) => gone.has(peerId) || votes.get(peerId) === null) ||
    yes.length === teamSize;
  return off ? { kind: "split", to } : { kind: "waiting" };
}
