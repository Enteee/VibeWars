import { EN_WORDS, type DescribeWords } from "@vibewars/game-core";

/** JavaScript's \b only knows ASCII: it fails beside "í" and splits "její" after "jej". */
const wholeWord = (pattern: string, flags = ""): RegExp =>
  new RegExp(`(?<!\\p{L})(?:${pattern})(?!\\p{L})`, `u${flags}`);

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

/** Slovak numeric agreement: 1 / 2-4 / the rest (and fractions) take the genitive plural. */
function byCount(count: number, one: string, few: string, many: string): string {
  if (count === 1) {
    return one;
  }
  return Number.isInteger(count) && count >= 2 && count <= 4 ? few : many;
}

interface CategoryWords {
  readonly one: string;
  readonly acc: string;
  readonly gen: string;
  readonly few: string;
  readonly many: string;
  readonly gender: "m" | "f" | "n";
}

const CATEGORY: Record<Category, CategoryWords> = {
  condition: {
    one: "neduh",
    acc: "neduh",
    gen: "neduhu",
    few: "neduhy",
    many: "neduhov",
    gender: "m",
  },
  hex: {
    one: "kliatba",
    acc: "kliatbu",
    gen: "kliatby",
    few: "kliatby",
    many: "kliatob",
    gender: "f",
  },
  enchantment: {
    one: "očarovanie",
    acc: "očarovanie",
    gen: "očarovania",
    few: "očarovania",
    many: "očarovaní",
    gender: "n",
  },
  stance: {
    one: "postoj",
    acc: "postoj",
    gen: "postoja",
    few: "postoje",
    many: "postojov",
    gender: "m",
  },
  preparation: {
    one: "príprava",
    acc: "prípravu",
    gen: "prípravy",
    few: "prípravy",
    many: "príprav",
    gender: "f",
  },
  glyph: { one: "glyf", acc: "glyf", gen: "glyfu", few: "glyfy", many: "glyfov", gender: "m" },
  shout: {
    one: "pokrik",
    acc: "pokrik",
    gen: "pokriku",
    few: "pokriky",
    many: "pokrikov",
    gender: "m",
  },
  chant: { one: "spev", acc: "spev", gen: "spevu", few: "spevy", many: "spevov", gender: "m" },
  echo: { one: "ozvena", acc: "ozvenu", gen: "ozveny", few: "ozveny", many: "ozvien", gender: "f" },
  "weapon-spell": {
    one: "zbraňové kúzlo",
    acc: "zbraňové kúzlo",
    gen: "zbraňového kúzla",
    few: "zbraňové kúzla",
    many: "zbraňových kúziel",
    gender: "n",
  },
  item: {
    one: "predmet",
    acc: "predmet",
    gen: "predmetu",
    few: "predmety",
    many: "predmetov",
    gender: "m",
  },
  form: { one: "podoba", acc: "podobu", gen: "podoby", few: "podoby", many: "podôb", gender: "f" },
  "skill-effect": {
    one: "efekt schopnosti",
    acc: "efekt schopnosti",
    gen: "efektu schopnosti",
    few: "efekty schopnosti",
    many: "efektov schopnosti",
    gender: "m",
  },
  environment: {
    one: "efekt prostredia",
    acc: "efekt prostredia",
    gen: "efektu prostredia",
    few: "efekty prostredia",
    many: "efektov prostredia",
    gender: "m",
  },
};

/** Category ids that reach a sentence raw, joined with this file's own "alebo". */
function categoryIds(text: string): string {
  return text.replace(
    /\b(skill-effect|weapon-spell|condition|hex|enchantment|stance|preparation|glyph|shout|chant|echo|item|form)\b/g,
    (id) => CATEGORY[id as Category].acc,
  );
}

function categoryNoun(count: number | "all", category: Category): string {
  const words = CATEGORY[category];
  return count === "all" ? words.few : byCount(count, words.acc, words.few, words.many);
}

function aCategory(category: Category): string {
  return CATEGORY[category].acc;
}

/** "žiadnu inú kliatbu", "žiadny iný neduh", "žiadne iné očarovanie". */
function noOther(category: Category, other: string, noun: string): string {
  const { gender } = CATEGORY[category];
  const none = gender === "f" ? "žiadnu" : gender === "m" ? "žiadny" : "žiadne";
  const adjective = other === "" ? "" : gender === "f" ? "inú " : gender === "m" ? "iný " : "iné ";
  return `${none} ${adjective}${noun}`;
}

const SKILL_NOUN: Readonly<Record<string, string>> = {
  attack: "útok",
  spell: "kúzlo",
  enchantment: "očarovanie",
  hex: "kliatba",
  signet: "pečať",
  shout: "pokrik",
  stance: "postoj",
  preparation: "príprava",
  glyph: "glyf",
  chant: "spev",
  echo: "ozvena",
  "weapon-spell": "zbraňové kúzlo",
  "nature-ritual": "prírodný rituál",
  "binding-ritual": "viažuci rituál",
  ward: "ochranný kruh",
  well: "studňa",
  "item-spell": "predmetové kúzlo",
  trap: "pasca",
  "pet-attack": "útok zvieraťa",
  form: "podoba",
  skill: "schopnosť",
};

/** A skill type id as its Slovak noun; "elite" and the rest pass as they came. */
function spaced(word: string): string {
  return SKILL_NOUN[word] ?? (word === "elite" ? "elitná schopnosť" : word.replaceAll("-", " "));
}

const PLURAL_ENDINGS: readonly (readonly [RegExp, string])[] = [
  [/schopnosť$/, "schopnosti"],
  [/útok zvieraťa$/, "útoky zvieraťa"],
  [/útok$/, "útoky"],
  [/kúzlo$/, "kúzla"],
  [/očarovanie$/, "očarovania"],
  [/kliatba$/, "kliatby"],
  [/pečať$/, "pečate"],
  [/pokrik$/, "pokriky"],
  [/postoj$/, "postoje"],
  [/príprava$/, "prípravy"],
  [/glyf$/, "glyfy"],
  [/spev$/, "spevy"],
  [/ozvena$/, "ozveny"],
  [/rituál$/, "rituály"],
  [/kruh$/, "kruhy"],
  [/studňa$/, "studne"],
  [/pasca$/, "pasce"],
  [/podoba$/, "podoby"],
  [/efekt schopnosti$/, "efekty schopnosti"],
  [/bod energie$/, "body energie"],
  [/spojenec$/, "spojenci"],
  [/nepriateľ$/, "nepriatelia"],
  [/duch$/, "duchovia"],
  [/prisluhovač$/, "prisluhovači"],
  [/tvor$/, "tvory"],
  [/sekunda$/, "sekundy"],
  [/elitná schopnosť$/, "elitné schopnosti"],
];

function pluralNoun(noun: string): string {
  for (const [ending, plural] of PLURAL_ENDINGS) {
    if (ending.test(noun)) {
      return noun
        .replace(ending, plural)
        .replace(/^mŕtvy /, "mŕtvi ")
        .replace(/^zrazený /, "zrazení ")
        .replace(/^prírodný /, "prírodné ")
        .replace(/^viažuci /, "viažuce ")
        .replace(/^ochranný /, "ochranné ")
        .replace(/^zbraňový /, "zbraňové ");
    }
  }
  return noun;
}

/** A plural after "z" or "od": the genitive plural. */
function genitive(text: string): string {
  return text
    .replace(wholeWord("nepriatelia", "g"), "nepriateľov")
    .replace(wholeWord("spojenci", "g"), "spojencov")
    .replace(wholeWord("duchovia", "g"), "duchov")
    .replace(wholeWord("prisluhovači", "g"), "prisluhovačov")
    .replace(wholeWord("tvory", "g"), "tvorov")
    .replace(/členovia skupiny/g, "členov skupiny")
    .replace(wholeWord("tvoji", "g"), "tvojich")
    .replace(/nepriateľskí/g, "nepriateľských")
    .replace(/spojeneckí/g, "spojeneckých")
    .replace(/nepriateľské/g, "nepriateľských")
    .replace(/ostatní/g, "ostatných")
    .replace(/neduhy/g, "neduhov")
    .replace(/kliatby/g, "kliatob")
    .replace(/očarovania/g, "očarovaní");
}

/** Damage named with a number: the genitive, "50 ohnivého poškodenia". */
const DAMAGE_GENITIVE: Record<DamageKind, string> = {
  slashing: "sečného",
  piercing: "bodného",
  blunt: "drvivého",
  fire: "ohnivého",
  cold: "ľadového",
  lightning: "bleskového",
  earth: "zemného",
  chaos: "chaotického",
  dark: "temného",
  holy: "svätého",
  shadow: "tieňového",
  typeless: "",
};

/** The damage kinds in the nominative: "ohnivé poškodenie". */
const DAMAGE_ADJECTIVE: Record<DamageKind, string> = {
  slashing: "sečné",
  piercing: "bodné",
  blunt: "drvivé",
  fire: "ohnivé",
  cold: "ľadové",
  lightning: "bleskové",
  earth: "zemné",
  chaos: "chaotické",
  dark: "temné",
  holy: "sväté",
  shadow: "tieňové",
  typeless: "",
};

function typeWord(type: DamageKind): string {
  return type === "typeless" ? "" : ` ${DAMAGE_GENITIVE[type]}`;
}

/** A damage adjective said by `typeWord`, with its noun after a number: "ohnivého poškodenia". */
function damageOf(adjective: string): string {
  const word = adjective.trim();
  return word === "" ? "poškodenia" : `${word} poškodenia`;
}

function damageNoun(type: DamageKind): string {
  return damageOf(DAMAGE_GENITIVE[type]);
}

/** The nominative, where no number precedes: "je ohnivé poškodenie". */
function damagePlain(type: DamageKind): string {
  const word = DAMAGE_ADJECTIVE[type];
  return word === "" ? "poškodenie" : `${word} poškodenie`;
}

/** Damage named by id, the two broad kinds included. */
function damageNamed(type: DamageKind | "elemental" | "physical"): string {
  return type === "physical"
    ? "fyzické poškodenie"
    : type === "elemental"
      ? "elementárne poškodenie"
      : damagePlain(type);
}

const NEEDED_WEAPON: Record<Weapon, string> = {
  axe: "sekeru",
  sword: "meč",
  hammer: "kladivo",
  daggers: "dýky",
  scythe: "kosu",
  spear: "kopiju",
  bow: "luk",
  melee: "zbraň na blízko",
};

const WITH_WEAPON: Record<Weapon, string> = {
  axe: "sekerou",
  sword: "mečom",
  hammer: "kladivom",
  daggers: "dýkami",
  scythe: "kosou",
  spear: "kopijou",
  bow: "lukom",
  melee: "zbraňou na blízko",
};

const WEAPON_WORD: Record<Weapon, string> = {
  axe: "sekera",
  sword: "meč",
  hammer: "kladivo",
  daggers: "dýky",
  scythe: "kosa",
  spear: "kopija",
  bow: "luk",
  melee: "blízky boj",
};

/** "s mečom", "so sekerou": the preposition agrees with the weapon's sound. */
const WITH_PREP: Record<Weapon, string> = {
  axe: "so sekerou",
  sword: "s mečom",
  hammer: "s kladivom",
  daggers: "s dýkami",
  scythe: "s kosou",
  spear: "s kopijou",
  bow: "s lukom",
  melee: "so zbraňou na blízko",
};

function wielding(weapon: Weapon | undefined): string {
  return weapon === undefined ? "" : ` ${WITH_PREP[weapon]} v ruke`;
}

function weaponAttacks(weapon: Weapon | undefined): string {
  return weapon === undefined
    ? "útoky"
    : weapon === "melee"
      ? "útoky na blízko"
      : `útoky ${WITH_WEAPON[weapon]}`;
}

function attackSkills(weapon: Weapon | undefined): string {
  return weapon === undefined
    ? "útočné schopnosti"
    : weapon === "melee"
      ? "útočné schopnosti na blízko"
      : `útočné schopnosti ${WITH_WEAPON[weapon]}`;
}

/** After "s" / "úderom": instrumental. */
const CHAIN_ARTICLED: Record<ChainKind, string> = {
  lead: "úvodným útokom",
  "off-hand": "útokom druhou rukou",
  dual: "dvojitým útokom",
};

/** After "po": locative. */
const CHAIN_AFTER: Record<ChainKind, string> = {
  lead: "po úvodnom útoku",
  "off-hand": "po útoku druhou rukou",
  dual: "po dvojitom útoku",
};

const TYPE_TEXT: Words["typeText"] = {
  attack: "Útok.",
  spell: "Kúzlo.",
  enchantment: "Očarovacie kúzlo.",
  hex: "Kliatba.",
  signet: "Pečať.",
  shout: "Pokrik.",
  stance: "Postoj.",
  preparation: "Príprava.",
  glyph: "Glyf.",
  chant: "Spev.",
  echo: "Ozvena.",
  "weapon-spell": "Zbraňové kúzlo.",
  "nature-ritual": "Prírodný rituál.",
  "binding-ritual": "Viažuci rituál.",
  ward: "Kúzlo ochranného kruhu.",
  well: "Kúzlo studne.",
  "item-spell": "Predmetové kúzlo.",
  trap: "Pasca.",
  "pet-attack": "Útok zvieraťa.",
  form: "Podoba.",
  skill: "Schopnosť.",
};

/** A skill type as a word mid-line, lower-cased: "kúzlo", "očarovacie kúzlo". */
function typeName(type: SkillKind): string {
  return lowerFirst(TYPE_TEXT[type].replace(/\.$/, ""));
}

/** "Elitný útok", "Elitná kliatba", "Elitné kúzlo". */
const ADJ_ELITE: Record<SkillKind, string> = {
  attack: "Elitný ",
  spell: "Elitné ",
  enchantment: "Elitné ",
  hex: "Elitná ",
  signet: "Elitná ",
  shout: "Elitný ",
  stance: "Elitný ",
  preparation: "Elitná ",
  glyph: "Elitný ",
  chant: "Elitný ",
  echo: "Elitná ",
  "weapon-spell": "Elitné ",
  "nature-ritual": "Elitný ",
  "binding-ritual": "Elitný ",
  ward: "Elitné ",
  well: "Elitné ",
  "item-spell": "Elitné ",
  trap: "Elitná ",
  "pet-attack": "Elitný ",
  form: "Elitná ",
  skill: "Elitná ",
};

const ADJ_FLASH: Record<SkillKind, string> = {
  attack: "Bleskový ",
  spell: "Bleskové ",
  enchantment: "Bleskové ",
  hex: "Blesková ",
  signet: "Blesková ",
  shout: "Bleskový ",
  stance: "Bleskový ",
  preparation: "Blesková ",
  glyph: "Bleskový ",
  chant: "Bleskový ",
  echo: "Blesková ",
  "weapon-spell": "Bleskové ",
  "nature-ritual": "Bleskový ",
  "binding-ritual": "Bleskový ",
  ward: "Bleskové ",
  well: "Bleskové ",
  "item-spell": "Bleskové ",
  trap: "Blesková ",
  "pet-attack": "Bleskový ",
  form: "Blesková ",
  skill: "Blesková ",
};

const TYPE_STEM: Record<SkillKind, string> = {
  attack: "útok",
  spell: "kúzlo",
  enchantment: "očarovanie",
  hex: "kliatba",
  signet: "pečať",
  shout: "pokrik",
  stance: "postoj",
  preparation: "príprava",
  glyph: "glyf",
  chant: "spev",
  echo: "ozvena",
  "weapon-spell": "zbraňové kúzlo",
  "nature-ritual": "prírodný rituál",
  "binding-ritual": "viažuci rituál",
  ward: "ochranný kruh",
  well: "studňa",
  "item-spell": "predmetové kúzlo",
  trap: "pasca",
  "pet-attack": "útok zvieraťa",
  form: "podoba",
  skill: "schopnosť",
};

const HEADS: readonly (readonly [RegExp, string])[] = [
  [/očarovacie kúzlo$/, "očarovacie kúzlo"],
  [/zbraňové kúzlo$/, "zbraňové kúzlo"],
  [/predmetové kúzlo$/, "predmetové kúzlo"],
  [/kúzlo ochranného kruhu$/, "kúzlo ochranného kruhu"],
  [/kúzlo studne$/, "kúzlo studne"],
  [/prírodný rituál$/, "prírodný rituál"],
  [/viažuci rituál$/, "viažuci rituál"],
  [/útok zvieraťa$/, "útok zvieraťa"],
  [/kliatba$/, "kliatbu"],
  [/pečať$/, "pečať"],
  [/pokrik$/, "pokrik"],
  [/postoj$/, "postoj"],
  [/príprava$/, "prípravu"],
  [/glyf$/, "glyf"],
  [/spev$/, "spev"],
  [/ozvena$/, "ozvenu"],
  [/pasca$/, "pascu"],
  [/podoba$/, "podobu"],
  [/kúzlo$/, "kúzlo"],
  [/útok$/, "útok"],
  [/schopnosť$/, "schopnosť"],
];

