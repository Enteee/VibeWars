import type { DescribeWords } from "@vibewars/game-core";
import { AREA_EARSHOT, EN_WORDS } from "@vibewars/game-core";

type Category = Parameters<DescribeWords["aCategory"]>[0];
type DamageKind = Parameters<DescribeWords["typeWord"]>[0];
type SkillKind = keyof DescribeWords["typeText"];
type Weapon = keyof DescribeWords["weaponText"];
type ChainRoleName = keyof DescribeWords["chainRoleText"];

interface Noun {
  readonly one: string;
  readonly many: string;
  readonly feminine: boolean;
}

const CATEGORY: Record<Category, Noun> = {
  condition: { one: "condizione", many: "condizioni", feminine: true },
  hex: { one: "maleficio", many: "malefici", feminine: false },
  enchantment: { one: "incantamento", many: "incantamenti", feminine: false },
  stance: { one: "posizione", many: "posizioni", feminine: true },
  preparation: { one: "preparazione", many: "preparazioni", feminine: true },
  glyph: { one: "glifo", many: "glifi", feminine: false },
  shout: { one: "grido", many: "grida", feminine: false },
  chant: { one: "canto", many: "canti", feminine: false },
  echo: { one: "eco", many: "echi", feminine: true },
  "weapon-spell": { one: "incantesimo d'arma", many: "incantesimi d'arma", feminine: false },
  item: { one: "oggetto", many: "oggetti", feminine: false },
  form: { one: "forma", many: "forme", feminine: true },
  "skill-effect": { one: "effetto di abilità", many: "effetti di abilità", feminine: false },
};

/** The plural of each head noun a description pluralizes; stops at a preposition. */
const PLURAL: Readonly<Record<string, string>> = {
  incantesimo: "incantesimi",
  maleficio: "malefici",
  incantamento: "incantamenti",
  condizione: "condizioni",
  posizione: "posizioni",
  preparazione: "preparazioni",
  glifo: "glifi",
  grido: "grida",
  canto: "canti",
  eco: "echi",
  sigillo: "sigilli",
  rituale: "rituali",
  trappola: "trappole",
  forma: "forme",
  attacco: "attacchi",
  naturale: "naturali",
  principale: "principali",
  secondario: "secondari",
  doppio: "doppi",
  oggetto: "oggetti",
  effetto: "effetti",
};

const FEMININE_HEADS: ReadonlySet<string> = new Set([
  "abilità",
  "condizione",
  "posizione",
  "preparazione",
  "trappola",
  "forma",
  "eco",
]);

const STOP_WORDS: ReadonlySet<string> = new Set(["di", "con", "in", "che", "a", "su", "da"]);

function isStop(word: string): boolean {
  return STOP_WORDS.has(word) || /^[a-z]+'/i.test(word);
}

/** Pluralizes a noun phrase word by word, up to its first preposition. */
function plural(phrase: string): string {
  const words = phrase.split(" ");
  const stop = words.findIndex(isStop);
  const end = stop === -1 ? words.length : stop;
  return words.map((word, index) => (index < end ? (PLURAL[word] ?? word) : word)).join(" ");
}

function headOf(phrase: string): string {
  return phrase.split(" ")[0] ?? "";
}

function isFeminine(phrase: string): boolean {
  return FEMININE_HEADS.has(headOf(phrase));
}

/** "un incantesimo", "una trappola", "un'abilità". */
function indefinite(phrase: string): string {
  if (!isFeminine(phrase)) {
    return `un ${phrase}`;
  }
  return /^[aeiouàèéìòù]/i.test(phrase) ? `un'${phrase}` : `una ${phrase}`;
}

const DAMAGE_WORD: Record<DamageKind, string> = {
  slashing: "taglienti",
  piercing: "perforanti",
  blunt: "contundenti",
  fire: "da fuoco",
  cold: "da freddo",
  lightning: "da fulmine",
  earth: "da terra",
  chaos: "da caos",
  dark: "oscuri",
  holy: "sacri",
  shadow: "d'ombra",
  typeless: "",
};

const DAMAGE_LOOKUP: Readonly<Record<string, string>> = {
  ...DAMAGE_WORD,
  physical: "fisici",
  elemental: "elementali",
  fisici: "fisici",
  elementali: "elementali",
};

function typeWord(type: DamageKind): string {
  return type === "typeless" ? "" : ` ${DAMAGE_WORD[type]}`;
}

/** "63 danni da fuoco". */
function damageOf(amount: string, type: DamageKind): string {
  return `${amount} danni${typeWord(type)}`;
}

function damageNoun(type: string): string {
  const word = DAMAGE_LOOKUP[type] ?? type;
  return word === "" ? "danni" : `danni ${word}`;
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function lowerAll(text: string): string {
  return text.toLowerCase();
}

const TYPE_TEXT: Record<SkillKind, string> = {
  attack: "Attacco.",
  spell: "Incantesimo.",
  enchantment: "Incantesimo di incantamento.",
  hex: "Incantesimo di maleficio.",
  signet: "Sigillo.",
  shout: "Grido.",
  stance: "Posizione.",
  preparation: "Preparazione.",
  glyph: "Glifo.",
  chant: "Canto.",
  echo: "Eco.",
  "weapon-spell": "Incantesimo d'arma.",
  "nature-ritual": "Rituale naturale.",
  "binding-ritual": "Rituale di vincolo.",
  ward: "Incantesimo di protezione.",
  well: "Incantesimo di pozzo.",
  "item-spell": "Incantesimo d'oggetto.",
  trap: "Trappola.",
  "pet-attack": "Attacco dell'animale.",
  form: "Forma.",
  skill: "Abilità.",
};

function typeName(type: SkillKind): string {
  return TYPE_TEXT[type].replace(/\.$/, "").toLowerCase();
}

function spaced(word: string): string {
  const type = TYPE_TEXT[word as SkillKind] as string | undefined;
  return type === undefined ? word.replaceAll("-", " ") : typeName(word as SkillKind);
}

/** Every skill type as it reads in the middle of a line, longest first. */
const TYPE_PHRASES: readonly string[] = (Object.keys(TYPE_TEXT) as SkillKind[])
  .map(typeName)
  .sort((a, b) => b.length - a.length);

function splitTypeSuffix(words: string): readonly [string, string | undefined] {
  for (const phrase of TYPE_PHRASES) {
    if (words === phrase) {
      return ["", phrase];
    }
    if (words.endsWith(` ${phrase}`)) {
      return [words.slice(0, -phrase.length - 1), phrase];
    }
  }
  return [words, undefined];
}

/** "Mesmerista incantesimo" as "incantesimo di Mesmerista": the noun leads. */
function nounFirst(words: string): string {
  const [qualifier, noun] = splitTypeSuffix(words.trim());
  if (noun === undefined) {
    return words.trim();
  }
  return qualifier === "" ? noun : `${noun} di ${qualifier}`;
}

/** The English word order of a used skill's qualifiers, put in Italian order. */
function skillPhrase(joined: string): string {
  let rest = joined.trim().replace(/ ?abilità$/, "");
  const not = /^non di (\S+) ?/.exec(rest);
  if (not !== null) {
    rest = rest.slice(not[0].length);
  }
  const elite = rest.startsWith("élite");
  if (elite) {
    rest = rest.slice("élite".length).trim();
  }
  const adrenal = rest.startsWith("adrenalinica");
  if (adrenal) {
    rest = rest.slice("adrenalinica".length).trim();
  }
  const [qualifier, type] = splitTypeSuffix(rest);
  const noun = type === undefined ? "abilità" : type === "attacco" ? "abilità d'attacco" : type;
  const parts = [
    noun,
    elite ? "élite" : "",
    adrenal ? (isFeminine(noun) ? "adrenalinica" : "adrenalinico") : "",
    qualifier === "" ? "" : `di ${qualifier}`,
    not === null ? "" : `non di ${not[1] ?? ""}`,
  ];
  return parts.filter((part) => part !== "").join(" ");
}

function typeFirstWord(type: SkillKind): string {
  const words = typeName(type).split(" ");
  return words[words.length - 1] ?? "";
}

const CATEGORY_LOOKUP: Readonly<Record<string, Noun>> = CATEGORY;

function categoryOne(raw: string): string {
  return CATEGORY_LOOKUP[raw]?.one ?? raw;
}

/** A list of raw category ids joined by this file's " o " or " e ". */
function categoryList(text: string): string {
  return text
    .split(/( o | e )/)
    .map((part) => categoryOne(part))
    .join("");
}

function aCategory(category: Category): string {
  return indefinite(CATEGORY[category].one);
}

function categoryNoun(count: number | "all", category: Category): string {
  return count === 1 ? CATEGORY[category].one : CATEGORY[category].many;
}

/** "nessun incantamento", "nessuna altra condizione". */
function noneOf(category: Category, other: boolean, name?: string): string {
  const { one, feminine } = CATEGORY[category];
  const none = feminine ? "nessuna" : "nessun";
  const another = other ? (feminine ? "altra " : "altro ") : "";
  return `${none} ${another}${one}${name === undefined ? "" : ` di ${name}`}`;
}

function seconds(value: number): string {
  return Number.isInteger(value) ? `${String(value)} s` : `${value.toFixed(1).replace(".", ",")} s`;
}

function damageTaken(multiplier: number): string {
  if (multiplier === 2) {
    return "il doppio dei";
  }
  if (multiplier === 0.5) {
    return "la metà dei";
  }
  return `il ${String(Math.round(multiplier * 100))}% dei`;
}

function share(fraction: number): string {
  return fraction === 0.5 ? "metà" : `il ${String(Math.round(fraction * 100))}%`;
}

/** `share` before a definite noun: "metà dei danni", "il 25% dei danni". */
function shareOf(fraction: number, rest: string): string {
  return fraction === 0.5 ? `metà ${rest}` : `${share(fraction)} ${rest}`;
}

const SECOND_PERSON: Readonly<Record<string, string>> = {
  applica: "applichi",
  attacca: "attacchi",
  blocca: "blocchi",
  colpisce: "colpisci",
  crea: "crei",
  diventa: "diventi",
  effettua: "effettui",
  evita: "eviti",
  ha: "hai",
  lancia: "lanci",
  muore: "muori",
  ottiene: "ottieni",
  perde: "perdi",
  resta: "resti",
  sacrifica: "sacrifichi",
  scade: "scadi",
  scende: "scendi",
  subisce: "subisci",
  termina: "termini",
  usa: "usi",
  vede: "vedi",
  viene: "vieni",
  è: "sei",
};

/** A third-person phrase said to its holder: "lancia un incantesimo" -> "lanci un incantesimo". */
function secondPerson(phrase: string): string {
  const reflexive = /^si muove\b/.exec(phrase);
  if (reflexive !== null) {
    return phrase.replace(/^si muove/, "ti muovi");
  }
  const denied = /^non (\S+)( .*)?$/.exec(phrase);
  const [verb = "", ...rest] = (
    denied === null ? phrase : (denied[1] ?? "") + (denied[2] ?? "")
  ).split(" ");
  const base = SECOND_PERSON[verb] ?? verb;
  return [denied === null ? base : `non ${base}`, ...rest]
    .join(" ")
    .replaceAll("la sua ", "la tua ")
    .replace(/ su di sé$/, " su di te");
}

const TRIGGER_WHEN: DescribeWords["triggerWhen"] = {
  "bearer-casts-spell": "lancia un incantesimo",
  "bearer-attacks": "attacca",
  "bearer-attack-begins": "attacca",
  "bearer-uses-skill": "usa un'abilità",
  "bearer-applies-hex": "applica un maleficio",
  "bearer-hits": "colpisce con un attacco",
  "bearer-fails-to-hit": "non riesce a colpire",
  "bearer-takes-physical-damage": "subisce danni fisici",
  "bearer-takes-elemental-damage": "subisce danni elementali",
  "bearer-takes-damage": "subisce danni",
  "bearer-takes-damage-from-foe": "subisce danni o un furto di vita da un nemico",
  "bearer-health-drops-below": "scende sotto una soglia di Salute a causa dei danni",
  "bearer-fatal-damage-negated": "evita danni letali",
  "bearer-hit-by-attack": "viene colpito dall'attacco di un nemico",
  "bearer-targeted-by-foe": "viene preso di mira dall'incantesimo o dall'attacco di un nemico",
  "bearer-healed-by-skill": "viene curato da un'abilità",
  "bearer-blocks-melee": "blocca un attacco in mischia",
  "bearer-blocks-projectile": "blocca un attacco a distanza",
  "bearer-blocks": "blocca",
  "bearer-interrupted": "viene interrotto",
  "bearer-knocked-down": "viene atterrato",
  "bearer-sacrifices-health": "sacrifica Salute",
  "bearer-knockdown-prevented": "evita un atterramento",
  "bearer-gains-hex-or-enchantment": "ottiene un maleficio o un incantamento",
  "bearer-gains-enchantment": "ottiene un incantamento",
  "bearer-loses-enchantment": "perde un incantamento",
  "bearer-loses-condition": "perde una condizione",
  "bearer-creates-creature": "crea una creatura",
  "bearer-gains-condition": "ottiene una nuova condizione",
  "bearer-chant-or-shout-ends": "vede terminare un canto o un grido su di sé",
  "bearer-energy-empty": "resta senza Energia",
  "bearer-energy-drops-empty": "scende a 0 Energia",
  "source-targets-bearer": "viene preso di mira da una tua abilità",
  "source-bearer-apart": "è lontano da te",
  "bearer-dies": "muore",
  ends: "termina",
  "ends-early": "termina prematuramente",
  expires: "scade",
};

const YOUR_NEXT_SKILL = "la prossima volta che usi un'abilità";
const NEXT_SKILL = "la prossima volta che usa un'abilità";
const DROPPED = "effetto di rilascio";

const NEEDED_WEAPON: Record<Weapon, string> = {
  axe: "un'ascia",
  sword: "una spada",
  hammer: "un martello",
  daggers: "dei pugnali",
  scythe: "una falce",
  spear: "una lancia",
  bow: "un arco",
  melee: "un'arma da mischia",
};

const WEAPON_WORD: Record<Weapon, string> = {
  axe: "con ascia",
  sword: "con spada",
  hammer: "con martello",
  daggers: "con pugnali",
  scythe: "con falce",
  spear: "con lancia",
  bow: "con arco",
  melee: "in mischia",
};

function wielding(weapon: Weapon | undefined): string {
  return weapon === undefined ? "" : ` mentre impugni ${NEEDED_WEAPON[weapon]}`;
}

function weaponAttacks(weapon: Weapon | undefined): string {
  return weapon === undefined ? "gli attacchi" : `gli attacchi ${WEAPON_WORD[weapon]}`;
}

function weaponSkills(weapon: Weapon | undefined): string {
  return weapon === undefined ? "abilità d'attacco" : `abilità d'attacco ${WEAPON_WORD[weapon]}`;
}

const CHAIN_WORD: Record<ChainRoleName, string> = {
  lead: "principale",
  "off-hand": "secondario",
  dual: "doppio",
};

const CHAIN_LOOKUP: Readonly<Record<string, string>> = CHAIN_WORD;

const BLOCK_WORD: Readonly<Record<string, string>> = {
  melee: "in mischia",
  projectile: "a distanza",
};

function blockWord(kind: string): string {
  return BLOCK_WORD[kind] ?? kind;
}

const BLOCKED_ATTACKS: DescribeWords["blockedAttacks"] = {
  all: "gli attacchi",
  melee: "gli attacchi in mischia",
  projectile: "i proiettili",
};

const BLOCKED_ATTACK: DescribeWords["blockedAttack"] = {
  all: "attacco",
  melee: "attacco in mischia",
  projectile: "proiettile",
};

const SCOPE_WORD: Readonly<Record<string, readonly [string, string]>> = {
  primary: ["primario", "primari"],
  elemental: ["elementale", "elementali"],
};

function scopeWord(scope: string, many: boolean): string {
  const word = SCOPE_WORD[scope];
  return word === undefined ? scope : word[many ? 1 : 0];
}

const BORROWED_KIND: Readonly<Record<string, readonly [string, string]>> = {
  spell: ["incantesimo", "incantesimi"],
  signet: ["sigillo", "sigilli"],
  elite: ["abilità élite", "abilità élite"],
};

function borrowedKind(kind: string, many: boolean): string {
  const word = BORROWED_KIND[kind];
  return word === undefined ? kind : word[many ? 1 : 0];
}

/** The radii are keyed in game-core; each map here keeps those keys and says them in Italian. */
function sayRadii(
  english: ReadonlyMap<number, string>,
  italian: Readonly<Record<string, string>>,
): ReadonlyMap<number, string> {
  return new Map([...english].map(([radius, text]) => [radius, italian[text] ?? text]));
}

const AREA_TEXT = sayRadii(EN_WORDS.areaText, {
  adjacent: "in posizione adiacente",
  nearby: "nelle vicinanze",
  "in the area": "nell'area",
  "in earshot": "a portata d'orecchio",
  "in compass range": "nel raggio della bussola",
});

const AREA_AROUND_TARGET = sayRadii(EN_WORDS.areaAroundTarget, {
  "adjacent to it": "in posizione adiacente a esso",
  "nearby it": "nelle sue vicinanze",
  "in the area around it": "nell'area intorno a esso",
  "in earshot of it": "a portata d'orecchio da esso",
});

const AREA_AROUND_CREATED = sayRadii(EN_WORDS.areaAroundCreated, {
  "adjacent to that creature": "in posizione adiacente a quella creatura",
  "near that creature": "vicino a quella creatura",
  "in earshot of that creature": "a portata d'orecchio da quella creatura",
});

function within(radius: number, shown: string): string {
  return AREA_TEXT.get(radius) ?? `entro ${shown}`;
}

const SPLASH_SIDE: DescribeWords["splashSide"] = {
  foes: "nemici",
  "foe-creatures": "creature nemiche",
  "foe-minions": "servitori nemici",
  allies: "alleati",
  "non-spirit-allies": "alleati non spiriti",
  party: "membri del gruppo",
  "own-spirits": "i tuoi spiriti",
  "own-minions": "i tuoi altri servitori",
  "allied-minions": "servitori alleati",
};

const AURA_WHO: DescribeWords["auraWho"] = {
  all: "Creature non spirito",
  allies: "Alleati non spiriti",
  foes: "Nemici non spiriti",
};

const AREA_WHO: DescribeWords["areaWho"] = {
  enemies: "Nemici",
  allies: "Alleati",
  all: "Tutti",
};

const TARGET_TEXT: DescribeWords["targetText"] = {
  self: "Te stesso",
  "single-enemy": "Un nemico",
  "single-ally": "Un alleato",
  "single-other-ally": "Un altro alleato",
  "single-any": "Un bersaglio qualsiasi",
  "single-dead-ally": "Un alleato morto",
  "allied-spirit": "Uno spirito alleato",
  "enemy-spirit": "Uno spirito nemico",
  "enemy-minion": "Il servitore di un nemico",
  "own-minion": "Uno dei tuoi servitori",
  "allied-minion": "Un servitore alleato",
  "allied-summoned-creature": "Una creatura evocata alleata",
  "single-ally-not-spirit": "Un alleato che non sia uno spirito",
  companion: "Il tuo animale",
  "living-companion": "Il tuo animale vivo",
};

const IF = /^Se /;
const TARGET_IF = /^Se il bersaglio /;

/** A bearer's condition, as those a splash reaches: plural, without "Se". */
function pluralPredicate(body: string): string {
  return body
    .replace(/^non è /, "non sono ")
    .replace(/^è /, "sono ")
    .replace(/^non ha /, "non hanno ")
    .replace(/^ha /, "hanno ")
    .replace(/^non sta /, "non stanno ")
    .replace(/^sta /, "stanno ")
    .replace(/^non si sta /, "non si stanno ")
    .replace(/^si sta /, "si stanno ")
    .replace(/^si trova /, "si trovano ")
    .replace(/^sono un nemico$/, "sono nemici")
    .replace(/^sono una creatura evocata$/, "sono creature evocate");
}

function onlyIfWording(text: string): string {
  return text.startsWith("Se il bersaglio ")
    ? pluralPredicate(text.replace(TARGET_IF, ""))
    : lowerFirst(text);
}

/** A relative clause, or a plain "se" clause left as it is. */
function relative(condition: string): string {
  return condition.startsWith("se ") ? condition : `che ${condition}`;
}

function splashOnlyClause(condition: string): string {
  return condition === "" ? "" : ` ${relative(condition)}`;
}

function eachOfWording(reached: string, condition: string): string {
  return condition === "" ? reached : `ciascuno di ${reached} ${relative(condition)}`;
}

function negatedText(text: string): string {
  const rules: readonly (readonly [RegExp, string])[] = [
    [/^Se il bersaglio non /, "Se il bersaglio "],
    [/^Se il bersaglio /, "Se il bersaglio non "],
    [/^Se non /, "Se "],
    [/^Se (hai|sei|stai|impugni|tieni|controlli|colpisci) /, "Se non $1 "],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(text)) {
      return text.replace(pattern, replacement);
    }
  }
  return `Tranne ${lowerFirst(text)}`;
}

