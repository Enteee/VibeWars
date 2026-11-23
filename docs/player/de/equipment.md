# Ausrüstung

Der Bereich **Ausrüstung** im Build-Editor enthält deine Waffen und Rüstung. Zieh
Waffen und Zweithände aus der Bibliothek rechts herüber oder klick auf eine, um sie
anzulegen. Rüstung wählst du an der Figur, siehe unten.

## Waffensets

Du trägst bis zu **vier Waffensets**, jedes aus einer Waffe und, wenn die Waffe eine
Hand frei lässt, einer Zweithand wie einem ![Shield](../../../apps/web/public/icons/offhand/shield.svg) **Shield** oder einem ![Focus](../../../apps/web/public/icons/offhand/focus.svg) **Focus**. Mit Set 1 startest
du; die anderen dürfen leer bleiben.

Im Match wechselst du die Sets mit **1 bis 4** (**F1 bis F4** bei den Klassisch-Tasten).
Ein Wechsel wartet, bis das Wirken oder der Schlag, in dem du gerade bist, fertig ist;
Laufen oder Esc wechselt sofort. Es gibt keine Abklingzeit. Deine Angriffe, die Skills,
die eine bestimmte Waffe brauchen, und deine maximale Energie folgen dem Set in der Hand.

Eine Waffe braucht Rang 9 in ihrem Attribut: Darunter macht sie nur ein Drittel ihres
Schadens, und der Editor sagt das in Rot. Ein ![Sword](../../../apps/web/public/icons/weapon/sword.svg) **Sword** ist immer Swordsmanship, aber ein
![Staff](../../../apps/web/public/icons/weapon/staff.svg) **Staff**, ein ![Wand](../../../apps/web/public/icons/weapon/wand.svg) **Wand**, ein Shield oder ein Focus ist für ein Attribut gemacht, das du wählst:
Klick auf seine Hand an der Figur (**6** für die Waffe, **7** für die Zweithand) und such
eines aus.

## Waffen-Mods

Jede Waffe und jede Zweithand hat Plätze für Mods: ein **Präfix**, ein **Suffix** und eine
**Inschrift**. Klick auf die Hand an der Figur oder ihre Zeile daneben, um sie zu wählen;
jede sagt, was sie tut. Ein ![Wand](../../../apps/web/public/icons/weapon/wand.svg) **Wand**, ein ![Shield](../../../apps/web/public/icons/offhand/shield.svg) **Shield** und ein ![Focus](../../../apps/web/public/icons/offhand/focus.svg) **Focus** nehmen kein Präfix; bloße Hände
gar keines. Ein Mod hat immer seinen besten Wert, und jedes Waffenset trägt seine eigenen,
ein Set-Wechsel tauscht also auch die Mods: Maximales Leben und maximale Energie folgen dem
Set in der Hand. Beim Wechsel einer Waffe bleiben die Mods, die noch passen, und du erfährst,
welche weggefallen sind.

