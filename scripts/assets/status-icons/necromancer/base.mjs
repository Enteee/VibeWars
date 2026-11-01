import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Hex: a heart, because the hex is on your life and your nerve.
  faintheartedness: [
    "hex",
    (c) => `<path d="M12 16l-3.6-3.6a2.1 2.1 0 0 1 3.6-3 2.1 2.1 0 0 1 3.6 3z" fill="${c}"/>`,
  ],
  // Enchantment: a dot spreading to three, a condition handed on (#887).
  contagion: [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="13" r="2.5" fill="${c}"/>` +
      `<circle cx="12" cy="6" r="1.6" fill="${c}"/>` +
      `<circle cx="6" cy="17" r="1.6" fill="${c}"/>` +
      `<circle cx="18" cy="17" r="1.6" fill="${c}"/>`,
  ],
  // Enchantment: a drop with a plus cut out, blood paying for energy (#503).
  "blood-ritual": [
    "enchantment",
    (c) =>
      `<path fill-rule="evenodd" d="M12 4.5C14.5 8 17 10.5 17 14a5 5 0 0 1-10 0c0-3.5 2.5-6 5-9.5zM11 11.5h2v2.5h2.5v2H13v2.5h-2V16H8.5v-2H11z" fill="${c}"/>`,
  ],
  // Hex: a bolt in outline, the energy draining out (#503).
  malaise: ["hex", (c) => `<path d="M13 4.5L7.5 13h4l-1 6.5L16.5 11h-4z" ${stroke(c, 2)}/>`],
  // Hex: two links of a chain, the bond that heals its caster when it ends (#887).
  "parasitic-bond": [
    "hex",
    (c) =>
      `<rect x="5" y="9.5" width="8" height="5" rx="2.5" ${stroke(c, 2)}/>` +
      `<rect x="11" y="9.5" width="8" height="5" rx="2.5" ${stroke(c, 2)}/>`,
  ],
  // Hex: two chevrons pointing back, attacks slowed (#918).
  "shadow-of-fear": [
    "hex",
    (c) => `<path d="M14.5 8L11 12l3.5 4M11 8L7.5 12l3.5 4" ${stroke(c, 2)}/>`,
  ],
  // Hex: a burst with a dot at its heart, the spirit striking out (#935).
  "spiteful-spirit": [
    "hex",
    (c) =>
      `<circle cx="12" cy="12.5" r="2" fill="${c}"/>` +
      `<path d="M12 5.5v2.5M12 17v2.5M5 12.5h2.5M16.5 12.5H19M7 7.5l1.8 1.8M15.2 15.7L17 17.5M17 7.5l-1.8 1.8M8.8 15.7L7 17.5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a drop drawn off by an arrow, health stolen on each hit (#935).
  "insidious-parasite": [
    "hex",
    (c) =>
      `<path d="M10 6c2 3 3.5 4.8 3.5 7a3.5 3.5 0 0 1-7 0c0-2.2 1.5-4 3.5-7z" fill="${c}"/>` +
      `<path d="M14.5 10.5h4M16.5 8.5l2 2-2 2" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a cross with two rings beside it, pain passed to who stands near (#935).
  "mark-of-pain": [
    "hex",
    (c) =>
      `<path d="M10 9.5l4 4M14 9.5l-4 4" ${stroke(c, 2.2)}/>` +
      `<circle cx="6.5" cy="15.5" r="1.5" ${stroke(c, 1.5)}/>` +
      `<circle cx="17.5" cy="15.5" r="1.5" ${stroke(c, 1.5)}/>`,
  ],
  // Skill effect: two degeneration arrows over a ground line, Well of
  // Suffering's -5 to the foes inside it (#1104).
  "well-of-suffering": [
    "skill-effect",
    (c) =>
      `<path d="M7 8l3 3 3-3M11 8l3 3 3-3" ${stroke(c, 2)}/>` +
      `<path d="M5 18.5h14" ${stroke(c, 2.2)}/>`,
  ],
  // Wells 2 (#1749): the skills' shapes.
  // Skill effect: a struck-through ring, no enchantment holds.
  "well-of-the-profane": [
    "skill-effect",
    (c) =>
      `<ellipse cx="12" cy="19" rx="8.5" ry="3" ${stroke(c, 2.2)}/>` +
      `<circle cx="12" cy="9" r="5.5" ${stroke(c, 2)}/><path d="M7 15L16.5 5.5" ${stroke(c, 2.2)}/>`,
  ],
  // Skill effect: a struck-through horn, no shout or chant.
  "well-of-silence": [
    "skill-effect",
    (c) =>
      `<ellipse cx="12" cy="19" rx="7.5" ry="3" ${stroke(c, 2.2)}/>` +
      `<path d="M9 6C13 9.5 13 12.5 9 16" ${stroke(c, 2.6)}/><path d="M6.5 15L16 5.5" ${stroke(c, 2.6)}/>`,
  ],
  // Skill effect: a pupil in a dark eye, the hexed miss.
  "well-of-darkness": [
    "skill-effect",
    (c) =>
      `<ellipse cx="12" cy="19" rx="7.5" ry="3" ${stroke(c, 2.2)}/>` +
      `<path d="M3.5 9.5C6 5 9 3.5 12 3.5S18 5 20.5 9.5C18 14 15 15.5 12 15.5S6 14 3.5 9.5Z" ${stroke(c, 2)}/>` +
      `<circle cx="9.5" cy="9.5" r="2.4" fill="${c}"/><path d="M15 7v5M18 8v3" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a cracked shield, armor cracking under each hit.
  "well-of-ruin": [
    "skill-effect",
    (c) =>
      `<ellipse cx="12" cy="19" rx="8.5" ry="3" ${stroke(c, 2.2)}/>` +
      `<path d="M12 2.5L19 5V10C19 13 16 15 12 16.5C8 15 5 13 5 10V5Z" ${stroke(c, 2)}/>` +
      `<path d="M12 3L10 7.5L13.5 10L11 15" ${stroke(c, 1.6)}/>`,
  ],
  // Skill effects inside the wells of #1730, the skills' shapes: the
  // ring under a plus, a plus and a bolt, a sinking bolt.
  "well-of-blood": [
    "skill-effect",
    (c) =>
      `<ellipse cx="12" cy="18" rx="9" ry="3.5" ${stroke(c, 2)}/>` +
      `<path d="M12 3v10M7 8h10" ${stroke(c, 2.6)}/>`,
  ],
  "well-of-power": [
    "skill-effect",
    (c) =>
      `<ellipse cx="12" cy="18" rx="9" ry="3.5" ${stroke(c, 2)}/>` +
      `<path d="M7 4v8M3 8h8" ${stroke(c, 2.4)}/>` +
      `<path d="M18 2.5l-4.5 7h3l-1.5 5 5-7h-3z" fill="${c}"/>`,
  ],
  "well-of-weariness": [
    "skill-effect",
    (c) =>
      `<ellipse cx="12" cy="18" rx="9" ry="3.5" ${stroke(c, 2)}/>` +
      `<path d="M10 2L4.5 10h3.5L6.5 15l5.5-8h-3.5z" fill="${c}"/>` +
      `<path d="M17 5v7M14 9.5l3 3.5 3-3.5" ${stroke(c, 2.2)}/>`,
  ],
  // Hex: a barbed line, physical hits hurt more (#1332).
  barbs: [
    "hex",
    (c) =>
      `<path d="M4 12h16" ${stroke(c, 2)}/>` +
      `<path d="M7 12l2-4M11 12l2-4M15 12l2-4M9 12l-2 4M13 12l-2 4M17 12l-2 4" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a cross over a falling line, a miss that hurts (#1332).
  "price-of-failure": [
    "hex",
    (c) =>
      `<path d="M8 5l8 8M16 5l-8 8" ${stroke(c, 2.2)}/>` + `<path d="M12 15v4.5" ${stroke(c, 2)}/>`,
  ],
  // Hex: three falling drops, degeneration on a crowd (#1332).
  suffering: [
    "hex",
    (c) =>
      `<path d="M7 6c-1.2 1.8-2 2.9-2 4a2 2 0 0 0 4 0c0-1.1-.8-2.2-2-4z" fill="${c}"/>` +
      `<path d="M17 6c-1.2 1.8-2 2.9-2 4a2 2 0 0 0 4 0c0-1.1-.8-2.2-2-4z" fill="${c}"/>` +
      `<path d="M12 11c-1.2 1.8-2 2.9-2 4a2 2 0 0 0 4 0c0-1.1-.8-2.2-2-4z" fill="${c}"/>`,
  ],
  // Hex: a plus with a third cut away, less healing (#1332).
  "defile-flesh": [
    "hex",
    (c) =>
      `<path d="M12 5v14M5 12h9" ${stroke(c, 2.6)}/>` + `<path d="M16 12h3" ${stroke(c, 1.4)}/>`,
  ],
  // Hex: a shield struck through, cannot block (#1332).
  "rigor-mortis": [
    "hex",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M5 19L19 5" ${stroke(c, 2.2)}/>`,
  ],
  // Hex: a drop beside a small plus, degeneration and less healing (#1332).
  "lingering-curse": [
    "hex",
    (c) =>
      `<path d="M9 5c-2 2.8-3.5 4.6-3.5 6.4a3.5 3.5 0 0 0 7 0C12.5 9.6 11 7.8 9 5z" fill="${c}"/>` +
      `<path d="M17 13v6M14 16h6" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a barbed line under a spark, any hex or enchantment hurts (#1403).
  "soul-barbs": [
    "hex",
    (c) =>
      `<path d="M4 15h16" ${stroke(c, 2)}/>` +
      `<path d="M7 15l2-3M11 15l2-3M15 15l2-3" ${stroke(c, 1.6)}/>` +
      `<path d="M12 4v5M9.5 6.5h5" ${stroke(c, 1.8)}/>`,
  ],
  // Hex: a shield with a bolt, the next block hurts (#1403).
  "defile-defenses": [
    "hex",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M13 7l-3 4h4l-3 4" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a blade over a drop, every party blow cuts deeper.
  "order-of-pain": [
    "enchantment",
    (c) =>
      `<path d="M5 13L14 4" ${stroke(c, 2.2)}/>` +
      `<path d="M15 11c2 3 3.5 4.5 3.5 6.5a3.5 3.5 0 0 1-7 0c0-2 1.5-3.5 3.5-6.5z" fill="${c}"/>`,
  ],
  // Necromancer staples 2 (#1583).
  // Hex: a hollow drop over two falling arrows, health and energy wither away.
  wither: [
    "hex",
    (c) =>
      `<path d="M12 3c2.5 3.5 4 5.5 4 8a4 4 0 0 1-8 0c0-2.5 1.5-4.5 4-8z" ${stroke(c, 1.8)}/>` +
      `<path d="M7 16v4M5 18l2 2 2-2M17 16v4M15 18l2 2 2-2" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a drop drawn off sideways, health siphoned to the caster.
  "life-siphon": [
    "hex",
    (c) =>
      `<path d="M9 4c2.5 3.5 4 5.5 4 8a4 4 0 0 1-8 0c0-2.5 1.5-4.5 4-8z" fill="${c}"/>` +
      `<path d="M14 15h6M17.5 12.5L20 15l-2.5 2.5" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a drop over three rising arrows, the siphoned health returning.
  "life-siphon-regen": [
    "skill-effect",
    (c) =>
      `<path d="M12 3c2 3 3.5 4.5 3.5 6.5a3.5 3.5 0 0 1-7 0C8.5 7.5 10 6 12 3z" fill="${c}"/>` +
      `<path d="M6 19.5l2.5-2.5 2.5 2.5M10 19.5l2.5-2.5 2.5 2.5M14 19.5l2.5-2.5 2.5 2.5" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a struck-through blade trailing speed lines, fast swings that miss.
  "reckless-haste": [
    "hex",
    (c) =>
      `<path d="M8 17L18 7" ${stroke(c, 2.2)}/><path d="M7 7l10 10" ${stroke(c, 1.6)}/>` +
      `<path d="M3 12h3M4 15.5h3M5 19h3" ${stroke(c, 1.6)}/>`,
  ],
  // Hex: a broken ring over a falling arrow, the enchantment turned to rot.
  "corrupt-enchantment": [
    "hex",
    (c) =>
      `<path d="M8 5.5A6 6 0 1 0 16 5.5" ${stroke(c, 1.8)}/>` +
      `<path d="M12 3v8M9.5 8.5L12 11l2.5-2.5" ${stroke(c, 1.8)}/>`,
  ],
  // Death triggers (#1762, #1832): a skull, and what its death gives: Energy, bile, cold.
  "reapers-mark": [
    "hex",
    (c) =>
      `<g transform="translate(12,12) scale(0.55) translate(-13,-13)">` +
      `<path d="M8 3.5a4.5 4.5 0 0 0-4.5 4.5c0 1.6.8 2.7 2 3.4V14H10.5V11.4c1.2-.7 2-1.8 2-3.4A4.5 4.5 0 0 0 8 3.5z" ${stroke(c, 3.2)}/>` +
      `<circle cx="6.2" cy="8" r="1.1" fill="${c}"/><circle cx="9.8" cy="8" r="1.1" fill="${c}"/>` +
      `<path d="M18 9L12.5 17H17L15.5 23L22 14H17.5Z" fill="${c}"/>` +
      `</g>`,
  ],
  "putrid-bile": [
    "hex",
    (c) =>
      `<g transform="translate(12,12) scale(0.55) translate(-13,-13)">` +
      `<path d="M8 3.5a4.5 4.5 0 0 0-4.5 4.5c0 1.6.8 2.7 2 3.4V14H10.5V11.4c1.2-.7 2-1.8 2-3.4A4.5 4.5 0 0 0 8 3.5z" ${stroke(c, 3.2)}/>` +
      `<circle cx="6.2" cy="8" r="1.1" fill="${c}"/><circle cx="9.8" cy="8" r="1.1" fill="${c}"/>` +
      `<path d="M17 11c2.2 2.8 3.6 4.6 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-1.8 1.4-3.6 3.6-6.4z" fill="${c}"/>` +
      `<circle cx="13" cy="22" r="1.3" fill="${c}"/><circle cx="21.5" cy="22.3" r="1.3" fill="${c}"/>` +
      `</g>`,
  ],
  "icy-veins": [
    "hex",
    (c) =>
      `<g transform="translate(12,12) scale(0.55) translate(-13,-13)">` +
      `<path d="M8 3.5a4.5 4.5 0 0 0-4.5 4.5c0 1.6.8 2.7 2 3.4V14H10.5V11.4c1.2-.7 2-1.8 2-3.4A4.5 4.5 0 0 0 8 3.5z" ${stroke(c, 3.2)}/>` +
      `<circle cx="6.2" cy="8" r="1.1" fill="${c}"/><circle cx="9.8" cy="8" r="1.1" fill="${c}"/>` +
      `<path d="M17.5 11V23M12.3 14L22.7 20M12.3 20L22.7 14" ${stroke(c, 3.2)}/>` +
      `</g>`,
  ],
  // Hex: a sword bent down under a bar, attacks slowed.
  meekness: ["hex", (c) => `<path d="M5 6h14M12 9v10M9 16l3 3 3-3" ${stroke(c, 2.2)}/>`],
  // Hex: two links bound, a heal that hurts its healer.
  "soul-bind": [
    "hex",
    (c) =>
      `<path d="M9 9a3 3 0 1 0 0 6h2M15 15a3 3 0 1 0 0-6h-2" ${stroke(c, 2.2)}/>` +
      `<path d="M9 12h6" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a crowned skull, the lich.
  "aura-of-the-lich": [
    "enchantment",
    (c) =>
      `<path d="M6 8l2-4 2 3 2-3 2 3 2-3 2 4z" fill="${c}"/>` +
      `<circle cx="12" cy="14" r="5" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a drop passed along an arrow, a condition handed on.
  "infuse-condition": [
    "enchantment",
    (c) =>
      `<path d="M7 5C9 8 10 10 10 11.5a3 3 0 0 1-6 0C4 10 5 8 7 5z" fill="${c}"/>` +
      `<path d="M12 15h8M17 12l3 3-3 3" ${stroke(c, 2)}/>`,
  ],
  // Hex: a shivering figure's lines over a snowflake, the same.
  "shivers-of-dread": [
    "hex",
    (c) =>
      `<path d="M12 6v12M7 9l10 6M17 9L7 15" ${stroke(c, 1.8)}/>` +
      `<path d="M4 4l2 2M20 4l-2 2M4 20l2-2M20 20l-2-2" ${stroke(c, 1.6)}/>`,
  ],
  // Enchantment: a burst from a skull's line, the dead ally bursts.
  "death-nova": [
    "enchantment",
    (c) =>
      `<circle cx="12" cy="12" r="3.5" ${stroke(c, 1.8)}/>` +
      `<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
