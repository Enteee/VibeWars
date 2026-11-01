# Combat basics

## Health and energy

You start with 500 **Health** and 50 **Energy**; runes and morale change
both. Skills cost Energy, and it comes back by itself, slowly. Warriors
and Paragons regain it slowest, Rangers a little faster, everyone else
fastest.

The arrows on your bars are **pips**: each one is Health or Energy coming
back, or draining away, a little every second. Bleeding, Burning and
Poison drain Health; Regeneration and healing spells add it. Out of the
fight for 5 seconds, your Health starts coming back on its own, faster
the longer you stay out.

## Adrenaline

Warriors, Paragons and others have skills that cost **adrenaline**
instead of Energy. Each such skill charges on its own: every weapon hit
you land gives each of them a strike, and so does taking a big hit. Using
one empties it and takes a strike from the others. Out of the fight for
25 seconds, they all empty.

## Using a skill

A skill can take a moment to **cast**, and then needs time to
**recharge** before you can use it again. If your target is out of range,
you walk to it first. Moving, or Esc, cancels a cast: the Energy is gone,
but the skill does not recharge. After any skill with a cast time, except
an attack skill, there is a short pause in which you cannot act.

A skill you press while using another, or in that pause, is **queued**:
it goes next, and its slot pulses until it does. Only one waits; pressing
another replaces it. Moving, Esc, an interrupt or a knockdown drops it.

**Shouts and stances** are never queued: they go off at once, even while
you cast another skill, in that pause, or knocked down. The cast keeps
going. Used so, they do not walk you in: out of range, they are refused.

## Interrupts and knockdown

An **interrupt** stops a foe's skill while they are casting it. Their
Energy is spent and the skill recharges; some interrupts also lock the
skill for a while. Interrupt too early or too late and nothing happens.

Most interrupts also stop a plain attack mid-swing: that blow never
lands and the swing starts over. A foe still walking up to its target
has nothing to interrupt. An interrupt whose card says "a skill" or "a
spell" leaves a plain attack alone.

Some stances, such as Mantra of Concentration, stop an interrupt aimed
at you. None of them stops a knockdown.

**Knocked down**, you cannot move, attack or use a skill for a moment,
except a shout or a stance, and a cast in progress fails.

## Conditions, hexes and enchantments

**Conditions** hurt you until they run out or are removed:

| Condition     | What it does                                     |
| ------------- | ------------------------------------------------ |
| Bleeding      | drains Health                                    |
| Burning       | drains Health fast                               |
| Poison        | drains Health                                    |
| Disease       | drains Health, and spreads to anyone next to you |
| Crippled      | you move at half speed                           |
| Blind         | most of your attacks miss                        |
| Weakness      | your weapon hits much weaker                     |
| Cracked Armor | less armor                                       |
| Deep Wound    | less maximum Health, and healing works less      |
| Dazed         | spells cast slowly; any attack interrupts them   |

**Hexes** are cast on you by foes; **enchantments** by yourself or your
allies. Each is removed by its own kind of skill. Some enchantments are
**maintained**: they last until you end them, costing an Energy pip while
they run. Double-click its icon to end one.

A few skills stop working while you are enchanted, and start again once
you are not. A skill that lasts for your "next N attacks" counts every
attack, so a miss or a block uses one up as surely as a hit.

## Armor and damage

Warriors and Paragons wear the most armor; Rangers, Assassins and
Dervishes less; casters the least. Armor makes weapon, elemental, chaos
and dark damage smaller. Holy, shadow and typeless damage, Health drains and life
stealing ignore it. Only weapon hits can be critical.

## Death, resurrection and morale

In most modes the dead stay down until an ally **resurrects** them with a
skill, such as Resurrection Signet, which anyone can take. Some modes
bring the dead back in waves, or on their own; see [Modes](modes.md).

Every death costs you 15% **morale**, down to -60%: your maximum Health
and Energy shrink with it. Each foe your team kills wins 2% of it back,
up to 0. In a Guild Battle, holding the flag stand lifts it above that,
up to +10%.
