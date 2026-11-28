import {
  CREATURE_LOOKS,
  IMPLEMENTED_SKILLS,
  type CreatureLook,
  type ProfessionId,
  type SkillProfession,
} from "@vibewars/game-core";
import type { MapData } from "@vibewars/game-maps/schema";

/** Every creature look named anywhere in `value`, into `into`. */
function looksIn(value: unknown, into: Set<CreatureLook>): void {
  if (Array.isArray(value)) {
    for (const each of value) {
      looksIn(each, into);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, field] of Object.entries(value)) {
    if (key === "look" && isCreatureLook(field)) {
      into.add(field);
    } else {
      looksIn(field, into);
    }
  }
}

function isCreatureLook(value: unknown): value is CreatureLook {
  return CREATURE_LOOKS.some((look) => look === value);
}

/** Each profession's creature looks, once worked out. */
const professionLooks = new Map<SkillProfession, ReadonlySet<CreatureLook>>();

/**
 * Every look a skill of `profession` can summon or call (#4172): its
 * summons, wherever an effect holds them, what a summon leaves when it
 * dies, and its companions, walked from the skills themselves, so a new
 * summon needs no entry here.
 */
function looksOf(profession: SkillProfession): ReadonlySet<CreatureLook> {
  let looks = professionLooks.get(profession);
  if (looks === undefined) {
    const into = new Set<CreatureLook>();
    looksIn(
      IMPLEMENTED_SKILLS.filter((skill) => skill.profession === profession),
      into,
    );
    looks = into;
    professionLooks.set(profession, looks);
  }
  return looks;
}

/**
 * Every creature look a match can produce (#4172), so match start bakes
 * them all and none hitches a frame mid-fight: what any skill of the
 * seats' professions, primary or secondary, or a common skill can bring
 * on, and what the map places, its guards, guild lords, priests and
 * Ghostly Hero. From professions, not bars: a client never sees the
 * other side's. A look this misses still bakes, late, when it appears.
 */
export function matchCreatureLooks(
  professions: Iterable<ProfessionId | undefined>,
  map: MapData | undefined,
): ReadonlySet<CreatureLook> {
  const looks = new Set<CreatureLook>(looksOf("common"));
  for (const profession of professions) {
    if (profession !== undefined) {
      for (const look of looksOf(profession)) {
        looks.add(look);
      }
    }
  }
  for (const objective of map?.objectives ?? []) {
    if (objective.kind === "resurrection-shrine") {
      looks.add("priest");
    } else if (objective.kind === "guild-lord") {
      looks.add("guild-lord");
    } else if (objective.kind === "guard") {
      looks.add("guard");
    }
  }
  if (map?.ghostLevel !== undefined) {
    looks.add("ghostly-hero");
  }
  return looks;
}
