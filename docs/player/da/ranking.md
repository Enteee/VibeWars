# Rangering

## Hvad der er rangeret

Hver kamp fra køen uden bots i er rangeret: Tilfældig arena og
Holdarena. Et Værtsspil, Træningsbane og enhver kamp med en bot i er
urangeret. Der er ingen kontakt til det og ingen separat kø. En
rangeret kamp fylder aldrig en tom plads op med en bot.

## Din rating

Din rating tilhører din spillernøgle, den som denne browser opbevarer.
Alle karakterer, du spiller på den, deler den ene rating.

Rangerede køer parrer spillere med nogenlunde samme rating og deler
dem i hold med nogenlunde samme gennemsnitlige rating. Søgningen
starter inden for 100 point fra din rating og udvides med 10 point for
hvert sekund, du venter, op til 600, så ingen venter for evigt. Mens
du venter, viser køen din rating.

Dine første 10 ratede kampe er foreløbige: køen siger **Foreløbig
(3/10 kampe)**, og du har endnu ingen placering. Derefter viser
hovedmenuen din placering. Ratings forfalder: hver dag uden en rated
kamp gør din mindre sikker, og ranglisten sorterer efter en forsigtig
værdi, så hvis du holder op med at spille, synker din placering inden
for uger.

Når ranglisten har 20 etablerede spillere, tæller en rangeret kamp kun,
hvis mindst én spiller i den er etableret (10 eller flere ratede
kampe): en kamp kun mellem nye spillere er ikke ratet. Spil mod en
etableret spiller, så tæller dine kampe.

Knappen **Rangliste** i topbjælken viser top 100 med placering, navn og
rating, med din egen række fremhævet.

Heltegraden (★) er ikke denne rating: den kommer fra berømmelse, se
[Heltenes opstigning](modes.md#heltenes-opstigning).

## Kampen starter

Når en rangeret kamp er fundet, bekræfter alle den inden for 15
sekunder, og skærmen siger **Bekræfter rangeret kamp…**. Hvis nogen ikke
gør det, aflyses kampen, og alle går tilbage i køen.

## Kampen slutter

Til sidst underskriver alle resultatet inden for 30 sekunder. At lade
være tæller som at forlade kampen, og at forlade en rangeret kamp
tæller som et nederlag, også for værten. Knappen til at forlade siger
det. Et resultat tæller kun, hvis mere end halvdelen af pladserne har
underskrevet det.

## Hvad der offentliggøres

Kampens kvittering går til offentlige Nostr-relæer. Den indeholder hver
spillers offentlige nøgle og karakternavn (en spiller uden karakter
navngives som nybegynder) og hvem der spillede mod hvem. Alle kan læse
den, og den kan ikke tages tilbage. Urangerede kampe offentliggør
intet.

## Hvornår det opdateres

Din rating flytter sig inden for en time, og ranglisten med den.
