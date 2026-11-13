var e=`# Uitrusting

Het deel **Uitrusting** van de build-editor bevat je wapens en pantser. Sleep
wapens en nevenhanden uit de bibliotheek rechts, of klik er een aan om hem uit
te rusten. Pantser kies je op de figuur, hieronder.

## Wapensets

Je draagt tot **vier wapensets**, elk een wapen en, als het wapen een hand vrij
laat, een nevenhand zoals een Shield of een Focus. Set 1 is die waarmee je
begint; de andere mogen leeg blijven.

Wissel in een match van set met **1 tot 4** (**F1 tot F4** bij de Klassiek-toetsen).
Een wissel wacht tot de cast of zwaai waar je in zit klaar is; bewegen of Esc
wisselt meteen. Er is geen cooldown. Je aanvallen, de skills die een bepaald
wapen nodig hebben en je maximale Energie volgen allemaal de set in je hand.

Een wapen heeft rang 9 in zijn attribuut nodig: daaronder doet het een derde van
zijn schade, en de editor zegt dat in rood. Een Sword is altijd Swordsmanship,
maar een Staff, een Wand, een Shield of een Focus wordt gemaakt voor een
attribuut dat jij kiest: klik op de hand op de figuur (**6** voor het wapen,
**7** voor de nevenhand) en kies er een.

## Wapenmods

Elk wapen en elke nevenhand heeft vakken voor mods: een **voorvoegsel**, een
**achtervoegsel** en een **inscriptie**. Klik op de hand op de figuur, of op de
rij ernaast, om ze te kiezen; elke mod zegt wat hij doet. Een Wand, een Shield en
een Focus nemen geen voorvoegsel; blote handen ook niet. Een mod staat altijd op
zijn beste waarde, en elke wapenset heeft zijn eigen mods, dus van set wisselen
wisselt ook hun mods: maximale Gezondheid en Energie veranderen mee met de set in
je hand. Een wapen wisselen behoudt de mods die er nog op passen en zegt welke
het liet vallen.

| Mod                       | Vak           | Past op                                 | Effect                                |
| ------------------------- | ------------- | --------------------------------------- | ------------------------------------- |
| Defensive                 | Voorvoegsel   | Staff                                   | Pantser +5                            |
| Hale                      | Voorvoegsel   | Staff                                   | +30 Gezondheid                        |
| Insightful                | Voorvoegsel   | Staff                                   | Energie +5                            |
| of Defense                | Achtervoegsel | elk martial wapen, Staff                | Pantser +5                            |
| of Fortitude              | Achtervoegsel | elk martial wapen, Staff, Shield, Focus | +30 Gezondheid                        |
| of Shelter                | Achtervoegsel | elk martial wapen, Staff                | Pantser +7 (tegen fysieke schade)     |
| of Warding                | Achtervoegsel | elk martial wapen, Staff                | Pantser +7 (tegen elementaire schade) |
| "Cast Out the Unclean"    | Inscriptie    | Shield, Focus                           | Verkort Disease op jou met 20%        |
| "Fear Cuts Deeper"        | Inscriptie    | Shield, Focus                           | Verkort Bleeding op jou met 20%       |
| "I Can See Clearly Now"   | Inscriptie    | Shield, Focus                           | Verkort Blinded op jou met 20%        |
| "I have the power!"       | Inscriptie    | elk martial wapen                       | Energie +5                            |
| "Leaf on the Wind"        | Inscriptie    | Shield, Focus                           | Pantser +10 (tegen kouschade)         |
| "Like a Rolling Stone"    | Inscriptie    | Shield, Focus                           | Pantser +10 (tegen aardeschade)       |
| "Live for Today"          | Inscriptie    | Focus                                   | Energie +15, energieregeneratie -1    |
| "Not the face!"           | Inscriptie    | Shield, Focus                           | Pantser +10 (tegen stompe schade)     |
| "Only the Strong Survive" | Inscriptie    | Shield, Focus                           | Verkort Weakness op jou met 20%       |
| "Pure of Heart"           | Inscriptie    | Shield, Focus                           | Verkort Poison op jou met 20%         |
| "Riders on the Storm"     | Inscriptie    | Shield, Focus                           | Pantser +10 (tegen bliksemschade)     |
| "Seize the Day"           | Inscriptie    | Staff, Wand                             | Energie +15, energieregeneratie -1    |
| "Sleep Now in the Fire"   | Inscriptie    | Shield, Focus                           | Pantser +10 (tegen vuurschade)        |
| "Soundness of Mind"       | Inscriptie    | Shield, Focus                           | Verkort Dazed op jou met 20%          |
| "Strength of Body"        | Inscriptie    | Shield, Focus                           | Verkort Deep Wound op jou met 20%     |
| "Swift as the Wind"       | Inscriptie    | Shield, Focus                           | Verkort Crippled op jou met 20%       |
| "The Riddle of Steel"     | Inscriptie    | Shield, Focus                           | Pantser +10 (tegen hakschade)         |
| "Through Thick and Thin"  | Inscriptie    | Shield, Focus                           | Pantser +10 (tegen steekschade)       |

### Martial voorvoegsels bij een treffer

| Voorvoegsel                  | Past op                    | Wat het doet bij een treffer                                               |
| ---------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| Vampiric                     | elk martial wapen          | steelt 3 Gezondheid (5 op Hammer, Scythe, Bows); -1 Gezondheidsregeneratie |
| Zealous                      | elk martial wapen          | geeft 1 Energie; -1 energieregeneratie                                     |
| Sundering                    | elk martial wapen          | 20% kans op +20% pantserpenetratie                                         |
| Furious                      | martial, geen Bows         | 10% kans op dubbele adrenaline                                             |
| Barbed, Crippling, Poisonous | martial, geen Hammer       | Bleeding, Crippled, Poison die jij veroorzaakt, duren 33% langer           |
| Cruel                        | martial, geen Bows         | Deep Wound die jij veroorzaakt, duurt 33% langer                           |
| Heavy                        | Axe, Hammer, Scythe, Spear | Weakness die jij veroorzaakt, duurt 33% langer                             |
| Silencing                    | Daggers, Spear, Bows       | Dazed die jij veroorzaakt, duurt 33% langer                                |
| Ebon, Fiery, Icy, Shocking   | elk martial wapen          | de schade wordt aarde, vuur, kou of bliksem                                |

"Bij een treffer" betekent een geplaatste treffer van een aanval of een
aanvalsskill: een geblokkeerde of gemiste doet niets. Een langere conditie is er
een die je aanvalsskill veroorzaakt.

### Mods die wachten op je toestand

De mods die wachten op je toestand tellen alleen zolang die geldt. "Boven" of
"onder halve Gezondheid" is strikt: op precies de helft telt geen van beide. Als
een verhoogd maximum eindigt, gaat Gezondheid of Energie boven het nieuwe
maximum verloren.

| Mod                                                | Vak, past op                        | Wat het doet                                                    |
| -------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| "Strength and Honor"                               | inscriptie, martial                 | +15% wapenschade boven halve Gezondheid                         |
| "Guided by Fate", "Dance with Death"               | inscriptie, martial                 | +15% wapenschade terwijl betoverd, in een houding               |
| "Too Much Information"                             | inscriptie, martial                 | +15% wapenschade tegen een vervloekte vijand                    |
| "Vengeance is Mine"                                | inscriptie, martial                 | +20% wapenschade onder halve Gezondheid                         |
| "Don't Fear the Reaper"                            | inscriptie, martial                 | +20% wapenschade terwijl vervloekt                              |
| "To the Pain!"                                     | inscriptie, martial                 | +15% wapenschade; -10 pantser tijdens het aanvallen             |
| "Brawn over Brains"                                | inscriptie, martial                 | +15% wapenschade; -5 Energie                                    |
| "Hale and Hearty", "Have Faith"                    | inscriptie, elk wapen               | +5 Energie boven halve Gezondheid, terwijl betoverd             |
| "Don't call it a comeback!", "I am Sorrow."        | inscriptie, elk wapen               | +7 Energie onder halve Gezondheid, terwijl vervloekt            |
| of Devotion, of Endurance                          | achtervoegsel, Staff, Shield, Focus | +45 Gezondheid terwijl betoverd, in een houding                 |
| of Valor                                           | achtervoegsel, Staff, Shield, Focus | +60 Gezondheid terwijl vervloekt                                |
| "Luck of the Draw"                                 | inscriptie, Shield of Focus         | 20% kans dat een fysieke treffer 5 minder doet                  |
| "Sheltered by Faith", "Run For Your Life!"         | inscriptie, Shield of Focus         | fysieke treffers doen 2 minder terwijl betoverd, in een houding |
| "Nothing to Fear"                                  | inscriptie, Shield of Focus         | fysieke treffers doen 3 minder terwijl vervloekt                |
| "Hail to the King", "Faith is My Shield"           | inscriptie, Focus                   | +5 pantser boven halve Gezondheid, terwijl betoverd             |
| "Might makes Right", "Knowing is Half the Battle." | inscriptie, Focus                   | +5 pantser tijdens het aanvallen, tijdens het casten            |
| "Man for All Seasons", "Survival of the Fittest"   | inscriptie, Focus                   | +5 pantser tegen elementaire, fysieke schade                    |
| "Ignorance is Bliss", "Life is Pain"               | inscriptie, Focus                   | +5 pantser; -5 Energie, -20 Gezondheid                          |
| "Down But Not Out", "Be Just and Fear Not"         | inscriptie, Focus                   | +10 pantser onder halve Gezondheid, terwijl vervloekt           |

Wapenschade is de eigen worp van het wapen: de bonusschade van een aanvalsskill
wordt niet verhoogd.

### Caster-mods

De caster-mods werken alleen op spreuken, elk met zijn eigen kans als je er een
gebruikt. "Het attribuut van het item" is het attribuut waarvoor de Staff, Wand
of Focus gemaakt is. Twee halverende mods die allebei slagen, halveren nog steeds
één keer.

| Mod                         | Vak, past op                    | Wat het doet                                                            |
| --------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| Adept                       | voorvoegsel, Staff              | 20% kans om de cast van spreuken van het item-attribuut te halveren     |
| Swift                       | voorvoegsel, Staff              | 10% kans om de cast van elke spreuk te halveren                         |
| of Aptitude                 | achtervoegsel, Focus            | 20% kans om de cast van spreuken van het item-attribuut te halveren     |
| of Swiftness                | achtervoegsel, Focus            | 10% kans om de cast van elke spreuk te halveren                         |
| "Aptitude not Attitude"     | inscriptie, Staff of Wand       | 20% kans om de cast van spreuken van het item-attribuut te halveren     |
| "Don't think twice"         | inscriptie, Staff of Wand       | 10% kans om de cast van elke spreuk te halveren                         |
| of Memory                   | achtervoegsel, Wand             | 20% kans om het opladen van spreuken van het item-attribuut te halveren |
| of Quickening               | achtervoegsel, Wand             | 10% kans om het opladen van elke spreuk te halveren                     |
| "Let the Memory Live Again" | inscriptie, Staff of Wand       | 10% kans om het opladen van elke spreuk te halveren                     |
| "Forget Me Not"             | inscriptie, Focus               | 20% kans om het opladen van spreuken van het item-attribuut te halveren |
| "Serenity Now"              | inscriptie, Focus               | 10% kans om het opladen van elke spreuk te halveren                     |
| of Mastery                  | achtervoegsel, Staff            | 20% kans dat het item-attribuut +1 is voor een spreuk                   |
| "Master of My Domain"       | inscriptie, Shield of Focus     | 20% kans dat het item-attribuut +1 is voor een spreuk                   |
| of Enchanting               | achtervoegsel, martial of Staff | betoveringen die jij cast, duren 20% langer                             |

## Pantser

Pantser bestaat uit vijf stukken: hoofd, borst, handen, benen en voeten. Elk stuk
heeft twee upgradevakken:

- een **insigne**, een beetje extra op dat stuk: meer pantser tegen fysieke
  schade, bijvoorbeeld, of tijdens het aanvallen;
- een **rune**.

Je **hoofddeksel** geeft +1 op één attribuut naar keuze.

In de editor is pantser een figuur. Klik op een genummerd stuk erop, of op de rij
ernaast, om het insigne en de rune te kiezen; elke keuze zegt wat ze op dat stuk
doet. **Insigne op alle 5 toepassen** zet het gekozen insigne op elk stuk. De
figuur toont het insigne en de rune van elk stuk, en houdt de wapens vast van de
set die je bekijkt, met hun mods.

## Runen

| Rune                                   | Wat het geeft                             |
| -------------------------------------- | ----------------------------------------- |
| Minor attribuutrune                    | +1 op een attribuut                       |
| Major attribuutrune                    | +2 op een attribuut, -35 Gezondheid       |
| Superior attribuutrune                 | +3 op een attribuut, -75 Gezondheid       |
| Vigor                                  | meer Gezondheid (+30, +41 of +50)         |
| Vitae                                  | +10 Gezondheid                            |
| Attunement                             | meer Energie (+3, +6 of +9)               |
| Clarity, Purity, Recovery, Restoration | twee condities slijten elk 20% sneller af |
| Absorption (Warrior)                   | minder fysieke schade van elke treffer    |

Je kiest de rune van een stuk op dezelfde plek als het insigne: klik op het stuk
op de figuur.

De editor telt het allemaal voor je op: Gezondheid, Energie, pantser en schade,
zoals je eerste wapenset ze heeft.
`;export{e as default};
//# sourceMappingURL=equipment-D7uFUEwe.js.map