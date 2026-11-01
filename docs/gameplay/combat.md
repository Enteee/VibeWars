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
(Bleeding −3, Burning −7, Poison −4, Disease −4, Faintheartedness −2, Regeneration +4,
Healing Breeze +8), and
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
to every adrenaline skill that is not recharging. A swing is one per
blow, not per foe, so a cleave across three foes is one strike and a
double strike whose two blows land is two; an attack skill is one per
foe it lands on, so a Cyclone Axe into three foes is three (#936), but a
scythe's attack skill that cleaves three foes is one, as its swing is
(#977). Blocked, missed or obstructed blows give
nothing, and neither do spells. Taking damage from a foe charges you too
(#827): every hit, blow or spell, gives `floor(100 × damage ÷ max health)`
units, so a hit for a quarter of your health is a strike; degeneration,
sacrifice and a killing blow give nothing. Using an adrenaline skill
empties its own pool and takes one strike from every other, at
activation, so an interrupted one has still paid; an attack skill that
lands then earns its strike back like any blow. A skill that says **"Lose
all adrenaline"** (Hammer Bash, #1097) empties every pool instead, and its
blow earns nothing back, hit or miss. A **disabled** adrenaline skill
loses all its adrenaline and gains none until the disable ends. Death,
respawn and a reset empty every pool.
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
**Infuse Health** (#936, Healing Prayers, 10 energy, ¼ s, no recharge)
costs you half your current health, rounded down, and heals another
ally 129% of what you lost at rank 12, 100% at 0. The loss is a
sacrifice, not damage: nothing caps it, charges adrenaline from it or
answers it, and half of what you have can never kill you. The heal is a
heal like Orison's: Divine Favor adds to it and a deep wound on the ally
cuts it. On an ally at full health you still lose the health.
**Heal Other** (#987, Healing Prayers, 10 energy, ¾ s, 3 s) heals
another ally 151 at rank 12. **Restore Condition** (#987, elite,
Protection Prayers, 5 energy, ¾ s, 2 s) removes every condition from
another ally and then heals it 58 for each one removed: three are 174.
A deep wound among them is gone before the heal, so it does not cut it.
With no condition it heals nothing and still costs its energy.
**Heal Party** (#1013, Healing Prayers, 15 energy, 1 s, 20 s) heals you
and every living team-mate 66, wherever they stand and through walls:
your party is your team, without its creatures: no spirit, minion or
pet. Divine Favor adds to your own heal only, as for every untargeted
Monk spell, and a deep wound cuts the heal of whoever has one.
**Healing Breeze** (Healing Prayers, 10 energy, 1 s, 5 s) gives
an ally +8 Health regeneration for 15 s; it is an enchantment, so
enchantment removal takes it.
**Mending Touch** (#1039, Protection Prayers, 5 energy, ¾ s, 6 s) is a
touch: the ally, or you, must be at hand. It removes the newest two
conditions and heals 51 for each one removed. A deep wound among the
two is gone before the heal; one left as a third cuts it.

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

**Concussion Shot** (#1008, Marksmanship, 25 energy, ½ s, 5 s recharge)
interrupts only a spell: a chant, a signet or an attack goes on, and the
log says "not a spell". When it cuts a spell, its foe is Dazed for 17 s.
The arrow deals only 13. On a foe already Dazed the arrow's own hit
cuts the spell first, and the daze is still refreshed.

Some interrupts also **disable** what they cut short (#914): the skill
cannot be used for a while, on top of its recharge. The two run
together, so the skill waits for whichever is longer, and on your bar
it looks exactly like a recharge. **Power Block** (elite) interrupts a
spell or a chant and disables it for 10 s, along with every skill on
the victim's bar of the same attribute; a skill with no attribute takes
only itself. **Distracting Shot** interrupts whatever its arrow finds,
deals only 13, and disables an interrupted skill for 20 s; the Warrior's
**Disrupting Chop** (6 adrenaline) interrupts and disables the same way, on a plain axe blow. The log says
which skills were disabled, and for how long; a skill already
recharging for longer is not mentioned.

**Diversion** (#949, Domination Magic hex, 10 energy, 3 s, 12 s
recharge) is not a disable but recharge: for 6 s, the next skill its
target uses takes 47 s longer to recharge, and the hex ends. A skill
recharging already waits 47 s more; one that recharges at once waits 47
s. Whatever ends a recharge, as Moebius Strike, ends this too. An
interrupted or cancelled skill is not used, nor is a plain attack, so
Diversion stays on; an attack skill is lengthened once. The log says
which skill, and by how much.

**Arcane Echo** (#1126, no attribute, 15 energy, 2 s, 20 s recharge)
and **Echo** (elite, 5 energy, 1 s, 10 s recharge) are
self-enchantments that change your bar. While Arcane Echo is up (20 s),
the next spell you finish takes its slot for 20 s; any other skill ends
it with no copy. While Echo is up (30 s), the next skill you finish,
of any kind, does the same. The copy is a skill of its own: it recharges
apart from the original, so both can be used, and a disable or Diversion
on one leaves the other alone. When its 20 s are over, the echo is back
in its slot and starts its own recharge. An interrupted skill was never
finished, so it is not copied and the echo stays. An echo is never
copied, and does not use up the other. Death or a reset ends every copy
at once.

**Cry of Frustration** (#938, Domination Magic, 10 energy, ¼ s, 20 s
recharge) only works on a foe using a skill, any skill. Then that foe is
interrupted and takes 63 damage, and every foe in the area around it is
interrupted too, if it is casting, and takes 75% of that, 47. On a foe
using no skill it does nothing, to anyone: the energy is spent and it
recharges all the same.

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

Illusion Magic (#1228) has seven staples, each at its rank-12 duration
and pips. **Conjure Phantasm**: −5 Health degeneration for 15 s.
**Imagined Burden**: the foe moves 50% slower for 18 s, a hex rather
than Crippled, so condition removal does not touch it. **Phantom Pain**
and **Shrinking Armor**: −3 degeneration for 10 s, then Deep Wound or
Cracked Armor for 17 s when the hex ends, however it ends: a Remove Hex
sets it off too. **Illusion of Haste** (PvP): you move 33% faster for
10 s, and are Crippled for 3 s when it ends, a strip included.
**Ineptitude** (elite) hexes its target and every foe adjacent to it
for 4 s; the next time each of them attacks, it takes 30…114…135
damage by the Mesmer's Illusion Magic, ignoring armor, and is Blinded
for 10 s, and that foe's hex ends. A spell does not set it off.
**Crippling Anguish** (elite, PvP): 50% slower and −5 degeneration for
17 s.

Eight Mesmer skills punish a foe for using skills (#1473), at rank-12
durations; damage is the Mesmer's rank and ignores armor. **Wastrel's
Worry** (PvP): after 3 s the foe takes 84 and adjacent foes 63, but only
if it runs out: a skill the foe uses first, or a strip, ends it for
nothing. **Overload**: −3 degeneration for 5 s, and 63 to the foe and 47
to adjacent foes if it is using any skill as the hex lands, an attack
skill too, a plain swing not. **Frustration** (PvP): spells cast 50%
slower for 17 s, and 41 damage each time the foe is interrupted, by an
interrupt skill, Dazed or a hit alike. **Price of Pride**: for 5 s, the
foe's next elite skill costs it 13 more energy, then the hex ends.
**Signet of Humility**: the foe's elite skill is disabled for 13 s,
nothing if it has none, and your own non-Mesmer skills for 4 s either
way. **Migraine** (elite, PvP): −7 degeneration for 14 s, and every skill
but an attack skill takes twice as long to activate, multiplied with
Dazed, so a 2 s spell takes 8 s. **Visions of Regret** (elite, PvP)
hexes the foe and those adjacent for 10 s: each skill one of them uses
costs it 26, and 33 more if it has no other Mesmer hex. **Unnatural
Signet** (PvP): 50 to the foe, 50 to adjacent foes if it is hexed or
enchanted, and your non-Mesmer skills but signets are disabled for 10 s.
The Elementalist's **Mind Blast** (elite, Fire Magic) deals 51 fire
damage and gives 7 energy back if you have more energy than the foe.

Two Necromancer skills answer a status changing (#887). **Contagion**
(elite enchantment on yourself, 60 s): each time you gain a condition
you did not already have, every living foe within the area of you gets
the same condition, for as long as it was put on you, and you sacrifice
6% of your maximum health, foes in reach or not. A condition you
already had, refreshed or not, does nothing. **Parasitic Bond** (hex,
20 s) gives its target −1 health degeneration and heals its caster for
102 when it ends: when it runs out, when it is removed, or when its
target dies. Re-casting it on a target that still has it heals nothing,
and neither does a caster who has died or left.
What a trigger does never sets off another trigger: a condition
Contagion hands to a foe with Contagion goes no further.

**Ending is not expiring** (#944). Parasitic Bond answers any end;
**Patient Spirit** (Monk, Healing Prayers, 5 energy, ¼ s, 4 s recharge)
answers only its 2 s running out, GW1's "unless it ends prematurely":
then its ally is healed for 102. Stripped, or gone with a death, it
heals nothing. Recasting it before it runs out starts the 2 s again,
and it heals once, at the end. **Holy Veil** (Monk, no attribute,
5 energy, 1 s, maintained) makes every hex cast on its ally take twice
as long, read as the cast begins: a Holy Veil landing mid-cast slows
nothing already being cast, and a dazed caster takes four times as
long. Spells that are not hexes, and hexes cast on anyone else, are
not slowed. However it ends, ended by you, stripped, out of range, out
of energy or by a death, it takes the newest hex off its ally. A hex it
removes does not fire its own end: a Parasitic Bond taken this way
heals nobody.

**Vigorous Spirit** (#1039, Monk, Healing Prayers, 5 energy, ¼ s, 4 s)
heals its ally 17 (5 at Healing Prayers 0) for 30 s each time it attacks or casts a spell: each
swing, each shot, each attack skill and each completed spell. A signet,
a shout, a stance, a chant, or a spell interrupted or cancelled heals
nothing, and cast on yourself its own cast does not count. The Monk who
cast it is the healer: a deep wound cuts it, and Divine Favor, which
adds once as a spell lands, does not add to each heal.

**Shadow Refuge** (#988; Assassin, Shadow Arts, 5 energy, 1 s, 8 s
recharge) gives you +9 health regeneration for 6 s. When it ends, for any
reason, a strip included, you gain 88 Health if you are attacking right
then: a swing in progress or an attack skill being used. Standing idle,
casting a spell or dead, it gives nothing.

**Rend Enchantments** (Necromancer, Curses, 5 energy, 2 s, 20 s
recharge) removes up to 8 enchantments from a foe, the newest first,
and you lose 31 health for each Monk enchantment among them. That loss
is a sacrifice, not damage: no armor, and it can
kill you, after the removal. Each enchantment it strips still fires its
own end, so a stripped Holy Veil takes a hex with it.

**Plague Touch** (Necromancer, Curses, 5 energy, ¾ s, no recharge) moves
your newest 3 conditions onto the foe you touch, each with the time it
had left, as if you had put it on: the longer of yours and one already
on the foe stays, and the foe's runes shorten it as any condition. It is
a skill, not a spell, so Dazed does not slow it. With no condition on
you it does nothing, and the energy is spent.

Three Necromancer curses answer what their target does (#935).
**Spiteful Spirit** (elite hex, 22 s) deals 39 shadow damage to its
target and each of its allies adjacent to it whenever the target uses a
skill and whenever it attacks. A spell, a signet or a shout fires it
once, an auto-attack swing or shot once, and an attack skill twice: once
for the use and once for the attack. It fires after the skill has
landed. **Insidious Parasite** (hex, 13 s): each blow its target lands
steals 39 health for the caster, so a double strike steals twice, and a
miss or a block steals nothing. **Mark of Pain** (hex, 30 s): each time
its target loses health to physical damage, every ally of the target
adjacent to it takes 34 shadow damage; the target itself does not. A
block, a blow armor takes to 0, fire or lightning, and degeneration do
nothing, and two marked targets side by side never set each other off.
The blow that kills the target still splashes, from where it fell.

Six more Curses hexes, at their rank-12 numbers (#1332). **Barbs** (30 s):
each physical hit on the target deals 14 more; a spell's damage gets
nothing. **Price of Failure** (30 s): the target misses 25% of its
attacks, and each blow of its that fails to hit, missed or blocked,
costs it 37 typeless damage from the caster. A blow whose target died or
dodged is not a fail. On a Blinded foe the miss chance stays blind's,
and only the damage is new. **Suffering** (25 s) puts −2 health
degeneration on the target and every foe of yours near it, each its own
hex. **Lingering Curse** (elite, 25 s) does the same with −3 and 25%
less healing. **Defile Flesh** (29 s): the target gets two thirds of every
heal; with Lingering Curse too, the healing floor of 60% holds.
**Rigor Mortis** (18 s): the target cannot block at all, from any
attacker, whatever stance it is in.

Four skills punish hex and enchantment spam and block stances (#1403).
**Soul Barbs** (hex, 30 s): each hex or enchantment that lands on the
target, from friend or foe, deals it 27 typeless damage from the
Necromancer. A renewal counts; a recast the running one outlasts does
not, and Soul Barbs' own landing does nothing. **Scourge Enchantment**
(Smiting hex, 30 s): each enchantment that lands on the target costs
whoever cast it 63 holy damage, the target itself if it enchanted
itself. **Defile Defenses** (hex, 17 s): the next time the target blocks
any attack, by any stance or enchantment, it takes 102 typeless damage,
and the hex ends. **Hex Breaker** (Domination stance, 65 s): the next
hex cast on you fails, its caster takes 39 typeless damage, and the
stance ends. Only the hex fails: the spell's damage still lands, and an
area hex still hexes everyone else. A hex that fails sets off no Soul
Barbs.

**Life steal** (Vampiric Gaze steals 52 at Blood Magic 12, Insidious
Parasite 39) is not damage. The target loses up to that much, never more
than it has, and the caster gains exactly what was taken, up to its
maximum health. Armor does not apply, healing modifiers do not touch the
gain, it charges no adrenaline, and Mark of Pain does not see it. It can
kill. A dead caster steals nothing. Vengeful Weapon and Weapon of Remedy
steal for their bearer, not their Ritualist, and only once.

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

**Aftershock** (Elementalist, Earth Magic, 10 energy, ¾ s, 10 s recharge)
strikes every foe nearby you for 85 earth, and a foe that is knocked down
for 56 more (#985). "Down" is read as it lands, after that tick's
countdown: a foe who stands up on that tick gets no bonus. Shock, then
Aftershock, is the Elementalist's knockdown combo.

**Water Trident** knocks down each foe it hits that is moving, and
**Stoning** a foe suffering from Weakness (#997). Both are read as the
projectile lands.

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
**Smite Hex** (#987, Smiting Prayers, 5 energy, 1 s, 12 s) removes one
hex from any ally, yourself included; if it removed one, every foe in
the area of that ally takes 70 holy damage, through armor. Allies are
never hit. With no hex nothing happens, and the energy and recharge are
spent.
**Remove Hex** (Monk, no attribute, 5 energy, 1 s, 8 s) removes an
ally's newest hex. **Dismiss Condition** (#1013, Protection Prayers, 5
energy, ¾ s, 3 s) removes an ally's newest condition, and heals 63 if
the ally is enchanted as it lands, whether or not a condition was
there to remove.
spent. **Cure Hex** (#1039, Healing Prayers, 5 energy, 1 s, 12 s)
removes one hex from any ally and, if it removed one, heals that ally 86.
**Smite Condition** (#1039, Smiting Prayers, 5 energy, 1 s, 7 s) is
Smite Hex for a condition: if it removed one, every foe in the area of
the ally takes 50 holy damage.

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

**The scythe enchantments** (#939). While **Vow of Strength** (elite,
15 s) is on you, every attack you make with a scythe, swing or attack
skill, hit, miss or block, deals 22 slashing to every foe adjacent to
you, your target included. **Sand Shards** (30 s) splashes 50 earth on
every other foe adjacent to the foe you hit, for each of your next 4
scythe hits; a cleave that hits 3 foes spends 3, and the 4th ends it.
Neither does anything with another weapon, and a hit with another
weapon spends nothing. A splash is not a blow: no block, no crit, no
adrenaline. **Pious Haste** is a stance: lose 1 Dervish enchantment and
move 25% faster for 6 s, or 50% faster if one was lost, which is capped
at +33% as every speed-up is (ADR-0019). **Victorious Sweep** (+21, any
melee weapon) gains you 70 health if, after the blow, its target has
less health than you, counted in points, not as a share; with a scythe
it cleaves, so that is 70 for each foe struck that has less.
**Zealous Sweep** (+17, scythe, 5 energy, 10 s) gains you 3 energy and
1 strike of adrenaline for each foe it hits, so a cleave into 3 foes
gives 9 energy and, with the blow's own, 4 strikes. **Mystic Twister**
(Wind Prayers) is an adrenaline **spell**, 5 strikes, ½ s, 4 s: 50 cold
to every foe nearby, or 100 if you are enchanted as it lands, in one
packet. Like any spell it earns its caster no strike.

**The earth enchantments and Eremite's Attack** (#1021). Staggering
Force, Dust Cloak and Aura of Thorns are flash enchantments (no
activation, so no interrupt), 10 energy, 30 s. As each lands, every foe
nearby you takes 34 earth (Staggering Force, 6 s recharge; Dust Cloak,
10 s) or starts Bleeding for 13 s (Aura of Thorns, 10 s). While
Staggering Force or Dust Cloak is up, **your attacks deal earth
damage**, the weapon's roll included. When one **ends**, every foe
nearby you where they stand then has Cracked Armor for 8 s (Staggering
Force), is Blinded for 3 s (Dust Cloak) or Crippled for 7 s (Aura of
Thorns). Any end counts: running out, a strip by your own skill or a
foe's, your death. A recast while it is up is no end: it strikes or
bleeds again and keeps one 30 s enchantment. **Eremite's Attack**
(scythe, 5 energy, 6 s) hits for +8, and, if you have a Dervish
enchantment as it hits, +8 more and it strikes **every** foe adjacent to
its target, not just 2. Then you lose your newest Dervish enchantment,
once, however many it struck, and only if it hit. So Staggering Force,
then Eremite's Attack, hits a clump for earth and cracks all their
armor as the enchantment goes. If Sand Shards is your only Dervish
enchantment and its 4th hit ends it mid-cleave, the foes after it get
no second +8.

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
Ebon Hawk (Elementalist, Earth Magic) weakens its foe for 13 s, and
Stoning knocks a weakened foe down: either Necromancer skill, or the
hawk, sets the stone up (#997).

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
enchantments, hexes, weapon spells, ward spells and well spells are **spells**; attacks, signets,
shouts, chants, stances, rituals and plain skills are not, and every rule that "affects spells" (dazed
and Fast Casting, so far) leaves them alone, except that Fast Casting speeds up signets
too (#1100). Rituals, nature and binding,
plant spirits (see Creatures); ward spells leave wards and well spells
wells (see Wards and wells).

**Elite skills** wear a doubled gold frame wherever a skill is drawn,
and their tooltip says "Elite" before the type (#459). A bar holds at most
one: Barrage, Backbreaker, Broad Head Arrow, Eviscerate and Punishing
Shot, so far. In the build
editor, placing a second elite takes the first one's place on the bar
and says so ("Broad Head Arrow replaced Barrage: only one elite skill per
bar."); the library's Elite toggle lists only elites. A bar with two
elites, from an import or storage, cannot be saved, and a match plays a
starter build instead (#852). On the main menu such a character is
striped red and tagged Invalid, and cannot be chosen until it is fixed
(#1290). An empty bar is a legal build: it plays as itself, auto-attack
only.

**Stances** are yours alone, and only one is up at a time. Using a
stance ends the one you are in, the same one included, which restarts
at its full duration. A stance is not an enchantment: enchantment removal
leaves it alone, and stance removal leaves your enchantments. Sprint
(Warrior, 13 s) moves you 25% faster; Dash (Assassin, 3 s) 50% faster.
A stance and crippled multiply, as every movement change does.

Three stances trade something for speed (#919). Frenzy (Warrior, 8 s,
4 s recharge): you attack 33% faster but take 160% damage (the PvP
version). Dark Escape (Assassin, Shadow Arts, 13 s): you move 25%
faster and take half damage, until one of your attacks hits; a miss
or a block keeps it. Natural Stride (Ranger, Wilderness Survival, 7 s):
you run 33% faster and block half of incoming attacks, until a new hex
or enchantment lands on you; a refreshed one does not end it. Damage
taken is multiplied after armor and before a Rune of Absorption, on
every damage packet; health loss, sacrifice and degeneration are not
damage packets and are left alone.

Two Ranger stances block (#976). Lightning Reflexes (Expertise, 10
energy, 45 s recharge, 10 s): a 75% chance to block melee and projectile
attacks, and you attack 33% faster, swings and attack skills alike.
Escape (Expertise elite, 5 energy, 12 s recharge, 7 s): you move 33%
faster and block 75% of attacks, until you make a melee attack, hit, miss
or block. A shot from a bow, an arrow attack skill or a thrown spear
keeps it. Pin Down and Hunter's Shot are bow attacks: Pin Down cripples
for 13 s, and Hunter's Shot (1 s to use) bleeds for 21 s, when the arrow
hits; a block or a blind miss lands neither.
Crippling Shot (Marksmanship elite, 10 energy, 2 s recharge, #1008)
cannot be blocked and cripples for 10 s. Debilitating Shot (10 energy,
10 s) drains 8 energy. Burning Arrow (elite, 10 energy, 5 s) hits 26
harder and burns for 6 s. Each lands its rider only when the arrow hits.

Five Warrior Tactics stances (#1329). Three answer their own blocks: only
the stance whose share of the block roll it fell in answers, never a
second blocking status beside it. Bonetti's Defense (8 adrenaline, 10 s)
blocks 75% of attacks and gives you 5 energy for each melee attack it
blocks; it ends when you use another skill. Deflect Arrows (5
adrenaline, 12 s recharge, 5 s) blocks 75%, and each projectile it
blocks Bleeds the foes adjacent to you for 13 s. Gladiator's Defense
(elite, 5 energy, 20 s recharge, 10 s) blocks 75%, and each melee attack
it blocks deals its attacker 29 damage. Disciplined Stance (5 energy,
15 s recharge, 3 s) is +10 armor and a 75% block, until you use an adrenal
skill; a signet or a spell keeps it. Balanced Stance (5 energy, 30 s
recharge, 18 s): you cannot be knocked down, and stopping one does not
end it; a critical hit on you deals a normal roll, though it still
counts as a critical for the attacker.

**Flash enchantments** (Dervish, #1421) are instant enchantments on
yourself, and their tooltip says "Flash Enchantment Spell.". Using one
keeps your swing: a blow under way lands when it would have, where any
other skill starts the swing over. A walk keeps walking. It disables your
other flash enchantments for 1 s (a skill already recharging for longer
keeps its time); every other skill is free. Nine so far: Aura of Thorns,
Dust Cloak, Staggering Force, Sand Shards and Fleeting Stability (Earth
Prayers); Heart of Holy Flame (25 holy damage to nearby foes, holy
attacks for 30 s, nearby foes burn 4 s when it ends) and Balthazar's
Rage (nearby foes burn 3 s; when it ends after 20 s, 2 strikes of
adrenaline if a foe is in earshot), both Mysticism; Harrier's Haste
(Wind Prayers, 7 s: 25% faster, and 10 more damage on each hit against
a moving foe); and Enchanted Haste (no attribute, 7 s: 25% faster; if it
ends before its time, stripped for one, you lose a condition). Attacker's
Insight waits for a block that holds only while you attack.

**Forms** (Dervish elites, #1437) are a status of their own on you, not
an enchantment: no removal touches one, nothing that counts enchantments
counts it, and a new form ends the one you are in. A form skill says
"Elite Form." and is disabled for 45 s after use, beside its 20 s
recharge. When a form ends, for any reason, your attack, your walk and
the skill you are activating stop, the skill paid for and not
recharging; held movement keys walk again only once you change them.
Avatar of Melandru (74 s): +100 maximum Health, lost again when it
ends; +30 armor against elemental damage; earth attacks; whenever you
lose a Dervish enchantment, 2 conditions go. Avatar of Dwayna (74 s):
holy attacks; each Dervish attack skill you use takes off a hex;
whenever you lose a Dervish enchantment, you heal 41. "Lose" is any end
but your death: expiry, a strip, a flash enchantment's own end.

The other three Avatars (#1455) last 74 s too. Avatar of Balthazar: +20
armor against physical damage, adrenaline 25% faster from every source
(hits, damage taken, skills), holy attacks; whenever you lose a Dervish
enchantment, foes nearby burn for 3 s. Avatar of Grenth: you are immune
to Disease, so one on you ends as it begins, none lands and none spreads
to you; with a scythe, your attacks deal dark damage and each hit steals
10 Health; whenever you lose a Dervish enchantment, adjacent foes get
Disease for 3 s. Avatar of Lyssa: chaos attacks (no armor rule of its
own); your Dervish enchantments recharge 50% faster, flash ones too, and
with Mantra of Recovery the larger share counts, not both; whenever you
lose a Dervish enchantment, you steal 1 energy from each foe nearby, and
a foe with none gives nothing.

**Mantra of Recovery** (Mesmer elite stance, Fast Casting, 5 energy, 15 s
recharge, #938) makes every spell you finish in the next 17 s recharge
33% faster. It is read as the recharge starts: a spell finished after the
Mantra ends gets nothing, and one already recharging keeps its shorter
time. A signet, an attack or a stance is not a spell. Recharge
reductions multiply, as GW1's do, but never take off more than half,
and never take a recharge below 1 s (#975): Mantra of Recovery with
Weapon of Quickening is 50%, not 55%, and a spell whose recharge is
already under 1 s keeps it.

**Your skills of a kind** (#1761): some statuses change how your own
skills of one type, attribute or profession go. Divine Spirit (Monk
spells cost 5 less, never below 1), Blessed Aura (Monk enchantments last
30% longer), Healer's Covenant (Healing Prayers spells cost 3 less and
heal 20% less, the Divine Favor bonus too), Holy Haste (Healing Prayers
spells cast 50% faster, until you cast an enchantment), Practiced Stance
(preparations recharge 50% faster and last 246% longer) and Extend
Enchantments (the next Dervish enchantment lasts 122% longer). Discounts
add, multipliers multiply, and the largest recharge share counts. What a
use gets is taken as it is paid for: a status it puts on keeps its
longer time after the modifier ends, a spell or arrow lands with what
it left with, a status the skill puts on you lengthens too, and a
maintained enchantment has no time to lengthen.

Wild Throw (Paragon spear attack, 7 adrenaline) deals +17 damage, cannot
be blocked, and ends the stance of the foe it hits. It does not yet
disable your other attack skills for 3 s: that waits for disabled skills
(#469). Cruel Spear (Paragon elite spear attack, 6 adrenaline) deals
+42 damage, and a Deep Wound for 17 s if its target is not moving as the
spear lands (#921).

Five more Paragon spear attacks (#1030) build the bleed → cripple →
Deep Wound line. Barbed Spear (2 adrenaline) bleeds its foe for 17 s.
Maiming Spear (5 energy, 5 s) cripples a foe already Bleeding for 17 s,
so Barbed Spear then Maiming Spear cripples, and one Barbed Spear alone
does not. Merciless Spear (6 adrenaline) gives a Deep Wound for 17 s to
a foe below 50% Health, counting the spear's own damage: a foe at 55%
it drops to 45% is wounded. Stunning Strike (elite, 8 adrenaline) deals
+42, and Dazes for 9 s a foe suffering from any condition after it
lands; a hex alone is not enough. Harrier's Toss (10 energy, 1 s, 10 s)
deals +17, and 33 more on a foe that is moving, in one packet.

**Moving** means walking during the previous tick: a held direction, a
clicked point, an approach to attack or cast. Knocked down, in
aftercast, dead or walking into a wall is not moving. Everyone's is read
at the end of a tick, so it is one tick late and never depends on who
acts first.
Water Trident (#997) reads it the other way round: it knocks down a
foe that _is_ moving as it lands.

Spear of Lightning (Paragon spear attack, 5 energy, 6 s) deals +18, and
the whole blow is lightning, the spear's damage too: armor against
elemental damage meets it, armor against physical damage does not. It
has 25% armor penetration. Penetration from the skill and from Strength
does not add: the blow takes the larger (#923).

**Preparations** change your attacks while they last, and only one is up
at a time, as with stances (#525). Apply Poison (Ranger, 15 energy, 2 s
cast, 24 s) poisons for 13 s every foe your physical attacks hit:
swings, arrows and attack skills, each victim of one with an area. A
miss or a block poisons nobody, nor does a wand's or staff's bolt. An
arrow poisons if the preparation is still up when it lands. Kindle
Arrows and Ignite Arrows (#1629) ride a bow's blows only, a sword's get
nothing: Kindle turns the arrow's damage to fire and adds 20 fire,
Ignite deals 15 fire to the struck foe and each foe adjacent to it.
Barrage and Volley remove all your preparations as they are released,
so none of their arrows carries one.

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

The other glyphs (#1730; Elementalist, no attribute, 5 energy, 1 s cast)
last 15 s and change only your next spell. A new glyph replaces the one
up. Glyph of Concentration (10 s recharge): it cannot be interrupted.
Glyph of Renewal (10 s): it recharges instantly. Glyph of Sacrifice
(15 s): it casts instantly, then takes 30 s longer to recharge; using a
skill that is not a spell first ends the glyph unused. Glyph of Essence
(20 s): it casts instantly, and you lose all your energy as it is cast.

**Signets** usually cost nothing, so they work at 0 energy. Healing
Signet (Warrior, Tactics) heals you after a 2 s cast, and for those 2 s
you have −40 armor: the penalty ends with the cast, whether it goes off,
is cancelled, interrupted or knocked out of your hands.

"For Great Justice!" (Warrior, no attribute, 5 energy, 45 s recharge;
the PvP version) is a shout on yourself alone: for 8 s each hit you land
earns one more strike of adrenaline, so a Cyclone Axe into three foes
earns six (#936). A blocked or missed blow still earns nothing, and the
adrenaline you gain from being hit is unchanged.

**Shouts** are instant: no cast bar, no target, and nothing to
interrupt. Each ally **in earshot**, 350 units round the shouter and the
shouter included, gets its effect; a dead ally or one just outside does
not. "Watch Yourself!" (Warrior, Tactics, 4 adrenaline) gives +21 armor
for 10 s, and it ends early on each ally after 3 incoming attacks that
hit or are blocked; a miss, a dodge or an obstructed arrow does not
count. Earshot is GW1's ratio of earshot to cast range (about 1,010 to
1,250) applied to the 420-unit spell range. A party skill such as Heal
Party is not a shout: it reaches the whole team, however far.
"Never Surrender!" (Paragon, Command, 5 energy, 20 s) gives +4 Health
regeneration for 10 s to each ally in earshot below 75% Health as it
lands; one at exactly 75% or above gets nothing, and one healed above it
afterwards keeps it (#923).

Leader's Comfort (Paragon, Leadership, 5 energy, 2 s cast, 8 s) heals
you 66, plus 18 for each living ally in earshot, you included, at most
140 in all: 84 alone, 140 with four others. It is a skill, not a shout,
so Leadership gives no energy for it. A Deep Wound cuts the capped heal
by its 20%.

The Paragon's Command shouts (#921): "Fall Back!" (10 energy, 25 s
recharge) gives 9 s of 33% faster movement and 13 Health per second
while moving, a heal Deep Wound cuts; it ends on an ally when that ally
hits with an attack, but not on a miss or a block. "Stand Your Ground!"
(15 energy, 30 s recharge) gives 17 s of +24 armor while not moving,
and ends on an ally as soon as that ally attacks. Leadership pays for
both, as for every shout. "Incoming!" (elite, 10 energy, 25 s recharge)
is "Fall Back!" that a hit does not end (#956). "Make Haste!" (5 energy,
10 s recharge) gives one other ally 17 s of 33% faster movement, and
ends as "Fall Back!" does, when that ally hits.

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
be up at once; the same one again keeps the longer. Defensive Anthem
(elite, Leadership, 15 energy, 2 s cast, 25 s recharge) gives each ally
in earshot a 50% chance to block attacks for 9 s (#956). It ends on an
ally when one of that ally's attack skills hits, melee or thrown. A
plain swing or arrow does not end it, and neither does an attack skill
that misses or is blocked. Its block combines with any other as
1 − ∏(1 − p): with Weapon of Warding it is 75%. Song of Restoration
(elite, Motivation, 10 energy, 1 s cast, 20 s recharge) lasts 10 s on
each ally in earshot, the paragon included (#999). The next skill each
uses heals them 97 (45 at Motivation 0), after that skill's own effects,
and the song ends on them. Any skill completed counts, an attack skill
once; a plain swing, or a skill interrupted or cancelled, does not. It
is a heal, so Deep Wound cuts it. If it runs out, is removed or its
bearer dies, nobody is healed. The paragon's own chant does not use up
the song it just put on itself: its next skill does. In general, a
status a skill puts on its own user never answers that same use.

**Weapon spells** go on an ally's weapon, one at a time: a new one
replaces the old, the same one included (#758). They are spells, so
dazed doubles their cast and a glyph cheapens them, but not
enchantments, so enchantment removal leaves them. Weapon of Warding
(Ritualist, Restoration Magic, 10 energy, 1 s cast, 8 s recharge, an
ally or yourself) gives +4 health regeneration and a 50% chance to block
attacks for 7 s, and ends the moment its bearer attacks: a swing, an
arrow or an attack skill, hit or miss.

Three more Ritualist weapon spells (#975), and each replaces Weapon of
Warding or any other weapon spell, and is replaced by it, alike.
**Spirit Light Weapon** (elite, Restoration Magic, 5 energy, 1 s, 5 s
recharge, an ally or yourself) heals 21 Health a second for 10 s. It is
a heal, not regeneration: Deep Wound cuts it, and it is not held to the
±10 pips. **Weapon of Quickening** (elite, Communing, 5 energy, 1 s, 5 s
recharge, an ally or yourself) makes every spell its bearer finishes in
the next 21 s recharge 33% faster, Weapon of Quickening itself included
when you cast it on yourself. **Weapon of Aggression** (Channeling
Magic, 10 energy, ¼ s, 10 s recharge, yourself only) makes you attack
25% faster for 13 s; attacking does not end it, and as with every
speed-up only the strongest counts, so under Frenzy it adds nothing.
Spirit Light Weapon heals 21 more a second while its bearer is in
earshot of a spirit, any team's, and Weapon of Quickening shortens the
recharge of binding rituals as of spells (#1064).

Three more (#1022), which still replace any other weapon spell. Each
lasts on an ally or yourself. **Vengeful Weapon** (Restoration Magic, 5
energy, ¼ s, 3 s recharge) lasts 8 s: the next time its bearer loses
health to damage or life steal from a foe, a blow, an arrow or a spell,
the bearer steals 51 from that foe, and it ends. **Weapon of Remedy**
(elite, 3 energy, ¼ s, 3 s recharge) is the same with a 68 steal, and
the bearer also loses its 2 newest conditions. Degeneration, sacrifice,
a block, a blow armor takes to 0 and a hit Reversal of Fortune reverses
do not set either off. Neither does damage a trigger deals, so Mark of
Pain's splash leaves them up, and two Vengeful Weapons never echo. Two
foes in one tick: it answers the first. The blow that kills the bearer
steals nothing. **Splinter Weapon** (Channeling Magic, 5 energy, 1 s, 8 s
recharge) lasts 20 s or 4 hits with any weapon: each hit deals 25
armor-ignoring damage to every other foe adjacent to the foe hit. A miss
or a block spends nothing. A weapon spell rides every attack, a wand's
or a staff's bolt too (#1654); a preparation rides physical attacks only.

The Ritualist heals with Restoration Magic, each on an ally or yourself
(#955). **Mend Body and Soul** (5 energy, ¾ s, 3 s recharge) heals 96.
**Spirit Light** (5 energy, 1 s, 4 s recharge) sacrifices 17% of your
maximum health and heals 156. **Wielder's Boon** (5 energy, ¼ s, 4 s
recharge) heals 51, and 63 more if the ally is under a weapon spell.
**Mending Grip** (5 energy, 1 s, 4 s recharge) heals 68, and if the ally
is under a weapon spell it also loses one condition, the newest: the
Ritualist's first condition removal (#1022).
Mend Body and Soul also removes one condition from the ally for each
spirit, any team's, in earshot of the ally, and Spirit Light sacrifices
nothing while a spirit, any team's, is in earshot of you (#1064).

The Ritualist's Channeling Magic strikes with spirits about (#1270). A
spirit, any team's, alive within earshot (350) of the caster is what
"if any spirits are within earshot" asks, at the moment the skill lands.
At Channeling Magic 12: **Spirit Burn** (5 energy, 1 s, 6 s recharge)
deals 41 lightning damage, and Burning for 4 s with a spirit in earshot.
**Essence Strike** (5 energy, 1 s, 8 s) deals 51 lightning damage, and
you gain 7 Energy with a spirit in earshot. **Signet of Spirits** (elite
signet, 1 s, 20 s, its PvP version) gives 10 Energy with a spirit in
earshot and nothing without, though it is still used and recharges.
**Spirit Rift** (10 energy, 2 s, 5 s) leaves a rift where its target
stood (see Pulses): 3 s later, every foe adjacent to it takes 105
lightning damage and Cracked Armor for 16 s. **Painful Bond** (hex, 15
energy, 1 s, 12 s) hexes the target and every foe nearby it for 18 s:
each spirit's shot that hits a hexed foe deals 18 more, past armor; a
missed or blocked one, nothing. **Lamentation** (hex, 10 energy, 1 s,
15 s) hexes the target and every foe nearby it for 17 s with −2 Health
degeneration; as it lands, each takes 42 typeless damage if a spirit or
a fresh corpse is in earshot of you. The corpse is not exploited.

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
it, and the weapon eases back to rest. No double strike on an attack
skill, but **a scythe's attack skill cleaves** as the swing does (#977):
it also strikes up to 2 foes adjacent to its target, nearest first, picked
at the hit, and each foe struck rolls its own blind, block and crit and
gets the skill's effects. Eremite's Attack strikes every foe adjacent
to its target while you have a Dervish enchantment (#1021). A skill
with its own area, or another weapon, does not cleave. Afterwards you swing at its foe, from a fresh
swing. Distracting Blow deals no damage: a hit only interrupts, and a
miss does nothing. It has no attribute, as in GW1, so any warrior can
use it and its numbers never scale.
**Cyclone Axe** (Axe Mastery, 5 energy, 4 s recharge) spins: its target
and every other foe adjacent to _you_ take an axe blow +10 at rank 12,
each with its own block, blind and crit roll, and each foe it lands on is
a strike of adrenaline (#936). An adjacent ally is not hit.

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

Deadly Arts (#1234) has seven staples, each at its rank-12 duration and
pips, its damage by the Assassin's Deadly Arts. **Shroud of Silence**
(elite hex, touch): the touched foe cannot start a spell for 5 s, and
all of _your_ spells are disabled for 15 s. A spell already being cast
goes off; skills that are not spells and attacks still work, and the
foe's bar dims its spells while it lasts. A Remove Hex from an ally ends
it. **Expose Defenses**: for 9 s the foe cannot block your attacks; its
stance still blocks everyone else's. **Enduring Toxin**: −4 Health
degeneration for 5 s, renewed for another 5 s each time it would run out
while the foe is moving; a strip ends it for good. **Mark of Death**:
half the benefit from healing for 8.8 s, which the 40% floor on heal
cuts holds to 40% less. **Disrupting Dagger** and **Crippling Dagger**
are projectile spells with half the normal range: 10…30…35 earth damage
and an interrupt of whatever the foe is activating, or 15…51…60 earth
damage and Crippled for 12.6 s if the foe is moving when it hits. A
dagger that misses does nothing. **Iron Palm** (touch, not an attack, so
never blocked) deals 5…41…50 damage, ignoring armor, knocks down a foe
with a hex or a condition, and counts as a lead attack: it leaves your
lead mark, so an off-hand attack follows it. **Mantis Touch** (cripples
for 17 s) and **Palm Strike** (54 damage, ignoring armor, and Crippled
for 4 s) are touch skills the same way, never blocked, and count as an
off-hand attack: they leave your off-hand mark, so a dual follows them.

**Dual attacks** (#885) must follow your off-hand attack (all but
Exhausting Assault, below), and strike
twice: each blow rolls its own miss, block and crit, and the skill's
bonus and riders land with each blow that hits, so a condition applied
twice is refreshed. A foe the first blow kills takes no second. A dual
that lands leaves your dual mark. Death Blossom also deals its damage to
every foe adjacent to its target, once a blow; Twisting Fangs bleeds and
deep-wounds; Horns of the Ox knocks down a foe with no ally adjacent.
Moebius Strike, the elite, is an off-hand attack that follows a dual,
and against a foe below half health recharges all your other attack
skills at once, so the chain loops: lead, off-hand, dual, Moebius,
dual, Moebius. Exhausting Assault (#1580) is the one dual that follows
a lead attack instead: it interrupts the foe's action, and if that
action was a spell, the foe suffers 10 overcast, once however many
blows land. The weapon's own double strike never adds to a skill.

**Off-hand attacks that ask for a state** (#1041). Falling Spider needs
no lead: it hits only a knocked-down foe, whoever knocked it down, read
as its blow lands. On a foe standing, it is out of sequence like an
off-hand without its lead: it costs its energy, misses ("Falling Spider
misses Warrior (only if target is knocked down)") and recharges at
once. A hit poisons and leaves your off-hand mark, so a dual follows.
The tooltip reads "Off-hand attack. Only if target is knocked down."
The crippling knockdown chain sets each step up: Leaping Mantis Sting,
a lead, cripples a foe that is moving; Jungle Strike, an off-hand,
deals a crippled foe and every foe adjacent to it 25 more; Trampling
Ox, a dual, knocks a crippled foe down; then Falling Spider, and Death
Blossom or Twisting Fangs after it.

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
**Critical Eye** (Assassin, Critical Strikes, 5 energy, instant, 30 s
recharge, #988) adds 13% to the chance for 30 s, all of it capped at
100%, and gives 1 more energy on each crit, beside Critical Strikes'.
It is a skill effect, so no strip removes it. An arrow keeps the crit
chance it was loosed with, but the extra energy is read as it lands.
Some attack skills crit whatever the roll (#1315): every blow of
**Critical Strike** (a dual, +10…26…30 damage, and 1…3 Energy for each
blow that hits), and **Malicious Strike** (not a chain attack) on a foe
suffering from a condition as its blow lands, where it also deals
+10…26…30. Such a crit is a crit in every way: the maximum times √2,
Critical Strikes' energy, Critical Eye's. A blocked or missed blow is
no crit. **Unsuspecting Strike**, a lead attack, deals +19…29…31, and
15…63…75 more on a foe above 90% Health as it lands; at exactly 90%,
none. All three are Critical Strikes skills.

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
and shields do not block, as in GW1. Wild Throw and Crippling Shot cannot be blocked at all.
**Shroud of Distress** (Assassin, Shadow Arts, 10 energy, 1 s, 45 s
recharge, #988) gives a 75% chance to block attacks for 54 s, but only
while you are below half your maximum Health (after a deep wound), read
at each block roll: a heal back over half turns it off. It combines
with other blocks as above.
**Critical Defenses** (Assassin, Critical Strikes, 10 energy, 1 s, 30 s
recharge, #1315) is an enchantment: a 75% chance to block attacks for
9 s, put back to the full 9 s every time you land a critical hit.

Not modelled: evade.

**Faintheartedness slows attacks** (#493, GW1). Its hex makes the
target attack 50% slower, swings and attack skills alike: a sword swings
every 1.995 s instead of 1.33 s, and Swift Chop winds up for half of
1.5 × the axe's swing. A swing in progress stretches the moment the hex
lands and shrinks back when it ends; an attack skill keeps the wind-up it
started with. Spells are not slowed. Only the strongest slow-down and the
strongest speed-up count, and they multiply (ADR-0029). The hex also
degenerates its target by 2 pips.
**Shadow of Fear** (Curses, 10 energy, 2 s cast, 5 s recharge) is the
same slow-down without the degeneration, for 25 s, on the target and
every foe adjacent to it (#918).

### Weapon sets

A build carries up to four weapon sets (#489): a main hand and an
optional off-hand each. Set 1 is required, and sets 2-4 may be empty in
any pattern. Armor, runes and insignias are one set. A swap is an
action: it happens at once if you are doing nothing, and otherwise waits
for the cast and its aftercast, the swing in progress, or a knockdown to
end. A blow begun lands with the old weapon, and the new one then swings
afresh. Moving or Esc swaps at once, because it ends what the swap was
waiting for. Pressing another set while one waits replaces it, and the
set in hand drops it. There is no cooldown, as in GW1. Dead, you cannot
swap; you respawn holding the set you died with.

After a swap, everything reads the new set: auto-attack damage,
interval and reach, which attack skills work ("Needs an axe."), a
shield's armor and a focus's energy. Maximum energy becomes the new
set's, and current energy moves by the same amount. Swapping from a
wand and focus (+12) to a staff takes 12 off both, and swapping back
gives both back. Current energy may go below 0, hidden as in GW1:
regeneration climbs back through 0 before a skill can be paid for, and
nothing else takes it deeper. The energy bar, and what others see, show
0 until then. Arrows already in flight keep the bow that loosed them.
See [ADR-0036](../adr/0036-weapon-sets.md).

1-4 swap to sets 1-4 in the `vibewars` key preset, F1-F4 in `classic`,
and they can be rebound under "Weapon sets" on the Keys screen. A
held key swaps once. Four small slots at the left end of the skill bar,
two by two, show each set's weapon, its off-hand smaller, and its key,
in a match and in the Training Ground alike. The set in hand is lit, a
set waiting for its swap pulses, and an empty set is dimmed and blank.
Clicking a slot is its key. An empty set's key does nothing, and nothing
is said. The host handles at most four swaps a second from one player,
in a burst of four; it drops the rest silently. Which sets you carry
stays yours: others see only the weapon in your hands.

The Gear tab edits every set (#489): a row of four tabs, `1` to `4`,
sits above the hands, each showing its set's weapon and off-hand, or a
dimmed `+` when empty. The hands, their attribute choices and the gear
summary show and edit the selected tab, set 1 when the editor opens. A
weapon picked into an empty set creates it, with no off-hand; its ×, or
dragging its weapon to the library, empties it again. Set 1 cannot be
emptied. A set's problems mark its tab. A profession change gives set 1
the new primary's default weapon if nothing can govern its own, and
empties a set 2-4 in that case. An attack skill is flagged ("Needs an
axe") only when no set carries its weapon. The character preview shows
set 1, which every match starts with.

## Damage types and armor

Every hit has one of GW1's damage types (#759). Slashing, piercing and
blunt are **physical**: swords, axes and scythes slash, daggers, bows and spears
pierce, hammers and fists are blunt. Fire, cold, lightning and earth are
**elemental**: Fireball is fire. Chaos, dark, holy, shadow and
**typeless** are neither. The flat damage of a blocked Swift Chop is
typeless.

Armor comes from the primary profession: 80 for a Warrior or Paragon, 70
for a Ranger, Assassin or Dervish, 60 for the casters. So an attribute
rune fits only your primary's attributes (#1141): a W/Mo can wear a Rune
of Strength, not one of Healing Prayers. On top of that,
some armor applies only against some types:

| Bonus                | Against   | From                              |
| -------------------- | --------- | --------------------------------- |
| +20                  | physical  | being a Warrior                   |
| +30                  | elemental | being a Ranger                    |
| +10                  | physical  | a Stalwart insignia, on its piece |
| −1 to −3 a hit, flat | physical  | Rune of Absorption                |

So a Warrior has 100 armor against a sword and 80 against a Fireball,
and a Ranger 70 and 100. Damage halves for every 40 armor above 60:
Fireball's 91 lands for about 46 on a Ranger. Types that are neither
physical nor elemental get no typed bonus; base armor still applies.
Armor penetration cuts the whole total, typed bonus included.

An insignia guards only its own piece (#1135). Every hit that armor
meets lands on one piece, as in GW1: the chest 3 times in 8, the legs 2
in 8, the head, hands and feet once in 8 each. A Stalwart on the chest
adds its +10 only to hits on the chest; five Stalwart give +10 on every
hit, not +50. Base armor, the profession's typed armor, a shield,
enchantments and the rest count wherever the hit lands. Holy, shadow
and typeless damage, degeneration and life steal hit no piece. The gear
editor lists an insignia under the armor with its pieces and what it
adds on average: `+10 armor vs physical damage on chest (avg +3.8)`.

Insignias (#1142, #1188, #1206), each only on hits to its own piece; five of one kind
give its bonus on every hit, never five times over:

| Insignia        | Who                  | On its piece                                       |
| --------------- | -------------------- | -------------------------------------------------- |
| Stalwart        | anyone               | +10 vs physical                                    |
| Blessed         | anyone               | +10 while enchanted                                |
| Brawler's       | anyone               | +10 while attacking                                |
| Sentry's        | anyone               | +10 while in a stance                              |
| Knight's        | Warrior primary      | −3 physical damage taken, after armor              |
| Sentinel's      | Warrior primary      | +20 vs elemental, with 13+ Strength                |
| Nightstalker's  | Assassin primary     | +15 while attacking                                |
| Prodigy's       | Mesmer primary       | +5 each with 1, 3 and 5+ skills recharging         |
| Windwalker      | Dervish primary      | +5 each with 1, 2, 3 and 4+ enchantments           |
| Anchorite's     | Monk primary         | +5 each with 1, 3 and 5+ skills recharging         |
| Disciple's      | Monk primary         | +15 while you have a condition                     |
| Wanderer's      | Monk primary         | +10 vs elemental                                   |
| Dreadnought     | Warrior primary      | +10 vs elemental                                   |
| Blighter's      | Necromancer primary  | +20 while hexed                                    |
| Undertaker's    | Necromancer primary  | +5 each below 80, 60, 40 and 20% Health            |
| Minion Master's | Necromancer primary  | +5 each with 1, 3 and 5+ living minions            |
| Forsaken        | Dervish primary      | +10 while not enchanted                            |
| Shaman's        | Ritualist primary    | +5 each with 1, 2 and 3+ living spirits            |
| Prismatic       | Elementalist primary | +5 each for 9+ in Air, Earth, Fire and Water Magic |
| Infiltrator's   | Assassin primary     | +10 vs physical, +10 more vs piercing              |
| Saboteur's      | Assassin primary     | +10 vs physical, +10 more vs slashing              |
| Vanguard's      | Assassin primary     | +10 vs physical, +10 more vs blunt                 |
| Bonelace        | Necromancer primary  | +15 vs piercing                                    |
| Earthbound      | Ranger primary       | +15 vs earth                                       |
| Frostbound      | Ranger primary       | +15 vs cold                                        |
| Pyrebound       | Ranger primary       | +15 vs fire                                        |
| Stormbound      | Ranger primary       | +15 vs lightning                                   |
| Scout's         | Ranger primary       | +10 while using a preparation                      |
| Beastmaster's   | Ranger primary       | +10 while your pet is alive                        |
| Aeromancer      | Elementalist primary | +10 vs elemental, +10 more vs lightning            |
| Geomancer       | Elementalist primary | +10 vs elemental, +10 more vs earth                |
| Hydromancer     | Elementalist primary | +10 vs elemental, +10 more vs cold                 |
| Pyromancer      | Elementalist primary | +10 vs elemental, +10 more vs fire                 |
| Artificer's     | Mesmer primary       | +3 for each signet on your bar                     |
| Virtuoso's      | Mesmer primary       | +15 while activating a skill                       |
| Mystic's        | Ritualist primary    | +15 while activating a skill                       |
| Ghost Forge     | Ritualist primary    | +15 while under a weapon spell                     |
| Centurion's     | Paragon primary      | +10 while under a shout or chant                   |

Attacking is swinging while standing or casting an attack skill: an
auto-attack still walking to its foe is not. Strength counts runes, and
weakness lowers it. Knight's sits beside a Rune of
Absorption and adds to it, and never takes a hit below 0. Undertaker's
reads your maximum now, so morale moves it; a pet is neither a minion
nor a spirit, and only a living one counts for Beastmaster's. Activating
is any skill's activation, an attack skill's included, never a plain
swing. Artificer's counts the skill each slot holds now, an echo's copy
included. A profession
insignia needs that primary: the gear library shows only the common
ones and your primary's, and changing primary takes the others off.

A status can change the type of your attacks (#1021): under Staggering
Force or Dust Cloak a scythe deals earth, so a Warrior meets it with 80
armor, not 100, and a Ranger with 100, not 70. It is still an attack:
blind, block, crits, adrenaline and attack riders are as before, but a
Rune of Absorption and Mark of Pain, which answer physical damage, do
not. A skill's own type, as Spear of Lightning's, wins over it.

**Protective Spirit** (#936, Monk, Protection Prayers, 10 energy, ¼ s,
5 s recharge) lasts 19 s on any ally: no single hit takes more than 10%
of its max health, the max a deep wound has lowered. The cap comes last,
after armor, Frenzy's 160% and a Rune of Absorption, on every hit,
blow or spell. Degeneration, sacrifice and life steal are not hits and
are not capped. Two caps: the lower wins.

**Reversal of Fortune** (#987, Monk, Protection Prayers, 5 energy, ¼ s,
2 s recharge) lasts 8 s on any ally: the next damage or life steal it
would take heals it that much instead, up to 67, and the enchantment
ends. It comes after armor and every cap, so under Protective Spirit a
200 hit on a 480-health ally heals it 48. The whole hit is negated: no
damage, no death, nothing that answers physical damage, and a life
stealer gains nothing. A deep wound cuts the heal. The hit still counts
as a hit for the attacker's adrenaline. Degeneration and sacrifice pass
under it and do not spend it.

**Health lines and fatal damage** (#1789). A trigger on
`bearer-health-drops-below` fires on any packet of damage or life steal,
from anyone, that leaves its bearer alive and below its line (a share
of effective maximum Health), already below before the hit or not, as
GW1 does; health loss, sacrifice and degeneration never do. One packet
may fire two lines. A status that
negates fatal damage comes after invulnerability, Reversal of Fortune, a
bond and a guard: what would kill is dropped whole, as a reversal is,
the oldest such status ends, and its `bearer-fatal-damage-negated`
triggers fire at the dealer. A status a trigger ends still fires its own
`ends` triggers. Judge's Intervention (Monk, Smiting, 5 e, ¼ s, 8 s;
10 s on an ally) smites the dealer of the negated blow for 150 holy from
the Monk. Watchful Intervention (Dervish, Mysticism, 10 e, 1 s, 15 s;
60 s on an ally) heals 170 when damage drops it below 25%. Faithful
Intervention (5 e, 2 s, 20 s, self) and Illusion of Weakness (Mesmer,
Illusion, 10 e, 2 s, 30 s, self; you lose 202 first) have no duration,
end below 50% and 25%, and heal 126 and 202 as they end, by any means.

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
**Lightning Strike** (5 energy, 1 s, 5 s recharge) hits at once for 33
lightning at rank 12. **Mind Shock** (elite, 5 energy, 10 overcast, 1 s,
8 s recharge) hits for 42 lightning, and if you have more energy than
your target when it lands (its cost already paid), another 42 and a
knockdown. **Shard Storm** (Water Magic, 10 energy, 1 s, 10 s recharge)
flies as Fireball does, a little faster, and on a hit deals 70 cold and
hexes its target to 34% speed for 5 s (#918).
**Ice Spikes** (Water Magic, 15 energy, 1 s, 10 s recharge) falls on its
target and every foe adjacent to it: 68 cold and 34% speed for 5 s.
**Deep Freeze** (25 energy, 2 s, 15 s recharge) does the same to every
foe in the area of its target, for 70 cold and 10 s (#938). Neither
flies. Slows multiply, down to a floor of 25% speed.
**Blinding Flash** (Air Magic, 10 energy, ¾ s, 8 s recharge) blinds its
target for 7 s. **Shock** (5 energy, 10 overcast, ¾ s, 10 s recharge) is
a touch skill, not a spell: Dazed does not slow it and Fast Casting does
not speed it. It knocks its foe down and strikes for 50 lightning.
**Meteor** (Fire Magic, 5 energy, 10 overcast, 2 s, 30 s recharge) strikes
its target and every foe adjacent to it for 91 fire and knocks each down,
as the cast ends (#985).
**Water Trident** (elite, Water Magic, 5 energy, 1 s, 3 s recharge) flies
as fast as Lightning Orb at its target and up to two adjacent foes: 74
cold to each, and a knockdown to each that is moving. **Searing
Flames** (elite, Fire Magic, 15 energy, 1 s, 2 s recharge) falls on its
target and every foe nearby it: a foe already Burning takes 82 fire, one
that is not starts Burning for 6 s and takes nothing. Cast twice, it
burns, then strikes. **Ebon Hawk** (Earth Magic, 10 energy, 1 s, 5 s
recharge) flies as Fireball does: 70 earth and Weakness for 13 s.
**Stoning** (15 energy, 1 s, 5 s recharge) flies the same: 93 earth, and
a knockdown if its foe is weakened (#997).

## Primary attributes

Each profession's primary attribute does something of its own, as in
GW1 PvP (#473). Only a primary can hold its rank, and runes count.

- **Fast Casting** (Mesmer). Spells, enchantments, hexes and weapon spells activate in
  2^(−rank/15) of the time: ×0.574 at rank 12, and still faster above
  it. Every Mesmer spell; another profession's only if its own
  activation is 2 s or more, so a Mesmer/Necromancer casts Malaise in
  1.15 s but Faintheartedness in 1 s as usual. It multiplies with dazed
  (rank 12 and dazed: ×1.149). Aftercast and recharge are unchanged;
  attack skills and other non-spells too. Signets, under the same
  Mesmer-or-2-s rule, activate 3% faster a rank, linear: ×0.64 at rank
  12, so a Me/Mo casts Resurrection Signet (3 s) in 1.92 s. Dazed does
  not slow a signet (#1100).
- **Strength** (Warrior). Attack skills ignore 1% of armor a rank (12%
  at 12), unless the weapon has armor penetration of its own (a
  hornbow's 10%), which stands instead; the two do not add. Plain swings
  get none.
- **Expertise** (Ranger). Attack skills, rituals of any profession and
  every Ranger skill cost 4% less energy a rank (−48% at 12), rounded once, never below 0.
  Adrenaline costs are untouched.
- **Divine Favor** (Monk). A Monk spell cast on an ally, yourself
  included, heals that ally another floor(3.2 × rank) when it lands: +38
  at rank 12. Once a cast and on the target only, even for a spell that
  also reaches others. A spell that doubles Divine Favor, such as
  Healing Touch, adds twice that: +76 at rank 12. An interrupted spell, a
  dead target or a Monk spell at a foe gets nothing.
- **Critical Strikes** (Assassin). +1% critical chance a rank on weapon
  blows, and every crit gives the striker energy: none at ranks 1–2, 1 at
  3–7, 2 at 8–12, 3 at 13 and above (#1100).
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
- **Spawning Power** (Ritualist). A creature you summon, of any
  profession (spirits and minions, not a charmed pet), has 4% more
  Health a rank, rounded once: a spirit of 210 has 311 at rank 12. A
  weapon spell you put on anyone, yourself included, lasts 4% longer a
  rank: Weapon of Quickening 31.08 s instead of 21 s. A spirit's lifetime
  is unchanged. The tooltip shows both, the base in brackets: "311 Health
  (210)", "31.1s (21s)" (#1098).

The build editor says under a primary's row what it does at its rank
("Fast Casting 12: spells cast 43% faster, signets 36% faster"), and a skill tooltip for a
known character shows the cost and activation Expertise, Mysticism and
Fast Casting make of it, the base in brackets: "5 energy (10)",
"1.1s (2s)" (#531). The skill bar shows icons only (#719); a slot's
tooltip shows the energy the skill costs the caster now, Expertise,
Mysticism and an active glyph included (#528, #637, #874), the base in
brackets.

## Positioning

- **Body blocking**: living players are solid. A front line can deny
  ground; a caster can be boxed in. Corpses are _not_ solid — a dead
  player should never trap the living. A spirit is no body to its own team
  (#1278), as in GW1: you and your allies walk through your spirits,
  and a click or an attack walks straight on rather than round them
  (#1295), while foes are blocked by them. A minion or pet of yours that you stand
  in lets you step off it in any direction without a shove; once apart,
  it blocks you again.
- **Walls** resolve after players, so someone squeezed between a blocker
  and a wall ends up outside the wall rather than inside it.
- **Line of sight** is a geometric query against wall segments, shared
  by the server, the tests and any future client preview.
- **Shadow step** (#988): **Death's Charge** (Assassin, Shadow Arts,
  5 energy, ¼ s, 30 s recharge) moves you to the foe it targets, where
  that foe stands as the spell resolves, touching it on the side you
  came from, facing it. With a wall between, you land on it, and bodies,
  walls and the map's edge push you clear as for a walk. It is not a
  walk: snares do not slow it, nothing reads it as running, and an
  arrow already flying at you misses. A long step snaps the camera, as
  a respawn does. If that foe has more Health than you, read before the
  step, you are healed for 173. **Death's Retreat** (#1326, 20 s) steps
  to an ally the same way, and heals 112 if you have less Health than it.
  **Heart of Shadow** (heals 126, 15 s) and **Viper's Defense** (poisons
  adjacent foes for 17 s, 10 s) step 175 directly away from whatever you
  have selected, foe or ally, alive or dead, where it stands now. You
  keep your facing. A wall on the way stops you short of it. With nothing
  selected you stay put, and the heal or the poison still lands.

## Creatures

A creature (#1052) is a body that is not a player: a spirit or a minion,
summoned by a skill, or a pet, which comes with one on the bar. It has health, armor, statuses and its owner's team,
so every attack, spell, area and condition hits it, and it can be
targeted with Tab, C, a click or a call. It is drawn smaller (radius 10
to a player's 14) and blocks bodies at that radius. It is never a circle
(#1162): every creature, pets included, is a hexagon in its team's
colour with its kind's glyph (paw, skull, horned skull, wisp).

It never counts for its team: killing one scores nothing and gives no
morale, it has no morale of its own, and a team with only creatures left
standing has lost. A spirit or minion that dies or runs out its time disappears
at the end of the tick, with no corpse and no respawn; running out is not
a death. Its owner's death does not end it; its owner leaving the match
does. Soul Reaping answers a minion's death but not a spirit's. At most
32 summoned creatures are on the field at once (ADR-0035); a map's own
priests, Guild Lords and guards take none of those places (#1281).

**Spirits** (#1064) are planted by a ritual, a cast that can be
interrupted, where its caster stands. A spirit never moves: bodies are
pushed out of it, never it out of them. While it lives, everyone in its
range (a nature ritual's 1,190, a binding ritual's spirit range of 850;
walls do not matter) that it reaches wears its
effect as a status, with no bar, its hover "from Winnowing, while in
its range": on the step a body walks in, off the
step it walks out, and off everyone the step after the spirit dies or
runs out. Nothing removes that status but leaving. A **nature ritual**
(Ranger) reaches every body in range, both teams, so your Winnowing
helps the foe beside you too; a **binding ritual** (Ritualist) reaches
only its own team. No spirit is ever reached by a spirit. A body in
range of two spirits with the same effect, its side's and the foe's,
wears it once. One of a skill in range: planting a spirit ends every
spirit of the same skill on your side within the new one's range, as an
expiry, not a death. A foe's spirit of that skill lives on.

**Winnowing** (Ranger, Wilderness Survival, nature ritual, 5 energy,
2 s, 60 s recharge) plants a spirit of 210 Health (more with Spawning
Power) and armor 51 for 198 s:
every body in its range takes 4 more from each physical hit it takes,
before armor. A hit that "deals only" its number, as Concussion Shot's,
takes the 4 too: it is on the one hit, not on the attack.
**Recuperation** (Ritualist, Restoration Magic, binding ritual, 25
energy, 3 s, 45 s recharge) plants one of 210 Health (more with Spawning
Power) and armor 51 for 39 s: your side in its range gains +3 Health regeneration.

**Attacking spirits** (#1239, Ritualist, Communing, binding rituals,
30 s recharge) project nothing; each shoots the nearest living foe
within spirit range (850) and in sight, a piercing shot every 2 s that
can miss to blindness, be blocked or be dodged like an arrow. It never
walks: a foe that leaves its range or sight is let go for the next
nearest. Its damage is its stated number, linear in Communing (rank 0
to 15 is GW1's range), against armor 60. At Communing 12, armor 51:
**Pain** (5 energy, 1½ s) 182 Health, 126 s, hits for 25.
**Shadowsong** (15 energy, 2 s) 150 Health, 30 s, hits for 17 and
blinds for 5 s. **Dissonance** (25 energy, 2 s) 182 Health, 22 s, hits
for 17 and interrupts whatever its target is activating, any skill.
**Disenchantment** (25 energy, 3 s) 182 Health, 35 s, hits for 17 and
strips the target's most recent enchantment. A missed or blocked shot
does none of it.

**Protective spirits** (#1265, Ritualist, Communing, binding rituals,
45 s recharge) attack nothing. Each projects one status over spirit
range and pays for every outcome it changes with its own Health: plain
health loss, no armor, which can kill it; dead, it pays nothing and its
aura is gone the next step. At Communing 12, armor 51:
**Shelter** (25 energy, 5 s) 182 Health, 54 s: no single attack, a
weapon blow or an attack skill's with its bonus, takes more than 10% of
an ally's max Health, after everything else; spells, life steal and
degeneration are not capped. 51 each time it takes something off.
**Union** (15 energy, 3 s) 182 Health, 54 s: −15 from every hit and
every life steal on an ally, and 15 each time, a hit it zeroes too.
**Displacement** (15 energy, 3 s) 214 Health, 54 s: a 75% chance to
block, combined with the ally's other blocks as any are; 60 for each
block that was its own. **Earthbind** (15 energy, 3 s) 214 Health,
39 s: a foe in range knocked down stays down at least 3 s; 30 per
knockdown, one already as long included, none for one prevented.

**Spirit sacrifice** (#1309, Ritualist, Spawning Power, spells) spends
an allied spirit, a living one of your team whoever planted it; a foe's
spirit, a pet, a minion, a player or yourself is refused. A destroyed
spirit goes as an expired one does: no corpse, no killer, no morale, not
damage, so Shelter and Union do not soften it. At Spawning Power 12:
**Rupture Soul** (10 energy, ¾ s, 5 s) strikes every foe nearby the
spirit for 122 lightning damage and blinds them 10 s, then destroys it.
**Spirit to Flesh** (10 energy, ¾ s, 15 s) touches the spirit, heals you
and every ally nearby you 198, then destroys it. **Feast of Souls**
(5 energy, ¼ s, 10 s) destroys every allied spirit nearby you and heals
your whole party 90 for each; with none, it heals nobody but is still
used. **Consume Soul** (elite, 5 energy, 1 s, 5 s) steals 57 Health
from a foe, and deals 105 typeless damage to every foe minion, spirit
and pet in earshot of it, never a player, the foe itself excluded.

**Your spirits** (#1777, Ritualist) are the living spirits you made,
never an ally's or a foe's, in earshot of you, wherever the skill's
target stands. **Spirit Boon Strike** (Channeling Magic, 5 energy, 1 s,
3 s) strikes a foe for 56 lightning damage and heals each of your
spirits 56; with none near, it still strikes. **Spiritleech Aura**
(Restoration Magic, 5 energy, ¼ s, 20 s) gives each of your spirits 17 s
in which its attacks deal 17 less damage, never below 0, and steal 17
Health for the spirit on every hit; with none near, it is still used.
**Draw Spirit** (no attribute, 5 energy, ¼ s, 5 s) puts an allied
spirit, whoever made it, beside you; it keeps its owner and its time
left, and stays there.

**Creation** (#1316, Ritualist, Spawning Power) pays for each creature
you create: a spirit or a minion, once each as it appears, so Animate
Bone Minions pays twice; a charmed pet is not created, and a summon the
creature cap refuses creates nothing. At Spawning Power 12: **Boon of
Creation** (enchantment, 10 energy, 2 s, 45 s) for 51 s gives you 41
Health and 5 Energy for each. **Explosive Growth** (enchantment, 5
energy, 2 s, 45 s) for 51 s strikes the up to 5 foes nearest the new
creature, within nearby (81) of it, for 56 lightning damage. **Spirit's
Gift** (enchantment, 10 energy, 1 s, 45 s) for 60 s heals every ally
nearby the new creature, you included, 41 and removes one condition
from each. All three up at once all answer, in the order they are on
you. **Signet of Creation** (signet, 1 s, 20 s) gives 4 Energy for each
of your living spirits and minions within earshot of you, at most 10;
with none it gives nothing but is still used and recharges.

**Minions** (#467) are raised from a fresh corpse, of either team, the
nearest within cast range, and rise where it lay. Their Health, armor
and blows are set by their Necromancer's Death Magic as they rise and
never change after. A minion rots: it loses 1 pip of Health at once and
1 more every 20 s it lives, summed with its statuses before the −10
cap, and it never regenerates naturally; healing fights it as usual. A
rank-12 Bone Minion nobody touches lives 65 s. It stays by its master
and assists it (#1118): with no fight going, it attacks the foe its
master is attacking with a weapon or an attack skill, if within cast
range of the master, else the nearest foe within earshot of itself; a
called target or a spell does not count. It stays on its foe until that
foe dies, whatever its master switches to, and breaks off to walk back
once its master is past cast range, picking no fight until at heel
again. A master holds 2
plus half its Death Magic, rounded down (8 at 12): raising past it kills
the weakest first, by Health left and the oldest of equals, and that is
a death, so Soul Reaping answers it. A minion leaves no corpse, outlives
its master's death and follows the body, and leaves with its master.
A minion or a pet walking back to its owner goes round walls and
bodies, as a click-to-walk does; with no way there at all, it stands
where it is until there is one.

**Animate Bone Minions** (Necromancer, Death Magic, spell, 10 energy,
1 s, 5 s recharge) raises two Bone Minions of 280 Health and armor 30,
each a 6–11 blunt blow every 3.10 s. **Animate Bone Horror** (5
energy, 1 s, 5 s recharge) raises one Bone Horror of 360 Health and
armor 56, 12–24 blunt every 3.10 s. Numbers at Death Magic 12, from
GWW's damage tables, criticals taken out. A minion's blows scale with
its level, which its Necromancer's Death Magic sets as it rises: ×(level
÷ its level at 12)^1.5, a fit to GWW's tables. A Bone Minion raised at
Death Magic 0 is level 0 and deals nothing; at 6 it hits for 2–4.

Three more minions rise from a corpse (#1836), each a blow every
3.10 s. **Animate Vampiric Horror** (10 energy, 1 s, 15 s) raises one of
360 Health and armor 58, 12–22 blunt; whenever it deals damage its
master gains that much Health, not a heal, and nothing while its master
is dead. **Animate Flesh Golem** (elite, 10 energy, 1 s, 30 s) raises one
of 500 Health and armor 84, 50–74 slashing; a master has one at a time,
a new one killing the old, and a dead golem lies as 3 corpses (1 at
Death Magic 0) until the last is exploited. **Animate Shambling Horror**
(10 energy, 1 s, 25 s) raises one of 360 Health and armor 58, 11–21
slashing; when it dies or is destroyed, a Jagged Horror (320 Health,
armor 50, 8–16 blunt, each blow Bleeding for 25 s) stands up where it
fell, unless its master is dead. Two spells spend a minion: no death,
no corpse, but a golem's corpses and a Shambling Horror's replacement
still come. **Putrid Flesh** (10 energy, ¼ s, no recharge) destroys one
of your own minions and diseases foes nearby it for 13 s. **Feast for the
Dead** (5 energy, ¼ s, 10 s) destroys an allied minion and heals your
other minions 82, wherever they are.

**Pets** (#1046). A Ranger with **Charm Animal** (Beast Mastery, 10
energy, 10 s) on the bar brings a level-20 wolf from the moment it
joins: 480 Health and armor 80 whatever its owner's attributes, a
17–29 slashing bite every 2.15 s at Beast Mastery 12, weaker below on
the minions' curve, read as it arrives. Charm Animal does nothing else:
no match has an animal to charm, so pressing it is refused and costs
nothing. The wolf goes for whatever its owner is attacking, with the
weapon or an attack skill, not a spell, if that foe is within 700 of
it, and switches when its owner does; it keeps biting after its owner
stops, and otherwise heels within 109. Past 700 from its owner it walks
back and picks no fight until at heel. A dead wolf lies where it fell
and stays in the match: its corpse cannot be exploited, and an ordinary
resurrection is refused ("That cannot be revived that way."). Its
death disables its owner's whole bar for 10…4 s by Beast Mastery 0…12
(unverified), unless it was resurrected less than 15 s before.
With the death penalty on, the wolf has morale by the players' rules
(#1133): −15% of its 480 Health a death, to −60%, none within 5 s of
a resurrection, +2% back for each foe death while it lives, a morale
boost too. It keeps its morale through its owner's respawn, loses it on
a reset, and its death gives its foes nothing.
**Comfort Animal** (Beast Mastery, 10 energy, 1 s, 1 s recharge, cast
range) acts on your own wolf whatever you have selected: it heals a
living one for 20…87 and raises a dead one with 10…48% Health; with no
wolf it is refused ("You have no pet.") and costs nothing. The wolf
also comes back beside its owner, at full Health, whenever its owner
respawns or is reset; under resurrection-only only Comfort Animal
brings it back. It outlives its owner's death and leaves with its
owner. A build change that keeps Charm Animal keeps the wolf as it is;
one that drops it sends it away; one that gains it brings a fresh one.

**Guard, Fight and Heel** (#1110). Your wolf has a row under yours in
the party window, with three buttons; the lit one is its mode. Clicking
its name or bar targets it. **Guard**, where every wolf starts, is the
behaviour above: it bites what you attack. On **Fight** it goes for the
foe you have selected, attacking or not, within 700 of it, and switches
with your selection; with yourself, an ally, a corpse or nobody selected
it keeps its foe. On **Heel** it drops its attack at once, mid-bite or
not, keeps within 109 of you and fights nobody, not even what hits it,
nor a foe a pet attack would send it at. The leash is the same in all
three. A dead wolf's buttons still work, and so do a dead owner's. The
mode outlasts the wolf's death, Comfort Animal and your respawn; a
build change that keeps the wolf keeps it, and a fresh wolf starts on
Guard. Only you can order your wolf: the host drops anyone else's order.

**Pet attacks** (#1107) are Beast Mastery skills the owner uses and the
wolf lands. The owner pays and the skill starts recharging, but there
is no cast: it can be used mid-cast or mid-swing and stops neither. It
arms the wolf's next blow for 10 s; a newer pet attack replaces one
still waiting, whose energy is lost. With a living foe selected within
the wolf's 700, the wolf goes for it, as when its owner attacks one.
The armed blow goes through the attack-skill path with the wolf as the
attacker, at the ranks the wolf arrived with; a blind miss or a block
uses it up too, and it earns no adrenaline. With no wolf ("You have no
pet."), a dead one ("Your pet is dead.") or one farther than 350 from
its owner ("Your pet is too far away.") it is refused and costs
nothing. While a blow is armed, its skill's icon sits right of the
wolf's bar in your party window (#1167), darkening clockwise as the
10 s run out; it goes when the blow lands it, when it lapses, when a
newer one replaces it and when the wolf dies. Neither arming nor a
lapse writes a log line. At Beast Mastery 12:

| Skill            | Energy | Recharge | Blow                                                            |
| ---------------- | ------ | -------- | --------------------------------------------------------------- |
| Brutal Strike    | 10     | 5 s      | +29, and +29 more on a foe below 50% Health                     |
| Maiming Strike   | 10     | 5 s      | +17; a hit cripples for 13 s                                    |
| Disrupting Lunge | 5      | 10 s     | +10; a hit on a foe using a skill interrupts it, +20 s disabled |

**Calls and bonds** (#1108) are Beast Mastery shouts on your own living
wolf, whatever you have selected, from up to 700 away: past it you walk
in. With no wolf ("You have no pet.") or a dead one ("Your target is
dead.") they are refused and cost nothing. At Beast Mastery 12:

| Skill              | Energy | Recharge | On the wolf                                                   |
| ------------------ | ------ | -------- | ------------------------------------------------------------- |
| Call of Haste      | 10     | 25 s     | 30 s: bites 25% faster (every 1.61 s), moves 25% faster       |
| Call of Protection | 5      | 90 s     | 120 s: every hit on it is 17 lower, after armor               |
| Symbiotic Bond     | 10     | 55 s     | 264 s: +3 regeneration, half of each physical hit goes to you |

Symbiotic Bond's half is rounded down and reaches you at the end of the
step, typeless: no armor of yours stops it, nothing answers it, and it
is never sent on again, so two bonds never chain. With you dead or gone
the wolf takes it back. Reversal of Fortune on the wolf negates the whole
hit first, and Protective Spirit caps it before it is split. A wolf that
dies loses its calls and bond; call them again once it is back. The
fastest attack-speed boost wins: Call of Haste does not stack with
another.

**Revive Animal** (Beast Mastery, 5 energy, ¼ s, 5 s recharge) raises
every dead allied pet within 81 of you, yours or a teammate's, with
10…77% Health; foes' pets and living ones are left alone. With none near
it still goes off and is spent. A pet it raises has the 15 s grace: its
death within it costs its owner nothing.

## Wards and wells

A **ward** (#1087) is a circle left on the ground where its caster
stands as the ward spell lands. It is not a body: nothing can target,
hit, kill or move it, and its owner dying does not end it. Interrupted,
or dead before the cast ends, nothing is placed. For as long as it lasts,
every living body of the caster's side whose centre is inside it (walls
do not matter, spirits excepted) wears its effect as a status with no
bar, its hover "while in its range": on the step after it lands or a
body walks in, off the step a body walks out or the ward ends. A foe
standing in your ward gets nothing. Two wards of one skill overlapping
give their effect once; two different wards stack. Recasting leaves a
new ward and the old one stays until its time is up. Everyone sees every
ward: a faint disc in its side's colour, under the bodies, with its
skill's icon at the centre. At most 32 are on the ground at once; one
more ends the oldest.

**Ward Against Melee** (Elementalist, Earth Magic, ward spell, 15
energy, 1 s, 30 s recharge) leaves a ward of radius 109 for 5...17
seconds: your side inside it has a 50% chance to block melee attacks,
75% on top of a 50% stance. Arrows and spells are not blocked.

A **well** (#1104) is a ward's kin left on a corpse, not on its caster:
the well spell exploits the nearest fresh corpse as it lands, as Soul
Feast does (see Corpses), and the well lies where that body did, for its
whole time, whether the body later stands up, respawns or not. With no
corpse in reach (#1730) the caster sacrifices 66% of their maximum Health
instead, and the well lies where they stand. Most wells act on foes, and
your side standing in them gets nothing; Well of Blood and Well of Power
act on your side, and foes in them get nothing. Otherwise it is a ward:
drawn the same, one status from two of a skill, at most 32 on the
ground counting wards, traps and pulses.

**Well of Suffering** (Necromancer, Death Magic, well spell, 10 energy,
1 s, 10 s recharge) leaves a well of radius 109 on the nearest corpse
within cast range for 10...26 seconds: foes inside it suffer −5 Health
degeneration.

The other wells, each of radius 109, at their rank-12 numbers:

- **Well of Blood** (Blood Magic, 10 energy, 1 s, 2 s recharge, 18 s):
  your side inside gets +5 Health regeneration (#1730).
- **Well of Power** (Blood Magic, 5 energy, 1 s, 10 s recharge, 26 s):
  your side inside gets +5 Health and +2 Energy regeneration (#1730).
- **Well of Weariness** (Curses, 5 energy, 1 s, 5 s recharge, 46 s): foes
  inside suffer −1 Energy degeneration (#1730).
- **Well of the Profane** (Death Magic, 25 energy, 3 s, 10 s recharge,
  18 s): foes inside lose all enchantments and cannot be enchanted (#1732).
- **Well of Silence** (Curses, 10 energy, 1 s, 20 s recharge, 26 s): foes
  inside suffer −3 Health degeneration and cannot use shouts or chants
  (#1732).
- **Well of Darkness** (Curses, 10 energy, 1 s, 20 s recharge, 41 s):
  hexed foes inside miss 50% of their attacks (#1732).
- **Well of Ruin** (Curses, 10 energy, 1 s, 20 s recharge, 25 s): a foe
  inside that takes physical damage suffers Cracked Armor for 17 s
  (#1732).

## Traps

A **trap** (#1105) is a ground effect, as a ward is, set where its setter
stands as the trap skill ends. A trap is not a spell, so Dazed does not
slow it, but setting one is easily interrupted: any attack that lands on
the setter during it interrupts it, a swing, an arrow or an attack skill;
a miss, a block or a spell's damage does not. Precision Shot (#1629) is
easily interrupted the same way. Interrupted or moved, there
is no trap, the energy is spent and the skill recharges. Set, it waits for
up to its duration, then ends with no effect, unless it springs by
itself as its time runs out, as Flame Trap does. The first step a living foe
that is not a spirit has its centre within 40 of it (adjacent, walls do
not matter), it springs: its effects land on every foe its area takes
around the trap, as an area skill's would, from its owner, alive or dead,
and it is gone. Two traps under one foe both spring, oldest first. A trap
whose owner left the match is gone. Only the setter's team sees it: an
outline in the ally colour with its skill's icon at the centre. A foe
sees nothing until it springs, and the host never sends it a foe's trap.

**Barbed Trap** (Ranger, Wilderness Survival, trap, 10 energy, 2 s, 20 s
recharge) lasts 90 seconds. Sprung, every foe nearby (81) takes 7...20
piercing damage, becomes Crippled and begins Bleeding, both for 21 s.

**Flame Trap** (Ranger, Wilderness Survival, trap, 10 energy, 2 s, 20 s
recharge) lasts 90 seconds and springs by itself at the end. Sprung, it
pulses three times, a second apart (see Pulses): every foe nearby (81)
takes 5...17 fire damage and is set on fire for 3 s.

## Pulses

A **pulse** (#1113) is a ground effect that lands its effects again and
again: a number of pulses, a fixed interval apart, the first the step it
is placed, or once it is as old as its delay (#1270), and it is gone one
interval after the last. Each pulse lands
from the owner, alive or dead, on every body its area takes around the
effect, as an area skill's would, in line of sight of the effect, and is
logged as a cast, even when it hits nobody. A body that walks in is hit
from the next pulse. An owner who left the match takes it with them. Two
of a skill on one spot both pulse, each on its own clock. Everyone sees
it: a filled circle in its side's colour, which flashes as it pulses.

A trap whose spring has more than one pulse leaves a pulse where it lay
as it springs, its first pulse already landed: a sprung Flame Trap is
seen by its foes too.

**Symbol of Wrath** (Monk, Smiting Prayers, spell, 5 energy, 1 s, 20 s
recharge) leaves a symbol where its target stands as the cast lands; it
does not follow them. It pulses five times, a second apart: every foe
adjacent (40) takes 10...34 holy damage.
Spirit Rift's rift pulses once, 3 s after it opens, on whoever is
adjacent then.

## Death and scoring

Health reaching zero kills exactly once (no double death events). A kill
scores for the opposing team; both death paths — a killing blow and
bleeding out — route through the same place, so neither is worth more
than the other.

A death ends every effect on the dead: conditions, hexes, enchantments,
stances, shouts. Each ends as if removed, so what answers its ending
fires, and a corpse wears nothing. A kill made by such an answer, as a
Backfire's damage, ends them too but sets off nothing further. The
blow that kills still sets off what it answers on the dead, as a Mark of
Pain splashing from the corpse.

Kill credit is **team-level, not per-player**. Attributing a kill to a
specific killer needs damage-source tracking that does not exist yet,
and inventing an attribution would be a plausible-looking lie in the
scoreboard.

What death costs, and how the dead come back, are properties of the
match rules, set per mode as GW1 sets them (#843), and each map plays
one mode ([modes](modes.md), #476). Most maps play GW1's Annihilation
(#846): there is no respawn, the dead stay corpses
until resurrected or the match ends, and the **death penalty** is on.
So the scoreboard counts who is left, not kills: `4 v 3 · 7:12` reads
the living on your side, then theirs, beside the clock, and a pip per
foe beside it is filled while they live and hollow once they fall
(#881). Hover a pip for the name. The clock counts down to the end of
the match.
In GW1's Kill Count, which Pillar Hall plays, a dead player **respawns**
at a spawn point of their own team after 8 seconds, at full health and
energy, with all statuses cleared, and there is no death penalty. There
the scoreboard counts kills instead: `4 – 0 · 2:25` reads your team's
kills, then theirs, beside the clock (#1200).
In Priest Annihilation it counts the living, then each team's priest,
yours first, and the next wave: `4 v 3 · ✚ ✚ · raise 0:47 · 7:12`
(#1199). A priest's ✚ dims once it is dead, and the countdown reads
`raise —` once both are.
A Guild Battle reads each Guild Lord's health, the stand and the next
wave, yours first: `Lord 82% · 64% · ⚑ 1:12 · raise 0:47 · 21:40`
(#1226). The `⚑` is in its holder's colour with the time left to its
boost, or a grey `⚑ —` held by nobody; in the last 3 minutes each
team's aggression joins it, `agg 1,240 v 980`. Under it, a line for
each flag away from home: `⚑ Name` on its carrier, `⚑ dropped` on the
ground.
A Relic Run counts relic points as Kill Count counts kills, `2 – 1 ·
6:40` (#1374), and a line under it for each relic: `✦ Name`, `✦
dropped` or `✦ at base`.
King of the Hill counts its points the same way, then the altar in the
stand's slot, `2 – 1 · ▲ 0:18 · 6:40` (#1377): the holder's `▲` and
the time to its next point, or a grey `▲ —` held by nobody.
Capture Points counts shrine points as Kill Count counts kills (#1378).

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

Four more resurrections reach a corpse from casting range (#474), each
with the same no effects, no adrenaline and 5 s death-penalty grace.
**Resurrection Signet** is Common: any character may take it, whatever
their professions. It returns the ally at 100% health and 25% energy
after 3 s, and then it is spent, not recharging, until a morale boost
reaches its owner. An interrupted one is spent too, and a cancelled one
is not. Nothing in today's modes gives a morale boost, so it is one
resurrection per match. **Rebirth** (Monk) brings the ally to your side
at 25% health and no energy, disables every skill on their bar for 4 s
at Protection Prayers 12, and empties your own energy. **Signet of
Return** (Paragon) gives 13% health and 3% energy at Leadership 12 for
each party member in earshot of you, yourself included. Creatures do not
count. **Flesh of My Flesh** (Ritualist) costs you half your health and
returns the ally with what you have left, and 17% energy at Restoration
Magic 12.

**Corpses** (#466). Every dead player or training dummy is a corpse where
it fell, of either team: a Necromancer can feed on a foe's body or an
ally's, and denying a foe the bodies is part of the fight. A creature
leaves none. A corpse is fresh until a skill exploits it, once; after
that it is drawn darker, and a skill that wants a corpse ignores it. A
corpse skill takes the fresh corpse nearest the caster within its
radius, ties going to the smaller id, with no line of sight needed: a
body lies on the ground. With none in reach the press is refused ("No
corpse in range.") and nothing is paid; the corpse is picked again when
the cast ends, so one used up meanwhile leaves the cast with no effect,
paid for. An exploited corpse can still be resurrected, and its next
death leaves a fresh one; a respawn takes it away.

**Soul Feast** (Necromancer, Death Magic, 10 energy, 1 s, no recharge)
exploits the nearest corpse within cast range and steals 50...234
Health from it. That is life stealing, as Vampiric Gaze's, not a heal:
Deep Wound does not cut it, and it stops at your maximum.

## Match end

An Annihilation match (#846) is won by **wiping the other
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

A Priest Annihilation match (#1186) is Annihilation with a priest on each
team's shrine: a team is wiped only once its priest is dead too, and at
**12 minutes** equal morale goes to the team whose priest lives. Every
2 minutes a living priest raises its team's dead above -60% on its
shrine, at full Health and Energy, invulnerable for 5 seconds (#1208):
no damage, life steal, sacrifice or degeneration takes Health, and no
hex or condition lands (see [modes](modes.md)).

A Guild Battle (#1222) ends the moment a **Guild Lord dies**: its team
loses, "(Guild Lord slain)". A team whose every member is dead at -60%
loses next, "(morale)": no shrine can raise them. A wipe alone does not
end it; the shrines raise every 2 minutes with no priest. After **28
minutes** the most aggression wins, "(aggression 1,240 v 980)", yours
first (#1226). In that
order: the lord first, then morale, then time. Both lords in one tick,
or equal aggression, and both teams lose.

A Relic Run (#1374) ends the moment a team is **wiped**, as
Annihilation does, "(annihilation)". After **8 minutes** the team with
more relic points wins; equal points is a **draw**, as in Kill Count.
No number of points ends it early, and a kill is no point. King of the
Hill (#1377) ends the same ways, its points for holding the altar. Capture
Points (#1378) ends the same ways, on shrine points.

A Kill Count match ends when a team reaches 15 kills, or after 3
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
