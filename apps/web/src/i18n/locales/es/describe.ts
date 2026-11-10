import { AREA_EARSHOT, EN_WORDS } from "@vibewars/game-core";
import type { DescribeWords } from "@vibewars/game-core";

type Weapon = keyof DescribeWords["neededWeapon"];
type Category = Parameters<DescribeWords["aCategory"]>[0];
type Damage = Parameters<DescribeWords["typeWord"]>[0];
type SkillKind = keyof DescribeWords["typeText"];
type Role = keyof DescribeWords["chainRoleText"];

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** "la mitad de el daño" as Spanish contracts it. */
function contract(text: string): string {
  return text.replaceAll(" de el ", " del ");
}

/** A noun in the plural. */
function plural(word: string): string {
  if (word.endsWith("ón")) {
    return `${word.slice(0, -2)}ones`;
  }
  if (word.endsWith("z")) {
    return `${word.slice(0, -1)}ces`;
  }
  return /[aeiouáéó]$/.test(word) ? `${word}s` : `${word}es`;
}

/** A noun phrase in the plural: its first word carries it. */
function pluralFirst(phrase: string): string {
  const [first = "", ...rest] = phrase.split(" ");
  return [plural(first), ...rest].join(" ");
}

const CATEGORY: Record<Category, readonly [string, string, "un" | "una"]> = {
  condition: ["condición", "condiciones", "una"],
  hex: ["maleficio", "maleficios", "un"],
  enchantment: ["encantamiento", "encantamientos", "un"],
  stance: ["postura", "posturas", "una"],
  preparation: ["preparación", "preparaciones", "una"],
  glyph: ["glifo", "glifos", "un"],
  shout: ["grito", "gritos", "un"],
  chant: ["cántico", "cánticos", "un"],
  echo: ["eco", "ecos", "un"],
  "weapon-spell": ["hechizo de arma", "hechizos de arma", "un"],
  item: ["objeto", "objetos", "un"],
  form: ["forma", "formas", "una"],
  "skill-effect": ["efecto de habilidad", "efectos de habilidad", "un"],
  environment: ["efecto ambiental", "efectos ambientales", "un"],
};

function isCategory(word: string): word is Category {
  return word in CATEGORY;
}

/** Status categories the caller joined as their ids, in Spanish. */
function categoryWords(text: string): string {
  return text.replace(/[a-z]+(?:-[a-z]+)?/g, (word) =>
    isCategory(word) ? CATEGORY[word][0] : word,
  );
}

function one(category: Category): string {
  return CATEGORY[category][0];
}

function aCategory(category: Category): string {
  return `${CATEGORY[category][2]} ${CATEGORY[category][0]}`;
}

function categoryNoun(count: number | "all", category: Category): string {
  return CATEGORY[category][count === 1 ? 0 : 1];
}

/** "Ningún maleficio", "ninguna condición": `other` agrees with the noun. */
function noneOf(other: string, category: Category): string {
  const feminine = CATEGORY[category][2] === "una";
  const said = feminine ? other.replace("otro ", "otra ") : other;
  return `${feminine ? "ninguna" : "ningún"} ${said}${one(category)}`;
}

const DAMAGE: Record<Damage, string> = {
  slashing: "cortante",
  piercing: "perforante",
  blunt: "contundente",
  fire: "de fuego",
  cold: "de frío",
  lightning: "de rayo",
  earth: "de tierra",
  chaos: "de caos",
  dark: "de oscuridad",
  holy: "sagrado",
  shadow: "de sombra",
  typeless: "",
};

function typeWord(type: Damage): string {
  return type === "typeless" ? "" : ` ${DAMAGE[type]}`;
}

/** A damage type or the two families, after "daño". */
function damageKind(type: Damage | "elemental" | "physical"): string {
  if (type === "elemental") {
    return " elemental";
  }
  return type === "physical" ? " físico" : typeWord(type);
}

function damaged(amount: string, type: Damage): string {
  return `${amount} de daño${typeWord(type)}`;
}

const TYPE_NAME: Record<SkillKind, string> = {
  attack: "ataque",
  spell: "hechizo",
  enchantment: "hechizo de encantamiento",
  hex: "hechizo de maleficio",
  signet: "sello",
  shout: "grito",
  stance: "postura",
  preparation: "preparación",
  glyph: "glifo",
  chant: "cántico",
  echo: "eco",
  "weapon-spell": "hechizo de arma",
  "nature-ritual": "ritual de la naturaleza",
  "binding-ritual": "ritual de ligadura",
  ward: "hechizo de custodia",
  well: "hechizo de pozo",
  "item-spell": "hechizo de objeto",
  trap: "trampa",
  "pet-attack": "ataque de mascota",
  form: "forma",
  skill: "habilidad",
};

const FEMININE_NOUN = /^(?:postura|preparación|trampa|forma|habilidad|condición)\b/;

/** "un hechizo", "una trampa". */
function article(noun: string): string {
  return `${FEMININE_NOUN.test(noun) ? "una" : "un"} ${noun}`;
}

/** "el ataque", "la habilidad de ataque". */
function definite(noun: string): string {
  return `${FEMININE_NOUN.test(noun) ? "la" : "el"} ${noun}`;
}

function isSkillKind(word: string): word is SkillKind {
  return word in TYPE_NAME;
}

/** A skill type the caller holds as its id, or a word already Spanish. */
function skillTypeWord(word: string): string {
  return isSkillKind(word) ? TYPE_NAME[word] : word;
}

const SPELL_NOUNS = Object.values(TYPE_NAME).sort((a, b) => b.length - a.length);

/**
 * "Mesmer Magia de fuego hechizo" in Spanish order: the noun first, the
 * names after it, each with its "de".
 */
function namedNoun(words: string): string {
  const noun = SPELL_NOUNS.find((each) => words === each || words.endsWith(` ${each}`));
  if (noun === undefined) {
    return words;
  }
  const names = words.slice(0, words.length - noun.length).trim();
  if (names === "") {
    return noun;
  }
  return names === "elemental" ? `${noun} elemental` : `${noun} de ${scopeWord(names)}`;
}

const NOT = "\u0003";
const ELITE = "\u0004";
const ADRENAL = "\u0005";

/** The words of a used skill, gathered in the caller's order, in Spanish order. */
function usedSkill(words: string): string {
  let body = words.replace(/\s*habilidad$/, "");
  const not = new RegExp(`${NOT}([^${NOT}]*)${NOT}`).exec(body)?.[1];
  body = body.replace(new RegExp(`${NOT}[^${NOT}]*${NOT}`), "");
  const elite = body.includes(ELITE);
  const adrenal = body.includes(ADRENAL);
  const names = body.replaceAll(ELITE, "").replaceAll(ADRENAL, "").replace(/\s+/g, " ").trim();
  return [
    "habilidad",
    ...(elite ? ["de élite"] : []),
    ...(adrenal ? ["de adrenalina"] : []),
    ...(names === "" ? [] : [names === "elemental" ? names : `de ${scopeWord(names)}`]),
    ...(not === undefined ? [] : [`que no sea de ${not}`]),
  ].join(" ");
}

const NEEDED_WEAPON: Record<Weapon, string> = {
  axe: "un hacha",
  sword: "una espada",
  hammer: "un martillo",
  daggers: "dagas",
  scythe: "una guadaña",
  spear: "una lanza",
  bow: "un arco",
  melee: "un arma cuerpo a cuerpo",
};

const WEAPON_WORD: Record<Weapon, string> = {
  axe: "de hacha",
  sword: "de espada",
  hammer: "de martillo",
  daggers: "de daga",
  scythe: "de guadaña",
  spear: "de lanza",
  bow: "de arco",
  melee: "cuerpo a cuerpo",
};

const ROLE_WORD: Record<Role, string> = {
  lead: "principal",
  "off-hand": "secundario",
  dual: "doble",
};

const AREA_WORDS: Readonly<Record<string, string>> = {
  adjacent: "adyacentes",
  nearby: "cercanos",
  "in the area": "en la zona",
  "in earshot": "al alcance de la voz",
  "in compass range": "al alcance de la brújula",
};

const AROUND_CREATED_WORDS: Readonly<Record<string, string>> = {
  "adjacent to that creature": "adyacentes a esa criatura",
  "near that creature": "cerca de esa criatura",
  "in earshot of that creature": "al alcance de la voz de esa criatura",
};

const AROUND_TARGET_WORDS: Readonly<Record<string, string>> = {
  "adjacent to it": "adyacentes a él",
  "nearby it": "cerca de él",
  "in the area around it": "en la zona a su alrededor",
  "in earshot of it": "al alcance de su voz",
};

const NEAR_YOU_WORDS: Readonly<Record<string, string>> = {
  adjacent: "adyacente a ti",
  nearby: "cerca de ti",
  "in the area": "en tu zona",
  "in earshot": "al alcance de tu voz",
  "in compass range": "al alcance de tu brújula",
};

/** A radius table in Spanish, on the radii English keys it by. */
function radii(
  table: ReadonlyMap<number, string>,
  words: Readonly<Record<string, string>>,
): ReadonlyMap<number, string> {
  return new Map([...table].map(([radius, english]) => [radius, words[english] ?? english]));
}

const AREA_TEXT = radii(EN_WORDS.areaText, AREA_WORDS);
const AREA_AROUND_TARGET = radii(EN_WORDS.areaAroundTarget, AROUND_TARGET_WORDS);
const AREA_AROUND_CREATED = radii(EN_WORDS.areaAroundCreated, AROUND_CREATED_WORDS);
const NEAR_YOU = radii(EN_WORDS.areaText, NEAR_YOU_WORDS);

function within(distance: string): string {
  return `a ${distance} o menos`;
}

function area(radius: number, distance: string): string {
  return AREA_TEXT.get(radius) ?? within(distance);
}

function nearYou(radius: number, distance: string): string {
  return NEAR_YOU.get(radius) ?? `${within(distance)} de ti`;
}

function aroundIt(radius: number, distance: string): string {
  return AREA_AROUND_TARGET.get(radius) ?? `${within(distance)} de él`;
}

function seconds(value: number): string {
  const said = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
  return `${said} s`;
}

function share(fraction: number): string {
  return fraction === 0.5 ? "la mitad de" : `${String(Math.round(fraction * 100))} % de`;
}

function damageTaken(multiplier: number): string {
  if (multiplier === 2) {
    return "el doble de";
  }
  if (multiplier === 0.5) {
    return "la mitad de";
  }
  return `${String(Math.round(multiplier * 100))} % de`;
}

const SECOND_PERSON: Readonly<Record<string, string>> = {
  lanza: "lanzas",
  ataca: "atacas",
  usa: "usas",
  aplica: "aplicas",
  golpea: "golpeas",
  falla: "fallas",
  realiza: "realizas",
  recibe: "recibes",
  es: "eres",
  ve: "ves",
  bloquea: "bloqueas",
  sacrifica: "sacrificas",
  gana: "ganas",
  pierde: "pierdes",
  crea: "creas",
  se: "te",
  cae: "caes",
  muere: "mueres",
  termina: "terminas",
  expira: "expiras",
  tiene: "tienes",
  está: "estás",
};

/** A third-person trigger phrase said to its holder. */
function secondPerson(phrase: string): string {
  const [verb = "", ...rest] = phrase.split(" ");
  const said = [SECOND_PERSON[verb] ?? verb, ...rest].join(" ");
  return said
    .replace(/^te queda sin /, "te quedas sin ")
    .replace(/\bsu salud\b/, "tu salud")
    .replace(/\bsobre sí$/, "sobre ti");
}

const SUBJUNCTIVE: Readonly<Record<string, string>> = {
  lanza: "lance",
  lanzas: "lances",
  ataca: "ataque",
  atacas: "ataques",
  usa: "use",
  usas: "uses",
  aplica: "aplique",
  aplicas: "apliques",
  golpea: "golpee",
  golpeas: "golpees",
  falla: "falle",
  fallas: "falles",
  realiza: "realice",
  realizas: "realices",
  recibe: "reciba",
  recibes: "recibas",
  es: "sea",
  eres: "seas",
  ve: "vea",
  ves: "veas",
  bloquea: "bloquee",
  bloqueas: "bloquees",
  sacrifica: "sacrifique",
  sacrificas: "sacrifiques",
  gana: "gane",
  ganas: "ganes",
  pierde: "pierda",
  pierdes: "pierdas",
  crea: "cree",
  creas: "crees",
  cae: "caiga",
  caes: "caigas",
  muere: "muera",
  mueres: "mueras",
  tiene: "tenga",
  tienes: "tengas",
  está: "esté",
  estás: "estés",
};

/** A trigger phrase after "la próxima vez que", which takes the subjunctive. */
function subjunctive(phrase: string): string {
  const [verb = "", ...rest] = phrase.split(" ");
  return [SUBJUNCTIVE[verb] ?? verb, ...rest].join(" ");
}

const CONDITION_VERB =
  /(?<!\p{L})(?:tiene|tienes|está|estás|es|eres|empuñas|sostienes|controlas|golpeas|sigue|hay|son|suman|superan|elimina|interrumpe|resucita|mata|murió|fue)(?!\p{L})/u;

/** An "if" said the other way round: "no" before its first verb. */
function negatedText(text: string): string {
  if (/^Si (.*\b)?(?:tiene|tienes) menos de /.test(text)) {
    return text.replace(/(tiene|tienes) menos de /, "$1 al menos ");
  }
  if (text.startsWith("Si no hay ningún ")) {
    return text.replace("Si no hay ningún ", "Si hay algún ");
  }
  if (text.startsWith("Si ningún ")) {
    return text.replace("Si ningún ", "Si algún ");
  }
  if (text.startsWith("Si algún ")) {
    return text.replace("Si algún ", "Si ningún ");
  }
  const verb = CONDITION_VERB.exec(text);
  if (verb === null) {
    return `Salvo ${lowerFirst(text)}`;
  }
  const reflexive = text.slice(0, verb.index).endsWith("se ") ? 3 : 0;
  const before = text.slice(0, verb.index - reflexive);
  if (reflexive === 3) {
    return before.endsWith("no ")
      ? `${before.slice(0, -3)}se ${text.slice(verb.index)}`
      : `${before}no se ${text.slice(verb.index)}`;
  }
  return before.endsWith("no ")
    ? `${before.slice(0, -3)}${text.slice(verb.index)}`
    : `${before}no ${text.slice(verb.index)}`;
}

/** A condition on the target, said of "you". */
function yourCondition(text: string): string {
  return text
    .replace(/^Si el objetivo (no )?está /, "Si $1estás ")
    .replace(/^Si el objetivo (no )?tiene /, "Si $1tienes ")
    .replace(/^Si el objetivo (no )?es /, "Si $1eres ")
    .replace(/^Si el objetivo /, "Si ");
}

function ifItWording(text: string): string {
  return text.replace(/^Si el objetivo /, "Si ");
}

/** A condition said of those a splash reaches, in the plural. */
function onlyIfWording(text: string): string {
  return lowerFirst(text)
    .replace(/^si el objetivo (no )?está /, "$1están ")
    .replace(/^si el objetivo (no )?tiene /, "$1tienen ")
    .replace(/^si el objetivo (no )?es /, "$1son ")
    .replace(/^si el objetivo /, "")
    .replaceAll(" o el objetivo está ", " o están ")
    .replaceAll(" o el objetivo tiene ", " o tienen ");
}

function splashOnlyClause(condition: string): string {
  if (condition === "") {
    return "";
  }
  return condition.startsWith("si ") ? ` ${condition}` : ` que ${condition}`;
}

function eachOfWording(reached: string, condition: string): string {
  if (condition === "") {
    return reached;
  }
  return `cada uno de ${reached}${splashOnlyClause(condition)}`;
}