/**
 * The modifiers of a skill said by the shared describer in English word
 * order: "elitnú adrenalínovú Hypnotizér kliatba schopnosť". Slovak puts
 * the head noun first and sets the rest in parentheses: "elitnú kliatbu (Hypnotizér)".
 */
function compound(words: string): string {
  const said = words
    .replace(/\bprimary\b/g, "primárnu")
    .replace(/\belemental\b/g, "živelnú")
    .replace(/ schopnosť$/, (suffix, offset: number, whole: string) =>
      HEADS.some(([head]) => head.test(whole.slice(0, offset))) ? "" : suffix,
    )
    .trim();
  const head = HEADS.find(([pattern]) => pattern.test(said));
  if (head === undefined) {
    return said;
  }
  const before = said.replace(head[0], "").trim();
  const tokens = before === "" ? [] : before.split(" ");
  const adjectives = tokens.filter((token) => token.endsWith("ú"));
  const rest = tokens.filter((token) => !token.endsWith("ú"));
  const front = adjectives.length > 0 ? `${adjectives.join(" ")} ` : "";
  return `${front}${head[1]}${rest.length > 0 ? ` (${rest.join(" ")})` : ""}`;
}

const PERSON_VERBS =
  "je|nie je|má|nemá|zosiela|útočí|neútočí|používa|uvaľuje|zasiahne|nezasiahne|utrpí|klesne|odvráti|zablokuje|obetuje|dostane|stratí|dokončí|vytvorí|zomrie|skončí|vyprší|pohybuje|nepohybuje|vykonáva";
const PERSON_VERB = new RegExp(`(?<!\\p{L})(${PERSON_VERBS})(?!\\p{L})`, "u");

/** A 3rd-person verb as the 2nd: "zosiela" to "zosielaš", "je" to "si". */
function verbToYou(verb: string): string {
  if (verb === "je") {
    return "si";
  }
  if (verb === "nie je") {
    return "nie si";
  }
  return `${verb}š`;
}

const THEY_VERBS: Readonly<Record<string, string>> = {
  je: "sú",
  "nie je": "nie sú",
  má: "majú",
  nemá: "nemajú",
  útočí: "útočia",
  neútočí: "neútočia",
  zosiela: "zosielajú",
  používa: "používajú",
  pohybuje: "pohybujú",
  nepohybuje: "nepohybujú",
};

/** "zosiela kúzlo" said to its holder: "zosielaš kúzlo". */
function secondPerson(phrase: string): string {
  return phrase.replace(PERSON_VERB, (verb) => verbToYou(verb));
}

/** A `conditionText` with "cieľ" made "ty", the verb following. */
function yourCondition(text: string): string {
  return text
    .replace(/^Ak (sa )?cieľ (.*)$/, (_, sa: string | undefined, clause: string) => {
      return `Ak ${sa ?? ""}${secondPerson(clause)}`;
    })
    .replace(/ alebo( sa)? cieľ (\S+)/g, (_, sa: string | undefined, verb: string) => {
      return ` alebo${sa ?? ""} ${secondPerson(verb)}`;
    });
}

function negatedText(text: string): string {
  const pair = /^Ak (cieľ )?(nie je|nie si|nemá|nemáš|je|si|má|máš) (.*)$/.exec(text);
  if (pair !== null) {
    const opposite: Readonly<Record<string, string>> = {
      "nie je": "je",
      "nie si": "si",
      nemá: "má",
      nemáš: "máš",
      je: "nie je",
      si: "nie si",
      má: "nemá",
      máš: "nemáš",
    };
    return `Ak ${pair[1] ?? ""}${opposite[pair[2] ?? ""] ?? pair[2] ?? ""} ${pair[3] ?? ""}`;
  }
  return `Ak neplatí, že ${lowerFirst(text.replace(/^Ak /, ""))}`;
}

function share(fraction: number): string {
  return fraction === 0.5 ? "polovicu" : `${String(Math.round(fraction * 100))} %`;
}

/** `share`, then of what: "polovicu tvojho zdravia", "25 % tvojho zdravia". */
function shareOfYourHealth(fraction: number): string {
  return `${share(fraction)} tvojho zdravia`;
}

function damageTaken(multiplier: number): string {
  if (multiplier === 2) {
    return "dvojnásobné";
  }
  if (multiplier === 0.5) {
    return "polovičné";
  }
  return `${String(Math.round(multiplier * 100))} %`;
}

const TRIGGER_WHEN: Words["triggerWhen"] = {
  "bearer-casts-spell": "zosiela kúzlo",
  "bearer-attacks": "útočí",
  "bearer-attack-begins": "útočí",
  "bearer-uses-skill": "používa schopnosť",
  "bearer-applies-hex": "uvaľuje kliatbu",
  "bearer-hits": "zasiahne útokom",
  "bearer-fails-to-hit": "nezasiahne",
  "bearer-takes-physical-damage": "utrpí fyzické poškodenie",
  "bearer-takes-elemental-damage": "utrpí elementárne poškodenie",
  "bearer-takes-damage": "utrpí poškodenie",
  "bearer-takes-damage-from-foe": "utrpí poškodenie alebo krádež zdravia od nepriateľa",
  "bearer-health-drops-below": "klesne poškodením pod hranicu zdravia",
  "bearer-fatal-damage-negated": "odvráti smrteľné poškodenie",
  "bearer-hit-by-attack": "je zasiahnutý útokom nepriateľa",
  "bearer-targeted-by-foe": "je cieľom kúzla alebo útoku nepriateľa",
  "bearer-healed-by-skill": "je liečený schopnosťou",
  "bearer-blocks-melee": "zablokuje útok na blízko",
  "bearer-blocks-projectile": "zablokuje strelu",
  "bearer-blocks": "zablokuje",
  "bearer-interrupted": "je prerušený",
  "bearer-knocked-down": "je zrazený k zemi",
  "bearer-sacrifices-health": "obetuje zdravie",
  "bearer-knockdown-prevented": "odvráti zrazenie k zemi",
  "bearer-gains-hex-or-enchantment": "dostane kliatbu alebo očarovanie",
  "bearer-gains-enchantment": "dostane očarovanie",
  "bearer-loses-enchantment": "stratí očarovanie",
  "bearer-loses-condition": "stratí neduh",
  "bearer-creates-creature": "vytvorí tvora",
  "bearer-gains-condition": "dostane nový neduh",
  "bearer-chant-or-shout-ends": "dokončí spev alebo pokrik",
  "bearer-energy-empty": "nemá žiadnu energiu",
  "bearer-energy-drops-empty": "klesne na 0 energie",
  "source-targets-bearer": "je cieľom tvojej schopnosti",
  "source-bearer-apart": "je ďaleko od teba",
  "bearer-dies": "zomrie",
  ends: "skončí",
  "ends-early": "skončí predčasne",
  expires: "vyprší",
};

/** A radius table in Slovak: the radii are the game's, only the words change. */
function inSlovak(
  table: ReadonlyMap<number, string>,
  slovak: Readonly<Record<string, string>>,
): ReadonlyMap<number, string> {
  return new Map([...table].map(([radius, english]) => [radius, slovak[english] ?? english]));
}

const AREA_TEXT = inSlovak(EN_WORDS.areaText, {
  adjacent: "tesne vedľa",
  nearby: "nablízku",
  "in the area": "v oblasti",
  "in earshot": "na doslech",
  "in compass range": "v dosahu kompasu",
});

const AREA_AROUND_TARGET = inSlovak(EN_WORDS.areaAroundTarget, {
  "adjacent to it": "tesne vedľa cieľa",
  "nearby it": "blízko cieľa",
  "in the area around it": "v oblasti okolo cieľa",
  "in earshot of it": "na doslech od cieľa",
});

const AREA_AROUND_CREATED = inSlovak(EN_WORDS.areaAroundCreated, {
  "adjacent to that creature": "tesne vedľa toho tvora",
  "near that creature": "blízko toho tvora",
  "in earshot of that creature": "na doslech od toho tvora",
});

const AURA_WHO: Words["auraWho"] = {
  all: "tvory okrem duchov",
  allies: "spojenci okrem duchov",
  foes: "nepriatelia okrem duchov",
};

const AREA_WHO: Words["areaWho"] = {
  enemies: "Nepriatelia",
  allies: "Spojenci",
  all: "Všetci",
};

const SPLASH_SIDE: Words["splashSide"] = {
  foes: "nepriatelia",
  "foe-creatures": "nepriateľské tvory",
  "foe-minions": "nepriateľskí prisluhovači",
  allies: "spojenci",
  "non-spirit-allies": "spojenci okrem duchov",
  party: "členovia skupiny",
  "own-spirits": "tvoji duchovia",
  "own-minions": "tvoji ostatní prisluhovači",
  "allied-minions": "spojeneckí prisluhovači",
};

const TARGET_TEXT: Words["targetText"] = {
  self: "Ty sám",
  "single-enemy": "Nepriateľ",
  "single-ally": "Spojenec",
  "single-other-ally": "Iný spojenec",
  "single-any": "Ľubovoľný cieľ",
  "single-dead-ally": "Mŕtvy spojenec",
  "allied-spirit": "Spojenecký duch",
  "enemy-spirit": "Nepriateľský duch",
  "enemy-minion": "Prisluhovač nepriateľa",
  "own-minion": "Jeden z tvojich prisluhovačov",
  "allied-minion": "Spojenecký prisluhovač",
  "allied-summoned-creature": "Spojenecký privolaný tvor",
  "single-ally-not-spirit": "Spojenec, nie duch",
  companion: "Tvoje zviera",
  "living-companion": "Tvoje živé zviera",
};

const TARGETS_WORDS: Words["targetsWords"] = {
  ally: "spojenca",
  "other-ally": "iného spojenca",
  foe: "nepriateľa",
};

const YOUR_NEXT_SKILL = "keď nabudúce použiješ schopnosť";
const NEXT_SKILL = "keď nabudúce použije schopnosť";
const DROPPED = "Efekt pri odhodení";

function within(radius: number, radius2: string): string {
  return AREA_TEXT.get(radius) ?? `v okruhu ${radius2}`;
}

/** A profession's name in parentheses after a noun; none says nothing. */
function owned(whose: string): string {
  return whose.trim() === "" ? "" : ` (${whose.trim()})`;
}

/** "keď nabudúce zablokuješ útok na blízko" answered as "ak je to útok na blízko". */
function blockAnswer(text: string): string {
  return text.replace(
    /^keď nabudúce (?:zablokuješ|zablokuje) (.+)$/,
    (_, noun: string) => `ak je to ${noun.replace(/strelu$/, "strela")}`,
  );
}

/** "Susední nepriatelia", or after a possessive "Tvoji duchovia tesne vedľa". */
function placed(adjective: string, after: string, who: string): string {
  return who.startsWith("tvoj") ? `${capitalize(who)} ${after}` : `${adjective} ${who}`;
}

const COUNTED: Readonly<Record<string, string>> = {
  enchantment: "očarovanie",
  hex: "kliatbu",
  condition: "neduh",
};
const counted = (text: string): string =>
  text.replace(/\b(enchantment|hex|condition)\b/g, (word) => COUNTED[word] ?? word);

const kindedArmor = (text: string): string =>
  text.replace(/^(\S+) (\w+) brnenie$/, (whole, amount: string, kind: string) =>
    kind in DAMAGE_ADJECTIVE
      ? `${amount} brnenia proti: ${DAMAGE_ADJECTIVE[kind as DamageKind]} poškodenie`
      : whole,
  );

/** Whom a clause speaks of: "cieľ", unless the phrase already ends it ("skončí"). */
const whenIt = (phrase: string): string =>
  /^(skončí|vyprší)/.test(phrase) ? `keď ${phrase}` : `keď cieľ ${phrase}`;

