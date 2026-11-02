# Equipment

The **Equipment** part of the build editor holds your weapons and armor.
Drag weapons and off-hands from the library on the right, or click one to
equip it. Armor is picked on the figure, below.

## Weapon sets

You carry up to **four weapon sets**, each a weapon and, if the weapon
leaves a hand free, an off-hand such as a shield or a focus. Set 1 is the
one you start with; the others may stay empty.

In a match, swap sets with **1 to 4** (**F1 to F4** in the Classic keys).
A swap waits for the cast or swing you are in to finish; moving or Esc
swaps at once. There is no cooldown. Your attacks, the skills that need a
certain weapon, and your maximum Energy all follow the set in hand.

A weapon needs rank 9 in its attribute: below that it hits for a third of
its damage, and the editor says so in red. A sword is always
Swordsmanship, but a staff, a wand, a shield or a focus is made for an
attribute you choose: click its hand on the figure (**6** for the weapon,
**7** for the off-hand) and pick one.

## Weapon mods

Every weapon and off-hand has slots for mods: a **prefix**, a **suffix**
and an **inscription**. Click the hand on the figure, or its row beside
it, to pick them; each says what it does. A wand, a shield
and a focus take no prefix; bare hands take none. A mod is always at its
best value, and each weapon set wears its own, so swapping sets swaps
their mods too: maximum Health and Energy move with the set in hand.
Changing a weapon keeps the mods that still fit it and tells you which it
dropped.

| Mod                       | Slot        | Fits                                     | Effect                                    |
| ------------------------- | ----------- | ---------------------------------------- | ----------------------------------------- |
| Defensive                 | Prefix      | Staff                                    | Armor +5                                  |
| Hale                      | Prefix      | Staff                                    | +30 Health                                |
| Insightful                | Prefix      | Staff                                    | Energy +5                                 |
| of Defense                | Suffix      | any martial weapon, Staff                | Armor +5                                  |
| of Fortitude              | Suffix      | any martial weapon, Staff, Shield, Focus | +30 Health                                |
| of Shelter                | Suffix      | any martial weapon, Staff                | Armor +7 (vs. physical damage)            |
| of Warding                | Suffix      | any martial weapon, Staff                | Armor +7 (vs. elemental damage)           |
| "Cast Out the Unclean"    | Inscription | Shield, Focus                            | Reduces Disease duration on you by 20%    |
| "Fear Cuts Deeper"        | Inscription | Shield, Focus                            | Reduces Bleeding duration on you by 20%   |
| "I Can See Clearly Now"   | Inscription | Shield, Focus                            | Reduces Blinded duration on you by 20%    |
| "I have the power!"       | Inscription | any martial weapon                       | Energy +5                                 |
| "Leaf on the Wind"        | Inscription | Shield, Focus                            | Armor +10 (vs. cold damage)               |
| "Like a Rolling Stone"    | Inscription | Shield, Focus                            | Armor +10 (vs. earth damage)              |
| "Live for Today"          | Inscription | Focus                                    | Energy +15, Energy regeneration -1        |
| "Not the face!"           | Inscription | Shield, Focus                            | Armor +10 (vs. blunt damage)              |
| "Only the Strong Survive" | Inscription | Shield, Focus                            | Reduces Weakness duration on you by 20%   |
| "Pure of Heart"           | Inscription | Shield, Focus                            | Reduces Poison duration on you by 20%     |
| "Riders on the Storm"     | Inscription | Shield, Focus                            | Armor +10 (vs. lightning damage)          |
| "Seize the Day"           | Inscription | Staff, Wand                              | Energy +15, Energy regeneration -1        |
| "Sleep Now in the Fire"   | Inscription | Shield, Focus                            | Armor +10 (vs. fire damage)               |
| "Soundness of Mind"       | Inscription | Shield, Focus                            | Reduces Dazed duration on you by 20%      |
| "Strength of Body"        | Inscription | Shield, Focus                            | Reduces Deep Wound duration on you by 20% |
| "Swift as the Wind"       | Inscription | Shield, Focus                            | Reduces Crippled duration on you by 20%   |
| "The Riddle of Steel"     | Inscription | Shield, Focus                            | Armor +10 (vs. slashing damage)           |
| "Through Thick and Thin"  | Inscription | Shield, Focus                            | Armor +10 (vs. piercing damage)           |

### Martial prefixes on a hit

| Prefix                       | Fits                       | What it does on a hit                                        |
| ---------------------------- | -------------------------- | ------------------------------------------------------------ |
| Vampiric                     | any martial weapon         | steals 3 Health (5 on hammer, scythe, bows); -1 Health regen |
| Zealous                      | any martial weapon         | gains 1 Energy; -1 Energy regen                              |
| Sundering                    | any martial weapon         | 20% chance of +20% armor penetration                         |
| Furious                      | martial, not bows          | 10% chance of double adrenaline                              |
| Barbed, Crippling, Poisonous | martial, not hammer        | Bleeding, Crippled, Poison you cause last 33% longer         |
| Cruel                        | martial, not bows          | Deep Wound you cause lasts 33% longer                        |
| Heavy                        | axe, hammer, scythe, spear | Weakness you cause lasts 33% longer                          |
| Silencing                    | daggers, spear, bows       | Dazed you cause lasts 33% longer                             |
| Ebon, Fiery, Icy, Shocking   | any martial weapon         | its damage becomes earth, fire, cold or lightning            |

"On a hit" means a landed hit of an attack or an attack skill: a blocked
or missed one does nothing. A longer condition is one your attack skill
causes.

### Mods that wait on your state

