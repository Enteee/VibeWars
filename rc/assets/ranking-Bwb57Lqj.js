var e=`# Rangiranje

## Što je rangirano

Svaki meč iz reda bez botova je rangiran: Nasumična arena i Timska
arena. Igra s domaćinom, Vježba i svaki meč s botom nisu rangirani.
Nema prekidača za to ni zasebnog reda. Rangirani meč nikad ne popunjava
prazno mjesto botom.

## Tvoj rejting

Tvoj rejting pripada tvom ključu igrača, onome koji ovaj preglednik
čuva. Svi likovi koje igraš s njim dijele taj jedan rejting.

Rangirani redovi spajaju igrače sličnog rejtinga i dijele ih u timove
sličnog prosječnog rejtinga. Potraga počinje unutar 100 bodova tvog
rejtinga i širi se za 10 bodova za svaku sekundu čekanja, do 600, pa
nitko ne čeka vječno. Dok čekaš, red prikazuje tvoj rejting.

Tvojih prvih 10 rangiranih mečeva je privremeno: red kaže
**Privremeno (3/10 mečeva)** i još nemaš mjesto. Nakon toga glavni
izbornik prikazuje tvoje mjesto. Rejting slabi: svaki dan bez
rangiranog meča čini tvoj manje sigurnim, a ljestvica poreda po opreznoj
vrijednosti, pa ako prestaneš igrati, tvoje mjesto padne unutar nekoliko
tjedana.

Čim ljestvica ima 20 etabliranih igrača, rangirani meč se računa samo
ako je barem jedan igrač u njemu etabliran (10 ili više rangiranih
mečeva): meč samo između novih igrača nije rangiran. Igraj protiv nekoga
etabliranog i tvoji mečevi se računaju.

Gumb **Ljestvica** na gornjoj traci prikazuje najboljih 100 po mjestu,
imenu i rejtingu, s tvojim retkom istaknutim.

Rang heroja (★) nije ovaj rejting: dolazi iz slave, vidi
[Uspon heroja](modes.md#uspon-heroja).

## Početak meča

Kad se pronađe rangirani meč, svi ga potvrđuju u roku od 15 sekundi, a
zaslon prikazuje **Potvrđivanje rangiranog meča…**. Ako netko ne
potvrdi, meč se otkazuje i svi se vraćaju u red.

## Kraj meča

Na kraju svi potpisuju rezultat u roku od 30 sekundi. Nepotpisivanje se
računa kao napuštanje, a napuštanje rangiranog meča računa se kao
poraz, i domaćinu također. Gumb za napuštanje to kaže. Rezultat se
računa samo ako ga potpiše više od pola mjesta.

## Što se objavljuje

Potvrda meča objavljuje se na javnim Nostr relejima. Sadrži javni ključ
i ime lika svakog igrača (igrač bez lika naveden je kao starter) te tko
je igrao protiv koga. Svatko je može pročitati i ne može se povući.
Nerangirani mečevi ne objavljuju ništa.

## Kada se ažurira

Tvoj rejting mijenja se unutar sat vremena, a s njim i ljestvica.
`;export{e as default};
//# sourceMappingURL=ranking-Bwb57Lqj.js.map