function requirementLine(text: string): string {
  return lowerFirst(text).replace(/\.$/, "");
}

function joinConditions(texts: readonly string[], empty: string, word: string): string {
  const [first, ...rest] = texts;
  return [first ?? empty, ...rest.map((text) => text.replace(/^Si /, ""))].join(word);
}

/** "de tu objetivo" follows the noun; "tus" goes before it. */
function counted(count: string, whose: string, noun: string): string {
  return whose.trim() === "del objetivo"
    ? `${count} ${noun} del objetivo`
    : `${count} ${whose}${noun}`;
}

const wielding = (weapon: Weapon | undefined): string =>
  weapon === undefined ? "" : ` mientras empuñas ${NEEDED_WEAPON[weapon]}`;

const attacksWith = (weapon: Weapon | undefined): string =>
  weapon === undefined ? "ataques" : `ataques ${WEAPON_WORD[weapon]}`;

/** "+30 fire armadura" as Spanish says it: the kind after the noun. */
function armorPhrase(text: string): string {
  return text.replace(
    /(\S+) (física|elemental|slashing|piercing|blunt|fire|cold|lightning|earth|chaos|dark|holy|shadow) armadura$/,
    (_, amount: string, kind: string) => {
      const word = kind in DAMAGE ? DAMAGE[kind as Damage].replace("sagrado", "sagrada") : kind;
      return `${amount} de armadura ${word.replace("cortante", "contra daño cortante")}`;
    },
  );
}

const TRIGGER_WHEN: DescribeWords["triggerWhen"] = {
  "bearer-casts-spell": "lanza un hechizo",
  "bearer-attacks": "ataca",
  "bearer-attack-begins": "ataca",
  "bearer-uses-skill": "usa una habilidad",
  "bearer-applies-hex": "aplica un maleficio",
  "bearer-hits": "golpea con un ataque",
  "bearer-fails-to-hit": "falla un golpe",
  "bearer-takes-physical-damage": "recibe daño físico",
  "bearer-takes-elemental-damage": "recibe daño elemental",
  "bearer-takes-damage": "recibe daño",
  "bearer-takes-damage-from-foe": "recibe daño o robo de vida de un enemigo",
  "bearer-health-drops-below": "ve su salud reducida por debajo de un límite por daño",
  "bearer-fatal-damage-negated": "ve negado un daño mortal",
  "bearer-hit-by-attack": "recibe el golpe del ataque de un enemigo",
  "bearer-targeted-by-foe": "es objetivo de un hechizo o ataque enemigo",
  "bearer-healed-by-skill": "es curado por una habilidad",
  "bearer-blocks-melee": "bloquea un ataque cuerpo a cuerpo",
  "bearer-blocks-projectile": "bloquea un ataque de proyectil",
  "bearer-blocks": "bloquea",
  "bearer-interrupted": "es interrumpido",
  "bearer-knocked-down": "es derribado",
  "bearer-sacrifices-health": "sacrifica salud",
  "bearer-knockdown-prevented": "ve evitado un derribo",
  "bearer-gains-hex-or-enchantment": "gana un maleficio o un encantamiento",
  "bearer-gains-enchantment": "gana un encantamiento",
  "bearer-loses-enchantment": "pierde un encantamiento",
  "bearer-loses-condition": "pierde una condición",
  "bearer-creates-creature": "crea una criatura",
  "bearer-gains-condition": "gana una condición nueva",
  "bearer-chant-or-shout-ends": "ve terminar un cántico o un grito sobre sí",
  "bearer-energy-empty": "se queda sin energía",
  "bearer-energy-drops-empty": "cae a 0 de energía",
  "source-targets-bearer": "es objetivo de tu habilidad",
  "source-bearer-apart": "está lejos de ti",
  "bearer-dies": "muere",
  ends: "termina",
  "ends-early": "termina antes de tiempo",
  expires: "expira",
};

function triggerText(event: keyof DescribeWords["triggerWhen"]): string {
  return TRIGGER_WHEN[event];
}

const SPLASH_SIDE: DescribeWords["splashSide"] = {
  foes: "enemigos",
  "foe-creatures": "criaturas enemigas",
  "foe-minions": "esbirros enemigos",
  allies: "aliados",
  "non-spirit-allies": "aliados no espíritu",
  party: "miembros del grupo",
  "own-spirits": "tus espíritus",
  "own-minions": "tus otros esbirros",
  "allied-minions": "esbirros aliados",
};

function sideText(side: keyof DescribeWords["splashSide"]): string {
  return SPLASH_SIDE[side];
}

const TARGET_WORDS: DescribeWords["targetText"] = {
  self: "Uno mismo",
  "single-enemy": "Un enemigo",
  "single-ally": "Un aliado",
  "single-other-ally": "Otro aliado",
  "single-any": "Cualquier objetivo",
  "single-dead-ally": "Un aliado muerto",
  "allied-spirit": "Un espíritu aliado",
  "enemy-spirit": "Un espíritu enemigo",
  "enemy-minion": "Un esbirro enemigo",
  "own-minion": "Uno de tus esbirros",
  "allied-minion": "Un esbirro aliado",
  "allied-summoned-creature": "Una criatura invocada aliada",
  "single-ally-not-spirit": "Un aliado que no sea un espíritu",
  companion: "Tu mascota",
  "living-companion": "Tu mascota viva",
};

/** A scope the caller holds as its id, after "de". */
function scopeWord(scope: string): string {
  return scope === "primary" ? "atributo principal" : scope;
}

/** Chain roles the caller joined as their ids. */
function roleWords(text: string): string {
  return text.replace(/off-hand|lead|dual/g, (role) => ROLE_WORD[role as Role]);
}

/** An area said of one thing: "adyacente", not "adyacentes". */
function singularArea(where: string): string {
  return where.replace(/^adyacentes\b/, "adyacente").replace(/^cercanos\b/, "cercano");
}

/** A count's whole, "del objetivo maleficios" put in Spanish order. */
function countAllText(text: string): string {
  const owned = /^del objetivo (.+)$/.exec(text);
  return owned === null ? text : `los ${owned[1] ?? ""} del objetivo`;
}

const OTHER_SKILLS: Readonly<Record<string, string>> = { attack: "ataque", signet: "sello" };
const kindWord = (kind: string): string => {
  const raw = kind.trim();
  return raw in DAMAGE ? ` ${DAMAGE[raw as keyof typeof DAMAGE]}` : kind;
};
const COUNTED: Readonly<Record<string, string>> = {
  enchantment: "encantamiento",
  hex: "maleficio",
  condition: "condición",
};
const countedNoun = (text: string): string =>
  text.replace(/\b(enchantment|hex|condition)\b/g, (word) => COUNTED[word] ?? word);

