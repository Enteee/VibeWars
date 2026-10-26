# Combat

How a fight actually works, and why each rule is the way it is.

## The loop

The server advances a fixed **20 Hz** tick (ADR-0003, ADR-0017). Every
tick, for every living player, in the order they joined:

1. movement integrates, then resolves against other players and walls
2. energy regenerates
3. status effects and natural regeneration tick (degeneration, regeneration, expiry)
4. an in-progress cast advances; if it completes, its effects apply
5. a skill pressed out of range walks in, or goes off on arrival
6. the weapon attack walks into reach or swings
7. a training dummy's behaviour acts

Then state is synchronised to clients.

The client renders whatever the server last said. It never decides an
outcome — it sends _intent_ (`move`, `stop`, `target`, `use-skill`) and
the server decides what happens (brief §12, §32).

## Resources

| Resource   | How you get it                                                                             | What it gates     |
| ---------- | ------------------------------------------------------------------------------------------ | ----------------- |
| Energy     | Regenerates by profession, up to 50: see below                                             | Most skills       |
| Adrenaline | +3 each time your attack skill or weapon swing damages an enemy (spells earn none), max 25 | Adrenaline skills |

Regeneration and degeneration count in **pips**, as in GW1. One health
pip is 2 HP/s and one energy pip ⅓ energy/s. Every status's pips sum
(Bleeding −3, Burning −7, Poison −4, Life Drain −2, Regeneration +4), and
the net is clamped to ±10 before it applies: burning, bleeding and poison
together (−14) drain 20 HP/s, not 28. Energy is the primary profession's
base pips plus any status's, clamped the same way: Warrior and Paragon 2
(⅔/s), Ranger 3 (1/s), every caster, Assassin and Dervish 4 (1⅓/s). The
build editor shows the base as "energy regen".

**Natural regeneration** heals anyone wounded who stays out of combat,
as in GW1: after 5 s, +1 health pip, one more every 2 s, up to +7
(14 HP/s) at 17 s. It sums with the statuses' pips before the ±10
clamp. Being in combat is losing health of any kind (a hit, a sacrifice,
degeneration your regeneration does not cancel), swinging a weapon or
using an attack skill, beginning a cast at a foe, or being the foe a cast
begins at, cancelled or not. Any of them puts it straight back to 0.
Healing yourself or an ally does not, and nor does walking towards a
target you mean to attack: only the swing counts. The dead regenerate
nothing, a respawn starts the count again, and training dummies
regenerate like anyone. The numbers are the ruleset's.

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

**Out of range walks in.** When range or line of sight is all that
fails, the press is not refused: your character walks toward the target,
round walls, and the skill goes off the moment it is in range and in
sight, checked all over again, as in GW1. Nothing is paid and no recharge
starts until then, and there is no cast bar on the way. Moving, Esc,
attacking someone else, using another skill, the target dying, or half a
second with no way to them ("can't reach") drops it. A weapon attack
already running pauses for the walk and resumes on its own target after
the cast. A self-target skill never walks.

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

## Knockdown

A knockdown puts its target on the ground for its duration (Backbreaker:
4 s on a hit, nothing on a miss). Lying down you cannot move, attack or
use skills: a cast in progress fails, paid for and recharging, and a
skill queued or walking in, a walk and the auto-attack all end. Clicks,
skills and Space while down are refused, not saved for rising; press
Space again to attack once you are up. A movement key held through the
knockdown walks you off the moment you stand.

You can see it: a knocked-down body is drawn lying flat along its
facing, its weapon dropped beside it, and "Knocked down" floats over it
as it lands. Your own skill bar greys out while you are down, with the
time left draining across it, and lights up the moment you rise.

A knockdown on someone already down does nothing; the instant they
rise, the next one lands. It is not an interrupt, and it is not a status
effect, so nothing that removes conditions or enchantments stands you
up. It counts down before anyone acts, so it lasts its full duration
whoever lands it, and you act again on the tick it ends.

A knocked-down character can't block: Guardian does nothing while you
are down, and an attack skill's if-blocked rider never fires against
you. Blocking works again the moment you stand.

## Conditions, hexes and enchantments

All three are timed status effects sharing one lifecycle, parameterised
by category, alongside two kinds no removal touches:

| Category     | Who applies it | Removed by                  |
| ------------ | -------------- | --------------------------- |
| Condition    | Foes           | Condition removal           |
| Hex          | Foes           | Hex removal                 |
| Enchantment  | Allies/self    | Enchantment removal         |
| Shout        | Allies/self    | Nothing; it runs out        |
| Skill effect | Self           | Nothing; ends with the cast |

**Durations do not stack.** Re-applying a status keeps the longer of the
existing and incoming duration. That single rule is why spamming a short
condition cannot out-last one well-timed long one.

Each condition has a distinct mechanical identity, not just a different
number:

