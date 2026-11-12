var e=`# Bots

Een **bot** is een speler die het spel voor je speelt. In een lobby die jij
host, spelen bots elke plek die niemand neemt, zodat je kunt oefenen, of met
minder vrienden kunt spelen.

## Wie een bot speelt

Niemand voegt bots toe: een lobby toont alleen zijn mensen. Als de
[Teamlobby](modes.md#teamlobby) eindigt, speelt elke kant de Teambuild die hij
koos, en elk personage dat niemand claimde, wordt door een bot gespeeld, onder
de naam van dat personage. Een kant waar niemand op staat, speelt een
willekeurig kant-en-klaar team, allemaal bots. Wie tijdens de Teamlobby
vertrekt, laat zijn personage aan een bot over.

In de lobby en de Teamlobby ziet een bot er net zo uit als iedereen. In de
match staat er **BOT** bij op zijn naamplaatje, het doelwitvenster, het
groepsvenster en de matchsamenvatting.

Bots worden voor één match gemaakt: zodra die voorbij is, toont de lobby weer
zijn mensen, en de bots van de volgende match worden opnieuw gemaakt.

## Hoe bots vechten

Een bot speelt de rol die zijn build hem geeft. Een bot met een melee-wapen is
**frontlinie**: hij gaat erop af en valt zijn doelwit aan. Een bot met twee of
meer genezingen of beschermingen die hij op een bondgenoot kan casten, is een
**healer**: hij staat achter de bondgenoot die het meest gewond is, weg van de
vijanden. Als twee of meer vijanden zich op één bondgenoot richten, geeft een
healer die bondgenoot zijn bescherming voordat de klap aankomt. Elke andere bot
is **ranged**: hij blijft waar elk van zijn aanvallen reikt, en blijft staan
om te vechten met een vijand die te dichtbij komt. Ranged bots en healers
stappen naar plekken waar minder vijanden ze kunnen bereiken, en gebruiken
pilaren als dekking. Een team keert zich tegen elke vijand binnen bereik die
onder 60% gezondheid zakt, om hem af te maken. In King of the Hill gaat, zolang
je team het altaar niet heeft, de Spookheld van het andere team op het altaar
daar zelfs voor. Een bot die ver voor zijn team uit loopt, wacht op de rest
voordat hij doorduwt.

Is er geen vijand in de buurt, dan haalt een bot een hendel over die een kortere weg naar de vijanden opent. Twee bots slaan ook een muur neer die een veel kortere weg verbergt, door er met hun wapens op in te hakken.

Schadebots bewaren hun grote klappen, aanvalsskills en schadespreuken, en
vuren ze samen af op het doelwit van het team, zodat de schade tegelijk
aankomt in plaats van druppelsgewijs, zodat een healer het niet ongedaan kan
maken: de traagste spreuk gaat eerst, een snellere zoveel later als hij sneller
is. Ondertussen blijven ze slaan en hun vloeken en condities casten. Een bot
wacht maximaal vier seconden op zijn teamgenoten, en wacht helemaal niet om
een vijand onder 30% gezondheid af te maken. Staat het doelwit onder een
beschermende betovering zoals Protective Spirit of Aegis, dan haalt een bot
met een betoveringsstrip, zoals Strip Enchantment, die er eerst af, en houden
de anderen hun klappen daarvoor in.

Een zwaargewonde bot die zijn gevecht verliest, valt terug achter zijn healer,
of naar zijn basis, en rust buiten bereik tot hij het grootste deel van zijn
gezondheid terug heeft.

Een bot reanimeert een gevallen bondgenoot alleen als de vijanden niet boven op
het lichaam staan, er meer van zijn eigen team dan van hen in de buurt staat,
en nooit terwijl een vijand vlakbij de bot zelf als doelwit heeft.

Bots ontwijken ongeveer de helft van de skillshots op hen gericht, zoals een
Fireball of de pijl van een aanvalsskill, dus stoppen of draaien werkt voor hen
net als voor jou.

Bots lopen om brandende grond en andere schadelijke plekken heen als de
omweg niet veel langer is, en stappen uit een plek waar ze in staan.

Een bot met een onderbreking bewaart die voor de casts die ertoe doen: eerst
een reanimatie of een Spookheld die het altaar claimt, dan een genezing of een
bescherming, een eliteskill, of een grote klap zoals een aanvalsskill of een
schadespreuk. Al het andere, en een gewone wapenslag, laat hij door. Net als een
speler mist hij ongeveer een op de vier van die casts.

Een bot neemt een menselijk moment, een fractie van een seconde, om te reageren
op wat er gebeurt, dus een snelle onderbreking of een late ontwijking kan hem
verslaan.

In een gevecht met drie teams vechten bots tegen één vijandelijk team tegelijk:
het team dat hen aanvalt, of, als niemand dat doet, het meest gewonde team
binnen bereik. Ze blijven bij dat team tot een ander duidelijk meer spelers op
hen zet, en stormen niet op een fris team af terwijl een ander hen aanvalt. Een
doelwit dat hun team heeft aangewezen, gaat voor, bij welk team het ook hoort.
Alleen spelers tellen: de geest of bewakers van een team die in de buurt staan,
laten bots niet naar dat team draaien.

## Random Arena

Een Random Arena heeft geen bots: elke plek is een echte speler, en je wacht tot
er genoeg in de wachtrij staan.
`;export{e as default};
//# sourceMappingURL=bots-Bwqb-dt-.js.map