function yourCondition(text: string): string {
  return text
    .replace(/^Se il bersaglio non è /, "Se non sei ")
    .replace(/^Se il bersaglio è /, "Se sei ")
    .replace(/^Se il bersaglio non ha /, "Se non hai ")
    .replace(/^Se il bersaglio ha /, "Se hai ")
    .replace(/^Se il bersaglio non sta /, "Se non stai ")
    .replace(/^Se il bersaglio sta /, "Se stai ")
    .replace(/^Se il bersaglio non si sta /, "Se non ti stai ")
    .replace(/^Se il bersaglio si sta /, "Se ti stai ")
    .replace(/^Se il bersaglio si trova /, "Se ti trovi ")
    .replace(TARGET_IF, "Se tu ");
}

function ifItWording(text: string): string {
  return text.replace(TARGET_IF, "Se ");
}

function stealsWording(text: string): string {
  return lowerFirst(text).replace(/^ruba /, "rubi ");
}

function gainWording(text: string): string {
  return lowerFirst(text).replace(/^cura di /, "");
}

function joinConditions(texts: readonly string[], fallback: string, joiner: string): string {
  const [first, ...rest] = texts;
  return [first ?? fallback, ...rest.map((text) => text.replace(IF, ""))].join(joiner);
}

function blockAnswerWording(text: string): string {
  return text.replace(/^la prossima volta che (?:blocchi|blocca) (un'?|una) /, "se è $1 ");
}

const OTHER_SKILLS: Readonly<Record<string, string>> = { attack: "attacco", signet: "sigillo" };
const kindWord = (kind: string): string => {
  const raw = kind.trim();
  return raw in DAMAGE_WORD ? ` ${DAMAGE_WORD[raw as keyof typeof DAMAGE_WORD]}` : kind;
};
const COUNTED: Readonly<Record<string, string>> = {
  enchantment: "incantamento",
  hex: "maleficio",
  condition: "condizione",
};
const countedNoun = (text: string): string =>
  text.replace(/\b(enchantment|hex|condition)\b/g, (word) => COUNTED[word] ?? word);

export default {
  capitalize,
  lowerAll,
  spaced,
  typeName,
  typeFirstWord,
  blockAnswerWording,
  loseWording: (text, fromSource, bearerIsFoe) =>
    text
      .replace(/^Il nemico bersaglio perde/, fromSource || !bearerIsFoe ? "perdi" : "perde")
      .replace(/Energia che possiede/, "Energia che possiedi"),
  bearerWording: (text, bearerIsCaster) =>
    text
      .replace(/^Il bersaglio ottiene/, "ottiene")
      .replace(/^Il bersaglio perde/, bearerIsCaster ? "perdi" : "perde"),
  ifItWording,
  gainWording,
  loseTargetWording: (text) => lowerFirst(text).replace(/^il bersaglio perde/, "perdono"),
  stealsWording,
  returnedWording: (text) =>
    lowerFirst(text).replace(/^riporta in vita il bersaglio/, "vengono riportati in vita"),
  yourMinionsWording: (text) => text.replace(/^I tuoi altri servitori/, "I tuoi servitori"),
  onlyIfWording,
  splashOnlyClause,
  eachOfWording,
  requiresWording: (text) => text.replace(IF, "Solo se "),
  requirementWording: (text) =>
    text.startsWith("Se ") ? `solo ${lowerFirst(text)}` : lowerFirst(text),
  requirementLine: (text) => lowerFirst(text).replace(/\.$/, ""),
  anyOfWording: (texts) => joinConditions(texts, "Mai", " o "),
  allOfWording: (texts) => joinConditions(texts, "Sempre", " e "),
  seconds,
  blockedAttacks: BLOCKED_ATTACKS,
  blockedAttack: BLOCKED_ATTACK,
  damageTaken,
  triggerWhen: TRIGGER_WHEN,
  secondPerson,
  arrowsWhen: { "bearer-hits": "colpiscono", "bearer-fails-to-hit": "non riescono a colpire" },
  chantOrShoutEnds: "ogni volta che un canto o un grido termina su di esso",
  energyEmpty: "se la sua Energia arriva a 0",
  dropped: DROPPED,
  targetsWords: {
    ally: "un alleato",
    "other-ally": "un altro alleato",
    foe: "un nemico",
  },
  nextSkill: NEXT_SKILL,
  yourNextSkill: YOUR_NEXT_SKILL,
  creates: "ogni volta che crei una creatura",
  areaAroundCreated: AREA_AROUND_CREATED,
  nextSkillKind: {
    "attack-skill": ["abilità d'attacco", "abilità d'attacco"],
    spell: ["incantesimo", "incantesimi"],
    hex: ["maleficio", "malefici"],
    signet: ["sigillo", "sigilli"],
    "signet-at-foe": [
      "sigillo che prende di mira un nemico",
      "sigilli che prendono di mira un nemico",
    ],
    "shout-or-chant": ["grido o canto", "grida o canti"],
    any: ["abilità", "abilità"],
  },
  lowerFirst,
  aCategory,
  negatedText,
  yourCondition,
  typeWord,
  splashSide: SPLASH_SIDE,
  auraWho: AURA_WHO,
  groundAnchorText: {
    caster: "nella tua posizione",
    corpse: "nella sua posizione",
    target: "nella posizione del tuo bersaglio",
  },
  share,
  categoryNoun,
  weaponText: {
    axe: "Attacco con ascia",
    sword: "Attacco con spada",
    hammer: "Attacco con martello",
    daggers: "Attacco con pugnali",
    scythe: "Attacco con falce",
    spear: "Attacco con lancia",
    bow: "Attacco con arco",
    melee: "Attacco in mischia",
  },
  chainRoleText: {
    lead: "Attacco principale.",
    "off-hand": "Attacco secondario.",
    dual: "Attacco doppio.",
  },
  followsText: {
    lead: "Deve seguire un attacco principale.",
    "off-hand": "Deve seguire un attacco secondario.",
    dual: "Deve seguire un attacco doppio.",
  },
  neededWeapon: NEEDED_WEAPON,
  weaponWord: WEAPON_WORD,
  typeText: TYPE_TEXT,
  areaText: AREA_TEXT,
  areaAroundTarget: AREA_AROUND_TARGET,
  targetText: TARGET_TEXT,
  areaWho: AREA_WHO,
  s: () => " s",
  onTarget: () => "sul bersaglio",
  composedLastsAtBase: (p) => (p.lasts === p.at ? p.base : `${seconds(p.lasts)} (${p.base})`),
  attributes: (p) => `attributi di ${p.name}`,
  attributes2: () => "attributi",
  attributePrimaryS: (p) =>
    p.scope === "primary" ? "attributo primario" : `attributi ${scopeWord(p.scope, true)}`,
  setTo: (p) => `${p.scope} impostati a ${p.rank}`,
  allAttributes: () => "tutti gli attributi",
  toAllAllAttributes: (p) => `${p.amount} a ${p.value}`,
  renewedWheneverAChantOrShoutEnds: (p) =>
    `si rinnova ogni volta che un canto o un grido termina su ${p.selfOnly ? "di te" : "di esso"}`,
  renewedWheneverYouCastItCastsA: (p) =>
    `si rinnova ogni volta che ${p.selfOnly ? "lanci" : "lancia"} un incantesimo`,
  reappliedWheneverYouCastItCastsA: (p) =>
    `si riapplica ogni volta che ${p.selfOnly ? "lanci" : "lancia"} un incantesimo su un nemico`,
  renewedWheneverYouTakeItTakesElemental: (p) =>
    `si rinnova ogni volta che ${p.selfOnly ? "subisci" : "subisce"} danni elementali`,
  renewedWheneverAnEnchantmentOnYouIt: (p) =>
    `si rinnova ogni volta che termina un incantamento su ${p.selfOnly ? "di te" : "di esso"}`,
  gainAdrenalineFasterSlower: (p) =>
    `ottieni Adrenalina ${p.shown} più ${p.faster > 0 ? "velocemente" : "lentamente"}`,
  onTheBearerExpireFaster: (p) => `${p.what} sul portatore scadono ${p.stat} più velocemente`,
  enchantmentsAndStances: () => "incantamenti e posizioni",
  enchantments: () => "incantamenti",
  stances: () => "posizioni",
  yourAttacksAgainstItHaveCriticalChance: (p) =>
    `i tuoi attacchi contro di esso hanno il ${p.criticalChanceBonus}% di probabilità di colpo critico`,
  armorAgainstYourAttacksWhileItHas: (p) =>
    `${p.armorModifier} armatura contro i tuoi attacchi${p.onlyWhileNoOtherHex ? " finché non ha altri malefici" : ""}`,
  youTheBearer: (p) => (p.selfOnly ? "te" : "il portatore"),
  endsIfYouEndsIfTheBearer: (p) =>
    p.selfOnly ? `termina se ${secondPerson(p.phrase)}` : `termina se il portatore ${p.phrase}`,
  healthDegeneration: (p) => `−${p.healthPips} di degenerazione della Salute`,
  healthRegeneration: (p) => `+${p.healthPips} di rigenerazione della Salute`,
  healthRegenerationForEachEnchantmentOnYou: (p) =>
    `+${p.pips} di rigenerazione della Salute per ogni incantamento su di te (al massimo ${p.max})`,
  energyDegeneration: (p) => `−${p.energyPips} di degenerazione dell'Energia`,
  energyRegeneration: (p) => `+${p.energyPips} di rigenerazione dell'Energia`,
  healthRegenerationForEachConditionOnYou: (p) =>
    `${p.healthPipsPerCondition} di rigenerazione della Salute per ogni condizione su di te`,
  health: () => "Salute",
  hex: () => "maleficio",
  energy: () => "Energia",
  condition: () => "condizione",
  regenerationForEachOnYou: (p) =>
    `${p.pips} di rigenerazione di ${p.what} per ogni ${p.each} su di te`,
  armorWhileWielding: (p) => `${p.sign}${p.armorModifier} armatura${wielding(p.weapon)}`,
  armorWhileNotMoving: (p) => `${p.armorWhileStill} armatura mentre sei fermo`,
  healthPerSecondWhileMoving: (p) =>
    `${p.healthPerSecondWhileMoving} Salute al secondo mentre ti muovi`,
  healthPerSecond: (p) => `+${p.healthPerSecond} Salute al secondo`,
  healthPerSecondMoreInEarshotOf: (p) =>
    `+${p.healthPerSecondNearSpirit} Salute al secondo in più a portata d'orecchio da uno spirito`,
  spellsCastInEarshotOfASpirit: (p) =>
    `gli incantesimi lanciati a portata d'orecchio da uno spirito si ricaricano del ${p.faster}% più velocemente`,
  chanceToDoubleStrikeWhileWielding: (p) =>
    `+${p.chance}% di probabilità di colpire due volte${wielding(p.weapon)}`,
  armorNotBelow: (p) => `−${p.amount} armatura (non sotto ${p.floor})`,
  movesAtSpeed: (p) => `si muove al ${p.speed}% della velocità`,
  movesAtSpeedWhileEnchanted: (p) =>
    `si muove al ${p.speed}% della velocità finché è sotto un incantamento`,
  speedBoostsHaveNoEffect: () => "gli aumenti di velocità non hanno effetto",
  cannotGainAdrenaline: () => "non può ottenere Adrenalina",
  whenThisEndsYouReturnToWhere: () => "quando termina, torni nel punto in cui l'hai lanciato",
  whenThisEndsYouShadowStepTo: (p) =>
    `quando termina, compi un Passo d'Ombra verso l'alleato su cui l'hai lanciato e tutte le tue abilità vengono disattivate per ${p.seconds} secondi`,
  ofAttacksMiss: (p) => `il ${p.attackMissChance}% degli attacchi va a vuoto`,
  maximumHealthAtMost: (p) => `−${p.fraction}% di Salute massima (al massimo ${p.cap})`,
  maximumHealth: (p) => `+${p.maxHealthBonus} Salute massima`,
  maximumHealthPerEnchantment: (p) =>
    `+${p.maxHealthBonusPerEnchantment} Salute massima per ogni incantamento`,
  maximumEnergy: (p) => `+${p.maxEnergyBonus} Energia massima`,
  maximumHealthPerPointOfMaximumEnergy: (p) =>
    `+${p.per} Salute massima per ogni punto di Energia massima`,
  yourMinionsDealDamage: (p) => `i tuoi servitori infliggono ${p.minionDamageBonus} danni`,
  loseMaximumHealthEachTimeAMinion: (p) =>
    `perdi il ${p.minionHitHealthLossPercent}% della Salute massima ogni volta che un tuo servitore colpisce`,
  conditionsYouWouldReceiveGoToYour: () =>
    "le condizioni che riceveresti passano invece al tuo servitore più vicino",
  healing: (p) => `${p.more ? "+" : "−"}${p.change} alle cure`,
  weaponDamage: (p) => `${p.change}% di danni dell'arma`,
  dealsDamage: (p) => `infligge ${p.more ? "+" : "−"}${p.change} danni`,
  noDeathPenalty: () => "nessuna penalità di morte",
  whenTheBearerDiesSoDoesIts: () => "quando il portatore muore, muore anche il suo incantatore",
  alliesYouResurrectReturnWithHealthAnd: (p) =>
    `gli alleati che resusciti tornano con +${p.health} Salute e +${p.energy} Energia`,
  youDieTheBearerDiesWhenIt: (p) => `${p.selfOnly ? "muori" : "il portatore muore"} quando termina`,
  leavesAnExploitedCorpse: () => "lascia un cadavere sfruttato",
  takeFromPhysicalDamage: (p) => `subisci ${p.sign}${p.amount} dai danni fisici`,
  elementalDamageTakenIsDamage: (p) =>
    `i danni elementali subiti sono ${damageNoun(p.elementalDamageTakenAs)}`,
  physicalDamageTakenIsDamage: (p) =>
    `i danni fisici subiti sono ${damageNoun(p.physicalDamageTakenAs)}`,
  physicalDamageDealtIsDamage: (p) =>
    `i danni fisici inflitti sono ${damageNoun(p.physicalDamageDealtAs)}`,
  elementalDamageDealtIsDamage: (p) =>
    `i danni elementali inflitti sono ${damageNoun(p.elementalDamageDealtAs)}`,
  takeFromSpiritsAttacks: (p) =>
    `subisci ${p.damageFromSpiritAttacks} dagli attacchi degli spiriti`,
  attacksAttacksDealDamage: (p) =>
    `${weaponAttacks(p.weapon)} infliggono ${damageNoun(p.attackDamageType)}`,
  attacksHaveArmorPenetration: (p) =>
    `gli attacchi hanno il ${p.attackArmorPenetration}% di penetrazione dell'armatura`,
  attacksAttacksDealLessMoreDamage: (p) =>
    `${weaponAttacks(p.weapon)} infliggono ${p.amount} danni in ${p.delta < 0 ? "meno" : "più"}`,
  and: () => " e ",
  immuneToAnd: (p) => `immune a ${p.names}`,
  setOnFire: () => "in fiamme",
  or: () => " o ",
  cannotBeOr: (p) => `non può essere ${p.names}`,
  attacksFromAttacks: (p) =>
    `${p.adrenalineGain}${p.adrenalineGainFasterFrom === "attacks" ? " dagli attacchi" : ""}`,
  yourEliteEliteSkillSUse: (p) =>
    `${p.skillType === "elite" ? "le tue abilità élite usano" : p.skillType === "spell" ? "i tuoi incantesimi usano" : "i tuoi sigilli usano"} ${p.name}`,
  uses: (p) => `il tuo prossimo uso di ${borrowedKind(p.skillType, false)}`,
  sUse: (p) => `i tuoi prossimi ${p.uses} usi di ${borrowedKind(p.skillType, true)}`,
  yourNext: (p) => `per ${p.next} si usa ${p.name}`,
  spellsTakeAsLongToCast: (p) =>
    `gli incantesimi richiedono ${p.castTimeMultiplier}× il tempo di lancio`,
  skillsButAttacksTakeAsLongTo: (p) =>
    `le abilità, tranne gli attacchi, richiedono ${p.skillActivationMultiplier}× il tempo di attivazione`,
  spellsAreInterruptedByAttacks: () => "gli incantesimi vengono interrotti dagli attacchi",
  slowerFaster: (p) => (p.attackDurationMultiplier > 1 ? "più lenti" : "più veloci"),
  attacksWhileWielding: (p) => `attacchi del ${p.change}% ${p.way}${wielding(p.weapon)}`,
  conditionsYouApplyLastLongerWhileWielding: (p) =>
    `le condizioni che applichi durano il ${p.longer}% in più${wielding(p.weapon)}`,
  enchantmentsYouMaintainCostTheUpkeep: (p) =>
    `gli incantamenti che mantieni costano ${p.upkeepMultiplier}× il mantenimento`,
  spellsThatCauseOvercastCauseMoreAs: (p) =>
    `gli incantesimi che causano Sovraccarico ne causano ${p.overcastSurcharge} in più al termine`,
  arrowsMoveAsFast: (p) => `le frecce sono ${p.projectileSpeedMultiplier}× più veloci`,
  cannotCastSpells: () => "non può lanciare incantesimi",
  cannotAttack: () => "non può attaccare",
  cannotUseResurrectionSkills: () => "non può usare abilità di resurrezione",
  cannotBeTheTargetOfEnemySpells: (p) =>
    p.whileCasting
      ? "non può essere bersaglio di incantesimi nemici mentre lancia incantesimi"
      : "non può essere bersaglio di incantesimi nemici",
  cannotBeTheTargetOfSpells: () => "non può essere bersaglio di incantesimi",
  hostileSpellsTargetingYouFail: () => "gli incantesimi ostili che ti prendono di mira falliscono",
  attacksAgainstYouMiss: () => "gli attacchi contro di te vanno a vuoto",
  strippedOfAllEnchantmentsAndCannotBe: () =>
    "perde tutti gli incantamenti e non può riceverne altri",
  cannotBeTheTargetOfEnchantments: () => "non può essere bersaglio di incantamenti",
  cannotUseShoutsOrChants: () => "non può usare grida o canti",
  cannotUseSignets: () => "non può usare sigilli",
  cannotBlockItsCasterSAttacks: () => "non può bloccare gli attacchi del suo incantatore",
  cannotBeBlockedByBlindedFoes: () => "non può essere bloccato da nemici accecati",
  cannotBlock: () => "non può bloccare",
  renewedForSecondsIfMovingAsIt: (p) =>
    `si rinnova per ${p.renewsWhileMoving} secondi se ti stai muovendo quando dovrebbe terminare`,
  cannotBeKnockedDown: () => "non può essere atterrato",
  cannotBeKnockedDownByAFoe: () => "non può essere atterrato da un nemico",
  endsIfItPreventsAKnockdown: () => "termina se evita un atterramento",
  youDoNotSufferExtraDamageFrom: () => "non subisci danni extra da un attacco critico",
  cannotLandCriticalHits: () => "non può mettere a segno colpi critici",
  immuneToCriticalHits: () => "immune ai colpi critici",
  spellsHaveDoubleTheDivineFavorBonus: (p) =>
    `gli incantesimi di ${p.attribute} hanno il doppio del bonus di Favore Divino`,
  attackSkillAttackSkills: (p) =>
    p.once
      ? p.attackSkillsOnly === true
        ? "abilità d'attacco"
        : BLOCKED_ATTACK[p.against]
      : p.attackSkillsOnly === true
        ? "le abilità d'attacco"
        : BLOCKED_ATTACKS[p.against],
  whileBelowHealth: (p) => ` mentre sei sotto il ${p.blockBelowHealth}% di Salute`,
  whileUnderOr: (p) => ` mentre sei sotto ${p.value}`,
  fromFoesUnderOr: (p) => ` da nemici sotto ${p.value}`,
  whileAttacking: (p) => (p.blockWhileAttacking ? " mentre attacchi" : ""),
  blocksTheNextChanceToBlock: (p) =>
    p.once
      ? `blocca il prossimo ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`
      : `${p.chance}% di probabilità di bloccare ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`,
  within: (p) => within(p.radius, p.radius2),
  alliesTo: (p) => `alleati ${p.around} a ${p.bearer}: ${p.status}`,
  whileWielding: (p) => wielding(p.weapon),
  whileHoldingAWeaponOtherThan: (p) => ` mentre impugni un'arma diversa da ${NEEDED_WEAPON[p.not]}`,
  againstFoesThatAreNotMoving: (p) =>
    p.criticalChanceBonusVersus === undefined ? "" : " contro nemici fermi",
  criticalChance: (p) => `${p.chance}% di probabilità di colpo critico${p.holding}${p.versus}`,
  gainEnergyPerCriticalHit: (p) => `ottieni ${p.energyPerCritical} Energia per ogni colpo critico`,
  wheneverYouSuccessfullyLandACriticalHit: (p) =>
    `ogni volta che metti a segno un colpo critico, ottieni ${p.healthPerCritical} Salute`,
  refreshesEveryTimeYouLandACritical: () =>
    "si rinnova ogni volta che metti a segno un colpo critico",
  theNextTimeYouLandACritical: (p) =>
    p.endsWhenFired
      ? "la prossima volta che metti a segno un colpo critico"
      : "ogni volta che metti a segno un colpo critico",
  with: (p) =>
    p.weapon === undefined ? p.critical : `${p.critical} con ${NEEDED_WEAPON[p.weapon]}`,
  removeStatusFromYourTarget: (p) =>
    p.kind === "remove-status"
      ? `${p.when}: ${lowerFirst(p.text)} dal tuo bersaglio`
      : `${p.when}: ${lowerFirst(p.text)}`,
  ifOneIsRemovedYouLoseEnergy: (p) =>
    `se ne viene rimosso uno, perdi ${p.energyIfRemoved} Energia o termina`,
  endsAfterIncomingAttackS: (p) =>
    `termina dopo ${p.endsAfterAttacks} ${p.endsAfterAttacks2 === 1 ? "attacco subito" : "attacchi subiti"}`,
  endsAfterYourNextAttackSHit: (p) =>
    p.endsAfterAttackCount2 === 1
      ? `termina dopo il tuo prossimo attacco, che colpisca, manchi o venga bloccato`
      : `termina dopo i tuoi prossimi ${p.endsAfterAttackCount} attacchi, che colpiscano, manchino o vengano bloccati`,
  noEffectWhileUnderOr: (p) => `nessun effetto mentre sei sotto ${p.suppressedWhileUnder}`,
  yourNextAttackSCannotBeBlocked: (p) =>
    p.unblockableAttacks2 === 1
      ? "il tuo prossimo attacco non può essere bloccato"
      : `i tuoi prossimi ${p.unblockableAttacks} attacchi non possono essere bloccati`,
  attacksCannotBeBlocked: (p) => `${weaponAttacks(p.weapon)} non possono essere bloccati`,
  whileYouWieldAnAWeapon: (p) => `mentre impugni un'arma ${damageWeapon(p.weaponDamage)}, ${p.hit}`,
  forEachEnchantmentRemovedSCasterLoses: (p) =>
    `per ogni incantamento di ${p.name} rimosso, l'incantatore di ${p.name2} perde il ${p.percentOfMax}% della Salute massima`,
  with2: (p) => (p.weapon === undefined ? "" : ` con ${NEEDED_WEAPON[p.weapon]}`),
  endsAfterHitS: (p) => `termina dopo ${p.count} ${p.count2 === 1 ? "colpo" : "colpi"}${p.how}`,
  spellSpells: (p) => (p.one ? "incantesimo" : `${p.count} incantesimi`),
  yourNextCostsCostLessEnergy: (p) =>
    p.one
      ? `il tuo prossimo uso di ${p.next} costa ${p.costReduction} Energia in meno`
      : `i tuoi prossimi usi di ${p.next} costano ${p.costReduction} Energia in meno`,
  yourNextRechargesRechargeFaster: (p) =>
    p.one
      ? `il tuo prossimo uso di ${p.next} si ricarica del ${p.rechargeFaster}% più velocemente`
      : `i tuoi prossimi usi di ${p.next} si ricaricano del ${p.rechargeFaster}% più velocemente`,
  forYourNext: (p) => `per il tuo prossimo uso di ${p.next}`,
  theirProjectilesMoveAsFast: (p) =>
    `i loro proiettili sono ${p.projectileSpeedMultiplier}× più veloci`,
  noOvercast: () => "nessun Sovraccarico",
  spreadsToAdjacentCombatants: () => "si diffonde ai combattenti adiacenti",
  nextAttackSkillDamage: (p) => `prossima abilità d'attacco: ${p.condition}: +${p.more} danni`,
  attacks: () => "attacca",
  makesAMeleeAttack: () => "effettua un attacco in mischia",
  moves: () => "si muove",
  takesDamage: (p) => `subisce ${p.damageTakenMultiplier} danni`,
  takesDamageFromTheNextAttack: (p) =>
    `subisce ${damageTaken(p.attackDamageTakenMultiplier)} danni dal prossimo attacco`,
  damageTaken2: (p) => `−${p.damageReduction} danni subiti`,
  damageTakenPerRankOfAtMost: (p) =>
    `−${p.now} danni subiti (${p.perRank} per livello di ${p.attribute}, al massimo ${p.max})`,
  damageTakenMoreEachHit: (p) => `−${p.step} danni subiti, ${p.step} in più a ogni colpo`,
  theNextHitDealsLessDamage: (p) =>
    `il prossimo colpo infligge ${p.nextDamageReduction} danni in meno`,
  damageTakenWhileCastingS: (p) =>
    `−${p.amount} danni subiti mentre lanci ${plural(typeName(p.skillType))}`,
  lessDamage: (p) => `${p.value}% di ${damageNoun(p.type)} in meno`,
  lessDamageFromFoesWithAHex: (p) =>
    `${p.fraction}% di danni in meno da nemici con un maleficio di ${p.name}`,
  lessDamageFromFoesSufferingFrom: (p) =>
    `${p.fraction}% di danni in meno da nemici affetti da ${p.name}`,
  damageTakenFromFoesWithLessHealth: (p) =>
    `−${p.damageReductionFromWeakerFoe} danni subiti da nemici con meno Salute`,
  damageTakenFromFoesWithACondition: (p) =>
    `−${p.damageReductionFromConditionedFoe} danni subiti da nemici con una condizione`,
  lessDamageFromSpells: (p) => `${p.less}% di danni in meno dagli incantesimi`,
  damageOverInASecondIsHealed: (p) => `i danni oltre ${p.cap} in un secondo vengono curati`,
  physicalItsPhysicalDamageTheDamageIt: (p) =>
    p.from === "physical" ? "dei suoi danni fisici" : "dei danni che subisce dagli attacchi",
  whichTakesLessOfIt: (p) => `, che ne subisce ${p.reduction} in meno`,
  goesToItsCaster: (p) => `${shareOf(p.fraction, p.hits)} va al suo incantatore${p.less}`,
  theDamageYouTakeGoesToYour: (p) =>
    `${shareOf(p.redirectsDamageToMinion, "dei danni che subisci")} va al tuo servitore più vicino`,
  damageFromASingleHitIsCapped: (p) =>
    `i danni di un singolo colpo sono limitati al ${p.maxDamageFractionPerHit}% della Salute massima`,
  eachHitItCapsCostsTheCaster: (p) =>
    `ogni colpo che limita costa all'incantatore ${p.casterEnergyPerReduction} Energia, e termina quando l'incantatore non può pagare`,
  damageFromASingleAttackIsCapped: (p) =>
    `i danni di un singolo attacco sono limitati al ${p.attackDamageCapFraction}% della Salute massima`,
  lifeStolen: (p) => `−${p.lifeStealReduction} vita rubata`,
  yourHealthSacrificesAreLarger: (p) =>
    `i tuoi sacrifici di Salute sono del ${p.sacrificeMultiplier}% maggiori`,
  knockdownsLastAtLeastS: (p) => `gli atterramenti durano almeno ${p.knockdownMinSeconds} s`,
  itsSpiritLosesHealthEachTime: (p) =>
    `il suo spirito perde ${p.sourceLosesHealth} Salute ogni volta`,
  reappliedAsItWouldEndWhileYou: (p) =>
    `si riapplica quando dovrebbe terminare finché ${p.selfOnly ? "hai" : "ha"} un altro maleficio`,
  chantsAndShoutsLastLongerOnIt: (p) => `canti e grida durano il ${p.longer}% in più su di esso`,
  attacksDealLessMoreDamage: (p) =>
    `gli attacchi infliggono ${p.attackDamageDelta} danni in ${p.attackDamageDelta2 < 0 ? "meno" : "più"}`,
  movesFaster: (p) => `si muove del ${p.moveSpeedMultiplier}% più velocemente`,
  healthRegenerationDegeneration: (p) =>
    `${p.healthPips} di ${p.healthPips2 > 0 ? "rigenerazione" : "degenerazione"} della Salute`,
  armor: (p) => `${p.armorModifier} armatura`,
  attacksFaster: (p) => `attacca del ${p.value}% più velocemente`,
  aOr: (p) => `una ${categoryList(p.categories)}`,
  listComma: () => ", ",
  whileUnderOr2: (p) => `mentre sei sotto ${p.under}: ${p.gains}`,
  once: () => "una volta",
  times: (p) => `${p.stat} volte`,
  endsAfterItTakesEffect: (p) => `termina dopo aver avuto effetto ${p.times}`,
  theNextHexFailsAndItsCaster: (p) =>
    `il prossimo maleficio fallisce e il suo incantatore subisce ${p.damage} danni`,
  theNextSpellItCastsAtFoe: (p) =>
    `il prossimo incantesimo che lancia su ${p.on === "foe-targeted" ? "un nemico" : "un alleato"} fallisce: ${p.what}`,
  theNextTouchSkillsUsedAgainstYou: (p) =>
    `le prossime ${p.failsFoeTouchSkills} abilità a tocco usate contro di te falliscono`,
  foesWithinFoes: (p) => (p.area === undefined ? `nemici entro ${p.radius}` : `nemici ${p.area}`),
  moreEachSecond: (p) => `, ${p.growth} in più ogni secondo`,
  eachSecondItAndTakeDamage: (p) =>
    `ogni secondo, ${p.hitsBearer ? "esso e " : ""}${p.foes} subiscono ${p.damage} danni${kindWord(p.kind)}${p.more}`,
  second: () => "secondo",
  seconds2: (p) => `${p.every} secondi`,
  everySecondSeconds: (p) => `ogni ${p.value}: ${p.what}`,
  itsSpiritLosesHealthForEachOne: (p) =>
    `il suo spirito perde ${p.amount} Salute per ogni creatura ferita`,
  itsSpiritLosesHealthForEachOne2: (p) =>
    `il suo spirito perde ${p.amount} Salute per ogni creatura curata`,
  everyAttack: () => "ogni attacco",
  theNextAttack: () => "il prossimo attacco",
  theNextAttacks: (p) => `i prossimi ${p.times} attacchi`,
  typelessAsDamage: (p) => (p.type === "typeless" ? "" : ` come ${damageNoun(p.type)}`),
  ofTheDamageOfThatHitIt: (p) =>
    `il ${p.share}% dei danni di ${p.attacks} che lo colpiscono torna all'attaccante${p.kind}, fino a ${p.max}`,
  eachAttackItLandsHasAChance: (p) =>
    `ogni attacco che mette a segno ha il ${p.chance}% di probabilità di infliggere invece i danni a sé stesso, fino a ${p.max}`,
  theNextDamageOrLifeStealHeals: (p) =>
    `i prossimi danni o furto di vita curano invece della stessa quantità, fino a ${p.reversesNextDamage}`,
  theNextDamageIsNegatedAndIts: (p) =>
    `i prossimi danni vengono annullati e la loro fonte subisce invece la stessa quantità, fino a ${p.cap}`,
  meleeAttacksNeitherHitNorFailTo: (p) =>
    `gli attacchi in mischia non colpiscono né mancano, e infliggono invece ${p.damage} danni ciascuno`,
  allDamageHealsForThatMuchInstead: (p) =>
    `tutti i danni curano invece della stessa quantità, fino a ${p.cap} per colpo`,
  theNextDamageOrLifeStealThat: (p) =>
    `i prossimi danni o furto di vita che ${p.selfOnly ? "ti" : "lo"} ucciderebbero vengono annullati`,
  whenOneAllySIsSpentIt: () =>
    "quando quello di un alleato si esaurisce, termina su tutti gli altri",
  gainMoreStrikeStrikesOfAdrenalinePer: (p) =>
    `ottieni ${p.extraStrikesPerHit} ${p.extraStrikesPerHit2 === 1 ? "colpo" : "colpi"} di Adrenalina in più per ogni colpo`,
  skillsRechargeFaster: (p) =>
    `le abilità si ricaricano del ${p.skillRechargeFaster}% più velocemente`,
  skillsCostMoreLessEnergy: (p) =>
    `le abilità costano il ${p.change}% di Energia in ${p.change2 > 0 ? "più" : "meno"}`,
  spellsAndBindingRitualsRechargeFaster: (p) =>
    `gli incantesimi e i rituali di vincolo si ricaricano del ${p.faster}% più velocemente`,
  spellsRechargeFaster: (p) =>
    `gli incantesimi si ricaricano del ${p.spellRechargeFaster}% più velocemente`,
  bindingRitualsRechargeFaster: (p) =>
    `i rituali di vincolo si ricaricano del ${p.faster}% più velocemente`,
  enchantmentsRechargeFaster: (p) =>
    `gli incantamenti di ${p.name} si ricaricano del ${p.faster}% più velocemente`,
  hexTheTargetSYour: (p) => (p.category === "hex" ? "Gli usi del bersaglio di" : "Gli usi di"),
  skillsHaveArmorPenetration: (p) =>
    `le abilità di ${p.name} hanno il ${p.pierce}% di penetrazione dell'armatura`,
  yourTheBearerSSkillsCannotBe: (p) =>
    `le abilità ${p.selfOnly ? "tue" : "del portatore"} non possono essere interrotte`,
  theNextTimeYouWouldBeInterrupted: () => "la prossima volta che verresti interrotto, non lo sei",
  youCannotBeInterruptedEachTimeYou: (p) =>
    `non puoi essere interrotto; ogni volta che lo saresti, perdi ${p.amount} Energia o questo effetto termina`,
  youCannotBeInterruptedEachTimeYou2: (p) =>
    `non puoi essere interrotto; ogni volta che lo saresti, perdi 1 incantamento di ${p.profession} o questo effetto termina`,
  conditionsOnExpireFaster: (p) =>
    `le condizioni su ${p.bearer} scadono ${p.faster} più velocemente`,
  hexesOnExpireFaster: (p) => `i malefici su ${p.bearer} scadono del ${p.faster}% più velocemente`,
  theNextHexOnLastsLonger: (p) =>
    `il prossimo maleficio di ${p.of} su ${p.bearer} dura ${p.longer} in più`,
  hexesCastOnTakeAsLongTo: (p) =>
    `i malefici lanciati su ${p.bearer} richiedono ${p.times}× il tempo di lancio`,
  otherAlliesSpellsOnTakeAsLong: (p) =>
    `gli incantesimi di altri alleati su ${p.bearer} richiedono ${p.times}× il tempo di lancio`,
  yourSpellsOnTakeAsLongTo: (p) =>
    `i tuoi incantesimi su ${p.bearer} richiedono ${p.times}× il tempo di lancio`,
  enchantmentsCastOnCostLessEnergyMinimum: (p) =>
    `gli incantamenti lanciati su ${p.bearer} costano ${p.less} Energia in meno, minimo 1`,
  hitsWithAnAttack: () => "colpisce con un attacco",
  failsToHit: () => "non riesce a colpire",
  hitsWithAnAttackSkill: () => "colpisce con un'abilità d'attacco",
  skillEffectEndsIfYouUseA: (p) =>
    p.selfOnly || p.category === "skill-effect"
      ? "termina se usi un'abilità"
      : "termina se il portatore usa un'abilità",
  endsIfYouUseAnAdrenalSkill: () => "termina se usi un'abilità adrenalinica",
  endsIfYouUseANonAdrenal: () => "termina se usi un'abilità non adrenalinica",
  endsIfYouUseANonSkill: (p) => `termina se usi un'abilità che non sia ${indefinite(p.kind)}`,
  endsIfYouUseAnAttackSkill: () => "termina se usi un'abilità d'attacco",
  endsIfYouUseASkillOn: () => "termina se usi un'abilità su di esso",
  endsIfYouUseASkillThat: (p) =>
    `termina se usi un'abilità che non sia ${indefinite(p.NEXT_SKILL_KIND)}`,
  hexHexedEnchanted: (p) => (p.category === "hex" ? "maledetto" : "incantato"),
  becomesOr: (p) => `diventa ${p.gained}`,
  theBearerIsDestroyedWhenItExpires: () => "il portatore viene distrutto quando scade",
  theMinionsYouItTookBecomeMasterless: (p) =>
    `i servitori che ${p.selfOnly ? "hai" : "ha"} preso restano senza padrone quando termina`,
  whenTheBearerDiesRisesWhereIt: (p) =>
    p.masterless === true
      ? `quando il portatore muore, ${p.stands} si rialza dove è caduto, senza padrone`
      : `quando muore, ${p.stands} si rialza al suo posto`,
  composedKindBoundWhenOn: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.on],
  endsIfItEndsIfYou: (p) =>
    p.onFoe ? `termina se ${p.when}` : `termina se ${secondPerson(p.when)}`,
  all: (p) => (p.once && p.against === "all" ? blockAnswerWording(p.text) : p.text),
  whileHoldingAnItem: (p) =>
    p.onlyWhileHoldingItem && !p.holdingSaid ? `${p.stats} mentre tieni un oggetto` : p.stats,
  composedIndexText: (p) => (p.index === 0 ? p.text : capitalize(p.text)),
  listSentence: () => ". ",
  physicalAttacks: (p) =>
    p.weapon !== undefined
      ? `attacchi ${WEAPON_WORD[p.weapon]}`
      : p.physicalOnly
        ? "attacchi fisici"
        : "attacchi",
  attackSkillsPhysicalAttacks: (p) => (p.attackSkillsOnly ? weaponSkills(p.weapon) : p.value),
  foesYourHitGetFor: (p) =>
    `i nemici colpiti dai tuoi ${p.attacks} ottengono ${p.statusName} per ${p.durationSeconds}`,
  foesYourHitTake: (p) => `i nemici colpiti dai tuoi ${p.attacks} subiscono ${p.riderDamage}`,
  foesYourHitLose: (p) =>
    `i nemici colpiti dai tuoi ${p.attacks} perdono ${p.count} ${categoryNoun(p.count2, p.category)}`,
  andSoDoFoesAdjacentToThem: (p) => `${p.pop}, e così i nemici adiacenti a loro`,
  stealUpToHealth: (p) => `${p.attacks} rubano fino a ${p.amount} Salute`,
  yourPetSAttacksHealYouFor: (p) => `gli attacchi del tuo animale ti curano di ${p.amount}`,
  yourInterruptFoesTheyHit: (p) => `i tuoi ${p.attacks} interrompono i nemici che colpiscono`,
  your: (p) => `i tuoi ${p.attacks}: ${p.text}`,
  attackSkillsPhysicalAttacks2: (p) =>
    p.attackSkillsOnly
      ? weaponSkills(p.weapon)
      : p.weapon === undefined
        ? "attacchi fisici"
        : `attacchi ${WEAPON_WORD[p.weapon]}`,
  foesThatBlockYourGetFor: (p) =>
    `i nemici che bloccano i tuoi ${p.attacks} ottengono ${p.statusName} per ${p.durationSeconds}`,
  foesThatBlockYour: (p) => `i nemici che bloccano i tuoi ${p.attacks}: ${lowerFirst(p.text)}`,
  damage: (p) => damageOf(p.amount, p.type),
  physical: () => "fisici",
  elemental: () => "elementali",
  armor2: () => "armatura",
  listSpace: () => " ",
  againstProjectileAttacks: (p) => {
    const text = armorAgainst(p.text);
    return p.projectile ? `${text} contro gli attacchi a distanza` : text;
  },
  thatAllyIsHealedFor: (p) => `quell'alleato viene curato di ${p.amount}`,
  youLoseItsCasterLoses: (p) => (p.bearerIsCaster ? "perdi" : "il suo incantatore perde"),
  energy2: (p) => `${p.who} ${p.amount} Energia`,
  orSpell: (p) => `incantesimo ${p.value}`,
  wheneverYouCastItCastsAnA: (p) =>
    `ogni volta che ${p.bearerIsCaster ? "lanci" : "lancia"} ${indefinite(nounFirst(p.spell))} su un alleato, ${p.value}`,
  composedKindBoundWhenEvent: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.event],
  youOrItOr: (p) => (p.bearerIsCaster ? p.phrases : p.phrases2),
  whenItOrOrAtOnce: (p) => (p.length === 0 ? p.death : `quando ${p.others}, o subito ${p.death}`),
  whenItOr: (p) => `quando ${p.on}`,
  composedBearerIsCaster: (p) => (p.bearerIsCaster ? YOUR_NEXT_SKILL : NEXT_SKILL),
  theNextTime: (p) => `la prossima volta che ${p.doer}`,
  composedEventWhenOf: (p) =>
    p.event === "bearer-hits"
      ? "colpiscono"
      : p.event === "bearer-fails-to-hit"
        ? "non riescono a colpire"
        : p.whenOf,
  wheneverYourArrowsOr: (p) => `ogni volta che le tue frecce ${p.on}`,
  wheneverOnACreatureWithLessHealth: (p) =>
    `ogni volta che ${p.doer}${p.victimHasLessHealth === undefined ? "" : " su una creatura con meno Salute"}`,
  and2: () => ", e ",
  andAnd: (p) => (p.when === undefined ? p.each : `${p.when}: ${p.each}`),
  youItAnd: (p) => `${p.when}: ${p.bearerIsCaster ? "tu" : "esso"} e ${p.answer}`,
  youAndAllPartyMembersAreHealed: (p) =>
    `${DROPPED}: tu e tutti i membri del gruppo venite curati di ${p.healed}`,
  composedWhat: (p) => `${DROPPED}: ${p.what}`,
  meleeHitsWithAMeleeAttackHits: (p) =>
    p.weapon === "melee"
      ? "colpisce con un attacco in mischia"
      : `colpisce con ${NEEDED_WEAPON[p.weapon]}`,
  meleeIsHitByAFoeS: (p) =>
    p.weapon === "melee"
      ? "viene colpito dall'attacco in mischia di un nemico"
      : `viene colpito dall'attacco di un nemico con ${NEEDED_WEAPON[p.weapon]}`,
  with3: (p) => `${TRIGGER_WHEN[p.event]} con ${NEEDED_WEAPON[p.weapon]}`,
  youGainEnergy: (p) => `ottieni ${p.amount} Energia`,
  allYourSkillsAreRecharged: () => "tutte le tue abilità si ricaricano",
  yourPartyIsHealedFor: (p) => `il tuo gruppo viene curato di ${p.amount}`,
  takeDamage: (p) => `${lowerFirst(p.upTo)} subiscono ${damageOf(p.amount, p.type)}`,
  areHealedFor: (p) => `${lowerFirst(p.upTo)} vengono curati di ${p.amount}`,
  composedUpToText: (p) => `${lowerFirst(p.upTo)}: ${lowerFirst(p.text)}`,
  ifTargetFoeDiesWhileHexedWith: (p) =>
    p.bearerIsFoe
      ? "se il nemico bersaglio muore mentre è sotto questo maleficio"
      : "se un alleato muore mentre è sotto questo incantamento",
  and3: (p) => `${p.who}, ${p.flatMap}`,
  hasASpellInterrupted: () => "viene interrotto durante il lancio di un incantesimo",
  isStruckForDamageWhileUsingA: (p) => `subisce ${damageNoun(p.damageType)} mentre usa un'abilità`,
  takesDamageFromAFoe: (p) => `subisce ${damageNoun(p.damageType)} da un nemico`,
  takesMoreThanDamageFromAFoe: (p) => `subisce più di ${p.minDamage} danni da un nemico`,
  hasItsHealthDroppedBelowByDamage: (p) =>
    `scende sotto il ${p.healthBelow}% di Salute a causa dei danni`,
  isMoreThanFromYou: (p) => `è a più di ${p.apartBeyond} da te`,
  hitsWithAAttack: (p) => `colpisce con un attacco ${CHAIN_WORD[p.chainRole]}`,
  isHitByAnAttackAAttack: (p) =>
    `viene colpito da un attacco${p.role === undefined ? "" : ` ${CHAIN_WORD[p.role]}`} del suo incantatore`,
  blocksAAttack: (p) => `blocca un attacco ${blockWord(p.blocked)}`,
  losesAEnchantment: (p) => `perde un incantamento di ${p.name}`,
  hex2: (p) =>
    p.scopeAdjective === "" ? "maleficio" : `maleficio di ${scopeWord(p.scopeAdjective, false)}`,
  appliesAnAToAFoe: (p) => `applica un ${p.words} a un nemico`,
  spell: (p) => (p.type === undefined ? "incantesimo" : typeName(p.type)),
  onAllyAnAllyAFoe: (p) => ` su ${p.targets === "ally" ? "un alleato" : "un nemico"}`,
  castsAnA: (p) => `lancia ${indefinite(nounFirst(p.words))}${p.on}`,
  non: (p) => `non di ${typeFirstWord(p.notType)}`,
  elite: () => "élite",
  adrenal: () => "adrenalinica",
  skill: () => "abilità",
  isTargetedByYour: (p) => `viene preso di mira da ${indefinite(skillPhrase(p.words))} che usi`,
  on: (p) =>
    p.targets === undefined
      ? ""
      : ` su ${{ ally: "un alleato", "other-ally": "un altro alleato", foe: "un nemico" }[p.targets]}`,
  usesAnA: (p) => `usa ${indefinite(skillPhrase(p.words))}${p.on}`,
  health2: (p) => `${p.amount} Salute`,
  energy3: (p) => `${p.amount} Energia`,
  takeDamage2: (p) => `subiscono ${damageOf(p.amount, p.type)}`,
  loseAllAllS: (p) =>
    `perdono ${p.value} ${p.count === 1 ? CATEGORY[p.category].one : CATEGORY[p.category].many}`,
  all2: (p) => `tutti ${allSide(p.side)}`,
  upTo: (p) => `fino a ${p.maxTargets} ${p.side}`,
  withinOfThatCreature: (p) =>
    AREA_AROUND_CREATED.get(p.radius) ?? `entro ${p.radius2} da quella creatura`,
  gain: (p) => `ottieni ${p.answer}`,
  youGain: (p) => `${p.when}: ${p.gains ? `ottieni ${p.answers}` : p.answers}`,
  onIt: () => "su di esso",
  damageOnIt: (p) => p.value + `${damageOf(p.amount, p.type)} ${p.perCount}`,
  composedWhenWhat: (p) => `${p.when}: ${p.what}`,
  itsAdjacentAllies: () => "i suoi alleati adiacenti",
  itsAlliesWithin: (p) => `i suoi alleati ${p.area ?? `entro ${p.radius}`}`,
  itsAdjacentAlliesItsAlliesWithin: (p) =>
    !p.bearerIsFoe ? `${lowerFirst(p.foesWithin)}${p.only}` : p.value,
  bearerBlocksMeleeMeleeProjectile: (p) =>
    p.on === "bearer-blocks-melee" ? "in mischia" : "a distanza",
  whenYouBlockYouAndAlliesAre: (p) =>
    `quando blocchi, tu e gli alleati ${p.area} venite curati di ${p.amount}`,
  eachBlockCostsYouEnergyOrThis: (p) =>
    `ogni blocco ti costa ${p.amount} Energia o questo effetto termina`,
  youGainEnergyForEachSuccessfulAttack: (p) =>
    `ottieni ${p.amount} Energia per ogni attacco ${blockWord(p.kind)} bloccato`,
  wheneverYouBlockAAttackThisWay: (p) =>
    `ogni volta che blocchi così un attacco ${blockWord(p.kind)}, l'attaccante subisce ${damageOf(p.amount, p.type)}`,
  withinOfYouFoes: (p) => `nemici ${AREA_TEXT.get(p.radius) ?? `entro ${p.radius2} da te`}`,
  ifYouBlockAAttackSufferFrom: (p) =>
    `se blocchi un attacco ${blockWord(p.kind)}, ${p.foes} subiscono ${p.statusName} per ${p.resolveMagnitudeAtRanks} secondi`,
  ifYouBlockAAttack: (p) =>
    `se blocchi un attacco ${blockWord(p.kind)}, ${p.foes}: ${lowerFirst(p.text)}`,
  stealsHealthFromThatFoe: (p) => `ruba ${p.amount} Salute a quel nemico`,
  loses: (p) => `perde ${p.count} ${categoryNoun(p.count2, p.category)}`,
  itTakesDamage: (p) => `subisce ${damageOf(p.amount, p.type)}`,
  takeDamage3: (p) => `${p.splashed} subiscono ${damageOf(p.amount, p.type)}`,
  thatAttackIsInterruptedAndAnd: (p) => `${p.when}, quell'attacco viene interrotto e ${p.hurt}`,
  itIsInterruptedAndYouLoseEnergy: (p) =>
    `${p.when}, viene interrotto e perdi ${p.amount} Energia o questo effetto termina`,
  ofThatSkillSBaseEnergyCost: (p) => `${p.share} del costo base in Energia di quell'abilità`,
  energy4: (p) => `${p.amount} Energia`,
  youAreHealedAreHealedIsHealed: (p) =>
    p.bearerIsCaster && p.length === 0
      ? "vieni curato"
      : p.bearerIsCaster
        ? "venite curati"
        : "viene curato",
  forOfThatSkillSEnergyCost: (p) =>
    `${p.healed} del ${p.share} del costo in Energia di quell'abilità`,
  forWord: (p) => `${p.healed} di ${p.amount}`,
  plus: () => " più ",
  youGainGainsPlus: (p) => `${p.bearerIsCaster ? "ottieni" : "ottiene"} ${p.gains}`,
  theNearestOf: (p) => `il più vicino tra ${p.splashed}`,
  upTo2: (p) => `fino a ${p.maxTargets} ${p.splashed}`,
  itAndLoseEnergy: (p) => `esso e ${p.others} perdono ${p.amount} Energia`,
  bearerFoesFoesOtherFoes: (p) => (p.to === "bearer-foes" ? "nemici" : "altri nemici"),
  inTheAreaSufferItToo: (p) => `anche ${p.who} nell'area lo subiscono`,
  ifASpellItThatSkill: (p) => (p.spellsOnly ? "se è un incantesimo, esso" : "quell'abilità"),
  takesThisSkillSSlotForSeconds: (p) =>
    `${p.which} prende il posto di questa abilità per ${p.seconds} secondi`,
  youEnterTheSameStance: () => "entri nella stessa posizione",
  youLoseEnergyOrThisEnds: (p) => `perdi ${p.amount} Energia o questo effetto termina`,
  thatAttackIsInterrupted: (p) => `${p.when}, quell'attacco viene interrotto`,
  takes: (p) => `subisce ${p.dealt} ${p.when}`,
  bearerFatalDamageNegatedAnd: (p) => (p.on === "bearer-fatal-damage-negated" ? "e" : `${p.when},`),
  theFoeWhoDealtItTakesDamage: (p) =>
    `${p.then} il nemico che li ha inflitti subisce ${damageOf(p.amount, p.type)}`,
  thatAttackerIsHealedFor: (p) => `${p.when}, quell'attaccante viene curato di ${p.amount}`,
  bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p) =>
    p.on === "bearer-gains-enchantment" ? "incantamento" : "maleficio o incantamento",
  theCasterOfThatTakesDamage: (p) =>
    `${p.when}, chi ha lanciato quel ${p.gained} subisce ${damageOf(p.amount, p.type)}`,
  theHealerTakesDamage: (p) => `${p.when}, il guaritore subisce ${damageOf(p.amount, p.type)}`,
  ofThatTarget: (p) => `${lowerFirst(p.upTo)} di quel bersaglio ${p.what}${p.paid}`,
  healsItsCasterFor: (p) => `cura il suo incantatore di ${p.amount} ${p.when}`,
  itsCasterGainsEnergy: (p) => `il suo incantatore ottiene ${p.amount} Energia ${p.when}`,
  theNextSkillYouUseItUses: (p) =>
    `la prossima abilità che ${p.bearerIsCaster ? "usi" : "usa"} impiega ${p.seconds} secondi in più a ricaricarsi`,
  itsCasterStealsHealth: (p) => `il suo incantatore ruba ${p.amount} Salute ${p.when}`,
  theNearestOfTakes: (p) => `il più vicino tra ${p.allies} subisce`,
  take: (p) => `${p.allies} subiscono`,
  upToTake: (p) => `fino a ${p.maxTargets} ${p.allies} subiscono`,
  composedAlliesText: (p) => `${p.allies}: ${lowerFirst(p.text)}`,
  onAFoe: (p) => `${p.when} su un nemico`,
  adjacentToYou: () => "adiacenti a te",
  withinAroundYou: (p) => `${p.area ?? `entro ${p.radius}`} intorno a te`,
  otherAdjacentToYouWithinAroundYou: (p) =>
    p.includesCentre === true
      ? `${SPLASH_SIDE[p.hits]} ${p.value}`
      : `altri ${SPLASH_SIDE[p.hits]} ${p.value}`,
  takeDamage4: (p) => `${p.yours}, ${p.reached} subiscono ${damageOf(p.amount, p.type)}`,
  composedYoursReachedText: (p) => `${p.yours}, ${p.reached}: ${lowerFirst(p.text)}`,
  composedBearerIsCasterSaid: (p) =>
    p.bearerIsCaster ? yourCondition(p.said) : ifItWording(p.said),
  composedWhenConditionText: (p) => `${p.when}, ${p.condition}: ${lowerFirst(p.text)}`,
  bearer: (p) => lowerFirst(p.target === "bearer" ? p.bearer : p.text),
  nextAttackSkill: (p) => `prossima abilità d'attacco: ${p.statusName} ${p.durationSeconds}`,
  nextAttackSkill2: (p) => `prossima abilità d'attacco: ${p.text}`,
  skillTargetAroundItsTarget: (p) => (p.at === "skill-target" ? " (intorno al suo bersaglio)" : ""),
  withYourNext: (p) => `con il tuo prossimo uso di ${p.next}${p.around}: ${lowerFirst(p.text)}`,
  costsCostEnergy: (p) => `${p.one ? "costa" : "costano"} ${p.energyBase} Energia`,
  costsCostLessEnergy: (p) =>
    `${p.one ? "costa" : "costano"} ${p.energyPercentOff} Energia in meno`,
  costsCostLessEnergyMinimum: (p) =>
    `${p.one ? "costa" : "costano"} ${p.energyDiscount} Energia in meno (minimo ${p.energyFloor})`,
  costsCostMoreEnergy: (p) => `${p.one ? "costa" : "costano"} ${p.energySurcharge} Energia in più`,
  castsCastInstantly: (p) => (p.one ? "si lancia istantaneamente" : "si lanciano istantaneamente"),
  castsCastFaster: (p) =>
    `${p.one ? "si lancia" : "si lanciano"} ${p.activationMultiplier} più velocemente`,
  takesTakeAsLongToCast: (p) =>
    `${p.one ? "richiede" : "richiedono"} ${p.activationMultiplier}× il tempo di lancio`,
  castsCastFaster2: (p) =>
    `${p.one ? "si lancia" : "si lanciano"} ${p.activationSecondsLess} più velocemente`,
  rechargesRechargeFaster: (p) =>
    `${p.one ? "si ricarica" : "si ricaricano"} ${p.rechargeFaster} più velocemente`,
  rechargesRechargeSlower: (p) =>
    `${p.one ? "si ricarica" : "si ricaricano"} ${p.rechargeSlower} più lentamente`,
  lastsLastLongerShorter: (p) =>
    `${p.one ? "dura" : "durano"} ${p.durationMultiplier} in ${p.durationMultiplier2 > 1 ? "più" : "meno"}`,
  healsHealLessMoreNotTheDivine: (p) =>
    `${p.one ? "cura" : "curano"} ${p.value} in ${p.healMultiplier < 1 ? "meno" : "più"}${p.sparesDivineFavor ? ", escluso il bonus di Favore Divino" : ""}`,
  isAreNotEasilyInterrupted: (p) =>
    p.one ? "non si interrompe facilmente" : "non si interrompono facilmente",
  overcastYouBy: (p) => `ti causano ${p.overcastPerUse} di Sovraccarico`,
  andAttack: (p) =>
    `attacco ${p.chainRoles
      .split(" e ")
      .map((role) => CHAIN_LOOKUP[role] ?? role)
      .join(" e ")}`,
  attackSkillSkill: (p) =>
    p.weapon !== undefined
      ? weaponSkills(p.weapon)
      : p.type === undefined
        ? "abilità"
        : typeName(p.type),
  hexHexesS: (p) => (p.one ? p.kind : plural(p.kind)),
  thatTargetsAFoeThatTargetA: (p) =>
    p.one ? "che prende di mira un nemico" : "che prendono di mira un nemico",
  thatTargetsYouThatTargetYou: (p) => (p.one ? "che prende di mira te" : "che prendono di mira te"),
  halfRanged: () => "a mezza gittata",
  notFlashEnchantments: (p) => (p.notFlash ? " (esclusi gli incantamenti lampo)" : ""),
  whileHoldingAnItem2: (p) => (p.whileHoldingItem ? "mentre tieni un oggetto, " : ""),
  nextNext: (p) => {
    const target = p.whose.includes("bersaglio");
    return p.one
      ? `Il prossimo uso${target ? " del bersaglio" : ""} di`
      : `I prossimi ${p.uses} usi${target ? " del bersaglio" : ""} di`;
  },
  cannotBeInterrupted: () => "non può essere interrotta",
  cannotBeBlocked: () => "non può essere bloccata",
  costsLessEnergy: (p) => `costa ${p.energyDiscount} Energia in meno`,
  castsInstantly: () => "si lancia istantaneamente",
  rechargesInstantly: () => "si ricarica istantaneamente",
  s2: (p) => `${p.value} s`,
  takesSLongerToRecharge: (p) => `impiega ${p.extraRechargeSeconds} in più a ricaricarsi`,
  yourNextAnd: (p) => `il tuo prossimo uso di ${p.NEXT_SKILL_KIND} ${p.does}`,
  youLoseAllEnergyAsItIs: () => "perdi tutta l'Energia al momento del lancio",
  youGainOfItsEnergyCost: (p) => `ottieni ${p.energyGainOfCost} del suo costo in Energia`,
  itRechargesFaster: (p) => `si ricarica del ${p.fraction}% più velocemente`,
  rechargesInstantly2: (p) => `${p.name} si ricarica istantaneamente`,
  forYourNextSkill: () => "per il tuo prossimo uso di abilità",
  ifItIsAAnd: (p) => `se è ${indefinite(p.kind)}, ${p.does}`,
  suffer: (p) => `subiscono ${p.sufferedWhat}`,
  forWord2: (p) => `${p.statusName} per ${p.durationSeconds} (${p.status})`,
  a: (p) => `${aCategory(p.category)} di ${p.owners}`,
  ifItInterruptsASkill: () => "Se interrompe un'abilità",
  ifThatActionWasASpell: () => "Se quell'azione era un incantesimo",
  ifThatActionWasAnAttack: () => "Se quell'azione era un attacco",
  ifItKillsTheTarget: () => "Se uccide il bersaglio",
  ifItResurrects: () => "Se resuscita",
  ifASpiritDiedInThisWay: () => "Se uno spirito è morto in questo modo",
  ifWasRemoved: (p) => `Se è stato rimosso ${aCategory(p.category)}`,
  ifItRemoves: (p) => `Se rimuove ${aCategory(p.category)}`,
  ifTargetIsBelowHealth: (p) => `Se il bersaglio è sotto il ${p.fraction}% di Salute`,
  ifTargetIsAboveHealth: (p) => `Se il bersaglio è sopra il ${p.fraction}% di Salute`,
  ifYouHaveLessThanHealth: (p) => `Se hai meno del ${p.fraction}% di Salute`,
  ifYouHaveLessHealthThanYour: () => "Se hai meno Salute del tuo animale",
  ifYourPetHasLessHealthThan: () => "Se il tuo animale ha meno Salute di te",
  ifItFollowsOffHandAnOff: (p) => `Se segue un attacco ${CHAIN_WORD[p.role]}`,
  ifTargetHas: (p) => `Se il bersaglio ha ${p.filteredCategory}`,
  ifTargetHasOr: (p) => `Se il bersaglio ha ${p.categories}`,
  ifYouHave: (p) => `Se hai ${aCategory(p.category)}`,
  ifYouHaveA: (p) => `Se hai ${aCategory(p.category)} di ${p.name}`,
  other: (p) => (p.excluding === undefined ? "" : "altro "),
  ifYouHaveNo: (p) => `Se non hai ${noneOf(p.category, p.other !== "")}`,
  ifYouHaveNo2: (p) => `Se non hai ${noneOf(p.category, p.other !== "", p.name)}`,
  ifTargetIsCastingASpellOr: (p) =>
    p.orChant === true
      ? "Se il bersaglio sta lanciando un incantesimo o un canto"
      : "Se il bersaglio sta lanciando un incantesimo",
  ifTargetIsUsingASkill: () => "Se il bersaglio sta usando un'abilità",
  ifTargetHasNoOtherHex: (p) => `Se il bersaglio non ha altri malefici di ${p.name}`,
  ifTargetIsNotAdjacentToAny: () => "Se il bersaglio non è adiacente ad alcun alleato",
  ifTargetIsNotNearAnyAllies: () => "Se il bersaglio non è vicino ad alcun alleato",
  ifTargetHasNoAlliesWithin: (p) => `Se il bersaglio non ha alleati entro ${p.radius}`,
  ifTargetIsNearAnyOfYour: () => "Se il bersaglio è vicino a uno dei tuoi alleati",
  ifAnyOfYourAlliesIsWithin: (p) => `Se uno dei tuoi alleati è entro ${p.radius} dal bersaglio`,
  ifTargetIsWithinEarshot: () => "Se il bersaglio è a portata d'orecchio",
  ifTargetIsWithinOfYou: (p) => `Se il bersaglio è entro ${p.radius} da te`,
  ifTargetIsNotMoving: () => "Se il bersaglio non si sta muovendo",
  ifTargetIsKnockedDown: () => "Se il bersaglio è atterrato",
  ifTargetIsMoving: () => "Se il bersaglio si sta muovendo",
  ifTargetIsAFoe: () => "Se il bersaglio è un nemico",
  ifTargetIsMovingFasterThanNormal: () =>
    "Se il bersaglio si sta muovendo più velocemente del normale",
  ifAnyFoeIsKnockedDownIf: (p) =>
    p.knockedDown === true ? `Se un nemico ${p.where} è atterrato` : `Se un nemico è ${p.where}`,
  ifYouHitOrMoreFoes: (p) => `Se colpisci ${p.atLeast} o più nemici`,
  ifNumberOrMore: (p) => `Se ${p.countAll} sono ${p.atLeast} o più`,
  ifAreNoMoreThan: (p) => `Se ${p.countAll} non sono più di ${p.countAll2}`,
  ifTargetHas2: (p) => `Se il bersaglio ha ${p.statusName}`,
  ifTargetDoesNotHave: (p) => `Se il bersaglio non ha ${p.statusName}`,
  ifYouHaveMoreEnergyThanTarget: () => "Se hai più Energia del bersaglio",
  ifYouHaveLessThanEnergy: (p) => `Se hai meno di ${p.amount} Energia`,
  ifYouAreOvercast: () => "Se sei in Sovraccarico",
  ifYouWield: (p) => `Se impugni ${NEEDED_WEAPON[p.weapon]}`,
  ifYouHoldAShield: () => "Se tieni uno scudo",
  ifYouAreHoldingAnItem: () => "Se tieni un oggetto",
  ifTargetHasLessHealthThanYou: () => "Se il bersaglio ha meno Salute di te",
  ifTargetHasMoreHealthThanYou: () => "Se il bersaglio ha più Salute di te",
  ifTargetIsAttacking: () => "Se il bersaglio sta attaccando",
  ifTargetIsNotAttacking: () => "Se il bersaglio non sta attaccando",
  ifTargetIsCastingASpellOr2: () => "Se il bersaglio sta lanciando un incantesimo o attaccando",
  ifTargetIsASummonedCreature: () => "Se il bersaglio è una creatura evocata",
  ifNoSpiritIsWithinOfYou: (p) => `Se nessuno spirito è ${withinYou(p.radius, p.radius2)}`,
  ifASpiritIsWithinOfYou: (p) => `Se uno spirito è ${withinYou(p.radius, p.radius2)}`,
  ifYouControlOrFewerS: (p) => `Se controlli ${p.count} o meno ${plural(p.creature)}`,
  ifASpiritOrACorpseIs: (p) => `Se uno spirito o un cadavere è ${withinYou(p.radius, p.radius2)}`,
  ifAnAllyIsDeadWithin: (p) => `Se un alleato è morto ${within(p.radius, p.radius2)}`,
  ifTargetIsNearACorpseOr: () => "Se il bersaglio è vicino a un cadavere o il suo animale è morto",
  ifTargetIsWithinOfACorpse: (p) =>
    `Se il bersaglio è entro ${p.radius} da un cadavere o il suo animale è morto`,
  composedType: (p) => (p.type === undefined ? "" : typeWord(p.type)),
  healthForEachAllyMax: (p) => `, +${p.amount} Salute per ogni alleato ${p.area} (max ${p.max})`,
  allPartyMembers: () => "Tutti i membri del gruppo",
  allItsPartyMembers: () => "Tutti i membri del suo gruppo",
  allAlliedMinions: () => "Tutti i servitori alleati",
  yourOtherMinions: () => "I tuoi altri servitori",
  within2: (p) => `${p.Who} ${p.area ?? `entro ${p.radius}`}`,
  adjacent: (p) => `${capitalize(p.who)} adiacenti`,
  nearby: (p) => `${capitalize(p.who)} nelle vicinanze`,
  within3: (p) => (p.area === undefined ? `${p.Who} entro ${p.radius}` : `${p.Who} ${p.area}`),
  loseThatSame: (p) => `perdono quello stesso ${CATEGORY[p.category].one}`,
  loseAllAll: (p) => `perdono ${allCategory(p.category)}`,
  onThem: () => "su di loro",
  loseOneForEachOnThem: (p) =>
    `perdono ${indefinite(CATEGORY[p.category].one)} per ogni ${p.countEach}`,
  lose: (p) => `perdono ${p.count} ${categoryNoun(p.count2, p.category)}`,
  enchantmentAnA: (p) =>
    p.onlyBearing !== undefined && CATEGORY[p.onlyBearing].feminine ? "una" : "un",
  with4: (p) => (p.onlyBearing === undefined ? "" : ` con ${aCategory(p.onlyBearing)}`),
  usingSkills: (p) =>
    p.onlyUsing === undefined
      ? ""
      : ` che usano ${p.onlyUsing === "attack" ? "abilità d'attacco" : plural(typeName(p.onlyUsing))}`,
  dead: (p) => (p.dead === true ? `${p.living} morti` : p.living),
  targetAndCasterAroundYouCasterAround: (p) =>
    `${p.includesCentre === true ? `Il bersaglio e ${lowerFirst(p.reached)}` : p.reached}${p.around === "caster" ? " intorno a te" : ""}${p.alsoAround === "caster" ? " intorno al bersaglio e a te" : ""}${p.bearing}${p.using}${p.onlyIf}`,
  upTo3: (p) => `Fino a ${p.maxTargets} ${lowerFirst(p.who)}`,
  inItsRange: () => "nel suo raggio",
  inTheArea: () => "nell'area",
  foes: () => "nemici",
  allEveryoneYouAndAlliesAllies: (p) =>
    p.affects === "all" ? "tutti" : p.includesCaster ? "tu e gli alleati" : "alleati",
  enemiesFoesAllEveryoneYouAndAllies: (p) => `${p.value} ${within(p.radius, p.radius2)}`,
  whenSprung: () => "quando scatta",
  after: (p) => `dopo ${seconds(p.delaySeconds)}`,
  everyFor: (p) => `ogni ${seconds(p.everySeconds)} per ${seconds(p.count)}`,
  whenItEnds: (p) => `Quando termina, ${p.whom}: `,
  springsByItselfAsItsTimeRuns: () => "Scatta da sola allo scadere del tempo",
  composedWhoText: (p) => `${capitalize(p.who)}: ${lowerFirst(p.text)}`,
  composedEndingText: (p) => `${p.ending}${lowerFirst(p.text)}`,
  composedConditionText: (p) => `${p.condition}: ${lowerFirst(p.text)}`,
  itsAttacksDealDamage: (p) => `I suoi attacchi infliggono ${p.magnitude} danni`,
  thisSpiritLosesHealth: (p) => `questo spirito perde ${p.magnitude} Salute`,
  composedCondition: (p) => `${lowerFirst(p.condition)}: `,
  itsAttacks: (p) => `I suoi attacchi: ${p.when}${p.what}`,
  health3: (p) => `${p.health} Salute`,
  health4: (p) => `${p.health} Salute (${p.health2})`,
  level: (p) => `livello ${p.marked}, `,
  lastsSeconds: (p) => `, dura ${p.durationSeconds} secondi`,
  composedCountNameLevelTextHealthTextLasts: (p) =>
    `${p.count} ${p.name} (${p.levelText}${p.healthText}${p.lasts})`,
  itsAttacksDealDamage2: (p) => `I suoi attacchi infliggono ${p.value} danni`,
  onlyOneAtATimeANew: () => "Uno solo alla volta: uno nuovo uccide il precedente",
  leavesCorpseCorpsesWhenItDies: (p) =>
    `Lascia ${p.corpses} ${p.current === 1 ? "cadavere" : "cadaveri"} quando muore`,
  whenItDiesStandsUpInIts: (p) => `Quando muore, ${p.text} si rialza al suo posto`,
  listSemicolon: () => "; ",
  inItsRange2: (p) => AREA_TEXT.get(p.radius) ?? "nel suo raggio",
  composedAffectsWhere: (p) => `${lowerAll(AURA_WHO[p.affects])} ${p.where}`,
  whenItDiesUnderHealthBeginFor: (p) =>
    `Quando muore, ${p.who} sotto ${p.below} di Salute iniziano ${p.statusName} per ${p.duration} secondi`,
  whenItDiesDeadPartyMembersAre: (p) =>
    `Quando muore, i membri del gruppo morti ${p.where} vengono resuscitati con il ${p.health}% di Salute e 0 Energia`,
  damageTakeDamageAreHealedForHealth: (p) =>
    p.effect === "damage" ? `subiscono ${p.amount} danni` : `vengono curati di ${p.amount} Salute`,
  max: (p) => ` (max ${p.max})`,
  whenItDiesPerSecondItLived: (p) =>
    `Quando muore, ${p.who} ${p.what} per ogni secondo di vita${p.max}`,
  everySecondsHealsTheMostHurtNon: (p) =>
    `Ogni ${p.everySeconds} secondi: cura di ${p.heal} Salute l'alleato non spirito più ferito ${p.where}`,
  whenANonSpiritDiesInIts: () => "Quando una creatura non spirito muore nel suo raggio",
  nearby2: (p) => AREA_TEXT.get(p.radius) ?? "nelle vicinanze",
  itsConditionsSpreadToEachNonSpirit: (p) =>
    `${p.when}, le sue condizioni si diffondono a ogni creatura non spirito ${p.where} che ha una condizione`,
  eachOfItsTypeInItsRange: (p) =>
    `${p.when}, ogni creatura del suo tipo nel suo raggio sotto ${p.below} di Salute subisce ${p.damage} danni`,
  holdingAnItem: (p) => (p.onlyWhileHoldingItem ? " che tengono un oggetto" : ""),
  composedWhoWhereHoldingStatus: (p) => `${p.who} ${p.where}${p.holding}: ${p.status}`,
  perFoeHit: (p) => (p.perTarget === undefined ? "" : " per ogni nemico colpito"),
  forEachMeleeAttackSkillOnYour: (p) =>
    ` per ogni abilità d'attacco in mischia sulla tua barra (al massimo ${p.max})`,
  withinEarshot: (p) => (p.radius === AREA_EARSHOT ? "a portata d'orecchio" : p.area),
  forEverySummonedCreatureYouControlMaximum: (p) =>
    ` per ogni creatura evocata che controlli ${p.where} (massimo ${p.max} Energia)`,
  composedZeroAloneEachText: (p) => (p.zero ? `${p.alone} ${p.each}` : `${p.text}, +${p.each}`),
  maximum: (p) => ` (massimo ${p.max})`,
  forEach: (p) => `per ogni ${p.countEach}${p.max}`,
  pointOfEnergyGained: () => "punto di Energia ottenuto",
  pointOfEnergyRestrictedByOvercast: () => "punto di Energia limitato dal Sovraccarico",
  skillDisabledInThisWay: () => "abilità disattivata in questo modo",
  orCasterOnYou: (p) =>
    `${categoryList(p.categories)} ${p.on === "caster" ? "su di te" : p.onTarget}`,
  ofYourRecharging: (p) => `delle tue ${p.rechargingSkillsNoun} in ricarica`,
  pointOfEnergyCasterYouHaveThey: (p) =>
    `punto di Energia che ${p.on === "caster" ? "possiedi" : "possiede"}`,
  orRemoved: (p) => `${categoryList(p.categories)} rimosso`,
  orLost: (p) => `${categoryList(p.categories)} di ${p.name} perso`,
  enchantmentYouAreMaintaining: () => "incantamento che stai mantenendo",
  secondItWasInEffect: () => "secondo in cui è stato attivo",
  foeKnockedDown: () => "nemico atterrato",
  youHaveEquipped: (p) => `${typeName(p.type)} che hai equipaggiato`,
  adrenalineSkillTheyHave: () => "abilità adrenalinica che possiede",
  foeHit: () => "nemico colpito",
  within4: (p) => `${p.perCountNoun} ${within(p.radius, p.radius2)}`,
  attacksSkillsS: (p) =>
    p.weapon !== undefined
      ? `attacchi ${WEAPON_WORD[p.weapon]}`
      : p.type === undefined
        ? "abilità"
        : plural(typeName(p.type)),
  casterYourTargetS: (p) => (p.on === "caster" ? "i tuoi" : "del bersaglio:"),
  s3: (p) => plural(p.perCountNoun),
  pointOfOvercast: () => "punto di Sovraccarico",
  skillDisabled: () => "abilità disattivata",
  rechargingSkill: () => "abilità in ricarica",
  pointOfEnergy: () => "punto di Energia",
  removedOr: (p) => `${categoryList(p.categories)} rimosso`,
  removedOr2: (p) => `${categoryList(p.categories)} di ${p.name} rimosso`,
  maintainedEnchantment: () => "incantamento mantenuto",
  secondHeld: () => "secondo di attivazione",
  adrenalineSkill: () => "abilità adrenalinica",
  deadAlly: () => "alleato morto",
  knockedDownFoeFoe: (p) => (p.knockedDown === true ? "nemico atterrato" : "nemico"),
  ally: () => "alleato",
  neverAbove: (p) => `, mai oltre ${p.upTo}`,
  forEachRemoved: (p) =>
    p.toTarget === true || p.perRemoved === undefined
      ? ""
      : ` per ogni ${CATEGORY[p.perRemoved].one} rimosso`,
  perPointLost: (p) => (p.perEnergyLost === undefined ? "" : " per ogni punto perso"),
  armorPenetration: (p) => ` (${p.armorPenetration}% di penetrazione dell'armatura)`,
  dealsDamage2: (p) => `Infligge ${damageOf(p.magnitude, p.type)}${p.perPointLost}${p.penetration}`,
  deals: () => "Infligge",
  damage2: (p) => ` danni${typeWord(p.type)}`,
  composedCountedConditionAmount: (p) => `${p.counted}; ${lowerFirst(p.condition)}: +${p.amount}`,
  gainHealthEqualToThisSpellS: () =>
    "Ottieni Salute pari al bonus di Favore Divino di questo incantesimo",
  healsIfRelievedOf: (p) => `Cura di ${p.amount} se liberato da ${p.name}`,
  healsForOfYourCurrentHealthMaximum: (p) =>
    `Cura del ${p.magnitude} della tua Salute attuale (massimo ${p.max} Salute)`,
  youGainHealth: (p) => `Ottieni ${p.amount} Salute`,
  yourPetGainsHealth: (p) => `Il tuo animale ottiene ${p.amount} Salute`,
  ownerHealsItsOwnerForHealsFor: (p) =>
    p.recipient === "owner" ? `Cura il suo padrone di ${p.amount}` : `Cura di ${p.amount}`,
  healsForEachRemovedHealsForEach: (p) =>
    p.perRemoved !== undefined
      ? `Cura di ${p.amount} per ogni ${CATEGORY[p.perRemoved].one} rimosso`
      : p.perDestroyedSpirit === true
        ? `Cura di ${p.amount} per ogni spirito distrutto`
        : p.perEnergyLost === true
          ? p.recipient === "caster"
            ? `Vieni curato di ${p.amount} per ogni punto di Energia perso`
            : `Cura di ${p.amount} per ogni punto di Energia perso`
          : p.perUsedSkillEnergy === true
            ? `Cura del ${p.magnitude} del costo in Energia dell'incantesimo`
            : p.value,
  casterYouGainHeals: (p) => (p.recipient === "caster" ? "Ottieni" : "Cura di"),
  health5: () => " Salute",
  casterOnTargetFoeOnThem: (p) =>
    p.recipient === "caster" ? "sul nemico bersaglio" : "su di loro",
  underHealth: (p) => `, sotto il ${p.onlyBelowHealthFraction}% di Salute`,
  gainOfTheSkillSBaseEnergy: (p) =>
    `Ottieni il ${p.magnitude} del costo base in Energia dell'abilità`,
  targetGainsOwnerYouGainGain: (p) => (p.toTarget === true ? "Il bersaglio ottiene" : "Ottieni"),
  energy5: (p) =>
    `${p.gains} ${p.magnitude} Energia${p.perPointLost}${p.perFoeHit}${p.perOwnCreature}${p.perRemoved}`,
  energy6: () => " Energia",
  gain2: () => "Ottieni",
  onTargetFoe: () => "sul nemico bersaglio",
  strikeStrikesOfAdrenalineAdrenaline: (p) =>
    p.units
      ? `${p.magnitude} ${p.current === 1 ? "colpo" : "colpi"} di Adrenalina`
      : `${p.magnitude} Adrenalina`,
  youGain2: () => "Ottieni",
  targetTargetGainsGain: (p) => (p.recipient === "target" ? "Il bersaglio ottiene" : "Ottieni"),
  strikesOfAdrenaline: () => " colpi di Adrenalina",
  targetRegainsAllEnergy: () => "Il bersaglio recupera tutta l'Energia",
  casterYouLoseTargetLoses: (p) => (p.on === "caster" ? "Perdi" : "Il bersaglio perde"),
  energy7: (p) => `${p.who} ${p.magnitude} Energia`,
  stealsUpToEnergy: (p) => `Ruba fino a ${p.magnitude} Energia`,
  stealsUpToHealth: (p) => `Ruba fino a ${p.magnitude} Salute`,
  youStealHealth: (p) => `Rubi ${p.magnitude} Salute`,
  youSacrificeOfYourMaximumHealth: (p) =>
    `Sacrifichi il ${p.percentOfMax}% della tua Salute massima`,
  targetFoeLosesHealth: (p) => `Il nemico bersaglio perde ${p.magnitude} Salute`,
  targetFoeLoses: () => "Il nemico bersaglio perde",
  youLoseHealth: (p) => `Perdi ${p.magnitude} Salute`,
  forEachEnchantmentRemoved: (p) => `${p.lose} per ogni incantamento di ${p.whose} rimosso`,
  loseAllButHealth: (p) => `Perdi tutta la Salute tranne ${p.magnitude}`,
  transferOfYourConditionsToFoes: (p) =>
    `Trasferisci ${p.magnitude} delle tue condizioni a ${p.foesWithin}`,
  max2: (p) => (p.maxSeconds === undefined ? "" : ` (max ${seconds(p.maxSeconds)})`),
  withTheTimeEachHasLeft: () => "con il tempo residuo di ciascuna",
  withMoreTime: (p) => `con il ${p.extend}% di tempo in più${p.max}`,
  foesGetTheTargetSConditionsWith: (p) =>
    `${p.foesWithin} ottengono le condizioni del bersaglio, ${p.value}`,
  loseYourHealthHealForOfIt: (p) =>
    `Perdi ${shareOf(p.fractionOfCurrent, "della tua Salute")}; ti curi del ${p.magnitude}% di essa`,
  whoeverOfYouAndTargetFoeHas: () =>
    "Chi tra te e il nemico bersaglio ha più Salute perde metà della differenza; l'altro ne ottiene altrettanta",
  stacksOnceForEachOnThem: (p) => `. Si accumula una volta per ogni ${p.countEach}`,
  stacksOnceForEachOnThem2: (p) => p.status + p.value,
  forWord3: (p) => `Per ${p.durationSeconds}, ${p.what}`,
  forEachHexRemoved: (p) => ` per ogni maleficio di ${p.name} rimosso)`,
  stackingOnceForEachOnThem: (p) => `, accumulandosi una volta per ogni ${p.countEach}`,
  appliesCasterToYouForUntilIt: (p) =>
    `Applica ${p.statusName}${p.on === "caster" ? " a te" : ""} ` +
    (p.ends ? `per ${p.statusDuration} ` : "finché non termina ") +
    `(${p.status}` +
    p.value +
    p.value2,
  composedStatusNameDurationSeconds: (p) => `${p.statusName} (${p.durationSeconds})`,
  appliesOneOfAtRandom: (p) => `Applica uno a caso tra: ${p.choices}`,
  maintainedCasterOnYouEnergyRegenerationWhile: (p) =>
    `Mantenuto${p.on === "caster" ? " su di te" : ""}: −1 di rigenerazione dell'Energia finché dura. ` +
    `${capitalize(p.what)}.`,
  losesThatSame: (p) => `Perde quello stesso ${CATEGORY[p.category].one}`,
  casterLoseRemoves: (p) => (p.from === "caster" ? "Perdi" : "Rimuove"),
  oneForEachRemovedMax: (p) =>
    `${p.verb} ${indefinite(CATEGORY[p.category].one)} per ogni ${CATEGORY[p.category2].one} rimosso (max ${p.max})`,
  oneForEachOnTarget: (p) =>
    `${p.verb} ${indefinite(CATEGORY[p.category].one)} per ogni ${p.countEach}`,
  lose2: (p) => `Perdi ${p.count} ${categoryNoun(p.count2, p.category)}${ofProfession(p.whose)}`,
  endsTheTargetSStance: () => "Termina la posizione del bersaglio",
  forEachSpiritWithinOfIt: (p) =>
    ` per ogni spirito ${AREA_AROUND_TARGET.get(p.near) ?? `entro ${p.near2} da esso`}`,
  numberUpTo: (p) => (typeof p.count === "number" && p.count > 1 ? "fino a " : ""),
  and4: (p) => (p.orCategory === undefined ? "" : ` e ${categoryNoun(p.count, p.orCategory)}`),
  removes: (p) =>
    `Rimuove ${p.upTo}${p.count} ${categoryNoun(p.count2, p.category)}${ofProfession(p.whose)}${p.and}${p.perSpirit}`,
  interruptsTheTargetSSpellIfThey: () =>
    "Interrompe l'incantesimo del bersaglio, se ne sta lanciando uno",
  interruptsTheTargetSSpellOrChant: () =>
    "Interrompe l'incantesimo o il canto del bersaglio, se ne sta lanciando uno",
  skillInterruptsTheTargetSSkillIf: (p) =>
    p.only === "skill"
      ? "Interrompe l'abilità del bersaglio, se ne sta usando una"
      : "Interrompe l'azione del bersaglio: un'abilità o un attacco",
  youAreKnockedDownFor: (p) => `Vieni atterrato per ${seconds(p.durationSeconds)}`,
  knocksDownFor: (p) => `Atterra per ${seconds(p.durationSeconds)}`,
  shadowStepsToTheTarget: () => "Compie un Passo d'Ombra verso il bersaglio",
  youAndTheTargetShadowStepTo: () =>
    "Tu e il bersaglio compite un Passo d'Ombra l'uno nella posizione dell'altro",
  corpseTeleportsYouToThatCorpseShadow: (p) =>
    p.to === "corpse"
      ? "Ti teletrasporta presso quel cadavere"
      : "Compi un Passo d'Ombra verso un punto vicino, in direzione opposta al tuo bersaglio",
  health6: (p) => `il ${p.percent}% di Salute`,
  upToYourCurrentHealthYourHealth: (p) =>
    p.casterLosesFractionOfCurrent === 0
      ? "fino alla tua Salute attuale"
      : `la tua Salute dopo averne perso ${share(p.casterLosesFractionOfCurrent)}`,
  perPartyMemberWithin: (p) => ` per ogni membro del gruppo ${within(p.radius, p.radius2)}`,
  casterAndTeleportsTheTargetToYou: (p) =>
    p.at === "caster" ? ", e teletrasporta il bersaglio da te" : "",
  returnsTheTargetToLifeWithAnd: (p) =>
    `Riporta in vita il bersaglio con ${p.healthText} e il ${p.energy}% di Energia${p.per}${p.teleport}`,
  returnsEveryDeadAlliedPetToLife: (p) =>
    `Riporta in vita ogni animale alleato morto ${p.where} con il ${p.health}% di Salute`,
  youLoseAllYourRemainingEnergy: () => "Perdi tutta la tua Energia residua",
  youGainFor: (p) => `Ottieni ${p.statusName} per ${seconds(p.durationSeconds)} (${p.status})`,
  yourPetGainsFor: (p) => `Il tuo animale ottiene ${p.statusName} per ${p.duration} (${p.status})`,
  yourPetMovesToYourTargetAnd: () => "Il tuo animale raggiunge il tuo bersaglio e lo attacca",
  teleportsTargetToYou: () => "Teletrasporta il bersaglio da te",
  destroysTargetAlliedSpirit: () => "Distrugge lo spirito alleato bersaglio",
  destroysTargetMinion: () => "Distrugge il servitore bersaglio",
  nearestSpiritLosesHealthTargetAllyIs: (p) =>
    `Lo spirito più vicino perde ${p.magnitude} Salute; l'alleato bersaglio viene curato di ${p.healPerPoint} per punto`,
  nearestSpiritLosesAllEnergyYouGain: (p) =>
    `Lo spirito più vicino perde tutta l'Energia; ne ottieni il ${p.magnitude}%`,
  itsOwnerGainsHealthEqualToThe: () => "Il suo padrone ottiene Salute pari ai danni che infligge",
  destroysEveryAlliedSpiritWithin: (p) =>
    `Distrugge ogni spirito alleato ${within(p.radius, p.radius2)}`,
  thisSkillRecharges: () => "Questa abilità si ricarica",
  secondsFaster: () => " secondi più velocemente",
  thisSkillRechargesInstantly: () => "Questa abilità si ricarica istantaneamente",
  thisSkillRechargesFaster: (p) => `Questa abilità si ricarica del ${p.fraction}% più velocemente`,
  usedSkillThatSkillRechargesInstantlyThis: (p) =>
    p.of === "used-skill"
      ? "Quell'abilità si ricarica istantaneamente"
      : "Questa abilità si ricarica istantaneamente",
  loseAllAdrenaline: () => "Perdi tutta l'Adrenalina",
  rechargesAllYourOtherSkills: () => "Ricarica tutte le tue altre abilità",
  rechargesAllYourStances: () => "Ricarica tutte le tue posizioni",
  rechargesAllYourOtherSkills2: (p) =>
    `Ricarica tutte le tue altre abilità di ${OTHER_SKILLS[p.which] ?? p.which}`,
  rechargesAllYour: (p) => `Ricarica tutte le tue ${p.rechargedKind}`,
  allOfYourSpiritsDie: () => "Tutti i tuoi spiriti muoiono",
  summonsPlusOnePerCorpseExploited: (p) =>
    `Evoca ${p.text}` +
    (p.perExploitedCorpse === true ? ", più uno per ogni cadavere sfruttato" : ""),
  setsATrap: () => "Piazza una trappola",
  pulseTargetCreatesASymbolMarksThe: (p) =>
    p.kind === "pulse"
      ? p.anchor === "target"
        ? "Crea un simbolo"
        : "Marchia il terreno"
      : p.anchor === "corpse"
        ? "Crea un pozzo"
        : "Crea una protezione",
  forSeconds: (p) => `${p.what} ${p.where} per ${p.magnitude} secondi`,
  seconds3: (p) => `${p.magnitude} secondi`,
  forEachSignetYouHaveEquipped: (p) =>
    p.perOwnSignet === true ? " per ogni sigillo che hai equipaggiato" : "",
  allOfTheTargetSSkillsAre: (p) =>
    `Tutte le abilità del bersaglio vengono disattivate per ${p.time}`,
  theTargetSEliteSkillIsDisabled: (p) =>
    `L'abilità élite del bersaglio viene disattivata per ${p.time}`,
  oneOfTheTargetSSpellsAt: (p) =>
    `Uno degli incantesimi del bersaglio, a caso, viene disattivato per ${p.time}`,
  allOfTheTargetSAttackSkills: (p) =>
    `Tutte le abilità d'attacco del bersaglio vengono disattivate per ${p.time}`,
  theInterruptedSkillIsDisabledFor: (p) =>
    `L'abilità interrotta viene disattivata per ${p.time}${p.perSignet}`,
  centreInterruptedHoldingThatSkillHaveIt: (p) =>
    p.which === "centre-interrupted"
      ? `che possiedono quell'abilità se la vedono disattivare per ${p.time}`
      : `Quell'abilità e tutte le abilità dello stesso attributo vengono disattivate per ${p.time}`,
  thisSkillBecomesTheOneYouRemoved: (p) =>
    `Questa abilità diventa quella che hai rimosso per ${p.seconds} secondi`,
  thisSkillBecomesThatRandomSpellSpell: (p) =>
    `Questa abilità diventa ${p.which === "random-spell" ? "quell'incantesimo" : "quell'abilità"} per lo stesso tempo`,
  thisSkillBecomesItsTargetSNon: (p) =>
    `Questa abilità diventa l'abilità élite non di forma del suo bersaglio per ${p.magnitude} secondi`,
  takeControlOfTargetEnemySpirit: () => "Prendi il controllo dello spirito nemico bersaglio",
  becomeYourMinionsWhileYouBear: (p) => `Diventano tuoi servitori finché porti ${p.name}`,
  targetMinionWithAMasterBecomesMasterless: (p) =>
    `Il servitore bersaglio con un padrone resta senza padrone; uno senza padrone diventa tuo e viene curato di ${p.magnitude} Salute`,
  leadCountsAsALeadAttackCounts: (p) =>
    p.role === "lead" ? "Conta come attacco principale" : "Conta come attacco secondario",
  targetSuffersOvercast: (p) => `Il bersaglio subisce ${p.magnitude} di Sovraccarico`,
  thisSkillThisSkillThatSkill: (p) => (p.of === "this-skill" ? "Questa abilità" : "Quell'abilità"),
  forEachRemoved2: (p) =>
    p.perRemoved === undefined ? "" : ` per ogni ${CATEGORY[p.perRemoved].one} rimosso`,
  takesSecondsLongerToRecharge: (p) =>
    `${p.which} impiega ${p.magnitude} secondi in più a ricaricarsi${p.each}`,
  that: (p) => ` ${relative(p.onlyIf)}`,
  ifItStrikesAFoe: (p) => `Se colpisce un nemico${p.whom}: ${lowerFirst(p.text)}`,
  from: (p) => `${p.text} da ${p.from}`,
  takeDamageForEachPointOfEnergy: (p) =>
    `subiscono ${damageOf(p.amount, p.type)}` +
    (p.perEnergyLost === undefined ? "" : " per ogni punto di Energia perso"),
  areInterruptedAreInterruptedIfCasting: (p) =>
    p.only === undefined ? "vengono interrotti" : "vengono interrotti se stanno lanciando",
  areKnockedDownForS: (p) => `vengono atterrati per ${p.durationSeconds} s`,
  foesFoeCreaturesGain: (p) =>
    p.hits === "foes" || p.hits === "foe-creatures" ? p.suffered : `ottengono ${p.sufferedWhat}`,
  gainHealthEqualToThisSpellS2: () =>
    "ottengono Salute pari al bonus di Favore Divino di questo incantesimo",
  gain3: (p) =>
    /^cura di /i.test(p.text)
      ? `vengono curati di ${gainWording(p.text)}`
      : `ottengono ${lowerFirst(p.text)}`,
  gainHealth: (p) => `ottengono ${p.amount} Salute`,
  loseHealth: (p) => `perdono ${p.amount} Salute`,
  youFromEach: (p) => `${stealsWording(p.text)} da ciascuno`,
  transferAllTheirConditionsToYou: () => "trasferisci a te tutte le loro condizioni",
  resurrect: (p) =>
    p.kind === "resurrect"
      ? lowerFirst(p.text).replace(/^riporta in vita il bersaglio/, "vengono riportati in vita")
      : lowerFirst(p.text),
  and5: (p) => (p.length === 0 ? (p.last ?? "") : `${p.parts} e ${p.last2}`),
  perAlliedMinionsOwnMinionsMinionOne: (p) =>
    `; ${lowerFirst(p.text)} per ${p.hits === "allied-minions" || p.hits === "own-minions" ? "servitore" : "ciascuno"}`,
  per: (p) => ` per ogni ${countedNoun(p.perCountNoun)}`,
  damage3: (p) => `${damageOf(p.amount, p.type)}${p.each}`,
  healHealsEnergy: (p) =>
    p.kind === "heal" ? `cura di ${p.amount}${p.each}` : `+${p.amount} Energia${p.each}`,
  drainsEnergy: (p) => `sottrae ${p.magnitude} Energia`,
  stealsEnergy: (p) => `ruba ${p.magnitude} Energia`,
  stealsHealth: (p) => `ruba ${p.magnitude} Salute`,
  resurrectsEnergy: (p) => `resuscita, ${p.energy}% di Energia`,
  resurrectsHealth: (p) => `resuscita, ${p.health}% di Salute`,
  resurrectsPetsHealth: (p) => `resuscita gli animali, ${p.health}% di Salute`,
  healsOfYourHealth: (p) =>
    `cura del ${p.percent}% di ${shareOf(p.fractionOfCurrent, "della tua Salute")}`,
  balancesHealthWithTargetFoe: () => "bilancia la Salute con il nemico bersaglio",
  allUpTo: (p) => (p.current === p.Infinity ? "tutte" : `fino a ${p.moving}`),
  andFoesWithinOfIt: (p) =>
    ` e i nemici ${AREA_AROUND_TARGET.get(p.copyToFoesWithin) ?? `entro ${p.copyToFoesWithin2} da esso`}`,
  withOfTheirRemainingDurations: (p) => ` con il ${p.durationMultiplier}% della durata residua`,
  movesConditionsFromFoesWithinOfIt: (p) =>
    `Sposta ${p.count === "tutte" ? "tutte le" : p.count} condizioni${p.lasting} dai nemici ${AREA_AROUND_TARGET.get(p.foesWithin) ?? `entro ${p.foesWithin2} da esso`} al bersaglio`,
  casterMovesOfYourConditionsToThe: (p) =>
    p.from === "caster"
      ? `Sposta ${p.count === "tutte" ? "tutte le" : `${p.count} delle`} tue condizioni${p.lasting} sul bersaglio${p.copies}`
      : `Sposta ${p.count === "tutte" ? "tutte le" : `${p.count} delle`} condizioni del bersaglio${p.lasting} su di te`,
  youAreHealedForForEach: (p) => `${p.moves}; vieni curato di ${p.magnitude} per ciascuna`,
  areDisabledForSeconds: (p) => `vengono disattivate per ${p.seconds} secondi`,
  allOfYourSkills: (p) => `Tutte le tue abilità ${p.time}`,
  allOfYourOtherSkills: (p) => `Tutte le tue altre abilità ${p.time}`,
  allOfYourOtherNonAttackSkills: (p) => `Tutte le tue altre abilità non d'attacco ${p.time}`,
  allOfYourOtherAttackSkillsYour: (p) =>
    p.exceptWeapon === undefined
      ? `Tutte le tue altre abilità d'attacco ${p.time}`
      : `Le tue abilità d'attacco non ${WEAPON_WORD[p.exceptWeapon]} ${p.time}`,
  allOfYourNonAttackSkills: (p) => `Tutte le tue abilità non d'attacco ${p.time}`,
  s4: (p) => plural(typeName(p.type)),
  yourAnd: (p) => `Tutti i tuoi ${p.types} ${p.time}`,
  allOfYourSpells: (p) =>
    `Tutti i tuoi incantesimi ${p.time.replace(/^vengono disattivate/, "vengono disattivati")}`,
  allOfYourOther: (p) => `Tutte le tue ${p.others ? "altre " : ""}${p.name} ${p.time}`,
  exceptAnd: (p) => (p.length === 0 ? "" : ` tranne ${p.except}`),
  allOfYourNonSkills: (p) => `Tutte le tue abilità non di ${p.name}${p.exceptText} ${p.time}`,
  yourWholeParty: () => "Tutto il tuo gruppo",
  composedAffectsWhere2: (p) => `${AREA_WHO[p.affects]} ${p.where}`,
  radius: (p) => `raggio ${p.radius}`,
  andAroundYou: (p) =>
    `${TARGET_TEXT[p.target]}, e ${lowerAll(AREA_WHO[p.affects])} ${p.where} intorno a te`,
  range: (p) => `gittata ${p.range}`,
  upTo4: (p) => `fino a ${p.maxTargets} ${p.who}`,
  withinOfIt: (p) => AREA_AROUND_TARGET.get(p.radius) ?? `entro ${p.radius2} da esso`,
  and6: (p) => `${TARGET_TEXT[p.target]}, e ${p.count} ${p.where}`,
  rangeRadius: (p) => `gittata ${p.range}, raggio ${p.radius}`,
  free: () => "Gratuita",
  adrenaline: (p) => `${p.amount} Adrenalina`,
  composedAmount: (p) => ` (${p.amount})`,
  energy8: (p) => `${p.cost} Energia${p.base}${p.overcast}`,
  overcast: (p) => `, ${p.overcast} di Sovraccarico`,
  instant: () => "Istantanea",
  composedActivationBase: (p) => (p.activation === p.base ? p.base : `${p.activation} (${p.base})`),
  dealsNoDamage: () => "Non infligge danni",
  dealsOnlyDamageDamage: (p) =>
    p.weaponless
      ? `Infligge solo ${p.bonus} danni${p.damageType}`
      : `+${p.bonus} danni${p.damageType}`,
  damage4: (p) => `${p.condition}: +${p.more} danni`,
  damageOnThem: (p) => `+${p.amount} danni ${p.perCount}`,
  cannotBeBlocked2: () => "Non può essere bloccato",
  cannotBeBlocked3: (p) => `${p.condition}: non può essere bloccato`,
  chanceToMissWithOrLess: (p) =>
    `${p.chance}% di probabilità di mancare con ${p.name} a ${p.rank} o meno`,
  resultsInACriticalHit: () => "Mette a segno un colpo critico",
  resultsInACriticalHit2: (p) => `${p.condition}: mette a segno un colpo critico`,
  hitsUpToAdjacentFoesToo: (p) => `Colpisce anche fino a ${p.cleaveTargets} nemici adiacenti`,
  hitsEveryAdjacentFoe: (p) => `${p.condition}: colpisce ogni nemico adiacente`,
  armorPenetration2: (p) => `${p.armorPenetration}% di penetrazione dell'armatura`,
  ifBlocked: (p) => `Se bloccato: ${lowerFirst(p.text)}`,
  onACriticalHit: (p) => `Con un colpo critico: ${lowerFirst(p.text)}`,
  ifItFailsToHit: (p) => `Se non colpisce: ${lowerFirst(p.text)}`,
  asItIsUsed: (p) => `Quando viene usata: ${lowerFirst(p.text)}`,
  allYourPreparationsAreRemoved: () => "Tutte le tue preparazioni vengono rimosse",
  fliesAsFast: (p) => `Vola ${p.multiplier}× più veloce`,
  fliesAsFast2: (p) => `${p.condition}: vola ${p.multiplier}× più veloce`,
  only: (p) => `; ${lowerAll(p.condition)}, solo 1`,
  eachDealingLessDamage: (p) => `, ognuna infligge il ${p.value}% di danni in meno`,
  strikesTwice: () => "Colpisce due volte",
  strikesTimes: (p) => `Colpisce ${p.count} volte`,
  shootsArrowsAtOnce: (p) => `Scocca ${p.count} frecce insieme${p.weaker}${p.fewer}`,
  whileActivating: (p) => `Durante l'attivazione: ${p.status}`,
  easilyInterrupted: () => "Facilmente interrompibile",
  failureChanceWithOrLess: (p) =>
    `${p.chance}% di probabilità di fallimento con ${p.name} a ${p.rank} o meno`,
  activatesFasterSlower: (p) =>
    `${p.condition}: si attiva del ${p.value}% più ${p.multiplier < 1 ? "velocemente" : "lentamente"}`,
  healthGainFromDivineFavorIsDoubled: () => "La Salute ottenuta dal Favore Divino è raddoppiata",
  projectilesEachCanBeDodged: (p) => `${p.shots} proiettili: ognuno può essere schivato`,
  aProjectileAtEachFoeEachCan: (p) =>
    p.spread === true
      ? "Un proiettile per ogni nemico: ognuno può essere schivato"
      : "Proiettile: può essere schivato",
  halfTheNormalRange: () => "Metà della gittata normale",
  orSacrificesHealthIfNoneIsNear: (p) =>
    `, oppure sacrifica il ${p.elseSacrificePercent}% di Salute se non ce n'è uno vicino`,
  targetExploitsTheCorpseNearestYourTarget: (p) =>
    (p.near === "target"
      ? "Sfrutta il cadavere più vicino al tuo bersaglio"
      : p.all === true
        ? `Sfrutta ogni cadavere fresco ${within(p.radius, p.radius2)}`
        : p.pick === "random"
          ? "Sfrutta un cadavere a caso"
          : "Sfrutta il cadavere più vicino") + p.value,
  whileOnYourBarAHealthFights: (p) =>
    `Finché è sulla tua barra, ${p.name} (${p.companionHealth} Salute) combatte al tuo fianco`,
  disabledForAfterUse: (p) => `Disattivata per ${seconds(p.disabledAfterUseSeconds)} dopo l'uso`,
  takeAllConditionsFromYourAlliesWith: () =>
    "Prendi tutte le condizioni dei tuoi alleati, con il tempo residuo di ciascuna",
  hitOrMiss: (p) => `${p.text}, che colpisca o manchi`,
  eliteFlash: (p) => {
    const type = TYPE_TEXT[p.type].replace(/\.$/, "");
    return `${type}${p.flash ? " lampo" : ""}${p.elite ? " élite" : ""}.`;
  },
  moraleBoost: (p) =>
    p.rechargesOnMoraleBoost === true ? "Aumento del morale" : seconds(p.rechargeSeconds),
  hexHexesS2: (p) => plural(p.kind),
} satisfies DescribeWords as DescribeWords;

