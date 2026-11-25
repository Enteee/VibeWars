# Osnove borbe

## Zdravlje i energija

Počinješ s 480 **zdravlja** i 20 **energije**, a oklop ti dodaje energiju:
Ratniku ništa, Lovcu, Asasinu ili Dervišu 5, svima ostalima 10. Staff dodaje
još 10 dok ga držiš. Rune i moral mijenjaju oboje. Vještine troše energiju, a ona se vraća sama od sebe, polako. ![Ratnik](../../../apps/web/public/icons/profession/warrior.svg) **Ratnici**
i ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragoni** obnavljaju je najsporije, ![Lovac](../../../apps/web/public/icons/profession/ranger.svg) **Lovci** malo brže, svi ostali
najbrže.

Strelice na tvojim trakama su **pipovi**: svaka je zdravlje ili energija koji se
vraćaju ili odlaze, po malo svake sekunde. ![Krvarenje](../../../apps/web/public/icons/status/bleeding.svg) **Krvarenje**, ![Gorenje](../../../apps/web/public/icons/status/burning.svg) **Gorenje** i
![Otrov](../../../apps/web/public/icons/status/poison.svg) **Otrov** oduzimaju zdravlje; Regeneration i čarolije liječenja ga dodaju. Nakon 5
sekundi izvan borbe zdravlje ti se počinje vraćati samo od sebe, sve brže
što dulje ostaješ izvan nje.

## Adrenalin

![Ratnik](../../../apps/web/public/icons/profession/warrior.svg) **Ratnici**, ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragoni** i drugi imaju vještine koje umjesto energije troše
**adrenalin**. Svaka takva vještina puni se zasebno: svaki pogodak oružjem
koji zadaš daje svakoj od njih jedan udarac, a isto vrijedi i kad primiš velik pogodak. Korištenje
jedne prazni je i oduzima po jedan udarac ostalima. Nakon 25 sekundi
izvan borbe sve se isprazne.

## Korištenje vještine

Vještini može trebati trenutak za **bacanje**, a zatim joj treba vrijeme za
**obnavljanje** prije nego što je možeš ponovno koristiti. Ako je meta izvan dometa,
najprije hodaš do nje. Kretanje ili Esc prekidaju bacanje: energija je potrošena,
ali se vještina ne obnavlja. Nakon svake vještine s vremenom bacanja, osim
![Vještina napada](../../../apps/web/public/icons/skill-type/attack.svg) **vještina napada**, slijedi kratka stanka u kojoj ne možeš djelovati.

Vještina koju pritisneš dok koristiš drugu ili u toj stanci ide **u red**:
na redu je sljedeća, a njezino mjesto pulsira dok ne krene. Čeka samo jedna; pritisak
na drugu zamjenjuje je. Kretanje, Esc, prekid ili obaranje je izbacuju.

![Povik](../../../apps/web/public/icons/skill-type/shout.svg) **Povici** i ![Stav](../../../apps/web/public/icons/skill-type/stance.svg) **stavovi** nikad ne idu u red: aktiviraju se odmah, čak i dok
bacaš drugu vještinu, u toj stanci ili dok si oboren. Bacanje se
nastavlja. Tako korišteni ne dovode te u domet: izvan dometa bivaju odbijeni.

## Prekidi i obaranje

**Prekid** zaustavlja neprijateljsku vještinu dok je baca. Njegova
energija je potrošena i vještina se obnavlja; neki prekidi usto na neko vrijeme
zaključavaju vještinu. Prekid prerano ili prekasno ne čini ništa.

Svaka profesija ima vlastiti zvuk kad koristi vještinu; slušaj zvuk svoje mete.

Većina prekida zaustavlja i običan napad u zamahu: taj udarac nikad ne
padne i zamah počinje iznova. Neprijatelj koji još hoda do mete
nema što prekinuti. Prekid na čijoj kartici piše "vještina" ili
"čarolija" ne dira običan napad.

Neki ![Stav](../../../apps/web/public/icons/skill-type/stance.svg) **stavovi**, poput Mantra of Concentration, zaustavljaju prekid usmjeren
na tebe. Nijedan ne zaustavlja obaranje.

**Oboren** nakratko ne možeš hodati, napadati ni koristiti vještinu,
osim ![Povik](../../../apps/web/public/icons/skill-type/shout.svg) **povika** ili stava, a bacanje u tijeku ne uspijeva.

