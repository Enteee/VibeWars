import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Enchantment: a flame over two sparks flying out, aiding an ally burns the foes round it.
  "zealots-fire": [
    "enchantment",
    (c) =>
      `<path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2.5-4.5.2 1.5.8 2 1.5 2.5-.2-2.2-.1-4 1-7z" ${stroke(c, 1.8)}/>` +
      `<path d="M3 20l3-2M21 20l-3-2M12 22v-2" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
