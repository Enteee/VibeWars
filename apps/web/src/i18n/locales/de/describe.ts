import { EN_WORDS, type DescribeWords } from "@vibewars/game-core";

type Words = DescribeWords;
type Category = Parameters<Words["categoryNoun"]>[1];
type Weapon = Parameters<Words["whileWielding"]>[0]["weapon"];
type DamageKind = Parameters<Words["typeWord"]>[0];
type ChainKind = keyof Words["chainRoleText"];
type SkillKind = keyof Words["typeText"];

/** The sentence-start words that are no nouns, so a line may continue with them in lower case. */
const LOWERABLE = new Set(
  (
    "Verursacht Heilt Heile Du Dein Deine Deinen Deinem Deiner Ein Eine Einen Einem Einer Der Die Das Den Dem Des " +
    "Alle Allen Alles Wenn Solange Sobald Immer Bis Bei Beim Von Für Mit Nur Wird Werden Erhalte Erhält Erhältst " +
    "Verliere Verliert Verlierst Stiehlt Stiehl Stiehlst Erleide Erleidet Erleidest Nimm Nimmt Erzeugt Entfernt " +
    "Unterbricht Teleportiert Belebt Zerstört Beschwört Trifft Schießt Kann Kannst Kosten Kostet Wirkt Bewegt " +
    "Beendet Setzt Markiert Lädt Laden Überträgt Verschiebt Wendet Zählt Nächster Nächste Nächsten Angrenzende " +
    "Tote Andere Anderen Bis Es Sein Seine Seinen Seinem Seiner Ihre Ihren Jeder Jede Jedes Jedem Dieser Diese " +
    "Dieses Diesem Dauert Fliegt Opfere Übertrage Regeneriert Gewinne Gewinnt Hinterlässt Springt Blockt Während " +
    "Falls Außer Aktiviert Führt Erweckt Übernimm Steigt Keine Kein Keinen Bewirkt Verbreitet Betäubt"
  ).split(" "),
);

function firstWordLowerable(text: string): boolean {
  return LOWERABLE.has(text.split(/[\s,:]/, 1)[0] ?? "");
}

/** German nouns keep their capital: only a word known not to be one is lowered. */
function lowerFirst(text: string): string {
  return firstWordLowerable(text) ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function seconds(value: number): string {
  // Whole seconds read better than "2,0 s"; fractions keep one decimal.
  return Number.isInteger(value) ? `${String(value)} s` : `${value.toFixed(1).replace(".", ",")} s`;
}

const CATEGORY: Record<
  Category,
  { readonly one: string; readonly many: string; readonly a: string; readonly nominative: string }
> = {
  condition: { one: "Zustand", many: "Zustände", a: "einen", nominative: "ein" },
  hex: { one: "Verhexung", many: "Verhexungen", a: "eine", nominative: "eine" },
  enchantment: { one: "Verzauberung", many: "Verzauberungen", a: "eine", nominative: "eine" },
  stance: { one: "Haltung", many: "Haltungen", a: "eine", nominative: "eine" },
  preparation: { one: "Vorbereitung", many: "Vorbereitungen", a: "eine", nominative: "eine" },
  glyph: { one: "Glyphe", many: "Glyphen", a: "eine", nominative: "eine" },
  shout: { one: "Ruf", many: "Rufe", a: "einen", nominative: "ein" },
  chant: { one: "Gesang", many: "Gesänge", a: "einen", nominative: "ein" },
  echo: { one: "Echo", many: "Echos", a: "ein", nominative: "ein" },
  "weapon-spell": { one: "Waffenzauber", many: "Waffenzauber", a: "einen", nominative: "ein" },
  item: { one: "Gegenstand", many: "Gegenstände", a: "einen", nominative: "ein" },
  form: { one: "Gestalt", many: "Gestalten", a: "eine", nominative: "eine" },
  "skill-effect": { one: "Skilleffekt", many: "Skilleffekte", a: "einen", nominative: "ein" },
};

/** Category ids that reach a sentence raw, joined with this file's own "oder". */
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
  return `${CATEGORY[category].a} ${CATEGORY[category].one}`;
}

/** "keine andere Verhexung", "keinen anderen Zustand", "kein anderes Echo". */
function noOther(category: Category, other: string, noun: string): string {
  const { a } = CATEGORY[category];
  const adjective =
    other === "" ? "" : a === "eine" ? "andere " : a === "einen" ? "anderen " : "anderes ";
  return `k${a} ${adjective}${noun}`;
}

const SKILL_NOUN: Readonly<Record<string, string>> = {
  attack: "Angriff",
  spell: "Zauber",
  enchantment: "Verzauberung",
  hex: "Verhexung",
  signet: "Siegel",
  shout: "Ruf",
  stance: "Haltung",
  preparation: "Vorbereitung",
  glyph: "Glyphe",
  chant: "Gesang",
  echo: "Echo",
  "weapon-spell": "Waffenzauber",
  "nature-ritual": "Naturritual",
  "binding-ritual": "Bindungsritual",
  ward: "Schutzzeichen",
  well: "Brunnen",
  "item-spell": "Gegenstandszauber",
  trap: "Falle",
  "pet-attack": "Tiergefährten-Angriff",
  form: "Gestalt",
  skill: "Skill",
};

/** A skill type id as its German noun; "elite" and the rest pass as they came. */
function spaced(word: string): string {
  return SKILL_NOUN[word] ?? word.replaceAll("-", " ");
}

const PLURAL_ENDINGS: readonly (readonly [RegExp, string])[] = [
  [/Skill$/i, "Skills"],
  [/skill$/, "skills"],
  [/Angriff$/, "Angriffe"],
  [/ung$/, "ungen"],
  [/Glyphe$/, "Glyphen"],
  [/Falle$/, "Fallen"],
  [/Gestalt$/, "Gestalten"],
  [/Ruf$/, "Rufe"],
  [/Gesang$/, "Gesänge"],
  [/Echo$/, "Echos"],
  [/ritual$/, "rituale"],
  [/angriff$/, "angriffe"],
  [/Zustand$/, "Zustände"],
  [/Punkt$/, "Punkte"],
  [/Energiepunkt$/, "Energiepunkte"],
  [/Sekunde$/, "Sekunden"],
  [/Verbündeter$/, "Verbündete"],
  [/niedergeschlagener Gegner$/, "niedergeschlagene Gegner"],
];

/** A German noun's plural; those that do not change (Zauber, Siegel, Gegner) come back as they are. */
function pluralNoun(noun: string): string {
  for (const [ending, plural] of PLURAL_ENDINGS) {
    if (ending.test(noun)) {
      return noun.replace(ending, plural).replace(/^toter /, "tote ");
    }
  }
  return noun;
}

/** A plural after "von" or "an": the dative its head noun takes. */
function dative(text: string): string {
  return text
    .replace(/^seine /, "seinen ")
    .replace(/^deine /, "deinen ")
    .replace(/\bGegner\b/, "Gegnern")
    .replace(/\bVerbündete\b/, "Verbündeten")
    .replace(/\bZustände\b/, "Zuständen")
    .replace(/\bDiener\b/, "Dienern")
    .replace(/\bGeister\b/, "Geistern");
}

const DAMAGE_STEM: Record<DamageKind, string> = {
  slashing: "Hieb",
  piercing: "Stich",
  blunt: "Wucht",
  fire: "Feuer",
  cold: "Kälte",
  lightning: "Blitz",
  earth: "Erd",
  chaos: "Chaos",
  dark: "Dunkel",
  holy: "Licht",
  shadow: "Schatten",
  typeless: "",
};

function typeWord(type: DamageKind): string {
  return type === "typeless" ? "" : ` ${DAMAGE_STEM[type]}`;
}

/** A damage stem said by `typeWord`, compounded: "Feuerschaden", or plain "Schaden". */
function damageOf(stem: string): string {
  const word = stem.trim();
  return word === "" ? "Schaden" : `${word}schaden`;
}

function damageNoun(type: DamageKind): string {
  return damageOf(DAMAGE_STEM[type]);
}

/** Damage named in the accusative by id, the two broad kinds being adjectives. */
function damageNamed(type: DamageKind | "elemental" | "physical"): string {
  return type === "physical"
    ? "physischen Schaden"
    : type === "elemental"
      ? "elementaren Schaden"
      : damageNoun(type);
}

const NEEDED_WEAPON: Record<Weapon, string> = {
  axe: "eine Axt",
  sword: "ein Schwert",
  hammer: "einen Hammer",
  daggers: "Dolche",
  scythe: "eine Sense",
  spear: "einen Speer",
  bow: "einen Bogen",
  melee: "eine Nahkampfwaffe",
};

const WITH_WEAPON: Record<Weapon, string> = {
  axe: "einer Axt",
  sword: "einem Schwert",
  hammer: "einem Hammer",
  daggers: "Dolchen",
  scythe: "einer Sense",
  spear: "einem Speer",
  bow: "einem Bogen",
  melee: "einer Nahkampfwaffe",
};

const WEAPON_WORD: Record<Weapon, string> = {
  axe: "Axt",
  sword: "Schwert",
  hammer: "Hammer",
  daggers: "Dolch",
  scythe: "Sensen",
  spear: "Speer",
  bow: "Bogen",
  melee: "Nahkampf",
};

function wielding(weapon: Weapon | undefined): string {
  return weapon === undefined
    ? ""
    : weapon === "daggers"
      ? " mit Dolchen in den Händen"
      : ` mit ${WITH_WEAPON[weapon]} in der Hand`;
}

function weaponAttacks(weapon: Weapon | undefined): string {
  return weapon === undefined ? "Angriffe" : `${WEAPON_WORD[weapon]}angriffe`;
}

function attackSkills(weapon: Weapon | undefined): string {
  return weapon === undefined ? "Angriffsskills" : `${WEAPON_WORD[weapon]}angriffsskills`;
}

const CHAIN_ARTICLED: Record<ChainKind, string> = {
  lead: "einem Eröffnungsangriff",
  "off-hand": "einem Nebenhandangriff",
  dual: "einem Doppelangriff",
};

const TYPE_TEXT: Words["typeText"] = {
  attack: "Angriff.",
  spell: "Zauber.",
  enchantment: "Verzauberungszauber.",
  hex: "Verhexungszauber.",
  signet: "Siegel.",
  shout: "Ruf.",
  stance: "Haltung.",
  preparation: "Vorbereitung.",
  glyph: "Glyphe.",
  chant: "Gesang.",
  echo: "Echo.",
  "weapon-spell": "Waffenzauber.",
  "nature-ritual": "Naturritual.",
  "binding-ritual": "Bindungsritual.",
  ward: "Schutzzeichenzauber.",
  well: "Brunnenzauber.",
  "item-spell": "Gegenstandszauber.",
  trap: "Falle.",
  "pet-attack": "Tiergefährten-Angriff.",
  form: "Gestalt.",
  skill: "Skill.",
};

function typeName(type: SkillKind): string {
  return TYPE_TEXT[type].replace(/\.$/, "");
}

const TYPE_STEM: Record<SkillKind, string> = {
  attack: "Angriffs",
  spell: "Zauber",
  enchantment: "Verzauberungs",
  hex: "Verhexungs",
  signet: "Siegel",
  shout: "Ruf",
  stance: "Haltungs",
  preparation: "Vorbereitungs",
  glyph: "Glyphen",
  chant: "Gesangs",
  echo: "Echo",
  "weapon-spell": "Waffenzauber",
  "nature-ritual": "Naturritual",
  "binding-ritual": "Bindungsritual",
  ward: "Schutzzeichen",
  well: "Brunnen",
  "item-spell": "Gegenstands",
  trap: "Fallen",
  "pet-attack": "Tiergefährten",
  form: "Gestalt",
  skill: "Skill",
};

/** A joined run of words as one compound: "Feuermagie-Zauber". */
function compound(words: string): string {
  return words
    .replace(/\bprimary\b/g, "Primär")
    .replace(/\belemental\b/g, "Elementar")
    .trim()
    .replaceAll(" ", "-");
}

/** A 3rd-person singular verb as the 2nd: "wirkt" to "wirkst", "nutzt" stays. */
function verbToYou(verb: string): string {
  const irregular: Readonly<Record<string, string>> = {
    ist: "bist",
    hat: "hast",
    wird: "wirst",
    erhält: "erhältst",
    hält: "hältst",
  };
  return irregular[verb] ?? (/[szßx]t$/.test(verb) ? verb : verb.replace(/t$/, "st"));
}

/** A 3rd-person singular verb as the plural: "wirkt" to "wirken". */
function verbToThey(verb: string): string {
  const irregular: Readonly<Record<string, string>> = {
    ist: "sind",
    hat: "haben",
    wird: "werden",
    hält: "halten",
  };
  return irregular[verb] ?? verb.replace(/t$/, "en");
}

/** The clause-final verb of a phrase, changed by `change`. */
function changeLastVerb(phrase: string, change: (verb: string) => string): string {
  return phrase.replace(/(\S+)$/, (verb) => change(verb));
}

/** "einen Zauber wirkt" said to its holder: "einen Zauber wirkst". */
function secondPerson(phrase: string): string {
  return changeLastVerb(phrase, verbToYou)
    .replace(/\bsein(e|en|em|er)?\b/g, "dein$1")
    .replace(/\bsich\b/g, "dich")
    .replace(/\bihm\b/g, "dir");
}

/** A `conditionText` with "das Ziel" made "du", the verb following. */
function yourCondition(text: string): string {
  const match = /^Wenn das Ziel (.*)$/.exec(text);
  if (match === null) {
    return text;
  }
  const clause = match[1] ?? "";
  const compared = /^(.*) (als .*)$/.exec(clause);
  const said =
    compared === null
      ? changeLastVerb(clause, verbToYou)
      : `${changeLastVerb(compared[1] ?? "", verbToYou)} ${compared[2] ?? ""}`;
  return `Wenn du ${said.replace(/\bsich\b/g, "dich").replace(/\bsein(e|en|em|er)?\b/g, "dein$1")}`;
}

function negatedText(text: string): string {
  const no = /^Wenn (das Ziel|du) (sich |dich )?nicht (.*)$/.exec(text);
  if (no !== null) {
    return `Wenn ${no[1] ?? ""} ${no[2] ?? ""}${no[3] ?? ""}`;
  }
  const none = /^Wenn (das Ziel|du) kein(e|en)? (.*)$/.exec(text);
  if (none !== null) {
    return `Wenn ${none[1] ?? ""} ein${none[2] ?? ""} ${none[3] ?? ""}`;
  }
  const some = /^Wenn (das Ziel|du) ein(e|en)? (.*)$/.exec(text);
  if (some !== null) {
    return `Wenn ${some[1] ?? ""} kein${some[2] ?? ""} ${some[3] ?? ""}`;
  }
  const less = /^Wenn (das Ziel|du) weniger als (.*)$/.exec(text);
  if (less !== null) {
    return `Wenn ${less[1] ?? ""} mindestens ${less[2] ?? ""}`;
  }
  const plain = /^Wenn (das Ziel|du) (.*)$/.exec(text);
  if (plain !== null) {
    return `Wenn ${plain[1] ?? ""} nicht ${plain[2] ?? ""}`;
  }
  return `Außer ${lowerFirst(text)}`;
}

function share(fraction: number): string {
  return fraction === 0.5 ? "die Hälfte" : `${String(Math.round(fraction * 100))} %`;
}

/** `share`, then of what: "die Hälfte deines Lebens", "25 % deines Lebens". */
function shareOfYourHealth(fraction: number): string {
  return `${share(fraction)} deines Lebens`;
}

function damageTaken(multiplier: number): string {
  if (multiplier === 2) {
    return "doppelten";
  }
  if (multiplier === 0.5) {
    return "halben";
  }
  return `${String(Math.round(multiplier * 100))} %`;
}