The mods that wait on your state count only while it holds. "Above" or
"below half Health" is strictly so: at exactly half, neither counts. When a
raised maximum ends, Health or Energy above the new maximum is lost.

| Mod                                                | Slot, fits                   | What it does                                           |
| -------------------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| "Strength and Honor"                               | inscription, martial         | +15% weapon damage above half Health                   |
| "Guided by Fate", "Dance with Death"               | inscription, martial         | +15% weapon damage while enchanted, in a stance        |
| "Too Much Information"                             | inscription, martial         | +15% weapon damage against a hexed foe                 |
| "Vengeance is Mine"                                | inscription, martial         | +20% weapon damage below half Health                   |
| "Don't Fear the Reaper"                            | inscription, martial         | +20% weapon damage while hexed                         |
| "To the Pain!"                                     | inscription, martial         | +15% weapon damage; -10 armor while attacking          |
| "Brawn over Brains"                                | inscription, martial         | +15% weapon damage; -5 Energy                          |
| "Hale and Hearty", "Have Faith"                    | inscription, any weapon      | +5 Energy above half Health, while enchanted           |
| "Don't call it a comeback!", "I am Sorrow."        | inscription, any weapon      | +7 Energy below half Health, while hexed               |
| of Devotion, of Endurance                          | suffix, staff, shield, focus | +45 Health while enchanted, in a stance                |
| of Valor                                           | suffix, staff, shield, focus | +60 Health while hexed                                 |
| "Luck of the Draw"                                 | inscription, shield or focus | 20% chance a physical hit deals 5 less                 |
| "Sheltered by Faith", "Run For Your Life!"         | inscription, shield or focus | physical hits deal 2 less while enchanted, in a stance |
| "Nothing to Fear"                                  | inscription, shield or focus | physical hits deal 3 less while hexed                  |
| "Hail to the King", "Faith is My Shield"           | inscription, focus           | +5 armor above half Health, while enchanted            |
| "Might makes Right", "Knowing is Half the Battle." | inscription, focus           | +5 armor while attacking, while casting a spell        |
| "Man for All Seasons", "Survival of the Fittest"   | inscription, focus           | +5 armor against elemental, physical damage            |
| "Ignorance is Bliss", "Life is Pain"               | inscription, focus           | +5 armor; -5 Energy, -20 Health                        |
| "Down But Not Out", "Be Just and Fear Not"         | inscription, focus           | +10 armor below half Health, while hexed               |

Weapon damage is the weapon's own roll: an attack skill's bonus damage is
not raised.

### Caster mods

The caster mods act on spells only, each by its own chance when you use
one. "The item's attribute" is the attribute the staff, wand or focus is
made for. Two halving mods that both come up still halve once.

| Mod                         | Slot, fits                   | What it does                                                    |
| --------------------------- | ---------------------------- | --------------------------------------------------------------- |
| Adept                       | prefix, staff                | 20% chance to halve the cast of the item's attribute spells     |
| Swift                       | prefix, staff                | 10% chance to halve any spell's cast                            |
| of Aptitude                 | suffix, focus                | 20% chance to halve the cast of the item's attribute spells     |
| of Swiftness                | suffix, focus                | 10% chance to halve any spell's cast                            |
| "Aptitude not Attitude"     | inscription, staff or wand   | 20% chance to halve the cast of the item's attribute spells     |
| "Don't think twice"         | inscription, staff or wand   | 10% chance to halve any spell's cast                            |
| of Memory                   | suffix, wand                 | 20% chance to halve the recharge of the item's attribute spells |
| of Quickening               | suffix, wand                 | 10% chance to halve any spell's recharge                        |
| "Let the Memory Live Again" | inscription, staff or wand   | 10% chance to halve any spell's recharge                        |
| "Forget Me Not"             | inscription, focus           | 20% chance to halve the recharge of the item's attribute spells |
| "Serenity Now"              | inscription, focus           | 10% chance to halve any spell's recharge                        |
| of Mastery                  | suffix, staff                | 20% chance the item's attribute is +1 for a spell               |
| "Master of My Domain"       | inscription, shield or focus | 20% chance the item's attribute is +1 for a spell               |
| of Enchanting               | suffix, martial or staff     | enchantments you cast last 20% longer                           |

## Armor

Armor is five pieces: head, chest, hands, legs and feet. Every piece has
two upgrade slots:

- an **insignia**, a little extra on that piece: more armor against
  physical damage, say, or while you attack;
- a **rune**.

Your **headgear** adds +1 to one attribute you choose.

In the editor, armor is a figure. Click a numbered piece on it, or its
row beside it, to pick its insignia and rune; each choice says what it
does on that piece. **Apply insignia to all 5** puts the one you picked
on every piece. The figure shows each piece's insignia and rune, and
holds the weapons of the set you are looking at, with their mods.

## Runes

| Rune                                   | What it gives                           |
| -------------------------------------- | --------------------------------------- |
| Minor attribute rune                   | +1 to an attribute                      |
| Major attribute rune                   | +2 to an attribute, -35 Health          |
| Superior attribute rune                | +3 to an attribute, -75 Health          |
| Vigor                                  | more Health (+30, +41 or +50)           |
| Vitae                                  | +10 Health                              |
| Attunement                             | more Energy (+3, +6 or +9)              |
| Clarity, Purity, Recovery, Restoration | two conditions each wear off 20% sooner |
| Absorption (Warrior)                   | less physical damage from each hit      |

You pick a piece's rune in the same place as its insignia: click the piece
on the figure.

The editor adds it all up for you: Health, Energy, armor and damage, as
your first weapon set has them.