## Stanja, uroci i začaranja

**Stanja** ti štete dok ne isteknu ili se ne uklone:

| Stanje                                                                                        | Što radi                                                |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| ![Krvarenje](../../../apps/web/public/icons/status/bleeding.svg) **Krvarenje**                | oduzima zdravlje                                        |
| ![Gorenje](../../../apps/web/public/icons/status/burning.svg) **Gorenje**                     | brzo oduzima zdravlje                                   |
| ![Otrov](../../../apps/web/public/icons/status/poison.svg) **Otrov**                          | oduzima zdravlje                                        |
| ![Bolest](../../../apps/web/public/icons/status/disease.svg) **Bolest**                       | oduzima zdravlje i širi se na istu vrstu tijela do tebe |
| ![Osakaćenost](../../../apps/web/public/icons/status/crippled.svg) **Osakaćenost**            | krećeš se upola sporije                                 |
| ![Zaslijepljenost](../../../apps/web/public/icons/status/blind.svg) **Zaslijepljenost**       | većina tvojih napada promaši                            |
| ![Slabost](../../../apps/web/public/icons/status/weakness.svg) **Slabost**                    | tvoje oružje udara znatno slabije                       |
| ![Napuknut oklop](../../../apps/web/public/icons/status/cracked-armor.svg) **Napuknut oklop** | manje oklopa                                            |
| ![Duboka rana](../../../apps/web/public/icons/status/deep-wound.svg) **Duboka rana**          | manje najvećeg zdravlja i slabije liječenje             |
| ![Omamljenost](../../../apps/web/public/icons/status/dazed.svg) **Omamljenost**               | čarolije se bacaju sporo; svaki ih napad prekida        |

Sluge (osim Mesnog golema), sablasti i duhovi ne krvare, ne truju se i ne obolijevaju, a duhovi ne primaju nijedan urok ni stanje osim **Gorenja**.

![Urok](../../../apps/web/public/icons/skill-type/hex.svg) **Uroke** na tebe bacaju neprijatelji, a ![Začaranje](../../../apps/web/public/icons/skill-type/enchantment.svg) **začaranja** ti sam ili tvoji
saveznici. Svako uklanja vlastita vrsta vještine. Neka su začaranja
**održavana**: traju dok ih ne prekineš i troše jedan pip energije dok
traju. Dvaput klikni njegovu ikonu da ga prekineš.

Nekoliko vještina prestaje raditi dok si začaran, a opet rade kad
više nisi. Vještina koja traje za tvojih "sljedećih N napada" broji svaki
napad, pa promašaj ili blokada troše jedan jednako kao i pogodak.

## Oklop i šteta

![Ratnik](../../../apps/web/public/icons/profession/warrior.svg) **Ratnici** i ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragoni** nose najviše oklopa; ![Lovac](../../../apps/web/public/icons/profession/ranger.svg) **Lovci**, ![Asasin](../../../apps/web/public/icons/profession/assassin.svg) **Asasini** i
![Derviš](../../../apps/web/public/icons/profession/dervish.svg) **Derviši** manje; bacači čarolija najmanje. Oklop smanjuje štetu od oružja, elementarnu, chaos
i dark štetu. Holy, shadow i šteta bez vrste, oduzimanje zdravlja i krađa
života zaobilaze ga. Samo pogoci oružjem mogu biti kritični.
Neka začaranja svog nositelja čine imunim na kritične pogotke.

## Smrt, uskrsnuće i moral

U većini načina mrtvi ostaju ležati dok ih saveznik ne **uskrsne**
vještinom, poput Resurrection Signet, koju može uzeti svatko. Neki načini
vraćaju mrtve u valovima ili same od sebe; vidi [Načine](modes.md).

Dok si mrtav, redak ispod semafora odbrojava do tvog povratka ili ti
kaže da čekaš uskrsnuće. Prozor družine prikazuje odbrojavanje uz svakog
mrtvog saveznika.

Svaka smrt stoji te 15% **morala**, do -60%: tvoje najveće zdravlje
i energija smanjuju se s njim. Svaki neprijatelj kojeg tvoj tim ubije vraća 2%,
do 0. U Bitki cehova držanje stalka za zastavu diže ga iznad toga,
do +10%.
