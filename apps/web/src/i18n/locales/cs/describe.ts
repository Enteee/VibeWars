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

/** Czech has no capitalised nouns: a line continues with its first letter in lower case. */
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

type Gender = "m" | "f" | "n";

interface CategoryForms {
  readonly one: string;
  readonly acc: string;
  readonly instr: string;
  readonly many: string;
  readonly gen: string;
  readonly gender: Gender;
}

const CATEGORY: Record<Category, CategoryForms> = {
  condition: {
    one: "stav",
    acc: "stav",
    instr: "stavem",
    many: "stavy",
    gen: "stavů",
    gender: "m",
  },
  hex: {
    one: "prokletí",
    acc: "prokletí",
    instr: "prokletím",
    many: "prokletí",
    gen: "prokletí",
    gender: "n",
  },
  enchantment: {
    one: "očarování",
    acc: "očarování",
    instr: "očarováním",
    many: "očarování",
    gen: "očarování",
    gender: "n",
  },
  stance: {
    one: "postoj",
    acc: "postoj",
    instr: "postojem",
    many: "postoje",
    gen: "postojů",
    gender: "m",
  },
  preparation: {
    one: "příprava",
    acc: "přípravu",
    instr: "přípravou",
    many: "přípravy",
    gen: "příprav",
    gender: "f",
  },
  glyph: { one: "glyf", acc: "glyf", instr: "glyfem", many: "glyfy", gen: "glyfů", gender: "m" },
  shout: {
    one: "pokřik",
    acc: "pokřik",
    instr: "pokřikem",
    many: "pokřiky",
    gen: "pokřiků",
    gender: "m",
  },
  chant: { one: "zpěv", acc: "zpěv", instr: "zpěvem", many: "zpěvy", gen: "zpěvů", gender: "m" },
  echo: {
    one: "ozvěna",
    acc: "ozvěnu",
    instr: "ozvěnou",
    many: "ozvěny",
    gen: "ozvěn",
    gender: "f",
  },
  "weapon-spell": {
    one: "kouzlo zbraně",
    acc: "kouzlo zbraně",
    instr: "kouzlem zbraně",
    many: "kouzla zbraní",
    gen: "kouzel zbraní",
    gender: "n",
  },
  item: {
    one: "předmět",
    acc: "předmět",
    instr: "předmětem",
    many: "předměty",
    gen: "předmětů",
    gender: "m",
  },
  form: {
    one: "podoba",
    acc: "podobu",
    instr: "podobou",
    many: "podoby",
    gen: "podob",
    gender: "f",
  },
  "skill-effect": {
    one: "efekt dovednosti",
    acc: "efekt dovednosti",
    instr: "efektem dovednosti",
    many: "efekty dovedností",
    gen: "efektů dovedností",
    gender: "m",
  },
};

/** Category ids that reach a sentence raw, joined with this file's own "nebo". */
function categoryIds(text: string): string {
  return text.replace(
    /\b(skill-effect|weapon-spell|condition|hex|enchantment|stance|preparation|glyph|shout|chant|echo|item|form)\b/g,
    (id) => CATEGORY[id as Category].one,
  );
}

/** Czech counts in three forms: 1 stav, 2 stavy, 5 stavů. */
function categoryNoun(count: number | "all", category: Category): string {
  const forms = CATEGORY[category];
  if (count === "all") {
    return forms.many;
  }
  if (count === 1) {
    return forms.acc;
  }
  return count >= 2 && count <= 4 ? forms.many : forms.gen;
}

function aCategory(category: Category): string {
  return CATEGORY[category].acc;
}

const NO_OTHER: Record<Gender, { readonly no: string; readonly other: string }> = {
  m: { no: "žádný", other: "jiný" },
  f: { no: "žádnou", other: "jinou" },
  n: { no: "žádné", other: "jiné" },
};

/** "žádný jiný stav", "žádnou jinou přípravu", "žádné jiné prokletí". */
function noOther(category: Category, other: string, noun: string): string {
  const { no, other: adjective } = NO_OTHER[CATEGORY[category].gender];
  return other === "" ? `${no} ${noun}` : `${no} ${adjective} ${noun}`;
}

const SKILL_NOUN: Readonly<Record<string, string>> = {
  attack: "útok",
  spell: "kouzlo",
  enchantment: "očarování",
  hex: "prokletí",
  signet: "pečeť",
  shout: "pokřik",
  stance: "postoj",
  preparation: "příprava",
  glyph: "glyf",
  chant: "zpěv",
  echo: "ozvěna",
  "weapon-spell": "kouzlo zbraně",
  "nature-ritual": "přírodní rituál",
  "binding-ritual": "poutací rituál",
  ward: "ochranné znamení",
  well: "studna",
  "item-spell": "kouzlo předmětu",
  trap: "past",
  "pet-attack": "útok zvířete",
  form: "podoba",
  skill: "dovednost",
  elite: "elitní dovednost",
};

/** A skill type id as its Czech noun; anything else passes as it came. */
function spaced(word: string): string {
  return SKILL_NOUN[word] ?? word.replaceAll("-", " ");
}

const PLURAL_ENDINGS: readonly (readonly [RegExp, string])[] = [
  [/elitní dovednost$/, "elitní dovednosti"],
  [/dovednost$/, "dovednosti"],
  [/útok zvířete$/, "útoky zvířete"],
  [/útok$/, "útoky"],
  [/kouzlo zbraně$/, "kouzla zbraní"],
  [/kouzlo předmětu$/, "kouzla předmětů"],
  [/kouzlo$/, "kouzla"],
  [/pečeť$/, "pečeti"],
  [/pokřik$/, "pokřiky"],
  [/postoj$/, "postoje"],
  [/příprava$/, "přípravy"],
  [/glyf$/, "glyfy"],
  [/zpěv$/, "zpěvy"],
  [/ozvěna$/, "ozvěny"],
  [/rituál$/, "rituály"],
  [/studna$/, "studny"],
  [/past$/, "pasti"],
  [/podoba$/, "podoby"],
  [/stav$/, "stavy"],
  [/bod energie$/, "body energie"],
  [/bod přepětí$/, "body přepětí"],
  [/sekunda$/, "sekundy"],
  [/mrtvý spojenec$/, "mrtví spojenci"],
  [/spojenec$/, "spojenci"],
  [/sražený nepřítel$/, "sražení nepřátelé"],
  [/nepřítel$/, "nepřátelé"],
  [/přisluhovač$/, "přisluhovači"],
  [/duch$/, "duchové"],
  [/deaktivovaná dovednost$/, "deaktivované dovednosti"],
  [/udržované očarování$/, "udržovaná očarování"],
  [/držená sekunda$/, "držené sekundy"],
];

/** A Czech noun's plural; those that do not change (prokletí, očarování) come back as they are. */
function pluralNoun(noun: string): string {
  for (const [ending, plural] of PLURAL_ENDINGS) {
    if (ending.test(noun)) {
      return noun.replace(ending, plural);
    }
  }
  return noun;
}

/** A plural after "z", "od" or "počet": the genitive its words take. */
function genitive(text: string): string {
  return text
    .replace(wholeWord("tvoji", "g"), "tvých")
    .replace(wholeWord("svoji", "g"), "svých")
    .replace(wholeWord("ostatní", "g"), "ostatních")
    .replace(wholeWord("nepřátelští", "g"), "nepřátelských")
    .replace(wholeWord("spojenečtí", "g"), "spojeneckých")
    .replace(wholeWord("mrtví", "g"), "mrtvých")
    .replace(wholeWord("sražení", "g"), "sražených")
    .replace(wholeWord("nepřátelé", "g"), "nepřátel")
    .replace(wholeWord("spojenci", "g"), "spojenců")
    .replace(wholeWord("přisluhovači", "g"), "přisluhovačů")
    .replace(wholeWord("duchové", "g"), "duchů")
    .replace(wholeWord("tvorové", "g"), "tvorů")
    .replace(wholeWord("členové", "g"), "členů")
    .replace(wholeWord("stavy", "g"), "stavů")
    .replace(wholeWord("kouzla", "g"), "kouzel")
    .replace(wholeWord("útoky", "g"), "útoků")
    .replace(wholeWord("dovednosti", "g"), "dovedností")
    .replace(wholeWord("postoje", "g"), "postojů")
    .replace(wholeWord("body", "g"), "bodů");
}

const DAMAGE_ADJECTIVE: Record<DamageKind, string> = {
  slashing: "sečné",
  piercing: "bodné",
  blunt: "drtivé",
  fire: "ohnivé",
  cold: "ledové",
  lightning: "bleskové",
  earth: "zemní",
  chaos: "chaotické",
  dark: "temné",
  holy: "svaté",
  shadow: "stínové",
  typeless: "",
};

function typeWord(type: DamageKind): string {
  return type === "typeless" ? "" : ` ${DAMAGE_ADJECTIVE[type]}`;
}

/** "ohnivé" as the genitive a number takes: "ohnivého". */
function adjectiveGenitive(adjective: string): string {
  return adjective.replace(/é$/, "ého").replace(/í$/, "ího");
}

/** A damage adjective said by `typeWord`, after a number: "ohnivého poškození", or plain "poškození". */
function damageOf(stem: string): string {
  const word = stem.trim();
  return word === "" ? "poškození" : `${adjectiveGenitive(word)} poškození`;
}

/** Damage counted: "63 ohnivého poškození". */
function damageCounted(type: DamageKind): string {
  return damageOf(DAMAGE_ADJECTIVE[type]);
}

/** Damage as a subject or object: "ohnivé poškození". */
function damageNoun(type: DamageKind): string {
  return type === "typeless" ? "poškození" : `${DAMAGE_ADJECTIVE[type]} poškození`;
}

/** Damage named by id, the two broad kinds being adjectives too. */
function damageNamed(type: DamageKind | "elemental" | "physical"): string {
  return type === "physical"
    ? "fyzické poškození"
    : type === "elemental"
      ? "elementární poškození"
      : damageNoun(type);
}

const NEEDED_WEAPON: Record<Weapon, string> = {
  axe: "sekeru",
  sword: "meč",
  hammer: "kladivo",
  daggers: "dýky",
  scythe: "kosu",
  spear: "kopí",
  bow: "luk",
  melee: "zbraň na blízko",
};

const WITH_WEAPON: Record<Weapon, string> = {
  axe: "sekerou",
  sword: "mečem",
  hammer: "kladivem",
  daggers: "dýkami",
  scythe: "kosou",
  spear: "kopím",
  bow: "lukem",
  melee: "zbraní na blízko",
};

/** How an attack is made: "útok sekerou", "útok zblízka". */
const WEAPON_WORD: Record<Weapon, string> = {
  axe: "sekerou",
  sword: "mečem",
  hammer: "kladivem",
  daggers: "dýkami",
  scythe: "kosou",
  spear: "kopím",
  bow: "lukem",
  melee: "zblízka",
};

/** "s" before most words, "se" before a word that starts with a like sound. */
function withWeapon(weapon: Weapon): string {
  const word = WITH_WEAPON[weapon];
  return `${/^[szšž]/.test(word) ? "se" : "s"} ${word}`;
}

function wielding(weapon: Weapon | undefined): string {
  return weapon === undefined
    ? ""
    : weapon === "daggers"
      ? " s dýkami v rukou"
      : ` ${withWeapon(weapon)} v ruce`;
}

function weaponAttacks(weapon: Weapon | undefined): string {
  return weapon === undefined ? "útoky" : `útoky ${WEAPON_WORD[weapon]}`;
}

function attackSkills(weapon: Weapon | undefined): string {
  return weapon === undefined ? "útočné dovednosti" : `útočné dovednosti ${WEAPON_WORD[weapon]}`;
}

/** "zasáhne úvodním útokem". */
const CHAIN_WITH: Record<ChainKind, string> = {
  lead: "úvodním útokem",
  "off-hand": "vedlejším útokem",
  dual: "dvojitým útokem",
};

/** "následuje po úvodním útoku". */
const CHAIN_AFTER: Record<ChainKind, string> = {
  lead: "úvodním útoku",
  "off-hand": "vedlejším útoku",
  dual: "dvojitém útoku",
};

const TYPE_TEXT: Words["typeText"] = {
  attack: "Útok.",
  spell: "Kouzlo.",
  enchantment: "Očarování.",
  hex: "Prokletí.",
  signet: "Pečeť.",
  shout: "Pokřik.",
  stance: "Postoj.",
  preparation: "Příprava.",
  glyph: "Glyf.",
  chant: "Zpěv.",
  echo: "Ozvěna.",
  "weapon-spell": "Kouzlo zbraně.",
  "nature-ritual": "Přírodní rituál.",
  "binding-ritual": "Poutací rituál.",
  ward: "Ochranné znamení.",
  well: "Studna.",
  "item-spell": "Kouzlo předmětu.",
  trap: "Past.",
  "pet-attack": "Útok zvířete.",
  form: "Podoba.",
  skill: "Dovednost.",
};

function typeName(type: SkillKind): string {
  return lowerFirst(TYPE_TEXT[type].replace(/\.$/, ""));
}

/** The words of a skill kind, its head noun first: "kouzlo Magie ohně". */
const HEAD_NOUN =
  /^(.*) (dovednost|kouzlo zbraně|kouzlo předmětu|kouzlo|útok zvířete|útok|očarování|prokletí|pečeť|pokřik|postoj|příprava|glyf|zpěv|ozvěna|přírodní rituál|poutací rituál|ochranné znamení|studna|past|podoba)$/;
const LEADING_ADJECTIVE = /^(?:elitní|adrenalinová|adrenalinové|primární|elementární)$/;

function compound(words: string): string {
  const said = words
    .replace(/\bprimary\b/g, "primární")
    .replace(/\belemental\b/g, "elementární")
    .trim();
  const match = HEAD_NOUN.exec(said);
  if (match === null) {
    return said;
  }
  const rest = (match[1] ?? "").trim().split(" ");
  const leading = rest.filter((word) => LEADING_ADJECTIVE.test(word));
  const others = rest.filter((word) => !LEADING_ADJECTIVE.test(word));
  const head = [...leading, match[2] ?? ""].join(" ");
  return others.length === 0 ? head : `${head} (${others.join(" ")})`;
}

/** A 3rd-person singular verb as the 2nd: "sešle" to "sešleš", "je" to "jsi". */
function verbToYou(verb: string): string {
  if (verb === "je") {
    return "jsi";
  }
  if (verb === "není") {
    return "nejsi";
  }
  return /[áíe]$/.test(verb) ? `${verb}š` : verb;
}

/** A phrase's leading verb, after any "se" or "si", changed by `change`. */
function changeFirstVerb(phrase: string, change: (verb: string) => string): string {
  return phrase.replace(/^((?:se |si )?)(\S+)/, (_, clitic: string, verb: string) => {
    return `${clitic}${change(verb)}`;
  });
}

function aboutYou(text: string): string {
  return text
    .replace(wholeWord("jeho", "g"), "tvoje")
    .replace(wholeWord("své", "g"), "tvoje")
    .replace(wholeWord("mu", "g"), "ti")
    .replace(wholeWord("jej", "g"), "tě");
}

/** "sešle kouzlo" said to its holder: "sešleš kouzlo". */
function secondPerson(phrase: string): string {
  return aboutYou(changeFirstVerb(phrase, verbToYou));
}

/** A subject placed before a phrase, its "se" staying second: "se nositel pohybuje". */
function subjectThen(subject: string, phrase: string): string {
  return phrase.startsWith("se ") ? `se ${subject} ${phrase.slice(3)}` : `${subject} ${phrase}`;
}

/** A `conditionText` with "cíl" made "ty", the verb following. */
function yourCondition(text: string): string {
  const match = /^Pokud (se )?cíl (.*)$/.exec(text);
  if (match === null) {
    return text;
  }
  return `Pokud ${match[1] ?? ""}${aboutYou(changeFirstVerb(match[2] ?? "", verbToYou))}`;
}

function negatedVerb(verb: string): string {
  if (verb === "je") {
    return "není";
  }
  if (verb === "není") {
    return "je";
  }
  if (verb === "nemá") {
    return "má";
  }
  return verb.startsWith("ne") ? verb.slice(2) : `ne${verb}`;
}

