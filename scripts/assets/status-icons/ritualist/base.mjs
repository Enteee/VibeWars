import { stroke } from "../../icon-kit.mjs";
import { WEAPON_MARKS } from "../../weapon-marks.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Weapon spell: a sword, held up, warded (#758).
  "weapon-of-warding": [
    "weapon-spell",
    (c) => `<path d="M12 4.5v10M8.5 14.5h7M12 14.5v4" ${stroke(c, 2.5)}/>`,
  ],
  // Weapon spell: Warding's blade with a plus beside it, health every second (#975).
  "spirit-light-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M17 5v6M14 8h6" ${stroke(c, 2)}/>`,
  ],
  // Weapon spell: the blade with a turning arrow, spells back sooner (#975).
  "weapon-of-quickening": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M15 6.5a3.5 3.5 0 1 1 0 5M15 6.5l-1.5-1.5M15 6.5l-1.5 1.5" ${stroke(c, 1.8)}/>`,
  ],
  // Weapon spell: the blade with two chevrons, attacks faster (#975).
  "weapon-of-aggression": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M14.5 6l3 3-3 3M17 6l3 3-3 3" ${stroke(c, 1.8)}/>`,
  ],
  // Weapon spell: a blade and a drop drawn back, steals and cleanses (#1022).
  "weapon-of-remedy": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M17 4.5c-1.8 2.4-2.5 3.6-2.5 4.6a2.5 2.5 0 0 0 5 0c0-1-.7-2.2-2.5-4.6z" ${stroke(c, 1.5)}/>` +
      `<path d="M13.5 4L20.5 11.5" ${stroke(c, 1.6)}/>`,
  ],
  // Weapon spell: a blade and a hook turning back, steals from who hurt it (#1022).
  "vengeful-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M20 6h-3.5a2.5 2.5 0 0 0 0 5H19M15 4.5L13.5 6 15 7.5" ${stroke(c, 1.8)}/>`,
  ],
  // Weapon spell: a blade and splinters flying off, splashes the adjacent (#1022).
  "splinter-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M10 4.5v10M6.5 14.5h7M10 14.5v4" ${stroke(c, 2.5)}/>` +
      `<path d="M14 4.5l3.5-1-.5 3zM18 7.5l3.5-1-1 3.5zM14.5 10.5l3.5-.5-1 3z" fill="${c}"/>`,
  ],
  // Skill effect: two regeneration arrows, Recuperation's +2 (#1064).
  recuperation: ["skill-effect", (c) => `<path d="M7 13l3-3 3 3M11 13l3-3 3 3" ${stroke(c, 2)}/>`],
  // Skill effect: a roof over a bar, no blow takes more than 10% (#1265).
  shelter: [
    "skill-effect",
    (c) => `<path d="M6 12l6-5 6 5" ${stroke(c, 2.2)}/>` + `<path d="M8 16h8" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: two links, damage taken shared with the spirit (#1265).
  union: [
    "skill-effect",
    (c) =>
      `<circle cx="9.5" cy="12" r="3" ${stroke(c, 2)}/><circle cx="14.5" cy="12" r="3" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: an arrow turned aside, a blocked attack (#1265).
  displacement: ["skill-effect", (c) => `<path d="M5 12h6l3-4M14 8h3M14 8v3" ${stroke(c, 2)}/>`],
  // Skill effect: a body flat on a ground line, held down longer (#1265).
  earthbind: [
    "skill-effect",
    (c) => `<path d="M6 13h12" ${stroke(c, 2.2)}/>` + `<path d="M6 17h12" ${stroke(c, 2)}/>`,
  ],
  // Ritualist spirits (#1550, #1622).
  // Skill effect: a wave pressed flat, adrenaline built half as fast.
  soothing: [
    "skill-effect",
    (c) =>
      `<path d="M5 9c2-3 4-3 7 0s5 3 7 0" ${stroke(c, 2)}/><path d="M5 16h14" ${stroke(c, 2.4)}/>`,
  ],
  // Weapon spell: a blade, a bar capping the blow, a drop lost by the attacker.
  "xinraes-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M6 19L16 9M7.5 13.5l4 4" ${stroke(c, 2.4)}/>` +
      `<path d="M10 4.5h8" ${stroke(c, 2.2)}/>` +
      `<path d="M19 11c0 0-2.5 2.6-2.5 4.1a2.5 2.5 0 0 0 5 0C21.5 13.6 19 11 19 11z" fill="${c}"/>`,
  ],
  // Ritualist weapon spells 3 (#1654, #1706): the blade and the rider its skill icon shows.
  // Weapon spell: a blade over a plus, regeneration and armour while afflicted.
  "resilient-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M6 19L16 9M7.5 13.5l4 4" ${stroke(c, 2.4)}/>` +
      `<g transform="translate(9.5,0.5) scale(0.8)">${WEAPON_MARKS.resilient(c)}</g>`,
  ],
  // Weapon spell: a blade through a broken bar, one blow past the block.
  "ghostly-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M6 19L16 9M7.5 13.5l4 4" ${stroke(c, 2.4)}/>` +
      `<g transform="translate(9.5,0.5) scale(0.8)">${WEAPON_MARKS.ghostly(c)}</g>`,
  ],
  // Weapon spell: a blade through two broken bars, every blow past the block.
  "guided-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M6 19L16 9M7.5 13.5l4 4" ${stroke(c, 2.4)}/>` +
      `<path d="M20 4.5V9.5M20 9.5H23.5" ${stroke(c, 1.4)}/>` +
      `<g transform="translate(9.5,0.5) scale(0.8)">${WEAPON_MARKS.ghostly(c)}</g>`,
  ],
  // Weapon spell: a blade and a cracked plate, armour split three times.
  "sundering-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M6 19L16 9M7.5 13.5l4 4" ${stroke(c, 2.4)}/>` +
      `<g transform="translate(9.5,0.5) scale(0.8)">${WEAPON_MARKS.sundering(c)}</g>`,
  ],
  // Weapon spell: a blade under a closed eye, its striker and its victims blinded.
  "weapon-of-shadow": [
    "weapon-spell",
    (c) =>
      `<path d="M6 19L16 9M7.5 13.5l4 4" ${stroke(c, 2.4)}/>` +
      `<g transform="translate(9.5,0.5) scale(0.8)">${WEAPON_MARKS.shadow(c)}</g>`,
  ],
  // Weapon spell: a blade and a lightning break, a still foe interrupted.
  "warmongers-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M6 19L16 9M7.5 13.5l4 4" ${stroke(c, 2.4)}/>` +
      `<g transform="translate(9.5,0.5) scale(0.8)">${WEAPON_MARKS.warmongers(c)}</g>`,
  ],
  // Weapon spell: a blade and two crossed strokes, an attacking foe interrupted.
  "wailing-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M6 19L16 9M7.5 13.5l4 4" ${stroke(c, 2.4)}/>` +
      `<g transform="translate(9.5,0.5) scale(0.8)">${WEAPON_MARKS.wailing(c)}</g>`,
  ],
  // Weapon spell: a blade and a falling drop, less damage, Health stolen.
  "nightmare-weapon": [
    "weapon-spell",
    (c) =>
      `<path d="M6 19L16 9M7.5 13.5l4 4" ${stroke(c, 2.4)}/>` +
      `<g transform="translate(9.5,0.5) scale(0.8)">${WEAPON_MARKS.nightmare(c)}</g>`,
  ],
  // Weapon spell: a blade and rising bars, adrenaline twice as fast.
  "weapon-of-fury": [
    "weapon-spell",
    (c) =>
      `<path d="M6 19L16 9M7.5 13.5l4 4" ${stroke(c, 2.4)}/>` +
      `<g transform="translate(9.5,0.5) scale(0.8)">${WEAPON_MARKS.fury(c)}</g>`,
  ],
  // Weapon spell: a blade and a turning arrow, Energy back on an attack skill.
  "weapon-of-renewal": [
    "weapon-spell",
    (c) =>
      `<path d="M6 19L16 9M7.5 13.5l4 4" ${stroke(c, 2.4)}/>` +
      `<g transform="translate(9.5,0.5) scale(0.8)">${WEAPON_MARKS.renewal(c)}</g>`,
  ],
  // Your spirits within earshot (#1777, #1848).
  // Skill effect: a fang with a drained drop under it and a minus bar: less damage, Health stolen.
  "spiritleech-aura": [
    "skill-effect",
    (c) =>
      `<g transform="translate(5.5,6) scale(0.52)">` +
      `<path d="M6 3h12l-6 9z" fill="${c}"/>` +
      `<path d="M12 14c-1.6 2-2.6 3.3-2.6 4.4a2.6 2.6 0 0 0 5.2 0C14.6 17.3 13.6 16 12 14z" fill="${c}"/>` +
      `<path d="M17.5 19h5" ${stroke(c, 3)}/></g>`,
  ],
  // The PvP Communing pair (#1827, #1874), echoing their skill icons.
  // Enchantment: an armour plate with a binding post cut out of it.
  "armor-of-unfeeling": [
    "enchantment",
    (c) =>
      `<path fill-rule="evenodd" fill="${c}" d="M12 3L19 6V12C19 16 16 18.8 12 20.5C8 18.8 5 16 5 12V6ZM9.8 9a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0ZM10.3 12.2H13.7L14.3 16.5H9.7Z"/>`,
  ],
  // Skill effect: a fist inside the dashed edge it fades to.
  "signet-of-ghostly-might": [
    "skill-effect",
    (c) =>
      `<rect x="3" y="3" width="18" height="18" rx="4" ${stroke(c, 1.6)} stroke-dasharray="3 2.6"/>` +
      `<path d="M7.5 11.5H16.5V16Q16.5 17.5 15 17.5H9Q7.5 17.5 7.5 16Z" fill="${c}"/>` +
      [9, 11.2, 13.4, 15.6]
        .map((x) => `<circle cx="${String(x)}" cy="10.8" r="1.4" fill="${c}"/>`)
        .join(""),
  ],
  // Hex: two links and a spike, spirits' attacks hurt more (#1270).
  "painful-bond": [
    "hex",
    (c) =>
      `<circle cx="9.5" cy="13" r="3" ${stroke(c, 2)}/><circle cx="14.5" cy="13" r="3" ${stroke(c, 2)}/>` +
      `<path d="M12 4.5v4" ${stroke(c, 2.2)}/>`,
  ],
  // Hex: a falling tear over a low line, degeneration (#1270).
  lamentation: [
    "hex",
    (c) =>
      `<path d="M12 5c-2 2.8-3.5 4.6-3.5 6.4a3.5 3.5 0 0 0 7 0C15.5 9.6 14 7.8 12 5z" fill="${c}"/>` +
      `<path d="M7 18.5l5-1.5l5 1.5" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a sprout and a plus, each creature made heals you (#1316).
  "boon-of-creation": [
    "enchantment",
    (c) =>
      `<path d="M12 19v-7M12 12c-3 0-5-2-5-5c3 0 5 2 5 5zM12 12c3 0 5-2 5-5c-3 0-5 2-5 5z" ${stroke(c, 2)}/>`,
  ],
  // Enchantment: a sprout bursting into rays, lightning round each new creature (#1316).
  "explosive-growth": [
    "enchantment",
    (c) =>
      `<path d="M12 19v-6" ${stroke(c, 2.2)}/><circle cx="12" cy="10" r="2.5" fill="${c}"/>` +
      `<path d="M12 4v2M6.5 6.5l1.5 1.5M17.5 6.5L16 8M5 11h2M17 11h2" ${stroke(c, 1.8)}/>`,
  ],
  // Enchantment: an open hand holding a plus, allies near each new creature healed (#1316).
  "spirits-gift": [
    "enchantment",
    (c) =>
      `<path d="M5 14c2 0 3 1 4 2h5c1 0 1.5-1.5 0-1.5h-3M5 18h9l5-4" ${stroke(c, 1.8)}/>` +
      `<path d="M13 5v6M10 8h6" ${stroke(c, 2.2)}/>`,
  ],
  // Ashes: a heart, more maximum Health.
  "generous-was-tsungrai": [
    "item",
    (c) => `<path d="M12 16l-4-4a2.3 2.3 0 0 1 4-3 2.3 2.3 0 0 1 4 3z" fill="${c}"/>`,
  ],
  // Ashes: a bar capping a hit.
  "defiant-was-xinrae": [
    "item",
    (c) => `<path d="M7 8h10M12 9v7M9.5 13.5L12 16l2.5-2.5" ${stroke(c, 1.8)}/>`,
  ],
  // Ashes: an eye struck out, foes blinded on the drop.
  "blind-was-mingson": [
    "item",
    (c) =>
      `<path d="M6 12c3-4 9-4 12 0-3 4-9 4-12 0z" ${stroke(c, 1.6)}/>` +
      `<path d="M7 16L17 8" ${stroke(c, 1.8)}/>`,
  ],
  // Ashes: a hand closing, foes knocked down on the drop.
  "grasping-was-kuurong": [
    "item",
    (c) => `<path d="M8 15V9M11 15V8M14 15V9M17 15v-4M7 15h11" ${stroke(c, 1.8)}/>`,
  ],
  // Ashes: a bolt, energy back.
  "energetic-was-lee-sa": ["item", (c) => `<path d="M13 6l-4 6h4l-2 5 5-7h-4z" fill="${c}"/>`],
  // Ashes: a spike through a plate, armor pierced.
  "cruel-was-daoshen": [
    "item",
    (c) => `<path d="M7 13h10M12 6v11M10 8l2-2 2 2" ${stroke(c, 1.8)}/>`,
  ],
  // Ashes: a bolt in a ring, lightning on all in the area.
  "destructive-was-glaive": [
    "item",
    (c) =>
      `<circle cx="12" cy="12" r="5" ${stroke(c, 1.4)}/>` +
      `<path d="M13 8l-3 4h3l-2 4" ${stroke(c, 1.6)}/>`,
  ],
  // Ashes: a level line, a cast nothing breaks.
  "tranquil-was-tanasen": ["item", (c) => `<path d="M7 10h10M7 14h10" ${stroke(c, 1.8)}/>`],
  // Ashes: a hook turned back on the striker.
  "vengeful-was-khanhei": ["item", (c) => `<path d="M8 8l8 8M16 8v4h-4" ${stroke(c, 1.8)}/>`],
  // Ashes: a drop running clear, conditions sooner gone.
  "pure-was-li-ming": [
    "item",
    (c) => `<path d="M12 7c-2 3-3 4.5-3 6a3 3 0 0 0 6 0c0-1.5-1-3-3-6z" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
