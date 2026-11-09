import { EN_WORDS, type DescribeWords } from "@vibewars/game-core";

type Words = DescribeWords;
type Category = Parameters<Words["categoryNoun"]>[1];
type Weapon = Parameters<Words["whileWielding"]>[0]["weapon"];
type DamageKind = Parameters<Words["typeWord"]>[0];
type ChainKind = keyof Words["chainRoleText"];
type SkillKind = keyof Words["typeText"];

/**
 * Lower-cases a line's first letter so it can continue a sentence; Croatian
 * nouns are not capitalised, so the first letter is simply lowered. A word
 * in capitals (a proper name written whole) keeps its case.
 */
function lowerFirst(text: string): string {
  const second = text.charAt(1);
  return second !== "" && second === second.toUpperCase() && second !== second.toLowerCase()
    ? text
    : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function seconds(value: number): string {
  return Number.isInteger(value) ? `${String(value)} s` : `${value.toFixed(1).replace(".", ",")} s`;
}

/** Noun forms of a status category: one, accusative, instrumental, two-to-four, many, plural. */
interface CategoryForms {
  readonly one: string;
  readonly acc: string;
  readonly loc: string;
  readonly few: string;
  readonly many: string;
  readonly pl: string;
  readonly gender: "m" | "f" | "n";
}

const CATEGORY: Record<Category, CategoryForms> = {
  condition: {
    one: "stanje",
    acc: "stanje",
    loc: "stanju",
    few: "stanja",
    many: "stanja",
    pl: "stanja",
    gender: "n",
  },
  hex: {
    one: "urok",
    acc: "urok",
    loc: "uroku",
    few: "uroka",
    many: "uroka",
    pl: "uroke",
    gender: "m",
  },
  enchantment: {
    one: "začaranje",
    acc: "začaranje",
    loc: "začaranju",
    few: "začaranja",
    many: "začaranja",
    pl: "začaranja",
    gender: "n",
  },
  stance: {
    one: "stav",
    acc: "stav",
    loc: "stavu",
    few: "stava",
    many: "stavova",
    pl: "stavove",
    gender: "m",
  },
  preparation: {
    one: "priprema",
    acc: "pripremu",
    loc: "pripremi",
    few: "pripreme",
    many: "priprema",
    pl: "pripreme",
    gender: "f",
  },
  glyph: {
    one: "glif",
    acc: "glif",
    loc: "glifu",
    few: "glifa",
    many: "glifova",
    pl: "glifove",
    gender: "m",
  },
  shout: {
    one: "povik",
    acc: "povik",
    loc: "poviku",
    few: "povika",
    many: "povika",
    pl: "povike",
    gender: "m",
  },
  chant: {
    one: "pjev",
    acc: "pjev",
    loc: "pjevu",
    few: "pjeva",
    many: "pjevova",
    pl: "pjevove",
    gender: "m",
  },
  echo: {
    one: "jeka",
    acc: "jeku",
    loc: "jeci",
    few: "jeke",
    many: "jeka",
    pl: "jeke",
    gender: "f",
  },
  "weapon-spell": {
    one: "čarolija oružja",
    acc: "čaroliju oružja",
    loc: "čaroliji oružja",
    few: "čarolije oružja",
    many: "čarolija oružja",
    pl: "čarolije oružja",
    gender: "f",
  },
  item: {
    one: "predmet",
    acc: "predmet",
    loc: "predmetu",
    few: "predmeta",
    many: "predmeta",
    pl: "predmete",
    gender: "m",
  },
  form: {
    one: "oblik",
    acc: "oblik",
    loc: "obliku",
    few: "oblika",
    many: "oblika",
    pl: "oblike",
    gender: "m",
  },
  "skill-effect": {
    one: "učinak vještine",
    acc: "učinak vještine",
    loc: "učinku vještine",
    few: "učinka vještine",
    many: "učinaka vještina",
    pl: "učinke vještina",
    gender: "m",
  },
};

/** Which form a count takes: 1 the singular, 2 to 4 the paucal, others the genitive plural. */
function pluralIndex(count: number): "one" | "few" | "many" {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) {
    return "many";
  }
  return ones === 1 ? "one" : ones >= 2 && ones <= 4 ? "few" : "many";
}

/** A word by count, the way Croatian wants it: 1 stanje, 2 stanja, 5 stanja. */
function plural(count: number, one: string, few: string, many: string): string {
  const index = pluralIndex(count);
  return index === "one" ? one : index === "few" ? few : many;
}

const ALL_OF: Record<CategoryForms["gender"], string> = { m: "sve", f: "sve", n: "sva" };

/** Category ids that reach a sentence raw, joined with this file's own "ili". */
function categoryIds(text: string): string {
  return text.replace(
    /\b(skill-effect|weapon-spell|condition|hex|enchantment|stance|preparation|glyph|shout|chant|echo|item|form)\b/g,
    (id) => CATEGORY[id as Category].one,
  );
}

function categoryNoun(count: number | "all", category: Category): string {
  const forms = CATEGORY[category];
  if (count === "all") {
    return forms.pl;
  }
  return plural(count, forms.acc, forms.few, forms.many);
}

/** "2 stanja", or for every one of them "sva stanja". */
function countOf(countText: string, count: number | "all", category: Category): string {
  return count === "all"
    ? `${ALL_OF[CATEGORY[category].gender]} ${categoryNoun("all", category)}`
    : `${countText} ${categoryNoun(count, category)}`;
}

function aCategory(category: Category): string {
  return CATEGORY[category].acc;
}

/** "nijedno drugo stanje", "nijedan urok": the bare "nema" sentence wants the genitive. */
function noOther(category: Category, other: string, name?: string): string {
  const forms = CATEGORY[category];
  const adjective = other === "" ? "" : { m: "drugi ", f: "drugu ", n: "drugo " }[forms.gender];
  return name === undefined ? `${adjective}${forms.acc}` : `${adjective}${forms.acc} (${name})`;
}

const SKILL_NOUN: Readonly<Record<string, string>> = {
  attack: "napad",
  spell: "čarolija",
  enchantment: "začaranje",
  hex: "urok",
  signet: "pečat",
  shout: "povik",
  stance: "stav",
  preparation: "priprema",
  glyph: "glif",
  chant: "pjev",
  echo: "jeka",
  "weapon-spell": "čarolija oružja",
  "nature-ritual": "ritual prirode",
  "binding-ritual": "ritual vezivanja",
  ward: "zaštita",
  well: "zdenac",
  "item-spell": "čarolija predmeta",
  trap: "zamka",
  "pet-attack": "napad ljubimca",
  form: "oblik",
  skill: "vještina",
};

const SKILL_PLURAL: Readonly<Record<string, string>> = {
  napad: "napadi",
  čarolija: "čarolije",
  začaranje: "začaranja",
  urok: "uroci",
  pečat: "pečati",
  povik: "povici",
  stav: "stavovi",
  priprema: "pripreme",
  glif: "glifovi",
  pjev: "pjevovi",
  jeka: "jeke",
  "čarolija oružja": "čarolije oružja",
  "ritual prirode": "rituali prirode",
  "ritual vezivanja": "rituali vezivanja",
  zaštita: "zaštite",
  zdenac: "zdenci",
  "čarolija predmeta": "čarolije predmeta",
  zamka: "zamke",
  "napad ljubimca": "napadi ljubimca",
  oblik: "oblici",
  vještina: "vještine",
};

/** A skill type id as its Croatian noun; "elite" and the rest pass as they came. */
function spaced(word: string): string {
  return SKILL_NOUN[word] ?? word.replaceAll("-", " ");
}

const PLURAL_ENDINGS: readonly (readonly [RegExp, string])[] = [
  [/(^|\s)vještina$/, "$1vještine"],
  [/(^|\s)napad$/, "$1napadi"],
  [/(^|\s)urok$/, "$1uroci"],
  [/(^|\s)pečat$/, "$1pečati"],
  [/(^|\s)čarolija$/, "$1čarolije"],
  [/(^|\s)saveznik$/, "$1saveznici"],
  [/(^|\s)neprijatelj$/, "$1neprijatelji"],
  [/(^|\s)leš$/, "$1leševi"],
  [/(^|\s)duh$/, "$1duhovi"],
];

/** A noun's plural; those not listed come back as they are. */
function pluralNoun(noun: string): string {
  const whole = SKILL_PLURAL[noun];
  if (whole !== undefined) {
    return whole;
  }
  for (const [ending, form] of PLURAL_ENDINGS) {
    if (ending.test(noun)) {
      return noun.replace(ending, form);
    }
  }
  return noun;
}

const DAMAGE_ADJECTIVE: Record<DamageKind, string> = {
  slashing: "rezne",
  piercing: "probojne",
  blunt: "tupe",
  fire: "vatrene",
  cold: "ledene",
  lightning: "električne",
  earth: "zemljane",
  chaos: "kaotične",
  dark: "mračne",
  holy: "svete",
  shadow: "sjenovite",
  typeless: "",
};

function typeWord(type: DamageKind): string {
  return type === "typeless" ? "" : ` ${DAMAGE_ADJECTIVE[type]}`;
}

/** "vatrene štete", or plain "štete": after a number, the genitive. */
function damageOf(adjective: string): string {
  const word = adjective.trim();
  return word === "" ? "štete" : `${word} štete`;
}

function damageNoun(type: DamageKind): string {
  return damageOf(DAMAGE_ADJECTIVE[type]);
}

/** "vatrena šteta" as a subject. */
function damageNominative(type: DamageKind): string {
  const word = DAMAGE_ADJECTIVE[type];
  return word === "" ? "šteta" : `${word.replace(/e$/, "a")} šteta`;
}

/** "vatrenu štetu", said as an object with no number before it. */
function damageAccusative(type: DamageKind): string {
  const word = DAMAGE_ADJECTIVE[type];
  return word === "" ? "štetu" : `${word.replace(/e$/, "u")} štetu`;
}

/** Damage named by id in the accusative, the two broad kinds being adjectives. */
function damageNamed(type: DamageKind | "elemental" | "physical"): string {
  return type === "physical"
    ? "fizičku štetu"
    : type === "elemental"
      ? "elementarnu štetu"
      : damageAccusative(type);
}

const NEEDED_WEAPON: Record<Weapon, string> = {
  axe: "sjekiru",
  sword: "mač",
  hammer: "čekić",
  daggers: "bodeže",
  scythe: "kosu",
  spear: "koplje",
  bow: "luk",
  melee: "oružje za blisku borbu",
};

const WITH_WEAPON: Record<Weapon, string> = {
  axe: "sjekirom",
  sword: "mačem",
  hammer: "čekićem",
  daggers: "bodežima",
  scythe: "kosom",
  spear: "kopljem",
  bow: "lukom",
  melee: "oružjem za blisku borbu",
};

const WEAPON_GENITIVE: Record<Weapon, string> = {
  axe: "sjekire",
  sword: "mača",
  hammer: "čekića",
  daggers: "bodeža",
  scythe: "kose",
  spear: "koplja",
  bow: "luka",
  melee: "bliske borbe",
};

const WEAPON_WORD: Record<Weapon, string> = {
  axe: "sjekira",
  sword: "mač",
  hammer: "čekić",
  daggers: "bodež",
  scythe: "kosa",
  spear: "koplje",
  bow: "luk",
  melee: "bliska borba",
};

function wielding(weapon: Weapon | undefined): string {
  return weapon === undefined ? "" : ` dok držiš ${NEEDED_WEAPON[weapon]}`;
}

function weaponAttacks(weapon: Weapon | undefined): string {
  return weapon === undefined ? "napadi" : `napadi ${WEAPON_GENITIVE[weapon]}`;
}

function attackSkills(weapon: Weapon | undefined): string {
  return weapon === undefined ? "vještine napada" : `vještine napada ${WEAPON_GENITIVE[weapon]}`;
}

const CHAIN_WITH: Record<ChainKind, string> = {
  lead: "uvodnim napadom",
  "off-hand": "napadom sporednom rukom",
  dual: "dvostrukim napadom",
};

const CHAIN_AFTER: Record<ChainKind, string> = {
  lead: "uvodni napad",
  "off-hand": "napad sporednom rukom",
  dual: "dvostruki napad",
};

const TYPE_TEXT: Words["typeText"] = {
  attack: "Napad.",
  spell: "Čarolija.",
  enchantment: "Čarolija začaranja.",
  hex: "Čarolija uroka.",
  signet: "Pečat.",
  shout: "Povik.",
  stance: "Stav.",
  preparation: "Priprema.",
  glyph: "Glif.",
  chant: "Pjev.",
  echo: "Jeka.",
  "weapon-spell": "Čarolija oružja.",
  "nature-ritual": "Ritual prirode.",
  "binding-ritual": "Ritual vezivanja.",
  ward: "Čarolija zaštite.",
  well: "Čarolija zdenca.",
  "item-spell": "Čarolija predmeta.",
  trap: "Zamka.",
  "pet-attack": "Napad ljubimca.",
  form: "Oblik.",
  skill: "Vještina.",
};

/** The skill types whose noun is feminine: what "elitna" agrees with. */
const FEMININE_TYPES: ReadonlySet<SkillKind> = new Set<SkillKind>([
  "spell",
  "enchantment",
  "hex",
  "preparation",
  "echo",
  "weapon-spell",
  "ward",
  "well",
  "item-spell",
  "trap",
  "skill",
]);

function typeName(type: SkillKind): string {
  return lowerFirst(TYPE_TEXT[type]).replace(/\.$/, "");
}

/** A skill type's short genitive, for "vještina pečata". */
const TYPE_OF: Record<SkillKind, string> = {
  attack: "napada",
  spell: "čarolije",
  enchantment: "začaranja",
  hex: "uroka",
  signet: "pečata",
  shout: "povika",
  stance: "stava",
  preparation: "pripreme",
  glyph: "glifa",
  chant: "pjeva",
  echo: "jeke",
  "weapon-spell": "čarolije oružja",
  "nature-ritual": "rituala prirode",
  "binding-ritual": "rituala vezivanja",
  ward: "zaštite",
  well: "zdenca",
  "item-spell": "čarolije predmeta",
  trap: "zamke",
  "pet-attack": "napada ljubimca",
  form: "oblika",
  skill: "vještine",
};

const HEAD_NOUNS = "vještina|čarolija|urok";

/** Words before a head noun, said after it: "čarolija (Magija vatre)". */
function compound(words: string): string {
  const said = words
    .replace(/\bprimary\b/g, "primarni atribut")
    .replace(/\belemental\b/g, "elementarni atribut")
    .trim();
  const match = new RegExp(`^(.*?)\\s*(?:\\b(${HEAD_NOUNS}))$`, "u").exec(said);
  if (match === null) {
    return said;
  }
  const qualifiers = (match[1] ?? "").trim();
  const head = match[2] ?? "";
  return qualifiers === "" ? head : `${head} (${qualifiers})`;
}

function accusative(phrase: string): string {
  return phrase.replace(/^čarolija/, "čaroliju").replace(/^vještina/, "vještinu");
}

const YOU_VERB: Readonly<Record<string, string>> = {
  je: "si",
  nije: "nisi",
  ima: "imaš",
  nema: "nemaš",
  bude: "budeš",
  može: "možeš",
};

const THEY_VERB: Readonly<Record<string, string>> = {
  je: "su",
  nije: "nisu",
  ima: "imaju",
  nema: "nemaju",
  može: "mogu",
  bude: "budu",
};

/** A 3rd-person singular verb as the 2nd: "pogodi" to "pogodiš". */
function verbToYou(verb: string): string {
  return YOU_VERB[verb] ?? `${verb}š`;
}

/** A 3rd-person singular verb as the plural: "pogodi" to "pogode". */
function verbToThey(verb: string): string {
  return (
    THEY_VERB[verb] ??
    (verb.endsWith("a")
      ? `${verb}ju`
      : verb.endsWith("i")
        ? `${verb.slice(0, -1)}e`
        : `${verb.slice(0, -1)}u`)
  );
}

/** The phrase's opening verb (or "ne" + verb), changed by `change`. */
function changeFirstVerb(phrase: string, change: (verb: string) => string): string {
  return phrase.replace(
    /^(ne )?(\S+)/,
    (_, ne: string | undefined, verb: string) => `${ne ?? ""}${change(verb)}`,
  );
}