function negatedText(text: string): string {
  const match = /^Pokud (se )?(cíl |ty )?(.*)$/.exec(text);
  if (match !== null) {
    const clause = match[3] ?? "";
    const first = /^(\S+)(.*)$/.exec(clause);
    if (first !== null) {
      return `Pokud ${match[1] ?? ""}${match[2] ?? ""}${negatedVerb(first[1] ?? "")}${first[2] ?? ""}`;
    }
  }
  return `Kromě případu: ${lowerFirst(text)}`;
}

function share(fraction: number): string {
  return fraction === 0.5 ? "polovinu" : `${String(Math.round(fraction * 100))} %`;
}

/** `share`, then of what: "polovinu tvého zdraví", "25 % tvého zdraví". */
function shareOfYourHealth(fraction: number): string {
  return `${share(fraction)} tvého zdraví`;
}

function damageTaken(multiplier: number): string {
  if (multiplier === 2) {
    return "dvojnásobné";
  }
  if (multiplier === 0.5) {
    return "poloviční";
  }
  return `${String(Math.round(multiplier * 100))} %`;
}

const TRIGGER_WHEN: Words["triggerWhen"] = {
  "bearer-casts-spell": "sešle kouzlo",
  "bearer-attacks": "útočí",
  "bearer-attack-begins": "útočí",
  "bearer-uses-skill": "použije dovednost",
  "bearer-applies-hex": "uvalí prokletí",
  "bearer-hits": "zasáhne útokem",
  "bearer-fails-to-hit": "nezasáhne",
  "bearer-takes-physical-damage": "utrpí fyzické poškození",
  "bearer-takes-elemental-damage": "utrpí elementární poškození",
  "bearer-takes-damage": "utrpí poškození",
  "bearer-takes-damage-from-foe": "utrpí poškození nebo krádež života od nepřítele",
  "bearer-health-drops-below": "klesne poškozením pod hranici zdraví",
  "bearer-fatal-damage-negated": "odvrátí smrtelné poškození",
  "bearer-hit-by-attack": "je zasažen útokem nepřítele",
  "bearer-targeted-by-foe": "je cílem nepřátelského kouzla nebo útoku",
  "bearer-healed-by-skill": "je vyléčen dovedností",
  "bearer-blocks-melee": "zablokuje útok zblízka",
  "bearer-blocks-projectile": "zablokuje útok na dálku",
  "bearer-blocks": "blokuje",
  "bearer-interrupted": "je přerušen",
  "bearer-knocked-down": "je sražen k zemi",
  "bearer-sacrifices-health": "obětuje zdraví",
  "bearer-knockdown-prevented": "odvrátí sražení k zemi",
  "bearer-gains-hex-or-enchantment": "získá prokletí nebo očarování",
  "bearer-gains-enchantment": "získá očarování",
  "bearer-loses-enchantment": "ztratí očarování",
  "bearer-loses-condition": "ztratí stav",
  "bearer-creates-creature": "vytvoří tvora",
  "bearer-gains-condition": "získá nový stav",
  "bearer-chant-or-shout-ends": "má na sobě konec zpěvu nebo pokřiku",
  "bearer-energy-empty": "nemá energii",
  "bearer-energy-drops-empty": "klesne na 0 energie",
  "source-targets-bearer": "je cílem tvé dovednosti",
  "source-bearer-apart": "je daleko od tebe",
  "bearer-dies": "zemře",
  ends: "skončí",
  "ends-early": "skončí předčasně",
  expires: "vyprší",
};

/** A radius table in Czech: the radii are the game's, only the words change. */
function inCzech(
  table: ReadonlyMap<number, string>,
  czech: Readonly<Record<string, string>>,
): ReadonlyMap<number, string> {
  return new Map([...table].map(([radius, english]) => [radius, czech[english] ?? english]));
}

const AREA_TEXT = inCzech(EN_WORDS.areaText, {
  adjacent: "v sousedství",
  nearby: "poblíž",
  "in the area": "v oblasti",
  "in earshot": "v doslechu",
  "in compass range": "v dosahu kompasu",
});

const AREA_AROUND_TARGET = inCzech(EN_WORDS.areaAroundTarget, {
  "adjacent to it": "v sousedství cíle",
  "nearby it": "poblíž cíle",
  "in the area around it": "v oblasti kolem cíle",
  "in earshot of it": "v doslechu cíle",
});

const AREA_AROUND_CREATED = inCzech(EN_WORDS.areaAroundCreated, {
  "adjacent to that creature": "v sousedství toho tvora",
  "near that creature": "poblíž toho tvora",
  "in earshot of that creature": "v doslechu toho tvora",
});

const AURA_WHO: Words["auraWho"] = {
  all: "tvorové kromě duchů",
  allies: "spojenci kromě duchů",
  foes: "nepřátelé kromě duchů",
};

const AREA_WHO: Words["areaWho"] = {
  enemies: "Nepřátelé",
  allies: "Spojenci",
  all: "Všichni",
};

const SPLASH_SIDE: Words["splashSide"] = {
  foes: "nepřátelé",
  "foe-creatures": "nepřátelští tvorové",
  "foe-minions": "nepřátelští přisluhovači",
  allies: "spojenci",
  "non-spirit-allies": "spojenci kromě duchů",
  party: "členové skupiny",
  "own-spirits": "tvoji duchové",
  "own-minions": "tvoji ostatní přisluhovači",
  "allied-minions": "spojenečtí přisluhovači",
};

const TARGET_TEXT: Words["targetText"] = {
  self: "Ty sám",
  "single-enemy": "Nepřítel",
  "single-ally": "Spojenec",
  "single-other-ally": "Jiný spojenec",
  "single-any": "Libovolný cíl",
  "single-dead-ally": "Mrtvý spojenec",
  "allied-spirit": "Spojenecký duch",
  "enemy-spirit": "Nepřátelský duch",
  "enemy-minion": "Přisluhovač nepřítele",
  "own-minion": "Jeden z tvých přisluhovačů",
  "allied-minion": "Spojenecký přisluhovač",
  "allied-summoned-creature": "Spojenecký vyvolaný tvor",
  "single-ally-not-spirit": "Spojenec, který není duch",
  companion: "Tvé zvíře",
  "living-companion": "Tvé živé zvíře",
};

const TARGETS_WORDS: Words["targetsWords"] = {
  ally: "spojence",
  "other-ally": "jiného spojence",
  foe: "nepřítele",
};

const YOUR_NEXT_SKILL = "až příště použiješ dovednost";
const NEXT_SKILL = "až příště použije dovednost";
const DROPPED = "Efekt při upuštění";

function within(radius: number, radius2: string): string {
  return AREA_TEXT.get(radius) ?? `do ${radius2}`;
}

/** A profession before a noun: "prokletí (Mesmer)"; none says nothing. */
function owned(noun: string, whose: string): string {
  return whose.trim() === "" ? noun : `${noun} (${whose.trim()})`;
}

/** A block's answer that ends with its first: "až zablokuješ útok" as "pokud je to útok". */
function blockAnswer(text: string): string {
  return text.replace(/^příště, až (?:zablokuje|zablokuješ) (.+)$/, "pokud je to $1");
}

/** "Sousední nepřátelé", or after a possessive "Tvoji duchové v sousedství". */
function placed(adjective: string, after: string, who: string): string {
  return who.startsWith("tvoji") ? `${capitalize(who)} ${after}` : `${adjective} ${who}`;
}

const OTHER_SKILLS: Readonly<Record<string, string>> = { attack: "útočné", signet: "pečetní" };

/** The noun after "za": the words of a count, said with their "každý". */
function counted(text: string): string {
  return text.replace(/\b(enchantment|hex|condition)\b/g, (word) => EACH_COUNTED[word] ?? word);
}

const EACH_COUNTED: Readonly<Record<string, string>> = {
  enchantment: "každé očarování",
  hex: "každé prokletí",
  condition: "každý stav",
};

/** "ohnivé" as the dative "proti" takes: "ohnivému". */
function adjectiveDative(adjective: string): string {
  return adjective.replace(/é$/, "ému").replace(/í$/, "ímu");
}

/** A damage kind as the instrumental "s" takes: "ohnivým". */
function adjectiveInstrumental(type: DamageKind): string {
  return DAMAGE_ADJECTIVE[type].replace(/é$/, "ým").replace(/í$/, "ím");
}

const ARMOR_KIND: Readonly<Record<string, string>> = {
  fyzické: "fyzickému",
  elementární: "elementárnímu",
};

/** Armour against a damage kind: "+10 brnění proti ohnivému poškození". */
function kindedArmor(text: string): string {
  return text.replace(/^(\S+) (\S+) brnění$/, (whole, amount: string, kind: string) => {
    const against =
      ARMOR_KIND[kind] ??
      (kind in DAMAGE_ADJECTIVE
        ? adjectiveDative(DAMAGE_ADJECTIVE[kind as DamageKind])
        : undefined);
    return against === undefined ? whole : `${amount} brnění proti ${against} poškození`;
  });
}

/** Attacks said after "tvými": "fyzickými útoky", "útočnými dovednostmi". */
function instrumentalPlural(text: string): string {
  return text
    .replace(wholeWord("fyzické"), "fyzickými")
    .replace(wholeWord("útočné"), "útočnými")
    .replace(wholeWord("dovednosti"), "dovednostmi");
}

/** Those a line reaches, as its object: "nepřátele", "spojence". */
function accusativePlural(text: string): string {
  return text
    .replace(wholeWord("Nepřátelé"), "nepřátele")
    .replace(wholeWord("nepřátelé"), "nepřátele")
    .replace(wholeWord("spojenci"), "spojence");
}

/** A count's noun after "za", with its "každý". */
function perCounted(text: string): string {
  const said = counted(text);
  return said.startsWith("každ") ? said : `každý ${said}`;
}

