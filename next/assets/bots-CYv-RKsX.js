var e=`# Botok

A **bot** olyan játékos, akit helyetted a játék irányít. Az általad
létrehozott lobbiban a botok minden helyet betöltenek, amelyet senki sem
foglal el, így gyakorolhatsz, vagy kevesebb baráttal is játszhatsz.

## Ki játszik bottal

Botokat senki sem ad hozzá: a lobbi csak az embereit sorolja fel. Amikor
a [Csapatlobbi](modes.md#csapatlobbi) véget ér, mindkét oldal azzal a
Csapatbuilddel játszik, amelyet választott, és minden olyan karakterét,
amelyet senki sem vállalt el, egy bot játssza, a karakter nevén. Az az
oldal, amelyen senki sincs, egy véletlen előre beállított csapattal
játszik, csupa bottal. Aki a Csapatlobbi alatt kilép, a karakterét egy
botra hagyja.

A lobbiban és a Csapatlobbiban a bot ugyanúgy néz ki, mint bárki más. A
meccsen **BOT** címke jelöli a névtábláján, a célpontkeretben, az
osztagablakban és a meccs összegzésében.

A botok egyetlen meccsre készülnek: amint vége, a lobbi újra az embereit
sorolja fel, és a következő meccs botjai újonnan készülnek.

## Hogyan harcolnak a botok

A bot azt a szerepet játssza, amelyet a buildje ad neki. Amelyik
közelharci fegyvert forgat, az **frontvonalbeli**: közel megy, és
megtámadja a célpontját. Amelyiknek két vagy több gyógyítása vagy
védelme van, amelyet szövetségesre varázsolhat, az **gyógyító**: annak
a szövetségesnek a háta mögé áll, amelyik a legjobban megsérült, távol
az ellenségektől. Amikor két vagy több ellenség egy szövetségesre
összpontosít, a gyógyító a találat előtt ráteszi a védelmét. Minden más
bot **távolsági**: ott marad, ahonnan minden támadása elér, és megáll
harcolni azzal az ellenséggel, amely túl közel jön. A távolsági botok és
a gyógyítók oda lépnek, ahol kevesebb ellenség érheti el őket, és az
oszlopokat fedezéknek használják. A csapat ráfordul minden elérhető
ellenségre, akinek az életereje 60% alá esik, hogy végezzen vele. A
domb urában, amíg a csapatod nem tartja az oltárt, a másik csapat
oltáron álló Kísértethőse még ennél is előbbre való. Az a bot, amelyik
messze a csapata elé kerül, megvárja a többieket, mielőtt továbbnyomul.

A sebzést osztó botok visszatartják a nagy ütéseiket, a
támadókészségeket és a sebző varázslatokat, és együtt sütik el őket a
csapat célpontjára, így a sebzés egyszerre ér be, ahelyett hogy
csepegne, és egy gyógyító visszacsinálhatná: a leglassabb varázslat
indul elsőnek, a gyorsabb pedig annyival később, amennyivel gyorsabb.
Közben tovább suhintanak, és varázsolják az átkaikat és a kóraikat. Egy
bot legfeljebb négy másodpercig vár a csapattársaira, és egyáltalán nem
vár, ha egy 30% életerő alatti ellenséget kell bevégeznie. Amikor a
célpontot védő bűbáj védi, például a Protective Spirit vagy az Aegis,
az a bot, amelyiknek bűbájeltávolítása van, mint a Strip Enchantment,
először azt veszi le, a többiek pedig addig visszatartják az ütéseiket.

A súlyosan megsebesült bot, amely veszíti a harcát, visszahúzódik a
gyógyítója mögé vagy a bázisára, és elérhetetlen helyen pihen, amíg
vissza nem kapja az életereje nagy részét.

A bot csak akkor támaszt fel egy elesett szövetségest, ha az ellenségek
nincsenek a test nyakán, a közelében több áll a saját csapatából, mint
az övékéből, és soha, ha egy közeli ellenség éppen magát a botot veszi
célba.

A botok a rájuk célzott készséglövések nagyjából felét kikerülik, például
egy Fireballt vagy egy támadókészség nyilát, így a megállás vagy a
fordulás náluk is ugyanúgy működik, mint nálad.

A botok megkerülik az égő talajt és a többi ártalmas foltot, ha a kerülő nem
sokkal hosszabb, és kilépnek abból, amelyikben állnak.

A megszakítással rendelkező bot a fontos varázslásokra tartogatja: elsőként
egy feltámasztásra vagy egy oltárt elfoglaló Kísértethősre, aztán egy
gyógyításra vagy védelemre, egy elit készségre vagy egy nagy
ütésre, például egy támadókészségre vagy egy sebző varázslatra. Minden mást,
és a sima fegyverütést is átengedi. Ahogy egy játékos, ő is nagyjából
minden negyedik ilyen varázslást elvéti.

A bot emberszerű pillanatot, a másodperc törtrészét igényli, hogy
reagáljon arra, ami történik, így egy gyors megszakítás vagy egy késői
kitérés legyőzheti.

Háromcsapatos harcban a botok egyszerre egy ellenséges csapattal
harcolnak: azzal, amelyik őket támadja, vagy ha senki sem, az elérhető
legjobban megsérült csapattal. Ezen a csapaton maradnak, amíg egy másik
egyértelműen több játékost nem küld rájuk, és nem rontanak egy friss
csapatra, amíg egy másik őket támadja. Az a célpont, amelyet a csapatuk
bemondott, előbbre való, bármelyik csapatban is van. Csak a játékosok
számítanak: egy csapat közelben álló szelleme vagy őrei nem fordítják a
botokat arra a csapatra.

## Véletlen Aréna

A Véletlen Arénában nincsenek botok: minden helyen valódi játékos áll,
és addig vársz, amíg elegen be nem állnak a sorba.
`;export{e as default};
//# sourceMappingURL=bots-CYv-RKsX.js.map