var e=`# Utrustning

Delen **Utrustning** i build-redigeraren innehåller dina vapen och din
rustning. Dra vapen och offhands från biblioteket till höger, eller
klicka på ett för att utrusta det. Rustning väljs på figuren, nedan.

## Vapenset

Du bär upp till **fyra vapenset**, vart och ett ett vapen och, om vapnet
lämnar en hand fri, en offhand som en sköld eller ett fokus. Set 1 är det
du börjar med; de andra får vara tomma.

I en match byter du set med **1 till 4** (**F1 till F4** med de klassiska
tangenterna). Ett byte väntar tills kastningen eller svingen du är mitt i
är klar; att röra dig eller Esc byter direkt. Det finns ingen nedkylning.
Dina attacker, förmågorna som kräver ett visst vapen och din maximala
energi följer alla setet du har i händerna.

Ett vapen kräver rang 9 i sitt attribut: under det träffar det med en
tredjedel av sin skada, och redigeraren säger det i rött. Ett svärd är
alltid Swordsmanship, men en stav, en trollstav, en sköld eller ett fokus
görs för ett attribut du väljer: klicka på dess hand på figuren (**6** för
vapnet, **7** för offhanden) och välj ett.

## Vapenmoddar

Varje vapen och offhand har platser för moddar: ett **prefix**, ett
**suffix** och en **inskription**. Klicka på handen på figuren, eller på
dess rad bredvid, för att välja dem; var och en säger vad den gör. En
trollstav, en sköld och ett fokus tar inget prefix; bara händer tar
inget. En modd har alltid sitt bästa värde, och varje vapenset bär sina
egna, så att byta set byter också deras moddar: maximal hälsa och energi
följer setet i händerna. Att byta ett vapen behåller moddarna som
fortfarande passar och säger vilka det tog bort.

| Modd                      | Plats       | Passar                                 | Effekt                                              |
| ------------------------- | ----------- | -------------------------------------- | --------------------------------------------------- |
| Defensive                 | Prefix      | Staff                                  | Rustning +5                                         |
| Hale                      | Prefix      | Staff                                  | +30 hälsa                                           |
| Insightful                | Prefix      | Staff                                  | Energi +5                                           |
| of Defense                | Suffix      | alla stridsvapen, Staff                | Rustning +5                                         |
| of Fortitude              | Suffix      | alla stridsvapen, Staff, Shield, Focus | +30 hälsa                                           |
| of Shelter                | Suffix      | alla stridsvapen, Staff                | Rustning +7 (mot fysisk skada)                      |
| of Warding                | Suffix      | alla stridsvapen, Staff                | Rustning +7 (mot elementarskada)                    |
| "Cast Out the Unclean"    | Inskription | Shield, Focus                          | Minskar varaktigheten av Disease på dig med 20 %    |
| "Fear Cuts Deeper"        | Inskription | Shield, Focus                          | Minskar varaktigheten av Bleeding på dig med 20 %   |
| "I Can See Clearly Now"   | Inskription | Shield, Focus                          | Minskar varaktigheten av Blinded på dig med 20 %    |
| "I have the power!"       | Inskription | alla stridsvapen                       | Energi +5                                           |
| "Leaf on the Wind"        | Inskription | Shield, Focus                          | Rustning +10 (mot köldskada)                        |
| "Like a Rolling Stone"    | Inskription | Shield, Focus                          | Rustning +10 (mot jordskada)                        |
| "Live for Today"          | Inskription | Focus                                  | Energi +15, energiregenerering -1                   |
| "Not the face!"           | Inskription | Shield, Focus                          | Rustning +10 (mot trubbig skada)                    |
| "Only the Strong Survive" | Inskription | Shield, Focus                          | Minskar varaktigheten av Weakness på dig med 20 %   |
| "Pure of Heart"           | Inskription | Shield, Focus                          | Minskar varaktigheten av Poison på dig med 20 %     |
| "Riders on the Storm"     | Inskription | Shield, Focus                          | Rustning +10 (mot blixtskada)                       |
| "Seize the Day"           | Inskription | Staff, Wand                            | Energi +15, energiregenerering -1                   |
| "Sleep Now in the Fire"   | Inskription | Shield, Focus                          | Rustning +10 (mot eldskada)                         |
| "Soundness of Mind"       | Inskription | Shield, Focus                          | Minskar varaktigheten av Dazed på dig med 20 %      |
| "Strength of Body"        | Inskription | Shield, Focus                          | Minskar varaktigheten av Deep Wound på dig med 20 % |
| "Swift as the Wind"       | Inskription | Shield, Focus                          | Minskar varaktigheten av Crippled på dig med 20 %   |
| "The Riddle of Steel"     | Inskription | Shield, Focus                          | Rustning +10 (mot huggskada)                        |
| "Through Thick and Thin"  | Inskription | Shield, Focus                          | Rustning +10 (mot stickskada)                       |

### Stridsprefix vid träff

| Prefix                       | Passar                   | Vad det gör vid en träff                                        |
| ---------------------------- | ------------------------ | --------------------------------------------------------------- |
| Vampiric                     | alla stridsvapen         | stjäl 3 hälsa (5 med hammare, lie, bågar); -1 hälsoregenerering |
| Zealous                      | alla stridsvapen         | ger 1 energi; -1 energiregenerering                             |
| Sundering                    | alla stridsvapen         | 20 % chans till +20 % rustningsgenomträngning                   |
| Furious                      | strid, inte bågar        | 10 % chans till dubbelt adrenalin                               |
| Barbed, Crippling, Poisonous | strid, inte hammare      | Bleeding, Crippled, Poison som du orsakar varar 33 % längre     |
| Cruel                        | strid, inte bågar        | Deep Wound som du orsakar varar 33 % längre                     |
| Heavy                        | yxa, hammare, lie, spjut | Weakness som du orsakar varar 33 % längre                       |
| Silencing                    | dolkar, spjut, bågar     | Dazed som du orsakar varar 33 % längre                          |
| Ebon, Fiery, Icy, Shocking   | alla stridsvapen         | dess skada blir jord, eld, köld eller blixt                     |

"Vid en träff" betyder en landad träff från en attack eller en
attackförmåga: en blockerad eller missad gör ingenting. En längre åkomma
är en som din attackförmåga orsakar.

### Moddar som beror på ditt tillstånd

Moddarna som beror på ditt tillstånd räknas bara medan det gäller. "Över"
eller "under halv hälsa" gäller strikt: vid exakt hälften räknas ingen
av dem. När ett höjt maximum tar slut förloras hälsa eller energi över
det nya maximumet.

| Modd                                               | Plats, passar                  | Vad den gör                                                       |
| -------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| "Strength and Honor"                               | inskription, strid             | +15 % vapenskada över halv hälsa                                  |
| "Guided by Fate", "Dance with Death"               | inskription, strid             | +15 % vapenskada när du är förtrollad, i en ställning             |
| "Too Much Information"                             | inskription, strid             | +15 % vapenskada mot en förbannad fiende                          |
| "Vengeance is Mine"                                | inskription, strid             | +20 % vapenskada under halv hälsa                                 |
| "Don't Fear the Reaper"                            | inskription, strid             | +20 % vapenskada när du är förbannad                              |
| "To the Pain!"                                     | inskription, strid             | +15 % vapenskada; -10 rustning när du attackerar                  |
| "Brawn over Brains"                                | inskription, strid             | +15 % vapenskada; -5 energi                                       |
| "Hale and Hearty", "Have Faith"                    | inskription, alla vapen        | +5 energi över halv hälsa, när du är förtrollad                   |
| "Don't call it a comeback!", "I am Sorrow."        | inskription, alla vapen        | +7 energi under halv hälsa, när du är förbannad                   |
| of Devotion, of Endurance                          | suffix, stav, sköld, fokus     | +45 hälsa när du är förtrollad, i en ställning                    |
| of Valor                                           | suffix, stav, sköld, fokus     | +60 hälsa när du är förbannad                                     |
| "Luck of the Draw"                                 | inskription, sköld eller fokus | 20 % chans att en fysisk träff gör 5 mindre                       |
| "Sheltered by Faith", "Run For Your Life!"         | inskription, sköld eller fokus | fysiska träffar gör 2 mindre när du är förtrollad, i en ställning |
| "Nothing to Fear"                                  | inskription, sköld eller fokus | fysiska träffar gör 3 mindre när du är förbannad                  |
| "Hail to the King", "Faith is My Shield"           | inskription, fokus             | +5 rustning över halv hälsa, när du är förtrollad                 |
| "Might makes Right", "Knowing is Half the Battle." | inskription, fokus             | +5 rustning när du attackerar, när du kastar en besvärjelse       |
| "Man for All Seasons", "Survival of the Fittest"   | inskription, fokus             | +5 rustning mot elementarskada, fysisk skada                      |
| "Ignorance is Bliss", "Life is Pain"               | inskription, fokus             | +5 rustning; -5 energi, -20 hälsa                                 |
| "Down But Not Out", "Be Just and Fear Not"         | inskription, fokus             | +10 rustning under halv hälsa, när du är förbannad                |

Vapenskada är vapnets eget slag: en attackförmågas bonusskada höjs inte.

### Besvärjarmoddar

Besvärjarmoddarna verkar bara på besvärjelser, var och en med sin egen
chans när du använder en. "Föremålets attribut" är attributet som
staven, trollstaven eller fokuset är gjort för. Två halverande moddar som
båda slår in halverar ändå bara en gång.

| Modd                        | Plats, passar                     | Vad den gör                                                                  |
| --------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Adept                       | prefix, stav                      | 20 % chans att halvera kasttiden för besvärjelser i föremålets attribut      |
| Swift                       | prefix, stav                      | 10 % chans att halvera kasttiden för vilken besvärjelse som helst            |
| of Aptitude                 | suffix, fokus                     | 20 % chans att halvera kasttiden för besvärjelser i föremålets attribut      |
| of Swiftness                | suffix, fokus                     | 10 % chans att halvera kasttiden för vilken besvärjelse som helst            |
| "Aptitude not Attitude"     | inskription, stav eller trollstav | 20 % chans att halvera kasttiden för besvärjelser i föremålets attribut      |
| "Don't think twice"         | inskription, stav eller trollstav | 10 % chans att halvera kasttiden för vilken besvärjelse som helst            |
| of Memory                   | suffix, trollstav                 | 20 % chans att halvera återladdningen för besvärjelser i föremålets attribut |
| of Quickening               | suffix, trollstav                 | 10 % chans att halvera återladdningen för vilken besvärjelse som helst       |
| "Let the Memory Live Again" | inskription, stav eller trollstav | 10 % chans att halvera återladdningen för vilken besvärjelse som helst       |
| "Forget Me Not"             | inskription, fokus                | 20 % chans att halvera återladdningen för besvärjelser i föremålets attribut |
| "Serenity Now"              | inskription, fokus                | 10 % chans att halvera återladdningen för vilken besvärjelse som helst       |
| of Mastery                  | suffix, stav                      | 20 % chans att föremålets attribut är +1 för en besvärjelse                  |
| "Master of My Domain"       | inskription, sköld eller fokus    | 20 % chans att föremålets attribut är +1 för en besvärjelse                  |
| of Enchanting               | suffix, strid eller stav          | förtrollningar du kastar varar 20 % längre                                   |

## Rustning

Rustning är fem delar: huvud, bröst, händer, ben och fötter. Varje del
har två uppgraderingsplatser:

- en **insignia**, lite extra på den delen: mer rustning mot fysisk
  skada, till exempel, eller när du attackerar;
- en **runa**.

Din **huvudbonad** ger +1 till ett attribut du väljer.

I redigeraren är rustningen en figur. Klicka på en numrerad del på den,
eller på dess rad bredvid, för att välja dess insignia och runa; varje val
säger vad det gör på den delen. **Lägg insignia på alla 5** lägger den du
valde på varje del. Figuren visar varje dels insignia och runa, och
håller vapnen i setet du tittar på, med deras moddar.

## Runor

| Runa                                   | Vad den ger                                |
| -------------------------------------- | ------------------------------------------ |
| Mindre attributruna                    | +1 till ett attribut                       |
| Större attributruna                    | +2 till ett attribut, -35 hälsa            |
| Överlägsen attributruna                | +3 till ett attribut, -75 hälsa            |
| Vigor                                  | mer hälsa (+30, +41 eller +50)             |
| Vitae                                  | +10 hälsa                                  |
| Attunement                             | mer energi (+3, +6 eller +9)               |
| Clarity, Purity, Recovery, Restoration | två åkommor var som går över 20 % snabbare |
| Absorption (Warrior)                   | mindre fysisk skada från varje träff       |

Du väljer en dels runa på samma ställe som dess insignia: klicka på delen
på figuren.

Redigeraren räknar ihop allt åt dig: hälsa, energi, rustning och skada,
så som ditt första vapenset har dem.
`;export{e as default};
//# sourceMappingURL=equipment-DYhKnYUP.js.map