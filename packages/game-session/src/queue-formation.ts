/**
 * Queue formation (#869, #854 C4; team modes ADR-0042): from the tickets a client
 * sees, which matches they make. There is no server to decide it, so it
 * is a pure function of its input: every client that sees the same live
 * tickets forms the same groups, with the same room, host, teams and map,
 * without a word to anyone. It has no clock, network or randomness of its
 * own; the settle window and the publishing are the caller's.
 */

import {
  HALL_SLOT_SECONDS,
  createRng,
  hallSlotOpen,
  nextHallSlotMs,
  seedFromString,
  type TeamCount,
} from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  TICKET_TTL_MS,
  isTeamQueueMode,
  teamSizeOf,
  type QueueMode,
  type QueueTicket,
  type TicketClaim,
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
   * or every member key of a party, which is its whole side. Two sides,
   * or three on a three-team round (#2683); team `i` is `teams[i]`.
   */
  readonly teams: readonly (readonly string[])[];
  /** Each party's members, sorted, `members[0]` its ticket id: in a team mode, every ticket's. */
  readonly parties: readonly (readonly string[])[];
  /** Picked from the pool by `groupId`. */
  readonly mapId: string;
  /**
   * What it queued for. In a team mode (ADR-0042) each side is one
   * ticket's humans, and the side's bots make up `teamSizeOf(mode)`.
   */
  readonly mode: QueueMode;
  /** Whether it is ranked (ADR-0055): `isRankedGroup` of its tickets. */
  readonly ranked: boolean;
  /**
   * Its match's seed, a u32 drawn from `groupId`, so every member derives
   * the same one: what a ranked start carries, and each player checks.
   */
  readonly seed: number;
  /**
   * Every seat key's claim, from the ticket that brings it (ADR-0055):
   * each is checked against the leaderboard it was read from (#3575).
   */
  readonly claims: Readonly<Record<string, TicketClaim>>;
}

/** How a queue's round is played; every client answers the same for every round. */
export interface QueueRound {
  /** The maps a group of this round may play on, in the same order on every client. */
  readonly mapPool: readonly string[];
  /**
   * The most sides a group takes: 3 on a Heroes' Ascent round whose map
   * is made for three teams (#2683), else 2. Three only in a team mode,
   * where every ticket is a side.
   */
  readonly teamCount: TeamCount;
  /**
   * Whether a side here may skip ahead (#2687), and one from an earlier
   * round may skip to it. Never The Underworld, which every party
   * plays, nor the Hall.
   */
  readonly skipping: boolean;
  /** Whether it forms only in a Hall slot, one group a slot (#2701): true only for the Hall. */
  readonly slotted: boolean;
}

export interface FormGroupsInput {
  /** Every ticket the caller has seen, live or not, in any order. */
  readonly tickets: readonly QueueTicket[];
  /** ms since the epoch. */
  readonly now: number;
  readonly mode: QueueMode;
  /** Ticket ids that never showed up for an earlier group (#854 C7). */
  readonly ignored: ReadonlySet<string>;
  /**
   * A ticket's `ascentRound` played: Heroes' Ascent's are told apart
   * (#1996), and every other mode's is `null`. `undefined` for a round
   * this build has no map for: its tickets are wrong data, and dropped.
   */
  readonly round: (ascentRound: number | null) => QueueRound | undefined;
}

/**
 * Lobby keys are 43 characters (ADR-0048) and a queue room is this plus
 * 64 hex, so the two can never be the same room.
 */
export const ROOM_PREFIX = "ra-";

/**
 * How long two sides of a three-team round wait for a third before they
 * play each other (#2683), from when the later of them queued: as GW1,
 * "usually 3, 2 if not enough are free".
 */
export const THIRD_TEAM_WAIT_SECONDS = 30;

/**
 * How long a Heroes' Ascent side waits with no opponent at its round
 * before it may meet one at a later round (#2687), from when it queued.
 */
export const ASCENT_SKIP_WAIT_SECONDS = 60;

/**
 * The rating window of a ranked group (ADR-0055, #3575): how far a
 * ticket's claim may stand from the claim of the group's first queued,
 * after it has waited `waitedMs`. ±100 at once, 10 wider for every
 * whole second waited, and no limit once that reaches ±600, so nobody
 * waits forever.
 */
export function ratingWindow(waitedMs: number): number {
  const window = 100 + 10 * Math.floor(Math.max(0, waitedMs) / 1000);
  return window >= 600 ? Number.POSITIVE_INFINITY : window;
}

/** A ticket's claimed rating: its members' mean, so a party is paired by its average. */
function claimOf(ticket: QueueTicket): number {
  const claims = ticket.members.map((member) => ticket.claims[member]?.rating ?? 0);
  return claims.reduce((sum, claim) => sum + claim, 0) / claims.length;
}

