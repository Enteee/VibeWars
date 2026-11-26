import { AREA_EARSHOT, EN_WORDS } from "@vibewars/game-core";
import type { DescribeWords } from "@vibewars/game-core";

type SkillType = Parameters<DescribeWords["typeName"]>[0];
type StatusCategory = Parameters<DescribeWords["aCategory"]>[0];
type DamageType = Parameters<DescribeWords["typeWord"]>[0];
type Weapon = keyof DescribeWords["neededWeapon"];

/** The gender of a head noun decides its article. */
const FEMININE_HEADS: ReadonlySet<string> = new Set([
  "habilidade",
  "habilidades",
  "maldição",
  "condição",
  "postura",
  "preparação",
  "proteção",
  "armadilha",
  "forma",
  "arma",
  "criatura",
]);

function headOf(phrase: string): string {
  return phrase.split(" ")[0] ?? "";
}

function indefinite(phrase: string): string {
  return `${FEMININE_HEADS.has(headOf(phrase)) ? "uma" : "um"} ${phrase}`;
}

function pluralWord(word: string): string {
  if (word.endsWith("ão")) {
    return `${word.slice(0, -2)}ões`;
  }
  if (word.endsWith("al")) {
    return `${word.slice(0, -1)}is`;
  }
  if (word.endsWith("m")) {
    return `${word.slice(0, -1)}ns`;
  }
  if (/[rsz]$/.test(word)) {
    return `${word}es`;
  }
  return `${word}s`;
}

/** Portuguese pluralizes the head noun and what agrees with it. */
function plural(phrase: string): string {
  const [head = "", ...rest] = phrase.split(" ");
  return [pluralWord(head), ...rest]
    .join(" ")
    .replace(/\bprincipal\b/g, "principais")
    .replace(/\bduplo\b/g, "duplos");
}

/** "em o portador" as Portuguese contracts it. */
function onThe(text: string): string {
  if (text.startsWith("o ")) {
    return `no ${text.slice(2)}`;
  }
  return text.startsWith("a ") ? `na ${text.slice(2)}` : `em ${text}`;
}

