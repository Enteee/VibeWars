var e=`# Udstyr

Delen **Udstyr** i build-editoren rummer dine våben og din rustning. Træk
våben og sekundærhænder fra biblioteket til højre, eller klik på et for at
tage det på. Rustning vælges på figuren nedenfor.

## Våbensæt

Du har op til **fire våbensæt** med, hvert et våben og, hvis våbnet
efterlader en hånd fri, en sekundærhånd såsom et skjold eller et fokus.
Sæt 1 er det, du starter med; de andre må gerne være tomme.

I en kamp skifter du sæt med **1 til 4** (**F1 til F4** med de klassiske
taster). Et skift venter på, at det kast eller sving, du er i gang med,
bliver færdigt; at bevæge sig eller Esc skifter med det samme. Der er
ingen nedkøling. Dine angreb, de evner, der kræver et bestemt våben, og
din maksimale energi følger alle det sæt, du har i hånden.

Et våben kræver rang 9 i sin attribut: under det rammer det med en
tredjedel af sin skade, og editoren siger det med rødt. Et sværd er altid
Swordsmanship, men en stav, en tryllestav, et skjold eller et fokus laves
til en attribut, du vælger: klik på dens hånd på figuren (**6** for
våbnet, **7** for sekundærhånden), og vælg en.

## Våbenmods

Hvert våben og hver sekundærhånd har pladser til mods: et **præfiks**, et
**suffiks** og en **inskription**. Klik på hånden på figuren, eller dens
række ved siden af, for at vælge dem; hver siger, hvad den gør. En
tryllestav, et skjold og et fokus tager intet præfiks; bare hænder tager
ingen. En mod har altid sin bedste værdi, og hvert våbensæt har sine
egne, så skifter du sæt, skifter du også deres mods: maksimalt liv og
maksimal energi følger det sæt, du har i hånden. Skifter du et våben,
beholdes de mods, der stadig passer til det, og du får at vide, hvilke
der faldt fra.

| Mod                       | Plads       | Passer til                              | Effekt                                            |
| ------------------------- | ----------- | --------------------------------------- | ------------------------------------------------- |
| Defensive                 | Præfiks     | Staff                                   | Rustning +5                                       |
| Hale                      | Præfiks     | Staff                                   | +30 liv                                           |
| Insightful                | Præfiks     | Staff                                   | Energi +5                                         |
| of Defense                | Suffiks     | ethvert kampvåben, Staff                | Rustning +5                                       |
| of Fortitude              | Suffiks     | ethvert kampvåben, Staff, Shield, Focus | +30 liv                                           |
| of Shelter                | Suffiks     | ethvert kampvåben, Staff                | Rustning +7 (mod fysisk skade)                    |
| of Warding                | Suffiks     | ethvert kampvåben, Staff                | Rustning +7 (mod elementarskade)                  |
| "Cast Out the Unclean"    | Inskription | Shield, Focus                           | Mindsker varigheden af Disease på dig med 20 %    |
| "Fear Cuts Deeper"        | Inskription | Shield, Focus                           | Mindsker varigheden af Bleeding på dig med 20 %   |
| "I Can See Clearly Now"   | Inskription | Shield, Focus                           | Mindsker varigheden af Blinded på dig med 20 %    |
| "I have the power!"       | Inskription | ethvert kampvåben                       | Energi +5                                         |
| "Leaf on the Wind"        | Inskription | Shield, Focus                           | Rustning +10 (mod kuldeskade)                     |
| "Like a Rolling Stone"    | Inskription | Shield, Focus                           | Rustning +10 (mod jordskade)                      |
| "Live for Today"          | Inskription | Focus                                   | Energi +15, energiregeneration -1                 |
| "Not the face!"           | Inskription | Shield, Focus                           | Rustning +10 (mod stumpskade)                     |
| "Only the Strong Survive" | Inskription | Shield, Focus                           | Mindsker varigheden af Weakness på dig med 20 %   |
| "Pure of Heart"           | Inskription | Shield, Focus                           | Mindsker varigheden af Poison på dig med 20 %     |
| "Riders on the Storm"     | Inskription | Shield, Focus                           | Rustning +10 (mod lynskade)                       |
| "Seize the Day"           | Inskription | Staff, Wand                             | Energi +15, energiregeneration -1                 |
| "Sleep Now in the Fire"   | Inskription | Shield, Focus                           | Rustning +10 (mod ildskade)                       |
| "Soundness of Mind"       | Inskription | Shield, Focus                           | Mindsker varigheden af Dazed på dig med 20 %      |
| "Strength of Body"        | Inskription | Shield, Focus                           | Mindsker varigheden af Deep Wound på dig med 20 % |
| "Swift as the Wind"       | Inskription | Shield, Focus                           | Mindsker varigheden af Crippled på dig med 20 %   |
| "The Riddle of Steel"     | Inskription | Shield, Focus                           | Rustning +10 (mod hugskade)                       |
| "Through Thick and Thin"  | Inskription | Shield, Focus                           | Rustning +10 (mod stikskade)                      |

### Kampvåbnenes præfikser ved et træf

| Præfiks                      | Passer til             | Hvad det gør ved et træf                                   |
| ---------------------------- | ---------------------- | ---------------------------------------------------------- |
| Vampiric                     | ethvert kampvåben      | stjæler 3 liv (5 med hammer, le, buer); -1 livregeneration |
| Zealous                      | ethvert kampvåben      | giver 1 energi; -1 energiregeneration                      |
| Sundering                    | ethvert kampvåben      | 20 % chance for +20 % rustningsgennemtrængning             |
| Furious                      | kampvåben, ikke buer   | 10 % chance for dobbelt adrenalin                          |
| Barbed, Crippling, Poisonous | kampvåben, ikke hammer | Bleeding, Crippled, Poison, du giver, varer 33 % længere   |
| Cruel                        | kampvåben, ikke buer   | Deep Wound, du giver, varer 33 % længere                   |
| Heavy                        | økse, hammer, le, spyd | Weakness, du giver, varer 33 % længere                     |
| Silencing                    | dolke, spyd, buer      | Dazed, du giver, varer 33 % længere                        |
| Ebon, Fiery, Icy, Shocking   | ethvert kampvåben      | dets skade bliver til jord-, ild-, kulde- eller lynskade   |

"Ved et træf" betyder et træf, der lander, fra et angreb eller en
angrebsevne: et blokeret eller misset gør ingenting. En længere tilstand
er en, som din angrebsevne giver.

### Mods, der afhænger af din tilstand

De mods, der afhænger af din tilstand, tæller kun, mens den holder. "Over"
eller "under halvt liv" skal forstås strengt: ved præcis halvdelen tæller
ingen af dem. Når et hævet maksimum slutter, mistes liv eller energi over
det nye maksimum.

| Mod                                                | Plads, passer til               | Hvad den gør                                                          |
| -------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| "Strength and Honor"                               | inskription, kampvåben          | +15 % våbenskade over halvt liv                                       |
| "Guided by Fate", "Dance with Death"               | inskription, kampvåben          | +15 % våbenskade, mens du er fortryllet, i en kampstilling            |
| "Too Much Information"                             | inskription, kampvåben          | +15 % våbenskade mod en forbandet fjende                              |
| "Vengeance is Mine"                                | inskription, kampvåben          | +20 % våbenskade under halvt liv                                      |
| "Don't Fear the Reaper"                            | inskription, kampvåben          | +20 % våbenskade, mens du er forbandet                                |
| "To the Pain!"                                     | inskription, kampvåben          | +15 % våbenskade; -10 rustning, mens du angriber                      |
| "Brawn over Brains"                                | inskription, kampvåben          | +15 % våbenskade; -5 energi                                           |
| "Hale and Hearty", "Have Faith"                    | inskription, ethvert våben      | +5 energi over halvt liv, mens du er fortryllet                       |
| "Don't call it a comeback!", "I am Sorrow."        | inskription, ethvert våben      | +7 energi under halvt liv, mens du er forbandet                       |
| of Devotion, of Endurance                          | suffiks, stav, skjold, fokus    | +45 liv, mens du er fortryllet, i en kampstilling                     |
| of Valor                                           | suffiks, stav, skjold, fokus    | +60 liv, mens du er forbandet                                         |
| "Luck of the Draw"                                 | inskription, skjold eller fokus | 20 % chance for, at et fysisk træf giver 5 mindre                     |
| "Sheltered by Faith", "Run For Your Life!"         | inskription, skjold eller fokus | fysiske træf giver 2 mindre, mens du er fortryllet, i en kampstilling |
| "Nothing to Fear"                                  | inskription, skjold eller fokus | fysiske træf giver 3 mindre, mens du er forbandet                     |
| "Hail to the King", "Faith is My Shield"           | inskription, fokus              | +5 rustning over halvt liv, mens du er fortryllet                     |
| "Might makes Right", "Knowing is Half the Battle." | inskription, fokus              | +5 rustning, mens du angriber, mens du kaster en besværgelse          |
| "Man for All Seasons", "Survival of the Fittest"   | inskription, fokus              | +5 rustning mod elementarskade, fysisk skade                          |
| "Ignorance is Bliss", "Life is Pain"               | inskription, fokus              | +5 rustning; -5 energi, -20 liv                                       |
| "Down But Not Out", "Be Just and Fear Not"         | inskription, fokus              | +10 rustning under halvt liv, mens du er forbandet                    |

Våbenskade er våbnets eget slag: en angrebsevnes bonusskade hæves ikke.

### Besværgermods

Besværgermods virker kun på besværgelser, hver med sin egen chance, når
du bruger en. "Genstandens attribut" er den attribut, staven,
tryllestaven eller fokusset er lavet til. To halverende mods, der begge
slår til, halverer stadig kun én gang.

| Mod                         | Plads, passer til                  | Hvad den gør                                                                     |
| --------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| Adept                       | præfiks, stav                      | 20 % chance for at halvere kastet af besværgelser i genstandens attribut         |
| Swift                       | præfiks, stav                      | 10 % chance for at halvere kastet af enhver besværgelse                          |
| of Aptitude                 | suffiks, fokus                     | 20 % chance for at halvere kastet af besværgelser i genstandens attribut         |
| of Swiftness                | suffiks, fokus                     | 10 % chance for at halvere kastet af enhver besværgelse                          |
| "Aptitude not Attitude"     | inskription, stav eller tryllestav | 20 % chance for at halvere kastet af besværgelser i genstandens attribut         |
| "Don't think twice"         | inskription, stav eller tryllestav | 10 % chance for at halvere kastet af enhver besværgelse                          |
| of Memory                   | suffiks, tryllestav                | 20 % chance for at halvere genopladningen af besværgelser i genstandens attribut |
| of Quickening               | suffiks, tryllestav                | 10 % chance for at halvere genopladningen af enhver besværgelse                  |
| "Let the Memory Live Again" | inskription, stav eller tryllestav | 10 % chance for at halvere genopladningen af enhver besværgelse                  |
| "Forget Me Not"             | inskription, fokus                 | 20 % chance for at halvere genopladningen af besværgelser i genstandens attribut |
| "Serenity Now"              | inskription, fokus                 | 10 % chance for at halvere genopladningen af enhver besværgelse                  |
| of Mastery                  | suffiks, stav                      | 20 % chance for, at genstandens attribut er +1 for en besværgelse                |
| "Master of My Domain"       | inskription, skjold eller fokus    | 20 % chance for, at genstandens attribut er +1 for en besværgelse                |
| of Enchanting               | suffiks, kampvåben eller stav      | fortryllelser, du kaster, varer 20 % længere                                     |

## Rustning

Rustning består af fem dele: hoved, bryst, hænder, ben og fødder. Hver
del har to opgraderingspladser:

- en **insignie**, lidt ekstra på den del: mere rustning mod fysisk
  skade, for eksempel, eller mens du angriber;
- en **rune**.

Din **hjelm** giver +1 til én attribut, du vælger.

I editoren er rustningen en figur. Klik på en nummereret del på den,
eller dens række ved siden af, for at vælge dens insignie og rune; hvert
valg siger, hvad det gør på den del. **Brug insignie på alle 5** lægger
den, du valgte, på hver del. Figuren viser hver dels insignie og rune og
holder våbnene fra det sæt, du ser på, med deres mods.

## Runer

| Rune                                   | Hvad den giver                                |
| -------------------------------------- | --------------------------------------------- |
| Mindre attributrune                    | +1 til en attribut                            |
| Større attributrune                    | +2 til en attribut, -35 liv                   |
| Overlegen attributrune                 | +3 til en attribut, -75 liv                   |
| Vigor                                  | mere liv (+30, +41 eller +50)                 |
| Vitae                                  | +10 liv                                       |
| Attunement                             | mere energi (+3, +6 eller +9)                 |
| Clarity, Purity, Recovery, Restoration | to tilstande hver fortager sig 20 % hurtigere |
| Absorption (Warrior)                   | mindre fysisk skade fra hvert træf            |

Du vælger en dels rune samme sted som dens insignie: klik på delen på
figuren.

Editoren lægger det hele sammen for dig: liv, energi, rustning og skade,
som dit første våbensæt har dem.
`;export{e as default};
//# sourceMappingURL=equipment-BR727ZAz.js.map