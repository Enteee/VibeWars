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

   Every player who is not a leaver signs it, with its stamp (below). A player still seated who has not signed within `RANKED_RESULT_TIMEOUT_MS` (30 s) plus `RANKED_WORK_GRACE_MS` is added to `leavers` and the others sign again. **Refusing to sign is leaving.**

   A player publishes its own partial receipt, the start and its signature over that round's result, the moment it signs, in every round. That is the evidence against a host that re-rounds an honest signer into a leaver: the job voids a match when a key named a leaver in the final receipt has a valid signature on an earlier round's result that (1) carries the same fully signed start (the same `startHash`, not merely the same `matchId`) and (2) is also validly signed, in any copy, by a key on the final receipt's winning team (on a draw, by a key on any team but the leaver's). A player who really refused has no such signature, so it loses. A leaver-only partial is not evidence: a leaver could sign a round, or a whole start of their own under the same `matchId`, alone. A winner gains nothing by voiding their own win, so their signature is what makes the round believable.

**A host that leaves loses.** Without the host, the match is over. Each remaining player builds the same `RankedResult` without talking to anyone else:

- `leavers`: the host's key;
- `winningTeam`: null;
- `endReason`: `host-left`;
- `durationSeconds`: 0;
- `replayHash`: 64 zeros.

Each signs it and publishes a partial receipt. The job merges result signatures over identical result bytes. The host takes a loss. A `host-left` result rates nobody else.

A **receipt** holds the start, all start signatures, the result and every signature on the result. It is about 11 KB at 8v8.

It is valid when:

- every start signature verifies;
- every non-leaver's result signature verifies;
- every result signature, a partial's included, carries a valid stamp for its signer and this start (`no-work` otherwise);
- result signatures from more than half of the seats in the start (Q109, answer B); without them the match is void (unrated for every seat), whatever the leavers list says. A departed host counts among the seats and does not sign.

A receipt nobody but its host signed cannot exist, because the start round needs every player. So nobody can fabricate a match against a key that never agreed to play it.

**Leavers lose.** A leaver's result is a loss, whatever `winningTeam` says. The players who stayed get the match's result. The one reconnect window, `RECONNECT_WINDOW_SECONDS`, decides who left. The operator said about 60 s; the codebase has one window of 30 s. Ranked play uses that same constant, and if 30 s proves short we raise it for every mode, not just ranked.

**Every result signature is paid for** (#3746). It carries `work`, a 16-hex-digit nonce whose digest under `vibewars/ranked-work` over `{ startHash, pubkey, work }` has `RANKED_WORK_BITS` leading zero bits. The stamp binds the start, not the round, so signing a re-round costs nothing new. It binds the start and not the `matchId`: the archive keys receipts by their hash, and `rate` takes a reused `matchId` under another start for another match, so a stamp bound to `matchId` could be replayed under as many starts as a flooder liked. A receipt or a partial with an unpaid signature is rejected (`no-work`), which costs one hash per signer to check.

Each client searches for its stamp in a Worker, at most half a core (8 ms slices, 8 ms rests), from the moment the start round completes, using `@noble/hashes`' synchronous sha256 (WebCrypto's digest is async only, and an await per nonce costs more than the hash). The job checks with the same function. In a match of a few minutes the stamp is ready long before the result. In one that ends sooner, the client signs as soon as its stamp is ready, and every seat, host included, waits `RANKED_RESULT_TIMEOUT_MS + RANKED_WORK_GRACE_MS` for any seat's signature. Nobody has to know anyone else's progress. The grace is the measured p99 stamp time on a mid-range phone at the half-core throttle, so a slow phone is not turned into a leaver.

**Calibration** (2026-11-21, `findWork` with `@noble/hashes`). A search takes on average 2^bits hashes and is geometric, so its p99 is about 4.6 times its mean. Measured rates for one full core: Node 24 on the CI-class dev box 102k hashes/s; Chromium 155 desktop 80k; Chromium at a 4× CPU throttle, standing in for a mid-range phone, 26.5k (taken as 20k, a strict quarter of desktop, to be safe). At the worker's half core a phone gets about 10k/s, so at `RANKED_WORK_BITS` = 17:

| Tier (half core) | mean  | p99  |
| ---------------- | ----- | ---- |
| Mid-range phone  | 13 s  | 60 s |
| Desktop Chromium | 3.3 s | 15 s |
| Node (CI box)    | 2.6 s | 12 s |

`RANKED_WORK_GRACE_MS` is that phone p99, 60 s. 18 bits would double it past the 60 s the issue allows.

