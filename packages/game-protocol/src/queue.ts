/**
 * The queue's vocabulary (#854): the ticket a queued client publishes,
 * and the times every client applies to it. Random Arena queues players
 * and parties; Team Arena, Heroes' Ascent and GvG queue whole teams
 * (ADR-0042). There is no server:
 * every client reads the same tickets and forms the same matches from
 * them, so these are the numbers they must agree on.
 */

import type { LobbyMode } from "./protocol.js";

/**
 * What a player can queue for. Which of these the menu offers is Q97's
 * decision; formation takes any of them.
 */
export const QUEUE_MODES = [
  "random-arena-1v1",
  "random-arena-2v2",
  "random-arena-4v4",
  "team-arena",
  "heroes-ascent",
  "gvg",
] as const;

export type QueueMode = (typeof QUEUE_MODES)[number];

const TEAM_SIZES: Readonly<Record<QueueMode, number>> = {
  "random-arena-1v1": 1,
  "random-arena-2v2": 2,
  "random-arena-4v4": 4,
  "team-arena": 4,
  "heroes-ascent": 8,
  gvg: 8,
};

const TEAM_QUEUE_MODES: ReadonlySet<QueueMode> = new Set(["team-arena", "heroes-ascent", "gvg"]);

/** Players a side in `mode`; a match is twice this. */
export function teamSizeOf(mode: QueueMode): number {
  return TEAM_SIZES[mode];
}

/**
 * Whether `mode` queues whole teams (ADR-0042): each ticket is one side,
 * its humans and the bots it brings, and two of them make a match.
 */
export function isTeamQueueMode(mode: QueueMode): boolean {
  return TEAM_QUEUE_MODES.has(mode);
}

/**
 * Whether `members` is in a party's one order (#1766): its leader, who
 * publishes its ticket and sends its team plan, first, then the rest
 * sorted, no key twice. Any other order is malformed, never reordered,
 * so every peer hashes and signs the same list. A sorted list is one.
 */
export function inPartyOrder(members: readonly string[]): boolean {
  const [leader, ...rest] = members;
  let previous: string | undefined;
  for (const member of rest) {
    if (member === leader || (previous !== undefined && previous >= member)) {
      return false;
    }
    previous = member;
  }
  return true;
}