export default {
  capitalize,
  lowerAll: lowerFirst,
  spaced,
  typeName,
  typeFirstWord: (type) => typeName(type),
  blockAnswerWording: blockAnswer,
  loseWording: (text, fromSource, bearerIsFoe) =>
    text
      .replace(/^Cílový nepřítel ztratí/, fromSource ? "ztratíš" : bearerIsFoe ? "ztratí" : "ztrať")
      .replace(wholeWord("který má"), "který máš"),
  bearerWording: (text, bearerIsCaster) =>
    text
      .replace(/^Cíl získá/, "získá")
      .replace(/^Cíl ztratí/, bearerIsCaster ? "ztratíš" : "ztratí"),
  ifItWording: (text) =>
    text.replace(/^Pokud cíl/, "Pokud nositel").replace(/^Pokud se cíl/, "Pokud se nositel"),
  gainWording: (text) => {
    const amount = lowerFirst(text).replace(/^vyléčí /, "");
    return amount.includes("zdraví") ? amount : `${amount} zdraví`;
  },
  loseTargetWording: (text) => lowerFirst(text).replace(/^cíl ztratí/, "ztratí"),
  stealsWording: (text) => lowerFirst(text).replace(/^ukradne /, "ukradneš "),
  returnedWording: (text) => lowerFirst(text).replace(/^oživí cíl/, "jsou oživeni"),
  yourMinionsWording: (text) => text.replace(/^Tvoji ostatní přisluhovači/, "Tvoji přisluhovači"),
  onlyIfWording: (text) => {
    const match = /^Pokud (se )?cíl (.*)$/.exec(text);
    return match === null ? lowerFirst(text) : `pokud ${match[1] ?? ""}zasažený ${match[2] ?? ""}`;
  },
  splashOnlyClause: (condition) =>
    condition === ""
      ? ""
      : condition.startsWith("pokud ")
        ? `, ${condition}`
        : `, kteří ${condition}`,
  eachOfWording: (reached, condition) =>
    condition === ""
      ? reached
      : condition.startsWith("pokud ")
        ? `${reached}, ${condition}`
        : `${reached}, kteří ${condition}`,
  requiresWording: (text) => text.replace(/^Pokud /, "Jen pokud "),
  requirementWording: (text) =>
    text.startsWith("Pokud ") ? `jen ${lowerFirst(text)}` : lowerFirst(text),
  requirementLine: (text) => lowerFirst(text).replace(/\.$/, ""),
  anyOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Nikdy", ...rest.map((text) => text.replace(/^Pokud /, ""))].join(" nebo ");
  },
  allOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Vždy", ...rest.map((text) => text.replace(/^Pokud /, ""))].join(" a ");
  },
  seconds,
  blockedAttacks: { all: "útoky", melee: "útoky zblízka", projectile: "střely" },
  blockedAttack: { all: "útok", melee: "útok zblízka", projectile: "střelu" },
  damageTaken,
  triggerWhen: TRIGGER_WHEN,
  secondPerson,
  arrowsWhen: { "bearer-hits": "zasáhnou", "bearer-fails-to-hit": "nezasáhnou" },
  chantOrShoutEnds: "kdykoli na něm skončí zpěv nebo pokřik",
  energyEmpty: "když jeho energie klesne na 0",
  dropped: DROPPED,
  targetsWords: TARGETS_WORDS,
  nextSkill: NEXT_SKILL,
  yourNextSkill: YOUR_NEXT_SKILL,
  creates: "kdykoli vytvoříš tvora",
  areaAroundCreated: AREA_AROUND_CREATED,
  nextSkillKind: {
    "attack-skill": ["útočná dovednost", "útočné dovednosti"],
    spell: ["kouzlo", "kouzla"],
    hex: ["prokletí", "prokletí"],
    signet: ["pečeť", "pečeti"],
    "signet-at-foe": ["pečeť mířená na nepřítele", "pečeti mířené na nepřítele"],
    "shout-or-chant": ["pokřik nebo zpěv", "pokřiky nebo zpěvy"],
    any: ["dovednost", "dovednosti"],
  },
  lowerFirst,
  aCategory,
  negatedText,
  yourCondition,
  typeWord,
  splashSide: SPLASH_SIDE,
  auraWho: AURA_WHO,
  groundAnchorText: {
    caster: "na tvém místě",
    corpse: "na jejím místě",
    target: "na místě tvého cíle",
  },
  share,
  categoryNoun,
  weaponText: {
    axe: "Útok sekerou",
    sword: "Útok mečem",
    hammer: "Útok kladivem",
    daggers: "Útok dýkami",
    scythe: "Útok kosou",
    spear: "Útok kopím",
    bow: "Útok lukem",
    melee: "Útok zblízka",
  },
  chainRoleText: {
    lead: "Úvodní útok.",
    "off-hand": "Vedlejší útok.",
    dual: "Dvojitý útok.",
  },
  followsText: {
    lead: "Musí následovat po úvodním útoku.",
    "off-hand": "Musí následovat po vedlejším útoku.",
    dual: "Musí následovat po dvojitém útoku.",
  },
  neededWeapon: NEEDED_WEAPON,
  weaponWord: WEAPON_WORD,
  typeText: TYPE_TEXT,
  areaText: AREA_TEXT,
  areaAroundTarget: AREA_AROUND_TARGET,
  targetText: TARGET_TEXT,
  areaWho: AREA_WHO,
  s: () => " s",
  onTarget: () => "na cíli",
  composedLastsAtBase: (p) => (p.lasts === p.at ? p.base : `${seconds(p.lasts)} (${p.base})`),
  attributes: (p) => `atributy povolání ${p.name}`,
  attributes2: () => "atributy",
  attributePrimaryS: (p) => (p.scope === "primary" ? "primární atribut" : "elementární atributy"),
  setTo: (p) => `${p.scope} nastaveno na ${p.rank}`,
  allAttributes: () => "všechny atributy",
  toAllAllAttributes: (p) => `${p.amount} na ${p.value}`,
  renewedWheneverAChantOrShoutEnds: (p) =>
    `obnoví se, kdykoli na ${p.selfOnly ? "tobě" : "něm"} skončí zpěv nebo pokřik`,
  renewedWheneverYouCastItCastsA: (p) =>
    `obnoví se, kdykoli ${p.selfOnly ? "sešleš kouzlo" : "sešle kouzlo"}`,
  reappliedWheneverYouCastItCastsA: (p) =>
    `znovu se uplatní, kdykoli ${p.selfOnly ? "sešleš kouzlo na nepřítele" : "sešle kouzlo na nepřítele"}`,
  renewedWheneverYouTakeItTakesElemental: (p) =>
    `obnoví se, kdykoli ${p.selfOnly ? "utrpíš elementární poškození" : "utrpí elementární poškození"}`,
  renewedWheneverAnEnchantmentOnYouIt: (p) =>
    `obnoví se, kdykoli na ${p.selfOnly ? "tobě" : "něm"} skončí očarování`,
  gainAdrenalineFasterSlower: (p) =>
    `získává adrenalin o ${p.shown} ${p.faster > 0 ? "rychleji" : "pomaleji"}`,
  onTheBearerExpireFaster: (p) => `${p.what} na nositeli vyprší o ${p.stat} rychleji`,
  enchantmentsAndStances: () => "očarování a postoje",
  enchantments: () => "očarování",
  stances: () => "postoje",
  yourAttacksAgainstItHaveCriticalChance: (p) =>
    `tvoje útoky proti němu mají ${p.criticalChanceBonus} % šanci na kritický zásah`,
  armorAgainstYourAttacksWhileItHas: (p) =>
    `${p.armorModifier} brnění proti tvým útokům${p.onlyWhileNoOtherHex ? ", dokud nemá žádné jiné prokletí" : ""}`,
  youTheBearer: (p) => (p.selfOnly ? "tobě" : "nositeli"),
  endsIfYouEndsIfTheBearer: (p) =>
    p.selfOnly
      ? `končí, když ${secondPerson(p.phrase)}`
      : `končí, když ${subjectThen("nositel", p.phrase)}`,
  healthDegeneration: (p) => `−${p.healthPips} degenerace zdraví`,
  healthRegeneration: (p) => `+${p.healthPips} regenerace zdraví`,
  healthRegenerationForEachEnchantmentOnYou: (p) =>
    `+${p.pips} regenerace zdraví za každé očarování na tobě (nejvýše ${p.max})`,
  energyDegeneration: (p) => `−${p.energyPips} degenerace energie`,
  energyRegeneration: (p) => `+${p.energyPips} regenerace energie`,
  healthRegenerationForEachConditionOnYou: (p) =>
    `${p.healthPipsPerCondition} regenerace zdraví za každý stav na tobě`,
  health: () => "zdraví",
  hex: () => "každé prokletí",
  energy: () => "energie",
  condition: () => "každý stav",
  regenerationForEachOnYou: (p) => `${p.pips} regenerace (${p.what}) za ${p.each} na tobě`,
  armorWhileWielding: (p) => `${p.sign}${p.armorModifier} brnění${wielding(p.weapon)}`,
  armorWhileNotMoving: (p) => `${p.armorWhileStill} brnění, když se nehýbeš`,
  healthPerSecondWhileMoving: (p) => `${p.healthPerSecondWhileMoving} zdraví za sekundu při pohybu`,
  healthPerSecond: (p) => `+${p.healthPerSecond} zdraví za sekundu`,
  healthPerSecondMoreInEarshotOf: (p) =>
    `o ${p.healthPerSecondNearSpirit} zdraví za sekundu více v doslechu ducha`,
  spellsCastInEarshotOfASpirit: (p) =>
    `kouzla seslaná v doslechu ducha se obnovují o ${p.faster} % rychleji`,
  chanceToDoubleStrikeWhileWielding: (p) =>
    `+${p.chance} % šance na dvojitý úder${wielding(p.weapon)}`,
  armorNotBelow: (p) => `−${p.amount} brnění (ne pod ${p.floor})`,
  movesAtSpeed: (p) => `pohybuje se rychlostí ${p.speed} %`,
  movesAtSpeedWhileEnchanted: (p) => `pohybuje se rychlostí ${p.speed} %, dokud je očarován`,
  speedBoostsHaveNoEffect: () => "zrychlení nemá žádný účinek",
  cannotGainAdrenaline: () => "nemůže získat adrenalin",
  whenThisEndsYouReturnToWhere: () => "až to skončí, vrátíš se tam, kde jsi to seslal",
  whenThisEndsYouShadowStepTo: (p) =>
    `až to skončí, uděláš stínový krok ke spojenci, na kterého jsi to seslal, a všechny tvoje dovednosti budou ${p.seconds} s deaktivované`,
  ofAttacksMiss: (p) => `${p.attackMissChance} % útoků mine`,
  maximumHealthAtMost: (p) => `−${p.fraction} % maximálního zdraví (nejvýše ${p.cap})`,
  maximumHealth: (p) => `+${p.maxHealthBonus} maximálního zdraví`,
  maximumHealthPerEnchantment: (p) =>
    `+${p.maxHealthBonusPerEnchantment} maximálního zdraví za každé očarování`,
  maximumEnergy: (p) => `+${p.maxEnergyBonus} maximální energie`,
  maximumHealthPerPointOfMaximumEnergy: (p) =>
    `+${p.per} maximálního zdraví za každý bod maximální energie`,
  yourMinionsDealDamage: (p) => `tvoji přisluhovači způsobují ${p.minionDamageBonus} poškození`,
  loseMaximumHealthEachTimeAMinion: (p) =>
    `ztratí ${p.minionHitHealthLossPercent} % maximálního zdraví pokaždé, když jeden z tvých přisluhovačů zasáhne`,
  conditionsYouWouldReceiveGoToYour: () =>
    "stavy, které bys získal, přejdou místo toho na tvého nejbližšího přisluhovače",
  healing: (p) => `${p.more ? "+" : "−"}${p.change} léčení`,
  weaponDamage: (p) => `${p.change} % poškození zbraní`,
  dealsDamage: (p) => `způsobí ${p.more ? "+" : "−"}${p.change} poškození`,
  noDeathPenalty: () => "žádný trest za smrt",
  whenTheBearerDiesSoDoesIts: () => "když nositel zemře, zemře i jeho sesilatel",
  alliesYouResurrectReturnWithHealthAnd: (p) =>
    `spojenci, které oživíš, se vrátí s +${p.health} zdraví a +${p.energy} energie`,
  youDieTheBearerDiesWhenIt: (p) =>
    p.selfOnly ? "zemřeš, až to skončí" : "nositel zemře, až to skončí",
  leavesAnExploitedCorpse: () => "zanechá vytěženou mrtvolu",
  takeFromPhysicalDamage: (p) => `utrpí ${p.sign}${p.amount} z fyzického poškození`,
  elementalDamageTakenIsDamage: (p) =>
    `utrpěné elementární poškození je ${damageNoun(p.elementalDamageTakenAs)}`,
  physicalDamageTakenIsDamage: (p) =>
    `utrpěné fyzické poškození je ${damageNoun(p.physicalDamageTakenAs)}`,
  physicalDamageDealtIsDamage: (p) =>
    `způsobené fyzické poškození je ${damageNoun(p.physicalDamageDealtAs)}`,
  elementalDamageDealtIsDamage: (p) =>
    `způsobené elementární poškození je ${damageNoun(p.elementalDamageDealtAs)}`,
  takeFromSpiritsAttacks: (p) => `utrpí ${p.damageFromSpiritAttacks} z útoků duchů`,
  attacksAttacksDealDamage: (p) =>
    `${capitalize(weaponAttacks(p.weapon))} způsobují ${damageNoun(p.attackDamageType)}`,
  attacksHaveArmorPenetration: (p) => `útoky mají ${p.attackArmorPenetration} % průrazu brnění`,
  attacksAttacksDealLessMoreDamage: (p) =>
    `${capitalize(weaponAttacks(p.weapon))} způsobují o ${p.amount} ${p.delta < 0 ? "méně" : "více"} poškození`,
  and: () => " a ",
  immuneToAnd: (p) => `imunní vůči: ${p.names}`,
  setOnFire: () => "zapálen",
  or: () => " nebo ",
  cannotBeOr: (p) => `nemůže být ${p.names}`,
  attacksFromAttacks: (p) =>
    `${p.adrenalineGain}${p.adrenalineGainFasterFrom === "attacks" ? " z útoků" : ""}`,
  yourEliteEliteSkillSUse: (p) =>
    `tvoje ${p.skillType === "elite" ? "elitní dovednosti" : pluralNoun(spaced(p.skillType))} používají ${p.name}`,
  uses: (p) => `použití (${spaced(p.skillType)})`,
  sUse: (p) => `příštích ${p.uses} použití: ${pluralNoun(spaced(p.skillType))}`,
  yourNext: (p) => `příští ${p.next}: ${p.name}`,
  spellsTakeAsLongToCast: (p) => `sesílání kouzel trvá ${p.castTimeMultiplier}× déle`,
  skillsButAttacksTakeAsLongTo: (p) =>
    `aktivace dovedností kromě útoků trvá ${p.skillActivationMultiplier}× déle`,
  spellsAreInterruptedByAttacks: () => "útoky přerušují kouzla",
  slowerFaster: (p) => (p.attackDurationMultiplier > 1 ? "pomaleji" : "rychleji"),
  attacksWhileWielding: (p) => `útočí o ${p.change} % ${p.way}${wielding(p.weapon)}`,
  conditionsYouApplyLastLongerWhileWielding: (p) =>
    `stavy, které způsobíš, trvají o ${p.longer} % déle${wielding(p.weapon)}`,
  enchantmentsYouMaintainCostTheUpkeep: (p) =>
    `očarování, která udržuješ, stojí ${p.upkeepMultiplier}× víc na udržování`,
  spellsThatCauseOvercastCauseMoreAs: (p) =>
    `kouzla způsobující přepětí způsobí po dokončení o ${p.overcastSurcharge} více`,
  arrowsMoveAsFast: (p) => `šípy letí ${p.projectileSpeedMultiplier}× rychleji`,
  cannotCastSpells: () => "nemůže sesílat kouzla",
  cannotAttack: () => "nemůže útočit",
  cannotUseResurrectionSkills: () => "nemůže používat oživovací dovednosti",
  cannotBeTheTargetOfEnemySpells: (p) =>
    p.whileCasting
      ? "během sesílání nemůže být cílem nepřátelských kouzel"
      : "nemůže být cílem nepřátelských kouzel",
  cannotBeTheTargetOfSpells: () => "nemůže být cílem kouzel",
  hostileSpellsTargetingYouFail: () => "nepřátelská kouzla mířící na tebe selžou",
  attacksAgainstYouMiss: () => "útoky proti tobě minou",
  strippedOfAllEnchantmentsAndCannotBe: () => "ztrácí všechna očarování a nemůže být očarován",
  cannotBeTheTargetOfEnchantments: () => "nemůže být cílem očarování",
  cannotUseShoutsOrChants: () => "nemůže používat pokřiky ani zpěvy",
  cannotUseSignets: () => "nemůže používat pečeti",
  cannotBlockItsCasterSAttacks: () => "nemůže blokovat útoky svého sesilatele",
  cannotBeBlockedByBlindedFoes: () => "oslepení nepřátelé to nemohou zablokovat",
  cannotBlock: () => "nemůže blokovat",
  renewedForSecondsIfMovingAsIt: (p) =>
    `obnoví se na ${p.renewsWhileMoving} s, pokud se při skončení pohybuje`,
  cannotBeKnockedDown: () => "nemůže být sražen k zemi",
  cannotBeKnockedDownByAFoe: () => "nepřítel ho nemůže srazit k zemi",
  endsIfItPreventsAKnockdown: () => "končí, když odvrátí sražení k zemi",
  youDoNotSufferExtraDamageFrom: () => "neutrpíš dodatečné poškození z kritických útoků",
  cannotLandCriticalHits: () => "nemůže zasadit kritický zásah",
  immuneToCriticalHits: () => "imunní vůči kritickým zásahům",
  spellsHaveDoubleTheDivineFavorBonus: (p) =>
    `kouzla (${p.attribute}) mají dvojnásobný bonus Božské přízně`,
  attackSkillAttackSkills: (p) =>
    p.once
      ? p.attackSkillsOnly === true
        ? "útočnou dovednost"
        : { all: "útok", melee: "útok zblízka", projectile: "střelu" }[p.against]
      : p.attackSkillsOnly === true
        ? "útočné dovednosti"
        : { all: "útoky", melee: "útoky zblízka", projectile: "střely" }[p.against],
  whileBelowHealth: (p) => ` pod ${p.blockBelowHealth} % zdraví`,
  whileUnderOr: (p) => ` pod vlivem: ${p.value}`,
  fromFoesUnderOr: (p) => ` od nepřátel pod vlivem: ${p.value}`,
  whileAttacking: (p) => (p.blockWhileAttacking ? " při útoku" : ""),
  blocksTheNextChanceToBlock: (p) =>
    p.once
      ? `zablokuje příští ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`
      : `${p.chance} % šance zablokovat ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`,
  within: (p) => within(p.radius, p.radius2),
  alliesTo: (p) => `spojenci ${p.around} u ${p.bearer}: ${p.status}`,
  whileWielding: (p) => wielding(p.weapon),
  whileHoldingAWeaponOtherThan: (p) => ` se zbraní jinou než ${NEEDED_WEAPON[p.not]}`,
  againstFoesThatAreNotMoving: (p) =>
    p.criticalChanceBonusVersus === undefined ? "" : " proti nepřátelům, kteří se nehýbou",
  criticalChance: (p) => `${p.chance} % šance na kritický zásah${p.holding}${p.versus}`,
  gainEnergyPerCriticalHit: (p) => `získá ${p.energyPerCritical} energie za kritický zásah`,
  wheneverYouSuccessfullyLandACriticalHit: (p) =>
    `kdykoli zasadíš kritický zásah, získáš ${p.healthPerCritical} zdraví`,
  refreshesEveryTimeYouLandACritical: () => "obnoví se pokaždé, když zasadíš kritický zásah",
  theNextTimeYouLandACritical: (p) =>
    p.endsWhenFired ? "až příště zasadíš kritický zásah" : "pokaždé, když zasadíš kritický zásah",
  with: (p) => (p.weapon === undefined ? p.critical : `${p.critical} ${withWeapon(p.weapon)}`),
  removeStatusFromYourTarget: (p) =>
    p.kind === "remove-status"
      ? `${p.when}: ${lowerFirst(p.text)} z tvého cíle`
      : `${p.when}: ${lowerFirst(p.text)}`,
  ifOneIsRemovedYouLoseEnergy: (p) =>
    `pokud je jedno odstraněno, ztratíš ${p.energyIfRemoved} energie, nebo to skončí`,
  endsAfterIncomingAttackS: (p) =>
    `končí po ${p.endsAfterAttacks} ${p.endsAfterAttacks2 === 1 ? "příchozím útoku" : "příchozích útocích"}`,
  endsAfterYourNextAttackSHit: (p) =>
    p.endsAfterAttackCount2 === 1
      ? "končí po tvém příštím útoku, ať zasáhne, mine, nebo je zablokován"
      : `končí po tvých příštích ${p.endsAfterAttackCount} útocích, ať zasáhnou, minou, nebo jsou zablokovány`,
  noEffectWhileUnderOr: (p) => `žádný účinek pod vlivem: ${p.suppressedWhileUnder}`,
  yourNextAttackSCannotBeBlocked: (p) =>
    p.unblockableAttacks2 === 1
      ? "tvůj příští útok nelze zablokovat"
      : `tvoje příští ${p.unblockableAttacks} útoky nelze zablokovat`,
  attacksCannotBeBlocked: (p) => `${capitalize(weaponAttacks(p.weapon))} nelze zablokovat`,
  whileYouWieldAnAWeapon: (p) =>
    `dokud držíš zbraň s ${adjectiveInstrumental(p.weaponDamage)} poškozením, ${p.hit}`,
  forEachEnchantmentRemovedSCasterLoses: (p) =>
    `za každé odstraněné očarování (${p.name}) ztratí sesilatel kouzla ${p.name2} ${p.percentOfMax} % svého maximálního zdraví`,
  with2: (p) => (p.weapon === undefined ? "" : ` ${withWeapon(p.weapon)}`),
  endsAfterHitS: (p) => `končí po ${p.count} ${p.count2 === 1 ? "zásahu" : "zásazích"}${p.how}`,
  spellSpells: (p) => (p.one ? "kouzlo" : `${p.count} kouzla`),
  yourNextCostsCostLessEnergy: (p) =>
    `${p.one ? "příští" : "příštích"} ${p.next} ${p.one ? "stojí" : "stojí"} o ${p.costReduction} energie méně`,
  yourNextRechargesRechargeFaster: (p) =>
    `${p.one ? "příští" : "příštích"} ${p.next} se obnoví o ${p.rechargeFaster} % rychleji`,
  forYourNext: (p) => `na tvých příštích ${p.next}`,
  theirProjectilesMoveAsFast: (p) => `jejich střely letí ${p.projectileSpeedMultiplier}× rychleji`,
  noOvercast: () => "žádné přepětí",
  spreadsToAdjacentCombatants: () => "šíří se na sousední bojovníky",
  nextAttackSkillDamage: (p) => `příští útočná dovednost: ${p.condition}: +${p.more} poškození`,
  attacks: () => "útočí",
  makesAMeleeAttack: () => "provede útok zblízka",
  moves: () => "se pohybuje",
  takesDamage: (p) => `utrpí ${p.damageTakenMultiplier} poškození`,
  takesDamageFromTheNextAttack: (p) =>
    `utrpí z příštího útoku ${damageTaken(p.attackDamageTakenMultiplier)} poškození`,
  damageTaken2: (p) => `−${p.damageReduction} utrpěného poškození`,
  damageTakenPerRankOfAtMost: (p) =>
    `−${p.now} utrpěného poškození (${p.perRank} za úroveň ${p.attribute}, nejvýše ${p.max})`,
  damageTakenMoreEachHit: (p) =>
    `−${p.step} utrpěného poškození, o ${p.step} více s každým zásahem`,
  theNextHitDealsLessDamage: (p) =>
    `příští zásah způsobí o ${p.nextDamageReduction} poškození méně`,
  damageTakenWhileCastingS: (p) =>
    `−${p.amount} utrpěného poškození při sesílání: ${pluralNoun(spaced(p.skillType))}`,
  lessDamage: (p) => `o ${p.value} % méně ${damageCounted(p.type)}`,
  lessDamageFromFoesWithAHex: (p) =>
    `o ${p.fraction} % méně poškození od nepřátel s prokletím (${p.name})`,
  lessDamageFromFoesSufferingFrom: (p) =>
    `o ${p.fraction} % méně poškození od nepřátel postižených: ${p.name}`,
  damageTakenFromFoesWithLessHealth: (p) =>
    `−${p.damageReductionFromWeakerFoe} utrpěného poškození od nepřátel s méně zdravím`,
  damageTakenFromFoesWithACondition: (p) =>
    `−${p.damageReductionFromConditionedFoe} utrpěného poškození od nepřátel se stavem`,
  lessDamageFromSpells: (p) => `o ${p.less} % méně poškození z kouzel`,
  damageOverInASecondIsHealed: (p) => `poškození nad ${p.cap} za sekundu se vyléčí`,
  physicalItsPhysicalDamageTheDamageIt: (p) =>
    p.from === "physical" ? "jeho fyzické poškození" : "poškození, které utrpí z útoků",
  whichTakesLessOfIt: (p) => `, který z něj utrpí o ${p.reduction} méně`,
  goesToItsCaster: (p) => `${share(p.fraction)} z: ${p.hits} přejde na jeho sesilatele${p.less}`,
  theDamageYouTakeGoesToYour: (p) =>
    `${share(p.redirectsDamageToMinion)} poškození, které utrpíš, přejde na tvého nejbližšího přisluhovače`,
  damageFromASingleHitIsCapped: (p) =>
    `poškození z jednoho zásahu je omezeno na ${p.maxDamageFractionPerHit} % maximálního zdraví`,
  eachHitItCapsCostsTheCaster: (p) =>
    `každý takto omezený zásah stojí sesilatele ${p.casterEnergyPerReduction} energie a končí, když sesilatel nemůže zaplatit`,
  damageFromASingleAttackIsCapped: (p) =>
    `poškození z jednoho útoku je omezeno na ${p.attackDamageCapFraction} % maximálního zdraví`,
  lifeStolen: (p) => `−${p.lifeStealReduction} ukradeného zdraví`,
  yourHealthSacrificesAreLarger: (p) =>
    `tvoje oběti zdraví jsou o ${p.sacrificeMultiplier} % větší`,
  knockdownsLastAtLeastS: (p) => `sražení k zemi trvá nejméně ${p.knockdownMinSeconds} s`,
  itsSpiritLosesHealthEachTime: (p) => `jeho duch pokaždé ztratí ${p.sourceLosesHealth} zdraví`,
  reappliedAsItWouldEndWhileYou: (p) =>
    `znovu se uplatní, když by mělo skončit, dokud ${p.selfOnly ? "máš další prokletí" : "má další prokletí"}`,
  chantsAndShoutsLastLongerOnIt: (p) => `zpěvy a pokřiky na něm trvají o ${p.longer} % déle`,
  attacksDealLessMoreDamage: (p) =>
    `útoky způsobují o ${p.attackDamageDelta} ${p.attackDamageDelta2 < 0 ? "méně" : "více"} poškození`,
  movesFaster: (p) => `pohybuje se o ${p.moveSpeedMultiplier} % rychleji`,
  healthRegenerationDegeneration: (p) =>
    `${p.healthPips} ${p.healthPips2 > 0 ? "regenerace" : "degenerace"} zdraví`,
  armor: (p) => `${p.armorModifier} brnění`,
  attacksFaster: (p) => `útočí o ${p.value} % rychleji`,
  aOr: (p) => categoryIds(p.categories),
  listComma: () => ", ",
  whileUnderOr2: (p) => `pod vlivem: ${p.under}: ${p.gains}`,
  once: () => "jednou",
  times: (p) => `${p.stat}krát`,
  endsAfterItTakesEffect: (p) => `končí poté, co se ${p.times} uplatní`,
  theNextHexFailsAndItsCaster: (p) =>
    `příští prokletí selže a jeho sesilatel utrpí ${p.damage} poškození`,
  theNextSpellItCastsAtFoe: (p) =>
    `příští kouzlo, které sešle na ${p.on === "foe-targeted" ? "nepřítele" : "spojence"}, selže: ${p.what}`,
  theNextTouchSkillsUsedAgainstYou: (p) =>
    `příštích ${p.failsFoeTouchSkills} dotykových dovedností použitých proti tobě selže`,
  foesWithinFoes: (p) =>
    p.area === undefined ? `Nepřátelé do ${p.radius}` : `Nepřátelé ${p.area}`,
  moreEachSecond: (p) => `, o ${p.growth} více každou sekundu`,
  eachSecondItAndTakeDamage: (p) =>
    `každou sekundu ${p.hitsBearer ? "on a " : ""}${p.foes} utrpí ${p.damage} ${p.kind === "" ? damageOf("") : damageCounted(p.kind.trim() as DamageKind)}${p.more}`,
  second: () => "sekunda",
  seconds2: (p) => `${p.every} s`,
  everySecondSeconds: (p) => `každých ${p.value}: ${p.what}`,
  itsSpiritLosesHealthForEachOne: (p) => `jeho duch ztratí ${p.amount} zdraví za každý zraněný cíl`,
  itsSpiritLosesHealthForEachOne2: (p) =>
    `jeho duch ztratí ${p.amount} zdraví za každý vyléčený cíl`,
  everyAttack: () => "každého útoku",
  theNextAttack: () => "příštího útoku",
  theNextAttacks: (p) => `příštích ${p.times} útoků`,
  typelessAsDamage: (p) => (p.type === "typeless" ? "" : ` jako ${damageNoun(p.type)}`),
  ofTheDamageOfThatHitIt: (p) =>
    `${p.share} % poškození z ${p.attacks}, které ho zasáhnou, se vrátí útočníkovi${p.kind}, nejvýše ${p.max}`,
  eachAttackItLandsHasAChance: (p) =>
    `každý jeho zásah má ${p.chance} % šanci způsobit poškození místo toho jemu samotnému, nejvýše ${p.max}`,
  theNextDamageOrLifeStealHeals: (p) =>
    `příští poškození nebo krádež zdraví místo toho léčí o tuto hodnotu, nejvýše ${p.reversesNextDamage}`,
  theNextDamageIsNegatedAndIts: (p) =>
    `příští poškození je zrušeno a místo toho ho utrpí jeho zdroj, nejvýše ${p.cap}`,
  meleeAttacksNeitherHitNorFailTo: (p) =>
    `útoky zblízka nezasáhnou ani neminou, místo toho způsobí po ${p.damage} poškození`,
  allDamageHealsForThatMuchInstead: (p) =>
    `veškeré poškození místo toho léčí o tuto hodnotu, nejvýše ${p.cap} za zásah`,
  theNextDamageOrLifeStealThat: (p) =>
    `příští poškození nebo krádež zdraví, které by ${p.selfOnly ? "tě" : "ho"} zabily, je zrušeno`,
  whenOneAllySIsSpentIt: () => "když je u jednoho spojence vyčerpáno, skončí u všech ostatních",
  gainMoreStrikeStrikesOfAdrenalinePer: (p) =>
    `za každý zásah získá o ${p.extraStrikesPerHit} ${p.extraStrikesPerHit2 === 1 ? "úder" : "úderů"} adrenalinu více`,
  skillsRechargeFaster: (p) => `dovednosti se obnovují o ${p.skillRechargeFaster} % rychleji`,
  skillsCostMoreLessEnergy: (p) =>
    `dovednosti stojí o ${p.change} % ${p.change2 > 0 ? "více" : "méně"} energie`,
  spellsAndBindingRitualsRechargeFaster: (p) =>
    `kouzla a poutací rituály se obnovují o ${p.faster} % rychleji`,
  spellsRechargeFaster: (p) => `kouzla se obnovují o ${p.spellRechargeFaster} % rychleji`,
  bindingRitualsRechargeFaster: (p) => `poutací rituály se obnovují o ${p.faster} % rychleji`,
  enchantmentsRechargeFaster: (p) => `očarování (${p.name}) se obnovují o ${p.faster} % rychleji`,
  hexTheTargetSYour: (p) => (p.category === "hex" ? "jeho" : "tvoje"),
  skillsHaveArmorPenetration: (p) => `dovednosti (${p.name}) mají ${p.pierce} % průrazu brnění`,
  yourTheBearerSSkillsCannotBe: (p) =>
    `${p.selfOnly ? "tvoje dovednosti" : "dovednosti nositele"} nelze přerušit`,
  theNextTimeYouWouldBeInterrupted: () => "až bys byl příště přerušen, nestane se to",
  youCannotBeInterruptedEachTimeYou: (p) =>
    `nemůžeš být přerušen; pokaždé, když by se to stalo, ztratíš ${p.amount} energie, nebo to skončí`,
  youCannotBeInterruptedEachTimeYou2: (p) =>
    `nemůžeš být přerušen; pokaždé, když by se to stalo, ztratíš 1 očarování (${p.profession}), nebo to skončí`,
  conditionsOnExpireFaster: (p) => `stavy na: ${p.bearer} vyprší o ${p.faster} rychleji`,
  hexesOnExpireFaster: (p) => `prokletí na: ${p.bearer} vyprší o ${p.faster} % rychleji`,
  theNextHexOnLastsLonger: (p) =>
    `příští prokletí (${p.of}) na: ${p.bearer} trvá o ${p.longer} déle`,
  hexesCastOnTakeAsLongTo: (p) => `sesílání prokletí na: ${p.bearer} trvá ${p.times}× déle`,
  otherAlliesSpellsOnTakeAsLong: (p) =>
    `sesílání kouzel ostatních spojenců na: ${p.bearer} trvá ${p.times}× déle`,
  yourSpellsOnTakeAsLongTo: (p) => `sesílání tvých kouzel na: ${p.bearer} trvá ${p.times}× déle`,
  enchantmentsCastOnCostLessEnergyMinimum: (p) =>
    `očarování na: ${p.bearer} stojí o ${p.less} energie méně, nejméně 1`,
  hitsWithAnAttack: () => "zasáhne útokem",
  failsToHit: () => "nezasáhne",
  hitsWithAnAttackSkill: () => "zasáhne útočnou dovedností",
  skillEffectEndsIfYouUseA: (p) =>
    p.selfOnly || p.category === "skill-effect"
      ? "končí, když použiješ dovednost"
      : "končí, když nositel použije dovednost",
  endsIfYouUseAnAdrenalSkill: () => "končí, když použiješ adrenalinovou dovednost",
  endsIfYouUseANonAdrenal: () => "končí, když použiješ neadrenalinovou dovednost",
  endsIfYouUseANonSkill: (p) => `končí, když použiješ dovednost, která není ${p.kind}`,
  endsIfYouUseAnAttackSkill: () => "končí, když použiješ útočnou dovednost",
  endsIfYouUseASkillOn: () => "končí, když na to použiješ dovednost",
  endsIfYouUseASkillThat: (p) => `končí, když použiješ dovednost, která není ${p.NEXT_SKILL_KIND}`,
  hexHexedEnchanted: (p) => (p.category === "hex" ? "proklet" : "očarován"),
  becomesOr: (p) => `se stane ${p.gained}`,
  theBearerIsDestroyedWhenItExpires: () => "nositel je při vypršení zničen",
  theMinionsYouItTookBecomeMasterless: (p) =>
    `přisluhovači, které ${p.selfOnly ? "jsi převzal" : "převzal"}, zůstanou bez pána, až to skončí`,
  whenTheBearerDiesRisesWhereIt: (p) =>
    p.masterless === true
      ? `když nositel zemře, na jeho místě povstane ${p.stands} bez pána`
      : `když zemře, na jeho místě povstane ${p.stands}`,
  composedKindBoundWhenOn: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.on],
  endsIfItEndsIfYou: (p) =>
    p.onFoe ? `končí, když ${p.when}` : `končí, když ${secondPerson(p.when)}`,
  all: (p) => (p.once && p.against === "all" ? blockAnswer(p.text) : p.text),
  whileHoldingAnItem: (p) =>
    p.onlyWhileHoldingItem && !p.holdingSaid ? `${p.stats}, dokud drží předmět` : p.stats,
  composedIndexText: (p) => (p.index === 0 ? p.text : capitalize(p.text)),
  listSentence: () => ". ",
  physicalAttacks: (p) =>
    p.weapon !== undefined ? weaponAttacks(p.weapon) : p.physicalOnly ? "fyzické útoky" : "útoky",
  attackSkillsPhysicalAttacks: (p) => (p.attackSkillsOnly ? attackSkills(p.weapon) : p.value),
  foesYourHitGetFor: (p) =>
    `nepřátelé zasažení tvými ${instrumentalPlural(p.attacks)} získají na ${p.durationSeconds}: ${p.statusName}`,
  foesYourHitTake: (p) =>
    `nepřátelé zasažení tvými ${instrumentalPlural(p.attacks)} utrpí ${p.riderDamage}`,
  foesYourHitLose: (p) =>
    `nepřátelé zasažení tvými ${instrumentalPlural(p.attacks)} ztratí ${p.count} ${categoryNoun(p.count2, p.category)}`,
  andSoDoFoesAdjacentToThem: (p) => `${p.pop}, a stejně tak nepřátelé v jejich sousedství`,
  stealUpToHealth: (p) => `${capitalize(p.attacks)} kradou až ${p.amount} zdraví`,
  yourPetSAttacksHealYouFor: (p) => `útoky tvého zvířete tě léčí o ${p.amount}`,
  yourInterruptFoesTheyHit: (p) => `tvoje ${p.attacks} přerušují zasažené nepřátele`,
  your: (p) => `tvoje ${p.attacks}: ${p.text}`,
  attackSkillsPhysicalAttacks2: (p) =>
    p.attackSkillsOnly
      ? attackSkills(p.weapon)
      : p.weapon === undefined
        ? "fyzické útoky"
        : weaponAttacks(p.weapon),
  foesThatBlockYourGetFor: (p) =>
    `nepřátelé, kteří zablokují tvoje ${p.attacks}, získají na ${p.durationSeconds}: ${p.statusName}`,
  foesThatBlockYour: (p) => `nepřátelé, kteří zablokují tvoje ${p.attacks}: ${lowerFirst(p.text)}`,
  damage: (p) => `${p.amount} ${damageCounted(p.type)}`,
  physical: () => "fyzické",
  elemental: () => "elementární",
  armor2: () => "brnění",
  listSpace: () => " ",
  againstProjectileAttacks: (p) =>
    p.projectile ? `${kindedArmor(p.text)} proti útokům na dálku` : kindedArmor(p.text),
  thatAllyIsHealedFor: (p) => `ten spojenec je vyléčen o ${p.amount}`,
  youLoseItsCasterLoses: (p) => (p.bearerIsCaster ? "ztratíš" : "jeho sesilatel ztratí"),
  energy2: (p) => `${p.who} ${p.amount} energie`,
  orSpell: (p) => `kouzlo ${p.value}`,
  wheneverYouCastItCastsAnA: (p) =>
    `kdykoli ${p.bearerIsCaster ? "sešleš" : "sešle"} ${compound(p.spell)} na spojence, ${p.value}`,
  composedKindBoundWhenEvent: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.event],
  youOrItOr: (p) => (p.bearerIsCaster ? p.phrases : p.phrases2),
  whenItOrOrAtOnce: (p) => (p.length === 0 ? p.death : `když ${p.others}, nebo ihned ${p.death}`),
  whenItOr: (p) => `když ${p.on}`,
  composedBearerIsCaster: (p) => (p.bearerIsCaster ? YOUR_NEXT_SKILL : NEXT_SKILL),
  theNextTime: (p) => `příště, až ${p.doer}`,
  composedEventWhenOf: (p) =>
    p.event === "bearer-hits"
      ? "zasáhnou"
      : p.event === "bearer-fails-to-hit"
        ? "nezasáhnou"
        : p.whenOf,
  wheneverYourArrowsOr: (p) => `kdykoli tvoje šípy ${p.on}`,
  wheneverOnACreatureWithLessHealth: (p) =>
    `kdykoli ${p.doer}${p.victimHasLessHealth === undefined ? "" : " tvora s méně zdravím"}`,
  and2: () => " a ",
  andAnd: (p) => (p.when === undefined ? p.each : `${p.when}: ${p.each}`),
  youItAnd: (p) => `${p.when}: ${p.bearerIsCaster ? "ty" : "on"} a ${p.answer}`,
  youAndAllPartyMembersAreHealed: (p) =>
    `${DROPPED}: ty a všichni členové skupiny jste vyléčeni o ${p.healed}`,
  composedWhat: (p) => `${DROPPED}: ${p.what}`,
  meleeHitsWithAMeleeAttackHits: (p) =>
    p.weapon === "melee" ? "zasáhne útokem zblízka" : `zasáhne ${WITH_WEAPON[p.weapon]}`,
  meleeIsHitByAFoeS: (p) =>
    p.weapon === "melee"
      ? "je zasažen útokem nepřítele zblízka"
      : `je zasažen útokem nepřítele ${withWeapon(p.weapon)}`,
  with3: (p) => `${withWeapon(p.weapon)} ${TRIGGER_WHEN[p.event]}`,
  youGainEnergy: (p) => `získáš ${p.amount} energie`,
  allYourSkillsAreRecharged: () => "všechny tvoje dovednosti jsou obnoveny",
  yourPartyIsHealedFor: (p) => `tvoje skupina je vyléčena o ${p.amount}`,
  takeDamage: (p) => `${lowerFirst(p.upTo)} utrpí ${p.amount} ${damageCounted(p.type)}`,
  areHealedFor: (p) => `${lowerFirst(p.upTo)} jsou vyléčeni o ${p.amount}`,
  composedUpToText: (p) => `${lowerFirst(p.upTo)}: ${lowerFirst(p.text)}`,
  ifTargetFoeDiesWhileHexedWith: (p) =>
    p.bearerIsFoe
      ? "pokud cílový nepřítel zemře, zatímco je tímto prokletý"
      : "pokud spojenec zemře, zatímco je tímto očarovaný",
  and3: (p) => `${p.who}, ${p.flatMap}`,
  hasASpellInterrupted: () => "je přerušen při sesílání kouzla",
  isStruckForDamageWhileUsingA: (p) =>
    `je při používání dovednosti zasažen a utrpí ${damageNamed(p.damageType)}`,
  takesDamageFromAFoe: (p) => `utrpí od nepřítele ${damageNamed(p.damageType)}`,
  takesMoreThanDamageFromAFoe: (p) => `utrpí od nepřítele více než ${p.minDamage} poškození`,
  hasItsHealthDroppedBelowByDamage: (p) => `klesne poškozením pod ${p.healthBelow} % zdraví`,
  isMoreThanFromYou: (p) => `je od tebe dál než ${p.apartBeyond}`,
  hitsWithAAttack: (p) => `zasáhne ${CHAIN_WITH[p.chainRole]}`,
  isHitByAnAttackAAttack: (p) =>
    `je zasažen ${p.role === undefined ? "útokem" : CHAIN_WITH[p.role]} svého sesilatele`,
  blocksAAttack: (p) =>
    `zablokuje ${p.blocked === "melee" ? "útok zblízka" : p.blocked === "projectile" ? "útok na dálku" : p.blocked}`,
  losesAEnchantment: (p) => `ztratí očarování (${p.name})`,
  hex2: (p) => compound(`${p.scopeAdjective} prokletí`),
  appliesAnAToAFoe: (p) => `uvalí na nepřítele ${compound(p.words)}`,
  spell: (p) => (p.type === undefined ? "kouzlo" : typeName(p.type)),
  onAllyAnAllyAFoe: (p) => ` na ${p.targets === "ally" ? "spojence" : "nepřítele"}`,
  castsAnA: (p) => `sešle ${compound(p.words)}${p.on}`,
  non: (p) => `ne-${typeName(p.notType)}`,
  elite: () => "elitní",
  adrenal: () => "adrenalinová",
  skill: () => "dovednost",
  isTargetedByYour: (p) => `je cílem: ${compound(p.words)}`,
  on: (p) => (p.targets === undefined ? "" : ` na ${TARGETS_WORDS[p.targets]}`),
  usesAnA: (p) => `použije ${compound(p.words)}${p.on}`,
  health2: (p) => `${p.amount} zdraví`,
  energy3: (p) => `${p.amount} energie`,
  takeDamage2: (p) => `utrpí ${p.amount} ${damageCounted(p.type)}`,
  loseAllAllS: (p) =>
    `ztratí ${p.value} ${p.count === 1 ? CATEGORY[p.category].acc : CATEGORY[p.category].many}`,
  all2: (p) => `všichni ${p.side}`,
  upTo: (p) => `až ${p.maxTargets} ${p.side}`,
  withinOfThatCreature: (p) => AREA_AROUND_CREATED.get(p.radius) ?? `do ${p.radius2} od toho tvora`,
  gain: (p) => `získají ${p.answer}`,
  youGain: (p) => `${p.when}: ${p.gains ? `získáš ${p.answers}` : p.answers}`,
  onIt: () => "na něm",
  damageOnIt: (p) => `${p.value}${p.amount} ${damageCounted(p.type)} ${p.perCount}`,
  composedWhenWhat: (p) => `${p.when}: ${p.what}`,
  itsAdjacentAllies: () => "jeho spojenci v sousedství",
  itsAlliesWithin: (p) => `jeho spojenci ${p.area ?? `do ${p.radius}`}`,
  itsAdjacentAlliesItsAlliesWithin: (p) =>
    !p.bearerIsFoe ? `${lowerFirst(p.foesWithin)}${p.only}` : p.value,
  bearerBlocksMeleeMeleeProjectile: (p) =>
    p.on === "bearer-blocks-melee" ? "zblízka" : "na dálku",
  whenYouBlockYouAndAlliesAre: (p) =>
    `když blokuješ, ty a spojenci ${p.area} jste vyléčeni o ${p.amount}`,
  eachBlockCostsYouEnergyOrThis: (p) =>
    `každé zablokování tě stojí ${p.amount} energie, nebo to skončí`,
  youGainEnergyForEachSuccessfulAttack: (p) =>
    `získáš ${p.amount} energie za každý zablokovaný útok ${p.kind}`,
  wheneverYouBlockAAttackThisWay: (p) =>
    `kdykoli takto zablokuješ útok ${p.kind}, útočník utrpí ${p.amount} ${damageCounted(p.type)}`,
  withinOfYouFoes: (p) => `Nepřátelé ${AREA_TEXT.get(p.radius) ?? `do ${p.radius2} od tebe`}`,
  ifYouBlockAAttackSufferFrom: (p) =>
    `když zablokuješ útok ${p.kind}, ${p.foes} trpí na ${p.resolveMagnitudeAtRanks} s stavem ${p.statusName}`,
  ifYouBlockAAttack: (p) => `když zablokuješ útok ${p.kind}, ${p.foes}: ${lowerFirst(p.text)}`,
  stealsHealthFromThatFoe: (p) => `ukradne tomu nepříteli ${p.amount} zdraví`,
  loses: (p) => `ztratí ${p.count} ${categoryNoun(p.count2, p.category)}`,
  itTakesDamage: (p) => `utrpí ${p.amount} ${damageCounted(p.type)}`,
  takeDamage3: (p) => `${p.splashed} utrpí ${p.amount} ${damageCounted(p.type)}`,
  thatAttackIsInterruptedAndAnd: (p) => `${p.when}, ten útok je přerušen a ${p.hurt}`,
  itIsInterruptedAndYouLoseEnergy: (p) =>
    `${p.when}, je to přerušeno a ztratíš ${p.amount} energie, nebo to skončí`,
  ofThatSkillSBaseEnergyCost: (p) => `${p.share} základní ceny energie té dovednosti`,
  energy4: (p) => `${p.amount} energie`,
  youAreHealedAreHealedIsHealed: (p) =>
    p.bearerIsCaster && p.length === 0
      ? "jsi vyléčen"
      : p.bearerIsCaster
        ? "jsou vyléčeni"
        : "je vyléčen",
  forOfThatSkillSEnergyCost: (p) => `${p.healed} o ${p.share} ceny energie té dovednosti`,
  forWord: (p) => `${p.healed} o ${p.amount}`,
  plus: () => " plus ",
  youGainGainsPlus: (p) => `${p.bearerIsCaster ? "získáš" : "získá"} ${p.gains}`,
  theNearestOf: (p) => `nejbližší z ${genitive(p.splashed)}`,
  upTo2: (p) => `až ${p.maxTargets} ${p.splashed}`,
  itAndLoseEnergy: (p) => `on a ${p.others} ztratí ${p.amount} energie`,
  bearerFoesFoesOtherFoes: (p) => (p.to === "bearer-foes" ? "nepřátelé" : "ostatní nepřátelé"),
  inTheAreaSufferItToo: (p) => `${p.who} v oblasti to utrpí také`,
  ifASpellItThatSkill: (p) => (p.spellsOnly ? "pokud je to kouzlo, to" : "ta dovednost"),
  takesThisSkillSSlotForSeconds: (p) => `${p.which} zabere místo této dovednosti na ${p.seconds} s`,
  youEnterTheSameStance: () => "zaujmeš stejný postoj",
  youLoseEnergyOrThisEnds: (p) => `ztratíš ${p.amount} energie, nebo to skončí`,
  thatAttackIsInterrupted: (p) => `${p.when}, ten útok je přerušen`,
  takes: (p) => `utrpí ${p.dealt} ${p.when}`,
  bearerFatalDamageNegatedAnd: (p) => (p.on === "bearer-fatal-damage-negated" ? "a" : `${p.when},`),
  theFoeWhoDealtItTakesDamage: (p) =>
    `${p.then} nepřítel, který ho způsobil, utrpí ${p.amount} ${damageCounted(p.type)}`,
  thatAttackerIsHealedFor: (p) => `${p.when}, ten útočník je vyléčen o ${p.amount}`,
  bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p) =>
    p.on === "bearer-gains-enchantment" ? "očarování" : "prokletí nebo očarování",
  theCasterOfThatTakesDamage: (p) =>
    `${p.when}, sesilatel tohoto ${p.gained} utrpí ${p.amount} ${damageCounted(p.type)}`,
  theHealerTakesDamage: (p) => `${p.when}, léčitel utrpí ${p.amount} ${damageCounted(p.type)}`,
  ofThatTarget: (p) => `${lowerFirst(p.upTo)} toho cíle ${p.what}${p.paid}`,
  healsItsCasterFor: (p) => `vyléčí svého sesilatele o ${p.amount}, ${p.when}`,
  itsCasterGainsEnergy: (p) => `jeho sesilatel získá ${p.amount} energie, ${p.when}`,
  theNextSkillYouUseItUses: (p) =>
    `příští dovednost, kterou ${p.bearerIsCaster ? "použiješ" : "použije"}, se obnovuje o ${p.seconds} s déle`,
  itsCasterStealsHealth: (p) => `jeho sesilatel ukradne ${p.amount} zdraví, ${p.when}`,
  theNearestOfTakes: (p) => `nejbližší z ${genitive(p.allies)} utrpí`,
  take: (p) => `${p.allies} utrpí`,
  upToTake: (p) => `až ${p.maxTargets} ${p.allies} utrpí`,
  composedAlliesText: (p) => `${p.allies}: ${lowerFirst(p.text)}`,
  onAFoe: (p) => `${p.when} u nepřítele`,
  adjacentToYou: () => "v tvém sousedství",
  withinAroundYou: (p) => `${p.area ?? `do ${p.radius}`} kolem tebe`,
  otherAdjacentToYouWithinAroundYou: (p) =>
    `${p.includesCentre === true ? "" : "ostatní "}${SPLASH_SIDE[p.hits]} ${p.value}`,
  takeDamage4: (p) => `${p.yours}, ${p.reached} utrpí ${p.amount} ${damageCounted(p.type)}`,
  composedYoursReachedText: (p) => `${p.yours}, ${p.reached}: ${lowerFirst(p.text)}`,
  composedBearerIsCasterSaid: (p) =>
    p.bearerIsCaster
      ? yourCondition(p.said)
      : p.said.replace(/^Pokud cíl/, "Pokud nositel").replace(/^Pokud se cíl/, "Pokud se nositel"),
  composedWhenConditionText: (p) => `${p.when}, ${p.condition}: ${lowerFirst(p.text)}`,
  bearer: (p) => lowerFirst(p.target === "bearer" ? p.bearer : p.text),
  nextAttackSkill: (p) => `příští útočná dovednost: ${p.statusName} ${p.durationSeconds}`,
  nextAttackSkill2: (p) => `příští útočná dovednost: ${p.text}`,
  skillTargetAroundItsTarget: (p) => (p.at === "skill-target" ? " (kolem jejího cíle)" : ""),
  withYourNext: (p) => `při příštím použití (${p.next})${p.around}: ${lowerFirst(p.text)}`,
  costsCostEnergy: (p) => `stojí ${p.energyBase} energie`,
  costsCostLessEnergy: (p) => `stojí o ${p.energyPercentOff} energie méně`,
  costsCostLessEnergyMinimum: (p) =>
    `stojí o ${p.energyDiscount} energie méně (nejméně ${p.energyFloor})`,
  costsCostMoreEnergy: (p) => `stojí o ${p.energySurcharge} energie více`,
  castsCastInstantly: (p) => `${p.one ? "sešle se" : "sešlou se"} okamžitě`,
  castsCastFaster: (p) =>
    `${p.one ? "sešle se" : "sešlou se"} o ${p.activationMultiplier} rychleji`,
  takesTakeAsLongToCast: (p) =>
    `${p.one ? "sesílá se" : "sesílají se"} ${p.activationMultiplier}× déle`,
  castsCastFaster2: (p) =>
    `${p.one ? "sešle se" : "sešlou se"} o ${p.activationSecondsLess} rychleji`,
  rechargesRechargeFaster: (p) =>
    `${p.one ? "obnoví se" : "obnoví se"} o ${p.rechargeFaster} rychleji`,
  rechargesRechargeSlower: (p) =>
    `${p.one ? "obnoví se" : "obnoví se"} o ${p.rechargeSlower} pomaleji`,
  lastsLastLongerShorter: (p) =>
    `${p.one ? "trvá" : "trvají"} o ${p.durationMultiplier} ${p.durationMultiplier2 > 1 ? "déle" : "kratší dobu"}`,
  healsHealLessMoreNotTheDivine: (p) =>
    `${p.one ? "léčí" : "léčí"} o ${p.value} ${p.healMultiplier < 1 ? "méně" : "více"}${p.sparesDivineFavor ? ", kromě bonusu Božské přízně" : ""}`,
  isAreNotEasilyInterrupted: (p) => `${p.one ? "není" : "nejsou"} snadno přerušitelné`,
  overcastYouBy: (p) => `způsobí ti ${p.overcastPerUse} přepětí`,
  andAttack: (p) =>
    `${p.chainRoles
      .replace(/\boff-hand\b/g, "vedlejší")
      .replace(/\bdual\b/g, "dvojitý")
      .replace(/\blead\b/g, "úvodní")} útok`,
  attackSkillSkill: (p) =>
    p.weapon !== undefined
      ? `útočná dovednost ${WEAPON_WORD[p.weapon]}`
      : p.type === undefined
        ? "dovednost"
        : spaced(p.type),
  hexHexesS: (p) => (p.one ? p.kind : pluralNoun(p.kind)),
  thatTargetsAFoeThatTargetA: () => "mířící na nepřítele",
  thatTargetsYouThatTargetYou: () => "mířící na tebe",
  halfRanged: () => "s polovičním dosahem",
  notFlashEnchantments: (p) => (p.notFlash ? " (ne blesková očarování)" : ""),
  whileHoldingAnItem2: (p) => (p.whileHoldingItem ? "dokud držíš předmět, " : ""),
  nextNext: (p) => (p.one ? `${p.whose} příští` : `${p.whose} příštích ${p.uses}`),
  cannotBeInterrupted: () => "nelze přerušit",
  cannotBeBlocked: () => "nelze zablokovat",
  costsLessEnergy: (p) => `stojí o ${p.energyDiscount} energie méně`,
  castsInstantly: () => "sešle se okamžitě",
  rechargesInstantly: () => "obnoví se okamžitě",
  s2: (p) => `${p.value} s`,
  takesSLongerToRecharge: (p) => `obnovuje se o ${p.extraRechargeSeconds} déle`,
  yourNextAnd: (p) => `příští ${p.NEXT_SKILL_KIND} ${p.does}`,
  youLoseAllEnergyAsItIs: () => "při sesílání ztratíš všechnu energii",
  youGainOfItsEnergyCost: (p) => `získáš ${p.energyGainOfCost} její ceny energie`,
  itRechargesFaster: (p) => `obnoví se o ${p.fraction} % rychleji`,
  rechargesInstantly2: (p) => `${p.name} se obnoví okamžitě`,
  forYourNextSkill: () => "na tvou příští dovednost",
  ifItIsAAnd: (p) => `pokud je to ${p.kind}, ${p.does}`,
  suffer: (p) => `utrpí ${p.sufferedWhat}`,
  forWord2: (p) => `${p.statusName} na ${p.durationSeconds} (${p.status})`,
  a: (p) => `${CATEGORY[p.category].acc} (${compound(p.owners)})`,
  ifItInterruptsASkill: () => "Pokud přeruší dovednost",
  ifThatActionWasASpell: () => "Pokud ta akce byla kouzlo",
  ifThatActionWasAnAttack: () => "Pokud ta akce byla útok",
  ifItKillsTheTarget: () => "Pokud zabije cíl",
  ifItResurrects: () => "Pokud oživí",
  ifASpiritDiedInThisWay: () => "Pokud takto zemřel duch",
  ifWasRemoved: (p) => `Pokud byl odstraněn: ${CATEGORY[p.category].one}`,
  ifItRemoves: (p) => `Pokud odstraní ${aCategory(p.category)}`,
  ifTargetIsBelowHealth: (p) => `Pokud cíl má pod ${p.fraction} % zdraví`,
  ifTargetIsAboveHealth: (p) => `Pokud cíl má nad ${p.fraction} % zdraví`,
  ifYouHaveLessThanHealth: (p) => `Pokud máš méně než ${p.fraction} % zdraví`,
  ifYouHaveLessHealthThanYour: () => "Pokud máš méně zdraví než tvé zvíře",
  ifYourPetHasLessHealthThan: () => "Pokud tvé zvíře má méně zdraví než ty",
  ifItFollowsOffHandAnOff: (p) => `Pokud následuje po ${CHAIN_AFTER[p.role]}`,
  ifTargetHas: (p) => `Pokud cíl má ${p.filteredCategory}`,
  ifTargetHasOr: (p) => `Pokud cíl má ${p.categories}`,
  ifYouHave: (p) => `Pokud máš ${aCategory(p.category)}`,
  ifYouHaveA: (p) => `Pokud máš ${CATEGORY[p.category].acc} (${p.name})`,
  other: (p) => (p.excluding === undefined ? "" : "jiné "),
  ifYouHaveNo: (p) => `Pokud nemáš ${noOther(p.category, p.other, CATEGORY[p.category].acc)}`,
  ifYouHaveNo2: (p) =>
    `Pokud nemáš ${noOther(p.category, p.other, `${CATEGORY[p.category].acc} (${p.name})`)}`,
  ifTargetIsCastingASpellOr: (p) =>
    p.orChant === true ? "Pokud cíl sesílá kouzlo nebo zpěv" : "Pokud cíl sesílá kouzlo",
  ifTargetIsUsingASkill: () => "Pokud cíl používá dovednost",
  ifTargetHasNoOtherHex: (p) => `Pokud cíl nemá žádné jiné prokletí (${p.name})`,
  ifTargetIsNotAdjacentToAny: () => "Pokud cíl nemá v sousedství žádného spojence",
  ifTargetIsNotNearAnyAllies: () => "Pokud cíl nemá poblíž žádné spojence",
  ifTargetHasNoAlliesWithin: (p) => `Pokud cíl nemá žádné spojence do ${p.radius}`,
  ifTargetIsNearAnyOfYour: () => "Pokud cíl je poblíž některého z tvých spojenců",
  ifAnyOfYourAlliesIsWithin: (p) => `Pokud je některý z tvých spojenců do ${p.radius} od cíle`,
  ifTargetIsWithinEarshot: () => "Pokud cíl je v doslechu",
  ifTargetIsWithinOfYou: (p) => `Pokud cíl je do ${p.radius} od tebe`,
  ifTargetIsNotMoving: () => "Pokud se cíl nepohybuje",
  ifTargetIsKnockedDown: () => "Pokud cíl je sražen k zemi",
  ifTargetIsMoving: () => "Pokud se cíl pohybuje",
  ifTargetIsAFoe: () => "Pokud cíl je nepřítel",
  ifTargetIsMovingFasterThanNormal: () => "Pokud se cíl pohybuje rychleji než obvykle",
  ifAnyFoeIsKnockedDownIf: (p) =>
    p.knockedDown === true
      ? `Pokud je nepřítel ${p.where} sražen k zemi`
      : `Pokud je nepřítel ${p.where}`,
  ifYouHitOrMoreFoes: (p) => `Pokud zasáhneš alespoň ${p.atLeast} nepřátel`,
  ifNumberOrMore: (p) => `Pokud počet ${genitive(p.countAll)} je alespoň ${p.atLeast}`,
  ifAreNoMoreThan: (p) =>
    `Pokud počet ${genitive(p.countAll)} není větší než počet ${genitive(p.countAll2)}`,
  ifTargetHas2: (p) => `Pokud cíl trpí stavem ${p.statusName}`,
  ifTargetDoesNotHave: (p) => `Pokud cíl netrpí stavem ${p.statusName}`,
  ifYouHaveMoreEnergyThanTarget: () => "Pokud máš více energie než cíl",
  ifYouHaveLessThanEnergy: (p) => `Pokud máš méně než ${p.amount} energie`,
  ifYouAreOvercast: () => "Pokud máš přepětí",
  ifYouWield: (p) => `Pokud držíš ${NEEDED_WEAPON[p.weapon]}`,
  ifYouHoldAShield: () => "Pokud držíš štít",
  ifYouAreHoldingAnItem: () => "Pokud držíš předmět",
  ifTargetHasLessHealthThanYou: () => "Pokud cíl má méně zdraví než ty",
  ifTargetHasMoreHealthThanYou: () => "Pokud cíl má více zdraví než ty",
  ifTargetIsAttacking: () => "Pokud cíl útočí",
  ifTargetIsNotAttacking: () => "Pokud cíl neútočí",
  ifTargetIsCastingASpellOr2: () => "Pokud cíl sesílá kouzlo nebo útočí",
  ifTargetIsASummonedCreature: () => "Pokud cíl je vyvolaný tvor",
  ifNoSpiritIsWithinOfYou: (p) =>
    `Pokud u tebe není žádný duch ${AREA_TEXT.get(p.radius) ?? `do ${p.radius2}`}`,
  ifASpiritIsWithinOfYou: (p) =>
    `Pokud je u tebe duch ${AREA_TEXT.get(p.radius) ?? `do ${p.radius2}`}`,
  ifYouControlOrFewerS: (p) =>
    `Pokud ovládáš nejvýše ${p.count} ${p.creature === "spirit" ? "duchů" : p.creature === "minion" ? "přisluhovačů" : genitive(pluralNoun(spaced(p.creature)))}`,
  ifASpiritOrACorpseIs: (p) =>
    `Pokud je u tebe duch nebo mrtvola ${AREA_TEXT.get(p.radius) ?? `do ${p.radius2}`}`,
  ifAnAllyIsDeadWithin: (p) => `Pokud je spojenec ${within(p.radius, p.radius2)} mrtvý`,
  ifTargetIsNearACorpseOr: () => "Pokud cíl je poblíž mrtvoly nebo je jeho zvíře mrtvé",
  ifTargetIsWithinOfACorpse: (p) =>
    `Pokud cíl je do ${p.radius} od mrtvoly nebo je jeho zvíře mrtvé`,
  composedType: (p) => (p.type === undefined ? "" : typeWord(p.type)),
  healthForEachAllyMax: (p) =>
    `, +${p.amount} zdraví za každého spojence ${p.area} (max. ${p.max})`,
  allPartyMembers: () => "Všichni členové skupiny",
  allItsPartyMembers: () => "Všichni členové jeho skupiny",
  allAlliedMinions: () => "Všichni spojenečtí přisluhovači",
  yourOtherMinions: () => "Tvoji ostatní přisluhovači",
  within2: (p) => `${p.Who} ${p.area ?? `do ${p.radius}`}`,
  adjacent: (p) => placed("Sousední", "v sousedství", p.who),
  nearby: (p) => `${capitalize(p.who)} poblíž`,
  within3: (p) => (p.area === undefined ? `${p.Who} do ${p.radius}` : `${p.Who} ${p.area}`),
  loseThatSame: (p) => `ztratí totéž: ${CATEGORY[p.category].acc}`,
  loseAllAll: (p) => `ztratí všechny ${categoryNoun("all", p.category)}`,
  onThem: () => "na nich",
  loseOneForEachOnThem: (p) => `ztratí jedno: ${CATEGORY[p.category].acc} za ${p.countEach}`,
  lose: (p) => `ztratí ${p.count} ${categoryNoun(p.count2, p.category)}`,
  enchantmentAnA: () => "",
  with4: (p) => (p.onlyBearing === undefined ? "" : ` s ${CATEGORY[p.onlyBearing].instr}`),
  usingSkills: (p) =>
    p.onlyUsing === undefined ? "" : `, kteří používají: ${typeName(p.onlyUsing)}`,
  dead: (p) => (p.dead === true ? `Mrtví ${lowerFirst(p.living)}` : p.living),
  targetAndCasterAroundYouCasterAround: (p) =>
    `${p.includesCentre === true ? `Cíl a ${lowerFirst(p.reached)}` : p.reached}${p.around === "caster" ? " kolem tebe" : ""}${p.alsoAround === "caster" ? " kolem cíle a kolem tebe" : ""}${p.bearing}${p.using}${p.onlyIf}`,
  upTo3: (p) => `Až ${p.maxTargets} ${lowerFirst(p.who)}`,
  inItsRange: () => "v jeho dosahu",
  inTheArea: () => "v oblasti",
  foes: () => "nepřátelé",
  allEveryoneYouAndAlliesAllies: (p) =>
    p.affects === "all" ? "všichni" : p.includesCaster ? "ty a spojenci" : "spojenci",
  enemiesFoesAllEveryoneYouAndAllies: (p) => `${p.value} ${within(p.radius, p.radius2)}`,
  whenSprung: () => "při spuštění",
  after: (p) => `po ${seconds(p.delaySeconds)}`,
  everyFor: (p) => `každých ${seconds(p.everySeconds)}, po dobu ${seconds(p.count)}`,
  whenItEnds: (p) => `Až to skončí, ${p.whom}: `,
  springsByItselfAsItsTimeRuns: () => "Spustí se samo, když mu vyprší čas",
  composedWhoText: (p) => `${capitalize(p.who)}: ${lowerFirst(p.text)}`,
  composedEndingText: (p) => `${p.ending}${lowerFirst(p.text)}`,
  composedConditionText: (p) => `${p.condition}: ${lowerFirst(p.text)}`,
  itsAttacksDealDamage: (p) => `Jeho útoky způsobí ${p.magnitude} poškození`,
  thisSpiritLosesHealth: (p) => `tento duch ztratí ${p.magnitude} zdraví`,
  composedCondition: (p) => `${lowerFirst(p.condition)}: `,
  itsAttacks: (p) => `Jeho útoky: ${p.when}${p.what}`,
  health3: (p) => `${p.health} zdraví`,
  health4: (p) => `${p.health} zdraví (${p.health2})`,
  level: (p) => `úroveň ${p.marked}, `,
  lastsSeconds: (p) => `, trvá ${p.durationSeconds} s`,
  composedCountNameLevelTextHealthTextLasts: (p) =>
    `${p.count} ${p.name} (${p.levelText}${p.healthText}${p.lasts})`,
  itsAttacksDealDamage2: (p) => `Jeho útoky způsobí ${p.value} poškození`,
  onlyOneAtATimeANew: () => "Jen jeden naráz: nový zabije starého",
  leavesCorpseCorpsesWhenItDies: (p) =>
    `Po smrti zanechá ${p.corpses} ${p.current === 1 ? "mrtvolu" : p.current < 5 ? "mrtvoly" : "mrtvol"}`,
  whenItDiesStandsUpInIts: (p) => `Když zemře, na jeho místě povstane ${p.text}`,
  listSemicolon: () => "; ",
  inItsRange2: (p) => AREA_TEXT.get(p.radius) ?? "v jeho dosahu",
  composedAffectsWhere: (p) => `${AURA_WHO[p.affects]} ${p.where}`,
  whenItDiesUnderHealthBeginFor: (p) =>
    `Když zemře, ${p.who} pod ${p.below} zdraví trpí na ${p.duration} s stavem ${p.statusName}`,
  whenItDiesDeadPartyMembersAre: (p) =>
    `Když zemře, mrtví členové skupiny ${p.where} jsou oživeni s ${p.health} % zdraví a bez energie`,
  damageTakeDamageAreHealedForHealth: (p) =>
    p.effect === "damage" ? `utrpí ${p.amount} poškození` : `jsou vyléčeni o ${p.amount} zdraví`,
  max: (p) => ` (max. ${p.max})`,
  whenItDiesPerSecondItLived: (p) =>
    `Když zemře: ${p.who} ${p.what} za každou sekundu, kterou žil${p.max}`,
  everySecondsHealsTheMostHurtNon: (p) =>
    `Každých ${p.everySeconds} s: vyléčí nejvíce zraněného spojence ${p.where}, který není duch, o ${p.heal} zdraví`,
  whenANonSpiritDiesInIts: () => "Když v jeho dosahu zemře něco, co není duch",
  nearby2: (p) => AREA_TEXT.get(p.radius) ?? "poblíž",
  itsConditionsSpreadToEachNonSpirit: (p) =>
    `${p.when}, jeho stavy se rozšíří na každého tvora ${p.where}, který není duch a má stav`,
  eachOfItsTypeInItsRange: (p) =>
    `${p.when}, každý tvor jeho druhu v jeho dosahu s méně než ${p.below} zdraví utrpí ${p.damage} poškození`,
  holdingAnItem: (p) => (p.onlyWhileHoldingItem ? ", kteří drží předmět" : ""),
  composedWhoWhereHoldingStatus: (p) => `${p.who} ${p.where}${p.holding}: ${p.status}`,
  perFoeHit: (p) => (p.perTarget === undefined ? "" : " za každého zasaženého nepřítele"),
  forEachMeleeAttackSkillOnYour: (p) =>
    ` za každou útočnou dovednost zblízka na tvé liště (nejvýše ${p.max})`,
  withinEarshot: (p) => p.area,
  forEverySummonedCreatureYouControlMaximum: (p) =>
    ` za každého vyvolaného tvora ${p.where} pod tvou kontrolou (nejvýše ${p.max} energie)`,
  composedZeroAloneEachText: (p) => (p.zero ? `${p.alone} ${p.each}` : `${p.text}, +${p.each}`),
  maximum: (p) => ` (nejvýše ${p.max})`,
  forEach: (p) => `za ${p.countEach}${p.max}`,
  pointOfEnergyGained: () => "každý získaný bod energie",
  pointOfEnergyRestrictedByOvercast: () => "každý bod energie blokovaný přepětím",
  skillDisabledInThisWay: () => "každou takto deaktivovanou dovednost",
  orCasterOnYou: (p) =>
    `každé: ${categoryIds(p.categories)} ${p.on === "caster" ? "na tobě" : p.onTarget}`,
  ofYourRecharging: (p) => `každou z tvých obnovujících se dovedností (${p.rechargingSkillsNoun})`,
  pointOfEnergyCasterYouHaveThey: (p) =>
    `každý bod energie, který ${p.on === "caster" ? "máš" : "má"}`,
  orRemoved: (p) => `každé odstranění (${categoryIds(p.categories)})`,
  orLost: (p) => `každou ztrátu (${p.name}: ${categoryIds(p.categories)})`,
  enchantmentYouAreMaintaining: () => "každé očarování, které udržuješ",
  secondItWasInEffect: () => "každou sekundu, po kterou působilo",
  foeKnockedDown: () => "každého sraženého nepřítele",
  youHaveEquipped: (p) => `každou položku na tvé liště (${spaced(p.type)})`,
  adrenalineSkillTheyHave: () => "každou adrenalinovou dovednost, kterou má",
  foeHit: () => "každého zasaženého nepřítele",
  within4: (p) => `${p.perCountNoun} ${within(p.radius, p.radius2)}`,
  attacksSkillsS: (p) =>
    p.weapon !== undefined
      ? weaponAttacks(p.weapon)
      : p.type === undefined
        ? "dovednosti"
        : pluralNoun(spaced(p.type)),
  casterYourTargetS: (p) => (p.on === "caster" ? "tvoje" : "jeho"),
  s3: (p) => pluralNoun(p.perCountNoun),
  pointOfOvercast: () => "bod přepětí",
  skillDisabled: () => "deaktivovaná dovednost",
  rechargingSkill: () => "obnovující se dovednost",
  pointOfEnergy: () => "bod energie",
  removedOr: (p) => `odstranění (${categoryIds(p.categories)})`,
  removedOr2: (p) => `odstranění (${p.name}: ${categoryIds(p.categories)})`,
  maintainedEnchantment: () => "udržované očarování",
  secondHeld: () => "držená sekunda",
  adrenalineSkill: () => "adrenalinová dovednost",
  deadAlly: () => "mrtvý spojenec",
  knockedDownFoeFoe: (p) => (p.knockedDown === true ? "sražený nepřítel" : "nepřítel"),
  ally: () => "spojenec",
  neverAbove: (p) => `, nikdy nad ${p.upTo}`,
  forEachRemoved: (p) =>
    p.toTarget === true || p.perRemoved === undefined
      ? ""
      : ` za každé odstranění: ${CATEGORY[p.perRemoved].one}`,
  perPointLost: (p) => (p.perEnergyLost === undefined ? "" : " za každý ztracený bod"),
  armorPenetration: (p) => ` (${p.armorPenetration} % průrazu brnění)`,
  dealsDamage2: (p) =>
    `Způsobí ${p.magnitude} ${damageCounted(p.type)}${p.perPointLost}${p.penetration}`,
  deals: () => "Způsobí",
  damage2: (p) => ` ${damageCounted(p.type)}`,
  composedCountedConditionAmount: (p) => `${p.counted}; ${lowerFirst(p.condition)}: +${p.amount}`,
  gainHealthEqualToThisSpellS: () => "Získej zdraví ve výši bonusu Božské přízně tohoto kouzla",
  healsIfRelievedOf: (p) => `Vyléčí ${p.amount} zdraví, pokud je zbaven: ${p.name}`,
  healsForOfYourCurrentHealthMaximum: (p) =>
    `Vyléčí ${p.magnitude} tvého aktuálního zdraví (nejvýše ${p.max} zdraví)`,
  youGainHealth: (p) => `Získáš ${p.amount} zdraví`,
  yourPetGainsHealth: (p) => `Tvé zvíře získá ${p.amount} zdraví`,
  ownerHealsItsOwnerForHealsFor: (p) =>
    p.recipient === "owner"
      ? `Vyléčí svého majitele o ${p.amount} zdraví`
      : `Vyléčí ${p.amount} zdraví`,
  healsForEachRemovedHealsForEach: (p) =>
    p.perRemoved !== undefined
      ? `Vyléčí ${p.amount} zdraví za každé odstranění: ${CATEGORY[p.perRemoved].one}`
      : p.perDestroyedSpirit === true
        ? `Vyléčí ${p.amount} zdraví za každého zničeného ducha`
        : p.perEnergyLost === true
          ? `${p.recipient === "caster" ? "Jsi vyléčen o" : "Vyléčí"} ${p.amount} zdraví za každý ztracený bod energie`
          : p.perUsedSkillEnergy === true
            ? `Vyléčí ${p.magnitude} ceny energie kouzla`
            : p.value,
  casterYouGainHeals: (p) => (p.recipient === "caster" ? "Získáš" : "Vyléčí"),
  health5: () => " zdraví",
  casterOnTargetFoeOnThem: (p) => (p.recipient === "caster" ? "na cílovém nepříteli" : "na nich"),
  underHealth: (p) => `, pod ${p.onlyBelowHealthFraction} % zdraví`,
  gainOfTheSkillSBaseEnergy: (p) => `Získej ${p.magnitude} základní ceny energie dovednosti`,
  targetGainsOwnerYouGainGain: (p) =>
    p.toTarget === true ? "Cíl získá" : p.recipient === "owner" ? "Získáš" : "Získej",
  energy5: (p) =>
    `${p.gains} ${p.magnitude} energie${p.perPointLost}${p.perFoeHit}${p.perOwnCreature}${p.perRemoved}`,
  energy6: () => " energie",
  gain2: () => "Získej",
  onTargetFoe: () => "na cílovém nepříteli",
  strikeStrikesOfAdrenalineAdrenaline: (p) =>
    p.units
      ? `${p.magnitude} ${p.current === 1 ? "úder" : p.current < 5 ? "údery" : "úderů"} adrenalinu`
      : `${p.magnitude} adrenalinu`,
  youGain2: () => "Získáš",
  targetTargetGainsGain: (p) => (p.recipient === "target" ? "Cíl získá" : "Získej"),
  strikesOfAdrenaline: () => " úderů adrenalinu",
  targetRegainsAllEnergy: () => "Cíl získá zpět všechnu energii",
  casterYouLoseTargetLoses: (p) => (p.on === "caster" ? "Ztratíš" : "Cíl ztratí"),
  energy7: (p) => `${p.who} ${p.magnitude} energie`,
  stealsUpToEnergy: (p) => `Ukradne až ${p.magnitude} energie`,
  stealsUpToHealth: (p) => `Ukradne až ${p.magnitude} zdraví`,
  youStealHealth: (p) => `Ukradneš ${p.magnitude} zdraví`,
  youSacrificeOfYourMaximumHealth: (p) => `Obětuješ ${p.percentOfMax} % svého maximálního zdraví`,
  targetFoeLosesHealth: (p) => `Cílový nepřítel ztratí ${p.magnitude} zdraví`,
  targetFoeLoses: () => "Cílový nepřítel ztratí",
  youLoseHealth: (p) => `Ztratíš ${p.magnitude} zdraví`,
  forEachEnchantmentRemoved: (p) => `${p.lose} za každé odstraněné očarování (${p.whose})`,
  loseAllButHealth: (p) => `Ztrať všechno zdraví kromě ${p.magnitude}`,
  transferOfYourConditionsToFoes: (p) =>
    `Přenese ${p.magnitude} tvých stavů na ${accusativePlural(p.foesWithin)}`,
  max2: (p) => (p.maxSeconds === undefined ? "" : ` (max. ${seconds(p.maxSeconds)})`),
  withTheTimeEachHasLeft: () => "se zbývajícím časem každého z nich",
  withMoreTime: (p) => `s o ${p.extend} % delším časem${p.max}`,
  foesGetTheTargetSConditionsWith: (p) => `${p.foesWithin} získají stavy cíle, ${p.value}`,
  loseYourHealthHealForOfIt: (p) =>
    `Ztrať ${shareOfYourHealth(p.fractionOfCurrent)}; vyléč si ${p.magnitude} % z toho`,
  whoeverOfYouAndTargetFoeHas: () =>
    "Kdo z tebe a cílového nepřítele má více zdraví, ztratí polovinu rozdílu; druhý získá stejně",
  stacksOnceForEachOnThem: (p) => `. Sčítá se jednou za ${p.countEach}`,
  stacksOnceForEachOnThem2: (p) => p.status + p.value,
  forWord3: (p) => `na ${p.durationSeconds}: ${p.what}`,
  forEachHexRemoved: (p) => ` za každé odstraněné prokletí (${p.name}))`,
  stackingOnceForEachOnThem: (p) => `, sčítá se jednou za ${p.countEach}`,
  appliesCasterToYouForUntilIt: (p) =>
    `Uvalí ${p.statusName}${p.on === "caster" ? " na tebe" : ""} ` +
    (p.ends ? `na ${p.statusDuration} ` : "do jeho skončení ") +
    `(${p.status}` +
    p.value +
    p.value2,
  composedStatusNameDurationSeconds: (p) => `${p.statusName} (${p.durationSeconds})`,
  appliesOneOfAtRandom: (p) => `Náhodně uvalí jedno z: ${p.choices}`,
  maintainedCasterOnYouEnergyRegenerationWhile: (p) =>
    `Udržováno${p.on === "caster" ? " na tobě" : ""}: −1 regenerace energie, dokud trvá. ` +
    `${capitalize(p.what)}.`,
  losesThatSame: (p) => `Ztratí totéž: ${CATEGORY[p.category].acc}`,
  casterLoseRemoves: (p) => (p.from === "caster" ? "Ztrať" : "Odstraní"),
  oneForEachRemovedMax: (p) =>
    `${p.verb} ${CATEGORY[p.category].acc} za každé odstranění: ${CATEGORY[p.category2].one} (max. ${p.max})`,
  oneForEachOnTarget: (p) => `${p.verb} ${CATEGORY[p.category].acc} za ${p.countEach}`,
  lose2: (p) => `Ztrať ${p.count} ${owned(categoryNoun(p.count2, p.category), p.whose)}`,
  endsTheTargetSStance: () => "Ukončí postoj cíle",
  forEachSpiritWithinOfIt: (p) =>
    ` za každého ducha ${AREA_AROUND_TARGET.get(p.near) ?? `do ${p.near2} od cíle`}`,
  numberUpTo: (p) => (typeof p.count === "number" && p.count > 1 ? "až " : ""),
  and4: (p) => (p.orCategory === undefined ? "" : ` a ${categoryNoun(p.count, p.orCategory)}`),
  removes: (p) =>
    `Odstraní ${p.upTo}${p.count} ${owned(categoryNoun(p.count2, p.category), p.whose)}${p.and}${p.perSpirit}`,
  interruptsTheTargetSSpellIfThey: () => "Přeruší kouzlo cíle, pokud nějaké sesílá",
  interruptsTheTargetSSpellOrChant: () => "Přeruší kouzlo nebo zpěv cíle, pokud nějaký sesílá",
  skillInterruptsTheTargetSSkillIf: (p) =>
    p.only === "skill"
      ? "Přeruší dovednost cíle, pokud nějakou používá"
      : "Přeruší akci cíle: dovednost nebo útok",
  youAreKnockedDownFor: (p) => `Jsi sražen k zemi na ${seconds(p.durationSeconds)}`,
  knocksDownFor: (p) => `Srazí k zemi na ${seconds(p.durationSeconds)}`,
  shadowStepsToTheTarget: () => "Udělá stínový krok k cíli",
  youAndTheTargetShadowStepTo: () => "Ty a cíl uděláte stínový krok na místo toho druhého",
  corpseTeleportsYouToThatCorpseShadow: (p) =>
    p.to === "corpse"
      ? "Teleportuje tě k té mrtvole"
      : "Udělá stínový krok na blízké místo přímo pryč od tvého cíle",
  health6: (p) => `${p.percent} % zdraví`,
  upToYourCurrentHealthYourHealth: (p) =>
    p.casterLosesFractionOfCurrent === 0
      ? "nejvýše tvoje aktuální zdraví"
      : `tvoje zdraví poté, co ztratíš ${shareOfYourHealth(p.casterLosesFractionOfCurrent)}`,
  perPartyMemberWithin: (p) => ` za každého člena skupiny ${within(p.radius, p.radius2)}`,
  casterAndTeleportsTheTargetToYou: (p) => (p.at === "caster" ? " a teleportuje cíl k tobě" : ""),
  returnsTheTargetToLifeWithAnd: (p) =>
    `Oživí cíl s ${p.healthText} a ${p.energy} % energie${p.per}${p.teleport}`,
  returnsEveryDeadAlliedPetToLife: (p) =>
    `Oživí každé mrtvé spojenecké zvíře ${p.where} s ${p.health} % zdraví`,
  youLoseAllYourRemainingEnergy: () => "Ztratíš všechnu zbývající energii",
  youGainFor: (p) => `Získáš ${p.statusName} na ${seconds(p.durationSeconds)} (${p.status})`,
  yourPetGainsFor: (p) => `Tvé zvíře získá ${p.statusName} na ${p.duration} (${p.status})`,
  yourPetMovesToYourTargetAnd: () => "Tvé zvíře běží k tvému cíli a zaútočí na něj",
  teleportsTargetToYou: () => "Teleportuje cíl k tobě",
  destroysTargetAlliedSpirit: () => "Zničí cílového spojeneckého ducha",
  destroysTargetMinion: () => "Zničí cílového přisluhovače",
  nearestSpiritLosesHealthTargetAllyIs: (p) =>
    `Nejbližší duch ztratí ${p.magnitude} zdraví; cílový spojenec je za každý bod vyléčen o ${p.healPerPoint}`,
  nearestSpiritLosesAllEnergyYouGain: (p) =>
    `Nejbližší duch ztratí všechnu energii; získáš ${p.magnitude} % z ní`,
  itsOwnerGainsHealthEqualToThe: () => "Jeho majitel získá zdraví ve výši způsobeného poškození",
  destroysEveryAlliedSpiritWithin: (p) =>
    `Zničí každého spojeneckého ducha ${within(p.radius, p.radius2)}`,
  thisSkillRecharges: () => "Tato dovednost se obnoví o",
  secondsFaster: () => " s rychleji",
  thisSkillRechargesInstantly: () => "Tato dovednost se obnoví okamžitě",
  thisSkillRechargesFaster: (p) => `Tato dovednost se obnoví o ${p.fraction} % rychleji`,
  usedSkillThatSkillRechargesInstantlyThis: (p) =>
    p.of === "used-skill" ? "Ta dovednost se obnoví okamžitě" : "Tato dovednost se obnoví okamžitě",
  loseAllAdrenaline: () => "Ztrať všechen adrenalin",
  rechargesAllYourOtherSkills: () => "Obnoví všechny tvoje ostatní dovednosti",
  rechargesAllYourStances: () => "Obnoví všechny tvoje postoje",
  rechargesAllYourOtherSkills2: (p) =>
    `Obnoví všechny tvoje ostatní ${OTHER_SKILLS[p.which] ?? p.which} dovednosti`,
  rechargesAllYour: (p) => `Obnoví všechny tvoje ${p.rechargedKind}`,
  allOfYourSpiritsDie: () => "Všichni tvoji duchové zemřou",
  summonsPlusOnePerCorpseExploited: (p) =>
    `Vyvolá ${p.text}` +
    (p.perExploitedCorpse === true ? ", a navíc jednoho za každou vytěženou mrtvolu" : ""),
  setsATrap: () => "Nastraží past",
  pulseTargetCreatesASymbolMarksThe: (p) =>
    p.kind === "pulse"
      ? p.anchor === "target"
        ? "Vytvoří symbol"
        : "Označí zem"
      : p.anchor === "corpse"
        ? "Vytvoří studnu"
        : "Vytvoří ochranné znamení",
  forSeconds: (p) => `${p.what} ${p.where} na ${p.magnitude} s`,
  seconds3: (p) => `${p.magnitude} s`,
  forEachSignetYouHaveEquipped: (p) =>
    p.perOwnSignet === true ? " za každou vybavenou pečeť" : "",
  allOfTheTargetSSkillsAre: (p) => `Všechny dovednosti cíle jsou deaktivovány na ${p.time}`,
  theTargetSEliteSkillIsDisabled: (p) => `Elitní dovednost cíle je deaktivována na ${p.time}`,
  oneOfTheTargetSSpellsAt: (p) => `Jedno náhodné kouzlo cíle je deaktivováno na ${p.time}`,
  allOfTheTargetSAttackSkills: (p) =>
    `Všechny útočné dovednosti cíle jsou deaktivovány na ${p.time}`,
  theInterruptedSkillIsDisabledFor: (p) =>
    `Přerušená dovednost je deaktivována na ${p.time}${p.perSignet}`,
  centreInterruptedHoldingThatSkillHaveIt: (p) =>
    p.which === "centre-interrupted"
      ? `kteří mají tu dovednost, ji mají deaktivovanou na ${p.time}`
      : `Tato dovednost a všechny dovednosti stejného atributu jsou deaktivovány na ${p.time}`,
  thisSkillBecomesTheOneYouRemoved: (p) =>
    `Tato dovednost se na ${p.seconds} s změní na tu, kterou jsi odstranil`,
  thisSkillBecomesThatRandomSpellSpell: (p) =>
    `Tato dovednost se na tuto dobu změní na ${p.which === "random-spell" ? "to kouzlo" : "tu dovednost"}`,
  thisSkillBecomesItsTargetSNon: (p) =>
    `Tato dovednost se na ${p.magnitude} s změní na elitní dovednost cíle, která není podoba`,
  takeControlOfTargetEnemySpirit: () => "Převezmi kontrolu nad cílovým nepřátelským duchem",
  becomeYourMinionsWhileYouBear: (p) => `Stanou se tvými přisluhovači, dokud nosíš ${p.name}`,
  targetMinionWithAMasterBecomesMasterless: (p) =>
    `Cílový přisluhovač s pánem zůstane bez pána; přisluhovač bez pána se stane tvým a je vyléčen o ${p.magnitude} zdraví`,
  leadCountsAsALeadAttackCounts: (p) =>
    p.role === "lead" ? "Počítá se jako úvodní útok" : "Počítá se jako vedlejší útok",
  targetSuffersOvercast: (p) => `Cíl utrpí ${p.magnitude} přepětí`,
  thisSkillThisSkillThatSkill: (p) => (p.of === "this-skill" ? "Tato dovednost" : "Ta dovednost"),
  forEachRemoved2: (p) =>
    p.perRemoved === undefined ? "" : ` za každé odstranění: ${CATEGORY[p.perRemoved].one}`,
  takesSecondsLongerToRecharge: (p) => `${p.which} se obnovuje o ${p.magnitude} s déle${p.each}`,
  that: (p) => (p.onlyIf.startsWith("pokud ") ? `, ${p.onlyIf}` : `, kteří ${p.onlyIf}`),
  ifItStrikesAFoe: (p) => `Pokud zasáhne nepřítele${p.whom}: ${lowerFirst(p.text)}`,
  from: (p) => `${p.text} od ${genitive(p.from)}`,
  takeDamageForEachPointOfEnergy: (p) =>
    `utrpí ${p.amount} ${damageCounted(p.type)}` +
    (p.perEnergyLost === undefined ? "" : " za každý ztracený bod energie"),
  areInterruptedAreInterruptedIfCasting: (p) =>
    p.only === undefined ? "jsou přerušeni" : "jsou přerušeni, pokud právě sesílají",
  areKnockedDownForS: (p) => `jsou sraženi k zemi na ${p.durationSeconds} s`,
  foesFoeCreaturesGain: (p) =>
    p.hits === "foes" || p.hits === "foe-creatures" ? p.suffered : `získají ${p.sufferedWhat}`,
  gainHealthEqualToThisSpellS2: () => "získají zdraví ve výši bonusu Božské přízně tohoto kouzla",
  gain3: (p) => {
    const amount = lowerFirst(p.text).replace(/^vyléčí /, "");
    return `získají ${amount.includes("zdraví") ? amount : `${amount} zdraví`}`;
  },
  gainHealth: (p) => `získají ${p.amount} zdraví`,
  loseHealth: (p) => `ztratí ${p.amount} zdraví`,
  youFromEach: (p) => `${lowerFirst(p.text).replace(/^ukradne /, "ukradneš ")} každému z nich`,
  transferAllTheirConditionsToYou: () => "přenes všechny jejich stavy na sebe",
  resurrect: (p) =>
    p.kind === "resurrect"
      ? lowerFirst(p.text).replace(/^oživí cíl/, "jsou oživeni")
      : lowerFirst(p.text),
  and5: (p) => (p.length === 0 ? (p.last ?? "") : `${p.parts} a ${p.last2}`),
  perAlliedMinionsOwnMinionsMinionOne: (p) =>
    `; ${lowerFirst(p.text)} za každého ${p.hits === "allied-minions" || p.hits === "own-minions" ? "přisluhovače" : "z nich"}`,
  per: (p) => ` za ${perCounted(p.perCountNoun)}`,
  damage3: (p) => `${p.amount} ${damageCounted(p.type)}${p.each}`,
  healHealsEnergy: (p) =>
    p.kind === "heal" ? `vyléčí ${p.amount} zdraví${p.each}` : `+${p.amount} energie${p.each}`,
  drainsEnergy: (p) => `vysaje ${p.magnitude} energie`,
  stealsEnergy: (p) => `ukradne ${p.magnitude} energie`,
  stealsHealth: (p) => `ukradne ${p.magnitude} zdraví`,
  resurrectsEnergy: (p) => `oživí, ${p.energy} % energie`,
  resurrectsHealth: (p) => `oživí, ${p.health} % zdraví`,
  resurrectsPetsHealth: (p) => `oživí zvířata, ${p.health} % zdraví`,
  healsOfYourHealth: (p) => `vyléčí ${p.percent} % z ${shareOfYourHealth(p.fractionOfCurrent)}`,
  balancesHealthWithTargetFoe: () => "vyrovná zdraví s cílovým nepřítelem",
  allUpTo: (p) => (p.current === p.Infinity ? "všechny" : `až ${p.moving}`),
  andFoesWithinOfIt: (p) =>
    ` a nepřátelé ${AREA_AROUND_TARGET.get(p.copyToFoesWithin) ?? `do ${p.copyToFoesWithin2} od cíle`}`,
  withOfTheirRemainingDurations: (p) => ` s ${p.durationMultiplier} % jejich zbývajícího trvání`,
  movesConditionsFromFoesWithinOfIt: (p) =>
    `Přesune ${p.count} stavů${p.lasting} z nepřátel ${AREA_AROUND_TARGET.get(p.foesWithin) ?? `do ${p.foesWithin2} od cíle`} na cíl`,
  casterMovesOfYourConditionsToThe: (p) =>
    p.from === "caster"
      ? `Přesune ${p.count === "všechny" ? "všechny tvoje" : `${p.count} tvých`} stavy${p.lasting} na cíl${p.copies}`
      : `Přesune ${p.count} stavů cíle${p.lasting} na tebe`,
  youAreHealedForForEach: (p) => `${p.moves}; za každý stav jsi vyléčen o ${p.magnitude}`,
  areDisabledForSeconds: (p) => `jsou deaktivovány na ${p.seconds} s`,
  allOfYourSkills: (p) => `Všechny tvoje dovednosti ${p.time}`,
  allOfYourOtherSkills: (p) => `Všechny tvoje ostatní dovednosti ${p.time}`,
  allOfYourOtherNonAttackSkills: (p) => `Všechny tvoje ostatní neútočné dovednosti ${p.time}`,
  allOfYourOtherAttackSkillsYour: (p) =>
    p.exceptWeapon === undefined
      ? `Všechny tvoje ostatní útočné dovednosti ${p.time}`
      : `Tvoje útočné dovednosti jinak než ${WEAPON_WORD[p.exceptWeapon]} ${p.time}`,
  allOfYourNonAttackSkills: (p) => `Všechny tvoje neútočné dovednosti ${p.time}`,
  s4: (p) => pluralNoun(typeName(p.type)),
  yourAnd: (p) => `Tvoje ${p.types} ${p.time}`,
  allOfYourSpells: (p) => `Všechna tvoje kouzla ${p.time}`,
  allOfYourOther: (p) => `Všechny tvoje ${p.others ? "ostatní " : ""}${p.name} ${p.time}`,
  exceptAnd: (p) => (p.length === 0 ? "" : ` kromě ${p.except}`),
  allOfYourNonSkills: (p) =>
    `Všechny tvoje dovednosti, které nejsou ${p.name}${p.exceptText} ${p.time}`,
  yourWholeParty: () => "Celá tvoje skupina",
  composedAffectsWhere2: (p) => `${AREA_WHO[p.affects]} ${p.where}`,
  radius: (p) => `poloměr ${p.radius}`,
  andAroundYou: (p) =>
    `${TARGET_TEXT[p.target]} a ${lowerFirst(AREA_WHO[p.affects])} ${p.where} kolem tebe`,
  range: (p) => `dosah ${p.range}`,
  upTo4: (p) => `až ${p.maxTargets} ${p.who}`,
  withinOfIt: (p) => AREA_AROUND_TARGET.get(p.radius) ?? `do ${p.radius2} od cíle`,
  and6: (p) => `${TARGET_TEXT[p.target]} a ${p.count} ${p.where}`,
  rangeRadius: (p) => `dosah ${p.range}, poloměr ${p.radius}`,
  free: () => "Zdarma",
  adrenaline: (p) => `${p.amount} adrenalinu`,
  composedAmount: (p) => ` (${p.amount})`,
  energy8: (p) => `${p.cost} energie${p.base}${p.overcast}`,
  overcast: (p) => `, ${p.overcast} přepětí`,
  instant: () => "Okamžitě",
  composedActivationBase: (p) => (p.activation === p.base ? p.base : `${p.activation} (${p.base})`),
  dealsNoDamage: () => "Nezpůsobí žádné poškození",
  dealsOnlyDamageDamage: (p) =>
    p.weaponless
      ? `Způsobí jen ${p.bonus} ${damageOf(p.damageType)}`
      : `+${p.bonus} ${damageOf(p.damageType)}`,
  damage4: (p) => `${p.condition}: +${p.more} poškození`,
  damageOnThem: (p) => `+${p.amount} poškození ${p.perCount}`,
  cannotBeBlocked2: () => "Nelze zablokovat",
  cannotBeBlocked3: (p) => `${p.condition}: nelze zablokovat`,
  chanceToMissWithOrLess: (p) => `${p.chance} % šance minout s ${p.name} ${p.rank} nebo méně`,
  resultsInACriticalHit: () => "Je kritickým zásahem",
  resultsInACriticalHit2: (p) => `${p.condition}: je kritickým zásahem`,
  hitsUpToAdjacentFoesToo: (p) => `Zasáhne také až ${p.cleaveTargets} sousedních nepřátel`,
  hitsEveryAdjacentFoe: (p) => `${p.condition}: zasáhne každého sousedního nepřítele`,
  armorPenetration2: (p) => `${p.armorPenetration} % průrazu brnění`,
  ifBlocked: (p) => `Pokud je zablokováno: ${lowerFirst(p.text)}`,
  onACriticalHit: (p) => `Při kritickém zásahu: ${lowerFirst(p.text)}`,
  ifItFailsToHit: (p) => `Pokud nezasáhne: ${lowerFirst(p.text)}`,
  asItIsUsed: (p) => `Při použití: ${lowerFirst(p.text)}`,
  allYourPreparationsAreRemoved: () => "Všechny tvoje přípravy jsou odstraněny",
  fliesAsFast: (p) => `Letí ${p.multiplier}× rychleji`,
  fliesAsFast2: (p) => `${p.condition}: letí ${p.multiplier}× rychleji`,
  only: (p) => `; ${lowerFirst(p.condition)}, jen 1`,
  eachDealingLessDamage: (p) => `, každý způsobí o ${p.value} % méně poškození`,
  strikesTwice: () => "Udeří dvakrát",
  strikesTimes: (p) => `Udeří ${p.count}krát`,
  shootsArrowsAtOnce: (p) => `Vystřelí ${p.count} šípů najednou${p.weaker}${p.fewer}`,
  whileActivating: (p) => `Během aktivace: ${p.status}`,
  easilyInterrupted: () => "Snadno přerušitelné",
  failureChanceWithOrLess: (p) => `${p.chance} % šance na selhání s ${p.name} ${p.rank} nebo méně`,
  activatesFasterSlower: (p) =>
    `${p.condition}: aktivuje se o ${p.value} % ${p.multiplier < 1 ? "rychleji" : "pomaleji"}`,
  healthGainFromDivineFavorIsDoubled: () => "Zisk zdraví z Božské přízně je dvojnásobný",
  projectilesEachCanBeDodged: (p) => `${p.shots} střel: každé lze uhnout`,
  aProjectileAtEachFoeEachCan: (p) =>
    p.spread === true ? "Střela na každého nepřítele: každé lze uhnout" : "Střela: lze jí uhnout",
  halfTheNormalRange: () => "Poloviční běžný dosah",
  orSacrificesHealthIfNoneIsNear: (p) =>
    `, nebo obětuje ${p.elseSacrificePercent} % zdraví, pokud žádná není poblíž`,
  targetExploitsTheCorpseNearestYourTarget: (p) =>
    (p.near === "target"
      ? "Vytěží mrtvolu nejblíže tvému cíli"
      : p.all === true
        ? `Vytěží každou čerstvou mrtvolu ${within(p.radius, p.radius2)}`
        : p.pick === "random"
          ? "Vytěží náhodnou mrtvolu"
          : "Vytěží nejbližší mrtvolu") + p.value,
  whileOnYourBarAHealthFights: (p) =>
    `Dokud je na tvé liště, po tvém boku bojuje ${p.name} (${p.companionHealth} zdraví)`,
  disabledForAfterUse: (p) => `Po použití deaktivováno na ${seconds(p.disabledAfterUseSeconds)}`,
  takeAllConditionsFromYourAlliesWith: () =>
    "Převezmi všechny stavy svých spojenců se zbývajícím časem každého z nich",
  hitOrMiss: (p) => `${p.text}, ať zasáhne, nebo ne`,
  eliteFlash: (p) =>
    p.elite || p.flash
      ? `${p.elite ? "Elitní " : ""}${p.flash ? (p.elite ? "bleskové " : "Bleskové ") : ""}${lowerFirst(TYPE_TEXT[p.type])}`
      : TYPE_TEXT[p.type],
  moraleBoost: (p) =>
    p.rechargesOnMoraleBoost === true ? "Zvýšení morálky" : seconds(p.rechargeSeconds),
  hexHexesS2: (p) => pluralNoun(p.kind),
} satisfies DescribeWords as DescribeWords;
