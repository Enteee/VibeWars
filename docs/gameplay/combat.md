# Combat

How a fight actually works, and why each rule is the way it is.

## The loop

The server advances a fixed **20 Hz** tick (ADR-0003, ADR-0017). Every
tick, for every living player, in the order they joined:

1. movement integrates, then resolves against other players and walls
2. energy regenerates
3. status effects tick (degeneration, regeneration, expiry)
4. an in-progress cast advances; if it completes, its effects apply
5. the weapon attack walks into reach or swings
6. a training dummy's behaviour acts

Then state is synchronised to clients.

The client renders whatever the server last said. It never decides an
outcome — it sends _intent_ (`move`, `stop`, `target`, `use-skill`) and
the server decides what happens (brief §12, §32).

## Resources

| Resource   | How you get it                                                                             | What it gates     |
| ---------- | ------------------------------------------------------------------------------------------ | ----------------- |
| Energy     | Regenerates 2/second, up to 50                                                             | Most skills       |
| Adrenaline | +3 each time your attack skill or weapon swing damages an enemy (spells earn none), max 25 | Adrenaline skills |

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
5. for an attack skill, the right weapon in hand
6. affordable (energy or adrenaline)
7. target legal for the skill's targeting rule
8. target in range
9. line of sight to target

Each rejection has a **named reason**, not a bare `false` — "out of
range" and "not enough energy" are very different things to a player
mid-fight, and the server logs which one happened.

Order matters for that reason too: cost is checked before range, so a
player who is both broke and too far away is told the more actionable
thing.

A cast in progress can be **given up**: by moving, or by Esc (Cancel
Action, which also stops your weapon attack). A cancelled skill stays
paid for, does not recharge, and is logged as `cancelled`. While a skill
casts, its slot on the bar is lit; when your cast ends without going
off, the slot flashes, red with a ✕ if you were interrupted and grey if
you cancelled it.

## Interrupts

Interrupting cancels a cast **only if one is in progress**. Too early or
too late and the interrupt is wasted — and that waste is reported
explicitly (`interrupt-missed`) rather than silently swallowed, because
landing an interrupt is a timing skill and hiding failures hides the
feedback that teaches it.

The interrupted caster **still paid** their energy. And the skill
starts its recharge, as if it had been used, as in GW1. That is what makes
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

**Dazed doubles cast time; it does not make you easier to interrupt.**
That is the reference's dazed, and here it would do nothing: every cast
is already interruptible. An instant skill stays instant. See
[ADR-0019](../adr/0019-status-modifiers.md).

**Blind makes attacks miss**: weapon swings, each blow rolled on its own,
and attack skills (Swift Chop, Backbreaker, Opening Cut, Barrage, Broad
Head Arrow). Each blow of an attack skill is rolled when it
lands, so a miss still costs energy or adrenaline and starts the
recharge, and the missed foe gets none of the skill's riders. Spells are
unaffected.

Degeneration applies **continuously** (`rate × dt`), not in once-per-
second lumps, so a bleed at 20 Hz drains smoothly instead of
stair-stepping. Regeneration correctly caps at the deep-wound-_reduced_
maximum, not the raw one.

## Weapon attacks

Select a foe and attack it (Space; with nothing selected, the nearest foe): your character walks into weapon reach and sight, round walls if it has to, then
swings at the weapon's own interval until the foe dies, you move, or you
cancel (Esc). A foe with no way to them for half a second ends the attack with "can't reach". Reach is checked exactly as a skill's range is, so wherever you
can swing you can also use a melee skill. The first hit lands one full
interval after you arrive. See [ADR-0026](../adr/0026-weapon-auto-attack.md).

Each hit is the weapon's damage range, scaled by your rank in its
attribute (exactly the stated damage at 12) and cut to a third if you do
not meet its requirement, then mitigated by armor like any other weapon
damage. Daggers sometimes strike twice; a scythe also hits up to two foes
adjacent to its target.

**Attack skills ride the weapon** (ADR-0029). An attack skill needs its
weapon: Swift Chop an axe, Backbreaker a hammer, Opening Cut a sword,
Barrage and Broad Head Arrow any bow. With the wrong one it is refused
("Needs an axe."). It is one blow of that weapon: it hits halfway
through a swing (or through its own activation, if it states one), for
the weapon's damage plus the skill's bonus, mitigated once, and you
recover for as long again before you swing or cast. The wind-up shows on
the cast bar, and an interrupt or a move stops it. No double strike or
cleave on an attack skill. Afterwards you swing at its foe, from a fresh
swing.

**Skills interrupt and resume.** Starting a skill loses the swing in
progress. Attacking and casting are otherwise separate, as in GW1
(#317): a spell never starts an attack or changes whom you attack, so
after a spell on B you go back to swinging at A, with B selected. Only
an attack skill, which is a swing, turns your attack on its foe.

**Aftercast.** A skill with an activation time that goes off, unless it
is an attack skill, which has its recovery instead, is followed by 0.75 s in which you neither move,
swing, nor start another cast. A move held through it walks the moment
it ends. A skill with an activation time, or an attack skill, pressed during it
waits and starts the tick it ends (a later press replaces it; a move or Esc drops it); an
instant skill goes off at once. A cancelled or interrupted cast has no
aftercast.

**Ranged weapons fire projectiles** (bows, spears, wands, staves). The
shot is aimed where the target will be if it keeps moving as it has over
the last `trackWindowSeconds` (0.6 s, a least-squares fit of its
positions), and lands there after its flight time. If the target is
still within its body plus `projectileTolerance` (10 units) of that
point, it is hit with the weapon and rank the shot was released with;
otherwise it dodged. So walking steadily in any direction, sideways
included, does not dodge: stopping, turning or reversing after the
release does. Tapping back and forth averages out to standing still and
is hit; strafing in longer swings is a real change of course and dodges
most shots. At 40 units a shot lands too soon to dodge. Blind is rolled at release, so
a blinded shot misses at once and nothing flies. A shot still lands if
its archer dies, and does nothing to a target that died in flight. Line of sight is checked once, at release: with a wall in the way the
shot is "obstructed", nothing flies, and the next swing looks again.
A shot whose flight would cross a wall stops at it and is "obstructed"
too, so stepping behind a pillar dodges it. Shots fly through bodies.
Melee swings are never obstructed.

Not modelled: critical hits, block and evade. Attack-speed changes have
a hook (only the strongest speed-up and slow-down count), but no skill
uses it yet.

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
