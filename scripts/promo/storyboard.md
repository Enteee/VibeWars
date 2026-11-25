# Trailer storyboard (#3982)

One row per shot, in cut order. Every map shot starts already in the action:
the scene fast-forwards past the countdown and the walk, and marks its start
only when its event happens (`window.__capture`), never after a fixed sleep.
Bots are random, so each scene retries (as `fight` does) on its event and
fails loudly after its tries. Today's three map shots are 2.7 s of a lone
walk; they become the four action shots below, 2.0 s each, so the maps
go from 8.1 s to 8.0 s and the trailer keeps its length (the earlier draft
said 12 s of maps; that was wrong). Three shots at 2.7 s would be 8.1 s.

All cuts: 16x9 and the 9x16 centre crop. The action is always at the screen
centre, so the crop loses nothing: the camera follows the player, and each
script keeps its target within 400 px of the player.

| #   | Map             | The viewer sees                                                                                                                    | Input script                                                                                                                 | Camera                                   | Length                       | Caption                             |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------- | ----------------------------------- |
| 1   | wardens-gallery | Cold open: the Gallery's raise, heroes charge. Unchanged.                                                                          | none (held for the raise)                                                                                                    | follow, default zoom                     | 4 s                          | none                                |
| 2   | (editor)        | The build editor. Unchanged.                                                                                                       | paste the build code                                                                                                         | n/a                                      | 6.4 s                        | Your build is the game.             |
| 3   | wardens-gallery | The fight: a cast is interrupted. Unchanged, the centrepiece.                                                                      | Space on the nearest foe, until `interrupted`                                                                                | follow, slow-mo at the hit               | 10 s                         | Read the cast. Break it.            |
| 4   | arena-canyon    | **Casting.** The player casts an AoE on the foe pack: cast bar fills, the projectile flies, the hit lands and the numbers pop.     | target nearest foe, cast the build's AoE slot when foes are within range, wait for a `damage` event from that skill          | follow, zoom 1.15                        | 2.0 s (from the cast start)  | none                                |
| 5   | broken-tower    | **A gate opening.** The player steps on a pressure plate and the doors open for the allies pouring through.                        | walk onto the plate and stand on it, wait for the gate to open (door look swaps), allies follow                              | follow, zoom 1.0, then the door in frame | 2.0 s (from the plate press) | none                                |
| 6   | ember-pits      | **Teamwork.** An ally under pressure at the pit's edge gets a heal or a protection from the player; both fight on beside the lava. | stay within 300 u of an ally, cast the support slot on the ally once its health is below 60 %, wait for a `heal` event on it | follow, zoom 1.1                         | 2.0 s (from the heal)        | none                                |
| 7   | broken-tower    | **Landmark while fighting.** A skirmish on the bridge/ramp: the layered terrain is in frame while bodies trade hits.               | hold the ramp foot, Space on the nearest foe, wait for a `damage` event while the player is on layer 2                       | follow, zoom 0.9 so the layers show      | 2.0 s                        | none                                |
| 8   | (friends)       | Play with friends. Unchanged.                                                                                                      | n/a                                                                                                                          | n/a                                      | 6.2 s                        | Play with friends.                  |
| 9   | (ranked)        | Earn the look. Unchanged.                                                                                                          | n/a                                                                                                                          | n/a                                      | 5.9 s                        | Earn the look. Never the advantage. |
| 10  | end card        | Unchanged.                                                                                                                         | n/a                                                                                                                          | n/a                                      | 4 s                          | VibeWars                            |

## Scene scripts

Shared helpers (new `scripts/promo/actions.mjs`):

- `castAt(page, slot, stepper)`: select the nearest foe (Tab), press the slot.
- `holdNear(page, point, stepper)`: walk to a world point and stop.
- `followAlly(page, stepper)`: walk toward the nearest ally.
- `waitEvent(page, stepper, predicate, ms)`: step the clock until a
  `__capture` event matches, or give up after `ms`.

Each scene is `tries x (start the match, run its script, wait for its event)`,
`SCENE_TRIES = 5`, keyed on its own event (`damage` from the AoE for 4, the
gate opening for 5, `heal` on an ally for 6, `damage` on layer 2 for 7).
A scene that never sees its event throws, as `fight` does.

## Decisions (operator, Q192)

1. Pressure plates, not levers. No shipped map has a plate yet, so shot 5
   needs a map with a plate-opened gate: a map change, its own card
   (architect). Shot 5 waits for it; the other action shots do not.
2. Four 2.0 s shots (8.0 s of maps, the trailer keeps its length).