export default {
  capitalize,
  lowerAll: lowerFirst,
  spaced,
  typeName,
  typeFirstWord: (type) => TYPE_STEM[type],
  blockAnswerWording: blockAnswer,
  loseWording: (text, fromSource, bearerIsFoe) =>
    text
      .replace(
        /^Nepriateľský cieľ stráca/,
        fromSource ? "strácaš" : bearerIsFoe ? "stráca" : "strať",
      )
      .replace(wholeWord("ktorú má"), "ktorú máš"),
  bearerWording: (text, bearerIsCaster) =>
    text
      .replace(/^Cieľ dostane/, "dostane")
      .replace(/^Cieľ stráca/, bearerIsCaster ? "strácaš" : "stráca"),
  ifItWording: (text) => text,
  gainWording: (text) => {
    const amount = lowerFirst(text).replace(/^lieči (?:o |za )?/, "");
    return amount.includes("zdrav") ? amount : `${amount} zdravia`;
  },
  loseTargetWording: (text) => lowerFirst(text).replace(/^cieľ stráca/, "strácajú"),
  stealsWording: (text) => lowerFirst(text).replace(/^kradne /, "kradneš "),
  returnedWording: (text) => lowerFirst(text).replace(/^oživuje cieľ/, "sú oživení"),
  yourMinionsWording: (text) => text.replace(/^Tvoji ostatní prisluhovači/, "Tvoji prisluhovači"),
  onlyIfWording: (text) => {
    const match = /^Ak cieľ (.*)$/.exec(text);
    if (match === null) {
      return lowerFirst(text);
    }
    const clause = match[1] ?? "";
    return clause.replace(PERSON_VERB, (verb) => THEY_VERBS[verb] ?? verb);
  },
  splashOnlyClause: (condition) =>
    condition === "" ? "" : condition.startsWith("ak ") ? `, ${condition}` : `, ktorí ${condition}`,
  eachOfWording: (reached, condition) =>
    condition === ""
      ? reached
      : condition.startsWith("ak ")
        ? `${reached}, ${condition}`
        : `${reached}, ktorí ${condition}`,
  requiresWording: (text) => text.replace(/^Ak /, "Len ak "),
  requirementWording: (text) =>
    text.startsWith("Ak ") ? `len ${lowerFirst(text)}` : lowerFirst(text),
  requirementLine: (text) => lowerFirst(text).replace(/\.$/, ""),
  anyOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Nikdy", ...rest.map((text) => text.replace(/^Ak /, ""))].join(" alebo ");
  },
  allOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Vždy", ...rest.map((text) => text.replace(/^Ak /, ""))].join(" a ");
  },
  seconds,
  blockedAttacks: { all: "útoky", melee: "útoky na blízko", projectile: "strely" },
  blockedAttack: { all: "útok", melee: "útok na blízko", projectile: "strelu" },
  damageTaken,
  triggerWhen: TRIGGER_WHEN,
  secondPerson,
  arrowsWhen: { "bearer-hits": "zasiahnu", "bearer-fails-to-hit": "nezasiahnu" },
  chantOrShoutEnds: "vždy, keď na ňom skončí spev alebo pokrik",
  energyEmpty: "keď jeho energia klesne na 0",
  dropped: DROPPED,
  targetsWords: TARGETS_WORDS,
  nextSkill: NEXT_SKILL,
  yourNextSkill: YOUR_NEXT_SKILL,
  creates: "vždy, keď vytvoríš tvora",
  areaAroundCreated: AREA_AROUND_CREATED,
  nextSkillKind: {
    "attack-skill": ["útočná schopnosť", "útočné schopnosti"],
    spell: ["kúzlo", "kúzla"],
    hex: ["kliatba", "kliatby"],
    signet: ["pečať", "pečate"],
    "signet-at-foe": ["pečať mierená na nepriateľa", "pečate mierené na nepriateľa"],
    "shout-or-chant": ["pokrik alebo spev", "pokriky alebo spevy"],
    any: ["schopnosť", "schopnosti"],
  },
  lowerFirst,
  aCategory,
  negatedText,
  yourCondition,
  typeWord,
  splashSide: SPLASH_SIDE,
  auraWho: AURA_WHO,
  groundAnchorText: {
    caster: "na tvojom mieste",
    corpse: "na jeho mieste",
    target: "na mieste tvojho cieľa",
  },
  share,
  categoryNoun,
  weaponText: {
    axe: "Útok sekerou",
    sword: "Útok mečom",
    hammer: "Útok kladivom",
    daggers: "Útok dýkami",
    scythe: "Útok kosou",
    spear: "Útok kopijou",
    bow: "Útok lukom",
    melee: "Útok na blízko",
  },
  chainRoleText: {
    lead: "Úvodný útok.",
    "off-hand": "Útok druhou rukou.",
    dual: "Dvojitý útok.",
  },
  followsText: {
    lead: "Musí nasledovať po úvodnom útoku.",
    "off-hand": "Musí nasledovať po útoku druhou rukou.",
    dual: "Musí nasledovať po dvojitom útoku.",
  },
  neededWeapon: NEEDED_WEAPON,
  weaponWord: WEAPON_WORD,
  typeText: TYPE_TEXT,
  areaText: AREA_TEXT,
  areaAroundTarget: AREA_AROUND_TARGET,
  targetText: TARGET_TEXT,
  areaWho: AREA_WHO,
  s: () => " s",
  onTarget: () => "na cieli",
  composedLastsAtBase: (p) => (p.lasts === p.at ? p.base : `${seconds(p.lasts)} (${p.base})`),
  attributes: (p) => `atribúty ${p.name}`,
  attributes2: () => "atribúty",
  attributePrimaryS: (p) => (p.scope === "primary" ? "primárny atribút" : "živelné atribúty"),
  setTo: (p) => `${p.scope} nastavené na ${p.rank}`,
  allAttributes: () => "všetky atribúty",
  toAllAllAttributes: (p) => `${p.amount} na ${p.value}`,
  renewedWheneverAChantOrShoutEnds: (p) =>
    `obnoví sa, keď na ${p.selfOnly ? "tebe" : "ňom"} skončí spev alebo pokrik`,
  renewedWheneverYouCastItCastsA: (p) =>
    `obnoví sa, keď ${p.selfOnly ? "zosielaš kúzlo" : "cieľ zosiela kúzlo"}`,
  reappliedWheneverYouCastItCastsA: (p) =>
    `znovu sa uvalí, keď ${p.selfOnly ? "zosielaš kúzlo na nepriateľa" : "cieľ zosiela kúzlo na nepriateľa"}`,
  renewedWheneverYouTakeItTakesElemental: (p) =>
    `obnoví sa, keď ${p.selfOnly ? "utrpíš elementárne poškodenie" : "cieľ utrpí elementárne poškodenie"}`,
  renewedWheneverAnEnchantmentOnYouIt: (p) =>
    `obnoví sa, keď na ${p.selfOnly ? "tebe" : "ňom"} skončí očarovanie`,
  gainAdrenalineFasterSlower: (p) =>
    `získava adrenalín o ${p.shown} ${p.faster > 0 ? "rýchlejšie" : "pomalšie"}`,
  onTheBearerExpireFaster: (p) => `${p.what} na nositeľovi vypršia o ${p.stat} rýchlejšie`,
  enchantmentsAndStances: () => "očarovania a postoje",
  enchantments: () => "očarovania",
  stances: () => "postoje",
  yourAttacksAgainstItHaveCriticalChance: (p) =>
    `tvoje útoky proti nemu majú ${p.criticalChanceBonus} % šancu na kritický zásah`,
  armorAgainstYourAttacksWhileItHas: (p) =>
    `${p.armorModifier} brnenia proti tvojim útokom${p.onlyWhileNoOtherHex ? ", kým nemá inú kliatbu" : ""}`,
  youTheBearer: (p) => (p.selfOnly ? "tebe" : "nositeľovi"),
  endsIfYouEndsIfTheBearer: (p) =>
    p.selfOnly ? `skončí, keď ${secondPerson(p.phrase)}` : `skončí, keď nositeľ ${p.phrase}`,
  healthDegeneration: (p) => `−${p.healthPips} degenerácie zdravia`,
  healthRegeneration: (p) => `+${p.healthPips} regenerácie zdravia`,
  healthRegenerationForEachEnchantmentOnYou: (p) =>
    `+${p.pips} regenerácie zdravia za každé očarovanie na tebe (najviac ${p.max})`,
  energyDegeneration: (p) => `−${p.energyPips} degenerácie energie`,
  energyRegeneration: (p) => `+${p.energyPips} regenerácie energie`,
  healthLostPerSkill: (p) => `−${p.amount} zdravia za každú použitú schopnosť`,
  healthRegenerationForEachConditionOnYou: (p) =>
    `${p.healthPipsPerCondition} regenerácie zdravia za každý neduh na tebe`,
  health: () => "zdravia",
  hex: () => "kliatbu",
  energy: () => "energie",
  condition: () => "neduh",
  regenerationForEachOnYou: (p) => `${p.pips} regenerácie ${p.what} za každý ${p.each} na tebe`,
  armorWhileWielding: (p) => `${p.sign}${p.armorModifier} brnenia${wielding(p.weapon)}`,
  armorWhileNotMoving: (p) => `${p.armorWhileStill} brnenia, keď stojíš`,
  healthPerSecondWhileMoving: (p) =>
    `${p.healthPerSecondWhileMoving} zdravia za sekundu pri pohybe`,
  healthPerSecond: (p) => `+${p.healthPerSecond} zdravia za sekundu`,
  healthPerSecondMoreInEarshotOf: (p) =>
    `+${p.healthPerSecondNearSpirit} zdravia za sekundu navyše na doslech od ducha`,
  spellsCastInEarshotOfASpirit: (p) =>
    `kúzla zoslané na doslech od ducha sa dobíjajú o ${p.faster} % rýchlejšie`,
  chanceToDoubleStrikeWhileWielding: (p) =>
    `+${p.chance} % šanca na dvojitý úder${wielding(p.weapon)}`,
  armorNotBelow: (p) => `−${p.amount} brnenia (nie pod ${p.floor})`,
  movesAtSpeed: (p) => `pohybuje sa rýchlosťou ${p.speed} %`,
  movesAtSpeedWhileEnchanted: (p) => `pohybuje sa rýchlosťou ${p.speed} %, kým je očarovaný`,
  speedBoostsHaveNoEffect: () => "zrýchlenia nemajú účinok",
  cannotGainAdrenaline: () => "nemôže získavať adrenalín",
  whenThisEndsYouReturnToWhere: () => "keď toto skončí, vrátiš sa tam, kde si to zoslal",
  whenThisEndsYouShadowStepTo: (p) =>
    `keď toto skončí, urobíš krok tieňom k spojencovi, na ktorého si to zoslal, a všetky tvoje schopnosti sú ${p.seconds} s nedostupné`,
  ofAttacksMiss: (p) => `${p.attackMissChance} % útokov minie`,
  maximumHealthAtMost: (p) => `−${p.fraction} % maximálneho zdravia (najviac ${p.cap})`,
  maximumHealth: (p) => `+${p.maxHealthBonus} maximálneho zdravia`,
  maximumHealthPerEnchantment: (p) =>
    `+${p.maxHealthBonusPerEnchantment} maximálneho zdravia za každé očarovanie`,
  maximumEnergy: (p) => `+${p.maxEnergyBonus} maximálnej energie`,
  maximumHealthPerPointOfMaximumEnergy: (p) =>
    `+${p.per} maximálneho zdravia za každý bod maximálnej energie`,
  yourMinionsDealDamage: (p) => `tvoji prisluhovači spôsobujú ${p.minionDamageBonus} poškodenia`,
  loseMaximumHealthEachTimeAMinion: (p) =>
    `stráca ${p.minionHitHealthLossPercent} % maximálneho zdravia, keď tvoj prisluhovač zasiahne`,
  conditionsYouWouldReceiveGoToYour: () =>
    "neduhy, ktoré by si dostal, prechádzajú namiesto teba na tvojho najbližšieho prisluhovača",
  healing: (p) => `${p.more ? "+" : "−"}${p.change} liečenia`,
  weaponDamage: (p) => `${p.change} % poškodenia zbraňou`,
  dealsDamage: (p) => `spôsobuje ${p.more ? "+" : "−"}${p.change} poškodenia`,
  noDeathPenalty: () => "žiadny trest za smrť",
  whenTheBearerDiesSoDoesIts: () => "keď nositeľ zomrie, zomrie aj jeho zosielateľ",
  alliesYouResurrectReturnWithHealthAnd: (p) =>
    `spojenci, ktorých oživíš, sa vrátia s +${p.health} zdravia a +${p.energy} energie`,
  youDieTheBearerDiesWhenIt: (p) =>
    p.selfOnly ? "zomrieš, keď to skončí" : "nositeľ zomrie, keď to skončí",
  leavesAnExploitedCorpse: () => "zanecháva vyčerpanú mŕtvolu",
  takeFromPhysicalDamage: (p) => `utrpí ${p.sign}${p.amount} od fyzického poškodenia`,
  elementalDamageTakenIsDamage: (p) =>
    `utrpené elementárne poškodenie je ${damagePlain(p.elementalDamageTakenAs)}`,
  physicalDamageTakenIsDamage: (p) =>
    `utrpené fyzické poškodenie je ${damagePlain(p.physicalDamageTakenAs)}`,
  physicalDamageDealtIsDamage: (p) =>
    `spôsobené fyzické poškodenie je ${damagePlain(p.physicalDamageDealtAs)}`,
  elementalDamageDealtIsDamage: (p) =>
    `spôsobené elementárne poškodenie je ${damagePlain(p.elementalDamageDealtAs)}`,
  takeFromSpiritsAttacks: (p) => `utrpí ${p.damageFromSpiritAttacks} od útokov duchov`,
  attacksAttacksDealDamage: (p) =>
    `${capitalize(weaponAttacks(p.weapon))} spôsobujú ${damagePlain(p.attackDamageType)}`,
  attacksHaveArmorPenetration: (p) => `útoky majú ${p.attackArmorPenetration} % prieniku brnenia`,
  attacksAttacksDealLessMoreDamage: (p) =>
    `${capitalize(weaponAttacks(p.weapon))} spôsobujú o ${p.amount} ${p.delta < 0 ? "menej" : "viac"} poškodenia`,
  and: () => " a ",
  immuneToAnd: (p) => `imúnny voči: ${p.names}`,
  setOnFire: () => "zapálený",
  or: () => " alebo ",
  cannotBeOr: (p) => `nemôže byť ${p.names}`,
  attacksFromAttacks: (p) =>
    `${p.adrenalineGain}${p.adrenalineGainFasterFrom === "attacks" ? " z útokov" : ""}`,
  yourEliteEliteSkillSUse: (p) =>
    `tvoje ${p.skillType === "elite" ? "elitné schopnosti" : pluralNoun(spaced(p.skillType))} používajú ${p.name}`,
  uses: (p) => `použitia: ${pluralNoun(spaced(p.skillType))}`,
  sUse: (p) => `ďalších ${p.uses}: ${pluralNoun(spaced(p.skillType))} používa`,
  yourNext: (p) => `tvoje ďalšie použitie (${p.next}): ${p.name}`,
  spellsTakeAsLongToCast: (p) => `zoslanie kúziel trvá ${p.castTimeMultiplier}× dlhšie`,
  skillsButAttacksTakeAsLongTo: (p) =>
    `aktivácia schopností okrem útokov trvá ${p.skillActivationMultiplier}× dlhšie`,
  spellsAreInterruptedByAttacks: () => "kúzla prerušujú útoky",
  slowerFaster: (p) => (p.attackDurationMultiplier > 1 ? "pomalšie" : "rýchlejšie"),
  attacksWhileWielding: (p) => `útočí o ${p.change} % ${p.way}${wielding(p.weapon)}`,
  conditionsYouApplyLastLongerWhileWielding: (p) =>
    `neduhy, ktoré spôsobíš, trvajú o ${p.longer} % dlhšie${wielding(p.weapon)}`,
  enchantmentsYouMaintainCostTheUpkeep: (p) =>
    `očarovania, ktoré udržiavaš, stoja ${p.upkeepMultiplier}-násobnú udržiavaciu energiu`,
  spellsThatCauseOvercastCauseMoreAs: (p) =>
    `kúzla spôsobujúce prepätie spôsobia pri dokončení o ${p.overcastSurcharge} viac`,
  arrowsMoveAsFast: (p) => `šípy letia ${p.projectileSpeedMultiplier}× rýchlejšie`,
  cannotCastSpells: () => "nemôže zosielať kúzla",
  cannotAttack: () => "nemôže útočiť",
  cannotUseResurrectionSkills: () => "nemôže používať oživovacie schopnosti",
  cannotBeTheTargetOfEnemySpells: (p) =>
    p.whileCasting
      ? "počas zosielania nemôže byť cieľom nepriateľských kúziel"
      : "nemôže byť cieľom nepriateľských kúziel",
  cannotBeTheTargetOfSpells: () => "nemôže byť cieľom kúziel",
  hostileSpellsTargetingYouFail: () => "nepriateľské kúzla mierené na teba zlyhajú",
  attacksAgainstYouMiss: () => "útoky proti tebe minú",
  strippedOfAllEnchantmentsAndCannotBe: () => "stráca všetky očarovania a nemôže byť očarovaný",
  cannotBeTheTargetOfEnchantments: () => "nemôže byť cieľom očarovaní",
  cannotUseShoutsOrChants: () => "nemôže používať pokriky ani spevy",
  cannotUseSignets: () => "nemôže používať pečate",
  cannotBlockItsCasterSAttacks: () => "nemôže blokovať útoky svojho zosielateľa",
  cannotBeBlockedByBlindedFoes: () => "nemôžu ho blokovať oslepení nepriatelia",
  cannotBlock: () => "nemôže blokovať",
  renewedForSecondsIfMovingAsIt: (p) =>
    `obnoví sa na ${p.renewsWhileMoving} s, ak sa pri skončení pohybuje`,
  cannotBeKnockedDown: () => "nemôže byť zrazený k zemi",
  cannotBeKnockedDownByAFoe: () => "nepriateľ ho nemôže zraziť k zemi",
  endsIfItPreventsAKnockdown: () => "skončí, ak odvráti zrazenie k zemi",
  youDoNotSufferExtraDamageFrom: () => "neutrpíš dodatočné poškodenie od kritických útokov",
  cannotLandCriticalHits: () => "nemôže uštedriť kritické zásahy",
  immuneToCriticalHits: () => "imúnny voči kritickým zásahom",
  spellsHaveDoubleTheDivineFavorBonus: (p) =>
    `kúzla (${p.attribute}) majú dvojnásobný bonus božskej priazne`,
  attackSkillAttackSkills: (p) =>
    p.once
      ? p.attackSkillsOnly === true
        ? "útočnú schopnosť"
        : { all: "útok", melee: "útok na blízko", projectile: "strelu" }[p.against]
      : p.attackSkillsOnly === true
        ? "útočné schopnosti"
        : { all: "útoky", melee: "útoky na blízko", projectile: "strely" }[p.against],
  whileBelowHealth: (p) => ` pod ${p.blockBelowHealth} % zdravia`,
  whileUnderOr: (p) => ` pod vplyvom: ${p.value}`,
  fromFoesUnderOr: (p) => ` od nepriateľov pod vplyvom: ${p.value}`,
  whileAttacking: (p) => (p.blockWhileAttacking ? " pri útočení" : ""),
  blocksTheNextChanceToBlock: (p) =>
    p.once
      ? `nabudúce zablokuje: ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`
      : `${p.chance} % šanca zablokovať: ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`,
  within: (p) => within(p.radius, p.radius2),
  alliesTo: (p) => `spojenci ${p.around} od ${p.bearer}: ${p.status}`,
  whileWielding: (p) => wielding(p.weapon),
  whileHoldingAWeaponOtherThan: (p) => ` so zbraňou inou než ${NEEDED_WEAPON[p.not]}`,
  againstFoesThatAreNotMoving: (p) =>
    p.criticalChanceBonusVersus === undefined ? "" : " proti nepriateľom, ktorí sa nehýbu",
  criticalChance: (p) => `${p.chance} % šanca na kritický zásah${p.holding}${p.versus}`,
  gainEnergyPerCriticalHit: (p) => `získava ${p.energyPerCritical} energie za kritický zásah`,
  wheneverYouSuccessfullyLandACriticalHit: (p) =>
    `vždy, keď uštedríš kritický zásah, získaš ${p.healthPerCritical} zdravia`,
  refreshesEveryTimeYouLandACritical: () => "obnoví sa vždy, keď uštedríš kritický zásah",
  theNextTimeYouLandACritical: (p) =>
    p.endsWhenFired ? "keď nabudúce uštedríš kritický zásah" : "vždy, keď uštedríš kritický zásah",
  with: (p) => (p.weapon === undefined ? p.critical : `${p.critical} ${WITH_PREP[p.weapon]}`),
  removeStatusFromYourTarget: (p) =>
    p.kind === "remove-status"
      ? `${p.when}: ${lowerFirst(p.text)} z tvojho cieľa`
      : `${p.when}: ${lowerFirst(p.text)}`,
  ifOneIsRemovedYouLoseEnergy: (p) =>
    `ak jeden odstránia, strácaš ${p.energyIfRemoved} energie alebo to skončí`,
  endsAfterIncomingAttackS: (p) =>
    `skončí po ${p.endsAfterAttacks} ${byCount(p.endsAfterAttacks2, "prichádzajúcom útoku", "prichádzajúcich útokoch", "prichádzajúcich útokoch")}`,
  endsAfterYourNextAttackSHit: (p) =>
    p.endsAfterAttackCount2 === 1
      ? "skončí po tvojom ďalšom útoku, či zasiahne, minie alebo je zablokovaný"
      : `skončí po tvojich ďalších ${p.endsAfterAttackCount} útokoch, či zasiahnu, minú alebo sú zablokované`,
  noEffectWhileUnderOr: (p) => `bez účinku pod vplyvom: ${p.suppressedWhileUnder}`,
  yourNextAttackSCannotBeBlocked: (p) =>
    p.unblockableAttacks2 === 1
      ? "tvoj ďalší útok nemožno zablokovať"
      : `tvoje ďalšie ${p.unblockableAttacks} útoky nemožno zablokovať`,
  attacksCannotBeBlocked: (p) => `${capitalize(weaponAttacks(p.weapon))} nemožno zablokovať`,
  whileYouWieldAnAWeapon: (p) =>
    `kým držíš zbraň s poškodením typu ${damagePlain(p.weaponDamage)}, ${p.hit}`,
  forEachEnchantmentRemovedSCasterLoses: (p) =>
    `za každé odstránené očarovanie (${p.name}) zosielateľ schopnosti ${p.name2} stratí ${p.percentOfMax} % svojho maximálneho zdravia`,
  with2: (p) => (p.weapon === undefined ? "" : ` ${WITH_PREP[p.weapon]}`),
  endsAfterHitS: (p) =>
    `skončí po ${p.count} ${byCount(p.count2, "zásahu", "zásahoch", "zásahoch")}${p.how}`,
  spellSpells: (p) => (p.one ? "kúzlo" : `${p.count} kúzla`),
  yourNextCostsCostLessEnergy: (p) =>
    `${p.one ? "tvoje ďalšie" : "tvoje ďalšie"} ${p.next} ${p.one ? "stojí" : "stoja"} o ${p.costReduction} menej energie`,
  yourNextRechargesRechargeFaster: (p) =>
    `${p.one ? "tvoje ďalšie" : "tvoje ďalšie"} ${p.next} sa ${p.one ? "dobíja" : "dobíjajú"} o ${p.rechargeFaster} % rýchlejšie`,
  forYourNext: (p) => `pre tvoje ďalšie: ${p.next}`,
  theirProjectilesMoveAsFast: (p) => `ich strely letia ${p.projectileSpeedMultiplier}× rýchlejšie`,
  noOvercast: () => "žiadne prepätie",
  spreadsToAdjacentCombatants: () => "šíri sa na bojovníkov tesne vedľa",
  nextAttackSkillDamage: (p) => `ďalšia útočná schopnosť: ${p.condition}: +${p.more} poškodenia`,
  attacks: () => "útočí",
  makesAMeleeAttack: () => "útočí na blízko",
  moves: () => "sa pohybuje",
  takesDamage: (p) => `utrpí ${p.damageTakenMultiplier} poškodenie`,
  takesDamageFromTheNextAttack: (p) =>
    `utrpí od ďalšieho útoku ${damageTaken(p.attackDamageTakenMultiplier)} poškodenie`,
  damageTaken2: (p) => `−${p.damageReduction} utrpeného poškodenia`,
  damageTakenPerRankOfAtMost: (p) =>
    `−${p.now} utrpeného poškodenia (${p.perRank} za stupeň atribútu ${p.attribute}, najviac ${p.max})`,
  damageTakenMoreEachHit: (p) =>
    `−${p.step} utrpeného poškodenia, o ${p.step} viac s každým zásahom`,
  theNextHitDealsLessDamage: (p) =>
    `ďalší zásah spôsobí o ${p.nextDamageReduction} menej poškodenia`,
  damageTakenWhileCastingS: (p) =>
    `−${p.amount} utrpeného poškodenia pri zosielaní: ${pluralNoun(spaced(p.skillType))}`,
  lessDamage: (p) => `o ${p.value} % menej: ${damagePlain(p.type)}`,
  lessDamageFromFoesWithAHex: (p) =>
    `o ${p.fraction} % menej poškodenia od nepriateľov s kliatbou (${p.name})`,
  lessDamageFromFoesSufferingFrom: (p) =>
    `o ${p.fraction} % menej poškodenia od nepriateľov pod vplyvom: ${p.name}`,
  damageTakenFromFoesWithLessHealth: (p) =>
    `−${p.damageReductionFromWeakerFoe} utrpeného poškodenia od nepriateľov s menším zdravím`,
  damageTakenFromFoesWithACondition: (p) =>
    `−${p.damageReductionFromConditionedFoe} utrpeného poškodenia od nepriateľov s neduhom`,
  lessDamageFromSpells: (p) => `o ${p.less} % menej poškodenia od kúziel`,
  damageOverInASecondIsHealed: (p) => `poškodenie nad ${p.cap} za sekundu sa vylieči`,
  physicalItsPhysicalDamageTheDamageIt: (p) =>
    p.from === "physical" ? "jeho fyzické poškodenie" : "poškodenie, ktoré utrpí od útokov",
  whichTakesLessOfIt: (p) => `, ktorý z neho utrpí o ${p.reduction} menej`,
  goesToItsCaster: (p) => `${share(p.fraction)} z: ${p.hits} prechádza na zosielateľa${p.less}`,
  theDamageYouTakeGoesToYour: (p) =>
    `${share(p.redirectsDamageToMinion)} poškodenia, ktoré utrpíš, prechádza na tvojho najbližšieho prisluhovača`,
  damageFromASingleHitIsCapped: (p) =>
    `poškodenie z jedného zásahu je obmedzené na ${p.maxDamageFractionPerHit} % maximálneho zdravia`,
  eachHitItCapsCostsTheCaster: (p) =>
    `každý takto obmedzený zásah stojí zosielateľa ${p.casterEnergyPerReduction} energie a skončí, ak zosielateľ nemôže zaplatiť`,
  damageFromASingleAttackIsCapped: (p) =>
    `poškodenie z jedného útoku je obmedzené na ${p.attackDamageCapFraction} % maximálneho zdravia`,
  lifeStolen: (p) => `−${p.lifeStealReduction} ukradnutého zdravia`,
  yourHealthSacrificesAreLarger: (p) =>
    `tvoje obety zdravia sú o ${p.sacrificeMultiplier} % väčšie`,
  knockdownsLastAtLeastS: (p) => `zrazenia k zemi trvajú najmenej ${p.knockdownMinSeconds} s`,
  itsSpiritLosesHealthEachTime: (p) => `jeho duch zakaždým stratí ${p.sourceLosesHealth} zdravia`,
  reappliedAsItWouldEndWhileYou: (p) =>
    `pri skončení sa znovu uvalí, kým ${p.selfOnly ? "máš" : "má"} ďalšiu kliatbu`,
  chantsAndShoutsLastLongerOnIt: (p) => `spevy a pokriky na ňom trvajú o ${p.longer} % dlhšie`,
  attacksDealLessMoreDamage: (p) =>
    `útoky spôsobujú o ${p.attackDamageDelta} ${p.attackDamageDelta2 < 0 ? "menej" : "viac"} poškodenia`,
  movesFaster: (p) => `pohybuje sa o ${p.moveSpeedMultiplier} % rýchlejšie`,
  healthRegenerationDegeneration: (p) =>
    `${p.healthPips} ${p.healthPips2 > 0 ? "regenerácie" : "degenerácie"} zdravia`,
  armor: (p) => `${p.armorModifier} brnenia`,
  attacksFaster: (p) => `útočí o ${p.value} % rýchlejšie`,
  aOr: (p) => categoryIds(p.categories),
  listComma: () => ", ",
  whileUnderOr2: (p) => `pod vplyvom ${p.under}: ${p.gains}`,
  once: () => "raz",
  times: (p) => `${p.stat}-krát`,
  endsAfterItTakesEffect: (p) => `skončí po tom, čo sa aktivuje ${p.times}`,
  theNextHexFailsAndItsCaster: (p) =>
    `ďalšia kliatba zlyhá a jej zosielateľ utrpí ${p.damage} poškodenia`,
  theNextSpellItCastsAtFoe: (p) =>
    `ďalšie kúzlo, ktoré zošle na ${p.on === "foe-targeted" ? "nepriateľa" : "spojenca"}, zlyhá: ${p.what}`,
  theNextTouchSkillsUsedAgainstYou: (p) =>
    `ďalšie ${p.failsFoeTouchSkills} dotykové schopnosti proti tebe zlyhajú`,
  foesWithinFoes: (p) =>
    p.area === undefined ? `nepriatelia v okruhu ${p.radius}` : `nepriatelia ${p.area}`,
  moreEachSecond: (p) => `, o ${p.growth} viac každú sekundu`,
  eachSecondItAndTakeDamage: (p) =>
    `každú sekundu ${p.hitsBearer ? "cieľ a " : ""}${p.foes} utrpia ${p.damage} ${p.kind === "" ? damageOf("") : damageNoun(p.kind.trim() as DamageKind)}${p.more}`,
  second: () => "sekundu",
  seconds2: (p) => `${p.every} s`,
  everySecondSeconds: (p) => `každých ${p.value}: ${p.what}`,
  itsSpiritLosesHealthForEachOne: (p) =>
    `jeho duch stratí ${p.amount} zdravia za každý zranený cieľ`,
  itsSpiritLosesHealthForEachOne2: (p) =>
    `jeho duch stratí ${p.amount} zdravia za každý vyliečený cieľ`,
  everyAttack: () => "každého útoku",
  theNextAttack: () => "ďalšieho útoku",
  theNextAttacks: (p) => `ďalších ${p.times} útokov`,
  typelessAsDamage: (p) => (p.type === "typeless" ? "" : ` ako ${damagePlain(p.type)}`),
  ofTheDamageOfThatHitIt: (p) =>
    `${p.share} % poškodenia ${p.attacks}, ktoré ho zasiahnu, sa vracia útočníkovi${p.kind}, najviac ${p.max}`,
  eachAttackItLandsHasAChance: (p) =>
    `každý jeho zásah má ${p.chance} % šancu, že poškodenie utrpí on sám namiesto cieľa, najviac ${p.max}`,
  theNextDamageOrLifeStealHeals: (p) =>
    `ďalšie poškodenie alebo krádež zdravia namiesto toho o toľko lieči, najviac ${p.reversesNextDamage}`,
  theNextDamageIsNegatedAndIts: (p) =>
    `ďalšie poškodenie je zrušené a utrpí ho namiesto toho jeho zdroj, najviac ${p.cap}`,
  meleeAttacksNeitherHitNorFailTo: (p) =>
    `útoky na blízko ani nezasiahnu, ani neminú a namiesto toho spôsobia každý ${p.damage} poškodenia`,
  allDamageHealsForThatMuchInstead: (p) =>
    `všetko poškodenie namiesto toho o toľko lieči, najviac ${p.cap} za zásah`,
  theNextDamageOrLifeStealThat: (p) =>
    `ďalšie poškodenie alebo krádež zdravia, ktoré by ${p.selfOnly ? "ťa" : "ho"} zabili, sú zrušené`,
  whenOneAllySIsSpentIt: () => "keď sa na jednom spojencovi minie, skončí na všetkých ostatných",
  gainMoreStrikeStrikesOfAdrenalinePer: (p) =>
    `získava navyše ${p.extraStrikesPerHit} ${byCount(p.extraStrikesPerHit2, "úder", "údery", "úderov")} adrenalínu za zásah`,
  skillsRechargeFaster: (p) => `schopnosti sa dobíjajú o ${p.skillRechargeFaster} % rýchlejšie`,
  skillsCostMoreLessEnergy: (p) =>
    `schopnosti stoja o ${p.change} % ${p.change2 > 0 ? "viac" : "menej"} energie`,
  spellsAndBindingRitualsRechargeFaster: (p) =>
    `kúzla a viažuce rituály sa dobíjajú o ${p.faster} % rýchlejšie`,
  spellsRechargeFaster: (p) => `kúzla sa dobíjajú o ${p.spellRechargeFaster} % rýchlejšie`,
  bindingRitualsRechargeFaster: (p) => `viažuce rituály sa dobíjajú o ${p.faster} % rýchlejšie`,
  enchantmentsRechargeFaster: (p) =>
    `očarovania (${p.name}) sa dobíjajú o ${p.faster} % rýchlejšie`,
  hexTheTargetSYour: (p) => (p.category === "hex" ? "jeho" : "tvoje"),
  skillsHaveArmorPenetration: (p) => `schopnosti (${p.name}) majú ${p.pierce} % prieniku brnenia`,
  yourTheBearerSSkillsCannotBe: (p) =>
    `${p.selfOnly ? "tvoje schopnosti" : "schopnosti nositeľa"} nemožno prerušiť`,
  theNextTimeYouWouldBeInterrupted: () => "keď ťa nabudúce majú prerušiť, nestane sa tak",
  youCannotBeInterruptedEachTimeYou: (p) =>
    `nemôžeš byť prerušený; vždy, keď by sa to stalo, strácaš ${p.amount} energie alebo toto skončí`,
  youCannotBeInterruptedEachTimeYou2: (p) =>
    `nemôžeš byť prerušený; vždy, keď by sa to stalo, strácaš 1 očarovanie (${p.profession}) alebo toto skončí`,
  conditionsOnExpireFaster: (p) => `neduhy na ${p.bearer} vypršia o ${p.faster} rýchlejšie`,
  hexesOnExpireFaster: (p) => `kliatby na ${p.bearer} vypršia o ${p.faster} % rýchlejšie`,
  theNextHexOnLastsLonger: (p) =>
    `ďalšia kliatba (${p.of}) na ${p.bearer} trvá o ${p.longer} dlhšie`,
  hexesCastOnTakeAsLongTo: (p) => `zoslanie kliatob na ${p.bearer} trvá ${p.times}× dlhšie`,
  otherAlliesSpellsOnTakeAsLong: (p) =>
    `zoslanie kúziel iných spojencov na ${p.bearer} trvá ${p.times}× dlhšie`,
  yourSpellsOnTakeAsLongTo: (p) => `zoslanie tvojich kúziel na ${p.bearer} trvá ${p.times}× dlhšie`,
  enchantmentsCastOnCostLessEnergyMinimum: (p) =>
    `očarovania na ${p.bearer} stoja o ${p.less} menej energie, najmenej 1`,
  hitsWithAnAttack: () => "zasiahne útokom",
  failsToHit: () => "nezasiahne",
  hitsWithAnAttackSkill: () => "zasiahne útočnou schopnosťou",
  skillEffectEndsIfYouUseA: (p) =>
    p.selfOnly || p.category === "skill-effect"
      ? "skončí, keď použiješ schopnosť"
      : "skončí, keď nositeľ použije schopnosť",
  endsIfYouUseAnAdrenalSkill: () => "skončí, keď použiješ adrenalínovú schopnosť",
  endsIfYouUseANonAdrenal: () => "skončí, keď použiješ neadrenalínovú schopnosť",
  endsIfYouUseANonSkill: (p) => `skončí, keď použiješ inú než schopnosť typu ${p.kind}`,
  endsIfYouUseAnAttackSkill: () => "skončí, keď použiješ útočnú schopnosť",
  endsIfYouUseASkillOn: () => "skončí, keď na to použiješ schopnosť",
  endsIfYouUseASkillThat: (p) =>
    `skončí, keď použiješ schopnosť, ktorá nie je ${p.NEXT_SKILL_KIND}`,
  hexHexedEnchanted: (p) => (p.category === "hex" ? "preklatý" : "očarovaný"),
  becomesOr: (p) => `stane sa ${p.gained}`,
  theBearerIsDestroyedWhenItExpires: () => "nositeľ je pri vypršaní zničený",
  theMinionsYouItTookBecomeMasterless: (p) =>
    `prisluhovači, ktorých ${p.selfOnly ? "si prevzal" : "prevzal"}, sa stanú bezpánskymi, keď to skončí`,
  whenTheBearerDiesRisesWhereIt: (p) =>
    p.masterless === true
      ? `keď nositeľ zomrie, na jeho mieste povstane bezpánsky: ${p.stands}`
      : `keď zomrie, na jeho mieste povstane: ${p.stands}`,
  composedKindBoundWhenOn: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.on],
  endsIfItEndsIfYou: (p) =>
    p.onFoe ? `skončí, ${whenIt(p.when)}` : `skončí, keď ${secondPerson(p.when)}`,
  all: (p) => (p.once && p.against === "all" ? blockAnswer(p.text) : p.text),
  whileHoldingAnItem: (p) =>
    p.onlyWhileHoldingItem && !p.holdingSaid ? `${p.stats}, kým držíš predmet` : p.stats,
  composedIndexText: (p) => (p.index === 0 ? p.text : capitalize(p.text)),
  listSentence: () => ". ",
  physicalAttacks: (p) =>
    p.weapon !== undefined ? weaponAttacks(p.weapon) : p.physicalOnly ? "fyzické útoky" : "útoky",
  attackSkillsPhysicalAttacks: (p) => (p.attackSkillsOnly ? attackSkills(p.weapon) : p.value),
  foesYourHitGetFor: (p) =>
    `nepriatelia zasiahnutí tvojimi: ${p.attacks} dostanú na ${p.durationSeconds}: ${p.statusName}`,
  foesYourHitTake: (p) => `nepriatelia zasiahnutí tvojimi: ${p.attacks} utrpia ${p.riderDamage}`,
  foesYourHitLose: (p) =>
    `nepriatelia zasiahnutí tvojimi: ${p.attacks} stratia ${p.count} ${categoryNoun(p.count2, p.category)}`,
  andSoDoFoesAdjacentToThem: (p) => `${p.pop}, a takisto nepriatelia tesne vedľa nich`,
  stealUpToHealth: (p) => `${capitalize(p.attacks)} kradnú až ${p.amount} zdravia`,
  yourPetSAttacksHealYouFor: (p) => `útoky tvojho zvieraťa ťa liečia o ${p.amount}`,
  yourInterruptFoesTheyHit: (p) => `tvoje ${p.attacks} prerušia zasiahnutých nepriateľov`,
  your: (p) => `tvoje ${p.attacks}: ${p.text}`,
  attackSkillsPhysicalAttacks2: (p) =>
    p.attackSkillsOnly
      ? attackSkills(p.weapon)
      : p.weapon === undefined
        ? "fyzické útoky"
        : weaponAttacks(p.weapon),
  foesThatBlockYourGetFor: (p) =>
    `nepriatelia, ktorí zablokujú tvoje ${p.attacks}, dostanú na ${p.durationSeconds}: ${p.statusName}`,
  foesThatBlockYour: (p) =>
    `nepriatelia, ktorí zablokujú tvoje ${p.attacks}: ${lowerFirst(p.text)}`,
  damage: (p) => `${p.amount} ${damageNoun(p.type)}`,
  physical: () => "fyzické",
  elemental: () => "elementárne",
  armor2: () => "brnenie",
  listSpace: () => " ",
  againstProjectileAttacks: (p) =>
    p.projectile ? `${kindedArmor(p.text)} proti strelám` : kindedArmor(p.text),
  thatAllyIsHealedFor: (p) => `ten spojenec je liečený o ${p.amount}`,
  youLoseItsCasterLoses: (p) => (p.bearerIsCaster ? "strácaš" : "jeho zosielateľ stráca"),
  energy2: (p) => `${p.who} ${p.amount} energie`,
  orSpell: (p) => `kúzlo (${p.value})`,
  wheneverYouCastItCastsAnA: (p) =>
    `vždy, keď ${p.bearerIsCaster ? "zosielaš" : "cieľ zosiela"} ${compound(p.spell)} na spojenca, ${p.value}`,
  composedKindBoundWhenEvent: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.event],
  youOrItOr: (p) => (p.bearerIsCaster ? p.phrases : `cieľ ${p.phrases2}`),
  whenItOrOrAtOnce: (p) =>
    p.length === 0 ? p.death : `${whenIt(p.others)}, alebo okamžite ${p.death}`,
  whenItOr: (p) => whenIt(p.on),
  composedBearerIsCaster: (p) => (p.bearerIsCaster ? YOUR_NEXT_SKILL : NEXT_SKILL),
  theNextTime: (p) => `keď nabudúce ${p.doer}`,
  composedEventWhenOf: (p) =>
    p.event === "bearer-hits"
      ? "zasiahnu"
      : p.event === "bearer-fails-to-hit"
        ? "nezasiahnu"
        : p.whenOf,
  wheneverYourArrowsOr: (p) => `vždy, keď tvoje šípy ${p.on}`,
  wheneverOnACreatureWithLessHealth: (p) =>
    `vždy, keď ${p.doer}${p.victimHasLessHealth === undefined ? "" : " tvora s menším zdravím"}`,
  and2: () => " a ",
  andAnd: (p) => (p.when === undefined ? p.each : `${p.when}: ${p.each}`),
  youItAnd: (p) => `${p.when}: ${p.bearerIsCaster ? "ty" : "cieľ"} a ${p.answer}`,
  youAndAllPartyMembersAreHealed: (p) =>
    `${DROPPED}: ty a všetci členovia skupiny ste vyliečení o ${p.healed}`,
  composedWhat: (p) => `${DROPPED}: ${p.what}`,
  meleeHitsWithAMeleeAttackHits: (p) =>
    p.weapon === "melee" ? "zasiahne útokom na blízko" : `zasiahne ${WITH_WEAPON[p.weapon]}`,
  meleeIsHitByAFoeS: (p) =>
    p.weapon === "melee"
      ? "je zasiahnutý útokom nepriateľa na blízko"
      : `je zasiahnutý útokom nepriateľa ${WITH_WEAPON[p.weapon]}`,
  with3: (p) => `${WITH_PREP[p.weapon]} ${TRIGGER_WHEN[p.event]}`,
  youGainEnergy: (p) => `získaš ${p.amount} energie`,
  allYourSkillsAreRecharged: () => "všetky tvoje schopnosti sú dobité",
  yourPartyIsHealedFor: (p) => `tvoja skupina je vyliečená o ${p.amount}`,
  takeDamage: (p) => `${lowerFirst(p.upTo)} utrpia ${p.amount} ${damageNoun(p.type)}`,
  areHealedFor: (p) => `${lowerFirst(p.upTo)} sú vyliečení o ${p.amount}`,
  composedUpToText: (p) => `${lowerFirst(p.upTo)}: ${lowerFirst(p.text)}`,
  ifTargetFoeDiesWhileHexedWith: (p) =>
    p.bearerIsFoe
      ? "ak nepriateľ zomrie, kým je touto kliatbou preklatý"
      : "ak spojenec zomrie, kým je týmto očarovaný",
  and3: (p) => `${p.who}, ${p.flatMap}`,
  hasASpellInterrupted: () => "je prerušený počas kúzla",
  isStruckForDamageWhileUsingA: (p) =>
    `je zasiahnutý: ${damageNamed(p.damageType)} pri používaní schopnosti`,
  takesDamageFromAFoe: (p) => `utrpí od nepriateľa ${damageNamed(p.damageType)}`,
  takesMoreThanDamageFromAFoe: (p) => `utrpí od nepriateľa viac než ${p.minDamage} poškodenia`,
  hasItsHealthDroppedBelowByDamage: (p) => `klesne poškodením pod ${p.healthBelow} % zdravia`,
  isMoreThanFromYou: (p) => `je od teba ďalej než ${p.apartBeyond}`,
  hitsWithAAttack: (p) => `zasiahne ${CHAIN_ARTICLED[p.chainRole]}`,
  isHitByAnAttackAAttack: (p) =>
    `je zasiahnutý ${p.role === undefined ? "útokom" : CHAIN_ARTICLED[p.role]} svojho zosielateľa`,
  blocksAAttack: (p) =>
    `zablokuje ${p.blocked === "melee" ? "útok na blízko" : p.blocked === "projectile" ? "strelu" : p.blocked}`,
  losesAEnchantment: (p) => `stratí očarovanie (${p.name})`,
  hex2: (p) => `${p.scopeAdjective} kliatba`,
  appliesAnAToAFoe: (p) => `uvaľuje ${compound(p.words)} na nepriateľa`,
  spell: (p) => (p.type === undefined ? "kúzlo" : typeName(p.type)),
  onAllyAnAllyAFoe: (p) => ` na ${p.targets === "ally" ? "spojenca" : "nepriateľa"}`,
  castsAnA: (p) => `zosiela ${compound(p.words)}${p.on}`,
  non: (p) => `nie-${TYPE_STEM[p.notType]}`,
  elite: () => "elitnú",
  adrenal: () => "adrenalínovú",
  skill: () => "schopnosť",
  isTargetedByYour: (p) => `je cieľom tvojej schopnosti (${compound(p.words)})`,
  on: (p) => (p.targets === undefined ? "" : ` na ${TARGETS_WORDS[p.targets]}`),
  usesAnA: (p) => `používa ${compound(p.words)}${p.on}`,
  health2: (p) => `${p.amount} zdravia`,
  energy3: (p) => `${p.amount} energie`,
  takeDamage2: (p) => `utrpia ${p.amount} ${damageNoun(p.type)}`,
  loseAllAllS: (p) => {
    const words = CATEGORY[p.category];
    return `stratia ${p.value} ${p.count === 1 ? words.acc : words.few}`;
  },
  all2: (p) => `všetci ${p.side}`,
  upTo: (p) => `až ${p.maxTargets} ${p.side}`,
  withinOfThatCreature: (p) =>
    AREA_AROUND_CREATED.get(p.radius) ?? `v okruhu ${p.radius2} okolo toho tvora`,
  gain: (p) => `získajú ${p.answer}`,
  youGain: (p) => `${p.when}: ${p.gains ? `získaš ${p.answers}` : p.answers}`,
  onIt: () => "na ňom",
  damageOnIt: (p) => `${p.value}${p.amount} ${damageNoun(p.type)} ${p.perCount}`,
  composedWhenWhat: (p) => `${p.when}: ${p.what}`,
  itsAdjacentAllies: () => "jeho spojenci tesne vedľa",
  itsAlliesWithin: (p) => `jeho spojenci ${p.area ?? `v okruhu ${p.radius}`}`,
  itsAdjacentAlliesItsAlliesWithin: (p) =>
    !p.bearerIsFoe ? `${lowerFirst(p.foesWithin)}${p.only}` : p.value,
  bearerBlocksMeleeMeleeProjectile: (p) =>
    p.on === "bearer-blocks-melee" ? "útok na blízko" : "strelu",
  whenYouBlockYouAndAlliesAre: (p) =>
    `keď zablokuješ, ty a spojenci ${p.area} ste vyliečení o ${p.amount}`,
  eachBlockCostsYouEnergyOrThis: (p) =>
    `každé zablokovanie ťa stojí ${p.amount} energie alebo toto skončí`,
  youGainEnergyForEachSuccessfulAttack: (p) =>
    `získaš ${p.amount} energie za každý úspešne zablokovaný ${p.kind}`,
  wheneverYouBlockAAttackThisWay: (p) =>
    `vždy, keď takto zablokuješ ${p.kind}, útočník utrpí ${p.amount} ${damageNoun(p.type)}`,
  withinOfYouFoes: (p) =>
    `nepriatelia ${AREA_TEXT.get(p.radius) ?? `v okruhu ${p.radius2} okolo teba`}`,
  ifYouBlockAAttackSufferFrom: (p) =>
    `keď zablokuješ ${p.kind}, ${p.foes} trpia ${p.resolveMagnitudeAtRanks} s: ${p.statusName}`,
  ifYouBlockAAttack: (p) => `keď zablokuješ ${p.kind}, ${p.foes}: ${lowerFirst(p.text)}`,
  stealsHealthFromThatFoe: (p) => `kradne tomu nepriateľovi ${p.amount} zdravia`,
  loses: (p) => `stráca ${p.count} ${categoryNoun(p.count2, p.category)}`,
  itTakesDamage: (p) => `utrpí ${p.amount} ${damageNoun(p.type)}`,
  takeDamage3: (p) => `${p.splashed} utrpia ${p.amount} ${damageNoun(p.type)}`,
  thatAttackIsInterruptedAndAnd: (p) => `${p.when}, tento útok je prerušený a ${p.hurt}`,
  itIsInterruptedAndYouLoseEnergy: (p) =>
    `${p.when}, je prerušený a strácaš ${p.amount} energie alebo toto skončí`,
  ofThatSkillSBaseEnergyCost: (p) => `${p.share} základnej energetickej ceny tej schopnosti`,
  energy4: (p) => `${p.amount} energie`,
  youAreHealedAreHealedIsHealed: (p) =>
    p.bearerIsCaster && p.length === 0
      ? "si vyliečený"
      : p.bearerIsCaster
        ? "sú vyliečení"
        : "je vyliečený",
  forOfThatSkillSEnergyCost: (p) => `${p.healed} o ${p.share} energetickej ceny tej schopnosti`,
  forWord: (p) => `${p.healed} o ${p.amount}`,
  plus: () => " a navyše ",
  youGainGainsPlus: (p) => `${p.bearerIsCaster ? "získaš" : "získava"} ${p.gains}`,
  theNearestOf: (p) => `najbližší z: ${genitive(p.splashed)}`,
  upTo2: (p) => `až ${p.maxTargets} ${p.splashed}`,
  itAndLoseEnergy: (p) => `cieľ a ${p.others} stratia ${p.amount} energie`,
  bearerFoesFoesOtherFoes: (p) => (p.to === "bearer-foes" ? "nepriatelia" : "ostatní nepriatelia"),
  inTheAreaSufferItToo: (p) => `${p.who} v oblasti to tiež utrpia`,
  ifASpellItThatSkill: (p) => (p.spellsOnly ? "ak je to kúzlo, ono" : "tá schopnosť"),
  takesThisSkillSSlotForSeconds: (p) =>
    `${p.which} zaberá na ${p.seconds} s miesto tejto schopnosti`,
  youEnterTheSameStance: () => "zaujmeš rovnaký postoj",
  youLoseEnergyOrThisEnds: (p) => `strácaš ${p.amount} energie alebo toto skončí`,
  thatAttackIsInterrupted: (p) => `${p.when}, tento útok je prerušený`,
  takes: (p) => `utrpí ${p.dealt} ${p.when}`,
  bearerFatalDamageNegatedAnd: (p) => (p.on === "bearer-fatal-damage-negated" ? "a" : `${p.when},`),
  theFoeWhoDealtItTakesDamage: (p) =>
    `${p.then} nepriateľ, ktorý to spôsobil, utrpí ${p.amount} ${damageNoun(p.type)}`,
  thatAttackerIsHealedFor: (p) => `${p.when}, ten útočník je vyliečený o ${p.amount}`,
  bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p) =>
    p.on === "bearer-gains-enchantment" ? "očarovania" : "kliatby alebo očarovania",
  theCasterOfThatTakesDamage: (p) =>
    `${p.when}, zosielateľ tejto ${p.gained} utrpí ${p.amount} ${damageNoun(p.type)}`,
  theHealerTakesDamage: (p) => `${p.when}, liečiteľ utrpí ${p.amount} ${damageNoun(p.type)}`,
  ofThatTarget: (p) => `${lowerFirst(p.upTo)} toho cieľa: ${p.what}${p.paid}`,
  healsItsCasterFor: (p) => `lieči svojho zosielateľa o ${p.amount}, ${p.when}`,
  itsCasterGainsEnergy: (p) => `jeho zosielateľ získa ${p.amount} energie, ${p.when}`,
  theNextSkillYouUseItUses: (p) =>
    `ďalšia schopnosť, ktorú ${p.bearerIsCaster ? "použiješ" : "použije"}, sa dobíja o ${p.seconds} s dlhšie`,
  itsCasterStealsHealth: (p) => `jeho zosielateľ ukradne ${p.amount} zdravia, ${p.when}`,
  theNearestOfTakes: (p) => `najbližší z: ${genitive(p.allies)} utrpí`,
  take: (p) => `${p.allies} utrpia`,
  upToTake: (p) => `až ${p.maxTargets} ${p.allies} utrpia`,
  composedAlliesText: (p) => `${p.allies}: ${lowerFirst(p.text)}`,
  onAFoe: (p) => `${p.when} na nepriateľa`,
  adjacentToYou: () => "tesne vedľa teba",
  withinAroundYou: (p) => `${p.area ?? `v okruhu ${p.radius}`} okolo teba`,
  otherAdjacentToYouWithinAroundYou: (p) =>
    `${p.includesCentre === true ? "" : "ostatní "}${SPLASH_SIDE[p.hits]} ${p.value}`,
  takeDamage4: (p) => `${p.yours}, ${p.reached} utrpia ${p.amount} ${damageNoun(p.type)}`,
  composedYoursReachedText: (p) => `${p.yours}, ${p.reached}: ${lowerFirst(p.text)}`,
  composedBearerIsCasterSaid: (p) => (p.bearerIsCaster ? yourCondition(p.said) : p.said),
  composedWhenConditionText: (p) => `${p.when}, ${p.condition}: ${lowerFirst(p.text)}`,
  bearer: (p) => lowerFirst(p.target === "bearer" ? p.bearer : p.text),
  nextAttackSkill: (p) => `ďalšia útočná schopnosť: ${p.statusName} ${p.durationSeconds}`,
  nextAttackSkill2: (p) => `ďalšia útočná schopnosť: ${p.text}`,
  skillTargetAroundItsTarget: (p) => (p.at === "skill-target" ? " (okolo jeho cieľa)" : ""),
  withYourNext: (p) => `pri tvojom ďalšom použití (${p.next})${p.around}: ${lowerFirst(p.text)}`,
  costsCostEnergy: (p) => `${p.one ? "stojí" : "stoja"} ${p.energyBase} energie`,
  costsCostLessEnergy: (p) => `${p.one ? "stojí" : "stoja"} o ${p.energyPercentOff} menej energie`,
  costsCostLessEnergyMinimum: (p) =>
    `${p.one ? "stojí" : "stoja"} o ${p.energyDiscount} menej energie (najmenej ${p.energyFloor})`,
  costsCostMoreEnergy: (p) => `${p.one ? "stojí" : "stoja"} o ${p.energySurcharge} viac energie`,
  castsCastInstantly: (p) => `${p.one ? "zosiela sa" : "zosielajú sa"} okamžite`,
  castsCastFaster: (p) =>
    `${p.one ? "zosiela sa" : "zosielajú sa"} o ${p.activationMultiplier} rýchlejšie`,
  takesTakeAsLongToCast: (p) =>
    `zoslanie ${p.one ? "trvá" : "trvá"} ${p.activationMultiplier}× dlhšie`,
  castsCastFaster2: (p) =>
    `${p.one ? "zosiela sa" : "zosielajú sa"} o ${p.activationSecondsLess} rýchlejšie`,
  rechargesRechargeFaster: (p) =>
    `${p.one ? "dobíja sa" : "dobíjajú sa"} o ${p.rechargeFaster} rýchlejšie`,
  rechargesRechargeSlower: (p) =>
    `${p.one ? "dobíja sa" : "dobíjajú sa"} o ${p.rechargeSlower} pomalšie`,
  lastsLastLongerShorter: (p) =>
    `${p.one ? "trvá" : "trvajú"} o ${p.durationMultiplier} ${p.durationMultiplier2 > 1 ? "dlhšie" : "kratšie"}`,
  healsHealLessMoreNotTheDivine: (p) =>
    `${p.one ? "lieči" : "liečia"} o ${p.value} ${p.healMultiplier < 1 ? "menej" : "viac"}${p.sparesDivineFavor ? ", bez bonusu božskej priazne" : ""}`,
  isAreNotEasilyInterrupted: (p) => (p.one ? "nie je ľahké prerušiť" : "nie je ľahké ich prerušiť"),
  overcastYouBy: (p) => `spôsobujú ti ${p.overcastPerUse} prepätia`,
  andAttack: (p) =>
    p.chainRoles
      .replace(/\boff-hand\b/g, "útok druhou rukou")
      .replace(/\bdual\b/g, "dvojitý útok")
      .replace(/\blead\b/g, "úvodný útok"),
  attackSkillSkill: (p) =>
    p.weapon !== undefined
      ? `útočná schopnosť (${WEAPON_WORD[p.weapon]})`
      : p.type === undefined
        ? "schopnosť"
        : spaced(p.type),
  hexHexesS: (p) => (p.one ? p.kind : pluralNoun(p.kind)),
  thatTargetsAFoeThatTargetA: () => "mierené na nepriateľa",
  thatTargetsYouThatTargetYou: () => "mierené na teba",
  halfRanged: () => "s polovičným dosahom",
  notFlashEnchantments: (p) => (p.notFlash ? " (nie bleskové očarovania)" : ""),
  whileHoldingAnItem2: (p) => (p.whileHoldingItem ? "kým držíš predmet, " : ""),
  nextNext: (p) =>
    p.one ? `${p.whose} ďalšie použitie (${p.uses}):` : `${p.whose} ďalšie použitia (${p.uses}):`,
  cannotBeInterrupted: () => "nemožno prerušiť",
  cannotBeBlocked: () => "nemožno zablokovať",
  costsLessEnergy: (p) => `stojí o ${p.energyDiscount} menej energie`,
  castsInstantly: () => "zosiela sa okamžite",
  rechargesInstantly: () => "dobíja sa okamžite",
  s2: (p) => `${p.value} s`,
  takesSLongerToRecharge: (p) => `dobíja sa o ${p.extraRechargeSeconds} dlhšie`,
  yourNextAnd: (p) => `tvoje ďalšie použitie (${p.NEXT_SKILL_KIND}): ${p.does}`,
  youLoseAllEnergyAsItIs: () => "pri zosielaní stratíš všetku energiu",
  youGainOfItsEnergyCost: (p) => `získaš ${p.energyGainOfCost} jej energetickej ceny`,
  itRechargesFaster: (p) => `dobíja sa o ${p.fraction} % rýchlejšie`,
  rechargesInstantly2: (p) => `${p.name} sa dobije okamžite`,
  forYourNextSkill: () => "na tvoju ďalšiu schopnosť",
  ifItIsAAnd: (p) => `ak je to ${p.kind}, ${p.does}`,
  suffer: (p) => `utrpia ${p.sufferedWhat}`,
  forWord2: (p) => `${p.statusName} na ${p.durationSeconds} (${p.status})`,
  a: (p) => `${CATEGORY[p.category].acc} (${compound(p.owners)})`,
  ifItInterruptsASkill: () => "Ak preruší schopnosť",
  ifThatActionWasASpell: () => "Ak tá akcia bola kúzlo",
  ifThatActionWasAnAttack: () => "Ak tá akcia bola útok",
  ifItKillsTheTarget: () => "Ak zabije cieľ",
  ifItResurrects: () => "Ak oživí",
  ifASpiritDiedInThisWay: () => "Ak takto zomrel duch",
  ifWasRemoved: (p) => `Ak bol odstránený ${CATEGORY[p.category].one}`,
  ifItRemoves: (p) => `Ak odstráni ${aCategory(p.category)}`,
  ifTargetIsBelowHealth: (p) => `Ak cieľ je pod ${p.fraction} % zdravia`,
  ifTargetIsAboveHealth: (p) => `Ak cieľ je nad ${p.fraction} % zdravia`,
  ifYouHaveLessThanHealth: (p) => `Ak máš menej než ${p.fraction} % zdravia`,
  ifYouHaveLessHealthThanYour: () => "Ak máš menej zdravia než tvoje zviera",
  ifYourPetHasLessHealthThan: () => "Ak má tvoje zviera menej zdravia než ty",
  ifItFollowsOffHandAnOff: (p) => `Ak nasleduje ${CHAIN_AFTER[p.role]}`,
  ifTargetHas: (p) => `Ak cieľ má ${p.filteredCategory}`,
  ifTargetHasOr: (p) => `Ak cieľ má ${p.categories}`,
  ifYouHave: (p) => `Ak máš ${aCategory(p.category)}`,
  ifYouHaveA: (p) => `Ak máš ${CATEGORY[p.category].acc} (${p.name})`,
  other: (p) => (p.excluding === undefined ? "" : "iný"),
  ifYouHaveNo: (p) => `Ak nemáš ${noOther(p.category, p.other, CATEGORY[p.category].acc)}`,
  ifYouHaveNo2: (p) =>
    `Ak nemáš ${noOther(p.category, p.other, `${CATEGORY[p.category].acc} (${p.name})`)}`,
  ifTargetIsCastingASpellOr: (p) =>
    p.orChant === true ? "Ak cieľ zosiela kúzlo alebo spev" : "Ak cieľ zosiela kúzlo",
  ifTargetIsUsingASkill: () => "Ak cieľ používa schopnosť",
  ifTargetHasNoOtherHex: (p) => `Ak cieľ nemá inú kliatbu (${p.name})`,
  ifTargetIsNotAdjacentToAny: () => "Ak cieľ nie je tesne vedľa žiadneho spojenca",
  ifTargetIsNotNearAnyAllies: () => "Ak cieľ nemá nablízku žiadnych spojencov",
  ifTargetHasNoAlliesWithin: (p) => `Ak cieľ nemá spojencov v okruhu ${p.radius}`,
  ifTargetIsNearAnyOfYour: () => "Ak cieľ je blízko niektorého z tvojich spojencov",
  ifAnyOfYourAlliesIsWithin: (p) =>
    `Ak je niektorý z tvojich spojencov v okruhu ${p.radius} od cieľa`,
  ifTargetIsWithinEarshot: () => "Ak cieľ je na doslech",
  ifTargetIsWithinOfYou: (p) => `Ak cieľ je v okruhu ${p.radius} od teba`,
  ifTargetIsNotMoving: () => "Ak sa cieľ nepohybuje",
  ifTargetIsKnockedDown: () => "Ak cieľ je zrazený k zemi",
  ifTargetIsMoving: () => "Ak sa cieľ pohybuje",
  ifTargetIsAFoe: () => "Ak cieľ je nepriateľ",
  ifTargetIsMovingFasterThanNormal: () => "Ak sa cieľ pohybuje rýchlejšie než obvykle",
  ifAnyFoeIsKnockedDownIf: (p) =>
    p.knockedDown === true
      ? `Ak je nepriateľ ${p.where} zrazený k zemi`
      : `Ak je nepriateľ ${p.where}`,
  ifYouHitOrMoreFoes: (p) => `Ak zasiahneš aspoň ${p.atLeast} nepriateľov`,
  ifNumberOrMore: (p) => `Ak je počet ${genitive(p.countAll)} aspoň ${p.atLeast}`,
  ifAreNoMoreThan: (p) =>
    `Ak počet ${genitive(p.countAll)} nie je väčší než počet ${genitive(p.countAll2)}`,
  ifTargetHas2: (p) => `Ak cieľ je pod vplyvom: ${p.statusName}`,
  ifTargetDoesNotHave: (p) => `Ak cieľ nie je pod vplyvom: ${p.statusName}`,
  ifYouHaveMoreEnergyThanTarget: () => "Ak máš viac energie než cieľ",
  ifYouHaveLessThanEnergy: (p) => `Ak máš menej než ${p.amount} energie`,
  ifYouAreOvercast: () => "Ak trpíš prepätím",
  ifYouWield: (p) => `Ak držíš ${NEEDED_WEAPON[p.weapon]}`,
  ifYouHoldAShield: () => "Ak držíš štít",
  ifYouAreHoldingAnItem: () => "Ak držíš predmet",
  ifTargetHasLessHealthThanYou: () => "Ak cieľ má menej zdravia než ty",
  ifTargetHasMoreHealthThanYou: () => "Ak cieľ má viac zdravia než ty",
  ifTargetIsAttacking: () => "Ak cieľ útočí",
  ifTargetIsNotAttacking: () => "Ak cieľ neútočí",
  ifTargetIsCastingASpellOr2: () => "Ak cieľ zosiela kúzlo alebo útočí",
  ifTargetIsASummonedCreature: () => "Ak cieľ je privolaný tvor",
  ifNoSpiritIsWithinOfYou: (p) =>
    `Ak nemáš žiadneho ducha ${AREA_TEXT.get(p.radius) ?? `v okruhu ${p.radius2}`}`,
  ifASpiritIsWithinOfYou: (p) =>
    `Ak máš ducha ${AREA_TEXT.get(p.radius) ?? `v okruhu ${p.radius2}`}`,
  ifYouControlOrFewerS: (p) =>
    `Ak ovládaš najviac ${p.count} ${p.creature === "spirit" ? "duchov" : p.creature === "minion" ? "prisluhovačov" : genitive(pluralNoun(spaced(p.creature)))}`,
  ifASpiritOrACorpseIs: (p) =>
    `Ak je pri tebe duch alebo mŕtvola ${AREA_TEXT.get(p.radius) ?? `v okruhu ${p.radius2}`}`,
  ifAnAllyIsDeadWithin: (p) => `Ak je mŕtvy spojenec ${within(p.radius, p.radius2)}`,
  ifTargetIsNearACorpseOr: () => "Ak cieľ je blízko mŕtvoly alebo je jeho zviera mŕtve",
  ifTargetIsWithinOfACorpse: (p) =>
    `Ak cieľ je v okruhu ${p.radius} od mŕtvoly alebo je jeho zviera mŕtve`,
  composedType: (p) => (p.type === undefined ? "" : typeWord(p.type)),
  healthForEachAllyMax: (p) =>
    `, +${p.amount} zdravia za každého spojenca ${p.area} (max. ${p.max})`,
  allPartyMembers: () => "Všetci členovia skupiny",
  allItsPartyMembers: () => "Všetci členovia jeho skupiny",
  allAlliedMinions: () => "Všetci spojeneckí prisluhovači",
  yourOtherMinions: () => "Tvoji ostatní prisluhovači",
  within2: (p) => `${p.Who} ${p.area ?? `v okruhu ${p.radius}`}`,
  adjacent: (p) => placed("Susední", "tesne vedľa", p.who),
  nearby: (p) => `${capitalize(p.who)} nablízku`,
  within3: (p) => (p.area === undefined ? `${p.Who} v okruhu ${p.radius}` : `${p.Who} ${p.area}`),
  loseThatSame: (p) => `stratia rovnaký ${CATEGORY[p.category].one}`,
  loseAllAll: (p) => `stratia všetky ${categoryNoun("all", p.category)}`,
  onThem: () => "na nich",
  loseOneForEachOnThem: (p) => `stratia ${CATEGORY[p.category].acc} za každý ${p.countEach}`,
  lose: (p) => `stratia ${p.count} ${categoryNoun(p.count2, p.category)}`,
  enchantmentAnA: (p) => (p.onlyBearing === undefined ? "" : CATEGORY[p.onlyBearing].one),
  with4: (p) => (p.onlyBearing === undefined ? "" : ` s ${CATEGORY[p.onlyBearing].one}`),
  usingSkills: (p) =>
    p.onlyUsing === undefined ? "" : `, ktorí používajú ${TYPE_STEM[p.onlyUsing]}`,
  dead: (p) => (p.dead === true ? `Mŕtvi ${p.living}` : p.living),
  targetAndCasterAroundYouCasterAround: (p) =>
    `${p.includesCentre === true ? `Cieľ a ${lowerFirst(p.reached)}` : p.reached}${p.around === "caster" ? " okolo teba" : ""}${p.alsoAround === "caster" ? " okolo cieľa a teba" : ""}${p.bearing}${p.using}${p.onlyIf}`,
  upTo3: (p) => `Až ${p.maxTargets} ${lowerFirst(p.who)}`,
  inItsRange: () => "v jeho dosahu",
  inTheArea: () => "v oblasti",
  foes: () => "nepriatelia",
  allEveryoneYouAndAlliesAllies: (p) =>
    p.affects === "all" ? "všetci" : p.includesCaster ? "ty a spojenci" : "spojenci",
  enemiesFoesAllEveryoneYouAndAllies: (p) => `${p.value} ${within(p.radius, p.radius2)}`,
  whenSprung: () => "pri spustení",
  after: (p) => `po ${seconds(p.delaySeconds)}`,
  everyFor: (p) => `každých ${seconds(p.everySeconds)}, po dobu ${seconds(p.count)}`,
  whenItEnds: (p) => `Keď skončí, ${p.whom}: `,
  springsByItselfAsItsTimeRuns: () => "Spustí sa sama, keď jej uplynie čas",
  composedWhoText: (p) => `${capitalize(p.who)}: ${lowerFirst(p.text)}`,
  composedEndingText: (p) => `${p.ending}${lowerFirst(p.text)}`,
  composedConditionText: (p) => `${p.condition}: ${lowerFirst(p.text)}`,
  itsAttacksDealDamage: (p) => `Jeho útoky spôsobujú ${p.magnitude} poškodenia`,
  thisSpiritLosesHealth: (p) => `tento duch stratí ${p.magnitude} zdravia`,
  composedCondition: (p) => `${lowerFirst(p.condition)}: `,
  itsAttacks: (p) => `Jeho útoky: ${p.when}${p.what}`,
  health3: (p) => `${p.health} zdravia`,
  health4: (p) => `${p.health} zdravia (${p.health2})`,
  level: (p) => `úroveň ${p.marked}, `,
  lastsSeconds: (p) => `, trvá ${p.durationSeconds} s`,
  composedCountNameLevelTextHealthTextLasts: (p) =>
    `${p.count} ${p.name} (${p.levelText}${p.healthText}${p.lasts})`,
  itsAttacksDealDamage2: (p) => `Jeho útoky spôsobujú ${p.value} poškodenia`,
  onlyOneAtATimeANew: () => "Len jeden naraz: nový zabije starého",
  leavesCorpseCorpsesWhenItDies: (p) =>
    `Pri smrti zanecháva ${p.corpses} ${byCount(p.current, "mŕtvolu", "mŕtvoly", "mŕtvol")}`,
  whenItDiesStandsUpInIts: (p) => `Keď zomrie, na jeho mieste povstane: ${p.text}`,
  listSemicolon: () => "; ",
  inItsRange2: (p) => AREA_TEXT.get(p.radius) ?? "v jeho dosahu",
  composedAffectsWhere: (p) => `${AURA_WHO[p.affects]} ${p.where}`,
  whenItDiesUnderHealthBeginFor: (p) =>
    `Keď zomrie, ${p.who} pod ${p.below} zdravia utrpia na ${p.duration} s: ${p.statusName}`,
  whenItDiesDeadPartyMembersAre: (p) =>
    `Keď zomrie, mŕtvi členovia skupiny ${p.where} sa oživia s ${p.health} % zdravia a bez energie`,
  damageTakeDamageAreHealedForHealth: (p) =>
    p.effect === "damage" ? `utrpia ${p.amount} poškodenia` : `sú vyliečení o ${p.amount} zdravia`,
  max: (p) => ` (max. ${p.max})`,
  whenItDiesPerSecondItLived: (p) =>
    `Keď zomrie: ${p.who} ${p.what} za každú sekundu, ktorú žil${p.max}`,
  everySecondsHealsTheMostHurtNon: (p) =>
    `Každých ${p.everySeconds} s: lieči najviac zraneného spojenca ${p.where}, ktorý nie je duch, o ${p.heal} zdravia`,
  whenANonSpiritDiesInIts: () => "Keď v jeho dosahu zomrie niečo, čo nie je duch",
  nearby2: (p) => AREA_TEXT.get(p.radius) ?? "nablízku",
  itsConditionsSpreadToEachNonSpirit: (p) =>
    `${p.when}, jeho neduhy prejdú na každého tvora ${p.where}, ktorý nie je duch a má neduh`,
  eachOfItsTypeInItsRange: (p) =>
    `${p.when}, každý tvor jeho druhu v jeho dosahu s menej než ${p.below} zdravia utrpí ${p.damage} poškodenia`,
  holdingAnItem: (p) => (p.onlyWhileHoldingItem ? ", ktorí držia predmet" : ""),
  composedWhoWhereHoldingStatus: (p) => `${p.who} ${p.where}${p.holding}: ${p.status}`,
  perFoeHit: (p) => (p.perTarget === undefined ? "" : " za každého zasiahnutého nepriateľa"),
  forEachMeleeAttackSkillOnYour: (p) =>
    ` za každú útočnú schopnosť na blízko na tvojej lište (najviac ${p.max})`,
  withinEarshot: (p) => p.area,
  forEverySummonedCreatureYouControlMaximum: (p) =>
    ` za každého privolaného tvora ${p.where} pod tvojou kontrolou (najviac ${p.max} energie)`,
  composedZeroAloneEachText: (p) => (p.zero ? `${p.alone} ${p.each}` : `${p.text}, +${p.each}`),
  maximum: (p) => ` (najviac ${p.max})`,
  forEach: (p) => `za každý ${p.countEach}${p.max}`,
  pointOfEnergyGained: () => "získaný bod energie",
  pointOfEnergyRestrictedByOvercast: () => "bod energie obmedzený prepätím",
  skillDisabledInThisWay: () => "takto zablokovanú schopnosť",
  orCasterOnYou: (p) =>
    `${categoryIds(p.categories)} ${p.on === "caster" ? "na tebe" : p.onTarget}`,
  ofYourRecharging: (p) => `tvojich dobíjajúcich sa: ${p.rechargingSkillsNoun}`,
  pointOfEnergyCasterYouHaveThey: (p) => `bod energie, ktorý ${p.on === "caster" ? "máš" : "má"}`,
  orRemoved: (p) => `odstránený ${categoryIds(p.categories)}`,
  orLost: (p) => `stratený ${categoryIds(p.categories)} (${p.name})`,
  enchantmentYouAreMaintaining: () => "očarovanie, ktoré udržiavaš",
  secondItWasInEffect: () => "sekundu, počas ktorej pôsobilo",
  foeKnockedDown: () => "zrazeného nepriateľa",
  youHaveEquipped: (p) => `${spaced(p.type)} na tvojej lište`,
  adrenalineSkillTheyHave: () => "adrenalínovú schopnosť, ktorú má",
  foeHit: () => "zasiahnutého nepriateľa",
  within4: (p) => `${p.perCountNoun} ${within(p.radius, p.radius2)}`,
  attacksSkillsS: (p) =>
    p.weapon !== undefined
      ? weaponAttacks(p.weapon)
      : p.type === undefined
        ? "schopnosti"
        : pluralNoun(spaced(p.type)),
  casterYourTargetS: (p) => (p.on === "caster" ? "tvoje" : "jeho"),
  s3: (p) => pluralNoun(p.perCountNoun),
  pointOfOvercast: () => "bod prepätia",
  skillDisabled: () => "zablokovaná schopnosť",
  rechargingSkill: () => "dobíjajúca sa schopnosť",
  pointOfEnergy: () => "bod energie",
  removedOr: (p) => `odstránené: ${categoryIds(p.categories)}`,
  removedOr2: (p) => `odstránené: ${categoryIds(p.categories)} (${p.name})`,
  maintainedEnchantment: () => "udržiavané očarovanie",
  secondHeld: () => "držaná sekunda",
  adrenalineSkill: () => "adrenalínová schopnosť",
  deadAlly: () => "mŕtvy spojenec",
  knockedDownFoeFoe: (p) => (p.knockedDown === true ? "zrazený nepriateľ" : "nepriateľ"),
  ally: () => "spojenec",
  neverAbove: (p) => `, nikdy nad ${p.upTo}`,
  forEachRemoved: (p) =>
    p.toTarget === true || p.perRemoved === undefined
      ? ""
      : ` za každý odstránený ${CATEGORY[p.perRemoved].one}`,
  perPointLost: (p) => (p.perEnergyLost === undefined ? "" : " za každý stratený bod"),
  armorPenetration: (p) => ` (${p.armorPenetration} % prieniku brnenia)`,
  dealsDamage2: (p) =>
    `Spôsobuje ${p.magnitude} ${damageNoun(p.type)}${p.perPointLost}${p.penetration}`,
  deals: () => "Spôsobuje",
  damage2: (p) => ` ${damageNoun(p.type)}`,
  composedCountedConditionAmount: (p) => `${p.counted}; ${lowerFirst(p.condition)}: +${p.amount}`,
  gainHealthEqualToThisSpellS: () =>
    "Získaj zdravie rovnajúce sa bonusu božskej priazne tohto kúzla",
  healsIfRelievedOf: (p) => `Lieči ${p.amount}, keď sa zbaví: ${p.name}`,
  healsForOfYourCurrentHealthMaximum: (p) =>
    `Lieči o ${p.magnitude} tvojho aktuálneho zdravia (najviac ${p.max} zdravia)`,
  youGainHealth: (p) => `Získaš ${p.amount} zdravia`,
  yourPetGainsHealth: (p) => `Tvoje zviera získa ${p.amount} zdravia`,
  ownerHealsItsOwnerForHealsFor: (p) =>
    p.recipient === "owner" ? `Lieči svojho pána o ${p.amount}` : `Lieči o ${p.amount}`,
  healsForEachRemovedHealsForEach: (p) =>
    p.perRemoved !== undefined
      ? `Lieči ${p.amount} za každý odstránený ${CATEGORY[p.perRemoved].one}`
      : p.perDestroyedSpirit === true
        ? `Lieči ${p.amount} za každého zničeného ducha`
        : p.perEnergyLost === true
          ? `${p.recipient === "caster" ? "Si vyliečený o" : "Lieči"} ${p.amount} za každý stratený bod energie`
          : p.perUsedSkillEnergy === true
            ? `Lieči o ${p.magnitude} energetickej ceny kúzla`
            : p.value,
  casterYouGainHeals: (p) => (p.recipient === "caster" ? "Získaš" : "Lieči"),
  health5: () => " zdravia",
  casterOnTargetFoeOnThem: (p) => (p.recipient === "caster" ? "na nepriateľskom cieli" : "na nich"),
  underHealth: (p) => `, pod ${p.onlyBelowHealthFraction} % zdravia`,
  gainOfTheSkillSBaseEnergy: (p) => `Získaj ${p.magnitude} základnej energetickej ceny schopnosti`,
  targetGainsOwnerYouGainGain: (p) =>
    p.toTarget === true ? "Cieľ dostane" : p.recipient === "owner" ? "Získaš" : "Získaj",
  energy5: (p) =>
    `${p.gains} ${p.magnitude} energie${p.perPointLost}${p.perFoeHit}${p.perOwnCreature}${p.perRemoved}`,
  energy6: () => " energie",
  gain2: () => "Získaj",
  onTargetFoe: () => "na nepriateľskom cieli",
  strikeStrikesOfAdrenalineAdrenaline: (p) =>
    p.units
      ? `${p.magnitude} ${byCount(p.current, "úder", "údery", "úderov")} adrenalínu`
      : `${p.magnitude} adrenalínu`,
  youGain2: () => "Získaš",
  targetTargetGainsGain: (p) => (p.recipient === "target" ? "Cieľ dostane" : "Získaj"),
  strikesOfAdrenaline: () => " úderov adrenalínu",
  targetRegainsAllEnergy: () => "Cieľ získa späť všetku energiu",
  casterYouLoseTargetLoses: (p) => (p.on === "caster" ? "Strácaš" : "Cieľ stráca"),
  energy7: (p) => `${p.who} ${p.magnitude} energie`,
  stealsUpToEnergy: (p) => `Kradne až ${p.magnitude} energie`,
  stealsUpToHealth: (p) => `Kradne až ${p.magnitude} zdravia`,
  youStealHealth: (p) => `Kradneš ${p.magnitude} zdravia`,
  youSacrificeOfYourMaximumHealth: (p) => `Obetuješ ${p.percentOfMax} % svojho maximálneho zdravia`,
  targetFoeLosesHealth: (p) => `Nepriateľský cieľ stráca ${p.magnitude} zdravia`,
  targetFoeLoses: () => "Nepriateľský cieľ stráca",
  youLoseHealth: (p) => `Strácaš ${p.magnitude} zdravia`,
  forEachEnchantmentRemoved: (p) => `${p.lose} za každé odstránené očarovanie (${p.whose})`,
  loseAllButHealth: (p) => `Strať všetko zdravie okrem ${p.magnitude}`,
  transferOfYourConditionsToFoes: (p) =>
    `Prenesie ${p.magnitude} tvojich neduhov na: ${p.foesWithin}`,
  max2: (p) => (p.maxSeconds === undefined ? "" : ` (max. ${seconds(p.maxSeconds)})`),
  withTheTimeEachHasLeft: () => "s časom, ktorý každému ostáva",
  withMoreTime: (p) => `s ${p.extend} % časom navyše${p.max}`,
  foesGetTheTargetSConditionsWith: (p) => `${p.foesWithin} dostanú neduhy cieľa, ${p.value}`,
  loseYourHealthHealForOfIt: (p) =>
    `Strať ${shareOfYourHealth(p.fractionOfCurrent)}; vylieč sa o ${p.magnitude} % z toho`,
  whoeverOfYouAndTargetFoeHas: () =>
    "Kto z vás dvoch (ty a nepriateľský cieľ) má viac zdravia, stratí polovicu rozdielu; druhý získa rovnako veľa",
  stacksOnceForEachOnThem: (p) => `. Sčíta sa raz za každý ${p.countEach}`,
  stacksOnceForEachOnThem2: (p) => p.status + p.value,
  forWord3: (p) => `na ${p.durationSeconds}: ${p.what}`,
  forEachHexRemoved: (p) => ` za každú odstránenú kliatbu (${p.name}))`,
  stackingOnceForEachOnThem: (p) => `, sčíta sa raz za každý ${p.countEach}`,
  appliesCasterToYouForUntilIt: (p) =>
    `Uvalí${p.on === "caster" ? " na teba" : ""}: ${p.statusName} ` +
    (p.ends ? `na ${p.statusDuration} ` : "kým neskončí ") +
    `(${p.status}` +
    p.value +
    p.value2,
  composedStatusNameDurationSeconds: (p) => `${p.statusName} (${p.durationSeconds})`,
  appliesOneOfAtRandom: (p) => `Náhodne uvalí jedno z: ${p.choices}`,
  maintainedCasterOnYouEnergyRegenerationWhile: (p) =>
    `Udržiavané${p.on === "caster" ? " na tebe" : ""}: −1 regenerácie energie, kým trvá. ` +
    `${capitalize(p.what)}.`,
  losesThatSame: (p) => `Stratí rovnaký ${CATEGORY[p.category].one}`,
  casterLoseRemoves: (p) => (p.from === "caster" ? "Strať" : "Odstráni"),
  oneForEachRemovedMax: (p) =>
    `${p.verb} ${CATEGORY[p.category].acc} za každý odstránený ${CATEGORY[p.category2].one} (max. ${p.max})`,
  oneForEachOnTarget: (p) => `${p.verb} ${CATEGORY[p.category].acc} za každý ${p.countEach}`,
  lose2: (p) => `Strať ${p.count} ${categoryNoun(p.count2, p.category)}${owned(p.whose)}`,
  endsTheTargetSStance: () => "Ukončí postoj cieľa",
  forEachSpiritWithinOfIt: (p) =>
    ` za každého ducha ${AREA_AROUND_TARGET.get(p.near) ?? `v okruhu ${p.near2} od cieľa`}`,
  numberUpTo: (p) => (typeof p.count === "number" && p.count > 1 ? "až " : ""),
  and4: (p) => (p.orCategory === undefined ? "" : ` a ${categoryNoun(p.count, p.orCategory)}`),
  removes: (p) =>
    `Odstráni ${p.upTo}${p.count} ${categoryNoun(p.count2, p.category)}${owned(p.whose)}${p.and}${p.perSpirit}`,
  interruptsTheTargetSSpellIfThey: () => "Preruší kúzlo cieľa, ak nejaké zosiela",
  interruptsTheTargetSSpellOrChant: () => "Preruší kúzlo alebo spev cieľa, ak nejaké zosiela",
  skillInterruptsTheTargetSSkillIf: (p) =>
    p.only === "skill"
      ? "Preruší schopnosť cieľa, ak nejakú používa"
      : "Preruší akciu cieľa: schopnosť alebo útok",
  youAreKnockedDownFor: (p) => `Si zrazený k zemi na ${seconds(p.durationSeconds)}`,
  knocksDownFor: (p) => `Zrazí k zemi na ${seconds(p.durationSeconds)}`,
  shadowStepsToTheTarget: () => "Krokom tieňom sa presunie k cieľu",
  youAndTheTargetShadowStepTo: () => "Ty a cieľ si krokom tieňom vymeníte miesta",
  corpseTeleportsYouToThatCorpseShadow: (p) =>
    p.to === "corpse"
      ? "Teleportuje ťa k tej mŕtvole"
      : "Krokom tieňom sa presunie na blízke miesto priamo od tvojho cieľa",
  health6: (p) => `${p.percent} % zdravia`,
  upToYourCurrentHealthYourHealth: (p) =>
    p.casterLosesFractionOfCurrent === 0
      ? "najviac tvoje aktuálne zdravie"
      : `tvoje zdravie po strate ${shareOfYourHealth(p.casterLosesFractionOfCurrent)}`,
  perPartyMemberWithin: (p) => ` za každého člena skupiny ${within(p.radius, p.radius2)}`,
  casterAndTeleportsTheTargetToYou: (p) => (p.at === "caster" ? " a teleportuje cieľ k tebe" : ""),
  returnsTheTargetToLifeWithAnd: (p) =>
    `Oživuje cieľ s ${p.healthText} a ${p.energy} % energie${p.per}${p.teleport}`,
  returnsEveryDeadAlliedPetToLife: (p) =>
    `Oživí každé mŕtve spojenecké zviera ${p.where} s ${p.health} % zdravia`,
  youLoseAllYourRemainingEnergy: () => "Strácaš všetku zostávajúcu energiu",
  youGainFor: (p) => `Získaš ${p.statusName} na ${seconds(p.durationSeconds)} (${p.status})`,
  yourPetGainsFor: (p) => `Tvoje zviera získa ${p.statusName} na ${p.duration} (${p.status})`,
  yourPetMovesToYourTargetAnd: () => "Tvoje zviera beží k tvojmu cieľu a zaútočí naň",
  teleportsTargetToYou: () => "Teleportuje cieľ k tebe",
  destroysTargetAlliedSpirit: () => "Zničí cieľového spojeneckého ducha",
  destroysTargetMinion: () => "Zničí cieľového prisluhovača",
  nearestSpiritLosesHealthTargetAllyIs: (p) =>
    `Najbližší duch stratí ${p.magnitude} zdravia; cieľový spojenec je za každý bod vyliečený o ${p.healPerPoint}`,
  nearestSpiritLosesAllEnergyYouGain: (p) =>
    `Najbližší duch stratí všetku energiu; získaš ${p.magnitude} % z nej`,
  itsOwnerGainsHealthEqualToThe: () => "Jeho pán získa zdravie rovné spôsobenému poškodeniu",
  destroysEveryAlliedSpiritWithin: (p) =>
    `Zničí každého spojeneckého ducha ${within(p.radius, p.radius2)}`,
  thisSkillRecharges: () => "Táto schopnosť sa dobije o",
  secondsFaster: () => " s rýchlejšie",
  thisSkillRechargesInstantly: () => "Táto schopnosť sa dobije okamžite",
  thisSkillRechargesFaster: (p) => `Táto schopnosť sa dobije o ${p.fraction} % rýchlejšie`,
  usedSkillThatSkillRechargesInstantlyThis: (p) =>
    p.of === "used-skill" ? "Tá schopnosť sa dobije okamžite" : "Táto schopnosť sa dobije okamžite",
  loseAllAdrenaline: () => "Strať všetok adrenalín",
  rechargesAllYourOtherSkills: () => "Dobije všetky tvoje ostatné schopnosti",
  rechargesAllYourStances: () => "Dobije všetky tvoje postoje",
  rechargesAllYourOtherSkills2: (p) =>
    `Dobije všetky tvoje ostatné schopnosti (${p.which === "attack" ? "útok" : p.which === "signet" ? "pečať" : p.which})`,
  rechargesAllYour: (p) => `Dobije všetky tvoje: ${p.rechargedKind}`,
  allOfYourSpiritsDie: () => "Všetci tvoji duchovia zomrú",
  summonsPlusOnePerCorpseExploited: (p) =>
    `Privolá ${p.text}` +
    (p.perExploitedCorpse === true ? ", navyše jedného za každú vyčerpanú mŕtvolu" : ""),
  setsATrap: () => "Nastraží pascu",
  pulseTargetCreatesASymbolMarksThe: (p) =>
    p.kind === "pulse"
      ? p.anchor === "target"
        ? "Vytvorí symbol"
        : "Označí zem"
      : p.anchor === "corpse"
        ? "Vytvorí studňu"
        : "Vytvorí ochranný kruh",
  forSeconds: (p) => `${p.what} ${p.where} na ${p.magnitude} s`,
  seconds3: (p) => `${p.magnitude} s`,
  forEachSignetYouHaveEquipped: (p) => (p.perOwnSignet === true ? " za každú pečať na lište" : ""),
  allOfTheTargetSSkillsAre: (p) => `Všetky schopnosti cieľa sú na ${p.time} zablokované`,
  theTargetSEliteSkillIsDisabled: (p) => `Elitná schopnosť cieľa je na ${p.time} zablokovaná`,
  oneOfTheTargetSSpellsAt: (p) => `Jedno náhodné kúzlo cieľa je na ${p.time} zablokované`,
  allOfTheTargetSAttackSkills: (p) => `Všetky útočné schopnosti cieľa sú na ${p.time} zablokované`,
  theInterruptedSkillIsDisabledFor: (p) =>
    `Prerušená schopnosť je na ${p.time} zablokovaná${p.perSignet}`,
  centreInterruptedHoldingThatSkillHaveIt: (p) =>
    p.which === "centre-interrupted"
      ? `ktorí majú túto schopnosť, majú ju na ${p.time} zablokovanú`
      : `Táto schopnosť a všetky schopnosti rovnakého atribútu sú na ${p.time} zablokované`,
  thisSkillBecomesTheOneYouRemoved: (p) =>
    `Táto schopnosť sa na ${p.seconds} s stane tou, ktorú si odstránil`,
  thisSkillBecomesThatRandomSpellSpell: (p) =>
    `Táto schopnosť sa na tento čas stane ${p.which === "random-spell" ? "tým kúzlom" : "tou schopnosťou"}`,
  thisSkillBecomesItsTargetSNon: (p) =>
    `Táto schopnosť sa na ${p.magnitude} s stane elitnou schopnosťou cieľa, ktorá nie je podoba`,
  takeControlOfTargetEnemySpirit: () => "Prevezmi kontrolu nad nepriateľským duchom v cieli",
  becomeYourMinionsWhileYouBear: (p) => `Stanú sa tvojimi prisluhovačmi, kým nesieš ${p.name}`,
  targetMinionWithAMasterBecomesMasterless: (p) =>
    `Cieľový prisluhovač s pánom sa stane bezpánskym; bezpánsky sa stane tvojím a je vyliečený o ${p.magnitude} zdravia`,
  leadCountsAsALeadAttackCounts: (p) =>
    p.role === "lead" ? "Počíta sa ako úvodný útok" : "Počíta sa ako útok druhou rukou",
  targetSuffersOvercast: (p) => `Cieľ utrpí ${p.magnitude} prepätia`,
  thisSkillThisSkillThatSkill: (p) => (p.of === "this-skill" ? "Táto schopnosť" : "Tá schopnosť"),
  forEachRemoved2: (p) =>
    p.perRemoved === undefined ? "" : ` za každý odstránený ${CATEGORY[p.perRemoved].one}`,
  takesSecondsLongerToRecharge: (p) => `${p.which} sa dobíja o ${p.magnitude} s dlhšie${p.each}`,
  that: (p) => `, ktorí ${p.onlyIf}`,
  ifItStrikesAFoe: (p) => `Ak zasiahne nepriateľa${p.whom}: ${lowerFirst(p.text)}`,
  from: (p) => `${p.text} od ${genitive(p.from)}`,
  takeDamageForEachPointOfEnergy: (p) =>
    `utrpia ${p.amount} ${damageNoun(p.type)}` +
    (p.perEnergyLost === undefined ? "" : " za každý stratený bod energie"),
  areInterruptedAreInterruptedIfCasting: (p) =>
    p.only === undefined ? "sú prerušení" : "sú prerušení, ak práve zosielajú",
  areKnockedDownForS: (p) => `sú zrazení k zemi na ${p.durationSeconds} s`,
  foesFoeCreaturesGain: (p) =>
    p.hits === "foes" || p.hits === "foe-creatures" ? p.suffered : `získajú ${p.sufferedWhat}`,
  gainHealthEqualToThisSpellS2: () =>
    "získajú zdravie rovnajúce sa bonusu božskej priazne tohto kúzla",
  gain3: (p) => {
    const amount = lowerFirst(p.text).replace(/^lieči (?:o |za )?/, "");
    return `získajú ${amount.includes("zdrav") ? amount : `${amount} zdravia`}`;
  },
  gainHealth: (p) => `získajú ${p.amount} zdravia`,
  loseHealth: (p) => `stratia ${p.amount} zdravia`,
  youFromEach: (p) => `${lowerFirst(p.text).replace(/^kradne /, "kradneš ")} od každého`,
  transferAllTheirConditionsToYou: () => "prenes všetky ich neduhy na seba",
  resurrect: (p) =>
    p.kind === "resurrect"
      ? lowerFirst(p.text).replace(/^oživuje cieľ/, "sú oživení")
      : lowerFirst(p.text),
  and5: (p) => (p.length === 0 ? (p.last ?? "") : `${p.parts} a ${p.last2}`),
  perAlliedMinionsOwnMinionsMinionOne: (p) =>
    `; ${lowerFirst(p.text)} za každého ${p.hits === "allied-minions" || p.hits === "own-minions" ? "prisluhovača" : "cieľa"}`,
  per: (p) => ` za každý ${counted(p.perCountNoun)}`,
  damage3: (p) => `${p.amount} ${damageNoun(p.type)}${p.each}`,
  healHealsEnergy: (p) =>
    p.kind === "heal" ? `lieči ${p.amount}${p.each}` : `+${p.amount} energie${p.each}`,
  drainsEnergy: (p) => `odčerpáva ${p.magnitude} energie`,
  stealsEnergy: (p) => `kradne ${p.magnitude} energie`,
  stealsHealth: (p) => `kradne ${p.magnitude} zdravia`,
  resurrectsEnergy: (p) => `oživuje, ${p.energy} % energie`,
  resurrectsHealth: (p) => `oživuje, ${p.health} % zdravia`,
  resurrectsPetsHealth: (p) => `oživuje zvieratá, ${p.health} % zdravia`,
  healsOfYourHealth: (p) => `lieči ${p.percent} % z ${shareOfYourHealth(p.fractionOfCurrent)}`,
  balancesHealthWithTargetFoe: () => "vyrovnáva zdravie s nepriateľským cieľom",
  allUpTo: (p) => (p.current === p.Infinity ? "všetky" : `až ${p.moving}`),
  andFoesWithinOfIt: (p) =>
    ` a nepriatelia ${AREA_AROUND_TARGET.get(p.copyToFoesWithin) ?? `v okruhu ${p.copyToFoesWithin2} od cieľa`}`,
  withOfTheirRemainingDurations: (p) => ` s ${p.durationMultiplier} % zostávajúceho trvania`,
  movesConditionsFromFoesWithinOfIt: (p) =>
    `Presunie ${p.count} neduhy${p.lasting} z nepriateľov ${AREA_AROUND_TARGET.get(p.foesWithin) ?? `v okruhu ${p.foesWithin2} od cieľa`} na cieľ`,
  casterMovesOfYourConditionsToThe: (p) =>
    p.from === "caster"
      ? `Presunie ${p.count === "všetky" ? "všetky tvoje" : `${p.count} tvojich`} neduhy${p.lasting} na cieľ${p.copies}`
      : `Presunie ${p.count} neduhy cieľa${p.lasting} na teba`,
  youAreHealedForForEach: (p) => `${p.moves}; za každý neduh si vyliečený o ${p.magnitude}`,
  areDisabledForSeconds: (p) => `sú na ${p.seconds} s zablokované`,
  allOfYourSkills: (p) => `Všetky tvoje schopnosti ${p.time}`,
  allOfYourOtherSkills: (p) => `Všetky tvoje ostatné schopnosti ${p.time}`,
  allOfYourOtherNonAttackSkills: (p) => `Všetky tvoje ostatné neútočné schopnosti ${p.time}`,
  allOfYourOtherAttackSkillsYour: (p) =>
    p.exceptWeapon === undefined
      ? `Všetky tvoje ostatné útočné schopnosti ${p.time}`
      : `Tvoje útočné schopnosti okrem: ${WEAPON_WORD[p.exceptWeapon]} ${p.time}`,
  allOfYourNonAttackSkills: (p) => `Všetky tvoje neútočné schopnosti ${p.time}`,
  s4: (p) => pluralNoun(typeName(p.type)),
  yourAnd: (p) => `Tvoje ${p.types} ${p.time}`,
  allOfYourSpells: (p) => `Všetky tvoje kúzla ${p.time}`,
  allOfYourOther: (p) => `Všetky tvoje ${p.others ? "ostatné " : ""}${p.name} ${p.time}`,
  exceptAnd: (p) => (p.length === 0 ? "" : ` okrem ${p.except}`),
  allOfYourNonSkills: (p) => `Všetky tvoje schopnosti okrem: ${p.name}${p.exceptText} ${p.time}`,
  yourWholeParty: () => "Celá tvoja skupina",
  composedAffectsWhere2: (p) => `${AREA_WHO[p.affects]} ${p.where}`,
  radius: (p) => `polomer ${p.radius}`,
  andAroundYou: (p) =>
    `${TARGET_TEXT[p.target]} a ${lowerFirst(AREA_WHO[p.affects])} ${p.where} okolo teba`,
  range: (p) => `dosah ${p.range}`,
  upTo4: (p) => `až ${p.maxTargets} ${p.who}`,
  withinOfIt: (p) => AREA_AROUND_TARGET.get(p.radius) ?? `v okruhu ${p.radius2} od cieľa`,
  and6: (p) => `${TARGET_TEXT[p.target]} a ${p.count} ${p.where}`,
  rangeRadius: (p) => `dosah ${p.range}, polomer ${p.radius}`,
  free: () => "Zdarma",
  adrenaline: (p) => `${p.amount} adrenalínu`,
  composedAmount: (p) => ` (${p.amount})`,
  energy8: (p) => `${p.cost} energie${p.base}${p.overcast}`,
  overcast: (p) => `, ${p.overcast} prepätia`,
  instant: () => "Okamžite",
  composedActivationBase: (p) => (p.activation === p.base ? p.base : `${p.activation} (${p.base})`),
  dealsNoDamage: () => "Nespôsobuje žiadne poškodenie",
  dealsOnlyDamageDamage: (p) =>
    p.weaponless
      ? `Spôsobuje len ${p.bonus} ${damageOf(p.damageType)}`
      : `+${p.bonus} ${damageOf(p.damageType)}`,
  damage4: (p) => `${p.condition}: +${p.more} poškodenia`,
  damageOnThem: (p) => `+${p.amount} poškodenia ${p.perCount}`,
  cannotBeBlocked2: () => "Nemožno zablokovať",
  cannotBeBlocked3: (p) => `${p.condition}: nemožno zablokovať`,
  chanceToMissWithOrLess: (p) => `${p.chance} % šanca minúť pri ${p.name} ${p.rank} alebo menej`,
  resultsInACriticalHit: () => "Spôsobí kritický zásah",
  resultsInACriticalHit2: (p) => `${p.condition}: spôsobí kritický zásah`,
  hitsUpToAdjacentFoesToo: (p) => `Zasiahne aj až ${p.cleaveTargets} nepriateľov tesne vedľa`,
  hitsEveryAdjacentFoe: (p) => `${p.condition}: zasiahne každého nepriateľa tesne vedľa`,
  armorPenetration2: (p) => `${p.armorPenetration} % prieniku brnenia`,
  ifBlocked: (p) => `Ak je zablokovaný: ${lowerFirst(p.text)}`,
  onACriticalHit: (p) => `Pri kritickom zásahu: ${lowerFirst(p.text)}`,
  ifItFailsToHit: (p) => `Ak nezasiahne: ${lowerFirst(p.text)}`,
  asItIsUsed: (p) => `Pri použití: ${lowerFirst(p.text)}`,
  allYourPreparationsAreRemoved: () => "Všetky tvoje prípravy sú odstránené",
  fliesAsFast: (p) => `Letí ${p.multiplier}× rýchlejšie`,
  fliesAsFast2: (p) => `${p.condition}: letí ${p.multiplier}× rýchlejšie`,
  only: (p) => `; ${lowerFirst(p.condition)}, len 1`,
  eachDealingLessDamage: (p) => `, z ktorých každý spôsobuje o ${p.value} % menej poškodenia`,
  strikesTwice: () => "Udrie dvakrát",
  strikesTimes: (p) => `Udrie ${p.count}-krát`,
  shootsArrowsAtOnce: (p) => `Vystrelí ${p.count} šípy naraz${p.weaker}${p.fewer}`,
  whileActivating: (p) => `Počas aktivácie: ${p.status}`,
  easilyInterrupted: () => "Ľahko sa preruší",
  failureChanceWithOrLess: (p) =>
    `${p.chance} % šanca zlyhania pri ${p.name} ${p.rank} alebo menej`,
  activatesFasterSlower: (p) =>
    `${p.condition}: aktivuje sa o ${p.value} % ${p.multiplier < 1 ? "rýchlejšie" : "pomalšie"}`,
  healthGainFromDivineFavorIsDoubled: () => "Zisk zdravia z božskej priazne je dvojnásobný",
  projectilesEachCanBeDodged: (p) => `${p.shots} striel: každej sa dá uhnúť`,
  aProjectileAtEachFoeEachCan: (p) =>
    p.spread === true
      ? "Jedna strela na každého nepriateľa: každej sa dá uhnúť"
      : "Strela: dá sa jej uhnúť",
  halfTheNormalRange: () => "Polovičný normálny dosah",
  orSacrificesHealthIfNoneIsNear: (p) =>
    `, alebo obetuje ${p.elseSacrificePercent} % zdravia, ak žiadna nie je nablízku`,
  targetExploitsTheCorpseNearestYourTarget: (p) =>
    (p.near === "target"
      ? "Vyčerpá mŕtvolu najbližšie k tvojmu cieľu"
      : p.all === true
        ? `Vyčerpá každú čerstvú mŕtvolu ${within(p.radius, p.radius2)}`
        : p.pick === "random"
          ? "Vyčerpá náhodnú mŕtvolu"
          : "Vyčerpá najbližšiu mŕtvolu") + p.value,
  whileOnYourBarAHealthFights: (p) =>
    `Kým je na tvojej lište, po tvojom boku bojuje ${p.name} (${p.companionHealth} zdravia)`,
  disabledForAfterUse: (p) => `Po použití zablokované na ${seconds(p.disabledAfterUseSeconds)}`,
  takeAllConditionsFromYourAlliesWith: () =>
    "Prevezmi všetky neduhy svojich spojencov s časom, ktorý im ostáva",
  hitOrMiss: (p) => `${p.text}, či zasiahne, alebo nie`,
  eliteFlash: (p) =>
    capitalize(
      `${p.elite ? ADJ_ELITE[p.type] : ""}${p.flash ? ADJ_FLASH[p.type] : ""}${TYPE_TEXT[p.type]}`.toLowerCase(),
    ),
  moraleBoost: (p) =>
    p.rechargesOnMoraleBoost === true ? "Posila morálky" : seconds(p.rechargeSeconds),
  hexHexesS2: (p) => pluralNoun(p.kind),
} satisfies DescribeWords as DescribeWords;
