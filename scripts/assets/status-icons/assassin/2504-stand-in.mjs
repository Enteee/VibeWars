import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Mechanics (#2504), stand-ins until their art card.
  // Hex: a wire pulled taut between two posts.
  "scorpion-wire": [
    "hex",
    (c) => `<path d="M8 9v7M16 9v7" ${stroke(c, 1.6)}/><path d="M8 11l8 3" ${stroke(c, 1.2)}/>`,
  ],
  // Two daggers side by side: a second strike.
  "locusts-fury": [
    "enchantment",
    (c) => `<path d="M10 8v8M14 8v8M8.500 13h3M12.500 13h3" ${stroke(c, 1.6)}/>`,
  ],
  // An eye over a blade that is no dagger: crits with any other weapon.
  "way-of-the-master": [
    "enchantment",
    (c) =>
      `<path d="M8 11q4-3 8 0q-4 3-8 0z" ${stroke(c, 1.4)}/><path d="M12 13v4" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