function contract(text: string): string {
  return text.replace(/\bde o\b/g, "do").replace(/\bde a\b/g, "da");
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

const CATEGORY: Record<StatusCategory, readonly [string, string]> = {
  condition: ["condição", "condições"],
  hex: ["maldição", "maldições"],
  enchantment: ["encantamento", "encantamentos"],
  stance: ["postura", "posturas"],
  preparation: ["preparação", "preparações"],
  glyph: ["glifo", "glifos"],
  shout: ["grito", "gritos"],
  chant: ["cântico", "cânticos"],
  echo: ["eco", "ecos"],
  "weapon-spell": ["feitiço de arma", "feitiços de arma"],
  item: ["item", "itens"],
  form: ["forma", "formas"],
  "skill-effect": ["efeito de habilidade", "efeitos de habilidade"],
  environment: ["efeito ambiental", "efeitos ambientais"],
};

function categoryOne(category: StatusCategory): string {
  return CATEGORY[category][0];
}

function categoryNoun(count: number | "all", category: StatusCategory): string {
  return CATEGORY[category][count === 1 ? 0 : 1];
}

function aCategory(category: StatusCategory): string {
  return indefinite(categoryOne(category));
}

const CATEGORY_TOKEN =
  /weapon[- ]spell|skill[- ]effect|\b(?:condition|hex|enchantment|stance|preparation|glyph|shout|chant|echo|item|form)\b/g;

/** Categories the caller joined raw, said one at a time. */
function categoryWords(text: string): string {
  return text.replace(
    CATEGORY_TOKEN,
    (token) => CATEGORY[token.replace(" ", "-") as StatusCategory][0],
  );
}

const SPACED: Readonly<Record<string, string>> = {
  attack: "ataque",
  spell: "feitiço",
  enchantment: "encantamento",
  hex: "maldição",
  signet: "sinete",
  shout: "grito",
  stance: "postura",
  preparation: "preparação",
  glyph: "glifo",
  chant: "cântico",
  echo: "eco",
  "weapon-spell": "feitiço de arma",
  "nature-ritual": "ritual da natureza",
  "binding-ritual": "ritual de vinculação",
  ward: "proteção",
  well: "poço",
  "item-spell": "feitiço de item",
  trap: "armadilha",
  "pet-attack": "ataque de mascote",
  form: "forma",
  skill: "habilidade",
  condition: "condição",
  item: "item",
  "skill-effect": "efeito de habilidade",
  elite: "habilidade elite",
  minion: "lacaio",
  spirit: "espírito",
};

function spaced(word: string): string {
  return SPACED[word] ?? word.replaceAll("-", " ");
}

const TYPE_TEXT: Record<SkillType, string> = {
  attack: "Ataque.",
  spell: "Feitiço.",
  enchantment: "Feitiço de encantamento.",
  hex: "Feitiço de maldição.",
  signet: "Sinete.",
  shout: "Grito.",
  stance: "Postura.",
  preparation: "Preparação.",
  glyph: "Glifo.",
  chant: "Cântico.",
  echo: "Eco.",
  "weapon-spell": "Feitiço de arma.",
  "nature-ritual": "Ritual da natureza.",
  "binding-ritual": "Ritual de vinculação.",
  ward: "Feitiço de proteção.",
  well: "Feitiço de poço.",
  "item-spell": "Feitiço de item.",
  trap: "Armadilha.",
  "pet-attack": "Ataque de mascote.",
  form: "Forma.",
  skill: "Habilidade.",
};

function typeName(type: SkillType): string {
  return TYPE_TEXT[type].replace(/\.$/, "").toLowerCase();
}

/** The word that tells a type apart: "maldição" of "feitiço de maldição". */
function typeFirstWord(type: SkillType): string {
  const name = typeName(type);
  return / d[ea] /.test(name) ? name.replace(/^.* d[ea] /, "") : name;
}

const TYPE_NAMES: readonly string[] = Object.values(TYPE_TEXT)
  .map((text) => text.replace(/\.$/, "").toLowerCase())
  .sort((a, b) => b.length - a.length);

const SCOPE_WORD: Readonly<Record<string, string>> = {
  primary: "primário",
  elemental: "elementar",
};

/**
 * A skill's modifiers arrive in English order, the noun last and "non-" first:
 * Portuguese says the noun first, then what qualifies it.
 */
function skillPhrase(words: string): string {
  let rest = words.replace(/ {2,}/g, " ").trim();
  let excluded = "";
  const negated = /^não-(\S+)(?: |$)/.exec(rest);
  if (negated !== null) {
    excluded = ` que não seja ${negated[1] ?? ""}`;
    rest = rest.slice(negated[0].length);
  }
  let head = "";
  if (rest === "habilidade" || rest.endsWith(" habilidade")) {
    head = "habilidade";
    rest = rest.slice(0, -"habilidade".length).trim();
  }
  const type = TYPE_NAMES.find((name) => rest === name || rest.endsWith(` ${name}`));
  if (type !== undefined) {
    head = type;
    rest = rest.slice(0, -type.length).trim();
  }
  const qualifiers = rest
    .split(" ")
    .filter((word) => word !== "")
    .map((word) => SCOPE_WORD[word] ?? word)
    .join(" ");
  return `${head === "" ? "habilidade" : head}${qualifiers === "" ? "" : ` ${qualifiers}`}${excluded}`;
}

function aSkillPhrase(words: string): string {
  return indefinite(skillPhrase(words));
}

function blockAnswerWording(text: string): string {
  return text.replace(/^na próxima vez que (?:você|ele) bloquear /, "se for ");
}

function loseWording(text: string, fromSource: boolean, bearerIsFoe: boolean): string {
  const loser = fromSource ? "você perde" : bearerIsFoe ? "ele perde" : "perde";
  return text.replace(/^O inimigo alvo perde/, loser).replace(/que o alvo tem/g, "que você tem");
}

function bearerWording(text: string, bearerIsCaster: boolean): string {
  return text
    .replace(/^O alvo ganha/, "ele ganha")
    .replace(/^O alvo perde/, bearerIsCaster ? "você perde" : "ele perde");
}

function ifItWording(text: string): string {
  return text.replace(/^Se o alvo/, "Se ele");
}

function gainWording(text: string): string {
  return lowerFirst(text).replace(/^cura /, "");
}

function loseTargetWording(text: string): string {
  return lowerFirst(text).replace(/^o (?:inimigo )?alvo perde/, "perdem");
}

function stealsWording(text: string): string {
  return lowerFirst(text);
}

function returnedWording(text: string): string {
  return lowerFirst(text).replace(/^devolve o alvo à vida/, "voltam à vida");
}

function yourMinionsWording(text: string): string {
  return text.replace(/^Seus outros lacaios/, "Seus lacaios");
}

const TARGET_VERB_PLURAL: Readonly<Record<string, string>> = {
  estiver: "estejam",
  tiver: "tenham",
  for: "sejam",
};

/** A condition on "o alvo" said of the plural those it narrows: "que estejam atacando". */
function onlyIfWording(text: string): string {
  const said = lowerFirst(text);
  const match = /^se o alvo (não )?(estiver|tiver|for) /.exec(said);
  if (match === null) {
    return said;
  }
  const verb = TARGET_VERB_PLURAL[match[2] ?? ""] ?? "";
  return `que ${match[1] ?? ""}${verb} ${said.slice(match[0].length)}`
    .replace(
      / (ou|e) o alvo (não )?(estiver|tiver|for) /g,
      (_, joint: string, not, next: string) => {
        const negative = typeof not === "string" ? not : "";
        return ` ${joint} ${negative}${TARGET_VERB_PLURAL[next] ?? ""} `;
      },
    )
    .replace(/\bderrubado\b/g, "derrubados")
    .replace(/\bum inimigo\b/g, "inimigos")
    .replace(/\buma criatura invocada\b/g, "criaturas invocadas");
}

function narrowing(condition: string): string {
  if (condition === "") {
    return "";
  }
  return condition.startsWith("que ") ? ` ${condition}` : `, ${condition}`;
}

function splashOnlyClause(condition: string): string {
  return narrowing(condition);
}

function eachOfWording(reached: string, condition: string): string {
  return condition === "" ? reached : `cada um dentre ${reached}${narrowing(condition)}`;
}

function requiresWording(text: string): string {
  return text.replace(/^Se /, "Somente se ");
}

function requirementWording(text: string): string {
  return text.startsWith("Se ") ? `somente ${lowerFirst(text)}` : lowerFirst(text);
}

function requirementLine(text: string): string {
  return lowerFirst(text).replace(/\.$/, "");
}

function anyOfWording(texts: readonly string[]): string {
  const [first, ...rest] = texts;
  return [first ?? "Nunca", ...rest.map((text) => text.replace(/^Se /, ""))].join(" ou ");
}

function allOfWording(texts: readonly string[]): string {
  const [first, ...rest] = texts;
  return [first ?? "Sempre", ...rest.map((text) => text.replace(/^Se /, ""))].join(" e ");
}

function negatedText(text: string): string {
  const match = /^Se (o alvo|você) /.exec(text);
  if (match === null) {
    return `Exceto se ${text.replace(/^Se /, "")}`;
  }
  const who = match[1] ?? "";
  const rest = text.slice(match[0].length);
  if (rest.startsWith("não tiver nenhuma ")) {
    return `Se ${who} tiver uma ${rest.slice("não tiver nenhuma ".length)}`;
  }
  if (rest.startsWith("não tiver nenhum ")) {
    return `Se ${who} tiver um ${rest.slice("não tiver nenhum ".length)}`;
  }
  if (rest.startsWith("não ")) {
    return `Se ${who} ${rest.slice("não ".length)}`;
  }
  if (rest.startsWith("tiver menos de ")) {
    return `Se ${who} tiver pelo menos ${rest.slice("tiver menos de ".length)}`;
  }
  if (rest.startsWith("tiver uma ")) {
    return `Se ${who} não tiver nenhuma ${rest.slice("tiver uma ".length)}`;
  }
  if (rest.startsWith("tiver um ")) {
    return `Se ${who} não tiver nenhum ${rest.slice("tiver um ".length)}`;
  }
  return `Se ${who} não ${rest}`;
}

/** "você" takes the third person, so only "o alvo" changes. */
function yourCondition(text: string): string {
  return text.replace(/^Se o alvo /, "Se você ");
}

function seconds(value: number): string {
  return Number.isInteger(value) ? `${String(value)}s` : `${value.toFixed(1).replace(".", ",")}s`;
}

/** Whole noun phrases, so "o dobro de dano" and "metade do dano" each read right. */
function damageTaken(multiplier: number): string {
  if (multiplier === 2) {
    return "o dobro de dano";
  }
  if (multiplier === 0.5) {
    return "metade do dano";
  }
  return `${String(Math.round(multiplier * 100))}% de dano`;
}

function share(fraction: number): string {
  return fraction === 0.5 ? "metade de" : `${String(Math.round(fraction * 100))}% de`;
}

const DAMAGE_WORD: Readonly<Record<string, string>> = {
  slashing: " cortante",
  piercing: " perfurante",
  blunt: " contundente",
  fire: " de fogo",
  cold: " de gelo",
  lightning: " de raio",
  earth: " de terra",
  chaos: " de caos",
  dark: " de trevas",
  holy: " sagrado",
  shadow: " de sombras",
  typeless: "",
  physical: " físico",
  elemental: " elemental",
};

/** The damage type follows "dano" in Portuguese: " de fogo" in "63 de dano de fogo". */
function typeWord(type: string): string {
  return DAMAGE_WORD[type] ?? "";
}

function dano(amount: string, type: DamageType): string {
  return `${amount} de dano${typeWord(type)}`;
}

const TRIGGER_WHEN: DescribeWords["triggerWhen"] = {
  "bearer-casts-spell": "lançar um feitiço",
  "bearer-attacks": "atacar",
  "bearer-attack-begins": "atacar",
  "bearer-uses-skill": "usar uma habilidade",
  "bearer-applies-hex": "aplicar uma maldição",
  "bearer-hits": "acertar um ataque",
  "bearer-fails-to-hit": "errar um ataque",
  "bearer-takes-physical-damage": "sofrer dano físico",
  "bearer-takes-elemental-damage": "sofrer dano elemental",
  "bearer-takes-damage": "sofrer dano",
  "bearer-takes-damage-from-foe": "sofrer dano ou roubo de vida de um inimigo",
  "bearer-health-drops-below": "tiver a vida reduzida abaixo de um limite por dano",
  "bearer-fatal-damage-negated": "tiver um dano fatal anulado",
  "bearer-hit-by-attack": "for atingido pelo ataque de um inimigo",
  "bearer-targeted-by-foe": "for alvo de um feitiço ou ataque de um inimigo",
  "bearer-healed-by-skill": "for curado por uma habilidade",
  "bearer-blocks-melee": "bloquear um ataque corpo a corpo",
  "bearer-blocks-projectile": "bloquear um ataque de projétil",
  "bearer-blocks": "bloquear",
  "bearer-interrupted": "for interrompido",
  "bearer-knocked-down": "for derrubado",
  "bearer-sacrifices-health": "sacrificar vida",
  "bearer-knockdown-prevented": "tiver uma derrubada impedida",
  "bearer-gains-hex-or-enchantment": "receber uma maldição ou um encantamento",
  "bearer-gains-enchantment": "receber um encantamento",
  "bearer-loses-enchantment": "perder um encantamento",
  "bearer-loses-condition": "perder uma condição",
  "bearer-creates-creature": "criar uma criatura",
  "bearer-gains-condition": "receber uma nova condição",
  "bearer-chant-or-shout-ends": "tiver um cântico ou grito encerrado sobre si",
  "bearer-energy-empty": "ficar sem energia",
  "bearer-energy-drops-empty": "chegar a 0 de energia",
  "source-targets-bearer": "for alvo da sua habilidade",
  "source-bearer-apart": "estiver longe de você",
  "bearer-dies": "morrer",
  ends: "terminar",
  "ends-early": "terminar prematuramente",
  expires: "expirar",
};

/**
 * Trigger phrases are future subjunctive, which "você" shares with "ele":
 * only the pronoun-bearing endings change.
 */
function secondPerson(phrase: string): string {
  return phrase.replace(/ sobre si$/, " sobre você");
}

const BLOCKED_ATTACKS: DescribeWords["blockedAttacks"] = {
  all: "ataques",
  melee: "ataques corpo a corpo",
  projectile: "projéteis",
};

const BLOCKED_ATTACK: DescribeWords["blockedAttack"] = {
  all: "ataque",
  melee: "ataque corpo a corpo",
  projectile: "projétil",
};

const ARROWS_WHEN: DescribeWords["arrowsWhen"] = {
  "bearer-hits": "acertarem",
  "bearer-fails-to-hit": "errarem",
};

const DROPPED = "efeito ao soltar";
const NEXT_SKILL = "na próxima vez que ele usar uma habilidade";
const YOUR_NEXT_SKILL = "na próxima vez que você usar uma habilidade";

const TARGETS_WORDS: DescribeWords["targetsWords"] = {
  ally: "um aliado",
  "other-ally": "outro aliado",
  foe: "um inimigo",
};

/** A table keyed by the radii game-core words in English. */
function perRadius(
  english: ReadonlyMap<number, string>,
  portuguese: Readonly<Record<string, string>>,
): ReadonlyMap<number, string> {
  return new Map(
    [...english].map(([radius, text]): [number, string] => [radius, portuguese[text] ?? text]),
  );
}

const AREA_TEXT = perRadius(EN_WORDS.areaText, {
  adjacent: "adjacentes",
  nearby: "próximos",
  "in the area": "na área",
  "in earshot": "ao alcance da voz",
  "in compass range": "ao alcance do radar",
});

/** `AREA_TEXT` agreeing with one noun: "aliado adjacente". */
const AREA_ONE = perRadius(EN_WORDS.areaText, {
  adjacent: "adjacente",
  nearby: "próximo",
  "in the area": "na área",
  "in earshot": "ao alcance da voz",
  "in compass range": "ao alcance do radar",
});

/** Where something stands from you: "estiver próximo de você". */
const AREA_OF_YOU = perRadius(EN_WORDS.areaText, {
  adjacent: "adjacente a você",
  nearby: "próximo de você",
  "in the area": "na sua área",
  "in earshot": "ao alcance da sua voz",
  "in compass range": "ao alcance do seu radar",
});

const AREA_AROUND_TARGET = perRadius(EN_WORDS.areaAroundTarget, {
  "adjacent to it": "adjacentes a ele",
  "nearby it": "próximos dele",
  "in the area around it": "na área ao redor dele",
  "in earshot of it": "ao alcance da voz dele",
});

/** `AREA_AROUND_TARGET` agreeing with one noun. */
const AREA_AROUND_ONE = perRadius(EN_WORDS.areaAroundTarget, {
  "adjacent to it": "adjacente a ele",
  "nearby it": "próximo dele",
  "in the area around it": "na área ao redor dele",
  "in earshot of it": "ao alcance da voz dele",
});

const AREA_AROUND_CREATED = perRadius(EN_WORDS.areaAroundCreated, {
  "adjacent to that creature": "adjacentes a essa criatura",
  "near that creature": "próximos dessa criatura",
  "in earshot of that creature": "ao alcance da voz dessa criatura",
});

const NEXT_SKILL_KIND: DescribeWords["nextSkillKind"] = {
  "attack-skill": ["habilidade de ataque", "habilidades de ataque"],
  spell: ["feitiço", "feitiços"],
  hex: ["maldição", "maldições"],
  signet: ["sinete", "sinetes"],
  "signet-at-foe": [
    "sinete que tenha um inimigo como alvo",
    "sinetes que tenham um inimigo como alvo",
  ],
  "shout-or-chant": ["grito ou cântico", "gritos ou cânticos"],
  any: ["habilidade", "habilidades"],
};

const SPLASH_SIDE: DescribeWords["splashSide"] = {
  foes: "inimigos",
  "foe-creatures": "criaturas inimigas",
  "foe-minions": "lacaios inimigos",
  allies: "aliados",
  "non-spirit-allies": "aliados que não são espíritos",
  party: "membros do grupo",
  "own-spirits": "seus espíritos",
  "own-minions": "seus outros lacaios",
  "allied-minions": "lacaios aliados",
};

const AURA_WHO: DescribeWords["auraWho"] = {
  all: "Criaturas que não são espíritos",
  allies: "Aliados que não são espíritos",
  foes: "Inimigos que não são espíritos",
};

const WEAPON_TEXT: DescribeWords["weaponText"] = {
  axe: "Ataque de machado",
  sword: "Ataque de espada",
  hammer: "Ataque de martelo",
  daggers: "Ataque de adagas",
  scythe: "Ataque de foice",
  spear: "Ataque de lança",
  bow: "Ataque de arco",
  melee: "Ataque corpo a corpo",
};

const ROLE_WORD: Readonly<Record<string, string>> = {
  lead: "principal",
  "off-hand": "de mão secundária",
  dual: "duplo",
};

const NEEDED_WEAPON: DescribeWords["neededWeapon"] = {
  axe: "um machado",
  sword: "uma espada",
  hammer: "um martelo",
  daggers: "adagas",
  scythe: "uma foice",
  spear: "uma lança",
  bow: "um arco",
  melee: "uma arma corpo a corpo",
};

const WEAPON_WORD: DescribeWords["weaponWord"] = {
  axe: "de machado",
  sword: "de espada",
  hammer: "de martelo",
  daggers: "de adagas",
  scythe: "de foice",
  spear: "de lança",
  bow: "de arco",
  melee: "corpo a corpo",
};

const TARGET_TEXT: DescribeWords["targetText"] = {
  self: "Você mesmo",
  "single-enemy": "Um inimigo",
  "single-ally": "Um aliado",
  "single-other-ally": "Outro aliado",
  "single-any": "Qualquer alvo",
  "single-dead-ally": "Um aliado morto",
  "allied-spirit": "Um espírito aliado",
  "enemy-spirit": "Um espírito inimigo",
  "enemy-minion": "Um lacaio inimigo",
  "own-minion": "Um dos seus lacaios",
  "allied-minion": "Um lacaio aliado",
  "allied-summoned-creature": "Uma criatura invocada aliada",
  "single-ally-not-spirit": "Um aliado que não seja espírito",
  companion: "Seu mascote",
  "living-companion": "Seu mascote vivo",
};

const AREA_WHO: DescribeWords["areaWho"] = {
  enemies: "Inimigos",
  allies: "Aliados",
  all: "Todos",
};

function wielding(weapon: Weapon | undefined): string {
  return weapon === undefined ? "" : ` ao empunhar ${NEEDED_WEAPON[weapon]}`;
}

function weaponAttacks(weapon: Weapon | undefined): string {
  return weapon === undefined ? "ataques" : `ataques ${WEAPON_WORD[weapon]}`;
}

/** What the caller built as "seu ..." or "alvo ...", with the possessive agreeing. */
function countPhrase(text: string): string {
  const match = /^(seu|alvo) (.+)$/.exec(text);
  if (match === null) {
    return text;
  }
  const nouns = match[2] ?? "";
  const feminine = FEMININE_HEADS.has(pluralHeadSingular(headOf(nouns)));
  return match[1] === "seu"
    ? `${feminine ? "suas" : "seus"} ${nouns}`
    : `${feminine ? "as" : "os"} ${nouns} do alvo`;
}

function pluralHeadSingular(word: string): string {
  return word.endsWith("ões") ? `${word.slice(0, -3)}ão` : word.replace(/s$/, "");
}

/** A raw "hex or enchantment", each said in the plural. */
function pluralCategories(text: string): string {
  return categoryWords(text).split(" ou ").map(plural).join(" ou ");
}

const CHAIN_WORD = (role: string): string => ROLE_WORD[role] ?? role;

const BLOCK_WORD: Readonly<Record<string, string>> = {
  melee: "corpo a corpo",
  projectile: "de projétil",
};

/** "todas as suas" or "todos os seus", agreeing with a plural noun phrase. */
function allYour(nouns: string): string {
  return FEMININE_HEADS.has(pluralHeadSingular(headOf(nouns)))
    ? `todas as suas ${nouns}`
    : `todos os seus ${nouns}`;
}

function ofProfession(whose: string): string {
  const name = whose.trim();
  return name === "" ? "" : ` de ${name}`;
}

function areaOr(radius: number, radius2: string): string {
  return AREA_TEXT.get(radius) ?? `a até ${radius2}`;
}

function areaOneOr(radius: number, radius2: string): string {
  return AREA_ONE.get(radius) ?? `a até ${radius2}`;
}

function ofYouOr(radius: number, radius2: string): string {
  return AREA_OF_YOU.get(radius) ?? `a até ${radius2} de você`;
}

const kindWord = (kind: string): string => {
  const raw = kind.trim();
  return DAMAGE_WORD[raw] ?? kind;
};
const COUNTED: Readonly<Record<string, string>> = {
  enchantment: "encantamento",
  hex: "maldição",
  condition: "condição",
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
  loseWording,
  bearerWording,
  ifItWording,
  gainWording,
  loseTargetWording,
  stealsWording,
  returnedWording,
  yourMinionsWording,
  onlyIfWording,
  splashOnlyClause,
  eachOfWording,
  requiresWording,
  requirementWording,
  requirementLine,
  anyOfWording,
  allOfWording,
  seconds,
  blockedAttacks: BLOCKED_ATTACKS,
  blockedAttack: BLOCKED_ATTACK,
  damageTaken,
  triggerWhen: TRIGGER_WHEN,
  secondPerson,
  arrowsWhen: ARROWS_WHEN,
  chantOrShoutEnds: "sempre que um cântico ou grito terminar sobre ele",
  energyEmpty: "se a energia dele chegar a 0",
  dropped: DROPPED,
  targetsWords: TARGETS_WORDS,
  nextSkill: NEXT_SKILL,
  yourNextSkill: YOUR_NEXT_SKILL,
  creates: "sempre que você criar uma criatura",
  areaAroundCreated: AREA_AROUND_CREATED,
  nextSkillKind: NEXT_SKILL_KIND,
  lowerFirst,
  aCategory,
  negatedText,
  yourCondition,
  typeWord,
  splashSide: SPLASH_SIDE,
  auraWho: AURA_WHO,
  groundAnchorText: {
    caster: "na sua posição",
    corpse: "na posição dele",
    target: "na posição do seu alvo",
  },
  share,
  categoryNoun,
  weaponText: WEAPON_TEXT,
  chainRoleText: {
    lead: "Ataque principal.",
    "off-hand": "Ataque de mão secundária.",
    dual: "Ataque duplo.",
  },
  followsText: {
    lead: "Deve vir depois de um ataque principal.",
    "off-hand": "Deve vir depois de um ataque de mão secundária.",
    dual: "Deve vir depois de um ataque duplo.",
  },
  neededWeapon: NEEDED_WEAPON,
  weaponWord: WEAPON_WORD,
  typeText: TYPE_TEXT,
  areaText: AREA_TEXT,
  areaAroundTarget: AREA_AROUND_TARGET,
  targetText: TARGET_TEXT,
  areaWho: AREA_WHO,
  s: () => "s",
  onTarget: () => "no alvo",
  composedLastsAtBase: (p) => (p.lasts === p.at ? p.base : `${seconds(p.lasts)} (${p.base})`),
  attributes: (p) => `atributos de ${p.name}`,
  attributes2: () => "atributos",
  attributePrimaryS: (p) =>
    p.scope === "primary"
      ? "atributo primário"
      : `atributos ${SCOPE_WORD[p.scope] === undefined ? p.scope : "elementares"}`,
  setTo: (p) => `${p.scope} definido como ${p.rank}`,
  allAttributes: () => "todos os atributos",
  toAllAllAttributes: (p) => `${p.amount} em ${p.value}`,
  renewedWheneverAChantOrShoutEnds: (p) =>
    `renovado sempre que um cântico ou grito terminar sobre ${p.selfOnly ? "você" : "ele"}`,
  renewedWheneverYouCastItCastsA: (p) =>
    `renovado sempre que ${p.selfOnly ? "você lançar" : "ele lançar"} um feitiço`,
  reappliedWheneverYouCastItCastsA: (p) =>
    `reaplicado sempre que ${p.selfOnly ? "você lançar" : "ele lançar"} um feitiço em um inimigo`,
  renewedWheneverYouTakeItTakesElemental: (p) =>
    `renovado sempre que ${p.selfOnly ? "você sofrer" : "ele sofrer"} dano elemental`,
  renewedWheneverAnEnchantmentOnYouIt: (p) =>
    `renovado sempre que um encantamento sobre ${p.selfOnly ? "você" : "ele"} terminar`,
  gainAdrenalineFasterSlower: (p) =>
    `ganha adrenalina ${p.shown} mais ${p.faster > 0 ? "rápido" : "devagar"}`,
  onTheBearerExpireFaster: (p) => `${p.what} no portador expiram ${p.stat} mais rápido`,
  enchantmentsAndStances: () => "encantamentos e posturas",
  enchantments: () => "encantamentos",
  stances: () => "posturas",
  yourAttacksAgainstItHaveCriticalChance: (p) =>
    `seus ataques contra ele têm ${p.criticalChanceBonus}% de chance de acerto crítico`,
  armorAgainstYourAttacksWhileItHas: (p) =>
    `${p.armorModifier} de armadura contra seus ataques${p.onlyWhileNoOtherHex ? " enquanto ele não tiver outras maldições" : ""}`,
  youTheBearer: (p) => (p.selfOnly ? "você" : "o portador"),
  endsIfYouEndsIfTheBearer: (p) =>
    p.selfOnly ? `termina se você ${secondPerson(p.phrase)}` : `termina se o portador ${p.phrase}`,
  healthDegeneration: (p) => `−${p.healthPips} de degeneração de vida`,
  healthRegeneration: (p) => `+${p.healthPips} de regeneração de vida`,
  healthRegenerationForEachEnchantmentOnYou: (p) =>
    `+${p.pips} de regeneração de vida para cada encantamento em você (no máximo ${p.max})`,
  energyDegeneration: (p) => `−${p.energyPips} de degeneração de energia`,
  energyRegeneration: (p) => `+${p.energyPips} de regeneração de energia`,
  healthLostPerSkill: (p) => `−${p.amount} de vida por cada habilidade usada`,
  healthRegenerationForEachConditionOnYou: (p) =>
    `${p.healthPipsPerCondition} de regeneração de vida para cada condição em você`,
  health: () => "vida",
  hex: () => "maldição",
  energy: () => "energia",
  condition: () => "condição",
  regenerationForEachOnYou: (p) =>
    `${p.pips} de regeneração de ${p.what} para cada ${p.each} em você`,
  armorWhileWielding: (p) => `${p.sign}${p.armorModifier} de armadura${wielding(p.weapon)}`,
  armorWhileNotMoving: (p) => `${p.armorWhileStill} de armadura enquanto estiver parado`,
  healthPerSecondWhileMoving: (p) =>
    `${p.healthPerSecondWhileMoving} de vida por segundo enquanto se move`,
  healthPerSecond: (p) => `+${p.healthPerSecond} de vida por segundo`,
  healthPerSecondMoreInEarshotOf: (p) =>
    `+${p.healthPerSecondNearSpirit} de vida por segundo a mais ao alcance da voz de um espírito`,
  spellsCastInEarshotOfASpirit: (p) =>
    `feitiços lançados ao alcance da voz de um espírito recarregam ${p.faster}% mais rápido`,
  chanceToDoubleStrikeWhileWielding: (p) =>
    `+${p.chance}% de chance de golpe duplo${wielding(p.weapon)}`,
  armorNotBelow: (p) => `−${p.amount} de armadura (não abaixo de ${p.floor})`,
  movesAtSpeed: (p) => `move-se a ${p.speed}% da velocidade`,
  movesAtSpeedWhileEnchanted: (p) => `move-se a ${p.speed}% da velocidade enquanto encantado`,
  speedBoostsHaveNoEffect: () => "aumentos de velocidade não têm efeito",
  cannotGainAdrenaline: () => "não pode ganhar adrenalina",
  whenThisEndsYouReturnToWhere: () => "quando isto terminar, você volta ao lugar onde o lançou",
  whenThisEndsYouShadowStepTo: (p) =>
    `quando isto terminar, você dá um Passo das Sombras até o aliado em quem o lançou, e todas as suas habilidades ficam desativadas por ${p.seconds} segundos`,
  ofAttacksMiss: (p) => `${p.attackMissChance}% dos ataques erram`,
  maximumHealthAtMost: (p) => `−${p.fraction}% de vida máxima (no máximo ${p.cap})`,
  maximumHealth: (p) => `+${p.maxHealthBonus} de vida máxima`,
  maximumHealthPerEnchantment: (p) =>
    `+${p.maxHealthBonusPerEnchantment} de vida máxima por encantamento`,
  maximumEnergy: (p) => `+${p.maxEnergyBonus} de energia máxima`,
  maximumHealthPerPointOfMaximumEnergy: (p) =>
    `+${p.per} de vida máxima por ponto de energia máxima`,
  yourMinionsDealDamage: (p) => `seus lacaios causam ${p.minionDamageBonus} de dano`,
  loseMaximumHealthEachTimeAMinion: (p) =>
    `perde ${p.minionHitHealthLossPercent}% da vida máxima cada vez que um lacaio seu acerta`,
  conditionsYouWouldReceiveGoToYour: () =>
    "as condições que você receberia vão para o seu lacaio mais próximo",
  healing: (p) => `${p.more ? "+" : "−"}${p.change} de cura`,
  weaponDamage: (p) => `${p.change}% de dano de arma`,
  dealsDamage: (p) => `causa ${p.more ? "+" : "−"}${p.change} de dano`,
  noDeathPenalty: () => "sem penalidade de morte",
  whenTheBearerDiesSoDoesIts: () => "quando o portador morre, quem o lançou também morre",
  alliesYouResurrectReturnWithHealthAnd: (p) =>
    `aliados que você ressuscitar voltam com +${p.health} de vida e +${p.energy} de energia`,
  youDieTheBearerDiesWhenIt: (p) =>
    `${p.selfOnly ? "você morre" : "o portador morre"} quando isto terminar`,
  leavesAnExploitedCorpse: () => "deixa um cadáver explorado",
  takeFromPhysicalDamage: (p) => `sofre ${p.sign}${p.amount} de dano físico`,
  elementalDamageTakenIsDamage: (p) =>
    `o dano elemental sofrido é dano${typeWord(p.elementalDamageTakenAs)}`,
  physicalDamageTakenIsDamage: (p) =>
    `o dano físico sofrido é dano${typeWord(p.physicalDamageTakenAs)}`,
  physicalDamageDealtIsDamage: (p) =>
    `o dano físico causado é dano${typeWord(p.physicalDamageDealtAs)}`,
  elementalDamageDealtIsDamage: (p) =>
    `o dano elemental causado é dano${typeWord(p.elementalDamageDealtAs)}`,
  takeFromSpiritsAttacks: (p) => `sofre ${p.damageFromSpiritAttacks} dos ataques de espíritos`,
  attacksAttacksDealDamage: (p) =>
    `${weaponAttacks(p.weapon)} causam dano${typeWord(p.attackDamageType)}`,
  attacksHaveArmorPenetration: (p) =>
    `ataques têm ${p.attackArmorPenetration}% de penetração de armadura`,
  attacksAttacksDealLessMoreDamage: (p) =>
    `${weaponAttacks(p.weapon)} causam ${p.amount} de dano a ${p.delta < 0 ? "menos" : "mais"}`,
  and: () => " e ",
  immuneToAnd: (p) => `imune a ${p.names}`,
  setOnFire: () => "incendiado",
  or: () => " ou ",
  cannotBeOr: (p) => `não pode ser ${p.names}`,
  attacksFromAttacks: (p) =>
    `${p.adrenalineGain}${p.adrenalineGainFasterFrom === "attacks" ? " de ataques" : ""}`,
  yourEliteEliteSkillSUse: (p) =>
    `${p.skillType === "elite" ? "suas habilidades elite" : `seus ${plural(spaced(p.skillType))}`} usam ${p.name}`,
  uses: (p) => spaced(p.skillType),
  sUse: (p) => `${p.uses} ${plural(spaced(p.skillType))}`,
  yourNext: (p) =>
    /^\d/.test(p.next)
      ? `${FEMININE_HEADS.has(p.next.split(" ")[1] ?? "") ? "suas próximas" : "seus próximos"} ${p.next} usam ${p.name}`
      : `${FEMININE_HEADS.has(headOf(p.next)) ? "sua próxima" : "seu próximo"} ${p.next} usa ${p.name}`,
  spellsTakeAsLongToCast: (p) => `feitiços levam ${p.castTimeMultiplier}× o tempo para lançar`,
  skillsButAttacksTakeAsLongTo: (p) =>
    `habilidades, exceto ataques, levam ${p.skillActivationMultiplier}× o tempo para ativar`,
  spellsAreInterruptedByAttacks: () => "feitiços são interrompidos por ataques",
  slowerFaster: (p) => (p.attackDurationMultiplier > 1 ? "mais devagar" : "mais rápido"),
  attacksWhileWielding: (p) => `ataca ${p.change}% ${p.way}${wielding(p.weapon)}`,
  conditionsYouApplyLastLongerWhileWielding: (p) =>
    `condições que você aplica duram ${p.longer}% a mais${wielding(p.weapon)}`,
  enchantmentsYouMaintainCostTheUpkeep: (p) =>
    `encantamentos que você mantém custam ${p.upkeepMultiplier}× a manutenção`,
  spellsThatCauseOvercastCauseMoreAs: (p) =>
    `feitiços que causam Sobrecarga causam ${p.overcastSurcharge} a mais ao terminar`,
  arrowsMoveAsFast: (p) => `flechas voam a ${p.projectileSpeedMultiplier}× da velocidade`,
  cannotCastSpells: () => "não pode lançar feitiços",
  cannotAttack: () => "não pode atacar",
  cannotUseResurrectionSkills: () => "não pode usar habilidades de ressurreição",
  cannotBeTheTargetOfEnemySpells: (p) =>
    p.whileCasting
      ? "não pode ser alvo de feitiços inimigos enquanto lança feitiços"
      : "não pode ser alvo de feitiços inimigos",
  cannotBeTheTargetOfSpells: () => "não pode ser alvo de feitiços",
  hostileSpellsTargetingYouFail: () => "feitiços hostis que têm você como alvo falham",
  attacksAgainstYouMiss: () => "ataques contra você erram",
  strippedOfAllEnchantmentsAndCannotBe: () =>
    "perde todos os encantamentos e não pode ser encantado",
  cannotBeTheTargetOfEnchantments: () => "não pode ser alvo de encantamentos",
  cannotUseShoutsOrChants: () => "não pode usar gritos nem cânticos",
  cannotUseSignets: () => "não pode usar sinetes",
  cannotBlockItsCasterSAttacks: () => "não pode bloquear os ataques de quem o lançou",
  cannotBeBlockedByBlindedFoes: () => "não pode ser bloqueado por inimigos cegos",
  cannotBlock: () => "não pode bloquear",
  renewedForSecondsIfMovingAsIt: (p) =>
    `renovado por ${p.renewsWhileMoving} segundos se estiver em movimento ao terminar`,
  cannotBeKnockedDown: () => "não pode ser derrubado",
  cannotBeKnockedDownByAFoe: () => "não pode ser derrubado por um inimigo",
  endsIfItPreventsAKnockdown: () => "termina se impedir uma derrubada",
  youDoNotSufferExtraDamageFrom: () => "você não sofre dano extra de ataques críticos",
  cannotLandCriticalHits: () => "não pode acertar críticos",
  immuneToCriticalHits: () => "imune a acertos críticos",
  spellsHaveDoubleTheDivineFavorBonus: (p) =>
    `feitiços de ${p.attribute} têm o dobro do bônus de Favor Divino`,
  attackSkillAttackSkills: (p) =>
    p.once
      ? p.attackSkillsOnly === true
        ? "habilidade de ataque"
        : BLOCKED_ATTACK[p.against]
      : p.attackSkillsOnly === true
        ? "habilidades de ataque"
        : BLOCKED_ATTACKS[p.against],
  whileBelowHealth: (p) => ` enquanto estiver abaixo de ${p.blockBelowHealth}% de vida`,
  whileUnderOr: (p) => ` enquanto estiver sob ${p.value}`,
  fromFoesUnderOr: (p) => ` de inimigos sob ${p.value}`,
  whileAttacking: (p) => (p.blockWhileAttacking ? " enquanto ataca" : ""),
  blocksTheNextChanceToBlock: (p) =>
    p.once
      ? `bloqueia ${FEMININE_HEADS.has(headOf(p.what)) ? "a próxima" : "o próximo"} ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`
      : `${p.chance}% de chance de bloquear ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`,
  within: (p) => areaOr(p.radius, p.radius2),
  alliesTo: (p) => `aliados ${p.around} ${onThe(p.bearer)}: ${p.status}`,
  whileWielding: (p) => ` ao empunhar ${NEEDED_WEAPON[p.weapon]}`,
  whileHoldingAWeaponOtherThan: (p) => ` ao segurar uma arma que não seja ${NEEDED_WEAPON[p.not]}`,
  againstFoesThatAreNotMoving: (p) =>
    p.criticalChanceBonusVersus === undefined ? "" : " contra inimigos que não estejam se movendo",
  criticalChance: (p) => `${p.chance}% de chance de acerto crítico${p.holding}${p.versus}`,
  gainEnergyPerCriticalHit: (p) => `ganha ${p.energyPerCritical} de energia por acerto crítico`,
  wheneverYouSuccessfullyLandACriticalHit: (p) =>
    `sempre que você acertar um crítico, ganha ${p.healthPerCritical} de vida`,
  refreshesEveryTimeYouLandACritical: () => "é renovado toda vez que você acerta um crítico",
  theNextTimeYouLandACritical: (p) =>
    p.endsWhenFired
      ? "na próxima vez que você acertar um crítico"
      : "toda vez que você acertar um crítico",
  with: (p) =>
    p.weapon === undefined ? p.critical : `${p.critical} com ${NEEDED_WEAPON[p.weapon]}`,
  removeStatusFromYourTarget: (p) =>
    p.kind === "remove-status"
      ? `${p.when}: ${lowerFirst(p.text)} do seu alvo`
      : `${p.when}: ${lowerFirst(p.text)}`,
  ifOneIsRemovedYouLoseEnergy: (p) =>
    `se um for removido, você perde ${p.energyIfRemoved} de energia ou isto termina`,
  endsAfterIncomingAttackS: (p) =>
    p.endsAfterAttacks2 === 1
      ? `termina depois de ${p.endsAfterAttacks} ataque recebido`
      : `termina depois de ${p.endsAfterAttacks} ataques recebidos`,
  endsAfterYourNextAttackSHit: (p) =>
    p.endsAfterAttackCount2 === 1
      ? `termina depois do seu próximo ataque, acertando, errando ou sendo bloqueado`
      : `termina depois dos seus próximos ${p.endsAfterAttackCount} ataques, acertando, errando ou sendo bloqueados`,
  noEffectWhileUnderOr: (p) => `sem efeito enquanto estiver sob ${p.suppressedWhileUnder}`,
  yourNextAttackSCannotBeBlocked: (p) =>
    p.unblockableAttacks2 === 1
      ? "seu próximo ataque não pode ser bloqueado"
      : `seus próximos ${p.unblockableAttacks} ataques não podem ser bloqueados`,
  attacksCannotBeBlocked: (p) => `${weaponAttacks(p.weapon)} não podem ser bloqueados`,
  whileYouWieldAnAWeapon: (p) =>
    `ao empunhar uma arma de dano${typeWord(p.weaponDamage)}, ${p.hit}`,
  forEachEnchantmentRemovedSCasterLoses: (p) =>
    `para cada encantamento de ${p.name} removido, quem lançou ${p.name2} perde ${p.percentOfMax}% da vida máxima`,
  with2: (p) => (p.weapon === undefined ? "" : ` com ${NEEDED_WEAPON[p.weapon]}`),
  endsAfterHitS: (p) =>
    p.count2 === 1
      ? `termina depois de ${p.count} acerto${p.how}`
      : `termina depois de ${p.count} acertos${p.how}`,
  spellSpells: (p) => (p.one ? "feitiço" : `${p.count} feitiços`),
  yourNextCostsCostLessEnergy: (p) =>
    p.one
      ? `seu próximo ${p.next} custa ${p.costReduction} a menos de energia`
      : `seus próximos ${p.next} custam ${p.costReduction} a menos de energia`,
  yourNextRechargesRechargeFaster: (p) =>
    p.one
      ? `seu próximo ${p.next} recarrega ${p.rechargeFaster}% mais rápido`
      : `seus próximos ${p.next} recarregam ${p.rechargeFaster}% mais rápido`,
  forYourNext: (p) => `para ${/^\d/.test(p.next) ? "seus próximos" : "seu próximo"} ${p.next}`,
  theirProjectilesMoveAsFast: (p) =>
    `os projéteis deles voam a ${p.projectileSpeedMultiplier}× da velocidade`,
  noOvercast: () => "sem Sobrecarga",
  spreadsToAdjacentCombatants: () => "espalha-se para combatentes adjacentes",
  nextAttackSkillDamage: (p) => `próxima habilidade de ataque: ${p.condition}: +${p.more} de dano`,
  attacks: () => "atacar",
  makesAMeleeAttack: () => "fizer um ataque corpo a corpo",
  moves: () => "se mover",
  takesDamage: (p) => `sofre ${p.damageTakenMultiplier}`,
  takesDamageFromTheNextAttack: (p) =>
    `sofre ${damageTaken(p.attackDamageTakenMultiplier)} do próximo ataque`,
  damageTaken2: (p) => `−${p.damageReduction} de dano sofrido`,
  damageTakenPerRankOfAtMost: (p) =>
    `−${p.now} de dano sofrido (${p.perRank} por nível de ${p.attribute}, no máximo ${p.max})`,
  damageTakenMoreEachHit: (p) => `−${p.step} de dano sofrido, ${p.step} a mais a cada acerto`,
  theNextHitDealsLessDamage: (p) =>
    `o próximo acerto causa ${p.nextDamageReduction} de dano a menos`,
  damageTakenWhileCastingS: (p) =>
    `−${p.amount} de dano sofrido ao lançar ${plural(spaced(p.skillType))}`,
  lessDamage: (p) => `${p.value}% a menos de dano${typeWord(p.type)}`,
  lessDamageFromFoesWithAHex: (p) =>
    `${p.fraction}% a menos de dano de inimigos com uma maldição de ${p.name}`,
  lessDamageFromFoesSufferingFrom: (p) =>
    `${p.fraction}% a menos de dano de inimigos sofrendo de ${p.name}`,
  damageTakenFromFoesWithLessHealth: (p) =>
    `−${p.damageReductionFromWeakerFoe} de dano sofrido de inimigos com menos vida`,
  damageTakenFromFoesWithACondition: (p) =>
    `−${p.damageReductionFromConditionedFoe} de dano sofrido de inimigos com uma condição`,
  lessDamageFromSpells: (p) => `${p.less}% a menos de dano de feitiços`,
  damageOverInASecondIsHealed: (p) => `o dano acima de ${p.cap} em um segundo é curado`,
  physicalItsPhysicalDamageTheDamageIt: (p) =>
    p.from === "physical" ? "o dano físico dele" : "o dano que ele sofre de ataques",
  whichTakesLessOfIt: (p) => `, que sofre ${p.reduction} a menos dele`,
  goesToItsCaster: (p) =>
    contract(`${share(p.fraction)} ${p.hits} vai para quem o lançou${p.less}`),
  theDamageYouTakeGoesToYour: (p) =>
    contract(
      `${share(p.redirectsDamageToMinion)} o dano que você sofre vai para o seu lacaio mais próximo`,
    ),
  damageFromASingleHitIsCapped: (p) =>
    `o dano de um único acerto é limitado a ${p.maxDamageFractionPerHit}% da vida máxima`,
  eachHitItCapsCostsTheCaster: (p) =>
    `cada acerto limitado custa ${p.casterEnergyPerReduction} de energia a quem o lançou, e termina quando ele não puder pagar`,
  damageFromASingleAttackIsCapped: (p) =>
    `o dano de um único ataque é limitado a ${p.attackDamageCapFraction}% da vida máxima`,
  lifeStolen: (p) => `−${p.lifeStealReduction} de vida roubada`,
  yourHealthSacrificesAreLarger: (p) =>
    `seus sacrifícios de vida são ${p.sacrificeMultiplier}% maiores`,
  knockdownsLastAtLeastS: (p) => `derrubadas duram pelo menos ${p.knockdownMinSeconds}s`,
  itsSpiritLosesHealthEachTime: (p) =>
    `o espírito dele perde ${p.sourceLosesHealth} de vida a cada vez`,
  reappliedAsItWouldEndWhileYou: (p) =>
    `reaplicado ao terminar enquanto ${p.selfOnly ? "você tiver" : "ele tiver"} outra maldição`,
  chantsAndShoutsLastLongerOnIt: (p) => `cânticos e gritos duram ${p.longer}% a mais nele`,
  attacksDealLessMoreDamage: (p) =>
    `ataques causam ${p.attackDamageDelta} de dano a ${p.attackDamageDelta2 < 0 ? "menos" : "mais"}`,
  movesFaster: (p) => `move-se ${p.moveSpeedMultiplier}% mais rápido`,
  healthRegenerationDegeneration: (p) =>
    `${p.healthPips} de ${p.healthPips2 > 0 ? "regeneração" : "degeneração"} de vida`,
  armor: (p) => `${p.armorModifier} de armadura`,
  attacksFaster: (p) => `ataca ${p.value}% mais rápido`,
  aOr: (p) => indefinite(categoryWords(p.categories)),
  listComma: () => ", ",
  whileUnderOr2: (p) => `enquanto estiver sob ${p.under}: ${p.gains}`,
  once: () => "uma vez",
  times: (p) => `${p.stat} vezes`,
  endsAfterItTakesEffect: (p) => `termina depois de fazer efeito ${p.times}`,
  theNextHexFailsAndItsCaster: (p) =>
    `a próxima maldição falha, e quem a lançou sofre ${p.damage} de dano`,
  theNextSpellItCastsAtFoe: (p) =>
    `o próximo feitiço que ele lançar em ${p.on === "foe-targeted" ? "um inimigo" : "um aliado"} falha: ${p.what}`,
  theNextTouchSkillsUsedAgainstYou: (p) =>
    `as próximas ${p.failsFoeTouchSkills} habilidades de toque usadas contra você falham`,
  foesWithinFoes: (p) =>
    p.area === undefined ? `inimigos a até ${p.radius}` : `inimigos ${p.area}`,
  moreEachSecond: (p) => `, ${p.growth} a mais a cada segundo`,
  eachSecondItAndTakeDamage: (p) =>
    `a cada segundo, ${p.hitsBearer ? "ele e " : ""}${p.foes} sofrem ${p.damage} de dano${kindWord(p.kind)}${p.more}`,
  second: () => "segundo",
  seconds2: (p) => `${p.every} segundos`,
  everySecondSeconds: (p) => `a cada ${p.value}: ${p.what}`,
  itsSpiritLosesHealthForEachOne: (p) =>
    `o espírito dele perde ${p.amount} de vida para cada um ferido`,
  itsSpiritLosesHealthForEachOne2: (p) =>
    `o espírito dele perde ${p.amount} de vida para cada um curado`,
  everyAttack: () => "cada ataque",
  theNextAttack: () => "o próximo ataque",
  theNextAttacks: (p) => `os próximos ${p.times} ataques`,
  typelessAsDamage: (p) => (p.type === "typeless" ? "" : ` como dano${typeWord(p.type)}`),
  ofTheDamageOfThatHitIt: (p) =>
    `${p.share}% do dano de ${p.attacks} que o acertar volta para o atacante${p.kind}, até ${p.max}`,
  eachAttackItLandsHasAChance: (p) =>
    `cada ataque que ele acerta tem ${p.chance}% de chance de causar o dano a ele mesmo em vez disso, até ${p.max}`,
  theNextDamageOrLifeStealHeals: (p) =>
    `o próximo dano ou roubo de vida cura essa quantidade em vez disso, até ${p.reversesNextDamage}`,
  theNextDamageIsNegatedAndIts: (p) =>
    `o próximo dano é anulado e sua origem sofre essa quantidade em vez disso, até ${p.cap}`,
  meleeAttacksNeitherHitNorFailTo: (p) =>
    `ataques corpo a corpo não acertam nem erram, e causam ${p.damage} de dano cada um em vez disso`,
  allDamageHealsForThatMuchInstead: (p) =>
    `todo dano cura essa quantidade em vez disso, até ${p.cap} por acerto`,
  theNextDamageOrLifeStealThat: (p) =>
    `o próximo dano ou roubo de vida que mataria ${p.selfOnly ? "você" : "ele"} é anulado`,
  whenOneAllySIsSpentIt: () => "quando o de um aliado se esgota, termina em todos os outros",
  gainMoreStrikeStrikesOfAdrenalinePer: (p) =>
    `ganha ${p.extraStrikesPerHit} ${p.extraStrikesPerHit2 === 1 ? "golpe" : "golpes"} de adrenalina a mais por acerto`,
  skillsRechargeFaster: (p) => `habilidades recarregam ${p.skillRechargeFaster}% mais rápido`,
  skillsCostMoreLessEnergy: (p) =>
    `habilidades custam ${p.change}% ${p.change2 > 0 ? "a mais" : "a menos"} de energia`,
  spellsAndBindingRitualsRechargeFaster: (p) =>
    `feitiços e rituais de vinculação recarregam ${p.faster}% mais rápido`,
  spellsRechargeFaster: (p) => `feitiços recarregam ${p.spellRechargeFaster}% mais rápido`,
  bindingRitualsRechargeFaster: (p) => `rituais de vinculação recarregam ${p.faster}% mais rápido`,
  enchantmentsRechargeFaster: (p) =>
    `encantamentos de ${p.name} recarregam ${p.faster}% mais rápido`,
  hexTheTargetSYour: (p) => (p.category === "hex" ? "no alvo:" : "para você:"),
  skillsHaveArmorPenetration: (p) =>
    `habilidades de ${p.name} têm ${p.pierce}% de penetração de armadura`,
  yourTheBearerSSkillsCannotBe: (p) =>
    `as habilidades ${p.selfOnly ? "suas" : "do portador"} não podem ser interrompidas`,
  theNextTimeYouWouldBeInterrupted: () => "na próxima vez que você seria interrompido, não é",
  youCannotBeInterruptedEachTimeYou: (p) =>
    `você não pode ser interrompido; a cada tentativa, perde ${p.amount} de energia ou isto termina`,
  youCannotBeInterruptedEachTimeYou2: (p) =>
    `você não pode ser interrompido; a cada tentativa, perde 1 encantamento de ${p.profession} ou isto termina`,
  conditionsOnExpireFaster: (p) => `condições ${onThe(p.bearer)} expiram ${p.faster} mais rápido`,
  hexesOnExpireFaster: (p) => `maldições ${onThe(p.bearer)} expiram ${p.faster}% mais rápido`,
  theNextHexOnLastsLonger: (p) =>
    `a próxima maldição ${p.of} ${onThe(p.bearer)} dura ${p.longer} a mais`,
  hexesCastOnTakeAsLongTo: (p) =>
    `maldições lançadas ${onThe(p.bearer)} levam ${p.times}× o tempo para lançar`,
  otherAlliesSpellsOnTakeAsLong: (p) =>
    `feitiços de outros aliados ${onThe(p.bearer)} levam ${p.times}× o tempo para lançar`,
  yourSpellsOnTakeAsLongTo: (p) =>
    `seus feitiços ${onThe(p.bearer)} levam ${p.times}× o tempo para lançar`,
  enchantmentsCastOnCostLessEnergyMinimum: (p) =>
    `encantamentos lançados ${onThe(p.bearer)} custam ${p.less} a menos de energia, no mínimo 1`,
  hitsWithAnAttack: () => "acertar um ataque",
  failsToHit: () => "errar",
  hitsWithAnAttackSkill: () => "acertar uma habilidade de ataque",
  skillEffectEndsIfYouUseA: (p) =>
    p.selfOnly || p.category === "skill-effect"
      ? "termina se você usar uma habilidade"
      : "termina se o portador usar uma habilidade",
  endsIfYouUseAnAdrenalSkill: () => "termina se você usar uma habilidade de adrenalina",
  endsIfYouUseANonAdrenal: () => "termina se você usar uma habilidade que não seja de adrenalina",
  endsIfYouUseANonSkill: (p) => `termina se você usar uma habilidade que não seja ${p.kind}`,
  endsIfYouUseAnAttackSkill: () => "termina se você usar uma habilidade de ataque",
  endsIfYouUseASkillOn: () => "termina se você usar uma habilidade nele",
  endsIfYouUseASkillThat: (p) =>
    `termina se você usar uma habilidade que não seja ${indefinite(p.NEXT_SKILL_KIND)}`,
  hexHexedEnchanted: (p) => (p.category === "hex" ? "amaldiçoado" : "encantado"),
  becomesOr: (p) => `for ${p.gained}`,
  theBearerIsDestroyedWhenItExpires: () => "o portador é destruído quando isto expirar",
  theMinionsYouItTookBecomeMasterless: (p) =>
    `os lacaios que ${p.selfOnly ? "você tomou" : "ele tomou"} ficam sem mestre quando isto terminar`,
  whenTheBearerDiesRisesWhereIt: (p) =>
    p.masterless === true
      ? `quando o portador morrer, ${p.stands} se ergue onde ele caiu, sem mestre`
      : `quando ele morrer, ${p.stands} se ergue no lugar dele`,
  composedKindBoundWhenOn: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.on],
  endsIfItEndsIfYou: (p) =>
    p.onFoe ? `termina se ele ${p.when}` : `termina se você ${secondPerson(p.when)}`,
  all: (p) => (p.once && p.against === "all" ? blockAnswerWording(p.text) : p.text),
  whileHoldingAnItem: (p) =>
    p.onlyWhileHoldingItem && !p.holdingSaid ? `${p.stats} enquanto segura um item` : p.stats,
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
    `inimigos atingidos por seus ${p.attacks} recebem ${p.statusName} por ${p.durationSeconds}`,
  foesYourHitTake: (p) => `inimigos atingidos por seus ${p.attacks} sofrem ${p.riderDamage}`,
  foesYourHitLose: (p) =>
    `inimigos atingidos por seus ${p.attacks} perdem ${p.count} ${categoryNoun(p.count2, p.category)}`,
  andSoDoFoesAdjacentToThem: (p) => `${p.pop}, assim como os inimigos adjacentes a eles`,
  stealUpToHealth: (p) => `${p.attacks} roubam até ${p.amount} de vida`,
  yourPetSAttacksHealYouFor: (p) => `os ataques do seu mascote curam você em ${p.amount}`,
  yourInterruptFoesTheyHit: (p) => `seus ${p.attacks} interrompem os inimigos que atingem`,
  your: (p) => `seus ${p.attacks}: ${p.text}`,
  attackSkillsPhysicalAttacks2: (p) =>
    p.attackSkillsOnly
      ? `habilidades de ataque${p.weapon === undefined ? "" : ` ${WEAPON_WORD[p.weapon]}`}`
      : p.weapon === undefined
        ? "ataques físicos"
        : `ataques ${WEAPON_WORD[p.weapon]}`,
  foesThatBlockYourGetFor: (p) =>
    `inimigos que bloquearem seus ${p.attacks} recebem ${p.statusName} por ${p.durationSeconds}`,
  foesThatBlockYour: (p) => `inimigos que bloquearem seus ${p.attacks}: ${lowerFirst(p.text)}`,
  damage: (p) => dano(p.amount, p.type),
  physical: () => "físico",
  elemental: () => "elemental",
  armor2: () => "armadura",
  listSpace: () => " ",
  againstProjectileAttacks: (p) => {
    const typed = /^(\S+) (.+) armadura$/.exec(p.text);
    const armor =
      typed === null
        ? p.text.replace(/^(\S+) armadura$/, "$1 de armadura")
        : `${typed[1] ?? ""} de armadura contra dano${typeWord(typed[2] ?? "") || ` ${typed[2] ?? ""}`}`;
    return p.projectile ? `${armor} contra ataques de projétil` : armor;
  },
  thatAllyIsHealedFor: (p) => `esse aliado é curado em ${p.amount}`,
  youLoseItsCasterLoses: (p) => (p.bearerIsCaster ? "você perde" : "quem o lançou perde"),
  energy2: (p) => `${p.who} ${p.amount} de energia`,
  orSpell: (p) =>
    p.value === ""
      ? "feitiço"
      : `feitiço ${p.value
          .split(" ou ")
          .map((word) => SCOPE_WORD[word] ?? word)
          .join(" ou ")}`,
  wheneverYouCastItCastsAnA: (p) =>
    `sempre que ${p.bearerIsCaster ? "você lançar" : "ele lançar"} ${indefinite(p.spell)} em um aliado, ${p.value}`,
  composedKindBoundWhenEvent: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.event],
  youOrItOr: (p) => (p.bearerIsCaster ? `você ${p.phrases}` : `ele ${p.phrases2}`),
  whenItOrOrAtOnce: (p) =>
    p.length === 0 ? p.death : `quando ele ${p.others}, ou imediatamente ${p.death}`,
  whenItOr: (p) => `quando ele ${p.on}`,
  composedBearerIsCaster: (p) => (p.bearerIsCaster ? YOUR_NEXT_SKILL : NEXT_SKILL),
  theNextTime: (p) => `na próxima vez que ${p.doer}`,
  composedEventWhenOf: (p) => ARROWS_WHEN[p.event] ?? p.whenOf,
  wheneverYourArrowsOr: (p) => `sempre que suas flechas ${p.on}`,
  wheneverOnACreatureWithLessHealth: (p) =>
    `sempre que ${p.doer}${p.victimHasLessHealth === undefined ? "" : " em uma criatura com menos vida"}`,
  and2: () => " e ",
  andAnd: (p) => (p.when === undefined ? p.each : `${p.when}: ${p.each}`),
  youItAnd: (p) => `${p.when}: ${p.bearerIsCaster ? "você" : "ele"} e ${p.answer}`,
  youAndAllPartyMembersAreHealed: (p) =>
    `${DROPPED}: você e todos os membros do grupo são curados em ${p.healed}`,
  composedWhat: (p) => `${DROPPED}: ${p.what}`,
  meleeHitsWithAMeleeAttackHits: (p) =>
    p.weapon === "melee"
      ? "acertar um ataque corpo a corpo"
      : `acertar um ataque com ${NEEDED_WEAPON[p.weapon]}`,
  meleeIsHitByAFoeS: (p) =>
    p.weapon === "melee"
      ? "for atingido pelo ataque corpo a corpo de um inimigo"
      : `for atingido pelo ataque de um inimigo com ${NEEDED_WEAPON[p.weapon]}`,
  with3: (p) => `${TRIGGER_WHEN[p.event]} com ${NEEDED_WEAPON[p.weapon]}`,
  youGainEnergy: (p) => `você ganha ${p.amount} de energia`,
  allYourSkillsAreRecharged: () => "todas as suas habilidades são recarregadas",
  yourPartyIsHealedFor: (p) => `seu grupo é curado em ${p.amount}`,
  takeDamage: (p) => `${lowerFirst(p.upTo)} sofrem ${dano(p.amount, p.type)}`,
  areHealedFor: (p) => `${lowerFirst(p.upTo)} são curados em ${p.amount}`,
  composedUpToText: (p) => `${lowerFirst(p.upTo)}: ${lowerFirst(p.text)}`,
  ifTargetFoeDiesWhileHexedWith: (p) =>
    p.bearerIsFoe
      ? "se o inimigo alvo morrer enquanto estiver sob esta maldição"
      : "se um aliado morrer enquanto estiver sob este encantamento",
  and3: (p) => `${p.who}, ${p.flatMap}`,
  hasASpellInterrupted: () => "tiver um feitiço interrompido",
  isStruckForDamageWhileUsingA: (p) =>
    `for atingido por dano${typeWord(p.damageType)} ao usar uma habilidade`,
  takesDamageFromAFoe: (p) => `sofrer dano${typeWord(p.damageType)} de um inimigo`,
  takesMoreThanDamageFromAFoe: (p) => `sofrer mais de ${p.minDamage} de dano de um inimigo`,
  hasItsHealthDroppedBelowByDamage: (p) =>
    `tiver a vida reduzida abaixo de ${p.healthBelow}% por dano`,
  isMoreThanFromYou: (p) => `estiver a mais de ${p.apartBeyond} de você`,
  hitsWithAAttack: (p) => `acertar um ataque ${CHAIN_WORD(p.chainRole)}`,
  isHitByAnAttackAAttack: (p) =>
    `for atingido por ${p.role === undefined ? "um ataque" : `um ataque ${CHAIN_WORD(p.role)}`} de quem o lançou`,
  blocksAAttack: (p) => `bloquear um ataque ${BLOCK_WORD[p.blocked] ?? p.blocked}`,
  losesAEnchantment: (p) => `perder um encantamento de ${p.name}`,
  hex2: (p) =>
    p.scopeAdjective === ""
      ? "maldição"
      : `maldição ${SCOPE_WORD[p.scopeAdjective] ?? p.scopeAdjective}`,
  appliesAnAToAFoe: (p) => `aplicar ${indefinite(p.words)} a um inimigo`,
  spell: (p) => (p.type === undefined ? "feitiço" : typeName(p.type)),
  onAllyAnAllyAFoe: (p) => ` em ${p.targets === "ally" ? "um aliado" : "um inimigo"}`,
  castsAnA: (p) => `lançar ${aSkillPhrase(p.words)}${p.on}`,
  non: (p) => `não-${typeFirstWord(p.notType)}`,
  elite: () => "elite",
  adrenal: () => "de adrenalina",
  skill: () => "habilidade",
  isTargetedByYour: (p) => {
    const phrase = skillPhrase(p.words);
    return `for alvo ${FEMININE_HEADS.has(headOf(phrase)) ? "da sua" : "do seu"} ${phrase}`;
  },
  on: (p) => (p.targets === undefined ? "" : ` em ${TARGETS_WORDS[p.targets]}`),
  usesAnA: (p) => `usar ${aSkillPhrase(p.words)}${p.on}`,
  health2: (p) => `${p.amount} de vida`,
  energy3: (p) => `${p.amount} de energia`,
  takeDamage2: (p) => `sofrem ${dano(p.amount, p.type)}`,
  loseAllAllS: (p) => `perdem ${p.value} ${CATEGORY[p.category][p.count === 1 ? 0 : 1]}`,
  all2: (p) => `todos os ${p.side}`,
  upTo: (p) => `até ${p.maxTargets} ${p.side}`,
  withinOfThatCreature: (p) =>
    AREA_AROUND_CREATED.get(p.radius) ?? `a até ${p.radius2} dessa criatura`,
  gain: (p) => `ganham ${p.answer}`,
  youGain: (p) => `${p.when}: ${p.gains ? `você ganha ${p.answers}` : p.answers}`,
  onIt: () => "nele",
  damageOnIt: (p) => `${p.value}${dano(p.amount, p.type)} ${p.perCount}`,
  composedWhenWhat: (p) => `${p.when}: ${p.what}`,
  itsAdjacentAllies: () => "os aliados adjacentes a ele",
  itsAlliesWithin: (p) => `os aliados dele ${p.area ?? `a até ${p.radius}`}`,
  itsAdjacentAlliesItsAlliesWithin: (p) =>
    !p.bearerIsFoe ? `${lowerFirst(p.foesWithin)}${p.only}` : p.value,
  bearerBlocksMeleeMeleeProjectile: (p) =>
    p.on === "bearer-blocks-melee" ? "corpo a corpo" : "de projétil",
  whenYouBlockYouAndAlliesAre: (p) =>
    `quando você bloquear, você e os aliados ${p.area} são curados em ${p.amount}`,
  eachBlockCostsYouEnergyOrThis: (p) =>
    `cada bloqueio custa ${p.amount} de energia ou isto termina`,
  youGainEnergyForEachSuccessfulAttack: (p) =>
    `você ganha ${p.amount} de energia para cada ataque ${p.kind} bloqueado`,
  wheneverYouBlockAAttackThisWay: (p) =>
    `sempre que você bloquear um ataque ${p.kind} desta forma, o atacante sofre ${dano(p.amount, p.type)}`,
  withinOfYouFoes: (p) => `inimigos ${AREA_TEXT.get(p.radius) ?? `a até ${p.radius2} de você`}`,
  ifYouBlockAAttackSufferFrom: (p) =>
    `se você bloquear um ataque ${p.kind}, ${p.foes} sofrem ${p.statusName} por ${p.resolveMagnitudeAtRanks} segundos`,
  ifYouBlockAAttack: (p) =>
    `se você bloquear um ataque ${p.kind}, ${p.foes}: ${lowerFirst(p.text)}`,
  stealsHealthFromThatFoe: (p) => `rouba ${p.amount} de vida desse inimigo`,
  loses: (p) => `perde ${p.count} ${categoryNoun(p.count2, p.category)}`,
  itTakesDamage: (p) => `ele sofre ${dano(p.amount, p.type)}`,
  takeDamage3: (p) => `${p.splashed} sofrem ${dano(p.amount, p.type)}`,
  thatAttackIsInterruptedAndAnd: (p) => `${p.when}, esse ataque é interrompido e ${p.hurt}`,
  itIsInterruptedAndYouLoseEnergy: (p) =>
    `${p.when}, ele é interrompido e você perde ${p.amount} de energia ou isto termina`,
  ofThatSkillSBaseEnergyCost: (p) => `${p.share} do custo base de energia dessa habilidade`,
  energy4: (p) => `${p.amount} de energia`,
  youAreHealedAreHealedIsHealed: (p) =>
    p.bearerIsCaster && p.length === 0
      ? "você é curado"
      : p.bearerIsCaster
        ? "são curados"
        : "é curado",
  forOfThatSkillSEnergyCost: (p) =>
    `${p.healed} em ${p.share} do custo de energia dessa habilidade`,
  forWord: (p) => `${p.healed} em ${p.amount}`,
  plus: () => " mais ",
  youGainGainsPlus: (p) => `${p.bearerIsCaster ? "você ganha" : "ganha"} ${p.gains}`,
  theNearestOf: (p) => `o mais próximo dentre ${p.splashed}`,
  upTo2: (p) => `até ${p.maxTargets} ${p.splashed}`,
  itAndLoseEnergy: (p) => `ele e ${p.others} perdem ${p.amount} de energia`,
  bearerFoesFoesOtherFoes: (p) => (p.to === "bearer-foes" ? "inimigos" : "outros inimigos"),
  inTheAreaSufferItToo: (p) => `${p.who} na área também sofrem isso`,
  ifASpellItThatSkill: (p) => (p.spellsOnly ? "se for um feitiço, ele" : "essa habilidade"),
  takesThisSkillSSlotForSeconds: (p) =>
    `${p.which} ocupa o espaço desta habilidade por ${p.seconds} segundos`,
  youEnterTheSameStance: () => "você entra na mesma postura",
  youLoseEnergyOrThisEnds: (p) => `você perde ${p.amount} de energia ou isto termina`,
  thatAttackIsInterrupted: (p) => `${p.when}, esse ataque é interrompido`,
  takes: (p) => `sofre ${p.dealt} ${p.when}`,
  bearerFatalDamageNegatedAnd: (p) => (p.on === "bearer-fatal-damage-negated" ? "e" : `${p.when},`),
  theFoeWhoDealtItTakesDamage: (p) =>
    `${p.then} o inimigo que o causou sofre ${dano(p.amount, p.type)}`,
  thatAttackerIsHealedFor: (p) => `${p.when}, esse atacante é curado em ${p.amount}`,
  bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p) =>
    p.on === "bearer-gains-enchantment"
      ? "esse encantamento"
      : "essa maldição ou esse encantamento",
  theCasterOfThatTakesDamage: (p) =>
    `${p.when}, quem lançou ${p.gained} sofre ${dano(p.amount, p.type)}`,
  theHealerTakesDamage: (p) => `${p.when}, quem curou sofre ${dano(p.amount, p.type)}`,
  ofThatTarget: (p) => `${lowerFirst(p.upTo)} desse alvo ${p.what}${p.paid}`,
  healsItsCasterFor: (p) => `cura quem o lançou em ${p.amount} ${p.when}`,
  itsCasterGainsEnergy: (p) => `quem o lançou ganha ${p.amount} de energia ${p.when}`,
  theNextSkillYouUseItUses: (p) =>
    `a próxima habilidade que ${p.bearerIsCaster ? "você usar" : "ele usar"} leva ${p.seconds} segundos a mais para recarregar`,
  itsCasterStealsHealth: (p) => `quem o lançou rouba ${p.amount} de vida ${p.when}`,
  theNearestOfTakes: (p) => `o mais próximo dentre ${p.allies} sofre`,
  take: (p) => `${p.allies} sofrem`,
  upToTake: (p) => `até ${p.maxTargets} ${p.allies} sofrem`,
  composedAlliesText: (p) => `${p.allies}: ${lowerFirst(p.text)}`,
  onAFoe: (p) => `${p.when} em um inimigo`,
  adjacentToYou: () => "adjacentes a você",
  withinAroundYou: (p) => `${p.area ?? `a até ${p.radius}`} ao seu redor`,
  otherAdjacentToYouWithinAroundYou: (p) =>
    p.includesCentre === true
      ? `${SPLASH_SIDE[p.hits]} ${p.value}`
      : `${SPLASH_SIDE[p.hits].startsWith("criaturas") ? "outras" : "outros"} ${SPLASH_SIDE[p.hits].replace(/^seus (?:outros )?/, "")} ${p.value}`,
  takeDamage4: (p) => `${p.yours}, ${p.reached} sofrem ${dano(p.amount, p.type)}`,
  composedYoursReachedText: (p) => `${p.yours}, ${p.reached}: ${lowerFirst(p.text)}`,
  composedBearerIsCasterSaid: (p) =>
    p.bearerIsCaster ? yourCondition(p.said) : ifItWording(p.said),
  composedWhenConditionText: (p) => `${p.when}, ${p.condition}: ${lowerFirst(p.text)}`,
  bearer: (p) => lowerFirst(p.target === "bearer" ? p.bearer : p.text),
  nextAttackSkill: (p) => `próxima habilidade de ataque: ${p.statusName} ${p.durationSeconds}`,
  nextAttackSkill2: (p) => `próxima habilidade de ataque: ${p.text}`,
  skillTargetAroundItsTarget: (p) => (p.at === "skill-target" ? " (ao redor do alvo dela)" : ""),
  withYourNext: (p) => `com seu próximo ${p.next}${p.around}: ${lowerFirst(p.text)}`,
  costsCostEnergy: (p) => `${p.one ? "custa" : "custam"} ${p.energyBase} de energia`,
  costsCostLessEnergy: (p) =>
    `${p.one ? "custa" : "custam"} ${p.energyPercentOff} a menos de energia`,
  costsCostLessEnergyMinimum: (p) =>
    `${p.one ? "custa" : "custam"} ${p.energyDiscount} a menos de energia (mínimo ${p.energyFloor})`,
  costsCostMoreEnergy: (p) =>
    `${p.one ? "custa" : "custam"} ${p.energySurcharge} a mais de energia`,
  castsCastInstantly: (p) => `${p.one ? "é lançado" : "são lançados"} instantaneamente`,
  castsCastFaster: (p) =>
    `${p.one ? "é lançado" : "são lançados"} ${p.activationMultiplier} mais rápido`,
  takesTakeAsLongToCast: (p) =>
    `${p.one ? "leva" : "levam"} ${p.activationMultiplier}× o tempo para lançar`,
  castsCastFaster2: (p) =>
    `${p.one ? "é lançado" : "são lançados"} ${p.activationSecondsLess} mais rápido`,
  rechargesRechargeFaster: (p) =>
    `${p.one ? "recarrega" : "recarregam"} ${p.rechargeFaster} mais rápido`,
  rechargesRechargeSlower: (p) =>
    `${p.one ? "recarrega" : "recarregam"} ${p.rechargeSlower} mais devagar`,
  lastsLastLongerShorter: (p) =>
    `${p.one ? "dura" : "duram"} ${p.durationMultiplier} ${p.durationMultiplier2 > 1 ? "a mais" : "a menos"}`,
  healsHealLessMoreNotTheDivine: (p) =>
    `${p.one ? "cura" : "curam"} ${p.value} ${p.healMultiplier < 1 ? "a menos" : "a mais"}${p.sparesDivineFavor ? ", exceto o bônus de Favor Divino" : ""}`,
  isAreNotEasilyInterrupted: (p) =>
    p.one ? "não é facilmente interrompido" : "não são facilmente interrompidos",
  overcastYouBy: (p) => `causam ${p.overcastPerUse} de Sobrecarga em você`,
  andAttack: (p) => `ataque ${p.chainRoles.split(" e ").map(CHAIN_WORD).join(" e ")}`,
  attackSkillSkill: (p) =>
    p.weapon !== undefined
      ? `habilidade de ataque ${WEAPON_WORD[p.weapon]}`
      : p.type === undefined
        ? "habilidade"
        : spaced(p.type),
  hexHexesS: (p) => (p.one ? p.kind : plural(p.kind)),
  thatTargetsAFoeThatTargetA: (p) =>
    p.one ? "que tenha um inimigo como alvo" : "que tenham um inimigo como alvo",
  thatTargetsYouThatTargetYou: (p) =>
    p.one ? "que tenha você como alvo" : "que tenham você como alvo",
  halfRanged: () => "(de meio alcance)",
  notFlashEnchantments: (p) => (p.notFlash ? " (exceto encantamentos relâmpago)" : ""),
  whileHoldingAnItem2: (p) => (p.whileHoldingItem ? "enquanto segura um item, " : ""),
  nextNext: (p) =>
    p.one
      ? `${p.whose.replace(/:$/, "")}, próximo uso:`
      : `${p.whose.replace(/:$/, "")}, próximos ${p.uses} usos:`,
  cannotBeInterrupted: () => "não pode ser interrompido",
  cannotBeBlocked: () => "não pode ser bloqueado",
  costsLessEnergy: (p) => `custa ${p.energyDiscount} a menos de energia`,
  castsInstantly: () => "é lançado instantaneamente",
  rechargesInstantly: () => "recarrega instantaneamente",
  s2: (p) => `${p.value}s`,
  takesSLongerToRecharge: (p) => `leva ${p.extraRechargeSeconds} a mais para recarregar`,
  yourNextAnd: (p) =>
    `${FEMININE_HEADS.has(headOf(p.NEXT_SKILL_KIND)) ? "sua próxima" : "seu próximo"} ${p.NEXT_SKILL_KIND} ${p.does}`,
  youLoseAllEnergyAsItIs: () => "você perde toda a energia ao lançá-lo",
  youGainOfItsEnergyCost: (p) => `você ganha ${p.energyGainOfCost} do custo de energia dele`,
  itRechargesFaster: (p) => `ele recarrega ${p.fraction}% mais rápido`,
  rechargesInstantly2: (p) => `${p.name} recarrega instantaneamente`,
  forYourNextSkill: () => "para sua próxima habilidade",
  ifItIsAAnd: (p) => `se for ${indefinite(p.kind)}, ${p.does}`,
  suffer: (p) => `sofrem ${p.sufferedWhat}`,
  forWord2: (p) => `${p.statusName} por ${p.durationSeconds} (${p.status})`,
  a: (p) => `${indefinite(spaced(p.category))} de ${p.owners}`,
  ifItInterruptsASkill: () => "Se interromper uma habilidade",
  ifThatActionWasASpell: () => "Se essa ação foi um feitiço",
  ifThatActionWasAnAttack: () => "Se essa ação foi um ataque",
  ifItKillsTheTarget: () => "Se matar o alvo",
  ifItResurrects: () => "Se ressuscitar",
  ifASpiritDiedInThisWay: () => "Se um espírito morreu desta forma",
  ifWasRemoved: (p) =>
    `Se ${aCategory(p.category)} foi ${FEMININE_HEADS.has(categoryOne(p.category)) ? "removida" : "removido"}`,
  ifItRemoves: (p) => `Se remover ${aCategory(p.category)}`,
  ifTargetIsBelowHealth: (p) => `Se o alvo estiver abaixo de ${p.fraction}% de vida`,
  ifTargetIsAboveHealth: (p) => `Se o alvo estiver acima de ${p.fraction}% de vida`,
  ifYouHaveLessThanHealth: (p) => `Se você tiver menos de ${p.fraction}% de vida`,
  ifYouHaveLessHealthThanYour: () => "Se você tiver menos vida que seu mascote",
  ifYourPetHasLessHealthThan: () => "Se seu mascote tiver menos vida que você",
  ifItFollowsOffHandAnOff: (p) => `Se vier depois de um ataque ${CHAIN_WORD(p.role)}`,
  ifTargetHas: (p) => `Se o alvo tiver ${p.filteredCategory}`,
  ifTargetHasOr: (p) => `Se o alvo tiver ${p.categories}`,
  ifYouHave: (p) => `Se você tiver ${aCategory(p.category)}`,
  ifYouHaveA: (p) => `Se você tiver ${aCategory(p.category)} de ${p.name}`,
  other: (p) => (p.excluding === undefined ? "" : "outro"),
  ifYouHaveNo: (p) =>
    p.other === ""
      ? `Se você não tiver ${FEMININE_HEADS.has(categoryOne(p.category)) ? "nenhuma" : "nenhum"} ${categoryOne(p.category)}`
      : `Se você não tiver ${FEMININE_HEADS.has(categoryOne(p.category)) ? "nenhuma outra" : "nenhum outro"} ${categoryOne(p.category)}`,
  ifYouHaveNo2: (p) =>
    `Se você não tiver ${FEMININE_HEADS.has(categoryOne(p.category)) ? `nenhuma${p.other === "" ? "" : " outra"}` : `nenhum${p.other === "" ? "" : " outro"}`} ${categoryOne(p.category)} de ${p.name}`,
  ifTargetIsCastingASpellOr: (p) =>
    p.orChant === true
      ? "Se o alvo estiver lançando um feitiço ou cântico"
      : "Se o alvo estiver lançando um feitiço",
  ifTargetIsUsingASkill: () => "Se o alvo estiver usando uma habilidade",
  ifTargetHasNoOtherHex: (p) => `Se o alvo não tiver nenhuma outra maldição de ${p.name}`,
  ifTargetIsNotAdjacentToAny: () => "Se o alvo não estiver adjacente a nenhum aliado",
  ifTargetIsNotNearAnyAllies: () => "Se o alvo não estiver perto de nenhum aliado",
  ifTargetHasNoAlliesWithin: (p) => `Se o alvo não tiver nenhum aliado a até ${p.radius}`,
  ifTargetIsNearAnyOfYour: () => "Se o alvo estiver perto de algum dos seus aliados",
  ifAnyOfYourAlliesIsWithin: (p) => `Se algum dos seus aliados estiver a até ${p.radius} do alvo`,
  ifTargetIsWithinEarshot: () => "Se o alvo estiver ao alcance da voz",
  ifTargetIsWithinOfYou: (p) => `Se o alvo estiver a até ${p.radius} de você`,
  ifTargetIsNotMoving: () => "Se o alvo não estiver se movendo",
  ifTargetIsKnockedDown: () => "Se o alvo estiver derrubado",
  ifTargetIsMoving: () => "Se o alvo estiver se movendo",
  ifTargetIsAFoe: () => "Se o alvo for um inimigo",
  ifTargetIsMovingFasterThanNormal: () => "Se o alvo estiver se movendo mais rápido que o normal",
  ifAnyFoeIsKnockedDownIf: (p) =>
    p.knockedDown === true
      ? `Se algum inimigo ${p.where} estiver derrubado`
      : `Se algum inimigo estiver ${p.where}`,
  ifYouHitOrMoreFoes: (p) => `Se você atingir ${p.atLeast} ou mais inimigos`,
  ifNumberOrMore: (p) => `Se ${countPhrase(p.countAll)} somarem ${p.atLeast} ou mais`,
  ifAreNoMoreThan: (p) => `Se ${countPhrase(p.countAll)} não passarem de ${p.countAll2}`,
  ifTargetHas2: (p) => `Se o alvo tiver ${p.statusName}`,
  ifTargetDoesNotHave: (p) => `Se o alvo não tiver ${p.statusName}`,
  ifYouHaveMoreEnergyThanTarget: () => "Se você tiver mais energia que o alvo",
  ifYouHaveLessThanEnergy: (p) => `Se você tiver menos de ${p.amount} de energia`,
  ifYouAreOvercast: () => "Se você estiver com Sobrecarga",
  ifYouWield: (p) => `Se você empunhar ${NEEDED_WEAPON[p.weapon]}`,
  ifYouHoldAShield: () => "Se você estiver segurando um escudo",
  ifYouAreHoldingAnItem: () => "Se você estiver segurando um item",
  ifTargetHasLessHealthThanYou: () => "Se o alvo tiver menos vida que você",
  ifTargetHasMoreHealthThanYou: () => "Se o alvo tiver mais vida que você",
  ifTargetIsAttacking: () => "Se o alvo estiver atacando",
  ifTargetIsNotAttacking: () => "Se o alvo não estiver atacando",
  ifTargetIsCastingASpellOr2: () => "Se o alvo estiver lançando um feitiço ou atacando",
  ifTargetIsASummonedCreature: () => "Se o alvo for uma criatura invocada",
  ifNoSpiritIsWithinOfYou: (p) => `Se nenhum espírito estiver ${ofYouOr(p.radius, p.radius2)}`,
  ifASpiritIsWithinOfYou: (p) => `Se um espírito estiver ${ofYouOr(p.radius, p.radius2)}`,
  ifYouControlOrFewerS: (p) =>
    `Se você controlar ${p.count} ou menos ${plural(spaced(p.creature))}`,
  ifASpiritOrACorpseIs: (p) =>
    `Se um espírito ou um cadáver estiver ${ofYouOr(p.radius, p.radius2)}`,
  ifAnAllyIsDeadWithin: (p) => `Se um aliado estiver morto ${areaOneOr(p.radius, p.radius2)}`,
  ifTargetIsNearACorpseOr: () =>
    "Se o alvo estiver perto de um cadáver ou o mascote dele estiver morto",
  ifTargetIsWithinOfACorpse: (p) =>
    `Se o alvo estiver a até ${p.radius} de um cadáver ou o mascote dele estiver morto`,
  composedType: (p) => (p.type === undefined ? "" : typeWord(p.type)),
  healthForEachAllyMax: (p) =>
    `, +${p.amount} de vida para cada aliado ${p.area} (máximo ${p.max})`,
  allPartyMembers: () => "Todos os membros do grupo",
  allItsPartyMembers: () => "Todos os membros do grupo dele",
  allAlliedMinions: () => "Todos os lacaios aliados",
  yourOtherMinions: () => "Seus outros lacaios",
  within2: (p) => `${p.Who} ${p.area ?? `a até ${p.radius}`}`,
  adjacent: (p) => `${capitalize(p.who)} adjacentes`,
  nearby: (p) => `${capitalize(p.who)} próximos`,
  within3: (p) => (p.area === undefined ? `${p.Who} a até ${p.radius}` : `${p.Who} ${p.area}`),
  loseThatSame: (p) =>
    `perdem ${FEMININE_HEADS.has(categoryOne(p.category)) ? "essa mesma" : "esse mesmo"} ${categoryOne(p.category)}`,
  loseAllAll: (p) =>
    `perdem ${FEMININE_HEADS.has(categoryOne(p.category)) ? "todas as" : "todos os"} ${categoryNoun("all", p.category)}`,
  onThem: () => "neles",
  loseOneForEachOnThem: (p) =>
    `perdem ${indefinite(categoryOne(p.category))} para cada ${p.countEach}`,
  lose: (p) => `perdem ${p.count} ${categoryNoun(p.count2, p.category)}`,
  enchantmentAnA: (p) =>
    p.onlyBearing === undefined || !FEMININE_HEADS.has(categoryOne(p.onlyBearing)) ? "um" : "uma",
  with4: (p) =>
    p.onlyBearing === undefined ? "" : ` com ${p.article} ${categoryOne(p.onlyBearing)}`,
  usingSkills: (p) =>
    p.onlyUsing === undefined ? "" : ` usando habilidades de ${typeFirstWord(p.onlyUsing)}`,
  dead: (p) => (p.dead === true ? `${capitalize(p.living)} mortos` : p.living),
  targetAndCasterAroundYouCasterAround: (p) =>
    `${p.includesCentre === true ? `O alvo e ${lowerFirst(p.reached)}` : p.reached}${p.around === "caster" ? " ao seu redor" : ""}${p.alsoAround === "caster" ? " ao redor do alvo e de você" : ""}${p.bearing}${p.using}${p.onlyIf}`,
  upTo3: (p) => `Até ${p.maxTargets} ${lowerFirst(p.who)}`,
  inItsRange: () => "ao alcance dele",
  inTheArea: () => "na área",
  foes: () => "inimigos",
  allEveryoneYouAndAlliesAllies: (p) =>
    p.affects === "all" ? "todos" : p.includesCaster ? "você e os aliados" : "aliados",
  enemiesFoesAllEveryoneYouAndAllies: (p) => `${p.value} ${areaOr(p.radius, p.radius2)}`,
  whenSprung: () => "ao ser acionada",
  after: (p) => `depois de ${seconds(p.delaySeconds)}`,
  everyFor: (p) => `a cada ${seconds(p.everySeconds)} por ${seconds(p.count)}`,
  whenItEnds: (p) => `Quando terminar, ${p.whom}: `,
  springsByItselfAsItsTimeRuns: () => "É acionada sozinha quando o tempo acaba",
  composedWhoText: (p) => `${capitalize(p.who)}: ${lowerFirst(p.text)}`,
  composedEndingText: (p) => `${p.ending}${lowerFirst(p.text)}`,
  composedConditionText: (p) => `${p.condition}: ${lowerFirst(p.text)}`,
  itsAttacksDealDamage: (p) => `Os ataques dele causam ${p.magnitude} de dano`,
  thisSpiritLosesHealth: (p) => `este espírito perde ${p.magnitude} de vida`,
  composedCondition: (p) => `${lowerFirst(p.condition)}: `,
  itsAttacks: (p) => `Os ataques dele: ${p.when}${p.what}`,
  health3: (p) => `${p.health} de vida`,
  health4: (p) => `${p.health} de vida (${p.health2})`,
  level: (p) => `nível ${p.marked}, `,
  lastsSeconds: (p) => `, dura ${p.durationSeconds} segundos`,
  composedCountNameLevelTextHealthTextLasts: (p) =>
    `${p.count} ${p.name} (${p.levelText}${p.healthText}${p.lasts})`,
  itsAttacksDealDamage2: (p) => `Os ataques dele causam ${p.value} de dano`,
  onlyOneAtATimeANew: () => "Apenas um por vez: um novo mata o anterior",
  leavesCorpseCorpsesWhenItDies: (p) =>
    `Deixa ${p.corpses} ${p.current === 1 ? "cadáver" : "cadáveres"} ao morrer`,
  whenItDiesStandsUpInIts: (p) => `Quando ele morrer, ${p.text} se ergue no lugar dele`,
  listSemicolon: () => "; ",
  inItsRange2: (p) => AREA_TEXT.get(p.radius) ?? "ao alcance dele",
  composedAffectsWhere: (p) => `${lowerAll(AURA_WHO[p.affects])} ${p.where}`,
  whenItDiesUnderHealthBeginFor: (p) =>
    `Quando ele morrer, ${p.who} abaixo de ${p.below} de vida começam a sofrer ${p.statusName} por ${p.duration} segundos`,
  whenItDiesDeadPartyMembersAre: (p) =>
    `Quando ele morrer, membros do grupo mortos ${p.where} são ressuscitados com ${p.health}% de vida e nenhuma energia`,
  damageTakeDamageAreHealedForHealth: (p) =>
    p.effect === "damage" ? `sofrem ${p.amount} de dano` : `são curados em ${p.amount} de vida`,
  max: (p) => ` (máximo ${p.max})`,
  whenItDiesPerSecondItLived: (p) =>
    `Quando ele morrer, ${p.who} ${p.what} por segundo de vida dele${p.max}`,
  everySecondsHealsTheMostHurtNon: (p) =>
    `A cada ${p.everySeconds} segundos: cura em ${p.heal} de vida o aliado mais ferido que não seja espírito ${p.where}`,
  whenANonSpiritDiesInIts: () => "Quando alguém que não seja espírito morrer ao alcance dele",
  nearby2: (p) => AREA_TEXT.get(p.radius) ?? "próximos",
  itsConditionsSpreadToEachNonSpirit: (p) =>
    `${p.when}, as condições dele se espalham para cada criatura que não seja espírito ${p.where} e que tenha uma condição`,
  eachOfItsTypeInItsRange: (p) =>
    `${p.when}, cada um do mesmo tipo ao alcance dele e abaixo de ${p.below} de vida sofre ${p.damage} de dano`,
  holdingAnItem: (p) => (p.onlyWhileHoldingItem ? " segurando um item" : ""),
  composedWhoWhereHoldingStatus: (p) => `${p.who} ${p.where}${p.holding}: ${p.status}`,
  perFoeHit: (p) => (p.perTarget === undefined ? "" : " por inimigo atingido"),
  forEachMeleeAttackSkillOnYour: (p) =>
    ` para cada habilidade de ataque corpo a corpo na sua barra (no máximo ${p.max})`,
  withinEarshot: (p) => (p.radius === AREA_EARSHOT ? "ao alcance da voz" : p.area),
  forEverySummonedCreatureYouControlMaximum: (p) =>
    ` para cada criatura invocada que você controla ${p.where} (máximo de ${p.max} de energia)`,
  composedZeroAloneEachText: (p) => (p.zero ? `${p.alone} ${p.each}` : `${p.text}, +${p.each}`),
  maximum: (p) => ` (máximo ${p.max})`,
  forEach: (p) => `para cada ${p.countEach}${p.max}`,
  pointOfEnergyGained: () => "ponto de energia ganho",
  pointOfEnergyRestrictedByOvercast: () => "ponto de energia restringido por Sobrecarga",
  skillDisabledInThisWay: () => "habilidade desativada desta forma",
  orCasterOnYou: (p) =>
    `${categoryWords(p.categories)} ${p.on === "caster" ? "em você" : p.onTarget}`,
  ofYourRecharging: (p) => `das suas ${p.rechargingSkillsNoun} em recarga`,
  pointOfEnergyCasterYouHaveThey: (p) =>
    `ponto de energia que ${p.on === "caster" ? "você tem" : "o alvo tem"}`,
  orRemoved: (p) => `${categoryWords(p.categories)} removido`,
  orLost: (p) => `${categoryWords(p.categories)} de ${p.name} perdido`,
  enchantmentYouAreMaintaining: () => "encantamento que você mantém",
  secondItWasInEffect: () => "segundo em que esteve ativo",
  foeKnockedDown: () => "inimigo derrubado",
  youHaveEquipped: (p) => `${spaced(p.type)} que você tem equipado`,
  adrenalineSkillTheyHave: () => "habilidade de adrenalina que ele tem",
  foeHit: () => "inimigo atingido",
  within4: (p) => `${categoryWords(p.perCountNoun)} ${areaOneOr(p.radius, p.radius2)}`,
  attacksSkillsS: (p) =>
    p.weapon !== undefined
      ? `ataques ${WEAPON_WORD[p.weapon]}`
      : p.type === undefined
        ? "habilidades"
        : plural(spaced(p.type)),
  casterYourTargetS: (p) => (p.on === "caster" ? "seu" : "alvo"),
  s3: (p) => pluralCategories(p.perCountNoun),
  pointOfOvercast: () => "ponto de Sobrecarga",
  skillDisabled: () => "habilidade desativada",
  rechargingSkill: () => "habilidade em recarga",
  pointOfEnergy: () => "ponto de energia",
  removedOr: (p) => `${categoryWords(p.categories)} removido`,
  removedOr2: (p) => `${categoryWords(p.categories)} de ${p.name} removido`,
  maintainedEnchantment: () => "encantamento mantido",
  secondHeld: () => "segundo mantido",
  adrenalineSkill: () => "habilidade de adrenalina",
  deadAlly: () => "aliado morto",
  knockedDownFoeFoe: (p) => (p.knockedDown === true ? "inimigo derrubado" : "inimigo"),
  ally: () => "aliado",
  neverAbove: (p) => `, nunca acima de ${p.upTo}`,
  forEachRemoved: (p) =>
    p.toTarget === true || p.perRemoved === undefined
      ? ""
      : ` para cada ${categoryOne(p.perRemoved)} ${FEMININE_HEADS.has(categoryOne(p.perRemoved)) ? "removida" : "removido"}`,
  perPointLost: (p) => (p.perEnergyLost === undefined ? "" : " por ponto perdido"),
  armorPenetration: (p) => ` (${p.armorPenetration}% de penetração de armadura)`,
  dealsDamage2: (p) => `Causa ${dano(p.magnitude, p.type)}${p.perPointLost}${p.penetration}`,
  deals: () => "Causa",
  damage2: (p) => ` de dano${typeWord(p.type)}`,
  composedCountedConditionAmount: (p) => `${p.counted}; ${lowerFirst(p.condition)}: +${p.amount}`,
  gainHealthEqualToThisSpellS: () => "Ganha vida igual ao bônus de Favor Divino deste feitiço",
  healsIfRelievedOf: (p) => `Cura ${p.amount} de vida se livrar o alvo de ${p.name}`,
  healsForOfYourCurrentHealthMaximum: (p) =>
    `Cura ${p.magnitude} da sua vida atual (máximo de ${p.max} de vida)`,
  youGainHealth: (p) => `Você ganha ${p.amount} de vida`,
  yourPetGainsHealth: (p) => `Seu mascote ganha ${p.amount} de vida`,
  ownerHealsItsOwnerForHealsFor: (p) =>
    p.recipient === "owner"
      ? `Cura o dono dele em ${p.amount} de vida`
      : `Cura ${p.amount} de vida`,
  healsForEachRemovedHealsForEach: (p) =>
    p.perRemoved !== undefined
      ? `Cura ${p.amount} de vida para cada ${categoryOne(p.perRemoved)} ${FEMININE_HEADS.has(categoryOne(p.perRemoved)) ? "removida" : "removido"}`
      : p.perDestroyedSpirit === true
        ? `Cura ${p.amount} de vida para cada espírito destruído`
        : p.perEnergyLost === true
          ? `${p.recipient === "caster" ? "Você é curado em" : "Cura"} ${p.amount} de vida para cada ponto de energia perdido`
          : p.perUsedSkillEnergy === true
            ? `Cura ${p.magnitude} do custo de energia do feitiço`
            : p.value,
  casterYouGainHeals: (p) => (p.recipient === "caster" ? "Você ganha" : "Cura"),
  health5: () => " de vida",
  casterOnTargetFoeOnThem: (p) => (p.recipient === "caster" ? "no inimigo alvo" : "neles"),
  underHealth: (p) => `, abaixo de ${p.onlyBelowHealthFraction}% de vida`,
  gainOfTheSkillSBaseEnergy: (p) => `Ganha ${p.magnitude} do custo base de energia da habilidade`,
  targetGainsOwnerYouGainGain: (p) =>
    p.toTarget === true ? "O alvo ganha" : p.recipient === "owner" ? "Você ganha" : "Ganha",
  energy5: (p) =>
    `${p.gains} ${p.magnitude} de energia${p.perPointLost}${p.perFoeHit}${p.perOwnCreature}${p.perRemoved}`,
  energy6: () => " de energia",
  gain2: () => "Ganha",
  onTargetFoe: () => "no inimigo alvo",
  strikeStrikesOfAdrenalineAdrenaline: (p) =>
    p.units
      ? `${p.magnitude} ${p.current === 1 ? "golpe" : "golpes"} de adrenalina`
      : `${p.magnitude} de adrenalina`,
  youGain2: () => "Você ganha",
  targetTargetGainsGain: (p) => (p.recipient === "target" ? "O alvo ganha" : "Ganha"),
  strikesOfAdrenaline: () => " golpes de adrenalina",
  targetRegainsAllEnergy: () => "O alvo recupera toda a energia",
  casterYouLoseTargetLoses: (p) => (p.on === "caster" ? "Você perde" : "O alvo perde"),
  energy7: (p) => `${p.who} ${p.magnitude} de energia`,
  stealsUpToEnergy: (p) => `Rouba até ${p.magnitude} de energia`,
  stealsUpToHealth: (p) => `Rouba até ${p.magnitude} de vida`,
  youStealHealth: (p) => `Você rouba ${p.magnitude} de vida`,
  youSacrificeOfYourMaximumHealth: (p) => `Você sacrifica ${p.percentOfMax}% da sua vida máxima`,
  targetFoeLosesHealth: (p) => `O inimigo alvo perde ${p.magnitude} de vida`,
  targetFoeLoses: () => "O inimigo alvo perde",
  youLoseHealth: (p) => `Você perde ${p.magnitude} de vida`,
  forEachEnchantmentRemoved: (p) => `${p.lose} para cada encantamento de ${p.whose} removido`,
  loseAllButHealth: (p) => `Perde toda a vida, exceto ${p.magnitude}`,
  transferOfYourConditionsToFoes: (p) =>
    `Transfere ${p.magnitude} das suas condições para ${p.foesWithin}`,
  max2: (p) => (p.maxSeconds === undefined ? "" : ` (máximo ${seconds(p.maxSeconds)})`),
  withTheTimeEachHasLeft: () => "com o tempo que resta a cada uma",
  withMoreTime: (p) => `com ${p.extend}% a mais de tempo${p.max}`,
  foesGetTheTargetSConditionsWith: (p) =>
    `${p.foesWithin} recebem as condições do alvo, ${p.value}`,
  loseYourHealthHealForOfIt: (p) =>
    `Perde ${share(p.fractionOfCurrent)} sua vida; cura ${p.magnitude}% disso`,
  whoeverOfYouAndTargetFoeHas: () =>
    "Quem tiver mais vida entre você e o inimigo alvo perde metade da diferença; o outro ganha essa quantidade",
  stacksOnceForEachOnThem: (p) => `. Acumula uma vez para cada ${p.countEach}`,
  stacksOnceForEachOnThem2: (p) => p.status + p.value,
  forWord3: (p) => `Por ${p.durationSeconds}, ${p.what}`,
  forEachHexRemoved: (p) => ` para cada maldição de ${p.name} removida)`,
  stackingOnceForEachOnThem: (p) => `, acumulando uma vez para cada ${p.countEach}`,
  appliesCasterToYouForUntilIt: (p) =>
    `Aplica ${p.statusName}${p.on === "caster" ? " em você" : ""} ` +
    (p.ends ? `por ${p.statusDuration} ` : "até terminar ") +
    `(${p.status}` +
    p.value +
    p.value2,
  composedStatusNameDurationSeconds: (p) => `${p.statusName} (${p.durationSeconds})`,
  appliesOneOfAtRandom: (p) => `Aplica um destes, ao acaso: ${p.choices}`,
  maintainedCasterOnYouEnergyRegenerationWhile: (p) =>
    `Mantido${p.on === "caster" ? " em você" : ""}: −1 de regeneração de energia enquanto durar. ` +
    `${capitalize(p.what)}.`,
  losesThatSame: (p) =>
    `Perde ${FEMININE_HEADS.has(categoryOne(p.category)) ? "essa mesma" : "esse mesmo"} ${categoryOne(p.category)}`,
  casterLoseRemoves: (p) => (p.from === "caster" ? "Perde" : "Remove"),
  oneForEachRemovedMax: (p) =>
    `${p.verb} ${indefinite(categoryOne(p.category))} para cada ${categoryOne(p.category2)} ${FEMININE_HEADS.has(categoryOne(p.category2)) ? "removida" : "removido"} (máximo ${p.max})`,
  oneForEachOnTarget: (p) =>
    `${p.verb} ${indefinite(categoryOne(p.category))} para cada ${p.countEach}`,
  lose2: (p) => `Perde ${p.count} ${categoryNoun(p.count2, p.category)}${ofProfession(p.whose)}`,
  endsTheTargetSStance: () => "Encerra a postura do alvo",
  forEachSpiritWithinOfIt: (p) =>
    ` para cada espírito ${AREA_AROUND_ONE.get(p.near) ?? `a até ${p.near2} dele`}`,
  numberUpTo: (p) => (typeof p.count === "number" && p.count > 1 ? "até " : ""),
  and4: (p) => (p.orCategory === undefined ? "" : ` e ${categoryNoun(p.count, p.orCategory)}`),
  removes: (p) =>
    `Remove ${p.upTo}${p.count} ${categoryNoun(p.count2, p.category)}${ofProfession(p.whose)}${p.and}${p.perSpirit}`,
  interruptsTheTargetSSpellIfThey: () => "Interrompe o feitiço do alvo, se ele estiver lançando um",
  interruptsTheTargetSSpellOrChant: () =>
    "Interrompe o feitiço ou cântico do alvo, se ele estiver lançando um",
  skillInterruptsTheTargetSSkillIf: (p) =>
    p.only === "skill"
      ? "Interrompe a habilidade do alvo, se ele estiver usando uma"
      : "Interrompe a ação do alvo: uma habilidade ou um ataque",
  youAreKnockedDownFor: (p) => `Você é derrubado por ${seconds(p.durationSeconds)}`,
  knocksDownFor: (p) => `Derruba por ${seconds(p.durationSeconds)}`,
  shadowStepsToTheTarget: () => "Dá um Passo das Sombras até o alvo",
  youAndTheTargetShadowStepTo: () => "Você e o alvo dão um Passo das Sombras trocando de lugar",
  corpseTeleportsYouToThatCorpseShadow: (p) =>
    p.to === "corpse"
      ? "Teleporta você até esse cadáver"
      : "Dá um Passo das Sombras para um local próximo, diretamente para longe do seu alvo",
  health6: (p) => `${p.percent}% de vida`,
  upToYourCurrentHealthYourHealth: (p) =>
    p.casterLosesFractionOfCurrent === 0
      ? "até sua vida atual"
      : `sua vida depois de perder ${share(p.casterLosesFractionOfCurrent)} sua vida`,
  perPartyMemberWithin: (p) => ` por membro do grupo ${areaOneOr(p.radius, p.radius2)}`,
  casterAndTeleportsTheTargetToYou: (p) =>
    p.at === "caster" ? ", e teleporta o alvo até você" : "",
  returnsTheTargetToLifeWithAnd: (p) =>
    `Devolve o alvo à vida com ${p.healthText} e ${p.energy}% de energia${p.per}${p.teleport}`,
  returnsEveryDeadAlliedPetToLife: (p) =>
    `Devolve à vida cada mascote aliado morto ${p.where} com ${p.health}% de vida`,
  youLoseAllYourRemainingEnergy: () => "Você perde toda a energia restante",
  youGainFor: (p) => `Você ganha ${p.statusName} por ${seconds(p.durationSeconds)} (${p.status})`,
  yourPetGainsFor: (p) => `Seu mascote ganha ${p.statusName} por ${p.duration} (${p.status})`,
  yourPetMovesToYourTargetAnd: () => "Seu mascote vai até o seu alvo e o ataca",
  teleportsTargetToYou: () => "Teleporta o alvo até você",
  destroysTargetAlliedSpirit: () => "Destrói o espírito aliado alvo",
  destroysTargetMinion: () => "Destrói o lacaio alvo",
  nearestSpiritLosesHealthTargetAllyIs: (p) =>
    `O espírito mais próximo perde ${p.magnitude} de vida; o aliado alvo é curado em ${p.healPerPoint} por ponto`,
  nearestSpiritLosesAllEnergyYouGain: (p) =>
    `O espírito mais próximo perde toda a energia; você ganha ${p.magnitude}% dela`,
  itsOwnerGainsHealthEqualToThe: () => "O dono dele ganha vida igual ao dano que ele causa",
  destroysEveryAlliedSpiritWithin: (p) =>
    `Destrói cada espírito aliado ${areaOneOr(p.radius, p.radius2)}`,
  thisSkillRecharges: () => "Esta habilidade recarrega",
  secondsFaster: () => " segundos mais rápido",
  thisSkillRechargesInstantly: () => "Esta habilidade recarrega instantaneamente",
  thisSkillRechargesFaster: (p) => `Esta habilidade recarrega ${p.fraction}% mais rápido`,
  usedSkillThatSkillRechargesInstantlyThis: (p) =>
    p.of === "used-skill"
      ? "Essa habilidade recarrega instantaneamente"
      : "Esta habilidade recarrega instantaneamente",
  loseAllAdrenaline: () => "Perde toda a adrenalina",
  rechargesAllYourOtherSkills: () => "Recarrega todas as suas outras habilidades",
  rechargesAllYourStances: () => "Recarrega todas as suas posturas",
  rechargesAllYourOtherSkills2: (p) =>
    `Recarrega todas as suas outras habilidades de ${spaced(p.which)}`,
  rechargesAllYour: (p) => `Recarrega ${allYour(p.rechargedKind)}`,
  allOfYourSpiritsDie: () => "Todos os seus espíritos morrem",
  summonsPlusOnePerCorpseExploited: (p) =>
    `Invoca ${p.text}` + (p.perExploitedCorpse === true ? ", mais um por cadáver explorado" : ""),
  setsATrap: () => "Arma uma armadilha",
  pulseTargetCreatesASymbolMarksThe: (p) =>
    p.kind === "pulse"
      ? p.anchor === "target"
        ? "Cria um símbolo"
        : "Marca o chão"
      : p.anchor === "corpse"
        ? "Cria um poço"
        : "Cria uma proteção",
  forSeconds: (p) => `${p.what} ${p.where} por ${p.magnitude} segundos`,
  seconds3: (p) => `${p.magnitude} segundos`,
  forEachSignetYouHaveEquipped: (p) =>
    p.perOwnSignet === true ? " para cada sinete que você tem equipado" : "",
  allOfTheTargetSSkillsAre: (p) => `Todas as habilidades do alvo ficam desativadas por ${p.time}`,
  theTargetSEliteSkillIsDisabled: (p) => `A habilidade elite do alvo fica desativada por ${p.time}`,
  oneOfTheTargetSSpellsAt: (p) =>
    `Um dos feitiços do alvo, ao acaso, fica desativado por ${p.time}`,
  allOfTheTargetSAttackSkills: (p) =>
    `Todas as habilidades de ataque do alvo ficam desativadas por ${p.time}`,
  theInterruptedSkillIsDisabledFor: (p) =>
    `A habilidade interrompida fica desativada por ${p.time}${p.perSignet}`,
  centreInterruptedHoldingThatSkillHaveIt: (p) =>
    p.which === "centre-interrupted"
      ? `que tenham essa habilidade ficam com ela desativada por ${p.time}`
      : `Essa habilidade e todas as do mesmo atributo ficam desativadas por ${p.time}`,
  thisSkillBecomesTheOneYouRemoved: (p) =>
    `Esta habilidade se torna a que você removeu por ${p.seconds} segundos`,
  thisSkillBecomesThatRandomSpellSpell: (p) =>
    `Esta habilidade se torna ${p.which === "random-spell" ? "esse feitiço" : "essa habilidade"} pelo mesmo tempo`,
  thisSkillBecomesItsTargetSNon: (p) =>
    `Esta habilidade se torna a habilidade elite do alvo que não seja forma por ${p.magnitude} segundos`,
  takeControlOfTargetEnemySpirit: () => "Toma o controle do espírito inimigo alvo",
  becomeYourMinionsWhileYouBear: (p) => `Tornam-se seus lacaios enquanto você tiver ${p.name}`,
  targetMinionWithAMasterBecomesMasterless: (p) =>
    `O lacaio alvo com mestre fica sem mestre; um sem mestre passa a ser seu e é curado em ${p.magnitude} de vida`,
  leadCountsAsALeadAttackCounts: (p) =>
    p.role === "lead" ? "Conta como um ataque principal" : "Conta como um ataque de mão secundária",
  targetSuffersOvercast: (p) => `O alvo sofre ${p.magnitude} de Sobrecarga`,
  thisSkillThisSkillThatSkill: (p) =>
    p.of === "this-skill" ? "Esta habilidade" : "Essa habilidade",
  forEachRemoved2: (p) =>
    p.perRemoved === undefined
      ? ""
      : ` para cada ${categoryOne(p.perRemoved)} ${FEMININE_HEADS.has(categoryOne(p.perRemoved)) ? "removida" : "removido"}`,
  takesSecondsLongerToRecharge: (p) =>
    `${p.which} leva ${p.magnitude} segundos a mais para recarregar${p.each}`,
  that: (p) => narrowing(p.onlyIf),
  ifItStrikesAFoe: (p) => `Se atingir um inimigo${p.whom}: ${lowerFirst(p.text)}`,
  from: (p) => `${p.text} de ${p.from}`,
  takeDamageForEachPointOfEnergy: (p) =>
    `sofrem ${dano(p.amount, p.type)}` +
    (p.perEnergyLost === undefined ? "" : " para cada ponto de energia perdido"),
  areInterruptedAreInterruptedIfCasting: (p) =>
    p.only === undefined ? "são interrompidos" : "são interrompidos se estiverem lançando",
  areKnockedDownForS: (p) => `são derrubados por ${p.durationSeconds}s`,
  foesFoeCreaturesGain: (p) =>
    p.hits === "foes" || p.hits === "foe-creatures" ? p.suffered : `ganham ${p.sufferedWhat}`,
  gainHealthEqualToThisSpellS2: () => "ganham vida igual ao bônus de Favor Divino deste feitiço",
  gain3: (p) => `ganham ${gainWording(p.text)}`,
  gainHealth: (p) => `ganham ${p.amount} de vida`,
  loseHealth: (p) => `perdem ${p.amount} de vida`,
  youFromEach: (p) => `você ${stealsWording(p.text)} de cada um`,
  transferAllTheirConditionsToYou: () => "transferem todas as condições deles para você",
  resurrect: (p) => (p.kind === "resurrect" ? returnedWording(p.text) : lowerFirst(p.text)),
  and5: (p) => (p.length === 0 ? (p.last ?? "") : `${p.parts} e ${p.last2}`),
  perAlliedMinionsOwnMinionsMinionOne: (p) =>
    `; ${lowerFirst(p.text)} por ${p.hits === "allied-minions" || p.hits === "own-minions" ? "lacaio" : "alvo"}`,
  per: (p) => ` por ${countedNoun(p.perCountNoun)}`,
  damage3: (p) => `${dano(p.amount, p.type)}${p.each}`,
  healHealsEnergy: (p) =>
    p.kind === "heal" ? `cura ${p.amount} de vida${p.each}` : `+${p.amount} de energia${p.each}`,
  drainsEnergy: (p) => `drena ${p.magnitude} de energia`,
  stealsEnergy: (p) => `rouba ${p.magnitude} de energia`,
  stealsHealth: (p) => `rouba ${p.magnitude} de vida`,
  resurrectsEnergy: (p) => `ressuscita, ${p.energy}% de energia`,
  resurrectsHealth: (p) => `ressuscita, ${p.health}% de vida`,
  resurrectsPetsHealth: (p) => `ressuscita mascotes, ${p.health}% de vida`,
  healsOfYourHealth: (p) =>
    `cura ${p.percent}% de ${contract(`${share(p.fractionOfCurrent)} sua vida`)}`,
  balancesHealthWithTargetFoe: () => "equilibra a vida com o inimigo alvo",
  allUpTo: (p) => (p.current === p.Infinity ? "todas" : `até ${p.moving}`),
  andFoesWithinOfIt: (p) =>
    ` e inimigos ${AREA_AROUND_TARGET.get(p.copyToFoesWithin) ?? `a até ${p.copyToFoesWithin2} dele`}`,
  withOfTheirRemainingDurations: (p) => ` com ${p.durationMultiplier}% das durações restantes`,
  movesConditionsFromFoesWithinOfIt: (p) =>
    `Move ${p.count === "todas" ? "todas as" : p.count} condições${p.lasting} de inimigos ${AREA_AROUND_TARGET.get(p.foesWithin) ?? `a até ${p.foesWithin2} dele`} para o alvo`,
  casterMovesOfYourConditionsToThe: (p) =>
    p.from === "caster"
      ? `Move ${p.count === "todas" ? "todas as" : `${p.count} das`} suas condições${p.lasting} para o alvo${p.copies}`
      : `Move ${p.count === "todas" ? "todas as" : `${p.count} das`} condições do alvo${p.lasting} para você`,
  youAreHealedForForEach: (p) => `${p.moves}; você é curado em ${p.magnitude} para cada uma`,
  areDisabledForSeconds: (p) => `ficam desativadas por ${p.seconds} segundos`,
  allOfYourSkills: (p) => `Todas as suas habilidades ${p.time}`,
  allOfYourOtherSkills: (p) => `Todas as suas outras habilidades ${p.time}`,
  allOfYourOtherNonAttackSkills: (p) =>
    `Todas as suas outras habilidades que não sejam de ataque ${p.time}`,
  allOfYourOtherAttackSkillsYour: (p) =>
    p.exceptWeapon === undefined
      ? `Todas as suas outras habilidades de ataque ${p.time}`
      : `Suas habilidades de ataque que não sejam ${WEAPON_WORD[p.exceptWeapon]} ${p.time}`,
  allOfYourNonAttackSkills: (p) => `Todas as suas habilidades que não sejam de ataque ${p.time}`,
  s4: (p) => plural(typeName(p.type)),
  yourAnd: (p) => `${capitalize(allYour(p.types).replace(/^tod[ao]s [ao]s /, ""))} ${p.time}`,
  allOfYourSpells: (p) => `Todos os seus feitiços ${p.time}`,
  allOfYourOther: (p) =>
    `Todas as suas ${p.others ? "outras " : ""}habilidades de ${p.name} ${p.time}`,
  exceptAnd: (p) => (p.length === 0 ? "" : `, exceto ${p.except}`),
  allOfYourNonSkills: (p) =>
    `Todas as suas habilidades que não sejam de ${p.name}${p.exceptText} ${p.time}`,
  yourWholeParty: () => "Todo o seu grupo",
  composedAffectsWhere2: (p) => `${AREA_WHO[p.affects]} ${p.where}`,
  radius: (p) => `raio de ${p.radius}`,
  andAroundYou: (p) =>
    `${TARGET_TEXT[p.target]}, e ${lowerAll(AREA_WHO[p.affects])} ${p.where} ao seu redor`,
  range: (p) => `alcance de ${p.range}`,
  upTo4: (p) => `até ${p.maxTargets} ${p.who}`,
  withinOfIt: (p) => AREA_AROUND_TARGET.get(p.radius) ?? `a até ${p.radius2} dele`,
  and6: (p) => `${TARGET_TEXT[p.target]}, e ${p.count} ${p.where}`,
  rangeRadius: (p) => `alcance de ${p.range}, raio de ${p.radius}`,
  free: () => "Grátis",
  adrenaline: (p) => `${p.amount} de adrenalina`,
  composedAmount: (p) => ` (${p.amount})`,
  energy8: (p) => `${p.cost} de energia${p.base}${p.overcast}`,
  overcast: (p) => `, ${p.overcast} de Sobrecarga`,
  instant: () => "Instantâneo",
  composedActivationBase: (p) => (p.activation === p.base ? p.base : `${p.activation} (${p.base})`),
  dealsNoDamage: () => "Não causa dano",
  dealsOnlyDamageDamage: (p) =>
    p.weaponless
      ? `Causa apenas ${p.bonus} de dano${p.damageType}`
      : `+${p.bonus} de dano${p.damageType}`,
  damage4: (p) => `${p.condition}: +${p.more} de dano`,
  damageOnThem: (p) => `+${p.amount} de dano ${p.perCount}`,
  cannotBeBlocked2: () => "Não pode ser bloqueado",
  cannotBeBlocked3: (p) => `${p.condition}: não pode ser bloqueado`,
  chanceToMissWithOrLess: (p) => `${p.chance}% de chance de errar com ${p.name} ${p.rank} ou menos`,
  resultsInACriticalHit: () => "Resulta em um acerto crítico",
  resultsInACriticalHit2: (p) => `${p.condition}: resulta em um acerto crítico`,
  hitsUpToAdjacentFoesToo: (p) => `Atinge também até ${p.cleaveTargets} inimigos adjacentes`,
  hitsEveryAdjacentFoe: (p) => `${p.condition}: atinge todos os inimigos adjacentes`,
  armorPenetration2: (p) => `${p.armorPenetration}% de penetração de armadura`,
  ifBlocked: (p) => `Se for bloqueado: ${lowerFirst(p.text)}`,
  onACriticalHit: (p) => `Em um acerto crítico: ${lowerFirst(p.text)}`,
  ifItFailsToHit: (p) => `Se errar: ${lowerFirst(p.text)}`,
  asItIsUsed: (p) => `Ao ser usado: ${lowerFirst(p.text)}`,
  allYourPreparationsAreRemoved: () => "Todas as suas preparações são removidas",
  fliesAsFast: (p) => `Voa a ×${p.multiplier} da velocidade`,
  fliesAsFast2: (p) => `${p.condition}: voa a ×${p.multiplier} da velocidade`,
  only: (p) => `; ${lowerAll(p.condition)}, apenas 1`,
  eachDealingLessDamage: (p) => `, cada uma causando ${p.value}% a menos de dano`,
  strikesTwice: () => "Golpeia duas vezes",
  strikesTimes: (p) => `Golpeia ${p.count} vezes`,
  shootsArrowsAtOnce: (p) => `Dispara ${p.count} flechas de uma vez${p.weaker}${p.fewer}`,
  whileActivating: (p) => `Durante a ativação: ${p.status}`,
  easilyInterrupted: () => "Facilmente interrompido",
  failureChanceWithOrLess: (p) =>
    `${p.chance}% de chance de falha com ${p.name} ${p.rank} ou menos`,
  activatesFasterSlower: (p) =>
    `${p.condition}: ativa ${p.value}% ${p.multiplier < 1 ? "mais rápido" : "mais devagar"}`,
  healthGainFromDivineFavorIsDoubled: () => "O ganho de vida de Favor Divino é dobrado",
  projectilesEachCanBeDodged: (p) => `${p.shots} projéteis: cada um pode ser esquivado`,
  aProjectileAtEachFoeEachCan: (p) =>
    p.spread === true
      ? "Um projétil em cada inimigo: cada um pode ser esquivado"
      : "Projétil: pode ser esquivado",
  halfTheNormalRange: () => "Metade do alcance normal",
  orSacrificesHealthIfNoneIsNear: (p) =>
    `, ou sacrifica ${p.elseSacrificePercent}% de vida se não houver nenhum por perto`,
  targetExploitsTheCorpseNearestYourTarget: (p) =>
    (p.near === "target"
      ? "Explora o cadáver mais próximo do seu alvo"
      : p.all === true
        ? `Explora cada cadáver recente ${areaOneOr(p.radius, p.radius2)}`
        : p.pick === "random"
          ? "Explora um cadáver ao acaso"
          : "Explora o cadáver mais próximo") + p.value,
  whileOnYourBarAHealthFights: (p) =>
    `Enquanto estiver na sua barra, ${indefinite(p.name)} (${p.companionHealth} de vida) luta ao seu lado`,
  disabledForAfterUse: (p) => `Desativada por ${seconds(p.disabledAfterUseSeconds)} após o uso`,
  takeAllConditionsFromYourAlliesWith: () =>
    "Toma todas as condições dos seus aliados, com o tempo que resta a cada uma",
  hitOrMiss: (p) => `${p.text}, acertando ou errando`,
  eliteFlash: (p) =>
    `${TYPE_TEXT[p.type].replace(/\.$/, "")}${p.elite ? " elite" : ""}${p.flash ? " relâmpago" : ""}.`,
  moraleBoost: (p) =>
    p.rechargesOnMoraleBoost === true ? "Bônus de moral" : seconds(p.rechargeSeconds),
  hexHexesS2: (p) => plural(p.kind),
} satisfies DescribeWords as DescribeWords;
