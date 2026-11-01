/**
 * Queue formation (#869, #854 C4; team modes ADR-0042): from the tickets a client
 * sees, which matches they make. There is no server to decide it, so it
 * is a pure function of its input: every client that sees the same live
 * tickets forms the same groups, with the same room, host, teams and map,
 * without a word to anyone. It has no clock, network or randomness of its
 * own; the settle window and the publishing are the caller's.
 */

import { createRng, seedFromString } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  TICKET_TTL_MS,
  isTeamQueueMode,
  teamSizeOf,
  type QueueMode,
  type QueueTicket,
} from "@vibewars/game-protocol";

/** One match the queue formed. */
export interface FormedGroup {
  /** sha256 of its sorted ticket ids, as hex. */
  readonly groupId: string;
  /** Where it meets: `ROOM_PREFIX` and `groupId`, which no lobby code can be. */
  readonly room: string;
  /** Who hosts: see `hostOf`. A party chosen hosts by its leader, `members[0]`. */
  readonly hostTicketId: string;
  /**
   * Seat keys per side, shuffled by `groupId` (#882): a solo's ticket id,
   * or every member key of a party, which is its whole side.
   */
  readonly teams: readonly [readonly string[], readonly string[]];
  /** Each party's members, sorted, `members[0]` its ticket id: in a team mode, every ticket's. */
  readonly parties: readonly (readonly string[])[];
  /** Picked from the pool by `groupId`. */
  readonly mapId: string;
  /**
   * What it queued for. In a team mode (ADR-0042) each side is one
   * ticket's humans, and the side's bots make up `teamSizeOf(mode)`.
   */
  readonly mode: QueueMode;
}

export interface FormGroupsInput {
  /** Every ticket the caller has seen, live or not, in any order. */
  readonly tickets: readonly QueueTicket[];
  /** ms since the epoch. */
  readonly now: number;
  readonly mode: QueueMode;
  /** Ticket ids that never showed up for an earlier group (#854 C7). */
  readonly ignored: ReadonlySet<string>;
  /** The maps a group may play on, in the same order on every client. */
  readonly mapPool: readonly string[];
}

/**
 * Lobby codes are upper case (`LOBBY_CODE_ALPHABET`) with no dash, so a
 * queue room can never be one.
 */
export const ROOM_PREFIX = "ra-";

