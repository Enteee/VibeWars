# Bots

Ein **Bot** ist ein Spieler, den das Spiel für dich spielt. In einer Lobby,
die du hostest, übernehmen Bots jeden Platz, den niemand nimmt. So kannst du
üben oder mit weniger Freunden spielen.

## Wer von einem Bot gespielt wird

Niemand fügt Bots hinzu: Eine Lobby listet nur ihre Leute auf. Wenn die
[Team-Lobby](modes.md#team-lobby) endet, spielt jede Seite den Team-Build, den
sie gewählt hat, und jeden Charakter, den niemand genommen hat, spielt ein Bot
unter dem Namen dieses Charakters. Eine Seite ohne Spieler bekommt ein
zufälliges vorgefertigtes Team, nur aus Bots. Wer während der Team-Lobby geht,
überlässt seinen Charakter einem Bot.

In der Lobby und der Team-Lobby sieht ein Bot aus wie alle anderen. Im Match
trägt er den Hinweis **BOT** auf dem Namensschild, im Zielfenster, im
Gruppenfenster und in der Match-Übersicht.

Bots gelten für ein Match: Ist es vorbei, listet die Lobby wieder ihre Leute
auf, und die Bots für das nächste Match werden neu erstellt.

## Wie Bots kämpfen

Ein Bot spielt die Rolle, die sein Build ihm gibt. Wer eine Nahkampfwaffe führt,
ist **Frontkämpfer**: Er geht nah heran und greift sein Ziel an. Wer zwei oder
mehr Heilungen oder Schutz-Skills auf Verbündete wirken kann, ist **Heiler**: Er
steht hinter dem am stärksten verletzten Verbündeten, weg von den Gegnern. Wenn
zwei oder mehr Gegner auf einen Verbündeten gehen, wirkt ein Heiler seinen Schutz
auf ihn, bevor der Treffer sitzt. Ein Heiler hält genug Energie für seine
billigste Heilung oder seinen billigsten Schutz zurück und geht nur für einen
Verbündeten in echter Gefahr darunter. Ein Bot mit zwei Verhexungen legt seine
billige Verhexung über seine wichtige, sodass die Verhexungsentfernung eines
Gegners zuerst die billige trifft. Jeder andere Bot ist **Fernkämpfer**:
Er bleibt
dort, wo jeder seiner Angriffe reicht, und stellt sich einem Gegner, der zu nah
kommt. Fernkämpfer und Heiler gehen dorthin, wo weniger Gegner sie erreichen, und
nutzen Säulen als Deckung. Ein Team stürzt sich auf jeden Gegner in Reichweite,
der unter 60 % Leben fällt, um ihn zu erledigen. In King of the Hill geht,
solange dein Team den Altar nicht hält, der Geisterheld des anderen Teams auf dem
Altar sogar noch vor. In einem Team aus Bots wartet ein Bot, der seinem Team weit
voraus ist, auf die anderen, bevor er weitergeht. Bots in deinem Team bleiben
stattdessen bei dir: Frontkämpfer einen Schritt voraus, Fernkämpfer neben dir,
Heiler dahinter, und sie folgen dir, wohin du gehst. Sobald du eine Weile untätig
herumgestanden hast, spielen sie weiter wie ein Team aus Bots.
Solange du aktiv bist, kehrt ein Bot, den ein Kampf weit von dir weggezogen hat, zu dir zurück, außer er ist schwer verwundet oder ein Gegner steht direkt bei ihm.
Ein Frontkämpfer wendet sich gegen einen Gegner, der den Heiler oder die Zauberwirker seines Teams angreift, außer er ist kurz davor, sein eigenes Ziel zu erledigen.
Ein Bot mit einem Flächenzauber wirkt ihn dort, wo drei oder mehr Gegner beieinanderstehen, außer das Team erledigt gerade einen Gegner oder folgt einem angesagten Ziel.
Ein Bot mit einem verkrüppelnden oder verlangsamenden Skill setzt ihn gegen einen Gegner direkt bei sich ein oder gegen einen, der den Heiler oder die Zauberwirker seines Teams angreift, noch vor dem Ziel des Teams.

Gegen ein Team mit Flächen-Skills halten Fernkämpfer und Heiler Abstand voneinander, damit eine Explosion nicht zwei von ihnen trifft. Deckung geben sie dafür nie auf.

Ein Fernkämpfer oder Heiler, dem ein Gegner zu nah kommt, weicht zuerst zu seinem nächsten Frontkämpfer zurück, wenn einer nah genug ist, und kämpft dort. Ein verlangsamter Nahkämpfer, etwa ein verkrüppelter, kommt nicht hinterher, also weicht der Bot vor ihm stattdessen zwischen den Schüssen zurück.

Ein Bot unter einer Verhexung, die Angreifen oder Zaubern bestraft, etwa Empathy oder Backfire, hört damit auf, bis die Verhexung endet.

Bogenschützen und Speerwerfer besetzen die Anhöhe, wenn es sicher ist.
Ein Bot, auf den sich zwei Gegner stürzen oder der unter halber Gesundheit schnell weiter verliert, duckt sich bis zu drei Sekunden aus ihrer Sicht: hinter eine Mauer, unter eine Plattform oder auf eine Anhöhe.
Ist kein Gegner in der Nähe, legt ein Bot einen Hebel um, der einen kürzeren Weg zu den Gegnern öffnet. Zwei Bots reißen außerdem eine Mauer nieder, die einen viel kürzeren Weg versperrt, indem sie mit ihren Waffen darauf einschlagen.

Bots, die Schaden machen, halten ihre großen Treffer zurück, also Angriffs-Skills
und Schadenszauber, und lösen sie gemeinsam auf das Ziel des Teams aus. So kommt
der Schaden auf einmal an und tröpfelt nicht so, dass ein Heiler ihn wieder
wegheilt: Der langsamste Zauber geht zuerst, ein schnellerer um so viel später,
wie er schneller ist. Währenddessen schlagen sie weiter zu und wirken ihre
Verhexungen und Zustände. Ein Bot wartet höchstens vier Sekunden auf seine
Mitspieler und gar nicht, um einen Gegner unter 30 % Leben zu erledigen. Liegt auf
dem Ziel eine schützende Verzauberung wie Protective Spirit oder Aegis, entfernt
sie zuerst ein Bot mit einem passenden Skill wie Strip Enchantment, und die
anderen halten ihre Treffer so lange zurück. Hat das Team keinen solchen Skill,
lassen die Bots einen geschützten Gegner stehen und wenden sich einem anderen
zu, bis die Verzauberung endet.

Ein schwer verletzter Bot, der seinen Kampf verliert, zieht sich hinter seinen
Heiler oder in seine Basis zurück und erholt sich außer Reichweite, bis er das
meiste Leben wiederhat.

Ein Bot belebt einen gefallenen Verbündeten nur wieder, wenn keine Gegner direkt
an der Leiche stehen, mehr aus seinem Team als aus ihrem in der Nähe sind und
kein naher Gegner den Bot selbst im Visier hat.

Bots weichen etwa der Hälfte der auf sie gezielten Geschosse aus, etwa einem
Fireball oder dem Pfeil eines Angriffs-Skills. Anhalten oder Abdrehen klappt bei
ihnen also genauso wie bei dir.

Bots gehen um brennenden Boden und andere schädliche Flächen herum, wenn der
Umweg nicht viel länger ist, und treten aus einer heraus, in der sie stehen.
Sie treten auch aus einer schädlichen Fläche des Gegners heraus, etwa einem Brunnen, einer Schutzzone gegen sie oder einem Sturm, und kämpfen von ihrem Rand aus.

Ein Bot mit einer Unterbrechung spart sie für die Skills auf, die zählen: zuerst
eine Wiederbelebung oder einen Geisterhelden, der den Altar einnimmt, dann eine
Heilung oder einen Schutz, einen Elite-Skill oder einen großen Treffer wie einen
Angriffs-Skill oder einen Schadenszauber. Alles andere und einen normalen
Waffenschlag lässt er durch. Wie ein Spieler verfehlt er etwa eine von vier
dieser Unterbrechungen.

Ein Bot reagiert wie ein Mensch mit einer kurzen Verzögerung, einem Bruchteil
einer Sekunde. Eine schnelle Unterbrechung oder ein spätes Ausweichen kann ihn
also schlagen.

Hat niemand in deinem Team ein Ziel angesagt, sagt einer deiner Bots den Gegner
an, auf den sich deine Bots konzentrieren, genau wie du es tun würdest: Du
siehst die Markierung und den Namen des Bots, damit du mitmachen kannst. Die
Ansage eines Bots zeigt nur, wohin die Bots gehen; sie helfen trotzdem einem
bedrängten Teamkameraden und erledigen einen sterbenden Gegner. Deine Ansage
gewinnt immer: Jeder Bot im Team konzentriert sich auf dein Ziel, kein Bot
ersetzt deine Ansage, und die Bots sagen erst wieder an, wenn ihr Ziel tot oder
verschwunden ist.

In einem Kampf mit drei Teams kämpfen Bots immer nur gegen ein gegnerisches Team:
das, das sie angreift, oder, solange das niemand tut, das am stärksten verletzte
Team in Reichweite. Sie bleiben bei diesem Team, bis ein anderes deutlich mehr
Spieler auf sie ansetzt, und rennen nicht auf ein frisches Team los, während ein
anderes sie angreift. Ein Ziel, das ihr Team angesagt hat, geht vor, egal in
welchem Team es ist. Nur Spieler zählen: Der Geist oder die Wachen eines Teams in
der Nähe bringen Bots nicht dazu, sich gegen dieses Team zu wenden.

## Zufallsarena

In einer Zufallsarena gibt es keine Bots: Jeder Platz ist ein echter Spieler, und
du wartest, bis genug in der Warteschlange sind.