| Condition  | Effect                                           |
| ---------- | ------------------------------------------------ |
| Bleeding   | −3 health/second                                 |
| Burning    | −7 health/second                                 |
| Poison     | −4 health/second                                 |
| Crippled   | Half movement speed                              |
| Blind      | 90% of your attacks miss                         |
| Weakness   | −20 armor                                        |
| Deep Wound | −20% maximum health                              |
| Dazed      | Spells: double cast time, interrupted by attacks |

**Dazed doubles a spell's cast time, and attacks interrupt it** (#546,
GW1). Applying Dazed interrupts a spell being cast, even on someone
already dazed; and every attack that lands on a dazed spell-caster, a
swing, an attack skill or an arrow, interrupts the spell before its
damage. A miss, a block or a dodge does not. Only spells: a dazed
Warrior's Healing Signet is neither slowed nor interrupted, and an
instant skill stays instant. See
[ADR-0019](../adr/0019-status-modifiers.md).

**Blind makes attacks miss**: weapon swings, each blow rolled on its own,
and attack skills (Swift Chop, Backbreaker, Opening Cut, Barrage, Broad
Head Arrow). Each blow of an attack skill is rolled when it
lands, so a miss still costs energy or adrenaline and starts the
recharge, and the missed foe gets none of the skill's riders. Spells are
unaffected.

Degeneration applies **continuously** (`pips × 2 × dt`), not in once-per-
second lumps, so a bleed at 20 Hz drains smoothly instead of
stair-stepping. Regeneration correctly caps at the deep-wound-_reduced_
maximum, not the raw one.

## Skill types

A skill's type is its badge on the slot, in the library and in the
Training Ground, and is named first in its tooltip ("Signet.", "Hex
Spell."). Some types play by rules of their own (#465). Spells,
enchantments and hexes are **spells**; attacks, signets, shouts, stances
and plain skills are not, and every rule that "affects spells" (dazed
and Fast Casting, so far) leaves them alone.

**Stances** are yours alone, and only one is up at a time. Using a
stance ends the one you are in, the same one included, which restarts
at its full duration. A stance is not an enchantment: enchantment removal
leaves it alone, and stance removal leaves your enchantments. Sprint
(Warrior, 13 s) moves you 25% faster; Dash (Assassin, 3 s) 50% faster.
A stance and crippled multiply, as every movement change does.

Wild Throw (Paragon spear attack, 7 adrenaline) deals +17 damage, cannot
be blocked, and ends the stance of the foe it hits. It does not yet
disable your other attack skills for 3 s: that waits for disabled skills
(#469).

**Preparations** change your attacks while they last, and only one is up
at a time, as with stances (#525). Apply Poison (Ranger, 15 energy, 2 s
cast, 24 s) poisons for 13 s every foe your physical attacks hit:
swings, arrows and attack skills, each victim of Barrage. A miss or a
block poisons nobody, nor does a wand's or staff's bolt. An arrow
poisons if the preparation is still up when it lands.

**Glyphs** change your next spells, then are gone, and only one is up at
a time (#526). Glyph of Lesser Energy (Elementalist, 5 energy, 1 s cast,
15 s) makes your next 2 spells cost 16 less energy, never below 0: a
spell you could not otherwise afford goes off. A spell uses its charge
when it starts, so one interrupted or cancelled afterwards has still used
it; one refused, or queued behind an aftercast, uses it only once it
starts. Signets, shouts, stances and attacks leave it alone. The 16 is
its rank-12 number; Energy Storage scaling comes with #532.

**Signets** usually cost nothing, so they work at 0 energy. Healing
Signet (Warrior, Tactics) heals you after a 2 s cast, and for those 2 s
you have −40 armor: the penalty ends with the cast, whether it goes off,
is cancelled, interrupted or knocked out of your hands.

**Shouts** are instant: no cast bar, no target, and nothing to
interrupt. Each ally **in earshot**, 350 units round the shouter and the
shouter included, gets its effect; a dead ally or one just outside does
not. "Watch Yourself!" (Warrior, Tactics, 4 adrenaline) gives +21 armor
for 10 s, and it ends early on each ally after 3 incoming attacks that
hit or are blocked; a miss, a dodge or an obstructed arrow does not
count. Earshot is GW1's ratio of earshot to cast range (about 1,010 to
1,250) applied to the 420-unit spell range.

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
Barrage and Broad Head Arrow any bow, Distracting Blow any melee weapon.
With the wrong one it is refused ("Needs an axe."). It is one blow of
that weapon: it hits halfway through a swing (or through its own
activation, if it states one), for the weapon's damage plus the skill's
bonus, mitigated once, and you
recover for as long again before you swing or cast. The wind-up shows on
the cast bar, and an interrupt or a move stops it. No double strike or
cleave on an attack skill. Afterwards you swing at its foe, from a fresh
swing. Distracting Blow deals no damage: a hit only interrupts, and a
miss does nothing. It has no attribute, as in GW1, so any warrior can
use it and its numbers never scale.

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

**Ranged attack skills fly too** (#416). Broad Head Arrow and Barrage
release their arrows at the hit, led like a swing's, and the skill's
bonus and riders land with the arrow, only if it hits. So an interrupt
lands late: a spell-caster who finishes before Broad Head Arrow arrives
is not interrupted by its Daze, and one who steps aside dodges the Daze
as well. The cost
and recharge are spent at the release, whatever the arrow does. Barrage
picks its foes at the release and sends each its own arrow, with its own
blind roll and its own flight; each arrow that hits earns adrenaline.

**Fireball flies too** (#535). At cast completion it leaves the caster
as a shot led like an arrow's, at 420 units a second (a second's flight
at full spell range; GW1 publishes no spell speeds, so this is ours), and
its damage and its splash land on arrival, centred on where the target
is then. Sidestep it and it is dodged: no damage, no splash, the cost and
recharge spent all the same. A wall along its flight stops it
("obstructed"). Blind does not touch it, it cannot be blocked or crit,
it lands if its caster dies in flight, and does nothing to a target
that died. Interrupted before completion, nothing flies. The Training
Ground's "Dodge the Fireball" drills it.

**Critical hits.** Any weapon blow can crit: a swing, each blow of a
double strike, each cleave victim, an attack skill, a landing shot.
Spells and degeneration never do. The chance is 1% plus 1.37% per rank
in the weapon's mastery (the attribute its requirement names; caster
weapons and fists get only the 1%). A crit skips the damage roll and
hits for the weapon's maximum times √2 (a scythe's times 1.1), after
the attribute and an unmet requirement; an attack skill's bonus is
added unmultiplied. A melee blow at a target that is moving with its
back to you (facing more than 90° away) always crits. A crit floats
larger, with a "!", and the log says "a critical hit".