function damageWeapon(type: DamageKind): string {
  const word = DAMAGE_WORD[type];
  return word.startsWith("da ") ? word : `che infligge danni ${word}`;
}

function armorAgainst(text: string): string {
  if (!text.endsWith(" armatura")) {
    return text;
  }
  const words = text.slice(0, -" armatura".length).split(" ");
  const types: string[] = [];
  while (words.length > 1 && DAMAGE_LOOKUP[words[words.length - 1] ?? ""] !== undefined) {
    types.unshift(damageNoun(words.pop() ?? ""));
  }
  return types.length === 0 ? text : `${words.join(" ")} armatura contro i ${types.join(" e i ")}`;
}

function allCategory(category: Category): string {
  const { many, feminine } = CATEGORY[category];
  return `tutt${feminine ? "e le" : "i i"} ${many}`;
}

/** "all foes": "tutti i nemici", or the side as it is when it already has its article. */
function allSide(side: string): string {
  return side.startsWith("i ") || side.startsWith("le ") ? side : `i ${side}`;
}

function withinYou(radius: number, shown: string): string {
  return AREA_TEXT.get(radius) ?? `entro ${shown} da te`;
}

/** The describe.ts `whose` is "Mesmer " or "": " di Mesmer" after the noun. */
function ofProfession(whose: string): string {
  return whose === "" ? "" : ` di ${whose.trim()}`;
}
