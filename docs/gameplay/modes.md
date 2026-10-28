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

Each base is **guarded** (#1223), by `"guard"` objectives naming a
role: a Bodyguard and two Knights by the Guild Lord, an Archer at the
back of the lord room, and a Footman and an Archer outside each gate.
All have 480 Health. Each holds its post: it fights foes near it, and
walks home past its leash, Knights far (900), Archers hardly (300). A
Knight (armor 80, +20 vs physical) and a Footman fight with a sword and
Sever Artery, a Knight with Healing Signet and "Watch Yourself!" too, a
Footman with Distracting Blow; an Archer (armor 70, +30 vs elemental)
with a longbow, Pin Down and Troll Unguent. The Bodyguard (armor 60)
heals with Heal Other, its Guild Lord first, and while it lives its
lord takes **20% less damage**. Guards are never raised and count for
nobody. A Guild Lord's **Amulet of Protection** caps the Health it
loses in each second of the match: 25 at the start, rising evenly to
300 at 12 minutes. A blow past the cap deals only what is left of it,
so aggression grows no faster; degeneration past it is given back as
the next second starts.

How each one ends, in full, is in [combat](combat.md#match-end).
