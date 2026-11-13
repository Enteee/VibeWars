var e=`# Výbava

Časť **Výbava** v editore buildov obsahuje tvoje zbrane a brnenie.
Zbrane a predmety do druhej ruky pretiahni z knižnice vpravo alebo na jeden
klikni, aby si ho vybavil. Brnenie sa vyberá na figúre, pozri nižšie.

## Sady zbraní

Nosíš až **štyri sady zbraní**, každú so zbraňou a, ak zbraň nechá jednu
ruku voľnú, s predmetom do druhej ruky, ako je štít alebo ohnisko. Sada 1 je
tá, s ktorou začínaš; ostatné môžu zostať prázdne.

V zápase prepínaš sady klávesmi **1 až 4** (**F1 až F4** pri klávesoch
Klasické). Výmena počká, kým sa dokončí zoslanie alebo švih, v ktorom práve si;
pohyb alebo Esc vymení okamžite. Nie je tu žiadne čakanie. Tvoje útoky,
schopnosti, ktoré vyžadujú určitú zbraň, a tvoja maximálna energia sa riadia
sadou, ktorú držíš v ruke.

Zbraň vyžaduje hodnosť 9 vo svojom atribúte: pod ňou zasahuje za tretinu
svojho poškodenia a editor to povie červenou. Meč je vždy
Swordsmanship, ale palica, prútik, štít alebo ohnisko sa vyrába pre atribút,
ktorý si vyberieš: klikni na jeho ruku na figúre (**6** pre zbraň,
**7** pre druhú ruku) a jeden vyber.

## Vylepšenia zbraní

Každá zbraň a predmet do druhej ruky má pozície na vylepšenia: **prefix**,
**sufix** a **nápis**. Vyberieš ich kliknutím na ruku na figúre alebo na jej
riadok vedľa nej; každé hovorí, čo robí. Prútik, štít
a ohnisko neberú prefix; holé ruky neberú nič. Vylepšenie má vždy svoju
najlepšiu hodnotu a každá sada zbraní nosí vlastné, takže výmenou sád sa
vymenia aj ich vylepšenia: maximálne zdravie a energia sa menia podľa sady v
ruke. Pri výmene zbrane sa zachovajú vylepšenia, ktoré na ňu stále sedia, a
povie sa ti, ktoré odpadli.

| Vylepšenie                | Pozícia | Sedí na                                  | Účinok                                      |
| ------------------------- | ------- | ---------------------------------------- | ------------------------------------------- |
| Defensive                 | Prefix  | Staff                                    | Brnenie +5                                  |
| Hale                      | Prefix  | Staff                                    | +30 zdravia                                 |
| Insightful                | Prefix  | Staff                                    | Energia +5                                  |
| of Defense                | Sufix   | každá bojová zbraň, Staff                | Brnenie +5                                  |
| of Fortitude              | Sufix   | každá bojová zbraň, Staff, Shield, Focus | +30 zdravia                                 |
| of Shelter                | Sufix   | každá bojová zbraň, Staff                | Brnenie +7 (proti fyzickému poškodeniu)     |
| of Warding                | Sufix   | každá bojová zbraň, Staff                | Brnenie +7 (proti elementálnemu poškodeniu) |
| "Cast Out the Unclean"    | Nápis   | Shield, Focus                            | Skracuje trvanie Disease na tebe o 20 %     |
| "Fear Cuts Deeper"        | Nápis   | Shield, Focus                            | Skracuje trvanie Bleeding na tebe o 20 %    |
| "I Can See Clearly Now"   | Nápis   | Shield, Focus                            | Skracuje trvanie Blinded na tebe o 20 %     |
| "I have the power!"       | Nápis   | každá bojová zbraň                       | Energia +5                                  |
| "Leaf on the Wind"        | Nápis   | Shield, Focus                            | Brnenie +10 (proti poškodeniu chladom)      |
| "Like a Rolling Stone"    | Nápis   | Shield, Focus                            | Brnenie +10 (proti poškodeniu zemou)        |
| "Live for Today"          | Nápis   | Focus                                    | Energia +15, regenerácia energie -1         |
| "Not the face!"           | Nápis   | Shield, Focus                            | Brnenie +10 (proti tupému poškodeniu)       |
| "Only the Strong Survive" | Nápis   | Shield, Focus                            | Skracuje trvanie Weakness na tebe o 20 %    |
| "Pure of Heart"           | Nápis   | Shield, Focus                            | Skracuje trvanie Poison na tebe o 20 %      |
| "Riders on the Storm"     | Nápis   | Shield, Focus                            | Brnenie +10 (proti poškodeniu bleskom)      |
| "Seize the Day"           | Nápis   | Staff, Wand                              | Energia +15, regenerácia energie -1         |
| "Sleep Now in the Fire"   | Nápis   | Shield, Focus                            | Brnenie +10 (proti poškodeniu ohňom)        |
| "Soundness of Mind"       | Nápis   | Shield, Focus                            | Skracuje trvanie Dazed na tebe o 20 %       |
| "Strength of Body"        | Nápis   | Shield, Focus                            | Skracuje trvanie Deep Wound na tebe o 20 %  |
| "Swift as the Wind"       | Nápis   | Shield, Focus                            | Skracuje trvanie Crippled na tebe o 20 %    |
| "The Riddle of Steel"     | Nápis   | Shield, Focus                            | Brnenie +10 (proti sečnému poškodeniu)      |
| "Through Thick and Thin"  | Nápis   | Shield, Focus                            | Brnenie +10 (proti bodnému poškodeniu)      |

### Bojové prefixy pri zásahu

| Prefix                       | Sedí na                    | Čo robí pri zásahu                                                     |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Vampiric                     | každá bojová zbraň         | ukradne 3 zdravia (5 pri hammer, scythe, bows); -1 regenerácia zdravia |
| Zealous                      | každá bojová zbraň         | získa 1 energiu; -1 regenerácia energie                                |
| Sundering                    | každá bojová zbraň         | 20 % šanca na +20 % prienik brnením                                    |
| Furious                      | bojové, nie bows           | 10 % šanca na dvojnásobný adrenalín                                    |
| Barbed, Crippling, Poisonous | bojové, nie hammer         | Bleeding, Crippled, Poison, ktoré spôsobíš, trvajú o 33 % dlhšie       |
| Cruel                        | bojové, nie bows           | Deep Wound, ktorý spôsobíš, trvá o 33 % dlhšie                         |
| Heavy                        | axe, hammer, scythe, spear | Weakness, ktorú spôsobíš, trvá o 33 % dlhšie                           |
| Silencing                    | daggers, spear, bows       | Dazed, ktorý spôsobíš, trvá o 33 % dlhšie                              |
| Ebon, Fiery, Icy, Shocking   | každá bojová zbraň         | jej poškodenie sa zmení na zemné, ohnivé, chladové alebo bleskové      |

„Pri zásahu“ znamená zásah útokom alebo útočnou schopnosťou, ktorý dopadol:
zablokovaný alebo minutý neurobí nič. Dlhší neduh je ten, ktorý spôsobí tvoja
útočná schopnosť.

### Vylepšenia závislé od tvojho stavu

Vylepšenia závislé od tvojho stavu platia, len kým stav trvá. „Nad“ alebo
„pod polovicou zdravia“ platí striktne: pri presnej polovici neplatí ani jedno.
Keď zvýšené maximum skončí, zdravie alebo energia nad novým maximom sa stratí.

| Vylepšenie                                         | Pozícia, sedí na            | Čo robí                                                |
| -------------------------------------------------- | --------------------------- | ------------------------------------------------------ |
| "Strength and Honor"                               | nápis, bojové               | +15 % poškodenia zbraňou nad polovicou zdravia         |
| "Guided by Fate", "Dance with Death"               | nápis, bojové               | +15 % poškodenia zbraňou, keď si očarovaný, v postoji  |
| "Too Much Information"                             | nápis, bojové               | +15 % poškodenia zbraňou proti nepriateľovi s kliatbou |
| "Vengeance is Mine"                                | nápis, bojové               | +20 % poškodenia zbraňou pod polovicou zdravia         |
| "Don't Fear the Reaper"                            | nápis, bojové               | +20 % poškodenia zbraňou, keď si pod kliatbou          |
| "To the Pain!"                                     | nápis, bojové               | +15 % poškodenia zbraňou; -10 brnenia pri útočení      |
| "Brawn over Brains"                                | nápis, bojové               | +15 % poškodenia zbraňou; -5 energie                   |
| "Hale and Hearty", "Have Faith"                    | nápis, každá zbraň          | +5 energie nad polovicou zdravia, keď si očarovaný     |
| "Don't call it a comeback!", "I am Sorrow."        | nápis, každá zbraň          | +7 energie pod polovicou zdravia, keď si pod kliatbou  |
| of Devotion, of Endurance                          | sufix, staff, shield, focus | +45 zdravia, keď si očarovaný, v postoji               |
| of Valor                                           | sufix, staff, shield, focus | +60 zdravia, keď si pod kliatbou                       |
| "Luck of the Draw"                                 | nápis, shield alebo focus   | 20 % šanca, že fyzický zásah spôsobí o 5 menej         |
| "Sheltered by Faith", "Run For Your Life!"         | nápis, shield alebo focus   | fyzické zásahy o 2 menej, keď si očarovaný, v postoji  |
| "Nothing to Fear"                                  | nápis, shield alebo focus   | fyzické zásahy o 3 menej, keď si pod kliatbou          |
| "Hail to the King", "Faith is My Shield"           | nápis, focus                | +5 brnenia nad polovicou zdravia, keď si očarovaný     |
| "Might makes Right", "Knowing is Half the Battle." | nápis, focus                | +5 brnenia pri útočení, pri zosielaní kúzla            |
| "Man for All Seasons", "Survival of the Fittest"   | nápis, focus                | +5 brnenia proti elementálnemu, fyzickému poškodeniu   |
| "Ignorance is Bliss", "Life is Pain"               | nápis, focus                | +5 brnenia; -5 energie, -20 zdravia                    |
| "Down But Not Out", "Be Just and Fear Not"         | nápis, focus                | +10 brnenia pod polovicou zdravia, keď si pod kliatbou |

Poškodenie zbraňou je vlastný hod zbrane: bonusové poškodenie útočnej
schopnosti sa nezvyšuje.

### Vylepšenia pre zosielateľov

Vylepšenia pre zosielateľov pôsobia len na kúzla, každé s vlastnou šancou pri
použití kúzla. „Atribút predmetu“ je atribút, pre ktorý je palica, prútik alebo
ohnisko vyrobené. Dve polovičné vylepšenia, ktoré nastanú naraz, stále skrátia
na polovicu len raz.

| Vylepšenie                  | Pozícia, sedí na          | Čo robí                                                    |
| --------------------------- | ------------------------- | ---------------------------------------------------------- |
| Adept                       | prefix, staff             | 20 % šanca na polovičné zoslanie kúziel atribútu predmetu  |
| Swift                       | prefix, staff             | 10 % šanca na polovičné zoslanie akéhokoľvek kúzla         |
| of Aptitude                 | sufix, focus              | 20 % šanca na polovičné zoslanie kúziel atribútu predmetu  |
| of Swiftness                | sufix, focus              | 10 % šanca na polovičné zoslanie akéhokoľvek kúzla         |
| "Aptitude not Attitude"     | nápis, staff alebo wand   | 20 % šanca na polovičné zoslanie kúziel atribútu predmetu  |
| "Don't think twice"         | nápis, staff alebo wand   | 10 % šanca na polovičné zoslanie akéhokoľvek kúzla         |
| of Memory                   | sufix, wand               | 20 % šanca na polovičné dobíjanie kúziel atribútu predmetu |
| of Quickening               | sufix, wand               | 10 % šanca na polovičné dobíjanie akéhokoľvek kúzla        |
| "Let the Memory Live Again" | nápis, staff alebo wand   | 10 % šanca na polovičné dobíjanie akéhokoľvek kúzla        |
| "Forget Me Not"             | nápis, focus              | 20 % šanca na polovičné dobíjanie kúziel atribútu predmetu |
| "Serenity Now"              | nápis, focus              | 10 % šanca na polovičné dobíjanie akéhokoľvek kúzla        |
| of Mastery                  | sufix, staff              | 20 % šanca, že atribút predmetu je pre kúzlo +1            |
| "Master of My Domain"       | nápis, shield alebo focus | 20 % šanca, že atribút predmetu je pre kúzlo +1            |
| of Enchanting               | sufix, bojové alebo staff | očarovania, ktoré zošleš, trvajú o 20 % dlhšie             |

## Brnenie

Brnenie tvorí päť kusov: hlava, hruď, ruky, nohy a chodidlá. Každý kus má
dve pozície na vylepšenie:

- **insígnia**, malý bonus navyše na tom kuse: napríklad viac brnenia proti
  fyzickému poškodeniu alebo pri útočení;
- **runa**.

Tvoja **pokrývka hlavy** pridáva +1 k jednému atribútu podľa tvojej voľby.

V editore je brnenie figúra. Klikni na očíslovaný kus na nej alebo na jeho
riadok vedľa, aby si vybral insígniu a runu; každá voľba hovorí, čo na tom
kuse robí. **Použiť insígniu na všetky (5)** dá vybranú insígniu na
každý kus. Figúra ukazuje insígniu a runu každého kusu a
drží zbrane sady, na ktorú sa pozeráš, s ich vylepšeniami.

## Runy

| Runa                                   | Čo dáva                                     |
| -------------------------------------- | ------------------------------------------- |
| Minor attribute rune                   | +1 k atribútu                               |
| Major attribute rune                   | +2 k atribútu, -35 zdravia                  |
| Superior attribute rune                | +3 k atribútu, -75 zdravia                  |
| Vigor                                  | viac zdravia (+30, +41 alebo +50)           |
| Vitae                                  | +10 zdravia                                 |
| Attunement                             | viac energie (+3, +6 alebo +9)              |
| Clarity, Purity, Recovery, Restoration | dva neduhy zmiznú o 20 % skôr               |
| Absorption (Warrior)                   | menej fyzického poškodenia z každého zásahu |

Runu kusu vyberáš na tom istom mieste ako jeho insígniu: klikni na kus
na figúre.

Editor ti všetko spočíta: zdravie, energiu, brnenie a poškodenie, tak ako
ich má tvoja prvá sada zbraní.
`;export{e as default};
//# sourceMappingURL=equipment-DI0fW4JX.js.map