import { EN_WORDS, type DescribeWords } from "@vibewars/game-core";

type Words = DescribeWords;
type Category = Parameters<Words["categoryNoun"]>[1];
type Weapon = Parameters<Words["whileWielding"]>[0]["weapon"];
type DamageKind = Parameters<Words["typeWord"]>[0];
type ChainKind = keyof Words["chainRoleText"];
type SkillKind = keyof Words["typeText"];

/** Dutch has one capital for "ij": "ijzig" starts as "IJzig". */
function capitalize(text: string): string {
  return text.startsWith("ij")
    ? `IJ${text.slice(2)}`
    : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function lowerFirst(text: string): string {
  return text.startsWith("IJ")
    ? `ij${text.slice(2)}`
    : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function seconds(value: number): string {
  // Whole seconds read better than "2,0 s"; fractions keep one decimal.
  return Number.isInteger(value) ? `${String(value)} s` : `${value.toFixed(1).replace(".", ",")} s`;
}

const CATEGORY: Record<Category, { readonly one: string; readonly many: string }> = {
  condition: { one: "conditie", many: "condities" },
  hex: { one: "vloek", many: "vloeken" },
  enchantment: { one: "betovering", many: "betoveringen" },
  stance: { one: "houding", many: "houdingen" },
  preparation: { one: "voorbereiding", many: "voorbereidingen" },
  glyph: { one: "glief", many: "glieven" },
  shout: { one: "kreet", many: "kreten" },
  chant: { one: "gezang", many: "gezangen" },
  echo: { one: "echo", many: "echo's" },
  "weapon-spell": { one: "wapenspreuk", many: "wapenspreuken" },
  item: { one: "voorwerp", many: "voorwerpen" },
  form: { one: "gedaante", many: "gedaanten" },
  "skill-effect": { one: "skilleffect", many: "skilleffecten" },
};

/** Category ids that reach a sentence raw, joined with this file's own "of". */
function categoryIds(text: string): string {
  return text.replace(
    /\b(skill-effect|weapon-spell|condition|hex|enchantment|stance|preparation|glyph|shout|chant|echo|item|form)\b/g,
    (id) => CATEGORY[id as Category].one,
  );
}

function categoryNoun(count: number | "all", category: Category): string {
  return count === 1 ? CATEGORY[category].one : CATEGORY[category].many;
}

function aCategory(category: Category): string {
  return `een ${CATEGORY[category].one}`;
}

/** "geen vloek", "geen andere vloek". */
function noOther(other: string, noun: string): string {
  return `geen ${other === "" ? "" : "andere "}${noun}`;
}

const SKILL_NOUN: Readonly<Record<string, string>> = {
  attack: "aanval",
  spell: "spreuk",
  enchantment: "betovering",
  hex: "vloek",
  signet: "zegel",
  shout: "kreet",
  stance: "houding",
  preparation: "voorbereiding",
  glyph: "glief",
  chant: "gezang",
  echo: "echo",
  "weapon-spell": "wapenspreuk",
  "nature-ritual": "natuurritueel",
  "binding-ritual": "bindingsritueel",
  ward: "wering",
  well: "bron",
  "item-spell": "voorwerpspreuk",
  trap: "val",
  "pet-attack": "petaanval",
  form: "gedaante",
  skill: "skill",
};

/** A skill type id as its Dutch noun; "elite" and the rest pass as they came. */
function spaced(word: string): string {
  return SKILL_NOUN[word] ?? word.replaceAll("-", " ");
}

const PLURAL_ENDINGS: readonly (readonly [RegExp, string])[] = [
  [/punt overspanning$/, "punten overspanning"],
  [/skill$/i, "skills"],
  [/aanval$/, "aanvallen"],
  [/spreuk$/, "spreuken"],
  [/ing$/, "ingen"],
  [/vloek$/, "vloeken"],
  [/zegel$/, "zegels"],
  [/kreet$/, "kreten"],
  [/glief$/, "glieven"],
  [/gezang$/, "gezangen"],
  [/echo$/, "echo's"],
  [/ritueel$/, "rituelen"],
  [/bron$/, "bronnen"],
  [/val$/, "vallen"],
  [/gedaante$/, "gedaanten"],
  [/conditie$/, "condities"],
  [/punt$/, "punten"],
  [/seconde$/, "seconden"],
  [/bondgenoot$/, "bondgenoten"],
  [/vijand$/, "vijanden"],
  [/dienaar$/, "dienaren"],
  [/geest$/, "geesten"],
];

/** A Dutch noun's plural. */
function pluralNoun(noun: string): string {
  for (const [ending, plural] of PLURAL_ENDINGS) {
    if (ending.test(noun)) {
      return noun.replace(ending, plural);
    }
  }
  return noun;
}

const DAMAGE_STEM: Record<DamageKind, string> = {
  slashing: "snij",
  piercing: "steek",
  blunt: "stompe",
  fire: "vuur",
  cold: "koude",
  lightning: "bliksem",
  earth: "aarde",
  chaos: "chaos",
  dark: "duistere",
  holy: "heilige",
  shadow: "schaduw",
  typeless: "",
};

const ADJECTIVE_STEMS: ReadonlySet<string> = new Set(["stompe", "duistere", "heilige"]);

function typeWord(type: DamageKind): string {
  return type === "typeless" ? "" : ` ${DAMAGE_STEM[type]}`;
}

/** A damage stem said by `typeWord` put to its noun: "vuurschade", "heilige schade", "schade". */
function damageOf(stem: string): string {
  const word = stem.trim();
  if (word === "") {
    return "schade";
  }
  return ADJECTIVE_STEMS.has(word) ? `${word} schade` : `${word}schade`;
}

function damageNoun(type: DamageKind): string {
  return damageOf(DAMAGE_STEM[type]);
}

/** Damage named by id, the two broad kinds being adjectives. */
function damageNamed(type: DamageKind | "elemental" | "physical"): string {
  return type === "physical"
    ? "fysieke schade"
    : type === "elemental"
      ? "elementaire schade"
      : damageNoun(type);
}

const NEEDED_WEAPON: Record<Weapon, string> = {
  axe: "een bijl",
  sword: "een zwaard",
  hammer: "een hamer",
  daggers: "dolken",
  scythe: "een zeis",
  spear: "een speer",
  bow: "een boog",
  melee: "een nabijgevechtswapen",
};

const WEAPON_WORD: Record<Weapon, string> = {
  axe: "bijl",
  sword: "zwaard",
  hammer: "hamer",
  daggers: "dolk",
  scythe: "zeis",
  spear: "speer",
  bow: "boog",
  melee: "nabij",
};

function wielding(weapon: Weapon | undefined): string {
  return weapon === undefined
    ? ""
    : weapon === "daggers"
      ? " met dolken in de handen"
      : ` met ${NEEDED_WEAPON[weapon]} in de hand`;
}

function weaponAttacks(weapon: Weapon | undefined): string {
  return weapon === undefined ? "aanvallen" : `${WEAPON_WORD[weapon]}aanvallen`;
}

function attackSkills(weapon: Weapon | undefined): string {
  return weapon === undefined ? "aanvalsskills" : `${WEAPON_WORD[weapon]}aanvalsskills`;
}

const CHAIN_ARTICLED: Record<ChainKind, string> = {
  lead: "een openingsaanval",
  "off-hand": "een nevenhandaanval",
  dual: "een dubbele aanval",
};

const TYPE_TEXT: Words["typeText"] = {
  attack: "Aanval.",
  spell: "Spreuk.",
  enchantment: "Betoveringsspreuk.",
  hex: "Vloekspreuk.",
  signet: "Zegel.",
  shout: "Kreet.",
  stance: "Houding.",
  preparation: "Voorbereiding.",
  glyph: "Glief.",
  chant: "Gezang.",
  echo: "Echo.",
  "weapon-spell": "Wapenspreuk.",
  "nature-ritual": "Natuurritueel.",
  "binding-ritual": "Bindingsritueel.",
  ward: "Weringsspreuk.",
  well: "Bronspreuk.",
  "item-spell": "Voorwerpspreuk.",
  trap: "Val.",
  "pet-attack": "Petaanval.",
  form: "Gedaante.",
  skill: "Skill.",
};

function typeName(type: SkillKind): string {
  return TYPE_TEXT[type].replace(/\.$/, "");
}

const TYPE_STEM: Record<SkillKind, string> = {
  attack: "aanvals",
  spell: "spreuk",
  enchantment: "betoverings",
  hex: "vloek",
  signet: "zegel",
  shout: "kreet",
  stance: "houdings",
  preparation: "voorbereidings",
  glyph: "glief",
  chant: "gezangs",
  echo: "echo",
  "weapon-spell": "wapenspreuk",
  "nature-ritual": "natuurritueel",
  "binding-ritual": "bindingsritueel",
  ward: "werings",
  well: "bron",
  "item-spell": "voorwerp",
  trap: "val",
  "pet-attack": "pet",
  form: "gedaante",
  skill: "skill",
};

/** A joined run of words as one compound: "vuurmagie-spreuk". */
function compound(words: string): string {
  return words
    .replace(/\bprimary\b/g, "primair")
    .replace(/\belemental\b/g, "elementair")
    .trim()
    .replaceAll(" ", "-");
}

/** A 3rd-person singular verb as the 2nd: in Dutch most stay, a few do not. */
function verbToYou(verb: string): string {
  const irregular: Readonly<Record<string, string>> = {
    is: "bent",
    heeft: "hebt",
    kan: "kunt",
    zal: "zult",
  };
  return irregular[verb] ?? verb;
}

const THEY_VERBS: Readonly<Record<string, string>> = {
  is: "zijn",
  heeft: "hebben",
  wordt: "worden",
  kan: "kunnen",
  zal: "zullen",
  krijgt: "krijgen",
  verliest: "verliezen",
  treft: "treffen",
  raakt: "raken",
  valt: "vallen",
  aanvalt: "aanvallen",
  beweegt: "bewegen",
  neemt: "nemen",
  gebruikt: "gebruiken",
  uitspreekt: "uitspreken",
  spreekt: "spreken",
  blokkeert: "blokkeren",
  sterft: "sterven",
  draagt: "dragen",
  houdt: "houden",
  loopt: "lopen",
  gaat: "gaan",
  staat: "staan",
  ligt: "liggen",
  zit: "zitten",
  blijft: "blijven",
  eindigt: "eindigen",
  voert: "voeren",
  uitvoert: "uitvoeren",
};

/** A 3rd-person singular verb as the plural: "wordt" to "worden". */
function verbToThey(verb: string): string {
  return THEY_VERBS[verb] ?? verb.replace(/t$/, "en");
}

/** The clause-final verb of a phrase, changed by `change`. */
function changeLastVerb(phrase: string, change: (verb: string) => string): string {
  return phrase.replace(/(\S+)$/, (verb) => change(verb));
}

/** A clause with its final verb changed, before a closing "dan ..." comparison. */
function changeClause(clause: string, change: (verb: string) => string): string {
  const compared = /^(.*) (dan .*)$/.exec(clause);
  return compared === null
    ? changeLastVerb(clause, change)
    : `${changeLastVerb(compared[1] ?? "", change)} ${compared[2] ?? ""}`;
}

/** "een spreuk uitspreekt" said to its holder, with "zijn" made "je". */
function secondPerson(phrase: string): string {
  return changeLastVerb(phrase, verbToYou)
    .replace(/\bzijn\b/g, "je")
    .replace(/\bzich\b/g, "je")
    .replace(/\bhem\b/g, "jou");
}

/** A `conditionText` with "het doelwit" made "je", the verb following. */
function yourCondition(text: string): string {
  const match = /^Als het doelwit (.*)$/.exec(text);
  if (match === null) {
    return text;
  }
  const said = changeClause(match[1] ?? "", verbToYou);
  return `Als je ${said.replace(/\bzich\b/g, "je").replace(/\bzijn\b/g, "je")}`;
}

function negatedText(text: string): string {
  const no = /^Als (het doelwit|je) niet (.*)$/.exec(text);
  if (no !== null) {
    return `Als ${no[1] ?? ""} ${no[2] ?? ""}`;
  }
  const none = /^Als (het doelwit|je) geen (.*)$/.exec(text);
  if (none !== null) {
    return `Als ${none[1] ?? ""} een ${none[2] ?? ""}`;
  }
  const some = /^Als (het doelwit|je) een (.*)$/.exec(text);
  if (some !== null) {
    return `Als ${some[1] ?? ""} geen ${some[2] ?? ""}`;
  }
  const less = /^Als (het doelwit|je) minder dan (.*)$/.exec(text);
  if (less !== null) {
    return `Als ${less[1] ?? ""} minstens ${less[2] ?? ""}`;
  }
  const plain = /^Als (het doelwit|je) (.*)$/.exec(text);
  if (plain !== null) {
    return `Als ${plain[1] ?? ""} niet ${plain[2] ?? ""}`;
  }
  return `Behalve ${lowerFirst(text)}`;
}

function share(fraction: number): string {
  return fraction === 0.5 ? "de helft" : `${String(Math.round(fraction * 100))}%`;
}

/** `share`, then of what: "de helft van je gezondheid", "25% van je gezondheid". */
function shareOfYourHealth(fraction: number): string {
  return `${share(fraction)} van je gezondheid`;
}

function damageTaken(multiplier: number): string {
  if (multiplier === 2) {
    return "dubbele";
  }
  if (multiplier === 0.5) {
    return "halve";
  }
  return `${String(Math.round(multiplier * 100))}%`;
}

const TRIGGER_WHEN: Words["triggerWhen"] = {
  "bearer-casts-spell": "een spreuk uitspreekt",
  "bearer-attacks": "aanvalt",
  "bearer-attack-begins": "aanvalt",
  "bearer-uses-skill": "een skill gebruikt",
  "bearer-applies-hex": "een vloek oplegt",
  "bearer-hits": "met een aanval raakt",
  "bearer-fails-to-hit": "niet raakt",
  "bearer-takes-physical-damage": "fysieke schade krijgt",
  "bearer-takes-elemental-damage": "elementaire schade krijgt",
  "bearer-takes-damage": "schade krijgt",
  "bearer-takes-damage-from-foe": "schade of levensroof van een vijand krijgt",
  "bearer-health-drops-below": "door schade onder een gezondheidsgrens zakt",
  "bearer-fatal-damage-negated": "dodelijke schade afwendt",
  "bearer-hit-by-attack": "door de aanval van een vijand geraakt wordt",
  "bearer-targeted-by-foe": "het doelwit van een vijandelijke spreuk of aanval wordt",
  "bearer-healed-by-skill": "door een skill genezen wordt",
  "bearer-blocks-melee": "een nabijaanval blokkeert",
  "bearer-blocks-projectile": "een afstandsaanval blokkeert",
  "bearer-blocks": "blokkeert",
  "bearer-interrupted": "onderbroken wordt",
  "bearer-knocked-down": "neergeslagen wordt",
  "bearer-sacrifices-health": "gezondheid offert",
  "bearer-knockdown-prevented": "een neerslag afwendt",
  "bearer-gains-hex-or-enchantment": "een vloek of betovering krijgt",
  "bearer-gains-enchantment": "een betovering krijgt",
  "bearer-loses-enchantment": "een betovering verliest",
  "bearer-loses-condition": "een conditie verliest",
  "bearer-creates-creature": "een wezen schept",
  "bearer-gains-condition": "een nieuwe conditie krijgt",
  "bearer-chant-or-shout-ends": "een gezang of kreet ziet eindigen",
  "bearer-energy-empty": "geen energie meer heeft",
  "bearer-energy-drops-empty": "op 0 energie zakt",
  "source-targets-bearer": "het doelwit van je skill wordt",
  "source-bearer-apart": "ver van je verwijderd is",
  "bearer-dies": "sterft",
  ends: "eindigt",
  "ends-early": "voortijdig eindigt",
  expires: "afloopt",
};

/** A radius table in Dutch: the radii are the game's, only the words change. */
function inDutch(
  table: ReadonlyMap<number, string>,
  dutch: Readonly<Record<string, string>>,
): ReadonlyMap<number, string> {
  return new Map([...table].map(([radius, english]) => [radius, dutch[english] ?? english]));
}

const AREA_TEXT = inDutch(EN_WORDS.areaText, {
  adjacent: "aangrenzend",
  nearby: "dichtbij",
  "in the area": "in het gebied",
  "in earshot": "binnen gehoorsafstand",
  "in compass range": "binnen kompasbereik",
});

const AREA_AROUND_TARGET = inDutch(EN_WORDS.areaAroundTarget, {
  "adjacent to it": "aangrenzend aan het doelwit",
  "nearby it": "dichtbij het doelwit",
  "in the area around it": "in het gebied rond het doelwit",
  "in earshot of it": "binnen gehoorsafstand van het doelwit",
});

const AREA_AROUND_CREATED = inDutch(EN_WORDS.areaAroundCreated, {
  "adjacent to that creature": "aangrenzend aan dat wezen",
  "near that creature": "dichtbij dat wezen",
  "in earshot of that creature": "binnen gehoorsafstand van dat wezen",
});

const AURA_WHO: Words["auraWho"] = {
  all: "Wezens behalve geesten",
  allies: "Bondgenoten behalve geesten",
  foes: "Vijanden behalve geesten",
};

const AREA_WHO: Words["areaWho"] = {
  enemies: "Vijanden",
  allies: "Bondgenoten",
  all: "Iedereen",
};

const SPLASH_SIDE: Words["splashSide"] = {
  foes: "vijanden",
  "foe-creatures": "vijandelijke wezens",
  "foe-minions": "vijandelijke dienaren",
  allies: "bondgenoten",
  "non-spirit-allies": "bondgenoten behalve geesten",
  party: "groepsleden",
  "own-spirits": "je geesten",
  "own-minions": "je andere dienaren",
  "allied-minions": "dienaren van bondgenoten",
};

const TARGET_TEXT: Words["targetText"] = {
  self: "Jijzelf",
  "single-enemy": "Een vijand",
  "single-ally": "Een bondgenoot",
  "single-other-ally": "Een andere bondgenoot",
  "single-any": "Een willekeurig doelwit",
  "single-dead-ally": "Een dode bondgenoot",
  "allied-spirit": "Een bevriende geest",
  "enemy-spirit": "Een vijandelijke geest",
  "enemy-minion": "Een dienaar van een vijand",
  "own-minion": "Een van je dienaren",
  "allied-minion": "Een dienaar van een bondgenoot",
  "allied-summoned-creature": "Een bevriend opgeroepen wezen",
  "single-ally-not-spirit": "Een bondgenoot, geen geest",
  companion: "Je pet",
  "living-companion": "Je levende pet",
};

const TARGETS_WORDS: Words["targetsWords"] = {
  ally: "een bondgenoot",
  "other-ally": "een andere bondgenoot",
  foe: "een vijand",
};

const YOUR_NEXT_SKILL = "de volgende keer dat je een skill gebruikt";
const NEXT_SKILL = "de volgende keer dat het een skill gebruikt";
const DROPPED = "Effect bij laten vallen";

function within(radius: number, radius2: string): string {
  return AREA_TEXT.get(radius) ?? `binnen ${radius2}`;
}

/** A profession before a noun, compounded: "derwisj-betovering"; none says nothing. */
function owned(whose: string): string {
  return whose.trim() === "" ? "" : `${whose.trim()}-`;
}

/** "de volgende keer dat je een nabijaanval blokkeert" answered as "als het een nabijaanval is". */
function blockAnswer(text: string): string {
  return text.replace(
    /^de volgende keer dat (?:je|het) een (.+?) blokkeert$/,
    (_, noun: string) => `als het een ${noun} is`,
  );
}

/** "Aangrenzende vijanden", or after a possessive "Je geesten aangrenzend". */
function placed(adjective: string, after: string, who: string): string {
  return who.startsWith("je ") ? `${capitalize(who)} ${after}` : `${adjective} ${who}`;
}

const OTHER_SKILLS: Readonly<Record<string, string>> = { attack: "aanvals", signet: "zegel" };
const COUNTED: Readonly<Record<string, string>> = {
  enchantment: "betovering",
  hex: "vloek",
  condition: "conditie",
};
const counted = (text: string): string =>
  text.replace(/\b(enchantment|hex|condition)\b/g, (word) => COUNTED[word] ?? word);

const kindedArmor = (text: string): string =>
  text.replace(/^(\S+) (\w+) pantser$/, (whole, amount: string, kind: string) =>
    kind in DAMAGE_STEM
      ? `${amount} pantser tegen ${damageOf(DAMAGE_STEM[kind as DamageKind])}`
      : whole,
  );

/** A "Geneest 50" or "Geneest met 50" as the bare amount of health. */
function healedAmount(text: string): string {
  const amount = lowerFirst(text).replace(/^geneest (?:met |voor )?/, "");
  return amount.includes("gezondheid") ? amount : `${amount} gezondheid`;
}

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
        /^Het vijandelijke doelwit verliest/,
        fromSource ? "je verliest" : bearerIsFoe ? "het verliest" : "verlies",
      )
      .replace(/dat het heeft/, "dat je hebt"),
  bearerWording: (text, bearerIsCaster) =>
    text
      .replace(/^Het doelwit krijgt/, "het krijgt")
      .replace(/^Het doelwit verliest/, bearerIsCaster ? "je verliest" : "het verliest"),
  ifItWording: (text) => text.replace(/^Als het doelwit/, "Als het"),
  gainWording: healedAmount,
  loseTargetWording: (text) => lowerFirst(text).replace(/^het doelwit verliest/, "verliezen"),
  stealsWording: (text) => lowerFirst(text),
  returnedWording: (text) =>
    lowerFirst(text).replace(/^brengt het doelwit weer tot leven/, "komen weer tot leven"),
  yourMinionsWording: (text) => text.replace(/^Je andere dienaren/, "Je dienaren"),
  onlyIfWording: (text) => {
    const match = /^Als het doelwit (.*)$/.exec(text);
    return match === null ? lowerFirst(text) : changeClause(match[1] ?? "", verbToThey);
  },
  splashOnlyClause: (condition) =>
    condition === "" ? "" : condition.startsWith("als ") ? `, ${condition}` : `, die ${condition}`,
  eachOfWording: (reached, condition) =>
    condition === ""
      ? reached
      : condition.startsWith("als ")
        ? `${reached}, ${condition}`
        : `${reached}, die ${condition}`,
  requiresWording: (text) => text.replace(/^Als /, "Alleen als "),
  requirementWording: (text) =>
    text.startsWith("Als ") ? `alleen ${lowerFirst(text)}` : lowerFirst(text),
  requirementLine: (text) => lowerFirst(text).replace(/\.$/, ""),
  anyOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Nooit", ...rest.map((text) => text.replace(/^Als /, ""))].join(" of ");
  },
  allOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Altijd", ...rest.map((text) => text.replace(/^Als /, ""))].join(" en ");
  },
  seconds,
  blockedAttacks: { all: "aanvallen", melee: "nabijaanvallen", projectile: "projectielen" },
  blockedAttack: { all: "aanval", melee: "nabijaanval", projectile: "projectiel" },
  damageTaken,
  triggerWhen: TRIGGER_WHEN,
  secondPerson,
  arrowsWhen: { "bearer-hits": "raken", "bearer-fails-to-hit": "niet raken" },
  chantOrShoutEnds: "telkens als er een gezang of kreet op eindigt",
  energyEmpty: "als zijn energie 0 bereikt",
  dropped: DROPPED,
  targetsWords: TARGETS_WORDS,
  nextSkill: NEXT_SKILL,
  yourNextSkill: YOUR_NEXT_SKILL,
  creates: "telkens als je een wezen schept",
  areaAroundCreated: AREA_AROUND_CREATED,
  nextSkillKind: {
    "attack-skill": ["aanvalsskill", "aanvalsskills"],
    spell: ["spreuk", "spreuken"],
    hex: ["vloek", "vloeken"],
    signet: ["zegel", "zegels"],
    "signet-at-foe": [
      "zegel dat op een vijand gericht is",
      "zegels die op een vijand gericht zijn",
    ],
    "shout-or-chant": ["kreet of gezang", "kreten of gezangen"],
    any: ["skill", "skills"],
  },
  lowerFirst,
  aCategory,
  negatedText,
  yourCondition,
  typeWord,
  splashSide: SPLASH_SIDE,
  auraWho: AURA_WHO,
  groundAnchorText: {
    caster: "op jouw plek",
    corpse: "op zijn plek",
    target: "op de plek van je doelwit",
  },
  share,
  categoryNoun,
  weaponText: {
    axe: "Bijlaanval",
    sword: "Zwaardaanval",
    hammer: "Hameraanval",
    daggers: "Dolkaanval",
    scythe: "Zeisaanval",
    spear: "Speeraanval",
    bow: "Boogaanval",
    melee: "Nabijaanval",
  },
  chainRoleText: {
    lead: "Openingsaanval.",
    "off-hand": "Nevenhandaanval.",
    dual: "Dubbele aanval.",
  },
  followsText: {
    lead: "Moet op een openingsaanval volgen.",
    "off-hand": "Moet op een nevenhandaanval volgen.",
    dual: "Moet op een dubbele aanval volgen.",
  },
  neededWeapon: NEEDED_WEAPON,
  weaponWord: WEAPON_WORD,
  typeText: TYPE_TEXT,
  areaText: AREA_TEXT,
  areaAroundTarget: AREA_AROUND_TARGET,
  targetText: TARGET_TEXT,
  areaWho: AREA_WHO,
  s: () => " s",
  onTarget: () => "op het doelwit",
  composedLastsAtBase: (p) => (p.lasts === p.at ? p.base : `${seconds(p.lasts)} (${p.base})`),
  attributes: (p) => `${p.name}-attributen`,
  attributes2: () => "attributen",
  attributePrimaryS: (p) =>
    p.scope === "primary" ? "primair attribuut" : "elementaire attributen",
  setTo: (p) => `${p.scope} op ${p.rank} gezet`,
  allAttributes: () => "alle attributen",
  toAllAllAttributes: (p) => `${p.amount} op ${p.value}`,
  renewedWheneverAChantOrShoutEnds: (p) =>
    `vernieuwt zich zodra een gezang of kreet op ${p.selfOnly ? "jou" : "hem"} eindigt`,
  renewedWheneverYouCastItCastsA: (p) =>
    `vernieuwt zich zodra ${p.selfOnly ? "je een spreuk uitspreekt" : "het een spreuk uitspreekt"}`,
  reappliedWheneverYouCastItCastsA: (p) =>
    `wordt opnieuw toegepast zodra ${p.selfOnly ? "je een spreuk op een vijand uitspreekt" : "het een spreuk op een vijand uitspreekt"}`,
  renewedWheneverYouTakeItTakesElemental: (p) =>
    `vernieuwt zich zodra ${p.selfOnly ? "je elementaire schade krijgt" : "het elementaire schade krijgt"}`,
  renewedWheneverAnEnchantmentOnYouIt: (p) =>
    `vernieuwt zich zodra een betovering op ${p.selfOnly ? "jou" : "hem"} eindigt`,
  gainAdrenalineFasterSlower: (p) =>
    `krijgt adrenaline ${p.shown} ${p.faster > 0 ? "sneller" : "langzamer"}`,
  onTheBearerExpireFaster: (p) => `${p.what} op de drager lopen ${p.stat} sneller af`,
  enchantmentsAndStances: () => "betoveringen en houdingen",
  enchantments: () => "betoveringen",
  stances: () => "houdingen",
  yourAttacksAgainstItHaveCriticalChance: (p) =>
    `je aanvallen ertegen hebben ${p.criticalChanceBonus}% kans op kritieke treffers`,
  armorAgainstYourAttacksWhileItHas: (p) =>
    `${p.armorModifier} pantser tegen je aanvallen${p.onlyWhileNoOtherHex ? ", zolang het geen andere vloek heeft" : ""}`,
  youTheBearer: (p) => (p.selfOnly ? "jou" : "de drager"),
  endsIfYouEndsIfTheBearer: (p) =>
    p.selfOnly ? `eindigt als je ${secondPerson(p.phrase)}` : `eindigt als de drager ${p.phrase}`,
  healthDegeneration: (p) => `−${p.healthPips} gezondheidsdegeneratie`,
  healthRegeneration: (p) => `+${p.healthPips} gezondheidsregeneratie`,
  healthRegenerationForEachEnchantmentOnYou: (p) =>
    `+${p.pips} gezondheidsregeneratie per betovering op jou (hoogstens ${p.max})`,
  energyDegeneration: (p) => `−${p.energyPips} energiedegeneratie`,
  energyRegeneration: (p) => `+${p.energyPips} energieregeneratie`,
  healthRegenerationForEachConditionOnYou: (p) =>
    `${p.healthPipsPerCondition} gezondheidsregeneratie per conditie op jou`,
  health: () => "gezondheids",
  hex: () => "vloek",
  energy: () => "energie",
  condition: () => "conditie",
  regenerationForEachOnYou: (p) => `${p.pips} ${p.what}regeneratie per ${p.each} op jou`,
  armorWhileWielding: (p) => `${p.sign}${p.armorModifier} pantser${wielding(p.weapon)}`,
  armorWhileNotMoving: (p) => `${p.armorWhileStill} pantser bij stilstand`,
  healthPerSecondWhileMoving: (p) =>
    `${p.healthPerSecondWhileMoving} gezondheid per seconde in beweging`,
  healthPerSecond: (p) => `+${p.healthPerSecond} gezondheid per seconde`,
  healthPerSecondMoreInEarshotOf: (p) =>
    `+${p.healthPerSecondNearSpirit} gezondheid per seconde meer binnen gehoorsafstand van een geest`,
  spellsCastInEarshotOfASpirit: (p) =>
    `spreuken die binnen gehoorsafstand van een geest worden uitgesproken, laden ${p.faster}% sneller op`,
  chanceToDoubleStrikeWhileWielding: (p) =>
    `+${p.chance}% kans op een dubbele slag${wielding(p.weapon)}`,
  armorNotBelow: (p) => `−${p.amount} pantser (niet onder ${p.floor})`,
  movesAtSpeed: (p) => `beweegt met ${p.speed}% snelheid`,
  movesAtSpeedWhileEnchanted: (p) => `beweegt met ${p.speed}% snelheid zolang het betoverd is`,
  speedBoostsHaveNoEffect: () => "snelheidsboosts hebben geen effect",
  cannotGainAdrenaline: () => "kan geen adrenaline krijgen",
  whenThisEndsYouReturnToWhere: () =>
    "als dit eindigt, keer je terug naar waar je het hebt uitgesproken",
  whenThisEndsYouShadowStepTo: (p) =>
    `als dit eindigt, maak je een schaduwstap naar de bondgenoot op wie je het hebt uitgesproken, en al je skills zijn ${p.seconds} seconden uitgeschakeld`,
  ofAttacksMiss: (p) => `${p.attackMissChance}% van de aanvallen mist`,
  maximumHealthAtMost: (p) => `−${p.fraction}% maximale gezondheid (hoogstens ${p.cap})`,
  maximumHealth: (p) => `+${p.maxHealthBonus} maximale gezondheid`,
  maximumHealthPerEnchantment: (p) =>
    `+${p.maxHealthBonusPerEnchantment} maximale gezondheid per betovering`,
  maximumEnergy: (p) => `+${p.maxEnergyBonus} maximale energie`,
  maximumHealthPerPointOfMaximumEnergy: (p) =>
    `+${p.per} maximale gezondheid per punt maximale energie`,
  yourMinionsDealDamage: (p) => `je dienaren doen ${p.minionDamageBonus} schade`,
  loseMaximumHealthEachTimeAMinion: (p) =>
    `verliest ${p.minionHitHealthLossPercent}% maximale gezondheid telkens als een van je dienaren raakt`,
  conditionsYouWouldReceiveGoToYour: () =>
    "condities die je zou krijgen, gaan in plaats daarvan naar je dichtstbijzijnde dienaar",
  healing: (p) => `${p.more ? "+" : "−"}${p.change} genezing`,
  weaponDamage: (p) => `${p.change}% wapenschade`,
  dealsDamage: (p) => `doet ${p.more ? "+" : "−"}${p.change} schade`,
  noDeathPenalty: () => "geen doodstraf",
  whenTheBearerDiesSoDoesIts: () => "als de drager sterft, sterft ook zijn bezweerder",
  alliesYouResurrectReturnWithHealthAnd: (p) =>
    `bondgenoten die jij doet herrijzen, keren terug met +${p.health} gezondheid en +${p.energy} energie`,
  youDieTheBearerDiesWhenIt: (p) =>
    p.selfOnly ? "je sterft als het eindigt" : "de drager sterft als het eindigt",
  leavesAnExploitedCorpse: () => "laat een uitgebuit lijk achter",
  takeFromPhysicalDamage: (p) => `krijgt ${p.sign}${p.amount} door fysieke schade`,
  elementalDamageTakenIsDamage: (p) =>
    `gekregen elementaire schade is ${damageNoun(p.elementalDamageTakenAs)}`,
  physicalDamageTakenIsDamage: (p) =>
    `gekregen fysieke schade is ${damageNoun(p.physicalDamageTakenAs)}`,
  physicalDamageDealtIsDamage: (p) =>
    `aangerichte fysieke schade is ${damageNoun(p.physicalDamageDealtAs)}`,
  elementalDamageDealtIsDamage: (p) =>
    `aangerichte elementaire schade is ${damageNoun(p.elementalDamageDealtAs)}`,
  takeFromSpiritsAttacks: (p) => `krijgt ${p.damageFromSpiritAttacks} door aanvallen van geesten`,
  attacksAttacksDealDamage: (p) =>
    `${capitalize(weaponAttacks(p.weapon))} doen ${damageNoun(p.attackDamageType)}`,
  attacksHaveArmorPenetration: (p) =>
    `aanvallen hebben ${p.attackArmorPenetration}% pantserdoorboring`,
  attacksAttacksDealLessMoreDamage: (p) =>
    `${weaponAttacks(p.weapon)} doen ${p.amount} ${p.delta < 0 ? "minder" : "meer"} schade`,
  and: () => " en ",
  immuneToAnd: (p) => `immuun voor ${p.names}`,
  setOnFire: () => "in brand gezet",
  or: () => " of ",
  cannotBeOr: (p) => `kan niet ${p.names} worden`,
  attacksFromAttacks: (p) =>
    `${p.adrenalineGain}${p.adrenalineGainFasterFrom === "attacks" ? " door aanvallen" : ""}`,
  yourEliteEliteSkillSUse: (p) =>
    `je ${p.skillType === "elite" ? "eliteskills" : pluralNoun(spaced(p.skillType))} gebruiken ${p.name}`,
  uses: (p) => `${spaced(p.skillType)}-gebruiken`,
  sUse: (p) => `de volgende ${p.uses} ${pluralNoun(spaced(p.skillType))} gebruiken`,
  yourNext: (p) => `je volgende ${p.next} ${p.name}`,
  spellsTakeAsLongToCast: (p) => `spreuken uitspreken duurt ${p.castTimeMultiplier}× zo lang`,
  skillsButAttacksTakeAsLongTo: (p) =>
    `skills behalve aanvallen activeren duurt ${p.skillActivationMultiplier}× zo lang`,
  spellsAreInterruptedByAttacks: () => "spreuken worden door aanvallen onderbroken",
  slowerFaster: (p) => (p.attackDurationMultiplier > 1 ? "langzamer" : "sneller"),
  attacksWhileWielding: (p) => `valt ${p.change}% ${p.way} aan${wielding(p.weapon)}`,
  conditionsYouApplyLastLongerWhileWielding: (p) =>
    `condities die je oplegt, duren ${p.longer}% langer${wielding(p.weapon)}`,
  enchantmentsYouMaintainCostTheUpkeep: (p) =>
    `betoveringen die je onderhoudt, kosten ${p.upkeepMultiplier}× het onderhoud`,
  spellsThatCauseOvercastCauseMoreAs: (p) =>
    `spreuken die overspanning veroorzaken, veroorzaken bij voltooiing ${p.overcastSurcharge} meer`,
  arrowsMoveAsFast: (p) => `pijlen vliegen ${p.projectileSpeedMultiplier}× zo snel`,
  cannotCastSpells: () => "kan geen spreuken uitspreken",
  cannotAttack: () => "kan niet aanvallen",
  cannotUseResurrectionSkills: () => "kan geen wederopstandingsskills gebruiken",
  cannotBeTheTargetOfEnemySpells: (p) =>
    p.whileCasting
      ? "kan tijdens het uitspreken niet het doelwit van vijandelijke spreuken zijn"
      : "kan niet het doelwit van vijandelijke spreuken zijn",
  cannotBeTheTargetOfSpells: () => "kan niet het doelwit van spreuken zijn",
  hostileSpellsTargetingYouFail: () => "vijandige spreuken die op jou gericht zijn, mislukken",
  attacksAgainstYouMiss: () => "aanvallen tegen jou missen",
  strippedOfAllEnchantmentsAndCannotBe: () =>
    "verliest alle betoveringen en kan niet betoverd worden",
  cannotBeTheTargetOfEnchantments: () => "kan niet het doelwit van betoveringen zijn",
  cannotUseShoutsOrChants: () => "kan geen kreten of gezangen gebruiken",
  cannotUseSignets: () => "kan geen zegels gebruiken",
  cannotBlockItsCasterSAttacks: () => "kan de aanvallen van zijn bezweerder niet blokkeren",
  cannotBeBlockedByBlindedFoes: () => "kan niet door verblinde vijanden geblokkeerd worden",
  cannotBlock: () => "kan niet blokkeren",
  renewedForSecondsIfMovingAsIt: (p) =>
    `vernieuwt zich ${p.renewsWhileMoving} seconden als het bij het einde in beweging is`,
  cannotBeKnockedDown: () => "kan niet neergeslagen worden",
  cannotBeKnockedDownByAFoe: () => "kan niet door een vijand neergeslagen worden",
  endsIfItPreventsAKnockdown: () => "eindigt als het een neerslag afwendt",
  youDoNotSufferExtraDamageFrom: () => "je krijgt geen extra schade door kritieke aanvallen",
  cannotLandCriticalHits: () => "kan geen kritieke treffers maken",
  immuneToCriticalHits: () => "immuun voor kritieke treffers",
  spellsHaveDoubleTheDivineFavorBonus: (p) =>
    `${p.attribute}-spreuken hebben de dubbele bonus van Goddelijke gunst`,
  attackSkillAttackSkills: (p) =>
    p.once
      ? p.attackSkillsOnly === true
        ? "aanvalsskill"
        : { all: "aanval", melee: "nabijaanval", projectile: "projectiel" }[p.against]
      : p.attackSkillsOnly === true
        ? "aanvalsskills"
        : { all: "aanvallen", melee: "nabijaanvallen", projectile: "projectielen" }[p.against],
  whileBelowHealth: (p) => ` onder ${p.blockBelowHealth}% gezondheid`,
  whileUnderOr: (p) => ` onder invloed van ${p.value}`,
  fromFoesUnderOr: (p) => ` van vijanden onder invloed van ${p.value}`,
  whileAttacking: (p) => (p.blockWhileAttacking ? " bij het aanvallen" : ""),
  blocksTheNextChanceToBlock: (p) =>
    p.once
      ? `blokkeert de volgende: ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`
      : `${p.chance}% kans om te blokkeren: ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`,
  within: (p) => within(p.radius, p.radius2),
  alliesTo: (p) => `bondgenoten ${p.around} bij ${p.bearer}: ${p.status}`,
  whileWielding: (p) => wielding(p.weapon),
  whileHoldingAWeaponOtherThan: (p) =>
    ` met een ander wapen in de hand dan ${NEEDED_WEAPON[p.not]}`,
  againstFoesThatAreNotMoving: (p) =>
    p.criticalChanceBonusVersus === undefined ? "" : " tegen vijanden die niet bewegen",
  criticalChance: (p) => `${p.chance}% kans op kritieke treffers${p.holding}${p.versus}`,
  gainEnergyPerCriticalHit: (p) => `krijgt ${p.energyPerCritical} energie per kritieke treffer`,
  wheneverYouSuccessfullyLandACriticalHit: (p) =>
    `telkens als je een kritieke treffer maakt, krijg je ${p.healthPerCritical} gezondheid`,
  refreshesEveryTimeYouLandACritical: () =>
    "vernieuwt zich telkens als je een kritieke treffer maakt",
  theNextTimeYouLandACritical: (p) =>
    p.endsWhenFired
      ? "de volgende keer dat je een kritieke treffer maakt"
      : "telkens als je een kritieke treffer maakt",
  with: (p) =>
    p.weapon === undefined ? p.critical : `${p.critical} met ${NEEDED_WEAPON[p.weapon]}`,
  removeStatusFromYourTarget: (p) =>
    p.kind === "remove-status"
      ? `${p.when}: ${lowerFirst(p.text)} van je doelwit`
      : `${p.when}: ${lowerFirst(p.text)}`,
  ifOneIsRemovedYouLoseEnergy: (p) =>
    `wordt er een verwijderd, dan verlies je ${p.energyIfRemoved} energie of dit eindigt`,
  endsAfterIncomingAttackS: (p) =>
    `eindigt na ${p.endsAfterAttacks} ${p.endsAfterAttacks2 === 1 ? "inkomende aanval" : "inkomende aanvallen"}`,
  endsAfterYourNextAttackSHit: (p) =>
    p.endsAfterAttackCount2 === 1
      ? "eindigt na je volgende aanval, raak, mis of geblokkeerd"
      : `eindigt na je volgende ${p.endsAfterAttackCount} aanvallen, raak, mis of geblokkeerd`,
  noEffectWhileUnderOr: (p) => `geen effect onder invloed van ${p.suppressedWhileUnder}`,
  yourNextAttackSCannotBeBlocked: (p) =>
    p.unblockableAttacks2 === 1
      ? "je volgende aanval kan niet geblokkeerd worden"
      : `je volgende ${p.unblockableAttacks} aanvallen kunnen niet geblokkeerd worden`,
  attacksCannotBeBlocked: (p) => `${weaponAttacks(p.weapon)} kunnen niet geblokkeerd worden`,
  whileYouWieldAnAWeapon: (p) =>
    `zolang je een ${damageNoun(p.weaponDamage)}-wapen hanteert, ${p.hit}`,
  forEachEnchantmentRemovedSCasterLoses: (p) =>
    `per verwijderde ${p.name}-betovering verliest de bezweerder van ${p.name2} ${p.percentOfMax}% van zijn maximale gezondheid`,
  with2: (p) => (p.weapon === undefined ? "" : ` met ${NEEDED_WEAPON[p.weapon]}`),
  endsAfterHitS: (p) => `eindigt na ${p.count} ${p.count2 === 1 ? "treffer" : "treffers"}${p.how}`,
  spellSpells: (p) => (p.one ? "spreuk" : `${p.count} spreuken`),
  yourNextCostsCostLessEnergy: (p) =>
    `je volgende ${p.next} ${p.one ? "kost" : "kosten"} ${p.costReduction} minder energie`,
  yourNextRechargesRechargeFaster: (p) =>
    `je volgende ${p.next} ${p.one ? "laadt" : "laden"} ${p.rechargeFaster}% sneller op`,
  forYourNext: (p) => `voor je volgende ${p.next}`,
  theirProjectilesMoveAsFast: (p) =>
    `hun projectielen vliegen ${p.projectileSpeedMultiplier}× zo snel`,
  noOvercast: () => "geen overspanning",
  spreadsToAdjacentCombatants: () => "verspreidt zich naar aangrenzende strijders",
  nextAttackSkillDamage: (p) => `volgende aanvalsskill: ${p.condition}: +${p.more} schade`,
  attacks: () => "aanvalt",
  makesAMeleeAttack: () => "een nabijaanval uitvoert",
  moves: () => "beweegt",
  takesDamage: (p) => `krijgt ${p.damageTakenMultiplier} schade`,
  takesDamageFromTheNextAttack: (p) =>
    `krijgt ${damageTaken(p.attackDamageTakenMultiplier)} schade door de volgende aanval`,
  damageTaken2: (p) => `−${p.damageReduction} gekregen schade`,
  damageTakenPerRankOfAtMost: (p) =>
    `−${p.now} gekregen schade (${p.perRank} per rang ${p.attribute}, hoogstens ${p.max})`,
  damageTakenMoreEachHit: (p) => `−${p.step} gekregen schade, ${p.step} meer bij elke treffer`,
  theNextHitDealsLessDamage: (p) =>
    `de volgende treffer doet ${p.nextDamageReduction} minder schade`,
  damageTakenWhileCastingS: (p) =>
    `−${p.amount} gekregen schade bij het uitspreken van ${pluralNoun(spaced(p.skillType))}`,
  lessDamage: (p) => `${p.value}% minder ${damageNoun(p.type)}`,
  lessDamageFromFoesWithAHex: (p) =>
    `${p.fraction}% minder schade van vijanden met een ${p.name}-vloek`,
  lessDamageFromFoesSufferingFrom: (p) =>
    `${p.fraction}% minder schade van vijanden die last hebben van ${p.name}`,
  damageTakenFromFoesWithLessHealth: (p) =>
    `−${p.damageReductionFromWeakerFoe} gekregen schade van vijanden met minder gezondheid`,
  damageTakenFromFoesWithACondition: (p) =>
    `−${p.damageReductionFromConditionedFoe} gekregen schade van vijanden met een conditie`,
  lessDamageFromSpells: (p) => `${p.less}% minder schade door spreuken`,
  damageOverInASecondIsHealed: (p) => `schade boven ${p.cap} per seconde wordt genezen`,
  physicalItsPhysicalDamageTheDamageIt: (p) =>
    p.from === "physical" ? "zijn fysieke schade" : "de schade die het door aanvallen krijgt",
  whichTakesLessOfIt: (p) => `, die daarvan ${p.reduction} minder krijgt`,
  goesToItsCaster: (p) => `${share(p.fraction)} van ${p.hits} gaat naar zijn bezweerder${p.less}`,
  theDamageYouTakeGoesToYour: (p) =>
    `${share(p.redirectsDamageToMinion)} van de schade die je krijgt, gaat naar je dichtstbijzijnde dienaar`,
  damageFromASingleHitIsCapped: (p) =>
    `schade door één treffer is begrensd op ${p.maxDamageFractionPerHit}% van de maximale gezondheid`,
  eachHitItCapsCostsTheCaster: (p) =>
    `elke begrensde treffer kost de bezweerder ${p.casterEnergyPerReduction} energie, en het eindigt als de bezweerder niet kan betalen`,
  damageFromASingleAttackIsCapped: (p) =>
    `schade door één aanval is begrensd op ${p.attackDamageCapFraction}% van de maximale gezondheid`,
  lifeStolen: (p) => `−${p.lifeStealReduction} gestolen gezondheid`,
  yourHealthSacrificesAreLarger: (p) =>
    `je gezondheidsoffers zijn ${p.sacrificeMultiplier}% groter`,
  knockdownsLastAtLeastS: (p) => `neerslagen duren minstens ${p.knockdownMinSeconds} s`,
  itsSpiritLosesHealthEachTime: (p) =>
    `zijn geest verliest elke keer ${p.sourceLosesHealth} gezondheid`,
  reappliedAsItWouldEndWhileYou: (p) =>
    `wordt bij het eindigen opnieuw toegepast zolang ${p.selfOnly ? "je nog een vloek hebt" : "het nog een vloek heeft"}`,
  chantsAndShoutsLastLongerOnIt: (p) => `gezangen en kreten duren op hem ${p.longer}% langer`,
  attacksDealLessMoreDamage: (p) =>
    `aanvallen doen ${p.attackDamageDelta} ${p.attackDamageDelta2 < 0 ? "minder" : "meer"} schade`,
  movesFaster: (p) => `beweegt ${p.moveSpeedMultiplier}% sneller`,
  healthRegenerationDegeneration: (p) =>
    `${p.healthPips} gezondheids${p.healthPips2 > 0 ? "regeneratie" : "degeneratie"}`,
  armor: (p) => `${p.armorModifier} pantser`,
  attacksFaster: (p) => `valt ${p.value}% sneller aan`,
  aOr: (p) => `een ${categoryIds(p.categories)}`,
  listComma: () => ", ",
  whileUnderOr2: (p) => `onder invloed van ${p.under}: ${p.gains}`,
  once: () => "één keer",
  times: (p) => `${p.stat} keer`,
  endsAfterItTakesEffect: (p) => `eindigt nadat het ${p.times} heeft gewerkt`,
  theNextHexFailsAndItsCaster: (p) =>
    `de volgende vloek mislukt en zijn bezweerder krijgt ${p.damage} schade`,
  theNextSpellItCastsAtFoe: (p) =>
    `de volgende spreuk die het op ${p.on === "foe-targeted" ? "een vijand" : "een bondgenoot"} uitspreekt, mislukt: ${p.what}`,
  theNextTouchSkillsUsedAgainstYou: (p) =>
    `de volgende ${p.failsFoeTouchSkills} aanrakingsskills tegen jou mislukken`,
  foesWithinFoes: (p) =>
    p.area === undefined ? `vijanden binnen ${p.radius}` : `vijanden ${p.area}`,
  moreEachSecond: (p) => `, ${p.growth} meer per seconde`,
  eachSecondItAndTakeDamage: (p) =>
    `elke seconde krijgen ${p.hitsBearer ? "het en " : ""}${p.foes} ${p.damage} ${p.kind === "" ? damageOf("") : damageNoun(p.kind.trim() as DamageKind)}${p.more}`,
  second: () => "seconde",
  seconds2: (p) => `${p.every} seconden`,
  everySecondSeconds: (p) => `elke ${p.value}: ${p.what}`,
  itsSpiritLosesHealthForEachOne: (p) =>
    `zijn geest verliest ${p.amount} gezondheid per verwond doelwit`,
  itsSpiritLosesHealthForEachOne2: (p) =>
    `zijn geest verliest ${p.amount} gezondheid per genezen doelwit`,
  everyAttack: () => "van elke aanval",
  theNextAttack: () => "van de volgende aanval",
  theNextAttacks: (p) => `van de volgende ${p.times} aanvallen`,
  typelessAsDamage: (p) => (p.type === "typeless" ? "" : ` als ${damageNoun(p.type)}`),
  ofTheDamageOfThatHitIt: (p) =>
    `${p.share}% van de schade ${p.attacks} die het raken, gaat terug naar de aanvaller${p.kind}, tot ${p.max}`,
  eachAttackItLandsHasAChance: (p) =>
    `elke treffer van hem heeft ${p.chance}% kans om in plaats daarvan hemzelf de schade te doen, tot ${p.max}`,
  theNextDamageOrLifeStealHeals: (p) =>
    `de volgende schade of levensroof geneest in plaats daarvan evenveel, tot ${p.reversesNextDamage}`,
  theNextDamageIsNegatedAndIts: (p) =>
    `de volgende schade wordt opgeheven en de bron krijgt die in plaats daarvan, tot ${p.cap}`,
  meleeAttacksNeitherHitNorFailTo: (p) =>
    `nabijaanvallen raken noch missen en doen in plaats daarvan elk ${p.damage} schade`,
  allDamageHealsForThatMuchInstead: (p) =>
    `alle schade geneest in plaats daarvan evenveel, tot ${p.cap} per treffer`,
  theNextDamageOrLifeStealThat: (p) =>
    `de volgende schade of levensroof die ${p.selfOnly ? "jou" : "het"} zou doden, wordt opgeheven`,
  whenOneAllySIsSpentIt: () =>
    "is het bij één bondgenoot verbruikt, dan eindigt het bij alle anderen",
  gainMoreStrikeStrikesOfAdrenalinePer: (p) =>
    `krijgt per treffer ${p.extraStrikesPerHit} ${p.extraStrikesPerHit2 === 1 ? "slag" : "slagen"} adrenaline meer`,
  skillsRechargeFaster: (p) => `skills laden ${p.skillRechargeFaster}% sneller op`,
  skillsCostMoreLessEnergy: (p) =>
    `skills kosten ${p.change}% ${p.change2 > 0 ? "meer" : "minder"} energie`,
  spellsAndBindingRitualsRechargeFaster: (p) =>
    `spreuken en bindingsrituelen laden ${p.faster}% sneller op`,
  spellsRechargeFaster: (p) => `spreuken laden ${p.spellRechargeFaster}% sneller op`,
  bindingRitualsRechargeFaster: (p) => `bindingsrituelen laden ${p.faster}% sneller op`,
  enchantmentsRechargeFaster: (p) => `${p.name}-betoveringen laden ${p.faster}% sneller op`,
  hexTheTargetSYour: (p) => (p.category === "hex" ? "zijn" : "je"),
  skillsHaveArmorPenetration: (p) => `${p.name}-skills hebben ${p.pierce}% pantserdoorboring`,
  yourTheBearerSSkillsCannotBe: (p) =>
    `${p.selfOnly ? "je skills kunnen" : "de skills van de drager kunnen"} niet onderbroken worden`,
  theNextTimeYouWouldBeInterrupted: () =>
    "de volgende keer dat je onderbroken zou worden, gebeurt dat niet",
  youCannotBeInterruptedEachTimeYou: (p) =>
    `je kunt niet onderbroken worden; elke keer dat het zou gebeuren, verlies je ${p.amount} energie of dit eindigt`,
  youCannotBeInterruptedEachTimeYou2: (p) =>
    `je kunt niet onderbroken worden; elke keer dat het zou gebeuren, verlies je 1 ${p.profession}-betovering of dit eindigt`,
  conditionsOnExpireFaster: (p) => `condities op ${p.bearer} lopen ${p.faster} sneller af`,
  hexesOnExpireFaster: (p) => `vloeken op ${p.bearer} lopen ${p.faster}% sneller af`,
  theNextHexOnLastsLonger: (p) =>
    `de volgende ${p.of}-vloek op ${p.bearer} duurt ${p.longer} langer`,
  hexesCastOnTakeAsLongTo: (p) => `vloeken uitspreken op ${p.bearer} duurt ${p.times}× zo lang`,
  otherAlliesSpellsOnTakeAsLong: (p) =>
    `spreuken van andere bondgenoten op ${p.bearer} uitspreken duurt ${p.times}× zo lang`,
  yourSpellsOnTakeAsLongTo: (p) =>
    `je spreuken op ${p.bearer} uitspreken duurt ${p.times}× zo lang`,
  enchantmentsCastOnCostLessEnergyMinimum: (p) =>
    `betoveringen op ${p.bearer} kosten ${p.less} minder energie, minimaal 1`,
  hitsWithAnAttack: () => "met een aanval raakt",
  failsToHit: () => "niet raakt",
  hitsWithAnAttackSkill: () => "met een aanvalsskill raakt",
  skillEffectEndsIfYouUseA: (p) =>
    p.selfOnly || p.category === "skill-effect"
      ? "eindigt als je een skill gebruikt"
      : "eindigt als de drager een skill gebruikt",
  endsIfYouUseAnAdrenalSkill: () => "eindigt als je een adrenalineskill gebruikt",
  endsIfYouUseANonAdrenal: () => "eindigt als je een niet-adrenalineskill gebruikt",
  endsIfYouUseANonSkill: (p) => `eindigt als je een niet-${p.kind}-skill gebruikt`,
  endsIfYouUseAnAttackSkill: () => "eindigt als je een aanvalsskill gebruikt",
  endsIfYouUseASkillOn: () => "eindigt als je er een skill op gebruikt",
  endsIfYouUseASkillThat: (p) =>
    `eindigt als je een skill gebruikt die geen ${p.NEXT_SKILL_KIND} is`,
  hexHexedEnchanted: (p) => (p.category === "hex" ? "vervloekt" : "betoverd"),
  becomesOr: (p) => `${p.gained} wordt`,
  theBearerIsDestroyedWhenItExpires: () => "de drager wordt vernietigd als het afloopt",
  theMinionsYouItTookBecomeMasterless: (p) =>
    `de dienaren die ${p.selfOnly ? "je hebt overgenomen" : "het heeft overgenomen"}, worden meesterloos als het eindigt`,
  whenTheBearerDiesRisesWhereIt: (p) =>
    p.masterless === true
      ? `als de drager sterft, staat ${p.stands} meesterloos op zijn plek op`
      : `als het sterft, staat ${p.stands} op zijn plek op`,
  composedKindBoundWhenOn: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.on],
  endsIfItEndsIfYou: (p) =>
    p.onFoe ? `eindigt als het ${p.when}` : `eindigt als je ${secondPerson(p.when)}`,
  all: (p) => (p.once && p.against === "all" ? blockAnswer(p.text) : p.text),
  whileHoldingAnItem: (p) =>
    p.onlyWhileHoldingItem && !p.holdingSaid
      ? `${p.stats}, zolang er een voorwerp wordt vastgehouden`
      : p.stats,
  composedIndexText: (p) => (p.index === 0 ? p.text : capitalize(p.text)),
  listSentence: () => ". ",
  physicalAttacks: (p) =>
    p.weapon !== undefined
      ? weaponAttacks(p.weapon)
      : p.physicalOnly
        ? "fysieke aanvallen"
        : "aanvallen",
  attackSkillsPhysicalAttacks: (p) => (p.attackSkillsOnly ? attackSkills(p.weapon) : p.value),
  foesYourHitGetFor: (p) =>
    `vijanden die je ${p.attacks} raken, krijgen ${p.durationSeconds} lang ${p.statusName}`,
  foesYourHitTake: (p) => `vijanden die je ${p.attacks} raken, krijgen ${p.riderDamage}`,
  foesYourHitLose: (p) =>
    `vijanden die je ${p.attacks} raken, verliezen ${p.count} ${categoryNoun(p.count2, p.category)}`,
  andSoDoFoesAdjacentToThem: (p) => `${p.pop}, en aan hen aangrenzende vijanden ook`,
  stealUpToHealth: (p) => `${p.attacks} stelen tot ${p.amount} gezondheid`,
  yourPetSAttacksHealYouFor: (p) => `de aanvallen van je pet genezen jou ${p.amount}`,
  yourInterruptFoesTheyHit: (p) => `je ${p.attacks} onderbreken geraakte vijanden`,
  your: (p) => `je ${p.attacks}: ${p.text}`,
  attackSkillsPhysicalAttacks2: (p) =>
    p.attackSkillsOnly
      ? attackSkills(p.weapon)
      : p.weapon === undefined
        ? "fysieke aanvallen"
        : weaponAttacks(p.weapon),
  foesThatBlockYourGetFor: (p) =>
    `vijanden die je ${p.attacks} blokkeren, krijgen ${p.durationSeconds} lang ${p.statusName}`,
  foesThatBlockYour: (p) => `vijanden die je ${p.attacks} blokkeren: ${lowerFirst(p.text)}`,
  damage: (p) => `${p.amount} ${damageNoun(p.type)}`,
  physical: () => "fysieke",
  elemental: () => "elementaire",
  armor2: () => "pantser",
  listSpace: () => " ",
  againstProjectileAttacks: (p) =>
    p.projectile ? `${kindedArmor(p.text)} tegen afstandsaanvallen` : kindedArmor(p.text),
  thatAllyIsHealedFor: (p) => `die bondgenoot geneest ${p.amount}`,
  youLoseItsCasterLoses: (p) => (p.bearerIsCaster ? "je verliest" : "zijn bezweerder verliest"),
  energy2: (p) => `${p.who} ${p.amount} energie`,
  orSpell: (p) => `${p.value}-spreuk`,
  wheneverYouCastItCastsAnA: (p) =>
    `telkens als ${p.bearerIsCaster ? "je" : "het"} een ${compound(p.spell)} op een bondgenoot uitspreekt, ${p.value}`,
  composedKindBoundWhenEvent: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.event],
  youOrItOr: (p) => (p.bearerIsCaster ? `je ${p.phrases}` : `het ${p.phrases2}`),
  whenItOrOrAtOnce: (p) => (p.length === 0 ? p.death : `als het ${p.others}, of meteen ${p.death}`),
  whenItOr: (p) => `als het ${p.on}`,
  composedBearerIsCaster: (p) => (p.bearerIsCaster ? YOUR_NEXT_SKILL : NEXT_SKILL),
  theNextTime: (p) => `de volgende keer dat ${p.doer}`,
  composedEventWhenOf: (p) =>
    p.event === "bearer-hits"
      ? "raken"
      : p.event === "bearer-fails-to-hit"
        ? "niet raken"
        : p.whenOf,
  wheneverYourArrowsOr: (p) => `telkens als je pijlen ${p.on}`,
  wheneverOnACreatureWithLessHealth: (p) =>
    `telkens als ${p.doer}${p.victimHasLessHealth === undefined ? "" : " op een wezen met minder gezondheid"}`,
  and2: () => " en ",
  andAnd: (p) => (p.when === undefined ? p.each : `${p.when}: ${p.each}`),
  youItAnd: (p) => `${p.when}: ${p.bearerIsCaster ? "jij" : "het"} en ${p.answer}`,
  youAndAllPartyMembersAreHealed: (p) => `${DROPPED}: jij en alle groepsleden genezen ${p.healed}`,
  composedWhat: (p) => `${DROPPED}: ${p.what}`,
  meleeHitsWithAMeleeAttackHits: (p) =>
    p.weapon === "melee" ? "met een nabijaanval raakt" : `met ${NEEDED_WEAPON[p.weapon]} raakt`,
  meleeIsHitByAFoeS: (p) =>
    p.weapon === "melee"
      ? "door de nabijaanval van een vijand geraakt wordt"
      : `door de aanval van een vijand met ${NEEDED_WEAPON[p.weapon]} geraakt wordt`,
  with3: (p) => `met ${NEEDED_WEAPON[p.weapon]} ${TRIGGER_WHEN[p.event]}`,
  youGainEnergy: (p) => `je krijgt ${p.amount} energie`,
  allYourSkillsAreRecharged: () => "al je skills zijn opgeladen",
  yourPartyIsHealedFor: (p) => `je groep geneest ${p.amount}`,
  takeDamage: (p) => `${lowerFirst(p.upTo)} krijgen ${p.amount} ${damageNoun(p.type)}`,
  areHealedFor: (p) => `${lowerFirst(p.upTo)} genezen ${p.amount}`,
  composedUpToText: (p) => `${lowerFirst(p.upTo)}: ${lowerFirst(p.text)}`,
  ifTargetFoeDiesWhileHexedWith: (p) =>
    p.bearerIsFoe
      ? "als de doelvijand sterft terwijl hij hiermee vervloekt is"
      : "als een bondgenoot sterft terwijl hij hiermee betoverd is",
  and3: (p) => `${p.who}, ${p.flatMap}`,
  hasASpellInterrupted: () => "bij een spreuk onderbroken wordt",
  isStruckForDamageWhileUsingA: (p) =>
    `tijdens het gebruik van een skill geraakt wordt door ${damageNamed(p.damageType)}`,
  takesDamageFromAFoe: (p) => `van een vijand ${damageNamed(p.damageType)} krijgt`,
  takesMoreThanDamageFromAFoe: (p) => `van een vijand meer dan ${p.minDamage} schade krijgt`,
  hasItsHealthDroppedBelowByDamage: (p) => `door schade onder ${p.healthBelow}% gezondheid zakt`,
  isMoreThanFromYou: (p) => `meer dan ${p.apartBeyond} van je verwijderd is`,
  hitsWithAAttack: (p) => `met ${CHAIN_ARTICLED[p.chainRole]} raakt`,
  isHitByAnAttackAAttack: (p) =>
    `door ${p.role === undefined ? "een aanval" : CHAIN_ARTICLED[p.role]} van zijn bezweerder geraakt wordt`,
  blocksAAttack: (p) =>
    `een ${p.blocked === "melee" ? "nabijaanval" : p.blocked === "projectile" ? "afstandsaanval" : p.blocked} blokkeert`,
  losesAEnchantment: (p) => `een ${p.name}-betovering verliest`,
  hex2: (p) => compound(`${p.scopeAdjective} vloek`),
  appliesAnAToAFoe: (p) => `een vijand een ${compound(p.words)} oplegt`,
  spell: (p) => (p.type === undefined ? "spreuk" : typeName(p.type)),
  onAllyAnAllyAFoe: (p) => ` op ${p.targets === "ally" ? "een bondgenoot" : "een vijand"}`,
  castsAnA: (p) => `${p.on.trim()} een ${compound(p.words)} uitspreekt`.trim(),
  non: (p) => `niet-${TYPE_STEM[p.notType]}`,
  elite: () => "elite",
  adrenal: () => "adrenaline",
  skill: () => "skill",
  isTargetedByYour: (p) => `het doelwit van je ${compound(p.words)} wordt`,
  on: (p) => (p.targets === undefined ? "" : ` op ${TARGETS_WORDS[p.targets]}`),
  usesAnA: (p) => `${p.on.trim()} een ${compound(p.words)} gebruikt`.trim(),
  health2: (p) => `${p.amount} gezondheid`,
  energy3: (p) => `${p.amount} energie`,
  takeDamage2: (p) => `krijgen ${p.amount} ${damageNoun(p.type)}`,
  loseAllAllS: (p) =>
    `verliezen ${p.value} ${p.count === 1 ? CATEGORY[p.category].one : CATEGORY[p.category].many}`,
  all2: (p) => `alle ${p.side}`,
  upTo: (p) => `tot ${p.maxTargets} ${p.side}`,
  withinOfThatCreature: (p) =>
    AREA_AROUND_CREATED.get(p.radius) ?? `binnen ${p.radius2} rond dat wezen`,
  gain: (p) => `krijgen ${p.answer}`,
  youGain: (p) => `${p.when}: ${p.gains ? `je krijgt ${p.answers}` : p.answers}`,
  onIt: () => "op hem",
  damageOnIt: (p) => `${p.value}${p.amount} ${damageNoun(p.type)} ${p.perCount}`,
  composedWhenWhat: (p) => `${p.when}: ${p.what}`,
  itsAdjacentAllies: () => "zijn aangrenzende bondgenoten",
  itsAlliesWithin: (p) => `zijn bondgenoten ${p.area ?? `binnen ${p.radius}`}`,
  itsAdjacentAlliesItsAlliesWithin: (p) =>
    !p.bearerIsFoe ? `${lowerFirst(p.foesWithin)}${p.only}` : p.value,
  bearerBlocksMeleeMeleeProjectile: (p) => (p.on === "bearer-blocks-melee" ? "nabij" : "afstands"),
  whenYouBlockYouAndAlliesAre: (p) =>
    `als je blokkeert, genezen jij en bondgenoten ${p.area} ${p.amount}`,
  eachBlockCostsYouEnergyOrThis: (p) =>
    `elke blokkering kost je ${p.amount} energie of dit eindigt`,
  youGainEnergyForEachSuccessfulAttack: (p) =>
    `je krijgt ${p.amount} energie per geblokkeerde ${p.kind}aanval`,
  wheneverYouBlockAAttackThisWay: (p) =>
    `telkens als je zo een ${p.kind}aanval blokkeert, krijgt de aanvaller ${p.amount} ${damageNoun(p.type)}`,
  withinOfYouFoes: (p) => `vijanden ${AREA_TEXT.get(p.radius) ?? `binnen ${p.radius2} van je`}`,
  ifYouBlockAAttackSufferFrom: (p) =>
    `als je een ${p.kind}aanval blokkeert, krijgen ${p.foes} ${p.resolveMagnitudeAtRanks} seconden lang ${p.statusName}`,
  ifYouBlockAAttack: (p) =>
    `als je een ${p.kind}aanval blokkeert, ${p.foes}: ${lowerFirst(p.text)}`,
  stealsHealthFromThatFoe: (p) => `steelt ${p.amount} gezondheid van die vijand`,
  loses: (p) => `verliest ${p.count} ${categoryNoun(p.count2, p.category)}`,
  itTakesDamage: (p) => `het krijgt ${p.amount} ${damageNoun(p.type)}`,
  takeDamage3: (p) => `${p.splashed} krijgen ${p.amount} ${damageNoun(p.type)}`,
  thatAttackIsInterruptedAndAnd: (p) => `${p.when}, wordt die aanval onderbroken en ${p.hurt}`,
  itIsInterruptedAndYouLoseEnergy: (p) =>
    `${p.when}, wordt het onderbroken en verlies je ${p.amount} energie of dit eindigt`,
  ofThatSkillSBaseEnergyCost: (p) => `${p.share} van de basisenergiekosten van die skill`,
  energy4: (p) => `${p.amount} energie`,
  youAreHealedAreHealedIsHealed: (p) =>
    p.bearerIsCaster && p.length === 0 ? "je geneest" : p.bearerIsCaster ? "genezen" : "geneest",
  forOfThatSkillSEnergyCost: (p) => `${p.healed} ${p.share} van de energiekosten van die skill`,
  forWord: (p) => `${p.healed} ${p.amount}`,
  plus: () => " plus ",
  youGainGainsPlus: (p) => `${p.bearerIsCaster ? "je krijgt" : "krijgt"} ${p.gains}`,
  theNearestOf: (p) => `de dichtstbijzijnde van ${p.splashed}`,
  upTo2: (p) => `tot ${p.maxTargets} ${p.splashed}`,
  itAndLoseEnergy: (p) => `het en ${p.others} verliezen ${p.amount} energie`,
  bearerFoesFoesOtherFoes: (p) => (p.to === "bearer-foes" ? "vijanden" : "andere vijanden"),
  inTheAreaSufferItToo: (p) => `${p.who} in het gebied krijgen het ook`,
  ifASpellItThatSkill: (p) => (p.spellsOnly ? "als het een spreuk is, die" : "die skill"),
  takesThisSkillSSlotForSeconds: (p) =>
    `${p.which} neemt ${p.seconds} seconden de plaats van deze skill in`,
  youEnterTheSameStance: () => "je neemt dezelfde houding aan",
  youLoseEnergyOrThisEnds: (p) => `je verliest ${p.amount} energie of dit eindigt`,
  thatAttackIsInterrupted: (p) => `${p.when}, wordt die aanval onderbroken`,
  takes: (p) => `krijgt ${p.dealt} ${p.when}`,
  bearerFatalDamageNegatedAnd: (p) =>
    p.on === "bearer-fatal-damage-negated" ? "en" : `${p.when},`,
  theFoeWhoDealtItTakesDamage: (p) =>
    `${p.then} krijgt de vijand die het veroorzaakte ${p.amount} ${damageNoun(p.type)}`,
  thatAttackerIsHealedFor: (p) => `${p.when}, geneest die aanvaller ${p.amount}`,
  bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p) =>
    p.on === "bearer-gains-enchantment" ? "betovering" : "vloek of betovering",
  theCasterOfThatTakesDamage: (p) =>
    `${p.when}, krijgt de bezweerder van die ${p.gained} ${p.amount} ${damageNoun(p.type)}`,
  theHealerTakesDamage: (p) => `${p.when}, krijgt de genezer ${p.amount} ${damageNoun(p.type)}`,
  ofThatTarget: (p) => `${lowerFirst(p.upTo)} van dat doelwit ${p.what}${p.paid}`,
  healsItsCasterFor: (p) => `geneest zijn bezweerder ${p.amount}, ${p.when}`,
  itsCasterGainsEnergy: (p) => `zijn bezweerder krijgt ${p.amount} energie, ${p.when}`,
  theNextSkillYouUseItUses: (p) =>
    `de volgende skill die ${p.bearerIsCaster ? "je gebruikt" : "het gebruikt"}, doet er ${p.seconds} seconden langer over om op te laden`,
  itsCasterStealsHealth: (p) => `zijn bezweerder steelt ${p.amount} gezondheid, ${p.when}`,
  theNearestOfTakes: (p) => `de dichtstbijzijnde van ${p.allies} krijgt`,
  take: (p) => `${p.allies} krijgen`,
  upToTake: (p) => `tot ${p.maxTargets} ${p.allies} krijgen`,
  composedAlliesText: (p) => `${p.allies}: ${lowerFirst(p.text)}`,
  onAFoe: (p) => `${p.when} bij een vijand`,
  adjacentToYou: () => "aangrenzend aan jou",
  withinAroundYou: (p) => `${p.area ?? `binnen ${p.radius}`} om je heen`,
  otherAdjacentToYouWithinAroundYou: (p) =>
    `${p.includesCentre === true ? "" : "andere "}${SPLASH_SIDE[p.hits]} ${p.value}`,
  takeDamage4: (p) => `${p.yours}, ${p.reached} krijgen ${p.amount} ${damageNoun(p.type)}`,
  composedYoursReachedText: (p) => `${p.yours}, ${p.reached}: ${lowerFirst(p.text)}`,
  composedBearerIsCasterSaid: (p) =>
    p.bearerIsCaster ? yourCondition(p.said) : p.said.replace(/^Als het doelwit/, "Als het"),
  composedWhenConditionText: (p) => `${p.when}, ${p.condition}: ${lowerFirst(p.text)}`,
  bearer: (p) => lowerFirst(p.target === "bearer" ? p.bearer : p.text),
  nextAttackSkill: (p) => `volgende aanvalsskill: ${p.statusName} ${p.durationSeconds}`,
  nextAttackSkill2: (p) => `volgende aanvalsskill: ${p.text}`,
  skillTargetAroundItsTarget: (p) => (p.at === "skill-target" ? " (rond zijn doelwit)" : ""),
  withYourNext: (p) => `bij je volgende ${p.next}${p.around}: ${lowerFirst(p.text)}`,
  costsCostEnergy: (p) => `${p.one ? "kost" : "kosten"} ${p.energyBase} energie`,
  costsCostLessEnergy: (p) => `${p.one ? "kost" : "kosten"} ${p.energyPercentOff} minder energie`,
  costsCostLessEnergyMinimum: (p) =>
    `${p.one ? "kost" : "kosten"} ${p.energyDiscount} minder energie (minimaal ${p.energyFloor})`,
  costsCostMoreEnergy: (p) => `${p.one ? "kost" : "kosten"} ${p.energySurcharge} meer energie`,
  castsCastInstantly: (p) => `${p.one ? "wordt" : "worden"} meteen uitgesproken`,
  castsCastFaster: (p) =>
    `${p.one ? "wordt" : "worden"} ${p.activationMultiplier} sneller uitgesproken`,
  takesTakeAsLongToCast: (p) =>
    `${p.one ? "duurt" : "duren"} ${p.activationMultiplier}× zo lang om uit te spreken`,
  castsCastFaster2: (p) =>
    `${p.one ? "wordt" : "worden"} ${p.activationSecondsLess} sneller uitgesproken`,
  rechargesRechargeFaster: (p) => `${p.one ? "laadt" : "laden"} ${p.rechargeFaster} sneller op`,
  rechargesRechargeSlower: (p) => `${p.one ? "laadt" : "laden"} ${p.rechargeSlower} langzamer op`,
  lastsLastLongerShorter: (p) =>
    `${p.one ? "duurt" : "duren"} ${p.durationMultiplier} ${p.durationMultiplier2 > 1 ? "langer" : "korter"}`,
  healsHealLessMoreNotTheDivine: (p) =>
    `${p.one ? "geneest" : "genezen"} ${p.value} ${p.healMultiplier < 1 ? "minder" : "meer"}${p.sparesDivineFavor ? ", niet de bonus van Goddelijke gunst" : ""}`,
  isAreNotEasilyInterrupted: (p) => `${p.one ? "is" : "zijn"} niet makkelijk te onderbreken`,
  overcastYouBy: (p) => `geven jou ${p.overcastPerUse} overspanning`,
  andAttack: (p) =>
    `${p.chainRoles
      .replace(/\boff-hand\b/g, "nevenhand")
      .replace(/\bdual\b/g, "dubbel")
      .replace(/\blead\b/g, "openings")
      .replaceAll(" en ", "- en ")}aanval`,
  attackSkillSkill: (p) =>
    p.weapon !== undefined
      ? `${WEAPON_WORD[p.weapon]}aanvalsskill`
      : p.type === undefined
        ? "skill"
        : spaced(p.type),
  hexHexesS: (p) => (p.one ? p.kind : pluralNoun(p.kind)),
  thatTargetsAFoeThatTargetA: () => "tegen een vijand",
  thatTargetsYouThatTargetYou: () => "op jou",
  halfRanged: () => "half bereik",
  notFlashEnchantments: (p) => (p.notFlash ? " (geen flitsbetoveringen)" : ""),
  whileHoldingAnItem2: (p) => (p.whileHoldingItem ? "zolang je een voorwerp vasthoudt, " : ""),
  nextNext: (p) => (p.one ? `${p.whose} volgende` : `${p.whose} volgende ${p.uses}`),
  cannotBeInterrupted: () => "kan niet onderbroken worden",
  cannotBeBlocked: () => "kan niet geblokkeerd worden",
  costsLessEnergy: (p) => `kost ${p.energyDiscount} minder energie`,
  castsInstantly: () => "wordt meteen uitgesproken",
  rechargesInstantly: () => "laadt meteen op",
  s2: (p) => `${p.value} s`,
  takesSLongerToRecharge: (p) => `doet er ${p.extraRechargeSeconds} langer over om op te laden`,
  yourNextAnd: (p) => `je volgende ${p.NEXT_SKILL_KIND} ${p.does}`,
  youLoseAllEnergyAsItIs: () => "je verliest bij het uitspreken alle energie",
  youGainOfItsEnergyCost: (p) => `je krijgt ${p.energyGainOfCost} van zijn energiekosten`,
  itRechargesFaster: (p) => `het laadt ${p.fraction}% sneller op`,
  rechargesInstantly2: (p) => `${p.name} laadt meteen op`,
  forYourNextSkill: () => "voor je volgende skill",
  ifItIsAAnd: (p) => `als het een ${p.kind} is, ${p.does}`,
  suffer: (p) => `krijgen ${p.sufferedWhat}`,
  forWord2: (p) => `${p.statusName} gedurende ${p.durationSeconds} (${p.status})`,
  a: (p) => `een ${compound(p.owners)}-${CATEGORY[p.category].one}`,
  ifItInterruptsASkill: () => "Als het een skill onderbreekt",
  ifThatActionWasASpell: () => "Als die actie een spreuk was",
  ifThatActionWasAnAttack: () => "Als die actie een aanval was",
  ifItKillsTheTarget: () => "Als het het doelwit doodt",
  ifItResurrects: () => "Als het iemand weer tot leven brengt",
  ifASpiritDiedInThisWay: () => "Als daarbij een geest is gestorven",
  ifWasRemoved: (p) => `Als er een ${CATEGORY[p.category].one} is verwijderd`,
  ifItRemoves: (p) => `Als het ${aCategory(p.category)} verwijdert`,
  ifTargetIsBelowHealth: (p) => `Als het doelwit onder ${p.fraction}% gezondheid is`,
  ifTargetIsAboveHealth: (p) => `Als het doelwit boven ${p.fraction}% gezondheid is`,
  ifYouHaveLessThanHealth: (p) => `Als je minder dan ${p.fraction}% gezondheid hebt`,
  ifYouHaveLessHealthThanYour: () => "Als je minder gezondheid hebt dan je pet",
  ifYourPetHasLessHealthThan: () => "Als je pet minder gezondheid heeft dan jij",
  ifItFollowsOffHandAnOff: (p) => `Als het op ${CHAIN_ARTICLED[p.role]} volgt`,
  ifTargetHas: (p) => `Als het doelwit ${p.filteredCategory} heeft`,
  ifTargetHasOr: (p) => `Als het doelwit ${p.categories} heeft`,
  ifYouHave: (p) => `Als je ${aCategory(p.category)} hebt`,
  ifYouHaveA: (p) => `Als je een ${p.name}-${CATEGORY[p.category].one} hebt`,
  other: (p) => (p.excluding === undefined ? "" : "andere "),
  ifYouHaveNo: (p) => `Als je ${noOther(p.other, CATEGORY[p.category].one)} hebt`,
  ifYouHaveNo2: (p) => `Als je ${noOther(p.other, `${p.name}-${CATEGORY[p.category].one}`)} hebt`,
  ifTargetIsCastingASpellOr: (p) =>
    p.orChant === true
      ? "Als het doelwit een spreuk of gezang uitspreekt"
      : "Als het doelwit een spreuk uitspreekt",
  ifTargetIsUsingASkill: () => "Als het doelwit een skill gebruikt",
  ifTargetHasNoOtherHex: (p) => `Als het doelwit geen andere ${p.name}-vloek heeft`,
  ifTargetIsNotAdjacentToAny: () => "Als het doelwit aan geen enkele bondgenoot grenst",
  ifTargetIsNotNearAnyAllies: () => "Als het doelwit geen bondgenoten dichtbij heeft",
  ifTargetHasNoAlliesWithin: (p) => `Als het doelwit geen bondgenoten binnen ${p.radius} heeft`,
  ifTargetIsNearAnyOfYour: () => "Als het doelwit dicht bij een van je bondgenoten is",
  ifAnyOfYourAlliesIsWithin: (p) =>
    `Als een van je bondgenoten binnen ${p.radius} van het doelwit is`,
  ifTargetIsWithinEarshot: () => "Als het doelwit binnen gehoorsafstand is",
  ifTargetIsWithinOfYou: (p) => `Als het doelwit binnen ${p.radius} van je is`,
  ifTargetIsNotMoving: () => "Als het doelwit niet beweegt",
  ifTargetIsKnockedDown: () => "Als het doelwit neergeslagen is",
  ifTargetIsMoving: () => "Als het doelwit beweegt",
  ifTargetIsAFoe: () => "Als het doelwit een vijand is",
  ifTargetIsMovingFasterThanNormal: () => "Als het doelwit sneller dan normaal beweegt",
  ifAnyFoeIsKnockedDownIf: (p) =>
    p.knockedDown === true
      ? `Als een vijand ${p.where} neergeslagen is`
      : `Als een vijand ${p.where} is`,
  ifYouHitOrMoreFoes: (p) => `Als je minstens ${p.atLeast} vijanden raakt`,
  ifNumberOrMore: (p) => `Als het aantal ${p.countAll} minstens ${p.atLeast} is`,
  ifAreNoMoreThan: (p) =>
    `Als het aantal ${p.countAll} niet groter is dan het aantal ${p.countAll2}`,
  ifTargetHas2: (p) => `Als het doelwit van ${p.statusName} last heeft`,
  ifTargetDoesNotHave: (p) => `Als het doelwit niet van ${p.statusName} last heeft`,
  ifYouHaveMoreEnergyThanTarget: () => "Als je meer energie hebt dan het doelwit",
  ifYouHaveLessThanEnergy: (p) => `Als je minder dan ${p.amount} energie hebt`,
  ifYouAreOvercast: () => "Als je overspannen bent",
  ifYouWield: (p) => `Als je ${NEEDED_WEAPON[p.weapon]} hanteert`,
  ifYouHoldAShield: () => "Als je een schild vasthoudt",
  ifYouAreHoldingAnItem: () => "Als je een voorwerp vasthoudt",
  ifTargetHasLessHealthThanYou: () => "Als het doelwit minder gezondheid heeft dan jij",
  ifTargetHasMoreHealthThanYou: () => "Als het doelwit meer gezondheid heeft dan jij",
  ifTargetIsAttacking: () => "Als het doelwit aanvalt",
  ifTargetIsNotAttacking: () => "Als het doelwit niet aanvalt",
  ifTargetIsCastingASpellOr2: () => "Als het doelwit een spreuk uitspreekt of aanvalt",
  ifTargetIsASummonedCreature: () => "Als het doelwit een opgeroepen wezen is",
  ifNoSpiritIsWithinOfYou: (p) =>
    `Als er geen geest ${AREA_TEXT.get(p.radius) ?? `binnen ${p.radius2}`} bij je is`,
  ifASpiritIsWithinOfYou: (p) =>
    `Als er een geest ${AREA_TEXT.get(p.radius) ?? `binnen ${p.radius2}`} bij je is`,
  ifYouControlOrFewerS: (p) =>
    `Als je hoogstens ${p.count} ${p.creature === "spirit" ? "geesten" : p.creature === "minion" ? "dienaren" : pluralNoun(spaced(p.creature))} beheerst`,
  ifASpiritOrACorpseIs: (p) =>
    `Als er een geest of lijk ${AREA_TEXT.get(p.radius) ?? `binnen ${p.radius2}`} bij je is`,
  ifAnAllyIsDeadWithin: (p) => `Als een bondgenoot ${within(p.radius, p.radius2)} dood is`,
  ifTargetIsNearACorpseOr: () => "Als het doelwit dicht bij een lijk is of zijn pet dood is",
  ifTargetIsWithinOfACorpse: (p) =>
    `Als het doelwit binnen ${p.radius} van een lijk is of zijn pet dood is`,
  composedType: (p) => (p.type === undefined ? "" : typeWord(p.type)),
  healthForEachAllyMax: (p) => `, +${p.amount} gezondheid per bondgenoot ${p.area} (max. ${p.max})`,
  allPartyMembers: () => "Alle groepsleden",
  allItsPartyMembers: () => "Alle leden van zijn groep",
  allAlliedMinions: () => "Alle dienaren van bondgenoten",
  yourOtherMinions: () => "Je andere dienaren",
  within2: (p) => `${p.Who} ${p.area ?? `binnen ${p.radius}`}`,
  adjacent: (p) => placed("Aangrenzende", "aangrenzend", p.who),
  nearby: (p) => `${capitalize(p.who)} dichtbij`,
  within3: (p) => (p.area === undefined ? `${p.Who} binnen ${p.radius}` : `${p.Who} ${p.area}`),
  loseThatSame: (p) => `verliezen dezelfde ${CATEGORY[p.category].one}`,
  loseAllAll: (p) => `verliezen alle ${categoryNoun("all", p.category)}`,
  onThem: () => "op hen",
  loseOneForEachOnThem: (p) => `verliezen een ${CATEGORY[p.category].one} per ${p.countEach}`,
  lose: (p) => `verliezen ${p.count} ${categoryNoun(p.count2, p.category)}`,
  enchantmentAnA: (p) => (p.onlyBearing === undefined ? "" : "een"),
  with4: (p) => (p.onlyBearing === undefined ? "" : ` met een ${CATEGORY[p.onlyBearing].one}`),
  usingSkills: (p) =>
    p.onlyUsing === undefined ? "" : `, die ${TYPE_STEM[p.onlyUsing]}skills gebruiken`,
  dead: (p) => (p.dead === true ? `Dode ${lowerFirst(p.living)}` : p.living),
  targetAndCasterAroundYouCasterAround: (p) =>
    `${p.includesCentre === true ? `Het doelwit en ${lowerFirst(p.reached)}` : p.reached}${p.around === "caster" ? " om je heen" : ""}${p.alsoAround === "caster" ? " rond het doelwit en jou" : ""}${p.bearing}${p.using}${p.onlyIf}`,
  upTo3: (p) => `Tot ${p.maxTargets} ${lowerFirst(p.who)}`,
  inItsRange: () => "in zijn bereik",
  inTheArea: () => "in het gebied",
  foes: () => "vijanden",
  allEveryoneYouAndAlliesAllies: (p) =>
    p.affects === "all" ? "iedereen" : p.includesCaster ? "jij en bondgenoten" : "bondgenoten",
  enemiesFoesAllEveryoneYouAndAllies: (p) => `${p.value} ${within(p.radius, p.radius2)}`,
  whenSprung: () => "bij activering",
  after: (p) => `na ${seconds(p.delaySeconds)}`,
  everyFor: (p) => `elke ${seconds(p.everySeconds)}, gedurende ${seconds(p.count)}`,
  whenItEnds: (p) => `Als het eindigt, ${p.whom}: `,
  springsByItselfAsItsTimeRuns: () => "Gaat vanzelf af als de tijd verstrijkt",
  composedWhoText: (p) => `${capitalize(p.who)}: ${lowerFirst(p.text)}`,
  composedEndingText: (p) => `${p.ending}${lowerFirst(p.text)}`,
  composedConditionText: (p) => `${p.condition}: ${lowerFirst(p.text)}`,
  itsAttacksDealDamage: (p) => `Zijn aanvallen doen ${p.magnitude} schade`,
  thisSpiritLosesHealth: (p) => `deze geest verliest ${p.magnitude} gezondheid`,
  composedCondition: (p) => `${lowerFirst(p.condition)}: `,
  itsAttacks: (p) => `Zijn aanvallen: ${p.when}${p.what}`,
  health3: (p) => `${p.health} gezondheid`,
  health4: (p) => `${p.health} gezondheid (${p.health2})`,
  level: (p) => `niveau ${p.marked}, `,
  lastsSeconds: (p) => `, duurt ${p.durationSeconds} seconden`,
  composedCountNameLevelTextHealthTextLasts: (p) =>
    `${p.count} ${p.name} (${p.levelText}${p.healthText}${p.lasts})`,
  itsAttacksDealDamage2: (p) => `Zijn aanvallen doen ${p.value} schade`,
  onlyOneAtATimeANew: () => "Maar één tegelijk: een nieuwe doodt de oude",
  leavesCorpseCorpsesWhenItDies: (p) =>
    `Laat bij het sterven ${p.corpses} ${p.current === 1 ? "lijk" : "lijken"} achter`,
  whenItDiesStandsUpInIts: (p) => `Als het sterft, staat ${p.text} op zijn plek op`,
  listSemicolon: () => "; ",
  inItsRange2: (p) => AREA_TEXT.get(p.radius) ?? "in zijn bereik",
  composedAffectsWhere: (p) => `${AURA_WHO[p.affects]} ${p.where}`,
  whenItDiesUnderHealthBeginFor: (p) =>
    `Als het sterft, krijgen ${p.who} onder ${p.below} gezondheid ${p.duration} seconden lang ${p.statusName}`,
  whenItDiesDeadPartyMembersAre: (p) =>
    `Als het sterft, komen dode groepsleden ${p.where} weer tot leven met ${p.health}% gezondheid en zonder energie`,
  damageTakeDamageAreHealedForHealth: (p) =>
    p.effect === "damage" ? `krijgen ${p.amount} schade` : `genezen ${p.amount} gezondheid`,
  max: (p) => ` (max. ${p.max})`,
  whenItDiesPerSecondItLived: (p) =>
    `Als het sterft: ${p.who} ${p.what} per seconde dat het leefde${p.max}`,
  everySecondsHealsTheMostHurtNon: (p) =>
    `Elke ${p.everySeconds} seconden: geneest de meest gewonde bondgenoot ${p.where} die geen geest is met ${p.heal} gezondheid`,
  whenANonSpiritDiesInIts: () => "Als er in zijn bereik iets sterft dat geen geest is",
  nearby2: (p) => AREA_TEXT.get(p.radius) ?? "dichtbij",
  itsConditionsSpreadToEachNonSpirit: (p) =>
    `${p.when}, gaan zijn condities over op elk wezen ${p.where} dat geen geest is en een conditie heeft`,
  eachOfItsTypeInItsRange: (p) =>
    `${p.when}, krijgt elk wezen van zijn soort in zijn bereik met minder dan ${p.below} gezondheid ${p.damage} schade`,
  holdingAnItem: (p) => (p.onlyWhileHoldingItem ? " die een voorwerp vasthouden" : ""),
  composedWhoWhereHoldingStatus: (p) => `${p.who} ${p.where}${p.holding}: ${p.status}`,
  perFoeHit: (p) => (p.perTarget === undefined ? "" : " per geraakte vijand"),
  forEachMeleeAttackSkillOnYour: (p) => ` per nabijaanvalsskill op je balk (hoogstens ${p.max})`,
  withinEarshot: (p) => (p.area === "binnen gehoorsafstand" ? "binnen gehoorsafstand" : p.area),
  forEverySummonedCreatureYouControlMaximum: (p) =>
    ` per opgeroepen wezen ${p.where} onder je beheer (maximaal ${p.max} energie)`,
  composedZeroAloneEachText: (p) => (p.zero ? `${p.alone} ${p.each}` : `${p.text}, +${p.each}`),
  maximum: (p) => ` (maximaal ${p.max})`,
  forEach: (p) => `per ${p.countEach}${p.max}`,
  pointOfEnergyGained: () => "gekregen energiepunt",
  pointOfEnergyRestrictedByOvercast: () => "energiepunt dat door overspanning geblokkeerd is",
  skillDisabledInThisWay: () => "zo uitgeschakelde skill",
  orCasterOnYou: (p) => `${categoryIds(p.categories)} ${p.on === "caster" ? "op jou" : p.onTarget}`,
  ofYourRecharging: (p) => `van je opladende ${p.rechargingSkillsNoun}`,
  pointOfEnergyCasterYouHaveThey: (p) =>
    `energiepunt dat ${p.on === "caster" ? "je hebt" : "het heeft"}`,
  orRemoved: (p) => `verwijderde ${categoryIds(p.categories)}`,
  orLost: (p) => `verloren ${p.name}-${categoryIds(p.categories)}`,
  enchantmentYouAreMaintaining: () => "door jou onderhouden betovering",
  secondItWasInEffect: () => "seconde dat het werkte",
  foeKnockedDown: () => "neergeslagen vijand",
  youHaveEquipped: (p) => `${spaced(p.type)} op je balk`,
  adrenalineSkillTheyHave: () => "adrenalineskill die het heeft",
  foeHit: () => "geraakte vijand",
  within4: (p) => `${p.perCountNoun} ${within(p.radius, p.radius2)}`,
  attacksSkillsS: (p) =>
    p.weapon !== undefined
      ? weaponAttacks(p.weapon)
      : p.type === undefined
        ? "skills"
        : pluralNoun(spaced(p.type)),
  casterYourTargetS: (p) => (p.on === "caster" ? "je" : "zijn"),
  s3: (p) => pluralNoun(p.perCountNoun),
  pointOfOvercast: () => "punt overspanning",
  skillDisabled: () => "uitgeschakelde skill",
  rechargingSkill: () => "opladende skill",
  pointOfEnergy: () => "energiepunt",
  removedOr: (p) => `verwijderde ${categoryIds(p.categories)}`,
  removedOr2: (p) => `verwijderde ${p.name}-${categoryIds(p.categories)}`,
  maintainedEnchantment: () => "onderhouden betovering",
  secondHeld: () => "vastgehouden seconde",
  adrenalineSkill: () => "adrenalineskill",
  deadAlly: () => "dode bondgenoot",
  knockedDownFoeFoe: (p) => (p.knockedDown === true ? "neergeslagen vijand" : "vijand"),
  ally: () => "bondgenoot",
  neverAbove: (p) => `, nooit boven ${p.upTo}`,
  forEachRemoved: (p) =>
    p.toTarget === true || p.perRemoved === undefined
      ? ""
      : ` per verwijderde ${CATEGORY[p.perRemoved].one}`,
  perPointLost: (p) => (p.perEnergyLost === undefined ? "" : " per verloren punt"),
  armorPenetration: (p) => ` (${p.armorPenetration}% pantserdoorboring)`,
  dealsDamage2: (p) => `Doet ${p.magnitude} ${damageNoun(p.type)}${p.perPointLost}${p.penetration}`,
  deals: () => "Doet",
  damage2: (p) => ` ${damageNoun(p.type)}`,
  composedCountedConditionAmount: (p) => `${p.counted}; ${lowerFirst(p.condition)}: +${p.amount}`,
  gainHealthEqualToThisSpellS: () =>
    "Krijg gezondheid gelijk aan de bonus van Goddelijke gunst van deze spreuk",
  healsIfRelievedOf: (p) => `Geneest ${p.amount} als het van ${p.name} wordt bevrijd`,
  healsForOfYourCurrentHealthMaximum: (p) =>
    `Geneest ${p.magnitude} van je huidige gezondheid (maximaal ${p.max} gezondheid)`,
  youGainHealth: (p) => `Je krijgt ${p.amount} gezondheid`,
  yourPetGainsHealth: (p) => `Je pet krijgt ${p.amount} gezondheid`,
  ownerHealsItsOwnerForHealsFor: (p) =>
    p.recipient === "owner" ? `Geneest zijn eigenaar ${p.amount}` : `Geneest ${p.amount}`,
  healsForEachRemovedHealsForEach: (p) =>
    p.perRemoved !== undefined
      ? `Geneest ${p.amount} per verwijderde ${CATEGORY[p.perRemoved].one}`
      : p.perDestroyedSpirit === true
        ? `Geneest ${p.amount} per vernietigde geest`
        : p.perEnergyLost === true
          ? `${p.recipient === "caster" ? "Je geneest" : "Geneest"} ${p.amount} per verloren energiepunt`
          : p.perUsedSkillEnergy === true
            ? `Geneest ${p.magnitude} van de energiekosten van de spreuk`
            : p.value,
  casterYouGainHeals: (p) => (p.recipient === "caster" ? "Je krijgt" : "Geneest"),
  health5: () => " gezondheid",
  casterOnTargetFoeOnThem: (p) => (p.recipient === "caster" ? "op de doelvijand" : "op hen"),
  underHealth: (p) => `, onder ${p.onlyBelowHealthFraction}% gezondheid`,
  gainOfTheSkillSBaseEnergy: (p) => `Krijg ${p.magnitude} van de basisenergiekosten van de skill`,
  targetGainsOwnerYouGainGain: (p) =>
    p.toTarget === true ? "Het doelwit krijgt" : p.recipient === "owner" ? "Je krijgt" : "Krijg",
  energy5: (p) =>
    `${p.gains} ${p.magnitude} energie${p.perPointLost}${p.perFoeHit}${p.perOwnCreature}${p.perRemoved}`,
  energy6: () => " energie",
  gain2: () => "Krijg",
  onTargetFoe: () => "op de doelvijand",
  strikeStrikesOfAdrenalineAdrenaline: (p) =>
    p.units
      ? `${p.magnitude} ${p.current === 1 ? "slag" : "slagen"} adrenaline`
      : `${p.magnitude} adrenaline`,
  youGain2: () => "Je krijgt",
  targetTargetGainsGain: (p) => (p.recipient === "target" ? "Het doelwit krijgt" : "Krijg"),
  strikesOfAdrenaline: () => " slagen adrenaline",
  targetRegainsAllEnergy: () => "Het doelwit krijgt alle energie terug",
  casterYouLoseTargetLoses: (p) => (p.on === "caster" ? "Je verliest" : "Het doelwit verliest"),
  energy7: (p) => `${p.who} ${p.magnitude} energie`,
  stealsUpToEnergy: (p) => `Steelt tot ${p.magnitude} energie`,
  stealsUpToHealth: (p) => `Steelt tot ${p.magnitude} gezondheid`,
  youStealHealth: (p) => `Je steelt ${p.magnitude} gezondheid`,
  youSacrificeOfYourMaximumHealth: (p) => `Je offert ${p.percentOfMax}% van je maximale gezondheid`,
  targetFoeLosesHealth: (p) => `Het vijandelijke doelwit verliest ${p.magnitude} gezondheid`,
  targetFoeLoses: () => "Het vijandelijke doelwit verliest",
  youLoseHealth: (p) => `Je verliest ${p.magnitude} gezondheid`,
  forEachEnchantmentRemoved: (p) => `${p.lose} per verwijderde ${p.whose}-betovering`,
  loseAllButHealth: (p) => `Verlies alle gezondheid op ${p.magnitude} na`,
  transferOfYourConditionsToFoes: (p) =>
    `Draagt ${p.magnitude} van je condities over op ${p.foesWithin}`,
  max2: (p) => (p.maxSeconds === undefined ? "" : ` (max. ${seconds(p.maxSeconds)})`),
  withTheTimeEachHasLeft: () => "met de resterende tijd van elk",
  withMoreTime: (p) => `met ${p.extend}% meer tijd${p.max}`,
  foesGetTheTargetSConditionsWith: (p) =>
    `${p.foesWithin} krijgen de condities van het doelwit, ${p.value}`,
  loseYourHealthHealForOfIt: (p) =>
    `Verlies ${shareOfYourHealth(p.fractionOfCurrent)}; genees ${p.magnitude}% daarvan`,
  whoeverOfYouAndTargetFoeHas: () =>
    "Wie van jou en de doelvijand meer gezondheid heeft, verliest de helft van het verschil; de ander krijgt evenveel",
  stacksOnceForEachOnThem: (p) => `. Stapelt één keer per ${p.countEach}`,
  stacksOnceForEachOnThem2: (p) => p.status + p.value,
  forWord3: (p) => `${p.durationSeconds} lang ${p.what}`,
  forEachHexRemoved: (p) => ` per verwijderde ${p.name}-vloek)`,
  stackingOnceForEachOnThem: (p) => `, stapelt één keer per ${p.countEach}`,
  appliesCasterToYouForUntilIt: (p) =>
    `Legt ${p.statusName}${p.on === "caster" ? " op jou" : ""} ` +
    (p.ends ? `${p.statusDuration} lang op ` : "op, tot het eindigt ") +
    `(${p.status}` +
    p.value +
    p.value2,
  composedStatusNameDurationSeconds: (p) => `${p.statusName} (${p.durationSeconds})`,
  appliesOneOfAtRandom: (p) => `Legt willekeurig een hiervan op: ${p.choices}`,
  maintainedCasterOnYouEnergyRegenerationWhile: (p) =>
    `Onderhouden${p.on === "caster" ? " op jou" : ""}: −1 energieregeneratie zolang het duurt. ` +
    `${capitalize(p.what)}.`,
  losesThatSame: (p) => `Verliest dezelfde ${CATEGORY[p.category].one}`,
  casterLoseRemoves: (p) => (p.from === "caster" ? "Verlies" : "Verwijdert"),
  oneForEachRemovedMax: (p) =>
    `${p.verb} een ${CATEGORY[p.category].one} per verwijderde ${CATEGORY[p.category2].one} (max. ${p.max})`,
  oneForEachOnTarget: (p) => `${p.verb} een ${CATEGORY[p.category].one} per ${p.countEach}`,
  lose2: (p) => `Verlies ${p.count} ${owned(p.whose)}${categoryNoun(p.count2, p.category)}`,
  endsTheTargetSStance: () => "Beëindigt de houding van het doelwit",
  forEachSpiritWithinOfIt: (p) =>
    ` per geest ${AREA_AROUND_TARGET.get(p.near) ?? `binnen ${p.near2} van het doelwit`}`,
  numberUpTo: (p) => (typeof p.count === "number" && p.count > 1 ? "tot " : ""),
  and4: (p) => (p.orCategory === undefined ? "" : ` en ${categoryNoun(p.count, p.orCategory)}`),
  removes: (p) =>
    `Verwijdert ${p.upTo}${p.count} ${owned(p.whose)}${categoryNoun(p.count2, p.category)}${p.and}${p.perSpirit}`,
  interruptsTheTargetSSpellIfThey: () =>
    "Onderbreekt de spreuk van het doelwit als het er een uitspreekt",
  interruptsTheTargetSSpellOrChant: () =>
    "Onderbreekt de spreuk of het gezang van het doelwit als het er een uitspreekt",
  skillInterruptsTheTargetSSkillIf: (p) =>
    p.only === "skill"
      ? "Onderbreekt de skill van het doelwit als het er een gebruikt"
      : "Onderbreekt de actie van het doelwit: een skill of een aanval",
  youAreKnockedDownFor: (p) => `Je wordt ${seconds(p.durationSeconds)} lang neergeslagen`,
  knocksDownFor: (p) => `Slaat ${seconds(p.durationSeconds)} lang neer`,
  shadowStepsToTheTarget: () => "Maakt een schaduwstap naar het doelwit",
  youAndTheTargetShadowStepTo: () => "Jij en het doelwit maken een schaduwstap naar elkaars plek",
  corpseTeleportsYouToThatCorpseShadow: (p) =>
    p.to === "corpse"
      ? "Teleporteert je naar dat lijk"
      : "Maakt een schaduwstap naar een plek vlakbij, recht van je doelwit af",
  health6: (p) => `${p.percent}% gezondheid`,
  upToYourCurrentHealthYourHealth: (p) =>
    p.casterLosesFractionOfCurrent === 0
      ? "tot je huidige gezondheid"
      : `je gezondheid nadat je ${shareOfYourHealth(p.casterLosesFractionOfCurrent)} hebt verloren`,
  perPartyMemberWithin: (p) => ` per groepslid ${within(p.radius, p.radius2)}`,
  casterAndTeleportsTheTargetToYou: (p) =>
    p.at === "caster" ? " en teleporteert het doelwit naar jou" : "",
  returnsTheTargetToLifeWithAnd: (p) =>
    `Brengt het doelwit weer tot leven met ${p.healthText} en ${p.energy}% energie${p.per}${p.teleport}`,
  returnsEveryDeadAlliedPetToLife: (p) =>
    `Brengt elke dode pet van een bondgenoot ${p.where} weer tot leven met ${p.health}% gezondheid`,
  youLoseAllYourRemainingEnergy: () => "Je verliest al je resterende energie",
  youGainFor: (p) =>
    `Je krijgt ${p.statusName} gedurende ${seconds(p.durationSeconds)} (${p.status})`,
  yourPetGainsFor: (p) => `Je pet krijgt ${p.statusName} gedurende ${p.duration} (${p.status})`,
  yourPetMovesToYourTargetAnd: () => "Je pet loopt naar je doelwit en valt het aan",
  teleportsTargetToYou: () => "Teleporteert het doelwit naar jou",
  destroysTargetAlliedSpirit: () => "Vernietigt de bevriende doelgeest",
  destroysTargetMinion: () => "Vernietigt de doeldienaar",
  nearestSpiritLosesHealthTargetAllyIs: (p) =>
    `De dichtstbijzijnde geest verliest ${p.magnitude} gezondheid; de doelbondgenoot geneest ${p.healPerPoint} per punt`,
  nearestSpiritLosesAllEnergyYouGain: (p) =>
    `De dichtstbijzijnde geest verliest alle energie; jij krijgt ${p.magnitude}% daarvan`,
  itsOwnerGainsHealthEqualToThe: () =>
    "Zijn eigenaar krijgt gezondheid gelijk aan de aangerichte schade",
  destroysEveryAlliedSpiritWithin: (p) =>
    `Vernietigt elke bevriende geest ${within(p.radius, p.radius2)}`,
  thisSkillRecharges: () => "Deze skill laadt",
  secondsFaster: () => " seconden sneller op",
  thisSkillRechargesInstantly: () => "Deze skill laadt meteen op",
  thisSkillRechargesFaster: (p) => `Deze skill laadt ${p.fraction}% sneller op`,
  usedSkillThatSkillRechargesInstantlyThis: (p) =>
    p.of === "used-skill" ? "Die skill laadt meteen op" : "Deze skill laadt meteen op",
  loseAllAdrenaline: () => "Verlies alle adrenaline",
  rechargesAllYourOtherSkills: () => "Laadt al je andere skills op",
  rechargesAllYourStances: () => "Laadt al je houdingen op",
  rechargesAllYourOtherSkills2: (p) =>
    `Laadt al je andere ${OTHER_SKILLS[p.which] ?? p.which}skills op`,
  rechargesAllYour: (p) => `Laadt al je ${p.rechargedKind} op`,
  allOfYourSpiritsDie: () => "Al je geesten sterven",
  summonsPlusOnePerCorpseExploited: (p) =>
    `Roept ${p.text} op` + (p.perExploitedCorpse === true ? ", plus een per uitgebuit lijk" : ""),
  setsATrap: () => "Zet een val",
  pulseTargetCreatesASymbolMarksThe: (p) =>
    p.kind === "pulse"
      ? p.anchor === "target"
        ? "Schept een symbool"
        : "Markeert de grond"
      : p.anchor === "corpse"
        ? "Schept een bron"
        : "Schept een wering",
  forSeconds: (p) => `${p.what} ${p.where} gedurende ${p.magnitude} seconden`,
  seconds3: (p) => `${p.magnitude} seconden`,
  forEachSignetYouHaveEquipped: (p) => (p.perOwnSignet === true ? " per uitgerust zegel" : ""),
  allOfTheTargetSSkillsAre: (p) => `Alle skills van het doelwit zijn ${p.time} lang uitgeschakeld`,
  theTargetSEliteSkillIsDisabled: (p) =>
    `De eliteskill van het doelwit is ${p.time} lang uitgeschakeld`,
  oneOfTheTargetSSpellsAt: (p) =>
    `Een willekeurige spreuk van het doelwit is ${p.time} lang uitgeschakeld`,
  allOfTheTargetSAttackSkills: (p) =>
    `Alle aanvalsskills van het doelwit zijn ${p.time} lang uitgeschakeld`,
  theInterruptedSkillIsDisabledFor: (p) =>
    `De onderbroken skill is ${p.time} lang uitgeschakeld${p.perSignet}`,
  centreInterruptedHoldingThatSkillHaveIt: (p) =>
    p.which === "centre-interrupted"
      ? `die deze skill hebben, hebben hem ${p.time} lang uitgeschakeld`
      : `Deze skill en alle skills van hetzelfde attribuut zijn ${p.time} lang uitgeschakeld`,
  thisSkillBecomesTheOneYouRemoved: (p) =>
    `Deze skill wordt ${p.seconds} seconden degene die je hebt verwijderd`,
  thisSkillBecomesThatRandomSpellSpell: (p) =>
    `Deze skill wordt zo lang ${p.which === "random-spell" ? "die spreuk" : "die skill"}`,
  thisSkillBecomesItsTargetSNon: (p) =>
    `Deze skill wordt ${p.magnitude} seconden de eliteskill van het doelwit die geen gedaante is`,
  takeControlOfTargetEnemySpirit: () => "Neem de vijandelijke doelgeest over",
  becomeYourMinionsWhileYouBear: (p) => `Worden je dienaren zolang je ${p.name} draagt`,
  targetMinionWithAMasterBecomesMasterless: (p) =>
    `Een doeldienaar met een meester wordt meesterloos; een meesterloze wordt van jou en geneest ${p.magnitude} gezondheid`,
  leadCountsAsALeadAttackCounts: (p) =>
    p.role === "lead" ? "Telt als openingsaanval" : "Telt als nevenhandaanval",
  targetSuffersOvercast: (p) => `Het doelwit krijgt ${p.magnitude} overspanning`,
  thisSkillThisSkillThatSkill: (p) => (p.of === "this-skill" ? "Deze skill" : "Die skill"),
  forEachRemoved2: (p) =>
    p.perRemoved === undefined ? "" : ` per verwijderde ${CATEGORY[p.perRemoved].one}`,
  takesSecondsLongerToRecharge: (p) =>
    `${p.which} doet er ${p.magnitude} seconden langer over om op te laden${p.each}`,
  that: (p) => `, die ${p.onlyIf}`,
  ifItStrikesAFoe: (p) => `Als het een vijand${p.whom} raakt: ${lowerFirst(p.text)}`,
  from: (p) => `${p.text} van ${p.from}`,
  takeDamageForEachPointOfEnergy: (p) =>
    `krijgen ${p.amount} ${damageNoun(p.type)}` +
    (p.perEnergyLost === undefined ? "" : " per verloren energiepunt"),
  areInterruptedAreInterruptedIfCasting: (p) =>
    p.only === undefined
      ? "worden onderbroken"
      : "worden onderbroken als ze aan het uitspreken zijn",
  areKnockedDownForS: (p) => `worden ${p.durationSeconds} s lang neergeslagen`,
  foesFoeCreaturesGain: (p) =>
    p.hits === "foes" || p.hits === "foe-creatures" ? p.suffered : `krijgen ${p.sufferedWhat}`,
  gainHealthEqualToThisSpellS2: () =>
    "krijgen gezondheid gelijk aan de bonus van Goddelijke gunst van deze spreuk",
  gain3: (p) => `krijgen ${healedAmount(p.text)}`,
  gainHealth: (p) => `krijgen ${p.amount} gezondheid`,
  loseHealth: (p) => `verliezen ${p.amount} gezondheid`,
  youFromEach: (p) => `je ${lowerFirst(p.text)} van elk`,
  transferAllTheirConditionsToYou: () => "draag al hun condities op jou over",
  resurrect: (p) =>
    p.kind === "resurrect"
      ? lowerFirst(p.text).replace(/^brengt het doelwit weer tot leven/, "komen weer tot leven")
      : lowerFirst(p.text),
  and5: (p) => (p.length === 0 ? (p.last ?? "") : `${p.parts} en ${p.last2}`),
  perAlliedMinionsOwnMinionsMinionOne: (p) =>
    `; ${lowerFirst(p.text)} per ${p.hits === "allied-minions" || p.hits === "own-minions" ? "dienaar" : "doelwit"}`,
  per: (p) => ` per ${counted(p.perCountNoun)}`,
  damage3: (p) => `${p.amount} ${damageNoun(p.type)}${p.each}`,
  healHealsEnergy: (p) =>
    p.kind === "heal" ? `geneest ${p.amount}${p.each}` : `+${p.amount} energie${p.each}`,
  drainsEnergy: (p) => `onttrekt ${p.magnitude} energie`,
  stealsEnergy: (p) => `steelt ${p.magnitude} energie`,
  stealsHealth: (p) => `steelt ${p.magnitude} gezondheid`,
  resurrectsEnergy: (p) => `brengt weer tot leven, ${p.energy}% energie`,
  resurrectsHealth: (p) => `brengt weer tot leven, ${p.health}% gezondheid`,
  resurrectsPetsHealth: (p) => `brengt pets weer tot leven, ${p.health}% gezondheid`,
  healsOfYourHealth: (p) => `geneest ${p.percent}% van ${shareOfYourHealth(p.fractionOfCurrent)}`,
  balancesHealthWithTargetFoe: () => "brengt gezondheid in balans met de doelvijand",
  allUpTo: (p) => (p.current === p.Infinity ? "alle" : `tot ${p.moving}`),
  andFoesWithinOfIt: (p) =>
    ` en vijanden ${AREA_AROUND_TARGET.get(p.copyToFoesWithin) ?? `binnen ${p.copyToFoesWithin2} van het doelwit`}`,
  withOfTheirRemainingDurations: (p) => ` met ${p.durationMultiplier}% van hun resterende duur`,
  movesConditionsFromFoesWithinOfIt: (p) =>
    `Verplaatst ${p.count} condities${p.lasting} van vijanden ${AREA_AROUND_TARGET.get(p.foesWithin) ?? `binnen ${p.foesWithin2} van het doelwit`} naar het doelwit`,
  casterMovesOfYourConditionsToThe: (p) =>
    p.from === "caster"
      ? `Verplaatst ${p.count === "alle" ? "al je" : `${p.count} van je`} condities${p.lasting} naar het doelwit${p.copies}`
      : `Verplaatst ${p.count} condities van het doelwit${p.lasting} naar jou`,
  youAreHealedForForEach: (p) => `${p.moves}; je geneest ${p.magnitude} per conditie`,
  areDisabledForSeconds: (p) => `zijn ${p.seconds} seconden uitgeschakeld`,
  allOfYourSkills: (p) => `Al je skills ${p.time}`,
  allOfYourOtherSkills: (p) => `Al je andere skills ${p.time}`,
  allOfYourOtherNonAttackSkills: (p) => `Al je andere niet-aanvalsskills ${p.time}`,
  allOfYourOtherAttackSkillsYour: (p) =>
    p.exceptWeapon === undefined
      ? `Al je andere aanvalsskills ${p.time}`
      : `Je niet-${WEAPON_WORD[p.exceptWeapon]}-aanvalsskills ${p.time}`,
  allOfYourNonAttackSkills: (p) => `Al je niet-aanvalsskills ${p.time}`,
  s4: (p) => pluralNoun(typeName(p.type)),
  yourAnd: (p) => `Je ${p.types} ${p.time}`,
  allOfYourSpells: (p) => `Al je spreuken ${p.time}`,
  allOfYourOther: (p) => `Al je ${p.others ? "andere " : ""}${p.name} ${p.time}`,
  exceptAnd: (p) => (p.length === 0 ? "" : ` behalve ${p.except}`),
  allOfYourNonSkills: (p) => `Al je niet-${p.name}-skills${p.exceptText} ${p.time}`,
  yourWholeParty: () => "Je hele groep",
  composedAffectsWhere2: (p) => `${AREA_WHO[p.affects]} ${p.where}`,
  radius: (p) => `straal ${p.radius}`,
  andAroundYou: (p) =>
    `${TARGET_TEXT[p.target]}, en ${lowerFirst(AREA_WHO[p.affects])} ${p.where} om je heen`,
  range: (p) => `bereik ${p.range}`,
  upTo4: (p) => `tot ${p.maxTargets} ${p.who}`,
  withinOfIt: (p) => AREA_AROUND_TARGET.get(p.radius) ?? `binnen ${p.radius2} van het doelwit`,
  and6: (p) => `${TARGET_TEXT[p.target]}, en ${p.count} ${p.where}`,
  rangeRadius: (p) => `bereik ${p.range}, straal ${p.radius}`,
  free: () => "Gratis",
  adrenaline: (p) => `${p.amount} adrenaline`,
  composedAmount: (p) => ` (${p.amount})`,
  energy8: (p) => `${p.cost} energie${p.base}${p.overcast}`,
  overcast: (p) => `, ${p.overcast} overspanning`,
  instant: () => "Meteen",
  composedActivationBase: (p) => (p.activation === p.base ? p.base : `${p.activation} (${p.base})`),
  dealsNoDamage: () => "Doet geen schade",
  dealsOnlyDamageDamage: (p) =>
    p.weaponless
      ? `Doet alleen ${p.bonus} ${damageOf(p.damageType)}`
      : `+${p.bonus} ${damageOf(p.damageType)}`,
  damage4: (p) => `${p.condition}: +${p.more} schade`,
  damageOnThem: (p) => `+${p.amount} schade ${p.perCount}`,
  cannotBeBlocked2: () => "Kan niet geblokkeerd worden",
  cannotBeBlocked3: (p) => `${p.condition}: kan niet geblokkeerd worden`,
  chanceToMissWithOrLess: (p) => `${p.chance}% kans om te missen met ${p.name} ${p.rank} of lager`,
  resultsInACriticalHit: () => "Leidt tot een kritieke treffer",
  resultsInACriticalHit2: (p) => `${p.condition}: leidt tot een kritieke treffer`,
  hitsUpToAdjacentFoesToo: (p) => `Raakt ook tot ${p.cleaveTargets} aangrenzende vijanden`,
  hitsEveryAdjacentFoe: (p) => `${p.condition}: raakt elke aangrenzende vijand`,
  armorPenetration2: (p) => `${p.armorPenetration}% pantserdoorboring`,
  ifBlocked: (p) => `Als het geblokkeerd wordt: ${lowerFirst(p.text)}`,
  onACriticalHit: (p) => `Bij een kritieke treffer: ${lowerFirst(p.text)}`,
  ifItFailsToHit: (p) => `Als het niet raakt: ${lowerFirst(p.text)}`,
  asItIsUsed: (p) => `Bij gebruik: ${lowerFirst(p.text)}`,
  allYourPreparationsAreRemoved: () => "Al je voorbereidingen worden verwijderd",
  fliesAsFast: (p) => `Vliegt ${p.multiplier}× zo snel`,
  fliesAsFast2: (p) => `${p.condition}: vliegt ${p.multiplier}× zo snel`,
  only: (p) => `; ${lowerFirst(p.condition)}, slechts 1`,
  eachDealingLessDamage: (p) => `, die elk ${p.value}% minder schade doen`,
  strikesTwice: () => "Slaat twee keer toe",
  strikesTimes: (p) => `Slaat ${p.count} keer toe`,
  shootsArrowsAtOnce: (p) => `Schiet ${p.count} pijlen tegelijk${p.weaker}${p.fewer}`,
  whileActivating: (p) => `Tijdens de activering: ${p.status}`,
  easilyInterrupted: () => "Makkelijk te onderbreken",
  failureChanceWithOrLess: (p) => `${p.chance}% kans op mislukken met ${p.name} ${p.rank} of lager`,
  activatesFasterSlower: (p) =>
    `${p.condition}: activeert ${p.value}% ${p.multiplier < 1 ? "sneller" : "langzamer"}`,
  healthGainFromDivineFavorIsDoubled: () =>
    "Gezondheidswinst door Goddelijke gunst wordt verdubbeld",
  projectilesEachCanBeDodged: (p) => `${p.shots} projectielen: elk kan ontweken worden`,
  aProjectileAtEachFoeEachCan: (p) =>
    p.spread === true
      ? "Een projectiel op elke vijand: elk kan ontweken worden"
      : "Projectiel: kan ontweken worden",
  halfTheNormalRange: () => "De helft van het normale bereik",
  orSacrificesHealthIfNoneIsNear: (p) =>
    `, of offert ${p.elseSacrificePercent}% gezondheid als er geen in de buurt is`,
  targetExploitsTheCorpseNearestYourTarget: (p) =>
    (p.near === "target"
      ? "Buit het lijk uit dat het dichtst bij je doelwit ligt"
      : p.all === true
        ? `Buit elk vers lijk ${within(p.radius, p.radius2)} uit`
        : p.pick === "random"
          ? "Buit een willekeurig lijk uit"
          : "Buit het dichtstbijzijnde lijk uit") + p.value,
  whileOnYourBarAHealthFights: (p) =>
    `Zolang op je balk vecht een ${p.name} (${p.companionHealth} gezondheid) aan je zijde`,
  disabledForAfterUse: (p) => `Na gebruik ${seconds(p.disabledAfterUseSeconds)} lang uitgeschakeld`,
  takeAllConditionsFromYourAlliesWith: () =>
    "Neem alle condities van je bondgenoten over met de resterende tijd van elk",
  hitOrMiss: (p) => `${p.text}, raak of mis`,
  eliteFlash: (p) => {
    const prefix = `${p.elite ? "Elite-" : ""}${p.flash ? (p.elite ? "flits-" : "Flits-") : ""}`;
    return prefix === "" ? TYPE_TEXT[p.type] : `${prefix}${lowerFirst(TYPE_TEXT[p.type])}`;
  },
  moraleBoost: (p) =>
    p.rechargesOnMoraleBoost === true ? "Moraalboost" : seconds(p.rechargeSeconds),
  hexHexesS2: (p) => pluralNoun(p.kind),
} satisfies DescribeWords as DescribeWords;
