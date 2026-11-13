var e=`# Echipament

Partea **Echipament** a editorului de build conține armele și armura ta. Trage
armele și mâinile secundare din biblioteca din dreapta sau dă clic pe una ca s-o
echipezi. Armura se alege pe figură, mai jos.

## Seturi de arme

Porți până la **patru seturi de arme**, fiecare cu o armă și, dacă arma lasă o
mână liberă, o mână secundară, precum un Shield sau un Focus. Setul 1 este cel
cu care începi; celelalte pot rămâne goale.

Într-un meci, schimbi seturile cu **1 la 4** (**F1 la F4** la tastele Clasic).
O schimbare așteaptă să se termine lansarea sau lovitura în curs; mișcarea sau
Esc schimbă imediat. Nu există timp de așteptare. Atacurile tale, abilitățile
care cer o anumită armă și Energia ta maximă urmează toate setul din mână.

O armă cere rangul 9 la atributul ei: sub acesta lovește cu o treime din daune,
iar editorul îți spune asta cu roșu. O Sword ține mereu de Swordsmanship, dar un
Staff, un Wand, un Shield sau un Focus sunt făcute pentru un atribut pe care îl
alegi: dă clic pe mâna respectivă de pe figură (**6** pentru armă, **7** pentru
mâna secundară) și alege unul.

## Modificatori de armă

Fiecare armă și mână secundară are locuri pentru modificatori: un **prefix**, un
**sufix** și o **inscripție**. Dă clic pe mâna de pe figură sau pe rândul de
lângă ea ca să-i alegi; fiecare spune ce face. Un Wand, un Shield și un Focus nu
primesc prefix; mâinile goale nu primesc niciunul. Un modificator are mereu cea
mai bună valoare, iar fiecare set de arme îi poartă pe ai lui, așa că schimbarea
setului schimbă și modificatorii: Viața și Energia maximă urmează setul din
mână. La schimbarea unei arme se păstrează modificatorii care încă i se
potrivesc, și ți se spune care au fost scoși.

| Modificator               | Loc        | Se potrivește pe                          | Efect                                     |
| ------------------------- | ---------- | ----------------------------------------- | ----------------------------------------- |
| Defensive                 | Prefix     | Staff                                     | Armură +5                                 |
| Hale                      | Prefix     | Staff                                     | +30 Viață                                 |
| Insightful                | Prefix     | Staff                                     | Energie +5                                |
| of Defense                | Sufix      | orice armă de luptă, Staff                | Armură +5                                 |
| of Fortitude              | Sufix      | orice armă de luptă, Staff, Shield, Focus | +30 Viață                                 |
| of Shelter                | Sufix      | orice armă de luptă, Staff                | Armură +7 (contra daunelor fizice)        |
| of Warding                | Sufix      | orice armă de luptă, Staff                | Armură +7 (contra daunelor elementale)    |
| "Cast Out the Unclean"    | Inscripție | Shield, Focus                             | Reduce cu 20% durata Disease asupra ta    |
| "Fear Cuts Deeper"        | Inscripție | Shield, Focus                             | Reduce cu 20% durata Bleeding asupra ta   |
| "I Can See Clearly Now"   | Inscripție | Shield, Focus                             | Reduce cu 20% durata Blinded asupra ta    |
| "I have the power!"       | Inscripție | orice armă de luptă                       | Energie +5                                |
| "Leaf on the Wind"        | Inscripție | Shield, Focus                             | Armură +10 (contra daunelor de frig)      |
| "Like a Rolling Stone"    | Inscripție | Shield, Focus                             | Armură +10 (contra daunelor de pământ)    |
| "Live for Today"          | Inscripție | Focus                                     | Energie +15, regenerare de Energie -1     |
| "Not the face!"           | Inscripție | Shield, Focus                             | Armură +10 (contra daunelor contondente)  |
| "Only the Strong Survive" | Inscripție | Shield, Focus                             | Reduce cu 20% durata Weakness asupra ta   |
| "Pure of Heart"           | Inscripție | Shield, Focus                             | Reduce cu 20% durata Poison asupra ta     |
| "Riders on the Storm"     | Inscripție | Shield, Focus                             | Armură +10 (contra daunelor de fulger)    |
| "Seize the Day"           | Inscripție | Staff, Wand                               | Energie +15, regenerare de Energie -1     |
| "Sleep Now in the Fire"   | Inscripție | Shield, Focus                             | Armură +10 (contra daunelor de foc)       |
| "Soundness of Mind"       | Inscripție | Shield, Focus                             | Reduce cu 20% durata Dazed asupra ta      |
| "Strength of Body"        | Inscripție | Shield, Focus                             | Reduce cu 20% durata Deep Wound asupra ta |
| "Swift as the Wind"       | Inscripție | Shield, Focus                             | Reduce cu 20% durata Crippled asupra ta   |
| "The Riddle of Steel"     | Inscripție | Shield, Focus                             | Armură +10 (contra daunelor tăioase)      |
| "Through Thick and Thin"  | Inscripție | Shield, Focus                             | Armură +10 (contra daunelor perforante)   |

### Prefixe de luptă la lovire

| Prefix                       | Se potrivește pe           | Ce face la lovire                                                    |
| ---------------------------- | -------------------------- | -------------------------------------------------------------------- |
| Vampiric                     | orice armă de luptă        | fură 3 Viață (5 pe Hammer, Scythe, Bows); regenerare de Viață -1     |
| Zealous                      | orice armă de luptă        | câștigă 1 Energie; regenerare de Energie -1                          |
| Sundering                    | orice armă de luptă        | 20% șansă de +20% penetrare a armurii                                |
| Furious                      | de luptă, nu Bows          | 10% șansă de adrenalină dublă                                        |
| Barbed, Crippling, Poisonous | de luptă, nu Hammer        | Bleeding, Crippled, Poison provocate de tine durează cu 33% mai mult |
| Cruel                        | de luptă, nu Bows          | Deep Wound provocat de tine durează cu 33% mai mult                  |
| Heavy                        | Axe, Hammer, Scythe, Spear | Weakness provocat de tine durează cu 33% mai mult                    |
| Silencing                    | Daggers, Spear, Bows       | Dazed provocat de tine durează cu 33% mai mult                       |
| Ebon, Fiery, Icy, Shocking   | orice armă de luptă        | daunele ei devin de pământ, foc, frig sau fulger                     |

„La lovire” înseamnă o lovitură reușită a unui atac sau a unei abilități de atac:
una parată sau ratată nu face nimic. O afecțiune mai lungă este una provocată de
abilitatea ta de atac.

### Modificatori care depind de starea ta

Modificatorii care depind de starea ta contează doar cât timp ea durează. „Peste”
sau „sub jumătate din Viață” se ia strict: exact la jumătate, niciunul nu
contează. Când se termină o creștere a maximului, Viața sau Energia de peste noul
maxim se pierde.

| Modificator                                        | Loc, se potrivește pe        | Ce face                                                                          |
| -------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| "Strength and Honor"                               | inscripție, de luptă         | +15% daune cu arma peste jumătate din Viață                                      |
| "Guided by Fate", "Dance with Death"               | inscripție, de luptă         | +15% daune cu arma cât timp ești sub un farmec, într-o postură                   |
| "Too Much Information"                             | inscripție, de luptă         | +15% daune cu arma contra unui inamic blestemat                                  |
| "Vengeance is Mine"                                | inscripție, de luptă         | +20% daune cu arma sub jumătate din Viață                                        |
| "Don't Fear the Reaper"                            | inscripție, de luptă         | +20% daune cu arma cât timp ești blestemat                                       |
| "To the Pain!"                                     | inscripție, de luptă         | +15% daune cu arma; -10 armură cât timp ataci                                    |
| "Brawn over Brains"                                | inscripție, de luptă         | +15% daune cu arma; -5 Energie                                                   |
| "Hale and Hearty", "Have Faith"                    | inscripție, orice armă       | +5 Energie peste jumătate din Viață, cât timp ești sub un farmec                 |
| "Don't call it a comeback!", "I am Sorrow."        | inscripție, orice armă       | +7 Energie sub jumătate din Viață, cât timp ești blestemat                       |
| of Devotion, of Endurance                          | sufix, Staff, Shield, Focus  | +45 Viață cât timp ești sub un farmec, într-o postură                            |
| of Valor                                           | sufix, Staff, Shield, Focus  | +60 Viață cât timp ești blestemat                                                |
| "Luck of the Draw"                                 | inscripție, Shield sau Focus | 20% șansă ca o lovitură fizică să facă cu 5 mai puțin                            |
| "Sheltered by Faith", "Run For Your Life!"         | inscripție, Shield sau Focus | loviturile fizice fac cu 2 mai puțin cât timp ești sub un farmec, într-o postură |
| "Nothing to Fear"                                  | inscripție, Shield sau Focus | loviturile fizice fac cu 3 mai puțin cât timp ești blestemat                     |
| "Hail to the King", "Faith is My Shield"           | inscripție, Focus            | +5 armură peste jumătate din Viață, cât timp ești sub un farmec                  |
| "Might makes Right", "Knowing is Half the Battle." | inscripție, Focus            | +5 armură cât timp ataci, cât timp lansezi o vrajă                               |
| "Man for All Seasons", "Survival of the Fittest"   | inscripție, Focus            | +5 armură contra daunelor elementale, fizice                                     |
| "Ignorance is Bliss", "Life is Pain"               | inscripție, Focus            | +5 armură; -5 Energie, -20 Viață                                                 |
| "Down But Not Out", "Be Just and Fear Not"         | inscripție, Focus            | +10 armură sub jumătate din Viață, cât timp ești blestemat                       |

Daunele cu arma sunt cele date chiar de armă: daunele bonus ale unei abilități
de atac nu cresc.

### Modificatori pentru lansatori de vrăji

Modificatorii pentru lansatori de vrăji acționează doar asupra vrăjilor, fiecare
cu șansa lui când folosești una. „Atributul obiectului” este atributul pentru
care e făcut Staff-ul, Wand-ul sau Focus-ul. Doi modificatori de înjumătățire
care se activează amândoi tot o singură dată înjumătățesc.

| Modificator                 | Loc, se potrivește pe        | Ce face                                                                  |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| Adept                       | prefix, Staff                | 20% șansă să înjumătățească lansarea vrăjilor atributului obiectului     |
| Swift                       | prefix, Staff                | 10% șansă să înjumătățească lansarea oricărei vrăji                      |
| of Aptitude                 | sufix, Focus                 | 20% șansă să înjumătățească lansarea vrăjilor atributului obiectului     |
| of Swiftness                | sufix, Focus                 | 10% șansă să înjumătățească lansarea oricărei vrăji                      |
| "Aptitude not Attitude"     | inscripție, Staff sau Wand   | 20% șansă să înjumătățească lansarea vrăjilor atributului obiectului     |
| "Don't think twice"         | inscripție, Staff sau Wand   | 10% șansă să înjumătățească lansarea oricărei vrăji                      |
| of Memory                   | sufix, Wand                  | 20% șansă să înjumătățească reîncărcarea vrăjilor atributului obiectului |
| of Quickening               | sufix, Wand                  | 10% șansă să înjumătățească reîncărcarea oricărei vrăji                  |
| "Let the Memory Live Again" | inscripție, Staff sau Wand   | 10% șansă să înjumătățească reîncărcarea oricărei vrăji                  |
| "Forget Me Not"             | inscripție, Focus            | 20% șansă să înjumătățească reîncărcarea vrăjilor atributului obiectului |
| "Serenity Now"              | inscripție, Focus            | 10% șansă să înjumătățească reîncărcarea oricărei vrăji                  |
| of Mastery                  | sufix, Staff                 | 20% șansă ca atributul obiectului să fie +1 pentru o vrajă               |
| "Master of My Domain"       | inscripție, Shield sau Focus | 20% șansă ca atributul obiectului să fie +1 pentru o vrajă               |
| of Enchanting               | sufix, de luptă sau Staff    | farmecele lansate de tine durează cu 20% mai mult                        |

## Armură

Armura are cinci piese: cap, piept, mâini, picioare și tălpi. Fiecare piesă are
două locuri de îmbunătățire:

- un **însemn**, un mic bonus pe acea piesă: de exemplu, mai multă armură contra
  daunelor fizice sau cât timp ataci;
- o **rună**.

**Coiful** tău adaugă +1 la un atribut pe care îl alegi.

În editor, armura este o figură. Dă clic pe o piesă numerotată de pe ea sau pe
rândul de lângă ea ca să-i alegi însemnul și runa; fiecare opțiune spune ce face
pe acea piesă. **Aplică însemnul pe toate (5)** pune însemnul ales pe fiecare
piesă. Figura arată însemnul și runa fiecărei piese și ține armele setului la
care te uiți, cu modificatorii lor.

## Rune

| Rună                                   | Ce oferă                                      |
| -------------------------------------- | --------------------------------------------- |
| Rună de atribut Minoră                 | +1 la un atribut                              |
| Rună de atribut Majoră                 | +2 la un atribut, -35 Viață                   |
| Rună de atribut Superioară             | +3 la un atribut, -75 Viață                   |
| Vigor                                  | mai multă Viață (+30, +41 sau +50)            |
| Vitae                                  | +10 Viață                                     |
| Attunement                             | mai multă Energie (+3, +6 sau +9)             |
| Clarity, Purity, Recovery, Restoration | câte două afecțiuni expiră cu 20% mai devreme |
| Absorption (Warrior)                   | mai puține daune fizice la fiecare lovitură   |

Alegi runa unei piese în același loc cu însemnul: dă clic pe piesă pe figură.

Editorul adună totul pentru tine: Viața, Energia, armura și daunele, așa cum le
are primul tău set de arme.
`;export{e as default};
//# sourceMappingURL=equipment-d_ELZnZF.js.map