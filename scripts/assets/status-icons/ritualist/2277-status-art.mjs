import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ritualist status art (#2277).
  // Ashes: an urn with a shield in it, more armor.
  "protective-was-kaolai": [
    "item",
    (c) =>
      `<path d="M8 4H16M9 4V7L6 11V17L8 20H16L18 17V11L15 7V4" ${stroke(c, 1.8)}/>` +
      `<path d="M9.5 11.5h5v2.5c0 1.5-1.2 2.4-2.5 3-1.3-.6-2.5-1.5-2.5-3z" ${stroke(c, 1.5)}/>`,
  ],
  // Ashes: an urn with a bar rising in it, more maximum Energy.
  "mighty-was-vorizun": [
    "item",
    (c) =>
      `<path d="M8 4H16M9 4V7L6 11V17L8 20H16L18 17V11L15 7V4" ${stroke(c, 1.8)}/>` +
      `<path d="M12 18v-6M9.5 14.5L12 12l2.5 2.5" ${stroke(c, 1.8)}/>`,
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
