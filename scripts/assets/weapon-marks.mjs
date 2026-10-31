// The riders of the Ritualist's weapon spells 3 (#1706), drawn once for the
// skill icon (ink, in the corner above the blade) and the status icon (the
// status colour). Each is a function of the colour, drawn in a 14-unit box at
// the top left. The shared blade says "weapon spell"; the mark says which.

import { stroke } from "./icon-kit.mjs";

/** A four-point-star burst for an interrupt, centred on a point. @param {number} cx @param {number} cy @param {number} r */
const burstAt = (cx, cy, r) =>
  Array.from({ length: 12 }, (_, i) => {
    const a = (Math.PI * i) / 6 - Math.PI / 2;
    const k = i % 2 === 0 ? r : r * 0.47;
    return `${i === 0 ? "M" : "L"}${(cx + k * Math.cos(a)).toFixed(2)} ${(cy + k * Math.sin(a)).toFixed(2)}`;
  }).join("") + "Z";

const SHIELD = "M8 1.5L12.5 3.2V7.5C12.5 10.4 10.5 12 8 13C5.5 12 3.5 10.4 3.5 7.5V3.2Z";
const BOLT = "M10 1.5L6 8H8.8L7.5 13L12 6.5H9Z";

/** @type {Readonly<Record<string, (c: string) => string>>} */
export const WEAPON_MARKS = {
  // Resilient: a shield with a plus, armour and regeneration while afflicted.
  resilient: (c) =>
    `<path d="${SHIELD}" ${stroke(c, 1.6)}/>` +
    `<path d="M8 4.8V10M5.4 7.4H10.6" ${stroke(c, 1.5)}/>`,
  // Ghostly: a shield drawn in dashes, a blow that passes through.
  ghostly: (c) => `<path d="${SHIELD}" ${stroke(c, 1.8)} stroke-dasharray="2.2 1.8"/>`,
  // Sundering: a shield with a crack through it, armour split.
  sundering: (c) =>
    `<path d="${SHIELD}" ${stroke(c, 1.6)}/>` +
    `<path d="M8.5 2.5L6.5 6.5L9.5 8L7.5 12" ${stroke(c, 1.6)}/>`,
  // Shadow: an eye struck through, blinded.
  shadow: (c) =>
    `<path d="M1.5 7C3.5 3.5 5.5 3 7.5 3S11.5 3.5 13.5 7C11.5 10.5 9.5 11 7.5 11S3.5 10.5 1.5 7Z" ${stroke(c, 1.5)}/>` +
    `<path d="M2.5 12.5L12.5 1.5" ${stroke(c, 1.8)}/>`,
  // Warmonger's: a burst over a flat bar, a foe at rest interrupted.
  warmongers: (c) =>
    `<path d="${burstAt(7.5, 5.5, 5)}" fill="${c}"/>` +
    `<path d="M2.5 12.5H12.5" ${stroke(c, 2)}/>`,
  // Wailing: a burst with a swing arc behind it, a foe mid-attack interrupted.
  wailing: (c) =>
    `<path d="${burstAt(9, 7, 5)}" fill="${c}"/>` +
    `<path d="M3 12A8 8 0 0 1 3 2" ${stroke(c, 1.8)}/>`,
  // Nightmare: a hollow drop with a down chevron, less damage and Health stolen.
  nightmare: (c) =>
    `<path d="M8 1.5C8 1.5 3.5 6.2 3.5 9A4.5 4.5 0 0 0 12.5 9C12.5 6.2 8 1.5 8 1.5Z" ${stroke(c, 1.5)}/>` +
    `<path d="M5.8 7.8L8 10.3L10.2 7.8" ${stroke(c, 1.5)}/>`,
  // Fury: two rising bars and a bolt, adrenaline and Energy on a hit.
  fury: (c) =>
    `<path d="M2.5 13V10M5.5 13V7" ${stroke(c, 2)}/>` + `<path d="${BOLT}" fill="${c}"/>`,
  // Renewal: a bolt inside a ring, Energy back.
  renewal: (c) =>
    `<circle cx="8" cy="7.5" r="5.5" ${stroke(c, 1.6)}/>` +
    `<path d="M9 3.2L6 8H8L7 11.8L10.2 6.8H8.2Z" fill="${c}"/>`,
};
