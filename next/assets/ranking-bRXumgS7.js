var e=`# Classificazione

## Cosa è classificato

Ogni partita dalla coda senza bot è classificata: Arena casuale e Arena
a squadre. Una Partita ospitata, il Campo di allenamento e qualsiasi
partita con un bot sono non classificate. Non c’è un interruttore e non
c’è una coda separata. Una partita classificata non riempie mai un posto
vuoto con un bot.

## Il tuo punteggio

Il tuo punteggio appartiene alla tua chiave di giocatore, quella che
questo browser conserva. Ogni personaggio che giochi qui condivide lo
stesso punteggio.

Le code classificate abbinano giocatori di punteggio simile e li
dividono in squadre di punteggio medio simile. La ricerca parte entro
100 punti dal tuo punteggio e si allarga di 10 punti per ogni secondo di
attesa, fino a 600, così nessuno aspetta per sempre. Mentre aspetti, la
coda mostra il tuo punteggio.

Le tue prime 10 partite valutate sono provvisorie: la coda dice
**Provvisorio (3/10 partite)** e non hai ancora una posizione. Dopo, il
menu principale mostra la tua posizione. I punteggi decadono: ogni
giorno senza una partita valutata rende il tuo meno certo, e la
classifica ordina per un valore prudente, quindi se smetti di giocare la
tua posizione scende nel giro di settimane.

Quando la classifica ha 20 giocatori affermati, una partita classificata
conta solo se almeno un giocatore al suo interno è affermato (10 o più
partite valutate): una partita solo tra giocatori nuovi non è valutata.
Gioca con qualcuno di affermato e le tue partite contano.

Il pulsante **Classifica** nella barra in alto elenca i primi 100 per
posizione, nome e punteggio, con la tua riga evidenziata.

Il grado di eroe (★) non è questo punteggio: viene dalla fama, vedi
[Ascesa degli Eroi](modes.md#ascesa-degli-eroi).

## Inizio della partita

Quando si trova una partita classificata, tutti la confermano entro 15
secondi, e la schermata mostra **Conferma della partita
classificata…**. Se qualcuno non conferma, la partita è annullata e
tutti tornano in coda.

## Fine della partita

Alla fine tutti firmano il risultato entro 30 secondi. Non firmare conta
come uscire, e uscire da una partita classificata conta come sconfitta,
anche per l’host. Il pulsante per uscire lo dice. Un risultato conta
solo se più della metà dei posti lo ha firmato.

## Cosa viene pubblicato

La ricevuta della partita va su relay Nostr pubblici. Contiene la chiave
pubblica e il nome del personaggio di ogni giocatore (un giocatore senza
personaggio figura come starter) e chi ha giocato contro chi. Chiunque
può leggerla e non si può ritirare. Le partite non classificate non
pubblicano nulla.

## Quando si aggiorna

Il tuo punteggio cambia entro un’ora, e con esso la classifica.
`;export{e as default};
//# sourceMappingURL=ranking-bRXumgS7.js.map