import { sanitizeName, type MatchRecordTeam } from "@vibewars/game-session";

import { teamCharacter, teamOf } from "../ui/team-builder.js";
import { decodeTemplate } from "./gw1-template.js";
import { isTeamBuildSize, type StoredTeam, type TeamCharacter } from "./schema.js";

/**
 * A finished match's team as a new Team Build (#2585): each player a
 * member built from its template code, named after the player. Skills
 * this game lacks become empty slots, and `missingSkills` lists their GW1
 * ids. Not a Team Build size, or any template unreadable: `ok: false`.
 * The record is the host's word, untrusted, so this never throws.
 */
export function teamFromMatch(
  team: MatchRecordTeam,
  newId: () => string,
  now: number,
): { ok: true; team: StoredTeam; missingSkills: number[] } | { ok: false } {
  const size = team.players.length;
  if (!isTeamBuildSize(size)) {
    return { ok: false };
  }
  const members: TeamCharacter[] = [];
  const missingSkills: number[] = [];
  for (const player of team.players) {
    const decoded = decodeTemplate(player.template, newId(), now);
    if (!decoded.ok) {
      return { ok: false };
    }
    const { character } = decoded;
    members.push({
      ...teamCharacter(character, character.id),
      name: sanitizeName(player.name, character.name),
    });
    missingSkills.push(...decoded.missingSkills);
  }
  const named = team.players.find((player) => !player.bot) ?? team.players[0];
  const name = named === undefined ? "New Team" : `${named.name}'s team`;
  return {
    ok: true,
    team: { ...teamOf(newId(), size, members), name, updatedAt: now },
    missingSkills,
  };
}
