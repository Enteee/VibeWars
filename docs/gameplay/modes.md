# Modes

Every arena plays one mode, as GW1's Random Arenas do (#476). Which mode
a match plays follows from its map alone, in a coded lobby and in a
Random Arena alike: nobody picks one. The lobby shows it under the map
name. A map names its mode in its `map.json` (`"mode"`), and a map
without one, or with one the game does not know, is refused.

**Annihilation** (GW1's arenas, #846): defeat every foe. The dead stay
corpses until resurrected, and each death costs morale. Wipe the other
team to win; after 8 minutes the highest total morale wins, and there is
no draw. Every arena but Pillar Hall plays it.

**Kill Count** (GW1's The Crag): the most kills in 3 minutes. The dead
respawn at their team's spawn after 8 seconds, and there is no death
penalty. The first team to 15 kills wins at once; at time the team with
more kills wins, and equal kills is a draw. Pillar Hall plays it.

How each one ends, in full, is in [combat](combat.md#match-end).
