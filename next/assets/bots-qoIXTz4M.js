var e=`# Botit

**Botti** on pelaaja, jota peli pelaa puolestasi. Isännöimässäsi aulassa
botit pelaavat jokaisen paikan, jota kukaan ei ota, joten voit harjoitella
tai pelata pienemmällä ystäväjoukolla.

## Kuka pelaa bottia

Kukaan ei lisää botteja: aula luettelee vain ihmisensä. Kun
[tiimiaula](modes.md#tiimiaula) päättyy, kumpikin puoli pelaa valitsemallaan
tiimibuildilla, ja jokaista sen hahmoa, jota kukaan ei lunastanut, pelaa
botti kyseisen hahmon nimellä. Puoli, jolla ei ole ketään, pelaa
satunnaisella valmiilla tiimillä, pelkillä boteilla. Joku, joka poistuu
tiimiaulan aikana, jättää hahmonsa botille.

Aulassa ja tiimiaulassa botti näyttää samalta kuin kuka tahansa muu.
Ottelussa se on merkitty **BOT** nimikyltissään, kohdekehyksessä,
ryhmäikkunassa ja ottelun yhteenvedossa.

Botit tehdään yhtä ottelua varten: kun se on ohi, aula luettelee taas
ihmisensä, ja seuraavan ottelun botit tehdään uudelleen.

## Miten botit taistelevat

Botti pelaa roolia, jonka sen buildi sille antaa. Lähitaisteluasetta
käyttävä on **etulinja**: se menee lähelle ja hyökkää kohteensa kimppuun.
Botti, jolla on kaksi tai useampia parannuksia tai suojauksia, joita se voi
loitsia liittolaiseen, on **parantaja**: se seisoo eniten haavoittuneen
liittolaisen takana, poissa vihollisten luota. Kun kaksi tai useampia
vihollisia keskittyy yhteen liittolaiseen, parantaja laittaa suojauksensa
tuohon liittolaiseen ennen kuin osuma osuu. Parantaja säästää tarpeeksi
energiaa halvimpaan parannukseensa tai suojaukseensa ja käyttää sen alle
vain todellisessa vaarassa olevaan liittolaiseen. Jokainen muu botti on
**kaukotaistelija**: se pysyttelee siellä, minne kaikki sen hyökkäykset
ylettyvät, ja pysähtyy taistelemaan liian lähelle tulevaa vihollista
vastaan. Kaukotaistelijabotit ja parantajat siirtyvät paikkoihin, joihin
harvemmat viholliset ylettyvät, ja käyttävät pylväitä suojana. Tiimi
kääntyy minkä tahansa ulottuvilla olevan vihollisen kimppuun, jonka
terveys putoaa alle 60 %:n, viimeistelläkseen sen. Kukkulan kuninkaassa,
kun tiimisi ei hallitse alttaria, toisen tiimin alttarilla oleva
aavesankari menee jopa sen edelle. Pelkistä boteista koostuvassa tiimissä
botti, joka etenee kauas tiiminsä edelle, odottaa muita ennen kuin jatkaa.
Sinun tiimisi botit sen sijaan pysyvät kanssasi: etulinja askeleen edellä,
kaukotaistelijat vierelläsi, parantajat takana, ja ne seuraavat sinua minne
menetkin. Kun olet seissyt toimettomana jonkin aikaa, ne pelaavat eteenpäin
niin kuin pelkkien bottien tiimi pelaisi.
Kun olet aktiivinen, botti, jonka taistelu on vetänyt kauas sinusta, kävelee takaisin luoksesi, ellei se ole pahasti haavoittunut tai vihollinen ole aivan sen vieressä.
Etulinjan botti kääntyy vihollista vastaan, joka hyökkää sen joukkueen parantajan tai loitsijoiden kimppuun, ellei se ole juuri viimeistelemässä omaa kohdettaan.
Botti, jolla on aluetaika, heittää sen sinne, missä kolme tai useampi vihollinen seisoo yhdessä, ellei joukkue ole viimeistelemässä vihollista tai seuraamassa kuulutettua kohdetta.
Botti, jolla on rampauttava tai hidastava taito, käyttää sen viereensä tulleeseen viholliseen tai joukkueensa parantajan tai loitsijoiden kimppuun käyvään viholliseen ennen joukkueen kohdetta.

Aluetaitoja käyttävää joukkuetta vastaan kaukotaistelijabotit ja parantajat pysyvät erillään, jotta yksi räjähdys ei osu kahteen. Ne eivät koskaan luovu suojasta sen vuoksi.

Kaukotaistelija tai parantaja, jonka luo vihollinen tulee liian lähelle, vetäytyy ensin lähimmän etulinjan tiimiläisensä luo, jos tämä on tarpeeksi lähellä, ja taistelee siellä. Hidastettu lähitaistelija, esimerkiksi rampautettu, ei pysy perässä, joten sitä vastaan botti perääntyy sen sijaan laukausten välissä.

Botti, jolla on hyökkäämisestä tai loitsimisesta rankaiseva kirous, kuten Empathy tai Backfire, lopettaa sen, kunnes kirous päättyy.

Jousiampujat ja keihäänheittäjät ottavat korkean maaston, kun se on turvallista.
Botti, johon kaksi vihollista keskittyy tai jonka terveys on alle puolet ja hupenee nopeasti, piiloutuu heidän näkyvistään enintään kolmeksi sekunniksi: muurin taakse, tasanteen alle tai korkealle maastolle.
Kun yhtään vihollista ei ole lähellä, botti kääntää vivun, joka avaa lyhyemmän tien vihollisten luo. Kaksi bottia myös murtaa muurin, joka kätkee paljon lyhyemmän tien, lyömällä sitä aseillaan.

Vahinkoa tekevät botit pidättävät isoja iskujaan, hyökkäystaitoja ja
vahinkoloitsuja, ja laukaisevat ne yhdessä tiimin kohteeseen, jotta
vahinko osuu kerralla eikä tihku vähitellen parantajan korjattavaksi:
hitain loitsu lähtee ensin, nopeampi sen verran myöhemmin kuin se on
nopeampi. Sillä välin ne jatkavat lyömistä ja kirousten ja vaivojen
loitsimista. Botti odottaa tiimitovereitaan enintään neljä sekuntia
eikä odota lainkaan viimeistelläkseen vihollisen, jonka terveys on alle
30 %. Kun kohde on suojaavan lumouksen, kuten Protective Spiritin tai
Aegisin, alla, botti, jolla on lumouksen riisuva taito, kuten Strip
Enchantment, poistaa sen ensin, ja muut pidättävät iskujaan sitä varten.
Jos joukkueella ei ole lumouksen riisuvaa taitoa, botit jättävät suojatun
vihollisen ja kääntyvät toiseen, kunnes lumous päättyy.

Pahasti haavoittunut botti, joka on häviämässä taistelunsa, vetäytyy
parantajansa taakse tai tukikohtaansa ja lepää ulottumattomissa, kunnes
suurin osa sen terveydestä on palannut.

Botti herättää kaatuneen liittolaisen henkiin vain, kun viholliset eivät
ole ruumiin päällä, sen lähellä seisoo enemmän sen omaa tiimiä kuin
vihollisia, eikä koskaan, kun lähellä oleva vihollinen kohdistaa itse
bottiin.

Botit väistävät noin puolet niihin tähdätyistä taitoammuksista, kuten
Fireballin tai hyökkäystaidon nuolen, joten pysähtyminen tai kääntyminen
toimii niille kuten sinullekin.

Botit kiertävät palavan maan ja muut haitalliset alueet, kun kiertotie ei
ole paljon pidempi, ja astuvat pois alueelta, jolla seisovat.
Ne astuvat myös pois vastustajan vahingolliselta alueelta, kuten kaivosta, niitä vastaan suunnatusta suojasta tai myrskystä, ja taistelevat sen reunalta.

Keskeytystaidolla varustettu botti säästää sen tärkeitä käyttöjä varten:
ensin henkiin herättäminen tai alttaria valtaava aavesankari, sitten
parannus tai suojaus, eliittitaito tai iso isku, kuten hyökkäystaito tai
vahinkoloitsu. Kaiken muun, ja tavallisen aseiskun, se päästää läpi.
Pelaajan tavoin se missaa noin yhden neljästä tällaisesta käytöstä.

Botilta kuluu ihmismäinen hetki, sekunnin murto-osa, reagoida
tapahtumiin, joten nopea keskeytys tai myöhäinen väistö voi päihittää
sen.

Kun kukaan tiimissäsi ei ole ilmoittanut kohdetta, yksi boteistasi
ilmoittaa vihollisen, johon botit keskittyvät, aivan kuten sinä
tekisit: näet merkin ja botin nimen, joten voit liittyä mukaan. Botin
ilmoitus näyttää vain, minne botit ovat menossa; ne suojaavat silti
tiimitoveria ja viimeistelevät kuolevan vihollisen. Oma ilmoituksesi
voittaa aina: jokainen tiimin botti keskittyy kohteeseesi, mikään botti
ei korvaa ilmoitustasi, ja botit ilmoittavat uudelleen vasta, kun
ilmoitettu kohde on kuollut tai poissa.

Kolmen tiimin taistelussa botit taistelevat yhtä vihollistiimiä vastaan
kerrallaan: tiimiä, joka hyökkää niiden kimppuun, tai, kun kukaan ei
hyökkää, eniten haavoittunutta ulottuvilla olevaa tiimiä. Ne pysyvät
siinä tiimissä, kunnes toinen lähettää selvästi enemmän pelaajia niiden
kimppuun, eivätkä ne hyökkää uuden tiimin kimppuun, kun toinen hyökkää
niiden kimppuun. Kohde, jonka niiden tiimi on ilmoittanut, tulee ensin,
oli se missä tiimissä tahansa. Vain pelaajat lasketaan: lähellä seisovat
tiimin aave tai vartijat eivät saa botteja kääntymään sitä tiimiä
vastaan.

## Satunnaisareena

Satunnaisareenalla ei ole botteja: jokainen paikka on oikea pelaaja, ja
odotat, kunnes jonossa on tarpeeksi pelaajia.
`;export{e as default};
//# sourceMappingURL=bots-qoIXTz4M.js.map