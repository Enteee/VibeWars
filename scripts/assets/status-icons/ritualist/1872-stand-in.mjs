import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Caster staples 2 (#1872), stand-ins until their art card.
  // Weapon spell: a heart on a blade, more maximum Health.
  "vital-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M12 2v14M8 16h8M12 16v5" ${stroke(c, 2)}/>` +
      `<path d="M12 12l-3-3a2 2 0 0 1 3-2 2 2 0 0 1 3 2z" fill="${c}"/>`,
  ],
};

export default rows;
