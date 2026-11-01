import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Caster staples 2 (#1872), stand-ins until their art card.
  // Stance: a shield struck by a bolt, armor against elements.
  "elemental-resistance": [
    "stance",
    (c) =>
      `<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" ${stroke(c, 2)}/>` +
      `<path d="M13 7l-3 5h4l-3 5" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
