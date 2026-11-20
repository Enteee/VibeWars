import {
  mergeReceipts,
  type RankedReceipt,
  type ReceiptCrypto,
  receiptHash,
  resultDigest,
  startHash,
  validateReceipt,
  ZERO_HASH,
} from "./receipt.js";

/** Every number the rating is computed with (ADR-0055). */
export const RATING = {
  /** Glicko-2's system constant: how fast volatility may move. */
  tau: 0.5,
  initialRating: 1500,
  initialRd: 350,
  initialSigma: 0.06,
  /** The volatility iteration stops when the bracket is this narrow. */
  epsilon: 1e-6,
  /** Glicko-1 to Glicko-2 scale. */
  scale: 173.7178,
  /** RD grows by this, in quadrature, on every day without a rated match. */
  dailyDecay: 26,
  /** RD never leaves [minRd, maxRd], whatever the floats do. */
  minRd: 30,
  maxRd: 350,
  /** The k-th match against one opposing set in a day weighs 1/k, up to this k. */
  maxRepeats: 3,
  /** Only this many rated matches per identity per day count. */
  maxMatchesPerDay: 20,
  /**
   * Trust is full at this many distinct, themselves-connected opponents, or
   * at every other key when fewer than that have played at all.
   */
  trustOpponents: 12,
  /** An opponent counts toward trust once it has met this many distinct opponents. */
  trustedOpponentMin: 3,
  /** Fewer rated matches than this and an identity has no rank. */
  provisionalMatches: 10,
  secondsPerDay: 86_400,
} as const;

/** One identity on the leaderboard: a player key and what its receipts made of it. */
export interface Rating {
  /** From the key's latest receipt. */
  readonly name: string;
  readonly characterId: string;
  readonly rating: number;
  readonly rd: number;
  readonly sigma: number;
  /** `rating − 2·rd`: what the leaderboard ranks by. */
  readonly conservative: number;
  /** Matches the key was rated in. */
  readonly matches: number;
  /** UTC day of the key's latest rated match, or `null` if it was never rated. */
  readonly lastPlayedDay: number | null;
  readonly provisional: boolean;
  /** The floor of the summed weights of the key's ranked wins. */
  readonly wins: number;
  /** Consecutive ranked wins up to now: a loss or leave resets it, a draw does not. */
  readonly streak: number;
  /** The key signed two receipts on one `prev`. */
  readonly forked: boolean;
  /** `receiptHash` of the key's latest receipt that stayed on its chain. */
  readonly lastReceiptHash: string;
  readonly distinctOpponents: number;
  readonly trust: number;
}

/** Every identity, by pubkey. */
export type Ratings = ReadonlyMap<string, Rating>;

/** A player's Glicko-1-scale state, as Glickman's paper writes it. */
export interface GlickoPlayer {
  readonly rating: number;
  readonly rd: number;
  readonly sigma: number;
}

/** One game of a rating period: an opponent, a score in [0, 1] and a weight in [0, 1]. */
export interface GlickoGame {
  readonly rating: number;
  readonly rd: number;
  readonly score: number;
  readonly weight: number;
}

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

/**
 * One Glicko-2 rating period for a player who played `games` in it
 * (Glickman, "Example of the Glicko-2 system"), each game's terms in v
 * and Δ multiplied by its weight. With no weight at all the player is
 * returned unchanged: the idle step is `decayRd`'s, never this.
 */
export function glicko2Period(player: GlickoPlayer, games: readonly GlickoGame[]): GlickoPlayer {
  const mu = (player.rating - RATING.initialRating) / RATING.scale;
  const phi = player.rd / RATING.scale;
  let vInverse = 0;
  let sum = 0;
  for (const game of games) {
    const muJ = (game.rating - RATING.initialRating) / RATING.scale;
    const gJ = g(game.rd / RATING.scale);
    const expected = 1 / (1 + Math.exp(-gJ * (mu - muJ)));
    vInverse += game.weight * gJ * gJ * expected * (1 - expected);
    sum += game.weight * gJ * (game.score - expected);
  }
  if (vInverse <= 0) {
    return player;
  }
  const v = 1 / vInverse;
  const delta = v * sum;
  const sigma = volatility(phi, player.sigma, v, delta);
  const phiStar = Math.sqrt(phi * phi + sigma * sigma);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;
  return {
    rating: RATING.scale * muNew + RATING.initialRating,
    rd: clampRd(RATING.scale * phiNew),
    sigma,
  };
}