export default {
  capitalize,
  lowerAll: (text) => text.toLowerCase(),
  spaced: skillTypeWord,
  typeName: (type) => TYPE_NAME[type],
  typeFirstWord: (type) => TYPE_NAME[type].split(" ")[0] ?? "",
  blockAnswerWording: (text) =>
    text.replace(/^la próxima vez que (?:bloquees|bloquee) (un|una) /, "si es $1 "),
  loseWording: (text, fromSource, bearerIsFoe) =>
    text
      .replace(/^El enemigo objetivo pierde/, fromSource || !bearerIsFoe ? "pierdes" : "pierde")
      .replace(/energía que tiene/, "energía que tienes"),
  bearerWording: (text, bearerIsCaster) =>
    text
      .replace(/^El objetivo gana/, "gana")
      .replace(/^El objetivo pierde/, bearerIsCaster ? "pierdes" : "pierde"),
  ifItWording,
  gainWording: (text) => lowerFirst(text).replace(/^cura (?:para )?/, ""),
  loseTargetWording: (text) => lowerFirst(text).replace(/^el objetivo pierde/, "pierden"),
  stealsWording: (text) => lowerFirst(text).replace(/^roba /, "robas "),
  returnedWording: (text) =>
    lowerFirst(text).replace(/^devuelve la vida al objetivo/, "vuelven a la vida"),
  yourMinionsWording: (text) => text.replace(/^Tus otros esbirros/, "Tus esbirros"),
  onlyIfWording,
  splashOnlyClause,
  eachOfWording,
  requiresWording: (text) => text.replace(/^Si /, "Solo si "),
  requirementWording: (text) =>
    text.startsWith("Si ") ? `solo ${lowerFirst(text)}` : lowerFirst(text),
  requirementLine,
  anyOfWording: (texts) => joinConditions(texts, "Nunca", " o "),
  allOfWording: (texts) => joinConditions(texts, "Siempre", " y "),
  seconds,
  blockedAttacks: {
    all: "ataques",
    melee: "ataques cuerpo a cuerpo",
    projectile: "proyectiles",
  },
  blockedAttack: {
    all: "ataque",
    melee: "ataque cuerpo a cuerpo",
    projectile: "proyectil",
  },
  damageTaken,
  triggerWhen: TRIGGER_WHEN,
  secondPerson,
  arrowsWhen: { "bearer-hits": "impactan", "bearer-fails-to-hit": "fallan" },
  chantOrShoutEnds: "cada vez que termina un cántico o un grito sobre él",
  energyEmpty: "si su energía llega a 0",
  dropped: "efecto al soltarlo",
  targetsWords: { ally: "un aliado", "other-ally": "otro aliado", foe: "un enemigo" },
  nextSkill: "la próxima vez que use una habilidad",
  yourNextSkill: "la próxima vez que uses una habilidad",
  creates: "cada vez que creas una criatura",
  areaAroundCreated: AREA_AROUND_CREATED,
  nextSkillKind: {
    "attack-skill": ["habilidad de ataque", "habilidades de ataque"],
    spell: ["hechizo", "hechizos"],
    hex: ["maleficio", "maleficios"],
    signet: ["sello", "sellos"],
    "signet-at-foe": ["sello que apunta a un enemigo", "sellos que apuntan a un enemigo"],
    "shout-or-chant": ["grito o cántico", "gritos o cánticos"],
    any: ["habilidad", "habilidades"],
  },
  lowerFirst,
  aCategory,
  negatedText,
  yourCondition,
  typeWord,
  splashSide: SPLASH_SIDE,
  auraWho: {
    all: "Criaturas no espíritu",
    allies: "Aliados no espíritu",
    foes: "Enemigos no espíritu",
  },
  groundAnchorText: {
    caster: "en tu posición",
    corpse: "en su posición",
    target: "en la posición de tu objetivo",
  },
  share,
  categoryNoun,
  weaponText: {
    axe: "Ataque de hacha",
    sword: "Ataque de espada",
    hammer: "Ataque de martillo",
    daggers: "Ataque de daga",
    scythe: "Ataque de guadaña",
    spear: "Ataque de lanza",
    bow: "Ataque de arco",
    melee: "Ataque cuerpo a cuerpo",
  },
  chainRoleText: {
    lead: "Ataque principal.",
    "off-hand": "Ataque secundario.",
    dual: "Ataque doble.",
  },
  followsText: {
    lead: "Debe seguir a un ataque principal.",
    "off-hand": "Debe seguir a un ataque secundario.",
    dual: "Debe seguir a un ataque doble.",
  },
  neededWeapon: NEEDED_WEAPON,
  weaponWord: WEAPON_WORD,
  typeText: {
    attack: "Ataque.",
    spell: "Hechizo.",
    enchantment: "Hechizo de encantamiento.",
    hex: "Hechizo de maleficio.",
    signet: "Sello.",
    shout: "Grito.",
    stance: "Postura.",
    preparation: "Preparación.",
    glyph: "Glifo.",
    chant: "Cántico.",
    echo: "Eco.",
    "weapon-spell": "Hechizo de arma.",
    "nature-ritual": "Ritual de la naturaleza.",
    "binding-ritual": "Ritual de ligadura.",
    ward: "Hechizo de custodia.",
    well: "Hechizo de pozo.",
    "item-spell": "Hechizo de objeto.",
    trap: "Trampa.",
    "pet-attack": "Ataque de mascota.",
    form: "Forma.",
    skill: "Habilidad.",
  },
  areaText: AREA_TEXT,
  areaAroundTarget: AREA_AROUND_TARGET,
  targetText: TARGET_WORDS,
  areaWho: { enemies: "Enemigos", allies: "Aliados", all: "Todos" },
  s: () => " s",
  onTarget: () => "sobre el objetivo",
  composedLastsAtBase: (p) => (p.lasts === p.at ? p.base : `${seconds(p.lasts)} (${p.base})`),
  attributes: (p) => `atributos de ${p.name}`,
  attributes2: () => "atributos",
  attributePrimaryS: (p) =>
    p.scope === "primary" ? "atributo principal" : "atributos elementales",
  setTo: (p) => `${p.scope} fijados en ${p.rank}`,
  allAttributes: () => "todos los atributos",
  toAllAllAttributes: (p) => `${p.amount} a ${p.value}`,
  renewedWheneverAChantOrShoutEnds: (p) =>
    `se renueva cada vez que termina un cántico o un grito sobre ${p.selfOnly ? "ti" : "él"}`,
  renewedWheneverYouCastItCastsA: (p) =>
    `se renueva cada vez que ${p.selfOnly ? "lanzas" : "lanza"} un hechizo`,
  reappliedWheneverYouCastItCastsA: (p) =>
    `se vuelve a aplicar cada vez que ${p.selfOnly ? "lanzas" : "lanza"} un hechizo sobre un enemigo`,
  renewedWheneverYouTakeItTakesElemental: (p) =>
    `se renueva cada vez que ${p.selfOnly ? "recibes" : "recibe"} daño elemental`,
  renewedWheneverAnEnchantmentOnYouIt: (p) =>
    `se renueva cada vez que termina un encantamiento sobre ${p.selfOnly ? "ti" : "él"}`,
  gainAdrenalineFasterSlower: (p) =>
    `ganas adrenalina un ${p.shown} más ${p.faster > 0 ? "rápido" : "lento"}`,
  onTheBearerExpireFaster: (p) => `${p.what} sobre el portador expiran un ${p.stat} más rápido`,
  enchantmentsAndStances: () => "los encantamientos y las posturas",
  enchantments: () => "los encantamientos",
  stances: () => "las posturas",
  yourAttacksAgainstItHaveCriticalChance: (p) =>
    `tus ataques contra él tienen un ${p.criticalChanceBonus} % de probabilidad de golpe crítico`,
  armorAgainstYourAttacksWhileItHas: (p) =>
    `${p.armorModifier} de armadura contra tus ataques${p.onlyWhileNoOtherHex ? " mientras no tenga otros maleficios" : ""}`,
  youTheBearer: (p) => (p.selfOnly ? "ti" : "el portador"),
  endsIfYouEndsIfTheBearer: (p) =>
    p.selfOnly ? `termina si ${secondPerson(p.phrase)}` : `termina si el portador ${p.phrase}`,
  healthDegeneration: (p) => `−${p.healthPips} de degeneración de salud`,
  healthRegeneration: (p) => `+${p.healthPips} de regeneración de salud`,
  healthRegenerationForEachEnchantmentOnYou: (p) =>
    `+${p.pips} de regeneración de salud por cada encantamiento sobre ti (${p.max} como máximo)`,
  energyDegeneration: (p) => `−${p.energyPips} de degeneración de energía`,
  energyRegeneration: (p) => `+${p.energyPips} de regeneración de energía`,
  healthRegenerationForEachConditionOnYou: (p) =>
    `${p.healthPipsPerCondition} de regeneración de salud por cada condición sobre ti`,
  health: () => "salud",
  hex: () => "maleficio",
  energy: () => "energía",
  condition: () => "condición",
  regenerationForEachOnYou: (p) =>
    `${p.pips} de regeneración de ${p.what} por cada ${p.each} sobre ti`,
  armorWhileWielding: (p) => `${p.sign}${p.armorModifier} de armadura${wielding(p.weapon)}`,
  armorWhileNotMoving: (p) => `${p.armorWhileStill} de armadura mientras no te mueves`,
  healthPerSecondWhileMoving: (p) =>
    `${p.healthPerSecondWhileMoving} de salud por segundo mientras te mueves`,
  healthPerSecond: (p) => `+${p.healthPerSecond} de salud por segundo`,
  healthPerSecondMoreInEarshotOf: (p) =>
    `+${p.healthPerSecondNearSpirit} de salud por segundo adicional al alcance de la voz de un espíritu`,
  spellsCastInEarshotOfASpirit: (p) =>
    `los hechizos lanzados al alcance de la voz de un espíritu se recargan un ${p.faster} % más rápido`,
  chanceToDoubleStrikeWhileWielding: (p) =>
    `+${p.chance} % de probabilidad de golpear dos veces${wielding(p.weapon)}`,
  armorNotBelow: (p) => `−${p.amount} de armadura (no baja de ${p.floor})`,
  movesAtSpeed: (p) => `se mueve al ${p.speed} % de velocidad`,
  movesAtSpeedWhileEnchanted: (p) =>
    `se mueve al ${p.speed} % de velocidad mientras está encantado`,
  speedBoostsHaveNoEffect: () => "los aumentos de velocidad no tienen efecto",
  cannotGainAdrenaline: () => "no puede ganar adrenalina",
  whenThisEndsYouReturnToWhere: () => "al terminar, vuelves al lugar donde lo lanzaste",
  whenThisEndsYouShadowStepTo: (p) =>
    `al terminar, haces un Paso sombrío hasta el aliado sobre el que lo lanzaste, y todas tus habilidades quedan desactivadas durante ${p.seconds} segundos`,
  ofAttacksMiss: (p) => `el ${p.attackMissChance} % de los ataques fallan`,
  maximumHealthAtMost: (p) => `−${p.fraction} % de salud máxima (${p.cap} como máximo)`,
  maximumHealth: (p) => `+${p.maxHealthBonus} de salud máxima`,
  maximumHealthPerEnchantment: (p) =>
    `+${p.maxHealthBonusPerEnchantment} de salud máxima por encantamiento`,
  maximumEnergy: (p) => `+${p.maxEnergyBonus} de energía máxima`,
  maximumHealthPerPointOfMaximumEnergy: (p) =>
    `+${p.per} de salud máxima por cada punto de energía máxima`,
  yourMinionsDealDamage: (p) => `tus esbirros infligen ${p.minionDamageBonus} de daño`,
  loseMaximumHealthEachTimeAMinion: (p) =>
    `pierdes un ${p.minionHitHealthLossPercent} % de salud máxima cada vez que uno de tus esbirros golpea`,
  conditionsYouWouldReceiveGoToYour: () =>
    "las condiciones que ibas a recibir pasan a tu esbirro más cercano",
  healing: (p) => `${p.more ? "+" : "−"}${p.change} de curación`,
  weaponDamage: (p) => `${p.change} % de daño de arma`,
  dealsDamage: (p) => `inflige ${p.more ? "+" : "−"}${p.change} de daño`,
  noDeathPenalty: () => "sin penalización por muerte",
  whenTheBearerDiesSoDoesIts: () => "cuando el portador muere, también muere su lanzador",
  alliesYouResurrectReturnWithHealthAnd: (p) =>
    `los aliados que resucitas vuelven con +${p.health} de salud y +${p.energy} de energía`,
  youDieTheBearerDiesWhenIt: (p) =>
    p.selfOnly ? "mueres cuando termina" : "el portador muere cuando termina",
  leavesAnExploitedCorpse: () => "deja un cadáver explotado",
  takeFromPhysicalDamage: (p) => `recibes ${p.sign}${p.amount} del daño físico`,
  elementalDamageTakenIsDamage: (p) =>
    `el daño elemental recibido es daño${typeWord(p.elementalDamageTakenAs)}`,
  physicalDamageTakenIsDamage: (p) =>
    `el daño físico recibido es daño${typeWord(p.physicalDamageTakenAs)}`,
  physicalDamageDealtIsDamage: (p) =>
    `el daño físico infligido es daño${typeWord(p.physicalDamageDealtAs)}`,
  elementalDamageDealtIsDamage: (p) =>
    `el daño elemental infligido es daño${typeWord(p.elementalDamageDealtAs)}`,
  takeFromSpiritsAttacks: (p) =>
    `recibes ${p.damageFromSpiritAttacks} de los ataques de los espíritus`,
  attacksAttacksDealDamage: (p) =>
    `los ${attacksWith(p.weapon)} infligen daño${typeWord(p.attackDamageType)}`,
  attacksHaveArmorPenetration: (p) =>
    `los ataques tienen un ${p.attackArmorPenetration} % de penetración de armadura`,
  attacksAttacksDealLessMoreDamage: (p) =>
    `los ${attacksWith(p.weapon)} infligen ${p.amount} de daño ${p.delta < 0 ? "menos" : "más"}`,
  and: () => " y ",
  immuneToAnd: (p) => `inmune a ${p.names}`,
  setOnFire: () => "prendido en llamas",
  or: () => " o ",
  cannotBeOr: (p) => `no puede ser ${p.names}`,
  attacksFromAttacks: (p) =>
    `${p.adrenalineGain}${p.adrenalineGainFasterFrom === "attacks" ? " de los ataques" : ""}`,
  yourEliteEliteSkillSUse: (p) =>
    `tus ${pluralFirst(p.skillType === "elite" ? "habilidad de élite" : skillTypeWord(p.skillType))} usan ${p.name}`,
  uses: (p) => `${p.skillType === "elite" ? "habilidad de élite" : skillTypeWord(p.skillType)} usa`,
  sUse: (p) =>
    `${p.uses} ${pluralFirst(p.skillType === "elite" ? "habilidad de élite" : skillTypeWord(p.skillType))} usan`,
  yourNext: (p) => `tu próxima ${p.next} ${p.name}`,
  spellsTakeAsLongToCast: (p) =>
    `los hechizos tardan ${p.castTimeMultiplier}× el tiempo normal en lanzarse`,
  skillsButAttacksTakeAsLongTo: (p) =>
    `las habilidades, salvo los ataques, tardan ${p.skillActivationMultiplier}× el tiempo normal en activarse`,
  spellsAreInterruptedByAttacks: () => "los ataques interrumpen los hechizos",
  slowerFaster: (p) => (p.attackDurationMultiplier > 1 ? "más lento" : "más rápido"),
  attacksWhileWielding: (p) => `ataca un ${p.change} % ${p.way}${wielding(p.weapon)}`,
  conditionsYouApplyLastLongerWhileWielding: (p) =>
    `las condiciones que aplicas duran un ${p.longer} % más${wielding(p.weapon)}`,
  enchantmentsYouMaintainCostTheUpkeep: (p) =>
    `los encantamientos que mantienes cuestan ${p.upkeepMultiplier}× el mantenimiento`,
  spellsThatCauseOvercastCauseMoreAs: (p) =>
    `los hechizos que causan sobrecarga causan ${p.overcastSurcharge} más al terminar`,
  arrowsMoveAsFast: (p) => `las flechas vuelan a ${p.projectileSpeedMultiplier}× la velocidad`,
  cannotCastSpells: () => "no puede lanzar hechizos",
  cannotAttack: () => "no puede atacar",
  cannotUseResurrectionSkills: () => "no puede usar habilidades de resurrección",
  cannotBeTheTargetOfEnemySpells: (p) =>
    p.whileCasting
      ? "no puede ser objetivo de hechizos enemigos mientras lanza hechizos"
      : "no puede ser objetivo de hechizos enemigos",
  cannotBeTheTargetOfSpells: () => "no puede ser objetivo de hechizos",
  hostileSpellsTargetingYouFail: () => "los hechizos hostiles dirigidos a ti fallan",
  attacksAgainstYouMiss: () => "los ataques contra ti fallan",
  strippedOfAllEnchantmentsAndCannotBe: () =>
    "pierde todos sus encantamientos y no puede ser encantado",
  cannotBeTheTargetOfEnchantments: () => "no puede ser objetivo de encantamientos",
  cannotUseShoutsOrChants: () => "no puede usar gritos ni cánticos",
  cannotUseSignets: () => "no puede usar sellos",
  cannotBlockItsCasterSAttacks: () => "no puede bloquear los ataques de su lanzador",
  cannotBeBlockedByBlindedFoes: () => "los enemigos cegados no pueden bloquearlo",
  cannotBlock: () => "no puede bloquear",
  renewedForSecondsIfMovingAsIt: (p) =>
    `se renueva durante ${p.renewsWhileMoving} segundos si te mueves cuando iba a terminar`,
  cannotBeKnockedDown: () => "no puede ser derribado",
  cannotBeKnockedDownByAFoe: () => "ningún enemigo puede derribarlo",
  endsIfItPreventsAKnockdown: () => "termina si evita un derribo",
  youDoNotSufferExtraDamageFrom: () => "no sufres daño adicional de los ataques críticos",
  cannotLandCriticalHits: () => "no puede asestar golpes críticos",
  immuneToCriticalHits: () => "inmune a los golpes críticos",
  spellsHaveDoubleTheDivineFavorBonus: (p) =>
    `los hechizos de ${p.attribute} tienen el doble de bonificación de Favor divino`,
  attackSkillAttackSkills: (p) => {
    if (p.attackSkillsOnly === true) {
      return p.once ? "habilidad de ataque" : "habilidades de ataque";
    }
    const singular = { all: "ataque", melee: "ataque cuerpo a cuerpo", projectile: "proyectil" };
    const many = { all: "ataques", melee: "ataques cuerpo a cuerpo", projectile: "proyectiles" };
    return p.once ? singular[p.against] : many[p.against];
  },
  whileBelowHealth: (p) => ` mientras tienes menos del ${p.blockBelowHealth} % de salud`,
  whileUnderOr: (p) => ` mientras estás bajo ${p.value}`,
  fromFoesUnderOr: (p) => ` de enemigos bajo ${p.value}`,
  whileAttacking: (p) => (p.blockWhileAttacking ? " mientras atacas" : ""),
  blocksTheNextChanceToBlock: (p) =>
    p.once
      ? `bloquea ${definite(p.what)} siguiente${p.attacker}${p.below}${p.under}${p.attacking}`
      : `${p.chance} % de probabilidad de bloquear ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`,
  within: (p) => area(p.radius, p.radius2),
  alliesTo: (p) => `aliados ${p.around} de ${p.bearer}: ${p.status}`,
  whileWielding: (p) => ` mientras empuñas ${NEEDED_WEAPON[p.weapon]}`,
  whileHoldingAWeaponOtherThan: (p) =>
    ` mientras sostienes un arma que no sea ${NEEDED_WEAPON[p.not]}`,
  againstFoesThatAreNotMoving: (p) =>
    p.criticalChanceBonusVersus === undefined ? "" : " contra enemigos que no se mueven",
  criticalChance: (p) => `${p.chance} % de probabilidad de crítico${p.holding}${p.versus}`,
  gainEnergyPerCriticalHit: (p) => `ganas ${p.energyPerCritical} de energía por golpe crítico`,
  wheneverYouSuccessfullyLandACriticalHit: (p) =>
    `cada vez que asestas un golpe crítico, ganas ${p.healthPerCritical} de salud`,
  refreshesEveryTimeYouLandACritical: () => "se renueva cada vez que asestas un golpe crítico",
  theNextTimeYouLandACritical: (p) =>
    p.endsWhenFired
      ? "la próxima vez que asestes un golpe crítico"
      : "cada vez que asestas un golpe crítico",
  with: (p) =>
    p.weapon === undefined ? p.critical : `${p.critical} con ${NEEDED_WEAPON[p.weapon]}`,
  removeStatusFromYourTarget: (p) =>
    p.kind === "remove-status"
      ? `${p.when}: ${lowerFirst(p.text)} de tu objetivo`
      : `${p.when}: ${lowerFirst(p.text)}`,
  ifOneIsRemovedYouLoseEnergy: (p) =>
    `si se elimina uno, pierdes ${p.energyIfRemoved} de energía o termina`,
  endsAfterIncomingAttackS: (p) =>
    `termina tras recibir ${p.endsAfterAttacks} ${p.endsAfterAttacks2 === 1 ? "ataque" : "ataques"}`,
  endsAfterYourNextAttackSHit: (p) =>
    p.endsAfterAttackCount2 === 1
      ? `termina tras tu próximo ataque, impacte, falle o sea bloqueado`
      : `termina tras tus próximos ${p.endsAfterAttackCount} ataques, impacten, fallen o sean bloqueados`,
  noEffectWhileUnderOr: (p) => `sin efecto mientras estás bajo ${p.suppressedWhileUnder}`,
  yourNextAttackSCannotBeBlocked: (p) =>
    p.unblockableAttacks2 === 1
      ? "tu próximo ataque no se puede bloquear"
      : `tus próximos ${p.unblockableAttacks} ataques no se pueden bloquear`,
  attacksCannotBeBlocked: (p) =>
    `los ataques${p.weapon === undefined ? "" : ` ${WEAPON_WORD[p.weapon]}`} no se pueden bloquear`,
  whileYouWieldAnAWeapon: (p) =>
    `mientras empuñas un arma de daño${typeWord(p.weaponDamage)}, ${p.hit}`,
  forEachEnchantmentRemovedSCasterLoses: (p) =>
    `por cada encantamiento de ${p.name} eliminado, el lanzador de ${p.name2} pierde un ${p.percentOfMax} % de salud máxima`,
  with2: (p) => (p.weapon === undefined ? "" : ` con ${NEEDED_WEAPON[p.weapon]}`),
  endsAfterHitS: (p) => `termina tras ${p.count} ${p.count2 === 1 ? "golpe" : "golpes"}${p.how}`,
  spellSpells: (p) => (p.one ? "hechizo" : `${p.count} hechizos`),
  yourNextCostsCostLessEnergy: (p) =>
    p.one
      ? `tu próximo ${p.next} cuesta ${p.costReduction} menos de energía`
      : `tus próximos ${p.next} cuestan ${p.costReduction} menos de energía`,
  yourNextRechargesRechargeFaster: (p) =>
    p.one
      ? `tu próximo ${p.next} se recarga un ${p.rechargeFaster} % más rápido`
      : `tus próximos ${p.next} se recargan un ${p.rechargeFaster} % más rápido`,
  forYourNext: (p) => `para tu próximo ${p.next}`,
  theirProjectilesMoveAsFast: (p) =>
    `sus proyectiles vuelan a ${p.projectileSpeedMultiplier}× la velocidad`,
  noOvercast: () => "sin sobrecarga",
  spreadsToAdjacentCombatants: () => "se extiende a los combatientes adyacentes",
  nextAttackSkillDamage: (p) => `próxima habilidad de ataque: ${p.condition}: +${p.more} de daño`,
  attacks: () => "ataca",
  makesAMeleeAttack: () => "realiza un ataque cuerpo a cuerpo",
  moves: () => "se mueve",
  takesDamage: (p) => `recibe ${p.damageTakenMultiplier} daño`,
  takesDamageFromTheNextAttack: (p) =>
    `recibe ${damageTaken(p.attackDamageTakenMultiplier)} daño del siguiente ataque`,
  damageTaken2: (p) => `−${p.damageReduction} de daño recibido`,
  damageTakenPerRankOfAtMost: (p) =>
    `−${p.now} de daño recibido (${p.perRank} por rango de ${p.attribute}, ${p.max} como máximo)`,
  damageTakenMoreEachHit: (p) => `−${p.step} de daño recibido, ${p.step} más con cada golpe`,
  theNextHitDealsLessDamage: (p) =>
    `el siguiente golpe inflige ${p.nextDamageReduction} menos de daño`,
  damageTakenWhileCastingS: (p) =>
    `−${p.amount} de daño recibido mientras lanzas ${pluralFirst(TYPE_NAME[p.skillType])}`,
  lessDamage: (p) => `${p.value} % menos de daño${typeWord(p.type)}`,
  lessDamageFromFoesWithAHex: (p) =>
    `${p.fraction} % menos de daño de enemigos con un maleficio de ${p.name}`,
  lessDamageFromFoesSufferingFrom: (p) =>
    `${p.fraction} % menos de daño de enemigos que sufren ${p.name}`,
  damageTakenFromFoesWithLessHealth: (p) =>
    `−${p.damageReductionFromWeakerFoe} de daño recibido de enemigos con menos salud`,
  damageTakenFromFoesWithACondition: (p) =>
    `−${p.damageReductionFromConditionedFoe} de daño recibido de enemigos con una condición`,
  lessDamageFromSpells: (p) => `${p.less} % menos de daño de los hechizos`,
  damageOverInASecondIsHealed: (p) => `el daño superior a ${p.cap} en un segundo se cura`,
  physicalItsPhysicalDamageTheDamageIt: (p) =>
    p.from === "physical" ? "su daño físico" : "el daño que recibe de los ataques",
  whichTakesLessOfIt: (p) => `, que recibe ${p.reduction} menos`,
  goesToItsCaster: (p) => contract(`${share(p.fraction)} ${p.hits} va a su lanzador${p.less}`),
  theDamageYouTakeGoesToYour: (p) =>
    contract(`${share(p.redirectsDamageToMinion)} el daño que recibes va a tu esbirro más cercano`),
  damageFromASingleHitIsCapped: (p) =>
    `el daño de un solo golpe se limita al ${p.maxDamageFractionPerHit} % de la salud máxima`,
  eachHitItCapsCostsTheCaster: (p) =>
    `cada golpe que limita cuesta al lanzador ${p.casterEnergyPerReduction} de energía, y termina cuando el lanzador no puede pagar`,
  damageFromASingleAttackIsCapped: (p) =>
    `el daño de un solo ataque se limita al ${p.attackDamageCapFraction} % de la salud máxima`,
  lifeStolen: (p) => `−${p.lifeStealReduction} de vida robada`,
  yourHealthSacrificesAreLarger: (p) =>
    `tus sacrificios de salud son un ${p.sacrificeMultiplier} % mayores`,
  knockdownsLastAtLeastS: (p) => `los derribos duran al menos ${p.knockdownMinSeconds} s`,
  itsSpiritLosesHealthEachTime: (p) =>
    `su espíritu pierde ${p.sourceLosesHealth} de salud cada vez`,
  reappliedAsItWouldEndWhileYou: (p) =>
    `se vuelve a aplicar al ir a terminar mientras ${p.selfOnly ? "tengas" : "tenga"} otro maleficio`,
  chantsAndShoutsLastLongerOnIt: (p) => `los cánticos y gritos duran un ${p.longer} % más sobre él`,
  attacksDealLessMoreDamage: (p) =>
    `los ataques infligen ${p.attackDamageDelta} de daño ${p.attackDamageDelta2 < 0 ? "menos" : "más"}`,
  movesFaster: (p) => `se mueve un ${p.moveSpeedMultiplier} % más rápido`,
  healthRegenerationDegeneration: (p) =>
    `${p.healthPips} de ${p.healthPips2 > 0 ? "regeneración" : "degeneración"} de salud`,
  armor: (p) => `${p.armorModifier} de armadura`,
  attacksFaster: (p) => `ataca un ${p.value} % más rápido`,
  aOr: (p) => categoryWords(p.categories),
  listComma: () => ", ",
  whileUnderOr2: (p) => `mientras está bajo ${p.under}: ${p.gains}`,
  once: () => "una vez",
  times: (p) => `${p.stat} veces`,
  endsAfterItTakesEffect: (p) => `termina tras surtir efecto ${p.times}`,
  theNextHexFailsAndItsCaster: (p) =>
    `el siguiente maleficio falla y su lanzador recibe ${p.damage} de daño`,
  theNextSpellItCastsAtFoe: (p) =>
    `el siguiente hechizo que lance sobre ${p.on === "foe-targeted" ? "un enemigo" : "un aliado"} falla: ${p.what}`,
  theNextTouchSkillsUsedAgainstYou: (p) =>
    `las próximas ${p.failsFoeTouchSkills} habilidades de toque usadas contra ti fallan`,
  foesWithinFoes: (p) =>
    p.area === undefined ? `enemigos ${within(p.radius)}` : `enemigos ${p.area}`,
  moreEachSecond: (p) => `, ${p.growth} más cada segundo`,
  eachSecondItAndTakeDamage: (p) =>
    `cada segundo, ${p.hitsBearer ? "él y " : ""}${p.foes} reciben ${p.damage} de daño${kindWord(p.kind)}${p.more}`,
  second: () => "segundo",
  seconds2: (p) => `${p.every} segundos`,
  everySecondSeconds: (p) => `cada ${p.value}: ${p.what}`,
  itsSpiritLosesHealthForEachOne: (p) =>
    `su espíritu pierde ${p.amount} de salud por cada uno herido`,
  itsSpiritLosesHealthForEachOne2: (p) =>
    `su espíritu pierde ${p.amount} de salud por cada uno curado`,
  everyAttack: () => "cada ataque",
  theNextAttack: () => "el siguiente ataque",
  theNextAttacks: (p) => `los siguientes ${p.times} ataques`,
  typelessAsDamage: (p) => (p.type === "typeless" ? "" : ` como daño${typeWord(p.type)}`),
  ofTheDamageOfThatHitIt: (p) =>
    `el ${p.share} % del daño de ${p.attacks} que le golpean vuelve al atacante${p.kind}, hasta ${p.max}`,
  eachAttackItLandsHasAChance: (p) =>
    `cada ataque que acierta tiene un ${p.chance} % de probabilidad de infligirle su daño a él, hasta ${p.max}`,
  theNextDamageOrLifeStealHeals: (p) =>
    `el siguiente daño o robo de vida cura esa misma cantidad, hasta ${p.reversesNextDamage}`,
  theNextDamageIsNegatedAndIts: (p) =>
    `el siguiente daño se anula y su origen recibe esa misma cantidad, hasta ${p.cap}`,
  meleeAttacksNeitherHitNorFailTo: (p) =>
    `los ataques cuerpo a cuerpo ni aciertan ni fallan, y en su lugar infligen ${p.damage} de daño cada uno`,
  allDamageHealsForThatMuchInstead: (p) =>
    `todo el daño cura esa misma cantidad, hasta ${p.cap} por golpe`,
  theNextDamageOrLifeStealThat: (p) =>
    `se anula el siguiente daño o robo de vida que ${p.selfOnly ? "te mataría" : "lo mataría"}`,
  whenOneAllySIsSpentIt: () => "cuando se agota el de un aliado, termina en todos los demás",
  gainMoreStrikeStrikesOfAdrenalinePer: (p) =>
    `ganas ${p.extraStrikesPerHit} ${p.extraStrikesPerHit2 === 1 ? "golpe" : "golpes"} de adrenalina más por impacto`,
  skillsRechargeFaster: (p) =>
    `las habilidades se recargan un ${p.skillRechargeFaster} % más rápido`,
  skillsCostMoreLessEnergy: (p) =>
    `las habilidades cuestan un ${p.change} % ${p.change2 > 0 ? "más" : "menos"} de energía`,
  spellsAndBindingRitualsRechargeFaster: (p) =>
    `los hechizos y los rituales de ligadura se recargan un ${p.faster} % más rápido`,
  spellsRechargeFaster: (p) => `los hechizos se recargan un ${p.spellRechargeFaster} % más rápido`,
  bindingRitualsRechargeFaster: (p) =>
    `los rituales de ligadura se recargan un ${p.faster} % más rápido`,
  enchantmentsRechargeFaster: (p) =>
    `los encantamientos de ${p.name} se recargan un ${p.faster} % más rápido`,
  hexTheTargetSYour: (p) => (p.category === "hex" ? "del objetivo" : "tus"),
  skillsHaveArmorPenetration: (p) =>
    `las habilidades de ${p.name} tienen un ${p.pierce} % de penetración de armadura`,
  yourTheBearerSSkillsCannotBe: (p) =>
    `${p.selfOnly ? "tus habilidades" : "las habilidades del portador"} no se pueden interrumpir`,
  theNextTimeYouWouldBeInterrupted: () => "la próxima vez que ibas a ser interrumpido, no lo eres",
  youCannotBeInterruptedEachTimeYou: (p) =>
    `no puedes ser interrumpido; cada vez que ibas a serlo, pierdes ${p.amount} de energía o esto termina`,
  youCannotBeInterruptedEachTimeYou2: (p) =>
    `no puedes ser interrumpido; cada vez que ibas a serlo, pierdes 1 encantamiento de ${p.profession} o esto termina`,
  conditionsOnExpireFaster: (p) =>
    `las condiciones sobre ${p.bearer} expiran un ${p.faster} más rápido`,
  hexesOnExpireFaster: (p) =>
    `los maleficios sobre ${p.bearer} expiran un ${p.faster} % más rápido`,
  theNextHexOnLastsLonger: (p) =>
    `el siguiente maleficio${p.of === "" ? "" : ` de ${p.of}`} sobre ${p.bearer} dura ${p.longer} más`,
  hexesCastOnTakeAsLongTo: (p) =>
    `los maleficios lanzados sobre ${p.bearer} tardan ${p.times}× el tiempo normal en lanzarse`,
  otherAlliesSpellsOnTakeAsLong: (p) =>
    `los hechizos de otros aliados sobre ${p.bearer} tardan ${p.times}× el tiempo normal en lanzarse`,
  yourSpellsOnTakeAsLongTo: (p) =>
    `tus hechizos sobre ${p.bearer} tardan ${p.times}× el tiempo normal en lanzarse`,
  enchantmentsCastOnCostLessEnergyMinimum: (p) =>
    `los encantamientos lanzados sobre ${p.bearer} cuestan ${p.less} menos de energía, con un mínimo de 1`,
  hitsWithAnAttack: () => "golpea con un ataque",
  failsToHit: () => "falla un golpe",
  hitsWithAnAttackSkill: () => "golpea con una habilidad de ataque",
  skillEffectEndsIfYouUseA: (p) =>
    p.selfOnly || p.category === "skill-effect"
      ? "termina si usas una habilidad"
      : "termina si el portador usa una habilidad",
  endsIfYouUseAnAdrenalSkill: () => "termina si usas una habilidad de adrenalina",
  endsIfYouUseANonAdrenal: () => "termina si usas una habilidad que no sea de adrenalina",
  endsIfYouUseANonSkill: (p) => `termina si usas una habilidad que no sea ${article(p.kind)}`,
  endsIfYouUseAnAttackSkill: () => "termina si usas una habilidad de ataque",
  endsIfYouUseASkillOn: () => "termina si usas una habilidad sobre él",
  endsIfYouUseASkillThat: (p) =>
    `termina si usas una habilidad que no sea ${article(p.NEXT_SKILL_KIND)}`,
  hexHexedEnchanted: (p) => (p.category === "hex" ? "maldito" : "encantado"),
  becomesOr: (p) => `queda ${p.gained}`,
  theBearerIsDestroyedWhenItExpires: () => "el portador se destruye al expirar",
  theMinionsYouItTookBecomeMasterless: (p) =>
    `los esbirros que ${p.selfOnly ? "tomaste" : "tomó"} se quedan sin amo al terminar`,
  whenTheBearerDiesRisesWhereIt: (p) =>
    p.masterless === true
      ? `cuando el portador muere, ${p.stands} se alza donde cayó, sin amo`
      : `cuando muere, ${p.stands} se levanta en su lugar`,
  composedKindBoundWhenOn: (p) => p.kindBoundWhen ?? triggerText(p.on),
  endsIfItEndsIfYou: (p) =>
    p.onFoe ? `termina si ${p.when}` : `termina si ${secondPerson(p.when)}`,
  all: (p) =>
    p.once && p.against === "all"
      ? p.text.replace(/^la próxima vez que (?:bloquees|bloquee) (un|una) /, "si es $1 ")
      : p.text,
  whileHoldingAnItem: (p) =>
    p.onlyWhileHoldingItem && !p.holdingSaid ? `${p.stats} mientras sostienes un objeto` : p.stats,
  composedIndexText: (p) => (p.index === 0 ? p.text : capitalize(p.text)),
  listSentence: () => ". ",
  physicalAttacks: (p) =>
    p.weapon !== undefined
      ? `ataques ${WEAPON_WORD[p.weapon]}`
      : p.physicalOnly
        ? "ataques físicos"
        : "ataques",
  attackSkillsPhysicalAttacks: (p) =>
    p.attackSkillsOnly
      ? `habilidades de ataque${p.weapon === undefined ? "" : ` ${WEAPON_WORD[p.weapon]}`}`
      : p.value,
  foesYourHitGetFor: (p) =>
    `los enemigos a los que golpean tus ${p.attacks} reciben ${p.statusName} durante ${p.durationSeconds}`,
  foesYourHitTake: (p) =>
    `los enemigos a los que golpean tus ${p.attacks} reciben ${p.riderDamage}`,
  foesYourHitLose: (p) =>
    `los enemigos a los que golpean tus ${p.attacks} pierden ${p.count} ${categoryNoun(p.count2, p.category)}`,
  andSoDoFoesAdjacentToThem: (p) => `${p.pop}, y también los enemigos adyacentes a ellos`,
  stealUpToHealth: (p) => `tus ${p.attacks} roban hasta ${p.amount} de salud`,
  yourPetSAttacksHealYouFor: (p) => `los ataques de tu mascota te curan ${p.amount}`,
  yourInterruptFoesTheyHit: (p) => `tus ${p.attacks} interrumpen a los enemigos que golpean`,
  your: (p) => `tus ${p.attacks}: ${p.text}`,
  attackSkillsPhysicalAttacks2: (p) =>
    p.attackSkillsOnly
      ? `habilidades de ataque${p.weapon === undefined ? "" : ` ${WEAPON_WORD[p.weapon]}`}`
      : p.weapon === undefined
        ? "ataques físicos"
        : `ataques ${WEAPON_WORD[p.weapon]}`,
  foesThatBlockYourGetFor: (p) =>
    `los enemigos que bloquean tus ${p.attacks} reciben ${p.statusName} durante ${p.durationSeconds}`,
  foesThatBlockYour: (p) => `los enemigos que bloquean tus ${p.attacks}: ${lowerFirst(p.text)}`,
  damage: (p) => damaged(p.amount, p.type),
  physical: () => "física",
  elemental: () => "elemental",
  armor2: () => "armadura",
  listSpace: () => " ",
  againstProjectileAttacks: (p) => {
    const said = armorPhrase(p.text).replace(/(\S+) armadura$/, "$1 de armadura");
    return p.projectile ? `${said} contra ataques de proyectil` : said;
  },
  thatAllyIsHealedFor: (p) => `ese aliado se cura ${p.amount}`,
  youLoseItsCasterLoses: (p) => (p.bearerIsCaster ? "pierdes" : "su lanzador pierde"),
  energy2: (p) => `${p.who} ${p.amount} de energía`,
  orSpell: (p) => `hechizo de ${p.value}`,
  wheneverYouCastItCastsAnA: (p) =>
    `cada vez que ${p.bearerIsCaster ? "lanzas" : "lanza"} un ${p.spell} sobre un aliado, ${p.value}`,
  composedKindBoundWhenEvent: (p) => p.kindBoundWhen ?? triggerText(p.event),
  youOrItOr: (p) => (p.bearerIsCaster ? p.phrases : p.phrases2),
  whenItOrOrAtOnce: (p) =>
    p.length === 0 ? p.death : `cuando ${p.others}, o de inmediato ${p.death}`,
  whenItOr: (p) => `cuando ${p.on}`,
  composedBearerIsCaster: (p) =>
    p.bearerIsCaster
      ? "la próxima vez que uses una habilidad"
      : "la próxima vez que use una habilidad",
  theNextTime: (p) => `la próxima vez que ${subjunctive(p.doer)}`,
  composedEventWhenOf: (p) =>
    p.event === "bearer-hits"
      ? "impactan"
      : p.event === "bearer-fails-to-hit"
        ? "fallan"
        : p.whenOf,
  wheneverYourArrowsOr: (p) => `cada vez que tus flechas ${p.on}`,
  wheneverOnACreatureWithLessHealth: (p) =>
    `cada vez que ${p.doer}${p.victimHasLessHealth === undefined ? "" : " sobre una criatura con menos salud"}`,
  and2: () => " y ",
  andAnd: (p) => (p.when === undefined ? p.each : `${p.when}: ${p.each}`),
  youItAnd: (p) => `${p.when}: ${p.bearerIsCaster ? "tú" : "él"} y ${p.answer}`,
  youAndAllPartyMembersAreHealed: (p) =>
    `efecto al soltarlo: tú y todos los miembros del grupo os curáis ${p.healed}`,
  composedWhat: (p) => `efecto al soltarlo: ${p.what}`,
  meleeHitsWithAMeleeAttackHits: (p) =>
    p.weapon === "melee"
      ? "golpea con un ataque cuerpo a cuerpo"
      : `golpea con ${NEEDED_WEAPON[p.weapon]}`,
  meleeIsHitByAFoeS: (p) =>
    p.weapon === "melee"
      ? "recibe el golpe del ataque cuerpo a cuerpo de un enemigo"
      : `recibe el golpe del ataque con ${NEEDED_WEAPON[p.weapon]} de un enemigo`,
  with3: (p) => `${triggerText(p.event)} con ${NEEDED_WEAPON[p.weapon]}`,
  youGainEnergy: (p) => `ganas ${p.amount} de energía`,
  allYourSkillsAreRecharged: () => "todas tus habilidades se recargan",
  yourPartyIsHealedFor: (p) => `tu grupo se cura ${p.amount}`,
  takeDamage: (p) => `${lowerFirst(p.upTo)} reciben ${damaged(p.amount, p.type)}`,
  areHealedFor: (p) => `${lowerFirst(p.upTo)} se curan ${p.amount}`,
  composedUpToText: (p) => `${lowerFirst(p.upTo)}: ${lowerFirst(p.text)}`,
  ifTargetFoeDiesWhileHexedWith: (p) =>
    p.bearerIsFoe
      ? "si el enemigo objetivo muere bajo este maleficio"
      : "si un aliado muere bajo este encantamiento",
  and3: (p) => `${p.who}, ${p.flatMap}`,
  hasASpellInterrupted: () => "ve interrumpido un hechizo",
  isStruckForDamageWhileUsingA: (p) =>
    `recibe un golpe de daño${damageKind(p.damageType)} mientras usa una habilidad`,
  takesDamageFromAFoe: (p) => `recibe daño${damageKind(p.damageType)} de un enemigo`,
  takesMoreThanDamageFromAFoe: (p) => `recibe más de ${p.minDamage} de daño de un enemigo`,
  hasItsHealthDroppedBelowByDamage: (p) =>
    `ve su salud reducida por debajo del ${p.healthBelow} % por daño`,
  isMoreThanFromYou: (p) => `está a más de ${p.apartBeyond} de ti`,
  hitsWithAAttack: (p) => `golpea con un ataque ${ROLE_WORD[p.chainRole]}`,
  isHitByAnAttackAAttack: (p) =>
    `recibe el golpe de ${p.role === undefined ? "un ataque" : `un ataque ${ROLE_WORD[p.role]}`} de su lanzador`,
  blocksAAttack: (p) =>
    `bloquea un ataque ${p.blocked === "melee" ? "cuerpo a cuerpo" : p.blocked === "projectile" ? "de proyectil" : p.blocked}`,
  losesAEnchantment: (p) => `pierde un encantamiento de ${p.name}`,
  hex2: (p) =>
    p.scopeAdjective === ""
      ? "maleficio"
      : p.scopeAdjective === "elemental"
        ? "maleficio elemental"
        : `maleficio de ${scopeWord(p.scopeAdjective)}`,
  appliesAnAToAFoe: (p) => `aplica un ${p.words} a un enemigo`,
  spell: (p) => (p.type === undefined ? "hechizo" : TYPE_NAME[p.type]),
  onAllyAnAllyAFoe: (p) => ` sobre ${p.targets === "ally" ? "un aliado" : "un enemigo"}`,
  castsAnA: (p) => `lanza ${article(namedNoun(p.words))}${p.on}`,
  non: (p) => `${NOT}${TYPE_NAME[p.notType].split(" ").pop() ?? ""}${NOT}`,
  elite: () => ELITE,
  adrenal: () => ADRENAL,
  skill: () => "habilidad",
  isTargetedByYour: (p) => `es objetivo de tu ${usedSkill(p.words)}`,
  on: (p) =>
    p.targets === undefined
      ? ""
      : ` sobre ${{ ally: "un aliado", "other-ally": "otro aliado", foe: "un enemigo" }[p.targets]}`,
  usesAnA: (p) => `usa una ${usedSkill(p.words)}${p.on}`,
  health2: (p) => `${p.amount} de salud`,
  energy3: (p) => `${p.amount} de energía`,
  takeDamage2: (p) => `reciben ${damaged(p.amount, p.type)}`,
  loseAllAllS: (p) => `pierden ${p.value} ${CATEGORY[p.category][p.count === 1 ? 0 : 1]}`,
  all2: (p) => `todos los ${p.side}`,
  upTo: (p) => `hasta ${p.maxTargets} ${p.side}`,
  withinOfThatCreature: (p) =>
    AREA_AROUND_CREATED.get(p.radius) ?? `${within(p.radius2)} de esa criatura`,
  gain: (p) => `ganan ${p.answer}`,
  youGain: (p) => `${p.when}: ${p.gains ? `ganas ${p.answers}` : p.answers}`,
  onIt: () => "sobre él",
  damageOnIt: (p) => `${p.value}${damaged(p.amount, p.type)} ${p.perCount}`,
  composedWhenWhat: (p) => `${p.when}: ${p.what}`,
  itsAdjacentAllies: () => "sus aliados adyacentes",
  itsAlliesWithin: (p) => `sus aliados ${p.area ?? within(p.radius)}`,
  itsAdjacentAlliesItsAlliesWithin: (p) =>
    !p.bearerIsFoe ? `${lowerFirst(p.foesWithin)}${p.only}` : p.value,
  bearerBlocksMeleeMeleeProjectile: (p) =>
    p.on === "bearer-blocks-melee" ? "cuerpo a cuerpo" : "de proyectil",
  whenYouBlockYouAndAlliesAre: (p) =>
    `cuando bloqueas, tú y los aliados ${p.area} os curáis ${p.amount}`,
  eachBlockCostsYouEnergyOrThis: (p) =>
    `cada bloqueo te cuesta ${p.amount} de energía o esto termina`,
  youGainEnergyForEachSuccessfulAttack: (p) =>
    `ganas ${p.amount} de energía por cada ataque ${p.kind} que bloqueas con éxito`,
  wheneverYouBlockAAttackThisWay: (p) =>
    `cada vez que bloqueas así un ataque ${p.kind}, el atacante sufre ${damaged(p.amount, p.type)}`,
  withinOfYouFoes: (p) => `enemigos ${AREA_TEXT.get(p.radius) ?? `${within(p.radius2)} de ti`}`,
  ifYouBlockAAttackSufferFrom: (p) =>
    `si bloqueas un ataque ${p.kind}, ${p.foes} sufren ${p.statusName} durante ${p.resolveMagnitudeAtRanks} segundos`,
  ifYouBlockAAttack: (p) => `si bloqueas un ataque ${p.kind}, ${p.foes}: ${lowerFirst(p.text)}`,
  stealsHealthFromThatFoe: (p) => `roba ${p.amount} de salud a ese enemigo`,
  loses: (p) => `pierde ${p.count} ${categoryNoun(p.count2, p.category)}`,
  itTakesDamage: (p) => `recibe ${damaged(p.amount, p.type)}`,
  takeDamage3: (p) => `${p.splashed} reciben ${damaged(p.amount, p.type)}`,
  thatAttackIsInterruptedAndAnd: (p) => `${p.when}, ese ataque se interrumpe y ${p.hurt}`,
  itIsInterruptedAndYouLoseEnergy: (p) =>
    `${p.when}, se interrumpe y pierdes ${p.amount} de energía o esto termina`,
  ofThatSkillSBaseEnergyCost: (p) => `${p.share} del coste base de energía de esa habilidad`,
  energy4: (p) => `${p.amount} de energía`,
  youAreHealedAreHealedIsHealed: (p) =>
    p.bearerIsCaster && p.length === 0 ? "te curas" : p.bearerIsCaster ? "os curáis" : "se cura",
  forOfThatSkillSEnergyCost: (p) =>
    `${p.healed} un ${p.share} del coste de energía de esa habilidad`,
  forWord: (p) => `${p.healed} ${p.amount}`,
  plus: () => " más ",
  youGainGainsPlus: (p) => `${p.bearerIsCaster ? "ganas" : "gana"} ${p.gains}`,
  theNearestOf: (p) => `el más cercano de ${p.splashed}`,
  upTo2: (p) => `hasta ${p.maxTargets} ${p.splashed}`,
  itAndLoseEnergy: (p) => `él y ${p.others} pierden ${p.amount} de energía`,
  bearerFoesFoesOtherFoes: (p) => (p.to === "bearer-foes" ? "enemigos" : "otros enemigos"),
  inTheAreaSufferItToo: (p) => `${p.who} en la zona también lo sufren`,
  ifASpellItThatSkill: (p) => (p.spellsOnly ? "si es un hechizo, este" : "esa habilidad"),
  takesThisSkillSSlotForSeconds: (p) =>
    `${p.which} ocupa el hueco de esta habilidad durante ${p.seconds} segundos`,
  youEnterTheSameStance: () => "adoptas la misma postura",
  youLoseEnergyOrThisEnds: (p) => `pierdes ${p.amount} de energía o esto termina`,
  thatAttackIsInterrupted: (p) => `${p.when}, ese ataque se interrumpe`,
  takes: (p) => `recibe ${p.dealt} ${p.when}`,
  bearerFatalDamageNegatedAnd: (p) => (p.on === "bearer-fatal-damage-negated" ? "y" : `${p.when},`),
  theFoeWhoDealtItTakesDamage: (p) =>
    `${p.then} el enemigo que lo infligió recibe ${damaged(p.amount, p.type)}`,
  thatAttackerIsHealedFor: (p) => `${p.when}, ese atacante se cura ${p.amount}`,
  bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p) =>
    p.on === "bearer-gains-enchantment" ? "encantamiento" : "maleficio o encantamiento",
  theCasterOfThatTakesDamage: (p) =>
    `${p.when}, el lanzador de ese ${p.gained} recibe ${damaged(p.amount, p.type)}`,
  theHealerTakesDamage: (p) => `${p.when}, el sanador recibe ${damaged(p.amount, p.type)}`,
  ofThatTarget: (p) => `${lowerFirst(p.upTo)} de ese objetivo ${p.what}${p.paid}`,
  healsItsCasterFor: (p) => `cura ${p.amount} a su lanzador ${p.when}`,
  itsCasterGainsEnergy: (p) => `su lanzador gana ${p.amount} de energía ${p.when}`,
  theNextSkillYouUseItUses: (p) =>
    `la próxima habilidad que ${p.bearerIsCaster ? "uses" : "use"} tarda ${p.seconds} segundos más en recargarse`,
  itsCasterStealsHealth: (p) => `su lanzador roba ${p.amount} de salud ${p.when}`,
  theNearestOfTakes: (p) => `el más cercano de ${p.allies} recibe`,
  take: (p) => `${p.allies} reciben`,
  upToTake: (p) => `hasta ${p.maxTargets} ${p.allies} reciben`,
  composedAlliesText: (p) => `${p.allies}: ${lowerFirst(p.text)}`,
  onAFoe: (p) => `${p.when} sobre un enemigo`,
  adjacentToYou: () => "adyacentes a ti",
  withinAroundYou: (p) => `${p.area ?? within(p.radius)} a tu alrededor`,
  otherAdjacentToYouWithinAroundYou: (p) =>
    `${p.includesCentre === true ? "" : "otros "}${sideText(p.hits)} ${p.value}`,
  takeDamage4: (p) => `${p.yours}, ${p.reached} reciben ${damaged(p.amount, p.type)}`,
  composedYoursReachedText: (p) => `${p.yours}, ${p.reached}: ${lowerFirst(p.text)}`,
  composedBearerIsCasterSaid: (p) =>
    p.bearerIsCaster ? yourCondition(p.said) : ifItWording(p.said),
  composedWhenConditionText: (p) => `${p.when}, ${p.condition}: ${lowerFirst(p.text)}`,
  bearer: (p) => lowerFirst(p.target === "bearer" ? p.bearer : p.text),
  nextAttackSkill: (p) => `próxima habilidad de ataque: ${p.statusName} ${p.durationSeconds}`,
  nextAttackSkill2: (p) => `próxima habilidad de ataque: ${p.text}`,
  skillTargetAroundItsTarget: (p) => (p.at === "skill-target" ? " (alrededor de su objetivo)" : ""),
  withYourNext: (p) => `con tu próximo ${p.next}${p.around}: ${lowerFirst(p.text)}`,
  costsCostEnergy: (p) => `${p.one ? "cuesta" : "cuestan"} ${p.energyBase} de energía`,
  costsCostLessEnergy: (p) =>
    `${p.one ? "cuesta" : "cuestan"} ${p.energyPercentOff} menos de energía`,
  costsCostLessEnergyMinimum: (p) =>
    `${p.one ? "cuesta" : "cuestan"} ${p.energyDiscount} menos de energía (mínimo ${p.energyFloor})`,
  costsCostMoreEnergy: (p) => `${p.one ? "cuesta" : "cuestan"} ${p.energySurcharge} más de energía`,
  castsCastInstantly: (p) => `${p.one ? "se lanza" : "se lanzan"} al instante`,
  castsCastFaster: (p) =>
    `${p.one ? "se lanza" : "se lanzan"} un ${p.activationMultiplier} más rápido`,
  takesTakeAsLongToCast: (p) =>
    `${p.one ? "tarda" : "tardan"} ${p.activationMultiplier}× el tiempo normal en lanzarse`,
  castsCastFaster2: (p) =>
    `${p.one ? "se lanza" : "se lanzan"} ${p.activationSecondsLess} más rápido`,
  rechargesRechargeFaster: (p) =>
    `${p.one ? "se recarga" : "se recargan"} un ${p.rechargeFaster} más rápido`,
  rechargesRechargeSlower: (p) =>
    `${p.one ? "se recarga" : "se recargan"} un ${p.rechargeSlower} más lento`,
  lastsLastLongerShorter: (p) =>
    `${p.one ? "dura" : "duran"} un ${p.durationMultiplier} ${p.durationMultiplier2 > 1 ? "más" : "menos"}`,
  healsHealLessMoreNotTheDivine: (p) =>
    `${p.one ? "cura" : "curan"} ${p.value} ${p.healMultiplier < 1 ? "menos" : "más"}${p.sparesDivineFavor ? ", sin contar la bonificación de Favor divino" : ""}`,
  isAreNotEasilyInterrupted: (p) => `no ${p.one ? "se interrumpe" : "se interrumpen"} fácilmente`,
  overcastYouBy: (p) => `te causa ${p.overcastPerUse} de sobrecarga`,
  andAttack: (p) => `ataque ${roleWords(p.chainRoles)}`,
  attackSkillSkill: (p) =>
    p.weapon !== undefined
      ? `habilidad de ataque ${WEAPON_WORD[p.weapon]}`
      : p.type === undefined
        ? "habilidad"
        : TYPE_NAME[p.type],
  hexHexesS: (p) => (p.one ? p.kind : pluralFirst(p.kind)),
  thatTargetsAFoeThatTargetA: (p) =>
    p.one ? "que apunta a un enemigo" : "que apuntan a un enemigo",
  thatTargetsYouThatTargetYou: (p) => (p.one ? "que apunta a ti" : "que apuntan a ti"),
  halfRanged: () => "de medio alcance",
  notFlashEnchantments: (p) => (p.notFlash ? " (no los encantamientos instantáneos)" : ""),
  whileHoldingAnItem2: (p) => (p.whileHoldingItem ? "mientras sostienes un objeto, " : ""),
  nextNext: (p) => (p.one ? `${p.whose} próximo` : `${p.whose} próximos ${p.uses}`),
  cannotBeInterrupted: () => "no se puede interrumpir",
  cannotBeBlocked: () => "no se puede bloquear",
  costsLessEnergy: (p) => `cuesta ${p.energyDiscount} menos de energía`,
  castsInstantly: () => "se lanza al instante",
  rechargesInstantly: () => "se recarga al instante",
  s2: (p) => `${p.value} s`,
  takesSLongerToRecharge: (p) => `tarda ${p.extraRechargeSeconds} más en recargarse`,
  yourNextAnd: (p) => `tu próximo ${p.NEXT_SKILL_KIND} ${p.does}`,
  youLoseAllEnergyAsItIs: () => "pierdes toda la energía al lanzarlo",
  youGainOfItsEnergyCost: (p) => `ganas ${p.energyGainOfCost} de su coste de energía`,
  itRechargesFaster: (p) => `se recarga un ${p.fraction} % más rápido`,
  rechargesInstantly2: (p) => `${p.name} se recarga al instante`,
  forYourNextSkill: () => "para tu próxima habilidad",
  ifItIsAAnd: (p) => `si es ${article(p.kind)}, ${p.does}`,
  suffer: (p) => `sufren ${p.sufferedWhat}`,
  forWord2: (p) => `${p.statusName} durante ${p.durationSeconds} (${p.status})`,
  a: (p) => `${CATEGORY[p.category][2]} ${one(p.category)} de ${p.owners}`,
  ifItInterruptsASkill: () => "Si interrumpe una habilidad",
  ifThatActionWasASpell: () => "Si esa acción era un hechizo",
  ifThatActionWasAnAttack: () => "Si esa acción era un ataque",
  ifItKillsTheTarget: () => "Si mata al objetivo",
  ifItResurrects: () => "Si resucita",
  ifASpiritDiedInThisWay: () => "Si un espíritu murió de este modo",
  ifWasRemoved: (p) => `Si se eliminó ${aCategory(p.category)}`,
  ifItRemoves: (p) => `Si elimina ${aCategory(p.category)}`,
  ifTargetIsBelowHealth: (p) => `Si el objetivo tiene menos del ${p.fraction} % de salud`,
  ifTargetIsAboveHealth: (p) => `Si el objetivo tiene más del ${p.fraction} % de salud`,
  ifYouHaveLessThanHealth: (p) => `Si tienes menos del ${p.fraction} % de salud`,
  ifYouHaveLessHealthThanYour: () => "Si tienes menos salud que tu mascota",
  ifYourPetHasLessHealthThan: () => "Si tu mascota tiene menos salud que tú",
  ifItFollowsOffHandAnOff: (p) => `Si sigue a un ataque ${ROLE_WORD[p.role]}`,
  ifTargetHas: (p) => `Si el objetivo tiene ${p.filteredCategory}`,
  ifTargetHasOr: (p) => `Si el objetivo tiene ${p.categories}`,
  ifYouHave: (p) => `Si tienes ${aCategory(p.category)}`,
  ifYouHaveA: (p) => `Si tienes ${CATEGORY[p.category][2]} ${one(p.category)} de ${p.name}`,
  other: (p) => (p.excluding === undefined ? "" : "otro "),
  ifYouHaveNo: (p) => `Si no tienes ${noneOf(p.other, p.category)}`,
  ifYouHaveNo2: (p) => `Si no tienes ${noneOf(p.other, p.category)} de ${p.name}`,
  ifTargetIsCastingASpellOr: (p) =>
    p.orChant === true
      ? "Si el objetivo está lanzando un hechizo o un cántico"
      : "Si el objetivo está lanzando un hechizo",
  ifTargetIsUsingASkill: () => "Si el objetivo está usando una habilidad",
  ifTargetHasNoOtherHex: (p) => `Si el objetivo no tiene ningún otro maleficio de ${p.name}`,
  ifTargetIsNotAdjacentToAny: () => "Si el objetivo no está adyacente a ningún aliado",
  ifTargetIsNotNearAnyAllies: () => "Si el objetivo no está cerca de ningún aliado",
  ifTargetHasNoAlliesWithin: (p) => `Si el objetivo no tiene aliados ${within(p.radius)}`,
  ifTargetIsNearAnyOfYour: () => "Si el objetivo está cerca de alguno de tus aliados",
  ifAnyOfYourAlliesIsWithin: (p) =>
    `Si alguno de tus aliados está ${within(p.radius)} del objetivo`,
  ifTargetIsWithinEarshot: () => "Si el objetivo está al alcance de la voz",
  ifTargetIsWithinOfYou: (p) => `Si el objetivo está ${within(p.radius)} de ti`,
  ifTargetIsNotMoving: () => "Si el objetivo no se está moviendo",
  ifTargetIsKnockedDown: () => "Si el objetivo está derribado",
  ifTargetIsMoving: () => "Si el objetivo se está moviendo",
  ifTargetIsAFoe: () => "Si el objetivo es un enemigo",
  ifTargetIsMovingFasterThanNormal: () => "Si el objetivo se está moviendo más rápido de lo normal",
  ifAnyFoeIsKnockedDownIf: (p) =>
    p.knockedDown === true
      ? `Si algún enemigo ${singularArea(p.where)} está derribado`
      : `Si algún enemigo está ${singularArea(p.where)}`,
  ifYouHitOrMoreFoes: (p) => `Si golpeas a ${p.atLeast} o más enemigos`,
  ifNumberOrMore: (p) => `Si ${countAllText(p.countAll)} suman ${p.atLeast} o más`,
  ifAreNoMoreThan: (p) => `Si ${countAllText(p.countAll)} no superan ${countAllText(p.countAll2)}`,
  ifTargetHas2: (p) => `Si el objetivo tiene ${p.statusName}`,
  ifTargetDoesNotHave: (p) => `Si el objetivo no tiene ${p.statusName}`,
  ifYouHaveMoreEnergyThanTarget: () => "Si tienes más energía que el objetivo",
  ifYouHaveLessThanEnergy: (p) => `Si tienes menos de ${p.amount} de energía`,
  ifYouAreOvercast: () => "Si estás en sobrecarga",
  ifYouWield: (p) => `Si empuñas ${NEEDED_WEAPON[p.weapon]}`,
  ifYouHoldAShield: () => "Si sostienes un escudo",
  ifYouAreHoldingAnItem: () => "Si sostienes un objeto",
  ifTargetHasLessHealthThanYou: () => "Si el objetivo tiene menos salud que tú",
  ifTargetHasMoreHealthThanYou: () => "Si el objetivo tiene más salud que tú",
  ifTargetIsAttacking: () => "Si el objetivo está atacando",
  ifTargetIsNotAttacking: () => "Si el objetivo no está atacando",
  ifTargetIsCastingASpellOr2: () => "Si el objetivo está lanzando un hechizo o atacando",
  ifTargetIsASummonedCreature: () => "Si el objetivo es una criatura invocada",
  ifNoSpiritIsWithinOfYou: (p) => `Si no hay ningún espíritu ${nearYou(p.radius, p.radius2)}`,
  ifASpiritIsWithinOfYou: (p) => `Si hay un espíritu ${nearYou(p.radius, p.radius2)}`,
  ifYouControlOrFewerS: (p) =>
    `Si controlas ${p.count} ${p.creature === "minion" ? "esbirros" : p.creature} o menos`,
  ifASpiritOrACorpseIs: (p) => `Si hay un espíritu o un cadáver ${nearYou(p.radius, p.radius2)}`,
  ifAnAllyIsDeadWithin: (p) => `Si hay un aliado muerto ${singularArea(area(p.radius, p.radius2))}`,
  ifTargetIsNearACorpseOr: () => "Si el objetivo está cerca de un cadáver o su mascota está muerta",
  ifTargetIsWithinOfACorpse: (p) =>
    `Si el objetivo está ${within(p.radius)} de un cadáver o su mascota está muerta`,
  composedType: (p) => (p.type === undefined ? "" : typeWord(p.type)),
  healthForEachAllyMax: (p) => `, +${p.amount} de salud por cada aliado ${p.area} (máx. ${p.max})`,
  allPartyMembers: () => "Todos los miembros del grupo",
  allItsPartyMembers: () => "Todos los miembros de su grupo",
  allAlliedMinions: () => "Todos los esbirros aliados",
  yourOtherMinions: () => "Tus otros esbirros",
  within2: (p) => `${p.Who} ${p.area ?? within(p.radius)}`,
  adjacent: (p) => `${capitalize(p.who)} adyacentes`,
  nearby: (p) => `${capitalize(p.who)} ${p.who.startsWith("criaturas") ? "cercanas" : "cercanos"}`,
  within3: (p) => (p.area === undefined ? `${p.Who} ${within(p.radius)}` : `${p.Who} ${p.area}`),
  loseThatSame: (p) =>
    `pierden ${CATEGORY[p.category][2] === "una" ? "esa misma" : "ese mismo"} ${one(p.category)}`,
  loseAllAll: (p) =>
    `pierden ${CATEGORY[p.category][2] === "una" ? "todas las" : "todos los"} ${categoryNoun("all", p.category)}`,
  onThem: () => "sobre ellos",
  loseOneForEachOnThem: (p) =>
    `pierden ${CATEGORY[p.category][2]} ${one(p.category)} por cada ${p.countEach}`,
  lose: (p) => `pierden ${p.count} ${categoryNoun(p.count2, p.category)}`,
  enchantmentAnA: (p) => (p.onlyBearing === undefined ? "un" : CATEGORY[p.onlyBearing][2]),
  with4: (p) => (p.onlyBearing === undefined ? "" : ` con ${p.article} ${one(p.onlyBearing)}`),
  usingSkills: (p) =>
    p.onlyUsing === undefined
      ? ""
      : ` que usan habilidades de ${TYPE_NAME[p.onlyUsing].split(" ").pop() ?? ""}`,
  dead: (p) => (p.dead === true ? `${p.living} muertos` : p.living),
  targetAndCasterAroundYouCasterAround: (p) =>
    `${p.includesCentre === true ? `El objetivo y ${lowerFirst(p.reached)}` : p.reached}${p.around === "caster" ? " a tu alrededor" : ""}${p.alsoAround === "caster" ? " alrededor del objetivo y de ti" : ""}${p.bearing}${p.using}${p.onlyIf}`,
  upTo3: (p) => `Hasta ${p.maxTargets} ${lowerFirst(p.who)}`,
  inItsRange: () => "en su alcance",
  inTheArea: () => "en la zona",
  foes: () => "enemigos",
  allEveryoneYouAndAlliesAllies: (p) =>
    p.affects === "all" ? "todos" : p.includesCaster ? "tú y los aliados" : "aliados",
  enemiesFoesAllEveryoneYouAndAllies: (p) => `${p.value} ${area(p.radius, p.radius2)}`,
  whenSprung: () => "al activarse",
  after: (p) => `tras ${seconds(p.delaySeconds)}`,
  everyFor: (p) => `cada ${seconds(p.everySeconds)} durante ${seconds(p.count)}`,
  whenItEnds: (p) => `Al terminar, ${p.whom}: `,
  springsByItselfAsItsTimeRuns: () => "Se activa sola cuando se le acaba el tiempo",
  composedWhoText: (p) => `${capitalize(p.who)}: ${lowerFirst(p.text)}`,
  composedEndingText: (p) => `${p.ending}${lowerFirst(p.text)}`,
  composedConditionText: (p) => `${p.condition}: ${lowerFirst(p.text)}`,
  itsAttacksDealDamage: (p) => `Sus ataques infligen ${p.magnitude} de daño`,
  thisSpiritLosesHealth: (p) => `este espíritu pierde ${p.magnitude} de salud`,
  composedCondition: (p) => `${lowerFirst(p.condition)}: `,
  itsAttacks: (p) => `Sus ataques: ${p.when}${p.what}`,
  health3: (p) => `${p.health} de salud`,
  health4: (p) => `${p.health} de salud (${p.health2})`,
  level: (p) => `nivel ${p.marked}, `,
  lastsSeconds: (p) => `, dura ${p.durationSeconds} segundos`,
  composedCountNameLevelTextHealthTextLasts: (p) =>
    `${p.count} ${p.name} (${p.levelText}${p.healthText}${p.lasts})`,
  itsAttacksDealDamage2: (p) => `Sus ataques infligen ${p.value} de daño`,
  onlyOneAtATimeANew: () => "Solo uno a la vez: uno nuevo mata al anterior",
  leavesCorpseCorpsesWhenItDies: (p) =>
    `Deja ${p.corpses} ${p.current === 1 ? "cadáver" : "cadáveres"} al morir`,
  whenItDiesStandsUpInIts: (p) => `Al morir, ${p.text} se levanta en su lugar`,
  listSemicolon: () => "; ",
  inItsRange2: (p) => AREA_TEXT.get(p.radius) ?? "en su alcance",
  composedAffectsWhere: (p) =>
    `${{ all: "criaturas no espíritu", allies: "aliados no espíritu", foes: "enemigos no espíritu" }[p.affects]} ${p.where}`,
  whenItDiesUnderHealthBeginFor: (p) =>
    `Al morir, ${p.who} con menos de ${p.below} de salud empiezan a sufrir ${p.statusName} durante ${p.duration} segundos`,
  whenItDiesDeadPartyMembersAre: (p) =>
    `Al morir, los miembros del grupo muertos ${p.where} resucitan con un ${p.health} % de salud y sin energía`,
  damageTakeDamageAreHealedForHealth: (p) =>
    p.effect === "damage" ? `reciben ${p.amount} de daño` : `se curan ${p.amount} de salud`,
  max: (p) => ` (máx. ${p.max})`,
  whenItDiesPerSecondItLived: (p) =>
    `Al morir, ${p.who} ${p.what} por cada segundo que vivió${p.max}`,
  everySecondsHealsTheMostHurtNon: (p) =>
    `Cada ${p.everySeconds} segundos: cura ${p.heal} de salud al aliado no espíritu más herido ${p.where}`,
  whenANonSpiritDiesInIts: () => "Cuando muere una criatura no espíritu en su alcance",
  nearby2: (p) => AREA_TEXT.get(p.radius) ?? "cercanos",
  itsConditionsSpreadToEachNonSpirit: (p) =>
    `${p.when}, sus condiciones se extienden a cada criatura no espíritu ${p.where} que tenga una condición`,
  eachOfItsTypeInItsRange: (p) =>
    `${p.when}, cada criatura de su tipo en su alcance con menos de ${p.below} de salud recibe ${p.damage} de daño`,
  holdingAnItem: (p) => (p.onlyWhileHoldingItem ? " que sostienen un objeto" : ""),
  composedWhoWhereHoldingStatus: (p) => `${p.who} ${p.where}${p.holding}: ${p.status}`,
  perFoeHit: (p) => (p.perTarget === undefined ? "" : " por enemigo golpeado"),
  forEachMeleeAttackSkillOnYour: (p) =>
    ` por cada habilidad de ataque cuerpo a cuerpo de tu barra (${p.max} como máximo)`,
  withinEarshot: (p) => (p.radius === AREA_EARSHOT ? "al alcance de la voz" : p.area),
  forEverySummonedCreatureYouControlMaximum: (p) =>
    ` por cada criatura invocada que controlas ${p.where} (${p.max} de energía como máximo)`,
  composedZeroAloneEachText: (p) => (p.zero ? `${p.alone} ${p.each}` : `${p.text}, +${p.each}`),
  maximum: (p) => ` (${p.max} como máximo)`,
  forEach: (p) => `por cada ${p.countEach}${p.max}`,
  pointOfEnergyGained: () => "punto de energía ganado",
  pointOfEnergyRestrictedByOvercast: () => "punto de energía restringido por la sobrecarga",
  skillDisabledInThisWay: () => "habilidad desactivada de este modo",
  orCasterOnYou: (p) =>
    `${categoryWords(p.categories)} ${p.on === "caster" ? "sobre ti" : p.onTarget}`,
  ofYourRecharging: (p) => `de tus ${p.rechargingSkillsNoun} en recarga`,
  pointOfEnergyCasterYouHaveThey: (p) =>
    `punto de energía que ${p.on === "caster" ? "tienes" : "tiene"}`,
  orRemoved: (p) => `${categoryWords(p.categories)} eliminado`,
  orLost: (p) => `${categoryWords(p.categories)} de ${p.name} perdido`,
  enchantmentYouAreMaintaining: () => "encantamiento que mantienes",
  secondItWasInEffect: () => "segundo que estuvo activo",
  foeKnockedDown: () => "enemigo derribado",
  youHaveEquipped: (p) => `${skillTypeWord(p.type)} que tienes equipado`,
  adrenalineSkillTheyHave: () => "habilidad de adrenalina que tiene",
  foeHit: () => "enemigo golpeado",
  within4: (p) => `${p.perCountNoun} ${area(p.radius, p.radius2)}`,
  attacksSkillsS: (p) =>
    p.weapon !== undefined
      ? `ataques ${WEAPON_WORD[p.weapon]}`
      : p.type === undefined
        ? "habilidades"
        : pluralFirst(TYPE_NAME[p.type]),
  casterYourTargetS: (p) => (p.on === "caster" ? "tus" : "del objetivo"),
  s3: (p) =>
    pluralFirst(p.perCountNoun).replace(/ (eliminado|perdido|mantenido|derribado|muerto)$/, " $1s"),
  pointOfOvercast: () => "punto de sobrecarga",
  skillDisabled: () => "habilidad desactivada",
  rechargingSkill: () => "habilidad en recarga",
  pointOfEnergy: () => "punto de energía",
  removedOr: (p) => `${categoryWords(p.categories)} eliminado`,
  removedOr2: (p) => `${categoryWords(p.categories)} de ${p.name} eliminado`,
  maintainedEnchantment: () => "encantamiento mantenido",
  secondHeld: () => "segundo mantenido",
  adrenalineSkill: () => "habilidad de adrenalina",
  deadAlly: () => "aliado muerto",
  knockedDownFoeFoe: (p) => (p.knockedDown === true ? "enemigo derribado" : "enemigo"),
  ally: () => "aliado",
  neverAbove: (p) => `, nunca más de ${p.upTo}`,
  forEachRemoved: (p) =>
    p.toTarget === true || p.perRemoved === undefined
      ? ""
      : ` por cada ${one(p.perRemoved)} eliminado`,
  perPointLost: (p) => (p.perEnergyLost === undefined ? "" : " por punto perdido"),
  armorPenetration: (p) => ` (${p.armorPenetration} % de penetración de armadura)`,
  dealsDamage2: (p) =>
    `Inflige ${p.magnitude} de daño${typeWord(p.type)}${p.perPointLost}${p.penetration}`,
  deals: () => "Inflige",
  damage2: (p) => ` de daño${typeWord(p.type)}`,
  composedCountedConditionAmount: (p) => `${p.counted}; ${lowerFirst(p.condition)}: +${p.amount}`,
  gainHealthEqualToThisSpellS: () =>
    "Ganas salud igual a la bonificación de Favor divino de este hechizo",
  healsIfRelievedOf: (p) => `Cura ${p.amount} si se libera de ${p.name}`,
  healsForOfYourCurrentHealthMaximum: (p) =>
    `Cura ${p.magnitude} de tu salud actual (${p.max} de salud como máximo)`,
  youGainHealth: (p) => `Ganas ${p.amount} de salud`,
  yourPetGainsHealth: (p) => `Tu mascota gana ${p.amount} de salud`,
  ownerHealsItsOwnerForHealsFor: (p) =>
    p.recipient === "owner" ? `Cura ${p.amount} a su dueño` : `Cura ${p.amount}`,
  healsForEachRemovedHealsForEach: (p) => {
    if (p.perRemoved !== undefined) {
      return `Cura ${p.amount} por cada ${one(p.perRemoved)} eliminado`;
    }
    if (p.perDestroyedSpirit === true) {
      return `Cura ${p.amount} por cada espíritu destruido`;
    }
    if (p.perEnergyLost === true) {
      return `${p.recipient === "caster" ? "Te curas" : "Cura"} ${p.amount} por cada punto de energía perdido`;
    }
    return p.perUsedSkillEnergy === true
      ? `Cura ${p.magnitude} del coste de energía del hechizo`
      : p.value;
  },
  casterYouGainHeals: (p) => (p.recipient === "caster" ? "Ganas" : "Cura"),
  health5: () => " de salud",
  casterOnTargetFoeOnThem: (p) =>
    p.recipient === "caster" ? "sobre el enemigo objetivo" : "sobre ellos",
  underHealth: (p) => `, con menos del ${p.onlyBelowHealthFraction} % de salud`,
  gainOfTheSkillSBaseEnergy: (p) =>
    `Ganas ${p.magnitude} del coste base de energía de la habilidad`,
  targetGainsOwnerYouGainGain: (p) => (p.toTarget === true ? "El objetivo gana" : "Ganas"),
  energy5: (p) =>
    `${p.gains} ${p.magnitude} de energía${p.perPointLost}${p.perFoeHit}${p.perOwnCreature}${p.perRemoved}`,
  energy6: () => " de energía",
  gain2: () => "Ganas",
  onTargetFoe: () => "sobre el enemigo objetivo",
  strikeStrikesOfAdrenalineAdrenaline: (p) =>
    p.units
      ? `${p.magnitude} ${p.current === 1 ? "golpe" : "golpes"} de adrenalina`
      : `${p.magnitude} de adrenalina`,
  youGain2: () => "Ganas",
  targetTargetGainsGain: (p) => (p.recipient === "target" ? "El objetivo gana" : "Ganas"),
  strikesOfAdrenaline: () => " golpes de adrenalina",
  targetRegainsAllEnergy: () => "El objetivo recupera toda su energía",
  casterYouLoseTargetLoses: (p) => (p.on === "caster" ? "Pierdes" : "El objetivo pierde"),
  energy7: (p) => `${p.who} ${p.magnitude} de energía`,
  stealsUpToEnergy: (p) => `Roba hasta ${p.magnitude} de energía`,
  stealsUpToHealth: (p) => `Roba hasta ${p.magnitude} de salud`,
  youStealHealth: (p) => `Robas ${p.magnitude} de salud`,
  youSacrificeOfYourMaximumHealth: (p) => `Sacrificas el ${p.percentOfMax} % de tu salud máxima`,
  targetFoeLosesHealth: (p) => `El enemigo objetivo pierde ${p.magnitude} de salud`,
  targetFoeLoses: () => "El enemigo objetivo pierde",
  youLoseHealth: (p) => `Pierdes ${p.magnitude} de salud`,
  forEachEnchantmentRemoved: (p) => `${p.lose} por cada encantamiento de ${p.whose} eliminado`,
  loseAllButHealth: (p) => `Pierdes toda tu salud salvo ${p.magnitude}`,
  transferOfYourConditionsToFoes: (p) =>
    `Transfiere ${p.magnitude} de tus condiciones a ${p.foesWithin}`,
  max2: (p) => (p.maxSeconds === undefined ? "" : ` (máx. ${seconds(p.maxSeconds)})`),
  withTheTimeEachHasLeft: () => "con el tiempo que le quede a cada una",
  withMoreTime: (p) => `con un ${p.extend} % más de tiempo${p.max}`,
  foesGetTheTargetSConditionsWith: (p) =>
    `${p.foesWithin} reciben las condiciones del objetivo, ${p.value}`,
  loseYourHealthHealForOfIt: (p) =>
    `Pierdes ${share(p.fractionOfCurrent)} tu salud; te curas el ${p.magnitude} % de esa cantidad`,
  whoeverOfYouAndTargetFoeHas: () =>
    "Quien tenga más salud entre tú y el enemigo objetivo pierde la mitad de la diferencia; el otro gana esa cantidad",
  stacksOnceForEachOnThem: (p) => `. Se acumula una vez por cada ${p.countEach}`,
  stacksOnceForEachOnThem2: (p) => p.status + p.value,
  forWord3: (p) => `Durante ${p.durationSeconds}, ${p.what}`,
  forEachHexRemoved: (p) => ` por cada maleficio de ${p.name} eliminado)`,
  stackingOnceForEachOnThem: (p) => `, acumulándose una vez por cada ${p.countEach}`,
  appliesCasterToYouForUntilIt: (p) =>
    `Aplica ${p.statusName}${p.on === "caster" ? " sobre ti" : ""} ${p.ends ? `durante ${p.statusDuration} ` : "hasta que termine "}(${p.status}${p.value}${p.value2}`,
  composedStatusNameDurationSeconds: (p) => `${p.statusName} (${p.durationSeconds})`,
  appliesOneOfAtRandom: (p) => `Aplica uno de estos al azar: ${p.choices}`,
  maintainedCasterOnYouEnergyRegenerationWhile: (p) =>
    `Mantenido${p.on === "caster" ? " sobre ti" : ""}: −1 de regeneración de energía mientras dure. ${capitalize(p.what)}.`,
  losesThatSame: (p) =>
    `Pierde ${CATEGORY[p.category][2] === "una" ? "esa misma" : "ese mismo"} ${one(p.category)}`,
  casterLoseRemoves: (p) => (p.from === "caster" ? "Pierdes" : "Elimina"),
  oneForEachRemovedMax: (p) =>
    `${p.verb} ${CATEGORY[p.category][2]} ${one(p.category)} por cada ${one(p.category2)} eliminado (máx. ${p.max})`,
  oneForEachOnTarget: (p) =>
    `${p.verb} ${CATEGORY[p.category][2]} ${one(p.category)} por cada ${p.countEach}`,
  lose2: (p) => `Pierdes ${counted(p.count, p.whose, categoryNoun(p.count2, p.category))}`,
  endsTheTargetSStance: () => "Termina la postura del objetivo",
  forEachSpiritWithinOfIt: (p) => ` por cada espíritu ${aroundIt(p.near, p.near2)}`,
  numberUpTo: (p) => (typeof p.count === "number" && p.count > 1 ? "hasta " : ""),
  and4: (p) => (p.orCategory === undefined ? "" : ` y ${categoryNoun(p.count, p.orCategory)}`),
  removes: (p) =>
    `Elimina ${p.upTo}${counted(p.count, p.whose, categoryNoun(p.count2, p.category))}${p.and}${p.perSpirit}`,
  interruptsTheTargetSSpellIfThey: () => "Interrumpe el hechizo del objetivo, si está lanzando uno",
  interruptsTheTargetSSpellOrChant: () =>
    "Interrumpe el hechizo o cántico del objetivo, si está lanzando uno",
  skillInterruptsTheTargetSSkillIf: (p) =>
    p.only === "skill"
      ? "Interrumpe la habilidad del objetivo, si está usando una"
      : "Interrumpe la acción del objetivo: una habilidad o un ataque",
  youAreKnockedDownFor: (p) => `Quedas derribado durante ${seconds(p.durationSeconds)}`,
  knocksDownFor: (p) => `Derriba durante ${seconds(p.durationSeconds)}`,
  shadowStepsToTheTarget: () => "Hace un Paso sombrío hasta el objetivo",
  youAndTheTargetShadowStepTo: () =>
    "El objetivo y tú hacéis un Paso sombrío a la posición del otro",
  corpseTeleportsYouToThatCorpseShadow: (p) =>
    p.to === "corpse"
      ? "Te teletransporta a ese cadáver"
      : "Haces un Paso sombrío a un lugar cercano, en dirección opuesta a tu objetivo",
  health6: (p) => `${p.percent} % de salud`,
  upToYourCurrentHealthYourHealth: (p) =>
    p.casterLosesFractionOfCurrent === 0
      ? "hasta tu salud actual"
      : `tu salud tras perder ${share(p.casterLosesFractionOfCurrent)} ella`,
  perPartyMemberWithin: (p) => ` por miembro del grupo ${area(p.radius, p.radius2)}`,
  casterAndTeleportsTheTargetToYou: (p) =>
    p.at === "caster" ? ", y teletransporta al objetivo hasta ti" : "",
  returnsTheTargetToLifeWithAnd: (p) =>
    `Devuelve la vida al objetivo con ${p.healthText} y un ${p.energy} % de energía${p.per}${p.teleport}`,
  returnsEveryDeadAlliedPetToLife: (p) =>
    `Devuelve la vida a cada mascota aliada muerta ${p.where} con un ${p.health} % de salud`,
  youLoseAllYourRemainingEnergy: () => "Pierdes toda la energía que te queda",
  youGainFor: (p) => `Ganas ${p.statusName} durante ${seconds(p.durationSeconds)} (${p.status})`,
  yourPetGainsFor: (p) => `Tu mascota gana ${p.statusName} durante ${p.duration} (${p.status})`,
  yourPetMovesToYourTargetAnd: () => "Tu mascota va hacia tu objetivo y lo ataca",
  teleportsTargetToYou: () => "Teletransporta al objetivo hasta ti",
  destroysTargetAlliedSpirit: () => "Destruye el espíritu aliado objetivo",
  destroysTargetMinion: () => "Destruye el esbirro objetivo",
  nearestSpiritLosesHealthTargetAllyIs: (p) =>
    `El espíritu más cercano pierde ${p.magnitude} de salud; el aliado objetivo se cura ${p.healPerPoint} por punto`,
  nearestSpiritLosesAllEnergyYouGain: (p) =>
    `El espíritu más cercano pierde toda su energía; ganas el ${p.magnitude} % de ella`,
  itsOwnerGainsHealthEqualToThe: () => "Su dueño gana salud igual al daño que inflige",
  destroysEveryAlliedSpiritWithin: (p) =>
    `Destruye todos los espíritus aliados ${area(p.radius, p.radius2)}`,
  thisSkillRecharges: () => "Esta habilidad se recarga",
  secondsFaster: () => " segundos más rápido",
  thisSkillRechargesInstantly: () => "Esta habilidad se recarga al instante",
  thisSkillRechargesFaster: (p) => `Esta habilidad se recarga un ${p.fraction} % más rápido`,
  usedSkillThatSkillRechargesInstantlyThis: (p) =>
    p.of === "used-skill"
      ? "Esa habilidad se recarga al instante"
      : "Esta habilidad se recarga al instante",
  loseAllAdrenaline: () => "Pierdes toda la adrenalina",
  rechargesAllYourOtherSkills: () => "Recarga todas tus demás habilidades",
  rechargesAllYourStances: () => "Recarga todas tus posturas",
  rechargesAllYourOtherSkills2: (p) =>
    `Recarga todas tus demás habilidades de ${OTHER_SKILLS[p.which] ?? p.which}`,
  rechargesAllYour: (p) => `Recarga todos tus ${p.rechargedKind}`,
  allOfYourSpiritsDie: () => "Todos tus espíritus mueren",
  summonsPlusOnePerCorpseExploited: (p) =>
    `Invoca ${p.text}${p.perExploitedCorpse === true ? ", más uno por cada cadáver explotado" : ""}`,
  setsATrap: () => "Coloca una trampa",
  pulseTargetCreatesASymbolMarksThe: (p) => {
    if (p.kind === "pulse") {
      return p.anchor === "target" ? "Crea un símbolo" : "Marca el suelo";
    }
    return p.anchor === "corpse" ? "Crea un pozo" : "Crea una custodia";
  },
  forSeconds: (p) => `${p.what} ${p.where} durante ${p.magnitude} segundos`,
  seconds3: (p) => `${p.magnitude} segundos`,
  forEachSignetYouHaveEquipped: (p) =>
    p.perOwnSignet === true ? " por cada sello que tienes equipado" : "",
  allOfTheTargetSSkillsAre: (p) =>
    `Todas las habilidades del objetivo quedan desactivadas durante ${p.time}`,
  theTargetSEliteSkillIsDisabled: (p) =>
    `La habilidad de élite del objetivo queda desactivada durante ${p.time}`,
  oneOfTheTargetSSpellsAt: (p) =>
    `Uno de los hechizos del objetivo, al azar, queda desactivado durante ${p.time}`,
  allOfTheTargetSAttackSkills: (p) =>
    `Todas las habilidades de ataque del objetivo quedan desactivadas durante ${p.time}`,
  theInterruptedSkillIsDisabledFor: (p) =>
    `La habilidad interrumpida queda desactivada durante ${p.time}${p.perSignet}`,
  centreInterruptedHoldingThatSkillHaveIt: (p) =>
    p.which === "centre-interrupted"
      ? `que tienen esa habilidad la tienen desactivada durante ${p.time}`
      : `Esa habilidad y todas las del mismo atributo quedan desactivadas durante ${p.time}`,
  thisSkillBecomesTheOneYouRemoved: (p) =>
    `Esta habilidad se convierte en la que eliminaste durante ${p.seconds} segundos`,
  thisSkillBecomesThatRandomSpellSpell: (p) =>
    `Esta habilidad se convierte en ${p.which === "random-spell" ? "ese hechizo" : "esa habilidad"} durante ese tiempo`,
  thisSkillBecomesItsTargetSNon: (p) =>
    `Esta habilidad se convierte en la habilidad de élite que no sea forma de su objetivo durante ${p.magnitude} segundos`,
  takeControlOfTargetEnemySpirit: () => "Tomas el control del espíritu enemigo objetivo",
  becomeYourMinionsWhileYouBear: (p) => `Se convierten en tus esbirros mientras tengas ${p.name}`,
  targetMinionWithAMasterBecomesMasterless: (p) =>
    `El esbirro objetivo con amo se queda sin amo; uno sin amo pasa a ser tuyo y se cura ${p.magnitude} de salud`,
  leadCountsAsALeadAttackCounts: (p) =>
    p.role === "lead" ? "Cuenta como un ataque principal" : "Cuenta como un ataque secundario",
  targetSuffersOvercast: (p) => `El objetivo sufre ${p.magnitude} de sobrecarga`,
  thisSkillThisSkillThatSkill: (p) => (p.of === "this-skill" ? "Esta habilidad" : "Esa habilidad"),
  forEachRemoved2: (p) =>
    p.perRemoved === undefined ? "" : ` por cada ${categoryNoun(p.value, p.perRemoved)} eliminado`,
  takesSecondsLongerToRecharge: (p) =>
    `${p.which} tarda ${p.magnitude} segundos más en recargarse${p.each}`,
  that: (p) => ` que ${p.onlyIf}`,
  ifItStrikesAFoe: (p) => `Si golpea a un enemigo${p.whom}: ${lowerFirst(p.text)}`,
  from: (p) => `${p.text} de ${p.from}`,
  takeDamageForEachPointOfEnergy: (p) =>
    `reciben ${damaged(p.amount, p.type)}${p.perEnergyLost === undefined ? "" : " por cada punto de energía perdido"}`,
  areInterruptedAreInterruptedIfCasting: (p) =>
    p.only === undefined ? "son interrumpidos" : "son interrumpidos si están lanzando",
  areKnockedDownForS: (p) => `quedan derribados durante ${p.durationSeconds} s`,
  foesFoeCreaturesGain: (p) =>
    p.hits === "foes" || p.hits === "foe-creatures" ? p.suffered : `ganan ${p.sufferedWhat}`,
  gainHealthEqualToThisSpellS2: () =>
    "ganan salud igual a la bonificación de Favor divino de este hechizo",
  gain3: (p) => `ganan ${lowerFirst(p.text).replace(/^cura (?:para )?/, "")}`,
  gainHealth: (p) => `ganan ${p.amount} de salud`,
  loseHealth: (p) => `pierden ${p.amount} de salud`,
  youFromEach: (p) => `${lowerFirst(p.text).replace(/^roba /, "robas ")} a cada uno`,
  transferAllTheirConditionsToYou: () => "te transfieren todas sus condiciones",
  resurrect: (p) =>
    p.kind === "resurrect"
      ? lowerFirst(p.text).replace(/^devuelve la vida al objetivo/, "vuelven a la vida")
      : lowerFirst(p.text),
  and5: (p) => (p.length === 0 ? (p.last ?? "") : `${p.parts} y ${p.last2}`),
  perAlliedMinionsOwnMinionsMinionOne: (p) =>
    `; ${lowerFirst(p.text)} por ${p.hits === "allied-minions" || p.hits === "own-minions" ? "esbirro" : "cada uno"}`,
  per: (p) => ` por ${countedNoun(p.perCountNoun)}`,
  damage3: (p) => `${damaged(p.amount, p.type)}${p.each}`,
  healHealsEnergy: (p) =>
    p.kind === "heal" ? `cura ${p.amount}${p.each}` : `+${p.amount} de energía${p.each}`,
  drainsEnergy: (p) => `drena ${p.magnitude} de energía`,
  stealsEnergy: (p) => `roba ${p.magnitude} de energía`,
  stealsHealth: (p) => `roba ${p.magnitude} de salud`,
  resurrectsEnergy: (p) => `resucita con un ${p.energy} % de energía`,
  resurrectsHealth: (p) => `resucita con un ${p.health} % de salud`,
  resurrectsPetsHealth: (p) => `resucita mascotas con un ${p.health} % de salud`,
  healsOfYourHealth: (p) => `cura el ${p.percent} % de ${share(p.fractionOfCurrent)} tu salud`,
  balancesHealthWithTargetFoe: () => "equilibra la salud con el enemigo objetivo",
  allUpTo: (p) => (p.current === p.Infinity ? "todas" : `hasta ${p.moving}`),
  andFoesWithinOfIt: (p) =>
    ` y a los enemigos ${aroundIt(p.copyToFoesWithin, p.copyToFoesWithin2)}`,
  withOfTheirRemainingDurations: (p) => ` con el ${p.durationMultiplier} % de su duración restante`,
  movesConditionsFromFoesWithinOfIt: (p) =>
    `Mueve ${p.count === "todas" ? "todas las" : p.count} condiciones${p.lasting} de los enemigos ${aroundIt(p.foesWithin, p.foesWithin2)} al objetivo`,
  casterMovesOfYourConditionsToThe: (p) =>
    p.from === "caster"
      ? `Mueve ${p.count === "todas" ? "todas tus" : `${p.count} de tus`} condiciones${p.lasting} al objetivo${p.copies}`
      : `Mueve ${p.count === "todas" ? "todas las" : `${p.count} de las`} condiciones del objetivo${p.lasting} a ti`,
  youAreHealedForForEach: (p) => `${p.moves}; te curas ${p.magnitude} por cada una`,
  areDisabledForSeconds: (p) => `quedan desactivadas durante ${p.seconds} segundos`,
  allOfYourSkills: (p) => `Todas tus habilidades ${p.time}`,
  allOfYourOtherSkills: (p) => `Todas tus demás habilidades ${p.time}`,
  allOfYourOtherNonAttackSkills: (p) =>
    `Todas tus demás habilidades que no son de ataque ${p.time}`,
  allOfYourOtherAttackSkillsYour: (p) =>
    p.exceptWeapon === undefined
      ? `Todas tus demás habilidades de ataque ${p.time}`
      : `Tus habilidades de ataque que no son ${WEAPON_WORD[p.exceptWeapon]} ${p.time}`,
  allOfYourNonAttackSkills: (p) => `Todas tus habilidades que no son de ataque ${p.time}`,
  s4: (p) => pluralFirst(TYPE_NAME[p.type]),
  yourAnd: (p) => `Tus ${p.types} ${p.time}`,
  allOfYourSpells: (p) => `Todos tus hechizos ${p.time}`,
  allOfYourOther: (p) => `Todas tus ${p.others ? "demás " : ""}habilidades de ${p.name} ${p.time}`,
  exceptAnd: (p) => (p.length === 0 ? "" : ` excepto ${p.except}`),
  allOfYourNonSkills: (p) =>
    `Todas tus habilidades que no son de ${p.name}${p.exceptText} ${p.time}`,
  yourWholeParty: () => "Todo tu grupo",
  composedAffectsWhere2: (p) =>
    `${{ enemies: "Enemigos", allies: "Aliados", all: "Todos" }[p.affects]} ${p.where}`,
  radius: (p) => `radio de ${p.radius}`,
  andAroundYou: (p) =>
    `${TARGET_WORDS[p.target]}, y ${{ enemies: "enemigos", allies: "aliados", all: "todos" }[p.affects]} ${p.where} a tu alrededor`,
  range: (p) => `alcance de ${p.range}`,
  upTo4: (p) => `hasta ${p.maxTargets} ${p.who}`,
  withinOfIt: (p) => aroundIt(p.radius, p.radius2),
  and6: (p) => `${TARGET_WORDS[p.target]}, y ${p.count} ${p.where}`,
  rangeRadius: (p) => `alcance de ${p.range}, radio de ${p.radius}`,
  free: () => "Gratis",
  adrenaline: (p) => `${p.amount} de adrenalina`,
  composedAmount: (p) => ` (${p.amount})`,
  energy8: (p) => `${p.cost} de energía${p.base}${p.overcast}`,
  overcast: (p) => `, ${p.overcast} de sobrecarga`,
  instant: () => "Instantáneo",
  composedActivationBase: (p) => (p.activation === p.base ? p.base : `${p.activation} (${p.base})`),
  dealsNoDamage: () => "No inflige daño",
  dealsOnlyDamageDamage: (p) =>
    p.weaponless
      ? `Inflige solo ${p.bonus} de daño${p.damageType}`
      : `+${p.bonus} de daño${p.damageType}`,
  damage4: (p) => `${p.condition}: +${p.more} de daño`,
  damageOnThem: (p) => `+${p.amount} de daño ${p.perCount}`,
  cannotBeBlocked2: () => "No se puede bloquear",
  cannotBeBlocked3: (p) => `${p.condition}: no se puede bloquear`,
  chanceToMissWithOrLess: (p) =>
    `${p.chance} % de probabilidad de fallar con ${p.name} ${p.rank} o menos`,
  resultsInACriticalHit: () => "Resulta en un golpe crítico",
  resultsInACriticalHit2: (p) => `${p.condition}: resulta en un golpe crítico`,
  hitsUpToAdjacentFoesToo: (p) => `Golpea también a hasta ${p.cleaveTargets} enemigos adyacentes`,
  hitsEveryAdjacentFoe: (p) => `${p.condition}: golpea a todos los enemigos adyacentes`,
  armorPenetration2: (p) => `${p.armorPenetration} % de penetración de armadura`,
  ifBlocked: (p) => `Si se bloquea: ${lowerFirst(p.text)}`,
  onACriticalHit: (p) => `Con un golpe crítico: ${lowerFirst(p.text)}`,
  ifItFailsToHit: (p) => `Si falla: ${lowerFirst(p.text)}`,
  asItIsUsed: (p) => `Al usarse: ${lowerFirst(p.text)}`,
  allYourPreparationsAreRemoved: () => "Se eliminan todas tus preparaciones",
  fliesAsFast: (p) => `Vuela a ×${p.multiplier} la velocidad`,
  fliesAsFast2: (p) => `${p.condition}: vuela a ×${p.multiplier} la velocidad`,
  only: (p) => `; ${p.condition.toLowerCase()}, solo 1`,
  eachDealingLessDamage: (p) => `, cada una con un ${p.value} % menos de daño`,
  strikesTwice: () => "Golpea dos veces",
  strikesTimes: (p) => `Golpea ${p.count} veces`,
  shootsArrowsAtOnce: (p) => `Dispara ${p.count} flechas a la vez${p.weaker}${p.fewer}`,
  whileActivating: (p) => `Al activarse: ${p.status}`,
  easilyInterrupted: () => "Se interrumpe fácilmente",
  failureChanceWithOrLess: (p) =>
    `${p.chance} % de probabilidad de fracaso con ${p.name} ${p.rank} o menos`,
  activatesFasterSlower: (p) =>
    `${p.condition}: se activa un ${p.value} % más ${p.multiplier < 1 ? "rápido" : "lento"}`,
  healthGainFromDivineFavorIsDoubled: () => "La salud obtenida de Favor divino se duplica",
  projectilesEachCanBeDodged: (p) => `${p.shots} proyectiles: cada uno se puede esquivar`,
  aProjectileAtEachFoeEachCan: (p) =>
    p.spread === true
      ? "Un proyectil a cada enemigo: cada uno se puede esquivar"
      : "Proyectil: se puede esquivar",
  halfTheNormalRange: () => "La mitad del alcance normal",
  orSacrificesHealthIfNoneIsNear: (p) =>
    `, o sacrifica el ${p.elseSacrificePercent} % de salud si no hay ninguno cerca`,
  targetExploitsTheCorpseNearestYourTarget: (p) => {
    if (p.near === "target") {
      return `Explota el cadáver más cercano a tu objetivo${p.value}`;
    }
    if (p.all === true) {
      return `Explota todos los cadáveres recientes ${area(p.radius, p.radius2)}${p.value}`;
    }
    return `${p.pick === "random" ? "Explota un cadáver al azar" : "Explota el cadáver más cercano"}${p.value}`;
  },
  whileOnYourBarAHealthFights: (p) =>
    `Mientras esté en tu barra, un ${p.name} (${p.companionHealth} de salud) lucha a tu lado`,
  disabledForAfterUse: (p) =>
    `Queda desactivada durante ${seconds(p.disabledAfterUseSeconds)} tras usarse`,
  takeAllConditionsFromYourAlliesWith: () =>
    "Tomas todas las condiciones de tus aliados, con el tiempo que le quede a cada una",
  hitOrMiss: (p) => `${p.text}, impacte o falle`,
  eliteFlash: (p) => {
    const noun = TYPE_NAME[p.type];
    const flash = p.flash ? " instantáneo" : "";
    const elite = p.elite ? " de élite" : "";
    return `${capitalize(noun)}${elite}${FEMININE_NOUN.test(noun) ? flash.replace("o", "a") : flash}.`;
  },
  moraleBoost: (p) =>
    p.rechargesOnMoraleBoost === true ? "Aumento de moral" : seconds(p.rechargeSeconds),
  hexHexesS2: (p) => pluralFirst(p.kind),
} satisfies DescribeWords as DescribeWords;
