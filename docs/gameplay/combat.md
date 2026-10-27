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

| Resource   | How you get it                                                                                                                                                | What it gates     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Energy     | Regenerates by profession, up to 50: see below                                                                                                                | Most skills       |
| Adrenaline | Per skill, in strikes: each landed blow on a foe gives every adrenaline skill one (spells earn none); a foe's damage to you gives 1 unit per 1% of max health | Adrenaline skills |

Regeneration and degeneration count in **pips**, as in GW1. One health
pip is 2 HP/s and one energy pip ⅓ energy/s. Every status's pips sum
(Bleeding −3, Burning −7, Poison −4, Disease −4, Faintheartedness −2, Regeneration +4), and
the net is clamped to ±10 before it applies: burning, bleeding and poison
together (−14) drain 20 HP/s, not 28. Energy is the primary profession's
base pips plus any status's, clamped the same way: Warrior and Paragon 2
(⅔/s), Ranger 3 (1/s), every caster, Assassin and Dervish 4 (1⅓/s). The
build editor shows the base as "energy regen".

Your health and energy bars, and your target's health bar, show the net
as arrows at the bar's right end (#504): one per pip, pointing right for
regeneration and left for degeneration, none at 0 or when dead. The host
sends the clamped net it applies, so the arrows never disagree with what
the bar does.

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