/** A lobby's `mode` as the queue mode its party queues for (#1766), if it is a team mode. */
export function teamQueueModeOf(mode: LobbyMode): QueueMode | undefined {
  return mode === "team-arena" || mode === "heroes-ascent" || mode === "gvg" ? mode : undefined;
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

/**
 * One queued player, a Random Arena team that stayed together, or a team
 * mode's whole side (ADR-0042).
 */
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
   * The public key of every player it queues, `ticketId` first, then sorted (`inPartyOrder`).
   * In Random Arena: `[ticketId]` alone, or `teamSizeOf(mode)` of them
   * for a team that stayed together (#882). In a team mode: the side's
   * humans, at least one, with `bots` making up the rest. Each member
   * holds its own key; the party's leader, the lowest, publishes with it.
   */
  readonly members: readonly string[];
  /**
   * The seats of its side it fills with bots: 0 in Random Arena, and in a
   * team mode `teamSizeOf(mode) - members.length`. Bots only ever fill
   * their own team's seats (ADR-0042).
   */
  readonly bots: number;
  /** When it entered the queue, ms since the epoch, as its owner claims. */
  readonly enteredAt: number;
  /** When this copy of it was published, ms since the epoch. */
  readonly heartbeatAt: number;
  /**
   * `null` for one human. For a party: the group it is, and each
   * member's consent signature over it, `consents[i]` by `members[i]`
   * (#1078). Only the leader publishes, so this is how the others say
   * they are in.
   */
  readonly party: TicketParty | null;
  /**
   * In Heroes' Ascent, the 0-based round its side has reached, below
   * `ASCENT_ROUNDS` (#1996): it only meets a side at the same round.
   * `null` in every other mode.
   */
  readonly ascentRound: number | null;
}

/** How a party ticket proves every member is in it (#1078). */
export interface TicketParty {
  /**
   * The group, 64 lowercase hex digits: in Random Arena the one its
   * members won together; for a lobby's party (ADR-0042),
   * `sha256(roomId ‖ queueNonce)`, `roomId` the lobby's derived room
   * (`deriveLobbyRoom`), never its key, as tickets are public
   * (ADR-0043), and `queueNonce` a fresh one its host draws on Find a
   * match and sends each guest.
   */
  readonly groupId: string;
  /** 128 lowercase hex digits each, in `members` order. */
  readonly consents: readonly string[];
}

const TICKET_ID = /^[0-9a-f]{64}$/;
/** A group id is a sha256, as hex. */
const GROUP_ID = TICKET_ID;
const CONSENT = /^[0-9a-f]{128}$/;
const TICKET_FIELDS = 9;
const PARTY_FIELDS = 2;
/** Longer than any `PROTOCOL_VERSION`, short enough to cost nothing. */
const MAX_PROTOCOL_LENGTH = 64;

/** Heroes' Ascent's rounds, the Hall of Heroes the last (#1996). */
export const ASCENT_ROUNDS = 4;

/**
 * Whether `round` is a ticket of `mode`'s `ascentRound`: a 0-based round
 * below `ASCENT_ROUNDS` in Heroes' Ascent, `null` in any other mode.
 */
function isAscentRoundOf(round: unknown, mode: QueueMode): round is number | null {
  return mode === "heroes-ascent"
    ? typeof round === "number" &&
        Number.isSafeInteger(round) &&
        round >= 0 &&
        round < ASCENT_ROUNDS
    : round === null;
}

/** Whether `value` is one of `QUEUE_MODES`. */
export function isQueueMode(value: unknown): value is QueueMode {
  return QUEUE_MODES.some((known) => known === value);
}

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * `value` as the members of a ticket `ticketId` of `mode` that brings
 * `bots`: in Random Arena, no bots and one key or a whole team of them;
 * in a team mode, at least one key and with the bots exactly a side.
 * Sorted, each once, `ticketId` first.
 */
function parseMembers(
  value: unknown,
  ticketId: string,
  mode: QueueMode,
  bots: number,
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const size = teamSizeOf(mode);
  if (
    isTeamQueueMode(mode)
      ? value.length < 1 || value.length + bots !== size
      : bots !== 0 || (value.length !== 1 && value.length !== size)
  ) {
    return undefined;
  }
  const members: string[] = [];
  for (const member of value as readonly unknown[]) {
    if (typeof member !== "string" || !TICKET_ID.test(member)) {
      return undefined;
    }
    members.push(member);
  }
  return members[0] === ticketId && inPartyOrder(members) ? members : undefined;
}

/**
 * `value` as the party of a ticket with `members`: `null` exactly for
 * one human, and for a party a group id and one consent a member. Shape only:
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
 * id, an unknown mode, members and bots that are not a solo or a whole
 * team in Random Arena or not a whole side in a team mode, members
 * out of party order or not led by its id, a party that does not match
 * them, an `ascentRound` that is not its mode's, a time that is not a whole number of ms, or any field more than a
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
  const { ticketId, protocol, mode, members, bots, enteredAt, heartbeatAt, party, ascentRound } =
    raw as Record<string, unknown>;
  if (
    typeof ticketId !== "string" ||
    !TICKET_ID.test(ticketId) ||
    typeof protocol !== "string" ||
    protocol.length === 0 ||
    protocol.length > MAX_PROTOCOL_LENGTH ||
    !isQueueMode(mode) ||
    typeof bots !== "number" ||
    !Number.isSafeInteger(bots) ||
    bots < 0 ||
    !isTime(enteredAt) ||
    !isTime(heartbeatAt) ||
    !isAscentRoundOf(ascentRound, mode)
  ) {
    return undefined;
  }
  const parsed = parseMembers(members, ticketId, mode, bots);
  const proof = parsed === undefined ? undefined : parseParty(party, parsed);
  return parsed === undefined || proof === undefined
    ? undefined
    : {
        ticketId,
        protocol,
        mode,
        members: parsed,
        bots,
        enteredAt,
        heartbeatAt,
        party: proof,
        ascentRound,
      };
}