/**
 * Whether `group` may form at `at`: always when it is not ranked, which
 * forms as it did before ratings; else when every ticket's claim is in
 * the `ratingWindow` of its first queued's.
 */
function inWindow(group: readonly Queued[], at: number): boolean {
  const first = group.reduce<Queued | undefined>(
    (min, queued) => (min === undefined || queued.place < min.place ? queued : min),
    undefined,
  );
  if (first === undefined || !isRankedGroup(group.map((queued) => queued.ticket))) {
    return true;
  }
  const window = ratingWindow(at - first.ticket.enteredAt);
  const claim = claimOf(first.ticket);
  return group.every((queued) => Math.abs(claimOf(queued.ticket) - claim) <= window);
}

/**
 * The group `counts[i]` tickets from each of `search.pools` make at `at`:
 * the front of each when that is `inWindow`; else, when the front is
 * ranked, the earliest queued bot-free ticket whose window holds enough
 * later bot-free ones, front first, as `search` finds it. `undefined`
 * when none does.
 */
function pick(search: Search, at: number): Queued[] | undefined {
  const { pools, counts } = search;
  if (pools.some((pool, i) => pool.size < (counts[i] ?? 0))) {
    return undefined;
  }
  const front = pools.flatMap((pool, i) => pool.first(counts[i] ?? 0));
  return inWindow(front, at) ? front : search.first(at);
}

/**
 * The tickets and windows formation visited, counted so a test can
 * bound its cost without a clock (#3747). Each visit is at most a log²
 * of the queue in the trees below; what must not grow is their number.
 */
export interface FormationCost {
  visits: number;
}

/**
 * A queue's bot-free tickets by claim (#3747): `rank[place]` is a
 * ticket's index in `byClaim`, -1 for one with bots, which no rating
 * window takes. Ranked once a pass, so a window is two binary searches.
 */
interface Claims {
  readonly byClaim: readonly { readonly claim: number; readonly place: number }[];
  readonly claim: readonly number[];
  readonly rank: readonly number[];
}

function claimsOf(queued: readonly Queued[]): Claims {
  const claim = queued.map((each) => claimOf(each.ticket));
  const byClaim = queued
    .filter((each) => each.ticket.bots === 0)
    .map((each) => ({ claim: claim[each.place] ?? 0, place: each.place }))
    .sort((a, b) => a.claim - b.claim || a.place - b.place);
  const rank = queued.map(() => -1);
  byClaim.forEach((each, i) => {
    rank[each.place] = i;
  });
  return { byClaim, claim, rank };
}

/** A binary min-heap by `less`. */
class Heap<T> {
  private readonly items: T[] = [];
  private readonly less: (a: T, b: T) => boolean;

  constructor(less: (a: T, b: T) => boolean) {
    this.less = less;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    for (let i = this.items.push(item) - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      const above = this.items[parent];
      if (above === undefined || !this.less(item, above)) {
        return;
      }
      [this.items[i], this.items[parent]] = [above, item];
      i = parent;
    }
  }

  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (last === undefined || this.items.length === 0) {
      return top;
    }
    this.items[0] = last;
    for (let i = 0; ;) {
      let least = i;
      for (const child of [2 * i + 1, 2 * i + 2]) {
        const [a, b] = [this.items[child], this.items[least]];
        if (a !== undefined && b !== undefined && this.less(a, b)) {
          least = child;
        }
      }
      const below = this.items[least];
      if (least === i || below === undefined) {
        return top;
      }
      [this.items[i], this.items[least]] = [below, last];
      i = least;
    }
  }
}