/** "baci čaroliju" said to its holder: "baciš čaroliju". */
function secondPerson(phrase: string): string {
  return changeFirstVerb(phrase, verbToYou);
}

/** A `conditionText` with "cilj" made "ti", the verb following. */
function yourCondition(text: string): string {
  const copula = /^Ako je cilj (.*)$/.exec(text);
  if (copula !== null) {
    return `Ako si ${copula[1] ?? ""}`;
  }
  const clause = /^Ako cilj (.*)$/.exec(text);
  if (clause === null) {
    return text;
  }
  return `Ako ${secondPerson(clause[1] ?? "")}`;
}

function negatedText(text: string): string {
  const notCopula = /^Ako (cilj|ti) nije (.*)$/.exec(text);
  if (notCopula !== null) {
    return `Ako je ${notCopula[1] ?? ""} ${notCopula[2] ?? ""}`;
  }
  const copula = /^Ako je cilj (.*)$/.exec(text);
  if (copula !== null) {
    return `Ako cilj nije ${copula[1] ?? ""}`;
  }
  const lacks = /^Ako (cilj )?nema(š?) (.*)$/.exec(text);
  if (lacks !== null) {
    return `Ako ${lacks[1] ?? ""}ima${lacks[2] ?? ""} ${lacks[3] ?? ""}`;
  }
  const has = /^Ako (cilj )?ima(š?) (.*)$/.exec(text);
  if (has !== null) {
    return `Ako ${has[1] ?? ""}nema${has[2] ?? ""} ${has[3] ?? ""}`;
  }
  const plain = /^Ako (cilj )?(\S+) (.*)$/.exec(text);
  if (plain !== null && plain[2] !== "ne") {
    return `Ako ${plain[1] ?? ""}ne ${plain[2] ?? ""} ${plain[3] ?? ""}`;
  }
  return `Osim ${lowerFirst(text)}`;
}

function share(fraction: number): string {
  return fraction === 0.5 ? "polovica" : `${String(Math.round(fraction * 100))} %`;
}

/** `share`, then of what: "polovicu svojeg zdravlja", "25 % svojeg zdravlja". */
function shareOfYourHealth(fraction: number): string {
  const said = fraction === 0.5 ? "polovicu" : share(fraction);
  return `${said} svojeg zdravlja`;
}

function damageTaken(multiplier: number): string {
  if (multiplier === 2) {
    return "dvostruku";
  }
  if (multiplier === 0.5) {
    return "upola manju";
  }
  return `${String(Math.round(multiplier * 100))} %`;
}

const TRIGGER_WHEN: Words["triggerWhen"] = {
  "bearer-casts-spell": "baci čaroliju",
  "bearer-attacks": "napadne",
  "bearer-attack-begins": "započne napad",
  "bearer-uses-skill": "upotrijebi vještinu",
  "bearer-applies-hex": "baci urok",
  "bearer-hits": "pogodi napadom",
  "bearer-fails-to-hit": "promaši",
  "bearer-takes-physical-damage": "primi fizičku štetu",
  "bearer-takes-elemental-damage": "primi elementarnu štetu",
  "bearer-takes-damage": "primi štetu",
  "bearer-takes-damage-from-foe": "primi štetu od neprijatelja ili izgubi ukradeno zdravlje",
  "bearer-health-drops-below": "padne ispod praga zdravlja zbog štete",
  "bearer-fatal-damage-negated": "izbjegne smrtonosnu štetu",
  "bearer-hit-by-attack": "bude pogođen neprijateljskim napadom",
  "bearer-targeted-by-foe": "postane meta neprijateljske čarolije ili napada",
  "bearer-healed-by-skill": "bude izliječen vještinom",
  "bearer-blocks-melee": "blokira napad iz bliske borbe",
  "bearer-blocks-projectile": "blokira projektil",
  "bearer-blocks": "blokira",
  "bearer-interrupted": "bude prekinut",
  "bearer-knocked-down": "bude oboren",
  "bearer-sacrifices-health": "žrtvuje zdravlje",
  "bearer-knockdown-prevented": "izbjegne obaranje",
  "bearer-gains-hex-or-enchantment": "dobije urok ili začaranje",
  "bearer-gains-enchantment": "dobije začaranje",
  "bearer-loses-enchantment": "izgubi začaranje",
  "bearer-loses-condition": "izgubi stanje",
  "bearer-creates-creature": "stvori stvorenje",
  "bearer-gains-condition": "dobije novo stanje",
  "bearer-chant-or-shout-ends": "doživi kraj pjeva ili povika",
  "bearer-energy-empty": "ostane bez energije",
  "bearer-energy-drops-empty": "padne na 0 energije",
  "source-targets-bearer": "postane meta tvoje vještine",
  "source-bearer-apart": "udalji se daleko od tebe",
  "bearer-dies": "umre",
  ends: "završi",
  "ends-early": "završi prerano",
  expires: "istekne",
};

/** A radius table in Croatian: the radii are the game's, only the words change. */
function inCroatian(
  table: ReadonlyMap<number, string>,
  croatian: Readonly<Record<string, string>>,
): ReadonlyMap<number, string> {
  return new Map([...table].map(([radius, english]) => [radius, croatian[english] ?? english]));
}

const AREA_TEXT = inCroatian(EN_WORDS.areaText, {
  adjacent: "uz tebe",
  nearby: "u blizini",
  "in the area": "na području",
  "in earshot": "na dohvat glasa",
  "in compass range": "u dosegu kompasa",
});

const AREA_AROUND_TARGET = inCroatian(EN_WORDS.areaAroundTarget, {
  "adjacent to it": "uz cilj",
  "nearby it": "u blizini cilja",
  "in the area around it": "na području oko cilja",
  "in earshot of it": "na dohvat glasa od cilja",
});

const AREA_AROUND_CREATED = inCroatian(EN_WORDS.areaAroundCreated, {
  "adjacent to that creature": "uz to stvorenje",
  "near that creature": "u blizini tog stvorenja",
  "in earshot of that creature": "na dohvat glasa od tog stvorenja",
});

const AURA_WHO: Words["auraWho"] = {
  all: "Stvorenja koja nisu duhovi",
  allies: "Saveznici koji nisu duhovi",
  foes: "Neprijatelji koji nisu duhovi",
};

const AREA_WHO: Words["areaWho"] = {
  enemies: "Neprijatelji",
  allies: "Saveznici",
  all: "Svi",
};

const SPLASH_SIDE: Words["splashSide"] = {
  foes: "neprijatelji",
  "foe-creatures": "neprijateljska stvorenja",
  "foe-minions": "neprijateljske sluge",
  allies: "saveznici",
  "non-spirit-allies": "saveznici koji nisu duhovi",
  party: "članovi družine",
  "own-spirits": "tvoji duhovi",
  "own-minions": "tvoje druge sluge",
  "allied-minions": "savezničke sluge",
};

const TARGET_TEXT: Words["targetText"] = {
  self: "Ti",
  "single-enemy": "Jedan neprijatelj",
  "single-ally": "Jedan saveznik",
  "single-other-ally": "Drugi saveznik",
  "single-any": "Bilo koji cilj",
  "single-dead-ally": "Mrtav saveznik",
  "allied-spirit": "Saveznički duh",
  "enemy-spirit": "Neprijateljski duh",
  "enemy-minion": "Neprijateljev sluga",
  "own-minion": "Jedan od tvojih sluga",
  "allied-minion": "Saveznički sluga",
  "allied-summoned-creature": "Savezničko prizvano stvorenje",
  "single-ally-not-spirit": "Saveznik koji nije duh",
  companion: "Tvoj ljubimac",
  "living-companion": "Tvoj živi ljubimac",
};

const TARGETS_WORDS: Words["targetsWords"] = {
  ally: "saveznika",
  "other-ally": "drugog saveznika",
  foe: "neprijatelja",
};

const YOUR_NEXT_SKILL = "kad sljedeći put upotrijebiš vještinu";
const NEXT_SKILL = "kad sljedeći put upotrijebi vještinu";
const DROPPED = "Učinak pri ispuštanju";

function within(radius: number, radius2: string): string {
  return AREA_TEXT.get(radius) ?? `u krugu od ${radius2}`;
}

/** A trigger's "the next time you block a melee attack" answered as "ako je to napad iz bliske borbe". */
function blockAnswer(text: string): string {
  return text.replace(
    /^kad sljedeći put (?:blokiraš|blokira) (.+)$/,
    (_, noun: string) => `ako je to ${noun}`,
  );
}

/** "Saveznici uz tebe", the area always following whom it reaches. */
function placed(after: string, who: string): string {
  return `${capitalize(who)} ${after}`;
}

const OTHER_SKILLS: Readonly<Record<string, string>> = {
  attack: "vještine napada",
  signet: "pečate",
};
const COUNTED: Readonly<Record<string, string>> = {
  enchantment: "začaranju",
  hex: "uroku",
  condition: "stanju",
};
const counted = (text: string): string =>
  text.replace(/\b(enchantment|hex|condition)\b/g, (word) => COUNTED[word] ?? word);

const kindedArmor = (text: string): string =>
  text.replace(/^(\S+) (\w+) oklopa$/, (whole, amount: string, kind: string) =>
    kind in DAMAGE_ADJECTIVE
      ? `${amount} oklopa protiv ${DAMAGE_ADJECTIVE[kind as DamageKind]} štete`
      : whole,
  );

const armorAgainst = (text: string): string =>
  kindedArmor(text)
    .replace(/^(\S+) fizički oklopa$/, "$1 oklopa protiv fizičke štete")
    .replace(/^(\S+) elementarni oklopa$/, "$1 oklopa protiv elementarne štete");

