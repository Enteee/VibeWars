/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Assassin staples 6 (#2233), art #2252: the skill's caltrop, a foe slowed.
  // Hex: a four-spiked caltrop, it moves 50% slower.
  "hidden-caltrops": [
    "hex",
    (c) =>
      `<path d="M12 3.5L14.6 9.4L20.5 12L14.6 14.6L12 20.5L9.4 14.6L3.5 12L9.4 9.4Z" fill="${c}"/>`,
  ],
};

export default rows;
