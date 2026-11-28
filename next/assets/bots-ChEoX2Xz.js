var e=`# Bot

Un **bot** è un giocatore controllato dal gioco. In una lobby che ospiti, i bot prendono ogni posto rimasto libero, così puoi allenarti o giocare con meno amici.

## Chi gioca un bot

Nessuno aggiunge i bot: una lobby elenca solo le persone. Quando la [Lobby squadra](modes.md#lobby-squadra) finisce, ogni schieramento gioca la Build di squadra che ha scelto, e ogni personaggio che nessuno ha preso viene giocato da un bot, con il nome di quel personaggio. Uno schieramento senza nessuno gioca una squadra predefinita casuale, tutta di bot. Chi esce durante la Lobby squadra lascia il proprio personaggio a un bot.

Nella lobby e nella Lobby squadra un bot sembra uno come gli altri. In partita ha l'etichetta **BOT** sulla targhetta, nel riquadro del bersaglio, nella finestra del gruppo e nel riepilogo della partita.

I bot esistono per una sola partita: quando finisce, la lobby torna a elencare le sue persone e per la partita dopo si creano bot nuovi.

## Come combattono i bot

Un bot gioca il ruolo che gli dà la sua build. Chi impugna un'arma da mischia sta in **prima linea**: si avvicina e attacca il bersaglio. Chi può lanciare su un alleato due o più cure o protezioni è un **guaritore**: sta dietro all'alleato più ferito, lontano dai nemici. Quando due o più nemici si concentrano su un alleato, il guaritore lancia la protezione su di lui prima che arrivi il colpo. Un guaritore tiene da parte abbastanza Energia per la sua cura o protezione più economica, e scende sotto quella soglia solo per un alleato in vero pericolo. Tutti gli altri bot combattono **a distanza**: restano dove tutti i loro attacchi arrivano, e si fermano a combattere un nemico che si avvicina troppo. I bot a distanza e i guaritori si spostano dove meno nemici possono raggiungerli e usano i pilastri come riparo. Una squadra si scaglia su qualsiasi nemico a portata che scende sotto il 60% di Salute, per finirlo. In Re della collina, finché la tua squadra non tiene l'altare, l'Eroe spettrale dell'altra squadra sull'altare viene prima anche di quello. In una squadra di soli bot, un bot che si allontana troppo dalla sua squadra aspetta gli altri prima di proseguire. I bot della tua squadra invece restano con te: quelli in prima linea un passo avanti, quelli a distanza al tuo fianco, i guaritori dietro, e ti seguono dove vai. Quando resti fermo per un po', continuano a giocare come farebbe una squadra di soli bot.
Finché sei attivo, un bot che uno scontro ha trascinato lontano da te torna da te, a meno che non sia gravemente ferito o abbia un nemico addosso.
Un bot di prima linea si rivolta contro un nemico che attacca il guaritore o gli incantatori della sua squadra, a meno che non stia per finire il proprio bersaglio.
Un bot con un incantesimo ad area lo lancia dove tre o più nemici stanno vicini, a meno che la squadra non stia finendo un nemico o seguendo un bersaglio chiamato.
Un bot con un'abilità che azzoppa o rallenta la usa su un nemico al suo fianco, o su uno che attacca il guaritore o gli incantatori della squadra, prima del bersaglio della squadra.

Contro una squadra con abilità ad area, i bot a distanza e i guaritori restano separati, così un'esplosione non ne colpisce due. Non rinunciano mai a un riparo per farlo.

Un bot a distanza o un guaritore a cui un nemico si avvicina troppo ripiega prima verso il bot di prima linea più vicino, se ce n'è uno abbastanza vicino, e combatte lì. Un attaccante in mischia rallentato, per esempio storpiato, non riesce a stargli dietro, quindi contro di lui indietreggia invece tra un colpo e l'altro.

Un bot sotto un maleficio che punisce l'attacco o il lancio di incantesimi, come Empathy o Backfire, smette di farlo finché il maleficio non finisce.

Arcieri e lancieri prendono l'altura quando è sicuro.
Un bot preso di mira da due avversari, o sotto metà salute e in rapido calo, si toglie dalla loro vista fino a tre secondi: dietro un muro, sotto una piattaforma o sull'altura.
Se non ci sono nemici vicini, un bot aziona la leva che apre una via più breve verso i nemici. Due bot abbattono anche un muro che nasconde una via molto più breve, colpendolo con le loro armi.

I bot che fanno danni tengono da parte i colpi forti, le abilità d'attacco e gli incantesimi di danno, e li scatenano insieme sul bersaglio della squadra: così il danno arriva tutto in una volta e non goccia a goccia, facile da curare. L'incantesimo più lento parte per primo, uno più rapido tanto più tardi quanto è più rapido. Intanto continuano a colpire e a lanciare malefici e condizioni. Un bot aspetta i compagni al massimo quattro secondi, e non aspetta affatto per finire un nemico sotto il 30% di Salute. Se il bersaglio è protetto da un incantamento difensivo come Protective Spirit o Aegis, un bot con un'abilità che rimuove gli incantamenti, come Strip Enchantment, lo toglie per primo, e gli altri tengono i colpi per quel momento. Se in squadra nessuno può rimuovere gli incantamenti, i bot lasciano stare il nemico protetto e passano a un altro finché l'incantamento non finisce.

Un bot gravemente ferito che sta perdendo lo scontro si ritira dietro il suo guaritore, o alla sua base, e resta fuori portata finché non ha recuperato gran parte della Salute.

Un bot resuscita un alleato caduto solo se i nemici non sono addosso al corpo e vicino ci sono più compagni che avversari, e mai mentre un nemico vicino sta bersagliando il bot stesso.

I bot schivano circa la metà dei colpi mirati diretti contro di loro, come una Fireball o la freccia di un'abilità d'attacco: fermarsi o girarsi funziona per loro come per te.

I bot aggirano il terreno in fiamme e le altre zone dannose quando il giro
non è molto più lungo, ed escono da quella in cui si trovano.
Escono anche dall'area dannosa di un avversario, come un pozzo, una protezione contro di loro o una tempesta, e combattono dal suo bordo.

Un bot con un'interruzione la conserva per i lanci che contano: prima una resurrezione o un Eroe spettrale che conquista l'altare, poi una cura o una protezione, un'abilità élite o un colpo forte come un'abilità d'attacco o un incantesimo di danno. Tutto il resto, e un semplice colpo d'arma, lo lascia passare. Come un giocatore, manca circa uno di questi lanci su quattro.

Un bot impiega un attimo umano, una frazione di secondo, a reagire a ciò che succede: un'interruzione rapida o una schivata all'ultimo possono batterlo.

Quando nessuno della tua squadra ha segnalato un bersaglio, uno dei tuoi bot segnala il nemico su cui si stanno concentrando i tuoi bot, proprio come faresti tu: vedi l'indicatore e il nome del bot, così puoi unirti. La segnalazione di un bot mostra solo dove stanno andando i bot; continuano comunque a proteggere un compagno e a finire un nemico morente. Una tua segnalazione vince sempre: tutti i bot della squadra si concentrano sul tuo bersaglio, nessun bot sostituisce la tua segnalazione, e i bot segnalano di nuovo solo quando il suo bersaglio è morto o sparito.

In uno scontro a tre squadre, i bot combattono una squadra nemica alla volta: quella che li attacca o, se nessuno lo fa, la più ferita a portata. Restano su quella squadra finché un'altra non gli mette addosso chiaramente più giocatori, e non caricano una squadra fresca mentre un'altra li sta attaccando. Un bersaglio segnalato dalla loro squadra viene prima, di qualunque squadra sia. Contano solo i giocatori: il fantasma o le guardie di una squadra lì vicino non bastano a farli voltare verso quella squadra.

## Arena casuale

Un'Arena casuale non ha bot: ogni posto è un giocatore vero, e si aspetta finché non ce ne sono abbastanza in coda.
`;export{e as default};
//# sourceMappingURL=bots-ChEoX2Xz.js.map