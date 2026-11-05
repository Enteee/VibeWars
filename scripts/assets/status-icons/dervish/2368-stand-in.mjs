import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Staples (#2368), stand-ins until their art card.
  // Enchantment: a cross over spores, Disease cured as it ends.
  "mystic-corruption": [
    "enchantment",
    (c) =>
      `<path d="M12 4v16M4 12h16" ${stroke(c, 2)}/>` +
      `<circle cx="6" cy="6" r="1.5" fill="${c}"/><circle cx="18" cy="18" r="1.5" fill="${c}"/>` +
      `<circle cx="18" cy="6" r="1.5" fill="${c}"/>`,
  ],
};

export default rows;
