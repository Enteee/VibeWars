import { WARRIOR_SKILLS } from "./catalog/warrior.js";
import { RANGER_SKILLS } from "./catalog/ranger.js";
import { MONK_SKILLS } from "./catalog/monk.js";
import { NECROMANCER_SKILLS } from "./catalog/necromancer.js";
import { MESMER_SKILLS } from "./catalog/mesmer.js";
import { ELEMENTALIST_SKILLS } from "./catalog/elementalist.js";
import { ASSASSIN_SKILLS } from "./catalog/assassin.js";
import { RITUALIST_SKILLS } from "./catalog/ritualist.js";
import { PARAGON_SKILLS } from "./catalog/paragon.js";
import { DERVISH_SKILLS } from "./catalog/dervish.js";
import { COMMON_SKILLS } from "./catalog/common.js";
import { RANGE_SPELL } from "../distances.js";
import type { StatusId } from "./status.js";
import type { Skill } from "./types.js";

/**
 * The implemented skill catalog (brief §9's "Implemented" stage).
 *
 * Every entry's numbers come from the imported reference corpus in
 * `@vibewars/game-data` (`normalized/<id>.json`) — same id, same cost,
 * same activation/recharge, same attribute scaling endpoints. What is
 * *implemented* here is only what the current effect system can honestly
 * express; a skill whose real behaviour needs a mechanic that does not
 * exist yet (hexes, enchantments, conditions, regeneration over
 * time) is deliberately **absent from this catalog**, not present with a
 * watered-down effect list.
 *
 * That is the brief's §9 rule taken literally: "do not fake coverage by
 * mapping unsupported skills to generic placeholder effects." The gap
 * between the 16 imported skills and the 6 implemented here is real, and
 * `coverage.ts` reports it rather than hiding it.
 *
 * Ranges are this project's own tuning (the source corpus does not
 * publish numeric ranges), expressed in the same world units as map
 * geometry.
 */

export const IMPLEMENTED_SKILLS: readonly Skill[] = [
  ...WARRIOR_SKILLS,
  ...RANGER_SKILLS,
  ...MONK_SKILLS,
  ...NECROMANCER_SKILLS,
  ...MESMER_SKILLS,
  ...ELEMENTALIST_SKILLS,
  ...ASSASSIN_SKILLS,
  ...RITUALIST_SKILLS,
  ...PARAGON_SKILLS,
  ...DERVISH_SKILLS,
  ...COMMON_SKILLS,
];
/**
 * The skills only a map's NPC uses (#1377), each `npcOnly`: found by
 * `getSkill`, so the simulation casts them as any other, but in no list
 * a player picks from, and refused on a player's bar.
 */
export const NPC_SKILLS: readonly Skill[] = [
  {
    // King of the Hill's Ghostly Hero claims the altar with it (#1377,
    // GW1): 5 s standing still, cut short by an interrupt or a knockdown
    // as a spell is. What a finished one does is the simulation's.
    id: "npc.claim-resource",
    name: "Claim Resource",
    gwId: undefined,
    type: "spell",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "common",
    attributeId: undefined,
    cost: undefined,
    overcast: 0,
    activationSeconds: 5,
    rechargeSeconds: 0,
    range: RANGE_SPELL,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    npcOnly: true,
    effects: [],
  },
];

export const SKILLS_BY_ID: ReadonlyMap<string, Skill> = new Map(
  [...IMPLEMENTED_SKILLS, ...NPC_SKILLS].map((skill) => [skill.id, skill]),
);

export function getSkill(id: string): Skill | undefined {
  return SKILLS_BY_ID.get(id);
}

/**
 * Every status a skill maintains (#837). Another status with no end of
 * its own, as Faithful Intervention (#1789), lasts until something ends
 * it but costs no upkeep, and its caster cannot drop it.
 */
export const MAINTAINED_STATUSES: ReadonlySet<StatusId> = new Set(
  IMPLEMENTED_SKILLS.flatMap((skill) =>
    skill.effects.flatMap((effect) => (effect.kind === "maintain-status" ? [effect.statusId] : [])),
  ),
);
