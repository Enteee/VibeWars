/**
 * Names for rolled characters (#1149): a first name and a surname, the way
 * GW1 players named theirs. Invented and Tyria-flavoured (Ascalon, Kryta,
 * Cantha, Elona), none of them a GW1 NPC. One word each, 3-9 letters.
 */

export const FIRST_NAMES: readonly string[] = [
  "Kaelen",
  "Aldric",
  "Brenna",
  "Corwin",
  "Darya",
  "Elric",
  "Faelyn",
  "Garrick",
  "Halvard",
  "Isolde",
  "Jorund",
  "Kestrel",
  "Liora",
  "Maddoc",
  "Neris",
  "Orrin",
  "Perrin",
  "Hanae",
  "Rowena",
  "Seren",
  "Talric",
  "Ulric",
  "Vesna",
  "Wren",
  "Ryoji",
  "Zoran",
  "Anwen",
  "Bastian",
  "Caelia",
  "Dorian",
  "Eamon",
  "Ashani",
];

export const SURNAMES: readonly string[] = [
  "Ashvale",
  "Stormhold",
  "Ironwood",
  "Greymere",
  "Thornfell",
  "Duskmoor",
  "Emberly",
  "Frostcrag",
  "Highcliff",
  "Ravenmoor",
  "Wyndham",
  "Coldbrook",
  "Blackfen",
  "Oakhaven",
  "Mistral",
  "Larkspur",
  "Redmane",
  "Stonebrow",
  "Dawnfire",
  "Brackwell",
  "Veldane",
  "Hollowell",
  "Tarnwick",
  "Sunreach",
  "Ashborne",
  "Kaishiro",
  "Tenmaru",
  "Sahrani",
  "Nashiri",
  "Zandeth",
  "Velcroft",
  "Brightfen",
];

/** How many names are drawn before a taken one is accepted anyway. */
const DRAWS = 20;

/** One of `names` by `random` ([0, 1)), clamped like `pickBuildFrom`. */
function draw(names: readonly string[], random: () => number): string {
  const name = names[Math.min(names.length - 1, Math.floor(random() * names.length))];
  if (name === undefined) {
    throw new Error("no names to draw from");
  }
  return name;
}

/**
 * "First Last" by `random`, never one in `taken` (lower-cased names)
 * unless 20 draws found nothing else: then the last draw, taken or not.
 */
export function randomCharacterName(random: () => number, taken: ReadonlySet<string>): string {
  let name = "";
  for (let i = 0; i < DRAWS; i += 1) {
    name = `${draw(FIRST_NAMES, random)} ${draw(SURNAMES, random)}`;
    if (!taken.has(name.toLowerCase())) {
      return name;
    }
  }
  return name;
}

/**
 * Words for a new player's generated name (#2653): `<Adjective><Noun>`,
 * like "AshenWolf". Fantasy and neutral, one capitalised word of at most
 * 8 letters each, so a name fits the 16 a player name may have and reads
 * as no character's "First Last".
 */
export const PLAYER_ADJECTIVES: readonly string[] = [
  "Ashen",
  "Silent",
  "Iron",
  "Amber",
  "Bright",
  "Crimson",
  "Distant",
  "Dusky",
  "Elder",
  "Fallow",
  "Frosted",
  "Gilded",
  "Gloomy",
  "Golden",
  "Hidden",
  "Hollow",
  "Jade",
  "Lucky",
  "Misty",
  "Mossy",
  "Nimble",
  "Noble",
  "Oaken",
  "Pale",
  "Quiet",
  "Restless",
  "Rusty",
  "Sable",
  "Scarlet",
  "Starlit",
  "Silver",
  "Stormy",
  "Sunlit",
  "Swift",
  "Thorny",
  "Twilight",
  "Velvet",
  "Wild",
  "Windy",
  "Wintry",
  "Woven",
  "Zealous",
];

export const PLAYER_NOUNS: readonly string[] = [
  "Wolf",
  "Raven",
  "Lark",
  "Badger",
  "Bear",
  "Boar",
  "Crane",
  "Drake",
  "Ember",
  "Falcon",
  "Fern",
  "Finch",
  "Fox",
  "Gale",
  "Griffin",
  "Hawk",
  "Heron",
  "Hound",
  "Lantern",
  "Lynx",
  "Moth",
  "Oak",
  "Otter",
  "Owl",
  "Pike",
  "Rook",
  "Rowan",
  "Sparrow",
  "Spire",
  "Stag",
  "Stone",
  "Thistle",
  "Thorn",
  "Tide",
  "Viper",
  "Warden",
  "Willow",
  "Wisp",
  "Wren",
  "Yew",
  "Comet",
  "Golem",
];

/** A new player's name by `random`, like "SilentRaven" (#2653). */
export function randomPlayerName(random: () => number): string {
  return `${draw(PLAYER_ADJECTIVES, random)}${draw(PLAYER_NOUNS, random)}`;
}
