import type { StatusDefinition } from "../status.js";
import { define } from "./define.js";

export type CommonStatusId =
  // Conditions (brief §12's starting set).
  | "bleeding"
  | "burning"
  | "poison"
  | "crippled"
  | "blind"
  | "weakness"
  | "cracked-armor"
  | "deep-wound"
  | "dazed"
  | "disease";

export const COMMON_STATUSES: Readonly<Record<CommonStatusId, StatusDefinition>> = {
  bleeding: define("bleeding", "Bleeding", "condition", { healthPips: -3 }),
  burning: define("burning", "Burning", "condition", { healthPips: -7 }),
  poison: define("poison", "Poison", "condition", { healthPips: -4 }),
  crippled: define("crippled", "Crippled", "condition", { moveSpeedMultiplier: 0.5 }),
  blind: define("blind", "Blind", "condition", { attackMissChance: 0.9 }),
  weakness: define("weakness", "Weakness", "condition", {
    weaponDamageMultiplier: 0.34,
    attributeDeltas: [{ scope: "all", amount: -1 }],
  }),
  "cracked-armor": define("cracked-armor", "Cracked Armor", "condition", {
    armorReduction: { amount: 20, floor: 60 },
  }),
  "deep-wound": define("deep-wound", "Deep Wound", "condition", {
    maxHealthLoss: { fraction: 0.2, cap: 100 },
    healingMultiplier: 0.8,
  }),
  dazed: define("dazed", "Dazed", "condition", { castTimeMultiplier: 2, interruptsSpells: true }),
  disease: define("disease", "Disease", "condition", { healthPips: -4, spreads: true }),
};
