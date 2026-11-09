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
auf ihn, bevor der Treffer sitzt. Jeder andere Bot ist **Fernkämpfer**: Er bleibt
dort, wo jeder seiner Angriffe reicht, und stellt sich einem Gegner, der zu nah
kommt. Fernkämpfer und Heiler gehen dorthin, wo weniger Gegner sie erreichen, und
nutzen Säulen als Deckung. Ein Team stürzt sich auf jeden Gegner in Reichweite,
der unter 60 % Leben fällt, um ihn zu erledigen. In King of the Hill geht,
solange dein Team den Altar nicht hält, der Geisterheld des anderen Teams auf dem
Altar sogar noch vor. Ein Bot, der seinem Team weit voraus ist, wartet auf die
anderen, bevor er weitergeht.

Bots, die Schaden machen, halten ihre großen Treffer zurück, also Angriffs-Skills
und Schadenszauber, und lösen sie gemeinsam auf das Ziel des Teams aus. So kommt
der Schaden auf einmal an und tröpfelt nicht so, dass ein Heiler ihn wieder
wegheilt: Der langsamste Zauber geht zuerst, ein schnellerer um so viel später,
wie er schneller ist. Währenddessen schlagen sie weiter zu und wirken ihre
Verhexungen und Zustände. Ein Bot wartet höchstens vier Sekunden auf seine
Mitspieler und gar nicht, um einen Gegner unter 30 % Leben zu erledigen. Liegt auf
dem Ziel eine schützende Verzauberung wie Protective Spirit oder Aegis, entfernt
sie zuerst ein Bot mit einem passenden Skill wie Strip Enchantment, und die
anderen halten ihre Treffer so lange zurück.

Ein schwer verletzter Bot, der seinen Kampf verliert, zieht sich hinter seinen
Heiler oder in seine Basis zurück und erholt sich außer Reichweite, bis er das
meiste Leben wiederhat.

Ein Bot belebt einen gefallenen Verbündeten nur wieder, wenn keine Gegner direkt
an der Leiche stehen, mehr aus seinem Team als aus ihrem in der Nähe sind und
kein naher Gegner den Bot selbst im Visier hat.

Bots weichen etwa der Hälfte der auf sie gezielten Geschosse aus, etwa einem
Fireball oder dem Pfeil eines Angriffs-Skills. Anhalten oder Abdrehen klappt bei
ihnen also genauso wie bei dir.

Ein Bot mit einer Unterbrechung spart sie für die Skills auf, die zählen: zuerst
eine Wiederbelebung oder einen Geisterhelden, der den Altar einnimmt, dann eine
Heilung oder einen Schutz, einen Elite-Skill oder einen großen Treffer wie einen
Angriffs-Skill oder einen Schadenszauber. Alles andere und einen normalen
Waffenschlag lässt er durch. Wie ein Spieler verfehlt er etwa eine von vier
dieser Unterbrechungen.

Ein Bot reagiert wie ein Mensch mit einer kurzen Verzögerung, einem Bruchteil
einer Sekunde. Eine schnelle Unterbrechung oder ein spätes Ausweichen kann ihn
also schlagen.

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
