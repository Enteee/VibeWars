# Botit

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
tuohon liittolaiseen ennen kuin osuma osuu. Jokainen muu botti on
**kaukotaistelija**: se pysyttelee siellä, minne kaikki sen hyökkäykset
ylettyvät, ja pysähtyy taistelemaan liian lähelle tulevaa vihollista
vastaan. Kaukotaistelijabotit ja parantajat siirtyvät paikkoihin, joihin
harvemmat viholliset ylettyvät, ja käyttävät pylväitä suojana. Tiimi
kääntyy minkä tahansa ulottuvilla olevan vihollisen kimppuun, jonka
terveys putoaa alle 60 %:n, viimeistelläkseen sen. Kukkulan kuninkaassa,
kun tiimisi ei hallitse alttaria, toisen tiimin alttarilla oleva
aavesankari menee jopa sen edelle. Botti, joka etenee kauas tiiminsä
edelle, odottaa muita ennen kuin jatkaa.

Kun yhtään vihollista ei ole lähellä, botti kääntää vivun, joka avaa lyhyemmän tien vihollisten luo.

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

Keskeytystaidolla varustettu botti säästää sen tärkeitä käyttöjä varten:
ensin henkiin herättäminen tai alttaria valtaava aavesankari, sitten
parannus tai suojaus, eliittitaito tai iso isku, kuten hyökkäystaito tai
vahinkoloitsu. Kaiken muun, ja tavallisen aseiskun, se päästää läpi.
Pelaajan tavoin se missaa noin yhden neljästä tällaisesta käytöstä.

Botilta kuluu ihmismäinen hetki, sekunnin murto-osa, reagoida
tapahtumiin, joten nopea keskeytys tai myöhäinen väistö voi päihittää
sen.

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
