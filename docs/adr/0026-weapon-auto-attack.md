# ADR-0026: Weapon auto-attack

## Status

Accepted (2026-10-25). Amends [ADR-0012](0012-equipment.md), which
deferred auto-attacks, and [ADR-0019](0019-status-modifiers.md), whose
blind now reaches weapons too. Epic #157; this ADR lands with its first
child, #158.

## Context

Every weapon was complete as data (damage range and type, attack
interval, reach, projectile speed, penetration, cleave, double strike)
and nothing swung it. `weaponAttributeMultiplier` and
`unmetRequirementMultiplier` had no caller. Adrenaline came from any
damaging skill, with a comment saying auto-attacks would be the other
source. The operator approved GW1-style auto-attack, with answers Q16 to
Q20 on #157.

## Decision

**The attack is state on the combatant.** `Combatant.attack` is
`{ targetId, swingElapsed }` or `undefined`, next to `cast`.
`MatchSimulation.requestAttack(id, targetId)` sets it, refused with the
same reasons a cast at that target would get unless the target is a
living enemy. `cancelAttack` clears it, and so does any non-zero
movement direction: in GW1, moving cancels the attack. That holds at the
attack step too, not only in `setInputDirection`: an attack asked for
while a direction is already held is dropped there, before approach could
move the player a second time in the same tick.

**One step per tick, after cast resolution and before behaviour.** It
drops an attack whose target is gone, dead or no longer an enemy. It
does nothing while casting. Out of reach or out of sight, it approaches
the target through the same movement code as input, so collision, walls
and cripple apply (Q16). In reach and in sight, it advances the swing. A swing lands when
`swingElapsed` reaches the weapon's interval, and keeps the remainder, so
the rate stays exact at 20 Hz. The first hit lands one full interval
after arriving.

**Reach is `distanceWithinRange(weapon.range)`, the same test a skill
uses.** It is not `range + target radius`. Weapon reach equals melee-skill
reach (ADR-0012), and a different test would reopen the band where you
can swing at someone but not Swift Chop them. Bodies collide at 28
units, so 40 is always reachable.

**The approach paths round walls (#211).** It first steered straight at
the target. That failed QA: on Arena Alpha the teams spawn either side
of the central wall, so Space at spawn walked a hero into the wall for
good, and a bow stood behind it firing "obstructed" forever. Now it
follows a visibility graph over wall corners (`pathing.ts`). Each wall
endpoint offers the spots just off it, diagonally, that a body fits on,
inside the map's bounds. Two spots are joined when a body walks from one
to the other without coming closer to a wall than its radius. The graph
is built once per map. Every tick the approach replans from where the
hero stands, with A*, and walks toward the first waypoint, so a target
that moves or a shove costs nothing extra. Every weapon approaches until
it is in reach **and** in line of sight. Obstruction is checked at
release, along the whole flight path (#215): the path is fixed then, so
a shot led round a corner or at a target stepping behind a pillar is cut
short at the wall and lands as `attack-obstructed`. Pillar-dancing, the
GW1 counter to rangers, works. If there is no path, the
attack ends with `attack-unreachable` ("can't reach") once that has lasted
`unreachableAfterSeconds` (0.5 s, #218). A single failed search can be a body
shoved into a concave corner, which steering straight at the target usually
frees within a few ticks, so it does not end the attack. Today's maps have
no such place, but an attack must never loop. Rejected alternatives:

- a grid with A*, which needs a resolution choice and is coarser for no
  gain on walls made of segments;
- a navmesh, which is far more than a few rectangles need;
- refusing Space when the straight line is blocked, which would make the
  main key useless at spawn.

**One function resolves a landed swing**, `resolveSwing` in
`skills/weapon-attack.ts`, so #159's projectiles land through the same
code as a sword. For each victim, it rolls:

- blind (`attackMissChanceOf`), emitting `attack-missed`; it is rolled
  only when there is a chance to miss, so an unblinded fight's random
  stream does not move;
- then a uniform integer in `[damageMin, damageMax]`, times
  `weaponAttributeMultiplier(rank)`, times `unmetRequirementMultiplier`
  if the requirement is unmet. Fists have no attribute and swing at
  rank 0.

The packet is the weapon's damage type, source `weapon`, with its armor
penetration, through the existing `mitigate`. Daggers strike twice with
their `doubleStrike` chance; the second blow has its own rolls. A scythe
also hits up to `cleaveTargets` living foes within `AREA_ADJACENT` of
the target, ordered as an area orders them (`nearestFirst`).

**A swing is one log entry**, `cause: "weapon"`, with the attacker as
`sourceId` and every hit and miss of that swing in `events`. The tally
already credits damage by `sourceId`, so meters count weapon damage
unchanged.

**Skills interrupt and resume.** Beginning a cast resets `swingElapsed`
to 0: the swing in progress is lost. When the skill resolves, or is
interrupted, the attack resumes on the target it had.

**Adrenaline** is +3 per landed swing that damaged someone else, however
many it cleaved, as a damaging skill already gives.

**Deferred to #160**, which ships the attack key, cancel and HUD: a
skill used on an enemy starting or switching the attack to it (Q17), and
adrenaline coming from attacks only (Q19). Both change live play, and
neither should land before a player can see and stop an attack.

**Ranged weapons fire projectiles** (#159): the swing landing releases a
shot led ahead of the target, which hits or is dodged when it lands
(`MatchSimulation.projectiles`, `skills/projectile.ts`).

## Simplifications

All of these are deliberate, for a game that is fun before it is
complete:

- **No crits.** `criticalMultiplier` stays data.
- **No attack-speed modifiers** (IAS, DAS): nothing consumes them yet.
- **No block or evade.**
- **Attack skills do not ride the weapon.** They keep their own damage,
  and count as attacks only for blind and adrenaline. Making them weapon
  damage plus a bonus is a later epic.
- **Pathing is for the attack's approach only.** Player movement, and
  skills cast out of range, do not path. Planning ignores other bodies;
  collision handles shoves, and the next plan starts from there.
- **Armor does not read the attack state.** ADR-0019 removed Brawler's
  Insignia because "while attacking" was never true. It now can be, but
  restoring the insignia is a follow-up. The gap is recorded in
  `coverage.ts` as `armor-while-attacking`.

## Consequences

- Nothing calls `requestAttack` in live play until #160, so matches play
  as before. The server and the training connection already send a
  swing's entry as the attacker's, with no skill, and the combat log
  reads it as "Attack".
