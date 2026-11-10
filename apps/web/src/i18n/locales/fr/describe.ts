import type { DescribeWords } from "@vibewars/game-core";
import { AREA_EARSHOT as EARSHOT, EN_WORDS } from "@vibewars/game-core";

type DamageType = Parameters<DescribeWords["typeWord"]>[0];
type Category = Parameters<DescribeWords["aCategory"]>[0];
type Weapon = keyof DescribeWords["neededWeapon"];
type SkillType = keyof DescribeWords["typeText"];

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** Whole seconds stay bare; fractions take the French decimal comma. */
function seconds(value: number): string {
  return Number.isInteger(value) ? `${String(value)} s` : `${value.toFixed(1).replace(".", ",")} s`;
}

/** Pairs an English-keyed radius table with its French wording, on the same radii. */
function keyed(
  english: ReadonlyMap<number, string>,
  french: Readonly<Record<string, string>>,
): ReadonlyMap<number, string> {
  return new Map([...english].map(([radius, word]) => [radius, french[word] ?? word]));
}

const AREA_TEXT = keyed(EN_WORDS.areaText, {
  adjacent: "adjacents",
  nearby: "à proximité",
  "in the area": "dans la zone",
  "in earshot": "à portée de voix",
  "in compass range": "à portée de boussole",
});

/** The same radii, said of something near "toi". */
const AREA_OF_YOU = keyed(EN_WORDS.areaText, {
  adjacent: "adjacent à toi",
  nearby: "près de toi",
  "in the area": "dans la zone autour de toi",
  "in earshot": "à portée de voix de toi",
  "in compass range": "à portée de boussole de toi",
});

const AREA_AROUND_TARGET = keyed(EN_WORDS.areaAroundTarget, {
  "adjacent to it": "adjacents à elle",
  "nearby it": "près d'elle",
  "in the area around it": "dans la zone autour d'elle",
  "in earshot of it": "à portée de voix d'elle",
});

const AREA_AROUND_CREATED = keyed(EN_WORDS.areaAroundCreated, {
  "adjacent to that creature": "adjacents à cette créature",
  "near that creature": "près de cette créature",
  "in earshot of that creature": "à portée de voix de cette créature",
});

function areaOr(radius: number, fallback: string): string {
  return AREA_TEXT.get(radius) ?? `à moins de ${fallback}`;
}

function ofYou(radius: number, fallback: string): string {
  return AREA_OF_YOU.get(radius) ?? `à moins de ${fallback} de toi`;
}

/** "qu'il", "que tu": French elides before a vowel. */
function que(clause: string): string {
  return /^[aeiouhàâéèêîôû]/i.test(clause) ? `qu'${clause}` : `que ${clause}`;
}

/** A noun with its article, unless it already carries a determiner. */
function les(who: string): string {
  return /^(tes|tous|toutes|tout|toi|ton|ta|les)\b/i.test(who) ? who : `les ${who}`;
}

function withoutArticle(who: string): string {
  return who.replace(/^les /i, "");
}

function pluralPart(part: string): string {
  const words = part.split(" ");
  const stop = words.findIndex((word) =>
    /^(de|du|des|à|au|aux|en|sur|qui|que|avec|d'.*)$/.test(word),
  );
  const head = stop < 0 ? words.length : stop;
  return words
    .map((word, index) => (index < head && !/[sx]$/.test(word) ? `${word}s` : word))
    .join(" ");
}

/** A noun phrase in the plural, each side of a coordination on its own. */
function plural(phrase: string): string {
  return phrase
    .split(/( ou | et )/)
    .map((part) => (part === " ou " || part === " et " ? part : pluralPart(part)))
    .join("");
}

const CATEGORY_NAME: Record<
  Category,
  readonly [singular: string, plural: string, article: string]
> = {
  condition: ["altération", "altérations", "une"],
  hex: ["maléfice", "maléfices", "un"],
  enchantment: ["enchantement", "enchantements", "un"],
  stance: ["posture", "postures", "une"],
  preparation: ["préparation", "préparations", "une"],
  glyph: ["glyphe", "glyphes", "un"],
  shout: ["cri", "cris", "un"],
  chant: ["chant", "chants", "un"],
  echo: ["écho", "échos", "un"],
  "weapon-spell": ["sort d'arme", "sorts d'arme", "un"],
  item: ["objet", "objets", "un"],
  form: ["forme", "formes", "une"],
  "skill-effect": ["effet", "effets", "un"],
  environment: ["effet d'environnement", "effets d'environnement", "un"],
};

function categoryOne(category: Category): string {
  return CATEGORY_NAME[category][0];
}

function categoryMany(category: Category): string {
  return CATEGORY_NAME[category][1];
}

function aCategory(category: Category): string {
  return `${CATEGORY_NAME[category][2]} ${categoryOne(category)}`;
}

function categoryNoun(count: number | "all", category: Category): string {
  return typeof count === "number" && count < 2 ? categoryOne(category) : categoryMany(category);
}

function isFeminine(category: Category): boolean {
  return CATEGORY_NAME[category][2] === "une";
}

const SKILL_WORD: Record<SkillType, string> = {
  attack: "attaque",
  spell: "sort",
  enchantment: "enchantement",
  hex: "maléfice",
  signet: "sceau",
  shout: "cri",
  stance: "posture",
  preparation: "préparation",
  glyph: "glyphe",
  chant: "chant",
  echo: "écho",
  "weapon-spell": "sort d'arme",
  "nature-ritual": "rituel de nature",
  "binding-ritual": "rituel de lien",
  ward: "protection",
  well: "puits",
  "item-spell": "sort d'objet",
  trap: "piège",
  "pet-attack": "attaque de familier",
  form: "forme",
  skill: "compétence",
};

const TYPE_TEXT: Record<SkillType, string> = {
  attack: "Attaque.",
  spell: "Sort.",
  enchantment: "Sort d'enchantement.",
  hex: "Sort de maléfice.",
  signet: "Sceau.",
  shout: "Cri.",
  stance: "Posture.",
  preparation: "Préparation.",
  glyph: "Glyphe.",
  chant: "Chant.",
  echo: "Écho.",
  "weapon-spell": "Sort d'arme.",
  "nature-ritual": "Rituel de nature.",
  "binding-ritual": "Rituel de lien.",
  ward: "Sort de protection.",
  well: "Sort de puits.",
  "item-spell": "Sort d'objet.",
  trap: "Piège.",
  "pet-attack": "Attaque de familier.",
  form: "Forme.",
  skill: "Compétence.",
};

function typeName(type: SkillType): string {
  return TYPE_TEXT[type].replace(/\.$/, "").toLowerCase();
}

/** Ids describe.ts hands over untranslated, inside otherwise French text. */
const RAW_WORD: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries(SKILL_WORD)),
  ...Object.fromEntries(Object.entries(CATEGORY_NAME).map(([id, [one]]) => [id, one])),
  "weapon spell": "sort d'arme",
  "nature ritual": "rituel de nature",
  "binding ritual": "rituel de lien",
  "item spell": "sort d'objet",
  "pet attack": "attaque de familier",
  "skill effect": "effet",
  minion: "serviteur",
  spirit: "esprit",
  lead: "principale",
  "off-hand": "secondaire",
  dual: "double",
  melee: "de mêlée",
  projectile: "de projectile",
  primary: "principal",
  elemental: "élémentaire",
};

function ids(text: string): string {
  return text.replace(
    /\b(?:weapon[- ]spell|nature[- ]ritual|binding[- ]ritual|item[- ]spell|pet[- ]attack|skill[- ]effect|off-hand|[a-z]+)\b/g,
    (word) => RAW_WORD[word] ?? word,
  );
}

function spaced(word: string): string {
  return RAW_WORD[word] ?? word.replaceAll("-", " ");
}

const NEEDED_WEAPON: Record<Weapon, string> = {
  axe: "une hache",
  sword: "une épée",
  hammer: "un marteau",
  daggers: "des dagues",
  scythe: "une faux",
  spear: "une lance",
  bow: "un arc",
  melee: "une arme de mêlée",
};

const WEAPON_WORD: Record<Weapon, string> = {
  axe: "à la hache",
  sword: "à l'épée",
  hammer: "au marteau",
  daggers: "aux dagues",
  scythe: "à la faux",
  spear: "à la lance",
  bow: "à l'arc",
  melee: "de mêlée",
};

function wielding(weapon: Weapon | undefined): string {
  return weapon === undefined ? "" : ` en maniant ${NEEDED_WEAPON[weapon]}`;
}

function attacksWith(weapon: Weapon | undefined): string {
  return weapon === undefined ? "attaques" : `attaques ${WEAPON_WORD[weapon]}`;
}

function attackSkillsWith(weapon: Weapon | undefined): string {
  return weapon === undefined
    ? "compétences d'attaque"
    : `compétences d'attaque ${WEAPON_WORD[weapon]}`;
}

const DAMAGE_AFTER: Record<DamageType, string> = {
  slashing: " tranchants",
  piercing: " perforants",
  blunt: " contondants",
  fire: " de feu",
  cold: " de froid",
  lightning: " de foudre",
  earth: " de terre",
  chaos: " de chaos",
  dark: " de ténèbres",
  holy: " sacrés",
  shadow: " d'ombre",
  typeless: "",
};

function typeWord(type: DamageType): string {
  return DAMAGE_AFTER[type];
}

function damage(amount: string, type: DamageType): string {
  return `${amount} dégâts${typeWord(type)}`;
}

function damageKind(type: DamageType | "elemental" | "physical"): string {
  return type === "elemental"
    ? "dégâts élémentaires"
    : type === "physical"
      ? "dégâts physiques"
      : `dégâts${typeWord(type)}`;
}

function share(fraction: number): string {
  return fraction === 0.5 ? "la moitié de" : `${String(Math.round(fraction * 100))}% de`;
}

function damageTaken(multiplier: number): string {
  if (multiplier === 2) {
    return "le double";
  }
  if (multiplier === 0.5) {
    return "la moitié";
  }
  return `${String(Math.round(multiplier * 100))}%`;
}

/** "la prochaine attaque", "le prochain sort": the noun decides. */
function nextOf(noun: string): string {
  return /^(attaque|compétence|altération|posture|préparation|forme|protection)/.test(noun)
    ? `la prochaine ${noun}`
    : `le prochain ${noun}`;
}

function yourNextOf(noun: string): string {
  return nextOf(noun).replace(/^la /, "ta ").replace(/^le /, "ton ");
}

/** The "if" wrappers, on the French sentences this file makes. */
function requiresWording(text: string): string {
  return text.replace(/^Si /, "Uniquement si ");
}

function requirementWording(text: string): string {
  return text.startsWith("Si ") ? `uniquement ${lowerFirst(text)}` : lowerFirst(text);
}

function requirementLine(text: string): string {
  return lowerFirst(text).replace(/\.$/, "");
}

function joinConditions(texts: readonly string[], empty: string, link: string): string {
  const [first, ...rest] = texts;
  return [first ?? empty, ...rest.map((text) => text.replace(/^Si /, "si "))].join(link);
}

function ne(verb: string): string {
  return /^[aeiouhàâéèêîôû]/i.test(verb) ? `n'${verb}` : `ne ${verb}`;
}

function negatedText(text: string): string {
  const rules: readonly (readonly [RegExp, (...match: string[]) => string])[] = [
    [/^Si (la cible|elle|tu) n'(est|es) pas /, (_, who = "", verb = "") => `Si ${who} ${verb} `],
    [/^Si (la cible|elle|tu) (est|es) /, (_, who = "", verb = "") => `Si ${who} n'${verb} pas `],
    [
      /^Si (la cible|elle|tu) n'(a|as) aucune? /,
      (match, who = "", verb = "") =>
        `Si ${who} ${verb} ${match.includes("aucune") ? "une" : "un"} `,
    ],
    [
      /^Si (la cible|elle|tu) (a|as) (une?) /,
      (_, who = "", verb = "", article = "") =>
        `Si ${who} n'${verb} ${article === "une" ? "aucune" : "aucun"} `,
    ],
    [
      /^Si (la cible|elle|tu) (a|as) moins de /,
      (_, who = "", verb = "") => `Si ${who} ${verb} au moins `,
    ],
    [/^Si (la cible|elle) a /, (_, who = "") => `Si ${who} n'a pas `],
    [/^Si tu as /, () => "Si tu n'as pas "],
    [/^Si tu (\p{L}+) /u, (_, verb = "") => `Si tu ${ne(verb)} pas `],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(text)) {
      return text.replace(pattern, replacement);
    }
  }
  return `Sauf ${lowerFirst(text)}`;
}