**Block** (#534). Guardian gives its ally a 50% chance to block attacks;
several block sources combine as 1 − ∏(1 − p), so two 50% sources make
75%. Each blow rolls its own block, after blind (a blinded miss is a
miss, with no block roll) and before the crit and damage rolls: every swing of a
double strike, every arrow of Barrage. A shot rolls it when it lands. A
blocked attack deals no damage, earns no adrenaline and lands none of
its riders, so a blocked Distracting Blow interrupts nothing; an attack
skill's cost and recharge are still spent. "block" floats over the
target. Swift Chop is the exception that proves it: blocked, it still
deals its flat damage and a 20 s Deep Wound. Spells are never blocked,
and shields do not block, as in GW1. Wild Throw cannot be blocked at all.

Not modelled: evade. Attack-speed changes have
a hook (only the strongest speed-up and slow-down count), but no skill
uses it yet.

## Primary attributes

Each profession's primary attribute does something of its own, as in
GW1 PvP (#473). Only a primary can hold its rank, and runes count.

- **Fast Casting** (Mesmer). Spells, enchantments and hexes activate in
  2^(−rank/15) of the time: ×0.574 at rank 12, and still faster above
  it. Every Mesmer spell; another profession's only if its own
  activation is 2 s or more, so a Mesmer/Necromancer casts Malaise in
  1.15 s but Faintheartedness in 1 s as usual. It multiplies with dazed
  (rank 12 and dazed: ×1.149). Aftercast and recharge are unchanged;
  attack skills and other non-spells too.
- **Strength** (Warrior). Attack skills ignore 1% of armor a rank (12%
  at 12), unless the weapon has armor penetration of its own (a
  hornbow's 10%), which stands instead; the two do not add. Plain swings
  get none.
- **Expertise** (Ranger). Attack skills and every Ranger skill cost 4%
  less energy a rank (−48% at 12), rounded once, never below 0.
  Adrenaline costs are untouched.
- **Divine Favor** (Monk). A Monk spell cast on an ally, yourself
  included, heals that ally another floor(3.2 × rank) when it lands: +38
  at rank 12. Once a cast and on the target only, even for a spell that
  also reaches others. An interrupted spell, a dead target or a Monk
  spell at a foe gets nothing.
- **Critical Strikes** (Assassin). +1% critical chance a rank on weapon
  blows, and every crit gives the striker energy: 1 at ranks 1–7, 2 at
  8–12, 3 at 13 and above.
- **Soul Reaping** (Necromancer). When anyone else, ally or foe, dies
  within spirit range (850), you gain energy equal to your rank, up to
  your maximum, at most 3 times in any 15 s. Not while you are dead.
  The gain floats over you, and the Training log names Soul Reaping.
- **Leadership** (Paragon). Each shout gives the shouter 1 energy for
  every ally it affected, the shouter included, up to 1 for every 2
  ranks: up to 6 at rank 12.

The others have no effect yet.

The build editor says under a primary's row what it does at its rank
("Fast Casting 12: spells cast 43% faster"), and a skill tooltip for a
known character shows the cost and activation Expertise and Fast
Casting make of it, the base in brackets: "5 energy (10)",
"1.1s (2s)" (#531). The HUD skill bar shows the energy a skill costs
the caster now, Expertise included (#528), with no base beside it.

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
