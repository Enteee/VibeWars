import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ritualist status art (#2277).
  // Ashes: a big solid shield, more armor.
  "protective-was-kaolai": [
    "item",
    (c) => `<path d="M12 2.5l8 3v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10v-6z" fill="${c}"/>`,
  ],
  // Ashes: a big arrow rising over a base line, more maximum Energy.
  "mighty-was-vorizun": [
    "item",
    (c) =>
      `<path d="M12 3l8 9h-5v6H9v-6H4z" fill="${c}"/>` + `<path d="M5 21.5h14" ${stroke(c, 2)}/>`,
  ],
  // Weapon spell: a heart on a blade, more maximum Health.
  "vital-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M12 2v14M8 16h8M12 16v5" ${stroke(c, 2)}/>` +
      `<path d="M12 12l-3-3a2 2 0 0 1 3-2 2 2 0 0 1 3 2z" fill="${c}"/>`,
  ],
  // Weapon spell: a blade with a plus, harder blows.
  "brutal-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M9 2v14M5 16h8M9 16v5" ${stroke(c, 2)}/>` +
      `<path d="M17 5v8M13 9h8" ${stroke(c, 2.2)}/>`,
  ],
  // Skill: a spirit's totem crowned, the next ritual's lord.
  "ritual-lord": [
    "skill-effect",
    (c) =>
      `<path d="M9 21V10h6v11M8 21h8" ${stroke(c, 2)}/>` +
      `<path d="M7 7l2.5-3 2.5 2 2.5-2 2.5 3z" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
