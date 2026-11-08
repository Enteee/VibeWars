var e=`# Equipaggiamento

La parte **Equipaggiamento** dell'editor delle build contiene armi e armatura. Trascina armi e mani secondarie dalla libreria a destra, o cliccane una per equipaggiarla. L'armatura si sceglie sulla figura, più sotto.

## Set di armi

Porti fino a **quattro set di armi**, ognuno con un'arma e, se l'arma lascia libera una mano, una mano secondaria come uno Shield o un Focus. Il set 1 è quello con cui inizi; gli altri possono restare vuoti.

In partita cambi set con **da 1 a 4** (**da F1 a F4** con i tasti Classico). Un cambio aspetta la fine del lancio o del colpo in corso; muoverti o premere Esc cambia subito. Non c'è tempo di attesa. I tuoi attacchi, le abilità che richiedono una certa arma e la tua Energia massima seguono il set in mano.

Un'arma richiede il grado 9 nel suo attributo: sotto, fa un terzo dei danni, e l'editor lo dice in rosso. Una Sword è sempre Swordsmanship, ma Staff, Wand, Shield o Focus sono fatti per un attributo a tua scelta: clicca sulla sua mano nella figura (**6** per l'arma, **7** per la mano secondaria) e scegline uno.

## Mod delle armi

Ogni arma e mano secondaria ha slot per i mod: un **Prefisso**, un **Suffisso** e un'**Iscrizione**. Clicca sulla mano nella figura, o sulla sua riga accanto, per sceglierli; ognuno dice cosa fa. Wand, Shield e Focus non hanno prefisso; a mani nude non ne hai. Un mod ha sempre il valore migliore, e ogni set di armi ha i suoi, quindi cambiare set cambia anche i mod: Salute ed Energia massime seguono il set in mano. Cambiando arma si tengono i mod ancora compatibili e ti viene detto quali sono caduti.

| Mod                       | Slot       | Adatto a                                      | Effetto                                         |
| ------------------------- | ---------- | --------------------------------------------- | ----------------------------------------------- |
| Defensive                 | Prefisso   | Staff                                         | Armatura +5                                     |
| Hale                      | Prefisso   | Staff                                         | +30 Salute                                      |
| Insightful                | Prefisso   | Staff                                         | Energia +5                                      |
| of Defense                | Suffisso   | qualsiasi arma marziale, Staff                | Armatura +5                                     |
| of Fortitude              | Suffisso   | qualsiasi arma marziale, Staff, Shield, Focus | +30 Salute                                      |
| of Shelter                | Suffisso   | qualsiasi arma marziale, Staff                | Armatura +7 (contro danni fisici)               |
| of Warding                | Suffisso   | qualsiasi arma marziale, Staff                | Armatura +7 (contro danni elementali)           |
| "Cast Out the Unclean"    | Iscrizione | Shield, Focus                                 | Riduce del 20% la durata di Disease su di te    |
| "Fear Cuts Deeper"        | Iscrizione | Shield, Focus                                 | Riduce del 20% la durata di Bleeding su di te   |
| "I Can See Clearly Now"   | Iscrizione | Shield, Focus                                 | Riduce del 20% la durata di Blinded su di te    |
| "I have the power!"       | Iscrizione | qualsiasi arma marziale                       | Energia +5                                      |
| "Leaf on the Wind"        | Iscrizione | Shield, Focus                                 | Armatura +10 (contro danni da freddo)           |
| "Like a Rolling Stone"    | Iscrizione | Shield, Focus                                 | Armatura +10 (contro danni da terra)            |
| "Live for Today"          | Iscrizione | Focus                                         | Energia +15, rigenerazione Energia -1           |
| "Not the face!"           | Iscrizione | Shield, Focus                                 | Armatura +10 (contro danni contundenti)         |
| "Only the Strong Survive" | Iscrizione | Shield, Focus                                 | Riduce del 20% la durata di Weakness su di te   |
| "Pure of Heart"           | Iscrizione | Shield, Focus                                 | Riduce del 20% la durata di Poison su di te     |
| "Riders on the Storm"     | Iscrizione | Shield, Focus                                 | Armatura +10 (contro danni da fulmine)          |
| "Seize the Day"           | Iscrizione | Staff, Wand                                   | Energia +15, rigenerazione Energia -1           |
| "Sleep Now in the Fire"   | Iscrizione | Shield, Focus                                 | Armatura +10 (contro danni da fuoco)            |
| "Soundness of Mind"       | Iscrizione | Shield, Focus                                 | Riduce del 20% la durata di Dazed su di te      |
| "Strength of Body"        | Iscrizione | Shield, Focus                                 | Riduce del 20% la durata di Deep Wound su di te |
| "Swift as the Wind"       | Iscrizione | Shield, Focus                                 | Riduce del 20% la durata di Crippled su di te   |
| "The Riddle of Steel"     | Iscrizione | Shield, Focus                                 | Armatura +10 (contro danni taglienti)           |
| "Through Thick and Thin"  | Iscrizione | Shield, Focus                                 | Armatura +10 (contro danni perforanti)          |

### Prefissi marziali a segno

| Prefisso                     | Adatto a                   | Cosa fa a ogni colpo a segno                                        |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------- |
| Vampiric                     | qualsiasi arma marziale    | ruba 3 Salute (5 con hammer, scythe, bows); -1 rigenerazione Salute |
| Zealous                      | qualsiasi arma marziale    | ottiene 1 Energia; -1 rigenerazione Energia                         |
| Sundering                    | qualsiasi arma marziale    | 20% di probabilità di +20% di penetrazione armatura                 |
| Furious                      | marziale, non bows         | 10% di probabilità di adrenalina doppia                             |
| Barbed, Crippling, Poisonous | marziale, non hammer       | Bleeding, Crippled, Poison che causi durano il 33% in più           |
| Cruel                        | marziale, non bows         | Deep Wound che causi dura il 33% in più                             |
| Heavy                        | axe, hammer, scythe, spear | Weakness che causi dura il 33% in più                               |
| Silencing                    | daggers, spear, bows       | Dazed che causi dura il 33% in più                                  |
| Ebon, Fiery, Icy, Shocking   | qualsiasi arma marziale    | i suoi danni diventano da terra, fuoco, freddo o fulmine            |

"A segno" significa un colpo arrivato di un attacco o di un'abilità d'attacco: uno parato o mancato non fa nulla. Una condizione prolungata è quella causata dalla tua abilità d'attacco.

### Mod legati al tuo stato

I mod legati al tuo stato contano solo finché quello stato dura. "Sopra" o "sotto metà Salute" vale in senso stretto: esattamente a metà, non conta nessuno dei due. Quando un massimo aumentato finisce, la Salute o l'Energia oltre il nuovo massimo vanno perse.

| Mod                                                | Slot, adatto a                 | Effetto                                                                 |
| -------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| "Strength and Honor"                               | iscrizione, marziale           | +15% danni dell'arma sopra metà Salute                                  |
| "Guided by Fate", "Dance with Death"               | iscrizione, marziale           | +15% danni dell'arma se sei incantato, in una posizione                 |
| "Too Much Information"                             | iscrizione, marziale           | +15% danni dell'arma contro un nemico con un maleficio                  |
| "Vengeance is Mine"                                | iscrizione, marziale           | +20% danni dell'arma sotto metà Salute                                  |
| "Don't Fear the Reaper"                            | iscrizione, marziale           | +20% danni dell'arma se hai un maleficio                                |
| "To the Pain!"                                     | iscrizione, marziale           | +15% danni dell'arma; -10 armatura mentre attacchi                      |
| "Brawn over Brains"                                | iscrizione, marziale           | +15% danni dell'arma; -5 Energia                                        |
| "Hale and Hearty", "Have Faith"                    | iscrizione, qualsiasi arma     | +5 Energia sopra metà Salute, se sei incantato                          |
| "Don't call it a comeback!", "I am Sorrow."        | iscrizione, qualsiasi arma     | +7 Energia sotto metà Salute, se hai un maleficio                       |
| of Devotion, of Endurance                          | suffisso, staff, shield, focus | +45 Salute se sei incantato, in una posizione                           |
| of Valor                                           | suffisso, staff, shield, focus | +60 Salute se hai un maleficio                                          |
| "Luck of the Draw"                                 | iscrizione, shield o focus     | 20% di probabilità che un colpo fisico faccia 5 danni in meno           |
| "Sheltered by Faith", "Run For Your Life!"         | iscrizione, shield o focus     | i colpi fisici fanno 2 danni in meno se sei incantato, in una posizione |
| "Nothing to Fear"                                  | iscrizione, shield o focus     | i colpi fisici fanno 3 danni in meno se hai un maleficio                |
| "Hail to the King", "Faith is My Shield"           | iscrizione, focus              | +5 armatura sopra metà Salute, se sei incantato                         |
| "Might makes Right", "Knowing is Half the Battle." | iscrizione, focus              | +5 armatura mentre attacchi, mentre lanci un incantesimo                |
| "Man for All Seasons", "Survival of the Fittest"   | iscrizione, focus              | +5 armatura contro danni elementali, fisici                             |
| "Ignorance is Bliss", "Life is Pain"               | iscrizione, focus              | +5 armatura; -5 Energia, -20 Salute                                     |
| "Down But Not Out", "Be Just and Fear Not"         | iscrizione, focus              | +10 armatura sotto metà Salute, se hai un maleficio                     |

I danni dell'arma sono il tiro dell'arma stessa: i danni bonus di un'abilità d'attacco non aumentano.

### Mod da incantatore

I mod da incantatore agiscono solo sugli incantesimi, ognuno con la sua probabilità quando ne usi uno. "L'attributo dell'oggetto" è l'attributo per cui è fatto lo staff, la wand o il focus. Due mod di dimezzamento che scattano insieme dimezzano comunque una volta sola.

| Mod                         | Slot, adatto a             | Effetto                                                                                   |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| Adept                       | prefisso, staff            | 20% di probabilità di dimezzare il lancio degli incantesimi dell'attributo dell'oggetto   |
| Swift                       | prefisso, staff            | 10% di probabilità di dimezzare il lancio di qualsiasi incantesimo                        |
| of Aptitude                 | suffisso, focus            | 20% di probabilità di dimezzare il lancio degli incantesimi dell'attributo dell'oggetto   |
| of Swiftness                | suffisso, focus            | 10% di probabilità di dimezzare il lancio di qualsiasi incantesimo                        |
| "Aptitude not Attitude"     | iscrizione, staff o wand   | 20% di probabilità di dimezzare il lancio degli incantesimi dell'attributo dell'oggetto   |
| "Don't think twice"         | iscrizione, staff o wand   | 10% di probabilità di dimezzare il lancio di qualsiasi incantesimo                        |
| of Memory                   | suffisso, wand             | 20% di probabilità di dimezzare la ricarica degli incantesimi dell'attributo dell'oggetto |
| of Quickening               | suffisso, wand             | 10% di probabilità di dimezzare la ricarica di qualsiasi incantesimo                      |
| "Let the Memory Live Again" | iscrizione, staff o wand   | 10% di probabilità di dimezzare la ricarica di qualsiasi incantesimo                      |
| "Forget Me Not"             | iscrizione, focus          | 20% di probabilità di dimezzare la ricarica degli incantesimi dell'attributo dell'oggetto |
| "Serenity Now"              | iscrizione, focus          | 10% di probabilità di dimezzare la ricarica di qualsiasi incantesimo                      |
| of Mastery                  | suffisso, staff            | 20% di probabilità che l'attributo dell'oggetto sia +1 per un incantesimo                 |
| "Master of My Domain"       | iscrizione, shield o focus | 20% di probabilità che l'attributo dell'oggetto sia +1 per un incantesimo                 |
| of Enchanting               | suffisso, marziale o staff | gli incantamenti che lanci durano il 20% in più                                           |

## Armatura

L'armatura è composta da cinque pezzi: testa, torso, mani, gambe e piedi. Ogni pezzo ha due slot di potenziamento:

- un'**Insegna**, un piccolo extra su quel pezzo: più armatura contro i danni fisici, per esempio, o mentre attacchi;
- una **Runa**.

Il tuo **Copricapo** aggiunge +1 a un attributo a tua scelta.

Nell'editor, l'armatura è una figura. Clicca su un pezzo numerato, o sulla sua riga accanto, per scegliere insegna e runa; ogni scelta dice cosa fa su quel pezzo. **Applica insegna a tutti e 5** mette quella scelta su ogni pezzo. La figura mostra insegna e runa di ogni pezzo, e impugna le armi del set che stai guardando, con i loro mod.

## Rune

| Runa                                   | Cosa dà                                         |
| -------------------------------------- | ----------------------------------------------- |
| Runa di attributo Minor                | +1 a un attributo                               |
| Runa di attributo Major                | +2 a un attributo, -35 Salute                   |
| Runa di attributo Superior             | +3 a un attributo, -75 Salute                   |
| Vigor                                  | più Salute (+30, +41 o +50)                     |
| Vitae                                  | +10 Salute                                      |
| Attunement                             | più Energia (+3, +6 o +9)                       |
| Clarity, Purity, Recovery, Restoration | due condizioni ciascuna svaniscono il 20% prima |
| Absorption (Warrior)                   | meno danni fisici da ogni colpo                 |

Scegli la runa di un pezzo nello stesso punto dell'insegna: clicca sul pezzo nella figura.

L'editor fa il conto per te: Salute, Energia, armatura e danni, come li ha il tuo primo set di armi.
`;export{e as default};
//# sourceMappingURL=equipment-CSP9incE.js.map