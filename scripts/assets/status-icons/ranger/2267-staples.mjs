import { stroke, fitRows } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Ranger staples (#2189, #2190), art #2267: each matches its skill icon.
  // Stance: a slit-pupilled eye over three claw gashes, attacks 25% faster.
  "tigers-fury": [
    "stance",
    (c) =>
      `<path d="M3 8c3-4.5 15-4.5 18 0-3 4.5-15 4.5-18 0z" ${stroke(c, 1.6)}/>` +
      `<path d="M12 4.8Q14 8 12 11.2Q10 8 12 4.8z" fill="${c}"/>` +
      `<path d="M6 15l-1 6M12 15v6M18 15l1 6" ${stroke(c, 2)}/>`,
  ],
  // Stance: a leaf over two rising bars, regeneration from suffering.
  "melandrus-resilience": [
    "stance",
    (c) =>
      `<path d="M3 14c0-6 4.5-10 11-10 0 7-3.5 11-11 10z" fill="${c}"/>` +
      `<path d="M15 21v-5M19.5 21v-9" ${stroke(c, 2.6)}/>`,
  ],
  // Preparation: a bow with its arrow nocked, cheaper and harder shots.
  "expert-focus": [
    "preparation",
    (c) =>
      `<path d="M6 4c9 4 9 12 0 16M6 4v16" ${stroke(c, 1.6)}/>` +
      `<path d="M3 12h13" ${stroke(c, 1.6)}/>` +
      `<path d="M21.5 12l-5.5-3v6z" fill="${c}"/>`,
  ],
  // Preparation: two arrows flying side by side.
  "rapid-fire": [
    "preparation",
    (c) =>
      `<path d="M2 8h12M2 16h12" ${stroke(c, 2)}/>` +
      `<path d="M21.5 8l-7-3.5v7zM21.5 16l-7-3.5v7z" fill="${c}"/>`,
  ],
};

/** Drawn smaller to sit inside the plate (#2417). */
const fits = {
  "tigers-fury": [0.96, 0],
  "melandrus-resilience": [0.94, 0],
  "expert-focus": [0.74, 3],
  "rapid-fire": [0.7, 5],
};

export default fitRows(rows, fits);
