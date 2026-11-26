/**
 * Words for a new player's generated name (#2653): `<Adjective><Noun>`,
 * like "AshenWolf". Fantasy and neutral, one capitalised word of at most
 * 8 letters each, so a name fits the 16 a player name may have.
 */

/** One of `words` by `random` ([0, 1)), clamped like `pickBuildFrom`. */
function draw(words: readonly string[], random: () => number): string {
  const word = words[Math.min(words.length - 1, Math.floor(random() * words.length))];
  if (word === undefined) {
    throw new Error("no words to draw from");
  }
  return word;
}

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
