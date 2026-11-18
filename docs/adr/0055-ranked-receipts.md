# ADR-0055: Ranked play is a public ledger of match receipts every player signs

## Status

Proposed (2026-11-18). Epic #3569, operator design. Amends ADR-0032 point 1 ("unranked only") and the master brief's "no ranked matchmaking". Builds on ADR-0022 (host browser as authority), ADR-0032 and ADR-0042 (the Nostr queue) and #2706 (player keys).

## Context

The operator wants a global ranking with no server. VibeWars is a static site, a match's authority is one player's browser (ADR-0022), and strangers meet through tickets on public Nostr relays (ADR-0032). Every browser already holds a secp256k1 player key and signs BIP-340 under purpose tags (`PlayerKey`, #2706). Match records exist (`match-record.ts`), but the host alone reports them, under a throwaway key, and "a host can lie": fine for a history screen, worthless for a rating.

So a rating has to rest on something nobody can forge alone and anybody can check: signatures from every player of a match, published where anybody can read them, and a rating that is a pure function of them.

## Decision

**A ranked match ends in a receipt that every participant signs. Ratings are a pure function of all valid receipts, so anybody can recompute them. A scheduled GitHub Actions job caches the result as `leaderboard.json` on the Pages site. Matchmaking reads the cache.**

### What is ranked

- **Every queued match with no bots is ranked** (operator, Q106). The test is the formed group: every ticket in it has `bots: 0`. There is no separate ranked queue and no toggle. A group with any bot ticket plays exactly as today, unranked. In a ranked match, a seat that empties is never filled by a bot.
- **The rating is per player key** (operator, Q105). All characters on a browser share one rating. `characterId` and `name` are still in each seat, so the leaderboard can name the character last played. The **ranked identity** below is the pubkey.
- Private lobbies, Training and bot-carrying queue groups stay exactly as they are. They write no receipts.

### The receipt: two signing rounds

The new package `packages/ranking` holds the types, the canonical encoding and the verification. It is pure TypeScript with no browser or server imports, like game-core. Hashing and verification come in as injected functions, as `VerifyPlayerProof` does today. Every digest is BIP-340 tagged with a purpose tag of its own.

1. **Start** (`vibewars/ranked-start`). When a ranked match forms, the elected host builds a `RankedStart` before the first tick:
   - `matchId`: the formation's `groupId`.
   - `buildHash`: the game build, the same id the protocol handshake already refuses on.
   - `mode` and `map`.
   - `seed`.
   - `startedAt`: unix seconds.
   - `teams`: for each seat, `{ pubkey, characterId, name, claimedRating, prev }`.

   `prev` is the hash of the player's own last receipt, or 64 zeros for the first. `claimedRating` is the player's rating in the leaderboard at `leaderboardAsOf`, which is also in `RankedStart`.

   Every player checks the start against what they see and against their own leaderboard copy, then signs it. The match does not start until the host holds every start signature. Missing signatures or a failed check within `RANKED_START_TIMEOUT_MS` (15 s) cancel the match, unrated, and everybody goes back to the queue.

2. **Result** (`vibewars/ranked-result`). At the end, the host builds a `RankedResult`:
   - `startHash`.
   - `winningTeam` (null is a draw).
   - `endReason` and `durationSeconds`.
   - `leavers`: the pubkeys whose seat was freed after `RECONNECT_WINDOW_SECONDS`.
   - `replayHash`.

   Every player who is not a leaver signs it. A player still seated who has not signed within `RANKED_RESULT_TIMEOUT_MS` (30 s) is added to `leavers` and the others sign again. **Refusing to sign is leaving.**

**A host that leaves loses.** Without the host, the match is over. Each remaining player builds the same `RankedResult` without talking to anyone else:

- `leavers`: the host's key;
- `winningTeam`: null;
- `endReason`: `host-left`;
- `durationSeconds`: 0;
- `replayHash`: 64 zeros.

Each signs it and publishes a partial receipt. The job merges result signatures over identical result bytes. The host takes a loss. A `host-left` result rates nobody else.

A **receipt** holds the start, all start signatures, the result and every signature on the result. It is about 1 KB at 8v8.

It is valid when:

- every start signature verifies;
- every non-leaver's result signature verifies;
- at least one result signature exists on each team that had a non-leaver.

A receipt nobody but its host signed cannot exist, because the start round needs every player. So nobody can fabricate a match against a key that never agreed to play it.

**Leavers lose.** A leaver's result is a loss, whatever `winningTeam` says. The players who stayed get the match's result. The one reconnect window, `RECONNECT_WINDOW_SECONDS`, decides who left. The operator said about 60 s; the codebase has one window of 30 s. Ranked play uses that same constant, and if 30 s proves short we raise it for every mode, not just ranked.

### Publishing

- **Receipts.** The host publishes the receipt to the relays `relays.ts` already lists, as a NIP-78 kind 30078 event with `d=vibewars-ranked/<matchId>` and `t=vibewars-ranked`. The event is signed by a throwaway key, as match records are; the signatures inside carry the trust. Every signer also publishes the same event, so a host that vanishes does not lose the match. Receipts are de-duplicated by `matchId`. If several events carry different signatures over the same result bytes, the job takes the union.
- **Replays.** The host records the replay: the seed, the starting setup, and every intent it applies, as `(tick, seat, intent)` in the order applied. `replayHash` is the hash of its canonical encoding. The host sends the replay to every player at the end. Each player keeps their last 50 ranked replays in IndexedDB. Replays are not published in the first cut.

### The rating

`rate(receipts, asOfDay)` in `packages/ranking` is a pure function:

- **Order.** Receipts are sorted by `(startedAt, receipt hash)`. They are grouped into rating periods of one UTC day.
- **Glicko-2**, τ = 0.5, starting at 1500 / RD 350 / σ 0.06. A team match counts, for each player, as one game against the opposing team's average rating and RD.
- **Decay.** Each day without a rated match, RD grows: RD ← min(350, √(RD² + 26²)). A rating that went untouched for 180 days returns to the full 350 uncertainty. The leaderboard ranks by the conservative value r − 2·RD, so an idle identity sinks within weeks. Only the key's own matches reset its RD, and a second key is a separate, provisional rating.
- **Provisional.** An identity with fewer than 10 rated matches is provisional. It is listed as such and has no rank.
- **Farming weights.** Each game's contribution to the Glicko sums is multiplied by a weight w in [0, 1]:
  - The k-th match against the same opposing identity set within one day weighs 1/k. Only the first 3 such matches count at all.
  - At most 20 rated matches per identity per day count.
  - Trust: w is multiplied by the opponents' average trust, where trust(id) = min(1, D/20), and D is the number of distinct opponents of `id` who themselves have at least 3 distinct opponents. A closed ring of a handful of keys earns almost nothing.
- **Forks.** A receipt whose `prev` for some key repeats one already used on that key's chain is a fork. Only the earliest receipt in canonical order stays on the chain. Later ones are void for everyone in them, and the key is marked forked on the leaderboard.

Floats are evaluated in a single engine: the job runs on Node, and players run the same code on the same Node major when they recompute. The output records the engine version beside its hash.

### The leaderboard cache

- **The script.** `scripts/ranking/build.mjs`, run locally with `pnpm ranking:build`:
  1. Reads the archive.
  2. Fetches `t=vibewars-ranked` events since the last checkpoint from every listed relay, with Node's built-in WebSocket.
  3. Verifies the new receipts.
  4. Appends the valid ones to the archive.
  5. Recomputes everything with `rate` from scratch.
  6. Writes `ranking/receipts.ndjson` (the archive, since relays forget), `ranking/leaderboard.json`, and `ranking/log.txt` (counts, rejected receipts with reasons, and the sha256 of `leaderboard.json`).
- **The workflow.** `.github/workflows/ranking.yml` runs the script hourly and on dispatch. It commits `ranking/` to `gh-pages` in the same concurrency group as `pages.yml`, so the two never race. Anyone can run the script and compare hashes.
- **`leaderboard.json`** holds `asOf`, `engine`, and per identity: rating, RD, conservative value, rank or provisional, matches, last played, the last receipt hash, and the forked flag.

### Rank-aware matchmaking

- **Bot-free tickets** carry `claimedRating` for each member key (tickets already name member keys) and `leaderboardAsOf`. The claim is the conservative value from the `leaderboard.json` the client fetched. A key that is not listed claims 800 (1500 − 2·350), with no special case.
- **Formation stays one pure function of live tickets**, as ADR-0032 requires. The rating window starts at ±100 and widens by 10 per second the oldest ticket in the candidate set has waited, up to ±600. Age is measured from ticket timestamps, exactly as the Ascent skip wait already does.
- **Team balance.** Solo tickets forming teams are split by a snake draft on claimed rating, so the two team averages land close. In a whole-team mode the teams are fixed, and opposing teams are paired by average rating.
- **A lie is caught at the start round.** Every player checks every claim against their own copy of the leaderboard at that `asOf`, or a newer copy. A false claim means no start signature, so the match never becomes ranked.

## Considered

- **A signed result from the host alone**, the current match record. One browser decides the rating of seven others. Rejected: this is exactly the "a host can lie" of `match-record.ts`.
- **A result signed only at the end.** A winner could invent a match against any key it knows and claim the opponent "left". Rejected: the start round makes every match one that every key agreed to play.
- **Ratings computed in the browser from the relays**, with no cache. Every visit would fetch every receipt; relays forget old events; matchmaking needs every client to see the same numbers. Rejected: the cache is a convenience anyone can reproduce, never an authority.
- **A server, or a GitHub-issue ledger.** No server is the founding constraint (ADR-0022). Issues add a GitHub account to every match. Rejected.
- **Elo.** It has no uncertainty, so neither "provisional" nor decay has anywhere to live. Glicko-2's RD carries both.
- **Publishing replays to Nostr.** A long 8v8 replay can exceed what relays accept, and nothing checks replays yet. Deferred: players hold them, and the receipt pins them by hash.

## Consequences

- **A host can still forge its peers' inputs.** Players sign the replay hash without re-simulating it. The host is chosen by hash, not by itself (ADR-0032), which limits this. Replay disputes (re-simulating and penalising a lying host) are a later card, and so is offline clique detection.
- **Ranked play publishes who played whom**, by key and character name. The queue screen says so before the first queue.
- **The leaderboard lags** by up to an hour. Matchmaking tolerates this because claims are checked against a stated `asOf`.
- **Not in the first cut:** seasons with signed snapshots, disputes, clique detection, titles and fame from rank, profile pages, and rank polish in the UI. Each comes back as its own card.
