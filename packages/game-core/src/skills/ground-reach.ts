import { getSkill } from "./catalog.js";
import type { GroundAct } from "./types.js";

/** Whom a skill's ground reaches, relative to its owner's team (#3283). */
export type GroundReach = "allies" | "foes" | "all";

/**
 * Whom the ground `skillId` leaves reaches: its aura's `affects`, or
 * its pulse's or trap's area. A skill that leaves no ground reaches
 * all, the reading that warns rather than reassures.
 */
export function groundReach(skillId: string): GroundReach {
  const effect = getSkill(skillId)?.effects.find(
    (candidate) => candidate.kind === "create-ground-effect",
  );
  return effect === undefined ? "all" : actReach(effect.act);
}

function actReach(act: GroundAct): GroundReach {
  switch (act.kind) {
    case "aura":
      return act.aura.affects;
    case "trap":
      return areaReach(act.trap.spring.area.affects);
    case "pulse":
      return areaReach(act.pulse.area.affects);
  }
}

function areaReach(affects: "enemies" | "allies" | "all"): GroundReach {
  return affects === "enemies" ? "foes" : affects;
}
