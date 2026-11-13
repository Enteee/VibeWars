var e=`# Ekwipunek

Część **Ekwipunek** edytora buildu zawiera twoją broń i pancerz. Przeciągnij broń
i przedmioty do drugiej ręki z biblioteki po prawej albo kliknij wybrany, aby go
założyć. Pancerz wybierasz na figurze, opisanej niżej.

## Zestawy broni

Nosisz do **czterech zestawów broni**, każdy to broń oraz, jeśli broń zostawia
wolną rękę, przedmiot do drugiej ręki, taki jak Shield lub Focus. Zestaw 1 to ten,
z którym zaczynasz; pozostałe mogą być puste.

W meczu zmieniasz zestawy klawiszami **1 do 4** (**F1 do F4** w układzie
Klasycznym). Zmiana czeka, aż skończy się rzucanie lub zamach, który właśnie
trwa; ruch lub Esc zmienia od razu. Nie ma czasu odnowienia. Twoje ataki,
umiejętności wymagające określonej broni i maksymalna Energia zawsze zależą od
zestawu w ręku.

Broń wymaga rangi 9 swojego atrybutu: poniżej zadaje jedną trzecią swoich obrażeń,
a edytor informuje o tym na czerwono. Sword to zawsze Swordsmanship, ale Staff,
Wand, Shield lub Focus jest robiony pod wybrany przez ciebie atrybut: kliknij
jego rękę na figurze (**6** dla broni, **7** dla drugiej ręki) i wybierz.

## Modyfikacje broni

Każda broń i przedmiot do drugiej ręki mają miejsca na modyfikacje: **prefiks**,
**sufiks** i **inskrypcję**. Kliknij rękę na figurze lub jej wiersz obok, aby je
wybrać; każda mówi, co robi. Wand, Shield i Focus nie przyjmują prefiksu; gołe
ręce żadnej. Modyfikacja ma zawsze najlepszą wartość, a każdy zestaw broni nosi
własne, więc zmiana zestawu zmienia też modyfikacje: maksymalne Zdrowie i Energia
zależą od zestawu w ręku. Zmiana broni zachowuje modyfikacje, które nadal pasują, i
mówi, które odpadły.

| Modyfikacja               | Miejsce    | Pasuje do                               | Efekt                                         |
| ------------------------- | ---------- | --------------------------------------- | --------------------------------------------- |
| Defensive                 | Prefiks    | Staff                                   | Pancerz +5                                    |
| Hale                      | Prefiks    | Staff                                   | +30 Zdrowia                                   |
| Insightful                | Prefiks    | Staff                                   | Energia +5                                    |
| of Defense                | Sufiks     | każda broń bojowa, Staff                | Pancerz +5                                    |
| of Fortitude              | Sufiks     | każda broń bojowa, Staff, Shield, Focus | +30 Zdrowia                                   |
| of Shelter                | Sufiks     | każda broń bojowa, Staff                | Pancerz +7 (przeciw obrażeniom fizycznym)     |
| of Warding                | Sufiks     | każda broń bojowa, Staff                | Pancerz +7 (przeciw obrażeniom od żywiołów)   |
| "Cast Out the Unclean"    | Inskrypcja | Shield, Focus                           | Skraca czas Disease na tobie o 20%            |
| "Fear Cuts Deeper"        | Inskrypcja | Shield, Focus                           | Skraca czas Bleeding na tobie o 20%           |
| "I Can See Clearly Now"   | Inskrypcja | Shield, Focus                           | Skraca czas Blinded na tobie o 20%            |
| "I have the power!"       | Inskrypcja | każda broń bojowa                       | Energia +5                                    |
| "Leaf on the Wind"        | Inskrypcja | Shield, Focus                           | Pancerz +10 (przeciw obrażeniom od zimna)     |
| "Like a Rolling Stone"    | Inskrypcja | Shield, Focus                           | Pancerz +10 (przeciw obrażeniom od ziemi)     |
| "Live for Today"          | Inskrypcja | Focus                                   | Energia +15, regeneracja Energii -1           |
| "Not the face!"           | Inskrypcja | Shield, Focus                           | Pancerz +10 (przeciw obrażeniom obuchowym)    |
| "Only the Strong Survive" | Inskrypcja | Shield, Focus                           | Skraca czas Weakness na tobie o 20%           |
| "Pure of Heart"           | Inskrypcja | Shield, Focus                           | Skraca czas Poison na tobie o 20%             |
| "Riders on the Storm"     | Inskrypcja | Shield, Focus                           | Pancerz +10 (przeciw obrażeniom od błyskawic) |
| "Seize the Day"           | Inskrypcja | Staff, Wand                             | Energia +15, regeneracja Energii -1           |
| "Sleep Now in the Fire"   | Inskrypcja | Shield, Focus                           | Pancerz +10 (przeciw obrażeniom od ognia)     |
| "Soundness of Mind"       | Inskrypcja | Shield, Focus                           | Skraca czas Dazed na tobie o 20%              |
| "Strength of Body"        | Inskrypcja | Shield, Focus                           | Skraca czas Deep Wound na tobie o 20%         |
| "Swift as the Wind"       | Inskrypcja | Shield, Focus                           | Skraca czas Crippled na tobie o 20%           |
| "The Riddle of Steel"     | Inskrypcja | Shield, Focus                           | Pancerz +10 (przeciw obrażeniom ciętym)       |
| "Through Thick and Thin"  | Inskrypcja | Shield, Focus                           | Pancerz +10 (przeciw obrażeniom kłutym)       |

### Prefiksy bojowe przy trafieniu

| Prefiks                      | Pasuje do                  | Działanie przy trafieniu                                                 |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| Vampiric                     | każda broń bojowa          | kradnie 3 Zdrowia (5 z Hammer, Scythe, Bow); regeneracja Zdrowia -1      |
| Zealous                      | każda broń bojowa          | daje 1 Energii; regeneracja Energii -1                                   |
| Sundering                    | każda broń bojowa          | 20% szans na +20% przebicia pancerza                                     |
| Furious                      | bojowa, bez Bow            | 10% szans na podwójną adrenalinę                                         |
| Barbed, Crippling, Poisonous | bojowa, bez Hammer         | wywołane przez ciebie Bleeding, Crippled, Poison trwają o 33% dłużej     |
| Cruel                        | bojowa, bez Bow            | wywołany przez ciebie Deep Wound trwa o 33% dłużej                       |
| Heavy                        | Axe, Hammer, Scythe, Spear | wywołana przez ciebie Weakness trwa o 33% dłużej                         |
| Silencing                    | Daggers, Spear, Bow        | wywołany przez ciebie Dazed trwa o 33% dłużej                            |
| Ebon, Fiery, Icy, Shocking   | każda broń bojowa          | jej obrażenia stają się obrażeniami od ziemi, ognia, zimna lub błyskawic |

„Przy trafieniu” oznacza trafienie ataku lub umiejętności ataku: zablokowane lub
chybione nic nie daje. Dłuższa dolegliwość to taka, którą wywołuje twoja
umiejętność ataku.

### Modyfikacje zależne od twojego stanu

Modyfikacje zależne od twojego stanu liczą się tylko, gdy stan trwa. „Powyżej” lub
„poniżej połowy Zdrowia” należy rozumieć ściśle: przy dokładnie połowie nie działa
żadna. Gdy kończy się podniesione maksimum, Zdrowie lub Energia powyżej nowego
maksimum przepadają.

| Modyfikacja                                        | Miejsce, pasuje do           | Działanie                                                         |
| -------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| "Strength and Honor"                               | inskrypcja, bojowa           | +15% obrażeń broni powyżej połowy Zdrowia                         |
| "Guided by Fate", "Dance with Death"               | inskrypcja, bojowa           | +15% obrażeń broni pod zaczarowaniem, w postawie                  |
| "Too Much Information"                             | inskrypcja, bojowa           | +15% obrażeń broni przeciw wrogowi pod klątwą                     |
| "Vengeance is Mine"                                | inskrypcja, bojowa           | +20% obrażeń broni poniżej połowy Zdrowia                         |
| "Don't Fear the Reaper"                            | inskrypcja, bojowa           | +20% obrażeń broni pod klątwą                                     |
| "To the Pain!"                                     | inskrypcja, bojowa           | +15% obrażeń broni; -10 pancerza podczas ataku                    |
| "Brawn over Brains"                                | inskrypcja, bojowa           | +15% obrażeń broni; -5 Energii                                    |
| "Hale and Hearty", "Have Faith"                    | inskrypcja, każda broń       | +5 Energii powyżej połowy Zdrowia, pod zaczarowaniem              |
| "Don't call it a comeback!", "I am Sorrow."        | inskrypcja, każda broń       | +7 Energii poniżej połowy Zdrowia, pod klątwą                     |
| of Devotion, of Endurance                          | sufiks, Staff, Shield, Focus | +45 Zdrowia pod zaczarowaniem, w postawie                         |
| of Valor                                           | sufiks, Staff, Shield, Focus | +60 Zdrowia pod klątwą                                            |
| "Luck of the Draw"                                 | inskrypcja, Shield lub Focus | 20% szans, że trafienie fizyczne zada o 5 mniej                   |
| "Sheltered by Faith", "Run For Your Life!"         | inskrypcja, Shield lub Focus | trafienia fizyczne zadają o 2 mniej pod zaczarowaniem, w postawie |
| "Nothing to Fear"                                  | inskrypcja, Shield lub Focus | trafienia fizyczne zadają o 3 mniej pod klątwą                    |
| "Hail to the King", "Faith is My Shield"           | inskrypcja, Focus            | +5 pancerza powyżej połowy Zdrowia, pod zaczarowaniem             |
| "Might makes Right", "Knowing is Half the Battle." | inskrypcja, Focus            | +5 pancerza podczas ataku, podczas rzucania czaru                 |
| "Man for All Seasons", "Survival of the Fittest"   | inskrypcja, Focus            | +5 pancerza przeciw obrażeniom od żywiołów, fizycznym             |
| "Ignorance is Bliss", "Life is Pain"               | inskrypcja, Focus            | +5 pancerza; -5 Energii, -20 Zdrowia                              |
| "Down But Not Out", "Be Just and Fear Not"         | inskrypcja, Focus            | +10 pancerza poniżej połowy Zdrowia, pod klątwą                   |

Obrażenia broni to własny rzut broni: dodatkowe obrażenia umiejętności ataku nie
są zwiększane.

### Modyfikacje dla rzucających

Modyfikacje dla rzucających działają tylko na czary, każda z własną szansą przy
użyciu czaru. „Atrybut przedmiotu” to atrybut, pod który zrobiono Staff, Wand lub
Focus. Dwie modyfikacje skracające o połowę, które zadziałają jednocześnie, nadal
skracają tylko raz.

| Modyfikacja                 | Miejsce, pasuje do           | Działanie                                                             |
| --------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| Adept                       | prefiks, Staff               | 20% szans na skrócenie o połowę rzucania czarów atrybutu przedmiotu   |
| Swift                       | prefiks, Staff               | 10% szans na skrócenie o połowę rzucania dowolnego czaru              |
| of Aptitude                 | sufiks, Focus                | 20% szans na skrócenie o połowę rzucania czarów atrybutu przedmiotu   |
| of Swiftness                | sufiks, Focus                | 10% szans na skrócenie o połowę rzucania dowolnego czaru              |
| "Aptitude not Attitude"     | inskrypcja, Staff lub Wand   | 20% szans na skrócenie o połowę rzucania czarów atrybutu przedmiotu   |
| "Don't think twice"         | inskrypcja, Staff lub Wand   | 10% szans na skrócenie o połowę rzucania dowolnego czaru              |
| of Memory                   | sufiks, Wand                 | 20% szans na skrócenie o połowę odnowienia czarów atrybutu przedmiotu |
| of Quickening               | sufiks, Wand                 | 10% szans na skrócenie o połowę odnowienia dowolnego czaru            |
| "Let the Memory Live Again" | inskrypcja, Staff lub Wand   | 10% szans na skrócenie o połowę odnowienia dowolnego czaru            |
| "Forget Me Not"             | inskrypcja, Focus            | 20% szans na skrócenie o połowę odnowienia czarów atrybutu przedmiotu |
| "Serenity Now"              | inskrypcja, Focus            | 10% szans na skrócenie o połowę odnowienia dowolnego czaru            |
| of Mastery                  | sufiks, Staff                | 20% szans, że atrybut przedmiotu ma +1 dla czaru                      |
| "Master of My Domain"       | inskrypcja, Shield lub Focus | 20% szans, że atrybut przedmiotu ma +1 dla czaru                      |
| of Enchanting               | sufiks, bojowa lub Staff     | twoje zaczarowania trwają o 20% dłużej                                |

## Pancerz

Pancerz to pięć części: głowa, tors, dłonie, nogi i stopy. Każda część ma dwa
miejsca na ulepszenia:

- **insygnia**, mały dodatek na tej części: na przykład więcej pancerza przeciw
  obrażeniom fizycznym lub podczas ataku;
- **runę**.

Twój **hełm** daje +1 do jednego wybranego atrybutu.

W edytorze pancerz to figura. Kliknij ponumerowaną część lub jej wiersz obok, aby
wybrać jej insygnia i runę; każdy wybór mówi, co robi na tej części. **Nałóż
insygnia na wszystkie: 5** umieszcza wybrane insygnia na każdej części. Figura
pokazuje insygnia i runę każdej części oraz trzyma broń oglądanego zestawu wraz
z jej modyfikacjami.

## Runy

| Runa                                   | Co daje                                      |
| -------------------------------------- | -------------------------------------------- |
| Pomniejsza runa atrybutu               | +1 do atrybutu                               |
| Większa runa atrybutu                  | +2 do atrybutu, -35 Zdrowia                  |
| Najwyższa runa atrybutu                | +3 do atrybutu, -75 Zdrowia                  |
| Vigor                                  | więcej Zdrowia (+30, +41 lub +50)            |
| Vitae                                  | +10 Zdrowia                                  |
| Attunement                             | więcej Energii (+3, +6 lub +9)               |
| Clarity, Purity, Recovery, Restoration | po dwie dolegliwości mijają o 20% szybciej   |
| Absorption (Warrior)                   | mniej obrażeń fizycznych z każdego trafienia |

Runę części wybierasz w tym samym miejscu co jej insygnia: kliknij część na figurze.

Edytor sumuje wszystko za ciebie: Zdrowie, Energię, pancerz i obrażenia, takie
jakie ma twój pierwszy zestaw broni.
`;export{e as default};
//# sourceMappingURL=equipment-DWN8FGI2.js.map