**Overcast** (#461, GW1's exhaustion) is a second cost some
Elementalist spells take: maximum energy, not energy. Chain Lightning
(Air Magic, 10 energy, 5 overcast, 2 s cast, 6 s recharge) strikes its
target and the two foes nearest it for 70 lightning damage at rank 12,
and lowers your maximum energy by 5 each cast. Overcast stacks, is paid
when the cast starts (an interrupted or cancelled cast keeps it), and
recovers 1 every 3 s, alive or dead. It takes no energy unless yours is
now above the lowered maximum, which cuts it down: 30 / 30 and a spell
costing 5 with 10 overcast leaves 20 / 20. Regeneration and energy gains
fill only to the lowered maximum, which can drop below 0. It is not a
condition, nothing removes it, and it lasts through death: a respawn
fills you to the lowered maximum. A Training Ground reset clears it. The
energy bar greys the overcast part at its right end and reads energy /
lowered maximum; the tooltip says "10 energy, 5 overcast".

The split is deliberate. Energy rewards patience; adrenaline rewards
staying in the fight and landing hits.

**Adrenaline is per skill** (#463), as in GW1. A cost is in **strikes**,
as GW1 prints it: Backbreaker 9, Wild Throw 7, "Watch Yourself!" 4. One
strike is 25 units (`ADRENALINE_PER_STRIKE`), and each adrenaline skill on
the bar fills its own pool up to its cost. Every weapon blow that damages
a foe, a swing, a landed arrow or an attack skill's blow, gives one strike
to every adrenaline skill that is not recharging: one per blow, not per
foe, so a cleave across three foes is one strike and a double strike
whose two blows land is two. Blocked, missed or obstructed blows give
nothing, and neither do spells. Taking damage from a foe charges you too
(#827): every hit, blow or spell, gives `floor(100 × damage ÷ max health)`
units, so a hit for a quarter of your health is a strike; degeneration,
sacrifice and a killing blow give nothing. Using an adrenaline skill
empties its own pool and takes one strike from every other, at
activation, so an interrupted one has still paid; an attack skill that
lands then earns its strike back like any blow. Death, respawn and a
reset empty every pool.
Adrenaline does not keep between fights (#828): **25 s out of combat**
(`adrenalineLossSeconds`) and every pool empties at once. A blow or an
attack skill you start, a foe's blow or attack skill at you (even one
for 0 or blocked), damage from a foe, and any adrenaline gained start
the 25 s again; healing, a spell and walking do not. For the last 5 s
(`adrenalineWarningSeconds`) every slot holding some blinks, charged or
not.
Your adrenaline is yours alone: it is sent to you, never in the shared
snapshot, and a slot greys until its own skill is charged.

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

**Some skills read how things stand** (#794), once, as they land and
before any of their effects. Word of Healing heals 98 more (Healing
Prayers 12) for an ally below half of its maximum health, a maximum a
deep wound has lowered; its own heal cannot cancel the bonus. Mystic
Sweep's blow deals 10 more while you are enchanted, in the same number.
**Dwayna's Kiss** (#920) heals another ally 51, and 30 more for each
enchantment and hex on it as the heal lands.

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

Some interrupts are picky (#521). **Power Spike** and **Power Drain** only
interrupt a spell or a chant; against an attack skill, a signet or an idle
foe they are a wasted cast. When they land, Power Spike deals damage and
Power Drain gives you energy.

**Leech Signet** (#920) interrupts anything being cast, as a plain
interrupt does, and gives you 13 energy only if what it cancelled was a
spell. A signet, it costs nothing.

**Savage Shot** (#794) interrupts whatever its arrow finds being cast, and
hits 25 harder if that was a spell: one bigger number on the hit, read
as the arrow lands. A block or a miss does neither.

## Energy denial

A Mesmer can take a foe's energy (#793). **Energy Burn** takes up to 8
energy and deals 9 damage for each point it took; **Energy Tap** takes up
to 6 and gives you 2 energy for each. Only whole points the foe has are
taken, so a foe at 3 energy loses 3, and one at 0 loses nothing and takes
no damage. Maximum energy is untouched, and a foe drained mid-cast keeps
casting: energy is paid when a cast starts. The loss floats over the foe
in blue, "−8 energy", and the Training log has a row for it.

**Energy Surge** (#920) takes up to 8 energy from its target, which
takes 7 damage for each point it lost; every foe nearby it takes 75% of
that, rounded. The foes around it lose no energy themselves, and your
allies are never hit.

## Reactive hexes

Some Mesmer hexes punish what their target does (#469). **Backfire**
deals 119 damage to its target each time it finishes a spell, for 10 s;
**Empathy** deals 39 each time it attacks, for 13 s: a swing, a shot or
an attack skill, hit, miss or block alike, one attack skill counting
once. A flying spell backfires as it leaves the hand. An interrupted or
cancelled spell, a signet or a shout does nothing. The damage ignores
armor and is the Mesmer's: the log names their Backfire or Empathy, it
counts toward their damage, and a kill is theirs, even after they died.
A Mesmer who has left the match hurts nobody.

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

A status can stop it: while **Fleeting Stability** (Dervish) is on you,
a knockdown does nothing, and the first one it stops ends it. On someone
already down it is not spent.

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

**Removal takes the newest first** (#521), as in GW1. A re-application
counts as new. So a cheap enchantment cast last covers an important one
from Shatter Enchantment, and a cheap condition covers a deep wound from
Mend Condition. Some removals do more when they find something to
remove: Shatter Enchantment then deals damage, Drain Enchantment gives
its caster energy and health, and Mend Condition heals the ally.

**A Dervish spends its own enchantments** (#845). Wounding Strike,
Signet of Pious Light and Pious Restoration each make you lose 1 Dervish
enchantment, an enchantment a Dervish skill put on you: your newest one,
never another profession's. With none to lose, the skill still goes off
and costs what it costs; only its "if one was removed" part does not
happen. Wounding Strike loses one only on a hit, and then also Deep
Wounds its target; Signet of Pious Light then recharges 75% faster (5 s,
not 20); Pious Restoration then also removes up to 3 of your hexes.
Mystic Regeneration gives +3 health pips for each enchantment on you,
any profession's and itself included, at most 3, recounted the moment
one goes. Heart of Fury is a stance: you attack 25% faster.

Each condition has a distinct mechanical identity, not just a different
number:

| Condition     | Effect                                            |
| ------------- | ------------------------------------------------- |
| Bleeding      | −3 health/second                                  |
| Burning       | −7 health/second                                  |
| Poison        | −4 health/second                                  |
| Crippled      | Half movement speed                               |
| Blind         | 90% of your attacks miss                          |
| Weakness      | −66% weapon damage, −1 to every attribute above 0 |
| Cracked Armor | −20 armor, never below 60                         |
| Deep Wound    | −20% maximum health (at most 100), −20% healing   |
| Dazed         | Spells: double cast time, interrupted by attacks  |
| Disease       | −4 health/second; spreads to adjacent combatants  |

**Deep Wound takes maximum health, and current health with it** (#764,
GW1). Its loss, 20% of maximum health but never more than 100, comes off
current health too as it lands, though never below 1: a deep wound alone
never kills. That health is not damage (#800): the log names Deep Wound
for it, it counts as taken but not dealt, and nothing that reacts to
damage, such as adrenaline, sees it. Re-applying it while it is up takes
nothing more. While it
lasts, heals from skills are 20% weaker and stop at the reduced maximum;
regeneration and life steal are untouched. When it ends, the maximum
comes back and current health stays where it is. Healing reductions
multiply, but never cut a heal by more than 40%. The health bars grey
the part of the bar it took.

**Dazed doubles a spell's cast time, and attacks interrupt it** (#546,
GW1). Applying Dazed interrupts a spell being cast, even on someone
already dazed; and every attack that lands on a dazed spell-caster, a
swing, an attack skill or an arrow, interrupts the spell before its
damage. A miss, a block or a dodge does not. Only spells: a dazed
Warrior's Healing Signet is neither slowed nor interrupted, and an
instant skill stays instant. See
[ADR-0019](../adr/0019-status-modifiers.md).

**Weakness cuts your weapon and your attributes** (#762, GW1). Your
weapon's roll deals 34%; an attack skill's bonus damage is whole.
Every attribute you put points in counts one rank lower, so your
skills scale one rank lower and Expertise, Fast Casting and the other
primary attributes give less. One you left at 0 stays 0, even when a
rune raised it. A weapon's requirement is checked at each blow: a
Warrior at exactly 9 Swordsmanship swings at a third of the damage
while weakened. Two sources of weakness are one weakness, so it is
never −2. Enfeeble (Necromancer, Curses) weakens one foe for 26 s;
Enfeebling Blood (Necromancer, Curses, 1 energy and 17% of your health)
weakens the target and every nearby foe for 13 s.

**Cracked Armor takes 20 armor, but never below 60** (#763, GW1). It is
taken before any status adds armor, so a cracked caster at 60 loses
nothing and Armor of Earth still lifts them to 84; a Ranger drops from
70 to 60, and a Warrior hit by a sword from 100 to 80, about 41% more
damage. A typed bonus counts as armor it can take: a cracked Ranger has
80 against fire. Armor penetration applies after. Weaken Armor
(Necromancer, Curses, 5 energy, ½ s, 5 s recharge) cracks the target
and every foe adjacent to it for 17 s.

**Disease spreads** (#765, GW1). While you are diseased, every living
combatant adjacent to you catches it, on both teams: a Necromancer who
diseases a foe in a melee ball diseases their own Warrior too. A caught
copy lasts as long as yours has left. Each cast is one outbreak, and it
infects each combatant once: cured or run out, you do not catch the same
outbreak again, however long you stand next to a carrier. A new cast
is a new outbreak. The dead neither carry nor catch it. Rotting Flesh
(Necromancer, Death Magic) diseases a foe for 22 s at rank 12. The
log reads "X catches Disease from Y".

**Blind makes attacks miss**: weapon swings, each blow rolled on its own,
and attack skills (Swift Chop, Sever Artery, Barrage and the rest).
Throw Dirt (Ranger, Expertise) blinds the foe you touch and every foe
adjacent to it for 13 s. Each blow of an attack skill is rolled when it
lands, so a miss still costs energy or adrenaline and starts the
recharge, and the missed foe gets none of the skill's riders. Spells are
unaffected.

**A maintained enchantment lasts until something ends it** (#837, GW1).
While it lasts, its caster has −1 energy pip for it, on top of the other
pips and inside the same ±10 clamp; the bearer pays nothing. The upkeep
is worked out each tick from who bears what, so a strip, a replacement
or a death ends it with the enchantment. Mending (Monk, Healing Prayers,
10 energy, 2 s) is the first: +3 Health regeneration on an ally or
yourself. Recasting it on the same ally is still one, and becomes your
newest. Another Monk's Mending on that ally replaces yours, and your
upkeep ends with it. Its icon has no duration bar, and its hover says
"maintained". It ends by itself in four ways:

- **Can't pay.** At 0 energy, with net energy pips below 0 before the
  clamp, your newest maintained enchantment ends, then the next, until
  the net is 0 or more. Each one logs "Mending on X was lost: Y could not
  pay the upkeep". At 0 energy with a net of exactly 0, nothing ends.
- **Over the cap.** If your net energy pips before the clamp would fall
  below −10, your oldest ones end until they are −10 or better. The
  newest always stays.
- **Death.** Your death ends everything you maintain. Your bearer's
  death ends what is on them, and resurrection does not bring it back.
- **Out of range.** A bearer beyond compass range of you (1,700 units,
  GW1's ~5,000 rescaled by ~0.34) for more than 5 s loses it, with no
  log row (#839). Coming back inside, exactly 1,700 included, starts the
  5 s again. One on yourself never ends this way. It can happen only on
  the large arenas, such as Canyon or Ring.

Your effects monitor shows every enchantment you maintain (#838): those
on yourself among your own effects, those on others after them, ticked
as yours, with no bar and the hover "Mending on X — maintained, −1
energy — double-click to end" (#907). **Double-click** one to end it:
it leaves its bearer at once, for free, with no log row, and your
upkeep stops with it. The target frame's monitor cannot end one, so
its hover leaves the hint out. The host
refuses quietly a request to end anything that is not yours to end.

Degeneration applies **continuously** (`pips × 2 × dt`), not in once-per-
second lumps, so a bleed at 20 Hz drains smoothly instead of
stair-stepping. Regeneration correctly caps at the deep-wound-_reduced_
maximum, not the raw one.

## Skill types

A skill's type is its badge on the slot, in the library and in the
Training Ground, and is named first in its tooltip ("Signet.", "Hex
Spell."). Some types play by rules of their own (#465). Spells,
enchantments, hexes and weapon spells are **spells**; attacks, signets,
shouts, chants, stances and plain skills are not, and every rule that "affects spells" (dazed
and Fast Casting, so far) leaves them alone.

**Elite skills** wear a doubled gold frame wherever a skill is drawn,
and their tooltip says "Elite" before the type (#459). A bar holds at most
one: Barrage, Backbreaker, Broad Head Arrow, Eviscerate and Punishing
Shot, so far. In the build
editor, placing a second elite takes the first one's place on the bar
and says so ("Broad Head Arrow replaced Barrage: only one elite skill per
bar."); the library's Elite toggle lists only elites. A bar with two
elites, from an import or storage, cannot be saved, and a match plays the
house loadout instead.

**Stances** are yours alone, and only one is up at a time. Using a
stance ends the one you are in, the same one included, which restarts
at its full duration. A stance is not an enchantment: enchantment removal
leaves it alone, and stance removal leaves your enchantments. Sprint
(Warrior, 13 s) moves you 25% faster; Dash (Assassin, 3 s) 50% faster.
A stance and crippled multiply, as every movement change does.

Three stances trade something for speed (#919). Frenzy (Warrior, 8 s,
4 s recharge): you attack 33% faster but take double damage. Dark Escape
(Assassin, Shadow Arts, 13 s): you move 25% faster and take half damage,
until one of your attacks hits; a miss or a block keeps it. Natural
Stride (Ranger, Wilderness Survival, 7 s): you run 33% faster and block
half of incoming attacks, until a new hex or enchantment lands on you; a
refreshed one does not end it. Damage taken is multiplied after armor
and before a Rune of Absorption, on every damage packet; health loss,
sacrifice and degeneration are not damage packets and are left alone.

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
starts. Signets, shouts, chants, stances and attacks leave it alone. The 16 is
its rank-12 number; Energy Storage scaling comes with #532. While it is
up, a skill bar slot's tooltip shows each spell at its discounted cost,
and the bar lights the ones it makes affordable (#637, #719).

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

**Chants** reach allies in earshot as shouts do, but have a cast (#758).
A chant is not a spell: dazed does not slow it. Anthem of Flame
(Paragon, Leadership, 5 energy, 1 s cast, 10 s recharge) lasts 10 s on
each ally in earshot, the paragon included: the next attack skill each
uses burns whoever it hits for 3 s. That attack skill uses the chant up
as it is released: as its blow strikes, or as its shot leaves a bow or
a spear (#782). The burn travels with the shot, so a second attack skill
loosed before the first arrow lands carries none, and an Anthem that
runs out while the arrow flies still burns. Only a hit burns, every
victim of Barrage alike. Plain swings leave it alone, and so does an attack skill
interrupted or cancelled before its blow. Several different chants can
be up at once; the same one again keeps the longer.

**Weapon spells** go on an ally's weapon, one at a time: a new one
replaces the old, the same one included (#758). They are spells, so
dazed doubles their cast and a glyph cheapens them, but not
enchantments, so enchantment removal leaves them. Weapon of Warding
(Ritualist, Restoration Magic, 10 energy, 1 s cast, 8 s recharge, an
ally or yourself) gives +4 health regeneration and a 50% chance to block
attacks for 7 s, and ends the moment its bearer attacks: a swing, an
arrow or an attack skill, hit or miss.

## Weapon attacks

Select a foe and attack it (Space; with nothing selected, the nearest foe): your character walks into weapon reach and sight, round walls if it has to, then
swings at the weapon's own interval until the foe dies, you move, or you
cancel (Esc). A foe with no way to them for half a second ends the attack with "can't reach". Reach is checked exactly as a skill's range is, so wherever you
can swing you can also use a melee skill. The first hit lands one full
interval after you arrive. See [ADR-0026](../adr/0026-weapon-auto-attack.md).
The held weapon follows the host's swing timer, which every snapshot carries:
it winds up so its strike ends on the hit, the first swing included, holds
its pose while the swing is paused, and eases back to rest when a swing is
cut short (#560).

Each hit is the weapon's damage range, scaled by your rank in its
attribute (exactly the stated damage at 12) and cut to a third if you do
not meet its requirement, then mitigated by armor like any other weapon
damage. Daggers sometimes strike twice; a scythe also hits up to two foes
adjacent to its target.

**Attack skills ride the weapon** (ADR-0029). An attack skill needs its
weapon: Swift Chop, Eviscerate and Executioner's Strike an axe, Backbreaker a
hammer, Sever Artery a sword, the Assassin's dagger attacks daggers, Barrage, Broad Head
Arrow and Punishing Shot any bow, Distracting Blow any melee weapon.
With the wrong one it is refused ("Needs an axe."), and its slot is
dimmed on the skill bar as if you could not pay for it; the build
editor flags it ("Needs an axe — your weapon is a sword") but still
saves it (#417). Its tooltip names the weapon ("Axe attack") and its
bonus ("+16 damage"). It is one blow of
that weapon: it hits halfway through a swing (or through its own
activation, if it states one), for the weapon's damage plus the skill's
bonus, mitigated once, and you
recover for as long again before you swing or cast. The wind-up shows on
the cast bar and on the held weapon, which cocks back over the whole
activation and strikes as it ends (#562); an interrupt or a move stops
it, and the weapon eases back to rest. No double strike or
cleave on an attack skill. Afterwards you swing at its foe, from a fresh
swing. Distracting Blow deals no damage: a hit only interrupts, and a
miss does nothing. It has no attribute, as in GW1, so any warrior can
use it and its numbers never scale.

**Dagger chains** (#831). Jagged Strike and Black Lotus Strike are lead
attacks; Fox Fangs and Wild Strike are off-hand attacks that must follow
one. A lead attack that hits leaves your lead mark on that foe; an
off-hand attack that hits replaces it with your off-hand mark. An
off-hand attack hits only a foe bearing _your_ lead mark when its blow
lands: otherwise it is out of sequence, so it costs its energy, always
misses ("Fox Fangs misses Warrior (must follow a lead attack)") and
recharges at once. Each foe keeps its own mark from you, and another
Assassin's lead opens nothing for you. Only a chain attack that lands
changes a mark: swings, spells and other attack skills in between leave
it alone, and a lead that misses or is blocked places none. A mark lasts
15 s from the hit that placed it, and goes when either of you dies. The
tooltip says it first: "Lead attack.", "Off-hand attack. Must follow a
lead attack."

**Dual attacks** (#885) must follow your off-hand attack, and strike
twice: each blow rolls its own miss, block and crit, and the skill's
bonus and riders land with each blow that hits, so a condition applied
twice is refreshed. A foe the first blow kills takes no second. A dual
that lands leaves your dual mark. Death Blossom also deals its damage to
every foe adjacent to its target, once a blow; Twisting Fangs bleeds and
deep-wounds; Horns of the Ox knocks down a foe with no ally adjacent.
Moebius Strike, the elite, is an off-hand attack that follows a dual,
and against a foe below half health recharges all your other attack
skills at once, so the chain loops: lead, off-hand, dual, Moebius,
dual, Moebius. The weapon's own double strike never adds to a skill.

Your mark on your target shows right of its health in the target frame
(#916): one dagger for lead, one in the left hand for off-hand, two
crossed for dual, with "lead attack landed" and so on on hover. It
changes as the next chain attack lands and goes when the mark does.
Only you see your marks, and you never see another player's.

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

Not modelled: evade.

**Faintheartedness slows attacks** (#493, GW1). Its hex makes the
target attack 50% slower, swings and attack skills alike: a sword swings
every 1.995 s instead of 1.33 s, and Swift Chop winds up for half of
1.5 × the axe's swing. A swing in progress stretches the moment the hex
lands and shrinks back when it ends; an attack skill keeps the wind-up it
started with. Spells are not slowed. Only the strongest slow-down and the
strongest speed-up count, and they multiply (ADR-0029). The hex also
degenerates its target by 2 pips.

## Damage types and armor

Every hit has one of GW1's damage types (#759). Slashing, piercing and
blunt are **physical**: swords, axes and scythes slash, daggers, bows and spears
pierce, hammers and fists are blunt. Fire, cold, lightning and earth are
**elemental**: Fireball is fire. Chaos, dark, holy, shadow and
**typeless** are neither. The flat damage of a blocked Swift Chop is
typeless.

Armor comes from the primary profession: 80 for a Warrior or Paragon, 70
for a Ranger, Assassin or Dervish, 60 for the casters. On top of that,
some armor applies only against some types:

| Bonus                | Against   | From                   |
| -------------------- | --------- | ---------------------- |
| +20                  | physical  | being a Warrior        |
| +30                  | elemental | being a Ranger         |
| +10                  | physical  | each Stalwart insignia |
| −1 to −3 a hit, flat | physical  | Rune of Absorption     |

So a Warrior has 100 armor against a sword and 80 against a Fireball,
and a Ranger 70 and 100. Damage halves for every 40 armor above 60:
Fireball's 91 lands for about 46 on a Ranger. Types that are neither
physical nor elemental get no typed bonus; base armor still applies.
Armor penetration cuts the whole total, typed bonus included.

Some damage ignores armor altogether (#760): holy, shadow and typeless
skill damage, an attack skill's "+N damage" bonus, degeneration and
life steal. Swift Chop's +16 lands as 16 on a Warrior and on a Monk
alike, on top of its armor-mitigated weapon blow, and its blocked 16
lands as 16. A weapon's own blow always respects armor, a holy or typeless wand
included. Against a 60-armor caster nothing changed: the curve is
exactly 1 there.

A wand or staff deals the element of the attribute you nominate for it
(#761), so a Fire Magic wand hits a Ranger at 100 armor and a
Domination wand at 70:

| Nominated attribute                                        | Damage    |
| ---------------------------------------------------------- | --------- |
| Fire Magic                                                 | fire      |
| Air Magic                                                  | lightning |
| Water Magic                                                | cold      |
| Earth Magic                                                | earth     |
| Healing, Protection, Smiting Prayers, Divine Favor         | holy      |
| Domination, Illusion, Inspiration Magic                    | chaos     |
| Blood Magic, Soul Reaping                                  | dark      |
| Curses, Death Magic                                        | cold      |
| anything else (Energy Storage, Fast Casting, ...), or none | typeless  |

Lightning has an edge: its spells ignore 25% of armor, as in GW1.
**Lightning Orb** (Elementalist, Air Magic, 15 energy, 2 s cast, 5 s
recharge) flies at the target, half as fast again as Fireball, and is
dodged or blocked by a wall as Fireball is. It strikes for 82 lightning at
Air Magic 12, and a Ranger's 100 armor counts as 75 against it: it lands
for 63, where Fireball's 91 lands for 46.

## Primary attributes

Each profession's primary attribute does something of its own, as in
GW1 PvP (#473). Only a primary can hold its rank, and runes count.

- **Fast Casting** (Mesmer). Spells, enchantments, hexes and weapon spells activate in
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
- **Leadership** (Paragon). Each shout or chant gives its user 1 energy
  for every ally it affected, the user included, up to 1 for every 2
  ranks: up to 6 at rank 12.
- **Energy Storage** (Elementalist). +3 maximum energy a rank, +36 at
  rank 12, and more above it. It adds to Rune of Attunement and gear,
  and you start the match full at the new maximum. The build editor's
  max energy counts it.
- **Mysticism** (Dervish). Dervish enchantments cost 4% less energy a
  rank (−48% at 12: Mystic Regeneration 8 instead of 15), rounded once,
  never below 0. While any enchantment is on you, yours or an ally's,
  you have +1 armor a rank against every hit.

The others have no effect yet.

The build editor says under a primary's row what it does at its rank
("Fast Casting 12: spells cast 43% faster"), and a skill tooltip for a
known character shows the cost and activation Expertise, Mysticism and
Fast Casting make of it, the base in brackets: "5 energy (10)",
"1.1s (2s)" (#531). The skill bar shows icons only (#719); a slot's
tooltip shows the energy the skill costs the caster now, Expertise,
Mysticism and an active glyph included (#528, #637, #874), the base in
brackets.

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

What death costs, and how the dead come back, are properties of the
match rules, set per mode as GW1 sets them (#843). Today's match is
GW1's Annihilation (#846): there is no respawn, the dead stay corpses
until resurrected or the match ends, and the **death penalty** is on.
In GW1's Kill Count, which no map picks yet, a dead player **respawns**
at a spawn point of their own team after 8 seconds, at full health and
energy, with all statuses cleared, and there is no death penalty.

With the death penalty on, each player has a **morale** between −60%
and +10%, starting at 0. A death takes 15%, down to −60%, unless it came
less than 5 s after a resurrection. Every death gives each living
member of the other team with negative morale 2% back, up to 0; a
morale boost adds to a whole team, dead or alive, up to +10%. Morale
scales the base maximum health and energy, before equipment: at −15%, a
base of 500 health is 425, plus what runes add. It lasts through a
respawn. Your HUD shows it next to the health bar ("−15%"), and nothing
at 0.

A Monk can bring them back sooner (#812). **Restore Life** is a touch
spell aimed at an ally's corpse: right click the body to target it (the
living under the pointer win, and a foe's corpse is never picked; Tab
skips the dead). After its 4 s cast the ally stands up where they fell,
with 56% health and 80% energy at Healing Prayers 12, no effects and no
adrenaline, and their respawn timer is gone. On a living ally it is
refused ("That ally is alive."). If the corpse is back on its feet by
the time the cast ends, a second resurrection landing first or the
respawn timer running out, it does nothing, and the energy is spent.

## Match end

An Annihilation match (#846, today's match) is won by **wiping the other
team**: the moment every member of it is dead at once, your team wins.
A team whose members have all left the match counts as wiped too, so
quitting a 1v1 forfeits it. Kills still show in the score, but no number of them ends the match.
After **8 minutes** the team with the **highest total morale** wins: the
sum of every member's morale, dead or alive, so a team at 0, −15 and
−30 (−45) beats one at −15, −15 and −30 (−60). The end line reads
"Victory" or "Defeat", with "(morale)" when time decided it.

There is no draw (GW1): equal morale at time, or both teams wiped in
the same tick, and **both teams lose**. A team that started with nobody
on it is never "wiped"; that match runs to time. The wipe is checked
**before** time, so the last foe falling as the clock expires is an
annihilation win.

A Kill Count match ends when a team reaches 15 kills, or after 10
minutes, when the team with more kills wins. Score is checked
**before** time, so landing the winning kill as the clock expires reads
as a score win, which is what happened from the player's point of
view. A tie at the time limit is a **draw**, not an arbitrarily chosen
winner.

## Trying it without a server

```sh
node packages/game-data/dist/run-cli.js duel elementalist.fireball monk.orison-of-healing
```

The headless runner uses the same `game-core` functions the live server
does, and is deterministic from a seed — so a balance result from it is
a result about the real game, and a bug found in it reproduces.
