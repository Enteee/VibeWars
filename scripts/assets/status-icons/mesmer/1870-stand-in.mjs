import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Caster staples (#1870), stand-ins until their art card.
  // Hex: a weight on a foot, moving slower; the energy comes back after.
  "ethereal-burden": [
    "hex",
    (c) => `<path d="M8 5h8l2 7H6z" fill="${c}"/>` + `<path d="M12 12v4M7 19h10" ${stroke(c, 2)}/>`,
  ],
};

export default rows;
