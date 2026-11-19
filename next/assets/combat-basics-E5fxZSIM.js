var e=`# Podstawy walki

## Zdrowie i energia

Zaczynasz z 500 **Zdrowia** i 50 **Energii**; runy i morale zmieniają obie
wartości. Umiejętności kosztują Energię, a ta wraca sama, powoli. ![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warrior**
i ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** odzyskują ją najwolniej, ![Ranger](../../../apps/web/public/icons/profession/ranger.svg) **Ranger** trochę szybciej, a wszyscy pozostali
najszybciej.

Strzałki na twoich paskach to **pipy**: każda oznacza Zdrowie lub Energię, które
co sekundę trochę wracają albo ubywają. ![Bleeding](../../../apps/web/public/icons/status/bleeding.svg) **Bleeding**, ![Burning](../../../apps/web/public/icons/status/burning.svg) **Burning** i ![Poison](../../../apps/web/public/icons/status/poison.svg) **Poison** odbierają
Zdrowie; Regeneracja i czary leczące je dodają. Po 5 sekundach poza walką Zdrowie
zaczyna wracać samo, tym szybciej, im dłużej pozostajesz poza walką.

## Adrenalina

![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warrior**, ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** i inne profesje mają umiejętności, które zamiast Energii
kosztują **adrenalinę**. Każda taka umiejętność ładuje się osobno: każde
trafienie bronią daje każdej z nich jedno uderzenie, tak samo jak przyjęcie
mocnego ciosu. Użycie jednej opróżnia ją i zabiera uderzenie pozostałym. Po 25
sekundach poza walką wszystkie się opróżniają.

## Używanie umiejętności

Umiejętność może wymagać chwili na **rzucanie**, a potem potrzebuje czasu na
**odnowienie**, zanim użyjesz jej ponownie. Jeśli cel jest poza zasięgiem, najpierw
do niego podchodzisz. Ruch lub Esc anuluje rzucanie: Energia przepada, ale
umiejętność się nie odnawia. Po każdej umiejętności z czasem rzucania, poza
![Umiejętność ataku](../../../apps/web/public/icons/skill-type/attack.svg) **umiejętnością ataku**, następuje krótka przerwa, w której nie możesz działać.

Umiejętność wciśnięta, gdy używasz innej, lub w tej przerwie, trafia do
**kolejki**: idzie następna, a jej pole pulsuje, dopóki to nie nastąpi. Czekać
może tylko jedna; wciśnięcie innej ją zastępuje. Ruch, Esc, przerwanie lub
powalenie ją usuwa.

![Okrzyk](../../../apps/web/public/icons/skill-type/shout.svg) **Okrzyki** i ![Postawa](../../../apps/web/public/icons/skill-type/stance.svg) **postawy** nigdy nie trafiają do kolejki: działają od razu, nawet gdy
rzucasz inną umiejętność, w tej przerwie lub po powaleniu. Rzucanie trwa dalej.
Użyte w ten sposób nie podprowadzają cię do celu: poza zasięgiem zostają odrzucone.

## Przerwania i powalenie

**Przerwanie** zatrzymuje umiejętność wroga w trakcie jej rzucania. Jego Energia
jest wydana, a umiejętność się odnawia; niektóre przerwania dodatkowo blokują ją
na jakiś czas. Przerwanie za wcześnie lub za późno nic nie daje.

Każda profesja ma własny dźwięk użycia umiejętności; nasłuchuj dźwięku swojego celu.

Większość przerwań zatrzymuje też zwykły atak w połowie zamachu: cios nigdy nie
trafia, a zamach zaczyna się od nowa. Wróg, który wciąż idzie do celu, nie ma
czego przerywać. Przerwanie, którego karta mówi „umiejętność” lub „czar”, nie
dotyka zwykłego ataku.

Niektóre ![Postawa](../../../apps/web/public/icons/skill-type/stance.svg) **postawy**, jak Mantra of Concentration, zatrzymują przerwanie wymierzone
w ciebie. Żadna z nich nie zatrzymuje powalenia.

**Powalony** przez chwilę nie możesz się ruszać, atakować ani użyć umiejętności,
poza ![Okrzyk](../../../apps/web/public/icons/skill-type/shout.svg) **okrzykiem** lub postawą, a trwające rzucanie kończy się niepowodzeniem.

## Dolegliwości, klątwy i zaczarowania

**Dolegliwości** szkodzą ci, dopóki nie miną lub nie zostaną usunięte:

| Dolegliwość                                                                                 | Działanie                                             |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| ![Bleeding](../../../apps/web/public/icons/status/bleeding.svg) **Bleeding**                | odbiera Zdrowie                                       |
| ![Burning](../../../apps/web/public/icons/status/burning.svg) **Burning**                   | szybko odbiera Zdrowie                                |
| ![Poison](../../../apps/web/public/icons/status/poison.svg) **Poison**                      | odbiera Zdrowie                                       |
| ![Disease](../../../apps/web/public/icons/status/disease.svg) **Disease**                   | odbiera Zdrowie i przenosi się na każdego obok ciebie |
| ![Crippled](../../../apps/web/public/icons/status/crippled.svg) **Crippled**                | poruszasz się z połową prędkości                      |
| ![Blind](../../../apps/web/public/icons/status/blind.svg) **Blind**                         | większość twoich ataków chybia                        |
| ![Weakness](../../../apps/web/public/icons/status/weakness.svg) **Weakness**                | twoja broń trafia znacznie słabiej                    |
| ![Cracked Armor](../../../apps/web/public/icons/status/cracked-armor.svg) **Cracked Armor** | mniej pancerza                                        |
| ![Deep Wound](../../../apps/web/public/icons/status/deep-wound.svg) **Deep Wound**          | mniej maksymalnego Zdrowia i słabsze leczenie         |
| ![Dazed](../../../apps/web/public/icons/status/dazed.svg) **Dazed**                         | czary rzucane są wolno; każdy atak je przerywa        |

![Klątwa](../../../apps/web/public/icons/skill-type/hex.svg) **Klątwy** rzucają na ciebie wrogowie; ![Zaczarowanie](../../../apps/web/public/icons/skill-type/enchantment.svg) **zaczarowania** ty sam lub twoi
sojusznicy. Każde z nich usuwa własny rodzaj umiejętności. Niektóre zaczarowania
są **podtrzymywane**: trwają, dopóki ich nie zakończysz, i kosztują pip Energii,
gdy działają. Kliknij dwukrotnie ikonę, aby je zakończyć.

Kilka umiejętności przestaje działać, gdy jesteś pod zaczarowaniem, i zaczyna
znów działać, gdy już nie jesteś. Umiejętność, która trwa przez „następne N
ataków”, liczy każdy atak, więc chybienie lub blok zużywa ładunek tak samo jak
trafienie.

## Pancerz i obrażenia

![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warrior** i ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** noszą najwięcej pancerza; ![Ranger](../../../apps/web/public/icons/profession/ranger.svg) **Ranger**, ![Assassin](../../../apps/web/public/icons/profession/assassin.svg) **Assassin** i ![Dervish](../../../apps/web/public/icons/profession/dervish.svg) **Dervish** mniej;
rzucający czary najmniej. Pancerz zmniejsza obrażenia od broni, żywiołów, chaosu
i mroku. Obrażenia święte, cienia i bez typu, odbieranie Zdrowia oraz kradzież
życia go ignorują. Tylko trafienia bronią mogą być krytyczne.
Niektóre zaczarowania dają niewrażliwość na trafienia krytyczne.

## Śmierć, wskrzeszenie i morale

W większości trybów polegli leżą, dopóki sojusznik ich nie **wskrzesi**
umiejętnością, taką jak Resurrection Signet, którą może wziąć każdy. Niektóre
tryby przywracają poległych falami albo samoczynnie; zobacz [Tryby](modes.md).

Gdy nie żyjesz, wiersz pod tablicą wyników odlicza czas do twojego
powrotu albo mówi, że musisz czekać na wskrzeszenie. Okno drużyny
pokazuje odliczanie przy każdym poległym sojuszniku.

Każda śmierć kosztuje 15% **morale**, do -60%: wraz z nim maleją twoje maksymalne
Zdrowie i Energia. Każdy wróg zabity przez drużynę odzyskuje 2%, do poziomu 0.
W Bitwie gildii utrzymywanie stojaka flagi podnosi je powyżej tej granicy, aż do +10%.
`;export{e as default};
//# sourceMappingURL=combat-basics-E5fxZSIM.js.map