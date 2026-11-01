import { stroke } from "../../icon-kit.mjs";

/** @type {Readonly<Record<string, import("../../status-icon-table.mjs").StatusIconRow>>} */
const rows = {
  // Paragon echoes 2 (#1485, #1524): each pairs with its skill icon.
  // Echo: a blade glancing off a shield, slashing damage turned.
  "bladeturn-refrain": [
    "echo",
    (c) =>
      `<path d="M9 5h10v6c0 3.5-2.5 5.5-5 7-2.5-1.5-5-3.5-5-7z" ${stroke(c, 1.8)}/>` +
      `<path d="M2.5 4.5L7 9M7 9l-.3-2.8M7 9l2.8.3" ${stroke(c, 1.8)}/>`,
  ],
  // Echo: a bolt inside a ring, energy at the end of each chant.
  "energizing-finale": [
    "echo",
    (c) =>
      `<circle cx="12" cy="11.5" r="8" ${stroke(c, 1.6)}/>` +
      `<path d="M13 5.5L8.5 12h3.5l-1 5.5 4.5-6.5h-3.5z" fill="${c}"/>`,
  ],
  // Echo: three rising bars topped by a spike over a slanted blade, adrenaline and haste under a chant.
  "soldiers-fury": [
    "echo",
    (c) =>
      `<path d="M5 12V9M10 12V6" ${stroke(c, 2.4)}/>` +
      `<path d="M14 12V7l2.5-5L19 7v5z" fill="${c}"/>` +
      `<path d="M5 21L17 13M8 15.5l4 4" ${stroke(c, 2)}/>`,
  ],
  // Shout: an arrow turning back, run and be healed for it (#921).
  "fall-back": ["shout", (c) => `<path d="M17 12H7.5M11 8l-4 4 4 4" ${stroke(c, 2.5)}/>`],
  // Shout: a shield planted on the ground, armor while you stand (#921).
  "stand-your-ground": [
    "shout",
    (c) =>
      `<path d="M8 5h8v4.5c0 2.5-2 4-4 5.2-2-1.2-4-2.7-4-5.2z" ${stroke(c, 2)}/>` +
      `<path d="M6.5 18.5h11" ${stroke(c, 2.5)}/>`,
  ],
  // Shout: an arrow forward with a plus behind it, run and be healed (#956).
  incoming: [
    "shout",
    (c) =>
      `<path d="M11 12h7M15 8.5l3.5 3.5-3.5 3.5" ${stroke(c, 2.5)}/>` +
      `<path d="M7 9.5v5M4.5 12h5" ${stroke(c, 2)}/>`,
  ],
  // Shout: a double chevron, one ally hurried along (#956).
  "make-haste": ["shout", (c) => `<path d="M7 8l4 4-4 4M12.5 8l4 4-4 4" ${stroke(c, 2.5)}/>`],
  // Chant: a shield with a bar across it, blocks for the party (#956).
  "defensive-anthem": [
    "chant",
    (c) =>
      `<path d="M8 6h8v4.5c0 2.5-2 4-4 5.2-2-1.2-4-2.7-4-5.2z" ${stroke(c, 2)}/>` +
      `<path d="M9.5 10h5" ${stroke(c, 2)}/>`,
  ],
  // Chant: a banner with a note, healed on your next skill (#1012).
  "song-of-restoration": [
    "chant",
    (c) =>
      `<path d="M7 4V19.5" ${stroke(c, 2)}/>` +
      `<path d="M7 5H18.5L15 9.5L18.5 14H7Z" ${stroke(c, 1.6)}/>` +
      `<ellipse cx="10.8" cy="11" rx="1.6" ry="1.2" fill="${c}"/>` +
      `<path d="M12.3 11V7.5L14.5 8.4" ${stroke(c, 1.3)}/>`,
  ],
  // Chant: a flame, your next attack skill burns (#758). Burning's flame,
  // smaller and higher, clear of the banner's notch.
  "anthem-of-flame": [
    "chant",
    (c) =>
      `<path d="M14 3.5c.5 3.5 4 5.5 4 10a6 6 0 0 1-12 0c0-2.5 1-4.5 2.5-5.5 0 2 .5 3 1.5 3.5-.5-3 1-6 4-8z" fill="${c}" transform="translate(12 10) scale(0.7) translate(-12 -11.5)"/>`,
  ],
  // Chant: a bolt over a bar, energy with your next spell.
  "aria-of-zeal": [
    "chant",
    (c) =>
      `<path d="M13 3L8 10h3.5l-1 5 5-7H12z" fill="${c}"/>` +
      `<path d="M6 18h12" ${stroke(c, 2)}/>`,
  ],
  // Chant: a bolt in a ring, energy with your next signet.
  "lyric-of-zeal": [
    "chant",
    (c) =>
      `<circle cx="12" cy="11" r="7" ${stroke(c, 1.6)}/>` +
      `<path d="M13 6l-3.5 5h2.5l-1 4 3.5-5H12z" fill="${c}"/>`,
  ],
  // Chant: a plus over a bar, a heal with your next spell.
  "aria-of-restoration": [
    "chant",
    (c) => `<path d="M12 4v10M7 9h10" ${stroke(c, 2.6)}/>` + `<path d="M6 18h12" ${stroke(c, 2)}/>`,
  ],
  // Chant: a plus between two bars, a heal with your next shout or chant.
  "chorus-of-restoration": [
    "chant",
    (c) =>
      `<path d="M12 7v10M7 12h10" ${stroke(c, 2.4)}/>` +
      `<path d="M5 4h14M5 20h14" ${stroke(c, 1.8)}/>`,
  ],
  // Chant: a drop in a ring, a condition lost with your next signet.
  "lyric-of-purification": [
    "chant",
    (c) =>
      `<circle cx="12" cy="12" r="7.5" ${stroke(c, 1.6)}/>` +
      `<path d="M12 6.5c1.5 2.2 3 3.8 3 5.5a3 3 0 0 1-6 0c0-1.7 1.5-3.3 3-5.5z" fill="${c}"/>`,
  ],
  // Chant: a drop crossed out over a bar, conditions lost with your next skills.
  "song-of-purification": [
    "chant",
    (c) =>
      `<path d="M12 3c2 3 4 5 4 7.5a4 4 0 0 1-8 0C8 8 10 6 12 3z" ${stroke(c, 1.8)}/>` +
      `<path d="M6 15L18 3M6 19h12" ${stroke(c, 1.8)}/>`,
  ],
  // Chant: a broken ring, a hex lost with your next spell.
  "hexbreaker-aria": [
    "chant",
    (c) => `<path d="M10 5.3A7 7 0 1 0 18.7 12M14 5.3A7 7 0 0 1 18.7 9" ${stroke(c, 2.2)}/>`,
  ],
  // Chant: three rising strokes, adrenaline with your next attack skill.
  "anthem-of-fury": ["chant", (c) => `<path d="M6 18V13M12 18V9M18 18V5" ${stroke(c, 2.6)}/>`],
  // Chant: an arrow down, your next attack skill weakens.
  "anthem-of-weariness": ["chant", (c) => `<path d="M12 4v13M7 12l5 5 5-5" ${stroke(c, 2.4)}/>`],
  // Chant: a bent leg, your next attack skill cripples.
  "crippling-anthem": ["chant", (c) => `<path d="M9 4v7l6 3v6" ${stroke(c, 2.4)}/>`],
  // Chant: a zigzag struck through, your next attack skill interrupts.
  "anthem-of-disruption": [
    "chant",
    (c) =>
      `<path d="M5 12l3-4 3 8 3-8 3 8 2-4" ${stroke(c, 2)}/>` +
      `<path d="M4 19L20 5" ${stroke(c, 1.6)}/>`,
  ],
  // Chant: an arrow through a gap, your next attack skill cannot be blocked.
  "anthem-of-guidance": [
    "chant",
    (c) =>
      `<path d="M4 12h14M14 8l4 4-4 4" ${stroke(c, 2.2)}/><path d="M10 4v4M10 16v4" ${stroke(c, 1.6)}/>`,
  ],
  // Chant: a bolt over a minus, your next shout or chant costs less.
  "energizing-chorus": [
    "chant",
    (c) =>
      `<path d="M13 3L8 10h3.5l-1 5 5-7H12z" fill="${c}"/><path d="M7 19h10" ${stroke(c, 2.2)}/>`,
  ],
  // Chant: a plus over a half bar, more damage to a foe above half Health.
  "anthem-of-envy": [
    "chant",
    (c) =>
      `<path d="M12 4v8M8 8h8" ${stroke(c, 2.2)}/><path d="M5 18h7" ${stroke(c, 2.6)}/><path d="M12 18h7" ${stroke(c, 1)}/>`,
  ],
  // Shout: a plus with a chevron rising over it, regeneration called for (#923).
  "never-surrender": [
    "shout",
    (c) =>
      `<path d="M12 10v8M8 14h8" ${stroke(c, 2.5)}/>` +
      `<path d="M8.5 8.5L12 5l3.5 3.5" ${stroke(c, 2)}/>`,
  ],
  // Paragon echoes (#1423, #1482). Refrains renew and last, finales fire once: the glyph is the payoff.
  // Echo: two chevrons over a minus, attacks faster, armor lost.
  "aggressive-refrain": [
    "echo",
    (c) =>
      `<path d="M7 4l5 4 5-4M7 9l5 4 5-4" ${stroke(c, 2.2)}/>` +
      `<path d="M7.5 18h9" ${stroke(c, 2.2)}/>`,
  ],
  // Echo: a flame ringed by a burst, foes beside the bearer burn.
  "blazing-finale": [
    "echo",
    (c) =>
      `<path d="M12 6c.8 2.2 3 3.2 3 5.5a3 3 0 0 1-6 0c0-1.2.6-2 1.4-2.7 0 1 .3 1.4.9 1.6-.2-1.5 0-2.8.7-4.4z" fill="${c}"/>` +
      `<path d="M12 2.5v1.5M12 18.5V20M4 11h1.5M18.5 11H20M6.3 5.3l1 1M16.7 5.3l-1 1M6.3 16.7l1-1M16.7 16.7l-1-1" ${stroke(c, 1.5)}/>`,
  ],
  // Echo: a flame inside a target ring, the bigger foe burns.
  "burning-refrain": [
    "echo",
    (c) =>
      `<circle cx="12" cy="11.5" r="7" ${stroke(c, 1.8)}/>` +
      `<path d="M12.3 6.5c.5 1.8 2.5 2.6 2.5 4.6a2.8 2.8 0 0 1-5.6 0c0-1.3.5-2 1.3-2.6 0 1 .3 1.5.9 1.7-.2-1.6 0-2.7.9-3.7z" fill="${c}"/>`,
  ],
  // Echo: a note held under a fermata, chants and shouts last longer.
  "enduring-harmony": [
    "echo",
    (c) =>
      `<circle cx="9" cy="16.5" r="2.6" fill="${c}"/>` +
      `<path d="M11.4 16.5V9" ${stroke(c, 1.8)}/>` +
      `<path d="M4 8a8 6 0 0 1 16 0" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="6" r="1.1" fill="${c}"/>`,
  ],
  // Echo: a heart with a plus, one heal at the end of each chant.
  "finale-of-restoration": [
    "echo",
    (c) =>
      `<path d="M12 19l-6-6a3.5 3.5 0 0 1 6-4 3.5 3.5 0 0 1 6 4z" ${stroke(c, 1.8)}/>` +
      `<path d="M12 10.5v4.5M9.8 12.8h4.4" ${stroke(c, 1.8)}/>`,
  ],
  // Echo: two chevrons, a faster pace.
  "hasty-refrain": ["echo", (c) => `<path d="M5 5l5 6-5 6M12 5l5 6-5 6" ${stroke(c, 2.2)}/>`],
  // Echo: a ring with a plus, health coming back.
  "mending-refrain": [
    "echo",
    (c) =>
      `<circle cx="12" cy="11.5" r="7" ${stroke(c, 1.8)}/>` +
      `<path d="M12 8v7M8.5 11.5h7" ${stroke(c, 2)}/>`,
  ],
  // Echo: a drop crossed out, a condition lost.
  "purifying-finale": [
    "echo",
    (c) =>
      `<path d="M12 3.5c2.5 3.5 5 6 5 9a5 5 0 0 1-10 0c0-3 2.5-5.5 5-9z" ${stroke(c, 1.8)}/>` +
      `<path d="M5 19L19 5" ${stroke(c, 2)}/>`,
  ],
  // Paragon staples 4 (#1677).
  // Shout: an eye with a spark at its corner, the next attack's critical.
  "go-for-the-eyes": [
    "shout",
    (c) =>
      `<path d="M3 12c3-4.5 6-6.5 9-6.5s6 2 9 6.5c-3 4.5-6 6.5-9 6.5s-6-2-9-6.5z" ${stroke(c, 1.8)}/>` +
      `<circle cx="12" cy="12" r="2.6" fill="${c}"/><path d="M18 3v3.5M16.25 4.75h3.5" ${stroke(c, 1.6)}/>`,
  ],
  // Shout: a bolt over two pips, energy regeneration.
  "the-power-is-yours": [
    "shout",
    (c) =>
      `<path d="M13 3L8 10h3.5l-1 5 5-7H12z" fill="${c}"/>` +
      `<path d="M8 19l2-2 2 2M12 19l2-2 2 2" ${stroke(c, 1.8)}/>`,
  ],
  // Shout: a running chevron over a crossed drop, faster once cleansed.
  "its-just-a-flesh-wound": [
    "shout",
    (c) =>
      `<path d="M10 3.5c2 3 4 5 4 7.5a4 4 0 0 1-8 0c0-2.5 2-4.5 4-7.5z" ${stroke(c, 1.6)}/>` +
      `<path d="M5 15L15 5" ${stroke(c, 1.6)}/><path d="M14 14l4 3.5-4 3.5" ${stroke(c, 2)}/>`,
  ],
  // Skill: three rising bars with a chevron, adrenaline gained faster.
  "focused-anger": [
    "skill-effect",
    (c) =>
      `<path d="M6 19v-4M11 19v-7M16 19v-10" ${stroke(c, 2.4)}/>` +
      `<path d="M14 5.5l3-3 3 3" ${stroke(c, 1.8)}/>`,
  ],
};

export default rows;
