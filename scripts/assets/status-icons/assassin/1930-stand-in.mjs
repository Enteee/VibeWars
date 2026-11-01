import { stepAndReturn, stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Shadow step 2 (#1930), stand-ins until their art card.
  recall: [
    "enchantment",
    (c) =>
      `<g transform="translate(12,12) scale(0.55) translate(-12,-12)">${stepAndReturn("aura", c, 3.2)}</g>`,
  ],
  "dark-prison": [
    "hex",
    (c) =>
      `<path d="M7 5v14M12 5v14M17 5v14" ${stroke(c, 2)}/>` +
      `<path d="M5 5h14M5 19h14" ${stroke(c, 1.8)}/>`,
  ],
  "shadow-walk": [
    "stance",
    (c) =>
      `<g transform="translate(12,12) scale(0.55) translate(-12,-12)">${stepAndReturn("haste", c, 3.2)}</g>`,
  ],
};

export default rows;
