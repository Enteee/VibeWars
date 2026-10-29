# Modes

Every arena plays one mode, as GW1's Random Arenas do (#476). Which mode
a match plays follows from its map alone, in a coded lobby and in a
Random Arena alike: nobody picks one. The lobby shows it under the map
name. A map names its mode in its `map.json` (`"mode"`), and a map
without one, or with one the game does not know, is refused.

**Annihilation** (GW1's arenas, #846): defeat every foe. The dead stay
corpses until resurrected, and each death costs morale. Wipe the other
team to win; after 8 minutes the highest total morale wins, and there is
no draw. Every arena but Pillar Hall, Split Paths, Guild Hall Isle,
Relic Temples and Hill Courtyard plays it.

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
so aggression grows no faster; a Deep Wound's cut and degeneration
take no more than what is left either, so degeneration never kills a
lord whose cap is spent.

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

Its HUD (#1226) puts the match on the scoreboard: each lord's health,
the stand's holder and the time to its boost, the next wave, and in the
last 3 minutes each team's aggression; on a narrow window the line
wraps between its parts. A line under it names each
flag's carrier, or says it was dropped. A boost toasts, "Morale boost!
+10%" for your team and "Enemy morale boost" for theirs. The compass
marks each Guild Lord `♛`, each flag `⚑` where it is, and the stand
`◎` in its holder's colour. A Guild Lord's or any creature's death is
no kill in the match summary.

**Relic Run** (GW1's Heroes' Ascent, #1374): carry your relic onto the
altar. Each team has a **relic** at a `"relic-spawn"` objective in its
base, and the map has one **altar**, an `"altar"` objective in its
centre; a Relic Run map without exactly one altar and one relic spawn
per spawning team is refused. Target your relic and press Space to take
it up within 60 units, as a flag; you carry it as a flag is carried,
hands full and at 1/1.2 speed, and it drops the same ways, staying
where it fell. A carrier who comes within 60 units of the altar scores
at once, no Space press: a point for the team, and the relic goes home.
A foe's relic on the ground goes home when you reach it with empty
hands (a relic in hand refuses it, "hands full"); one at its spawn is
refused. Scores are settled before the tick's deaths drop anything, so a
carrier who reaches the altar and dies in the same tick still scores.
The dead stay down and pay the death penalty; a wipe loses at once. At
**8 minutes** the team with more points wins, equal points is a draw,
and no number of points ends it early. Kills score nothing. The
scoreboard reads the points as Kill Count reads kills, `2 – 1 · 6:40`,
and the line under it names each relic's place: `✦ Name`, `✦ dropped`
or `✦ at base`. Relic Temples plays it, and no Random Arena does.

**King of the Hill** (GW1's Heroes' Ascent, #1377): lead your Ghostly
Hero onto the altar and hold it. Each team has a **Ghostly Hero** at a
`"ghost-spawn"` objective in its base, and the map has one `"altar"`;
a King of the Hill map without exactly one altar and one ghost spawn per
spawning team is refused. The ghost is a creature (`ghost/<team>`, 600
Health, armor 60, a sword) that nobody plays and no player's skill bar
shows. Space on your own living ghost, within 60 units, toggles it
between **following** you (a minion's follow-and-attack, you its leader)
and **staying** where it stands (a guard's hold, unrooted, on a short
leash); it starts staying at its spawn, and stays when its leader dies
or leaves. A foe's Space on it is an attack, as on any foe. A living
ghost within 60 units of the altar uses **Claim Resource** by itself
while its team does not hold the altar and nobody does or the holder's
ghost is dead: 5 s through the cast path, standing still and fighting
nobody, so an interrupt, a knockdown or a spell-only interrupt cuts it
short, and it begins again on its next tick while the rule allows it. A
claim under way stops the moment the rule no longer allows it: off the
altar's reach, or the holder's ghost risen. Two claims finished in the
same tick take nothing, and both begin again. A finished claim gives
the team the altar, its clock at 0; every **30 s** held without a break
is a point, the holder's ghost dead or alive, until another team claims
it. A dead ghost rises at its spawn after 120 s (its own `on-death`
reset), staying put; it costs no morale and counts toward no wipe.
Claim Resource (`npc.claim-resource`) is an `npcOnly` skill: no
build lists it and a bar holding it is refused. As in a Relic Run the
dead stay down and pay the death penalty, a wipe loses at once, and at
**8 minutes** the most points win, equal points a draw; kills score
nothing. The scoreboard reads `2 – 1 · ▲ 0:18 · 6:40`: the points,
then the altar in the stand's slot, the holder's `▲` and the time to
its next point, or a grey `▲ —`. Hill Courtyard plays it, and no
Random Arena does.

How each one ends, in full, is in [combat](combat.md#match-end).
