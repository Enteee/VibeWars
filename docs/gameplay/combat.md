# Combat

How a fight actually works, and why each rule is the way it is.

## The loop

The server advances a fixed **20 Hz** tick (ADR-0003). Every tick, for
every living player:

1. status effects tick (degeneration, regeneration, expiry)
2. energy regenerates
3. movement integrates, then resolves against other players and walls
4. an in-progress cast advances; if it completes, its effects apply
5. state is synchronised to clients

The client renders whatever the server last said. It never decides an
outcome — it sends _intent_ (`move`, `stop`, `target`, `use-skill`) and
the server decides what happens (brief §12, §32).

## Resources

| Resource   | How you get it                                   | What it gates     |
| ---------- | ------------------------------------------------ | ----------------- |
| Energy     | Regenerates 2/second, up to 50                   | Most skills       |
| Adrenaline | +3 each time your skill damages an enemy, max 25 | Adrenaline skills |

The split is deliberate. Energy rewards patience; adrenaline rewards
staying in the fight and landing hits. An adrenaline skill you cannot
charge is useless, so costs are tuned against what one hit grants — a
skill costing more than a hit gives would be uncastable in practice,
which is a bug the catalog's own tests now catch.

Numbers live in the ruleset (`game-core/src/ruleset.ts`), not scattered
through the server, so the headless runner and the live match cannot
drift apart.

## Casting

A skill has an **activation time** (cast) and a **recharge**. Activation
is the window where you are committed and interruptible. Recharge is the
wait before you can use it again.

Before a cast starts, the server checks, in order:

1. caster alive
2. skill actually on their bar
3. not already casting
4. not recharging
5. affordable (energy or adrenaline)
6. target legal for the skill's targeting rule
7. target in range
8. line of sight to target

Each rejection has a **named reason**, not a bare `false` — "out of
range" and "not enough energy" are very different things to a player
mid-fight, and the server logs which one happened.

Order matters for that reason too: cost is checked before range, so a
player who is both broke and too far away is told the more actionable
thing.

## Interrupts

Interrupting cancels a cast **only if one is in progress**. Too early or
too late and the interrupt is wasted — and that waste is reported
explicitly (`interrupt-missed`) rather than silently swallowed, because
landing an interrupt is a timing skill and hiding failures hides the
feedback that teaches it.

The interrupted caster **still paid** their energy. That is what makes
interrupts so valuable: they do not just delay a skill, they burn the
opponent's resources.

## Conditions, hexes and enchantments

All three are timed status effects sharing one lifecycle, parameterised
by category:

| Category    | Who applies it | Removed by          |
| ----------- | -------------- | ------------------- |
| Condition   | Foes           | Condition removal   |
| Hex         | Foes           | Hex removal         |
| Enchantment | Allies/self    | Enchantment removal |

**Durations do not stack.** Re-applying a status keeps the longer of the
existing and incoming duration. That single rule is why spamming a short
condition cannot out-last one well-timed long one.

Each condition has a distinct mechanical identity, not just a different
number:

| Condition  | Effect                   |
| ---------- | ------------------------ |
| Bleeding   | −3 health/second         |
| Burning    | −7 health/second         |
| Poison     | −4 health/second         |
| Crippled   | Half movement speed      |
| Blind      | 90% of your attacks miss |
| Weakness   | −20 armor                |
| Deep Wound | −20% maximum health      |
| Dazed      | Double cast time         |

Degeneration applies **continuously** (`rate × dt`), not in once-per-
second lumps, so a bleed at 20 Hz drains smoothly instead of
stair-stepping. Regeneration correctly caps at the deep-wound-_reduced_
maximum, not the raw one.

## Positioning

- **Body blocking**: living players are solid. A front line can deny
  ground; a caster can be boxed in. Corpses are _not_ solid — a dead
  player should never trap the living.
- **Walls** resolve after players, so someone squeezed between a blocker
  and a wall ends up outside the wall rather than inside it.
- **Line of sight** is a geometric query against wall segments, shared
  by the server, the tests and any future client preview.

## Death and scoring

Health reaching zero kills exactly once (no double death events). A kill
scores for the opposing team; both death paths — a killing blow and
bleeding out — route through the same place, so neither is worth more
than the other.

Kill credit is **team-level, not per-player**. Attributing a kill to a
specific killer needs damage-source tracking that does not exist yet,
and inventing an attribution would be a plausible-looking lie in the
scoreboard.

A dead player respawns at a spawn point of their own team after 8
seconds, at full health and energy, with all statuses cleared.

## Match end

A match ends when a team reaches the score target, or when the clock
runs out. Score is checked **before** time, so landing the winning kill
as the clock expires reads as a score win — which is what happened from
the player's point of view. A tie at the time limit is a **draw**, not
an arbitrarily chosen winner.

## Trying it without a server

```sh
node packages/game-data/dist/run-cli.js duel elementalist.fireball monk.orison-of-healing
```

The headless runner uses the same `game-core` functions the live server
does, and is deterministic from a seed — so a balance result from it is
a result about the real game, and a bug found in it reproduces.
