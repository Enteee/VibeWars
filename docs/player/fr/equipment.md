# Équipement

La partie **Équipement** de l'éditeur de build contient tes armes et ton
armure. Fais glisser des armes et des mains gauches depuis la bibliothèque à
droite, ou clique sur l'une d'elles pour l'équiper. L'armure se choisit sur
la figurine, plus bas.

## Sets d'armes

Tu portes jusqu'à **quatre sets d'armes**, chacun avec une arme et, si l'arme
laisse une main libre, une main gauche comme un Shield ou un Focus. Le set 1
est celui avec lequel tu commences ; les autres peuvent rester vides.

En match, change de set avec **1 à 4** (**F1 à F4** avec les touches
Classique). Un changement attend la fin de l'incantation ou du geste en
cours ; bouger ou Esc change tout de suite. Il n'y a pas de temps de
recharge. Tes attaques, les compétences qui exigent une certaine arme et ton
énergie maximale suivent toutes le set en main.

Une arme requiert le rang 9 dans son attribut : en dessous, elle frappe pour
un tiers de ses dégâts, et l'éditeur le dit en rouge. Une Sword est toujours
Swordsmanship, mais un Staff, une Wand, un Shield ou un Focus est fait pour un
attribut que tu choisis : clique sur sa main sur la figurine (**6** pour
l'arme, **7** pour la main gauche) et choisis-en un.

## Mods d'arme

Chaque arme et main gauche a des emplacements de mods : un **préfixe**, un
**suffixe** et une **inscription**. Clique sur la main sur la figurine, ou sur
sa ligne à côté, pour les choisir ; chacun dit ce qu'il fait. Une Wand, un
Shield et un Focus n'acceptent pas de préfixe ; les mains nues n'acceptent
rien. Un mod est toujours à sa meilleure valeur, et chaque set d'armes porte
les siens : changer de set change donc aussi ses mods, et la santé et
l'énergie maximales suivent le set en main. Changer une arme garde les mods
qui lui vont encore et te dit lesquels elle a perdus.

| Mod                       | Emplacement | Compatible                                | Effet                                        |
| ------------------------- | ----------- | ----------------------------------------- | -------------------------------------------- |
| Defensive                 | Préfixe     | Staff                                     | Armure +5                                    |
| Hale                      | Préfixe     | Staff                                     | +30 santé                                    |
| Insightful                | Préfixe     | Staff                                     | Énergie +5                                   |
| of Defense                | Suffixe     | toute arme martiale, Staff                | Armure +5                                    |
| of Fortitude              | Suffixe     | toute arme martiale, Staff, Shield, Focus | +30 santé                                    |
| of Shelter                | Suffixe     | toute arme martiale, Staff                | Armure +7 (contre dégâts physiques)          |
| of Warding                | Suffixe     | toute arme martiale, Staff                | Armure +7 (contre dégâts élémentaires)       |
| "Cast Out the Unclean"    | Inscription | Shield, Focus                             | Réduit de 20% la durée de Disease sur toi    |
| "Fear Cuts Deeper"        | Inscription | Shield, Focus                             | Réduit de 20% la durée de Bleeding sur toi   |
| "I Can See Clearly Now"   | Inscription | Shield, Focus                             | Réduit de 20% la durée de Blinded sur toi    |
| "I have the power!"       | Inscription | toute arme martiale                       | Énergie +5                                   |
| "Leaf on the Wind"        | Inscription | Shield, Focus                             | Armure +10 (contre dégâts de froid)          |
| "Like a Rolling Stone"    | Inscription | Shield, Focus                             | Armure +10 (contre dégâts de terre)          |
| "Live for Today"          | Inscription | Focus                                     | Énergie +15, régénération d'énergie -1       |
| "Not the face!"           | Inscription | Shield, Focus                             | Armure +10 (contre dégâts contondants)       |
| "Only the Strong Survive" | Inscription | Shield, Focus                             | Réduit de 20% la durée de Weakness sur toi   |
| "Pure of Heart"           | Inscription | Shield, Focus                             | Réduit de 20% la durée de Poison sur toi     |
| "Riders on the Storm"     | Inscription | Shield, Focus                             | Armure +10 (contre dégâts de foudre)         |
| "Seize the Day"           | Inscription | Staff, Wand                               | Énergie +15, régénération d'énergie -1       |
| "Sleep Now in the Fire"   | Inscription | Shield, Focus                             | Armure +10 (contre dégâts de feu)            |
| "Soundness of Mind"       | Inscription | Shield, Focus                             | Réduit de 20% la durée de Dazed sur toi      |
| "Strength of Body"        | Inscription | Shield, Focus                             | Réduit de 20% la durée de Deep Wound sur toi |
| "Swift as the Wind"       | Inscription | Shield, Focus                             | Réduit de 20% la durée de Crippled sur toi   |
| "The Riddle of Steel"     | Inscription | Shield, Focus                             | Armure +10 (contre dégâts tranchants)        |
| "Through Thick and Thin"  | Inscription | Shield, Focus                             | Armure +10 (contre dégâts perforants)        |

### Préfixes martiaux au toucher

| Préfixe                      | Compatible                 | Effet au toucher                                                      |
| ---------------------------- | -------------------------- | --------------------------------------------------------------------- |
| Vampiric                     | toute arme martiale        | vole 3 santé (5 avec Hammer, Scythe, Bows) ; -1 régénération de santé |
| Zealous                      | toute arme martiale        | gagne 1 énergie ; -1 régénération d'énergie                           |
| Sundering                    | toute arme martiale        | 20% de chance de +20% de pénétration d'armure                         |
| Furious                      | martiale, sauf Bows        | 10% de chance de doubler l'adrénaline                                 |
| Barbed, Crippling, Poisonous | martiale, sauf Hammer      | Bleeding, Crippled, Poison que tu infliges durent 33% de plus         |
| Cruel                        | martiale, sauf Bows        | Deep Wound que tu infliges dure 33% de plus                           |
| Heavy                        | Axe, Hammer, Scythe, Spear | Weakness que tu infliges dure 33% de plus                             |
| Silencing                    | Daggers, Spear, Bows       | Dazed que tu infliges dure 33% de plus                                |
| Ebon, Fiery, Icy, Shocking   | toute arme martiale        | ses dégâts deviennent de terre, de feu, de froid ou de foudre         |

« Au toucher » désigne un coup réussi d'une attaque ou d'une compétence
d'attaque : un coup bloqué ou raté ne fait rien. Une altération plus longue
est celle que ta compétence d'attaque inflige.

### Mods qui dépendent de ton état

Les mods qui dépendent de ton état ne comptent que tant qu'il dure. « Au-dessus »
ou « en dessous de la moitié de la santé » est strict : à exactement la
moitié, aucun ne compte. Quand un maximum augmenté prend fin, la santé ou
l'énergie au-dessus du nouveau maximum est perdue.

| Mod                                                | Emplacement, compatible       | Effet                                                               |
| -------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| "Strength and Honor"                               | inscription, martiale         | +15% de dégâts d'arme au-dessus de la moitié de la santé            |
| "Guided by Fate", "Dance with Death"               | inscription, martiale         | +15% de dégâts d'arme quand enchanté, en posture                    |
| "Too Much Information"                             | inscription, martiale         | +15% de dégâts d'arme contre un ennemi sous maléfice                |
| "Vengeance is Mine"                                | inscription, martiale         | +20% de dégâts d'arme sous la moitié de la santé                    |
| "Don't Fear the Reaper"                            | inscription, martiale         | +20% de dégâts d'arme sous un maléfice                              |
| "To the Pain!"                                     | inscription, martiale         | +15% de dégâts d'arme ; -10 armure en attaquant                     |
| "Brawn over Brains"                                | inscription, martiale         | +15% de dégâts d'arme ; -5 énergie                                  |
| "Hale and Hearty", "Have Faith"                    | inscription, toute arme       | +5 énergie au-dessus de la moitié de la santé, quand enchanté       |
| "Don't call it a comeback!", "I am Sorrow."        | inscription, toute arme       | +7 énergie sous la moitié de la santé, sous un maléfice             |
| of Devotion, of Endurance                          | suffixe, Staff, Shield, Focus | +45 santé quand enchanté, en posture                                |
| of Valor                                           | suffixe, Staff, Shield, Focus | +60 santé sous un maléfice                                          |
| "Luck of the Draw"                                 | inscription, Shield ou Focus  | 20% de chance qu'un coup physique inflige 5 de moins                |
| "Sheltered by Faith", "Run For Your Life!"         | inscription, Shield ou Focus  | les coups physiques infligent 2 de moins quand enchanté, en posture |
| "Nothing to Fear"                                  | inscription, Shield ou Focus  | les coups physiques infligent 3 de moins sous un maléfice           |
| "Hail to the King", "Faith is My Shield"           | inscription, Focus            | +5 armure au-dessus de la moitié de la santé, quand enchanté        |
| "Might makes Right", "Knowing is Half the Battle." | inscription, Focus            | +5 armure en attaquant, en lançant un sort                          |
| "Man for All Seasons", "Survival of the Fittest"   | inscription, Focus            | +5 armure contre dégâts élémentaires, physiques                     |
| "Ignorance is Bliss", "Life is Pain"               | inscription, Focus            | +5 armure ; -5 énergie, -20 santé                                   |
| "Down But Not Out", "Be Just and Fear Not"         | inscription, Focus            | +10 armure sous la moitié de la santé, sous un maléfice             |

Les dégâts d'arme sont le jet de l'arme elle-même : les dégâts bonus d'une
compétence d'attaque ne sont pas augmentés.

### Mods de lanceur de sorts

Les mods de lanceur de sorts n'agissent que sur les sorts, chacun selon sa
propre chance quand tu en utilises un. « L'attribut de l'objet » est
l'attribut pour lequel le Staff, la Wand ou le Focus est fait. Deux mods de
division par deux qui se déclenchent ensemble ne divisent toujours que par
deux.

| Mod                         | Emplacement, compatible      | Effet                                                                              |
| --------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| Adept                       | préfixe, Staff               | 20% de chance de diviser par deux l'incantation des sorts de l'attribut de l'objet |
| Swift                       | préfixe, Staff               | 10% de chance de diviser par deux l'incantation de tout sort                       |
| of Aptitude                 | suffixe, Focus               | 20% de chance de diviser par deux l'incantation des sorts de l'attribut de l'objet |
| of Swiftness                | suffixe, Focus               | 10% de chance de diviser par deux l'incantation de tout sort                       |
| "Aptitude not Attitude"     | inscription, Staff ou Wand   | 20% de chance de diviser par deux l'incantation des sorts de l'attribut de l'objet |
| "Don't think twice"         | inscription, Staff ou Wand   | 10% de chance de diviser par deux l'incantation de tout sort                       |
| of Memory                   | suffixe, Wand                | 20% de chance de diviser par deux la recharge des sorts de l'attribut de l'objet   |
| of Quickening               | suffixe, Wand                | 10% de chance de diviser par deux la recharge de tout sort                         |
| "Let the Memory Live Again" | inscription, Staff ou Wand   | 10% de chance de diviser par deux la recharge de tout sort                         |
| "Forget Me Not"             | inscription, Focus           | 20% de chance de diviser par deux la recharge des sorts de l'attribut de l'objet   |
| "Serenity Now"              | inscription, Focus           | 10% de chance de diviser par deux la recharge de tout sort                         |
| of Mastery                  | suffixe, Staff               | 20% de chance que l'attribut de l'objet soit à +1 pour un sort                     |
| "Master of My Domain"       | inscription, Shield ou Focus | 20% de chance que l'attribut de l'objet soit à +1 pour un sort                     |
| of Enchanting               | suffixe, martiale ou Staff   | les enchantements que tu lances durent 20% de plus                                 |

## Armure

L'armure compte cinq pièces : tête, torse, mains, jambes et pieds. Chaque
pièce a deux emplacements d'amélioration :

- un **insigne**, un petit bonus sur cette pièce : plus d'armure contre les
  dégâts physiques, par exemple, ou quand tu attaques ;
- une **rune**.

Ton **casque** ajoute +1 à un attribut de ton choix.

Dans l'éditeur, l'armure est une figurine. Clique sur une pièce numérotée, ou
sur sa ligne à côté, pour choisir son insigne et sa rune ; chaque choix dit
ce qu'il fait sur cette pièce. **Appliquer l'insigne aux 5** met celui que tu
as choisi sur chaque pièce. La figurine montre l'insigne et la rune de chaque
pièce, et tient les armes du set que tu regardes, avec leurs mods.

## Runes

| Rune                                   | Ce qu'elle donne                                  |
| -------------------------------------- | ------------------------------------------------- |
| Rune d'attribut mineure                | +1 à un attribut                                  |
| Rune d'attribut majeure                | +2 à un attribut, -35 santé                       |
| Rune d'attribut supérieure             | +3 à un attribut, -75 santé                       |
| Vigor                                  | plus de santé (+30, +41 ou +50)                   |
| Vitae                                  | +10 santé                                         |
| Attunement                             | plus d'énergie (+3, +6 ou +9)                     |
| Clarity, Purity, Recovery, Restoration | deux altérations chacune s'estompent 20% plus tôt |
| Absorption (Warrior)                   | moins de dégâts physiques à chaque coup           |

Tu choisis la rune d'une pièce au même endroit que son insigne : clique sur
la pièce sur la figurine.

L'éditeur fait le total pour toi : santé, énergie, armure et dégâts, tels
que ton premier set d'armes les a.
