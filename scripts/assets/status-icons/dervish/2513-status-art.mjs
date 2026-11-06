import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Weapon element (#2513), art #2517.
  // Enchantment: a scythe blade over three dust dots: earth on the swing.
  "ebon-dust-aura": [
    "enchantment",
    (c) =>
      `<path d="M7 19L15 5c2 2 3 5 2 8" ${stroke(c, 1.8)}/>` +
      `<circle cx="6" cy="8" r="1.2" fill="${c}"/>` +
      `<circle cx="9" cy="5" r="1.2" fill="${c}"/>` +
      `<circle cx="18" cy="18" r="1.2" fill="${c}"/>`,
  ],
};

export default rows;
