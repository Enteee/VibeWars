# Basi del combattimento

## Salute ed Energia

Inizi con 500 di **Salute** e 20 di **Energia**, e l'armatura aggiunge Energia: niente per un Guerriero, 5 per un Ranger, un Assassino o un Derviscio, 10 per tutti gli altri. Uno Staff aggiunge altri 10 finché lo impugni. Rune e morale modificano entrambe. Le abilità costano Energia, che torna da sola, lentamente. I ![Guerriero](../../../apps/web/public/icons/profession/warrior.svg) **Guerrieri** e i ![Campione](../../../apps/web/public/icons/profession/paragon.svg) **Campioni** la recuperano più lentamente, i ![Ranger](../../../apps/web/public/icons/profession/ranger.svg) **Ranger** un po' più in fretta, tutti gli altri più velocemente.

Le frecce sulle barre sono i **pip**: ognuno è Salute o Energia che torna, o che cala, un po' ogni secondo. ![Sanguinamento](../../../apps/web/public/icons/status/bleeding.svg) **Sanguinamento**, ![Bruciatura](../../../apps/web/public/icons/status/burning.svg) **Bruciatura** e ![Veleno](../../../apps/web/public/icons/status/poison.svg) **Veleno** tolgono Salute; Regeneration e gli incantesimi di cura la aggiungono. Fuori dallo scontro per 5 secondi, la tua Salute inizia a tornare da sola, tanto più in fretta quanto più resti fuori.

## Adrenalina

I ![Guerriero](../../../apps/web/public/icons/profession/warrior.svg) **Guerrieri**, i ![Campione](../../../apps/web/public/icons/profession/paragon.svg) **Campioni** e altri hanno abilità che costano **adrenalina** invece di Energia. Ognuna si carica per conto suo: ogni colpo d'arma che metti a segno dà a ciascuna un colpo di carica, e lo stesso vale se subisci un colpo forte. Usarne una la svuota e toglie un colpo di carica alle altre. Fuori dallo scontro per 25 secondi, si svuotano tutte.

## Usare un'abilità

Un'abilità può richiedere un momento per il **lancio**, e poi ha bisogno di tempo per la **ricarica** prima di poterla riusare. Se il bersaglio è fuori portata, prima cammini verso di lui. Muoverti o premere Esc annulla un lancio: l'Energia è persa, ma l'abilità non va in ricarica. Dopo qualsiasi abilità con un tempo di lancio, tranne le ![Abilità d'attacco](../../../apps/web/public/icons/skill-type/attack.svg) **abilità d'attacco**, c'è una breve pausa in cui non puoi agire.

Un'abilità premuta mentre ne stai usando un'altra, o durante quella pausa, va **in coda**: parte subito dopo, e il suo slot pulsa finché non parte. Ne aspetta una sola; premerne un'altra la sostituisce. Muoverti, Esc, un'interruzione o un atterramento la cancellano.

![Grido](../../../apps/web/public/icons/skill-type/shout.svg) **Gridi** e ![Posizione](../../../apps/web/public/icons/skill-type/stance.svg) **posizioni** non vanno mai in coda: partono subito, anche mentre lanci un'altra abilità, durante quella pausa o quando sei a terra. Il lancio in corso prosegue. Usati così non ti fanno avvicinare: se sei fuori portata, vengono rifiutati.

## Interruzioni e atterramento

Un'**interruzione** ferma l'abilità di un nemico mentre la sta lanciando. La sua Energia è spesa e l'abilità va in ricarica; alcune interruzioni bloccano anche l'abilità per un po'. Se interrompi troppo presto o troppo tardi, non succede nulla.

Ogni professione ha un suono proprio quando usa un'abilità; ascolta quello del tuo bersaglio.

La maggior parte delle interruzioni ferma anche un semplice attacco a metà colpo: quel colpo non arriva e il movimento ricomincia. Un nemico che sta ancora camminando verso il bersaglio non ha nulla da interrompere. Un'interruzione la cui carta dice "un'abilità" o "un incantesimo" non tocca un semplice attacco.

Alcune ![Posizione](../../../apps/web/public/icons/skill-type/stance.svg) **posizioni**, come Mantra of Concentration, fermano un'interruzione diretta a te. Nessuna ferma un atterramento.

**A terra** non puoi muoverti, attaccare o usare abilità per un momento, tranne un ![Grido](../../../apps/web/public/icons/skill-type/shout.svg) **grido** o una posizione, e un lancio in corso fallisce.