| Mod                       | Platz     | Passt auf                                                           | Wirkung                                                                                                         |
| ------------------------- | --------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Defensive                 | Präfix    | ![Staff](../../../apps/web/public/icons/weapon/staff.svg) **Staff** | Rüstung +5                                                                                                      |
| Hale                      | Präfix    | Staff                                                               | +30 Leben                                                                                                       |
| Insightful                | Präfix    | Staff                                                               | Energie +5                                                                                                      |
| of Defense                | Suffix    | jede Kampfwaffe, Staff                                              | Rüstung +5                                                                                                      |
| of Fortitude              | Suffix    | jede Kampfwaffe, Staff, Shield, Focus                               | +30 Leben                                                                                                       |
| of Shelter                | Suffix    | jede Kampfwaffe, Staff                                              | Rüstung +7 (gegen physischen Schaden)                                                                           |
| of Warding                | Suffix    | jede Kampfwaffe, Staff                                              | Rüstung +7 (gegen Elementarschaden)                                                                             |
| "Cast Out the Unclean"    | Inschrift | Shield, Focus                                                       | ![Krankheit](../../../apps/web/public/icons/status/disease.svg) **Krankheit** auf dir dauert 20 % kürzer        |
| "Fear Cuts Deeper"        | Inschrift | Shield, Focus                                                       | ![Blutung](../../../apps/web/public/icons/status/bleeding.svg) **Blutung** auf dir dauert 20 % kürzer           |
| "I Can See Clearly Now"   | Inschrift | Shield, Focus                                                       | ![Blindheit](../../../apps/web/public/icons/status/blind.svg) **Blindheit** auf dir dauert 20 % kürzer          |
| "I have the power!"       | Inschrift | jede Kampfwaffe                                                     | Energie +5                                                                                                      |
| "Leaf on the Wind"        | Inschrift | Shield, Focus                                                       | Rüstung +10 (gegen Kälteschaden)                                                                                |
| "Like a Rolling Stone"    | Inschrift | Shield, Focus                                                       | Rüstung +10 (gegen Erdschaden)                                                                                  |
| "Live for Today"          | Inschrift | Focus                                                               | Energie +15, Energieregeneration -1                                                                             |
| "Not the face!"           | Inschrift | Shield, Focus                                                       | Rüstung +10 (gegen stumpfen Schaden)                                                                            |
| "Only the Strong Survive" | Inschrift | Shield, Focus                                                       | ![Schwäche](../../../apps/web/public/icons/status/weakness.svg) **Schwäche** auf dir dauert 20 % kürzer         |
| "Pure of Heart"           | Inschrift | Shield, Focus                                                       | ![Vergiftung](../../../apps/web/public/icons/status/poison.svg) **Vergiftung** auf dir dauert 20 % kürzer       |
| "Riders on the Storm"     | Inschrift | Shield, Focus                                                       | Rüstung +10 (gegen Blitzschaden)                                                                                |
| "Seize the Day"           | Inschrift | Staff, Wand                                                         | Energie +15, Energieregeneration -1                                                                             |
| "Sleep Now in the Fire"   | Inschrift | Shield, Focus                                                       | Rüstung +10 (gegen Feuerschaden)                                                                                |
| "Soundness of Mind"       | Inschrift | Shield, Focus                                                       | ![Benommen](../../../apps/web/public/icons/status/dazed.svg) **Benommen** auf dir dauert 20 % kürzer            |
| "Strength of Body"        | Inschrift | Shield, Focus                                                       | ![Tiefe Wunde](../../../apps/web/public/icons/status/deep-wound.svg) **Tiefe Wunde** auf dir dauert 20 % kürzer |
| "Swift as the Wind"       | Inschrift | Shield, Focus                                                       | ![Verkrüppelt](../../../apps/web/public/icons/status/crippled.svg) **Verkrüppelt** auf dir dauert 20 % kürzer   |
| "The Riddle of Steel"     | Inschrift | Shield, Focus                                                       | Rüstung +10 (gegen Schnittschaden)                                                                              |
| "Through Thick and Thin"  | Inschrift | Shield, Focus                                                       | Rüstung +10 (gegen Stichschaden)                                                                                |

### Kampf-Präfixe bei einem Treffer

| Präfix                       | Passt auf                  | Was es bei einem Treffer tut                                            |
| ---------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| Vampiric                     | jede Kampfwaffe            | raubt 3 Leben (5 bei Hammer, Scythe, Bows); -1 Lebensregeneration       |
| Zealous                      | jede Kampfwaffe            | bringt 1 Energie; -1 Energieregeneration                                |
| Sundering                    | jede Kampfwaffe            | 20 % Chance auf +20 % Rüstungsdurchdringung                             |
| Furious                      | Kampfwaffen außer Bows     | 10 % Chance auf doppeltes Adrenalin                                     |
| Barbed, Crippling, Poisonous | Kampfwaffen außer Hammer   | von dir verursachte Blutung, Verkrüppelt, Vergiftung halten 33 % länger |
| Cruel                        | Kampfwaffen außer Bows     | von dir verursachte Tiefe Wunde hält 33 % länger                        |
| Heavy                        | Axe, Hammer, Scythe, Spear | von dir verursachte Schwäche hält 33 % länger                           |
| Silencing                    | Daggers, Spear, Bows       | von dir verursachtes Benommen hält 33 % länger                          |
| Ebon, Fiery, Icy, Shocking   | jede Kampfwaffe            | ihr Schaden wird zu Erd-, Feuer-, Kälte- oder Blitzschaden              |

„Bei einem Treffer“ meint einen gelandeten Treffer eines Angriffs oder Angriffs-Skills:
Ein geblockter oder verfehlter tut nichts. Ein verlängerter Zustand ist einer, den dein
Angriffs-Skill verursacht.

### Mods, die von deinem Zustand abhängen

Die Mods, die von deinem Zustand abhängen, zählen nur, solange er besteht. „Über“ oder
„unter halbem Leben“ ist streng gemeint: Bei genau der Hälfte zählt keines von beiden.
Endet ein erhöhtes Maximum, gehen Leben oder Energie über dem neuen Maximum verloren.

