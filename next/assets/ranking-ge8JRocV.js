var e=`# Rangsorolás

## Mi számít rangsoroltnak

Minden sorból jövő, botok nélküli meccs rangsorolt: a Véletlen Aréna és
a Csapataréna. A Saját játék, a Gyakorlótér és minden olyan meccs,
amelyben bot van, rangsorolatlan. Ehhez nincs kapcsoló és külön sor
sincs. A rangsorolt meccs soha nem tölt be üres helyet bottal.

## A pontszámod

A pontszámod a játékoskulcsodhoz tartozik, ahhoz, amelyet ez a böngésző
tárol. Minden karakter, amellyel ezen játszol, ugyanazt a pontszámot
használja.

A rangsorolt sorok hasonló pontszámú játékosokat párosítanak, és
hasonló átlagpontszámú csapatokra osztják őket. A keresés a pontszámod
100 pontos környezetében kezd, és minden várakozással töltött
másodperccel 10 ponttal bővül, legfeljebb 600-ig, így senki sem vár
örökké. Várakozás közben a sor mutatja a pontszámodat.

Az első 10 pontozott meccsed ideiglenes: a sor azt írja, **Ideiglenes
(3/10 meccs)**, és még nincs helyezésed. Ezután a főmenü mutatja a
helyezésedet. A pontszám kopik: minden nap pontozott meccs nélkül
bizonytalanabbá teszi, és a ranglista egy óvatos érték szerint rendez,
így ha abbahagyod a játékot, a helyezésed heteken belül süllyed.

Amint a ranglistán 20 megalapozott játékos van, egy rangsorolt meccs
csak akkor számít, ha legalább egy játékosa megalapozott (10 vagy több
pontozott meccs): a csak új játékosok közötti meccs nem pontozott.
Játssz valakivel, aki már megalapozott, és a meccseid számítanak.

A felső sáv **Ranglista** gombja a legjobb 100-at mutatja helyezés,
név és pontszám szerint, a saját sorodat kiemelve.

A hősrang (★) nem ez a pontszám: a hírnévből jön, lásd
[Hősök Útja](modes.md#hősök-útja).

## A meccs indulása

Amikor megvan a rangsorolt meccs, mindenki 15 másodpercen belül
megerősíti, és a képernyőn ez áll: **Rangsorolt meccs megerősítése…**.
Ha valaki nem erősít meg, a meccs elmarad, és mindenki visszakerül a
sorba.

## A meccs vége

A végén mindenki 30 másodpercen belül aláírja az eredményt. Az
aláírás elmulasztása kilépésnek számít, a rangsorolt meccs elhagyása
pedig vereségnek, a hosztét is. A kilépés gomb ezt jelzi. Az eredmény
csak akkor számít, ha a helyek több mint fele aláírta.

## Mi kerül nyilvánosságra

A meccs nyugtája nyilvános Nostr reléken jelenik meg. Tartalmazza
minden játékos nyilvános kulcsát és karakternevét (a karakter nélküli
játékos starterként szerepel), valamint azt, hogy ki kivel játszott.
Bárki elolvashatja, és nem vonható vissza. A rangsorolatlan meccsek
semmit sem tesznek közzé.

## Mikor frissül

A pontszámod egy órán belül változik, és vele a ranglista is.
`;export{e as default};
//# sourceMappingURL=ranking-ge8JRocV.js.map