export default {
  capitalize,
  lowerAll: (text) => text.toLowerCase(),
  spaced,
  typeName,
  typeFirstWord: (type) => spaced(type),
  blockAnswerWording: blockAnswer,
  loseWording: (text, fromSource, bearerIsFoe) =>
    text
      .replace(/^Neprijateljski cilj gubi/, fromSource ? "gubiš" : bearerIsFoe ? "gubi" : "izgubi")
      .replace(/koju ima/, "koju imaš"),
  bearerWording: (text, bearerIsCaster) =>
    text.replace(/^Cilj dobiva/, "dobiva").replace(/^Cilj gubi/, bearerIsCaster ? "gubiš" : "gubi"),
  ifItWording: (text) => text.replace(/^Ako cilj /, "Ako ").replace(/^Ako je cilj /, "Ako je "),
  gainWording: (text) => {
    const amount = lowerFirst(text).replace(/^liječi (?:za )?/, "");
    return amount.includes("zdravlj") ? amount : `${amount} zdravlja`;
  },
  loseTargetWording: (text) => lowerFirst(text).replace(/^cilj gubi/, "gube"),
  stealsWording: (text) => lowerFirst(text).replace(/^krade /, "kradeš "),
  returnedWording: (text) => lowerFirst(text).replace(/^vraća cilj u život/, "vraćaju se u život"),
  yourMinionsWording: (text) => text.replace(/^Tvoje druge sluge/, "Tvoje sluge"),
  onlyIfWording: (text) => {
    const copula = /^Ako je cilj (.*)$/.exec(text);
    if (copula !== null) {
      return `su ${copula[1] ?? ""}`;
    }
    const match = /^Ako cilj (.*)$/.exec(text);
    return match === null ? lowerFirst(text) : changeFirstVerb(match[1] ?? "", verbToThey);
  },
  splashOnlyClause: (condition) =>
    condition === "" ? "" : condition.startsWith("ako ") ? `, ${condition}` : `, koji ${condition}`,
  eachOfWording: (reached, condition) =>
    condition === ""
      ? reached
      : condition.startsWith("ako ")
        ? `${reached}, ${condition}`
        : `${reached}, koji ${condition}`,
  requiresWording: (text) => text.replace(/^Ako /, "Samo ako "),
  requirementWording: (text) =>
    text.startsWith("Ako ") ? `samo ${lowerFirst(text)}` : lowerFirst(text),
  requirementLine: (text) => lowerFirst(text).replace(/\.$/, ""),
  anyOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Nikad", ...rest.map((text) => text.replace(/^Ako /, ""))].join(" ili ");
  },
  allOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Uvijek", ...rest.map((text) => text.replace(/^Ako /, ""))].join(" i ");
  },
  seconds,
  blockedAttacks: { all: "napade", melee: "napade iz bliske borbe", projectile: "projektile" },
  blockedAttack: { all: "napad", melee: "napad iz bliske borbe", projectile: "projektil" },
  damageTaken,
  triggerWhen: TRIGGER_WHEN,
  secondPerson,
  arrowsWhen: { "bearer-hits": "pogode", "bearer-fails-to-hit": "promaše" },
  chantOrShoutEnds: "kad god na njemu završi pjev ili povik",
  energyEmpty: "kad mu energija padne na 0",
  dropped: DROPPED,
  targetsWords: TARGETS_WORDS,
  nextSkill: NEXT_SKILL,
  yourNextSkill: YOUR_NEXT_SKILL,
  creates: "kad god stvoriš stvorenje",
  areaAroundCreated: AREA_AROUND_CREATED,
  nextSkillKind: {
    "attack-skill": ["vještina napada", "vještine napada"],
    spell: ["čarolija", "čarolije"],
    hex: ["urok", "uroci"],
    signet: ["pečat", "pečati"],
    "signet-at-foe": ["pečat koji cilja neprijatelja", "pečati koji ciljaju neprijatelja"],
    "shout-or-chant": ["povik ili pjev", "povici ili pjevovi"],
    any: ["vještina", "vještine"],
  },
  lowerFirst,
  aCategory,
  negatedText,
  yourCondition,
  typeWord,
  splashSide: SPLASH_SIDE,
  auraWho: AURA_WHO,
  groundAnchorText: {
    caster: "na tvojoj lokaciji",
    corpse: "na njegovoj lokaciji",
    target: "na lokaciji tvojeg cilja",
  },
  share,
  categoryNoun,
  weaponText: {
    axe: "Napad sjekirom",
    sword: "Napad mačem",
    hammer: "Napad čekićem",
    daggers: "Napad bodežom",
    scythe: "Napad kosom",
    spear: "Napad kopljem",
    bow: "Napad lukom",
    melee: "Napad iz bliske borbe",
  },
  chainRoleText: {
    lead: "Uvodni napad.",
    "off-hand": "Napad sporednom rukom.",
    dual: "Dvostruki napad.",
  },
  followsText: {
    lead: "Mora slijediti uvodni napad.",
    "off-hand": "Mora slijediti napad sporednom rukom.",
    dual: "Mora slijediti dvostruki napad.",
  },
  neededWeapon: NEEDED_WEAPON,
  weaponWord: WEAPON_WORD,
  typeText: TYPE_TEXT,
  areaText: AREA_TEXT,
  areaAroundTarget: AREA_AROUND_TARGET,
  targetText: TARGET_TEXT,
  areaWho: AREA_WHO,
  s: () => " s",
  onTarget: () => "na cilju",
  composedLastsAtBase: (p) => (p.lasts === p.at ? p.base : `${seconds(p.lasts)} (${p.base})`),
  attributes: (p) => `atributi profesije ${p.name}`,
  attributes2: () => "atributi",
  attributePrimaryS: (p) => (p.scope === "primary" ? "primarni atribut" : "elementarni atributi"),
  setTo: (p) => `${p.scope}: postavljeno na ${p.rank}`,
  allAttributes: () => "svi atributi",
  toAllAllAttributes: (p) => `${p.amount} na ${p.value}`,
  renewedWheneverAChantOrShoutEnds: (p) =>
    `obnavlja se kad god na ${p.selfOnly ? "tebi" : "njemu"} završi pjev ili povik`,
  renewedWheneverYouCastItCastsA: (p) =>
    `obnavlja se kad god ${p.selfOnly ? "baciš čaroliju" : "baci čaroliju"}`,
  reappliedWheneverYouCastItCastsA: (p) =>
    `ponovno se primjenjuje kad god ${p.selfOnly ? "baciš čaroliju na neprijatelja" : "baci čaroliju na neprijatelja"}`,
  renewedWheneverYouTakeItTakesElemental: (p) =>
    `obnavlja se kad god ${p.selfOnly ? "primiš elementarnu štetu" : "primi elementarnu štetu"}`,
  renewedWheneverAnEnchantmentOnYouIt: (p) =>
    `obnavlja se kad god na ${p.selfOnly ? "tebi" : "njemu"} završi začaranje`,
  gainAdrenalineFasterSlower: (p) =>
    `adrenalin dobiva ${p.shown} ${p.faster > 0 ? "brže" : "sporije"}`,
  onTheBearerExpireFaster: (p) => `${p.what} na nositelju istječu ${p.stat} brže`,
  enchantmentsAndStances: () => "začaranja i stavovi",
  enchantments: () => "začaranja",
  stances: () => "stavovi",
  yourAttacksAgainstItHaveCriticalChance: (p) =>
    `tvoji napadi na njega imaju ${p.criticalChanceBonus} % šanse za kritični pogodak`,
  armorAgainstYourAttacksWhileItHas: (p) =>
    `${p.armorModifier} oklopa protiv tvojih napada${p.onlyWhileNoOtherHex ? " dok nema drugi urok" : ""}`,
  youTheBearer: (p) => (p.selfOnly ? "tebi" : "nositelju"),
  endsIfYouEndsIfTheBearer: (p) =>
    p.selfOnly ? `završava ako ${secondPerson(p.phrase)}` : `završava ako nositelj ${p.phrase}`,
  healthDegeneration: (p) => `−${p.healthPips} degeneracije zdravlja`,
  healthRegeneration: (p) => `+${p.healthPips} regeneracije zdravlja`,
  healthRegenerationForEachEnchantmentOnYou: (p) =>
    `+${p.pips} regeneracije zdravlja po začaranju na tebi (najviše ${p.max})`,
  energyDegeneration: (p) => `−${p.energyPips} degeneracije energije`,
  energyRegeneration: (p) => `+${p.energyPips} regeneracije energije`,
  healthRegenerationForEachConditionOnYou: (p) =>
    `${p.healthPipsPerCondition} regeneracije zdravlja po stanju na tebi`,
  health: () => "zdravlja",
  hex: () => "uroku",
  energy: () => "energije",
  condition: () => "stanju",
  regenerationForEachOnYou: (p) => `${p.pips} regeneracije ${p.what} po ${p.each} na tebi`,
  armorWhileWielding: (p) => `${p.sign}${p.armorModifier} oklopa${wielding(p.weapon)}`,
  armorWhileNotMoving: (p) => `${p.armorWhileStill} oklopa dok miruješ`,
  healthPerSecondWhileMoving: (p) =>
    `${p.healthPerSecondWhileMoving} zdravlja u sekundi dok se krećeš`,
  healthPerSecond: (p) => `+${p.healthPerSecond} zdravlja u sekundi`,
  healthPerSecondMoreInEarshotOf: (p) =>
    `+${p.healthPerSecondNearSpirit} zdravlja u sekundi više na dohvat glasa od duha`,
  spellsCastInEarshotOfASpirit: (p) =>
    `čarolije bačene na dohvat glasa od duha obnavljaju se ${p.faster} % brže`,
  chanceToDoubleStrikeWhileWielding: (p) =>
    `+${p.chance} % šanse za dvostruki udarac${wielding(p.weapon)}`,
  armorNotBelow: (p) => `−${p.amount} oklopa (ne ispod ${p.floor})`,
  movesAtSpeed: (p) => `kreće se brzinom od ${p.speed} %`,
  movesAtSpeedWhileEnchanted: (p) => `kreće se brzinom od ${p.speed} % dok je začaran`,
  speedBoostsHaveNoEffect: () => "pojačanja brzine nemaju učinka",
  cannotGainAdrenaline: () => "ne može dobiti adrenalin",
  whenThisEndsYouReturnToWhere: () => "kad ovo završi, vraćaš se onamo gdje si to bacio",
  whenThisEndsYouShadowStepTo: (p) =>
    `kad ovo završi, kročiš kroz sjene do saveznika na kojeg si to bacio, a sve su ti vještine onemogućene ${p.seconds} s`,
  ofAttacksMiss: (p) => `${p.attackMissChance} % napada promaši`,
  maximumHealthAtMost: (p) => `−${p.fraction} % maksimalnog zdravlja (najviše ${p.cap})`,
  maximumHealth: (p) => `+${p.maxHealthBonus} maksimalnog zdravlja`,
  maximumHealthPerEnchantment: (p) =>
    `+${p.maxHealthBonusPerEnchantment} maksimalnog zdravlja po začaranju`,
  maximumEnergy: (p) => `+${p.maxEnergyBonus} maksimalne energije`,
  maximumHealthPerPointOfMaximumEnergy: (p) =>
    `+${p.per} maksimalnog zdravlja po bodu maksimalne energije`,
  yourMinionsDealDamage: (p) => `tvoje sluge nanose ${p.minionDamageBonus} štete`,
  loseMaximumHealthEachTimeAMinion: (p) =>
    `gubi ${p.minionHitHealthLossPercent} % maksimalnog zdravlja kad god te pogodi jedna od tvojih sluga`,
  conditionsYouWouldReceiveGoToYour: () =>
    "stanja koja bi primio prelaze na tvoju najbližu slugu umjesto tebe",
  healing: (p) => `${p.more ? "+" : "−"}${p.change} liječenja`,
  weaponDamage: (p) => `${p.change} % štete oružjem`,
  dealsDamage: (p) => `nanosi ${p.more ? "+" : "−"}${p.change} štete`,
  noDeathPenalty: () => "nema kazne za smrt",
  whenTheBearerDiesSoDoesIts: () => "kad nositelj umre, umire i njegov bacač",
  alliesYouResurrectReturnWithHealthAnd: (p) =>
    `saveznici koje oživiš vraćaju se s +${p.health} zdravlja i +${p.energy} energije`,
  youDieTheBearerDiesWhenIt: (p) =>
    p.selfOnly ? "umireš kad to završi" : "nositelj umire kad to završi",
  leavesAnExploitedCorpse: () => "ostavlja iskorišten leš",
  takeFromPhysicalDamage: (p) => `prima ${p.sign}${p.amount} od fizičke štete`,
  elementalDamageTakenIsDamage: (p) =>
    `primljena elementarna šteta je ${damageNominative(p.elementalDamageTakenAs)}`,
  physicalDamageTakenIsDamage: (p) =>
    `primljena fizička šteta je ${damageNominative(p.physicalDamageTakenAs)}`,
  physicalDamageDealtIsDamage: (p) =>
    `nanesena fizička šteta je ${damageNominative(p.physicalDamageDealtAs)}`,
  elementalDamageDealtIsDamage: (p) =>
    `nanesena elementarna šteta je ${damageNominative(p.elementalDamageDealtAs)}`,
  takeFromSpiritsAttacks: (p) => `prima ${p.damageFromSpiritAttacks} od napada duhova`,
  attacksAttacksDealDamage: (p) =>
    `${weaponAttacks(p.weapon)} nanose ${damageAccusative(p.attackDamageType)}`,
  attacksHaveArmorPenetration: (p) =>
    `napadi imaju ${p.attackArmorPenetration} % probijanja oklopa`,
  attacksAttacksDealLessMoreDamage: (p) =>
    `${weaponAttacks(p.weapon)} nanose ${p.amount} ${p.delta < 0 ? "manje" : "više"} štete`,
  and: () => " i ",
  immuneToAnd: (p) => `imun na ${p.names}`,
  setOnFire: () => "zapaljen",
  or: () => " ili ",
  cannotBeOr: (p) => `ne može biti ${p.names}`,
  attacksFromAttacks: (p) =>
    `${p.adrenalineGain}${p.adrenalineGainFasterFrom === "attacks" ? " od napada" : ""}`,
  yourEliteEliteSkillSUse: (p) =>
    `tvoje ${p.skillType === "elite" ? "elitne vještine" : pluralNoun(spaced(p.skillType))} koriste ${p.name}`,
  uses: (p) => `${spaced(p.skillType)} koristi`,
  sUse: (p) => `${p.uses} ${pluralNoun(spaced(p.skillType))} koriste`,
  yourNext: (p) => `sljedeće: ${p.next} ${p.name}`,
  spellsTakeAsLongToCast: (p) => `bacanje čarolija traje ${p.castTimeMultiplier}× dulje`,
  skillsButAttacksTakeAsLongTo: (p) =>
    `aktivacija vještina osim napada traje ${p.skillActivationMultiplier}× dulje`,
  spellsAreInterruptedByAttacks: () => "napadi prekidaju čarolije",
  slowerFaster: (p) => (p.attackDurationMultiplier > 1 ? "sporije" : "brže"),
  attacksWhileWielding: (p) => `napada ${p.change} % ${p.way}${wielding(p.weapon)}`,
  conditionsYouApplyLastLongerWhileWielding: (p) =>
    `stanja koja nanosiš traju ${p.longer} % dulje${wielding(p.weapon)}`,
  enchantmentsYouMaintainCostTheUpkeep: (p) =>
    `začaranja koja održavaš stoje ${p.upkeepMultiplier}× više održavanja`,
  spellsThatCauseOvercastCauseMoreAs: (p) =>
    `čarolije koje uzrokuju prenaprezanje uzrokuju ${p.overcastSurcharge} više pri dovršetku`,
  arrowsMoveAsFast: (p) => `strijele lete ${p.projectileSpeedMultiplier}× brzinom`,
  cannotCastSpells: () => "ne može bacati čarolije",
  cannotAttack: () => "ne može napadati",
  cannotUseResurrectionSkills: () => "ne može koristiti vještine uskrsnuća",
  cannotBeTheTargetOfEnemySpells: (p) =>
    p.whileCasting
      ? "dok baca čarolije ne može biti meta neprijateljskih čarolija"
      : "ne može biti meta neprijateljskih čarolija",
  cannotBeTheTargetOfSpells: () => "ne može biti meta čarolija",
  hostileSpellsTargetingYouFail: () => "neprijateljske čarolije koje ciljaju tebe ne uspijevaju",
  attacksAgainstYouMiss: () => "napadi protiv tebe promašuju",
  strippedOfAllEnchantmentsAndCannotBe: () => "gubi sva začaranja i ne može biti začaran",
  cannotBeTheTargetOfEnchantments: () => "ne može biti meta začaranja",
  cannotUseShoutsOrChants: () => "ne može koristiti povike ni pjevove",
  cannotUseSignets: () => "ne može koristiti pečate",
  cannotBlockItsCasterSAttacks: () => "ne može blokirati napade svojeg bacača",
  cannotBeBlockedByBlindedFoes: () => "zaslijepljeni neprijatelji to ne mogu blokirati",
  cannotBlock: () => "ne može blokirati",
  renewedForSecondsIfMovingAsIt: (p) =>
    `obnavlja se na ${p.renewsWhileMoving} s ako je u pokretu kad završi`,
  cannotBeKnockedDown: () => "ne može biti oboren",
  cannotBeKnockedDownByAFoe: () => "neprijatelj ga ne može oboriti",
  endsIfItPreventsAKnockdown: () => "završava ako spriječi obaranje",
  youDoNotSufferExtraDamageFrom: () => "ne primaš dodatnu štetu od kritičnih napada",
  cannotLandCriticalHits: () => "ne može zadati kritične pogotke",
  immuneToCriticalHits: () => "imun na kritične pogotke",
  spellsHaveDoubleTheDivineFavorBonus: (p) =>
    `čarolije atributa ${p.attribute} imaju dvostruki bonus Božanske milosti`,
  attackSkillAttackSkills: (p) =>
    p.once
      ? p.attackSkillsOnly === true
        ? "vještinu napada"
        : { all: "napad", melee: "napad iz bliske borbe", projectile: "projektil" }[p.against]
      : p.attackSkillsOnly === true
        ? "vještine napada"
        : { all: "napade", melee: "napade iz bliske borbe", projectile: "projektile" }[p.against],
  whileBelowHealth: (p) => ` ispod ${p.blockBelowHealth} % zdravlja`,
  whileUnderOr: (p) => ` (pod učinkom: ${p.value})`,
  fromFoesUnderOr: (p) => ` od neprijatelja (pod učinkom: ${p.value})`,
  whileAttacking: (p) => (p.blockWhileAttacking ? " dok napada" : ""),
  blocksTheNextChanceToBlock: (p) =>
    p.once
      ? `blokira sljedeći put: ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`
      : `${p.chance} % šanse za blokiranje: ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`,
  within: (p) => within(p.radius, p.radius2),
  alliesTo: (p) => `saveznici ${p.around} kod ${p.bearer}: ${p.status}`,
  whileWielding: (p) => wielding(p.weapon),
  whileHoldingAWeaponOtherThan: (p) => ` dok držiš oružje koje nije ${NEEDED_WEAPON[p.not]}`,
  againstFoesThatAreNotMoving: (p) =>
    p.criticalChanceBonusVersus === undefined ? "" : " protiv neprijatelja koji miruju",
  criticalChance: (p) => `${p.chance} % šanse za kritični pogodak${p.holding}${p.versus}`,
  gainEnergyPerCriticalHit: (p) => `dobiva ${p.energyPerCritical} energije po kritičnom pogotku`,
  wheneverYouSuccessfullyLandACriticalHit: (p) =>
    `kad god zadaš kritični pogodak, dobivaš ${p.healthPerCritical} zdravlja`,
  refreshesEveryTimeYouLandACritical: () => "obnavlja se svaki put kad zadaš kritični pogodak",
  theNextTimeYouLandACritical: (p) =>
    p.endsWhenFired
      ? "kad sljedeći put zadaš kritični pogodak"
      : "svaki put kad zadaš kritični pogodak",
  with: (p) => (p.weapon === undefined ? p.critical : `${p.critical} ${WITH_WEAPON[p.weapon]}`),
  removeStatusFromYourTarget: (p) =>
    p.kind === "remove-status"
      ? `${p.when}: ${lowerFirst(p.text)} s tvojeg cilja`
      : `${p.when}: ${lowerFirst(p.text)}`,
  ifOneIsRemovedYouLoseEnergy: (p) =>
    `ako se jedno ukloni, gubiš ${p.energyIfRemoved} energije ili ovo završava`,
  endsAfterIncomingAttackS: (p) =>
    `završava nakon ${p.endsAfterAttacks} ${plural(p.endsAfterAttacks2, "dolaznog napada", "dolazna napada", "dolaznih napada")}`,
  endsAfterYourNextAttackSHit: (p) =>
    p.endsAfterAttackCount2 === 1
      ? "završava nakon tvojeg sljedećeg napada, bio on pogodak, promašaj ili blok"
      : `završava nakon tvojih sljedećih ${p.endsAfterAttackCount} ${plural(p.endsAfterAttackCount2, "napada", "napada", "napada")}, bili pogoci, promašaji ili blokovi`,
  noEffectWhileUnderOr: (p) => `nema učinka dok je pod učinkom: ${p.suppressedWhileUnder}`,
  yourNextAttackSCannotBeBlocked: (p) =>
    p.unblockableAttacks2 === 1
      ? "tvoj sljedeći napad ne može se blokirati"
      : `tvoji sljedeći ${p.unblockableAttacks} ${plural(p.unblockableAttacks2, "napad", "napada", "napada")} ne mogu se blokirati`,
  attacksCannotBeBlocked: (p) => `${weaponAttacks(p.weapon)} ne mogu se blokirati`,
  whileYouWieldAnAWeapon: (p) =>
    `dok držiš oružje koje nanosi ${damageAccusative(p.weaponDamage)}, ${p.hit}`,
  forEachEnchantmentRemovedSCasterLoses: (p) =>
    `po uklonjenom začaranju (${p.name}) bacač vještine ${p.name2} gubi ${p.percentOfMax} % svojeg maksimalnog zdravlja`,
  with2: (p) => (p.weapon === undefined ? "" : ` ${WITH_WEAPON[p.weapon]}`),
  endsAfterHitS: (p) =>
    `završava nakon ${p.count} ${plural(p.count2, "pogotka", "pogotka", "pogodaka")}${p.how}`,
  spellSpells: (p) =>
    p.one
      ? "čarolija"
      : `${p.count} ${plural(Number(p.count), "čarolija", "čarolije", "čarolija")}`,
  yourNextCostsCostLessEnergy: (p) =>
    `${p.one ? "tvoja sljedeća" : "tvoje sljedeće"} ${p.next} ${p.one ? "stoji" : "stoje"} ${p.costReduction} manje energije`,
  yourNextRechargesRechargeFaster: (p) =>
    `${p.one ? "tvoja sljedeća" : "tvoje sljedeće"} ${p.next} ${p.one ? "obnavlja" : "obnavljaju"} se ${p.rechargeFaster} % brže`,
  forYourNext: (p) => `za tvoje sljedeće ${p.next}`,
  theirProjectilesMoveAsFast: (p) =>
    `njihovi projektili lete ${p.projectileSpeedMultiplier}× brzinom`,
  noOvercast: () => "bez prenaprezanja",
  spreadsToAdjacentCombatants: () => "širi se na susjedne borce",
  nextAttackSkillDamage: (p) => `sljedeća vještina napada: ${p.condition}: +${p.more} štete`,
  attacks: () => "napadne",
  makesAMeleeAttack: () => "izvede napad iz bliske borbe",
  moves: () => "kreće se",
  takesDamage: (p) => `prima ${p.damageTakenMultiplier} štete`,
  takesDamageFromTheNextAttack: (p) =>
    `prima od sljedećeg napada ${damageTaken(p.attackDamageTakenMultiplier)} štetu`,
  damageTaken2: (p) => `−${p.damageReduction} primljene štete`,
  damageTakenPerRankOfAtMost: (p) =>
    `−${p.now} primljene štete (${p.perRank} po stupnju atributa ${p.attribute}, najviše ${p.max})`,
  damageTakenMoreEachHit: (p) => `−${p.step} primljene štete, ${p.step} više sa svakim pogotkom`,
  theNextHitDealsLessDamage: (p) => `sljedeći pogodak nanosi ${p.nextDamageReduction} manje štete`,
  damageTakenWhileCastingS: (p) =>
    `−${p.amount} primljene štete pri korištenju: ${pluralNoun(spaced(p.skillType))}`,
  lessDamage: (p) => `${p.value} % manje ${damageNoun(p.type)}`,
  lessDamageFromFoesWithAHex: (p) =>
    `${p.fraction} % manje štete od neprijatelja s urokom (${p.name})`,
  lessDamageFromFoesSufferingFrom: (p) =>
    `${p.fraction} % manje štete od neprijatelja pogođenih stanjem ${p.name}`,
  damageTakenFromFoesWithLessHealth: (p) =>
    `−${p.damageReductionFromWeakerFoe} primljene štete od neprijatelja s manje zdravlja`,
  damageTakenFromFoesWithACondition: (p) =>
    `−${p.damageReductionFromConditionedFoe} primljene štete od neprijatelja sa stanjem`,
  lessDamageFromSpells: (p) => `${p.less} % manje štete od čarolija`,
  damageOverInASecondIsHealed: (p) => `šteta iznad ${p.cap} u sekundi se liječi`,
  physicalItsPhysicalDamageTheDamageIt: (p) =>
    p.from === "physical" ? "njegove fizičke štete" : "štete koju prima od napada",
  whichTakesLessOfIt: (p) => `, koji od toga prima ${p.reduction} manje`,
  goesToItsCaster: (p) => `${share(p.fraction)} ${p.hits} prelazi na njegova bacača${p.less}`,
  theDamageYouTakeGoesToYour: (p) =>
    `${share(p.redirectsDamageToMinion)} štete koju primaš prelazi na tvoju najbližu slugu`,
  damageFromASingleHitIsCapped: (p) =>
    `šteta od jednog pogotka ograničena je na ${p.maxDamageFractionPerHit} % maksimalnog zdravlja`,
  eachHitItCapsCostsTheCaster: (p) =>
    `svaki tako ograničen pogodak košta bacača ${p.casterEnergyPerReduction} energije, a završava ako bacač ne može platiti`,
  damageFromASingleAttackIsCapped: (p) =>
    `šteta od jednog napada ograničena je na ${p.attackDamageCapFraction} % maksimalnog zdravlja`,
  lifeStolen: (p) => `−${p.lifeStealReduction} ukradenog zdravlja`,
  yourHealthSacrificesAreLarger: (p) =>
    `tvoje žrtve zdravlja veće su za ${p.sacrificeMultiplier} %`,
  knockdownsLastAtLeastS: (p) => `obaranja traju najmanje ${p.knockdownMinSeconds} s`,
  itsSpiritLosesHealthEachTime: (p) => `njegov duh svaki put gubi ${p.sourceLosesHealth} zdravlja`,
  reappliedAsItWouldEndWhileYou: (p) =>
    `ponovno se primjenjuje pri završetku dok ${p.selfOnly ? "imaš još koji urok" : "ima još koji urok"}`,
  chantsAndShoutsLastLongerOnIt: (p) => `pjevovi i povici na njemu traju ${p.longer} % dulje`,
  attacksDealLessMoreDamage: (p) =>
    `napadi nanose ${p.attackDamageDelta} ${p.attackDamageDelta2 < 0 ? "manje" : "više"} štete`,
  movesFaster: (p) => `kreće se ${p.moveSpeedMultiplier} % brže`,
  healthRegenerationDegeneration: (p) =>
    `${p.healthPips} ${p.healthPips2 > 0 ? "regeneracije" : "degeneracije"} zdravlja`,
  armor: (p) => `${p.armorModifier} oklopa`,
  attacksFaster: (p) => `napada ${p.value} % brže`,
  aOr: (p) => categoryIds(p.categories),
  listComma: () => ", ",
  whileUnderOr2: (p) => `pod učinkom ${p.under}: ${p.gains}`,
  once: () => "jednom",
  times: (p) => `${p.stat} puta`,
  endsAfterItTakesEffect: (p) => `završava nakon što djeluje ${p.times}`,
  theNextHexFailsAndItsCaster: (p) =>
    `sljedeći urok ne uspijeva, a njegov bacač prima ${p.damage} štete`,
  theNextSpellItCastsAtFoe: (p) =>
    `sljedeća čarolija koju baci na ${p.on === "foe-targeted" ? "neprijatelja" : "saveznika"} ne uspijeva: ${p.what}`,
  theNextTouchSkillsUsedAgainstYou: (p) =>
    `sljedećih ${p.failsFoeTouchSkills} vještina dodira protiv tebe ne uspijeva`,
  foesWithinFoes: (p) =>
    p.area === undefined ? `neprijatelji u krugu od ${p.radius}` : `neprijatelji ${p.area}`,
  moreEachSecond: (p) => `, ${p.growth} više svake sekunde`,
  eachSecondItAndTakeDamage: (p) =>
    `svake sekunde ${p.hitsBearer ? "on i " : ""}${p.foes} primaju ${p.damage} ${p.kind === "" ? damageOf("") : damageNoun(p.kind.trim() as DamageKind)}${p.more}`,
  second: () => "sekundu",
  seconds2: (p) => `${p.every} sekundi`,
  everySecondSeconds: (p) => `svakih ${p.value}: ${p.what}`,
  itsSpiritLosesHealthForEachOne: (p) => `njegov duh gubi ${p.amount} zdravlja po pogođenom cilju`,
  itsSpiritLosesHealthForEachOne2: (p) =>
    `njegov duh gubi ${p.amount} zdravlja po izliječenom cilju`,
  everyAttack: () => "svakog napada",
  theNextAttack: () => "sljedećeg napada",
  theNextAttacks: (p) => `sljedećih ${p.times} napada`,
  typelessAsDamage: (p) => (p.type === "typeless" ? "" : ` kao ${damageNominative(p.type)}`),
  ofTheDamageOfThatHitIt: (p) =>
    `${p.share} % štete od ${p.attacks} koji ga pogode vraća se napadaču${p.kind}, do ${p.max}`,
  eachAttackItLandsHasAChance: (p) =>
    `svaki njegov pogodak ima ${p.chance} % šanse da mu umjesto toga nanese štetu, do ${p.max}`,
  theNextDamageOrLifeStealHeals: (p) =>
    `sljedeća šteta ili krađa zdravlja umjesto toga liječi za taj iznos, do ${p.reversesNextDamage}`,
  theNextDamageIsNegatedAndIts: (p) =>
    `sljedeća šteta se poništava, a umjesto toga prima je njezin izvor, do ${p.cap}`,
  meleeAttacksNeitherHitNorFailTo: (p) =>
    `napadi iz bliske borbe niti pogađaju niti promašuju, nego svaki nanosi ${p.damage} štete`,
  allDamageHealsForThatMuchInstead: (p) =>
    `sva šteta umjesto toga liječi za taj iznos, do ${p.cap} po pogotku`,
  theNextDamageOrLifeStealThat: (p) =>
    `sljedeća šteta ili krađa zdravlja koja bi ${p.selfOnly ? "te" : "ga"} ubila poništava se`,
  whenOneAllySIsSpentIt: () => "kad se potroši kod jednog saveznika, završava i kod svih ostalih",
  gainMoreStrikeStrikesOfAdrenalinePer: (p) =>
    `po pogotku dobiva ${p.extraStrikesPerHit} ${plural(p.extraStrikesPerHit2, "udarac", "udarca", "udaraca")} adrenalina više`,
  skillsRechargeFaster: (p) => `vještine se obnavljaju ${p.skillRechargeFaster} % brže`,
  skillsCostMoreLessEnergy: (p) =>
    `vještine stoje ${p.change} % ${p.change2 > 0 ? "više" : "manje"} energije`,
  spellsAndBindingRitualsRechargeFaster: (p) =>
    `čarolije i rituali vezivanja obnavljaju se ${p.faster} % brže`,
  spellsRechargeFaster: (p) => `čarolije se obnavljaju ${p.spellRechargeFaster} % brže`,
  bindingRitualsRechargeFaster: (p) => `rituali vezivanja obnavljaju se ${p.faster} % brže`,
  enchantmentsRechargeFaster: (p) => `začaranja (${p.name}) obnavljaju se ${p.faster} % brže`,
  hexTheTargetSYour: (p) => (p.category === "hex" ? "njegove" : "tvoje"),
  skillsHaveArmorPenetration: (p) => `vještine (${p.name}) imaju ${p.pierce} % probijanja oklopa`,
  yourTheBearerSSkillsCannotBe: (p) =>
    p.selfOnly
      ? "tvoje se vještine ne mogu prekinuti"
      : "nositeljeve se vještine ne mogu prekinuti",
  theNextTimeYouWouldBeInterrupted: () => "kad bi te sljedeći put nešto prekinulo, to se ne događa",
  youCannotBeInterruptedEachTimeYou: (p) =>
    `ne možeš biti prekinut; svaki put kad bi se to dogodilo, gubiš ${p.amount} energije ili ovo završava`,
  youCannotBeInterruptedEachTimeYou2: (p) =>
    `ne možeš biti prekinut; svaki put kad bi se to dogodilo, gubiš 1 začaranje (${p.profession}) ili ovo završava`,
  conditionsOnExpireFaster: (p) => `stanja na ${p.bearer} istječu ${p.faster} brže`,
  hexesOnExpireFaster: (p) => `uroci na ${p.bearer} istječu ${p.faster} % brže`,
  theNextHexOnLastsLonger: (p) => `sljedeći urok (${p.of}) na ${p.bearer} traje ${p.longer} dulje`,
  hexesCastOnTakeAsLongTo: (p) => `bacanje uroka na ${p.bearer} traje ${p.times}× dulje`,
  otherAlliesSpellsOnTakeAsLong: (p) =>
    `bacanje čarolija drugih saveznika na ${p.bearer} traje ${p.times}× dulje`,
  yourSpellsOnTakeAsLongTo: (p) => `bacanje tvojih čarolija na ${p.bearer} traje ${p.times}× dulje`,
  enchantmentsCastOnCostLessEnergyMinimum: (p) =>
    `začaranja na ${p.bearer} stoje ${p.less} manje energije, najmanje 1`,
  hitsWithAnAttack: () => "pogodi napadom",
  failsToHit: () => "promaši",
  hitsWithAnAttackSkill: () => "pogodi vještinom napada",
  skillEffectEndsIfYouUseA: (p) =>
    p.selfOnly || p.category === "skill-effect"
      ? "završava ako upotrijebiš vještinu"
      : "završava ako nositelj upotrijebi vještinu",
  endsIfYouUseAnAdrenalSkill: () => "završava ako upotrijebiš vještinu adrenalina",
  endsIfYouUseANonAdrenal: () => "završava ako upotrijebiš vještinu koja nije adrenalinska",
  endsIfYouUseANonSkill: (p) => `završava ako upotrijebiš vještinu koja nije ${p.kind}`,
  endsIfYouUseAnAttackSkill: () => "završava ako upotrijebiš vještinu napada",
  endsIfYouUseASkillOn: () => "završava ako na to upotrijebiš vještinu",
  endsIfYouUseASkillThat: (p) => `završava ako upotrijebiš vještinu koja nije ${p.NEXT_SKILL_KIND}`,
  hexHexedEnchanted: (p) => (p.category === "hex" ? "pod urokom" : "začaran"),
  becomesOr: (p) => `postane ${p.gained}`,
  theBearerIsDestroyedWhenItExpires: () => "nositelj se uništava kad istekne",
  theMinionsYouItTookBecomeMasterless: (p) =>
    `sluge koje si ${p.selfOnly ? "preuzeo" : "je preuzeo"} ostaju bez gospodara kad završi`,
  whenTheBearerDiesRisesWhereIt: (p) =>
    p.masterless === true
      ? `kad nositelj umre, ${p.stands} se diže na njegovu mjestu bez gospodara`
      : `kad umre, ${p.stands} se diže na njegovu mjestu`,
  composedKindBoundWhenOn: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.on],
  endsIfItEndsIfYou: (p) =>
    p.onFoe ? `završava ako ${p.when}` : `završava ako ${secondPerson(p.when)}`,
  all: (p) => (p.once && p.against === "all" ? blockAnswer(p.text) : p.text),
  whileHoldingAnItem: (p) =>
    p.onlyWhileHoldingItem && !p.holdingSaid ? `${p.stats}, dok se drži predmet` : p.stats,
  composedIndexText: (p) => (p.index === 0 ? p.text : capitalize(p.text)),
  listSentence: () => ". ",
  physicalAttacks: (p) =>
    p.weapon !== undefined ? weaponAttacks(p.weapon) : p.physicalOnly ? "fizički napadi" : "napadi",
  attackSkillsPhysicalAttacks: (p) => (p.attackSkillsOnly ? attackSkills(p.weapon) : p.value),
  foesYourHitGetFor: (p) =>
    `neprijatelji koje pogode tvoji ${p.attacks} dobivaju ${p.statusName} na ${p.durationSeconds}`,
  foesYourHitTake: (p) => `neprijatelji koje pogode tvoji ${p.attacks} primaju ${p.riderDamage}`,
  foesYourHitLose: (p) =>
    `neprijatelji koje pogode tvoji ${p.attacks} gube ${countOf(p.count, p.count2, p.category)}`,
  andSoDoFoesAdjacentToThem: (p) => `${p.pop}, kao i neprijatelji uz njih`,
  stealUpToHealth: (p) => `${p.attacks} kradu do ${p.amount} zdravlja`,
  yourPetSAttacksHealYouFor: (p) => `napadi tvojeg ljubimca liječe te za ${p.amount}`,
  yourInterruptFoesTheyHit: (p) => `tvoji ${p.attacks} prekidaju pogođene neprijatelje`,
  your: (p) => `tvoji ${p.attacks}: ${p.text}`,
  attackSkillsPhysicalAttacks2: (p) =>
    p.attackSkillsOnly
      ? attackSkills(p.weapon)
      : p.weapon === undefined
        ? "fizički napadi"
        : weaponAttacks(p.weapon),
  foesThatBlockYourGetFor: (p) =>
    `neprijatelji koji blokiraju tvoje ${p.attacks} dobivaju ${p.statusName} na ${p.durationSeconds}`,
  foesThatBlockYour: (p) => `neprijatelji koji blokiraju tvoje ${p.attacks}: ${lowerFirst(p.text)}`,
  damage: (p) => `${p.amount} ${damageNoun(p.type)}`,
  physical: () => "fizički",
  elemental: () => "elementarni",
  armor2: () => "oklopa",
  listSpace: () => " ",
  againstProjectileAttacks: (p) =>
    p.projectile ? `${armorAgainst(p.text)} protiv projektila` : armorAgainst(p.text),
  thatAllyIsHealedFor: (p) => `taj saveznik liječi se za ${p.amount}`,
  youLoseItsCasterLoses: (p) => (p.bearerIsCaster ? "gubiš" : "njegov bacač gubi"),
  energy2: (p) => `${p.who} ${p.amount} energije`,
  orSpell: (p) => `čarolija (${p.value})`,
  wheneverYouCastItCastsAnA: (p) =>
    `kad god ${p.bearerIsCaster ? "baciš" : "baci"} ${accusative(compound(p.spell))} na saveznika, ${p.value}`,
  composedKindBoundWhenEvent: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.event],
  youOrItOr: (p) => (p.bearerIsCaster ? p.phrases : p.phrases2),
  whenItOrOrAtOnce: (p) => (p.length === 0 ? p.death : `kad ${p.others}, ili odmah ${p.death}`),
  whenItOr: (p) => `kad ${p.on}`,
  composedBearerIsCaster: (p) => (p.bearerIsCaster ? YOUR_NEXT_SKILL : NEXT_SKILL),
  theNextTime: (p) => `kad sljedeći put ${p.doer}`,
  composedEventWhenOf: (p) =>
    p.event === "bearer-hits" ? "pogode" : p.event === "bearer-fails-to-hit" ? "promaše" : p.whenOf,
  wheneverYourArrowsOr: (p) => `kad god tvoje strijele ${p.on}`,
  wheneverOnACreatureWithLessHealth: (p) =>
    `kad god ${p.doer}${p.victimHasLessHealth === undefined ? "" : " na stvorenju s manje zdravlja"}`,
  and2: () => " i ",
  andAnd: (p) => (p.when === undefined ? p.each : `${p.when}: ${p.each}`),
  youItAnd: (p) => `${p.when}: ${p.bearerIsCaster ? "ti" : "on"} i ${p.answer}`,
  youAndAllPartyMembersAreHealed: (p) =>
    `${DROPPED}: ti i svi članovi družine liječe se za ${p.healed}`,
  composedWhat: (p) => `${DROPPED}: ${p.what}`,
  meleeHitsWithAMeleeAttackHits: (p) =>
    p.weapon === "melee" ? "pogodi napadom iz bliske borbe" : `pogodi ${WITH_WEAPON[p.weapon]}`,
  meleeIsHitByAFoeS: (p) =>
    p.weapon === "melee"
      ? "bude pogođen neprijateljskim napadom iz bliske borbe"
      : `bude pogođen neprijateljskim napadom ${WITH_WEAPON[p.weapon]}`,
  with3: (p) => `${TRIGGER_WHEN[p.event]} ${WITH_WEAPON[p.weapon]}`,
  youGainEnergy: (p) => `dobivaš ${p.amount} energije`,
  allYourSkillsAreRecharged: () => "sve su tvoje vještine obnovljene",
  yourPartyIsHealedFor: (p) => `tvoja družina liječi se za ${p.amount}`,
  takeDamage: (p) => `${lowerFirst(p.upTo)} primaju ${p.amount} ${damageNoun(p.type)}`,
  areHealedFor: (p) => `${lowerFirst(p.upTo)} liječe se za ${p.amount}`,
  composedUpToText: (p) => `${lowerFirst(p.upTo)}: ${lowerFirst(p.text)}`,
  ifTargetFoeDiesWhileHexedWith: (p) =>
    p.bearerIsFoe
      ? "ako ciljni neprijatelj umre dok je pod ovim urokom"
      : "ako saveznik umre dok je pod ovim začaranjem",
  and3: (p) => `${p.who}, ${p.flatMap}`,
  hasASpellInterrupted: () => "bude prekinut pri bacanju čarolije",
  isStruckForDamageWhileUsingA: (p) => `primi ${damageNamed(p.damageType)} dok koristi vještinu`,
  takesDamageFromAFoe: (p) => `primi od neprijatelja ${damageNamed(p.damageType)}`,
  takesMoreThanDamageFromAFoe: (p) => `primi od neprijatelja više od ${p.minDamage} štete`,
  hasItsHealthDroppedBelowByDamage: (p) => `padne zbog štete ispod ${p.healthBelow} % zdravlja`,
  isMoreThanFromYou: (p) => `udalji se više od ${p.apartBeyond} od tebe`,
  hitsWithAAttack: (p) => `pogodi ${CHAIN_WITH[p.chainRole]}`,
  isHitByAnAttackAAttack: (p) =>
    `bude pogođen ${p.role === undefined ? "napadom" : CHAIN_WITH[p.role]} svojeg bacača`,
  blocksAAttack: (p) =>
    `blokira ${p.blocked === "melee" ? "napad iz bliske borbe" : p.blocked === "projectile" ? "projektil" : p.blocked}`,
  losesAEnchantment: (p) => `izgubi začaranje (${p.name})`,
  hex2: (p) => compound(`${p.scopeAdjective} urok`),
  appliesAnAToAFoe: (p) => `baci ${accusative(compound(p.words))} na neprijatelja`,
  spell: (p) => (p.type === undefined ? "čarolija" : typeName(p.type)),
  onAllyAnAllyAFoe: (p) => ` na ${p.targets === "ally" ? "saveznika" : "neprijatelja"}`,
  castsAnA: (p) => `baci ${accusative(compound(p.words))}${p.on}`,
  non: (p) => `ne-${TYPE_OF[p.notType]}`,
  elite: () => "elitna",
  adrenal: () => "adrenalinska",
  skill: () => "vještina",
  isTargetedByYour: (p) =>
    `postane meta tvoje ${compound(p.words)
      .replace(/^vještina/, "vještine")
      .replace(/^čarolija/, "čarolije")}`,
  on: (p) => (p.targets === undefined ? "" : ` na ${TARGETS_WORDS[p.targets]}`),
  usesAnA: (p) => `upotrijebi ${accusative(compound(p.words))}${p.on}`,
  health2: (p) => `${p.amount} zdravlja`,
  energy3: (p) => `${p.amount} energije`,
  takeDamage2: (p) => `primaju ${p.amount} ${damageNoun(p.type)}`,
  loseAllAllS: (p) =>
    p.count === "all"
      ? `gube ${ALL_OF[CATEGORY[p.category].gender]} ${CATEGORY[p.category].pl}`
      : `gube ${p.value} ${categoryNoun(typeof p.count === "number" ? p.count : 5, p.category)}`,
  all2: (p) => `svi ${p.side}`,
  upTo: (p) => `do ${p.maxTargets} ${p.side}`,
  withinOfThatCreature: (p) =>
    AREA_AROUND_CREATED.get(p.radius) ?? `u krugu od ${p.radius2} oko tog stvorenja`,
  gain: (p) => `dobivaju ${p.answer}`,
  youGain: (p) => `${p.when}: ${p.gains ? `dobivaš ${p.answers}` : p.answers}`,
  onIt: () => "na njemu",
  damageOnIt: (p) => `${p.value}${p.amount} ${damageNoun(p.type)} ${p.perCount}`,
  composedWhenWhat: (p) => `${p.when}: ${p.what}`,
  itsAdjacentAllies: () => "njegovi susjedni saveznici",
  itsAlliesWithin: (p) => `njegovi saveznici ${p.area ?? `u krugu od ${p.radius}`}`,
  itsAdjacentAlliesItsAlliesWithin: (p) =>
    !p.bearerIsFoe ? `${lowerFirst(p.foesWithin)}${p.only}` : p.value,
  bearerBlocksMeleeMeleeProjectile: (p) =>
    p.on === "bearer-blocks-melee" ? "napad iz bliske borbe" : "projektil",
  whenYouBlockYouAndAlliesAre: (p) =>
    `kad blokiraš, ti i saveznici ${p.area} liječite se za ${p.amount}`,
  eachBlockCostsYouEnergyOrThis: (p) => `svaki blok te stoji ${p.amount} energije ili ovo završava`,
  youGainEnergyForEachSuccessfulAttack: (p) =>
    `dobivaš ${p.amount} energije po uspješno blokiranom: ${p.kind}`,
  wheneverYouBlockAAttackThisWay: (p) =>
    `kad god tako blokiraš ${p.kind}, napadač prima ${p.amount} ${damageNoun(p.type)}`,
  withinOfYouFoes: (p) =>
    `neprijatelji ${AREA_TEXT.get(p.radius) ?? `u krugu od ${p.radius2} oko tebe`}`,
  ifYouBlockAAttackSufferFrom: (p) =>
    `ako blokiraš ${p.kind}, ${p.foes} ${p.resolveMagnitudeAtRanks} s pate od: ${p.statusName}`,
  ifYouBlockAAttack: (p) => `ako blokiraš ${p.kind}, ${p.foes}: ${lowerFirst(p.text)}`,
  stealsHealthFromThatFoe: (p) => `krade tom neprijatelju ${p.amount} zdravlja`,
  loses: (p) => `gubi ${countOf(p.count, p.count2, p.category)}`,
  itTakesDamage: (p) => `prima ${p.amount} ${damageNoun(p.type)}`,
  takeDamage3: (p) => `${p.splashed} primaju ${p.amount} ${damageNoun(p.type)}`,
  thatAttackIsInterruptedAndAnd: (p) => `${p.when}, taj se napad prekida i ${p.hurt}`,
  itIsInterruptedAndYouLoseEnergy: (p) =>
    `${p.when}, prekida se, a ti gubiš ${p.amount} energije ili ovo završava`,
  ofThatSkillSBaseEnergyCost: (p) => `${p.share} osnovne cijene energije te vještine`,
  energy4: (p) => `${p.amount} energije`,
  youAreHealedAreHealedIsHealed: (p) =>
    p.bearerIsCaster && p.length === 0
      ? "liječiš se"
      : p.bearerIsCaster
        ? "liječe se"
        : "liječi se",
  forOfThatSkillSEnergyCost: (p) => `${p.healed} za ${p.share} cijene energije te vještine`,
  forWord: (p) => `${p.healed} za ${p.amount}`,
  plus: () => " plus ",
  youGainGainsPlus: (p) => `${p.bearerIsCaster ? "dobivaš" : "dobiva"} ${p.gains}`,
  theNearestOf: (p) => `najbliži od: ${p.splashed}`,
  upTo2: (p) => `do ${p.maxTargets} ${p.splashed}`,
  itAndLoseEnergy: (p) => `on i ${p.others} gube ${p.amount} energije`,
  bearerFoesFoesOtherFoes: (p) => (p.to === "bearer-foes" ? "neprijatelji" : "drugi neprijatelji"),
  inTheAreaSufferItToo: (p) => `${p.who} na području također to trpe`,
  ifASpellItThatSkill: (p) => (p.spellsOnly ? "ako je čarolija, ona" : "ta vještina"),
  takesThisSkillSSlotForSeconds: (p) => `${p.which} zauzima mjesto ove vještine na ${p.seconds} s`,
  youEnterTheSameStance: () => "ulaziš u isti stav",
  youLoseEnergyOrThisEnds: (p) => `gubiš ${p.amount} energije ili ovo završava`,
  thatAttackIsInterrupted: (p) => `${p.when}, taj se napad prekida`,
  takes: (p) => `prima ${p.dealt} ${p.when}`,
  bearerFatalDamageNegatedAnd: (p) => (p.on === "bearer-fatal-damage-negated" ? "i" : `${p.when},`),
  theFoeWhoDealtItTakesDamage: (p) =>
    `${p.then} neprijatelj koji ju je nanio prima ${p.amount} ${damageNoun(p.type)}`,
  thatAttackerIsHealedFor: (p) => `${p.when}, taj se napadač liječi za ${p.amount}`,
  bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p) =>
    p.on === "bearer-gains-enchantment" ? "začaranja" : "uroka ili začaranja",
  theCasterOfThatTakesDamage: (p) =>
    `${p.when}, bacač tog ${p.gained} prima ${p.amount} ${damageNoun(p.type)}`,
  theHealerTakesDamage: (p) => `${p.when}, iscjelitelj prima ${p.amount} ${damageNoun(p.type)}`,
  ofThatTarget: (p) => `${lowerFirst(p.upTo)} tog cilja ${p.what}${p.paid}`,
  healsItsCasterFor: (p) => `liječi svojeg bacača za ${p.amount}, ${p.when}`,
  itsCasterGainsEnergy: (p) => `njegov bacač dobiva ${p.amount} energije, ${p.when}`,
  theNextSkillYouUseItUses: (p) =>
    `sljedeća vještina koju ${p.bearerIsCaster ? "upotrijebiš" : "upotrijebi"} obnavlja se ${p.seconds} s dulje`,
  itsCasterStealsHealth: (p) => `njegov bacač krade ${p.amount} zdravlja, ${p.when}`,
  theNearestOfTakes: (p) => `najbliži od: ${p.allies} prima`,
  take: (p) => `${p.allies} primaju`,
  upToTake: (p) => `do ${p.maxTargets} ${p.allies} prima`,
  composedAlliesText: (p) => `${p.allies}: ${lowerFirst(p.text)}`,
  onAFoe: (p) => `${p.when} na neprijatelju`,
  adjacentToYou: () => "uz tebe",
  withinAroundYou: (p) => `${p.area ?? `u krugu od ${p.radius}`} oko tebe`,
  otherAdjacentToYouWithinAroundYou: (p) =>
    `${p.includesCentre === true ? "" : "drugi "}${SPLASH_SIDE[p.hits]} ${p.value}`,
  takeDamage4: (p) => `${p.yours}, ${p.reached} primaju ${p.amount} ${damageNoun(p.type)}`,
  composedYoursReachedText: (p) => `${p.yours}, ${p.reached}: ${lowerFirst(p.text)}`,
  composedBearerIsCasterSaid: (p) =>
    p.bearerIsCaster
      ? yourCondition(p.said)
      : p.said.replace(/^Ako cilj /, "Ako ").replace(/^Ako je cilj /, "Ako je "),
  composedWhenConditionText: (p) => `${p.when}, ${p.condition}: ${lowerFirst(p.text)}`,
  bearer: (p) => lowerFirst(p.target === "bearer" ? p.bearer : p.text),
  nextAttackSkill: (p) => `sljedeća vještina napada: ${p.statusName} ${p.durationSeconds}`,
  nextAttackSkill2: (p) => `sljedeća vještina napada: ${p.text}`,
  skillTargetAroundItsTarget: (p) => (p.at === "skill-target" ? " (oko njezina cilja)" : ""),
  withYourNext: (p) => `uz sljedeće: ${p.next}${p.around}: ${lowerFirst(p.text)}`,
  costsCostEnergy: (p) => `${p.one ? "stoji" : "stoje"} ${p.energyBase} energije`,
  costsCostLessEnergy: (p) => `${p.one ? "stoji" : "stoje"} ${p.energyPercentOff} manje energije`,
  costsCostLessEnergyMinimum: (p) =>
    `${p.one ? "stoji" : "stoje"} ${p.energyDiscount} manje energije (najmanje ${p.energyFloor})`,
  costsCostMoreEnergy: (p) => `${p.one ? "stoji" : "stoje"} ${p.energySurcharge} više energije`,
  castsCastInstantly: (p) => `${p.one ? "baca se" : "bacaju se"} odmah`,
  castsCastFaster: (p) => `${p.one ? "baca se" : "bacaju se"} ${p.activationMultiplier} brže`,
  takesTakeAsLongToCast: (p) =>
    `${p.one ? "baca se" : "bacaju se"} ${p.activationMultiplier}× dulje`,
  castsCastFaster2: (p) => `${p.one ? "baca se" : "bacaju se"} ${p.activationSecondsLess} brže`,
  rechargesRechargeFaster: (p) =>
    `${p.one ? "obnavlja se" : "obnavljaju se"} ${p.rechargeFaster} brže`,
  rechargesRechargeSlower: (p) =>
    `${p.one ? "obnavlja se" : "obnavljaju se"} ${p.rechargeSlower} sporije`,
  lastsLastLongerShorter: (p) =>
    `${p.one ? "traje" : "traju"} ${p.durationMultiplier} ${p.durationMultiplier2 > 1 ? "dulje" : "kraće"}`,
  healsHealLessMoreNotTheDivine: (p) =>
    `${p.one ? "liječi" : "liječe"} ${p.value} ${p.healMultiplier < 1 ? "manje" : "više"}${p.sparesDivineFavor ? ", ne bonus Božanske milosti" : ""}`,
  isAreNotEasilyInterrupted: (p) => `${p.one ? "nije se lako" : "nije ih lako"} prekinuti`,
  overcastYouBy: (p) => `uzrokuju ti ${p.overcastPerUse} prenaprezanja`,
  andAttack: (p) =>
    p.chainRoles
      .replace(/\boff-hand\b/g, "napad sporednom rukom")
      .replace(/\bdual\b/g, "dvostruki napad")
      .replace(/\blead\b/g, "uvodni napad"),
  attackSkillSkill: (p) =>
    p.weapon !== undefined
      ? `vještina napada ${WEAPON_GENITIVE[p.weapon]}`
      : p.type === undefined
        ? "vještina"
        : spaced(p.type),
  hexHexesS: (p) => (p.one ? p.kind : pluralNoun(p.kind)),
  thatTargetsAFoeThatTargetA: () => "protiv neprijatelja",
  thatTargetsYouThatTargetYou: () => "na tebe",
  halfRanged: () => "polovičnog dometa",
  notFlashEnchantments: (p) => (p.notFlash ? " (ne bljeskovna začaranja)" : ""),
  whileHoldingAnItem2: (p) => (p.whileHoldingItem ? "dok držiš predmet, " : ""),
  nextNext: (p) =>
    p.one
      ? `${p.whose === "tvoje" ? "tvoja" : "njegova"} sljedeća`
      : `${p.whose} sljedeće ${p.uses}`,
  cannotBeInterrupted: () => "ne može se prekinuti",
  cannotBeBlocked: () => "ne može se blokirati",
  costsLessEnergy: (p) => `stoji ${p.energyDiscount} manje energije`,
  castsInstantly: () => "baca se odmah",
  rechargesInstantly: () => "obnavlja se odmah",
  s2: (p) => `${p.value} s`,
  takesSLongerToRecharge: (p) => `obnavlja se ${p.extraRechargeSeconds} dulje`,
  yourNextAnd: (p) => `sljedeće: ${p.NEXT_SKILL_KIND} ${p.does}`,
  youLoseAllEnergyAsItIs: () => "pri bacanju gubiš svu energiju",
  youGainOfItsEnergyCost: (p) => `dobivaš ${p.energyGainOfCost} njezine cijene energije`,
  itRechargesFaster: (p) => `obnavlja se ${p.fraction} % brže`,
  rechargesInstantly2: (p) => `${p.name} se obnavlja odmah`,
  forYourNextSkill: () => "za tvoju sljedeću vještinu",
  ifItIsAAnd: (p) => `ako je to ${p.kind}, ${p.does}`,
  suffer: (p) => `trpe ${p.sufferedWhat}`,
  forWord2: (p) => `${p.statusName} na ${p.durationSeconds} (${p.status})`,
  a: (p) => `${CATEGORY[p.category].acc} (${p.owners})`,
  ifItInterruptsASkill: () => "Ako prekine vještinu",
  ifThatActionWasASpell: () => "Ako je ta radnja bila čarolija",
  ifThatActionWasAnAttack: () => "Ako je ta radnja bila napad",
  ifItKillsTheTarget: () => "Ako ubije cilj",
  ifItResurrects: () => "Ako oživi",
  ifASpiritDiedInThisWay: () => "Ako je pritom umro duh",
  ifWasRemoved: (p) => `Ako je uklonjeno: ${CATEGORY[p.category].one}`,
  ifItRemoves: (p) => `Ako ukloni ${aCategory(p.category)}`,
  ifTargetIsBelowHealth: (p) => `Ako cilj ima manje od ${p.fraction} % zdravlja`,
  ifTargetIsAboveHealth: (p) => `Ako cilj ima više od ${p.fraction} % zdravlja`,
  ifYouHaveLessThanHealth: (p) => `Ako imaš manje od ${p.fraction} % zdravlja`,
  ifYouHaveLessHealthThanYour: () => "Ako imaš manje zdravlja od svojeg ljubimca",
  ifYourPetHasLessHealthThan: () => "Ako tvoj ljubimac ima manje zdravlja od tebe",
  ifItFollowsOffHandAnOff: (p) => `Ako slijedi ${CHAIN_AFTER[p.role]}`,
  ifTargetHas: (p) => `Ako cilj ima ${p.filteredCategory}`,
  ifTargetHasOr: (p) => `Ako cilj ima ${p.categories}`,
  ifYouHave: (p) => `Ako imaš ${aCategory(p.category)}`,
  ifYouHaveA: (p) => `Ako imaš ${CATEGORY[p.category].acc} (${p.name})`,
  other: (p) => (p.excluding === undefined ? "" : "drugi "),
  ifYouHaveNo: (p) => `Ako nemaš ${noOther(p.category, p.other)}`,
  ifYouHaveNo2: (p) => `Ako nemaš ${noOther(p.category, p.other, p.name)}`,
  ifTargetIsCastingASpellOr: (p) =>
    p.orChant === true ? "Ako cilj baca čaroliju ili pjev" : "Ako cilj baca čaroliju",
  ifTargetIsUsingASkill: () => "Ako cilj koristi vještinu",
  ifTargetHasNoOtherHex: (p) => `Ako cilj nema drugi urok (${p.name})`,
  ifTargetIsNotAdjacentToAny: () => "Ako cilj nije uz nijednog saveznika",
  ifTargetIsNotNearAnyAllies: () => "Ako cilj nema saveznika u blizini",
  ifTargetHasNoAlliesWithin: (p) => `Ako cilj nema saveznika u krugu od ${p.radius}`,
  ifTargetIsNearAnyOfYour: () => "Ako je cilj u blizini nekog od tvojih saveznika",
  ifAnyOfYourAlliesIsWithin: (p) =>
    `Ako je neki od tvojih saveznika u krugu od ${p.radius} oko cilja`,
  ifTargetIsWithinEarshot: () => "Ako je cilj na dohvat glasa",
  ifTargetIsWithinOfYou: (p) => `Ako je cilj u krugu od ${p.radius} oko tebe`,
  ifTargetIsNotMoving: () => "Ako cilj miruje",
  ifTargetIsKnockedDown: () => "Ako je cilj oboren",
  ifTargetIsMoving: () => "Ako je cilj u pokretu",
  ifTargetIsAFoe: () => "Ako je cilj neprijatelj",
  ifTargetIsMovingFasterThanNormal: () => "Ako je cilj brži nego inače",
  ifAnyFoeIsKnockedDownIf: (p) =>
    p.knockedDown === true
      ? `Ako je neki neprijatelj ${p.where} oboren`
      : `Ako je neki neprijatelj ${p.where}`,
  ifYouHitOrMoreFoes: (p) => `Ako pogodiš barem ${p.atLeast} neprijatelja`,
  ifNumberOrMore: (p) => `Ako je broj: ${p.countAll} barem ${p.atLeast}`,
  ifAreNoMoreThan: (p) => `Ako broj: ${p.countAll} nije veći od broja: ${p.countAll2}`,
  ifTargetHas2: (p) => `Ako cilj ima ${p.statusName}`,
  ifTargetDoesNotHave: (p) => `Ako cilj nema ${p.statusName}`,
  ifYouHaveMoreEnergyThanTarget: () => "Ako imaš više energije od cilja",
  ifYouHaveLessThanEnergy: (p) => `Ako imaš manje od ${p.amount} energije`,
  ifYouAreOvercast: () => "Ako si prenapregnut",
  ifYouWield: (p) => `Ako držiš ${NEEDED_WEAPON[p.weapon]}`,
  ifYouHoldAShield: () => "Ako držiš štit",
  ifYouAreHoldingAnItem: () => "Ako držiš predmet",
  ifTargetHasLessHealthThanYou: () => "Ako cilj ima manje zdravlja od tebe",
  ifTargetHasMoreHealthThanYou: () => "Ako cilj ima više zdravlja od tebe",
  ifTargetIsAttacking: () => "Ako cilj napada",
  ifTargetIsNotAttacking: () => "Ako cilj ne napada",
  ifTargetIsCastingASpellOr2: () => "Ako cilj baca čaroliju ili napada",
  ifTargetIsASummonedCreature: () => "Ako je cilj prizvano stvorenje",
  ifNoSpiritIsWithinOfYou: (p) =>
    `Ako nema duha ${AREA_TEXT.get(p.radius) ?? `u krugu od ${p.radius2}`}`,
  ifASpiritIsWithinOfYou: (p) =>
    `Ako je duh ${AREA_TEXT.get(p.radius) ?? `u krugu od ${p.radius2}`}`,
  ifYouControlOrFewerS: (p) =>
    `Ako kontroliraš najviše ${p.count} ${p.creature === "spirit" ? "duhova" : p.creature === "minion" ? "sluga" : pluralNoun(spaced(p.creature))}`,
  ifASpiritOrACorpseIs: (p) =>
    `Ako je duh ili leš ${AREA_TEXT.get(p.radius) ?? `u krugu od ${p.radius2}`}`,
  ifAnAllyIsDeadWithin: (p) => `Ako je saveznik ${within(p.radius, p.radius2)} mrtav`,
  ifTargetIsNearACorpseOr: () => "Ako je cilj u blizini leša ili mu je ljubimac mrtav",
  ifTargetIsWithinOfACorpse: (p) =>
    `Ako je cilj u krugu od ${p.radius} oko leša ili mu je ljubimac mrtav`,
  composedType: (p) => (p.type === undefined ? "" : typeWord(p.type)),
  healthForEachAllyMax: (p) => `, +${p.amount} zdravlja po savezniku ${p.area} (najviše ${p.max})`,
  allPartyMembers: () => "Svi članovi družine",
  allItsPartyMembers: () => "Svi članovi njegove družine",
  allAlliedMinions: () => "Sve savezničke sluge",
  yourOtherMinions: () => "Tvoje druge sluge",
  within2: (p) => `${p.Who} ${p.area ?? `u krugu od ${p.radius}`}`,
  adjacent: (p) => placed("uz tebe", p.who),
  nearby: (p) => `${capitalize(p.who)} u blizini`,
  within3: (p) => (p.area === undefined ? `${p.Who} u krugu od ${p.radius}` : `${p.Who} ${p.area}`),
  loseThatSame: (p) => `gube to isto ${CATEGORY[p.category].one}`,
  loseAllAll: (p) =>
    `gube ${ALL_OF[CATEGORY[p.category].gender]} ${categoryNoun("all", p.category)}`,
  onThem: () => "na njima",
  loseOneForEachOnThem: (p) => `gube jedan ${CATEGORY[p.category].one} po ${p.countEach}`,
  lose: (p) => `gube ${countOf(p.count, p.count2, p.category)}`,
  enchantmentAnA: (p) => (p.onlyBearing === undefined ? "" : CATEGORY[p.onlyBearing].acc),
  with4: (p) => (p.onlyBearing === undefined ? "" : ` s ${CATEGORY[p.onlyBearing].loc}`),
  usingSkills: (p) =>
    p.onlyUsing === undefined ? "" : `, koji koriste vještine: ${TYPE_OF[p.onlyUsing]}`,
  dead: (p) => (p.dead === true ? `Mrtvi ${lowerFirst(p.living)}` : p.living),
  targetAndCasterAroundYouCasterAround: (p) =>
    `${p.includesCentre === true ? `Cilj i ${lowerFirst(p.reached)}` : p.reached}${p.around === "caster" ? " oko tebe" : ""}${p.alsoAround === "caster" ? " oko cilja i tebe" : ""}${p.bearing}${p.using}${p.onlyIf}`,
  upTo3: (p) => `Do ${p.maxTargets} ${lowerFirst(p.who)}`,
  inItsRange: () => "u njegovu dometu",
  inTheArea: () => "na području",
  foes: () => "neprijatelji",
  allEveryoneYouAndAlliesAllies: (p) =>
    p.affects === "all" ? "svi" : p.includesCaster ? "ti i saveznici" : "saveznici",
  enemiesFoesAllEveryoneYouAndAllies: (p) => `${p.value} ${within(p.radius, p.radius2)}`,
  whenSprung: () => "pri aktiviranju",
  after: (p) => `nakon ${seconds(p.delaySeconds)}`,
  everyFor: (p) => `svakih ${seconds(p.everySeconds)}, tijekom ${seconds(p.count)}`,
  whenItEnds: (p) => `Kad završi, ${p.whom}: `,
  springsByItselfAsItsTimeRuns: () => "Aktivira se sama kad joj istekne vrijeme",
  composedWhoText: (p) => `${capitalize(p.who)}: ${lowerFirst(p.text)}`,
  composedEndingText: (p) => `${p.ending}${lowerFirst(p.text)}`,
  composedConditionText: (p) => `${p.condition}: ${lowerFirst(p.text)}`,
  itsAttacksDealDamage: (p) => `Njegovi napadi nanose ${p.magnitude} štete`,
  thisSpiritLosesHealth: (p) => `ovaj duh gubi ${p.magnitude} zdravlja`,
  composedCondition: (p) => `${lowerFirst(p.condition)}: `,
  itsAttacks: (p) => `Njegovi napadi: ${p.when}${p.what}`,
  health3: (p) => `${p.health} zdravlja`,
  health4: (p) => `${p.health} zdravlja (${p.health2})`,
  level: (p) => `razina ${p.marked}, `,
  lastsSeconds: (p) => `, traje ${p.durationSeconds} s`,
  composedCountNameLevelTextHealthTextLasts: (p) =>
    `${p.count} ${p.name} (${p.levelText}${p.healthText}${p.lasts})`,
  itsAttacksDealDamage2: (p) => `Njegovi napadi nanose ${p.value} štete`,
  onlyOneAtATimeANew: () => "Samo jedan u isto vrijeme: novi ubija starog",
  leavesCorpseCorpsesWhenItDies: (p) =>
    `Pri smrti ostavlja ${p.corpses} ${plural(p.current, "leš", "leša", "leševa")}`,
  whenItDiesStandsUpInIts: (p) => `Kad umre, ${p.text} se diže na njegovu mjestu`,
  listSemicolon: () => "; ",
  inItsRange2: (p) => AREA_TEXT.get(p.radius) ?? "u njegovu dometu",
  composedAffectsWhere: (p) => `${AURA_WHO[p.affects]} ${p.where}`,
  whenItDiesUnderHealthBeginFor: (p) =>
    `Kad umre, ${p.who} ispod ${p.below} zdravlja dobivaju ${p.statusName} na ${p.duration} s`,
  whenItDiesDeadPartyMembersAre: (p) =>
    `Kad umre, mrtvi članovi družine ${p.where} oživljavaju s ${p.health} % zdravlja i bez energije`,
  damageTakeDamageAreHealedForHealth: (p) =>
    p.effect === "damage" ? `primaju ${p.amount} štete` : `liječe se za ${p.amount} zdravlja`,
  max: (p) => ` (najviše ${p.max})`,
  whenItDiesPerSecondItLived: (p) => `Kad umre: ${p.who} ${p.what} po sekundi života${p.max}`,
  everySecondsHealsTheMostHurtNon: (p) =>
    `Svakih ${p.everySeconds} s: liječi najranjenijeg saveznika ${p.where} koji nije duh za ${p.heal} zdravlja`,
  whenANonSpiritDiesInIts: () => "Kad u njegovu dometu umre nešto što nije duh",
  nearby2: (p) => AREA_TEXT.get(p.radius) ?? "u blizini",
  itsConditionsSpreadToEachNonSpirit: (p) =>
    `${p.when}, njegova stanja prelaze na svako stvorenje ${p.where} koje nije duh i ima stanje`,
  eachOfItsTypeInItsRange: (p) =>
    `${p.when}, svako stvorenje njegove vrste u dometu s manje od ${p.below} zdravlja prima ${p.damage} štete`,
  holdingAnItem: (p) => (p.onlyWhileHoldingItem ? ", koji drže predmet" : ""),
  composedWhoWhereHoldingStatus: (p) => `${p.who} ${p.where}${p.holding}: ${p.status}`,
  perFoeHit: (p) => (p.perTarget === undefined ? "" : " po pogođenom neprijatelju"),
  forEachMeleeAttackSkillOnYour: (p) =>
    ` po vještini napada iz bliske borbe na tvojoj traci (najviše ${p.max})`,
  withinEarshot: (p) => (p.area === "na dohvat glasa" ? "na dohvat glasa" : p.area),
  forEverySummonedCreatureYouControlMaximum: (p) =>
    ` po prizvanom stvorenju ${p.where} pod tvojom kontrolom (najviše ${p.max} energije)`,
  composedZeroAloneEachText: (p) => (p.zero ? `${p.alone} ${p.each}` : `${p.text}, +${p.each}`),
  maximum: (p) => ` (najviše ${p.max})`,
  forEach: (p) => `po ${p.countEach}${p.max}`,
  pointOfEnergyGained: () => "dobivenom bodu energije",
  pointOfEnergyRestrictedByOvercast: () => "bodu energije blokiranom prenaprezanjem",
  skillDisabledInThisWay: () => "vještini tako onemogućenoj",
  orCasterOnYou: (p) =>
    `${categoryIds(p.categories)} ${p.on === "caster" ? "na tebi" : p.onTarget}`,
  ofYourRecharging: (p) => `tvojih ${p.rechargingSkillsNoun} koje se obnavljaju`,
  pointOfEnergyCasterYouHaveThey: (p) => `bodu energije koji ${p.on === "caster" ? "imaš" : "ima"}`,
  orRemoved: (p) => `uklonjeno: ${categoryIds(p.categories)}`,
  orLost: (p) => `izgubljeno (${p.name}): ${categoryIds(p.categories)}`,
  enchantmentYouAreMaintaining: () => "začaranju koje održavaš",
  secondItWasInEffect: () => "sekundi trajanja učinka",
  foeKnockedDown: () => "oborenom neprijatelju",
  youHaveEquipped: (p) => `${spaced(p.type)} na tvojoj traci`,
  adrenalineSkillTheyHave: () => "adrenalinskoj vještini koju ima",
  foeHit: () => "pogođenom neprijatelju",
  within4: (p) => `${p.perCountNoun} ${within(p.radius, p.radius2)}`,
  attacksSkillsS: (p) =>
    p.weapon !== undefined
      ? weaponAttacks(p.weapon)
      : p.type === undefined
        ? "vještine"
        : pluralNoun(spaced(p.type)),
  casterYourTargetS: (p) => (p.on === "caster" ? "tvoja" : "njegova"),
  s3: (p) => pluralNoun(p.perCountNoun),
  pointOfOvercast: () => "bod prenaprezanja",
  skillDisabled: () => "onemogućena vještina",
  rechargingSkill: () => "vještina koja se obnavlja",
  pointOfEnergy: () => "bod energije",
  removedOr: (p) => `uklonjeno: ${categoryIds(p.categories)}`,
  removedOr2: (p) => `uklonjeno (${p.name}): ${categoryIds(p.categories)}`,
  maintainedEnchantment: () => "održavano začaranje",
  secondHeld: () => "sekunda držanja",
  adrenalineSkill: () => "adrenalinska vještina",
  deadAlly: () => "mrtvi saveznik",
  knockedDownFoeFoe: (p) => (p.knockedDown === true ? "oboreni neprijatelj" : "neprijatelj"),
  ally: () => "saveznik",
  neverAbove: (p) => `, nikad iznad ${p.upTo}`,
  forEachRemoved: (p) =>
    p.toTarget === true || p.perRemoved === undefined
      ? ""
      : ` po uklonjenom: ${CATEGORY[p.perRemoved].one}`,
  perPointLost: (p) => (p.perEnergyLost === undefined ? "" : " po izgubljenom bodu"),
  armorPenetration: (p) => ` (${p.armorPenetration} % probijanja oklopa)`,
  dealsDamage2: (p) =>
    `Nanosi ${p.magnitude} ${damageNoun(p.type)}${p.perPointLost}${p.penetration}`,
  deals: () => "Nanosi",
  damage2: (p) => ` ${damageNoun(p.type)}`,
  composedCountedConditionAmount: (p) => `${p.counted}; ${lowerFirst(p.condition)}: +${p.amount}`,
  gainHealthEqualToThisSpellS: () => "Dobij zdravlje jednako bonusu Božanske milosti ove čarolije",
  healsIfRelievedOf: (p) => `Liječi ${p.amount} ako se oslobodi: ${p.name}`,
  healsForOfYourCurrentHealthMaximum: (p) =>
    `Liječi za ${p.magnitude} tvojeg trenutnog zdravlja (najviše ${p.max} zdravlja)`,
  youGainHealth: (p) => `Dobivaš ${p.amount} zdravlja`,
  yourPetGainsHealth: (p) => `Tvoj ljubimac dobiva ${p.amount} zdravlja`,
  ownerHealsItsOwnerForHealsFor: (p) =>
    p.recipient === "owner" ? `Liječi svojeg vlasnika za ${p.amount}` : `Liječi za ${p.amount}`,
  healsForEachRemovedHealsForEach: (p) =>
    p.perRemoved !== undefined
      ? `Liječi ${p.amount} po uklonjenom: ${CATEGORY[p.perRemoved].one}`
      : p.perDestroyedSpirit === true
        ? `Liječi ${p.amount} po uništenom duhu`
        : p.perEnergyLost === true
          ? `${p.recipient === "caster" ? "Liječiš se za" : "Liječi za"} ${p.amount} po izgubljenom bodu energije`
          : p.perUsedSkillEnergy === true
            ? `Liječi za ${p.magnitude} cijene energije čarolije`
            : p.value,
  casterYouGainHeals: (p) => (p.recipient === "caster" ? "Dobivaš" : "Liječi"),
  health5: () => " zdravlja",
  casterOnTargetFoeOnThem: (p) =>
    p.recipient === "caster" ? "na ciljnom neprijatelju" : "na njima",
  underHealth: (p) => `, ispod ${p.onlyBelowHealthFraction} % zdravlja`,
  gainOfTheSkillSBaseEnergy: (p) => `Dobij ${p.magnitude} osnovne cijene energije vještine`,
  targetGainsOwnerYouGainGain: (p) =>
    p.toTarget === true ? "Cilj dobiva" : p.recipient === "owner" ? "Dobivaš" : "Dobij",
  energy5: (p) =>
    `${p.gains} ${p.magnitude} energije${p.perPointLost}${p.perFoeHit}${p.perOwnCreature}${p.perRemoved}`,
  energy6: () => " energije",
  gain2: () => "Dobij",
  onTargetFoe: () => "na ciljnom neprijatelju",
  strikeStrikesOfAdrenalineAdrenaline: (p) =>
    p.units
      ? `${p.magnitude} ${plural(p.current, "udarac", "udarca", "udaraca")} adrenalina`
      : `${p.magnitude} adrenalina`,
  youGain2: () => "Dobivaš",
  targetTargetGainsGain: (p) => (p.recipient === "target" ? "Cilj dobiva" : "Dobij"),
  strikesOfAdrenaline: () => " udaraca adrenalina",
  targetRegainsAllEnergy: () => "Cilj vraća svu energiju",
  casterYouLoseTargetLoses: (p) => (p.on === "caster" ? "Gubiš" : "Cilj gubi"),
  energy7: (p) => `${p.who} ${p.magnitude} energije`,
  stealsUpToEnergy: (p) => `Krade do ${p.magnitude} energije`,
  stealsUpToHealth: (p) => `Krade do ${p.magnitude} zdravlja`,
  youStealHealth: (p) => `Kradeš ${p.magnitude} zdravlja`,
  youSacrificeOfYourMaximumHealth: (p) =>
    `Žrtvuješ ${p.percentOfMax} % svojeg maksimalnog zdravlja`,
  targetFoeLosesHealth: (p) => `Neprijateljski cilj gubi ${p.magnitude} zdravlja`,
  targetFoeLoses: () => "Neprijateljski cilj gubi",
  youLoseHealth: (p) => `Gubiš ${p.magnitude} zdravlja`,
  forEachEnchantmentRemoved: (p) => `${p.lose} po uklonjenom začaranju (${p.whose})`,
  loseAllButHealth: (p) => `Izgubi sve zdravlje osim ${p.magnitude}`,
  transferOfYourConditionsToFoes: (p) => `Prenosi ${p.magnitude} tvojih stanja na: ${p.foesWithin}`,
  max2: (p) => (p.maxSeconds === undefined ? "" : ` (najviše ${seconds(p.maxSeconds)})`),
  withTheTimeEachHasLeft: () => "s preostalim vremenom svakog",
  withMoreTime: (p) => `s ${p.extend} % više vremena${p.max}`,
  foesGetTheTargetSConditionsWith: (p) => `${p.foesWithin} dobivaju stanja cilja, ${p.value}`,
  loseYourHealthHealForOfIt: (p) =>
    `Izgubi ${shareOfYourHealth(p.fractionOfCurrent)}; izliječi se za ${p.magnitude} % toga`,
  whoeverOfYouAndTargetFoeHas: () =>
    "Tko od tebe i ciljnog neprijatelja ima više zdravlja gubi polovicu razlike; drugi dobiva isto toliko",
  stacksOnceForEachOnThem: (p) => `. Slaže se jednom po ${p.countEach}`,
  stacksOnceForEachOnThem2: (p) => p.status + p.value,
  forWord3: (p) => `${p.what} na ${p.durationSeconds}`,
  forEachHexRemoved: (p) => ` po uklonjenom uroku (${p.name}))`,
  stackingOnceForEachOnThem: (p) => `, slaže se jednom po ${p.countEach}`,
  appliesCasterToYouForUntilIt: (p) =>
    `Primjenjuje ${p.statusName}${p.on === "caster" ? " na tebe" : ""} ` +
    (p.ends ? `na ${p.statusDuration} ` : "dok ne završi ") +
    `(${p.status}` +
    p.value +
    p.value2,
  composedStatusNameDurationSeconds: (p) => `${p.statusName} (${p.durationSeconds})`,
  appliesOneOfAtRandom: (p) => `Nasumično primjenjuje jedno od: ${p.choices}`,
  maintainedCasterOnYouEnergyRegenerationWhile: (p) =>
    `Održava se${p.on === "caster" ? " na tebi" : ""}: −1 regeneracije energije dok traje. ` +
    `${capitalize(p.what)}.`,
  losesThatSame: (p) => `Gubi to isto ${CATEGORY[p.category].one}`,
  casterLoseRemoves: (p) => (p.from === "caster" ? "Izgubi" : "Uklanja"),
  oneForEachRemovedMax: (p) =>
    `${p.verb} jedan ${CATEGORY[p.category].one} po uklonjenom: ${CATEGORY[p.category2].one} (najviše ${p.max})`,
  oneForEachOnTarget: (p) => `${p.verb} jedan ${CATEGORY[p.category].one} po ${p.countEach}`,
  lose2: (p) =>
    p.count2 === "all"
      ? `Izgubi ${ALL_OF[CATEGORY[p.category].gender]} ${categoryNoun("all", p.category)}${p.whose.trim() === "" ? "" : ` (${p.whose.trim()})`}`
      : `Izgubi ${p.count} ${categoryNoun(p.count2, p.category)}${p.whose.trim() === "" ? "" : ` (${p.whose.trim()})`}`,
  endsTheTargetSStance: () => "Završava stav cilja",
  forEachSpiritWithinOfIt: (p) =>
    ` po duhu ${AREA_AROUND_TARGET.get(p.near) ?? `u krugu od ${p.near2} oko cilja`}`,
  numberUpTo: (p) => (typeof p.count === "number" && p.count > 1 ? "do " : ""),
  and4: (p) => (p.orCategory === undefined ? "" : ` i ${categoryNoun(p.count, p.orCategory)}`),
  removes: (p) =>
    `Uklanja ${p.upTo}${countOf(p.count, p.count2, p.category)}${p.whose.trim() === "" ? "" : ` (${p.whose.trim()})`}${p.and}${p.perSpirit}`,
  interruptsTheTargetSSpellIfThey: () => "Prekida čaroliju cilja ako je baca",
  interruptsTheTargetSSpellOrChant: () => "Prekida čaroliju ili pjev cilja ako ih baca",
  skillInterruptsTheTargetSSkillIf: (p) =>
    p.only === "skill"
      ? "Prekida vještinu cilja ako je koristi"
      : "Prekida radnju cilja: vještinu ili napad",
  youAreKnockedDownFor: (p) => `Oboren si ${seconds(p.durationSeconds)}`,
  knocksDownFor: (p) => `Obara na ${seconds(p.durationSeconds)}`,
  shadowStepsToTheTarget: () => "Korača kroz sjene do cilja",
  youAndTheTargetShadowStepTo: () => "Ti i cilj korakom kroz sjene mijenjate mjesta",
  corpseTeleportsYouToThatCorpseShadow: (p) =>
    p.to === "corpse"
      ? "Teleportira te do tog leša"
      : "Korača kroz sjene na obližnje mjesto ravno od tvojeg cilja",
  health6: (p) => `${p.percent} % zdravlja`,
  upToYourCurrentHealthYourHealth: (p) =>
    p.casterLosesFractionOfCurrent === 0
      ? "do tvojeg trenutnog zdravlja"
      : `tvojim zdravljem nakon gubitka ${shareOfYourHealth(p.casterLosesFractionOfCurrent)}`,
  perPartyMemberWithin: (p) => ` po članu družine ${within(p.radius, p.radius2)}`,
  casterAndTeleportsTheTargetToYou: (p) => (p.at === "caster" ? " i teleportira cilj do tebe" : ""),
  returnsTheTargetToLifeWithAnd: (p) =>
    `Vraća cilj u život s ${p.healthText} i ${p.energy} % energije${p.per}${p.teleport}`,
  returnsEveryDeadAlliedPetToLife: (p) =>
    `Oživljava svakog mrtvog savezničkog ljubimca ${p.where} s ${p.health} % zdravlja`,
  youLoseAllYourRemainingEnergy: () => "Gubiš svu preostalu energiju",
  youGainFor: (p) => `Dobivaš ${p.statusName} na ${seconds(p.durationSeconds)} (${p.status})`,
  yourPetGainsFor: (p) => `Tvoj ljubimac dobiva ${p.statusName} na ${p.duration} (${p.status})`,
  yourPetMovesToYourTargetAnd: () => "Tvoj ljubimac trči do tvojeg cilja i napada ga",
  teleportsTargetToYou: () => "Teleportira cilj do tebe",
  destroysTargetAlliedSpirit: () => "Uništava ciljnog savezničkog duha",
  destroysTargetMinion: () => "Uništava ciljnu slugu",
  nearestSpiritLosesHealthTargetAllyIs: (p) =>
    `Najbliži duh gubi ${p.magnitude} zdravlja; ciljni se saveznik po bodu liječi za ${p.healPerPoint}`,
  nearestSpiritLosesAllEnergyYouGain: (p) =>
    `Najbliži duh gubi svu energiju; dobivaš ${p.magnitude} % toga`,
  itsOwnerGainsHealthEqualToThe: () => "Njegov vlasnik dobiva zdravlje jednako nanesenoj šteti",
  destroysEveryAlliedSpiritWithin: (p) =>
    `Uništava svakog savezničkog duha ${within(p.radius, p.radius2)}`,
  thisSkillRecharges: () => "Ova se vještina obnavlja",
  secondsFaster: () => " sekundi brže",
  thisSkillRechargesInstantly: () => "Ova se vještina obnavlja odmah",
  thisSkillRechargesFaster: (p) => `Ova se vještina obnavlja ${p.fraction} % brže`,
  usedSkillThatSkillRechargesInstantlyThis: (p) =>
    p.of === "used-skill" ? "Ta se vještina obnavlja odmah" : "Ova se vještina obnavlja odmah",
  loseAllAdrenaline: () => "Izgubi sav adrenalin",
  rechargesAllYourOtherSkills: () => "Obnavlja sve tvoje druge vještine",
  rechargesAllYourStances: () => "Obnavlja sve tvoje stavove",
  rechargesAllYourOtherSkills2: (p) =>
    `Obnavlja sve tvoje druge ${OTHER_SKILLS[p.which] ?? p.which}`,
  rechargesAllYour: (p) => `Obnavlja sve tvoje ${p.rechargedKind}`,
  allOfYourSpiritsDie: () => "Svi tvoji duhovi umiru",
  summonsPlusOnePerCorpseExploited: (p) =>
    `Priziva ${p.text}` +
    (p.perExploitedCorpse === true ? ", plus jednog po iskorištenom lešu" : ""),
  setsATrap: () => "Postavlja zamku",
  pulseTargetCreatesASymbolMarksThe: (p) =>
    p.kind === "pulse"
      ? p.anchor === "target"
        ? "Stvara simbol"
        : "Označava tlo"
      : p.anchor === "corpse"
        ? "Stvara zdenac"
        : "Stvara zaštitu",
  forSeconds: (p) => `${p.what} ${p.where} na ${p.magnitude} s`,
  seconds3: (p) => `${p.magnitude} s`,
  forEachSignetYouHaveEquipped: (p) => (p.perOwnSignet === true ? " po opremljenom pečatu" : ""),
  allOfTheTargetSSkillsAre: (p) => `Sve vještine cilja onemogućene su ${p.time}`,
  theTargetSEliteSkillIsDisabled: (p) => `Elitna vještina cilja onemogućena je ${p.time}`,
  oneOfTheTargetSSpellsAt: (p) => `Jedna od čarolija cilja nasumično je onemogućena ${p.time}`,
  allOfTheTargetSAttackSkills: (p) => `Sve vještine napada cilja onemogućene su ${p.time}`,
  theInterruptedSkillIsDisabledFor: (p) =>
    `Prekinuta vještina onemogućena je ${p.time}${p.perSignet}`,
  centreInterruptedHoldingThatSkillHaveIt: (p) =>
    p.which === "centre-interrupted"
      ? `oni koji imaju tu vještinu imaju je onemogućenu ${p.time}`
      : `Ta vještina i sve vještine istog atributa onemogućene su ${p.time}`,
  thisSkillBecomesTheOneYouRemoved: (p) =>
    `Ova vještina postaje ona koju si uklonio na ${p.seconds} s`,
  thisSkillBecomesThatRandomSpellSpell: (p) =>
    `Ova vještina za to vrijeme postaje ${p.which === "random-spell" ? "ta čarolija" : "ta vještina"}`,
  thisSkillBecomesItsTargetSNon: (p) =>
    `Ova vještina na ${p.magnitude} s postaje elitna vještina cilja koja nije oblik`,
  takeControlOfTargetEnemySpirit: () => "Preuzmi kontrolu nad ciljnim neprijateljskim duhom",
  becomeYourMinionsWhileYouBear: (p) => `Postaju tvoje sluge dok nosiš ${p.name}`,
  targetMinionWithAMasterBecomesMasterless: (p) =>
    `Ciljna sluga s gospodarom ostaje bez gospodara; sluga bez gospodara postaje tvoja i liječi se za ${p.magnitude} zdravlja`,
  leadCountsAsALeadAttackCounts: (p) =>
    p.role === "lead" ? "Računa se kao uvodni napad" : "Računa se kao napad sporednom rukom",
  targetSuffersOvercast: (p) => `Cilj trpi ${p.magnitude} prenaprezanja`,
  thisSkillThisSkillThatSkill: (p) => (p.of === "this-skill" ? "Ova vještina" : "Ta vještina"),
  forEachRemoved2: (p) =>
    p.perRemoved === undefined ? "" : ` po uklonjenom: ${CATEGORY[p.perRemoved].one}`,
  takesSecondsLongerToRecharge: (p) => `${p.which} se obnavlja ${p.magnitude} s dulje${p.each}`,
  that: (p) => `, koji ${p.onlyIf}`,
  ifItStrikesAFoe: (p) => `Ako pogodi neprijatelja${p.whom}: ${lowerFirst(p.text)}`,
  from: (p) => `${p.text} od: ${p.from}`,
  takeDamageForEachPointOfEnergy: (p) =>
    `primaju ${p.amount} ${damageNoun(p.type)}` +
    (p.perEnergyLost === undefined ? "" : " po izgubljenom bodu energije"),
  areInterruptedAreInterruptedIfCasting: (p) =>
    p.only === undefined ? "bivaju prekinuti" : "bivaju prekinuti ako upravo bacaju",
  areKnockedDownForS: (p) => `oboreni su na ${p.durationSeconds} s`,
  foesFoeCreaturesGain: (p) =>
    p.hits === "foes" || p.hits === "foe-creatures" ? p.suffered : `dobivaju ${p.sufferedWhat}`,
  gainHealthEqualToThisSpellS2: () =>
    "dobivaju zdravlje jednako bonusu Božanske milosti ove čarolije",
  gain3: (p) => {
    const amount = lowerFirst(p.text).replace(/^liječi (?:za )?/, "");
    return `dobivaju ${amount.includes("zdravlj") ? amount : `${amount} zdravlja`}`;
  },
  gainHealth: (p) => `dobivaju ${p.amount} zdravlja`,
  loseHealth: (p) => `gube ${p.amount} zdravlja`,
  youFromEach: (p) => `${lowerFirst(p.text).replace(/^krade /, "kradeš ")} od svakog`,
  transferAllTheirConditionsToYou: () => "prenesi sva njihova stanja na sebe",
  resurrect: (p) =>
    p.kind === "resurrect"
      ? lowerFirst(p.text).replace(/^vraća cilj u život/, "vraćaju se u život")
      : lowerFirst(p.text),
  and5: (p) => (p.length === 0 ? (p.last ?? "") : `${p.parts} i ${p.last2}`),
  perAlliedMinionsOwnMinionsMinionOne: (p) =>
    `; ${lowerFirst(p.text)} po ${p.hits === "allied-minions" || p.hits === "own-minions" ? "slugi" : "cilju"}`,
  per: (p) => ` po ${counted(p.perCountNoun)}`,
  damage3: (p) => `${p.amount} ${damageNoun(p.type)}${p.each}`,
  healHealsEnergy: (p) =>
    p.kind === "heal" ? `liječi ${p.amount}${p.each}` : `+${p.amount} energije${p.each}`,
  drainsEnergy: (p) => `iscrpljuje ${p.magnitude} energije`,
  stealsEnergy: (p) => `krade ${p.magnitude} energije`,
  stealsHealth: (p) => `krade ${p.magnitude} zdravlja`,
  resurrectsEnergy: (p) => `oživljava, ${p.energy} % energije`,
  resurrectsHealth: (p) => `oživljava, ${p.health} % zdravlja`,
  resurrectsPetsHealth: (p) => `oživljava ljubimce, ${p.health} % zdravlja`,
  healsOfYourHealth: (p) => `liječi ${p.percent} % od ${shareOfYourHealth(p.fractionOfCurrent)}`,
  balancesHealthWithTargetFoe: () => "izjednačava zdravlje s ciljnim neprijateljem",
  allUpTo: (p) => (p.current === p.Infinity ? "sva" : `do ${p.moving}`),
  andFoesWithinOfIt: (p) =>
    ` i neprijatelji ${AREA_AROUND_TARGET.get(p.copyToFoesWithin) ?? `u krugu od ${p.copyToFoesWithin2} oko cilja`}`,
  withOfTheirRemainingDurations: (p) => ` s ${p.durationMultiplier} % njihova preostalog trajanja`,
  movesConditionsFromFoesWithinOfIt: (p) =>
    `Prebacuje ${p.count} stanja${p.lasting} s neprijatelja ${AREA_AROUND_TARGET.get(p.foesWithin) ?? `u krugu od ${p.foesWithin2} oko cilja`} na cilj`,
  casterMovesOfYourConditionsToThe: (p) =>
    p.from === "caster"
      ? `Prebacuje ${p.count === "sva" ? "sva tvoja" : `${p.count} tvojih`} stanja${p.lasting} na cilj${p.copies}`
      : `Prebacuje ${p.count} stanja cilja${p.lasting} na tebe`,
  youAreHealedForForEach: (p) => `${p.moves}; liječiš se za ${p.magnitude} po stanju`,
  areDisabledForSeconds: (p) => `onemogućene su ${p.seconds} s`,
  allOfYourSkills: (p) => `Sve tvoje vještine ${p.time}`,
  allOfYourOtherSkills: (p) => `Sve tvoje druge vještine ${p.time}`,
  allOfYourOtherNonAttackSkills: (p) => `Sve tvoje druge vještine koje nisu napadi ${p.time}`,
  allOfYourOtherAttackSkillsYour: (p) =>
    p.exceptWeapon === undefined
      ? `Sve tvoje druge vještine napada ${p.time}`
      : `Tvoje vještine napada koje nisu ${WEAPON_GENITIVE[p.exceptWeapon]} ${p.time}`,
  allOfYourNonAttackSkills: (p) => `Sve tvoje vještine koje nisu napadi ${p.time}`,
  s4: (p) => pluralNoun(typeName(p.type)),
  yourAnd: (p) => `Tvoje ${p.types} ${p.time}`,
  allOfYourSpells: (p) => `Sve tvoje čarolije ${p.time}`,
  allOfYourOther: (p) => `Sve tvoje ${p.others ? "druge " : ""}${p.name} ${p.time}`,
  exceptAnd: (p) => (p.length === 0 ? "" : ` osim ${p.except}`),
  allOfYourNonSkills: (p) => `Sve tvoje vještine koje nisu ${p.name}${p.exceptText} ${p.time}`,
  yourWholeParty: () => "Cijela tvoja družina",
  composedAffectsWhere2: (p) => `${AREA_WHO[p.affects]} ${p.where}`,
  radius: (p) => `polumjer ${p.radius}`,
  andAroundYou: (p) =>
    `${TARGET_TEXT[p.target]}, i ${lowerFirst(AREA_WHO[p.affects])} ${p.where} oko tebe`,
  range: (p) => `domet ${p.range}`,
  upTo4: (p) => `do ${p.maxTargets} ${p.who}`,
  withinOfIt: (p) => AREA_AROUND_TARGET.get(p.radius) ?? `u krugu od ${p.radius2} oko cilja`,
  and6: (p) => `${TARGET_TEXT[p.target]}, i ${p.count} ${p.where}`,
  rangeRadius: (p) => `domet ${p.range}, polumjer ${p.radius}`,
  free: () => "Besplatno",
  adrenaline: (p) => `${p.amount} adrenalina`,
  composedAmount: (p) => ` (${p.amount})`,
  energy8: (p) => `${p.cost} energije${p.base}${p.overcast}`,
  overcast: (p) => `, ${p.overcast} prenaprezanja`,
  instant: () => "Trenutačno",
  composedActivationBase: (p) => (p.activation === p.base ? p.base : `${p.activation} (${p.base})`),
  dealsNoDamage: () => "Ne nanosi štetu",
  dealsOnlyDamageDamage: (p) =>
    p.weaponless
      ? `Nanosi samo ${p.bonus} ${damageOf(p.damageType)}`
      : `+${p.bonus} ${damageOf(p.damageType)}`,
  damage4: (p) => `${p.condition}: +${p.more} štete`,
  damageOnThem: (p) => `+${p.amount} štete ${p.perCount}`,
  cannotBeBlocked2: () => "Ne može se blokirati",
  cannotBeBlocked3: (p) => `${p.condition}: ne može se blokirati`,
  chanceToMissWithOrLess: (p) => `${p.chance} % šanse za promašaj uz ${p.name} ${p.rank} ili manje`,
  resultsInACriticalHit: () => "Rezultira kritičnim pogotkom",
  resultsInACriticalHit2: (p) => `${p.condition}: rezultira kritičnim pogotkom`,
  hitsUpToAdjacentFoesToo: (p) => `Također pogađa do ${p.cleaveTargets} susjednih neprijatelja`,
  hitsEveryAdjacentFoe: (p) => `${p.condition}: pogađa svakog susjednog neprijatelja`,
  armorPenetration2: (p) => `${p.armorPenetration} % probijanja oklopa`,
  ifBlocked: (p) => `Ako je blokirano: ${lowerFirst(p.text)}`,
  onACriticalHit: (p) => `Pri kritičnom pogotku: ${lowerFirst(p.text)}`,
  ifItFailsToHit: (p) => `Ako promaši: ${lowerFirst(p.text)}`,
  asItIsUsed: (p) => `Pri korištenju: ${lowerFirst(p.text)}`,
  allYourPreparationsAreRemoved: () => "Uklanjaju se sve tvoje pripreme",
  fliesAsFast: (p) => `Leti ${p.multiplier}× brže`,
  fliesAsFast2: (p) => `${p.condition}: leti ${p.multiplier}× brže`,
  only: (p) => `; ${lowerFirst(p.condition)}, samo 1`,
  eachDealingLessDamage: (p) => `, svaka nanosi ${p.value} % manje štete`,
  strikesTwice: () => "Udara dvaput",
  strikesTimes: (p) => `Udara ${p.count} puta`,
  shootsArrowsAtOnce: (p) => `Ispaljuje ${p.count} strijela odjednom${p.weaker}${p.fewer}`,
  whileActivating: (p) => `Tijekom aktivacije: ${p.status}`,
  easilyInterrupted: () => "Lako se prekida",
  failureChanceWithOrLess: (p) =>
    `${p.chance} % šanse za neuspjeh uz ${p.name} ${p.rank} ili manje`,
  activatesFasterSlower: (p) =>
    `${p.condition}: aktivira se ${p.value} % ${p.multiplier < 1 ? "brže" : "sporije"}`,
  healthGainFromDivineFavorIsDoubled: () => "Dobitak zdravlja od Božanske milosti je udvostručen",
  projectilesEachCanBeDodged: (p) => `${p.shots} projektila: svakom se može izmaknuti`,
  aProjectileAtEachFoeEachCan: (p) =>
    p.spread === true
      ? "Projektil na svakog neprijatelja: svakom se može izmaknuti"
      : "Projektil: može mu se izmaknuti",
  halfTheNormalRange: () => "Upola manji domet",
  orSacrificesHealthIfNoneIsNear: (p) =>
    `, ili žrtvuje ${p.elseSacrificePercent} % zdravlja ako u blizini nema nijednog`,
  targetExploitsTheCorpseNearestYourTarget: (p) =>
    (p.near === "target"
      ? "Iskorištava leš najbliži tvojem cilju"
      : p.all === true
        ? `Iskorištava svaki svježi leš ${within(p.radius, p.radius2)}`
        : p.pick === "random"
          ? "Iskorištava nasumičan leš"
          : "Iskorištava najbliži leš") + p.value,
  whileOnYourBarAHealthFights: (p) =>
    `Dok je na tvojoj traci, ${p.name} (${p.companionHealth} zdravlja) bori se uz tebe`,
  disabledForAfterUse: (p) => `Nakon korištenja onemogućena ${seconds(p.disabledAfterUseSeconds)}`,
  takeAllConditionsFromYourAlliesWith: () =>
    "Preuzmi sva stanja svojih saveznika s preostalim vremenom svakog",
  hitOrMiss: (p) => `${p.text}, pogodak ili promašaj`,
  eliteFlash: (p) => {
    const feminine = FEMININE_TYPES.has(p.type);
    const elite = p.elite ? (feminine ? "elitna " : "elitni ") : "";
    const flash = p.flash ? (feminine ? "bljeskovita " : "bljeskoviti ") : "";
    return capitalize(`${elite}${flash}${TYPE_TEXT[p.type]}`.toLowerCase());
  },
  moraleBoost: (p) =>
    p.rechargesOnMoraleBoost === true ? "Podizanje morala" : seconds(p.rechargeSeconds),
  hexHexesS2: (p) => pluralNoun(p.kind),
} satisfies DescribeWords as DescribeWords;
