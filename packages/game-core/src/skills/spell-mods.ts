import type { SpellChance } from "../equipment/resolve.js";
import type { SimulationRng } from "../rng.js";
import { isSpell, type Skill } from "./types.js";

/**
 * Whether one of `sources` comes up for `skill` (#2011): Adept's halved
 * cast, of Memory's halved recharge. Each acts on spells only, of its
 * attribute or any, and is rolled on its own; two that come up still act
 * once, as GW1's halves never stack to a quarter. A use none acts on rolls
 * nothing, so a set without them leaves the seeded rolls as they were.
 */
export function spellModComesUp(
  sources: readonly SpellChance[],
  skill: Skill,
  rng: SimulationRng,
): boolean {
  if (!isSpell(skill.type)) {
    return false;
  }
  let up = false;
  for (const { chance, attributeId } of sources) {
    if (
      (attributeId === undefined || attributeId === skill.attributeId) &&
      rng.nextFloat() < chance
    ) {
      up = true;
    }
  }
  return up;
}
