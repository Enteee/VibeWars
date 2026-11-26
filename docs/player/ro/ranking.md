# Clasament

## Ce este clasat

Fiecare meci din coadă fără boți este clasat: Arenă aleatorie și Arenă
de echipe. Un Joc găzduit, Terenul de antrenament și orice meci cu un
bot sunt neclasate. Nu există un comutator pentru asta și nici o coadă
separată. Un meci clasat nu umple niciodată un loc gol cu un bot.

## Ratingul tău

Ratingul tău aparține cheii tale de jucător, cea pe care o păstrează
acest browser. Toate personajele cu care joci pe ea au același rating.

Cozile clasate împerechează jucători cu rating apropiat și îi împart în
echipe cu rating mediu apropiat. Căutarea începe în limita a 100 de
puncte față de ratingul tău și se lărgește cu 10 puncte pentru fiecare
secundă de așteptare, până la 600, așa că nimeni nu așteaptă la
nesfârșit. Cât aștepți, coada îți arată ratingul.

Primele tale 10 meciuri cu rating sunt provizorii: coada spune
**Provizoriu (3/10 meciuri)** și încă nu ai loc în clasament. După
aceea, meniul principal îți arată locul. Ratingurile se erodează:
fiecare zi fără meci cu rating îl face pe al tău mai nesigur, iar
clasamentul ordonează după o valoare prudentă, așa că dacă nu mai joci
locul tău coboară în câteva săptămâni.

Odată ce clasamentul are 20 de jucători consacrați, un meci clasat
contează doar dacă cel puțin un jucător din el este consacrat (10 sau
mai multe meciuri cu rating): un meci doar între jucători noi nu are
rating. Joacă cu cineva consacrat și meciurile tale contează.

Butonul **Clasament** din bara de sus arată primii 100 după loc, nume și
rating, cu rândul tău evidențiat.

Rangul de erou (★) nu este acest rating: vine din faimă, vezi
[Ascensiunea Eroilor](modes.md#ascensiunea-eroilor).

## Începutul meciului

Când se găsește un meci clasat, toți îl confirmă în 15 secunde, iar
ecranul arată **Se confirmă meciul clasat…**. Dacă cineva nu confirmă,
meciul e anulat și toți revin în coadă.

## Sfârșitul meciului

La final, toți semnează rezultatul în 30 de secunde. Nesemnarea
contează ca plecare, iar părăsirea unui meci clasat contează ca
înfrângere, și pentru gazdă. Butonul de ieșire spune asta. Un rezultat
contează doar dacă l-au semnat mai mult de jumătate dintre locuri.

## Ce se publică

Chitanța meciului ajunge pe relee Nostr publice. Conține cheia publică
și numele personajului fiecărui jucător (un jucător fără personaj apare
ca starter) și cine a jucat cu cine. Oricine o poate citi și nu poate fi
retrasă. Meciurile neclasate nu publică nimic.

## Când se actualizează

Ratingul tău se schimbă în decurs de o oră, iar clasamentul odată cu el.
