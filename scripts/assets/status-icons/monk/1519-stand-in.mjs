import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Monk smiting staples (#1519), a stand-in until the asset-designer's.
  // Enchantment: a blade with a holy halo, attacks are holy and pierce.
  "judges-insight": [
    "enchantment",
    (c) =>
      `<ellipse cx="12" cy="5" rx="4.5" ry="1.6" ${stroke(c, 1.5)}/>` +
      `<path d="M12 8v9M9 14h6M12 17v3" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
