import { EN_WORDS, type DescribeWords } from "@vibewars/game-core";

type Words = DescribeWords;
type Category = Parameters<Words["categoryNoun"]>[1];
type Weapon = Parameters<Words["whileWielding"]>[0]["weapon"];
type DamageKind = Parameters<Words["typeWord"]>[0];
type ChainKind = keyof Words["chainRoleText"];
type SkillKind = keyof Words["typeText"];

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function seconds(value: number): string {
  // Whole seconds read better than "2,0 s"; fractions keep one decimal.
  return Number.isInteger(value) ? `${String(value)} s` : `${value.toFixed(1).replace(".", ",")} s`;
}

/** The Polish plural class of a count: 1, 2-4 (not 12-14), or the rest. */
function pluralClass(count: number | string): "one" | "few" | "many" {
  const text = String(count).trim();
  const digits = /(\d+(?:[.,]\d+)?)\D*$/.exec(text)?.[1];
  if (digits === undefined) {
    return "many";
  }
  if (/[.,]/.test(digits)) {
    return "few";
  }
  const value = Number(digits);
  if (value === 1 && digits === text) {
    return "one";
  }
  const tens = value % 100;
  const ones = value % 10;
  return ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14) ? "few" : "many";
}

function plural(count: number | string, one: string, few: string, many: string): string {
  const kind = pluralClass(count);
  return kind === "one" ? one : kind === "few" ? few : many;
}

/** "5 sekund", "2 sekundy", "1 sekundę". */
function sek(count: number | string): string {
  return `${String(count)} ${plural(count, "sekundę", "sekundy", "sekund")}`;
}

type Gender = "m" | "f" | "n";

interface CategoryForms {
  readonly one: string;
  readonly acc: string;
  readonly gen: string;
  readonly loc: string;
  readonly few: string;
  readonly many: string;
  readonly gender: Gender;
}

const CATEGORY: Record<Category, CategoryForms> = {
  condition: {
    one: "dolegliwość",
    acc: "dolegliwość",
    gen: "dolegliwości",
    loc: "dolegliwości",
    few: "dolegliwości",
    many: "dolegliwości",
    gender: "f",
  },
  hex: {
    one: "klątwa",
    acc: "klątwę",
    gen: "klątwy",
    loc: "klątwie",
    few: "klątwy",
    many: "klątw",
    gender: "f",
  },
  enchantment: {
    one: "zaczarowanie",
    acc: "zaczarowanie",
    gen: "zaczarowania",
    loc: "zaczarowaniu",
    few: "zaczarowania",
    many: "zaczarowań",
    gender: "n",
  },
  stance: {
    one: "postawa",
    acc: "postawę",
    gen: "postawy",
    loc: "postawie",
    few: "postawy",
    many: "postaw",
    gender: "f",
  },
  preparation: {
    one: "przygotowanie",
    acc: "przygotowanie",
    gen: "przygotowania",
    loc: "przygotowaniu",
    few: "przygotowania",
    many: "przygotowań",
    gender: "n",
  },
  glyph: {
    one: "glif",
    acc: "glif",
    gen: "glifu",
    loc: "glifie",
    few: "glify",
    many: "glifów",
    gender: "m",
  },
  shout: {
    one: "okrzyk",
    acc: "okrzyk",
    gen: "okrzyku",
    loc: "okrzyku",
    few: "okrzyki",
    many: "okrzyków",
    gender: "m",
  },
  chant: {
    one: "pieśń",
    acc: "pieśń",
    gen: "pieśni",
    loc: "pieśni",
    few: "pieśni",
    many: "pieśni",
    gender: "f",
  },
  echo: {
    one: "echo",
    acc: "echo",
    gen: "echa",
    loc: "echu",
    few: "echa",
    many: "ech",
    gender: "n",
  },
  "weapon-spell": {
    one: "czar broni",
    acc: "czar broni",
    gen: "czaru broni",
    loc: "czarze broni",
    few: "czary broni",
    many: "czarów broni",
    gender: "m",
  },
  item: {
    one: "przedmiot",
    acc: "przedmiot",
    gen: "przedmiotu",
    loc: "przedmiocie",
    few: "przedmioty",
    many: "przedmiotów",
    gender: "m",
  },
  form: {
    one: "postać",
    acc: "postać",
    gen: "postaci",
    loc: "postaci",
    few: "postaci",
    many: "postaci",
    gender: "f",
  },
  "skill-effect": {
    one: "efekt umiejętności",
    acc: "efekt umiejętności",
    gen: "efektu umiejętności",
    loc: "efekcie umiejętności",
    few: "efekty umiejętności",
    many: "efektów umiejętności",
    gender: "m",
  },
};

const CATEGORY_ID =
  /\b(skill-effect|weapon-spell|condition|hex|enchantment|stance|preparation|glyph|shout|chant|echo|item|form)\b/g;

/** Category ids that reach a sentence raw, in the given case. */
function categoryIds(text: string, form: "acc" | "gen" | "one" = "acc"): string {
  return text.replace(CATEGORY_ID, (id) => CATEGORY[id as Category][form]);
}

function categoryNoun(count: number | "all", category: Category): string {
  const forms = CATEGORY[category];
  if (count === "all") {
    return forms.few;
  }
  return plural(count, forms.acc, forms.few, forms.many);
}

function aCategory(category: Category): string {
  return CATEGORY[category].acc;
}

/** "żadnej innej klątwy", "żadnego innego glifu", "żadnego innego echa". */
function noOther(category: Category, other: string, noun: string): string {
  const { gender } = CATEGORY[category];
  const none = gender === "f" ? "żadnej" : "żadnego";
  const adjective = other === "" ? "" : gender === "f" ? "innej " : "innego ";
  return `${none} ${adjective}${noun}`;
}

/** "każdą usuniętą klątwę", "każde usunięte zaczarowanie", "każdy usunięty glif". */
function eachRemoved(category: Category): string {
  const { acc, gender } = CATEGORY[category];
  const each =
    gender === "f" ? "każdą usuniętą" : gender === "n" ? "każde usunięte" : "każdy usunięty";
  return `${each} ${acc}`;
}

const SKILL_NOUN: Readonly<Record<string, string>> = {
  attack: "atak",
  spell: "czar",
  enchantment: "zaczarowanie",
  hex: "klątwa",
  signet: "sygnet",
  shout: "okrzyk",
  stance: "postawa",
  preparation: "przygotowanie",
  glyph: "glif",
  chant: "pieśń",
  echo: "echo",
  "weapon-spell": "czar broni",
  "nature-ritual": "rytuał natury",
  "binding-ritual": "rytuał wiążący",
  ward: "osłona",
  well: "studnia",
  "item-spell": "czar przedmiotu",
  trap: "pułapka",
  "pet-attack": "atak chowańca",
  form: "postać",
  skill: "umiejętność",
  elite: "elitarna umiejętność",
};

/** A skill type id as its Polish noun; anything else passes as it came. */
function spaced(word: string): string {
  return SKILL_NOUN[word] ?? word.replaceAll("-", " ");
}

const PLURAL_ENDINGS: readonly (readonly [RegExp, string])[] = [
  [/elitarna umiejętność$/, "elitarne umiejętności"],
  [/umiejętność$/, "umiejętności"],
  [/atak chowańca$/, "ataki chowańca"],
  [/atak$/, "ataki"],
  [/czar broni$/, "czary broni"],
  [/czar przedmiotu$/, "czary przedmiotu"],
  [/czar$/, "czary"],
  [/zaczarowanie$/, "zaczarowania"],
  [/przygotowanie$/, "przygotowania"],
  [/klątwa$/, "klątwy"],
  [/sygnet$/, "sygnety"],
  [/okrzyk$/, "okrzyki"],
  [/postawa$/, "postawy"],
  [/glif$/, "glify"],
  [/pieśń$/, "pieśni"],
  [/echo$/, "echa"],
  [/rytuał natury$/, "rytuały natury"],
  [/rytuał wiążący$/, "rytuały wiążące"],
  [/osłona$/, "osłony"],
  [/studnia$/, "studnie"],
  [/pułapka$/, "pułapki"],
  [/postać$/, "postaci"],
  [/punkt$/, "punkty"],
  [/sojusznik$/, "sojusznicy"],
  [/wróg$/, "wrogowie"],
];

/** A Polish noun's nominative plural. */
function pluralNoun(noun: string): string {
  for (const [ending, form] of PLURAL_ENDINGS) {
    if (ending.test(noun)) {
      return noun.replace(ending, form);
    }
  }
  return noun;
}

const NOUN_GENITIVE_PLURAL: readonly (readonly [RegExp, string])[] = [
  [/^sojusznicy\b/, "sojuszników"],
  [/^wrogowie\b/, "wrogów"],
  [/^martwi sojusznicy\b/, "martwych sojuszników"],
  [/^powaleni wrogowie\b/, "powalonych wrogów"],
  [/^duchy\b/, "duchów"],
  [/^sługi\b/, "sług"],
  [/^twoje duchy\b/, "twoich duchów"],
  [/^twoje sługi\b/, "twoich sług"],
  [/^jego\b/, "jego"],
];

/** A plural after "liczba" or "z": the genitive its head noun takes. */
function genitivePlural(text: string): string {
  for (const [head, form] of NOUN_GENITIVE_PLURAL) {
    if (head.test(text)) {
      return text.replace(head, form);
    }
  }
  return text;
}

const DAMAGE_WORD: Record<DamageKind, { readonly gen: string; readonly acc: string }> = {
  slashing: { gen: "siecznych", acc: "sieczne" },
  piercing: { gen: "kłutych", acc: "kłute" },
  blunt: { gen: "obuchowych", acc: "obuchowe" },
  fire: { gen: "od ognia", acc: "od ognia" },
  cold: { gen: "od zimna", acc: "od zimna" },
  lightning: { gen: "od błyskawic", acc: "od błyskawic" },
  earth: { gen: "od ziemi", acc: "od ziemi" },
  chaos: { gen: "od chaosu", acc: "od chaosu" },
  dark: { gen: "od mroku", acc: "od mroku" },
  holy: { gen: "świętych", acc: "święte" },
  shadow: { gen: "od cienia", acc: "od cienia" },
  typeless: { gen: "", acc: "" },
};

function typeWord(type: DamageKind): string {
  return type === "typeless" ? "" : ` ${DAMAGE_WORD[type].gen}`;
}

/** Damage after a number, from a word said by `typeWord`: "obrażeń od ognia". */
function damageOf(word: string): string {
  const said = word.trim();
  const named = said in DAMAGE_WORD ? DAMAGE_WORD[said as DamageKind].gen : said;
  return named === "" ? "obrażeń" : `obrażeń ${named}`;
}

/** A skill description phrase in the genitive, as "używa" and "celem" take. */
function skillGenitive(text: string): string {
  return text
    .replace("elitarna", "elitarnej")
    .replace("adrenalinowa", "adrenalinowej")
    .replace(/umiejętność/, "umiejętności");
}

/** Damage after a number, by id. */
function damageNoun(type: DamageKind): string {
  return damageOf(DAMAGE_WORD[type].gen);
}

/** Damage named as a whole: "obrażenia od ognia". */
function damageAcc(type: DamageKind): string {
  const word = DAMAGE_WORD[type].acc;
  return word === "" ? "obrażenia" : `obrażenia ${word}`;
}

/** Damage named as a whole by id, the two broad kinds included. */
function damageNamed(type: DamageKind | "elemental" | "physical"): string {
  return type === "physical"
    ? "obrażenia fizyczne"
    : type === "elemental"
      ? "obrażenia od żywiołów"
      : damageAcc(type);
}

const NEEDED_WEAPON: Record<Weapon, string> = {
  axe: "topór",
  sword: "miecz",
  hammer: "młot",
  daggers: "sztylety",
  scythe: "kosę",
  spear: "włócznię",
  bow: "łuk",
  melee: "broń do walki wręcz",
};

const WITH_WEAPON: Record<Weapon, string> = {
  axe: "toporem",
  sword: "mieczem",
  hammer: "młotem",
  daggers: "sztyletami",
  scythe: "kosą",
  spear: "włócznią",
  bow: "łukiem",
  melee: "bronią do walki wręcz",
};

const WEAPON_WORD: Record<Weapon, string> = {
  axe: "toporem",
  sword: "mieczem",
  hammer: "młotem",
  daggers: "sztyletami",
  scythe: "kosą",
  spear: "włócznią",
  bow: "łukiem",
  melee: "wręcz",
};

function wielding(weapon: Weapon | undefined): string {
  return weapon === undefined
    ? ""
    : weapon === "daggers"
      ? ", gdy dzierżysz sztylety"
      : `, gdy dzierżysz ${NEEDED_WEAPON[weapon]}`;
}

function weaponAttacks(weapon: Weapon | undefined): string {
  return weapon === undefined ? "ataki" : `ataki ${WEAPON_WORD[weapon]}`;
}

function attackSkills(weapon: Weapon | undefined): string {
  return weapon === undefined ? "umiejętności ataku" : `umiejętności ataku ${WEAPON_WORD[weapon]}`;
}

const CHAIN_ARTICLED: Record<ChainKind, string> = {
  lead: "atak otwierający",
  "off-hand": "atak drugą ręką",
  dual: "atak podwójny",
};

const TYPE_TEXT: Words["typeText"] = {
  attack: "Atak.",
  spell: "Czar.",
  enchantment: "Czar zaczarowania.",
  hex: "Czar klątwy.",
  signet: "Sygnet.",
  shout: "Okrzyk.",
  stance: "Postawa.",
  preparation: "Przygotowanie.",
  glyph: "Glif.",
  chant: "Pieśń.",
  echo: "Echo.",
  "weapon-spell": "Czar broni.",
  "nature-ritual": "Rytuał natury.",
  "binding-ritual": "Rytuał wiążący.",
  ward: "Czar osłony.",
  well: "Czar studni.",
  "item-spell": "Czar przedmiotu.",
  trap: "Pułapka.",
  "pet-attack": "Atak chowańca.",
  form: "Postać.",
  skill: "Umiejętność.",
};

/** The skill types whose noun is no masculine: what "elitarna" agrees with. */
const GENDER_OF_TYPE: Partial<Record<SkillKind, "f" | "n">> = {
  stance: "f",
  chant: "f",
  trap: "f",
  form: "f",
  skill: "f",
  preparation: "n",
  echo: "n",
};

const ADJECTIVE_ENDING = { m: "y", f: "a", n: "e" } as const;

function typeName(type: SkillKind): string {
  return lowerFirst(TYPE_TEXT[type].replace(/\.$/, ""));
}

const TYPE_STEM: Record<SkillKind, string> = {
  attack: "atak",
  spell: "czar",
  enchantment: "zaczarowanie",
  hex: "klątwa",
  signet: "sygnet",
  shout: "okrzyk",
  stance: "postawa",
  preparation: "przygotowanie",
  glyph: "glif",
  chant: "pieśń",
  echo: "echo",
  "weapon-spell": "czar broni",
  "nature-ritual": "rytuał natury",
  "binding-ritual": "rytuał wiążący",
  ward: "osłona",
  well: "studnia",
  "item-spell": "czar przedmiotu",
  trap: "pułapka",
  "pet-attack": "atak chowańca",
  form: "postać",
  skill: "umiejętność",
};

/** Words joined around a head noun: the noun comes first, what owns it after. */
function compound(words: string): string {
  const parts = words
    .replace(/\bprimary\b/g, "główny")
    .replace(/\belemental\b/g, "żywiołów")
    .trim();
  const headed = /^(.*?)\s*(umiejętność|czar|klątwa)$/.exec(parts);
  if (headed === null) {
    return parts;
  }
  const owners = (headed[1] ?? "").trim();
  const head = headed[2] ?? "";
  const adjectives = owners.match(/\b(elitarna|adrenalinowa)\b/g) ?? [];
  const rest = owners.replace(/\b(elitarna|adrenalinowa)\b/g, "").trim();
  const before = adjectives.length === 0 ? head : `${adjectives.join(" ")} ${head}`;
  return rest === "" ? before : `${before} (${rest})`;
}

const VERB_TO_YOU: Readonly<Record<string, string>> = {
  jest: "jesteś",
  ma: "masz",
  może: "możesz",
};

/** A 3rd-person singular verb as the 2nd: "rzuca" to "rzucasz". */
function verbToYou(verb: string): string {
  const irregular = VERB_TO_YOU[verb];
  if (irregular !== undefined) {
    return irregular;
  }
  return /[aeiyu]$/.test(verb) ? `${verb}sz` : verb;
}

const VERB_TO_THEY: Readonly<Record<string, string>> = {
  jest: "są",
  ma: "mają",
  może: "mogą",
  traci: "tracą",
  stoi: "stoją",
};