**What it is worth.** A stamp costs a script seconds to tens of seconds of JavaScript, and native or GPU sha256 next to nothing. It is a speed bump against casual floods from a page or a Node script, not a bound on a determined attacker: the per-key cap (#3738) and established keys (#3745) are the real per-key bounds. Do not raise `RANKED_WORK_BITS` as a fix for flooding; it only hurts phones.

### Publishing

- **Receipts.** The host publishes the receipt to the relays `relays.ts` already lists, as a NIP-78 kind 30078 event with `d=vibewars-ranked/<matchId>` and `t=vibewars-ranked`. The event is signed by a throwaway key, as match records are; the signatures inside carry the trust. Every signer also publishes the same event, so a host that vanishes does not lose the match. Receipts are de-duplicated by `matchId`. If several events carry different signatures over the same result bytes, the job takes the union.
- **Replays.** The host records the replay: the seed, the starting setup, and every intent it applies, as `(tick, seat, intent)` in the order applied. `replayHash` is the hash of its canonical encoding. The host sends the replay to every player at the end. Each player keeps their last 50 ranked replays in IndexedDB. Replays are not published in the first cut.

### The rating

`rate(receipts, asOfDay, crypto)` in `packages/ranking` is a pure function (`crypto` checks the signatures, as `validateReceipt` does):

- **Order.** Receipts are sorted by `(startedAt, receipt hash)`. They are grouped into rating periods of one UTC day.
- **Glicko-2**, τ = 0.5, starting at 1500 / RD 350 / σ 0.06. A team match counts, for each player, as one game against the opposing team's average rating and RD.
- **Decay.** Each day without a rated match, RD grows: RD ← min(350, √(RD² + 26²)). A rating that went untouched for 180 days returns to the full 350 uncertainty. The leaderboard ranks by the conservative value r − 2·RD, so an idle identity sinks within weeks. Only the key's own matches reset its RD, and a second key is a separate, provisional rating.
- **Provisional.** An identity with fewer than 10 rated matches is provisional. It is listed as such and has no rank.
- **Farming weights.** Each game's contribution to the Glicko sums is multiplied by a weight w in [0, 1]:
  - The k-th match against the same opposing identity set within one day weighs 1/k. Only the first 3 such matches count at all.
  - At most 20 rated matches per identity per day count.
  - Trust: w is multiplied by the opponents' average trust, where trust(id) = min(1, D/min(12, P−1))³, D is the number of distinct opponents of `id` who themselves have at least 3 distinct opponents, and P the number of keys with at least one valid receipt up to that day, so a young ladder of five keys who all play each other rates normally. Cubed, because a Glicko step is not linear in its weight: a closed ring of four keys (D = 3) keeps under 5 % of a real gain in a day, where a plain D/20 kept 27 %.
- **Forks.** A receipt whose `prev` for some key repeats one already used on that key's chain is a fork. Only the earliest receipt in canonical order stays on the chain. A later one still counts normally for every other seat in it, counts as a loss for the forker whatever its result says, and marks the forker forked on the leaderboard. A fork can never erase anyone else's result, so backdating a match against an alt key to void a real loss gains nothing (perf-sec-qa, #3600).

Floats are evaluated in a single engine: the job runs on Node, and players run the same code on the same Node major when they recompute. The output records the engine version beside its hash.

### The leaderboard cache

- **The script.** `scripts/ranking/build.mjs`, run locally with `pnpm ranking:build`:
  1. Reads the archive.
  2. Fetches `t=vibewars-ranked` events since the last checkpoint from every listed relay, with Node's built-in WebSocket.
  3. Verifies the new receipts.
  4. Appends the valid ones to the archive, except a new receipt whose every seat key is already in 50 for its UTC day of `startedAt`, counting what the archive holds. Every seat, not any, so a loser cannot veto a match by flooding their own key. The archive is never evicted from, since signers choose `startedAt` and a backdated flood must not erase a match (#3738). A new receipt that started before 00:00 UTC two days before the as-of day is refused as `stale`, so a key cannot spread a flood over every past day: one capped day opens per day. Archived receipts are not judged again. The cap bounds what one key can flood into a shard; it is not a sybil defence, since fresh keys pass it.
  5. Recomputes everything with `rate` from scratch.
  6. Writes `ranking/receipts/<YYYY-MM>.ndjson` (the archive, since relays forget: one shard per UTC month of `startedAt`, rewritten only when it changed, and the run fails rather than write one over 90 MB, which GitHub would refuse), `ranking/leaderboard.json`, the same bytes as `ranking/boards/<asOf>.json` (deleting boards more than 3 h older than it: published boards never change, so a client caches them by `asOf`). `asOf` is the as-of day's midnight or the newest archived `startedAt`, whichever is later, and past the previous run's `asOf` whenever the entries differ from its; when they do not, the previous `leaderboard.json` is kept byte for byte. So a late receipt with an older `startedAt` gets a new `asOf`, and the run fails rather than rewrite a published board, and `ranking/log.txt` (counts, rejected receipts with reasons, and the sha256 of `leaderboard.json`).
- **The workflow.** `.github/workflows/ranking.yml` runs the script hourly and on dispatch. It commits `ranking/` to `gh-pages` in the same concurrency group as `pages.yml`, so the two never race. Anyone can run the script and compare hashes.
- **`leaderboard.json`** holds `asOf`, `engine`, and per identity: rating, RD, conservative value, rank or provisional, matches, last played, the last receipt hash, and the forked flag.

### Rank-aware matchmaking

- **Bot-free tickets** carry a claim for each member key (tickets already name member keys): `{rating, asOf}`, the rounded conservative value from the `leaderboard.json` that member fetched, and that copy's `asOf`. Each claim carries its own `asOf`, because a party's members fetched at different times: every member sends its claim with its queue consent, and the host's ticket carries them as they came. A key that is not listed claims 800 (1500 − 2·350), with no special case.
- **Formation stays one pure function of live tickets**, as ADR-0032 requires. The rating window starts at ±100 and widens by 10 per second the oldest ticket in the candidate set has waited, up to ±600. Age is measured from ticket timestamps, exactly as the Ascent skip wait already does.
- **Team balance.** Solo tickets forming teams are split by a snake draft on claimed rating, so the two team averages land close. In a whole-team mode the teams are fixed, and opposing teams are paired by average rating.
- **A lie is caught at the start round.** Every player checks every claim against the exact board it names, `ranking/boards/<asOf>.json`: the claim must equal that key's conservative value there, rounded (800 unlisted). A claim naming a board that is not published, or no longer kept (older than 3 h), is refused: an honest client fetches as it queues. A claim from no board, `asOf` 0, holds only as 800 from a key the checker's own copy does not list, so a strong player cannot fake a failed fetch to pair low. A false claim means no start signature, so the match never becomes ranked.

## Considered

- **A signed result from the host alone**, the current match record. One browser decides the rating of seven others. Rejected: this is exactly the "a host can lie" of `match-record.ts`.
- **A result signed only at the end.** A winner could invent a match against any key it knows and claim the opponent "left". Rejected: the start round makes every match one that every key agreed to play.
- **Ratings computed in the browser from the relays**, with no cache. Every visit would fetch every receipt; relays forget old events; matchmaking needs every client to see the same numbers. Rejected: the cache is a convenience anyone can reproduce, never an authority.
- **A server, or a GitHub-issue ledger.** No server is the founding constraint (ADR-0022). Issues add a GitHub account to every match. Rejected.
- **Elo.** It has no uncertainty, so neither "provisional" nor decay has anywhere to live. Glicko-2's RD carries both.
- **Publishing replays to Nostr.** A long 8v8 replay can exceed what relays accept, and nothing checks replays yet. Deferred: players hold them, and the receipt pins them by hash.

## Consequences

- **What a host decides.** The host proposes who left, but its team cannot win alone: a result counts only if more than half of the seats signed it (Q109, answer B, replacing the every-team rule of #3594), so a host team listing all opponents as leavers voids the match instead of winning it. In a 2v2v2, two teams signing rate the match even when the third signed nothing. A host can still name some opponents as leavers while one of their teammates signs; that teammate's client signs only a result whose leavers it has itself seen drop from the snapshot. A re-round is the result it signed with more leavers and nothing else changed; it takes the host's word for the new leavers, since nobody else can see a refusal. A result it refused is never an earlier round. A team that leaves whole, exactly half the seats or more, escapes a loss: the price of majority consent.
- **A hostile host can make a player who stayed look like a leaver**, by withholding a result round or by cutting their connection. Clients can't tell the difference, and this design accepts it. Per-round partials void only a re-round that names a player who signed an earlier round of the same start, and only when a key on the winning team (on a draw, on another team) signed that round too. A leaver-only partial is not evidence, since a leaver can make one alone; a hostile host whose whole team stays silent on the earlier round still gets its re-round.
- **A host can still forge its peers' inputs.** Players sign the replay hash without re-simulating it. The host is chosen by hash, not by itself (ADR-0032), which limits this. Replay disputes (re-simulating and penalising a lying host) are a later card, and so is offline clique detection.
- **Ranked play publishes who played whom**, by key and character name. The queue screen says so before the first queue.
- **The leaderboard lags** by up to an hour. Matchmaking tolerates this because claims are checked against a stated `asOf`.
- **Not in the first cut:** seasons with signed snapshots, disputes, clique detection, titles and fame from rank, profile pages, and rank polish in the UI. Each comes back as its own card.
