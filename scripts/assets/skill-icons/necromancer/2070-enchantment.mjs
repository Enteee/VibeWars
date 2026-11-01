/** @type {Readonly<Record<string, import("../../skill-icon-table.mjs").SkillIconRow>>} */
const rows = {
  // Enchantment removal (#2070): the broken ring. Blood orders: one drop, what the party gains.
  "necromancer.order-of-apostasy": { glyph: "skull-order", modifier: "unring" },
  "necromancer.jaundiced-gaze": { glyph: "eye", modifier: "unring" },
  "necromancer.order-of-the-vampire": { glyph: "order-drop", modifier: "plus" },
  "necromancer.dark-fury": { glyph: "order-drop", modifier: "up" },
  "necromancer.awaken-the-blood": { glyph: "drop-plus", modifier: "up" },
  "necromancer.soul-leech": { glyph: "drop-siphon", modifier: "bolt" },
};

export default rows;