| Mod                                                | Platz, passt auf             | Was er tut                                                              |
| -------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| "Strength and Honor"                               | Inschrift, Kampf             | +15 % Waffenschaden über halbem Leben                                   |
| "Guided by Fate", "Dance with Death"               | Inschrift, Kampf             | +15 % Waffenschaden solange verzaubert, in einer Haltung                |
| "Too Much Information"                             | Inschrift, Kampf             | +15 % Waffenschaden gegen einen verhexten Gegner                        |
| "Vengeance is Mine"                                | Inschrift, Kampf             | +20 % Waffenschaden unter halbem Leben                                  |
| "Don't Fear the Reaper"                            | Inschrift, Kampf             | +20 % Waffenschaden solange verhext                                     |
| "To the Pain!"                                     | Inschrift, Kampf             | +15 % Waffenschaden; -10 Rüstung beim Angreifen                         |
| "Brawn over Brains"                                | Inschrift, Kampf             | +15 % Waffenschaden; -5 Energie                                         |
| "Hale and Hearty", "Have Faith"                    | Inschrift, jede Waffe        | +5 Energie über halbem Leben, solange verzaubert                        |
| "Don't call it a comeback!", "I am Sorrow."        | Inschrift, jede Waffe        | +7 Energie unter halbem Leben, solange verhext                          |
| of Devotion, of Endurance                          | Suffix, Staff, Shield, Focus | +45 Leben solange verzaubert, in einer Haltung                          |
| of Valor                                           | Suffix, Staff, Shield, Focus | +60 Leben solange verhext                                               |
| "Luck of the Draw"                                 | Inschrift, Shield oder Focus | 20 % Chance, dass ein physischer Treffer 5 weniger macht                |
| "Sheltered by Faith", "Run For Your Life!"         | Inschrift, Shield oder Focus | physische Treffer machen 2 weniger solange verzaubert, in einer Haltung |
| "Nothing to Fear"                                  | Inschrift, Shield oder Focus | physische Treffer machen 3 weniger solange verhext                      |
| "Hail to the King", "Faith is My Shield"           | Inschrift, Focus             | +5 Rüstung über halbem Leben, solange verzaubert                        |
| "Might makes Right", "Knowing is Half the Battle." | Inschrift, Focus             | +5 Rüstung beim Angreifen, beim Wirken eines Zaubers                    |
| "Man for All Seasons", "Survival of the Fittest"   | Inschrift, Focus             | +5 Rüstung gegen Elementar-, physischen Schaden                         |
| "Ignorance is Bliss", "Life is Pain"               | Inschrift, Focus             | +5 Rüstung; -5 Energie, -20 Leben                                       |
| "Down But Not Out", "Be Just and Fear Not"         | Inschrift, Focus             | +10 Rüstung unter halbem Leben, solange verhext                         |

Waffenschaden ist der eigene Wurf der Waffe: Der Bonusschaden eines Angriffs-Skills wird
nicht erhöht.

### Zauberwirker-Mods

Die Zauberwirker-Mods wirken nur auf Zauber, jeder mit seiner eigenen Chance, wenn du einen
nutzt. „Das Attribut des Gegenstands“ ist das Attribut, für das Staff, Wand oder Focus
gemacht ist. Zwei halbierende Mods, die gleichzeitig auslösen, halbieren trotzdem nur einmal.

| Mod                         | Platz, passt auf             | Was er tut                                                                    |
| --------------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| Adept                       | Präfix, Staff                | 20 % Chance, das Wirken von Zaubern des Gegenstands-Attributs zu halbieren    |
| Swift                       | Präfix, Staff                | 10 % Chance, das Wirken eines beliebigen Zaubers zu halbieren                 |
| of Aptitude                 | Suffix, Focus                | 20 % Chance, das Wirken von Zaubern des Gegenstands-Attributs zu halbieren    |
| of Swiftness                | Suffix, Focus                | 10 % Chance, das Wirken eines beliebigen Zaubers zu halbieren                 |
| "Aptitude not Attitude"     | Inschrift, Staff oder Wand   | 20 % Chance, das Wirken von Zaubern des Gegenstands-Attributs zu halbieren    |
| "Don't think twice"         | Inschrift, Staff oder Wand   | 10 % Chance, das Wirken eines beliebigen Zaubers zu halbieren                 |
| of Memory                   | Suffix, Wand                 | 20 % Chance, die Aufladung von Zaubern des Gegenstands-Attributs zu halbieren |
| of Quickening               | Suffix, Wand                 | 10 % Chance, die Aufladung eines beliebigen Zaubers zu halbieren              |
| "Let the Memory Live Again" | Inschrift, Staff oder Wand   | 10 % Chance, die Aufladung eines beliebigen Zaubers zu halbieren              |
| "Forget Me Not"             | Inschrift, Focus             | 20 % Chance, die Aufladung von Zaubern des Gegenstands-Attributs zu halbieren |
| "Serenity Now"              | Inschrift, Focus             | 10 % Chance, die Aufladung eines beliebigen Zaubers zu halbieren              |
| of Mastery                  | Suffix, Staff                | 20 % Chance, dass das Attribut des Gegenstands für einen Zauber +1 ist        |
| "Master of My Domain"       | Inschrift, Shield oder Focus | 20 % Chance, dass das Attribut des Gegenstands für einen Zauber +1 ist        |
| of Enchanting               | Suffix, Kampf oder Staff     | von dir gewirkte Verzauberungen halten 20 % länger                            |