/** Said of "tu": the participles written for "la cible" lose their feminine. */
function yourCondition(text: string): string {
  return text
    .replace(/^Si la cible n'est /, "Si tu n'es ")
    .replace(/^Si la cible n'a /, "Si tu n'as ")
    .replace(/^Si la cible est /, "Si tu es ")
    .replace(/^Si la cible a /, "Si tu as ")
    .replace(/^Si la cible /, "Si tu ")
    .replace(/renversée/g, "renversé")
    .replace(/adjacente/g, "adjacent");
}

function ifItWording(text: string): string {
  return text.replace(/^Si la cible/, "Si elle");
}

/** A condition on "la cible" turned into a relative clause on those reached. */
function onlyIfWording(text: string): string {
  return lowerFirst(text)
    .replace(/^si la cible n'est /, "qui ne sont ")
    .replace(/^si la cible n'a /, "qui n'ont ")
    .replace(/^si la cible est /, "qui sont ")
    .replace(/^si la cible a /, "qui ont ")
    .replaceAll(" ou si la cible est ", " ou ")
    .replaceAll(" et si la cible est ", " et ")
    .replace(/renversée/g, "renversés")
    .replace(/adjacente/g, "adjacents")
    .replace(/\bimmobile\b/g, "immobiles");
}

const TRIGGER_WHEN: DescribeWords["triggerWhen"] = {
  "bearer-casts-spell": "lance un sort",
  "bearer-attacks": "attaque",
  "bearer-attack-begins": "attaque",
  "bearer-uses-skill": "utilise une compétence",
  "bearer-applies-hex": "applique un maléfice",
  "bearer-hits": "touche avec une attaque",
  "bearer-fails-to-hit": "rate son coup",
  "bearer-takes-physical-damage": "subit des dégâts physiques",
  "bearer-takes-elemental-damage": "subit des dégâts élémentaires",
  "bearer-takes-damage": "subit des dégâts",
  "bearer-takes-damage-from-foe": "subit des dégâts ou un vol de vie d'un ennemi",
  "bearer-health-drops-below": "voit sa santé passer sous un seuil à cause de dégâts",
  "bearer-fatal-damage-negated": "voit des dégâts mortels annulés",
  "bearer-hit-by-attack": "est touché par l'attaque d'un ennemi",
  "bearer-targeted-by-foe": "est pris pour cible par un sort ou une attaque d'un ennemi",
  "bearer-healed-by-skill": "est soigné par une compétence",
  "bearer-blocks-melee": "bloque une attaque de mêlée",
  "bearer-blocks-projectile": "bloque un projectile",
  "bearer-blocks": "bloque",
  "bearer-interrupted": "est interrompu",
  "bearer-knocked-down": "est renversé",
  "bearer-sacrifices-health": "sacrifie de la santé",
  "bearer-knockdown-prevented": "voit un renversement empêché",
  "bearer-gains-hex-or-enchantment": "reçoit un maléfice ou un enchantement",
  "bearer-gains-enchantment": "reçoit un enchantement",
  "bearer-loses-enchantment": "perd un enchantement",
  "bearer-loses-condition": "perd une altération",
  "bearer-creates-creature": "crée une créature",
  "bearer-gains-condition": "reçoit une nouvelle altération",
  "bearer-chant-or-shout-ends": "voit un chant ou un cri prendre fin sur lui",
  "bearer-energy-empty": "n'a plus d'énergie",
  "bearer-energy-drops-empty": "tombe à 0 d'énergie",
  "source-targets-bearer": "est pris pour cible par ta compétence",
  "source-bearer-apart": "est loin de toi",
  "bearer-dies": "meurt",
  ends: "prend fin",
  "ends-early": "prend fin prématurément",
  expires: "expire",
};

const SECOND_PERSON: Readonly<Record<string, string>> = {
  a: "as",
  applique: "appliques",
  attaque: "attaques",
  bloque: "bloques",
  crée: "crées",
  devient: "deviens",
  effectue: "effectues",
  est: "es",
  expire: "expires",
  gagne: "gagnes",
  lance: "lances",
  meurt: "meurs",
  perd: "perds",
  prend: "prends",
  rate: "rates",
  reçoit: "reçois",
  sacrifie: "sacrifies",
  subit: "subis",
  tombe: "tombes",
  touche: "touches",
  utilise: "utilises",
  voit: "vois",
};

function secondPerson(phrase: string): string {
  if (phrase === "se déplace") {
    return "te déplaces";
  }
  if (phrase.startsWith("n'a ")) {
    return `n'as ${phrase.slice("n'a ".length)}`;
  }
  const [verb = "", ...rest] = phrase.split(" ");
  const base = SECOND_PERSON[verb];
  if (base === undefined) {
    throw new Error(`no second person for "${phrase}"`);
  }
  return [base, ...rest]
    .join(" ")
    .replace(
      /\b(sa|son|ses) /,
      (word) => ({ "sa ": "ta ", "son ": "ton ", "ses ": "tes " })[word] ?? word,
    )
    .replace(/ sur lui$/, " sur toi");
}

const ARROWS_WHEN: DescribeWords["arrowsWhen"] = {
  "bearer-hits": "touchent",
  "bearer-fails-to-hit": "ratent leur cible",
};

const NEXT_SKILL = "la prochaine fois qu'il utilise une compétence";
const YOUR_NEXT_SKILL = "la prochaine fois que tu utilises une compétence";
const DROPPED = "effet à la chute";

const SPLASH_SIDE: DescribeWords["splashSide"] = {
  foes: "ennemis",
  "foe-creatures": "créatures ennemies",
  "foe-minions": "serviteurs ennemis",
  allies: "alliés",
  "non-spirit-allies": "alliés hors esprits",
  party: "membres du groupe",
  "own-spirits": "tes esprits",
  "own-minions": "tes autres serviteurs",
  "allied-minions": "serviteurs alliés",
};

const AREA_WHO: DescribeWords["areaWho"] = {
  enemies: "Ennemis",
  allies: "Alliés",
  all: "Tout le monde",
};

const AURA_WHO: DescribeWords["auraWho"] = {
  all: "Créatures hors esprits",
  allies: "Alliés hors esprits",
  foes: "Ennemis hors esprits",
};

const TARGET_TEXT: DescribeWords["targetText"] = {
  self: "Soi-même",
  "single-enemy": "Un ennemi",
  "single-ally": "Un allié",
  "single-other-ally": "Un autre allié",
  "single-any": "N'importe quelle cible",
  "single-dead-ally": "Un allié mort",
  "allied-spirit": "Un esprit allié",
  "enemy-spirit": "Un esprit ennemi",
  "enemy-minion": "Le serviteur d'un ennemi",
  "own-minion": "Un de tes serviteurs",
  "allied-minion": "Un serviteur allié",
  "allied-summoned-creature": "Une créature invoquée alliée",
  "single-ally-not-spirit": "Un allié, sauf un esprit",
  companion: "Ton familier",
  "living-companion": "Ton familier vivant",
};

const CHAIN_ROLE_WORD: Readonly<Record<string, string>> = {
  lead: "principale",
  "off-hand": "secondaire",
  dual: "double",
};

function chainRole(role: string): string {
  return CHAIN_ROLE_WORD[role] ?? role;
}

/** `next` is one noun, or a count and its plural: "ton prochain sort", "tes 3 prochains sorts". */
function yourNextPhrase(next: string): string {
  if (/^(compétence|sort|maléfice|sceau|cri)\b/.test(next)) {
    return yourNextOf(next);
  }
  const space = next.indexOf(" ");
  const count = next.slice(0, space);
  const noun = next.slice(space + 1);
  return `tes ${count} ${nextOf(noun).startsWith("la ") ? "prochaines" : "prochains"} ${noun}`;
}

function who(selfOnly: boolean): string {
  return selfOnly ? "toi" : "lui";
}

function casts(selfOnly: boolean): string {
  return selfOnly ? "tu lances" : "il lance";
}

const kindWord = (kind: string): string => {
  const raw = kind.trim();
  return raw in DAMAGE_AFTER ? DAMAGE_AFTER[raw as keyof typeof DAMAGE_AFTER] : kind;
};

const kindedArmor = (text: string): string =>
  text.replace(/^(\S+) (\w+) armure$/, (whole, amount: string, kind: string) =>
    kind in DAMAGE_AFTER
      ? `${amount} d'armure contre les dégâts${DAMAGE_AFTER[kind as DamageType]}`
      : whole,
  );

export default {
  capitalize,
  lowerAll: (text) => text.toLowerCase(),
  spaced,
  typeName,
  typeFirstWord: (type) => SKILL_WORD[type],
  blockAnswerWording: (text) =>
    text.replace(/^la prochaine fois que (?:tu bloques|il bloque) /, "si c'est "),
  loseWording: (text, fromSource, bearerIsFoe) =>
    text
      .replace(/^La cible perd/, fromSource ? "tu perds" : bearerIsFoe ? "il perd" : "perds")
      .replace(/qu'elle a/, "que tu as"),
  bearerWording: (text, bearerIsCaster) =>
    text
      .replace(/^La cible gagne/, "il gagne")
      .replace(/^La cible perd/, bearerIsCaster ? "tu perds" : "il perd"),
  ifItWording,
  gainWording: (text) => lowerFirst(text).replace(/^soigne /, ""),
  loseTargetWording: (text) => lowerFirst(text).replace(/^la cible perd/, "perdent"),
  stealsWording: (text) => lowerFirst(text).replace(/^vole /, "voles "),
  returnedWording: (text) =>
    lowerFirst(text).replace(/^ramène la cible à la vie/, "sont ramenés à la vie"),
  yourMinionsWording: (text) => text.replace(/^Tes autres serviteurs/, "Tes serviteurs"),
  onlyIfWording,
  splashOnlyClause: (condition) => (condition === "" ? "" : ` ${condition}`),
  eachOfWording: (reached, condition) =>
    condition === "" ? reached : `chacun parmi ${reached} ${condition}`,
  requiresWording,
  requirementWording,
  requirementLine,
  anyOfWording: (texts) => joinConditions(texts, "Jamais", " ou "),
  allOfWording: (texts) => joinConditions(texts, "Toujours", " et "),
  seconds,
  blockedAttacks: { all: "attaques", melee: "attaques de mêlée", projectile: "projectiles" },
  blockedAttack: { all: "attaque", melee: "attaque de mêlée", projectile: "projectile" },
  damageTaken,
  triggerWhen: TRIGGER_WHEN,
  secondPerson,
  arrowsWhen: ARROWS_WHEN,
  chantOrShoutEnds: "chaque fois qu'un chant ou un cri prend fin sur lui",
  energyEmpty: "si son énergie tombe à 0",
  dropped: DROPPED,
  targetsWords: { ally: "un allié", "other-ally": "un autre allié", foe: "un ennemi" },
  nextSkill: NEXT_SKILL,
  yourNextSkill: YOUR_NEXT_SKILL,
  creates: "chaque fois que tu crées une créature",
  areaAroundCreated: AREA_AROUND_CREATED,
  nextSkillKind: {
    "attack-skill": ["compétence d'attaque", "compétences d'attaque"],
    spell: ["sort", "sorts"],
    hex: ["maléfice", "maléfices"],
    signet: ["sceau", "sceaux"],
    "signet-at-foe": ["sceau qui cible un ennemi", "sceaux qui ciblent un ennemi"],
    "shout-or-chant": ["cri ou chant", "cris ou chants"],
    any: ["compétence", "compétences"],
  },
  lowerFirst,
  aCategory,
  negatedText,
  yourCondition,
  typeWord,
  splashSide: SPLASH_SIDE,
  auraWho: AURA_WHO,
  groundAnchorText: {
    caster: "à ton emplacement",
    corpse: "à son emplacement",
    target: "à l'emplacement de ta cible",
  },
  share,
  categoryNoun,
  weaponText: {
    axe: "Attaque à la hache",
    sword: "Attaque à l'épée",
    hammer: "Attaque au marteau",
    daggers: "Attaque aux dagues",
    scythe: "Attaque à la faux",
    spear: "Attaque à la lance",
    bow: "Attaque à l'arc",
    melee: "Attaque de mêlée",
  },
  chainRoleText: {
    lead: "Attaque principale.",
    "off-hand": "Attaque secondaire.",
    dual: "Attaque double.",
  },
  followsText: {
    lead: "Doit suivre une attaque principale.",
    "off-hand": "Doit suivre une attaque secondaire.",
    dual: "Doit suivre une attaque double.",
  },
  neededWeapon: NEEDED_WEAPON,
  weaponWord: WEAPON_WORD,
  typeText: TYPE_TEXT,
  areaText: AREA_TEXT,
  areaAroundTarget: AREA_AROUND_TARGET,
  targetText: TARGET_TEXT,
  areaWho: AREA_WHO,
  s: () => "s",
  onTarget: () => "sur la cible",
  composedLastsAtBase: (p) => (p.lasts === p.at ? p.base : `${seconds(p.lasts)} (${p.base})`),
  attributes: (p) => `attributs de ${p.name}`,
  attributes2: () => "attributs",
  attributePrimaryS: (p) =>
    p.scope === "primary" ? "attribut principal" : "attributs élémentaires",
  setTo: (p) => `${p.scope} : ${p.rank}`,
  allAttributes: () => "tous les attributs",
  toAllAllAttributes: (p) => `${p.amount} à ${p.value}`,
  renewedWheneverAChantOrShoutEnds: (p) =>
    `renouvelé chaque fois qu'un chant ou un cri prend fin sur ${who(p.selfOnly)}`,
  renewedWheneverYouCastItCastsA: (p) => `renouvelé chaque fois ${que(casts(p.selfOnly))} un sort`,
  reappliedWheneverYouCastItCastsA: (p) =>
    `réappliqué chaque fois ${que(casts(p.selfOnly))} un sort sur un ennemi`,
  renewedWheneverYouTakeItTakesElemental: (p) =>
    `renouvelé chaque fois ${que(p.selfOnly ? "tu subis" : "il subit")} des dégâts élémentaires`,
  renewedWheneverAnEnchantmentOnYouIt: (p) =>
    `renouvelé chaque fois qu'un enchantement sur ${who(p.selfOnly)} prend fin`,
  gainAdrenalineFasterSlower: (p) =>
    `gagne de l'adrénaline ${p.shown} plus ${p.faster > 0 ? "vite" : "lentement"}`,
  onTheBearerExpireFaster: (p) => `${p.what} sur le porteur expirent ${p.stat} plus vite`,
  enchantmentsAndStances: () => "les enchantements et les postures",
  enchantments: () => "les enchantements",
  stances: () => "les postures",
  yourAttacksAgainstItHaveCriticalChance: (p) =>
    `tes attaques contre lui ont ${p.criticalChanceBonus}% de chances de coup critique`,
  armorAgainstYourAttacksWhileItHas: (p) =>
    `${p.armorModifier} armure contre tes attaques${p.onlyWhileNoOtherHex ? " tant qu'il n'a aucun autre maléfice" : ""}`,
  youTheBearer: (p) => (p.selfOnly ? "toi" : "le porteur"),
  endsIfYouEndsIfTheBearer: (p) =>
    p.selfOnly
      ? `prend fin si tu ${secondPerson(p.phrase)}`
      : `prend fin si le porteur ${p.phrase}`,
  healthDegeneration: (p) => `−${p.healthPips} de dégénérescence de santé`,
  healthRegeneration: (p) => `+${p.healthPips} de régénération de santé`,
  healthRegenerationForEachEnchantmentOnYou: (p) =>
    `+${p.pips} de régénération de santé pour chaque enchantement sur toi (au plus ${p.max})`,
  energyDegeneration: (p) => `−${p.energyPips} de dégénérescence d'énergie`,
  energyRegeneration: (p) => `+${p.energyPips} de régénération d'énergie`,
  healthRegenerationForEachConditionOnYou: (p) =>
    `${p.healthPipsPerCondition} de régénération de santé pour chaque altération sur toi`,
  health: () => "santé",
  hex: () => "maléfice",
  energy: () => "énergie",
  condition: () => "altération",
  regenerationForEachOnYou: (p) =>
    `${p.pips} de régénération ${p.what === "énergie" ? "d'énergie" : "de santé"} pour chaque ${p.each} sur toi`,
  armorWhileWielding: (p) => `${p.sign}${p.armorModifier} armure${wielding(p.weapon)}`,
  armorWhileNotMoving: (p) => `${p.armorWhileStill} armure à l'arrêt`,
  healthPerSecondWhileMoving: (p) =>
    `${p.healthPerSecondWhileMoving} de santé par seconde en mouvement`,
  healthPerSecond: (p) => `+${p.healthPerSecond} de santé par seconde`,
  healthPerSecondMoreInEarshotOf: (p) =>
    `+${p.healthPerSecondNearSpirit} de santé par seconde de plus à portée de voix d'un esprit`,
  spellsCastInEarshotOfASpirit: (p) =>
    `les sorts lancés à portée de voix d'un esprit se rechargent ${p.faster}% plus vite`,
  chanceToDoubleStrikeWhileWielding: (p) =>
    `+${p.chance}% de chances de frapper deux fois${wielding(p.weapon)}`,
  armorNotBelow: (p) => `−${p.amount} armure (minimum ${p.floor})`,
  movesAtSpeed: (p) => `se déplace à ${p.speed}% de sa vitesse`,
  movesAtSpeedWhileEnchanted: (p) =>
    `se déplace à ${p.speed}% de sa vitesse tant qu'il est enchanté`,
  speedBoostsHaveNoEffect: () => "les bonus de vitesse sont sans effet",
  cannotGainAdrenaline: () => "ne peut pas gagner d'adrénaline",
  whenThisEndsYouReturnToWhere: () => "à la fin de cet effet, tu reviens là où tu l'as lancé",
  whenThisEndsYouShadowStepTo: (p) =>
    `à la fin de cet effet, tu te téléportes par l'ombre auprès de l'allié qui en était la cible, et toutes tes compétences sont désactivées pendant ${p.seconds} secondes`,
  ofAttacksMiss: (p) => `${p.attackMissChance}% des attaques ratent leur cible`,
  maximumHealthAtMost: (p) => `−${p.fraction}% de santé maximale (au plus ${p.cap})`,
  maximumHealth: (p) => `+${p.maxHealthBonus} de santé maximale`,
  maximumHealthPerEnchantment: (p) =>
    `+${p.maxHealthBonusPerEnchantment} de santé maximale par enchantement`,
  maximumEnergy: (p) => `+${p.maxEnergyBonus} d'énergie maximale`,
  maximumHealthPerPointOfMaximumEnergy: (p) =>
    `+${p.per} de santé maximale par point d'énergie maximale`,
  yourMinionsDealDamage: (p) => `tes serviteurs infligent ${p.minionDamageBonus} dégâts`,
  loseMaximumHealthEachTimeAMinion: (p) =>
    `perds ${p.minionHitHealthLossPercent}% de ta santé maximale chaque fois qu'un de tes serviteurs touche`,
  conditionsYouWouldReceiveGoToYour: () =>
    "les altérations que tu devrais recevoir vont à ton serviteur le plus proche",
  healing: (p) => `${p.more ? "+" : "−"}${p.change} de soins`,
  weaponDamage: (p) => `${p.change}% de dégâts d'arme`,
  dealsDamage: (p) => `inflige ${p.more ? "+" : "−"}${p.change} dégâts`,
  noDeathPenalty: () => "pas de pénalité de mort",
  whenTheBearerDiesSoDoesIts: () => "quand le porteur meurt, son lanceur meurt aussi",
  alliesYouResurrectReturnWithHealthAnd: (p) =>
    `les alliés que tu ressuscites reviennent avec +${p.health} de santé et +${p.energy} d'énergie`,
  youDieTheBearerDiesWhenIt: (p) =>
    `${p.selfOnly ? "tu meurs" : "le porteur meurt"} à la fin de l'effet`,
  leavesAnExploitedCorpse: () => "laisse un cadavre exploité",
  takeFromPhysicalDamage: (p) => `subis ${p.sign}${p.amount} aux dégâts physiques`,
  elementalDamageTakenIsDamage: (p) =>
    `les dégâts élémentaires subis deviennent des ${damageKind(p.elementalDamageTakenAs)}`,
  physicalDamageTakenIsDamage: (p) =>
    `les dégâts physiques subis deviennent des ${damageKind(p.physicalDamageTakenAs)}`,
  physicalDamageDealtIsDamage: (p) =>
    `les dégâts physiques infligés deviennent des ${damageKind(p.physicalDamageDealtAs)}`,
  elementalDamageDealtIsDamage: (p) =>
    `les dégâts élémentaires infligés deviennent des ${damageKind(p.elementalDamageDealtAs)}`,
  takeFromSpiritsAttacks: (p) => `subis ${p.damageFromSpiritAttacks} des attaques d'esprits`,
  attacksAttacksDealDamage: (p) =>
    `les ${attacksWith(p.weapon)} infligent des ${damageKind(p.attackDamageType)}`,
  attacksHaveArmorPenetration: (p) =>
    `les attaques ont ${p.attackArmorPenetration}% de pénétration d'armure`,
  attacksAttacksDealLessMoreDamage: (p) =>
    `les ${attacksWith(p.weapon)} infligent ${p.amount} dégâts de ${p.delta < 0 ? "moins" : "plus"}`,
  and: () => " et ",
  immuneToAnd: (p) => `insensible à ${p.names}`,
  setOnFire: () => "enflammé",
  or: () => " ou ",
  cannotBeOr: (p) => `ne peut pas être ${p.names}`,
  attacksFromAttacks: (p) =>
    `${p.adrenalineGain}${p.adrenalineGainFasterFrom === "attacks" ? " grâce aux attaques" : ""}`,
  yourEliteEliteSkillSUse: (p) =>
    `tes ${p.skillType === "elite" ? "compétences d'élite" : plural(ids(p.skillType))} utilisent ${p.name}`,
  uses: (p) => `utilisation de ${ids(p.skillType)}`,
  sUse: (p) => `${p.uses} utilisations de ${plural(ids(p.skillType))}`,
  yourNext: (p) => `ta prochaine ${p.next} : ${p.name}`,
  spellsTakeAsLongToCast: (p) =>
    `les sorts mettent ${p.castTimeMultiplier}× plus de temps à être lancés`,
  skillsButAttacksTakeAsLongTo: (p) =>
    `les compétences, sauf les attaques, mettent ${p.skillActivationMultiplier}× plus de temps à s'activer`,
  spellsAreInterruptedByAttacks: () => "les sorts sont interrompus par les attaques",
  slowerFaster: (p) => (p.attackDurationMultiplier > 1 ? "plus lentes" : "plus rapides"),
  attacksWhileWielding: (p) => `attaques ${p.change}% ${p.way}${wielding(p.weapon)}`,
  conditionsYouApplyLastLongerWhileWielding: (p) =>
    `les altérations que tu appliques durent ${p.longer}% plus longtemps${wielding(p.weapon)}`,
  enchantmentsYouMaintainCostTheUpkeep: (p) =>
    `les enchantements que tu entretiens coûtent ${p.upkeepMultiplier}× leur entretien`,
  spellsThatCauseOvercastCauseMoreAs: (p) =>
    `les sorts qui causent de la surcharge en causent ${p.overcastSurcharge} de plus à la fin de leur incantation`,
  arrowsMoveAsFast: (p) => `les flèches volent ${p.projectileSpeedMultiplier}× plus vite`,
  cannotCastSpells: () => "ne peut pas lancer de sorts",
  cannotAttack: () => "ne peut pas attaquer",
  cannotUseResurrectionSkills: () => "ne peut pas utiliser de compétences de résurrection",
  cannotBeTheTargetOfEnemySpells: (p) =>
    p.whileCasting
      ? "ne peut pas être la cible de sorts ennemis pendant une incantation"
      : "ne peut pas être la cible de sorts ennemis",
  cannotBeTheTargetOfSpells: () => "ne peut pas être la cible de sorts",
  hostileSpellsTargetingYouFail: () => "les sorts hostiles qui te ciblent échouent",
  attacksAgainstYouMiss: () => "les attaques contre toi ratent leur cible",
  strippedOfAllEnchantmentsAndCannotBe: () =>
    "perd tous ses enchantements et ne peut pas être enchanté",
  cannotBeTheTargetOfEnchantments: () => "ne peut pas être la cible d'enchantements",
  cannotUseShoutsOrChants: () => "ne peut pas utiliser de cris ni de chants",
  cannotUseSignets: () => "ne peut pas utiliser de sceaux",
  cannotBlockItsCasterSAttacks: () => "ne peut pas bloquer les attaques de son lanceur",
  cannotBeBlockedByBlindedFoes: () => "ne peut pas être bloqué par les ennemis aveuglés",
  cannotBlock: () => "ne peut pas bloquer",
  renewedForSecondsIfMovingAsIt: (p) =>
    `renouvelé pendant ${p.renewsWhileMoving} secondes s'il est en mouvement quand l'effet devrait prendre fin`,
  cannotBeKnockedDown: () => "ne peut pas être renversé",
  cannotBeKnockedDownByAFoe: () => "ne peut pas être renversé par un ennemi",
  endsIfItPreventsAKnockdown: () => "prend fin s'il empêche un renversement",
  youDoNotSufferExtraDamageFrom: () =>
    "tu ne subis pas de dégâts supplémentaires d'un coup critique",
  cannotLandCriticalHits: () => "ne peut pas porter de coups critiques",
  immuneToCriticalHits: () => "insensible aux coups critiques",
  spellsHaveDoubleTheDivineFavorBonus: (p) =>
    `les sorts de ${p.attribute} ont le double du bonus de Faveur divine`,
  attackSkillAttackSkills: (p) =>
    p.once
      ? p.attackSkillsOnly === true
        ? "compétence d'attaque"
        : { all: "attaque", melee: "attaque de mêlée", projectile: "projectile" }[p.against]
      : p.attackSkillsOnly === true
        ? "compétences d'attaque"
        : { all: "attaques", melee: "attaques de mêlée", projectile: "projectiles" }[p.against],
  whileBelowHealth: (p) => ` tant que tu es sous ${p.blockBelowHealth}% de santé`,
  whileUnderOr: (p) => ` tant que tu es sous ${p.value}`,
  fromFoesUnderOr: (p) => ` venant d'ennemis sous ${p.value}`,
  whileAttacking: (p) => (p.blockWhileAttacking ? " pendant que tu attaques" : ""),
  blocksTheNextChanceToBlock: (p) =>
    p.once
      ? `bloque ${nextOf(p.what)}${p.attacker}${p.below}${p.under}${p.attacking}`
      : `${p.chance}% de chances de bloquer les ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`,
  within: (p) => areaOr(p.radius, p.radius2),
  alliesTo: (p) => `alliés ${p.around} à ${p.bearer} : ${p.status}`,
  whileWielding: (p) => ` en maniant ${NEEDED_WEAPON[p.weapon]}`,
  whileHoldingAWeaponOtherThan: (p) => ` en tenant une arme autre que ${NEEDED_WEAPON[p.not]}`,
  againstFoesThatAreNotMoving: (p) =>
    p.criticalChanceBonusVersus === undefined ? "" : " contre les ennemis immobiles",
  criticalChance: (p) => `${p.chance}% de chances de coup critique${p.holding}${p.versus}`,
  gainEnergyPerCriticalHit: (p) => `gagne ${p.energyPerCritical} d'énergie par coup critique`,
  wheneverYouSuccessfullyLandACriticalHit: (p) =>
    `chaque fois que tu portes un coup critique, tu gagnes ${p.healthPerCritical} de santé`,
  refreshesEveryTimeYouLandACritical: () =>
    "se renouvelle chaque fois que tu portes un coup critique",
  theNextTimeYouLandACritical: (p) =>
    p.endsWhenFired
      ? "la prochaine fois que tu portes un coup critique"
      : "chaque fois que tu portes un coup critique",
  with: (p) =>
    p.weapon === undefined ? p.critical : `${p.critical} avec ${NEEDED_WEAPON[p.weapon]}`,
  removeStatusFromYourTarget: (p) =>
    p.kind === "remove-status"
      ? `${p.when} : ${lowerFirst(p.text)} de ta cible`
      : `${p.when} : ${lowerFirst(p.text)}`,
  ifOneIsRemovedYouLoseEnergy: (p) =>
    `si l'un d'eux est retiré, tu perds ${p.energyIfRemoved} d'énergie ou l'effet prend fin`,
  endsAfterIncomingAttackS: (p) =>
    `prend fin après ${p.endsAfterAttacks} attaque${p.endsAfterAttacks2 === 1 ? "" : "s"} reçue${p.endsAfterAttacks2 === 1 ? "" : "s"}`,
  endsAfterYourNextAttackSHit: (p) =>
    p.endsAfterAttackCount2 === 1
      ? "prend fin après ta prochaine attaque, touchée, ratée ou bloquée"
      : `prend fin après tes ${p.endsAfterAttackCount} prochaines attaques, touchées, ratées ou bloquées`,
  noEffectWhileUnderOr: (p) => `sans effet tant que tu es sous ${p.suppressedWhileUnder}`,
  yourNextAttackSCannotBeBlocked: (p) =>
    p.unblockableAttacks2 === 1
      ? "ta prochaine attaque ne peut pas être bloquée"
      : `tes ${p.unblockableAttacks} prochaines attaques ne peuvent pas être bloquées`,
  attacksCannotBeBlocked: (p) => `les ${attacksWith(p.weapon)} ne peuvent pas être bloquées`,
  whileYouWieldAnAWeapon: (p) =>
    `tant que tu manies une arme à ${damageKind(p.weaponDamage)}, ${p.hit}`,
  forEachEnchantmentRemovedSCasterLoses: (p) =>
    `pour chaque enchantement de ${p.name} retiré, le lanceur de ${p.name2} perd ${p.percentOfMax}% de sa santé maximale`,
  with2: (p) => (p.weapon === undefined ? "" : ` avec ${NEEDED_WEAPON[p.weapon]}`),
  endsAfterHitS: (p) =>
    `prend fin après ${p.count} coup${p.count2 === 1 ? "" : "s"} porté${p.count2 === 1 ? "" : "s"}${p.how}`,
  spellSpells: (p) => (p.one ? "sort" : `${p.count} sorts`),
  yourNextCostsCostLessEnergy: (p) =>
    p.one
      ? `ton prochain sort coûte ${p.costReduction} d'énergie de moins`
      : `tes ${p.next.replace(/ sorts$/, "")} prochains sorts coûtent ${p.costReduction} d'énergie de moins`,
  yourNextRechargesRechargeFaster: (p) =>
    p.one
      ? `ton prochain sort se recharge ${p.rechargeFaster}% plus vite`
      : `tes ${p.next.replace(/ sorts$/, "")} prochains sorts se rechargent ${p.rechargeFaster}% plus vite`,
  forYourNext: (p) =>
    p.next === "sort"
      ? "pour ton prochain sort"
      : `pour tes ${p.next.replace(/ sorts$/, "")} prochains sorts`,
  theirProjectilesMoveAsFast: (p) =>
    `leurs projectiles volent ${p.projectileSpeedMultiplier}× plus vite`,
  noOvercast: () => "aucune surcharge",
  spreadsToAdjacentCombatants: () => "se propage aux combattants adjacents",
  nextAttackSkillDamage: (p) =>
    `prochaine compétence d'attaque : ${p.condition} : +${p.more} dégâts`,
  attacks: () => "attaque",
  makesAMeleeAttack: () => "effectue une attaque de mêlée",
  moves: () => "se déplace",
  takesDamage: (p) => `subit ${p.damageTakenMultiplier} des dégâts`,
  takesDamageFromTheNextAttack: (p) =>
    `subit ${damageTaken(p.attackDamageTakenMultiplier)} des dégâts de la prochaine attaque`,
  damageTaken2: (p) => `−${p.damageReduction} dégâts subis`,
  damageTakenPerRankOfAtMost: (p) =>
    `−${p.now} dégâts subis (${p.perRank} par rang de ${p.attribute}, au plus ${p.max})`,
  damageTakenMoreEachHit: (p) => `−${p.step} dégâts subis, ${p.step} de plus à chaque coup`,
  theNextHitDealsLessDamage: (p) =>
    `le prochain coup inflige ${p.nextDamageReduction} dégâts de moins`,
  damageTakenWhileCastingS: (p) =>
    `−${p.amount} dégâts subis en lançant des ${plural(SKILL_WORD[p.skillType])}`,
  lessDamage: (p) => `${p.value}% de dégâts${typeWord(p.type)} en moins`,
  lessDamageFromFoesWithAHex: (p) =>
    `${p.fraction}% de dégâts en moins de la part des ennemis sous un maléfice de ${p.name}`,
  lessDamageFromFoesSufferingFrom: (p) =>
    `${p.fraction}% de dégâts en moins de la part des ennemis sous ${p.name}`,
  damageTakenFromFoesWithLessHealth: (p) =>
    `−${p.damageReductionFromWeakerFoe} dégâts subis de la part des ennemis ayant moins de santé`,
  damageTakenFromFoesWithACondition: (p) =>
    `−${p.damageReductionFromConditionedFoe} dégâts subis de la part des ennemis sous une altération`,
  lessDamageFromSpells: (p) => `${p.less}% de dégâts en moins venant des sorts`,
  damageOverInASecondIsHealed: (p) => `les dégâts au-delà de ${p.cap} par seconde sont soignés`,
  physicalItsPhysicalDamageTheDamageIt: (p) =>
    p.from === "physical" ? "ses dégâts physiques" : "ce qu'il subit des attaques",
  whichTakesLessOfIt: (p) => `, qui en subit ${p.reduction} de moins`,
  goesToItsCaster: (p) => `${share(p.fraction)} ${p.hits} va à son lanceur${p.less}`,
  theDamageYouTakeGoesToYour: (p) =>
    `${share(p.redirectsDamageToMinion)} ce que tu subis va à ton serviteur le plus proche`,
  damageFromASingleHitIsCapped: (p) =>
    `les dégâts d'un seul coup sont plafonnés à ${p.maxDamageFractionPerHit}% de la santé maximale`,
  eachHitItCapsCostsTheCaster: (p) =>
    `chaque coup plafonné coûte ${p.casterEnergyPerReduction} d'énergie au lanceur, et l'effet prend fin s'il ne peut pas payer`,
  damageFromASingleAttackIsCapped: (p) =>
    `les dégâts d'une seule attaque sont plafonnés à ${p.attackDamageCapFraction}% de la santé maximale`,
  lifeStolen: (p) => `−${p.lifeStealReduction} de vie volée`,
  yourHealthSacrificesAreLarger: (p) =>
    `tes sacrifices de santé sont ${p.sacrificeMultiplier}% plus importants`,
  knockdownsLastAtLeastS: (p) => `les renversements durent au moins ${p.knockdownMinSeconds} s`,
  itsSpiritLosesHealthEachTime: (p) =>
    `son esprit perd ${p.sourceLosesHealth} de santé à chaque fois`,
  reappliedAsItWouldEndWhileYou: (p) =>
    `réappliqué au moment de prendre fin tant ${p.selfOnly ? "que tu as" : "qu'il a"} un autre maléfice`,
  chantsAndShoutsLastLongerOnIt: (p) =>
    `les chants et les cris durent ${p.longer}% plus longtemps sur lui`,
  attacksDealLessMoreDamage: (p) =>
    `les attaques infligent ${p.attackDamageDelta} dégâts de ${p.attackDamageDelta2 < 0 ? "moins" : "plus"}`,
  movesFaster: (p) => `se déplace ${p.moveSpeedMultiplier}% plus vite`,
  healthRegenerationDegeneration: (p) =>
    `${p.healthPips} de ${p.healthPips2 > 0 ? "régénération" : "dégénérescence"} de santé`,
  armor: (p) => `${p.armorModifier} d'armure`,
  attacksFaster: (p) => `attaque ${p.value}% plus vite`,
  aOr: (p) => `un ${ids(p.categories)}`,
  listComma: () => ", ",
  whileUnderOr2: (p) => `tant que tu es sous ${p.under} : ${p.gains}`,
  once: () => "une fois",
  times: (p) => `${p.stat} fois`,
  endsAfterItTakesEffect: (p) => `prend fin après avoir fait effet ${p.times}`,
  theNextHexFailsAndItsCaster: (p) =>
    `le prochain maléfice échoue, et son lanceur subit ${p.damage} dégâts`,
  theNextSpellItCastsAtFoe: (p) =>
    `le prochain sort qu'il lance sur ${p.on === "foe-targeted" ? "un ennemi" : "un allié"} échoue : ${p.what}`,
  theNextTouchSkillsUsedAgainstYou: (p) =>
    `les ${p.failsFoeTouchSkills} prochaines compétences de contact utilisées contre toi échouent`,
  foesWithinFoes: (p) =>
    p.area === undefined ? `ennemis à moins de ${p.radius}` : `ennemis ${p.area}`,
  moreEachSecond: (p) => `, ${p.growth} de plus chaque seconde`,
  eachSecondItAndTakeDamage: (p) =>
    `chaque seconde, ${p.hitsBearer ? "lui et " : ""}${p.foes} subissent ${p.damage} dégâts${kindWord(p.kind)}${p.more}`,
  second: () => "seconde",
  seconds2: (p) => `${p.every} secondes`,
  everySecondSeconds: (p) => `toutes les ${p.value} : ${p.what}`,
  itsSpiritLosesHealthForEachOne: (p) =>
    `son esprit perd ${p.amount} de santé pour chacun d'eux blessé`,
  itsSpiritLosesHealthForEachOne2: (p) =>
    `son esprit perd ${p.amount} de santé pour chacun d'eux soigné`,
  everyAttack: () => "chaque attaque",
  theNextAttack: () => "la prochaine attaque",
  theNextAttacks: (p) => `les ${p.times} prochaines attaques`,
  typelessAsDamage: (p) => (p.type === "typeless" ? "" : ` sous forme de ${damageKind(p.type)}`),
  ofTheDamageOfThatHitIt: (p) =>
    `${p.share}% des dégâts de ${p.attacks} qui le touchent reviennent à l'attaquant${p.kind}, jusqu'à ${p.max}`,
  eachAttackItLandsHasAChance: (p) =>
    `chaque attaque qu'il porte a ${p.chance}% de chances de lui infliger ses dégâts à la place, jusqu'à ${p.max}`,
  theNextDamageOrLifeStealHeals: (p) =>
    `les prochains dégâts ou vol de vie soignent d'autant à la place, jusqu'à ${p.reversesNextDamage}`,
  theNextDamageIsNegatedAndIts: (p) =>
    `les prochains dégâts sont annulés et leur source les subit à la place, jusqu'à ${p.cap}`,
  meleeAttacksNeitherHitNorFailTo: (p) =>
    `les attaques de mêlée ne touchent ni ne ratent, et infligent chacune ${p.damage} dégâts à la place`,
  allDamageHealsForThatMuchInstead: (p) =>
    `tous les dégâts soignent d'autant à la place, jusqu'à ${p.cap} par coup`,
  theNextDamageOrLifeStealThat: (p) =>
    `les prochains dégâts ou vol de vie qui ${p.selfOnly ? "te tueraient" : "le tueraient"} sont annulés`,
  whenOneAllySIsSpentIt: () =>
    "quand celui d'un allié est épuisé, il prend fin sur tous les autres",
  gainMoreStrikeStrikesOfAdrenalinePer: (p) =>
    `gagne ${p.extraStrikesPerHit} ${p.extraStrikesPerHit2 === 1 ? "coup" : "coups"} d'adrénaline de plus par coup porté`,
  skillsRechargeFaster: (p) => `les compétences se rechargent ${p.skillRechargeFaster}% plus vite`,
  skillsCostMoreLessEnergy: (p) =>
    `les compétences coûtent ${p.change}% d'énergie ${p.change2 > 0 ? "de plus" : "de moins"}`,
  spellsAndBindingRitualsRechargeFaster: (p) =>
    `les sorts et les rituels de lien se rechargent ${p.faster}% plus vite`,
  spellsRechargeFaster: (p) => `les sorts se rechargent ${p.spellRechargeFaster}% plus vite`,
  bindingRitualsRechargeFaster: (p) => `les rituels de lien se rechargent ${p.faster}% plus vite`,
  enchantmentsRechargeFaster: (p) =>
    `les enchantements de ${p.name} se rechargent ${p.faster}% plus vite`,
  hexTheTargetSYour: (p) => (p.category === "hex" ? "ses" : "tes"),
  skillsHaveArmorPenetration: (p) =>
    `les compétences de ${p.name} ont ${p.pierce}% de pénétration d'armure`,
  yourTheBearerSSkillsCannotBe: (p) =>
    `les compétences ${p.selfOnly ? "que tu utilises" : "du porteur"} ne peuvent pas être interrompues`,
  theNextTimeYouWouldBeInterrupted: () =>
    "la prochaine fois que tu devrais être interrompu, tu ne l'es pas",
  youCannotBeInterruptedEachTimeYou: (p) =>
    `tu ne peux pas être interrompu ; chaque fois que tu devrais l'être, perds ${p.amount} d'énergie ou cet effet prend fin`,
  youCannotBeInterruptedEachTimeYou2: (p) =>
    `tu ne peux pas être interrompu ; chaque fois que tu devrais l'être, perds 1 enchantement de ${p.profession} ou cet effet prend fin`,
  conditionsOnExpireFaster: (p) => `les altérations sur ${p.bearer} expirent ${p.faster} plus vite`,
  hexesOnExpireFaster: (p) => `les maléfices sur ${p.bearer} expirent ${p.faster}% plus vite`,
  theNextHexOnLastsLonger: (p) =>
    `le prochain maléfice ${p.of} sur ${p.bearer} dure ${p.longer} plus longtemps`,
  hexesCastOnTakeAsLongTo: (p) =>
    `les maléfices lancés sur ${p.bearer} mettent ${p.times}× plus de temps à être lancés`,
  otherAlliesSpellsOnTakeAsLong: (p) =>
    `les sorts des autres alliés sur ${p.bearer} mettent ${p.times}× plus de temps à être lancés`,
  yourSpellsOnTakeAsLongTo: (p) =>
    `tes sorts sur ${p.bearer} mettent ${p.times}× plus de temps à être lancés`,
  enchantmentsCastOnCostLessEnergyMinimum: (p) =>
    `les enchantements lancés sur ${p.bearer} coûtent ${p.less} d'énergie de moins, minimum 1`,
  hitsWithAnAttack: () => "touche avec une attaque",
  failsToHit: () => "rate son coup",
  hitsWithAnAttackSkill: () => "touche avec une compétence d'attaque",
  skillEffectEndsIfYouUseA: (p) =>
    p.selfOnly || p.category === "skill-effect"
      ? "prend fin si tu utilises une compétence"
      : "prend fin si le porteur utilise une compétence",
  endsIfYouUseAnAdrenalSkill: () => "prend fin si tu utilises une compétence d'adrénaline",
  endsIfYouUseANonAdrenal: () => "prend fin si tu utilises une compétence sans adrénaline",
  endsIfYouUseANonSkill: (p) =>
    `prend fin si tu utilises une compétence qui n'est pas de type ${p.kind}`,
  endsIfYouUseAnAttackSkill: () => "prend fin si tu utilises une compétence d'attaque",
  endsIfYouUseASkillOn: () => "prend fin si tu utilises une compétence sur lui",
  endsIfYouUseASkillThat: (p) =>
    `prend fin si tu utilises une compétence qui n'est pas de type ${p.NEXT_SKILL_KIND}`,
  hexHexedEnchanted: (p) => (p.category === "hex" ? "maudit" : "enchanté"),
  becomesOr: (p) => `devient ${p.gained}`,
  theBearerIsDestroyedWhenItExpires: () => "le porteur est détruit quand l'effet expire",
  theMinionsYouItTookBecomeMasterless: (p) =>
    `les serviteurs ${p.selfOnly ? "que tu as pris" : "qu'il a pris"} deviennent sans maître à la fin de l'effet`,
  whenTheBearerDiesRisesWhereIt: (p) =>
    p.masterless === true
      ? `quand le porteur meurt, ${p.stands} se relève là où il est tombé, sans maître`
      : `quand il meurt, ${p.stands} se dresse à sa place`,
  composedKindBoundWhenOn: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.on],
  endsIfItEndsIfYou: (p) =>
    p.onFoe ? `prend fin s'il ${p.when}` : `prend fin si tu ${secondPerson(p.when)}`,
  all: (p) =>
    p.once && p.against === "all"
      ? p.text.replace(/^la prochaine fois que (?:tu bloques|il bloque) /, "si c'est ")
      : p.text,
  whileHoldingAnItem: (p) =>
    p.onlyWhileHoldingItem && !p.holdingSaid ? `${p.stats} en tenant un objet` : p.stats,
  composedIndexText: (p) => (p.index === 0 ? p.text : capitalize(p.text)),
  listSentence: () => ". ",
  physicalAttacks: (p) =>
    p.weapon !== undefined
      ? attacksWith(p.weapon)
      : p.physicalOnly
        ? "attaques physiques"
        : "attaques",
  attackSkillsPhysicalAttacks: (p) => (p.attackSkillsOnly ? attackSkillsWith(p.weapon) : p.value),
  foesYourHitGetFor: (p) =>
    `les ennemis que tes ${p.attacks} touchent subissent ${p.statusName} pendant ${p.durationSeconds}`,
  foesYourHitTake: (p) => `les ennemis que tes ${p.attacks} touchent subissent ${p.riderDamage}`,
  foesYourHitLose: (p) =>
    `les ennemis que tes ${p.attacks} touchent perdent ${p.count} ${categoryNoun(p.count2, p.category)}`,
  andSoDoFoesAdjacentToThem: (p) => `${p.pop}, de même que les ennemis qui leur sont adjacents`,
  stealUpToHealth: (p) => `${p.attacks} volent jusqu'à ${p.amount} de santé`,
  yourPetSAttacksHealYouFor: (p) => `les attaques de ton familier te soignent de ${p.amount}`,
  yourInterruptFoesTheyHit: (p) => `tes ${p.attacks} interrompent les ennemis qu'elles touchent`,
  your: (p) => `tes ${p.attacks} : ${p.text}`,
  attackSkillsPhysicalAttacks2: (p) =>
    p.attackSkillsOnly
      ? attackSkillsWith(p.weapon)
      : p.weapon === undefined
        ? "attaques physiques"
        : attacksWith(p.weapon),
  foesThatBlockYourGetFor: (p) =>
    `les ennemis qui bloquent tes ${p.attacks} subissent ${p.statusName} pendant ${p.durationSeconds}`,
  foesThatBlockYour: (p) => `les ennemis qui bloquent tes ${p.attacks} : ${lowerFirst(p.text)}`,
  damage: (p) => damage(p.amount, p.type),
  physical: () => "physique",
  elemental: () => "élémentaire",
  armor2: () => "armure",
  listSpace: () => " ",
  againstProjectileAttacks: (p) =>
    p.projectile ? `${kindedArmor(p.text)} contre les projectiles` : kindedArmor(p.text),
  thatAllyIsHealedFor: (p) => `cet allié est soigné de ${p.amount}`,
  youLoseItsCasterLoses: (p) => (p.bearerIsCaster ? "tu perds" : "son lanceur perd"),
  energy2: (p) => `${p.who} ${p.amount} d'énergie`,
  orSpell: (p) => `sort de ${p.value}`,
  wheneverYouCastItCastsAnA: (p) =>
    `chaque fois ${que(casts(p.bearerIsCaster))} un ${p.spell} sur un allié, ${p.value}`,
  composedKindBoundWhenEvent: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.event],
  youOrItOr: (p) => (p.bearerIsCaster ? `tu ${p.phrases}` : `il ${p.phrases2}`),
  whenItOrOrAtOnce: (p) =>
    p.length === 0 ? p.death : `quand il ${p.others}, ou immédiatement ${p.death}`,
  whenItOr: (p) => `quand il ${p.on}`,
  composedBearerIsCaster: (p) => (p.bearerIsCaster ? YOUR_NEXT_SKILL : NEXT_SKILL),
  theNextTime: (p) => `la prochaine fois ${que(p.doer)}`,
  composedEventWhenOf: (p) => ARROWS_WHEN[p.event] ?? p.whenOf,
  wheneverYourArrowsOr: (p) => `chaque fois que tes flèches ${p.on}`,
  wheneverOnACreatureWithLessHealth: (p) =>
    `chaque fois ${que(p.doer)}${p.victimHasLessHealth === undefined ? "" : " sur une créature ayant moins de santé"}`,
  and2: () => ", et ",
  andAnd: (p) => (p.when === undefined ? p.each : `${p.when} : ${p.each}`),
  youItAnd: (p) => `${p.when} : ${p.bearerIsCaster ? "toi" : "lui"} et ${p.answer}`,
  youAndAllPartyMembersAreHealed: (p) =>
    `${DROPPED} : toi et tous les membres du groupe êtes soignés de ${p.healed}`,
  composedWhat: (p) => `${DROPPED} : ${p.what}`,
  meleeHitsWithAMeleeAttackHits: (p) =>
    p.weapon === "melee"
      ? "touche avec une attaque de mêlée"
      : `touche avec ${NEEDED_WEAPON[p.weapon]}`,
  meleeIsHitByAFoeS: (p) =>
    p.weapon === "melee"
      ? "est touché par l'attaque de mêlée d'un ennemi"
      : `est touché par une attaque ennemie avec ${NEEDED_WEAPON[p.weapon]}`,
  with3: (p) => `${TRIGGER_WHEN[p.event]} avec ${NEEDED_WEAPON[p.weapon]}`,
  youGainEnergy: (p) => `tu gagnes ${p.amount} d'énergie`,
  allYourSkillsAreRecharged: () => "toutes tes compétences sont rechargées",
  yourPartyIsHealedFor: (p) => `ton groupe est soigné de ${p.amount}`,
  takeDamage: (p) => `${lowerFirst(p.upTo)} subissent ${damage(p.amount, p.type)}`,
  areHealedFor: (p) => `${lowerFirst(p.upTo)} sont soignés de ${p.amount}`,
  composedUpToText: (p) => `${lowerFirst(p.upTo)} : ${lowerFirst(p.text)}`,
  ifTargetFoeDiesWhileHexedWith: (p) =>
    p.bearerIsFoe
      ? "si l'ennemi ciblé meurt sous ce maléfice"
      : "si un allié meurt sous cet enchantement",
  and3: (p) => `${p.who}, ${p.flatMap}`,
  hasASpellInterrupted: () => "voit un sort interrompu",
  isStruckForDamageWhileUsingA: (p) =>
    `subit des ${damageKind(p.damageType)} en utilisant une compétence`,
  takesDamageFromAFoe: (p) => `subit des ${damageKind(p.damageType)} d'un ennemi`,
  takesMoreThanDamageFromAFoe: (p) => `subit plus de ${p.minDamage} dégâts d'un ennemi`,
  hasItsHealthDroppedBelowByDamage: (p) =>
    `voit sa santé passer sous ${p.healthBelow}% à cause de dégâts`,
  isMoreThanFromYou: (p) => `est à plus de ${p.apartBeyond} de toi`,
  hitsWithAAttack: (p) => `touche avec une attaque ${chainRole(p.chainRole)}`,
  isHitByAnAttackAAttack: (p) =>
    `est touché par ${p.role === undefined ? "une attaque" : `une attaque ${chainRole(p.role)}`} de son lanceur`,
  blocksAAttack: (p) =>
    p.blocked === "melee" ? "bloque une attaque de mêlée" : "bloque un projectile",
  losesAEnchantment: (p) => `perd un enchantement de ${p.name}`,
  hex2: (p) =>
    p.scopeAdjective === ""
      ? "maléfice"
      : p.scopeAdjective === "primary" || p.scopeAdjective === "elemental"
        ? `maléfice ${ids(p.scopeAdjective)}`
        : `maléfice de ${p.scopeAdjective}`,
  appliesAnAToAFoe: (p) => `applique un ${p.words} à un ennemi`,
  spell: (p) => (p.type === undefined ? "sort" : typeName(p.type)),
  onAllyAnAllyAFoe: (p) => ` sur ${p.targets === "ally" ? "un allié" : "un ennemi"}`,
  castsAnA: (p) => `lance un ${ids(p.words)}${p.on}`,
  non: (p) => `non-${SKILL_WORD[p.notType]}`,
  elite: () => "d'élite",
  adrenal: () => "d'adrénaline",
  skill: () => "compétence",
  isTargetedByYour: (p) => `est pris pour cible par ta ${p.words}`,
  on: (p) =>
    p.targets === undefined
      ? ""
      : ` sur ${{ ally: "un allié", "other-ally": "un autre allié", foe: "un ennemi" }[p.targets]}`,
  usesAnA: (p) => `utilise une ${p.words}${p.on}`,
  health2: (p) => `${p.amount} de santé`,
  energy3: (p) => `${p.amount} d'énergie`,
  takeDamage2: (p) => `subissent ${damage(p.amount, p.type)}`,
  loseAllAllS: (p) =>
    `perdent ${p.value === "all" ? "tous leurs" : p.value} ${typeof p.count === "number" && p.count === 1 ? categoryOne(p.category) : categoryMany(p.category)}`,
  all2: (p) => `tous les ${p.side}`,
  upTo: (p) => `jusqu'à ${p.maxTargets} ${withoutArticle(p.side)}`,
  withinOfThatCreature: (p) =>
    AREA_AROUND_CREATED.get(p.radius) ?? `à moins de ${p.radius2} de cette créature`,
  gain: (p) => `gagnent ${p.answer}`,
  youGain: (p) => `${p.when} : ${p.gains ? `tu gagnes ${p.answers}` : p.answers}`,
  onIt: () => "sur lui",
  damageOnIt: (p) => `${p.value}${damage(p.amount, p.type)} ${p.perCount}`,
  composedWhenWhat: (p) => `${p.when} : ${p.what}`,
  itsAdjacentAllies: () => "ses alliés adjacents",
  itsAlliesWithin: (p) => `ses alliés ${p.area ?? `à moins de ${p.radius}`}`,
  itsAdjacentAlliesItsAlliesWithin: (p) =>
    !p.bearerIsFoe ? `${lowerFirst(p.foesWithin)}${p.only}` : p.value,
  bearerBlocksMeleeMeleeProjectile: (p) =>
    p.on === "bearer-blocks-melee" ? "de mêlée" : "à distance",
  whenYouBlockYouAndAlliesAre: (p) =>
    `quand tu bloques, toi et les alliés ${p.area} êtes soignés de ${p.amount}`,
  eachBlockCostsYouEnergyOrThis: (p) =>
    `chaque blocage te coûte ${p.amount} d'énergie ou cet effet prend fin`,
  youGainEnergyForEachSuccessfulAttack: (p) =>
    `tu gagnes ${p.amount} d'énergie pour chaque attaque ${p.kind} bloquée`,
  wheneverYouBlockAAttackThisWay: (p) =>
    `chaque fois que tu bloques ainsi une attaque ${p.kind}, l'attaquant subit ${damage(p.amount, p.type)}`,
  withinOfYouFoes: (p) => `ennemis ${AREA_TEXT.get(p.radius) ?? `à moins de ${p.radius2} de toi`}`,
  ifYouBlockAAttackSufferFrom: (p) =>
    `si tu bloques une attaque ${p.kind}, ${p.foes} subissent ${p.statusName} pendant ${p.resolveMagnitudeAtRanks} secondes`,
  ifYouBlockAAttack: (p) =>
    `si tu bloques une attaque ${p.kind}, ${p.foes} : ${lowerFirst(p.text)}`,
  stealsHealthFromThatFoe: (p) => `vole ${p.amount} de santé à cet ennemi`,
  loses: (p) => `perd ${p.count} ${categoryNoun(p.count2, p.category)}`,
  itTakesDamage: (p) => `il subit ${damage(p.amount, p.type)}`,
  takeDamage3: (p) => `${p.splashed} subissent ${damage(p.amount, p.type)}`,
  thatAttackIsInterruptedAndAnd: (p) => `${p.when}, cette attaque est interrompue et ${p.hurt}`,
  itIsInterruptedAndYouLoseEnergy: (p) =>
    `${p.when}, il est interrompu et tu perds ${p.amount} d'énergie ou cet effet prend fin`,
  ofThatSkillSBaseEnergyCost: (p) => `${p.share} du coût d'énergie de base de cette compétence`,
  energy4: (p) => `${p.amount} d'énergie`,
  youAreHealedAreHealedIsHealed: (p) =>
    p.bearerIsCaster && p.length === 0
      ? "tu es soigné"
      : p.bearerIsCaster
        ? "êtes soignés"
        : "est soigné",
  forOfThatSkillSEnergyCost: (p) =>
    `${p.healed} de ${p.share} du coût d'énergie de cette compétence`,
  forWord: (p) => `${p.healed} de ${p.amount}`,
  plus: () => " plus ",
  youGainGainsPlus: (p) => `${p.bearerIsCaster ? "tu gagnes" : "gagne"} ${p.gains}`,
  theNearestOf: (p) => `le plus proche parmi ${p.splashed}`,
  upTo2: (p) => `jusqu'à ${p.maxTargets} ${withoutArticle(p.splashed)}`,
  itAndLoseEnergy: (p) => `lui et ${p.others} perdent ${p.amount} d'énergie`,
  bearerFoesFoesOtherFoes: (p) => (p.to === "bearer-foes" ? "ennemis" : "autres ennemis"),
  inTheAreaSufferItToo: (p) => `les ${p.who} dans la zone le subissent aussi`,
  ifASpellItThatSkill: (p) => (p.spellsOnly ? "si c'est un sort, il" : "cette compétence"),
  takesThisSkillSSlotForSeconds: (p) =>
    `${p.which} prend l'emplacement de cette compétence pendant ${p.seconds} secondes`,
  youEnterTheSameStance: () => "tu adoptes la même posture",
  youLoseEnergyOrThisEnds: (p) => `tu perds ${p.amount} d'énergie ou cet effet prend fin`,
  thatAttackIsInterrupted: (p) => `${p.when}, cette attaque est interrompue`,
  takes: (p) => `subit ${p.dealt} ${p.when}`,
  bearerFatalDamageNegatedAnd: (p) =>
    p.on === "bearer-fatal-damage-negated" ? "et" : `${p.when},`,
  theFoeWhoDealtItTakesDamage: (p) =>
    `${p.then} l'ennemi qui les a infligés subit ${damage(p.amount, p.type)}`,
  thatAttackerIsHealedFor: (p) => `${p.when}, cet attaquant est soigné de ${p.amount}`,
  bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p) =>
    p.on === "bearer-gains-enchantment" ? "enchantement" : "maléfice ou enchantement",
  theCasterOfThatTakesDamage: (p) =>
    `${p.when}, le lanceur de cet ${p.gained} subit ${damage(p.amount, p.type)}`,
  theHealerTakesDamage: (p) => `${p.when}, le soigneur subit ${damage(p.amount, p.type)}`,
  ofThatTarget: (p) => `${lowerFirst(p.upTo)} de cette cible ${p.what}${p.paid}`,
  healsItsCasterFor: (p) => `soigne son lanceur de ${p.amount} ${p.when}`,
  itsCasterGainsEnergy: (p) => `son lanceur gagne ${p.amount} d'énergie ${p.when}`,
  theNextSkillYouUseItUses: (p) =>
    `la prochaine compétence ${p.bearerIsCaster ? "que tu utilises" : "qu'il utilise"} met ${p.seconds} secondes de plus à se recharger`,
  itsCasterStealsHealth: (p) => `son lanceur vole ${p.amount} de santé ${p.when}`,
  theNearestOfTakes: (p) => `le plus proche parmi ${p.allies} subit`,
  take: (p) => `${p.allies} subissent`,
  upToTake: (p) => `jusqu'à ${p.maxTargets} ${withoutArticle(p.allies)} subissent`,
  composedAlliesText: (p) => `${p.allies} : ${lowerFirst(p.text)}`,
  onAFoe: (p) => `${p.when} sur un ennemi`,
  adjacentToYou: () => "adjacents à toi",
  withinAroundYou: (p) => `${p.area ?? `à moins de ${p.radius}`} autour de toi`,
  otherAdjacentToYouWithinAroundYou: (p) =>
    `${p.includesCentre === true ? "les" : "les autres"} ${withoutArticle(SPLASH_SIDE[p.hits]).replace(/^tes (autres )?/, "")} ${p.value}`,
  takeDamage4: (p) => `${p.yours}, ${p.reached} subissent ${damage(p.amount, p.type)}`,
  composedYoursReachedText: (p) => `${p.yours}, ${p.reached} : ${lowerFirst(p.text)}`,
  composedBearerIsCasterSaid: (p) =>
    p.bearerIsCaster ? yourCondition(p.said) : ifItWording(p.said),
  composedWhenConditionText: (p) => `${p.when}, ${p.condition} : ${lowerFirst(p.text)}`,
  bearer: (p) => lowerFirst(p.target === "bearer" ? p.bearer : p.text),
  nextAttackSkill: (p) => `prochaine compétence d'attaque : ${p.statusName} ${p.durationSeconds}`,
  nextAttackSkill2: (p) => `prochaine compétence d'attaque : ${p.text}`,
  skillTargetAroundItsTarget: (p) => (p.at === "skill-target" ? " (autour de sa cible)" : ""),
  withYourNext: (p) => `avec ${yourNextPhrase(p.next)}${p.around} : ${lowerFirst(p.text)}`,
  costsCostEnergy: (p) => `${p.one ? "coûte" : "coûtent"} ${p.energyBase} d'énergie`,
  costsCostLessEnergy: (p) =>
    `${p.one ? "coûte" : "coûtent"} ${p.energyPercentOff} d'énergie de moins`,
  costsCostLessEnergyMinimum: (p) =>
    `${p.one ? "coûte" : "coûtent"} ${p.energyDiscount} d'énergie de moins (minimum ${p.energyFloor})`,
  costsCostMoreEnergy: (p) =>
    `${p.one ? "coûte" : "coûtent"} ${p.energySurcharge} d'énergie de plus`,
  castsCastInstantly: (p) => `${p.one ? "s'incante" : "s'incantent"} instantanément`,
  castsCastFaster: (p) =>
    `${p.one ? "s'incante" : "s'incantent"} ${p.activationMultiplier} plus vite`,
  takesTakeAsLongToCast: (p) =>
    `${p.one ? "met" : "mettent"} ${p.activationMultiplier}× plus de temps à être lancé${p.one ? "" : "s"}`,
  castsCastFaster2: (p) =>
    `${p.one ? "s'incante" : "s'incantent"} ${p.activationSecondsLess} plus vite`,
  rechargesRechargeFaster: (p) =>
    `${p.one ? "se recharge" : "se rechargent"} ${p.rechargeFaster} plus vite`,
  rechargesRechargeSlower: (p) =>
    `${p.one ? "se recharge" : "se rechargent"} ${p.rechargeSlower} plus lentement`,
  lastsLastLongerShorter: (p) =>
    `${p.one ? "dure" : "durent"} ${p.durationMultiplier} ${p.durationMultiplier2 > 1 ? "plus longtemps" : "moins longtemps"}`,
  healsHealLessMoreNotTheDivine: (p) =>
    `${p.one ? "soigne" : "soignent"} ${p.value} ${p.healMultiplier < 1 ? "de moins" : "de plus"}${p.sparesDivineFavor ? ", mais pas le bonus de Faveur divine" : ""}`,
  isAreNotEasilyInterrupted: (p) =>
    p.one ? "n'est pas facilement interrompu" : "ne sont pas facilement interrompus",
  overcastYouBy: (p) => `te causent ${p.overcastPerUse} de surcharge`,
  andAttack: (p) => `attaque ${ids(p.chainRoles)}`,
  attackSkillSkill: (p) =>
    p.weapon !== undefined
      ? `compétence d'attaque ${WEAPON_WORD[p.weapon]}`
      : p.type === undefined
        ? "compétence"
        : SKILL_WORD[p.type],
  hexHexesS: (p) => (p.one ? p.kind : plural(p.kind)),
  thatTargetsAFoeThatTargetA: (p) => (p.one ? "qui cible un ennemi" : "qui ciblent un ennemi"),
  thatTargetsYouThatTargetYou: (p) => (p.one ? "qui te cible" : "qui te ciblent"),
  halfRanged: () => "à demi-portée",
  notFlashEnchantments: (p) => (p.notFlash ? " (hors enchantements éclair)" : ""),
  whileHoldingAnItem2: (p) => (p.whileHoldingItem ? "en tenant un objet, " : ""),
  nextNext: (p) =>
    p.one
      ? `${p.whose === "ses" ? "sa" : "ta"} prochaine utilisation de`
      : `${p.whose} ${p.uses} prochaines utilisations de`,
  cannotBeInterrupted: () => "ne peut pas être interrompue",
  cannotBeBlocked: () => "ne peut pas être bloquée",
  costsLessEnergy: (p) => `coûte ${p.energyDiscount} d'énergie de moins`,
  castsInstantly: () => "s'incante instantanément",
  rechargesInstantly: () => "se recharge instantanément",
  s2: (p) => `${p.value} s`,
  takesSLongerToRecharge: (p) => `met ${p.extraRechargeSeconds} de plus à se recharger`,
  yourNextAnd: (p) => `${yourNextOf(p.NEXT_SKILL_KIND)} ${p.does}`,
  youLoseAllEnergyAsItIs: () => "tu perds toute ton énergie au moment de le lancer",
  youGainOfItsEnergyCost: (p) => `tu gagnes ${p.energyGainOfCost} de son coût d'énergie`,
  itRechargesFaster: (p) => `il se recharge ${p.fraction}% plus vite`,
  rechargesInstantly2: (p) => `${p.name} se recharge instantanément`,
  forYourNextSkill: () => "pour ta prochaine compétence",
  ifItIsAAnd: (p) => `si c'est un ${p.kind}, ${p.does}`,
  suffer: (p) => `subissent ${p.sufferedWhat}`,
  forWord2: (p) => `${p.statusName} pendant ${p.durationSeconds} (${p.status})`,
  a: (p) => `${CATEGORY_NAME[p.category][2]} ${categoryOne(p.category)} de ${p.owners}`,
  ifItInterruptsASkill: () => "Si cela interrompt une compétence",
  ifThatActionWasASpell: () => "Si cette action était un sort",
  ifThatActionWasAnAttack: () => "Si cette action était une attaque",
  ifItKillsTheTarget: () => "Si cela tue la cible",
  ifItResurrects: () => "Si cela ressuscite",
  ifASpiritDiedInThisWay: () => "Si un esprit est mort ainsi",
  ifWasRemoved: (p) =>
    `Si ${aCategory(p.category)} a été ${isFeminine(p.category) ? "retirée" : "retiré"}`,
  ifItRemoves: (p) => `Si cela retire ${aCategory(p.category)}`,
  ifTargetIsBelowHealth: (p) => `Si la cible est sous ${p.fraction}% de santé`,
  ifTargetIsAboveHealth: (p) => `Si la cible est au-dessus de ${p.fraction}% de santé`,
  ifYouHaveLessThanHealth: (p) => `Si tu as moins de ${p.fraction}% de santé`,
  ifYouHaveLessHealthThanYour: () => "Si tu as moins de santé que ton familier",
  ifYourPetHasLessHealthThan: () => "Si ton familier a moins de santé que toi",
  ifItFollowsOffHandAnOff: (p) => `Si elle suit une attaque ${chainRole(p.role)}`,
  ifTargetHas: (p) => `Si la cible a ${p.filteredCategory}`,
  ifTargetHasOr: (p) => `Si la cible a ${p.categories}`,
  ifYouHave: (p) => `Si tu as ${aCategory(p.category)}`,
  ifYouHaveA: (p) =>
    `Si tu as ${CATEGORY_NAME[p.category][2]} ${categoryOne(p.category)} de ${p.name}`,
  other: (p) => (p.excluding === undefined ? "" : "autre "),
  ifYouHaveNo: (p) =>
    `Si tu n'as ${isFeminine(p.category) ? "aucune" : "aucun"} ${p.other}${categoryOne(p.category)}`,
  ifYouHaveNo2: (p) =>
    `Si tu n'as ${isFeminine(p.category) ? "aucune" : "aucun"} ${p.other}${categoryOne(p.category)} de ${p.name}`,
  ifTargetIsCastingASpellOr: (p) =>
    p.orChant === true
      ? "Si la cible est en train de lancer un sort ou un chant"
      : "Si la cible est en train de lancer un sort",
  ifTargetIsUsingASkill: () => "Si la cible est en train d'utiliser une compétence",
  ifTargetHasNoOtherHex: (p) => `Si la cible n'a aucun autre maléfice de ${p.name}`,
  ifTargetIsNotAdjacentToAny: () => "Si la cible n'est adjacente à aucun allié",
  ifTargetIsNotNearAnyAllies: () => "Si la cible n'est près d'aucun allié",
  ifTargetHasNoAlliesWithin: (p) => `Si la cible n'a aucun allié à moins de ${p.radius}`,
  ifTargetIsNearAnyOfYour: () => "Si la cible est près d'un de tes alliés",
  ifAnyOfYourAlliesIsWithin: (p) => `Si l'un de tes alliés est à moins de ${p.radius} de la cible`,
  ifTargetIsWithinEarshot: () => "Si la cible est à portée de voix",
  ifTargetIsWithinOfYou: (p) => `Si la cible est à moins de ${p.radius} de toi`,
  ifTargetIsNotMoving: () => "Si la cible est immobile",
  ifTargetIsKnockedDown: () => "Si la cible est renversée",
  ifTargetIsMoving: () => "Si la cible est en mouvement",
  ifTargetIsAFoe: () => "Si la cible est un ennemi",
  ifTargetIsMovingFasterThanNormal: () => "Si la cible se déplace plus vite que la normale",
  ifAnyFoeIsKnockedDownIf: (p) =>
    p.knockedDown === true ? `Si un ennemi ${p.where} est renversé` : `Si un ennemi est ${p.where}`,
  ifYouHitOrMoreFoes: (p) => `Si tu touches au moins ${p.atLeast} ennemis`,
  ifNumberOrMore: (p) => `Si ${les(p.countAll)} sont au moins ${p.atLeast}`,
  ifAreNoMoreThan: (p) => `Si ${les(p.countAll)} ne sont pas plus nombreux que ${les(p.countAll2)}`,
  ifTargetHas2: (p) => `Si la cible a ${p.statusName}`,
  ifTargetDoesNotHave: (p) => `Si la cible n'a pas ${p.statusName}`,
  ifYouHaveMoreEnergyThanTarget: () => "Si tu as plus d'énergie que la cible",
  ifYouHaveLessThanEnergy: (p) => `Si tu as moins de ${p.amount} d'énergie`,
  ifYouAreOvercast: () => "Si tu es en surcharge",
  ifYouWield: (p) => `Si tu manies ${NEEDED_WEAPON[p.weapon]}`,
  ifYouHoldAShield: () => "Si tu tiens un bouclier",
  ifYouAreHoldingAnItem: () => "Si tu tiens un objet",
  ifTargetHasLessHealthThanYou: () => "Si la cible a moins de santé que toi",
  ifTargetHasMoreHealthThanYou: () => "Si la cible a plus de santé que toi",
  ifTargetIsAttacking: () => "Si la cible est en train d'attaquer",
  ifTargetIsNotAttacking: () => "Si la cible n'est pas en train d'attaquer",
  ifTargetIsCastingASpellOr2: () => "Si la cible est en train de lancer un sort ou d'attaquer",
  ifTargetIsASummonedCreature: () => "Si la cible est une créature invoquée",
  ifNoSpiritIsWithinOfYou: (p) => `Si aucun esprit n'est ${ofYou(p.radius, p.radius2)}`,
  ifASpiritIsWithinOfYou: (p) => `Si un esprit est ${ofYou(p.radius, p.radius2)}`,
  ifYouControlOrFewerS: (p) => `Si tu contrôles au plus ${p.count} ${plural(ids(p.creature))}`,
  ifASpiritOrACorpseIs: (p) => `Si un esprit ou un cadavre est ${ofYou(p.radius, p.radius2)}`,
  ifAnAllyIsDeadWithin: (p) =>
    `Si un allié est mort ${areaOr(p.radius, p.radius2).replace(/^adjacents$/, "adjacent")}`,
  ifTargetIsNearACorpseOr: () => "Si la cible est près d'un cadavre ou si son familier est mort",
  ifTargetIsWithinOfACorpse: (p) =>
    `Si la cible est à moins de ${p.radius} d'un cadavre ou si son familier est mort`,
  composedType: (p) => (p.type === undefined ? "" : typeWord(p.type)),
  healthForEachAllyMax: (p) => `, +${p.amount} de santé pour chaque allié ${p.area} (max ${p.max})`,
  allPartyMembers: () => "Tous les membres du groupe",
  allItsPartyMembers: () => "Tous les membres de son groupe",
  allAlliedMinions: () => "Tous les serviteurs alliés",
  yourOtherMinions: () => "Tes autres serviteurs",
  within2: (p) => capitalize(`${les(lowerFirst(p.Who))} ${p.area ?? `à moins de ${p.radius}`}`),
  adjacent: (p) =>
    capitalize(`${les(p.who)} ${p.who.startsWith("créatures") ? "adjacentes" : "adjacents"}`),
  nearby: (p) => capitalize(`${les(p.who)} à proximité`),
  within3: (p) => capitalize(`${les(lowerFirst(p.Who))} ${p.area ?? `à moins de ${p.radius}`}`),
  loseThatSame: (p) =>
    `perdent ${isFeminine(p.category) ? "cette même" : "ce même"} ${categoryOne(p.category)}`,
  loseAllAll: (p) => `perdent tous leurs ${categoryMany(p.category)}`,
  onThem: () => "sur eux",
  loseOneForEachOnThem: (p) =>
    `perdent ${CATEGORY_NAME[p.category][2]} ${categoryOne(p.category)} pour chaque ${p.countEach}`,
  lose: (p) => `perdent ${p.count} ${categoryNoun(p.count2, p.category)}`,
  enchantmentAnA: (p) => (p.onlyBearing === undefined ? "un" : CATEGORY_NAME[p.onlyBearing][2]),
  with4: (p) =>
    p.onlyBearing === undefined ? "" : ` avec ${p.article} ${categoryOne(p.onlyBearing)}`,
  usingSkills: (p) =>
    p.onlyUsing === undefined ? "" : ` qui utilisent des ${plural(typeName(p.onlyUsing))}`,
  dead: (p) => (p.dead === true ? `Les morts parmi ${lowerFirst(p.living)}` : p.living),
  targetAndCasterAroundYouCasterAround: (p) =>
    `${p.includesCentre === true ? `La cible et ${lowerFirst(p.reached)}` : p.reached}${p.around === "caster" ? " autour de toi" : ""}${p.alsoAround === "caster" ? " autour de la cible et de toi" : ""}${p.bearing}${p.using}${p.onlyIf}`,
  upTo3: (p) => `Jusqu'à ${p.maxTargets} ${withoutArticle(lowerFirst(p.who))}`,
  inItsRange: () => "à sa portée",
  inTheArea: () => "dans la zone",
  foes: () => "ennemis",
  allEveryoneYouAndAlliesAllies: (p) =>
    p.affects === "all" ? "tout le monde" : p.includesCaster ? "toi et les alliés" : "les alliés",
  enemiesFoesAllEveryoneYouAndAllies: (p) => `${p.value} ${areaOr(p.radius, p.radius2)}`,
  whenSprung: () => "au déclenchement",
  after: (p) => `après ${seconds(p.delaySeconds)}`,
  everyFor: (p) => `toutes les ${seconds(p.everySeconds)} pendant ${seconds(p.count)}`,
  whenItEnds: (p) => `À la fin, ${p.whom} : `,
  springsByItselfAsItsTimeRuns: () => "Se déclenche tout seul quand son temps s'écoule",
  composedWhoText: (p) => `${capitalize(p.who)} : ${lowerFirst(p.text)}`,
  composedEndingText: (p) => `${p.ending}${lowerFirst(p.text)}`,
  composedConditionText: (p) => `${p.condition} : ${lowerFirst(p.text)}`,
  itsAttacksDealDamage: (p) => `Ses attaques infligent ${p.magnitude} dégâts`,
  thisSpiritLosesHealth: (p) => `cet esprit perd ${p.magnitude} de santé`,
  composedCondition: (p) => `${lowerFirst(p.condition)} : `,
  itsAttacks: (p) => `Ses attaques : ${p.when}${p.what}`,
  health3: (p) => `${p.health} de santé`,
  health4: (p) => `${p.health} de santé (${p.health2})`,
  level: (p) => `niveau ${p.marked}, `,
  lastsSeconds: (p) => `, dure ${p.durationSeconds} secondes`,
  composedCountNameLevelTextHealthTextLasts: (p) =>
    `${p.count} ${p.name} (${p.levelText}${p.healthText}${p.lasts})`,
  itsAttacksDealDamage2: (p) => `Ses attaques infligent ${p.value} dégâts`,
  onlyOneAtATimeANew: () => "Un seul à la fois : un nouveau tue l'ancien",
  leavesCorpseCorpsesWhenItDies: (p) =>
    `Laisse ${p.corpses} ${p.current === 1 ? "cadavre" : "cadavres"} à sa mort`,
  whenItDiesStandsUpInIts: (p) => `À sa mort, ${p.text} se dresse à sa place`,
  listSemicolon: () => " ; ",
  inItsRange2: (p) => AREA_TEXT.get(p.radius) ?? "à sa portée",
  composedAffectsWhere: (p) => `${AURA_WHO[p.affects].toLowerCase()} ${p.where}`,
  whenItDiesUnderHealthBeginFor: (p) =>
    `À sa mort, ${p.who} sous ${p.below} de santé commencent à subir ${p.statusName} pendant ${p.duration} secondes`,
  whenItDiesDeadPartyMembersAre: (p) =>
    `À sa mort, les membres du groupe morts ${p.where} sont ressuscités avec ${p.health}% de santé et sans énergie`,
  damageTakeDamageAreHealedForHealth: (p) =>
    p.effect === "damage" ? `subissent ${p.amount} dégâts` : `sont soignés de ${p.amount} de santé`,
  max: (p) => ` (max ${p.max})`,
  whenItDiesPerSecondItLived: (p) => `À sa mort, ${p.who} ${p.what} par seconde de vie${p.max}`,
  everySecondsHealsTheMostHurtNon: (p) =>
    `Toutes les ${p.everySeconds} secondes : soigne de ${p.heal} de santé l'allié hors esprits le plus blessé ${p.where}`,
  whenANonSpiritDiesInIts: () => "Quand une créature qui n'est pas un esprit meurt à sa portée",
  nearby2: (p) => AREA_TEXT.get(p.radius) ?? "à proximité",
  itsConditionsSpreadToEachNonSpirit: (p) =>
    `${p.when}, ses altérations se propagent à chaque créature hors esprits ${p.where} qui a une altération`,
  eachOfItsTypeInItsRange: (p) =>
    `${p.when}, chaque esprit de son type à sa portée sous ${p.below} de santé subit ${p.damage} dégâts`,
  holdingAnItem: (p) => (p.onlyWhileHoldingItem ? " qui tiennent un objet" : ""),
  composedWhoWhereHoldingStatus: (p) => `${p.who} ${p.where}${p.holding} : ${p.status}`,
  perFoeHit: (p) => (p.perTarget === undefined ? "" : " par ennemi touché"),
  forEachMeleeAttackSkillOnYour: (p) =>
    ` pour chaque compétence d'attaque de mêlée sur ta barre (au plus ${p.max})`,
  withinEarshot: (p) => (p.radius === EARSHOT ? "à portée de voix" : p.area),
  forEverySummonedCreatureYouControlMaximum: (p) =>
    ` pour chaque créature invoquée que tu contrôles ${p.where} (maximum ${p.max} d'énergie)`,
  composedZeroAloneEachText: (p) => (p.zero ? `${p.alone} ${p.each}` : `${p.text}, +${p.each}`),
  maximum: (p) => ` (maximum ${p.max})`,
  forEach: (p) => `pour chaque ${ids(p.countEach)}${p.max}`,
  pointOfEnergyGained: () => "point d'énergie gagné",
  pointOfEnergyRestrictedByOvercast: () => "point d'énergie restreint par la surcharge",
  skillDisabledInThisWay: () => "compétence désactivée ainsi",
  orCasterOnYou: (p) => `${ids(p.categories)} ${p.on === "caster" ? "sur toi" : p.onTarget}`,
  ofYourRecharging: (p) => `de tes ${p.rechargingSkillsNoun} en recharge`,
  pointOfEnergyCasterYouHaveThey: (p) =>
    `point d'énergie ${p.on === "caster" ? "que tu as" : "qu'elle a"}`,
  orRemoved: (p) => `${ids(p.categories)} retiré`,
  orLost: (p) => `${ids(p.categories)} de ${p.name} perdu`,
  enchantmentYouAreMaintaining: () => "enchantement que tu entretiens",
  secondItWasInEffect: () => "seconde où il a fait effet",
  foeKnockedDown: () => "ennemi renversé",
  youHaveEquipped: (p) => `${SKILL_WORD[p.type]} équipé sur ta barre`,
  adrenalineSkillTheyHave: () => "compétence d'adrénaline en sa possession",
  foeHit: () => "ennemi touché",
  within4: (p) => `${ids(p.perCountNoun)} ${areaOr(p.radius, p.radius2)}`,
  attacksSkillsS: (p) =>
    p.weapon !== undefined
      ? attacksWith(p.weapon)
      : p.type === undefined
        ? "compétences"
        : plural(SKILL_WORD[p.type]),
  casterYourTargetS: (p) => (p.on === "caster" ? "tes" : "ses"),
  s3: (p) => plural(ids(p.perCountNoun)),
  pointOfOvercast: () => "point de surcharge",
  skillDisabled: () => "compétence désactivée",
  rechargingSkill: () => "compétence en recharge",
  pointOfEnergy: () => "point d'énergie",
  removedOr: (p) => `${ids(p.categories)} retiré`,
  removedOr2: (p) => `${ids(p.categories)} de ${p.name} retiré`,
  maintainedEnchantment: () => "enchantement entretenu",
  secondHeld: () => "seconde de maintien",
  adrenalineSkill: () => "compétence d'adrénaline",
  deadAlly: () => "allié mort",
  knockedDownFoeFoe: (p) => (p.knockedDown === true ? "ennemi renversé" : "ennemi"),
  ally: () => "allié",
  neverAbove: (p) => `, jamais au-dessus de ${p.upTo}`,
  forEachRemoved: (p) =>
    p.toTarget === true || p.perRemoved === undefined
      ? ""
      : ` pour chaque ${categoryOne(p.perRemoved)} ${isFeminine(p.perRemoved) ? "retirée" : "retiré"}`,
  perPointLost: (p) => (p.perEnergyLost === undefined ? "" : " par point perdu"),
  armorPenetration: (p) => ` (${p.armorPenetration}% de pénétration d'armure)`,
  dealsDamage2: (p) => `Inflige ${damage(p.magnitude, p.type)}${p.perPointLost}${p.penetration}`,
  deals: () => "Inflige",
  damage2: (p) => ` dégâts${typeWord(p.type)}`,
  composedCountedConditionAmount: (p) => `${p.counted} ; ${lowerFirst(p.condition)} : +${p.amount}`,
  gainHealthEqualToThisSpellS: () => "Gagne de la santé égale au bonus de Faveur divine de ce sort",
  healsIfRelievedOf: (p) => `Soigne ${p.amount} si tu es débarrassé de ${p.name}`,
  healsForOfYourCurrentHealthMaximum: (p) =>
    `Soigne ${p.magnitude} de ta santé actuelle (maximum ${p.max} de santé)`,
  youGainHealth: (p) => `Tu gagnes ${p.amount} de santé`,
  yourPetGainsHealth: (p) => `Ton familier gagne ${p.amount} de santé`,
  ownerHealsItsOwnerForHealsFor: (p) =>
    p.recipient === "owner" ? `Soigne son maître de ${p.amount}` : `Soigne ${p.amount}`,
  healsForEachRemovedHealsForEach: (p) =>
    p.perRemoved !== undefined
      ? `Soigne ${p.amount} pour chaque ${categoryOne(p.perRemoved)} ${isFeminine(p.perRemoved) ? "retirée" : "retiré"}`
      : p.perDestroyedSpirit === true
        ? `Soigne ${p.amount} pour chaque esprit détruit`
        : p.perEnergyLost === true
          ? `${p.recipient === "caster" ? "Tu es soigné de" : "Soigne"} ${p.amount} pour chaque point d'énergie perdu`
          : p.perUsedSkillEnergy === true
            ? `Soigne ${p.magnitude} du coût d'énergie du sort`
            : p.value,
  casterYouGainHeals: (p) => (p.recipient === "caster" ? "Tu gagnes" : "Soigne"),
  health5: () => " de santé",
  casterOnTargetFoeOnThem: (p) => (p.recipient === "caster" ? "sur l'ennemi ciblé" : "sur eux"),
  underHealth: (p) => `, sous ${p.onlyBelowHealthFraction}% de santé`,
  gainOfTheSkillSBaseEnergy: (p) =>
    `Gagne ${p.magnitude} du coût d'énergie de base de la compétence`,
  targetGainsOwnerYouGainGain: (p) =>
    p.toTarget === true ? "La cible gagne" : p.recipient === "owner" ? "Tu gagnes" : "Gagne",
  energy5: (p) =>
    `${p.gains} ${p.magnitude} d'énergie${p.perPointLost}${p.perFoeHit}${p.perOwnCreature}${p.perRemoved}`,
  energy6: () => " d'énergie",
  gain2: () => "Gagne",
  onTargetFoe: () => "sur l'ennemi ciblé",
  strikeStrikesOfAdrenalineAdrenaline: (p) =>
    p.units
      ? `${p.magnitude} ${p.current === 1 ? "coup" : "coups"} d'adrénaline`
      : `${p.magnitude} d'adrénaline`,
  youGain2: () => "Tu gagnes",
  targetTargetGainsGain: (p) => (p.recipient === "target" ? "La cible gagne" : "Gagne"),
  strikesOfAdrenaline: () => " coups d'adrénaline",
  targetRegainsAllEnergy: () => "La cible récupère toute son énergie",
  casterYouLoseTargetLoses: (p) => (p.on === "caster" ? "Tu perds" : "La cible perd"),
  energy7: (p) => `${p.who} ${p.magnitude} d'énergie`,
  stealsUpToEnergy: (p) => `Vole jusqu'à ${p.magnitude} d'énergie`,
  stealsUpToHealth: (p) => `Vole jusqu'à ${p.magnitude} de santé`,
  youStealHealth: (p) => `Tu voles ${p.magnitude} de santé`,
  youSacrificeOfYourMaximumHealth: (p) => `Tu sacrifies ${p.percentOfMax}% de ta santé maximale`,
  targetFoeLosesHealth: (p) => `La cible perd ${p.magnitude} de santé`,
  targetFoeLoses: () => "La cible perd",
  youLoseHealth: (p) => `Tu perds ${p.magnitude} de santé`,
  forEachEnchantmentRemoved: (p) => `${p.lose} pour chaque enchantement de ${p.whose} retiré`,
  loseAllButHealth: (p) => `Perds toute ta santé sauf ${p.magnitude}`,
  transferOfYourConditionsToFoes: (p) =>
    `Transfère ${p.magnitude} de tes altérations à ${p.foesWithin}`,
  max2: (p) => (p.maxSeconds === undefined ? "" : ` (max ${seconds(p.maxSeconds)})`),
  withTheTimeEachHasLeft: () => "avec le temps restant de chacune",
  withMoreTime: (p) => `avec ${p.extend}% de temps en plus${p.max}`,
  foesGetTheTargetSConditionsWith: (p) =>
    `${p.foesWithin} reçoivent les altérations de la cible, ${p.value}`,
  loseYourHealthHealForOfIt: (p) =>
    `Perds ${share(p.fractionOfCurrent)} ta santé ; soigne-toi de ${p.magnitude}% de cette perte`,
  whoeverOfYouAndTargetFoeHas: () =>
    "Celui de vous deux, toi ou l'ennemi ciblé, qui a le plus de santé perd la moitié de la différence ; l'autre gagne autant",
  stacksOnceForEachOnThem: (p) => `. Se cumule une fois pour chaque ${p.countEach}`,
  stacksOnceForEachOnThem2: (p) => `${p.status}${p.value}`,
  forWord3: (p) => `Pendant ${p.durationSeconds}, ${p.what}`,
  forEachHexRemoved: (p) => ` pour chaque maléfice de ${p.name} retiré)`,
  stackingOnceForEachOnThem: (p) => `, cumulable une fois pour chaque ${p.countEach}`,
  appliesCasterToYouForUntilIt: (p) =>
    `Applique ${p.statusName}${p.on === "caster" ? " sur toi" : ""} ` +
    (p.ends ? `pendant ${p.statusDuration} ` : "jusqu'à sa fin ") +
    `(${p.status}` +
    p.value +
    p.value2,
  composedStatusNameDurationSeconds: (p) => `${p.statusName} (${p.durationSeconds})`,
  appliesOneOfAtRandom: (p) => `Applique l'un des effets suivants, au hasard : ${p.choices}`,
  maintainedCasterOnYouEnergyRegenerationWhile: (p) =>
    `Entretenu${p.on === "caster" ? " sur toi" : ""} : −1 de régénération d'énergie tant qu'il dure. ` +
    `${capitalize(p.what)}.`,
  losesThatSame: (p) =>
    `Perd ${isFeminine(p.category) ? "cette même" : "ce même"} ${categoryOne(p.category)}`,
  casterLoseRemoves: (p) => (p.from === "caster" ? "Perds" : "Retire"),
  oneForEachRemovedMax: (p) =>
    `${p.verb} ${CATEGORY_NAME[p.category][2]} ${categoryOne(p.category)} pour chaque ${categoryOne(p.category2)} ${isFeminine(p.category2) ? "retirée" : "retiré"} (max ${p.max})`,
  oneForEachOnTarget: (p) =>
    `${p.verb} ${CATEGORY_NAME[p.category][2]} ${categoryOne(p.category)} pour chaque ${p.countEach}`,
  lose2: (p) =>
    `Perds ${p.count === "all" ? "tous tes" : p.count} ${categoryNoun(p.count2, p.category)}${p.whose === "" ? "" : ` de ${p.whose.trim()}`}`,
  endsTheTargetSStance: () => "Met fin à la posture de la cible",
  forEachSpiritWithinOfIt: (p) =>
    ` pour chaque esprit ${AREA_AROUND_TARGET.get(p.near) ?? `à moins de ${p.near2} d'elle`}`,
  numberUpTo: (p) => (typeof p.count === "number" && p.count > 1 ? "jusqu'à " : ""),
  and4: (p) => (p.orCategory === undefined ? "" : ` et ${categoryNoun(p.count, p.orCategory)}`),
  removes: (p) =>
    `Retire ${p.upTo}${p.count === "all" ? "tous les" : p.count} ${categoryNoun(p.count2, p.category)}${p.whose === "" ? "" : ` de ${p.whose.trim()}`}${p.and}${p.perSpirit}`,
  interruptsTheTargetSSpellIfThey: () => "Interrompt le sort de la cible, si elle en lance un",
  interruptsTheTargetSSpellOrChant: () =>
    "Interrompt le sort ou le chant de la cible, si elle en lance un",
  skillInterruptsTheTargetSSkillIf: (p) =>
    p.only === "skill"
      ? "Interrompt la compétence de la cible, si elle en utilise une"
      : "Interrompt l'action de la cible : une compétence ou une attaque",
  youAreKnockedDownFor: (p) => `Tu es renversé pendant ${seconds(p.durationSeconds)}`,
  knocksDownFor: (p) => `Renverse pendant ${seconds(p.durationSeconds)}`,
  shadowStepsToTheTarget: () => "Se téléporte par l'ombre auprès de la cible",
  youAndTheTargetShadowStepTo: () =>
    "Toi et la cible échangez vos positions en vous téléportant par l'ombre",
  corpseTeleportsYouToThatCorpseShadow: (p) =>
    p.to === "corpse"
      ? "Te téléporte auprès de ce cadavre"
      : "Te téléporte par l'ombre à un endroit proche, à l'opposé de ta cible",
  health6: (p) => `${p.percent}% de santé`,
  upToYourCurrentHealthYourHealth: (p) =>
    p.casterLosesFractionOfCurrent === 0
      ? "jusqu'à ta santé actuelle"
      : `ta santé après en avoir perdu ${share(p.casterLosesFractionOfCurrent).replace(/ de$/, "")}`,
  perPartyMemberWithin: (p) => ` par membre du groupe ${areaOr(p.radius, p.radius2)}`,
  casterAndTeleportsTheTargetToYou: (p) =>
    p.at === "caster" ? ", et téléporte la cible auprès de toi" : "",
  returnsTheTargetToLifeWithAnd: (p) =>
    `Ramène la cible à la vie avec ${p.healthText} et ${p.energy}% d'énergie${p.per}${p.teleport}`,
  returnsEveryDeadAlliedPetToLife: (p) =>
    `Ramène à la vie chaque familier allié mort ${p.where} avec ${p.health}% de santé`,
  youLoseAllYourRemainingEnergy: () => "Tu perds toute ton énergie restante",
  youGainFor: (p) =>
    `Tu gagnes ${p.statusName} pendant ${seconds(p.durationSeconds)} (${p.status})`,
  yourPetGainsFor: (p) => `Ton familier gagne ${p.statusName} pendant ${p.duration} (${p.status})`,
  yourPetMovesToYourTargetAnd: () => "Ton familier se déplace vers ta cible et l'attaque",
  teleportsTargetToYou: () => "Téléporte la cible auprès de toi",
  destroysTargetAlliedSpirit: () => "Détruit l'esprit allié ciblé",
  destroysTargetMinion: () => "Détruit le serviteur ciblé",
  nearestSpiritLosesHealthTargetAllyIs: (p) =>
    `L'esprit le plus proche perd ${p.magnitude} de santé ; l'allié ciblé est soigné de ${p.healPerPoint} par point`,
  nearestSpiritLosesAllEnergyYouGain: (p) =>
    `L'esprit le plus proche perd toute son énergie ; tu en gagnes ${p.magnitude}%`,
  itsOwnerGainsHealthEqualToThe: () => "Son maître gagne autant de santé que les dégâts infligés",
  destroysEveryAlliedSpiritWithin: (p) =>
    `Détruit tous les esprits alliés ${areaOr(p.radius, p.radius2)}`,
  thisSkillRecharges: () => "Cette compétence se recharge",
  secondsFaster: () => " secondes plus vite",
  thisSkillRechargesInstantly: () => "Cette compétence se recharge instantanément",
  thisSkillRechargesFaster: (p) => `Cette compétence se recharge ${p.fraction}% plus vite`,
  usedSkillThatSkillRechargesInstantlyThis: (p) =>
    p.of === "used-skill"
      ? "La compétence utilisée se recharge instantanément"
      : "Cette compétence se recharge instantanément",
  loseAllAdrenaline: () => "Perds toute ton adrénaline",
  rechargesAllYourOtherSkills: () => "Recharge toutes tes autres compétences",
  rechargesAllYourStances: () => "Recharge toutes tes postures",
  rechargesAllYourOtherSkills2: (p) =>
    `Recharge toutes tes autres compétences de type ${ids(p.which)}`,
  rechargesAllYour: (p) => `Recharge tous tes ${p.rechargedKind}`,
  allOfYourSpiritsDie: () => "Tous tes esprits meurent",
  summonsPlusOnePerCorpseExploited: (p) =>
    `Invoque ${p.text}` + (p.perExploitedCorpse === true ? ", plus un par cadavre exploité" : ""),
  setsATrap: () => "Pose un piège",
  pulseTargetCreatesASymbolMarksThe: (p) =>
    p.kind === "pulse"
      ? p.anchor === "target"
        ? "Crée un symbole"
        : "Marque le sol"
      : p.anchor === "corpse"
        ? "Crée un puits"
        : "Crée une protection",
  forSeconds: (p) => `${p.what} ${p.where} pendant ${p.magnitude} secondes`,
  seconds3: (p) => `${p.magnitude} secondes`,
  forEachSignetYouHaveEquipped: (p) => (p.perOwnSignet === true ? " pour chaque sceau équipé" : ""),
  allOfTheTargetSSkillsAre: (p) =>
    `Toutes les compétences de la cible sont désactivées pendant ${p.time}`,
  theTargetSEliteSkillIsDisabled: (p) =>
    `La compétence d'élite de la cible est désactivée pendant ${p.time}`,
  oneOfTheTargetSSpellsAt: (p) =>
    `L'un des sorts de la cible, au hasard, est désactivé pendant ${p.time}`,
  allOfTheTargetSAttackSkills: (p) =>
    `Toutes les compétences d'attaque de la cible sont désactivées pendant ${p.time}`,
  theInterruptedSkillIsDisabledFor: (p) =>
    `La compétence interrompue est désactivée pendant ${p.time}${p.perSignet}`,
  centreInterruptedHoldingThatSkillHaveIt: (p) =>
    p.which === "centre-interrupted"
      ? `qui possèdent cette compétence la voient désactivée pendant ${p.time}`
      : `Cette compétence et toutes celles du même attribut sont désactivées pendant ${p.time}`,
  thisSkillBecomesTheOneYouRemoved: (p) =>
    `Cette compétence devient celle que tu as retirée pendant ${p.seconds} secondes`,
  thisSkillBecomesThatRandomSpellSpell: (p) =>
    `Cette compétence devient ${p.which === "random-spell" ? "ce sort" : "cette compétence"} pendant la même durée`,
  thisSkillBecomesItsTargetSNon: (p) =>
    `Cette compétence devient la compétence d'élite de sa cible, hors formes, pendant ${p.magnitude} secondes`,
  takeControlOfTargetEnemySpirit: () => "Prends le contrôle de l'esprit ennemi ciblé",
  becomeYourMinionsWhileYouBear: (p) => `Deviennent tes serviteurs tant que tu portes ${p.name}`,
  targetMinionWithAMasterBecomesMasterless: (p) =>
    `Le serviteur ciblé perd son maître s'il en a un ; s'il n'en a pas, il devient le tien et est soigné de ${p.magnitude} de santé`,
  leadCountsAsALeadAttackCounts: (p) =>
    p.role === "lead"
      ? "Compte comme une attaque principale"
      : "Compte comme une attaque secondaire",
  targetSuffersOvercast: (p) => `La cible subit ${p.magnitude} de surcharge`,
  thisSkillThisSkillThatSkill: (p) =>
    p.of === "this-skill" ? "Cette compétence" : "La compétence utilisée",
  forEachRemoved2: (p) =>
    p.perRemoved === undefined
      ? ""
      : ` pour chaque ${categoryOne(p.perRemoved)} ${isFeminine(p.perRemoved) ? "retirée" : "retiré"}`,
  takesSecondsLongerToRecharge: (p) =>
    `${p.which} met ${p.magnitude} secondes de plus à se recharger${p.each}`,
  that: (p) => ` ${p.onlyIf}`,
  ifItStrikesAFoe: (p) => `Si elle touche un ennemi${p.whom} : ${lowerFirst(p.text)}`,
  from: (p) => `${p.text} à ${p.from}`,
  takeDamageForEachPointOfEnergy: (p) =>
    `subissent ${damage(p.amount, p.type)}` +
    (p.perEnergyLost === undefined ? "" : " pour chaque point d'énergie perdu"),
  areInterruptedAreInterruptedIfCasting: (p) =>
    p.only === undefined ? "sont interrompus" : "sont interrompus s'ils incantent",
  areKnockedDownForS: (p) => `sont renversés pendant ${p.durationSeconds} s`,
  foesFoeCreaturesGain: (p) =>
    p.hits === "foes" || p.hits === "foe-creatures" ? p.suffered : `gagnent ${p.sufferedWhat}`,
  gainHealthEqualToThisSpellS2: () =>
    "gagnent de la santé égale au bonus de Faveur divine de ce sort",
  gain3: (p) => `gagnent ${lowerFirst(p.text).replace(/^soigne /, "")}`,
  gainHealth: (p) => `gagnent ${p.amount} de santé`,
  loseHealth: (p) => `perdent ${p.amount} de santé`,
  youFromEach: (p) => `tu ${lowerFirst(p.text).replace(/^vole /, "voles ")} à chacun`,
  transferAllTheirConditionsToYou: () => "te transfèrent toutes leurs altérations",
  resurrect: (p) =>
    p.kind === "resurrect"
      ? lowerFirst(p.text).replace(/^ramène la cible à la vie/, "sont ramenés à la vie")
      : lowerFirst(p.text),
  and5: (p) => (p.length === 0 ? (p.last ?? "") : `${p.parts} et ${p.last2}`),
  perAlliedMinionsOwnMinionsMinionOne: (p) =>
    `; ${lowerFirst(p.text)} par ${p.hits === "allied-minions" || p.hits === "own-minions" ? "serviteur" : "personne"}`,
  per: (p) => ` par ${ids(p.perCountNoun)}`,
  damage3: (p) => `${damage(p.amount, p.type)}${p.each}`,
  healHealsEnergy: (p) =>
    p.kind === "heal" ? `soigne ${p.amount}${p.each}` : `+${p.amount} d'énergie${p.each}`,
  drainsEnergy: (p) => `draine ${p.magnitude} d'énergie`,
  stealsEnergy: (p) => `vole ${p.magnitude} d'énergie`,
  stealsHealth: (p) => `vole ${p.magnitude} de santé`,
  resurrectsEnergy: (p) => `ressuscite, ${p.energy}% d'énergie`,
  resurrectsHealth: (p) => `ressuscite, ${p.health}% de santé`,
  resurrectsPetsHealth: (p) => `ressuscite les familiers, ${p.health}% de santé`,
  healsOfYourHealth: (p) => `soigne ${p.percent}% de ${share(p.fractionOfCurrent)} ta santé`,
  balancesHealthWithTargetFoe: () => "équilibre la santé avec l'ennemi ciblé",
  allUpTo: (p) => (p.current === p.Infinity ? "toutes" : `jusqu'à ${p.moving}`),
  andFoesWithinOfIt: (p) =>
    ` et les ennemis ${AREA_AROUND_TARGET.get(p.copyToFoesWithin) ?? `à moins de ${p.copyToFoesWithin2} d'elle`}`,
  withOfTheirRemainingDurations: (p) => ` avec ${p.durationMultiplier}% de leurs durées restantes`,
  movesConditionsFromFoesWithinOfIt: (p) =>
    `Transfère ${p.count === "toutes" ? "toutes les" : p.count} altérations${p.lasting} des ennemis ${AREA_AROUND_TARGET.get(p.foesWithin) ?? `à moins de ${p.foesWithin2} d'elle`} à la cible`,
  casterMovesOfYourConditionsToThe: (p) =>
    p.from === "caster"
      ? `Transfère ${p.count === "toutes" ? "toutes tes" : `${p.count} de tes`} altérations${p.lasting} à la cible${p.copies}`
      : `Transfère ${p.count === "toutes" ? "toutes les" : `${p.count} des`} altérations de la cible${p.lasting} sur toi`,
  youAreHealedForForEach: (p) => `${p.moves} ; tu es soigné de ${p.magnitude} pour chacune`,
  areDisabledForSeconds: (p) => `sont désactivées pendant ${p.seconds} secondes`,
  allOfYourSkills: (p) => `Toutes tes compétences ${p.time}`,
  allOfYourOtherSkills: (p) => `Toutes tes autres compétences ${p.time}`,
  allOfYourOtherNonAttackSkills: (p) => `Toutes tes autres compétences hors attaques ${p.time}`,
  allOfYourOtherAttackSkillsYour: (p) =>
    p.exceptWeapon === undefined
      ? `Toutes tes autres compétences d'attaque ${p.time}`
      : `Tes compétences d'attaque autres ${WEAPON_WORD[p.exceptWeapon].replace(/^de mêlée$/, "que de mêlée").replace(/^(à|au|aux) /, "qu'$1 ")} ${p.time}`,
  allOfYourNonAttackSkills: (p) => `Toutes tes compétences hors attaques ${p.time}`,
  s4: (p) => plural(typeName(p.type)),
  yourAnd: (p) => `Tes ${p.types} ${p.time}`,
  allOfYourSpells: (p) => `Tous tes sorts ${p.time}`,
  allOfYourOther: (p) =>
    `Toutes tes ${p.others ? "autres " : ""}compétences de ${p.name} ${p.time}`,
  exceptAnd: (p) => (p.length === 0 ? "" : ` sauf ${p.except}`),
  allOfYourNonSkills: (p) => `Toutes tes compétences hors ${p.name}${p.exceptText} ${p.time}`,
  yourWholeParty: () => "Tout ton groupe",
  composedAffectsWhere2: (p) => capitalize(`${les(AREA_WHO[p.affects].toLowerCase())} ${p.where}`),
  radius: (p) => `rayon de ${p.radius}`,
  andAroundYou: (p) =>
    `${TARGET_TEXT[p.target]}, et ${les(AREA_WHO[p.affects].toLowerCase())} ${p.where} autour de toi`,
  range: (p) => `portée de ${p.range}`,
  upTo4: (p) => `jusqu'à ${p.maxTargets} ${withoutArticle(p.who)}`,
  withinOfIt: (p) => AREA_AROUND_TARGET.get(p.radius) ?? `à moins de ${p.radius2} d'elle`,
  and6: (p) => `${TARGET_TEXT[p.target]}, et ${p.count} ${p.where}`,
  rangeRadius: (p) => `portée de ${p.range}, rayon de ${p.radius}`,
  free: () => "Gratuit",
  adrenaline: (p) => `${p.amount} d'adrénaline`,
  composedAmount: (p) => ` (${p.amount})`,
  energy8: (p) => `${p.cost} d'énergie${p.base}${p.overcast}`,
  overcast: (p) => `, ${p.overcast} de surcharge`,
  instant: () => "Instantané",
  composedActivationBase: (p) => (p.activation === p.base ? p.base : `${p.activation} (${p.base})`),
  dealsNoDamage: () => "N'inflige aucun dégât",
  dealsOnlyDamageDamage: (p) =>
    p.weaponless
      ? `N'inflige que ${p.bonus} dégâts${p.damageType}`
      : `+${p.bonus} dégâts${p.damageType}`,
  damage4: (p) => `${p.condition} : +${p.more} dégâts`,
  damageOnThem: (p) => `+${p.amount} dégâts ${p.perCount}`,
  cannotBeBlocked2: () => "Ne peut pas être bloquée",
  cannotBeBlocked3: (p) => `${p.condition} : ne peut pas être bloquée`,
  chanceToMissWithOrLess: (p) =>
    `${p.chance}% de chances de rater avec ${p.name} au rang ${p.rank} ou moins`,
  resultsInACriticalHit: () => "Donne un coup critique",
  resultsInACriticalHit2: (p) => `${p.condition} : donne un coup critique`,
  hitsUpToAdjacentFoesToo: (p) => `Touche aussi jusqu'à ${p.cleaveTargets} ennemis adjacents`,
  hitsEveryAdjacentFoe: (p) => `${p.condition} : touche tous les ennemis adjacents`,
  armorPenetration2: (p) => `${p.armorPenetration}% de pénétration d'armure`,
  ifBlocked: (p) => `Si elle est bloquée : ${lowerFirst(p.text)}`,
  onACriticalHit: (p) => `Sur un coup critique : ${lowerFirst(p.text)}`,
  ifItFailsToHit: (p) => `Si elle rate : ${lowerFirst(p.text)}`,
  asItIsUsed: (p) => `À l'utilisation : ${lowerFirst(p.text)}`,
  allYourPreparationsAreRemoved: () => "Toutes tes préparations sont retirées",
  fliesAsFast: (p) => `Vole ${p.multiplier}× plus vite`,
  fliesAsFast2: (p) => `${p.condition} : vole ${p.multiplier}× plus vite`,
  only: (p) => ` ; ${p.condition.toLowerCase()}, seulement 1`,
  eachDealingLessDamage: (p) => `, chacune infligeant ${p.value}% de dégâts en moins`,
  strikesTwice: () => "Frappe deux fois",
  strikesTimes: (p) => `Frappe ${p.count} fois`,
  shootsArrowsAtOnce: (p) => `Tire ${p.count} flèches à la fois${p.weaker}${p.fewer}`,
  whileActivating: (p) => `Pendant l'activation : ${p.status}`,
  easilyInterrupted: () => "Facilement interrompue",
  failureChanceWithOrLess: (p) =>
    `${p.chance}% de chances d'échec avec ${p.name} au rang ${p.rank} ou moins`,
  activatesFasterSlower: (p) =>
    `${p.condition} : s'active ${p.value}% plus ${p.multiplier < 1 ? "vite" : "lentement"}`,
  healthGainFromDivineFavorIsDoubled: () => "Le gain de santé de Faveur divine est doublé",
  projectilesEachCanBeDodged: (p) => `${p.shots} projectiles : chacun peut être esquivé`,
  aProjectileAtEachFoeEachCan: (p) =>
    p.spread === true
      ? "Un projectile sur chaque ennemi : chacun peut être esquivé"
      : "Projectile : peut être esquivé",
  halfTheNormalRange: () => "Moitié de la portée normale",
  orSacrificesHealthIfNoneIsNear: (p) =>
    `, ou sacrifie ${p.elseSacrificePercent}% de santé s'il n'y en a aucun à proximité`,
  targetExploitsTheCorpseNearestYourTarget: (p) =>
    (p.near === "target"
      ? "Exploite le cadavre le plus proche de ta cible"
      : p.all === true
        ? `Exploite tous les cadavres frais ${areaOr(p.radius, p.radius2)}`
        : p.pick === "random"
          ? "Exploite un cadavre au hasard"
          : "Exploite le cadavre le plus proche") + p.value,
  whileOnYourBarAHealthFights: (p) =>
    `Tant qu'il est sur ta barre, un ${p.name} (${p.companionHealth} de santé) combat à tes côtés`,
  disabledForAfterUse: (p) =>
    `Désactivée pendant ${seconds(p.disabledAfterUseSeconds)} après usage`,
  takeAllConditionsFromYourAlliesWith: () =>
    "Prends toutes les altérations de tes alliés, avec le temps restant de chacune",
  hitOrMiss: (p) => `${p.text}, que le coup touche ou non`,
  eliteFlash: (p) =>
    `${TYPE_TEXT[p.type].replace(/\.$/, "")}${p.flash ? " éclair" : ""}${p.elite ? " d'élite" : ""}.`,
  moraleBoost: (p) =>
    p.rechargesOnMoraleBoost === true ? "Bonus de moral" : seconds(p.rechargeSeconds),
  hexHexesS2: (p) => plural(p.kind),
} satisfies DescribeWords as DescribeWords;
