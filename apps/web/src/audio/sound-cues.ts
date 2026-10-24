import type { CombatMessage, MatchSnapshot, PlayerSnapshot } from "../net/match-connection.js";
import type { SoundId } from "./sound-ids.js";

/**
 * Which sound plays for what (#104, #112). You hear only what concerns
 * you, never the whole arena: the table in docs/art/art-direction.md
 * §Sound. Pure, so the rules are tested without an AudioContext.
 */

/**
 * The sounds one combat message plays for `selfId`, each at most once:
 * an area skill that hits five players is one crack, not five.
 */
export function combatSounds(message: CombatMessage, selfId: string): SoundId[] {
  const mine = message.casterSessionId === selfId;
  const sounds = new Set<SoundId>();
  for (const event of message.events) {
    const onMe = event.targetId === selfId;
    switch (event.kind) {
      case "damage":
        if (onMe) {
          sounds.add("hit-taken");
        } else if (mine) {
          sounds.add("hit-dealt");
        }
        break;
      case "heal":
        if (onMe) {
          sounds.add("heal");
        }
        break;
      case "interrupted":
        if (onMe || mine) {
          sounds.add("interrupt");
        }
        break;
      case "interrupt-missed":
        if (mine) {
          sounds.add("interrupt-missed");
        }
        break;
      case "death":
        sounds.add("death");
        break;
      default:
        break;
    }
  }
  return [...sounds];
}

/** Whether `player` started a cast between two snapshots, a recast of the same skill included. */
function startedCasting(before: PlayerSnapshot | undefined, after: PlayerSnapshot): boolean {
  if (after.castingSkillId === undefined) {
    return false;
  }
  return (
    before?.castingSkillId !== after.castingSkillId || after.castRemaining > before.castRemaining
  );
}

/**
 * The cast cues between two snapshots: `cast-self` when you start a cast,
 * `cast-target` when your target does, which is the moment to interrupt.
 */
export function castSounds(before: MatchSnapshot, after: MatchSnapshot): SoundId[] {
  const byId = (snapshot: MatchSnapshot, id: string | undefined): PlayerSnapshot | undefined =>
    id === undefined ? undefined : snapshot.players.find((p) => p.sessionId === id);
  const sounds: SoundId[] = [];
  const self = byId(after, after.selfSessionId);
  if (self !== undefined && startedCasting(byId(before, self.sessionId), self)) {
    sounds.push("cast-self");
  }
  const target = byId(after, self?.targetSessionId);
  if (
    target !== undefined &&
    target.sessionId !== after.selfSessionId &&
    startedCasting(byId(before, target.sessionId), target)
  ) {
    sounds.push("cast-target");
  }
  return sounds;
}
