import type { CombatMessage, MatchSnapshot, PlayerSnapshot } from "../net/match-connection.js";
import type { SoundId } from "./sound-ids.js";

/**
 * Which sound plays for what (#104, #112). You hear only what concerns
 * you, never the whole arena: the table in docs/art/art-direction.md
 * §Sound. Pure, so the rules are tested without an AudioContext.
 */

/**
 * The sounds one combat message plays for `selfId`. An area skill that
 * hits five players lists its crack five times; the player throttles
 * that to one.
 */
export function soundsForCombat(message: CombatMessage, selfId: string): SoundId[] {
  const mine = message.casterSessionId === selfId;
  // A status tick (burning, Regeneration) comes with no skill, up to 20
  // times a second: a chime per tick drowns everything. Its health shows
  // on the bar; only a death it causes is worth a sound.
  const tick = message.skillId === "";
  const sounds: SoundId[] = [];
  for (const event of message.events) {
    if (tick && event.kind !== "death") {
      continue;
    }
    const onMe = event.targetId === selfId;
    switch (event.kind) {
      case "damage":
        // Hurting yourself is a hit you take, not one you deal.
        if (onMe) {
          sounds.push("hit-taken");
        } else if (mine) {
          sounds.push("hit-dealt");
        }
        break;
      case "heal":
        if (onMe) {
          sounds.push("heal");
        }
        break;
      case "interrupted":
        if (onMe || mine) {
          sounds.push("interrupt");
        }
        break;
      case "interrupt-missed":
        if (mine) {
          sounds.push("interrupt-missed");
        }
        break;
      case "death":
        sounds.push("death");
        break;
      default:
        break;
    }
  }
  return sounds;
}

function playerById(snapshot: MatchSnapshot, id: string | undefined): PlayerSnapshot | undefined {
  return id === undefined ? undefined : snapshot.players.find((p) => p.sessionId === id);
}

/** Whether `id` started a cast between two snapshots: a new skill, or one where there was none. */
function startedCasting(prev: MatchSnapshot, next: MatchSnapshot, id: string): boolean {
  const after = playerById(next, id);
  if (after === undefined || after.dead || after.castingSkillId === undefined) {
    return false;
  }
  return playerById(prev, id)?.castingSkillId !== after.castingSkillId;
}

/**
 * The cast cues between two snapshots: `cast-self` when you start a cast,
 * `cast-target` when your target does, which is the moment to interrupt.
 *
 * Only a cast that starts while the caster is already your target counts,
 * so switching onto someone mid-cast stays silent. Without a `prev`, on
 * the first snapshot or after a reconnect, every running cast is old news.
 */
export function soundsForSnapshot(prev: MatchSnapshot | undefined, next: MatchSnapshot): SoundId[] {
  if (prev === undefined) {
    return [];
  }
  const selfId = next.selfSessionId;
  const sounds: SoundId[] = [];
  if (startedCasting(prev, next, selfId)) {
    sounds.push("cast-self");
  }
  const targetId = playerById(next, selfId)?.targetSessionId;
  if (
    targetId !== undefined &&
    targetId !== selfId &&
    targetId === playerById(prev, selfId)?.targetSessionId &&
    startedCasting(prev, next, targetId)
  ) {
    sounds.push("cast-target");
  }
  return sounds;
}
