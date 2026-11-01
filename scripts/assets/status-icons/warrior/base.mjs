import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Stance: two chevrons, forward: move 25% faster.
  sprint: ["stance", (c) => `<path d="M7 9l4.5 5L7 19M12.5 9l4.5 5-4.5 5" ${stroke(c, 2.5)}/>`],
  // Stance: three quick slashes: attack faster, take double damage (#919).
  frenzy: [
    "stance",
    (c) => `<path d="M6.5 18l3-8.5M10.5 18l3-8.5M14.5 18l3-8.5" ${stroke(c, 2.2)}/>`,
  ],
  // Stance: a shield with a plus, Energy for each melee block (#1329).
  "bonettis-defense": [
    "stance",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M12 9v6M9 12h6" ${stroke(c, 2)}/>`,
  ],
  // Stance: an arrow glancing off a shield (#1329).
  "deflect-arrows": [
    "stance",
    (c) =>
      `<path d="M9 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M3 15l5-4-3-5" ${stroke(c, 2)}/>`,
  ],
  // Stance: a shield with a blade through it, blocks that cut back (#1329).
  "gladiators-defense": [
    "stance",
    (c) =>
      `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 2)}/>` +
      `<path d="M5 19L19 5" ${stroke(c, 2)}/>`,
  ],
  // Stance: a shield, filled, armor and blocks (#1329).
  "disciplined-stance": [
    "stance",
    (c) => `<path d="M7 6h10v5c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" fill="${c}"/>`,
  ],
  // Stance: a figure standing firm on a wide base, never knocked down (#1329).
  "balanced-stance": ["stance", (c) => `<path d="M12 5v9M6 19l6-5 6 5" ${stroke(c, 2.6)}/>`],
  // Shout: a shield with a warning mark, armor called for (#524).
  "watch-yourself": [
    "shout",
    (c) =>
      `<path d="M7 5.5h10v5.5c0 3-2.5 5-5 6.5C9.5 16 7 14 7 11z" ${stroke(c, 2)}/>` +
      `<path d="M12 8.5v3.5" ${stroke(c, 2.2)}/><circle cx="12" cy="14.6" r="1.1" fill="${c}"/>`,
  ],
  // Shout: two chevrons up, a strike and one more per hit (#936).
  "for-great-justice": [
    "shout",
    (c) => `<path d="M7.5 12l4.5-4.5 4.5 4.5M7.5 16.5l4.5-4.5 4.5 4.5" ${stroke(c, 2.2)}/>`,
  ],
  // Skill: two crossed blades, every sword attack cuts all round (#1354).
  "hundred-blades": [
    "skill-effect",
    (c) =>
      `<path d="M6 6l12 12M18 6L6 18" ${stroke(c, 2)}/>` +
      `<path d="M5 15l4 4M15 19l4-4" ${stroke(c, 2)}/>`,
  ],
  // Stance: three chevrons, a charge at 25% faster (#1359).
  rush: ["stance", (c) => `<path d="M4 9l4 5-4 5M10 9l4 5-4 5M16 9l4 5-4 5" ${stroke(c, 2)}/>`],
  // Skill effect: a heavy block on four short legs, armored and slow (#1359).
  "dolyak-signet": [
    "skill-effect",
    (c) =>
      `<rect x="5" y="7" width="14" height="7" rx="1.5" fill="${c}"/>` +
      `<path d="M7 14v5M10.5 14v5M13.5 14v5M17 14v5" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: a heart with a plus, more maximum Health (#1359).
  "endure-pain": [
    "skill-effect",
    (c) =>
      `<path d="M12 19.5l-6.5-6.5a3.8 3.8 0 0 1 6.5-4.5 3.8 3.8 0 0 1 6.5 4.5z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 10.5v5.5M9.2 13.2h5.6" ${stroke(c, 1.8)}/>`,
  ],
  // Stance: a bolt under a ceiling, energy per hit up to a cap (#1359).
  "warriors-endurance": [
    "stance",
    (c) =>
      `<path d="M13.5 7l-5 7h3.5l-1 6 5-7.5h-3.5z" fill="${c}"/>` +
      `<path d="M5 4.5h14" ${stroke(c, 2)}/>`,
  ],
  // Warrior staples (#1549, #1586): each matches its skill icon.
  // Stance: a flail, faster attacks, slower feet.
  flail: [
    "stance",
    (c) =>
      `<g transform="translate(4.8,5) scale(0.6)"><path d="M4 21L11 13M11 13C10.5 8 14 5.5 16.5 6" ${stroke(c, 2.6)}/><circle cx="18.5" cy="7.5" r="3.4" fill="${c}"/></g>`,
  ],
  // Stance: a heart held in a shield, more Health and armor.
  "defy-pain": [
    "stance",
    (c) =>
      `<g transform="translate(4.8,4.8) scale(0.6)"><path d="M12 2.5L20 5.5V12C20 16.5 16.5 19.5 12 21.5C7.5 19.5 4 16.5 4 12V5.5Z" ${stroke(c, 2.8)}/><path d="M12 17L8 12.8a2.4 2.4 0 0 1 4-2.6 2.4 2.4 0 0 1 4 2.6z" fill="${c}"/></g>`,
  ],
  // Skill effect: a shield with a blade leaving it, the next melee attack blocked and answered.
  riposte: [
    "skill-effect",
    (c) =>
      `<g transform="translate(3.6,3.6) scale(0.7)"><path d="M2.5 9L8 7L13.5 9V14.5C13.5 18.4 10.8 20 8 21.8C5.2 20 2.5 18.4 2.5 14.5Z" fill="${c}"/><path d="M14 10.5L21.5 3M13.5 5.5L18.5 10.5" ${stroke(c, 2.8)}/></g>`,
  ],
  // Skill effect: as Riposte, with a drop, the attacker bleeds.
  "deadly-riposte": [
    "skill-effect",
    (c) =>
      `<g transform="translate(3,3) scale(0.65)"><path d="M2.5 9L8 7L13.5 9V14.5C13.5 18.4 10.8 20 8 21.8C5.2 20 2.5 18.4 2.5 14.5Z" fill="${c}"/><path d="M14 10.5L21.5 3" ${stroke(c, 3)}/></g>` +
      `<path d="M17.5 13.5C17.5 13.5 14.5 17 14.5 18.8A3 3 0 0 0 20.5 18.8C20.5 17 17.5 13.5 17.5 13.5Z" fill="${c}"/>`,
  ],
  // Shout: sound arcs behind two chevrons, allies run faster.
  charge: [
    "shout",
    (c) =>
      `<path d="M5 9.5C6.5 10.8 6.5 13.2 5 14.5" ${stroke(c, 1.6)}/><path d="M10 7L14 12L10 17M14.5 7L18.5 12L14.5 17" ${stroke(c, 2)}/>`,
  ],
  // Stance: a chevron and rising bars, faster until the hit that gives adrenaline.
  "enraging-charge": [
    "stance",
    (c) =>
      `<g transform="translate(4.8,4.8) scale(0.6)"><path d="M8.5 5L14 12L8.5 19" ${stroke(c, 2.8)}/><path d="M16.5 19V15M19 19V11M21.5 19V7" ${stroke(c, 2.6)}/></g>`,
  ],
  // Warrior staples 2 (#1592, #1619): each matches its skill icon.
  // Skill effect: a shield beside a spark over a ground bar, the attacker knocked down.
  "shield-bash": [
    "skill-effect",
    (c) =>
      `<path d="M3 5h9v5c0 3-2 4.5-4.5 6C5 14.5 3 13 3 10z" ${stroke(c, 2)}/>` +
      `<path d="M16 6l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="${c}"/>` +
      `<path d="M14 17h8" ${stroke(c, 2.2)}/>`,
  ],
  // Stance: a shield with a down chevron, blocks and less damage.
  "shield-stance": [
    "stance",
    (c) =>
      `<path d="M6 3h12v7c0 4.5-3 7-6 9-3-2-6-4.5-6-9z" ${stroke(c, 2)}/>` +
      `<path d="M12 7v6M9 10.5l3 3 3-3" ${stroke(c, 2)}/>`,
  ],
  // Skill effect: rising bars under fast chevrons, adrenal skills recharge.
  "rage-of-the-ntouka": [
    "skill-effect",
    (c) =>
      `<path d="M5 20v-4M10 20v-7M15 20v-10M20 20V6" ${stroke(c, 2.6)}/>` +
      `<path d="M3 4l3 3-3 3M8 4l3 3-3 3" ${stroke(c, 1.8)}/>`,
  ],
  // Skill effect: a shield struck through, armor lost while the signet is
  // activated (#524).
  "healing-signet-armor": [
    "skill-effect",
    (c) =>
      `<path d="M8.5 6.5h7v4c0 2.2-1.8 3.7-3.5 4.8-1.7-1.1-3.5-2.6-3.5-4.8z" ${stroke(c, 1.8)}/>` +
      `<path d="M6.5 16.5l11-11" ${stroke(c, 2)}/>`,
  ],
  // Stance: five quick slashes, small: faster, each one weaker.
  flurry: [
    "stance",
    (c) => `<path d="M4 17l2-6M8 17l2-6M12 17l2-6M16 17l2-6M20 17l2-6" ${stroke(c, 1.6)}/>`,
  ],
};

export default rows;