## Rüstung

Rüstung besteht aus fünf Teilen: Kopf, Brust, Hände, Beine und Füße. Jedes Teil hat zwei
Upgrade-Plätze:

- eine **Insignie**, ein kleines Extra auf diesem Teil: zum Beispiel mehr Rüstung gegen
  physischen Schaden oder beim Angreifen;
- eine **Rune**.

Dein **Kopfschutz** gibt +1 auf ein Attribut deiner Wahl.

Im Editor ist Rüstung eine Figur. Klick auf ein nummeriertes Teil daran oder seine Zeile
daneben, um Insignie und Rune zu wählen; jede Wahl sagt, was sie auf diesem Teil tut.
**Insignie auf alle 5 anwenden** legt die gewählte auf jedes Teil. Die Figur zeigt Insignie
und Rune jedes Teils und hält die Waffen des Sets, das du gerade ansiehst, mit ihren Mods.

## Runen

| Rune                                                                                                                                                                                                                                                                                                           | Was sie gibt                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Minor-Attributrune                                                                                                                                                                                                                                                                                             | +1 auf ein Attribut                     |
| Major-Attributrune                                                                                                                                                                                                                                                                                             | +2 auf ein Attribut, -35 Leben          |
| Superior-Attributrune                                                                                                                                                                                                                                                                                          | +3 auf ein Attribut, -75 Leben          |
| ![Vigor](../../../apps/web/public/icons/rune/vigor.svg) **Vigor**                                                                                                                                                                                                                                              | mehr Leben (+30, +41 oder +50)          |
| ![Vitae](../../../apps/web/public/icons/rune/vitae.svg) **Vitae**                                                                                                                                                                                                                                              | +10 Leben                               |
| ![Attunement](../../../apps/web/public/icons/rune/attunement.svg) **Attunement**                                                                                                                                                                                                                               | mehr Energie (+2)                       |
| ![Clarity](../../../apps/web/public/icons/rune/clarity.svg) **Clarity**, ![Purity](../../../apps/web/public/icons/rune/purity.svg) **Purity**, ![Recovery](../../../apps/web/public/icons/rune/recovery.svg) **Recovery**, ![Restoration](../../../apps/web/public/icons/rune/restoration.svg) **Restoration** | zwei Zustände laufen je 20 % früher aus |
| ![Absorption](../../../apps/web/public/icons/rune/absorption.svg) **Absorption** (![Krieger](../../../apps/web/public/icons/profession/warrior.svg) **Krieger**)                                                                                                                                               | weniger physischer Schaden pro Treffer  |

Vitae und Attunement addieren sich: fünf Attunement-Runen geben +10
Energie. Jede andere Rune zählt einmal, egal wie viele du trägst.
Verkürzungen von Zuständen aus verschiedenen Quellen addieren sich
ebenfalls, jede von der vollen Dauer abgezogen und auf eine ganze
Sekunde gerundet: Restoration und "Fear Cuts Deeper" verkürzen eine
Blutung von 8 Sekunden auf 4.

Der Editor speichert keine zwei Teile mit derselben Rune oder mit Runen desselben Attributs: Nur der stärkste Bonus würde zählen, jeder Lebensabzug aber schon. Zeig im Editor auf Leben, um zu sehen, woher deins kommt: Basis, Runen, Insignien und Modifikationen.

Die Rune eines Teils wählst du am selben Ort wie seine Insignie: Klick auf das Teil an der
Figur.

Der Editor rechnet alles für dich zusammen: Leben, Energie, Rüstung und Schaden, wie sie
für dein erstes Waffenset gelten.