const TRIGGER_WHEN: Words["triggerWhen"] = {
  "bearer-casts-spell": "einen Zauber wirkt",
  "bearer-attacks": "angreift",
  "bearer-attack-begins": "angreift",
  "bearer-uses-skill": "einen Skill nutzt",
  "bearer-applies-hex": "eine Verhexung anwendet",
  "bearer-hits": "mit einem Angriff trifft",
  "bearer-fails-to-hit": "nicht trifft",
  "bearer-takes-physical-damage": "physischen Schaden erleidet",
  "bearer-takes-elemental-damage": "elementaren Schaden erleidet",
  "bearer-takes-damage": "Schaden erleidet",
  "bearer-takes-damage-from-foe": "Schaden oder Lebensraub von einem Gegner erleidet",
  "bearer-health-drops-below": "durch Schaden unter eine Lebensgrenze fällt",
  "bearer-fatal-damage-negated": "tödlichen Schaden abwendet",
  "bearer-hit-by-attack": "vom Angriff eines Gegners getroffen wird",
  "bearer-targeted-by-foe": "zum Ziel eines gegnerischen Zaubers oder Angriffs wird",
  "bearer-healed-by-skill": "von einem Skill geheilt wird",
  "bearer-blocks-melee": "einen Nahkampfangriff blockt",
  "bearer-blocks-projectile": "einen Fernkampfangriff blockt",
  "bearer-blocks": "blockt",
  "bearer-interrupted": "unterbrochen wird",
  "bearer-knocked-down": "niedergeschlagen wird",
  "bearer-sacrifices-health": "Leben opfert",
  "bearer-knockdown-prevented": "einen Niederschlag abwendet",
  "bearer-gains-hex-or-enchantment": "eine Verhexung oder Verzauberung erhält",
  "bearer-gains-enchantment": "eine Verzauberung erhält",
  "bearer-loses-enchantment": "eine Verzauberung verliert",
  "bearer-loses-condition": "einen Zustand verliert",
  "bearer-creates-creature": "eine Kreatur erschafft",
  "bearer-gains-condition": "einen neuen Zustand erhält",
  "bearer-chant-or-shout-ends": "einen Gesang oder Ruf auslaufen sieht",
  "bearer-energy-empty": "keine Energie mehr hat",
  "bearer-energy-drops-empty": "auf 0 Energie fällt",
  "source-targets-bearer": "zum Ziel deines Skills wird",
  "source-bearer-apart": "weit von dir entfernt ist",
  "bearer-dies": "stirbt",
  ends: "endet",
  "ends-early": "vorzeitig endet",
  expires: "abläuft",
};

/** A radius table in German: the radii are the game's, only the words change. */
function inGerman(
  table: ReadonlyMap<number, string>,
  german: Readonly<Record<string, string>>,
): ReadonlyMap<number, string> {
  return new Map([...table].map(([radius, english]) => [radius, german[english] ?? english]));
}

const AREA_TEXT = inGerman(EN_WORDS.areaText, {
  adjacent: "angrenzend",
  nearby: "in der Nähe",
  "in the area": "im Gebiet",
  "in earshot": "in Hörweite",
  "in compass range": "in Kompassreichweite",
});

const AREA_AROUND_TARGET = inGerman(EN_WORDS.areaAroundTarget, {
  "adjacent to it": "angrenzend an das Ziel",
  "nearby it": "in der Nähe des Ziels",
  "in the area around it": "im Gebiet um das Ziel",
  "in earshot of it": "in Hörweite des Ziels",
});

const AREA_AROUND_CREATED = inGerman(EN_WORDS.areaAroundCreated, {
  "adjacent to that creature": "angrenzend an diese Kreatur",
  "near that creature": "in der Nähe dieser Kreatur",
  "in earshot of that creature": "in Hörweite dieser Kreatur",
});

const AURA_WHO: Words["auraWho"] = {
  all: "Kreaturen außer Geistern",
  allies: "Verbündete außer Geistern",
  foes: "Gegner außer Geistern",
};

const AREA_WHO: Words["areaWho"] = {
  enemies: "Gegner",
  allies: "Verbündete",
  all: "Alle",
};

const SPLASH_SIDE: Words["splashSide"] = {
  foes: "Gegner",
  "foe-creatures": "gegnerische Kreaturen",
  "foe-minions": "gegnerische Diener",
  allies: "Verbündete",
  "non-spirit-allies": "Verbündete außer Geistern",
  party: "Gruppenmitglieder",
  "own-spirits": "deine Geister",
  "own-minions": "deine anderen Diener",
  "allied-minions": "verbündete Diener",
};

const TARGET_TEXT: Words["targetText"] = {
  self: "Du selbst",
  "single-enemy": "Ein Gegner",
  "single-ally": "Ein Verbündeter",
  "single-other-ally": "Ein anderer Verbündeter",
  "single-any": "Ein beliebiges Ziel",
  "single-dead-ally": "Ein toter Verbündeter",
  "allied-spirit": "Ein verbündeter Geist",
  "enemy-spirit": "Ein gegnerischer Geist",
  "enemy-minion": "Ein Diener eines Gegners",
  "own-minion": "Einer deiner Diener",
  "allied-minion": "Ein verbündeter Diener",
  "allied-summoned-creature": "Eine verbündete beschworene Kreatur",
  "single-ally-not-spirit": "Ein Verbündeter, kein Geist",
  companion: "Dein Tiergefährte",
  "living-companion": "Dein lebender Tiergefährte",
};

const TARGETS_WORDS: Words["targetsWords"] = {
  ally: "einen Verbündeten",
  "other-ally": "einen anderen Verbündeten",
  foe: "einen Gegner",
};

const YOUR_NEXT_SKILL = "wenn du das nächste Mal einen Skill nutzt";
const NEXT_SKILL = "wenn es das nächste Mal einen Skill nutzt";
const DROPPED = "Effekt beim Fallenlassen";

function within(radius: number, radius2: string): string {
  return AREA_TEXT.get(radius) ?? `innerhalb von ${radius2}`;
}

/** A profession before a noun, compounded: "Derwisch-Verzauberung"; none says nothing. */
function owned(whose: string): string {
  return whose.trim() === "" ? "" : `${whose.trim()}-`;
}

/** "wenn du einen Nahkampfangriff blockst" answered as "wenn es ein Nahkampfangriff ist". */
function blockAnswer(text: string): string {
  return text.replace(
    /^beim nächsten Mal, wenn (?:du|es) (einen?) (.+?) block(?:s?t)$/,
    (_, article: string, noun: string) =>
      `wenn es ${article === "einen" ? "ein" : article} ${noun} ist`,
  );
}

/** "Angrenzende Gegner", or after a possessive "Deine Geister angrenzend". */
function placed(adjective: string, after: string, who: string): string {
  return who.startsWith("deine") ? `${capitalize(who)} ${after}` : `${adjective} ${who}`;
}

const OTHER_SKILLS: Readonly<Record<string, string>> = { attack: "Angriffs", signet: "Siegel" };
const COUNTED: Readonly<Record<string, string>> = {
  enchantment: "Verzauberung",
  hex: "Verhexung",
  condition: "Zustand",
};
const counted = (text: string): string =>
  text.replace(/\b(enchantment|hex|condition)\b/g, (word) => COUNTED[word] ?? word);

