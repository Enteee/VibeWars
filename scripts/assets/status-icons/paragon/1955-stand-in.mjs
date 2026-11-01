import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Paragon riders (#1955), stand-ins until their art card.
  // Skill: a plus between two wings, one death turned for the party.
  "angelic-bond": [
    "skill-effect",
    (c) =>
      `<path d="M12 8v8M8 12h8" ${stroke(c, 2.2)}/>` +
      `<path d="M6 7C3 9 2.5 13 4 16M18 7c3 2 3.5 6 2 9" ${stroke(c, 1.8)}/>`,
  ],
  // Shout: a forward arrow under a star, faster while enchanted.
  godspeed: [
    "shout",
    (c) =>
      `<path d="M5 16h12M13 12l4 4-4 4" ${stroke(c, 2.2)}/>` +
      `<path d="M12 3.5l1.2 2.6 2.8.3-2.1 1.9.6 2.7-2.5-1.4-2.5 1.4.6-2.7-2.1-1.9 2.8-.3z" ${stroke(c, 1.4)}/>`,
  ],
  // Shout: two chevrons forward, the way led.
  "lead-the-way": ["shout", (c) => `<path d="M6 6l6 6-6 6M12 6l6 6-6 6" ${stroke(c, 2.2)}/>`],
  // Shout: a hand raised with a plus, help on the way.
  help: [
    "shout",
    (c) =>
      `<path d="M8 20v-8M8 12V6M11 12V4.5M14 12V6M8 14c2 1 6 1 6-2" ${stroke(c, 1.8)}/>` +
      `<path d="M18 6v6M15 9h6" ${stroke(c, 2)}/>`,
  ],
  // Shout: a shield over a struck line, the knockdown turned aside.
  "brace-yourself": [
    "shout",
    (c) =>
      `<path d="M8 4h8v5c0 3-2 4.8-4 6-2-1.2-4-3-4-6z" ${stroke(c, 1.8)}/>` +
      `<path d="M4 19h16M7 17l-2 2M17 17l2 2" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