/** Glicko-2 step 5: the new volatility, by the Illinois algorithm. */
function volatility(phi: number, sigma: number, v: number, delta: number): number {
  const a = Math.log(sigma * sigma);
  const tau2 = RATING.tau * RATING.tau;
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const d = phi * phi + v + ex;
    return (ex * (delta * delta - d)) / (2 * d * d) - (x - a) / tau2;
  };
  let lower = a;
  let upper: number;
  if (delta * delta > phi * phi + v) {
    upper = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * RATING.tau) < 0) {
      k += 1;
    }
    upper = a - k * RATING.tau;
  }
  let fLower = f(lower);
  let fUpper = f(upper);
  while (Math.abs(upper - lower) > RATING.epsilon) {
    const c = lower + ((lower - upper) * fLower) / (fUpper - fLower);
    const fC = f(c);
    if (fC * fUpper <= 0) {
      lower = upper;
      fLower = fUpper;
    } else {
      fLower /= 2;
    }
    upper = c;
    fUpper = fC;
  }
  return Math.exp(lower / 2);
}

/** RD kept in [minRd, maxRd]; a NaN, which no input should make, is full uncertainty. */
function clampRd(rd: number): number {
  return Number.isNaN(rd) ? RATING.maxRd : Math.min(RATING.maxRd, Math.max(RATING.minRd, rd));
}

/** RD after `idleDays` days without a rated match. */
export function decayRd(rd: number, idleDays: number): number {
  return idleDays <= 0
    ? rd
    : clampRd(Math.sqrt(rd * rd + idleDays * RATING.dailyDecay * RATING.dailyDecay));
}

/** The UTC day number of unix seconds. */
export function utcDay(seconds: number): number {
  return Math.floor(seconds / RATING.secondsPerDay);
}

