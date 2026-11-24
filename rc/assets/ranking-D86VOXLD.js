var e=`# Ranking

## Vad som är rankat

Varje match från kön utan botar är rankad: Slumparena och Lagarena. Ett
Eget spel, Träningsplatsen och varje match med en bot i är orankade.
Det finns ingen strömbrytare för det och ingen separat kö. En rankad
match fyller aldrig en tom plats med en bot.

## Din rating

Din rating hör till din spelarnyckel, den som den här webbläsaren
sparar. Alla figurer du spelar med på den delar den enda ratingen.

Rankade köer parar ihop spelare med liknande rating och delar in dem i
lag med liknande genomsnittlig rating. Sökningen börjar inom 100 poäng
från din rating och vidgas med 10 poäng för varje sekund du väntar,
upp till 600, så ingen väntar för evigt. Medan du väntar visar kön din
rating.

Dina första 10 ratade matcher är preliminära: kön säger **Preliminär
(3/10 matcher)** och du har ingen placering än. Därefter visar
huvudmenyn din placering. Ratingar förfaller: varje dag utan ratad match
gör din mindre säker, och topplistan sorterar efter ett försiktigt
värde, så om du slutar spela sjunker din placering inom några veckor.

När topplistan har 20 etablerade spelare räknas en rankad match bara om
minst en spelare i den är etablerad (10 eller fler ratade matcher): en
match enbart mellan nya spelare är inte ratad. Spela mot någon etablerad
så räknas dina matcher.

Knappen **Topplista** i toppfältet listar topp 100 efter placering, namn
och rating, med din egen rad markerad.

Hjälterang (★) är inte den här ratingen: den kommer från ryktbarhet, se
[Heroes' Ascent](modes.md#heroes-ascent).

## Matchen startar

När en rankad match hittas bekräftar alla den inom 15 sekunder, och
skärmen visar **Bekräftar rankad match…**. Om någon inte bekräftar
avbryts matchen och alla är tillbaka i kön.

## Matchen slutar

I slutet signerar alla resultatet inom 30 sekunder. Att inte signera
räknas som att lämna, och att lämna en rankad match räknas som förlust,
även för värden. Lämna-knappen säger det. Ett resultat räknas bara om
mer än hälften av platserna signerade det.

## Vad som publiceras

Matchens kvitto går till publika Nostr-reläer. Det innehåller varje
spelares publika nyckel och figurnamn (en spelare utan figur står som
starter) och vem som spelade mot vem. Vem som helst kan läsa det, och
det går inte att ta tillbaka. Orankade matcher publicerar ingenting.

## När det uppdateras

Din rating ändras inom en timme, och topplistan med den.
`;export{e as default};
//# sourceMappingURL=ranking-D86VOXLD.js.map