const kindedArmor = (text: string): string =>
  text.replace(/^(\S+) (\w+) Rüstung$/, (whole, amount: string, kind: string) =>
    kind in DAMAGE_STEM
      ? `${amount} Rüstung gegen ${DAMAGE_STEM[kind as DamageKind]}schaden`
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
      .replace(
        /^Das gegnerische Ziel verliert/,
        fromSource ? "du verlierst" : bearerIsFoe ? "es verliert" : "verliere",
      )
      .replace(/den es hat/, "den du hast"),
  bearerWording: (text, bearerIsCaster) =>
    text
      .replace(/^Das Ziel erhält/, "es erhält")
      .replace(/^Das Ziel verliert/, bearerIsCaster ? "du verlierst" : "es verliert"),
  ifItWording: (text) => text.replace(/^Wenn das Ziel/, "Wenn es"),
  gainWording: (text) => {
    const amount = lowerFirst(text).replace(/^heilt (?:um |für )?/, "");
    return amount.includes("Leben") ? amount : `${amount} Leben`;
  },
  loseTargetWording: (text) => lowerFirst(text).replace(/^das Ziel verliert/, "verlieren"),
  stealsWording: (text) => lowerFirst(text).replace(/^stiehlt /, "stiehlst "),
  returnedWording: (text) =>
    lowerFirst(text).replace(/^belebt das Ziel wieder/, "werden wiederbelebt"),
  yourMinionsWording: (text) => text.replace(/^Deine anderen Diener/, "Deine Diener"),
  onlyIfWording: (text) => {
    const match = /^Wenn das Ziel (.*)$/.exec(text);
    return match === null ? lowerFirst(text) : changeLastVerb(match[1] ?? "", verbToThey);
  },
  splashOnlyClause: (condition) =>
    condition === "" ? "" : condition.startsWith("wenn ") ? `, ${condition}` : `, die ${condition}`,
  eachOfWording: (reached, condition) =>
    condition === ""
      ? reached
      : condition.startsWith("wenn ")
        ? `${reached}, ${condition}`
        : `${reached}, die ${condition}`,
  requiresWording: (text) => text.replace(/^Wenn /, "Nur wenn "),
  requirementWording: (text) =>
    text.startsWith("Wenn ") ? `nur ${lowerFirst(text)}` : lowerFirst(text),
  requirementLine: (text) => lowerFirst(text).replace(/\.$/, ""),
  anyOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Nie", ...rest.map((text) => text.replace(/^Wenn /, ""))].join(" oder ");
  },
  allOfWording: (texts) => {
    const [first, ...rest] = texts;
    return [first ?? "Immer", ...rest.map((text) => text.replace(/^Wenn /, ""))].join(" und ");
  },
  seconds,
  blockedAttacks: { all: "Angriffe", melee: "Nahkampfangriffe", projectile: "Geschosse" },
  blockedAttack: { all: "Angriff", melee: "Nahkampfangriff", projectile: "Geschoss" },
  damageTaken,
  triggerWhen: TRIGGER_WHEN,
  secondPerson,
  arrowsWhen: { "bearer-hits": "treffen", "bearer-fails-to-hit": "nicht treffen" },
  chantOrShoutEnds: "immer wenn ein Gesang oder Ruf darauf endet",
  energyEmpty: "wenn seine Energie 0 erreicht",
  dropped: DROPPED,
  targetsWords: TARGETS_WORDS,
  nextSkill: NEXT_SKILL,
  yourNextSkill: YOUR_NEXT_SKILL,
  creates: "immer wenn du eine Kreatur erschaffst",
  areaAroundCreated: AREA_AROUND_CREATED,
  nextSkillKind: {
    "attack-skill": ["Angriffsskill", "Angriffsskills"],
    spell: ["Zauber", "Zauber"],
    hex: ["Verhexung", "Verhexungen"],
    signet: ["Siegel", "Siegel"],
    "signet-at-foe": ["Siegel, das auf einen Gegner zielt", "Siegel, die auf einen Gegner zielen"],
    "shout-or-chant": ["Ruf oder Gesang", "Rufe oder Gesänge"],
    any: ["Skill", "Skills"],
  },
  lowerFirst,
  aCategory,
  negatedText,
  yourCondition,
  typeWord,
  splashSide: SPLASH_SIDE,
  auraWho: AURA_WHO,
  groundAnchorText: {
    caster: "an deinem Standort",
    corpse: "an seinem Standort",
    target: "am Standort deines Ziels",
  },
  share,
  categoryNoun,
  weaponText: {
    axe: "Axtangriff",
    sword: "Schwertangriff",
    hammer: "Hammerangriff",
    daggers: "Dolchangriff",
    scythe: "Sensenangriff",
    spear: "Speerangriff",
    bow: "Bogenangriff",
    melee: "Nahkampfangriff",
  },
  chainRoleText: {
    lead: "Eröffnungsangriff.",
    "off-hand": "Nebenhandangriff.",
    dual: "Doppelangriff.",
  },
  followsText: {
    lead: "Muss auf einen Eröffnungsangriff folgen.",
    "off-hand": "Muss auf einen Nebenhandangriff folgen.",
    dual: "Muss auf einen Doppelangriff folgen.",
  },
  neededWeapon: NEEDED_WEAPON,
  weaponWord: WEAPON_WORD,
  typeText: TYPE_TEXT,
  areaText: AREA_TEXT,
  areaAroundTarget: AREA_AROUND_TARGET,
  targetText: TARGET_TEXT,
  areaWho: AREA_WHO,
  s: () => " s",
  onTarget: () => "auf dem Ziel",
  composedLastsAtBase: (p) => (p.lasts === p.at ? p.base : `${seconds(p.lasts)} (${p.base})`),
  attributes: (p) => `${p.name}-Attribute`,
  attributes2: () => "Attribute",
  attributePrimaryS: (p) => (p.scope === "primary" ? "Primärattribut" : "Elementarattribute"),
  setTo: (p) => `${p.scope} auf ${p.rank} gesetzt`,
  allAttributes: () => "alle Attribute",
  toAllAllAttributes: (p) => `${p.amount} auf ${p.value}`,
  renewedWheneverAChantOrShoutEnds: (p) =>
    `erneuert sich, sobald ein Gesang oder Ruf auf ${p.selfOnly ? "dir" : "ihm"} endet`,
  renewedWheneverYouCastItCastsA: (p) =>
    `erneuert sich, sobald ${p.selfOnly ? "du einen Zauber wirkst" : "es einen Zauber wirkt"}`,
  reappliedWheneverYouCastItCastsA: (p) =>
    `wird erneut angewendet, sobald ${p.selfOnly ? "du einen Zauber auf einen Gegner wirkst" : "es einen Zauber auf einen Gegner wirkt"}`,
  renewedWheneverYouTakeItTakesElemental: (p) =>
    `erneuert sich, sobald ${p.selfOnly ? "du elementaren Schaden erleidest" : "es elementaren Schaden erleidet"}`,
  renewedWheneverAnEnchantmentOnYouIt: (p) =>
    `erneuert sich, sobald eine Verzauberung auf ${p.selfOnly ? "dir" : "ihm"} endet`,
  gainAdrenalineFasterSlower: (p) =>
    `erhält Adrenalin ${p.shown} ${p.faster > 0 ? "schneller" : "langsamer"}`,
  onTheBearerExpireFaster: (p) => `${p.what} auf dem Träger laufen ${p.stat} schneller ab`,
  enchantmentsAndStances: () => "Verzauberungen und Haltungen",
  enchantments: () => "Verzauberungen",
  stances: () => "Haltungen",
  yourAttacksAgainstItHaveCriticalChance: (p) =>
    `deine Angriffe dagegen haben ${p.criticalChanceBonus} % Chance auf kritische Treffer`,
  armorAgainstYourAttacksWhileItHas: (p) =>
    `${p.armorModifier} Rüstung gegen deine Angriffe${p.onlyWhileNoOtherHex ? ", solange es keine andere Verhexung hat" : ""}`,
  youTheBearer: (p) => (p.selfOnly ? "dir" : "dem Träger"),
  endsIfYouEndsIfTheBearer: (p) =>
    p.selfOnly ? `endet, wenn du ${secondPerson(p.phrase)}` : `endet, wenn der Träger ${p.phrase}`,
  healthDegeneration: (p) => `−${p.healthPips} Lebensdegeneration`,
  healthRegeneration: (p) => `+${p.healthPips} Lebensregeneration`,
  healthRegenerationForEachEnchantmentOnYou: (p) =>
    `+${p.pips} Lebensregeneration je Verzauberung auf dir (höchstens ${p.max})`,
  energyDegeneration: (p) => `−${p.energyPips} Energiedegeneration`,
  energyRegeneration: (p) => `+${p.energyPips} Energieregeneration`,
  healthRegenerationForEachConditionOnYou: (p) =>
    `${p.healthPipsPerCondition} Lebensregeneration je Zustand auf dir`,
  health: () => "Lebens",
  hex: () => "Verhexung",
  energy: () => "Energie",
  condition: () => "Zustand",
  regenerationForEachOnYou: (p) => `${p.pips} ${p.what}regeneration je ${p.each} auf dir`,
  armorWhileWielding: (p) => `${p.sign}${p.armorModifier} Rüstung${wielding(p.weapon)}`,
  armorWhileNotMoving: (p) => `${p.armorWhileStill} Rüstung im Stillstand`,
  healthPerSecondWhileMoving: (p) =>
    `${p.healthPerSecondWhileMoving} Leben pro Sekunde in Bewegung`,
  healthPerSecond: (p) => `+${p.healthPerSecond} Leben pro Sekunde`,
  healthPerSecondMoreInEarshotOf: (p) =>
    `+${p.healthPerSecondNearSpirit} Leben pro Sekunde mehr in Hörweite eines Geistes`,
  spellsCastInEarshotOfASpirit: (p) =>
    `Zauber, die in Hörweite eines Geistes gewirkt werden, laden sich ${p.faster} % schneller auf`,
  chanceToDoubleStrikeWhileWielding: (p) =>
    `+${p.chance} % Chance auf einen Doppelschlag${wielding(p.weapon)}`,
  armorNotBelow: (p) => `−${p.amount} Rüstung (nicht unter ${p.floor})`,
  movesAtSpeed: (p) => `bewegt sich mit ${p.speed} % Geschwindigkeit`,
  movesAtSpeedWhileEnchanted: (p) =>
    `bewegt sich mit ${p.speed} % Geschwindigkeit, solange es verzaubert ist`,
  speedBoostsHaveNoEffect: () => "Geschwindigkeitsschübe haben keine Wirkung",
  cannotGainAdrenaline: () => "kann kein Adrenalin erhalten",
  whenThisEndsYouReturnToWhere: () =>
    "wenn dies endet, kehrst du dorthin zurück, wo du es gewirkt hast",
  whenThisEndsYouShadowStepTo: (p) =>
    `wenn dies endet, machst du einen Schattenschritt zu dem Verbündeten, auf den du es gewirkt hast, und alle deine Skills sind ${p.seconds} Sekunden lang deaktiviert`,
  ofAttacksMiss: (p) => `${p.attackMissChance} % der Angriffe verfehlen`,
  maximumHealthAtMost: (p) => `−${p.fraction} % maximales Leben (höchstens ${p.cap})`,
  maximumHealth: (p) => `+${p.maxHealthBonus} maximales Leben`,
  maximumHealthPerEnchantment: (p) =>
    `+${p.maxHealthBonusPerEnchantment} maximales Leben je Verzauberung`,
  maximumEnergy: (p) => `+${p.maxEnergyBonus} maximale Energie`,
  maximumHealthPerPointOfMaximumEnergy: (p) =>
    `+${p.per} maximales Leben je Punkt maximaler Energie`,
  yourMinionsDealDamage: (p) => `deine Diener verursachen ${p.minionDamageBonus} Schaden`,
  loseMaximumHealthEachTimeAMinion: (p) =>
    `verliert ${p.minionHitHealthLossPercent} % maximales Leben, sobald einer deiner Diener trifft`,
  conditionsYouWouldReceiveGoToYour: () =>
    "Zustände, die du erhalten würdest, gehen stattdessen auf deinen nächsten Diener über",
  healing: (p) => `${p.more ? "+" : "−"}${p.change} Heilung`,
  weaponDamage: (p) => `${p.change} % Waffenschaden`,
  dealsDamage: (p) => `verursacht ${p.more ? "+" : "−"}${p.change} Schaden`,
  noDeathPenalty: () => "keine Todesstrafe",
  whenTheBearerDiesSoDoesIts: () => "wenn der Träger stirbt, stirbt auch sein Wirker",
  alliesYouResurrectReturnWithHealthAnd: (p) =>
    `von dir wiederbelebte Verbündete kehren mit +${p.health} Leben und +${p.energy} Energie zurück`,
  youDieTheBearerDiesWhenIt: (p) =>
    p.selfOnly ? "du stirbst, wenn es endet" : "der Träger stirbt, wenn es endet",
  leavesAnExploitedCorpse: () => "hinterlässt eine ausgebeutete Leiche",
  takeFromPhysicalDamage: (p) => `erleidet ${p.sign}${p.amount} durch physischen Schaden`,
  elementalDamageTakenIsDamage: (p) =>
    `erlittener elementarer Schaden ist ${damageNoun(p.elementalDamageTakenAs)}`,
  physicalDamageTakenIsDamage: (p) =>
    `erlittener physischer Schaden ist ${damageNoun(p.physicalDamageTakenAs)}`,
  physicalDamageDealtIsDamage: (p) =>
    `verursachter physischer Schaden ist ${damageNoun(p.physicalDamageDealtAs)}`,
  elementalDamageDealtIsDamage: (p) =>
    `verursachter elementarer Schaden ist ${damageNoun(p.elementalDamageDealtAs)}`,
  takeFromSpiritsAttacks: (p) =>
    `erleidet ${p.damageFromSpiritAttacks} durch Angriffe von Geistern`,
  attacksAttacksDealDamage: (p) =>
    `${weaponAttacks(p.weapon)} verursachen ${damageNoun(p.attackDamageType)}`,
  attacksHaveArmorPenetration: (p) =>
    `Angriffe haben ${p.attackArmorPenetration} % Rüstungsdurchdringung`,
  attacksAttacksDealLessMoreDamage: (p) =>
    `${weaponAttacks(p.weapon)} verursachen ${p.amount} ${p.delta < 0 ? "weniger" : "mehr"} Schaden`,
  and: () => " und ",
  immuneToAnd: (p) => `immun gegen ${p.names}`,
  setOnFire: () => "in Brand gesetzt",
  or: () => " oder ",
  cannotBeOr: (p) => `kann nicht ${p.names} werden`,
  attacksFromAttacks: (p) =>
    `${p.adrenalineGain}${p.adrenalineGainFasterFrom === "attacks" ? " durch Angriffe" : ""}`,
  yourEliteEliteSkillSUse: (p) =>
    `deine ${p.skillType === "elite" ? "Elite-Skills" : pluralNoun(spaced(p.skillType))} nutzen ${p.name}`,
  uses: (p) => `${spaced(p.skillType)}-Einsätze`,
  sUse: (p) => `die nächsten ${p.uses} ${pluralNoun(spaced(p.skillType))} nutzen`,
  yourNext: (p) => `dein nächster ${p.next} ${p.name}`,
  spellsTakeAsLongToCast: (p) => `das Wirken von Zaubern dauert ${p.castTimeMultiplier}× so lange`,
  skillsButAttacksTakeAsLongTo: (p) =>
    `die Aktivierung von Skills außer Angriffen dauert ${p.skillActivationMultiplier}× so lange`,
  spellsAreInterruptedByAttacks: () => "Zauber werden durch Angriffe unterbrochen",
  slowerFaster: (p) => (p.attackDurationMultiplier > 1 ? "langsamer" : "schneller"),
  attacksWhileWielding: (p) => `greift ${p.change} % ${p.way} an${wielding(p.weapon)}`,
  conditionsYouApplyLastLongerWhileWielding: (p) =>
    `Zustände, die du verursachst, halten ${p.longer} % länger${wielding(p.weapon)}`,
  enchantmentsYouMaintainCostTheUpkeep: (p) =>
    `Verzauberungen, die du aufrechterhältst, kosten das ${p.upkeepMultiplier}-Fache an Unterhalt`,
  spellsThatCauseOvercastCauseMoreAs: (p) =>
    `Zauber, die Überanstrengung verursachen, verursachen beim Abschluss ${p.overcastSurcharge} mehr`,
  arrowsMoveAsFast: (p) => `Pfeile fliegen ${p.projectileSpeedMultiplier}× so schnell`,
  cannotCastSpells: () => "kann keine Zauber wirken",
  cannotAttack: () => "kann nicht angreifen",
  cannotUseResurrectionSkills: () => "kann keine Wiederbelebungsskills nutzen",
  cannotBeTheTargetOfEnemySpells: (p) =>
    p.whileCasting
      ? "kann während des Zauberns nicht Ziel gegnerischer Zauber werden"
      : "kann nicht Ziel gegnerischer Zauber werden",
  cannotBeTheTargetOfSpells: () => "kann nicht Ziel von Zaubern werden",
  hostileSpellsTargetingYouFail: () => "feindliche Zauber, die auf dich zielen, schlagen fehl",
  attacksAgainstYouMiss: () => "Angriffe gegen dich verfehlen",
  strippedOfAllEnchantmentsAndCannotBe: () =>
    "verliert alle Verzauberungen und kann nicht verzaubert werden",
  cannotBeTheTargetOfEnchantments: () => "kann nicht Ziel von Verzauberungen werden",
  cannotUseShoutsOrChants: () => "kann keine Rufe oder Gesänge nutzen",
  cannotUseSignets: () => "kann keine Siegel nutzen",
  cannotBlockItsCasterSAttacks: () => "kann die Angriffe seines Wirkers nicht blocken",
  cannotBeBlockedByBlindedFoes: () => "kann nicht von geblendeten Gegnern geblockt werden",
  cannotBlock: () => "kann nicht blocken",
  renewedForSecondsIfMovingAsIt: (p) =>
    `erneuert sich für ${p.renewsWhileMoving} Sekunden, wenn es beim Enden in Bewegung ist`,
  cannotBeKnockedDown: () => "kann nicht niedergeschlagen werden",
  cannotBeKnockedDownByAFoe: () => "kann nicht von einem Gegner niedergeschlagen werden",
  endsIfItPreventsAKnockdown: () => "endet, wenn es einen Niederschlag abwendet",
  youDoNotSufferExtraDamageFrom: () => "du erleidest keinen Zusatzschaden durch kritische Angriffe",
  cannotLandCriticalHits: () => "kann keine kritischen Treffer landen",
  immuneToCriticalHits: () => "immun gegen kritische Treffer",
  spellsHaveDoubleTheDivineFavorBonus: (p) =>
    `${p.attribute}-Zauber haben den doppelten Bonus der Göttlichen Gunst`,
  attackSkillAttackSkills: (p) =>
    p.once
      ? p.attackSkillsOnly === true
        ? "Angriffsskill"
        : { all: "Angriff", melee: "Nahkampfangriff", projectile: "Geschoss" }[p.against]
      : p.attackSkillsOnly === true
        ? "Angriffsskills"
        : { all: "Angriffe", melee: "Nahkampfangriffe", projectile: "Geschosse" }[p.against],
  whileBelowHealth: (p) => ` unter ${p.blockBelowHealth} % Leben`,
  whileUnderOr: (p) => ` unter dem Einfluss von ${p.value}`,
  fromFoesUnderOr: (p) => ` von Gegnern unter dem Einfluss von ${p.value}`,
  whileAttacking: (p) => (p.blockWhileAttacking ? " beim Angreifen" : ""),
  blocksTheNextChanceToBlock: (p) =>
    p.once
      ? `blockt das nächste Mal: ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`
      : `${p.chance} % Chance zu blocken: ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`,
  within: (p) => within(p.radius, p.radius2),
  alliesTo: (p) => `Verbündete ${p.around} bei ${p.bearer}: ${p.status}`,
  whileWielding: (p) => wielding(p.weapon),
  whileHoldingAWeaponOtherThan: (p) =>
    ` mit einer anderen Waffe in der Hand als ${NEEDED_WEAPON[p.not]}`,
  againstFoesThatAreNotMoving: (p) =>
    p.criticalChanceBonusVersus === undefined ? "" : " gegen Gegner, die sich nicht bewegen",
  criticalChance: (p) => `${p.chance} % Chance auf kritische Treffer${p.holding}${p.versus}`,
  gainEnergyPerCriticalHit: (p) => `erhält ${p.energyPerCritical} Energie je kritischem Treffer`,
  wheneverYouSuccessfullyLandACriticalHit: (p) =>
    `immer wenn du einen kritischen Treffer landest, erhältst du ${p.healthPerCritical} Leben`,
  refreshesEveryTimeYouLandACritical: () =>
    "erneuert sich jedes Mal, wenn du einen kritischen Treffer landest",
  theNextTimeYouLandACritical: (p) =>
    p.endsWhenFired
      ? "wenn du das nächste Mal einen kritischen Treffer landest"
      : "jedes Mal, wenn du einen kritischen Treffer landest",
  with: (p) => (p.weapon === undefined ? p.critical : `${p.critical} mit ${WITH_WEAPON[p.weapon]}`),
  removeStatusFromYourTarget: (p) =>
    p.kind === "remove-status"
      ? `${p.when}: ${lowerFirst(p.text)} von deinem Ziel`
      : `${p.when}: ${lowerFirst(p.text)}`,
  ifOneIsRemovedYouLoseEnergy: (p) =>
    `wird eines entfernt, verlierst du ${p.energyIfRemoved} Energie oder es endet`,
  endsAfterIncomingAttackS: (p) =>
    `endet nach ${p.endsAfterAttacks} ${p.endsAfterAttacks2 === 1 ? "eingehendem Angriff" : "eingehenden Angriffen"}`,
  endsAfterYourNextAttackSHit: (p) =>
    p.endsAfterAttackCount2 === 1
      ? `endet nach deinem nächsten Angriff, ob Treffer, Fehlschlag oder Block`
      : `endet nach deinen nächsten ${p.endsAfterAttackCount} Angriffen, ob Treffer, Fehlschlag oder Block`,
  noEffectWhileUnderOr: (p) =>
    `keine Wirkung unter dem Einfluss von ${p.suppressedWhileUnder.replace(/\beine\b/g, "einer").replace(/\beinen\b/g, "einem")}`,
  yourNextAttackSCannotBeBlocked: (p) =>
    p.unblockableAttacks2 === 1
      ? "dein nächster Angriff kann nicht geblockt werden"
      : `deine nächsten ${p.unblockableAttacks} Angriffe können nicht geblockt werden`,
  attacksCannotBeBlocked: (p) => `${weaponAttacks(p.weapon)} können nicht geblockt werden`,
  whileYouWieldAnAWeapon: (p) =>
    `solange du eine ${damageNoun(p.weaponDamage)}-Waffe führst, ${p.hit}`,
  forEachEnchantmentRemovedSCasterLoses: (p) =>
    `je entfernter ${p.name}-Verzauberung verliert der Wirker von ${p.name2} ${p.percentOfMax} % seines maximalen Lebens`,
  with2: (p) => (p.weapon === undefined ? "" : ` mit ${WITH_WEAPON[p.weapon]}`),
  endsAfterHitS: (p) => `endet nach ${p.count} ${p.count2 === 1 ? "Treffer" : "Treffern"}${p.how}`,
  spellSpells: (p) => (p.one ? "Zauber" : `${p.count} Zauber`),
  yourNextCostsCostLessEnergy: (p) =>
    `${p.one ? "dein nächster" : "deine nächsten"} ${p.next} ${p.one ? "kostet" : "kosten"} ${p.costReduction} weniger Energie`,
  yourNextRechargesRechargeFaster: (p) =>
    `${p.one ? "dein nächster" : "deine nächsten"} ${p.next} ${p.one ? "lädt" : "laden"} sich ${p.rechargeFaster} % schneller auf`,
  forYourNext: (p) => `für deine nächsten ${p.next}`,
  theirProjectilesMoveAsFast: (p) =>
    `ihre Geschosse fliegen ${p.projectileSpeedMultiplier}× so schnell`,
  noOvercast: () => "keine Überanstrengung",
  spreadsToAdjacentCombatants: () => "breitet sich auf angrenzende Kämpfer aus",
  nextAttackSkillDamage: (p) => `nächster Angriffsskill: ${p.condition}: +${p.more} Schaden`,
  attacks: () => "angreift",
  makesAMeleeAttack: () => "einen Nahkampfangriff ausführt",
  moves: () => "sich bewegt",
  takesDamage: (p) => `erleidet ${p.damageTakenMultiplier} Schaden`,
  takesDamageFromTheNextAttack: (p) =>
    `erleidet durch den nächsten Angriff ${damageTaken(p.attackDamageTakenMultiplier)} Schaden`,
  damageTaken2: (p) => `−${p.damageReduction} erlittener Schaden`,
  damageTakenPerRankOfAtMost: (p) =>
    `−${p.now} erlittener Schaden (${p.perRank} je Rang in ${p.attribute}, höchstens ${p.max})`,
  damageTakenMoreEachHit: (p) => `−${p.step} erlittener Schaden, ${p.step} mehr mit jedem Treffer`,
  theNextHitDealsLessDamage: (p) =>
    `der nächste Treffer verursacht ${p.nextDamageReduction} weniger Schaden`,
  damageTakenWhileCastingS: (p) =>
    `−${p.amount} erlittener Schaden beim Wirken von ${pluralNoun(spaced(p.skillType))}`,
  lessDamage: (p) => `${p.value} % weniger ${damageNoun(p.type)}`,
  lessDamageFromFoesWithAHex: (p) =>
    `${p.fraction} % weniger Schaden von Gegnern mit einer ${p.name}-Verhexung`,
  lessDamageFromFoesSufferingFrom: (p) =>
    `${p.fraction} % weniger Schaden von Gegnern, die von ${p.name} betroffen sind`,
  damageTakenFromFoesWithLessHealth: (p) =>
    `−${p.damageReductionFromWeakerFoe} erlittener Schaden von Gegnern mit weniger Leben`,
  damageTakenFromFoesWithACondition: (p) =>
    `−${p.damageReductionFromConditionedFoe} erlittener Schaden von Gegnern mit einem Zustand`,
  lessDamageFromSpells: (p) => `${p.less} % weniger Schaden durch Zauber`,
  damageOverInASecondIsHealed: (p) => `Schaden über ${p.cap} pro Sekunde wird geheilt`,
  physicalItsPhysicalDamageTheDamageIt: (p) =>
    p.from === "physical"
      ? "sein physischer Schaden"
      : "der Schaden, den es durch Angriffe erleidet",
  whichTakesLessOfIt: (p) => `, der davon ${p.reduction} weniger erleidet`,
  goesToItsCaster: (p) =>
    `${share(p.fraction)} von: ${p.hits} geht auf seinen Wirker über${p.less}`,
  theDamageYouTakeGoesToYour: (p) =>
    `${share(p.redirectsDamageToMinion)} des Schadens, den du erleidest, geht auf deinen nächsten Diener über`,
  damageFromASingleHitIsCapped: (p) =>
    `Schaden durch einen einzelnen Treffer ist auf ${p.maxDamageFractionPerHit} % des maximalen Lebens begrenzt`,
  eachHitItCapsCostsTheCaster: (p) =>
    `jeder dadurch begrenzte Treffer kostet den Wirker ${p.casterEnergyPerReduction} Energie, und es endet, wenn der Wirker nicht zahlen kann`,
  damageFromASingleAttackIsCapped: (p) =>
    `Schaden durch einen einzelnen Angriff ist auf ${p.attackDamageCapFraction} % des maximalen Lebens begrenzt`,
  lifeStolen: (p) => `−${p.lifeStealReduction} geraubtes Leben`,
  yourHealthSacrificesAreLarger: (p) => `deine Lebensopfer sind ${p.sacrificeMultiplier} % größer`,
  knockdownsLastAtLeastS: (p) => `Niederschläge dauern mindestens ${p.knockdownMinSeconds} s`,
  itsSpiritLosesHealthEachTime: (p) => `sein Geist verliert jedes Mal ${p.sourceLosesHealth} Leben`,
  reappliedAsItWouldEndWhileYou: (p) =>
    `wird beim Enden erneut angewendet, solange ${p.selfOnly ? "du eine weitere Verhexung hast" : "es eine weitere Verhexung hat"}`,
  chantsAndShoutsLastLongerOnIt: (p) => `Gesänge und Rufe halten auf ihm ${p.longer} % länger`,
  attacksDealLessMoreDamage: (p) =>
    `Angriffe verursachen ${p.attackDamageDelta} ${p.attackDamageDelta2 < 0 ? "weniger" : "mehr"} Schaden`,
  movesFaster: (p) => `bewegt sich ${p.moveSpeedMultiplier} % schneller`,
  healthRegenerationDegeneration: (p) =>
    `${p.healthPips} Lebens${p.healthPips2 > 0 ? "regeneration" : "degeneration"}`,
  armor: (p) => `${p.armorModifier} Rüstung`,
  attacksFaster: (p) => `greift ${p.value} % schneller an`,
  aOr: (p) => `einer ${categoryIds(p.categories)}`,
  listComma: () => ", ",
  whileUnderOr2: (p) => `unter dem Einfluss von ${p.under}: ${p.gains}`,
  once: () => "einmal",
  times: (p) => `${p.stat}-mal`,
  endsAfterItTakesEffect: (p) => `endet, nachdem es ${p.times} gewirkt hat`,
  theNextHexFailsAndItsCaster: (p) =>
    `die nächste Verhexung schlägt fehl und ihr Wirker erleidet ${p.damage} Schaden`,
  theNextSpellItCastsAtFoe: (p) =>
    `der nächste Zauber, den es auf ${p.on === "foe-targeted" ? "einen Gegner" : "einen Verbündeten"} wirkt, schlägt fehl: ${p.what}`,
  theNextTouchSkillsUsedAgainstYou: (p) =>
    `die nächsten ${p.failsFoeTouchSkills} Berührungsskills gegen dich schlagen fehl`,
  foesWithinFoes: (p) =>
    p.area === undefined ? `Gegner innerhalb von ${p.radius}` : `Gegner ${p.area}`,
  moreEachSecond: (p) => `, ${p.growth} mehr pro Sekunde`,
  eachSecondItAndTakeDamage: (p) =>
    `jede Sekunde erleiden ${p.hitsBearer ? "es und " : ""}${p.foes} ${p.damage} ${damageOf(p.kind)}${p.more}`,
  second: () => "Sekunde",
  seconds2: (p) => `${p.every} Sekunden`,
  everySecondSeconds: (p) => `alle ${p.value}: ${p.what}`,
  itsSpiritLosesHealthForEachOne: (p) => `sein Geist verliert ${p.amount} Leben je verletztem Ziel`,
  itsSpiritLosesHealthForEachOne2: (p) => `sein Geist verliert ${p.amount} Leben je geheiltem Ziel`,
  everyAttack: () => "jedes Angriffs",
  theNextAttack: () => "des nächsten Angriffs",
  theNextAttacks: (p) => `der nächsten ${p.times} Angriffe`,
  typelessAsDamage: (p) => (p.type === "typeless" ? "" : ` als ${damageNoun(p.type)}`),
  ofTheDamageOfThatHitIt: (p) =>
    `${p.share} % des Schadens ${p.attacks}, die es treffen, gehen an den Angreifer zurück${p.kind}, bis zu ${p.max}`,
  eachAttackItLandsHasAChance: (p) =>
    `jeder seiner Treffer hat eine Chance von ${p.chance} %, ihm stattdessen selbst den Schaden zuzufügen, bis zu ${p.max}`,
  theNextDamageOrLifeStealHeals: (p) =>
    `der nächste Schaden oder Lebensraub heilt stattdessen um diesen Wert, bis zu ${p.reversesNextDamage}`,
  theNextDamageIsNegatedAndIts: (p) =>
    `der nächste Schaden wird aufgehoben und seine Quelle erleidet ihn stattdessen, bis zu ${p.cap}`,
  meleeAttacksNeitherHitNorFailTo: (p) =>
    `Nahkampfangriffe treffen weder noch verfehlen sie und verursachen stattdessen je ${p.damage} Schaden`,
  allDamageHealsForThatMuchInstead: (p) =>
    `jeglicher Schaden heilt stattdessen um diesen Wert, bis zu ${p.cap} pro Treffer`,
  theNextDamageOrLifeStealThat: (p) =>
    `der nächste Schaden oder Lebensraub, der ${p.selfOnly ? "dich" : "es"} töten würde, wird aufgehoben`,
  whenOneAllySIsSpentIt: () =>
    "ist es bei einem Verbündeten aufgebraucht, endet es auf allen anderen",
  gainMoreStrikeStrikesOfAdrenalinePer: (p) =>
    `erhält je Treffer ${p.extraStrikesPerHit} ${p.extraStrikesPerHit2 === 1 ? "Schlag" : "Schläge"} Adrenalin mehr`,
  skillsRechargeFaster: (p) => `Skills laden sich ${p.skillRechargeFaster} % schneller auf`,
  skillsCostMoreLessEnergy: (p) =>
    `Skills kosten ${p.change} % ${p.change2 > 0 ? "mehr" : "weniger"} Energie`,
  spellsAndBindingRitualsRechargeFaster: (p) =>
    `Zauber und Bindungsrituale laden sich ${p.faster} % schneller auf`,
  spellsRechargeFaster: (p) => `Zauber laden sich ${p.spellRechargeFaster} % schneller auf`,
  bindingRitualsRechargeFaster: (p) => `Bindungsrituale laden sich ${p.faster} % schneller auf`,
  enchantmentsRechargeFaster: (p) =>
    `${p.name}-Verzauberungen laden sich ${p.faster} % schneller auf`,
  hexTheTargetSYour: (p) => (p.category === "hex" ? "seine" : "deine"),
  skillsHaveArmorPenetration: (p) => `${p.name}-Skills haben ${p.pierce} % Rüstungsdurchdringung`,
  yourTheBearerSSkillsCannotBe: (p) =>
    `${p.selfOnly ? "deine Skills können" : "die Skills des Trägers können"} nicht unterbrochen werden`,
  theNextTimeYouWouldBeInterrupted: () =>
    "wenn du das nächste Mal unterbrochen würdest, geschieht das nicht",
  youCannotBeInterruptedEachTimeYou: (p) =>
    `du kannst nicht unterbrochen werden; jedes Mal, wenn es geschehen würde, verlierst du ${p.amount} Energie oder dies endet`,
  youCannotBeInterruptedEachTimeYou2: (p) =>
    `du kannst nicht unterbrochen werden; jedes Mal, wenn es geschehen würde, verlierst du 1 ${p.profession}-Verzauberung oder dies endet`,
  conditionsOnExpireFaster: (p) => `Zustände auf ${p.bearer} laufen ${p.faster} schneller ab`,
  hexesOnExpireFaster: (p) => `Verhexungen auf ${p.bearer} laufen ${p.faster} % schneller ab`,
  theNextHexOnLastsLonger: (p) =>
    `die nächste ${p.of}-Verhexung auf ${p.bearer} hält ${p.longer} länger`,
  hexesCastOnTakeAsLongTo: (p) =>
    `das Wirken von Verhexungen auf ${p.bearer} dauert ${p.times}× so lange`,
  otherAlliesSpellsOnTakeAsLong: (p) =>
    `das Wirken von Zaubern anderer Verbündeter auf ${p.bearer} dauert ${p.times}× so lange`,
  yourSpellsOnTakeAsLongTo: (p) =>
    `das Wirken deiner Zauber auf ${p.bearer} dauert ${p.times}× so lange`,
  enchantmentsCastOnCostLessEnergyMinimum: (p) =>
    `Verzauberungen auf ${p.bearer} kosten ${p.less} weniger Energie, mindestens 1`,
  hitsWithAnAttack: () => "mit einem Angriff trifft",
  failsToHit: () => "nicht trifft",
  hitsWithAnAttackSkill: () => "mit einem Angriffsskill trifft",
  skillEffectEndsIfYouUseA: (p) =>
    p.selfOnly || p.category === "skill-effect"
      ? "endet, wenn du einen Skill nutzt"
      : "endet, wenn der Träger einen Skill nutzt",
  endsIfYouUseAnAdrenalSkill: () => "endet, wenn du einen Adrenalin-Skill nutzt",
  endsIfYouUseANonAdrenal: () => "endet, wenn du einen Nicht-Adrenalin-Skill nutzt",
  endsIfYouUseANonSkill: (p) => `endet, wenn du einen Nicht-${p.kind}-Skill nutzt`,
  endsIfYouUseAnAttackSkill: () => "endet, wenn du einen Angriffsskill nutzt",
  endsIfYouUseASkillOn: () => "endet, wenn du einen Skill darauf nutzt",
  endsIfYouUseASkillThat: (p) =>
    `endet, wenn du einen Skill nutzt, der nicht ${p.NEXT_SKILL_KIND} ist`,
  hexHexedEnchanted: (p) => (p.category === "hex" ? "verhext" : "verzaubert"),
  becomesOr: (p) => `${p.gained} wird`,
  theBearerIsDestroyedWhenItExpires: () => "der Träger wird beim Ablauf zerstört",
  theMinionsYouItTookBecomeMasterless: (p) =>
    `die Diener, die ${p.selfOnly ? "du übernommen hast" : "es übernommen hat"}, werden herrenlos, wenn es endet`,
  whenTheBearerDiesRisesWhereIt: (p) =>
    p.masterless === true
      ? `wenn der Träger stirbt, erhebt sich ${p.stands} herrenlos an seiner Stelle`
      : `wenn es stirbt, erhebt sich ${p.stands} an seiner Stelle`,
  composedKindBoundWhenOn: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.on],
  endsIfItEndsIfYou: (p) =>
    p.onFoe ? `endet, wenn es ${p.when}` : `endet, wenn du ${secondPerson(p.when)}`,
  all: (p) => (p.once && p.against === "all" ? blockAnswer(p.text) : p.text),
  whileHoldingAnItem: (p) =>
    p.onlyWhileHoldingItem && !p.holdingSaid
      ? `${p.stats}, solange ein Gegenstand gehalten wird`
      : p.stats,
  composedIndexText: (p) => (p.index === 0 ? p.text : capitalize(p.text)),
  listSentence: () => ". ",
  physicalAttacks: (p) =>
    p.weapon !== undefined
      ? weaponAttacks(p.weapon)
      : p.physicalOnly
        ? "physische Angriffe"
        : "Angriffe",
  attackSkillsPhysicalAttacks: (p) => (p.attackSkillsOnly ? attackSkills(p.weapon) : p.value),
  foesYourHitGetFor: (p) =>
    `Gegner, die von deinen ${p.attacks} getroffen werden, erhalten ${p.durationSeconds} lang ${p.statusName}`,
  foesYourHitTake: (p) =>
    `Gegner, die von deinen ${p.attacks} getroffen werden, erleiden ${p.riderDamage}`,
  foesYourHitLose: (p) =>
    `Gegner, die von deinen ${p.attacks} getroffen werden, verlieren ${p.count} ${categoryNoun(p.count2, p.category)}`,
  andSoDoFoesAdjacentToThem: (p) => `${p.pop}, ebenso an sie angrenzende Gegner`,
  stealUpToHealth: (p) => `${p.attacks} stehlen bis zu ${p.amount} Leben`,
  yourPetSAttacksHealYouFor: (p) => `die Angriffe deines Tiergefährten heilen dich um ${p.amount}`,
  yourInterruptFoesTheyHit: (p) => `deine ${p.attacks} unterbrechen getroffene Gegner`,
  your: (p) => `deine ${p.attacks}: ${p.text}`,
  attackSkillsPhysicalAttacks2: (p) =>
    p.attackSkillsOnly
      ? attackSkills(p.weapon)
      : p.weapon === undefined
        ? "physische Angriffe"
        : weaponAttacks(p.weapon),
  foesThatBlockYourGetFor: (p) =>
    `Gegner, die deine ${p.attacks} blocken, erhalten ${p.durationSeconds} lang ${p.statusName}`,
  foesThatBlockYour: (p) => `Gegner, die deine ${p.attacks} blocken: ${lowerFirst(p.text)}`,
  damage: (p) => `${p.amount} ${damageNoun(p.type)}`,
  physical: () => "physische",
  elemental: () => "elementare",
  armor2: () => "Rüstung",
  listSpace: () => " ",
  againstProjectileAttacks: (p) =>
    p.projectile ? `${kindedArmor(p.text)} gegen Fernkampfangriffe` : kindedArmor(p.text),
  thatAllyIsHealedFor: (p) => `dieser Verbündete wird um ${p.amount} geheilt`,
  youLoseItsCasterLoses: (p) => (p.bearerIsCaster ? "du verlierst" : "sein Wirker verliert"),
  energy2: (p) => `${p.who} ${p.amount} Energie`,
  orSpell: (p) => `${p.value}-Zauber`,
  wheneverYouCastItCastsAnA: (p) =>
    `immer wenn ${p.bearerIsCaster ? "du" : "es"} einen ${compound(p.spell)} auf einen Verbündeten ${p.bearerIsCaster ? "wirkst" : "wirkt"}, ${p.value}`,
  composedKindBoundWhenEvent: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.event],
  youOrItOr: (p) => (p.bearerIsCaster ? `du ${p.phrases}` : `es ${p.phrases2}`),
  whenItOrOrAtOnce: (p) =>
    p.length === 0 ? p.death : `wenn es ${p.others}, oder sofort ${p.death}`,
  whenItOr: (p) => `wenn es ${p.on}`,
  composedBearerIsCaster: (p) => (p.bearerIsCaster ? YOUR_NEXT_SKILL : NEXT_SKILL),
  theNextTime: (p) => `beim nächsten Mal, wenn ${p.doer}`,
  composedEventWhenOf: (p) =>
    p.event === "bearer-hits"
      ? "treffen"
      : p.event === "bearer-fails-to-hit"
        ? "nicht treffen"
        : p.whenOf,
  wheneverYourArrowsOr: (p) => `immer wenn deine Pfeile ${p.on}`,
  wheneverOnACreatureWithLessHealth: (p) =>
    `immer wenn ${p.doer}${p.victimHasLessHealth === undefined ? "" : " bei einer Kreatur mit weniger Leben"}`,
  and2: () => " und ",
  andAnd: (p) => (p.when === undefined ? p.each : `${p.when}: ${p.each}`),
  youItAnd: (p) => `${p.when}: ${p.bearerIsCaster ? "du" : "es"} und ${p.answer}`,
  youAndAllPartyMembersAreHealed: (p) =>
    `${DROPPED}: du und alle Gruppenmitglieder werden um ${p.healed} geheilt`,
  composedWhat: (p) => `${DROPPED}: ${p.what}`,
  meleeHitsWithAMeleeAttackHits: (p) =>
    p.weapon === "melee"
      ? "mit einem Nahkampfangriff trifft"
      : `mit ${WITH_WEAPON[p.weapon]} trifft`,
  meleeIsHitByAFoeS: (p) =>
    p.weapon === "melee"
      ? "vom Nahkampfangriff eines Gegners getroffen wird"
      : `vom Angriff eines Gegners mit ${WITH_WEAPON[p.weapon]} getroffen wird`,
  with3: (p) => `mit ${WITH_WEAPON[p.weapon]} ${TRIGGER_WHEN[p.event]}`,
  youGainEnergy: (p) => `du erhältst ${p.amount} Energie`,
  allYourSkillsAreRecharged: () => "alle deine Skills sind aufgeladen",
  yourPartyIsHealedFor: (p) => `deine Gruppe wird um ${p.amount} geheilt`,
  takeDamage: (p) => `${lowerFirst(p.upTo)} erleiden ${p.amount} ${damageNoun(p.type)}`,
  areHealedFor: (p) => `${lowerFirst(p.upTo)} werden um ${p.amount} geheilt`,
  composedUpToText: (p) => `${lowerFirst(p.upTo)}: ${lowerFirst(p.text)}`,
  ifTargetFoeDiesWhileHexedWith: (p) =>
    p.bearerIsFoe
      ? "wenn der Zielgegner stirbt, während er hiermit verhext ist"
      : "wenn ein Verbündeter stirbt, während er hiermit verzaubert ist",
  and3: (p) => `${p.who}, ${p.flatMap}`,
  hasASpellInterrupted: () => "bei einem Zauber unterbrochen wird",
  isStruckForDamageWhileUsingA: (p) =>
    `beim Nutzen eines Skills von ${damageNamed(p.damageType)} getroffen wird`,
  takesDamageFromAFoe: (p) => `von einem Gegner ${damageNamed(p.damageType)} erleidet`,
  takesMoreThanDamageFromAFoe: (p) => `von einem Gegner mehr als ${p.minDamage} Schaden erleidet`,
  hasItsHealthDroppedBelowByDamage: (p) => `durch Schaden unter ${p.healthBelow} % Leben fällt`,
  isMoreThanFromYou: (p) => `mehr als ${p.apartBeyond} von dir entfernt ist`,
  hitsWithAAttack: (p) => `mit ${CHAIN_ARTICLED[p.chainRole]} trifft`,
  isHitByAnAttackAAttack: (p) =>
    `von ${p.role === undefined ? "einem Angriff" : CHAIN_ARTICLED[p.role]} seines Wirkers getroffen wird`,
  blocksAAttack: (p) =>
    `einen ${p.blocked === "melee" ? "Nahkampfangriff" : p.blocked === "projectile" ? "Fernkampfangriff" : p.blocked} blockt`,
  losesAEnchantment: (p) => `eine ${p.name}-Verzauberung verliert`,
  hex2: (p) => compound(`${p.scopeAdjective} Verhexung`),
  appliesAnAToAFoe: (p) => `einem Gegner eine ${compound(p.words)} zufügt`,
  spell: (p) => (p.type === undefined ? "Zauber" : typeName(p.type)),
  onAllyAnAllyAFoe: (p) => ` auf ${p.targets === "ally" ? "einen Verbündeten" : "einen Gegner"}`,
  castsAnA: (p) => `${p.on.trim()} einen ${compound(p.words)} wirkt`.trim(),
  non: (p) => `Nicht-${TYPE_STEM[p.notType]}`,
  elite: () => "Elite",
  adrenal: () => "Adrenalin",
  skill: () => "Skill",
  isTargetedByYour: (p) => `zum Ziel deines ${compound(p.words)}s wird`,
  on: (p) => (p.targets === undefined ? "" : ` auf ${TARGETS_WORDS[p.targets]}`),
  usesAnA: (p) => `${p.on.trim()} einen ${compound(p.words)} nutzt`.trim(),
  health2: (p) => `${p.amount} Leben`,
  energy3: (p) => `${p.amount} Energie`,
  takeDamage2: (p) => `erleiden ${p.amount} ${damageNoun(p.type)}`,
  loseAllAllS: (p) =>
    `verlieren ${p.value} ${p.count === 1 ? CATEGORY[p.category].one : CATEGORY[p.category].many}`,
  all2: (p) => `alle ${p.side}`,
  upTo: (p) => `bis zu ${p.maxTargets} ${p.side}`,
  withinOfThatCreature: (p) =>
    AREA_AROUND_CREATED.get(p.radius) ?? `innerhalb von ${p.radius2} um diese Kreatur`,
  gain: (p) => `erhalten ${p.answer}`,
  youGain: (p) => `${p.when}: ${p.gains ? `du erhältst ${p.answers}` : p.answers}`,
  onIt: () => "auf ihm",
  damageOnIt: (p) => `${p.value}${p.amount} ${damageNoun(p.type)} ${p.perCount}`,
  composedWhenWhat: (p) => `${p.when}: ${p.what}`,
  itsAdjacentAllies: () => "seine angrenzenden Verbündeten",
  itsAlliesWithin: (p) => `seine Verbündeten ${p.area ?? `innerhalb von ${p.radius}`}`,
  itsAdjacentAlliesItsAlliesWithin: (p) =>
    !p.bearerIsFoe ? `${lowerFirst(p.foesWithin)}${p.only}` : p.value,
  bearerBlocksMeleeMeleeProjectile: (p) =>
    p.on === "bearer-blocks-melee" ? "Nahkampf" : "Fernkampf",
  whenYouBlockYouAndAlliesAre: (p) =>
    `wenn du blockst, werden du und Verbündete ${p.area} um ${p.amount} geheilt`,
  eachBlockCostsYouEnergyOrThis: (p) =>
    `jeder Block kostet dich ${p.amount} Energie oder dies endet`,
  youGainEnergyForEachSuccessfulAttack: (p) =>
    `du erhältst ${p.amount} Energie je erfolgreich geblocktem ${p.kind}angriff`,
  wheneverYouBlockAAttackThisWay: (p) =>
    `immer wenn du so einen ${p.kind}angriff blockst, erleidet der Angreifer ${p.amount} ${damageNoun(p.type)}`,
  withinOfYouFoes: (p) =>
    `Gegner ${AREA_TEXT.get(p.radius) ?? `innerhalb von ${p.radius2} um dich`}`,
  ifYouBlockAAttackSufferFrom: (p) =>
    `wenn du einen ${p.kind}angriff blockst, leiden ${p.foes} ${p.resolveMagnitudeAtRanks} Sekunden lang an ${p.statusName}`,
  ifYouBlockAAttack: (p) =>
    `wenn du einen ${p.kind}angriff blockst, ${p.foes}: ${lowerFirst(p.text)}`,
  stealsHealthFromThatFoe: (p) => `stiehlt diesem Gegner ${p.amount} Leben`,
  loses: (p) => `verliert ${p.count} ${categoryNoun(p.count2, p.category)}`,
  itTakesDamage: (p) => `es erleidet ${p.amount} ${damageNoun(p.type)}`,
  takeDamage3: (p) => `${p.splashed} erleiden ${p.amount} ${damageNoun(p.type)}`,
  thatAttackIsInterruptedAndAnd: (p) => `${p.when}, wird dieser Angriff unterbrochen und ${p.hurt}`,
  itIsInterruptedAndYouLoseEnergy: (p) =>
    `${p.when}, wird es unterbrochen und du verlierst ${p.amount} Energie oder dies endet`,
  ofThatSkillSBaseEnergyCost: (p) => `${p.share} der Grund-Energiekosten dieses Skills`,
  energy4: (p) => `${p.amount} Energie`,
  youAreHealedAreHealedIsHealed: (p) =>
    p.bearerIsCaster && p.length === 0
      ? "du wirst geheilt"
      : p.bearerIsCaster
        ? "werden geheilt"
        : "wird geheilt",
  forOfThatSkillSEnergyCost: (p) => `${p.healed} um ${p.share} der Energiekosten dieses Skills`,
  forWord: (p) => `${p.healed} um ${p.amount}`,
  plus: () => " plus ",
  youGainGainsPlus: (p) => `${p.bearerIsCaster ? "du erhältst" : "erhält"} ${p.gains}`,
  theNearestOf: (p) => `der nächste von ${dative(p.splashed)}`,
  upTo2: (p) => `bis zu ${p.maxTargets} ${p.splashed}`,
  itAndLoseEnergy: (p) => `es und ${p.others} verlieren ${p.amount} Energie`,
  bearerFoesFoesOtherFoes: (p) => (p.to === "bearer-foes" ? "Gegner" : "andere Gegner"),
  inTheAreaSufferItToo: (p) => `${p.who} im Gebiet erleiden es ebenfalls`,
  ifASpellItThatSkill: (p) => (p.spellsOnly ? "wenn es ein Zauber ist, dieser" : "dieser Skill"),
  takesThisSkillSSlotForSeconds: (p) =>
    `${p.which} nimmt ${p.seconds} Sekunden lang den Platz dieses Skills ein`,
  youEnterTheSameStance: () => "du nimmst dieselbe Haltung ein",
  youLoseEnergyOrThisEnds: (p) => `du verlierst ${p.amount} Energie oder dies endet`,
  thatAttackIsInterrupted: (p) => `${p.when}, wird dieser Angriff unterbrochen`,
  takes: (p) => `erleidet ${p.dealt} ${p.when}`,
  bearerFatalDamageNegatedAnd: (p) =>
    p.on === "bearer-fatal-damage-negated" ? "und" : `${p.when},`,
  theFoeWhoDealtItTakesDamage: (p) =>
    `${p.then} erleidet der Gegner, der ihn verursacht hat, ${p.amount} ${damageNoun(p.type)}`,
  thatAttackerIsHealedFor: (p) => `${p.when}, wird dieser Angreifer um ${p.amount} geheilt`,
  bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p) =>
    p.on === "bearer-gains-enchantment" ? "Verzauberung" : "Verhexung oder Verzauberung",
  theCasterOfThatTakesDamage: (p) =>
    `${p.when}, erleidet der Wirker dieser ${p.gained} ${p.amount} ${damageNoun(p.type)}`,
  theHealerTakesDamage: (p) => `${p.when}, erleidet der Heiler ${p.amount} ${damageNoun(p.type)}`,
  ofThatTarget: (p) => `${lowerFirst(p.upTo)} dieses Ziels ${p.what}${p.paid}`,
  healsItsCasterFor: (p) => `heilt seinen Wirker um ${p.amount}, ${p.when}`,
  itsCasterGainsEnergy: (p) => `sein Wirker erhält ${p.amount} Energie, ${p.when}`,
  theNextSkillYouUseItUses: (p) =>
    `der nächste Skill, den ${p.bearerIsCaster ? "du nutzt" : "es nutzt"}, braucht ${p.seconds} Sekunden länger zum Aufladen`,
  itsCasterStealsHealth: (p) => `sein Wirker stiehlt ${p.amount} Leben, ${p.when}`,
  theNearestOfTakes: (p) => `der nächste von ${dative(p.allies)} erleidet`,
  take: (p) => `${p.allies} erleiden`,
  upToTake: (p) => `bis zu ${p.maxTargets} ${p.allies} erleiden`,
  composedAlliesText: (p) => `${p.allies}: ${lowerFirst(p.text)}`,
  onAFoe: (p) => `${p.when} bei einem Gegner`,
  adjacentToYou: () => "angrenzend an dich",
  withinAroundYou: (p) => `${p.area ?? `innerhalb von ${p.radius}`} um dich herum`,
  otherAdjacentToYouWithinAroundYou: (p) =>
    `${p.includesCentre === true ? "" : "andere "}${SPLASH_SIDE[p.hits]} ${p.value}`,
  takeDamage4: (p) => `${p.yours}, ${p.reached} erleiden ${p.amount} ${damageNoun(p.type)}`,
  composedYoursReachedText: (p) => `${p.yours}, ${p.reached}: ${lowerFirst(p.text)}`,
  composedBearerIsCasterSaid: (p) =>
    p.bearerIsCaster ? yourCondition(p.said) : p.said.replace(/^Wenn das Ziel/, "Wenn es"),
  composedWhenConditionText: (p) => `${p.when}, ${p.condition}: ${lowerFirst(p.text)}`,
  bearer: (p) => lowerFirst(p.target === "bearer" ? p.bearer : p.text),
  nextAttackSkill: (p) => `nächster Angriffsskill: ${p.statusName} ${p.durationSeconds}`,
  nextAttackSkill2: (p) => `nächster Angriffsskill: ${p.text}`,
  skillTargetAroundItsTarget: (p) => (p.at === "skill-target" ? " (um sein Ziel herum)" : ""),
  withYourNext: (p) => `bei deinem nächsten ${p.next}${p.around}: ${lowerFirst(p.text)}`,
  costsCostEnergy: (p) => `${p.one ? "kostet" : "kosten"} ${p.energyBase} Energie`,
  costsCostLessEnergy: (p) =>
    `${p.one ? "kostet" : "kosten"} ${p.energyPercentOff} weniger Energie`,
  costsCostLessEnergyMinimum: (p) =>
    `${p.one ? "kostet" : "kosten"} ${p.energyDiscount} weniger Energie (mindestens ${p.energyFloor})`,
  costsCostMoreEnergy: (p) => `${p.one ? "kostet" : "kosten"} ${p.energySurcharge} mehr Energie`,
  castsCastInstantly: (p) => `${p.one ? "wirkt" : "wirken"} sofort`,
  castsCastFaster: (p) => `${p.one ? "wirkt" : "wirken"} ${p.activationMultiplier} schneller`,
  takesTakeAsLongToCast: (p) =>
    `${p.one ? "braucht" : "brauchen"} ${p.activationMultiplier}× so lange zum Wirken`,
  castsCastFaster2: (p) => `${p.one ? "wirkt" : "wirken"} ${p.activationSecondsLess} schneller`,
  rechargesRechargeFaster: (p) =>
    `${p.one ? "lädt" : "laden"} sich ${p.rechargeFaster} schneller auf`,
  rechargesRechargeSlower: (p) =>
    `${p.one ? "lädt" : "laden"} sich ${p.rechargeSlower} langsamer auf`,
  lastsLastLongerShorter: (p) =>
    `${p.one ? "hält" : "halten"} ${p.durationMultiplier} ${p.durationMultiplier2 > 1 ? "länger" : "kürzer"}`,
  healsHealLessMoreNotTheDivine: (p) =>
    `${p.one ? "heilt" : "heilen"} ${p.value} ${p.healMultiplier < 1 ? "weniger" : "mehr"}${p.sparesDivineFavor ? ", nicht den Bonus der Göttlichen Gunst" : ""}`,
  isAreNotEasilyInterrupted: (p) => `${p.one ? "ist" : "sind"} nicht leicht zu unterbrechen`,
  overcastYouBy: (p) => `erzeugen bei dir ${p.overcastPerUse} Überanstrengung`,
  andAttack: (p) =>
    `${p.chainRoles
      .replace(/\boff-hand\b/g, "Nebenhand")
      .replace(/\bdual\b/g, "Doppel")
      .replace(/\blead\b/g, "Eröffnungs")
      .replaceAll(" und ", "- und ")}angriff`,
  attackSkillSkill: (p) =>
    p.weapon !== undefined
      ? `${WEAPON_WORD[p.weapon]}angriffsskill`
      : p.type === undefined
        ? "Skill"
        : spaced(p.type),
  hexHexesS: (p) => (p.one ? p.kind : pluralNoun(p.kind)),
  thatTargetsAFoeThatTargetA: () => "gegen einen Gegner",
  thatTargetsYouThatTargetYou: () => "auf dich",
  halfRanged: () => "halbreichweitige",
  notFlashEnchantments: (p) => (p.notFlash ? " (keine Blitzverzauberungen)" : ""),
  whileHoldingAnItem2: (p) => (p.whileHoldingItem ? "solange du einen Gegenstand hältst, " : ""),
  nextNext: (p) =>
    p.one ? `${p.whose === "deine" ? "dein" : "sein"} nächster` : `${p.whose} nächsten ${p.uses}`,
  cannotBeInterrupted: () => "kann nicht unterbrochen werden",
  cannotBeBlocked: () => "kann nicht geblockt werden",
  costsLessEnergy: (p) => `kostet ${p.energyDiscount} weniger Energie`,
  castsInstantly: () => "wirkt sofort",
  rechargesInstantly: () => "lädt sich sofort auf",
  s2: (p) => `${p.value} s`,
  takesSLongerToRecharge: (p) => `braucht ${p.extraRechargeSeconds} länger zum Aufladen`,
  yourNextAnd: (p) => `dein nächster ${p.NEXT_SKILL_KIND} ${p.does}`,
  youLoseAllEnergyAsItIs: () => "du verlierst beim Wirken alle Energie",
  youGainOfItsEnergyCost: (p) => `du erhältst ${p.energyGainOfCost} seiner Energiekosten`,
  itRechargesFaster: (p) => `es lädt sich ${p.fraction} % schneller auf`,
  rechargesInstantly2: (p) => `${p.name} lädt sich sofort auf`,
  forYourNextSkill: () => "für deinen nächsten Skill",
  ifItIsAAnd: (p) => `wenn es ein ${p.kind} ist, ${p.does}`,
  suffer: (p) => `erleiden ${p.sufferedWhat}`,
  forWord2: (p) => `${p.statusName} für ${p.durationSeconds} (${p.status})`,
  a: (p) => `${CATEGORY[p.category].a} ${compound(p.owners)}-${CATEGORY[p.category].one}`,
  ifItInterruptsASkill: () => "Wenn es einen Skill unterbricht",
  ifThatActionWasASpell: () => "Wenn diese Aktion ein Zauber war",
  ifThatActionWasAnAttack: () => "Wenn diese Aktion ein Angriff war",
  ifItKillsTheTarget: () => "Wenn es das Ziel tötet",
  ifItResurrects: () => "Wenn es wiederbelebt",
  ifASpiritDiedInThisWay: () => "Wenn dabei ein Geist gestorben ist",
  ifWasRemoved: (p) =>
    `Wenn ${CATEGORY[p.category].nominative} ${CATEGORY[p.category].one} entfernt wurde`,
  ifItRemoves: (p) => `Wenn es ${aCategory(p.category)} entfernt`,
  ifTargetIsBelowHealth: (p) => `Wenn das Ziel unter ${p.fraction} % Leben ist`,
  ifTargetIsAboveHealth: (p) => `Wenn das Ziel über ${p.fraction} % Leben ist`,
  ifYouHaveLessThanHealth: (p) => `Wenn du weniger als ${p.fraction} % Leben hast`,
  ifYouHaveLessHealthThanYour: () => "Wenn du weniger Leben hast als dein Tiergefährte",
  ifYourPetHasLessHealthThan: () => "Wenn dein Tiergefährte weniger Leben hat als du",
  ifItFollowsOffHandAnOff: (p) => `Wenn es auf ${CHAIN_ARTICLED[p.role]} folgt`,
  ifTargetHas: (p) => `Wenn das Ziel ${p.filteredCategory} hat`,
  ifTargetHasOr: (p) => `Wenn das Ziel ${p.categories} hat`,
  ifYouHave: (p) => `Wenn du ${aCategory(p.category)} hast`,
  ifYouHaveA: (p) => `Wenn du ${CATEGORY[p.category].a} ${p.name}-${CATEGORY[p.category].one} hast`,
  other: (p) => (p.excluding === undefined ? "" : "andere "),
  ifYouHaveNo: (p) => `Wenn du ${noOther(p.category, p.other, CATEGORY[p.category].one)} hast`,
  ifYouHaveNo2: (p) =>
    `Wenn du ${noOther(p.category, p.other, `${p.name}-${CATEGORY[p.category].one}`)} hast`,
  ifTargetIsCastingASpellOr: (p) =>
    p.orChant === true
      ? "Wenn das Ziel einen Zauber oder Gesang wirkt"
      : "Wenn das Ziel einen Zauber wirkt",
  ifTargetIsUsingASkill: () => "Wenn das Ziel einen Skill nutzt",
  ifTargetHasNoOtherHex: (p) => `Wenn das Ziel keine andere ${p.name}-Verhexung hat`,
  ifTargetIsNotAdjacentToAny: () => "Wenn das Ziel an keinen Verbündeten angrenzt",
  ifTargetIsNotNearAnyAllies: () => "Wenn das Ziel keine Verbündeten in der Nähe hat",
  ifTargetHasNoAlliesWithin: (p) => `Wenn das Ziel keine Verbündeten innerhalb von ${p.radius} hat`,
  ifTargetIsNearAnyOfYour: () => "Wenn das Ziel in der Nähe eines deiner Verbündeten ist",
  ifAnyOfYourAlliesIsWithin: (p) =>
    `Wenn einer deiner Verbündeten innerhalb von ${p.radius} um das Ziel ist`,
  ifTargetIsWithinEarshot: () => "Wenn das Ziel in Hörweite ist",
  ifTargetIsWithinOfYou: (p) => `Wenn das Ziel innerhalb von ${p.radius} um dich ist`,
  ifTargetIsNotMoving: () => "Wenn das Ziel sich nicht bewegt",
  ifTargetIsKnockedDown: () => "Wenn das Ziel niedergeschlagen ist",
  ifTargetIsMoving: () => "Wenn das Ziel sich bewegt",
  ifTargetIsAFoe: () => "Wenn das Ziel ein Gegner ist",
  ifTargetIsMovingFasterThanNormal: () => "Wenn das Ziel sich schneller als normal bewegt",
  ifAnyFoeIsKnockedDownIf: (p) =>
    p.knockedDown === true
      ? `Wenn ein Gegner ${p.where} niedergeschlagen ist`
      : `Wenn ein Gegner ${p.where} ist`,
  ifYouHitOrMoreFoes: (p) => `Wenn du mindestens ${p.atLeast} Gegner triffst`,
  ifNumberOrMore: (p) => `Wenn die Anzahl an ${dative(p.countAll)} mindestens ${p.atLeast} beträgt`,
  ifAreNoMoreThan: (p) =>
    `Wenn die Anzahl an ${dative(p.countAll)} nicht größer ist als die Anzahl an ${dative(p.countAll2)}`,
  ifTargetHas2: (p) => `Wenn das Ziel von ${p.statusName} betroffen ist`,
  ifTargetDoesNotHave: (p) => `Wenn das Ziel nicht von ${p.statusName} betroffen ist`,
  ifYouHaveMoreEnergyThanTarget: () => "Wenn du mehr Energie hast als das Ziel",
  ifYouHaveLessThanEnergy: (p) => `Wenn du weniger als ${p.amount} Energie hast`,
  ifYouAreOvercast: () => "Wenn du überanstrengt bist",
  ifYouWield: (p) => `Wenn du ${NEEDED_WEAPON[p.weapon]} führst`,
  ifYouHoldAShield: () => "Wenn du einen Schild hältst",
  ifYouAreHoldingAnItem: () => "Wenn du einen Gegenstand hältst",
  ifTargetHasLessHealthThanYou: () => "Wenn das Ziel weniger Leben hat als du",
  ifTargetHasMoreHealthThanYou: () => "Wenn das Ziel mehr Leben hat als du",
  ifTargetIsAttacking: () => "Wenn das Ziel angreift",
  ifTargetIsNotAttacking: () => "Wenn das Ziel nicht angreift",
  ifTargetIsCastingASpellOr2: () => "Wenn das Ziel einen Zauber wirkt oder angreift",
  ifTargetIsASummonedCreature: () => "Wenn das Ziel eine beschworene Kreatur ist",
  ifNoSpiritIsWithinOfYou: (p) =>
    `Wenn kein Geist ${AREA_TEXT.get(p.radius) ?? `innerhalb von ${p.radius2}`} bei dir ist`,
  ifASpiritIsWithinOfYou: (p) =>
    `Wenn ein Geist ${AREA_TEXT.get(p.radius) ?? `innerhalb von ${p.radius2}`} bei dir ist`,
  ifYouControlOrFewerS: (p) =>
    `Wenn du höchstens ${p.count} ${p.creature === "spirit" ? "Geister" : p.creature === "minion" ? "Diener" : pluralNoun(spaced(p.creature))} kontrollierst`,
  ifASpiritOrACorpseIs: (p) =>
    `Wenn ein Geist oder eine Leiche ${AREA_TEXT.get(p.radius) ?? `innerhalb von ${p.radius2}`} bei dir ist`,
  ifAnAllyIsDeadWithin: (p) => `Wenn ein Verbündeter ${within(p.radius, p.radius2)} tot ist`,
  ifTargetIsNearACorpseOr: () =>
    "Wenn das Ziel in der Nähe einer Leiche ist oder sein Tiergefährte tot ist",
  ifTargetIsWithinOfACorpse: (p) =>
    `Wenn das Ziel innerhalb von ${p.radius} um eine Leiche ist oder sein Tiergefährte tot ist`,
  composedType: (p) => (p.type === undefined ? "" : typeWord(p.type)),
  healthForEachAllyMax: (p) => `, +${p.amount} Leben je Verbündeter ${p.area} (max. ${p.max})`,
  allPartyMembers: () => "Alle Gruppenmitglieder",
  allItsPartyMembers: () => "Alle Mitglieder seiner Gruppe",
  allAlliedMinions: () => "Alle verbündeten Diener",
  yourOtherMinions: () => "Deine anderen Diener",
  within2: (p) => `${p.Who} ${p.area ?? `innerhalb von ${p.radius}`}`,
  adjacent: (p) => placed("Angrenzende", "angrenzend", p.who),
  nearby: (p) => `${capitalize(p.who)} in der Nähe`,
  within3: (p) =>
    p.area === undefined ? `${p.Who} innerhalb von ${p.radius}` : `${p.Who} ${p.area}`,
  loseThatSame: (p) => `verlieren dieselbe ${CATEGORY[p.category].one}`,
  loseAllAll: (p) => `verlieren alle ${categoryNoun("all", p.category)}`,
  onThem: () => "auf ihnen",
  loseOneForEachOnThem: (p) =>
    `verlieren ${CATEGORY[p.category].a} ${CATEGORY[p.category].one} je ${p.countEach}`,
  lose: (p) => `verlieren ${p.count} ${categoryNoun(p.count2, p.category)}`,
  enchantmentAnA: (p) => (p.onlyBearing === undefined ? "" : CATEGORY[p.onlyBearing].a),
  with4: (p) =>
    p.onlyBearing === undefined
      ? ""
      : ` mit ${CATEGORY[p.onlyBearing].a
          .replace(/^eine$/, "einer")
          .replace(/^einen$/, "einem")
          .replace(/^ein$/, "einem")} ${CATEGORY[p.onlyBearing].one}`,
  usingSkills: (p) =>
    p.onlyUsing === undefined ? "" : `, die ${TYPE_STEM[p.onlyUsing]}skills nutzen`,
  dead: (p) => (p.dead === true ? `Tote ${p.living}` : p.living),
  targetAndCasterAroundYouCasterAround: (p) =>
    `${p.includesCentre === true ? `Das Ziel und ${lowerFirst(p.reached)}` : p.reached}${p.around === "caster" ? " um dich herum" : ""}${p.alsoAround === "caster" ? " um das Ziel und dich herum" : ""}${p.bearing}${p.using}${p.onlyIf}`,
  upTo3: (p) => `Bis zu ${p.maxTargets} ${lowerFirst(p.who)}`,
  inItsRange: () => "in seiner Reichweite",
  inTheArea: () => "im Gebiet",
  foes: () => "Gegner",
  allEveryoneYouAndAlliesAllies: (p) =>
    p.affects === "all" ? "alle" : p.includesCaster ? "du und Verbündete" : "Verbündete",
  enemiesFoesAllEveryoneYouAndAllies: (p) => `${p.value} ${within(p.radius, p.radius2)}`,
  whenSprung: () => "beim Auslösen",
  after: (p) => `nach ${seconds(p.delaySeconds)}`,
  everyFor: (p) => `alle ${seconds(p.everySeconds)}, ${seconds(p.count)} lang`,
  whenItEnds: (p) => `Wenn es endet, ${p.whom}: `,
  springsByItselfAsItsTimeRuns: () => "Löst von selbst aus, wenn seine Zeit abläuft",
  composedWhoText: (p) => `${capitalize(p.who)}: ${lowerFirst(p.text)}`,
  composedEndingText: (p) => `${p.ending}${lowerFirst(p.text)}`,
  composedConditionText: (p) => `${p.condition}: ${lowerFirst(p.text)}`,
  itsAttacksDealDamage: (p) => `Seine Angriffe verursachen ${p.magnitude} Schaden`,
  thisSpiritLosesHealth: (p) => `dieser Geist verliert ${p.magnitude} Leben`,
  composedCondition: (p) => `${lowerFirst(p.condition)}: `,
  itsAttacks: (p) => `Seine Angriffe: ${p.when}${p.what}`,
  health3: (p) => `${p.health} Leben`,
  health4: (p) => `${p.health} Leben (${p.health2})`,
  level: (p) => `Stufe ${p.marked}, `,
  lastsSeconds: (p) => `, hält ${p.durationSeconds} Sekunden`,
  composedCountNameLevelTextHealthTextLasts: (p) =>
    `${p.count} ${p.name} (${p.levelText}${p.healthText}${p.lasts})`,
  itsAttacksDealDamage2: (p) => `Seine Angriffe verursachen ${p.value} Schaden`,
  onlyOneAtATimeANew: () => "Nur einer zur selben Zeit: ein neuer tötet den alten",
  leavesCorpseCorpsesWhenItDies: (p) =>
    `Hinterlässt beim Tod ${p.corpses} ${p.current === 1 ? "Leiche" : "Leichen"}`,
  whenItDiesStandsUpInIts: (p) => `Wenn es stirbt, erhebt sich ${p.text} an seiner Stelle`,
  listSemicolon: () => "; ",
  inItsRange2: (p) => AREA_TEXT.get(p.radius) ?? "in seiner Reichweite",
  composedAffectsWhere: (p) => `${AURA_WHO[p.affects]} ${p.where}`,
  whenItDiesUnderHealthBeginFor: (p) =>
    `Wenn es stirbt, erleiden ${p.who} unter ${p.below} Leben ${p.duration} Sekunden lang ${p.statusName}`,
  whenItDiesDeadPartyMembersAre: (p) =>
    `Wenn es stirbt, werden tote Gruppenmitglieder ${p.where} mit ${p.health} % Leben und ohne Energie wiederbelebt`,
  damageTakeDamageAreHealedForHealth: (p) =>
    p.effect === "damage" ? `erleiden ${p.amount} Schaden` : `werden um ${p.amount} Leben geheilt`,
  max: (p) => ` (max. ${p.max})`,
  whenItDiesPerSecondItLived: (p) =>
    `Wenn es stirbt: ${p.who} ${p.what} je Sekunde, die es gelebt hat${p.max}`,
  everySecondsHealsTheMostHurtNon: (p) =>
    `Alle ${p.everySeconds} Sekunden: heilt den am stärksten verletzten Verbündeten ${p.where}, der kein Geist ist, um ${p.heal} Leben`,
  whenANonSpiritDiesInIts: () => "Wenn in seiner Reichweite etwas stirbt, das kein Geist ist",
  nearby2: (p) => AREA_TEXT.get(p.radius) ?? "in der Nähe",
  itsConditionsSpreadToEachNonSpirit: (p) =>
    `${p.when}, gehen seine Zustände auf jede Kreatur ${p.where} über, die kein Geist ist und einen Zustand hat`,
  eachOfItsTypeInItsRange: (p) =>
    `${p.when}, erleidet jede Kreatur seiner Art in seiner Reichweite mit weniger als ${p.below} Leben ${p.damage} Schaden`,
  holdingAnItem: (p) => (p.onlyWhileHoldingItem ? ", die einen Gegenstand halten" : ""),
  composedWhoWhereHoldingStatus: (p) => `${p.who} ${p.where}${p.holding}: ${p.status}`,
  perFoeHit: (p) => (p.perTarget === undefined ? "" : " je getroffenem Gegner"),
  forEachMeleeAttackSkillOnYour: (p) =>
    ` je Nahkampf-Angriffsskill auf deiner Leiste (höchstens ${p.max})`,
  withinEarshot: (p) => (p.area === "in Hörweite" ? "in Hörweite" : p.area),
  forEverySummonedCreatureYouControlMaximum: (p) =>
    ` je beschworener Kreatur ${p.where} unter deiner Kontrolle (maximal ${p.max} Energie)`,
  composedZeroAloneEachText: (p) => (p.zero ? `${p.alone} ${p.each}` : `${p.text}, +${p.each}`),
  maximum: (p) => ` (maximal ${p.max})`,
  forEach: (p) => `je ${p.countEach}${p.max}`,
  pointOfEnergyGained: () => "erhaltenem Energiepunkt",
  pointOfEnergyRestrictedByOvercast: () => "durch Überanstrengung gesperrtem Energiepunkt",
  skillDisabledInThisWay: () => "so deaktiviertem Skill",
  orCasterOnYou: (p) =>
    `${categoryIds(p.categories)} ${p.on === "caster" ? "auf dir" : p.onTarget}`,
  ofYourRecharging: (p) => `deiner sich aufladenden ${p.rechargingSkillsNoun}`,
  pointOfEnergyCasterYouHaveThey: (p) =>
    `Energiepunkt, den ${p.on === "caster" ? "du hast" : "es hat"}`,
  orRemoved: (p) => `entfernter ${categoryIds(p.categories)}`,
  orLost: (p) => `verlorener ${p.name}-${categoryIds(p.categories)}`,
  enchantmentYouAreMaintaining: () => "von dir aufrechterhaltener Verzauberung",
  secondItWasInEffect: () => "Sekunde, die es gewirkt hat",
  foeKnockedDown: () => "niedergeschlagenem Gegner",
  youHaveEquipped: (p) => `${spaced(p.type)} auf deiner Leiste`,
  adrenalineSkillTheyHave: () => "Adrenalin-Skill, den es hat",
  foeHit: () => "getroffenem Gegner",
  within4: (p) => `${p.perCountNoun} ${within(p.radius, p.radius2)}`,
  attacksSkillsS: (p) =>
    p.weapon !== undefined
      ? weaponAttacks(p.weapon)
      : p.type === undefined
        ? "Skills"
        : pluralNoun(spaced(p.type)),
  casterYourTargetS: (p) => (p.on === "caster" ? "deine" : "seine"),
  s3: (p) => pluralNoun(p.perCountNoun),
  pointOfOvercast: () => "Punkt Überanstrengung",
  skillDisabled: () => "deaktivierter Skill",
  rechargingSkill: () => "sich aufladender Skill",
  pointOfEnergy: () => "Energiepunkt",
  removedOr: (p) => `entfernte ${categoryIds(p.categories)}`,
  removedOr2: (p) => `entfernte ${p.name}-${categoryIds(p.categories)}`,
  maintainedEnchantment: () => "aufrechterhaltene Verzauberung",
  secondHeld: () => "gehaltene Sekunde",
  adrenalineSkill: () => "Adrenalin-Skill",
  deadAlly: () => "toter Verbündeter",
  knockedDownFoeFoe: (p) => (p.knockedDown === true ? "niedergeschlagener Gegner" : "Gegner"),
  ally: () => "Verbündeter",
  neverAbove: (p) => `, nie über ${p.upTo}`,
  forEachRemoved: (p) =>
    p.toTarget === true || p.perRemoved === undefined
      ? ""
      : ` je entfernter ${CATEGORY[p.perRemoved].one}`,
  perPointLost: (p) => (p.perEnergyLost === undefined ? "" : " je verlorenem Punkt"),
  armorPenetration: (p) => ` (${p.armorPenetration} % Rüstungsdurchdringung)`,
  dealsDamage2: (p) =>
    `Verursacht ${p.magnitude} ${damageNoun(p.type)}${p.perPointLost}${p.penetration}`,
  deals: () => "Verursacht",
  damage2: (p) => ` ${damageNoun(p.type)}`,
  composedCountedConditionAmount: (p) => `${p.counted}; ${lowerFirst(p.condition)}: +${p.amount}`,
  gainHealthEqualToThisSpellS: () =>
    "Erhalte Leben in Höhe des Bonus der Göttlichen Gunst dieses Zaubers",
  healsIfRelievedOf: (p) => `Heilt ${p.amount}, wenn es von ${p.name} befreit wird`,
  healsForOfYourCurrentHealthMaximum: (p) =>
    `Heilt um ${p.magnitude} deines aktuellen Lebens (maximal ${p.max} Leben)`,
  youGainHealth: (p) => `Du erhältst ${p.amount} Leben`,
  yourPetGainsHealth: (p) => `Dein Tiergefährte erhält ${p.amount} Leben`,
  ownerHealsItsOwnerForHealsFor: (p) =>
    p.recipient === "owner" ? `Heilt seinen Besitzer um ${p.amount}` : `Heilt um ${p.amount}`,
  healsForEachRemovedHealsForEach: (p) =>
    p.perRemoved !== undefined
      ? `Heilt ${p.amount} je entfernter ${CATEGORY[p.perRemoved].one}`
      : p.perDestroyedSpirit === true
        ? `Heilt ${p.amount} je zerstörtem Geist`
        : p.perEnergyLost === true
          ? `${p.recipient === "caster" ? "Du wirst geheilt um" : "Heilt"} ${p.amount} je verlorenem Energiepunkt`
          : p.perUsedSkillEnergy === true
            ? `Heilt um ${p.magnitude} der Energiekosten des Zaubers`
            : p.value,
  casterYouGainHeals: (p) => (p.recipient === "caster" ? "Du erhältst" : "Heilt"),
  health5: () => " Leben",
  casterOnTargetFoeOnThem: (p) => (p.recipient === "caster" ? "auf dem Zielgegner" : "auf ihnen"),
  underHealth: (p) => `, unter ${p.onlyBelowHealthFraction} % Leben`,
  gainOfTheSkillSBaseEnergy: (p) => `Erhalte ${p.magnitude} der Grund-Energiekosten des Skills`,
  targetGainsOwnerYouGainGain: (p) =>
    p.toTarget === true ? "Das Ziel erhält" : p.recipient === "owner" ? "Du erhältst" : "Erhalte",
  energy5: (p) =>
    `${p.gains} ${p.magnitude} Energie${p.perPointLost}${p.perFoeHit}${p.perOwnCreature}${p.perRemoved}`,
  energy6: () => " Energie",
  gain2: () => "Erhalte",
  onTargetFoe: () => "auf dem Zielgegner",
  strikeStrikesOfAdrenalineAdrenaline: (p) =>
    p.units
      ? `${p.magnitude} ${p.current === 1 ? "Schlag" : "Schläge"} Adrenalin`
      : `${p.magnitude} Adrenalin`,
  youGain2: () => "Du erhältst",
  targetTargetGainsGain: (p) => (p.recipient === "target" ? "Das Ziel erhält" : "Erhalte"),
  strikesOfAdrenaline: () => " Schläge Adrenalin",
  targetRegainsAllEnergy: () => "Das Ziel erhält alle Energie zurück",
  casterYouLoseTargetLoses: (p) => (p.on === "caster" ? "Du verlierst" : "Das Ziel verliert"),
  energy7: (p) => `${p.who} ${p.magnitude} Energie`,
  stealsUpToEnergy: (p) => `Stiehlt bis zu ${p.magnitude} Energie`,
  stealsUpToHealth: (p) => `Stiehlt bis zu ${p.magnitude} Leben`,
  youStealHealth: (p) => `Du stiehlst ${p.magnitude} Leben`,
  youSacrificeOfYourMaximumHealth: (p) => `Du opferst ${p.percentOfMax} % deines maximalen Lebens`,
  targetFoeLosesHealth: (p) => `Das gegnerische Ziel verliert ${p.magnitude} Leben`,
  targetFoeLoses: () => "Das gegnerische Ziel verliert",
  youLoseHealth: (p) => `Du verlierst ${p.magnitude} Leben`,
  forEachEnchantmentRemoved: (p) => `${p.lose} je entfernter ${p.whose}-Verzauberung`,
  loseAllButHealth: (p) => `Verliere alles Leben bis auf ${p.magnitude}`,
  transferOfYourConditionsToFoes: (p) =>
    `Überträgt ${p.magnitude} deiner Zustände auf ${p.foesWithin}`,
  max2: (p) => (p.maxSeconds === undefined ? "" : ` (max. ${seconds(p.maxSeconds)})`),
  withTheTimeEachHasLeft: () => "mit der jeweils verbleibenden Zeit",
  withMoreTime: (p) => `mit ${p.extend} % mehr Zeit${p.max}`,
  foesGetTheTargetSConditionsWith: (p) =>
    `${p.foesWithin} erhalten die Zustände des Ziels, ${p.value}`,
  loseYourHealthHealForOfIt: (p) =>
    `Verliere ${shareOfYourHealth(p.fractionOfCurrent)}; heile dich um ${p.magnitude} % davon`,
  whoeverOfYouAndTargetFoeHas: () =>
    "Wer von dir und dem Zielgegner mehr Leben hat, verliert die Hälfte der Differenz; der andere erhält ebenso viel",
  stacksOnceForEachOnThem: (p) => `. Stapelt sich einmal je ${p.countEach}`,
  stacksOnceForEachOnThem2: (p) => p.status + p.value,
  forWord3: (p) => `${p.durationSeconds} lang ${p.what}`,
  forEachHexRemoved: (p) => ` je entfernter ${p.name}-Verhexung)`,
  stackingOnceForEachOnThem: (p) => `, stapelt sich einmal je ${p.countEach}`,
  appliesCasterToYouForUntilIt: (p) =>
    `Wendet ${p.statusName}${p.on === "caster" ? " auf dich" : ""} ` +
    (p.ends ? `für ${p.statusDuration} an ` : "an, bis es endet ") +
    `(${p.status}` +
    p.value +
    p.value2,
  composedStatusNameDurationSeconds: (p) => `${p.statusName} (${p.durationSeconds})`,
  appliesOneOfAtRandom: (p) => `Wendet zufällig eines davon an: ${p.choices}`,
  maintainedCasterOnYouEnergyRegenerationWhile: (p) =>
    `Aufrechterhalten${p.on === "caster" ? " auf dir" : ""}: −1 Energieregeneration, solange es hält. ` +
    `${capitalize(p.what)}.`,
  losesThatSame: (p) => `Verliert dieselbe ${CATEGORY[p.category].one}`,
  casterLoseRemoves: (p) => (p.from === "caster" ? "Verliere" : "Entfernt"),
  oneForEachRemovedMax: (p) =>
    `${p.verb} ${CATEGORY[p.category].a} ${CATEGORY[p.category].one} je entfernter ${CATEGORY[p.category2].one} (max. ${p.max})`,
  oneForEachOnTarget: (p) =>
    `${p.verb} ${CATEGORY[p.category].a} ${CATEGORY[p.category].one} je ${p.countEach}`,
  lose2: (p) => `Verliere ${p.count} ${owned(p.whose)}${categoryNoun(p.count2, p.category)}`,
  endsTheTargetSStance: () => "Beendet die Haltung des Ziels",
  forEachSpiritWithinOfIt: (p) =>
    ` je Geist ${AREA_AROUND_TARGET.get(p.near) ?? `innerhalb von ${p.near2} um das Ziel`}`,
  numberUpTo: (p) => (typeof p.count === "number" && p.count > 1 ? "bis zu " : ""),
  and4: (p) => (p.orCategory === undefined ? "" : ` und ${categoryNoun(p.count, p.orCategory)}`),
  removes: (p) =>
    `Entfernt ${p.upTo}${p.count} ${owned(p.whose)}${categoryNoun(p.count2, p.category)}${p.and}${p.perSpirit}`,
  interruptsTheTargetSSpellIfThey: () => "Unterbricht den Zauber des Ziels, falls es einen wirkt",
  interruptsTheTargetSSpellOrChant: () =>
    "Unterbricht den Zauber oder Gesang des Ziels, falls es einen wirkt",
  skillInterruptsTheTargetSSkillIf: (p) =>
    p.only === "skill"
      ? "Unterbricht den Skill des Ziels, falls es einen nutzt"
      : "Unterbricht die Aktion des Ziels: einen Skill oder einen Angriff",
  youAreKnockedDownFor: (p) => `Du wirst für ${seconds(p.durationSeconds)} niedergeschlagen`,
  knocksDownFor: (p) => `Schlägt für ${seconds(p.durationSeconds)} nieder`,
  shadowStepsToTheTarget: () => "Macht einen Schattenschritt zum Ziel",
  youAndTheTargetShadowStepTo: () =>
    "Du und das Ziel macht einen Schattenschritt an den Standort des jeweils anderen",
  corpseTeleportsYouToThatCorpseShadow: (p) =>
    p.to === "corpse"
      ? "Teleportiert dich zu dieser Leiche"
      : "Macht einen Schattenschritt an einen nahen Ort direkt von deinem Ziel weg",
  health6: (p) => `${p.percent} % Leben`,
  upToYourCurrentHealthYourHealth: (p) =>
    p.casterLosesFractionOfCurrent === 0
      ? "bis zu deinem aktuellen Leben"
      : `deinem Leben, nachdem du ${shareOfYourHealth(p.casterLosesFractionOfCurrent)} verloren hast`,
  perPartyMemberWithin: (p) => ` je Gruppenmitglied ${within(p.radius, p.radius2)}`,
  casterAndTeleportsTheTargetToYou: (p) =>
    p.at === "caster" ? " und teleportiert das Ziel zu dir" : "",
  returnsTheTargetToLifeWithAnd: (p) =>
    `Belebt das Ziel wieder mit ${p.healthText} und ${p.energy} % Energie${p.per}${p.teleport}`,
  returnsEveryDeadAlliedPetToLife: (p) =>
    `Belebt jeden toten verbündeten Tiergefährten ${p.where} mit ${p.health} % Leben wieder`,
  youLoseAllYourRemainingEnergy: () => "Du verlierst alle verbleibende Energie",
  youGainFor: (p) => `Du erhältst ${p.statusName} für ${seconds(p.durationSeconds)} (${p.status})`,
  yourPetGainsFor: (p) =>
    `Dein Tiergefährte erhält ${p.statusName} für ${p.duration} (${p.status})`,
  yourPetMovesToYourTargetAnd: () => "Dein Tiergefährte läuft zu deinem Ziel und greift es an",
  teleportsTargetToYou: () => "Teleportiert das Ziel zu dir",
  destroysTargetAlliedSpirit: () => "Zerstört den verbündeten Zielgeist",
  destroysTargetMinion: () => "Zerstört den Zieldiener",
  nearestSpiritLosesHealthTargetAllyIs: (p) =>
    `Der nächste Geist verliert ${p.magnitude} Leben; der Zielverbündete wird je Punkt um ${p.healPerPoint} geheilt`,
  nearestSpiritLosesAllEnergyYouGain: (p) =>
    `Der nächste Geist verliert alle Energie; du erhältst ${p.magnitude} % davon`,
  itsOwnerGainsHealthEqualToThe: () =>
    "Sein Besitzer erhält Leben in Höhe des verursachten Schadens",
  destroysEveryAlliedSpiritWithin: (p) =>
    `Zerstört jeden verbündeten Geist ${within(p.radius, p.radius2)}`,
  thisSkillRecharges: () => "Dieser Skill lädt sich",
  secondsFaster: () => " Sekunden schneller auf",
  thisSkillRechargesInstantly: () => "Dieser Skill lädt sich sofort auf",
  thisSkillRechargesFaster: (p) => `Dieser Skill lädt sich ${p.fraction} % schneller auf`,
  usedSkillThatSkillRechargesInstantlyThis: (p) =>
    p.of === "used-skill"
      ? "Jener Skill lädt sich sofort auf"
      : "Dieser Skill lädt sich sofort auf",
  loseAllAdrenaline: () => "Verliere alles Adrenalin",
  rechargesAllYourOtherSkills: () => "Lädt alle deine anderen Skills auf",
  rechargesAllYourStances: () => "Lädt alle deine Haltungen auf",
  rechargesAllYourOtherSkills2: (p) =>
    `Lädt alle deine anderen ${OTHER_SKILLS[p.which] ?? p.which}-Skills auf`,
  rechargesAllYour: (p) => `Lädt alle deine ${p.rechargedKind} auf`,
  allOfYourSpiritsDie: () => "Alle deine Geister sterben",
  summonsPlusOnePerCorpseExploited: (p) =>
    `Beschwört ${p.text}` +
    (p.perExploitedCorpse === true ? ", dazu einen je ausgebeuteter Leiche" : ""),
  setsATrap: () => "Stellt eine Falle",
  pulseTargetCreatesASymbolMarksThe: (p) =>
    p.kind === "pulse"
      ? p.anchor === "target"
        ? "Erschafft ein Symbol"
        : "Markiert den Boden"
      : p.anchor === "corpse"
        ? "Erschafft einen Brunnen"
        : "Erschafft ein Schutzzeichen",
  forSeconds: (p) => `${p.what} ${p.where} für ${p.magnitude} Sekunden`,
  seconds3: (p) => `${p.magnitude} Sekunden`,
  forEachSignetYouHaveEquipped: (p) => (p.perOwnSignet === true ? " je ausgerüstetem Siegel" : ""),
  allOfTheTargetSSkillsAre: (p) => `Alle Skills des Ziels sind ${p.time} lang deaktiviert`,
  theTargetSEliteSkillIsDisabled: (p) => `Der Elite-Skill des Ziels ist ${p.time} lang deaktiviert`,
  oneOfTheTargetSSpellsAt: (p) =>
    `Einer der Zauber des Ziels ist zufällig ${p.time} lang deaktiviert`,
  allOfTheTargetSAttackSkills: (p) =>
    `Alle Angriffsskills des Ziels sind ${p.time} lang deaktiviert`,
  theInterruptedSkillIsDisabledFor: (p) =>
    `Der unterbrochene Skill ist ${p.time} lang deaktiviert${p.perSignet}`,
  centreInterruptedHoldingThatSkillHaveIt: (p) =>
    p.which === "centre-interrupted"
      ? `die diesen Skill besitzen, haben ihn ${p.time} lang deaktiviert`
      : `Dieser Skill und alle Skills desselben Attributs sind ${p.time} lang deaktiviert`,
  thisSkillBecomesTheOneYouRemoved: (p) =>
    `Dieser Skill wird für ${p.seconds} Sekunden zu dem, den du entfernt hast`,
  thisSkillBecomesThatRandomSpellSpell: (p) =>
    `Dieser Skill wird für diese Dauer zu ${p.which === "random-spell" ? "diesem Zauber" : "diesem Skill"}`,
  thisSkillBecomesItsTargetSNon: (p) =>
    `Dieser Skill wird für ${p.magnitude} Sekunden zum Elite-Skill des Ziels, der keine Gestalt ist`,
  takeControlOfTargetEnemySpirit: () => "Übernimm die Kontrolle über den gegnerischen Zielgeist",
  becomeYourMinionsWhileYouBear: (p) => `Werden deine Diener, solange du ${p.name} trägst`,
  targetMinionWithAMasterBecomesMasterless: (p) =>
    `Ein Zieldiener mit Herr wird herrenlos; ein herrenloser wird deiner und um ${p.magnitude} Leben geheilt`,
  leadCountsAsALeadAttackCounts: (p) =>
    p.role === "lead" ? "Zählt als Eröffnungsangriff" : "Zählt als Nebenhandangriff",
  targetSuffersOvercast: (p) => `Das Ziel erleidet ${p.magnitude} Überanstrengung`,
  thisSkillThisSkillThatSkill: (p) => (p.of === "this-skill" ? "Dieser Skill" : "Jener Skill"),
  forEachRemoved2: (p) =>
    p.perRemoved === undefined ? "" : ` je entfernter ${CATEGORY[p.perRemoved].one}`,
  takesSecondsLongerToRecharge: (p) =>
    `${p.which} braucht ${p.magnitude} Sekunden länger zum Aufladen${p.each}`,
  that: (p) => `, die ${p.onlyIf}`,
  ifItStrikesAFoe: (p) => `Wenn es einen Gegner${p.whom} trifft: ${lowerFirst(p.text)}`,
  from: (p) => `${p.text} von ${dative(p.from)}`,
  takeDamageForEachPointOfEnergy: (p) =>
    `erleiden ${p.amount} ${damageNoun(p.type)}` +
    (p.perEnergyLost === undefined ? "" : " je verlorenem Energiepunkt"),
  areInterruptedAreInterruptedIfCasting: (p) =>
    p.only === undefined ? "werden unterbrochen" : "werden unterbrochen, wenn sie gerade wirken",
  areKnockedDownForS: (p) => `werden für ${p.durationSeconds} s niedergeschlagen`,
  foesFoeCreaturesGain: (p) =>
    p.hits === "foes" || p.hits === "foe-creatures" ? p.suffered : `erhalten ${p.sufferedWhat}`,
  gainHealthEqualToThisSpellS2: () =>
    "erhalten Leben in Höhe des Bonus der Göttlichen Gunst dieses Zaubers",
  gain3: (p) => {
    const amount = lowerFirst(p.text).replace(/^heilt (?:um |für )?/, "");
    return `erhalten ${amount.includes("Leben") ? amount : `${amount} Leben`}`;
  },
  gainHealth: (p) => `erhalten ${p.amount} Leben`,
  loseHealth: (p) => `verlieren ${p.amount} Leben`,
  youFromEach: (p) => `du ${lowerFirst(p.text).replace(/^stiehlt /, "stiehlst ")} von jedem`,
  transferAllTheirConditionsToYou: () => "übertrage alle ihre Zustände auf dich",
  resurrect: (p) =>
    p.kind === "resurrect"
      ? lowerFirst(p.text).replace(/^belebt das Ziel wieder/, "werden wiederbelebt")
      : lowerFirst(p.text),
  and5: (p) => (p.length === 0 ? (p.last ?? "") : `${p.parts} und ${p.last2}`),
  perAlliedMinionsOwnMinionsMinionOne: (p) =>
    `; ${lowerFirst(p.text)} je ${p.hits === "allied-minions" || p.hits === "own-minions" ? "Diener" : "Ziel"}`,
  per: (p) => ` je ${counted(p.perCountNoun)}`,
  damage3: (p) => `${p.amount} ${damageNoun(p.type)}${p.each}`,
  healHealsEnergy: (p) =>
    p.kind === "heal" ? `heilt ${p.amount}${p.each}` : `+${p.amount} Energie${p.each}`,
  drainsEnergy: (p) => `entzieht ${p.magnitude} Energie`,
  stealsEnergy: (p) => `stiehlt ${p.magnitude} Energie`,
  stealsHealth: (p) => `stiehlt ${p.magnitude} Leben`,
  resurrectsEnergy: (p) => `belebt wieder, ${p.energy} % Energie`,
  resurrectsHealth: (p) => `belebt wieder, ${p.health} % Leben`,
  resurrectsPetsHealth: (p) => `belebt Tiergefährten wieder, ${p.health} % Leben`,
  healsOfYourHealth: (p) => `heilt ${p.percent} % von ${shareOfYourHealth(p.fractionOfCurrent)}`,
  balancesHealthWithTargetFoe: () => "gleicht das Leben mit dem Zielgegner aus",
  allUpTo: (p) => (p.current === p.Infinity ? "alle" : `bis zu ${p.moving}`),
  andFoesWithinOfIt: (p) =>
    ` und Gegner ${AREA_AROUND_TARGET.get(p.copyToFoesWithin) ?? `innerhalb von ${p.copyToFoesWithin2} um das Ziel`}`,
  withOfTheirRemainingDurations: (p) => ` mit ${p.durationMultiplier} % ihrer verbleibenden Dauer`,
  movesConditionsFromFoesWithinOfIt: (p) =>
    `Verschiebt ${p.count} Zustände${p.lasting} von Gegnern ${AREA_AROUND_TARGET.get(p.foesWithin) ?? `innerhalb von ${p.foesWithin2} um das Ziel`} auf das Ziel`,
  casterMovesOfYourConditionsToThe: (p) =>
    p.from === "caster"
      ? `Verschiebt ${p.count === "alle" ? "alle deine" : `${p.count} deiner`} Zustände${p.lasting} auf das Ziel${p.copies}`
      : `Verschiebt ${p.count} Zustände des Ziels${p.lasting} auf dich`,
  youAreHealedForForEach: (p) => `${p.moves}; du wirst je Zustand um ${p.magnitude} geheilt`,
  areDisabledForSeconds: (p) => `sind ${p.seconds} Sekunden lang deaktiviert`,
  allOfYourSkills: (p) => `Alle deine Skills ${p.time}`,
  allOfYourOtherSkills: (p) => `Alle deine anderen Skills ${p.time}`,
  allOfYourOtherNonAttackSkills: (p) => `Alle deine anderen Nicht-Angriffsskills ${p.time}`,
  allOfYourOtherAttackSkillsYour: (p) =>
    p.exceptWeapon === undefined
      ? `Alle deine anderen Angriffsskills ${p.time}`
      : `Deine Nicht-${WEAPON_WORD[p.exceptWeapon]}-Angriffsskills ${p.time}`,
  allOfYourNonAttackSkills: (p) => `Alle deine Nicht-Angriffsskills ${p.time}`,
  s4: (p) => pluralNoun(typeName(p.type)),
  yourAnd: (p) => `Deine ${p.types} ${p.time}`,
  allOfYourSpells: (p) => `Alle deine Zauber ${p.time}`,
  allOfYourOther: (p) => `Alle deine ${p.others ? "anderen " : ""}${p.name} ${p.time}`,
  exceptAnd: (p) => (p.length === 0 ? "" : ` außer ${p.except}`),
  allOfYourNonSkills: (p) => `Alle deine Nicht-${p.name}-Skills${p.exceptText} ${p.time}`,
  yourWholeParty: () => "Deine ganze Gruppe",
  composedAffectsWhere2: (p) => `${AREA_WHO[p.affects]} ${p.where}`,
  radius: (p) => `${p.radius} Radius`,
  andAroundYou: (p) =>
    `${TARGET_TEXT[p.target]}, und ${lowerFirst(AREA_WHO[p.affects])} ${p.where} um dich herum`,
  range: (p) => `${p.range} Reichweite`,
  upTo4: (p) => `bis zu ${p.maxTargets} ${p.who}`,
  withinOfIt: (p) => AREA_AROUND_TARGET.get(p.radius) ?? `innerhalb von ${p.radius2} um das Ziel`,
  and6: (p) => `${TARGET_TEXT[p.target]}, und ${p.count} ${p.where}`,
  rangeRadius: (p) => `${p.range} Reichweite, ${p.radius} Radius`,
  free: () => "Kostenlos",
  adrenaline: (p) => `${p.amount} Adrenalin`,
  composedAmount: (p) => ` (${p.amount})`,
  energy8: (p) => `${p.cost} Energie${p.base}${p.overcast}`,
  overcast: (p) => `, ${p.overcast} Überanstrengung`,
  instant: () => "Sofort",
  composedActivationBase: (p) => (p.activation === p.base ? p.base : `${p.activation} (${p.base})`),
  dealsNoDamage: () => "Verursacht keinen Schaden",
  dealsOnlyDamageDamage: (p) =>
    p.weaponless
      ? `Verursacht nur ${p.bonus} ${damageOf(p.damageType)}`
      : `+${p.bonus} ${damageOf(p.damageType)}`,
  damage4: (p) => `${p.condition}: +${p.more} Schaden`,
  damageOnThem: (p) => `+${p.amount} Schaden ${p.perCount}`,
  cannotBeBlocked2: () => "Kann nicht geblockt werden",
  cannotBeBlocked3: (p) => `${p.condition}: kann nicht geblockt werden`,
  chanceToMissWithOrLess: (p) =>
    `${p.chance} % Chance zu verfehlen mit ${p.name} ${p.rank} oder weniger`,
  resultsInACriticalHit: () => "Führt zu einem kritischen Treffer",
  resultsInACriticalHit2: (p) => `${p.condition}: führt zu einem kritischen Treffer`,
  hitsUpToAdjacentFoesToo: (p) => `Trifft auch bis zu ${p.cleaveTargets} angrenzende Gegner`,
  hitsEveryAdjacentFoe: (p) => `${p.condition}: trifft jeden angrenzenden Gegner`,
  armorPenetration2: (p) => `${p.armorPenetration} % Rüstungsdurchdringung`,
  ifBlocked: (p) => `Wenn geblockt: ${lowerFirst(p.text)}`,
  onACriticalHit: (p) => `Bei einem kritischen Treffer: ${lowerFirst(p.text)}`,
  ifItFailsToHit: (p) => `Wenn es nicht trifft: ${lowerFirst(p.text)}`,
  asItIsUsed: (p) => `Beim Einsatz: ${lowerFirst(p.text)}`,
  allYourPreparationsAreRemoved: () => "Alle deine Vorbereitungen werden entfernt",
  fliesAsFast: (p) => `Fliegt ${p.multiplier}× so schnell`,
  fliesAsFast2: (p) => `${p.condition}: fliegt ${p.multiplier}× so schnell`,
  only: (p) => `; ${lowerFirst(p.condition)}, nur 1`,
  eachDealingLessDamage: (p) => `, die je ${p.value} % weniger Schaden verursachen`,
  strikesTwice: () => "Schlägt zweimal zu",
  strikesTimes: (p) => `Schlägt ${p.count}-mal zu`,
  shootsArrowsAtOnce: (p) => `Schießt ${p.count} Pfeile gleichzeitig${p.weaker}${p.fewer}`,
  whileActivating: (p) => `Während der Aktivierung: ${p.status}`,
  easilyInterrupted: () => "Leicht zu unterbrechen",
  failureChanceWithOrLess: (p) =>
    `${p.chance} % Fehlschlagchance mit ${p.name} ${p.rank} oder weniger`,
  activatesFasterSlower: (p) =>
    `${p.condition}: aktiviert ${p.value} % ${p.multiplier < 1 ? "schneller" : "langsamer"}`,
  healthGainFromDivineFavorIsDoubled: () => "Lebensgewinn durch Göttliche Gunst wird verdoppelt",
  projectilesEachCanBeDodged: (p) => `${p.shots} Geschosse: jedem kann ausgewichen werden`,
  aProjectileAtEachFoeEachCan: (p) =>
    p.spread === true
      ? "Ein Geschoss auf jeden Gegner: jedem kann ausgewichen werden"
      : "Geschoss: Ihm kann ausgewichen werden",
  halfTheNormalRange: () => "Halbe normale Reichweite",
  orSacrificesHealthIfNoneIsNear: (p) =>
    `, oder opfert ${p.elseSacrificePercent} % Leben, wenn keine in der Nähe ist`,
  targetExploitsTheCorpseNearestYourTarget: (p) =>
    (p.near === "target"
      ? "Beutet die Leiche aus, die deinem Ziel am nächsten ist"
      : p.all === true
        ? `Beutet jede frische Leiche ${within(p.radius, p.radius2)} aus`
        : p.pick === "random"
          ? "Beutet eine zufällige Leiche aus"
          : "Beutet die nächste Leiche aus") + p.value,
  whileOnYourBarAHealthFights: (p) =>
    `Solange auf deiner Leiste, kämpft ein ${p.name} (${p.companionHealth} Leben) an deiner Seite`,
  disabledForAfterUse: (p) =>
    `Nach dem Einsatz ${seconds(p.disabledAfterUseSeconds)} lang deaktiviert`,
  takeAllConditionsFromYourAlliesWith: () =>
    "Übernimm alle Zustände deiner Verbündeten mit der jeweils verbleibenden Zeit",
  hitOrMiss: (p) => `${p.text}, ob Treffer oder nicht`,
  eliteFlash: (p) => `${p.elite ? "Elite-" : ""}${p.flash ? "Blitz-" : ""}${TYPE_TEXT[p.type]}`,
  moraleBoost: (p) =>
    p.rechargesOnMoraleBoost === true ? "Moralschub" : seconds(p.rechargeSeconds),
  hexHexesS2: (p) => pluralNoun(p.kind),
} satisfies DescribeWords as DescribeWords;
