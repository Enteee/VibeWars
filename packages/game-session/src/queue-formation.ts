/**
 * Random Arena queue formation (#869, #854 C4): from the tickets a client
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
  /** Who hosts: see `hostOf`. */
  readonly hostTicketId: string;
  /** Ticket ids per side, shuffled by `groupId`; a party is its whole side. */
  readonly teams: readonly [readonly string[], readonly string[]];
  /** Picked from the pool by `groupId`. */
  readonly mapId: string;
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
    a.partySize - b.partySize
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The live tickets, first queued first: this protocol and mode, heard
 * from within `TICKET_TTL_MS`, not ignored, each id once.
 */
function liveQueue(input: FormGroupsInput): QueueTicket[] {
  const sorted = input.tickets
    .filter(
      (ticket) =>
        ticket.protocol === PROTOCOL_VERSION &&
        ticket.mode === input.mode &&
        input.now - ticket.heartbeatAt <= TICKET_TTL_MS &&
        !input.ignored.has(ticket.ticketId),
    )
    .sort(queueOrder);
  const seen = new Set<string>();
  return sorted.filter((ticket) => {
    if (seen.has(ticket.ticketId)) {
      return false;
    }
    seen.add(ticket.ticketId);
    return true;
  });
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
 * The groups `queue` fills, in one pass, front first. Each ticket joins
 * the waiting solos or parties; as soon as they can fill a match, two
 * parties, a party and a side of solos, or two sides of solos, the one
 * of those that takes the earliest queued forms, and the rest wait for
 * the next. A party is never split, and one that cannot be matched yet
 * keeps its place.
 */
function takeGroups(queue: readonly QueueTicket[], teamSize: number): QueueTicket[][] {
  const groups: QueueTicket[][] = [];
  let solos: Queued[] = [];
  let parties: Queued[] = [];
  queue.forEach((ticket, place) => {
    // At a team size of 1, every ticket is a solo.
    (ticket.partySize > 1 ? parties : solos).push({ ticket, place });
    const candidates: Queued[][] = [];
    if (parties.length >= 2) {
      candidates.push(parties.slice(0, 2));
    }
    if (parties.length >= 1 && solos.length >= teamSize) {
      candidates.push([...parties.slice(0, 1), ...solos.slice(0, teamSize)]);
    }
    if (solos.length >= 2 * teamSize) {
      candidates.push(solos.slice(0, 2 * teamSize));
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

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The host of `groupId`: the ticket whose `sha256(groupId ‖ ticketId)` is
 * lowest. Not simply the lowest id, which a player could grind secrets
 * for and host every match; the group id hangs on every ticket in it, so
 * nobody knows who hosts until the group exists.
 */
async function hostOf(groupId: string, ids: readonly string[]): Promise<string | undefined> {
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
 * party is a side of its own, the solo players fill the rest.
 */
function sides(
  group: readonly QueueTicket[],
  teamSize: number,
  groupId: string,
): readonly [readonly string[], readonly string[]] {
  const rng = createRng(seedFromString(groupId));
  const parties = group
    .filter((ticket) => ticket.partySize > 1)
    .map((ticket) => ticket.ticketId)
    .sort(compare);
  // Each solo drawn a key in id order, so every client draws the same.
  const solos = group
    .filter((ticket) => ticket.partySize === 1)
    .map((ticket) => ticket.ticketId)
    .sort(compare)
    .map((ticketId) => ({ ticketId, key: rng.nextUint32() }))
    .sort((a, b) => a.key - b.key || compare(a.ticketId, b.ticketId))
    .map(({ ticketId }) => ticketId);
  const filled = parties.map((party) => [party]);
  while (filled.length < 2) {
    filled.push(solos.splice(0, teamSize));
  }
  const [first = [], second = []] = filled;
  return rng.nextInt(0, 2) === 0 ? [first, second] : [second, first];
}

/**
 * Every group the live tickets make for `input.mode`, earliest queued
 * first, never sharing a ticket: `[]` when there are not enough. Each
 * fills two sides of `teamSizeOf(mode)`; a party ticket fills one side
 * by itself. Throws on an empty `mapPool` once a group forms.
 */
export async function formGroups(input: FormGroupsInput): Promise<FormedGroup[]> {
  const teamSize = teamSizeOf(input.mode);
  const groups: FormedGroup[] = [];
  for (const group of takeGroups(liveQueue(input), teamSize)) {
    const ids = group.map((ticket) => ticket.ticketId).sort(compare);
    const groupId = await sha256Hex(ids.join("\n"));
    const hostTicketId = await hostOf(groupId, ids);
    const mapId =
      input.mapPool[createRng(seedFromString(`${groupId}:map`)).nextInt(0, input.mapPool.length)];
    if (hostTicketId === undefined || mapId === undefined) {
      throw new Error("formGroups: an empty group or map pool");
    }
    groups.push({
      groupId,
      room: `${ROOM_PREFIX}${groupId}`,
      hostTicketId,
      teams: sides(group, teamSize, groupId),
      mapId,
    });
  }
  return groups;
}

/** The group `ticketId` is in, if any. */
export function groupOf(groups: readonly FormedGroup[], ticketId: string): FormedGroup | undefined {
  return groups.find(
    (group) => group.teams[0].includes(ticketId) || group.teams[1].includes(ticketId),
  );
}
