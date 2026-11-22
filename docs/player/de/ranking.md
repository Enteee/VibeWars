# Wertung

## Was gewertet wird

Jedes Match aus der Warteschlange ohne Bots ist gewertet: Zufallsarena
und Teamarena. Ein Gehostetes Spiel, der Trainingsplatz und jedes Match
mit einem Bot sind ungewertet. Dafür gibt es keinen Schalter und keine
eigene Warteschlange. Ein gewertetes Match füllt einen leeren Platz nie
mit einem Bot auf.

## Deine Wertung

Deine Wertung gehört zu deinem Spielerschlüssel, dem, den dieser
Browser aufbewahrt. Alle Charaktere, die du darauf spielst, teilen
diese eine Wertung.

Gewertete Warteschlangen paaren Spieler mit ähnlicher Wertung und
teilen sie in Teams mit ähnlicher durchschnittlicher Wertung auf. Die
Suche beginnt innerhalb von 100 Punkten deiner Wertung und weitet sich
mit jeder Sekunde Wartezeit um 10 Punkte aus, bis zu 600, damit
niemand ewig wartet. Während du wartest, zeigt die Warteschlange deine
Wertung.

Deine ersten 10 gewerteten Matches sind vorläufig: Die Warteschlange
sagt **Vorläufig (3/10 Matches)**, und du hast noch keinen Rang.
Danach zeigt das Hauptmenü deinen Rang. Wertungen verfallen: Jeder Tag
ohne gewertetes Match macht deine unsicherer, und die Rangliste ordnet
nach einem vorsichtigen Wert, sodass dein Rang innerhalb von Wochen
sinkt, wenn du aufhörst zu spielen.

Sobald die Rangliste 20 etablierte Spieler hat, zählt ein gewertetes
Match nur, wenn mindestens ein Spieler darin etabliert ist (10 oder
mehr gewertete Matches): Ein Match nur zwischen neuen Spielern ist
ungewertet. Spiel gegen jemand Etablierten, und deine Matches zählen.

Der Knopf **Rangliste** in der oberen Leiste listet die besten 100 mit
Rang, Name und Wertung, deine eigene Zeile hervorgehoben.

Der Heldenrang (★) ist nicht diese Wertung: Er kommt vom Ruhm, siehe
[Aufstieg der Helden](modes.md#aufstieg-der-helden).

## Das Match beginnt

Wenn ein gewertetes Match gefunden ist, bestätigen es alle innerhalb von
15 Sekunden, und der Bildschirm zeigt **Gewertetes Match wird
bestätigt…**. Bestätigt jemand nicht, wird das Match abgebrochen und
alle sind zurück in der Warteschlange.

## Das Match endet

Am Ende unterschreiben alle das Ergebnis innerhalb von 30 Sekunden.
Nicht zu unterschreiben zählt als Verlassen, und das Verlassen eines
gewerteten Matches zählt als Niederlage, auch für den Host. Der Knopf
zum Verlassen sagt das. Ein Ergebnis zählt nur, wenn mehr als die
Hälfte der Plätze es unterschrieben hat.

## Was veröffentlicht wird

Der Beleg des Matches geht an öffentliche Nostr-Relays. Er enthält den
öffentlichen Schlüssel und den Charakternamen jedes Spielers (ein
Spieler ohne Charakter wird als Starter geführt) und wer gegen wen
gespielt hat. Jeder kann ihn lesen, und er lässt sich nicht
zurücknehmen. Ungewertete Matches veröffentlichen nichts.

## Wann es sich aktualisiert

Deine Wertung ändert sich innerhalb einer Stunde, und die Rangliste mit
ihr.
