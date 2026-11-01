/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Paragon chants 2 (#1483), stand-ins until the asset-designer's.
  // Chant: a bolt, energy with your next attack skill.
  "zealous-anthem": ["chant", (c) => `<path d="M13 3L7 12h4l-1 7 6-9h-4z" fill="${c}"/>`],
};

export default rows;