/** Which of two tickets queued first; a total order, so input order never matters. */
function queueOrder(a: QueueTicket, b: QueueTicket): number {
  return (
    a.enteredAt - b.enteredAt ||
    compare(a.ticketId, b.ticketId) ||
    b.heartbeatAt - a.heartbeatAt ||
    a.members.length - b.members.length ||
    compare(a.members.join(), b.members.join())
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Whether `ticket` was heard within `TICKET_TTL_MS` of `now`, either way:
 * a peer's clock is not trusted, and a heartbeat from far in the future
 * would otherwise never expire (#870).
 */
export function isLive(ticket: QueueTicket, now: number): boolean {
  return Math.abs(now - ticket.heartbeatAt) <= TICKET_TTL_MS;
}

/**
 * The live tickets, first queued first: this protocol and mode, `isLive`,
 * each id once. Ignored ones are still here: see `liveQueue`.
 */
function liveTickets(input: Pick<FormGroupsInput, "tickets" | "now" | "mode">): QueueTicket[] {
  const live = input.tickets
    .filter(
      (ticket) =>
        ticket.protocol === PROTOCOL_VERSION &&
        ticket.mode === input.mode &&
        isLive(ticket, input.now),
    )
    .sort(queueOrder);
  const ids = new Set<string>();
  return live.filter((ticket) => {
    if (ids.has(ticket.ticketId)) {
      return false;
    }
    ids.add(ticket.ticketId);
    return true;
  });
}

/**
 * Which of `live` keep their seat keys to themselves (#882): a seat key
 * seats once. The board passes a party only with every member's consent
 * (#1078), so a key on two live tickets signed both, and that is its
 * holder's own doing. A party naming another live ticket's id is
 * dropped, and two parties naming one member are both dropped: neither
 * queued first can win, since `enteredAt` is the owner's claim.
 * Counted over every live ticket, ignored or not, so a client's own
 * ignored set never changes which party is dropped.
 */
function unclaimed(live: readonly QueueTicket[]): (ticket: QueueTicket) => boolean {
  const ids = new Set(live.map((ticket) => ticket.ticketId));
  const claims = new Map<string, number>();
  for (const ticket of live) {
    for (const member of ticket.members.slice(1)) {
      claims.set(member, (claims.get(member) ?? 0) + 1);
    }
  }
  return (ticket) =>
    ticket.members.slice(1).every((member) => !ids.has(member) && claims.get(member) === 1);
}

/** The tickets formation takes: `liveTickets`, not ignored and `unclaimed`. */
function liveQueue(input: FormGroupsInput): QueueTicket[] {
  const live = liveTickets(input);
  const own = unclaimed(live);
  return live.filter((ticket) => !input.ignored.has(ticket.ticketId) && own(ticket));
}

/** A ticket and where it stands in the queue. */
interface Queued {
  readonly ticket: QueueTicket;
  readonly place: number;
}

/** Which of two candidate groups takes the earlier queued: places compared in order. */
function earlier(a: readonly Queued[], b: readonly Queued[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const difference = (a[i]?.place ?? 0) - (b[i]?.place ?? 0);
    if (difference !== 0) {
      return difference < 0;
    }
  }
  return a.length <= b.length;
}

/**
 * Whether `ticket` of `mode` is a whole side by itself: a party in Random
 * Arena, any ticket in a team mode, even one human's with its bots.
 */
function isSide(ticket: QueueTicket, mode: QueueMode): boolean {
  return isTeamQueueMode(mode) || ticket.members.length > 1;
}

/**
 * The groups `queue` fills, in one pass, front first. Each ticket joins
 * the waiting solos or parties; as soon as they can fill a match, two
 * parties, a party and a side of solos, or two sides of solos, the one
 * of those that takes the earliest queued forms, and the rest wait for
 * the next. A party is never split, and one that cannot be matched yet
 * keeps its place. In a team mode there are no solos: the two earliest
 * tickets form.
 */
function takeGroups(queue: readonly QueueTicket[], mode: QueueMode): QueueTicket[][] {
  const teamSize = teamSizeOf(mode);
  const groups: QueueTicket[][] = [];
  let solos: Queued[] = [];
  let parties: Queued[] = [];
  queue.forEach((ticket, place) => {
    // At a team size of 1, every Random Arena ticket is a solo.
    (isSide(ticket, mode) ? parties : solos).push({ ticket, place });
    const candidates: Queued[][] = [];
    if (parties.length >= 2) {
      candidates.push(...reachable(parties.slice(0, 2), [parties]));
    }
    if (parties.length >= 1 && solos.length >= teamSize) {
      candidates.push(
        ...reachable([...parties.slice(0, 1), ...solos.slice(0, teamSize)], [parties, solos]),
      );
    }
    if (solos.length >= 2 * teamSize) {
      candidates.push(...reachable(solos.slice(0, 2 * teamSize), [solos]));
    }
    const best = candidates
      .map((candidate) => [...candidate].sort((a, b) => a.place - b.place))
      .reduce<Queued[] | undefined>(
        (chosen, candidate) =>
          chosen === undefined || earlier(candidate, chosen) ? candidate : chosen,
        undefined,
      );
    if (best === undefined) {
      return;
    }
    const taken = new Set(best);
    solos = solos.filter((queued) => !taken.has(queued));
    parties = parties.filter((queued) => !taken.has(queued));
    groups.push(best.map((queued) => queued.ticket));
  });
  return groups;
}

/**
 * The candidates `front`, drawn front first from `pools`, stands for
 * (#2090): itself when any of its tickets is not `hardNat`, since a
 * group of only hard ones could not connect. Else, per pool, `front`
 * with that pool's latest placed member swapped for the pool's earliest
 * ticket not hard, where there is one. Dropping `front` instead would
 * block the queue's head for good: in [A hard, B hard, C open] the solos
 * candidate stays [A, B]. The hard tickets left over keep their place.
 */
function reachable(front: readonly Queued[], pools: readonly (readonly Queued[])[]): Queued[][] {
  if (front.some((queued) => !queued.ticket.hardNat)) {
    return [[...front]];
  }
  return pools.flatMap((pool) => {
    const open = pool.find((queued) => !queued.ticket.hardNat);
    const latest = front
      .filter((queued) => pool.includes(queued))
      .reduce<Queued | undefined>(
        (last, queued) => (last === undefined || queued.place > last.place ? queued : last),
        undefined,
      );
    return open === undefined || latest === undefined
      ? []
      : [front.map((queued) => (queued === latest ? open : queued))];
  });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The host of `groupId`: the ticket whose `sha256(groupId ‖ ticketId)` is
 * lowest. Not simply the lowest id, which one ground secret would make
 * host of every match. This is still grindable: formation is public, so
 * a late joiner can try secrets until they host the group they join, in
 * about `2 * teamSize` tries. Accepted on #869; see SECURITY.md,
 * "Choosing to host a Random Arena".
 *
 * Only the tickets not `hardNat` are ranked (#2090): a hard host is one
 * the others may not reach. All of them if every one is hard, which
 * formation never lets happen.
 */
async function hostOf(groupId: string, group: readonly QueueTicket[]): Promise<string | undefined> {
  const open = group.filter((ticket) => !ticket.hardNat);
  const ids = (open.length > 0 ? open : group).map((ticket) => ticket.ticketId);
  const ranked = await Promise.all(
    ids.map(async (ticketId) => ({ ticketId, rank: await sha256Hex(`${groupId}${ticketId}`) })),
  );
  return ranked.reduce<(typeof ranked)[number] | undefined>(
    (lowest, entry) => (lowest === undefined || entry.rank < lowest.rank ? entry : lowest),
    undefined,
  )?.ticketId;
}

/**
 * Split `group` into two sides of `teamSize`, shuffled by `groupId`: each
 * party's member keys are a side of their own, the solo players fill the rest.
 */
function sides(
  group: readonly QueueTicket[],
  mode: QueueMode,
  groupId: string,
): readonly [readonly string[], readonly string[]] {
  const rng = createRng(seedFromString(groupId));
  const parties = group
    .filter((ticket) => isSide(ticket, mode))
    .sort((a, b) => compare(a.ticketId, b.ticketId))
    .map((ticket) => ticket.members);
  // Each solo drawn a key in id order, so every client draws the same.
  const solos = group
    .filter((ticket) => !isSide(ticket, mode))
    .map((ticket) => ticket.ticketId)
    .sort(compare)
    .map((ticketId) => ({ ticketId, key: rng.nextUint32() }))
    .sort((a, b) => a.key - b.key || compare(a.ticketId, b.ticketId))
    .map(({ ticketId }) => ticketId);
  const filled = parties.map((members) => [...members]);
  while (filled.length < 2) {
    filled.push(solos.splice(0, teamSizeOf(mode)));
  }
  const [first = [], second = []] = filled;
  return rng.nextInt(0, 2) === 0 ? [first, second] : [second, first];
}

/**
 * Every group the live tickets make for `input.mode`, earliest queued
 * first, never sharing a ticket: `[]` when there are not enough. Each
 * fills two sides of `teamSizeOf(mode)`; a party ticket, or in a team
 * mode any ticket with its bots, fills one side by itself. Throws on an
 * empty `mapPool` once a group forms.
 */
export async function formGroups(input: FormGroupsInput): Promise<FormedGroup[]> {
  const groups: FormedGroup[] = [];
  for (const group of takeGroups(liveQueue(input), input.mode)) {
    const ids = group.map((ticket) => ticket.ticketId).sort(compare);
    const groupId = await sha256Hex(ids.join("\n"));
    const hostTicketId = await hostOf(groupId, group);
    const mapId =
      input.mapPool[createRng(seedFromString(`${groupId}:map`)).nextInt(0, input.mapPool.length)];
    if (hostTicketId === undefined || mapId === undefined) {
      throw new Error("formGroups: an empty group or map pool");
    }
    groups.push({
      groupId,
      room: `${ROOM_PREFIX}${groupId}`,
      hostTicketId,
      teams: sides(group, input.mode, groupId),
      parties: group
        .filter((ticket) => isSide(ticket, input.mode))
        .map((ticket) => ticket.members)
        .sort((a, b) => compare(a.join(), b.join())),
      mapId,
      mode: input.mode,
    });
  }
  return groups;
}

/**
 * The group `seatKey` settles into (#882): one where it sits as `members`,
 * its own ticket's. A solo's (`[seatKey]`) only where it is a solo, a
 * party member's only where that very party is. A party ticket can name
 * any key it likes, so sitting in a group is not enough.
 */
export function groupOf(
  groups: readonly FormedGroup[],
  seatKey: string,
  members: readonly string[],
): FormedGroup | undefined {
  const own = members.join();
  return groups.find((group) => {
    if (!group.teams[0].includes(seatKey) && !group.teams[1].includes(seatKey)) {
      return false;
    }
    const party = group.parties.find((partyMembers) => partyMembers.includes(seatKey));
    return party === undefined ? members.length === 1 : party.join() === own;
  });
}

/**
 * The ticket ids behind `seatKeys`, as a no-show is reported (#882): a
 * party's, when any of its members is among them, else the seat key,
 * which is a solo's ticket id. Each once, in `seatKeys`' order.
 */
export function ticketsOf(group: FormedGroup, seatKeys: readonly string[]): string[] {
  const ids = seatKeys.map(
    (seatKey) => group.parties.find((members) => members.includes(seatKey))?.[0] ?? seatKey,
  );
  return [...new Set(ids)];
}