/** A 3rd-person singular verb as the plural: "rzuca" to "rzucają". */
function verbToThey(verb: string): string {
  const irregular = VERB_TO_THEY[verb];
  if (irregular !== undefined) {
    return irregular;
  }
  if (verb.endsWith("uje")) {
    return verb.replace(/e$/, "ą");
  }
  if (verb.endsWith("a")) {
    return `${verb}ją`;
  }
  if (/[iey]$/.test(verb)) {
    return verb.replace(/[iey]$/, "ą");
  }
  return verb;
}

/** A clause's leading verb, changed by `change`: a "nie" before it stays. */
function changeFirstVerb(phrase: string, change: (verb: string) => string): string {
  return phrase.replace(
    /^(się )?(nie )?(\S+)/,
    (_, reflexive, negation, verb: string) =>
      `${(reflexive as string | undefined) ?? ""}${(negation as string | undefined) ?? ""}${change(verb)}`,
  );
}

/** "rzuca czar" said to its holder: "rzucasz czar". */
function secondPerson(phrase: string): string {
  return changeFirstVerb(phrase, verbToYou)
    .replace(/\bjego\b/g, "twój")
    .replace(/\bswoje\b/g, "swoje");
}

/** A `conditionText` with "cel" made "ty", the verb following. */
function yourCondition(text: string): string {
  const match = /^Jeśli cel (.*)$/.exec(text);
  if (match === null) {
    return text;
  }
  const clause = match[1] ?? "";
  return `Jeśli ${secondPerson(clause)}`;
}

const ACC_TO_GEN = new Map(Object.values(CATEGORY).map((forms) => [forms.acc, forms.gen] as const));
const GEN_TO_ACC = new Map(Object.values(CATEGORY).map((forms) => [forms.gen, forms.acc] as const));

/** Case swap for what a negated "ma" governs: "ma klątwę" against "nie ma klątwy". */
function swapObjectCase(text: string, table: ReadonlyMap<string, string>): string {
  return text.replace(/([\p{L}]+(?: broni| umiejętności)?)$/u, (word) => table.get(word) ?? word);
}

function negatedText(text: string): string {
  const no = /^Jeśli (cel |)nie (.*)$/.exec(text);
  if (no !== null) {
    const clause = no[2] ?? "";
    const said = /^(ma|masz) /.test(clause) ? swapObjectCase(clause, GEN_TO_ACC) : clause;
    return `Jeśli ${no[1] ?? ""}${said}`;
  }
  const less = /^Jeśli (cel |)(ma|masz) mniej niż (.*)$/.exec(text);
  if (less !== null) {
    return `Jeśli ${less[1] ?? ""}${less[2] ?? ""} co najmniej ${less[3] ?? ""}`;
  }
  const plain = /^Jeśli (cel |)(.*)$/.exec(text);
  if (plain !== null) {
    const clause = plain[2] ?? "";
    const said = /^(ma|masz) /.test(clause) ? swapObjectCase(clause, ACC_TO_GEN) : clause;
    return `Jeśli ${plain[1] ?? ""}nie ${said}`;
  }
  return `O ile nie: ${lowerFirst(text)}`;
}

function share(fraction: number): string {
  return fraction === 0.5 ? "połowa" : `${String(Math.round(fraction * 100))}%`;
}

/** `share`, then of what: "połowę twojego zdrowia", "25% twojego zdrowia". */
function shareOfYourHealth(fraction: number): string {
  return `${fraction === 0.5 ? "połowę" : share(fraction)} twojego zdrowia`;
}

/** What is taken, the noun included: its case follows the amount. */
function damageTaken(multiplier: number): string {
  if (multiplier === 2) {
    return "podwójne obrażenia";
  }
  if (multiplier === 0.5) {
    return "o połowę mniejsze obrażenia";
  }
  return `${String(Math.round(multiplier * 100))}% obrażeń`;
}

const TRIGGER_WHEN: Words["triggerWhen"] = {
  "bearer-casts-spell": "rzuca czar",
  "bearer-attacks": "atakuje",
  "bearer-attack-begins": "atakuje",
  "bearer-uses-skill": "używa umiejętności",
  "bearer-applies-hex": "nakłada klątwę",
  "bearer-hits": "trafia atakiem",
  "bearer-fails-to-hit": "nie trafia",
  "bearer-takes-physical-damage": "otrzymuje obrażenia fizyczne",
  "bearer-takes-elemental-damage": "otrzymuje obrażenia od żywiołów",
  "bearer-takes-damage": "otrzymuje obrażenia",
  "bearer-takes-damage-from-foe": "otrzymuje obrażenia lub traci zdrowie od wroga",
  "bearer-health-drops-below": "spada poniżej progu zdrowia przez obrażenia",
  "bearer-fatal-damage-negated": "unika śmiertelnych obrażeń",
  "bearer-hit-by-attack": "zostaje trafiony atakiem wroga",
  "bearer-targeted-by-foe": "staje się celem wrogiego czaru lub ataku",
  "bearer-healed-by-skill": "zostaje uleczony umiejętnością",
  "bearer-blocks-melee": "blokuje atak wręcz",
  "bearer-blocks-projectile": "blokuje atak dystansowy",
  "bearer-blocks": "blokuje",
  "bearer-interrupted": "zostaje przerwany",
  "bearer-knocked-down": "zostaje powalony",
  "bearer-sacrifices-health": "poświęca zdrowie",
  "bearer-knockdown-prevented": "unika powalenia",
  "bearer-gains-hex-or-enchantment": "zyskuje klątwę lub zaczarowanie",
  "bearer-gains-enchantment": "zyskuje zaczarowanie",
  "bearer-loses-enchantment": "traci zaczarowanie",
  "bearer-loses-condition": "traci dolegliwość",
  "bearer-creates-creature": "tworzy istotę",
  "bearer-gains-condition": "zyskuje nową dolegliwość",
  "bearer-chant-or-shout-ends": "traci pieśń lub okrzyk",
  "bearer-energy-empty": "nie ma już energii",
  "bearer-energy-drops-empty": "spada do 0 energii",
  "source-targets-bearer": "staje się celem twojej umiejętności",
  "source-bearer-apart": "jest daleko od ciebie",
  "bearer-dies": "ginie",
  ends: "się kończy",
  "ends-early": "kończy się przedwcześnie",
  expires: "wygasa",
};

/** A radius table in Polish: the radii are the game's, only the words change. */
function inPolish(
  table: ReadonlyMap<number, string>,
  polish: Readonly<Record<string, string>>,
): ReadonlyMap<number, string> {
  return new Map([...table].map(([radius, english]) => [radius, polish[english] ?? english]));
}

const AREA_TEXT = inPolish(EN_WORDS.areaText, {
  adjacent: "przylegający",
  nearby: "w pobliżu",
  "in the area": "na obszarze",
  "in earshot": "w zasięgu głosu",
  "in compass range": "w zasięgu kompasu",
});

const AREA_AROUND_TARGET = inPolish(EN_WORDS.areaAroundTarget, {
  "adjacent to it": "przylegający do celu",
  "nearby it": "w pobliżu celu",
  "in the area around it": "na obszarze wokół celu",
  "in earshot of it": "w zasięgu głosu celu",
});

const AREA_AROUND_CREATED = inPolish(EN_WORDS.areaAroundCreated, {
  "adjacent to that creature": "przylegający do tej istoty",
  "near that creature": "w pobliżu tej istoty",
  "in earshot of that creature": "w zasięgu głosu tej istoty",
});

const AURA_WHO: Words["auraWho"] = {
  all: "Istoty oprócz duchów",
  allies: "Sojusznicy oprócz duchów",
  foes: "Wrogowie oprócz duchów",
};

const AREA_WHO: Words["areaWho"] = {
  enemies: "Wrogowie",
  allies: "Sojusznicy",
  all: "Wszyscy",
};

const SPLASH_SIDE: Words["splashSide"] = {
  foes: "wrogowie",
  "foe-creatures": "wrogie istoty",
  "foe-minions": "wrogie sługi",
  allies: "sojusznicy",
  "non-spirit-allies": "sojusznicy oprócz duchów",
  party: "członkowie drużyny",
  "own-spirits": "twoje duchy",
  "own-minions": "twoje pozostałe sługi",
  "allied-minions": "sojusznicze sługi",
};

const TARGET_TEXT: Words["targetText"] = {
  self: "Ty",
  "single-enemy": "Wróg",
  "single-ally": "Sojusznik",
  "single-other-ally": "Inny sojusznik",
  "single-any": "Dowolny cel",
  "single-dead-ally": "Martwy sojusznik",
  "allied-spirit": "Sojuszniczy duch",
  "enemy-spirit": "Wrogi duch",
  "enemy-minion": "Sługa wroga",
  "own-minion": "Jedna z twoich sług",
  "allied-minion": "Sojusznicza sługa",
  "allied-summoned-creature": "Sojusznicza przywołana istota",
  "single-ally-not-spirit": "Sojusznik niebędący duchem",
  companion: "Twój chowaniec",
  "living-companion": "Twój żywy chowaniec",
};

const TARGETS_WORDS: Words["targetsWords"] = {
  ally: "sojusznika",
  "other-ally": "innego sojusznika",
  foe: "wroga",
};

const YOUR_NEXT_SKILL = "gdy następnym razem użyjesz umiejętności";
const NEXT_SKILL = "gdy następnym razem użyje umiejętności";
const DROPPED = "Efekt po upuszczeniu";

function within(radius: number, radius2: string): string {
  return AREA_TEXT.get(radius) ?? `w promieniu ${radius2}`;
}

/** A profession before a noun, here after it in Polish: nothing to add ahead. */
function owned(whose: string): string {
  return whose.trim() === "" ? "" : `${whose.trim()} `;
}

/** "gdy blokujesz atak wręcz" answered as "jeśli to atak wręcz". */
function blockAnswer(text: string): string {
  return text.replace(
    /^następnym razem, gdy (?:blokujesz|blokuje) (.+)$/,
    (_, noun: string) => `jeśli to ${noun}`,
  );
}

/** "Przylegający wrogowie", or after a possessive "Twoje duchy przylegające". */
function placed(adjective: string, after: string, who: string): string {
  return who.startsWith("twoje") ? `${capitalize(who)} ${after}` : `${adjective} ${who}`;
}

const OTHER_SKILLS: Readonly<Record<string, string>> = { attack: "ataku", signet: "sygnetu" };
const COUNTED: Readonly<Record<string, string>> = {
  enchantment: "zaczarowanie",
  hex: "klątwę",
  condition: "dolegliwość",
};
const counted = (text: string): string =>
  text.replace(/\b(enchantment|hex|condition)\b/g, (word) => COUNTED[word] ?? word);

const kindedArmor = (text: string): string =>
  text.replace(/^(\S+) (\w+) pancerza$/, (whole, amount: string, kind: string) =>
    kind in DAMAGE_WORD
      ? `${amount} pancerza przeciw obrażeniom ${DAMAGE_WORD[kind as DamageKind].gen.replace(/ych$/, "ym")}`
      : whole,
  );