## Condizioni, malefici e incantamenti

Le **condizioni** ti danneggiano finché non svaniscono o non vengono rimosse:

| Condizione                                                                                            | Effetto                                                               |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ![Sanguinamento](../../../apps/web/public/icons/status/bleeding.svg) **Sanguinamento**                | toglie Salute                                                         |
| ![Bruciatura](../../../apps/web/public/icons/status/burning.svg) **Bruciatura**                       | toglie Salute in fretta                                               |
| ![Veleno](../../../apps/web/public/icons/status/poison.svg) **Veleno**                                | toglie Salute                                                         |
| ![Malattia](../../../apps/web/public/icons/status/disease.svg) **Malattia**                           | toglie Salute e si diffonde ai corpi della stessa specie accanto a te |
| ![Azzoppato](../../../apps/web/public/icons/status/crippled.svg) **Azzoppato**                        | ti muovi a metà velocità                                              |
| ![Cecità](../../../apps/web/public/icons/status/blind.svg) **Cecità**                                 | la maggior parte dei tuoi attacchi manca il bersaglio                 |
| ![Debolezza](../../../apps/web/public/icons/status/weakness.svg) **Debolezza**                        | i tuoi colpi d'arma sono molto più deboli                             |
| ![Armatura incrinata](../../../apps/web/public/icons/status/cracked-armor.svg) **Armatura incrinata** | meno armatura                                                         |
| ![Ferita profonda](../../../apps/web/public/icons/status/deep-wound.svg) **Ferita profonda**          | meno Salute massima, e le cure funzionano meno                        |
| ![Stordimento](../../../apps/web/public/icons/status/dazed.svg) **Stordimento**                       | lanci lentamente gli incantesimi; qualsiasi attacco li interrompe     |

I servitori (tranne il Golem di carne), i fantasmi e gli spiriti non sanguinano, non vengono avvelenati né si ammalano, e gli spiriti non subiscono alcun maleficio né alcuna condizione tranne **Bruciatura**.

I ![Maleficio](../../../apps/web/public/icons/skill-type/hex.svg) **malefici** sono lanciati su di te dai nemici; gli ![Incantamento](../../../apps/web/public/icons/skill-type/enchantment.svg) **incantamenti** da te o dai tuoi alleati. Ognuno viene rimosso da un suo tipo di abilità. Alcuni incantamenti sono **mantenuti**: durano finché non li termini, e consumano un pip di Energia finché sono attivi. Fai doppio clic sull'icona per terminarne uno.

Alcune abilità smettono di funzionare mentre sei incantato, e riprendono quando non lo sei più. Un'abilità che dura per i tuoi "prossimi N attacchi" conta ogni attacco: un colpo mancato o parato ne consuma uno come un colpo a segno.

## Armatura e danni

I ![Guerriero](../../../apps/web/public/icons/profession/warrior.svg) **Guerrieri** e i ![Campione](../../../apps/web/public/icons/profession/paragon.svg) **Campioni** indossano l'armatura più pesante; i ![Ranger](../../../apps/web/public/icons/profession/ranger.svg) **Ranger**, gli ![Assassino](../../../apps/web/public/icons/profession/assassin.svg) **Assassini** e i ![Derviscio](../../../apps/web/public/icons/profession/dervish.svg) **Dervisci** meno; gli incantatori meno di tutti. L'armatura riduce i danni da arma, elementali, di caos e oscuri. I danni sacri, d'ombra e senza tipo, le perdite di Salute e il furto di vita la ignorano. Solo i colpi d'arma possono essere critici. Alcuni incantamenti rendono chi li porta immune ai colpi critici.

## Morte, resurrezione e morale

Nella maggior parte delle modalità i morti restano a terra finché un alleato non li **resuscita** con un'abilità, come Resurrection Signet, che chiunque può prendere. Alcune modalità riportano i morti a ondate, o da soli; vedi [Modalità](modes.md).

Mentre sei morto, una riga sotto il punteggio conta alla rovescia fino
al tuo ritorno, o ti dice di aspettare che ti resuscitino. La finestra
del gruppo mostra il conto alla rovescia accanto a ogni alleato morto.

Ogni morte ti costa il 15% di **morale**, fino a -60%: la Salute e l'Energia massime calano di conseguenza. Ogni nemico ucciso dalla tua squadra ne restituisce il 2%, fino a 0. In una Battaglia di gilda, tenere la Base bandiera lo porta oltre, fino a +10%.
