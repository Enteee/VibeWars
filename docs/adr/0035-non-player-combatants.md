# ADR-0035: A creature is a participant with a creature record

## Status

Accepted (2026-10-28). Issue #1052, the first of #467's children.

## Context

GW1 fills a fight with bodies that are not players: spirits, minions,
pets, and later heroes. Each has health, armor, statuses and a team, so
every attack, spell, area and condition must reach it. None has a seat,
a skill bar to press, or a place in the score.

Every combat path in `MatchSimulation` already keys on participant ids:
the areas `resolveTargets` searches, the `surroundings` a splash reads,
status spread, projectiles, targeting, body blocking. Training dummies
prove that a participant with an empty bar and no ranks runs.

## Decision

**A creature is a `Participant` whose `creature` is set.** `Creature`
holds its `ownerId`, `kind` (`"spirit" | "minion"`), `name`, the seconds
it has left (`Infinity`: until killed) and the tick it was summoned.
Players and dummies leave `creature` undefined.

**`countsForTeam(participant)` is the one predicate** for what a
creature is not: in its team's roster, score, morale or win condition.
The simulation asks it in `#standing`, kill morale, `moraleBoost` and
the team roster; a creature's death goes through `#recordDeaths` like
any other, but scores nothing, costs no morale and never respawns.
Clients ask the same of `PlayerSnapshot.creature`: the scoreboard, the
enemy pips and the music skip creatures.

**The owner is the key a creature answers to.** It leaves the match with
its owner (`remove`), not with its owner's death. Later commands, a
pet's Heel or a hero's flag, key on `ownerId` too. A future NPC hero is
a participant with a build and an owner, and decides `countsForTeam` for
itself; this ADR does not decide it.

**Removal waits for the end of the step.** A creature that dies or
expires is queued, and leaves once, in queue order, after everyone
acted and before the match end is checked. Removing it inside the
per-participant loop would change who acts after it in the same tick.
Expiry is not a death: nothing answers it and nobody scores.

**Summoning is an effect.** `summon` carries a `CreatureTemplate`
(kind, name, health scaled by the caster, armor, an optional duration
and a `Behaviour`) and a count. `resolveSkillEffects` hands the summons
that landed back in its `SkillOutcome`, as it does `rechargeFraction`,
and the simulation adds the creatures: only it can add to the match.
Ids are `<ownerId>/c<n>`, `n` counting per match from 1, so the same
inputs make the same ids in the same order.

**Bounded.** `MAX_CREATURES = 32` per match. A summon past it makes as
many as fit, possibly none, and is still paid for. The wire mirrors it
as `MAX_WIRE_CREATURES`, held to it by a test, and a snapshot carries up
to `MAX_LOBBY_PLAYERS + MAX_WIRE_CREATURES` bodies.

**Radius per body.** `ruleset.collision.creatureRadius` (10) is a
creature's, `playerRadius` (14) a player's, at every site that blocks,
steers or catches a shot. The nav graph keeps `playerRadius`: it is
built for players and is the larger, safe value.

## Considered and dropped

- **A second list of creatures beside the participants.** Every combat
  path above would have to be taught a second source of bodies, and one
  forgotten is a creature that cannot be hit by something. The cost of
  the participant route is a short list of places that skip creatures,
  all behind `countsForTeam`.
- **A creature on the wire as a new message.** It is drawn, targeted
  and hit as a body, so it travels as one: a `WirePlayer` with
  `creature` set and no professions.

## Consequences

- Spirits, minions and pets are data plus behaviour on this model; none
  needs a new body type.
- Anything new that counts players must ask `countsForTeam` (or
  `PlayerSnapshot.creature` on the client), or creatures will count.
- A snapshot can be larger: `MAX_SNAPSHOT_PARTS` went from 8 to 12 so
  8 players at every status, every creature and every shot still fit.
- A spirit projects its effect as a status on whoever is in its range
  (#1064), not as a ground entity: the status system already carries
  modifiers, the effects monitor and the wire, so an aura needs only a
  pass that puts it on and takes it off.
- A ground effect (#1087), a ward, is not a combatant either: a circle
  with an owner, a team and an end time, projecting its effect through
  the same aura pass as a spirit, so a spirit's aura and a ward's never
  strip each other. It cannot be targeted or killed, so it has no body.
- A creature may be a **companion** (#1046): it arrives with its owner's
  build, lies when dead, is reset with its owner, and engages its owner's
  target. That is the shape an NPC hero takes, differing only in where it
  comes from and who may revive it.
- A companion has morale (#1133), by the players' death penalty, on its
  own maximum Health; it never counts for the team, and its death gives
  its foes none.
- A creature leaves no corpse (#466) unless the card that adds it says so.
- A creature that fights swings a weapon built from its template, its
  summoner's rank snapshotted as its mastery (#467), so every attack
  path reaches it unchanged.
- A creature's blow may carry its owner's skill (#1046): a pet attack
  arms the companion's next blow, which resolves as the attack skill it
  is, with the pet as the attacker and its snapshotted ranks.
- Orders reach a creature through one `command` intent (#1110), on the
  `"intent"` channel, keyed on its `ownerId`: the host drops an order
  from anyone but the owner, and for anything but a companion. Its
  `order` is a union, so a hero's flag joins it without a new channel.
