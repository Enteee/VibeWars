# ADR-0056: Cosmetics are earned on the public ledger and never reach the simulation

## Status

Proposed (2026-11-18). Epic #3576, operator request. Builds on ADR-0055 (ranked receipts and the leaderboard) and #2706 (player keys).

## Context

The operator wants winning to unlock ways to customise how you look. There are absolute rules:

- Cosmetics are purely visual and give no one any benefit or downside.
- They belong to a player key and are shared by all its characters.
- The simulation never reads them.
- No skins for casts or spells.
- Nothing may change what an opponent can read.
- Every player can force default visuals on everyone else.
- No sound may mask a gameplay cue.

There is no server to say who earned what. ADR-0055's leaderboard is public, reproducible from signed receipts, and every client already fetches it.

## Decision

**What you have earned is a fact anybody can look up in `leaderboard.json`. What you wear is a list of ids that your key signs. Every viewer checks the list against its own copy of the leaderboard and draws what it cannot verify as the default. Cosmetics live in `apps/web` alone.**

1. **The leaderboard is the proof.** Unlocks are a pure function of a key's leaderboard entry: `wins` (verified ranked wins) and `rank` (current, null when provisional). Season placement joins this when seasons exist. There are no tokens, and nothing extra for the job to sign: whoever can recompute the leaderboard can check an unlock. The tiers:

   | Tier | Unlocked by                                                              |
   | ---- | ------------------------------------------------------------------------ |
   | 1    | 5 wins                                                                   |
   | 2    | 25 wins                                                                  |
   | 3    | 75 wins                                                                  |
   | 4    | 200 wins                                                                 |
   | 5    | 500 wins                                                                 |
   | Top  | rank ≤ 100 now; lost when the rank is lost, so it decays with the rating |

   The tiers are constants in `apps/web/src/cosmetics/unlocks.ts` and are tuned there.

2. **The selection is signed.** `CosmeticSelection {pubkey, ids, at}` holds at most one id per slot, at most 12 ids. The key signs it under `vibewars/cosmetics` with `PlayerKey.signCosmetics`, a purpose-named method like `signLobbyProof`. The selection rides in the lobby roster and is passed on in the match roster. Hosts pass it through untouched; they never check it, and neither does the simulation.
3. **The viewer decides.** A client draws another player's item only when all of these hold:
   - the signature verifies for that seat's key;
   - the item is in this build's catalog;
   - that key's entry in the viewer's leaderboard copy unlocks it;
   - the viewer has not turned off "Show other players' cosmetics" in Options (it is on by default).

   Anything else is drawn as the default, quietly. Your own selection is always drawn for you.

4. **Readability is a rule of the catalog, not a review taste.** Every catalog entry passes `checkCosmetic(entry)` in a test:
   - It is drawn under body rings, condition marks, telegraphs and call marks, never over them.
   - It never uses team colours or the telegraph and condition hues in `arena-palette.ts`.
   - Ground and trail effects have a fixed radius ≤ 0.6 of the body radius and alpha ≤ 0.35.
   - It honours reduced motion.
   - It makes no sound.
   - Spawn and death styles keep the default timing and keep the body readable for the whole default duration.
5. **Slots in the first cut:**
   - name plate frame;
   - title, with its glow colour;
   - ground aura;
   - footstep trail;
   - weapon trail;
   - cape pattern;
   - spawn-in style;
   - death dissolve;
   - emblem frame;
   - banner shape;
   - win-streak flame beside the name, shown while the leaderboard's `streak` is ≥ 3.

   Emotes and victory poses, portrait frames and profile backdrops, ping-wheel icons and season medals each need a base feature that does not exist yet (an emote system, a profile, a ping wheel, seasons). Each comes with that feature.

## Considered

- **Unlock tokens the leaderboard job signs.** This adds a project signing key and its custody, and proves nothing the public leaderboard does not already prove. Rejected.
- **Hosts check cosmetics.** It gives the authority a job that the sim must never depend on, and one lying host could not hurt anyone anyway. Rejected: each viewer checks for itself.
- **Cosmetic data in game-core or game-protocol's match state.** It would put appearance one import away from the simulation. Rejected: rosters carry an opaque signed list, and only `apps/web` reads it.
- **Cast-effect skins.** Operator veto: they hurt readability.

## Consequences

- A viewer with a stale or missing leaderboard sees defaults on others. This errs toward default, which is never unfair.
- `leaderboard.json` gains `wins` and `streak` (#3571/#3574).
- A new slot is a catalog entry plus a renderer hook, and passes `checkCosmetic`.