export default {
  capitalize,
  lowerAll: lowerFirst,
  spaced,
  typeName,
  typeFirstWord: (type) => TYPE_STEM[type],
  blockAnswerWording: blockAnswer,
  loseWording: (text, fromSource, bearerIsFoe) =>
    text
      .replace(/^Wrogi cel traci/, fromSource ? "tracisz" : bearerIsFoe ? "traci" : "trać")
      .replace(/który ma\b/, "który masz"),
  bearerWording: (text, bearerIsCaster) =>
    text
      .replace(/^Cel zyskuje/, "zyskuje")
      .replace(/^Cel traci/, bearerIsCaster ? "tracisz" : "traci"),
  ifItWording: (text) => text.replace(/^Jeśli cel/, "Jeśli"),
  gainWording: (text) => {
    const amount = lowerFirst(text).replace(/^leczy (?:o |za )?/, "");
    return amount.includes("zdrowia") ? amount : `${amount} zdrowia`;
  },
  loseTargetWording: (text) => lowerFirst(text).replace(/^cel traci/, "tracą"),
  stealsWording: (text) => lowerFirst(text).replace(/^kradnie /, "kradniesz "),
  returnedWording: (text) => lowerFirst(text).replace(/^wskrzesza cel/, "zostają wskrzeszeni"),
  yourMinionsWording: (text) => text.replace(/^Twoje pozostałe sługi/, "Twoje sługi"),
  onlyIfWording: (text) => {
    const match = /^Jeśli cel (.*)$/.exec(text);
    return match === null ? lowerFirst(text) : changeFirstVerb(match[1] ?? "", verbToThey);
  },
  splashOnlyClause: (condition) =>
    condition === ""
      ? ""
      : condition.startsWith("jeśli ")
        ? `, ${condition}`
        : `, którzy ${condition}`,
  eachOfWording: (reached, condition) =>
    condition === ""
      ? reached
      : condition.startsWith("jeśli ")
        ? `${reached}, ${condition}`
        : `${reached}, którzy ${condition}`,
  requiresWording: (text) => text.replace(/^Jeśli /, "Tylko jeśli "),
  requirementWording: (text) =>
    text.startsWith("Jeśli ") ? `tylko ${lowerFirst(text)}` : lowerFirst(text),
  requirementLine: (text) => lowerFirst(text).replace(/\.$/, ""),
  anyOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Nigdy", ...rest.map((text) => text.replace(/^Jeśli /, ""))].join(" lub ");
  },
  allOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Zawsze", ...rest.map((text) => text.replace(/^Jeśli /, ""))].join(" i ");
  },
  seconds,
  blockedAttacks: { all: "ataki", melee: "ataki wręcz", projectile: "pociski" },
  blockedAttack: { all: "atak", melee: "atak wręcz", projectile: "pocisk" },
  damageTaken,
  triggerWhen: TRIGGER_WHEN,
  secondPerson,
  arrowsWhen: { "bearer-hits": "trafiają", "bearer-fails-to-hit": "nie trafiają" },
  chantOrShoutEnds: "za każdym razem, gdy kończy się na nim pieśń lub okrzyk",
  energyEmpty: "gdy jego energia spadnie do 0",
  dropped: DROPPED,
  targetsWords: TARGETS_WORDS,
  nextSkill: NEXT_SKILL,
  yourNextSkill: YOUR_NEXT_SKILL,
  creates: "za każdym razem, gdy tworzysz istotę",
  areaAroundCreated: AREA_AROUND_CREATED,
  nextSkillKind: {
    "attack-skill": ["umiejętność ataku", "umiejętności ataku"],
    spell: ["czar", "czary"],
    hex: ["klątwa", "klątwy"],
    signet: ["sygnet", "sygnety"],
    "signet-at-foe": ["sygnet wymierzony we wroga", "sygnety wymierzone we wroga"],
    "shout-or-chant": ["okrzyk lub pieśń", "okrzyki lub pieśni"],
    any: ["umiejętność", "umiejętności"],
  },
  lowerFirst,
  aCategory,
  negatedText,
  yourCondition,
  typeWord,
  splashSide: SPLASH_SIDE,
  auraWho: AURA_WHO,
  groundAnchorText: {
    caster: "w twoim miejscu",
    corpse: "w jego miejscu",
    target: "w miejscu twojego celu",
  },
  share,
  categoryNoun,
  weaponText: {
    axe: "Atak toporem",
    sword: "Atak mieczem",
    hammer: "Atak młotem",
    daggers: "Atak sztyletami",
    scythe: "Atak kosą",
    spear: "Atak włócznią",
    bow: "Atak łukiem",
    melee: "Atak wręcz",
  },
  chainRoleText: {
    lead: "Atak otwierający.",
    "off-hand": "Atak drugą ręką.",
    dual: "Atak podwójny.",
  },
  followsText: {
    lead: "Musi następować po ataku otwierającym.",
    "off-hand": "Musi następować po ataku drugą ręką.",
    dual: "Musi następować po ataku podwójnym.",
  },
  neededWeapon: NEEDED_WEAPON,
  weaponWord: WEAPON_WORD,
  typeText: TYPE_TEXT,
  areaText: AREA_TEXT,
  areaAroundTarget: AREA_AROUND_TARGET,
  targetText: TARGET_TEXT,
  areaWho: AREA_WHO,
  s: () => " s",
  onTarget: () => "na celu",
  composedLastsAtBase: (p) => (p.lasts === p.at ? p.base : `${seconds(p.lasts)} (${p.base})`),
  attributes: (p) => `atrybuty: ${p.name}`,
  attributes2: () => "atrybuty",
  attributePrimaryS: (p) => (p.scope === "primary" ? "atrybut główny" : "atrybuty żywiołów"),
  setTo: (p) => `${p.scope} ustawiono na ${p.rank}`,
  allAttributes: () => "wszystkie atrybuty",
  toAllAllAttributes: (p) => `${p.amount} do ${p.value}`,
  renewedWheneverAChantOrShoutEnds: (p) =>
    `odnawia się, gdy kończy się pieśń lub okrzyk na ${p.selfOnly ? "tobie" : "nim"}`,
  renewedWheneverYouCastItCastsA: (p) =>
    `odnawia się, gdy ${p.selfOnly ? "rzucasz czar" : "rzuca czar"}`,
  reappliedWheneverYouCastItCastsA: (p) =>
    `jest nakładane ponownie, gdy ${p.selfOnly ? "rzucasz czar na wroga" : "rzuca czar na wroga"}`,
  renewedWheneverYouTakeItTakesElemental: (p) =>
    `odnawia się, gdy ${p.selfOnly ? "otrzymujesz" : "otrzymuje"} obrażenia od żywiołów`,
  renewedWheneverAnEnchantmentOnYouIt: (p) =>
    `odnawia się, gdy kończy się zaczarowanie na ${p.selfOnly ? "tobie" : "nim"}`,
  gainAdrenalineFasterSlower: (p) =>
    `zyskuje adrenalinę ${p.shown} ${p.faster > 0 ? "szybciej" : "wolniej"}`,
  onTheBearerExpireFaster: (p) => `${p.what} na nosicielu wygasają ${p.stat} szybciej`,
  enchantmentsAndStances: () => "zaczarowania i postawy",
  enchantments: () => "zaczarowania",
  stances: () => "postawy",
  yourAttacksAgainstItHaveCriticalChance: (p) =>
    `twoje ataki przeciw niemu mają ${p.criticalChanceBonus}% szansy na trafienie krytyczne`,
  armorAgainstYourAttacksWhileItHas: (p) =>
    `${p.armorModifier} pancerza przeciw twoim atakom${p.onlyWhileNoOtherHex ? ", dopóki nie ma innej klątwy" : ""}`,
  youTheBearer: (p) => (p.selfOnly ? "tobie" : "nosicielu"),
  endsIfYouEndsIfTheBearer: (p) =>
    p.selfOnly
      ? `kończy się, gdy ${secondPerson(p.phrase)}`
      : `kończy się, gdy nosiciel ${p.phrase}`,
  healthDegeneration: (p) => `−${p.healthPips} degeneracji zdrowia`,
  healthRegeneration: (p) => `+${p.healthPips} regeneracji zdrowia`,
  healthRegenerationForEachEnchantmentOnYou: (p) =>
    `+${p.pips} regeneracji zdrowia na każde zaczarowanie na tobie (najwyżej ${p.max})`,
  energyDegeneration: (p) => `−${p.energyPips} degeneracji energii`,
  energyRegeneration: (p) => `+${p.energyPips} regeneracji energii`,
  healthRegenerationForEachConditionOnYou: (p) =>
    `${p.healthPipsPerCondition} regeneracji zdrowia na każdą dolegliwość na tobie`,
  health: () => "zdrowia",
  hex: () => "klątwę",
  energy: () => "energii",
  condition: () => "dolegliwość",
  regenerationForEachOnYou: (p) => `${p.pips} regeneracji ${p.what} na każdą ${p.each} na tobie`,
  armorWhileWielding: (p) => `${p.sign}${p.armorModifier} pancerza${wielding(p.weapon)}`,
  armorWhileNotMoving: (p) => `${p.armorWhileStill} pancerza w bezruchu`,
  healthPerSecondWhileMoving: (p) => `${p.healthPerSecondWhileMoving} zdrowia na sekundę w ruchu`,
  healthPerSecond: (p) => `+${p.healthPerSecond} zdrowia na sekundę`,
  healthPerSecondMoreInEarshotOf: (p) =>
    `+${p.healthPerSecondNearSpirit} zdrowia na sekundę więcej w zasięgu głosu ducha`,
  spellsCastInEarshotOfASpirit: (p) =>
    `czary rzucone w zasięgu głosu ducha odnawiają się o ${p.faster}% szybciej`,
  chanceToDoubleStrikeWhileWielding: (p) =>
    `+${p.chance}% szansy na podwójne uderzenie${wielding(p.weapon)}`,
  armorNotBelow: (p) => `−${p.amount} pancerza (nie mniej niż ${p.floor})`,
  movesAtSpeed: (p) => `porusza się z szybkością ${p.speed}%`,
  movesAtSpeedWhileEnchanted: (p) => `porusza się z szybkością ${p.speed}%, gdy jest zaczarowany`,
  speedBoostsHaveNoEffect: () => "przyspieszenia nie działają",
  cannotGainAdrenaline: () => "nie może zyskiwać adrenaliny",
  whenThisEndsYouReturnToWhere: () => "gdy to się skończy, wracasz tam, gdzie to rzuciłeś",
  whenThisEndsYouShadowStepTo: (p) =>
    `gdy to się skończy, przeskakujesz przez cienie do sojusznika, na którego to rzuciłeś, a wszystkie twoje umiejętności zostają zablokowane na ${sek(p.seconds)}`,
  ofAttacksMiss: (p) => `${p.attackMissChance}% ataków chybia`,
  maximumHealthAtMost: (p) => `−${p.fraction}% maksymalnego zdrowia (najwyżej ${p.cap})`,
  maximumHealth: (p) => `+${p.maxHealthBonus} maksymalnego zdrowia`,
  maximumHealthPerEnchantment: (p) =>
    `+${p.maxHealthBonusPerEnchantment} maksymalnego zdrowia na każde zaczarowanie`,
  maximumEnergy: (p) => `+${p.maxEnergyBonus} maksymalnej energii`,
  maximumHealthPerPointOfMaximumEnergy: (p) =>
    `+${p.per} maksymalnego zdrowia za punkt maksymalnej energii`,
  yourMinionsDealDamage: (p) => `twoje sługi zadają ${p.minionDamageBonus} obrażeń`,
  loseMaximumHealthEachTimeAMinion: (p) =>
    `traci ${p.minionHitHealthLossPercent}% maksymalnego zdrowia, gdy któraś z twoich sług trafi`,
  conditionsYouWouldReceiveGoToYour: () =>
    "dolegliwości, które byś otrzymał, przechodzą na twoją najbliższą sługę",
  healing: (p) => `${p.more ? "+" : "−"}${p.change} leczenia`,
  weaponDamage: (p) => `${p.change}% obrażeń od broni`,
  dealsDamage: (p) => `zadaje ${p.more ? "+" : "−"}${p.change} obrażeń`,
  noDeathPenalty: () => "brak kary za śmierć",
  whenTheBearerDiesSoDoesIts: () => "gdy nosiciel ginie, ginie też jego rzucający",
  alliesYouResurrectReturnWithHealthAnd: (p) =>
    `wskrzeszeni przez ciebie sojusznicy wracają z +${p.health} zdrowia i +${p.energy} energii`,
  youDieTheBearerDiesWhenIt: (p) =>
    p.selfOnly ? "giniesz, gdy to się kończy" : "nosiciel ginie, gdy to się kończy",
  leavesAnExploitedCorpse: () => "pozostawia wykorzystane zwłoki",
  takeFromPhysicalDamage: (p) => `otrzymuje ${p.sign}${p.amount} od obrażeń fizycznych`,
  elementalDamageTakenIsDamage: (p) =>
    `otrzymywane obrażenia od żywiołów to ${damageAcc(p.elementalDamageTakenAs)}`,
  physicalDamageTakenIsDamage: (p) =>
    `otrzymywane obrażenia fizyczne to ${damageAcc(p.physicalDamageTakenAs)}`,
  physicalDamageDealtIsDamage: (p) =>
    `zadawane obrażenia fizyczne to ${damageAcc(p.physicalDamageDealtAs)}`,
  elementalDamageDealtIsDamage: (p) =>
    `zadawane obrażenia od żywiołów to ${damageAcc(p.elementalDamageDealtAs)}`,
  takeFromSpiritsAttacks: (p) => `otrzymuje ${p.damageFromSpiritAttacks} od ataków duchów`,
  attacksAttacksDealDamage: (p) =>
    `${weaponAttacks(p.weapon)} zadają ${damageAcc(p.attackDamageType)}`,
  attacksHaveArmorPenetration: (p) => `ataki mają ${p.attackArmorPenetration}% przebicia pancerza`,
  attacksAttacksDealLessMoreDamage: (p) =>
    `${weaponAttacks(p.weapon)} zadają o ${p.amount} ${p.delta < 0 ? "mniej" : "więcej"} obrażeń`,
  and: () => " i ",
  immuneToAnd: (p) => `niewrażliwy na ${p.names}`,
  setOnFire: () => "podpalenie",
  or: () => " lub ",
  cannotBeOr: (p) => `nie może doznać: ${p.names}`,
  attacksFromAttacks: (p) =>
    `${p.adrenalineGain}${p.adrenalineGainFasterFrom === "attacks" ? " od ataków" : ""}`,
  yourEliteEliteSkillSUse: (p) =>
    `twoje ${p.skillType === "elite" ? "elitarne umiejętności" : pluralNoun(spaced(p.skillType))} używają atrybutu ${p.name}`,
  uses: (p) => `użycia: ${spaced(p.skillType)}`,
  sUse: (p) => `następne ${p.uses} ${pluralNoun(spaced(p.skillType))} używają`,
  yourNext: (p) => `twój następny ${p.next} ${p.name}`,
  spellsTakeAsLongToCast: (p) => `rzucanie czarów trwa ${p.castTimeMultiplier}× dłużej`,
  skillsButAttacksTakeAsLongTo: (p) =>
    `aktywacja umiejętności innych niż ataki trwa ${p.skillActivationMultiplier}× dłużej`,
  spellsAreInterruptedByAttacks: () => "czary są przerywane przez ataki",
  slowerFaster: (p) => (p.attackDurationMultiplier > 1 ? "wolniej" : "szybciej"),
  attacksWhileWielding: (p) => `atakuje o ${p.change}% ${p.way}${wielding(p.weapon)}`,
  conditionsYouApplyLastLongerWhileWielding: (p) =>
    `dolegliwości, które nakładasz, trwają o ${p.longer}% dłużej${wielding(p.weapon)}`,
  enchantmentsYouMaintainCostTheUpkeep: (p) =>
    `podtrzymywane przez ciebie zaczarowania kosztują ${p.upkeepMultiplier}× więcej utrzymania`,
  spellsThatCauseOvercastCauseMoreAs: (p) =>
    `czary powodujące przeciążenie powodują przy ukończeniu o ${p.overcastSurcharge} więcej`,
  arrowsMoveAsFast: (p) => `strzały lecą ${p.projectileSpeedMultiplier}× szybciej`,
  cannotCastSpells: () => "nie może rzucać czarów",
  cannotAttack: () => "nie może atakować",
  cannotUseResurrectionSkills: () => "nie może używać umiejętności wskrzeszających",
  cannotBeTheTargetOfEnemySpells: (p) =>
    p.whileCasting
      ? "nie może być celem wrogich czarów podczas rzucania"
      : "nie może być celem wrogich czarów",
  cannotBeTheTargetOfSpells: () => "nie może być celem czarów",
  hostileSpellsTargetingYouFail: () => "wrogie czary wymierzone w ciebie zawodzą",
  attacksAgainstYouMiss: () => "ataki przeciw tobie chybiają",
  strippedOfAllEnchantmentsAndCannotBe: () =>
    "traci wszystkie zaczarowania i nie może zostać zaczarowany",
  cannotBeTheTargetOfEnchantments: () => "nie może być celem zaczarowań",
  cannotUseShoutsOrChants: () => "nie może używać okrzyków ani pieśni",
  cannotUseSignets: () => "nie może używać sygnetów",
  cannotBlockItsCasterSAttacks: () => "nie może blokować ataków swojego rzucającego",
  cannotBeBlockedByBlindedFoes: () => "nie może zostać zablokowany przez oślepionych wrogów",
  cannotBlock: () => "nie może blokować",
  renewedForSecondsIfMovingAsIt: (p) =>
    `odnawia się na ${sek(p.renewsWhileMoving)}, jeśli w chwili końca porusza się`,
  cannotBeKnockedDown: () => "nie może zostać powalony",
  cannotBeKnockedDownByAFoe: () => "nie może zostać powalony przez wroga",
  endsIfItPreventsAKnockdown: () => "kończy się, gdy zapobiegnie powaleniu",
  youDoNotSufferExtraDamageFrom: () => "nie otrzymujesz dodatkowych obrażeń od trafień krytycznych",
  cannotLandCriticalHits: () => "nie może zadawać trafień krytycznych",
  immuneToCriticalHits: () => "niewrażliwy na trafienia krytyczne",
  spellsHaveDoubleTheDivineFavorBonus: (p) =>
    `czary ${p.attribute} mają podwojoną premię Boskiej Łaski`,
  attackSkillAttackSkills: (p) =>
    p.once
      ? p.attackSkillsOnly === true
        ? "umiejętność ataku"
        : { all: "atak", melee: "atak wręcz", projectile: "pocisk" }[p.against]
      : p.attackSkillsOnly === true
        ? "umiejętności ataku"
        : { all: "ataki", melee: "ataki wręcz", projectile: "pociski" }[p.against],
  whileBelowHealth: (p) => ` poniżej ${p.blockBelowHealth}% zdrowia`,
  whileUnderOr: (p) => ` pod wpływem: ${p.value}`,
  fromFoesUnderOr: (p) => ` od wrogów pod wpływem: ${p.value}`,
  whileAttacking: (p) => (p.blockWhileAttacking ? " podczas ataku" : ""),
  blocksTheNextChanceToBlock: (p) =>
    p.once
      ? `blokuje następny: ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`
      : `${p.chance}% szansy na blok: ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`,
  within: (p) => within(p.radius, p.radius2),
  alliesTo: (p) => `Sojusznicy ${p.around} przy ${p.bearer}: ${p.status}`,
  whileWielding: (p) => wielding(p.weapon),
  whileHoldingAWeaponOtherThan: (p) => `, gdy dzierżysz broń inną niż ${NEEDED_WEAPON[p.not]}`,
  againstFoesThatAreNotMoving: (p) =>
    p.criticalChanceBonusVersus === undefined ? "" : " przeciw wrogom, którzy się nie ruszają",
  criticalChance: (p) => `${p.chance}% szansy na trafienie krytyczne${p.holding}${p.versus}`,
  gainEnergyPerCriticalHit: (p) => `zyskuje ${p.energyPerCritical} energii za trafienie krytyczne`,
  wheneverYouSuccessfullyLandACriticalHit: (p) =>
    `gdy zadasz trafienie krytyczne, zyskujesz ${p.healthPerCritical} zdrowia`,
  refreshesEveryTimeYouLandACritical: () => "odnawia się przy każdym trafieniu krytycznym",
  theNextTimeYouLandACritical: (p) =>
    p.endsWhenFired
      ? "gdy następnym razem zadasz trafienie krytyczne"
      : "za każdym razem, gdy zadasz trafienie krytyczne",
  with: (p) => (p.weapon === undefined ? p.critical : `${p.critical} ${WITH_WEAPON[p.weapon]}`),
  removeStatusFromYourTarget: (p) =>
    p.kind === "remove-status"
      ? `${p.when}: ${lowerFirst(p.text)} z twojego celu`
      : `${p.when}: ${lowerFirst(p.text)}`,
  ifOneIsRemovedYouLoseEnergy: (p) =>
    `jeśli jedno zostanie usunięte, tracisz ${p.energyIfRemoved} energii albo to się kończy`,
  endsAfterIncomingAttackS: (p) =>
    `kończy się po ${p.endsAfterAttacks} ${plural(p.endsAfterAttacks2, "ataku", "atakach", "atakach")} przychodzących`,
  endsAfterYourNextAttackSHit: (p) =>
    p.endsAfterAttackCount2 === 1
      ? "kończy się po twoim następnym ataku, trafionym, chybionym lub zablokowanym"
      : `kończy się po twoich następnych ${p.endsAfterAttackCount} atakach, trafionych, chybionych lub zablokowanych`,
  noEffectWhileUnderOr: (p) => `brak efektu pod wpływem: ${p.suppressedWhileUnder}`,
  yourNextAttackSCannotBeBlocked: (p) =>
    p.unblockableAttacks2 === 1
      ? "twój następny atak nie może zostać zablokowany"
      : `twoje następne ${p.unblockableAttacks} ataki nie mogą zostać zablokowane`,
  attacksCannotBeBlocked: (p) => `${weaponAttacks(p.weapon)} nie mogą zostać zablokowane`,
  whileYouWieldAnAWeapon: (p) =>
    `gdy dzierżysz broń zadającą ${damageAcc(p.weaponDamage)}, ${p.hit}`,
  forEachEnchantmentRemovedSCasterLoses: (p) =>
    `za każde usunięte zaczarowanie (${p.name}) rzucający ${p.name2} traci ${p.percentOfMax}% swojego maksymalnego zdrowia`,
  with2: (p) => (p.weapon === undefined ? "" : ` ${WITH_WEAPON[p.weapon]}`),
  endsAfterHitS: (p) =>
    `kończy się po ${p.count} ${p.count2 === 1 ? "trafieniu" : "trafieniach"}${p.how}`,
  spellSpells: (p) => (p.one ? "czar" : `${p.count} czarów`),
  yourNextCostsCostLessEnergy: (p) =>
    `${p.one ? "twój następny" : "twoje następne"} ${p.next} ${p.one ? "kosztuje" : "kosztują"} o ${p.costReduction} energii mniej`,
  yourNextRechargesRechargeFaster: (p) =>
    `${p.one ? "twój następny" : "twoje następne"} ${p.next} ${p.one ? "odnawia" : "odnawiają"} się o ${p.rechargeFaster}% szybciej`,
  forYourNext: (p) => `dla twoich następnych ${p.next}`,
  theirProjectilesMoveAsFast: (p) => `ich pociski lecą ${p.projectileSpeedMultiplier}× szybciej`,
  noOvercast: () => "brak przeciążenia",
  spreadsToAdjacentCombatants: () => "przenosi się na przylegających walczących",
  nextAttackSkillDamage: (p) => `następna umiejętność ataku: ${p.condition}: +${p.more} obrażeń`,
  attacks: () => "atakuje",
  makesAMeleeAttack: () => "wykonuje atak wręcz",
  moves: () => "się porusza",
  takesDamage: (p) => `otrzymuje ${p.damageTakenMultiplier}`,
  takesDamageFromTheNextAttack: (p) =>
    `otrzymuje od następnego ataku ${damageTaken(p.attackDamageTakenMultiplier)}`,
  damageTaken2: (p) => `−${p.damageReduction} otrzymywanych obrażeń`,
  damageTakenPerRankOfAtMost: (p) =>
    `−${p.now} otrzymywanych obrażeń (${p.perRank} za rangę ${p.attribute}, najwyżej ${p.max})`,
  damageTakenMoreEachHit: (p) =>
    `−${p.step} otrzymywanych obrażeń, o ${p.step} więcej z każdym trafieniem`,
  theNextHitDealsLessDamage: (p) =>
    `następne trafienie zadaje o ${p.nextDamageReduction} obrażeń mniej`,
  damageTakenWhileCastingS: (p) =>
    `−${p.amount} otrzymywanych obrażeń podczas rzucania: ${pluralNoun(spaced(p.skillType))}`,
  lessDamage: (p) => `o ${p.value}% mniej ${damageNoun(p.type)}`,
  lessDamageFromFoesWithAHex: (p) =>
    `o ${p.fraction}% mniej obrażeń od wrogów z klątwą (${p.name})`,
  lessDamageFromFoesSufferingFrom: (p) =>
    `o ${p.fraction}% mniej obrażeń od wrogów pod wpływem: ${p.name}`,
  damageTakenFromFoesWithLessHealth: (p) =>
    `−${p.damageReductionFromWeakerFoe} otrzymywanych obrażeń od wrogów z mniejszym zdrowiem`,
  damageTakenFromFoesWithACondition: (p) =>
    `−${p.damageReductionFromConditionedFoe} otrzymywanych obrażeń od wrogów z dolegliwością`,
  lessDamageFromSpells: (p) => `o ${p.less}% mniej obrażeń od czarów`,
  damageOverInASecondIsHealed: (p) => `obrażenia ponad ${p.cap} na sekundę zostają uleczone`,
  physicalItsPhysicalDamageTheDamageIt: (p) =>
    p.from === "physical" ? "jego obrażenia fizyczne" : "obrażenia, które otrzymuje od ataków",
  whichTakesLessOfIt: (p) => `, który otrzymuje ich o ${p.reduction} mniej`,
  goesToItsCaster: (p) => `${share(p.fraction)} z: ${p.hits} przechodzi na rzucającego${p.less}`,
  theDamageYouTakeGoesToYour: (p) =>
    `${share(p.redirectsDamageToMinion)} otrzymywanych obrażeń przechodzi na twoją najbliższą sługę`,
  damageFromASingleHitIsCapped: (p) =>
    `obrażenia z pojedynczego trafienia są ograniczone do ${p.maxDamageFractionPerHit}% maksymalnego zdrowia`,
  eachHitItCapsCostsTheCaster: (p) =>
    `każde tak ograniczone trafienie kosztuje rzucającego ${p.casterEnergyPerReduction} energii, a efekt kończy się, gdy nie może zapłacić`,
  damageFromASingleAttackIsCapped: (p) =>
    `obrażenia z pojedynczego ataku są ograniczone do ${p.attackDamageCapFraction}% maksymalnego zdrowia`,
  lifeStolen: (p) => `−${p.lifeStealReduction} kradzionego zdrowia`,
  yourHealthSacrificesAreLarger: (p) =>
    `twoje poświęcenia zdrowia są o ${p.sacrificeMultiplier}% większe`,
  knockdownsLastAtLeastS: (p) => `powalenia trwają co najmniej ${p.knockdownMinSeconds} s`,
  itsSpiritLosesHealthEachTime: (p) =>
    `jego duch traci za każdym razem ${p.sourceLosesHealth} zdrowia`,
  reappliedAsItWouldEndWhileYou: (p) =>
    `jest nakładane ponownie w chwili końca, dopóki ${p.selfOnly ? "masz" : "ma"} kolejną klątwę`,
  chantsAndShoutsLastLongerOnIt: (p) => `pieśni i okrzyki trwają na nim o ${p.longer}% dłużej`,
  attacksDealLessMoreDamage: (p) =>
    `ataki zadają o ${p.attackDamageDelta} ${p.attackDamageDelta2 < 0 ? "mniej" : "więcej"} obrażeń`,
  movesFaster: (p) => `porusza się o ${p.moveSpeedMultiplier}% szybciej`,
  healthRegenerationDegeneration: (p) =>
    `${p.healthPips} ${p.healthPips2 > 0 ? "regeneracji" : "degeneracji"} zdrowia`,
  armor: (p) => `${p.armorModifier} pancerza`,
  attacksFaster: (p) => `atakuje o ${p.value}% szybciej`,
  aOr: (p) => categoryIds(p.categories),
  listComma: () => ", ",
  whileUnderOr2: (p) => `pod wpływem: ${p.under}: ${p.gains}`,
  once: () => "raz",
  times: (p) => `${p.stat} razy`,
  endsAfterItTakesEffect: (p) => `kończy się po ${p.times} zadziałaniu`,
  theNextHexFailsAndItsCaster: (p) =>
    `następna klątwa zawodzi, a jej rzucający otrzymuje ${p.damage} obrażeń`,
  theNextSpellItCastsAtFoe: (p) =>
    `następny czar, który rzuci na ${p.on === "foe-targeted" ? "wroga" : "sojusznika"}, zawodzi: ${p.what}`,
  theNextTouchSkillsUsedAgainstYou: (p) =>
    `następne ${p.failsFoeTouchSkills} umiejętności dotykowe użyte przeciw tobie zawodzą`,
  foesWithinFoes: (p) =>
    p.area === undefined ? `Wrogowie w promieniu ${p.radius}` : `Wrogowie ${p.area}`,
  moreEachSecond: (p) => `, o ${p.growth} więcej na sekundę`,
  eachSecondItAndTakeDamage: (p) =>
    `co sekundę ${p.hitsBearer ? "on i " : ""}${p.foes} otrzymują ${p.damage} ${damageOf(p.kind)}${p.more}`,
  second: () => "sekundę",
  seconds2: (p) => `${p.every} ${plural(p.every, "sekundę", "sekundy", "sekund")}`,
  everySecondSeconds: (p) => `co ${p.value}: ${p.what}`,
  itsSpiritLosesHealthForEachOne: (p) =>
    `jego duch traci ${p.amount} zdrowia za każdy zraniony cel`,
  itsSpiritLosesHealthForEachOne2: (p) =>
    `jego duch traci ${p.amount} zdrowia za każdy uleczony cel`,
  everyAttack: () => "każdego ataku",
  theNextAttack: () => "następnego ataku",
  theNextAttacks: (p) => `następnych ${p.times} ataków`,
  typelessAsDamage: (p) => (p.type === "typeless" ? "" : ` jako ${damageAcc(p.type)}`),
  ofTheDamageOfThatHitIt: (p) =>
    `${p.share}% obrażeń ${p.attacks}, które go trafią, wraca do atakującego${p.kind}, do ${p.max}`,
  eachAttackItLandsHasAChance: (p) =>
    `każde jego trafienie ma ${p.chance}% szansy, by zamiast tego zadać obrażenia jemu samemu, do ${p.max}`,
  theNextDamageOrLifeStealHeals: (p) =>
    `następne obrażenia lub kradzież zdrowia leczą zamiast tego o tę wartość, do ${p.reversesNextDamage}`,
  theNextDamageIsNegatedAndIts: (p) =>
    `następne obrażenia zostają zanegowane, a ich źródło otrzymuje je zamiast tego, do ${p.cap}`,
  meleeAttacksNeitherHitNorFailTo: (p) =>
    `ataki wręcz ani nie trafiają, ani nie chybiają i zamiast tego zadają po ${p.damage} obrażeń`,
  allDamageHealsForThatMuchInstead: (p) =>
    `wszelkie obrażenia zamiast tego leczą o tę wartość, do ${p.cap} za trafienie`,
  theNextDamageOrLifeStealThat: (p) =>
    `następne obrażenia lub kradzież zdrowia, które by ${p.selfOnly ? "cię" : "go"} zabiły, zostają zanegowane`,
  whenOneAllySIsSpentIt: () =>
    "gdy zużyje się u jednego sojusznika, kończy się u wszystkich pozostałych",
  gainMoreStrikeStrikesOfAdrenalinePer: (p) =>
    `zyskuje za trafienie o ${p.extraStrikesPerHit} ${plural(p.extraStrikesPerHit2, "uderzenie", "uderzenia", "uderzeń")} adrenaliny więcej`,
  skillsRechargeFaster: (p) => `umiejętności odnawiają się o ${p.skillRechargeFaster}% szybciej`,
  skillsCostMoreLessEnergy: (p) =>
    `umiejętności kosztują o ${p.change}% ${p.change2 > 0 ? "więcej" : "mniej"} energii`,
  spellsAndBindingRitualsRechargeFaster: (p) =>
    `czary i rytuały wiążące odnawiają się o ${p.faster}% szybciej`,
  spellsRechargeFaster: (p) => `czary odnawiają się o ${p.spellRechargeFaster}% szybciej`,
  bindingRitualsRechargeFaster: (p) => `rytuały wiążące odnawiają się o ${p.faster}% szybciej`,
  enchantmentsRechargeFaster: (p) =>
    `zaczarowania (${p.name}) odnawiają się o ${p.faster}% szybciej`,
  hexTheTargetSYour: (p) => (p.category === "hex" ? "jego" : "twoje"),
  skillsHaveArmorPenetration: (p) =>
    `umiejętności (${p.name}) mają ${p.pierce}% przebicia pancerza`,
  yourTheBearerSSkillsCannotBe: (p) =>
    `${p.selfOnly ? "twoje umiejętności" : "umiejętności nosiciela"} nie mogą zostać przerwane`,
  theNextTimeYouWouldBeInterrupted: () =>
    "gdy następnym razem miałbyś zostać przerwany, tak się nie stanie",
  youCannotBeInterruptedEachTimeYou: (p) =>
    `nie możesz zostać przerwany; za każdym razem, gdy by do tego doszło, tracisz ${p.amount} energii albo to się kończy`,
  youCannotBeInterruptedEachTimeYou2: (p) =>
    `nie możesz zostać przerwany; za każdym razem, gdy by do tego doszło, tracisz 1 zaczarowanie (${p.profession}) albo to się kończy`,
  conditionsOnExpireFaster: (p) => `dolegliwości na ${p.bearer} wygasają ${p.faster} szybciej`,
  hexesOnExpireFaster: (p) => `klątwy na ${p.bearer} wygasają o ${p.faster}% szybciej`,
  theNextHexOnLastsLonger: (p) =>
    `następna klątwa ${p.of} na ${p.bearer} trwa o ${p.longer} dłużej`,
  hexesCastOnTakeAsLongTo: (p) => `rzucanie klątw na ${p.bearer} trwa ${p.times}× dłużej`,
  otherAlliesSpellsOnTakeAsLong: (p) =>
    `rzucanie czarów innych sojuszników na ${p.bearer} trwa ${p.times}× dłużej`,
  yourSpellsOnTakeAsLongTo: (p) => `rzucanie twoich czarów na ${p.bearer} trwa ${p.times}× dłużej`,
  enchantmentsCastOnCostLessEnergyMinimum: (p) =>
    `zaczarowania na ${p.bearer} kosztują o ${p.less} energii mniej, co najmniej 1`,
  hitsWithAnAttack: () => "trafia atakiem",
  failsToHit: () => "nie trafia",
  hitsWithAnAttackSkill: () => "trafia umiejętnością ataku",
  skillEffectEndsIfYouUseA: (p) =>
    p.selfOnly || p.category === "skill-effect"
      ? "kończy się, gdy użyjesz umiejętności"
      : "kończy się, gdy nosiciel użyje umiejętności",
  endsIfYouUseAnAdrenalSkill: () => "kończy się, gdy użyjesz umiejętności adrenalinowej",
  endsIfYouUseANonAdrenal: () => "kończy się, gdy użyjesz umiejętności nieadrenalinowej",
  endsIfYouUseANonSkill: (p) => `kończy się, gdy użyjesz umiejętności innej niż ${p.kind}`,
  endsIfYouUseAnAttackSkill: () => "kończy się, gdy użyjesz umiejętności ataku",
  endsIfYouUseASkillOn: () => "kończy się, gdy użyjesz na nim umiejętności",
  endsIfYouUseASkillThat: (p) =>
    `kończy się, gdy użyjesz umiejętności innej niż ${p.NEXT_SKILL_KIND}`,
  hexHexedEnchanted: (p) => (p.category === "hex" ? "zaklęty" : "zaczarowany"),
  becomesOr: (p) => `staje się ${p.gained}`,
  theBearerIsDestroyedWhenItExpires: () => "nosiciel zostaje zniszczony po wygaśnięciu",
  theMinionsYouItTookBecomeMasterless: (p) =>
    `sługi, które ${p.selfOnly ? "przejąłeś" : "przejął"}, stają się bezpańskie, gdy to się kończy`,
  whenTheBearerDiesRisesWhereIt: (p) =>
    p.masterless === true
      ? `gdy nosiciel ginie, w jego miejscu powstaje bezpański ${p.stands}`
      : `gdy ginie, w jego miejscu powstaje ${p.stands}`,
  composedKindBoundWhenOn: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.on],
  endsIfItEndsIfYou: (p) =>
    p.onFoe ? `kończy się, gdy ${p.when}` : `kończy się, gdy ${secondPerson(p.when)}`,
  all: (p) => (p.once && p.against === "all" ? blockAnswer(p.text) : p.text),
  whileHoldingAnItem: (p) =>
    p.onlyWhileHoldingItem && !p.holdingSaid ? `${p.stats}, gdy trzyma przedmiot` : p.stats,
  composedIndexText: (p) => (p.index === 0 ? p.text : capitalize(p.text)),
  listSentence: () => ". ",
  physicalAttacks: (p) =>
    p.weapon !== undefined ? weaponAttacks(p.weapon) : p.physicalOnly ? "ataki fizyczne" : "ataki",
  attackSkillsPhysicalAttacks: (p) => (p.attackSkillsOnly ? attackSkills(p.weapon) : p.value),
  foesYourHitGetFor: (p) =>
    `wrogowie trafieni przez twoje ${p.attacks} otrzymują ${p.statusName} na ${p.durationSeconds}`,
  foesYourHitTake: (p) => `wrogowie trafieni przez twoje ${p.attacks} otrzymują ${p.riderDamage}`,
  foesYourHitLose: (p) =>
    `wrogowie trafieni przez twoje ${p.attacks} tracą ${p.count} ${categoryNoun(p.count2, p.category)}`,
  andSoDoFoesAdjacentToThem: (p) => `${p.pop}, a także przylegający do nich wrogowie`,
  stealUpToHealth: (p) => `${p.attacks} kradną do ${p.amount} zdrowia`,
  yourPetSAttacksHealYouFor: (p) => `ataki twojego chowańca leczą cię o ${p.amount}`,
  yourInterruptFoesTheyHit: (p) => `twoje ${p.attacks} przerywają trafionych wrogów`,
  your: (p) => `twoje ${p.attacks}: ${p.text}`,
  attackSkillsPhysicalAttacks2: (p) =>
    p.attackSkillsOnly
      ? attackSkills(p.weapon)
      : p.weapon === undefined
        ? "ataki fizyczne"
        : weaponAttacks(p.weapon),
  foesThatBlockYourGetFor: (p) =>
    `wrogowie blokujący twoje ${p.attacks} otrzymują ${p.statusName} na ${p.durationSeconds}`,
  foesThatBlockYour: (p) => `wrogowie blokujący twoje ${p.attacks}: ${lowerFirst(p.text)}`,
  damage: (p) => `${p.amount} ${damageNoun(p.type)}`,
  physical: () => "fizyczne",
  elemental: () => "od żywiołów",
  armor2: () => "pancerza",
  listSpace: () => " ",
  againstProjectileAttacks: (p) =>
    p.projectile ? `${kindedArmor(p.text)} przeciw atakom dystansowym` : kindedArmor(p.text),
  thatAllyIsHealedFor: (p) => `ten sojusznik zostaje uleczony o ${p.amount}`,
  youLoseItsCasterLoses: (p) => (p.bearerIsCaster ? "tracisz" : "jego rzucający traci"),
  energy2: (p) => `${p.who} ${p.amount} energii`,
  orSpell: (p) => `czar ${p.value}`,
  wheneverYouCastItCastsAnA: (p) =>
    `za każdym razem, gdy ${p.bearerIsCaster ? "rzucasz" : "rzuca"} ${compound(p.spell)} na sojusznika, ${p.value}`,
  composedKindBoundWhenEvent: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.event],
  youOrItOr: (p) => (p.bearerIsCaster ? p.phrases : p.phrases2),
  whenItOrOrAtOnce: (p) =>
    p.length === 0 ? p.death : `gdy ${p.others}, lub natychmiast ${p.death}`,
  whenItOr: (p) => `gdy ${p.on}`,
  composedBearerIsCaster: (p) => (p.bearerIsCaster ? YOUR_NEXT_SKILL : NEXT_SKILL),
  theNextTime: (p) => `następnym razem, gdy ${p.doer}`,
  composedEventWhenOf: (p) =>
    p.event === "bearer-hits"
      ? "trafiają"
      : p.event === "bearer-fails-to-hit"
        ? "nie trafiają"
        : p.whenOf,
  wheneverYourArrowsOr: (p) => `za każdym razem, gdy twoje strzały ${p.on}`,
  wheneverOnACreatureWithLessHealth: (p) =>
    `za każdym razem, gdy ${p.doer}${p.victimHasLessHealth === undefined ? "" : " istotę z mniejszym zdrowiem"}`,
  and2: () => " i ",
  andAnd: (p) => (p.when === undefined ? p.each : `${p.when}: ${p.each}`),
  youItAnd: (p) => `${p.when}: ${p.bearerIsCaster ? "ty" : "on"} oraz ${p.answer}`,
  youAndAllPartyMembersAreHealed: (p) =>
    `${DROPPED}: ty i wszyscy członkowie drużyny zostajecie uleczeni o ${p.healed}`,
  composedWhat: (p) => `${DROPPED}: ${p.what}`,
  meleeHitsWithAMeleeAttackHits: (p) =>
    p.weapon === "melee" ? "trafia atakiem wręcz" : `trafia ${WITH_WEAPON[p.weapon]}`,
  meleeIsHitByAFoeS: (p) =>
    p.weapon === "melee"
      ? "zostaje trafiony atakiem wręcz wroga"
      : `zostaje trafiony atakiem wroga ${WITH_WEAPON[p.weapon]}`,
  with3: (p) => `${TRIGGER_WHEN[p.event]} ${WITH_WEAPON[p.weapon]}`,
  youGainEnergy: (p) => `zyskujesz ${p.amount} energii`,
  allYourSkillsAreRecharged: () => "wszystkie twoje umiejętności są odnowione",
  yourPartyIsHealedFor: (p) => `twoja drużyna zostaje uleczona o ${p.amount}`,
  takeDamage: (p) => `${lowerFirst(p.upTo)} otrzymują ${p.amount} ${damageNoun(p.type)}`,
  areHealedFor: (p) => `${lowerFirst(p.upTo)} zostają uleczeni o ${p.amount}`,
  composedUpToText: (p) => `${lowerFirst(p.upTo)}: ${lowerFirst(p.text)}`,
  ifTargetFoeDiesWhileHexedWith: (p) =>
    p.bearerIsFoe
      ? "jeśli wrogi cel zginie, będąc pod wpływem tej klątwy"
      : "jeśli sojusznik zginie, będąc pod wpływem tego zaczarowania",
  and3: (p) => `${p.who}, ${p.flatMap}`,
  hasASpellInterrupted: () => "zostaje przerwany podczas rzucania czaru",
  isStruckForDamageWhileUsingA: (p) =>
    `zostaje trafiony, otrzymując ${damageNamed(p.damageType)} podczas używania umiejętności`,
  takesDamageFromAFoe: (p) => `otrzymuje ${damageNamed(p.damageType)} od wroga`,
  takesMoreThanDamageFromAFoe: (p) => `otrzymuje od wroga ponad ${p.minDamage} obrażeń`,
  hasItsHealthDroppedBelowByDamage: (p) =>
    `spada poniżej ${p.healthBelow}% zdrowia przez obrażenia`,
  isMoreThanFromYou: (p) => `jest dalej niż ${p.apartBeyond} od ciebie`,
  hitsWithAAttack: (p) => `trafia, wykonując ${CHAIN_ARTICLED[p.chainRole]}`,
  isHitByAnAttackAAttack: (p) =>
    `zostaje trafiony przez ${p.role === undefined ? "atak" : CHAIN_ARTICLED[p.role]} swojego rzucającego`,
  blocksAAttack: (p) =>
    `blokuje ${p.blocked === "melee" ? "atak wręcz" : p.blocked === "projectile" ? "atak dystansowy" : p.blocked}`,
  losesAEnchantment: (p) => `traci zaczarowanie (${p.name})`,
  hex2: (p) => compound(`${p.scopeAdjective} klątwa`),
  appliesAnAToAFoe: (p) => `nakłada na wroga ${compound(p.words).replace(/\bklątwa\b/, "klątwę")}`,
  spell: (p) => (p.type === undefined ? "czar" : typeName(p.type)),
  onAllyAnAllyAFoe: (p) => ` na ${p.targets === "ally" ? "sojusznika" : "wroga"}`,
  castsAnA: (p) => `rzuca ${compound(p.words)}${p.on}`.trim(),
  non: (p) => `nie-${TYPE_STEM[p.notType]}`,
  elite: () => "elitarna",
  adrenal: () => "adrenalinowa",
  skill: () => "umiejętność",
  isTargetedByYour: (p) => `staje się celem twojej ${skillGenitive(compound(p.words))}`,
  on: (p) => (p.targets === undefined ? "" : ` na ${TARGETS_WORDS[p.targets]}`),
  usesAnA: (p) => `używa ${skillGenitive(compound(p.words))}${p.on}`.trim(),
  health2: (p) => `${p.amount} zdrowia`,
  energy3: (p) => `${p.amount} energii`,
  takeDamage2: (p) => `otrzymują ${p.amount} ${damageNoun(p.type)}`,
  loseAllAllS: (p) =>
    `tracą ${p.value} ${p.count === 1 ? CATEGORY[p.category].acc : CATEGORY[p.category].few}`,
  all2: (p) => `wszyscy ${p.side}`,
  upTo: (p) => `do ${p.maxTargets} ${p.side}`,
  withinOfThatCreature: (p) =>
    AREA_AROUND_CREATED.get(p.radius) ?? `w promieniu ${p.radius2} od tej istoty`,
  gain: (p) => `zyskują ${p.answer}`,
  youGain: (p) => `${p.when}: ${p.gains ? `zyskujesz ${p.answers}` : p.answers}`,
  onIt: () => "na nim",
  damageOnIt: (p) => `${p.value}${p.amount} ${damageNoun(p.type)} ${p.perCount}`,
  composedWhenWhat: (p) => `${p.when}: ${p.what}`,
  itsAdjacentAllies: () => "jego przylegający sojusznicy",
  itsAlliesWithin: (p) => `jego sojusznicy ${p.area ?? `w promieniu ${p.radius}`}`,
  itsAdjacentAlliesItsAlliesWithin: (p) =>
    !p.bearerIsFoe ? `${lowerFirst(p.foesWithin)}${p.only}` : p.value,
  bearerBlocksMeleeMeleeProjectile: (p) =>
    p.on === "bearer-blocks-melee" ? "wręcz" : "dystansowy",
  whenYouBlockYouAndAlliesAre: (p) =>
    `gdy blokujesz, ty i sojusznicy ${p.area} zostajecie uleczeni o ${p.amount}`,
  eachBlockCostsYouEnergyOrThis: (p) =>
    `każdy blok kosztuje cię ${p.amount} energii albo to się kończy`,
  youGainEnergyForEachSuccessfulAttack: (p) =>
    `zyskujesz ${p.amount} energii za każdy pomyślnie zablokowany atak ${p.kind}`,
  wheneverYouBlockAAttackThisWay: (p) =>
    `za każdym razem, gdy zablokujesz w ten sposób atak ${p.kind}, atakujący otrzymuje ${p.amount} ${damageNoun(p.type)}`,
  withinOfYouFoes: (p) =>
    `Wrogowie ${AREA_TEXT.get(p.radius) ?? `w promieniu ${p.radius2} od ciebie`}`,
  ifYouBlockAAttackSufferFrom: (p) =>
    `gdy zablokujesz atak ${p.kind}, ${p.foes} doznają ${p.statusName} na ${sek(p.resolveMagnitudeAtRanks)}`,
  ifYouBlockAAttack: (p) => `gdy zablokujesz atak ${p.kind}, ${p.foes}: ${lowerFirst(p.text)}`,
  stealsHealthFromThatFoe: (p) => `kradnie temu wrogowi ${p.amount} zdrowia`,
  loses: (p) => `traci ${p.count} ${categoryNoun(p.count2, p.category)}`,
  itTakesDamage: (p) => `otrzymuje ${p.amount} ${damageNoun(p.type)}`,
  takeDamage3: (p) => `${p.splashed} otrzymują ${p.amount} ${damageNoun(p.type)}`,
  thatAttackIsInterruptedAndAnd: (p) => `${p.when}, ten atak zostaje przerwany i ${p.hurt}`,
  itIsInterruptedAndYouLoseEnergy: (p) =>
    `${p.when}, zostaje przerwane i tracisz ${p.amount} energii albo to się kończy`,
  ofThatSkillSBaseEnergyCost: (p) => `${p.share} bazowego kosztu energii tej umiejętności`,
  energy4: (p) => `${p.amount} energii`,
  youAreHealedAreHealedIsHealed: (p) =>
    p.bearerIsCaster && p.length === 0
      ? "zostajesz uleczony"
      : p.bearerIsCaster
        ? "zostają uleczeni"
        : "zostaje uleczony",
  forOfThatSkillSEnergyCost: (p) => `${p.healed} o ${p.share} kosztu energii tej umiejętności`,
  forWord: (p) => `${p.healed} o ${p.amount}`,
  plus: () => " plus ",
  youGainGainsPlus: (p) => `${p.bearerIsCaster ? "zyskujesz" : "zyskuje"} ${p.gains}`,
  theNearestOf: (p) => `najbliższy z: ${p.splashed}`,
  upTo2: (p) => `do ${p.maxTargets} ${p.splashed}`,
  itAndLoseEnergy: (p) => `on i ${p.others} tracą ${p.amount} energii`,
  bearerFoesFoesOtherFoes: (p) => (p.to === "bearer-foes" ? "wrogowie" : "inni wrogowie"),
  inTheAreaSufferItToo: (p) => `${p.who} na obszarze również tego doznają`,
  ifASpellItThatSkill: (p) => (p.spellsOnly ? "jeśli to czar, ten czar" : "ta umiejętność"),
  takesThisSkillSSlotForSeconds: (p) =>
    `${p.which} zajmuje miejsce tej umiejętności na ${sek(p.seconds)}`,
  youEnterTheSameStance: () => "przyjmujesz tę samą postawę",
  youLoseEnergyOrThisEnds: (p) => `tracisz ${p.amount} energii albo to się kończy`,
  thatAttackIsInterrupted: (p) => `${p.when}, ten atak zostaje przerwany`,
  takes: (p) => `otrzymuje ${p.dealt} ${p.when}`,
  bearerFatalDamageNegatedAnd: (p) => (p.on === "bearer-fatal-damage-negated" ? "i" : `${p.when},`),
  theFoeWhoDealtItTakesDamage: (p) =>
    `${p.then} wróg, który je zadał, otrzymuje ${p.amount} ${damageNoun(p.type)}`,
  thatAttackerIsHealedFor: (p) => `${p.when}, ten atakujący zostaje uleczony o ${p.amount}`,
  bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p) =>
    p.on === "bearer-gains-enchantment" ? "zaczarowanie" : "klątwę lub zaczarowanie",
  theCasterOfThatTakesDamage: (p) =>
    `${p.when}, rzucający to (${p.gained}) otrzymuje ${p.amount} ${damageNoun(p.type)}`,
  theHealerTakesDamage: (p) => `${p.when}, uzdrowiciel otrzymuje ${p.amount} ${damageNoun(p.type)}`,
  ofThatTarget: (p) => `${lowerFirst(p.upTo)} tego celu ${p.what}${p.paid}`,
  healsItsCasterFor: (p) => `leczy swojego rzucającego o ${p.amount}, ${p.when}`,
  itsCasterGainsEnergy: (p) => `jego rzucający zyskuje ${p.amount} energii, ${p.when}`,
  theNextSkillYouUseItUses: (p) =>
    `następna umiejętność, której ${p.bearerIsCaster ? "użyjesz" : "użyje"}, odnawia się o ${sek(p.seconds)} dłużej`,
  itsCasterStealsHealth: (p) => `jego rzucający kradnie ${p.amount} zdrowia, ${p.when}`,
  theNearestOfTakes: (p) => `najbliższy z: ${p.allies} otrzymuje`,
  take: (p) => `${p.allies} otrzymują`,
  upToTake: (p) => `do ${p.maxTargets} ${p.allies} otrzymują`,
  composedAlliesText: (p) => `${p.allies}: ${lowerFirst(p.text)}`,
  onAFoe: (p) => `${p.when} na wrogu`,
  adjacentToYou: () => "przylegający do ciebie",
  withinAroundYou: (p) => `${p.area ?? `w promieniu ${p.radius}`} wokół ciebie`,
  otherAdjacentToYouWithinAroundYou: (p) =>
    `${p.includesCentre === true ? "" : "inni "}${SPLASH_SIDE[p.hits]} ${p.value}`,
  takeDamage4: (p) => `${p.yours}, ${p.reached} otrzymują ${p.amount} ${damageNoun(p.type)}`,
  composedYoursReachedText: (p) => `${p.yours}, ${p.reached}: ${lowerFirst(p.text)}`,
  composedBearerIsCasterSaid: (p) =>
    p.bearerIsCaster ? yourCondition(p.said) : p.said.replace(/^Jeśli cel/, "Jeśli"),
  composedWhenConditionText: (p) => `${p.when}, ${p.condition}: ${lowerFirst(p.text)}`,
  bearer: (p) => lowerFirst(p.target === "bearer" ? p.bearer : p.text),
  nextAttackSkill: (p) => `następna umiejętność ataku: ${p.statusName} ${p.durationSeconds}`,
  nextAttackSkill2: (p) => `następna umiejętność ataku: ${p.text}`,
  skillTargetAroundItsTarget: (p) => (p.at === "skill-target" ? " (wokół jego celu)" : ""),
  withYourNext: (p) => `przy twoim następnym ${p.next}${p.around}: ${lowerFirst(p.text)}`,
  costsCostEnergy: (p) => `${p.one ? "kosztuje" : "kosztują"} ${p.energyBase} energii`,
  costsCostLessEnergy: (p) =>
    `${p.one ? "kosztuje" : "kosztują"} o ${p.energyPercentOff} energii mniej`,
  costsCostLessEnergyMinimum: (p) =>
    `${p.one ? "kosztuje" : "kosztują"} o ${p.energyDiscount} energii mniej (co najmniej ${p.energyFloor})`,
  costsCostMoreEnergy: (p) =>
    `${p.one ? "kosztuje" : "kosztują"} o ${p.energySurcharge} energii więcej`,
  castsCastInstantly: (p) => `${p.one ? "rzucany" : "rzucane"} natychmiast`,
  castsCastFaster: (p) => `${p.one ? "rzucany" : "rzucane"} ${p.activationMultiplier} szybciej`,
  takesTakeAsLongToCast: (p) => `${p.one ? "trwa" : "trwają"} ${p.activationMultiplier}× dłużej`,
  castsCastFaster2: (p) => `${p.one ? "rzucany" : "rzucane"} o ${p.activationSecondsLess} szybciej`,
  rechargesRechargeFaster: (p) =>
    `${p.one ? "odnawia" : "odnawiają"} się ${p.rechargeFaster} szybciej`,
  rechargesRechargeSlower: (p) =>
    `${p.one ? "odnawia" : "odnawiają"} się ${p.rechargeSlower} wolniej`,
  lastsLastLongerShorter: (p) =>
    `${p.one ? "trwa" : "trwają"} ${p.durationMultiplier} ${p.durationMultiplier2 > 1 ? "dłużej" : "krócej"}`,
  healsHealLessMoreNotTheDivine: (p) =>
    `${p.one ? "leczy" : "leczą"} o ${p.value} ${p.healMultiplier < 1 ? "mniej" : "więcej"}${p.sparesDivineFavor ? ", bez premii Boskiej Łaski" : ""}`,
  isAreNotEasilyInterrupted: (p) => `${p.one ? "nie jest" : "nie są"} łatwe do przerwania`,
  overcastYouBy: (p) => `powodują u ciebie ${p.overcastPerUse} przeciążenia`,
  andAttack: (p) =>
    `ataki ${p.chainRoles
      .replace(/\boff-hand\b/g, "drugą ręką")
      .replace(/\bdual\b/g, "podwójne")
      .replace(/\blead\b/g, "otwierające")}`,
  attackSkillSkill: (p) =>
    p.weapon !== undefined
      ? `umiejętność ataku ${WEAPON_WORD[p.weapon]}`
      : p.type === undefined
        ? "umiejętność"
        : spaced(p.type),
  hexHexesS: (p) => (p.one ? p.kind : pluralNoun(p.kind)),
  thatTargetsAFoeThatTargetA: () => "przeciw wrogowi",
  thatTargetsYouThatTargetYou: () => "na ciebie",
  halfRanged: () => "o połowie zasięgu",
  notFlashEnchantments: (p) => (p.notFlash ? " (bez zaczarowań błyskawicznych)" : ""),
  whileHoldingAnItem2: (p) => (p.whileHoldingItem ? "gdy trzymasz przedmiot, " : ""),
  nextNext: (p) =>
    p.one ? `${p.whose === "twoje" ? "twój" : "jego"} następny` : `${p.whose} następne ${p.uses}`,
  cannotBeInterrupted: () => "nie może zostać przerwane",
  cannotBeBlocked: () => "nie może zostać zablokowane",
  costsLessEnergy: (p) => `kosztuje o ${p.energyDiscount} energii mniej`,
  castsInstantly: () => "rzucane natychmiast",
  rechargesInstantly: () => "odnawia się natychmiast",
  s2: (p) => `${p.value} s`,
  takesSLongerToRecharge: (p) => `odnawia się o ${p.extraRechargeSeconds} dłużej`,
  yourNextAnd: (p) => `twój następny ${p.NEXT_SKILL_KIND} ${p.does}`,
  youLoseAllEnergyAsItIs: () => "tracisz całą energię podczas rzucania",
  youGainOfItsEnergyCost: (p) => `zyskujesz ${p.energyGainOfCost} jego kosztu energii`,
  itRechargesFaster: (p) => `odnawia się o ${p.fraction}% szybciej`,
  rechargesInstantly2: (p) => `${p.name} odnawia się natychmiast`,
  forYourNextSkill: () => "dla twojej następnej umiejętności",
  ifItIsAAnd: (p) => `jeśli to ${p.kind}, ${p.does}`,
  suffer: (p) => `doznają ${p.sufferedWhat}`,
  forWord2: (p) => `${p.statusName} na ${p.durationSeconds} (${p.status})`,
  a: (p) => `${CATEGORY[p.category].acc} (${compound(p.owners)})`,
  ifItInterruptsASkill: () => "Jeśli przerwie umiejętność",
  ifThatActionWasASpell: () => "Jeśli tą akcją był czar",
  ifThatActionWasAnAttack: () => "Jeśli tą akcją był atak",
  ifItKillsTheTarget: () => "Jeśli zabije cel",
  ifItResurrects: () => "Jeśli wskrzesi",
  ifASpiritDiedInThisWay: () => "Jeśli w ten sposób zginął duch",
  ifWasRemoved: (p) => `Jeśli usunięto ${CATEGORY[p.category].acc}`,
  ifItRemoves: (p) => `Jeśli usunie ${aCategory(p.category)}`,
  ifTargetIsBelowHealth: (p) => `Jeśli cel ma mniej niż ${p.fraction}% zdrowia`,
  ifTargetIsAboveHealth: (p) => `Jeśli cel ma więcej niż ${p.fraction}% zdrowia`,
  ifYouHaveLessThanHealth: (p) => `Jeśli masz mniej niż ${p.fraction}% zdrowia`,
  ifYouHaveLessHealthThanYour: () => "Jeśli masz mniej zdrowia niż twój chowaniec",
  ifYourPetHasLessHealthThan: () => "Jeśli twój chowaniec ma mniej zdrowia niż ty",
  ifItFollowsOffHandAnOff: (p) => `Jeśli następuje po: ${CHAIN_ARTICLED[p.role]}`,
  ifTargetHas: (p) => `Jeśli cel ma ${p.filteredCategory}`,
  ifTargetHasOr: (p) => `Jeśli cel ma ${p.categories}`,
  ifYouHave: (p) => `Jeśli masz ${aCategory(p.category)}`,
  ifYouHaveA: (p) => `Jeśli masz ${CATEGORY[p.category].acc} (${p.name})`,
  other: (p) => (p.excluding === undefined ? "" : "inną "),
  ifYouHaveNo: (p) => `Jeśli nie masz ${noOther(p.category, p.other, CATEGORY[p.category].gen)}`,
  ifYouHaveNo2: (p) =>
    `Jeśli nie masz ${noOther(p.category, p.other, `${CATEGORY[p.category].gen} (${p.name})`)}`,
  ifTargetIsCastingASpellOr: (p) =>
    p.orChant === true ? "Jeśli cel rzuca czar lub pieśń" : "Jeśli cel rzuca czar",
  ifTargetIsUsingASkill: () => "Jeśli cel używa umiejętności",
  ifTargetHasNoOtherHex: (p) => `Jeśli cel nie ma innej klątwy (${p.name})`,
  ifTargetIsNotAdjacentToAny: () => "Jeśli cel nie przylega do żadnego sojusznika",
  ifTargetIsNotNearAnyAllies: () => "Jeśli cel nie ma sojuszników w pobliżu",
  ifTargetHasNoAlliesWithin: (p) => `Jeśli cel nie ma sojuszników w promieniu ${p.radius}`,
  ifTargetIsNearAnyOfYour: () => "Jeśli cel jest w pobliżu któregoś z twoich sojuszników",
  ifAnyOfYourAlliesIsWithin: (p) =>
    `Jeśli któryś z twoich sojuszników jest w promieniu ${p.radius} od celu`,
  ifTargetIsWithinEarshot: () => "Jeśli cel jest w zasięgu głosu",
  ifTargetIsWithinOfYou: (p) => `Jeśli cel jest w promieniu ${p.radius} od ciebie`,
  ifTargetIsNotMoving: () => "Jeśli cel się nie porusza",
  ifTargetIsKnockedDown: () => "Jeśli cel jest powalony",
  ifTargetIsMoving: () => "Jeśli cel się porusza",
  ifTargetIsAFoe: () => "Jeśli cel jest wrogiem",
  ifTargetIsMovingFasterThanNormal: () => "Jeśli cel porusza się szybciej niż zwykle",
  ifAnyFoeIsKnockedDownIf: (p) =>
    p.knockedDown === true ? `Jeśli wróg ${p.where} jest powalony` : `Jeśli wróg jest ${p.where}`,
  ifYouHitOrMoreFoes: (p) => `Jeśli trafisz co najmniej ${p.atLeast} wrogów`,
  ifNumberOrMore: (p) =>
    `Jeśli liczba: ${genitivePlural(p.countAll)} wynosi co najmniej ${p.atLeast}`,
  ifAreNoMoreThan: (p) =>
    `Jeśli liczba: ${genitivePlural(p.countAll)} nie jest większa niż liczba: ${genitivePlural(p.countAll2)}`,
  ifTargetHas2: (p) => `Jeśli cel jest pod wpływem: ${p.statusName}`,
  ifTargetDoesNotHave: (p) => `Jeśli cel nie jest pod wpływem: ${p.statusName}`,
  ifYouHaveMoreEnergyThanTarget: () => "Jeśli masz więcej energii niż cel",
  ifYouHaveLessThanEnergy: (p) => `Jeśli masz mniej niż ${p.amount} energii`,
  ifYouAreOvercast: () => "Jeśli jesteś przeciążony",
  ifYouWield: (p) => `Jeśli dzierżysz ${NEEDED_WEAPON[p.weapon]}`,
  ifYouHoldAShield: () => "Jeśli trzymasz tarczę",
  ifYouAreHoldingAnItem: () => "Jeśli trzymasz przedmiot",
  ifTargetHasLessHealthThanYou: () => "Jeśli cel ma mniej zdrowia niż ty",
  ifTargetHasMoreHealthThanYou: () => "Jeśli cel ma więcej zdrowia niż ty",
  ifTargetIsAttacking: () => "Jeśli cel atakuje",
  ifTargetIsNotAttacking: () => "Jeśli cel nie atakuje",
  ifTargetIsCastingASpellOr2: () => "Jeśli cel rzuca czar lub atakuje",
  ifTargetIsASummonedCreature: () => "Jeśli cel jest przywołaną istotą",
  ifNoSpiritIsWithinOfYou: (p) =>
    `Jeśli przy tobie ${AREA_TEXT.get(p.radius) ?? `w promieniu ${p.radius2}`} nie ma ducha`,
  ifASpiritIsWithinOfYou: (p) =>
    `Jeśli przy tobie ${AREA_TEXT.get(p.radius) ?? `w promieniu ${p.radius2}`} jest duch`,
  ifYouControlOrFewerS: (p) =>
    `Jeśli kontrolujesz najwyżej ${p.count} ${p.creature === "spirit" ? "duchów" : p.creature === "minion" ? "sług" : pluralNoun(spaced(p.creature))}`,
  ifASpiritOrACorpseIs: (p) =>
    `Jeśli przy tobie ${AREA_TEXT.get(p.radius) ?? `w promieniu ${p.radius2}`} jest duch lub zwłoki`,
  ifAnAllyIsDeadWithin: (p) => `Jeśli sojusznik ${within(p.radius, p.radius2)} jest martwy`,
  ifTargetIsNearACorpseOr: () => "Jeśli cel jest w pobliżu zwłok lub jego chowaniec jest martwy",
  ifTargetIsWithinOfACorpse: (p) =>
    `Jeśli cel jest w promieniu ${p.radius} od zwłok lub jego chowaniec jest martwy`,
  composedType: (p) => (p.type === undefined ? "" : typeWord(p.type)),
  healthForEachAllyMax: (p) => `, +${p.amount} zdrowia na sojusznika ${p.area} (maks. ${p.max})`,
  allPartyMembers: () => "Wszyscy członkowie drużyny",
  allItsPartyMembers: () => "Wszyscy członkowie jego drużyny",
  allAlliedMinions: () => "Wszystkie sojusznicze sługi",
  yourOtherMinions: () => "Twoje pozostałe sługi",
  within2: (p) => `${p.Who} ${p.area ?? `w promieniu ${p.radius}`}`,
  adjacent: (p) => placed("Przylegający", "przylegające", p.who),
  nearby: (p) => `${capitalize(p.who)} w pobliżu`,
  within3: (p) =>
    p.area === undefined ? `${p.Who} w promieniu ${p.radius}` : `${p.Who} ${p.area}`,
  loseThatSame: (p) => `tracą tę samą ${CATEGORY[p.category].acc}`,
  loseAllAll: (p) => `tracą wszystkie ${categoryNoun("all", p.category)}`,
  onThem: () => "na nich",
  loseOneForEachOnThem: (p) => `tracą ${CATEGORY[p.category].acc} na ${p.countEach}`,
  lose: (p) => `tracą ${p.count} ${categoryNoun(p.count2, p.category)}`,
  enchantmentAnA: (p) => (p.onlyBearing === undefined ? "" : CATEGORY[p.onlyBearing].acc),
  with4: (p) => (p.onlyBearing === undefined ? "" : ` z: ${CATEGORY[p.onlyBearing].one}`),
  usingSkills: (p) =>
    p.onlyUsing === undefined ? "" : `, używający umiejętności: ${TYPE_STEM[p.onlyUsing]}`,
  dead: (p) => (p.dead === true ? `Martwi: ${p.living}` : p.living),
  targetAndCasterAroundYouCasterAround: (p) =>
    `${p.includesCentre === true ? `Cel oraz ${lowerFirst(p.reached)}` : p.reached}${p.around === "caster" ? " wokół ciebie" : ""}${p.alsoAround === "caster" ? " wokół celu i ciebie" : ""}${p.bearing}${p.using}${p.onlyIf}`,
  upTo3: (p) => `Do ${p.maxTargets} ${lowerFirst(p.who)}`,
  inItsRange: () => "w jego zasięgu",
  inTheArea: () => "na obszarze",
  foes: () => "wrogowie",
  allEveryoneYouAndAlliesAllies: (p) =>
    p.affects === "all" ? "wszyscy" : p.includesCaster ? "ty i sojusznicy" : "sojusznicy",
  enemiesFoesAllEveryoneYouAndAllies: (p) => `${p.value} ${within(p.radius, p.radius2)}`,
  whenSprung: () => "po uruchomieniu",
  after: (p) => `po ${seconds(p.delaySeconds)}`,
  everyFor: (p) => `co ${seconds(p.everySeconds)}, przez ${seconds(p.count)}`,
  whenItEnds: (p) => `Gdy się skończy, ${p.whom}: `,
  springsByItselfAsItsTimeRuns: () => "Uruchamia się samoczynnie, gdy upłynie jej czas",
  composedWhoText: (p) => `${capitalize(p.who)}: ${lowerFirst(p.text)}`,
  composedEndingText: (p) => `${p.ending}${lowerFirst(p.text)}`,
  composedConditionText: (p) => `${p.condition}: ${lowerFirst(p.text)}`,
  itsAttacksDealDamage: (p) => `Jego ataki zadają ${p.magnitude} obrażeń`,
  thisSpiritLosesHealth: (p) => `ten duch traci ${p.magnitude} zdrowia`,
  composedCondition: (p) => `${lowerFirst(p.condition)}: `,
  itsAttacks: (p) => `Jego ataki: ${p.when}${p.what}`,
  health3: (p) => `${p.health} zdrowia`,
  health4: (p) => `${p.health} zdrowia (${p.health2})`,
  level: (p) => `Poziom ${p.marked}, `,
  lastsSeconds: (p) => `, trwa ${sek(p.durationSeconds)}`,
  composedCountNameLevelTextHealthTextLasts: (p) =>
    `${p.count} ${p.name} (${p.levelText}${p.healthText}${p.lasts})`,
  itsAttacksDealDamage2: (p) => `Jego ataki zadają ${p.value} obrażeń`,
  onlyOneAtATimeANew: () => "Tylko jeden naraz: nowy zabija poprzedniego",
  leavesCorpseCorpsesWhenItDies: (p) =>
    `Po śmierci pozostawia ${p.corpses} ${plural(p.current, "zwłoki", "zwłoki", "zwłok")}`,
  whenItDiesStandsUpInIts: (p) => `Gdy ginie, w jego miejscu powstaje ${p.text}`,
  listSemicolon: () => "; ",
  inItsRange2: (p) => AREA_TEXT.get(p.radius) ?? "w jego zasięgu",
  composedAffectsWhere: (p) => `${AURA_WHO[p.affects]} ${p.where}`,
  whenItDiesUnderHealthBeginFor: (p) =>
    `Gdy ginie, ${p.who} poniżej ${p.below} zdrowia doznają: ${p.statusName} na ${sek(p.duration)}`,
  whenItDiesDeadPartyMembersAre: (p) =>
    `Gdy ginie, martwi członkowie drużyny ${p.where} zostają wskrzeszeni z ${p.health}% zdrowia i bez energii`,
  damageTakeDamageAreHealedForHealth: (p) =>
    p.effect === "damage"
      ? `otrzymują ${p.amount} obrażeń`
      : `zostają uleczeni o ${p.amount} zdrowia`,
  max: (p) => ` (maks. ${p.max})`,
  whenItDiesPerSecondItLived: (p) =>
    `Gdy ginie: ${p.who} ${p.what} za każdą sekundę jego życia${p.max}`,
  everySecondsHealsTheMostHurtNon: (p) =>
    `Co ${sek(p.everySeconds)}: leczy o ${p.heal} zdrowia najbardziej rannego sojusznika ${p.where}, który nie jest duchem`,
  whenANonSpiritDiesInIts: () => "Gdy w jego zasięgu ginie coś, co nie jest duchem",
  nearby2: (p) => AREA_TEXT.get(p.radius) ?? "w pobliżu",
  itsConditionsSpreadToEachNonSpirit: (p) =>
    `${p.when}, jego dolegliwości przenoszą się na każdą istotę ${p.where}, która nie jest duchem i ma dolegliwość`,
  eachOfItsTypeInItsRange: (p) =>
    `${p.when}, każda istota tego rodzaju w jego zasięgu mająca mniej niż ${p.below} zdrowia otrzymuje ${p.damage} obrażeń`,
  holdingAnItem: (p) => (p.onlyWhileHoldingItem ? ", trzymający przedmiot" : ""),
  composedWhoWhereHoldingStatus: (p) => `${p.who} ${p.where}${p.holding}: ${p.status}`,
  perFoeHit: (p) => (p.perTarget === undefined ? "" : " za każdego trafionego wroga"),
  forEachMeleeAttackSkillOnYour: (p) =>
    ` za każdą umiejętność ataku wręcz na twoim pasku (najwyżej ${p.max})`,
  withinEarshot: (p) => (p.area === "w zasięgu głosu" ? "w zasięgu głosu" : p.area),
  forEverySummonedCreatureYouControlMaximum: (p) =>
    ` za każdą przywołaną istotę ${p.where} pod twoją kontrolą (maksymalnie ${p.max} energii)`,
  composedZeroAloneEachText: (p) => (p.zero ? `${p.alone} ${p.each}` : `${p.text}, +${p.each}`),
  maximum: (p) => ` (maksymalnie ${p.max})`,
  forEach: (p) => `na ${p.countEach}${p.max}`,
  pointOfEnergyGained: () => "zyskany punkt energii",
  pointOfEnergyRestrictedByOvercast: () => "punkt energii zablokowany przeciążeniem",
  skillDisabledInThisWay: () => "umiejętność zablokowaną w ten sposób",
  orCasterOnYou: (p) =>
    `${categoryIds(p.categories)} ${p.on === "caster" ? "na tobie" : p.onTarget}`,
  ofYourRecharging: (p) => `odnawiające się ${p.rechargingSkillsNoun}`,
  pointOfEnergyCasterYouHaveThey: (p) =>
    `punkt energii, który ${p.on === "caster" ? "masz" : "ma"}`,
  orRemoved: (p) => `usunięty efekt (${categoryIds(p.categories, "one")})`,
  orLost: (p) => `utracony efekt (${p.name}: ${categoryIds(p.categories, "one")})`,
  enchantmentYouAreMaintaining: () => "podtrzymywane przez ciebie zaczarowanie",
  secondItWasInEffect: () => "sekundę trwania",
  foeKnockedDown: () => "powalonego wroga",
  youHaveEquipped: (p) => `${spaced(p.type)} na twoim pasku`,
  adrenalineSkillTheyHave: () => "umiejętność adrenalinową, którą ma",
  foeHit: () => "trafionego wroga",
  within4: (p) => `${categoryIds(p.perCountNoun)} ${within(p.radius, p.radius2)}`,
  attacksSkillsS: (p) =>
    p.weapon !== undefined
      ? weaponAttacks(p.weapon)
      : p.type === undefined
        ? "umiejętności"
        : pluralNoun(spaced(p.type)),
  casterYourTargetS: (p) => (p.on === "caster" ? "twoje" : "jego"),
  s3: (p) => categoryIds(p.perCountNoun),
  pointOfOvercast: () => "punkt przeciążenia",
  skillDisabled: () => "zablokowaną umiejętność",
  rechargingSkill: () => "odnawiającą się umiejętność",
  pointOfEnergy: () => "punkt energii",
  removedOr: (p) => `usunięty efekt (${categoryIds(p.categories, "one")})`,
  removedOr2: (p) => `usunięty efekt (${p.name}: ${categoryIds(p.categories, "one")})`,
  maintainedEnchantment: () => "podtrzymywane zaczarowanie",
  secondHeld: () => "sekundę podtrzymania",
  adrenalineSkill: () => "umiejętność adrenalinową",
  deadAlly: () => "martwego sojusznika",
  knockedDownFoeFoe: (p) => (p.knockedDown === true ? "powalonego wroga" : "wroga"),
  ally: () => "sojusznika",
  neverAbove: (p) => `, nigdy powyżej ${p.upTo}`,
  forEachRemoved: (p) =>
    p.toTarget === true || p.perRemoved === undefined ? "" : ` za ${eachRemoved(p.perRemoved)}`,
  perPointLost: (p) => (p.perEnergyLost === undefined ? "" : " za każdy utracony punkt"),
  armorPenetration: (p) => ` (${p.armorPenetration}% przebicia pancerza)`,
  dealsDamage2: (p) =>
    `Zadaje ${p.magnitude} ${damageNoun(p.type)}${p.perPointLost}${p.penetration}`,
  deals: () => "Zadaje",
  damage2: (p) => ` ${damageNoun(p.type)}`,
  composedCountedConditionAmount: (p) => `${p.counted}; ${lowerFirst(p.condition)}: +${p.amount}`,
  gainHealthEqualToThisSpellS: () => "Zyskaj zdrowie równe premii Boskiej Łaski tego czaru",
  healsIfRelievedOf: (p) => `Leczy o ${p.amount}, gdy zostanie uwolniony od: ${p.name}`,
  healsForOfYourCurrentHealthMaximum: (p) =>
    `Leczy o ${p.magnitude} twojego aktualnego zdrowia (maksymalnie ${p.max} zdrowia)`,
  youGainHealth: (p) => `Zyskujesz ${p.amount} zdrowia`,
  yourPetGainsHealth: (p) => `Twój chowaniec zyskuje ${p.amount} zdrowia`,
  ownerHealsItsOwnerForHealsFor: (p) =>
    p.recipient === "owner" ? `Leczy swojego właściciela o ${p.amount}` : `Leczy o ${p.amount}`,
  healsForEachRemovedHealsForEach: (p) =>
    p.perRemoved !== undefined
      ? `Leczy o ${p.amount} za ${eachRemoved(p.perRemoved)}`
      : p.perDestroyedSpirit === true
        ? `Leczy o ${p.amount} za każdego zniszczonego ducha`
        : p.perEnergyLost === true
          ? `${p.recipient === "caster" ? "Zostajesz uleczony o" : "Leczy o"} ${p.amount} za każdy utracony punkt energii`
          : p.perUsedSkillEnergy === true
            ? `Leczy o ${p.magnitude} kosztu energii czaru`
            : p.value,
  casterYouGainHeals: (p) => (p.recipient === "caster" ? "Zyskujesz" : "Leczy"),
  health5: () => " zdrowia",
  casterOnTargetFoeOnThem: (p) => (p.recipient === "caster" ? "na wrogim celu" : "na nich"),
  underHealth: (p) => `, poniżej ${p.onlyBelowHealthFraction}% zdrowia`,
  gainOfTheSkillSBaseEnergy: (p) => `Zyskaj ${p.magnitude} bazowego kosztu energii umiejętności`,
  targetGainsOwnerYouGainGain: (p) =>
    p.toTarget === true ? "Cel zyskuje" : p.recipient === "owner" ? "Zyskujesz" : "Zyskaj",
  energy5: (p) =>
    `${p.gains} ${p.magnitude} energii${p.perPointLost}${p.perFoeHit}${p.perOwnCreature}${p.perRemoved}`,
  energy6: () => " energii",
  gain2: () => "Zyskaj",
  onTargetFoe: () => "na wrogim celu",
  strikeStrikesOfAdrenalineAdrenaline: (p) =>
    p.units
      ? `${p.magnitude} ${plural(p.current, "uderzenie", "uderzenia", "uderzeń")} adrenaliny`
      : `${p.magnitude} adrenaliny`,
  youGain2: () => "Zyskujesz",
  targetTargetGainsGain: (p) => (p.recipient === "target" ? "Cel zyskuje" : "Zyskaj"),
  strikesOfAdrenaline: () => " uderzeń adrenaliny",
  targetRegainsAllEnergy: () => "Cel odzyskuje całą energię",
  casterYouLoseTargetLoses: (p) => (p.on === "caster" ? "Tracisz" : "Cel traci"),
  energy7: (p) => `${p.who} ${p.magnitude} energii`,
  stealsUpToEnergy: (p) => `Kradnie do ${p.magnitude} energii`,
  stealsUpToHealth: (p) => `Kradnie do ${p.magnitude} zdrowia`,
  youStealHealth: (p) => `Kradniesz ${p.magnitude} zdrowia`,
  youSacrificeOfYourMaximumHealth: (p) =>
    `Poświęcasz ${p.percentOfMax}% swojego maksymalnego zdrowia`,
  targetFoeLosesHealth: (p) => `Wrogi cel traci ${p.magnitude} zdrowia`,
  targetFoeLoses: () => "Wrogi cel traci",
  youLoseHealth: (p) => `Tracisz ${p.magnitude} zdrowia`,
  forEachEnchantmentRemoved: (p) => `${p.lose} za każde usunięte zaczarowanie (${p.whose})`,
  loseAllButHealth: (p) => `Trać całe zdrowie poza ${p.magnitude}`,
  transferOfYourConditionsToFoes: (p) =>
    `Przenosi ${p.magnitude} twoich dolegliwości na: ${p.foesWithin}`,
  max2: (p) => (p.maxSeconds === undefined ? "" : ` (maks. ${seconds(p.maxSeconds)})`),
  withTheTimeEachHasLeft: () => "z pozostałym czasem każdej z nich",
  withMoreTime: (p) => `z ${p.extend}% dodatkowego czasu${p.max}`,
  foesGetTheTargetSConditionsWith: (p) => `${p.foesWithin} otrzymują dolegliwości celu, ${p.value}`,
  loseYourHealthHealForOfIt: (p) =>
    `Trać ${shareOfYourHealth(p.fractionOfCurrent)}; uzdrów się o ${p.magnitude}% tej wartości`,
  whoeverOfYouAndTargetFoeHas: () =>
    "To z was, kto ma więcej zdrowia, traci połowę różnicy; drugie zyskuje tyle samo",
  stacksOnceForEachOnThem: (p) => `. Kumuluje się raz na ${p.countEach}`,
  stacksOnceForEachOnThem2: (p) => p.status + p.value,
  forWord3: (p) => `${p.what} na ${p.durationSeconds}`,
  forEachHexRemoved: (p) => ` za każdą usuniętą klątwę (${p.name}))`,
  stackingOnceForEachOnThem: (p) => `, kumuluje się raz na ${p.countEach}`,
  appliesCasterToYouForUntilIt: (p) =>
    `Nakłada ${p.statusName}${p.on === "caster" ? " na ciebie" : ""} ` +
    (p.ends ? `na ${p.statusDuration} ` : "do czasu, aż się skończy ") +
    `(${p.status}` +
    p.value +
    p.value2,
  composedStatusNameDurationSeconds: (p) => `${p.statusName} (${p.durationSeconds})`,
  appliesOneOfAtRandom: (p) => `Nakłada losowo jedno z: ${p.choices}`,
  maintainedCasterOnYouEnergyRegenerationWhile: (p) =>
    `Podtrzymywane${p.on === "caster" ? " na tobie" : ""}: −1 regeneracji energii, dopóki trwa. ` +
    `${capitalize(p.what)}.`,
  losesThatSame: (p) => `Traci tę samą ${CATEGORY[p.category].acc}`,
  casterLoseRemoves: (p) => (p.from === "caster" ? "Trać" : "Usuwa"),
  oneForEachRemovedMax: (p) =>
    `${p.verb} ${CATEGORY[p.category].acc} za ${eachRemoved(p.category2)} (maks. ${p.max})`,
  oneForEachOnTarget: (p) => `${p.verb} ${CATEGORY[p.category].acc} na ${p.countEach}`,
  lose2: (p) => `Trać ${p.count} ${owned(p.whose)}${categoryNoun(p.count2, p.category)}`,
  endsTheTargetSStance: () => "Kończy postawę celu",
  forEachSpiritWithinOfIt: (p) =>
    ` za każdego ducha ${AREA_AROUND_TARGET.get(p.near) ?? `w promieniu ${p.near2} od celu`}`,
  numberUpTo: (p) => (typeof p.count === "number" && p.count > 1 ? "do " : ""),
  and4: (p) => (p.orCategory === undefined ? "" : ` i ${categoryNoun(p.count, p.orCategory)}`),
  removes: (p) =>
    `Usuwa ${p.upTo}${p.count} ${owned(p.whose)}${categoryNoun(p.count2, p.category)}${p.and}${p.perSpirit}`,
  interruptsTheTargetSSpellIfThey: () => "Przerywa czar celu, jeśli jakiś rzuca",
  interruptsTheTargetSSpellOrChant: () => "Przerywa czar lub pieśń celu, jeśli jakieś rzuca",
  skillInterruptsTheTargetSSkillIf: (p) =>
    p.only === "skill"
      ? "Przerywa umiejętność celu, jeśli jakiejś używa"
      : "Przerywa akcję celu: umiejętność lub atak",
  youAreKnockedDownFor: (p) => `Zostajesz powalony na ${seconds(p.durationSeconds)}`,
  knocksDownFor: (p) => `Powala na ${seconds(p.durationSeconds)}`,
  shadowStepsToTheTarget: () => "Przeskakuje przez cienie do celu",
  youAndTheTargetShadowStepTo: () =>
    "Ty i cel przeskakujecie przez cienie, zamieniając się miejscami",
  corpseTeleportsYouToThatCorpseShadow: (p) =>
    p.to === "corpse"
      ? "Teleportuje cię do tych zwłok"
      : "Przeskakuje przez cienie w pobliskie miejsce bezpośrednio od twojego celu",
  health6: (p) => `${p.percent}% zdrowia`,
  upToYourCurrentHealthYourHealth: (p) =>
    p.casterLosesFractionOfCurrent === 0
      ? "do twojego aktualnego zdrowia"
      : `twoim zdrowiem po utracie ${p.casterLosesFractionOfCurrent === 0.5 ? "połowy" : shareOfYourHealth(p.casterLosesFractionOfCurrent)} twojego zdrowia`,
  perPartyMemberWithin: (p) => ` za każdego członka drużyny ${within(p.radius, p.radius2)}`,
  casterAndTeleportsTheTargetToYou: (p) =>
    p.at === "caster" ? " i teleportuje cel do ciebie" : "",
  returnsTheTargetToLifeWithAnd: (p) =>
    `Wskrzesza cel z ${p.healthText} i ${p.energy}% energii${p.per}${p.teleport}`,
  returnsEveryDeadAlliedPetToLife: (p) =>
    `Wskrzesza każdego martwego sojuszniczego chowańca ${p.where} z ${p.health}% zdrowia`,
  youLoseAllYourRemainingEnergy: () => "Tracisz całą pozostałą energię",
  youGainFor: (p) => `Zyskujesz ${p.statusName} na ${seconds(p.durationSeconds)} (${p.status})`,
  yourPetGainsFor: (p) => `Twój chowaniec zyskuje ${p.statusName} na ${p.duration} (${p.status})`,
  yourPetMovesToYourTargetAnd: () => "Twój chowaniec biegnie do twojego celu i go atakuje",
  teleportsTargetToYou: () => "Teleportuje cel do ciebie",
  destroysTargetAlliedSpirit: () => "Niszczy sojuszniczego ducha będącego celem",
  destroysTargetMinion: () => "Niszczy sługę będącą celem",
  nearestSpiritLosesHealthTargetAllyIs: (p) =>
    `Najbliższy duch traci ${p.magnitude} zdrowia; sojusznik będący celem zostaje uleczony o ${p.healPerPoint} za każdy punkt`,
  nearestSpiritLosesAllEnergyYouGain: (p) =>
    `Najbliższy duch traci całą energię; zyskujesz ${p.magnitude}% tej wartości`,
  itsOwnerGainsHealthEqualToThe: () => "Jego właściciel zyskuje zdrowie równe zadanym obrażeniom",
  destroysEveryAlliedSpiritWithin: (p) =>
    `Niszczy każdego sojuszniczego ducha ${within(p.radius, p.radius2)}`,
  thisSkillRecharges: () => "Ta umiejętność odnawia się",
  secondsFaster: () => " sekund szybciej",
  thisSkillRechargesInstantly: () => "Ta umiejętność odnawia się natychmiast",
  thisSkillRechargesFaster: (p) => `Ta umiejętność odnawia się o ${p.fraction}% szybciej`,
  usedSkillThatSkillRechargesInstantlyThis: (p) =>
    p.of === "used-skill"
      ? "Tamta umiejętność odnawia się natychmiast"
      : "Ta umiejętność odnawia się natychmiast",
  loseAllAdrenaline: () => "Trać całą adrenalinę",
  rechargesAllYourOtherSkills: () => "Odnawia wszystkie twoje pozostałe umiejętności",
  rechargesAllYourStances: () => "Odnawia wszystkie twoje postawy",
  rechargesAllYourOtherSkills2: (p) =>
    `Odnawia wszystkie twoje pozostałe umiejętności ${OTHER_SKILLS[p.which] ?? p.which}`,
  rechargesAllYour: (p) => `Odnawia wszystkie twoje ${p.rechargedKind}`,
  allOfYourSpiritsDie: () => "Wszystkie twoje duchy giną",
  summonsPlusOnePerCorpseExploited: (p) =>
    `Przywołuje ${p.text}` +
    (p.perExploitedCorpse === true ? ", a także jednego na wykorzystane zwłoki" : ""),
  setsATrap: () => "Zastawia pułapkę",
  pulseTargetCreatesASymbolMarksThe: (p) =>
    p.kind === "pulse"
      ? p.anchor === "target"
        ? "Tworzy symbol"
        : "Oznacza ziemię"
      : p.anchor === "corpse"
        ? "Tworzy studnię"
        : "Tworzy osłonę",
  forSeconds: (p) => `${p.what} ${p.where} na ${sek(p.magnitude)}`,
  seconds3: (p) => sek(p.magnitude),
  forEachSignetYouHaveEquipped: (p) => (p.perOwnSignet === true ? " za każdy założony sygnet" : ""),
  allOfTheTargetSSkillsAre: (p) => `Wszystkie umiejętności celu są zablokowane na ${p.time}`,
  theTargetSEliteSkillIsDisabled: (p) => `Elitarna umiejętność celu jest zablokowana na ${p.time}`,
  oneOfTheTargetSSpellsAt: (p) => `Jeden z czarów celu jest losowo zablokowany na ${p.time}`,
  allOfTheTargetSAttackSkills: (p) =>
    `Wszystkie umiejętności ataku celu są zablokowane na ${p.time}`,
  theInterruptedSkillIsDisabledFor: (p) =>
    `Przerwana umiejętność jest zablokowana na ${p.time}${p.perSignet}`,
  centreInterruptedHoldingThatSkillHaveIt: (p) =>
    p.which === "centre-interrupted"
      ? `posiadający tę umiejętność mają ją zablokowaną na ${p.time}`
      : `Ta umiejętność i wszystkie umiejętności tego samego atrybutu są zablokowane na ${p.time}`,
  thisSkillBecomesTheOneYouRemoved: (p) =>
    `Ta umiejętność staje się na ${sek(p.seconds)} tą, którą usunąłeś`,
  thisSkillBecomesThatRandomSpellSpell: (p) =>
    `Ta umiejętność staje się na ten czas ${p.which === "random-spell" ? "tym czarem" : "tą umiejętnością"}`,
  thisSkillBecomesItsTargetSNon: (p) =>
    `Ta umiejętność staje się na ${sek(p.magnitude)} elitarną umiejętnością celu niebędącą postacią`,
  takeControlOfTargetEnemySpirit: () => "Przejmij kontrolę nad wrogim duchem będącym celem",
  becomeYourMinionsWhileYouBear: (p) => `Stają się twoimi sługami, dopóki nosisz: ${p.name}`,
  targetMinionWithAMasterBecomesMasterless: (p) =>
    `Sługa będąca celem, która ma pana, staje się bezpańska; bezpańska staje się twoja i zostaje uleczona o ${p.magnitude} zdrowia`,
  leadCountsAsALeadAttackCounts: (p) =>
    p.role === "lead" ? "Liczy się jako atak otwierający" : "Liczy się jako atak drugą ręką",
  targetSuffersOvercast: (p) => `Cel doznaje ${p.magnitude} przeciążenia`,
  thisSkillThisSkillThatSkill: (p) =>
    p.of === "this-skill" ? "Ta umiejętność" : "Tamta umiejętność",
  forEachRemoved2: (p) => (p.perRemoved === undefined ? "" : ` za ${eachRemoved(p.perRemoved)}`),
  takesSecondsLongerToRecharge: (p) =>
    `${p.which} odnawia się o ${sek(p.magnitude)} dłużej${p.each}`,
  that: (p) => `, które ${p.onlyIf}`,
  ifItStrikesAFoe: (p) => `Jeśli trafi wroga${p.whom}: ${lowerFirst(p.text)}`,
  from: (p) => `${p.text} od: ${p.from}`,
  takeDamageForEachPointOfEnergy: (p) =>
    `otrzymują ${p.amount} ${damageNoun(p.type)}` +
    (p.perEnergyLost === undefined ? "" : " za każdy utracony punkt energii"),
  areInterruptedAreInterruptedIfCasting: (p) =>
    p.only === undefined ? "zostają przerwani" : "zostają przerwani, jeśli właśnie rzucają czar",
  areKnockedDownForS: (p) => `zostają powaleni na ${p.durationSeconds} s`,
  foesFoeCreaturesGain: (p) =>
    p.hits === "foes" || p.hits === "foe-creatures" ? p.suffered : `zyskują ${p.sufferedWhat}`,
  gainHealthEqualToThisSpellS2: () => "zyskują zdrowie równe premii Boskiej Łaski tego czaru",
  gain3: (p) => {
    const amount = lowerFirst(p.text).replace(/^leczy (?:o |za )?/, "");
    return `zyskują ${amount.includes("zdrowia") ? amount : `${amount} zdrowia`}`;
  },
  gainHealth: (p) => `zyskują ${p.amount} zdrowia`,
  loseHealth: (p) => `tracą ${p.amount} zdrowia`,
  youFromEach: (p) => `${lowerFirst(p.text).replace(/^kradnie /, "kradniesz ")} każdemu z nich`,
  transferAllTheirConditionsToYou: () => "przenieś na siebie wszystkie ich dolegliwości",
  resurrect: (p) =>
    p.kind === "resurrect"
      ? lowerFirst(p.text).replace(/^wskrzesza cel/, "zostają wskrzeszeni")
      : lowerFirst(p.text),
  and5: (p) => (p.length === 0 ? (p.last ?? "") : `${p.parts} i ${p.last2}`),
  perAlliedMinionsOwnMinionsMinionOne: (p) =>
    `; ${lowerFirst(p.text)} na ${p.hits === "allied-minions" || p.hits === "own-minions" ? "sługę" : "cel"}`,
  per: (p) => ` na ${counted(p.perCountNoun)}`,
  damage3: (p) => `${p.amount} ${damageNoun(p.type)}${p.each}`,
  healHealsEnergy: (p) =>
    p.kind === "heal" ? `leczy o ${p.amount}${p.each}` : `+${p.amount} energii${p.each}`,
  drainsEnergy: (p) => `wysysa ${p.magnitude} energii`,
  stealsEnergy: (p) => `kradnie ${p.magnitude} energii`,
  stealsHealth: (p) => `kradnie ${p.magnitude} zdrowia`,
  resurrectsEnergy: (p) => `wskrzesza, ${p.energy}% energii`,
  resurrectsHealth: (p) => `wskrzesza, ${p.health}% zdrowia`,
  resurrectsPetsHealth: (p) => `wskrzesza chowańce, ${p.health}% zdrowia`,
  healsOfYourHealth: (p) => `leczy o ${p.percent}% z ${shareOfYourHealth(p.fractionOfCurrent)}`,
  balancesHealthWithTargetFoe: () => "wyrównuje zdrowie z wrogim celem",
  allUpTo: (p) => (p.current === p.Infinity ? "wszystkie" : `do ${p.moving}`),
  andFoesWithinOfIt: (p) =>
    ` oraz wrogów ${(AREA_AROUND_TARGET.get(p.copyToFoesWithin) ?? `w promieniu ${p.copyToFoesWithin2} od celu`).replace("przylegający", "przylegających")}`,
  withOfTheirRemainingDurations: (p) => ` z ${p.durationMultiplier}% ich pozostałego czasu trwania`,
  movesConditionsFromFoesWithinOfIt: (p) =>
    `Przenosi ${p.count} dolegliwości${p.lasting} z wrogów ${AREA_AROUND_TARGET.get(p.foesWithin) ?? `w promieniu ${p.foesWithin2} od celu`} na cel`,
  casterMovesOfYourConditionsToThe: (p) =>
    p.from === "caster"
      ? `Przenosi ${p.count === "wszystkie" ? "wszystkie twoje" : `${p.count} z twoich`} dolegliwości${p.lasting} na cel${p.copies}`
      : `Przenosi ${p.count} dolegliwości celu${p.lasting} na ciebie`,
  youAreHealedForForEach: (p) =>
    `${p.moves}; zostajesz uleczony o ${p.magnitude} za każdą dolegliwość`,
  areDisabledForSeconds: (p) => `są zablokowane na ${sek(p.seconds)}`,
  allOfYourSkills: (p) => `Wszystkie twoje umiejętności ${p.time}`,
  allOfYourOtherSkills: (p) => `Wszystkie twoje pozostałe umiejętności ${p.time}`,
  allOfYourOtherNonAttackSkills: (p) =>
    `Wszystkie twoje pozostałe umiejętności inne niż ataki ${p.time}`,
  allOfYourOtherAttackSkillsYour: (p) =>
    p.exceptWeapon === undefined
      ? `Wszystkie twoje pozostałe umiejętności ataku ${p.time}`
      : `Twoje umiejętności ataku inne niż ataki ${WEAPON_WORD[p.exceptWeapon]} ${p.time}`,
  allOfYourNonAttackSkills: (p) => `Wszystkie twoje umiejętności inne niż ataki ${p.time}`,
  s4: (p) => pluralNoun(typeName(p.type)),
  yourAnd: (p) => `Twoje ${p.types} ${p.time}`,
  allOfYourSpells: (p) => `Wszystkie twoje czary ${p.time}`,
  allOfYourOther: (p) => `Wszystkie twoje ${p.others ? "pozostałe " : ""}${p.name} ${p.time}`,
  exceptAnd: (p) => (p.length === 0 ? "" : ` oprócz ${p.except}`),
  allOfYourNonSkills: (p) =>
    `Wszystkie twoje umiejętności inne niż ${p.name}${p.exceptText} ${p.time}`,
  yourWholeParty: () => "Cała twoja drużyna",
  composedAffectsWhere2: (p) => `${AREA_WHO[p.affects]} ${p.where}`,
  radius: (p) => `Promień ${p.radius}`,
  andAroundYou: (p) =>
    `${TARGET_TEXT[p.target]} oraz ${lowerFirst(AREA_WHO[p.affects])} ${p.where} wokół ciebie`,
  range: (p) => `Zasięg ${p.range}`,
  upTo4: (p) => `do ${p.maxTargets} ${p.who}`,
  withinOfIt: (p) => AREA_AROUND_TARGET.get(p.radius) ?? `w promieniu ${p.radius2} od celu`,
  and6: (p) => `${TARGET_TEXT[p.target]} oraz ${p.count} ${p.where}`,
  rangeRadius: (p) => `Zasięg ${p.range}, promień ${p.radius}`,
  free: () => "Za darmo",
  adrenaline: (p) => `${p.amount} adrenaliny`,
  composedAmount: (p) => ` (${p.amount})`,
  energy8: (p) => `${p.cost} energii${p.base}${p.overcast}`,
  overcast: (p) => `, ${p.overcast} przeciążenia`,
  instant: () => "Natychmiast",
  composedActivationBase: (p) => (p.activation === p.base ? p.base : `${p.activation} (${p.base})`),
  dealsNoDamage: () => "Nie zadaje obrażeń",
  dealsOnlyDamageDamage: (p) =>
    p.weaponless
      ? `Zadaje tylko ${p.bonus} ${damageOf(p.damageType)}`
      : `+${p.bonus} ${damageOf(p.damageType)}`,
  damage4: (p) => `${p.condition}: +${p.more} obrażeń`,
  damageOnThem: (p) => `+${p.amount} obrażeń ${p.perCount}`,
  cannotBeBlocked2: () => "Nie może zostać zablokowany",
  cannotBeBlocked3: (p) => `${p.condition}: nie może zostać zablokowany`,
  chanceToMissWithOrLess: (p) =>
    `${p.chance}% szansy na chybienie przy ${p.name} ${p.rank} lub niżej`,
  resultsInACriticalHit: () => "Skutkuje trafieniem krytycznym",
  resultsInACriticalHit2: (p) => `${p.condition}: skutkuje trafieniem krytycznym`,
  hitsUpToAdjacentFoesToo: (p) => `Trafia też do ${p.cleaveTargets} przylegających wrogów`,
  hitsEveryAdjacentFoe: (p) => `${p.condition}: trafia każdego przylegającego wroga`,
  armorPenetration2: (p) => `${p.armorPenetration}% przebicia pancerza`,
  ifBlocked: (p) => `Jeśli zablokowany: ${lowerFirst(p.text)}`,
  onACriticalHit: (p) => `Przy trafieniu krytycznym: ${lowerFirst(p.text)}`,
  ifItFailsToHit: (p) => `Jeśli nie trafi: ${lowerFirst(p.text)}`,
  asItIsUsed: (p) => `W chwili użycia: ${lowerFirst(p.text)}`,
  allYourPreparationsAreRemoved: () => "Wszystkie twoje przygotowania zostają usunięte",
  fliesAsFast: (p) => `Leci ${p.multiplier}× szybciej`,
  fliesAsFast2: (p) => `${p.condition}: leci ${p.multiplier}× szybciej`,
  only: (p) => `; ${lowerFirst(p.condition)}, tylko 1`,
  eachDealingLessDamage: (p) => `, każda zadaje o ${p.value}% mniej obrażeń`,
  strikesTwice: () => "Uderza dwukrotnie",
  strikesTimes: (p) => `Uderza ${p.count} razy`,
  shootsArrowsAtOnce: (p) =>
    `Wystrzeliwuje ${p.count} ${plural(p.count, "strzałę", "strzały", "strzał")} naraz${p.weaker}${p.fewer}`,
  whileActivating: (p) => `Podczas aktywacji: ${p.status}`,
  easilyInterrupted: () => "Łatwe do przerwania",
  failureChanceWithOrLess: (p) =>
    `${p.chance}% szansy na niepowodzenie przy ${p.name} ${p.rank} lub niżej`,
  activatesFasterSlower: (p) =>
    `${p.condition}: aktywuje się o ${p.value}% ${p.multiplier < 1 ? "szybciej" : "wolniej"}`,
  healthGainFromDivineFavorIsDoubled: () => "Zdrowie zyskiwane dzięki Boskiej Łasce jest podwojone",
  projectilesEachCanBeDodged: (p) =>
    `${p.shots} ${plural(p.shots, "pocisk", "pociski", "pocisków")}: każdego można uniknąć`,
  aProjectileAtEachFoeEachCan: (p) =>
    p.spread === true
      ? "Pocisk w każdego wroga: każdego można uniknąć"
      : "Pocisk: można go uniknąć",
  halfTheNormalRange: () => "Połowa normalnego zasięgu",
  orSacrificesHealthIfNoneIsNear: (p) =>
    `, lub poświęca ${p.elseSacrificePercent}% zdrowia, jeśli żadnych nie ma w pobliżu`,
  targetExploitsTheCorpseNearestYourTarget: (p) =>
    (p.near === "target"
      ? "Wykorzystuje zwłoki najbliższe twojemu celowi"
      : p.all === true
        ? `Wykorzystuje wszystkie świeże zwłoki ${within(p.radius, p.radius2)}`
        : p.pick === "random"
          ? "Wykorzystuje losowe zwłoki"
          : "Wykorzystuje najbliższe zwłoki") + p.value,
  whileOnYourBarAHealthFights: (p) =>
    `Gdy znajduje się na twoim pasku, u twego boku walczy ${p.name} (${p.companionHealth} zdrowia)`,
  disabledForAfterUse: (p) => `Po użyciu zablokowana na ${seconds(p.disabledAfterUseSeconds)}`,
  takeAllConditionsFromYourAlliesWith: () =>
    "Przejmij wszystkie dolegliwości swoich sojuszników z pozostałym czasem każdej z nich",
  hitOrMiss: (p) => `${p.text}, trafione czy nie`,
  eliteFlash: (p) => {
    const words = [
      p.elite ? `elitarn${ADJECTIVE_ENDING[GENDER_OF_TYPE[p.type] ?? "m"]}` : "",
      p.flash ? `błyskawiczn${ADJECTIVE_ENDING[GENDER_OF_TYPE[p.type] ?? "m"]}` : "",
      p.elite || p.flash ? lowerFirst(TYPE_TEXT[p.type]) : TYPE_TEXT[p.type],
    ].filter((word) => word !== "");
    return capitalize(words.join(" "));
  },
  moraleBoost: (p) =>
    p.rechargesOnMoraleBoost === true ? "Wzrost morale" : seconds(p.rechargeSeconds),
  hexHexesS2: (p) => pluralNoun(p.kind),
} satisfies DescribeWords as DescribeWords;
