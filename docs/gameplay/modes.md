# Modes

Every arena plays one mode, as GW1's Random Arenas do (#476). Which mode
a match plays follows from its map alone, in a coded lobby and in a
Random Arena alike: nobody picks one. The lobby shows it under the map
name. A map names its mode in its `map.json` (`"mode"`), and a map
without one, or with one the game does not know, is refused.

**Annihilation** (GW1's arenas, #846): defeat every foe. The dead stay
corpses until resurrected, and each death costs morale. Wipe the other
team to win; after 8 minutes the highest total morale wins, and there is
no draw. Every arena but Pillar Hall, Split Paths and Guild Hall Isle
plays it.

**Kill Count** (GW1's The Crag): the most kills in 3 minutes. The dead
respawn at their team's spawn after 8 seconds, and there is no death
penalty. The first team to 15 kills wins at once; at time the team with
more kills wins, and equal kills is a draw. Pillar Hall plays it.

**Priest Annihilation** (GW1, #1186): defeat every foe **and** their
priest. Each team has a Resurrection Shrine behind its spawns, a map
objective in `map.json` (`"objectives"`), and a Priest stands on it: an
NPC that never moves or attacks, and casts Heal Area on itself and
everyone adjacent, foes too, whenever one of its side there is hurt
(480 Health, armor 60). Every 2 minutes of match clock, a team whose
priest lives gets its dead back on its shrine, at full Health and
Energy, morale kept, unless they are at -60%. For 5 seconds after (#1208)
they lose no Health in any way and gain no hex or condition; they can
still be targeted, healed, enchanted, knocked down and interrupted. A
skill resurrection gives none of it. The priest is never
resurrected and counts for nobody: no roster, score or morale. A team is
beaten once every player on it is dead and its priest too; a wiped team
whose priest lives waits for the wave. After 12 minutes the highest
total morale wins, then the team whose priest lives; otherwise both
lose. Split Paths plays it.

**Guild Battle** (GW1's Guild versus Guild, #1222): kill the enemy
**Guild Lord**, 8 against 8. Each base, behind a wall with two gates,
has a lord room with its Guild Lord at the back, a `"guild-lord"`
objective in `map.json`, and a Resurrection Shrine near the spawns. The
Guild Lord never moves, not even knocked down, and shoots any foe it
sees within longbow range with Hunter's Shot, Crippling Shot and its bow
(1,680 Health, armor 80, +5 Health regeneration). It is never
resurrected and counts for nobody. The shrines have no priest: every 2
minutes each raises its team's dead above -60%, as Priest
Annihilation's do, so a wiped team waits for the wave. The team whose
Guild Lord dies loses at once; a team all dead at -60% loses too. After
**28 minutes** the team with the most **aggression** wins: the damage
its members and their creatures dealt to the enemy Guild Lord, after
armor, degeneration and life stealing not counted. Equal aggression,
or both lords dying together, and both lose. Guild Hall Isle plays it,
and no Random Arena does.

Each team also has a **flag** (#1225), at a `"flag-spawn"` objective
near its shrine, and the map has one **flag stand**, a `"flag-stand"`
objective in its centre. Target your own flag (right click) and press
Space: you walk to it and take it up within 60 units. A foe's flag does
nothing. While you carry it your hands are full, no weapon attacks and
no attack skills, though spells work, and you walk at 1/1.2 of your
speed. Target the stand and press Space to plant it. The flag drops
where you are when you die, leave, press **Drop flag** above your
health bar (or the Drop key, unbound by default), or swap weapon sets;
your team takes it up from there. Planting over a foe's flag sends that
one home to its spawn. The team whose flag is on the stand holds it,
and every **2 minutes** held without a break gives the whole team a
**+10% morale boost**, which readies spent skills too. A foe planting
over it starts the count again from 0 for them.

How each one ends, in full, is in [combat](combat.md#match-end).
