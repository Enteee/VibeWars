import { RANGE_SPELL } from "../../distances.js";
import type { Skill } from "../types.js";

export const COMMON_SKILLS: readonly Skill[] = [
  /* ---------------------------------------------------------------------- */
  /* Resurrection skills (#474)                                             */
  /* ---------------------------------------------------------------------- */

  {
    id: "common.resurrection-signet",
    name: "Resurrection Signet",
    gwId: 2,
    type: "signet",
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "common",
    attributeId: undefined,
    cost: undefined,
    overcast: 0,
    activationSeconds: 3,
    rechargeSeconds: 0,
    // "This signet only recharges when you gain a morale boost."
    rechargesOnMoraleBoost: true,
    range: RANGE_SPELL,
    target: "single-dead-ally",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    // "Resurrect target party member. That party member is returned to
    // life with 100% Health and 25% Energy."
    effects: [
      {
        kind: "resurrect",
        health: { kind: "percent", percent: { flat: 100 } },
        energyPercent: { flat: 25 },
        perPartyMemberWithin: undefined,
        at: "corpse",
      },
    ],
  },
];
