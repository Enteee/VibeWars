# Boty

**Bot** to gracz, którym steruje gra. W lobby, które hostujesz, boty zajmują każde
miejsce, którego nikt nie wziął, więc możesz ćwiczyć albo grać z mniejszą liczbą
znajomych.

## Kto gra botem

Nikt nie dodaje botów: lobby wymienia tylko swoich ludzi. Gdy kończy się
[Lobby drużyny](modes.md#lobby-drużyny), każda strona gra wybranym buildem
drużyny, a każdą jego postacią, której nikt nie zajął, gra bot pod jej nazwą.
Strona bez ludzi gra losową gotową drużyną złożoną z samych botów. Kto wyjdzie
w trakcie Lobby drużyny, zostawia swoją postać botowi.

W lobby i w Lobby drużyny bot wygląda jak każdy inny. W meczu ma oznaczenie **BOT**
na tabliczce z nazwą, w ramce celu, w oknie grupy i w podsumowaniu meczu.

Boty powstają na jeden mecz: po jego zakończeniu lobby znów wymienia swoich ludzi,
a boty następnego meczu tworzone są od nowa.

## Jak walczą boty

Bot odgrywa rolę, którą nadaje mu build. Bot z bronią do walki wręcz jest
**frontowcem**: podchodzi i atakuje cel. Bot z co najmniej dwoma leczeniami lub
osłonami, które może rzucić na sojusznika, jest **uzdrowicielem**: stoi za
najbardziej rannym sojusznikiem, z dala od wrogów. Gdy dwóch lub więcej wrogów
skupia się na jednym sojuszniku, uzdrowiciel nakłada na niego osłonę, zanim padnie
cios. Każdy inny bot walczy **z dystansu**: trzyma się miejsca, z którego sięgają
wszystkie jego ataki, a wroga, który podejdzie zbyt blisko, zwalcza na miejscu.
Boty dystansowe i uzdrowiciele przechodzą tam, gdzie może ich dosięgnąć mniej
wrogów, i chowają się za filarami. Drużyna rzuca się na każdego wroga w zasięgu,
który spadnie poniżej 60% zdrowia, by go dobić. W Królu wzgórza, gdy twoja drużyna
nie utrzymuje ołtarza, Upiorny Bohater drugiej drużyny na ołtarzu ma pierwszeństwo
nawet przed tym. Bot, który znacznie wysunie się przed drużynę, czeka na resztę,
zanim ruszy dalej.

Gdy w pobliżu nie ma wroga, bot przestawia dźwignię, która otwiera krótszą drogę do wrogów.

Boty zadające obrażenia wstrzymują swoje mocne ciosy, umiejętności ataku i czary
obrażeń, i odpalają je razem na cel drużyny, by obrażenia spadły naraz, a nie
sączyły się tak, że uzdrowiciel zdąży je cofnąć: najwolniejszy czar idzie
pierwszy, a szybszy o tyle później, o ile jest szybszy. W tym czasie wciąż
wykonują zamachy i rzucają klątwy oraz dolegliwości. Bot czeka na sojuszników
najwyżej cztery sekundy, a na dobicie wroga poniżej 30% zdrowia wcale nie czeka.
Gdy cel jest pod ochronnym zaczarowaniem, jak Protective Spirit lub Aegis, bot
z umiejętnością zdejmującą zaczarowania, jak Strip Enchantment, najpierw je zdejmuje,
a pozostałe wstrzymują dla niego ciosy.

Ciężko ranny bot, który przegrywa walkę, cofa się za swojego uzdrowiciela lub
do bazy i odpoczywa poza zasięgiem, aż odzyska większość zdrowia.

Bot wskrzesza poległego sojusznika tylko wtedy, gdy wrogowie nie stoją nad ciałem,
a w pobliżu jest więcej jego drużyny niż wrogów, i nigdy wtedy, gdy pobliski wróg
ma na celu samego bota.

Boty robią unik przed mniej więcej połową wymierzonych w nie pocisków, takich jak
Fireball czy strzała z umiejętności ataku, więc zatrzymanie się lub skręt działają
na nie tak samo jak na ciebie.

Boty omijają płonącą ziemię i inne szkodliwe miejsca, gdy obejście nie jest
dużo dłuższe, i wychodzą z takiego, w którym stoją.

Bot z przerwaniem zachowuje je na rzucania, które mają znaczenie: najpierw
wskrzeszenie albo Upiornego Bohatera przejmującego ołtarz, potem leczenie lub
osłonę, umiejętność elitarną albo mocny cios, taki jak umiejętność ataku lub czar
obrażeń. Wszystko inne, i zwykły cios bronią, przepuszcza. Tak jak gracz, nie
trafia mniej więcej w jedno na cztery takie rzucania.

Bot potrzebuje ludzkiej chwili, ułamka sekundy, by zareagować na to, co się dzieje,
więc szybkie przerwanie lub spóźniony unik mogą go pokonać.

W walce trzech drużyn boty walczą z jedną wrogą drużyną naraz: z tą, która je
atakuje, albo, gdy nikt ich nie atakuje, z najbardziej ranną w zasięgu. Zostają
przy tej drużynie, dopóki inna nie rzuci na nie wyraźnie więcej graczy, i nie
szarżują na świeżą drużynę, gdy inna je atakuje. Cel wskazany przez ich drużynę ma
pierwszeństwo, niezależnie od tego, do której drużyny należy. Liczą się tylko
gracze: stojący w pobliżu duch lub strażnicy drużyny nie sprawiają, że boty się na
nią rzucą.

## Arena losowa

Arena losowa nie ma botów: każde miejsce zajmuje prawdziwy gracz i czekasz, aż
w kolejce będzie ich dość.