/** The index of the first of `sorted` at or above `value`; `sorted.length` when none is. */
function lowerBound(sorted: readonly number[], value: number): number {
  let [low, high] = [0, sorted.length];
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((sorted[mid] ?? Number.POSITIVE_INFINITY) < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/**
 * Which of a pool's bot-free tickets wait, by place and claim rank
 * (#3747): a Fenwick tree over places, each node of it one over the
 * ranks of its places' tickets. A window's later tickets are counted,
 * and its nth found, in log² of the queue rather than walked.
 */
class Windows {
  /** Per node, 1-based: its tickets' ranks, sorted, and how many of each wait. */
  private readonly ranks: number[][];
  private readonly counts: Int32Array[];

  constructor(
    places: number,
    tickets: readonly { readonly place: number; readonly rank: number }[],
  ) {
    this.ranks = Array.from({ length: places + 1 }, (): number[] => []);
    for (const { place, rank } of tickets) {
      for (let node = place + 1; node <= places; node += node & -node) {
        this.ranks[node]?.push(rank);
      }
    }
    this.counts = this.ranks.map((ranks) => {
      ranks.sort((a, b) => a - b);
      return new Int32Array(ranks.length + 1);
    });
  }

  /** Counts the ticket at `place` of claim `rank` in, `delta` 1, or out, -1. */
  add(place: number, rank: number, delta: number): void {
    for (let node = place + 1; node < this.ranks.length; node += node & -node) {
      const counts = this.counts[node] ?? new Int32Array(0);
      for (let i = lowerBound(this.ranks[node] ?? [], rank) + 1; i < counts.length; i += i & -i) {
        counts[i] = (counts[i] ?? 0) + delta;
      }
    }
  }

  /** How many wait at or after `place` with a rank in [`from`, `to`). */
  countFrom(place: number, from: number, to: number): number {
    return this.before(this.ranks.length - 1, from, to) - this.before(place, from, to);
  }

  /** The place of the `nth`, from 1, of those `countFrom` counts, by place; -1 when there are fewer. */
  nth(place: number, from: number, to: number, nth: number): number {
    let wanted = this.before(place, from, to) + nth;
    let below = 0;
    for (let step = 2 ** Math.floor(Math.log2(this.ranks.length)); step >= 1; step /= 2) {
      const node = below + step;
      const count = node < this.ranks.length ? this.inNode(node, from, to) : wanted;
      if (count < wanted) {
        below = node;
        wanted -= count;
      }
    }
    return below < this.ranks.length - 1 ? below : -1;
  }

  /** How many wait before `place` with a rank in [`from`, `to`). */
  private before(place: number, from: number, to: number): number {
    let count = 0;
    for (let node = place; node > 0; node -= node & -node) {
      count += this.inNode(node, from, to);
    }
    return count;
  }

  private inNode(node: number, from: number, to: number): number {
    const ranks = this.ranks[node] ?? [];
    return this.prefix(node, lowerBound(ranks, to)) - this.prefix(node, lowerBound(ranks, from));
  }

  private prefix(node: number, length: number): number {
    const counts = this.counts[node] ?? new Int32Array(0);
    let count = 0;
    for (let i = length; i > 0; i -= i & -i) {
      count += counts[i] ?? 0;
    }
    return count;
  }
}

/** What `reachable` asks of a pool. */
interface Reachable {
  has(queued: Queued): boolean;
  /** Its earliest queued not `hardNat`. */
  firstOpen(): Queued | undefined;
}

/**
 * A queue's tickets waiting as one kind, solos or parties, first queued
 * first (#3747): linked by place, so a group leaves at its own size and
 * not the queue's, and its bot-free ones counted in `Windows`.
 */
class Pool implements Reachable {
  size = 0;
  private head = -1;
  private tail = -1;
  private readonly next: Int32Array;
  private readonly previous: Int32Array;
  private readonly waiting: Uint8Array;
  /** The places of the open tickets added, in order, and the first that may still wait. */
  private readonly open: number[] = [];
  private openFrom = 0;
  private readonly windows: Windows;
  private readonly queued: readonly Queued[];
  private readonly claims: Claims;
  private readonly cost: FormationCost;

  constructor(
    queued: readonly Queued[],
    claims: Claims,
    holds: (queued: Queued) => boolean,
    cost: FormationCost,
  ) {
    this.queued = queued;
    this.claims = claims;
    this.cost = cost;
    this.next = new Int32Array(queued.length).fill(-1);
    this.previous = new Int32Array(queued.length).fill(-1);
    this.waiting = new Uint8Array(queued.length);
    const rated = queued
      .filter((each) => holds(each) && (claims.rank[each.place] ?? -1) >= 0)
      .map((each) => ({ place: each.place, rank: claims.rank[each.place] ?? -1 }));
    this.windows = new Windows(queued.length, rated);
  }

  has(queued: Queued): boolean {
    return this.waiting[queued.place] === 1;
  }

  add(queued: Queued): void {
    const { place } = queued;
    this.waiting[place] = 1;
    this.previous[place] = this.tail;
    if (this.tail < 0) {
      this.head = place;
    } else {
      this.next[this.tail] = place;
    }
    this.tail = place;
    this.size += 1;
    if (!queued.ticket.hardNat) {
      this.open.push(place);
    }
    this.count(place, 1);
  }

  remove(queued: Queued): void {
    const { place } = queued;
    const [before, after] = [this.previous[place] ?? -1, this.next[place] ?? -1];
    if (before < 0) {
      this.head = after;
    } else {
      this.next[before] = after;
    }
    if (after < 0) {
      this.tail = before;
    } else {
      this.previous[after] = before;
    }
    this.waiting[place] = 0;
    this.size -= 1;
    this.count(place, -1);
  }

  /** The first `count` waiting. */
  first(count: number): Queued[] {
    const first: Queued[] = [];
    for (
      let place = this.head;
      place >= 0 && first.length < count;
      place = this.next[place] ?? -1
    ) {
      this.cost.visits += 1;
      const queued = this.queued[place];
      if (queued !== undefined) {
        first.push(queued);
      }
    }
    return first;
  }

  firstOpen(): Queued | undefined {
    while (this.openFrom < this.open.length && this.waiting[this.open[this.openFrom] ?? 0] !== 1) {
      this.cost.visits += 1;
      this.openFrom += 1;
    }
    return this.queued[this.open[this.openFrom] ?? -1];
  }

  /** How many bot-free tickets wait at or after `place` with a claim rank in [`from`, `to`). */
  countFrom(place: number, from: number, to: number): number {
    this.cost.visits += 1;
    return this.windows.countFrom(place, from, to);
  }

  /** The `count` earliest of those `countFrom` counts. */
  firstFrom(place: number, from: number, to: number, count: number): Queued[] {
    this.cost.visits += count;
    return Array.from(
      { length: count },
      (_, i) => this.queued[this.windows.nth(place, from, to, i + 1)],
    ).filter((queued): queued is Queued => queued !== undefined);
  }

  private count(place: number, delta: number): void {
    const rank = this.claims.rank[place] ?? -1;
    if (rank >= 0) {
      this.windows.add(place, rank, delta);
    }
  }
}

/** An anchor set aside, as of its `stamp`th change. */
interface SetAside {
  readonly place: number;
  readonly stamp: number;
}

/**
 * The anchors set aside whose windows hold a claim rank (#3747): a
 * segment tree over ranks, each window kept in the nodes that cover it.
 * Every window on a rank's path holds that rank, so a stab takes the
 * whole path, and each window is given up once.
 */
class Stabs {
  private readonly nodes: (SetAside[] | undefined)[];
  private readonly leaves: number;
  private readonly cost: FormationCost;

  constructor(ranks: number, cost: FormationCost) {
    this.cost = cost;
    this.leaves = 2 ** Math.ceil(Math.log2(Math.max(1, ranks)));
    this.nodes = Array.from({ length: 2 * this.leaves }, () => undefined);
  }

  /** Keeps `aside` for the ranks [`from`, `to`). */
  insert(from: number, to: number, aside: SetAside): void {
    this.cost.visits += 1;
    for (let [low, high] = [from + this.leaves, to + this.leaves]; low < high;) {
      if (low % 2 === 1) {
        this.keep(low, aside);
        low += 1;
      }
      if (high % 2 === 1) {
        high -= 1;
        this.keep(high, aside);
      }
      [low, high] = [low >> 1, high >> 1];
    }
  }

  /** Every anchor kept for `rank`, each given up. */
  stab(rank: number): SetAside[] {
    const stabbed: SetAside[] = [];
    for (let node = rank + this.leaves; node >= 1; node >>= 1) {
      const kept = this.nodes[node] ?? [];
      this.cost.visits += kept.length;
      stabbed.push(...kept);
      this.nodes[node] = undefined;
    }
    return stabbed;
  }

  private keep(node: number, aside: SetAside): void {
    const kept = this.nodes[node];
    if (kept === undefined) {
      this.nodes[node] = [aside];
    } else {
      kept.push(aside);
    }
  }
}

/**
 * `pick`'s ranked search for `counts[i]` tickets from each of `pools`,
 * kept for a whole pass (#3747). Each bot-free ticket is an anchor, and
 * the first by place whose window holds enough later ones forms. One
 * that fails is set aside and tried again only once it may pass: when
 * its window widens, once a second and at most fifty times
 * (`ratingWindow`), or when a ticket queues into it in a pool it was
 * short of. A ticket leaving only ever thins a window, and an earlier
 * `at` only ever narrows one, so what is set aside still fails.
 */
class Search {
  readonly pools: readonly Pool[];
  readonly counts: readonly number[];
  private readonly queued: readonly Queued[];
  private readonly claims: Claims;
  private readonly cost: FormationCost;
  /** Per place: how often its anchor changed, and whether it is set aside. */
  private readonly stamps: Int32Array;
  private readonly aside: Uint8Array;
  /** The anchors to try, by place. */
  private readonly pending: Heap<number>;
  /** The anchors set aside, by when their window next widens. */
  private readonly widens: Heap<SetAside & { readonly at: number }>;
  /** Per pool: the anchors set aside short of its tickets. */
  private readonly short: readonly Stabs[];

  constructor(
    queued: readonly Queued[],
    claims: Claims,
    pools: readonly Pool[],
    counts: readonly number[],
    cost: FormationCost,
  ) {
    this.queued = queued;
    this.claims = claims;
    this.pools = pools;
    this.counts = counts;
    this.cost = cost;
    this.stamps = new Int32Array(queued.length);
    this.aside = new Uint8Array(queued.length);
    this.pending = new Heap((a, b) => a < b);
    this.widens = new Heap((a, b) => a.at < b.at);
    this.short = pools.map(() => new Stabs(claims.byClaim.length, cost));
  }

  /** `queued` just joined its pool: it is an anchor, and fills the windows it is in. */
  arrive(queued: Queued): void {
    const rank = this.claims.rank[queued.place] ?? -1;
    const pool = this.pools.findIndex((each) => each.has(queued));
    if (rank < 0 || pool < 0) {
      return;
    }
    this.pending.push(queued.place);
    for (const aside of this.short[pool]?.stab(rank) ?? []) {
      this.retry(aside);
    }
  }

  /** The first anchor's group at `at`, by place; `undefined` when none forms. */
  first(at: number): Queued[] | undefined {
    for (
      let due = this.widens.peek();
      due !== undefined && due.at <= at;
      due = this.widens.peek()
    ) {
      this.widens.pop();
      this.retry(due);
    }
    const passed: number[] = [];
    let group: Queued[] | undefined;
    for (let place = this.pending.peek(); place !== undefined; place = this.pending.peek()) {
      this.cost.visits += 1;
      const anchor = this.queued[place];
      if (
        anchor === undefined ||
        this.aside[place] === 1 ||
        !this.pools.some((pool) => pool.has(anchor))
      ) {
        this.pending.pop();
        continue;
      }
      const window = ratingWindow(at - anchor.ticket.enteredAt);
      const claim = this.claims.claim[place] ?? 0;
      const from = firstAbove(this.claims.byClaim, claim - window, false);
      const to = firstAbove(this.claims.byClaim, claim + window, true);
      const short = this.pools.map(
        (pool, i) => pool.countFrom(place, from, to) < (this.counts[i] ?? 0),
      );
      this.pending.pop();
      if (!short.includes(true)) {
        const found = this.pools.flatMap((pool, i) =>
          pool.firstFrom(place, from, to, this.counts[i] ?? 0),
        );
        if (inWindow(found, at)) {
          group = found;
          this.pending.push(place);
          break;
        }
        // Full, yet not `inWindow` by a rounding of its bounds: a ticket
        // leaving may change that, so it is not set aside.
        passed.push(place);
        continue;
      }
      const stamp = this.stamp(place, 1);
      short.forEach((isShort, i) => {
        if (isShort) {
          this.short[i]?.insert(from, to, { place, stamp });
        }
      });
      if (Number.isFinite(window)) {
        const seconds = Math.floor(Math.max(0, at - anchor.ticket.enteredAt) / 1000);
        this.widens.push({ place, stamp, at: anchor.ticket.enteredAt + 1000 * (seconds + 1) });
      }
    }
    for (const place of passed) {
      this.pending.push(place);
    }
    return group;
  }

  /** Tries `aside` again, unless its anchor changed since. */
  private retry(aside: SetAside): void {
    if (this.aside[aside.place] === 1 && this.stamps[aside.place] === aside.stamp) {
      this.stamp(aside.place, 0);
      this.pending.push(aside.place);
    }
  }

  /** Sets the anchor at `place` aside, 1, or not, 0; its new stamp. */
  private stamp(place: number, aside: number): number {
    const stamp = (this.stamps[place] ?? 0) + 1;
    this.stamps[place] = stamp;
    this.aside[place] = aside;
    return stamp;
  }
}

/**
 * The index of the first of `sorted` whose claim is over `bound`, or at
 * least `bound` when `!strict`; `sorted.length` when none is.
 */
function firstAbove(
  sorted: readonly { readonly claim: number }[],
  bound: number,
  strict: boolean,
): number {
  let [low, high] = [0, sorted.length];
  while (low < high) {
    const mid = (low + high) >>> 1;
    const claim = sorted[mid]?.claim ?? Number.POSITIVE_INFINITY;
    if (claim > bound || (!strict && claim === bound)) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

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
  return live.filter(
    (ticket) =>
      !input.ignored.has(ticket.ticketId) &&
      own(ticket) &&
      input.round(ticket.ascentRound) !== undefined,
  );
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
 * keeps its place. In a team mode there are no solos: the `teamCount`
 * earliest tickets form; of three, two left waiting form after
 * `THIRD_TEAM_WAIT_SECONDS` (#2683). A ranked group forms only
 * `inWindow` (#3575): its tickets are `pick`ed, and as windows widen
 * with time, the queue is tried again at `now`.
 */
function takeGroups(
  queue: readonly QueueTicket[],
  mode: QueueMode,
  teamCount: TeamCount,
  now: number,
  cost: FormationCost,
): QueueTicket[][] {
  const teamSize = teamSizeOf(mode);
  const groups: QueueTicket[][] = [];
  const queued = queue.map((ticket, place) => ({ ticket, place }));
  const claims = claimsOf(queued);
  const solos = new Pool(queued, claims, (each) => !isSide(each.ticket, mode), cost);
  const parties = new Pool(queued, claims, (each) => isSide(each.ticket, mode), cost);
  const search = (pools: readonly Pool[], counts: readonly number[]): Search =>
    new Search(queued, claims, pools, counts, cost);
  const ofParties = search([parties], [teamCount]);
  const ofBoth = search([parties, solos], [1, teamSize]);
  const ofSolos = search([solos], [2 * teamSize]);
  const pairs = teamCount === 3 ? search([parties], [2]) : undefined;
  const searches = [ofParties, ofBoth, ofSolos, ...(pairs === undefined ? [] : [pairs])];
  const take = (group: readonly Queued[]): void => {
    for (const each of group) {
      (parties.has(each) ? parties : solos).remove(each);
    }
    groups.push(group.map((each) => each.ticket));
  };
  // Two sides that waited long enough for a third by `at` play each
  // other. The earliest two waited longest: if they have not, no later
  // two have.
  const settlePairs = (at: number): void => {
    for (;;) {
      const front = pairs === undefined ? undefined : pick(pairs, at);
      const [pair] = front === undefined ? [] : fitting(reachable(front, [parties]), at);
      const queuedLast = Math.max(...(pair ?? []).map((each) => each.ticket.enteredAt));
      if (pair === undefined || at - queuedLast < THIRD_TEAM_WAIT_SECONDS * 1000) {
        return;
      }
      take(pair);
    }
  };
  // The one group, of those that can form at `at`, that takes the
  // earliest queued; `false` when none can.
  const formOne = (at: number): boolean => {
    const fronts = [pick(ofParties, at), pick(ofBoth, at), pick(ofSolos, at)];
    const pools = [[parties], [parties, solos], [solos]];
    const candidates = fronts.flatMap((front, i) =>
      front === undefined ? [] : fitting(reachable(front, pools[i] ?? []), at),
    );
    const best = candidates
      .map((candidate) => [...candidate].sort((a, b) => a.place - b.place))
      .reduce<Queued[] | undefined>(
        (chosen, candidate) =>
          chosen === undefined || earlier(candidate, chosen) ? candidate : chosen,
        undefined,
      );
    if (best !== undefined) {
      take(best);
    }
    return best !== undefined;
  };
  for (const each of queued) {
    cost.visits += 1;
    // A pair that had stopped waiting before this one queued already
    // formed as two (#2683): a late third does not take it back.
    settlePairs(each.ticket.enteredAt);
    // At a team size of 1, every Random Arena ticket is a solo.
    (isSide(each.ticket, mode) ? parties : solos).add(each);
    for (const kept of searches) {
      kept.arrive(each);
    }
    while (formOne(each.ticket.enteredAt)) {
      // Ranked windows that widened while nobody queued can fill more than one.
    }
  }
  settlePairs(now);
  while (formOne(now)) {
    // As above: a window wide enough by now forms its group.
  }
  return groups;
}

/** Those of `candidates` `inWindow` at `at`: `reachable` may have swapped a ticket in. */
function fitting(candidates: readonly Queued[][], at: number): Queued[][] {
  return candidates.filter((candidate) => inWindow(candidate, at));
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
function reachable(front: readonly Queued[], pools: readonly Reachable[]): Queued[][] {
  if (front.some((queued) => !queued.ticket.hardNat)) {
    return [[...front]];
  }
  return pools.flatMap((pool) => {
    const open = pool.firstOpen();
    const latest = front
      .filter((queued) => pool.has(queued))
      .reduce<Queued | undefined>(
        (last, queued) => (last === undefined || queued.place > last.place ? queued : last),
        undefined,
      );
    return open === undefined || latest === undefined
      ? []
      : [front.map((queued) => (queued === latest ? open : queued))];
  });
}

/**
 * The pairs that skip ahead (#2687), from `waiting`, the tickets no
 * group took, first queued first. A side alone at its round for
 * `ASCENT_SKIP_WAIT_SECONDS` meets the first queued side alone at a
 * later round. Two sides at one round that could play each other are not
 * alone: they are only waiting for a third (#2683). A pair both `hardNat`
 * could not connect, so it is passed over, as in `reachable`.
 */
function skipPairs(
  waiting: readonly QueueTicket[],
  round: FormGroupsInput["round"],
  now: number,
  cost: FormationCost,
): (readonly [QueueTicket, QueueTicket])[] {
  // Per round, how many wait and how many of them are open: an open
  // ticket reaches any other, a hard one only an open one.
  const atRound = new Map<number | null, { readonly all: number; readonly open: number }>();
  for (const ticket of waiting) {
    const seen = atRound.get(ticket.ascentRound) ?? { all: 0, open: 0 };
    atRound.set(ticket.ascentRound, {
      all: seen.all + 1,
      open: seen.open + (ticket.hardNat ? 0 : 1),
    });
  }
  const alone = waiting.filter((ticket) => {
    const seen = atRound.get(ticket.ascentRound) ?? { all: 1, open: 0 };
    return (
      round(ticket.ascentRound)?.skipping === true &&
      (ticket.hardNat ? seen.open === 0 : seen.all === 1)
    );
  });
  // Per later round, those alone there, and the open ones, first queued
  // first, each with the first not yet taken: a pointer that only moves
  // on, so the search is the queue times its rounds, not its square (#3747).
  const place = new Map(alone.map((ticket, i) => [ticket, i]));
  const lines = new Map<number, { readonly all: Line; readonly open: Line }>();
  for (const ticket of alone) {
    if (ticket.ascentRound === null) {
      continue;
    }
    const line = lines.get(ticket.ascentRound) ?? {
      all: { tickets: [], next: 0 },
      open: { tickets: [], next: 0 },
    };
    line.all.tickets.push(ticket);
    if (!ticket.hardNat) {
      line.open.tickets.push(ticket);
    }
    lines.set(ticket.ascentRound, line);
  }
  const pairs: (readonly [QueueTicket, QueueTicket])[] = [];
  const taken = new Set<QueueTicket>();
  const firstUntaken = (line: Line): QueueTicket | undefined => {
    for (let first = line.tickets[line.next]; first !== undefined && taken.has(first);) {
      cost.visits += 1;
      line.next += 1;
      first = line.tickets[line.next];
    }
    return line.tickets[line.next];
  };
  for (const ticket of alone) {
    cost.visits += 1;
    if (taken.has(ticket) || now - ticket.enteredAt < ASCENT_SKIP_WAIT_SECONDS * 1000) {
      continue;
    }
    let later: QueueTicket | undefined;
    for (const [ascentRound, line] of lines) {
      cost.visits += 1;
      const first =
        ticket.ascentRound !== null && ascentRound > ticket.ascentRound
          ? firstUntaken(ticket.hardNat ? line.open : line.all)
          : undefined;
      if (
        first !== undefined &&
        (later === undefined || (place.get(first) ?? 0) < (place.get(later) ?? 0))
      ) {
        later = first;
      }
    }
    if (later !== undefined) {
      taken.add(ticket).add(later);
      pairs.push([ticket, later]);
    }
  }
  return pairs;
}

/** Those alone at a round, first queued first, and the first of them not yet taken. */
interface Line {
  readonly tickets: QueueTicket[];
  next: number;
}

/**
 * The one group of a slotted round at `now` (#2701): none outside a slot's
 * window. Whoever was waiting before the slot started is seated at once,
 * with no wait for a third side: the holder, the latest claim, then
 * first queued first. One side alone plays nobody and waits for the next
 * slot. A group of only `hardNat` tickets is passed over, as in `reachable`.
 */
function hallGroup(
  queue: readonly QueueTicket[],
  teamCount: TeamCount,
  now: number,
): QueueTicket[][] {
  if (!hallSlotOpen(now)) {
    return [];
  }
  const slotStart = nextHallSlotMs(now) - HALL_SLOT_SECONDS * 1000;
  const waiting = queue.filter((ticket) => ticket.enteredAt < slotStart);
  // Sorted stably, so of two equal claims the first queued holds.
  const [holder] = waiting
    .filter((ticket) => ticket.holdsHallSince !== null)
    .sort((a, b) => (b.holdsHallSince ?? 0) - (a.holdsHallSince ?? 0));
  const seated = [
    ...(holder === undefined ? [] : [holder]),
    ...waiting.filter((ticket) => ticket !== holder),
  ].map((ticket, place) => ({ ticket, place }));
  if (seated.length < 2) {
    return [];
  }
  // Every one of the front is seated.
  const line = {
    has: () => true,
    firstOpen: () => seated.find((queued) => !queued.ticket.hardNat),
  };
  const [group] = reachable(seated.slice(0, teamCount), [line]);
  return group === undefined ? [] : [group.map((queued) => queued.ticket)];
}

/**
 * Every group of `queue`, each with the round it plays: each round's
 * own (#1996), lowest first, then the sides left over skipping ahead,
 * which play the later side's round (#2687).
 */
function roundGroups(
  queue: readonly QueueTicket[],
  mode: QueueMode,
  round: FormGroupsInput["round"],
  now: number,
  cost: FormationCost,
): { readonly group: readonly QueueTicket[]; readonly ascentRound: number | null }[] {
  // Bucketed once, so a round's formation never walks another's tickets (#3747).
  const byRound = new Map<number | null, QueueTicket[]>();
  for (const ticket of queue) {
    const atRound = byRound.get(ticket.ascentRound);
    if (atRound === undefined) {
      byRound.set(ticket.ascentRound, [ticket]);
    } else {
      atRound.push(ticket);
    }
  }
  const rounds = [...byRound.keys()].sort((a, b) => (a ?? 0) - (b ?? 0));
  const groups = rounds.flatMap((ascentRound) => {
    const atRound = byRound.get(ascentRound) ?? [];
    const teamCount = round(ascentRound)?.teamCount ?? 2;
    return (
      round(ascentRound)?.slotted === true
        ? hallGroup(atRound, teamCount, now)
        : takeGroups(atRound, mode, teamCount, now, cost)
    ).map((group) => ({ group, ascentRound }));
  });
  const grouped = new Set(groups.flatMap(({ group }) => group));
  const waiting = queue.filter((ticket) => !grouped.has(ticket));
  return [
    ...groups,
    ...skipPairs(waiting, round, now, cost).map((group) => ({
      group,
      ascentRound: group[1].ascentRound,
    })),
  ];
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
 * Split `group` into its sides of `teamSize`, shuffled by `groupId`: each
 * party's member keys are a side of their own, the solo players fill the
 * rest. Two sides, or in a team mode one a ticket: three of three (#2683).
 * Two ranked sides of solos are a snake draft on claim (#3575), highest
 * first, so their averages land close; equal claims keep the drawn order.
 */
function sides(group: readonly QueueTicket[], mode: QueueMode, groupId: string): string[][] {
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
  if (filled.length === 0 && isRankedGroup(group)) {
    const claims = new Map(group.map((ticket) => [ticket.ticketId, claimOf(ticket)]));
    const drafted = [...solos].sort((a, b) => (claims.get(b) ?? 0) - (claims.get(a) ?? 0));
    // A B B A A B …: each pick goes to the side that picked second last time.
    filled.push(
      drafted.filter((_, i) => i % 2 === Math.floor(i / 2) % 2),
      drafted.filter((_, i) => i % 2 !== Math.floor(i / 2) % 2),
    );
  }
  while (filled.length < 2) {
    filled.push(solos.splice(0, teamSizeOf(mode)));
  }
  // Each place drawn in turn from the sides not yet placed.
  for (let place = 0; place < filled.length - 1; place += 1) {
    const drawn = rng.nextInt(place, filled.length);
    [filled[place], filled[drawn]] = [filled[drawn] ?? [], filled[place] ?? []];
  }
  return filled;
}

/**
 * Whether a group of `tickets` plays ranked (ADR-0055, #3573): every
 * ticket brings no bot, so every side is all human. A group with any bot
 * ticket plays as before, unranked; there is no ranked queue of its own.
 */
export function isRankedGroup(tickets: readonly QueueTicket[]): boolean {
  return (
    tickets.length > 0 && tickets.every((ticket) => ticket.bots === 0 && ticket.members.length > 0)
  );
}

/**
 * Every group the live tickets make for `input.mode`, earliest queued
 * first, never sharing a ticket: `[]` when there are not enough. Each
 * fills two sides of `teamSizeOf(mode)`, or three (#2683); a party ticket, or in a team
 * mode any ticket with its bots, fills one side by itself. A Heroes'
 * Ascent queue is formed whole, every round of it, whichever round the
 * caller is at: every client has to agree who skips ahead. Throws on an
 * empty `mapPool` once a group forms.
 */
export async function formGroups(
  input: FormGroupsInput,
  cost: FormationCost = { visits: 0 },
): Promise<FormedGroup[]> {
  const groups: FormedGroup[] = [];
  const formed = roundGroups(liveQueue(input), input.mode, input.round, input.now, cost);
  for (const { group, ascentRound } of formed) {
    const ids = group.map((ticket) => ticket.ticketId).sort(compare);
    const groupId = await sha256Hex(ids.join("\n"));
    const hostTicketId = await hostOf(groupId, group);
    const mapPool = input.round(ascentRound)?.mapPool ?? [];
    const mapId = mapPool[createRng(seedFromString(`${groupId}:map`)).nextInt(0, mapPool.length)];
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
      ranked: isRankedGroup(group),
      seed: seedFromString(`${groupId}:seed`),
      claims: Object.fromEntries(group.flatMap((ticket) => Object.entries(ticket.claims))),
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
    if (!group.teams.some((side) => side.includes(seatKey))) {
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
