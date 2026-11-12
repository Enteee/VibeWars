var e=`# Bots

En **bot** er en spiller, som spillet styrer for dig. I en lobby, du er
vært for, spiller bots hver plads, som ingen tager, så du kan øve dig
eller spille med færre venner.

## Hvem spiller en bot

Ingen tilføjer bots: en lobby viser kun sine mennesker. Når
[Holdlobbyen](modes.md#holdlobby) slutter, spiller hver side det
Holdbuild, den valgte, og hver af dens figurer, som ingen har taget,
spilles af en bot under den figurs navn. En side uden nogen på spiller
et tilfældigt forudindstillet hold, kun bots. Den, der forlader
Holdlobbyen undervejs, overlader sin figur til en bot.

I lobbyen og Holdlobbyen ligner en bot alle andre. I kampen er den mærket
**BOT** på sit navneskilt, målrammen, gruppevinduet og kampoversigten.

Bots laves til én kamp: når den er slut, viser lobbyen sine mennesker
igen, og den næste kamps bots laves på ny.

## Hvordan bots kæmper

En bot spiller den rolle, dens build giver den. En med et nærkampsvåben
er **frontlinje**: den rykker tæt på og angriber sit mål. En med to eller
flere helbredelser eller beskyttelser, den kan kaste på en allieret, er
**healer**: den står bag den allierede, der er hårdest ramt, væk fra
fjenderne. Når to eller flere fjender går efter én allieret, lægger en
healer sin beskyttelse på den allierede, før slaget lander. Hver anden bot
er **afstandskæmper**: den holder sig der, hvor hvert af dens angreb
rækker, og står og kæmper mod en fjende, der kommer for tæt på.
Afstandsbots og healere træder hen, hvor færre fjender kan nå dem, og
bruger søjler som dækning. Et hold vender sig mod enhver fjende inden for
rækkevidde, der falder under 60 % liv, for at gøre det af med den. I
Kongen af bakken, mens dit hold ikke holder alteret, går det andet holds
Spøgelseshelt på alteret forud for selv det. En bot, der kommer langt
foran sit hold, venter på resten, før den rykker videre.

Når ingen fjende er nær, trækker en bot i et håndtag, der åbner en kortere vej til fjenderne.

Bots, der giver skade, holder deres store slag, angrebsevner og
skadesbesværgelser tilbage og affyrer dem samlet mod holdets mål, så
skaden lander på én gang i stedet for at sive ind, så en healer kan
rette op på den: den langsomste besværgelse går først, en hurtigere så
meget senere, som den er hurtigere. Imens bliver de ved med at svinge og
kaste deres forbandelser og tilstande. En bot venter højst fire sekunder
på sine holdkammerater og venter slet ikke med at gøre det af med en
fjende under 30 % liv. Når målet er under en beskyttende fortryllelse
såsom Protective Spirit eller Aegis, fjerner en bot med en
fortryllelsesfjerner, som Strip Enchantment, den først, og de andre
holder deres slag tilbage imens.

En hårdt såret bot, der er ved at tabe sin kamp, trækker sig tilbage bag
sin healer eller til sin base og hviler uden for rækkevidde, indtil den
har fået det meste af sit liv tilbage.

En bot genopliver kun en faldet allieret, når fjenderne ikke står oven på
liget, flere fra dens eget hold end fra deres står tæt ved det, og aldrig
mens en fjende tæt på har botten selv som mål.

Bots træder til side for omkring halvdelen af de evneskud, der rettes mod
dem, såsom en Fireball eller en angrebsevnes pil, så det at stoppe eller
vende virker på dem, som det gør på dig.

Bots går uden om brændende jord og andre skadelige områder, når vejen udenom
ikke er meget længere, og træder ud af et, de står i.

En bot med en afbrydelse gemmer den til de kast, der betyder noget: en
genoplivning eller en Spøgelseshelt, der tager alteret, først, derefter
en helbredelse eller en beskyttelse, en eliteevne eller et stort slag
såsom en angrebsevne eller en skadesbesværgelse. Den lader alt andet,
og et almindeligt våbenslag, gå igennem. Ligesom en spiller misser den
omkring et ud af fire af de kast.

En bot bruger et menneskeligt øjeblik, en brøkdel af et sekund, på at
reagere på det, der sker, så en hurtig afbrydelse eller en sen undvigelse
kan slå den.

I en kamp mellem tre hold kæmper bots mod ét fjendehold ad gangen: det
hold, der angriber dem, eller, mens ingen gør det, det hårdest ramte hold
inden for rækkevidde. De bliver ved det hold, indtil et andet sætter
tydeligt flere spillere på dem, og stormer ikke et frisk hold, mens et
andet angriber dem. Et mål, deres hold har udpeget, kommer først, uanset
hvilket hold det er på. Kun spillere tæller: et holds spøgelse eller
vagter, der står i nærheden, får ikke bots til at vende sig mod det hold.

## Tilfældig arena

En Tilfældig arena har ingen bots: hver plads er en rigtig spiller, og du
venter, til der er nok i køen.
`;export{e as default};
//# sourceMappingURL=bots-D7uZvIx_.js.map