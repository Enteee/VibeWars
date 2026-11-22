# Rankkaus

## Mikä on rankattua

Jokainen jonosta tuleva ottelu ilman botteja on rankattu: Satunnaisareena
ja Tiimiareena. Isännöity peli, Harjoitus ja jokainen ottelu, jossa on
botti, ovat rankkaamattomia. Sille ei ole kytkintä eikä erillistä jonoa.
Rankattu ottelu ei koskaan täytä tyhjää paikkaa botilla.

## Luokituksesi

Luokituksesi kuuluu pelaaja-avaimellesi, sille jota tämä selain säilyttää.
Kaikki hahmot, joilla sillä pelaat, jakavat saman luokituksen.

Rankatut jonot yhdistävät keskenään samankaltaisen luokituksen pelaajia
ja jakavat heidät tiimeihin, joiden keskiluokitus on samankaltainen. Haku
alkaa 100 pisteen päästä luokituksestasi ja laajenee 10 pisteellä jokaista
odotettua sekuntia kohden, enintään 600:aan, joten kukaan ei odota
ikuisesti. Odottaessasi jono näyttää luokituksesi.

Ensimmäiset 10 luokiteltua otteluasi ovat alustavia: jono sanoo
**Alustava (3/10 ottelua)**, eikä sinulla ole vielä sijaa. Sen jälkeen
päävalikko näyttää sijasi. Luokitus rapautuu: jokainen päivä ilman
luokiteltua ottelua tekee siitä epävarmemman, ja tulostaulu järjestää
varovaisen arvon mukaan, joten jos lopetat pelaamisen, sijasi laskee
viikoissa.

Kun tulostaululla on 20 vakiintunutta pelaajaa, rankattu ottelu
lasketaan vain, jos ainakin yksi sen pelaajista on vakiintunut (10 tai
enemmän luokiteltua ottelua): pelkästään uusien pelaajien välinen ottelu
on luokittelematon. Pelaa vakiintunutta pelaajaa vastaan, niin otteluusi
lasketaan.

Yläpalkin **Tulostaulu**-painike näyttää 100 parasta sijan, nimen ja
luokituksen mukaan, oma rivisi korostettuna.

Sankarisija (★) ei ole tämä luokitus: se tulee maineesta, katso
[Sankarien nousu](modes.md#sankarien-nousu).

## Ottelun alku

Kun rankattu ottelu löytyy, kaikki vahvistavat sen 15 sekunnin sisällä,
ja näytössä lukee **Vahvistetaan rankattua ottelua…**. Jos joku ei
vahvista, ottelu perutaan ja kaikki palaavat jonoon.

## Ottelun loppu

Lopuksi kaikki allekirjoittavat tuloksen 30 sekunnin sisällä.
Allekirjoittamatta jättäminen lasketaan poistumiseksi, ja rankatusta
ottelusta poistuminen lasketaan tappioksi, isännältäkin. Poistumispainike
kertoo sen. Tulos lasketaan vain, jos yli puolet paikoista allekirjoitti
sen.

## Mitä julkaistaan

Ottelun kuitti julkaistaan julkisille Nostr-välittimille. Siinä on
jokaisen pelaajan julkinen avain ja hahmon nimi (pelaaja ilman hahmoa
merkitään nimellä starter) sekä se, kuka pelasi ketä vastaan. Kuka tahansa
voi lukea sen, eikä sitä voi ottaa takaisin. Rankkaamattomat ottelut eivät
julkaise mitään.

## Milloin se päivittyy

Luokituksesi muuttuu tunnin sisällä, ja tulostaulu sen mukana.
