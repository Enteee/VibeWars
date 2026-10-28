/**
 * The Random Arena queue's vocabulary (#854): the ticket a queued client
 * publishes, and the times every client applies to it. There is no server:
 * every client reads the same tickets and forms the same matches from
 * them, so these are the numbers they must agree on.
 */

/**
 * What a player can queue for. Which of these the menu offers is Q97's
 * decision; formation takes any of them.
 */
export const QUEUE_MODES = ["random-arena-1v1", "random-arena-2v2", "random-arena-4v4"] as const;

export type QueueMode = (typeof QUEUE_MODES)[number];

const TEAM_SIZES: Readonly<Record<QueueMode, number>> = {
  "random-arena-1v1": 1,
  "random-arena-2v2": 2,
  "random-arena-4v4": 4,
};

/** Players a side in `mode`; a match is twice this. */
export function teamSizeOf(mode: QueueMode): number {
  return TEAM_SIZES[mode];
}

/** A queued client re-publishes its ticket this often. */
export const TICKET_HEARTBEAT_MS = 5_000;
/** A ticket not re-published for this long is dead to everyone. */
export const TICKET_TTL_MS = 15_000;
/** A group forms once the same tickets have made it for this long. */
export const FORMATION_SETTLE_MS = 3_000;
/** A group not all seated by then falls through, and everyone queues again. */
export const FORMATION_TIMEOUT_MS = 20_000;
/** A ticket that never showed up for its group is skipped for this long. */
export const NO_SHOW_IGNORE_MS = 120_000;

/** One queued player, or a whole team queueing together. */
export interface QueueTicket {
  /**
   * The x-only public key of the throwaway Nostr key only its owner
   * holds, as 64 lowercase hex digits.
   */
  readonly ticketId: string;
  /** `PROTOCOL_VERSION`; a ticket of another is never matched. */
  readonly protocol: string;
  readonly mode: QueueMode;
  /**
   * The public key of every player it queues, sorted, `ticketId` first:
   * `[ticketId]` alone, or `teamSizeOf(mode)` of them for a team that
   * stayed together (#882). Each member holds its own key; the party's
   * leader, the lowest, publishes with it.
   */
  readonly members: readonly string[];
  /** When it entered the queue, ms since the epoch, as its owner claims. */
  readonly enteredAt: number;
  /** When this copy of it was published, ms since the epoch. */
  readonly heartbeatAt: number;
  /**
   * `null` for a solo. For a party: the group it won together, and each
   * member's consent signature over it, `consents[i]` by `members[i]`
   * (#1078). Only the leader publishes, so this is how the others say
   * they are in.
   */
  readonly party: TicketParty | null;
}

/** How a party ticket proves every member is in it (#1078). */
export interface TicketParty {
  /** The group its members won together, 64 lowercase hex digits. */
  readonly groupId: string;
  /** 128 lowercase hex digits each, in `members` order. */
  readonly consents: readonly string[];
}

const TICKET_ID = /^[0-9a-f]{64}$/;
/** A group id is a sha256, as hex. */
const GROUP_ID = TICKET_ID;
const CONSENT = /^[0-9a-f]{128}$/;
const TICKET_FIELDS = 7;
const PARTY_FIELDS = 2;
/** Longer than any `PROTOCOL_VERSION`, short enough to cost nothing. */
const MAX_PROTOCOL_LENGTH = 64;

function isQueueMode(value: unknown): value is QueueMode {
  return QUEUE_MODES.some((known) => known === value);
}

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * `value` as the members of a ticket `ticketId` of `mode`: one key or a
 * whole team of them, sorted, each once, `ticketId` first.
 */
function parseMembers(
  value: unknown,
  ticketId: string,
  mode: QueueMode,
): readonly string[] | undefined {
  if (!Array.isArray(value) || (value.length !== 1 && value.length !== teamSizeOf(mode))) {
    return undefined;
  }
  const members: string[] = [];
  for (const member of value as readonly unknown[]) {
    const previous = members.at(-1);
    if (
      typeof member !== "string" ||
      !TICKET_ID.test(member) ||
      (previous !== undefined && previous >= member)
    ) {
      return undefined;
    }
    members.push(member);
  }
  return members[0] === ticketId ? members : undefined;
}

/**
 * `value` as the party of a ticket with `members`: `null` exactly for a
 * solo, and for a party a group id and one consent a member. Shape only:
 * the board checks the signatures.
 */
function parseParty(value: unknown, members: readonly string[]): TicketParty | null | undefined {
  if (value === null) {
    return members.length === 1 ? null : undefined;
  }
  if (
    members.length === 1 ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== PARTY_FIELDS
  ) {
    return undefined;
  }
  const { groupId, consents } = value as Record<string, unknown>;
  if (
    typeof groupId !== "string" ||
    !GROUP_ID.test(groupId) ||
    !Array.isArray(consents) ||
    consents.length !== members.length
  ) {
    return undefined;
  }
  const signed: string[] = [];
  for (const consent of consents as readonly unknown[]) {
    if (typeof consent !== "string" || !CONSENT.test(consent)) {
      return undefined;
    }
    signed.push(consent);
  }
  return { groupId, consents: signed };
}

/**
 * A ticket as a peer published it, or `undefined` if it is not one: a bad
 * id, an unknown mode, members that are neither alone nor a whole team,
 * unsorted, repeated or not led by its id, a party that does not match
 * them, a time that is not a whole number of ms, or any field more than a
 * ticket has, so a flood of padded events costs a client nothing to
 * refuse.
 */
export function parseQueueTicket(raw: unknown): QueueTicket | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  if (Object.keys(raw).length !== TICKET_FIELDS) {
    return undefined;
  }
  const { ticketId, protocol, mode, members, enteredAt, heartbeatAt, party } = raw as Record<
    string,
    unknown
  >;
  if (
    typeof ticketId !== "string" ||
    !TICKET_ID.test(ticketId) ||
    typeof protocol !== "string" ||
    protocol.length === 0 ||
    protocol.length > MAX_PROTOCOL_LENGTH ||
    !isQueueMode(mode) ||
    !isTime(enteredAt) ||
    !isTime(heartbeatAt)
  ) {
    return undefined;
  }
  const parsed = parseMembers(members, ticketId, mode);
  const proof = parsed === undefined ? undefined : parseParty(party, parsed);
  return parsed === undefined || proof === undefined
    ? undefined
    : { ticketId, protocol, mode, members: parsed, enteredAt, heartbeatAt, party: proof };
}