/** A match that survived validation, merging and the fork check. */
interface Match {
  readonly receipt: RankedReceipt;
  readonly hash: string;
  readonly day: number;
}

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Whether a leaver of `receipt` signed another result of its start, as
 * its own partial of an earlier round shows (ADR-0055, #3573): a host
 * that re-rounds an honest signer into a leaver voids the match. A key
 * that really refused has no such signature, and loses.
 */
function reRoundedSigner(
  receipt: RankedReceipt,
  copies: readonly RankedReceipt[],
  crypto: ReceiptCrypto,
): boolean {
  const { leavers, startHash: started } = receipt.result;
  return copies.some((copy) => {
    if (copy === receipt || copy.result.startHash !== started) {
      return false;
    }
    const digest = resultDigest(copy.result, crypto.sha256);
    return leavers.some((pubkey) => {
      const sig = copy.resultSigs[pubkey];
      return sig !== undefined && crypto.verify(pubkey, digest, sig);
    });
  });
}

/**
 * Step 1: one receipt per match. Copies of one start are grouped; copies
 * with the same result are merged, so partial `host-left` receipts make
 * one whole one, and only then validated. A void or invalid copy is
 * dropped there, so a forgery can neither fork nor void anything. Two
 * different valid results for one start void the match for everyone, and
 * so does a leaver's signature on another result of it.
 */
function matchesOf(
  receipts: readonly RankedReceipt[],
  asOfDay: number,
  crypto: ReceiptCrypto,
): Match[] {
  const byStart = new Map<string, RankedReceipt[]>();
  for (const receipt of receipts) {
    if (utcDay(receipt.start.startedAt) > asOfDay) {
      continue;
    }
    const key = startHash(receipt.start, crypto.sha256);
    const copies = byStart.get(key);
    if (copies) {
      copies.push(receipt);
    } else {
      byStart.set(key, [receipt]);
    }
  }
  const matches: Match[] = [];
  for (const copies of byStart.values()) {
    const results: RankedReceipt[] = [];
    for (const copy of copies) {
      const i = results.findIndex((other) => mergeReceipts(other, copy, crypto) !== undefined);
      const union = i < 0 ? undefined : results[i] && mergeReceipts(results[i], copy, crypto);
      if (union) {
        results[i] = union;
      } else {
        results.push(copy);
      }
    }
    const rated = results.filter((receipt) => {
      const validity = validateReceipt(receipt, crypto);
      return validity.ok && !validity.void;
    });
    const [receipt] = rated;
    if (receipt && rated.length === 1 && !reRoundedSigner(receipt, results, crypto)) {
      matches.push({
        receipt,
        hash: receiptHash(receipt, crypto.sha256),
        day: utcDay(receipt.start.startedAt),
      });
    }
  }
  return matches.sort(
    (a, b) => a.receipt.start.startedAt - b.receipt.start.startedAt || byKey(a.hash, b.hash),
  );
}

/** A match, and the keys that forked their chain to play it. */
interface Chained extends Match {
  readonly forkers: ReadonlySet<string>;
}

/**
 * Step 2: each key's chain, walked in canonical order. A receipt whose
 * `prev` for some key was already used on that key's chain is a fork by
 * that key: it still counts for every other seat, is a loss for the
 * forker, and marks it forked. So a backdated fork can never erase a
 * result. A `prev` nobody has heard of is fine: relays forget.
 */
function chained(matches: readonly Match[]): { kept: Chained[]; forked: Set<string> } {
  const used = new Map<string, Set<string>>();
  const forked = new Set<string>();
  const kept: Chained[] = [];
  for (const match of matches) {
    const seats = match.receipt.start.teams.flat();
    const forkers = new Set(
      seats
        .filter((seat) => used.get(seat.pubkey)?.has(seat.prev) === true)
        .map((seat) => seat.pubkey),
    );
    for (const pubkey of forkers) {
      forked.add(pubkey);
    }
    for (const seat of seats) {
      const chain = used.get(seat.pubkey);
      if (chain) {
        chain.add(seat.prev);
      } else {
        used.set(seat.pubkey, new Set([seat.prev]));
      }
    }
    kept.push({ ...match, forkers });
  }
  return { kept, forked };
}

/** What `rate` keeps per identity while it walks the days. */
interface State {
  name: string;
  characterId: string;
  rating: number;
  rd: number;
  sigma: number;
  /** The last day whose decay or update `rd` already holds. */
  day: number | null;
  matches: number;
  lastPlayedDay: number | null;
  winWeight: number;
  streak: number;
  lastReceiptHash: string;
  opponents: Set<string>;
  trust: number;
}

/** One player's part of one match: the games it plays and how the match went for it. */
interface Part {
  readonly pubkey: string;
  /** One game per other team: its seats, and the score against them. */
  readonly games: readonly { readonly team: readonly string[]; readonly score: number }[];
}

/**
 * The rated parts of a match (step 4). A leaver or a forker scores 0,
 * everyone else scores the result against each other team, and a team
 * that all left loses to everyone. In a `host-left` match only the host,
 * and any forker, is rated.
 */
function partsOf(receipt: RankedReceipt, forkers: ReadonlySet<string>): Part[] {
  const { teams } = receipt.start;
  const { winningTeam, endReason } = receipt.result;
  const leavers = new Set(receipt.result.leavers);
  const keys = teams.map((team) => team.map((seat) => seat.pubkey));
  const allLeft = keys.map((team) => team.every((pubkey) => leavers.has(pubkey)));
  const parts: Part[] = [];
  keys.forEach((team, t) => {
    const others = keys.flatMap((other, u) => (u === t ? [] : [{ other, u }]));
    for (const pubkey of team) {
      const lost = leavers.has(pubkey) || forkers.has(pubkey);
      if (endReason === "host-left" && !lost) {
        continue;
      }
      const games = others.map(({ other, u }) => ({
        team: other,
        score: lost ? 0 : allLeft[u] ? 1 : winningTeam === null ? 0.5 : winningTeam === t ? 1 : 0,
      }));
      parts.push({ pubkey, games });
    }
  });
  return parts;
}

function stateOf(states: Map<string, State>, pubkey: string): State {
  let state = states.get(pubkey);
  if (!state) {
    state = {
      name: "",
      characterId: "",
      rating: RATING.initialRating,
      rd: RATING.initialRd,
      sigma: RATING.initialSigma,
      day: null,
      matches: 0,
      lastPlayedDay: null,
      winWeight: 0,
      streak: 0,
      lastReceiptHash: ZERO_HASH,
      opponents: new Set(),
      trust: 0,
    };
    states.set(pubkey, state);
  }
  return state;
}

/** `state`'s RD at the start of `day`: decayed over every idle day before it. */
function rdBefore(state: State, day: number): number {
  return state.day === null ? state.rd : decayRd(state.rd, day - 1 - state.day);
}

/**
 * Step 5's trust: min(1, D/min(12, P−1))³, where D counts the distinct
 * opponents that met ≥ 3 distinct opponents themselves and P the keys with
 * a receipt so far. Cubed, because Glicko's step is not linear in a weight:
 * a ring of four at a plain D/12 would still keep a third of a real gain.
 * Recomputed for the identities whose opponents changed, or for everyone
 * when P did. Returns the new P.
 */
function updateTrust(
  states: Map<string, State>,
  touched: ReadonlySet<string>,
  population: number,
): number {
  const players = [...states].filter(([, state]) => state.opponents.size > 0);
  const stale = new Set<string>();
  if (players.length === population) {
    for (const pubkey of touched) {
      stale.add(pubkey);
      for (const opponent of stateOf(states, pubkey).opponents) {
        stale.add(opponent);
      }
    }
  } else {
    for (const [pubkey] of players) {
      stale.add(pubkey);
    }
  }
  const full = Math.min(RATING.trustOpponents, players.length - 1);
  for (const pubkey of stale) {
    const state = stateOf(states, pubkey);
    let connected = 0;
    for (const opponent of state.opponents) {
      if (stateOf(states, opponent).opponents.size >= RATING.trustedOpponentMin) {
        connected += 1;
      }
    }
    state.trust = Math.min(1, connected / full) ** 3;
  }
  return players.length;
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * The ratings every receipt up to `asOfDay` makes (ADR-0055): a pure
 * function of its input set, whatever order it comes in. `crypto` checks
 * the signatures, as `validateReceipt` does.
 */
export function rate(
  receipts: readonly RankedReceipt[],
  asOfDay: number,
  crypto: ReceiptCrypto,
): Ratings {
  const { kept, forked } = chained(matchesOf(receipts, asOfDay, crypto));
  const states = new Map<string, State>();
  for (const pubkey of forked) {
    stateOf(states, pubkey);
  }
  const days = new Map<number, Chained[]>();
  for (const match of kept) {
    const today = days.get(match.day);
    if (today) {
      today.push(match);
    } else {
      days.set(match.day, [match]);
    }
  }
  let population = 0;
  for (const [day, today] of days) {
    // Who met whom, up to and including today, before anyone is weighted.
    const touched = new Set<string>();
    for (const { receipt } of today) {
      const keys = receipt.start.teams.map((team) => team.map((seat) => seat.pubkey));
      keys.forEach((team, t) => {
        for (const pubkey of team) {
          const state = stateOf(states, pubkey);
          keys.forEach((other, u) => {
            if (u !== t) {
              for (const opponent of other) {
                state.opponents.add(opponent);
              }
            }
          });
          touched.add(pubkey);
        }
      });
    }
    population = updateTrust(states, touched, population);

    // Every opponent is seen as it was before today began.
    const before = new Map<string, GlickoPlayer>();
    const pre = (pubkey: string): GlickoPlayer => {
      let player = before.get(pubkey);
      if (!player) {
        const state = stateOf(states, pubkey);
        player = { rating: state.rating, rd: rdBefore(state, day), sigma: state.sigma };
        before.set(pubkey, player);
      }
      return player;
    };
    const games = new Map<string, GlickoGame[]>();
    const counted = new Map<string, number>();
    const repeats = new Map<string, number>();
    for (const { receipt, hash, forkers } of today) {
      for (const seat of receipt.start.teams.flat()) {
        const state = stateOf(states, seat.pubkey);
        state.name = seat.name;
        state.characterId = seat.characterId;
        if (!forkers.has(seat.pubkey)) {
          state.lastReceiptHash = hash;
        }
      }
      for (const part of partsOf(receipt, forkers)) {
        const n = (counted.get(part.pubkey) ?? 0) + 1;
        counted.set(part.pubkey, n);
        const opposingSet = `${part.pubkey}|${part.games
          .flatMap(({ team }) => team)
          .sort(byKey)
          .join(",")}`;
        const k = (repeats.get(opposingSet) ?? 0) + 1;
        repeats.set(opposingSet, k);
        const base = n <= RATING.maxMatchesPerDay && k <= RATING.maxRepeats ? 1 / k : 0;
        const mine = games.get(part.pubkey) ?? [];
        games.set(part.pubkey, mine);
        const weights = part.games.map(({ team, score }) => {
          const weight = base * mean(team.map((pubkey) => stateOf(states, pubkey).trust));
          mine.push({
            rating: mean(team.map((pubkey) => pre(pubkey).rating)),
            rd: mean(team.map((pubkey) => pre(pubkey).rd)),
            score,
            weight,
          });
          return weight;
        });
        const state = stateOf(states, part.pubkey);
        state.matches += 1;
        state.lastPlayedDay = day;
        if (part.games.every(({ score }) => score === 1)) {
          const weight = mean(weights);
          state.winWeight += weight;
          if (weight > 0) {
            state.streak += 1;
          }
        } else if (!part.games.every(({ score }) => score === 0.5)) {
          state.streak = 0;
        }
      }
    }
    for (const [pubkey, mine] of games) {
      const state = stateOf(states, pubkey);
      const updated = glicko2Period(pre(pubkey), mine);
      if (updated !== before.get(pubkey)) {
        state.rating = updated.rating;
        state.rd = updated.rd;
        state.sigma = updated.sigma;
        state.day = day;
      }
    }
  }

  const ratings = new Map<string, Rating>();
  for (const [pubkey, state] of [...states].sort(([a], [b]) => byKey(a, b))) {
    const rd = state.day === null ? state.rd : decayRd(state.rd, asOfDay - state.day);
    ratings.set(pubkey, {
      name: state.name,
      characterId: state.characterId,
      rating: state.rating,
      rd,
      sigma: state.sigma,
      conservative: state.rating - 2 * rd,
      matches: state.matches,
      lastPlayedDay: state.lastPlayedDay,
      provisional: state.matches < RATING.provisionalMatches,
      wins: Math.floor(state.winWeight),
      streak: state.streak,
      forked: forked.has(pubkey),
      lastReceiptHash: state.lastReceiptHash,
      distinctOpponents: state.opponents.size,
      trust: state.trust,
    });
  }
  return ratings;
}

/** Ranked identities, best first: non-provisional, by conservative value, then pubkey. */
export function rankOrder(ratings: Ratings): string[] {
  return [...ratings]
    .filter(([, rating]) => !rating.provisional)
    .sort(([a, x], [b, y]) => y.conservative - x.conservative || byKey(a, b))
    .map(([pubkey]) => pubkey);
}
