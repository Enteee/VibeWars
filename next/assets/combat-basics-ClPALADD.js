var e=`# Kampfgrundlagen

## Leben und Energie

Du startest mit 500 **Leben** und 50 **Energie**; Runen und Moral verändern
beides. Skills kosten Energie, und sie kommt langsam von selbst zurück. ![Krieger](../../../apps/web/public/icons/profession/warrior.svg) **Krieger**
und ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** regenerieren sie am langsamsten, ![Waldläufer](../../../apps/web/public/icons/profession/ranger.svg) **Waldläufer** etwas schneller, alle anderen
am schnellsten.

Die Pfeile auf deinen Leisten sind **Pips**: Jeder steht für Leben oder Energie,
die jede Sekunde ein wenig zurückkommen oder abfließen. ![Blutung](../../../apps/web/public/icons/status/bleeding.svg) **Blutung**, ![Brennen](../../../apps/web/public/icons/status/burning.svg) **Brennen** und
![Vergiftung](../../../apps/web/public/icons/status/poison.svg) **Vergiftung** ziehen Leben ab; Regeneration und Heilzauber geben es dir. Bist du
5 Sekunden aus dem Kampf, kommt dein Leben von selbst zurück, und zwar umso
schneller, je länger du draußen bleibst.

## Adrenalin

![Krieger](../../../apps/web/public/icons/profession/warrior.svg) **Krieger**, ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** und andere haben Skills, die **Adrenalin** statt Energie kosten.
Jeder dieser Skills lädt sich einzeln auf: Jeder Waffentreffer, den du landest,
gibt jedem von ihnen einen Schlag, und ein großer Treffer, den du einsteckst,
ebenso. Benutzt du einen, leert er sich und nimmt den anderen einen Schlag. Bist
du 25 Sekunden aus dem Kampf, leeren sich alle.

## Einen Skill nutzen

Ein Skill braucht manchmal einen Moment zum **Wirken** und danach Zeit zur
**Aufladung**, bevor du ihn wieder nutzen kannst. Ist dein Ziel außer Reichweite,
läufst du zuerst hin. Laufen oder Esc bricht das Wirken ab: Die Energie ist weg,
aber der Skill lädt sich nicht auf. Nach jedem Skill mit Wirkzeit, außer einem
![Angriffs-Skill](../../../apps/web/public/icons/skill-type/attack.svg) **Angriffs-Skill**, gibt es eine kurze Pause, in der du nichts tun kannst.

Ein Skill, den du drückst, während du einen anderen nutzt oder in dieser Pause,
wird **vorgemerkt**: Er kommt als Nächstes, und sein Feld pulsiert bis dahin. Nur
einer kann warten; drückst du einen anderen, ersetzt er ihn. Laufen, Esc, eine
Unterbrechung oder ein Niederwurf verwirft ihn.

![Schrei](../../../apps/web/public/icons/skill-type/shout.svg) **Schreie** und ![Haltung](../../../apps/web/public/icons/skill-type/stance.svg) **Haltungen** werden nie vorgemerkt: Sie wirken sofort, auch während
du einen anderen Skill wirkst, in dieser Pause oder am Boden. Das Wirken läuft
weiter. So genutzt, lassen sie dich nicht hinlaufen: Außer Reichweite werden sie
abgelehnt.

## Unterbrechungen und Niederwurf

Eine **Unterbrechung** stoppt den Skill eines Gegners, während er ihn wirkt. Seine
Energie ist verbraucht und der Skill lädt sich auf; manche Unterbrechungen sperren
den Skill auch eine Weile. Zu früh oder zu spät passiert nichts.

Jede Profession klingt beim Wirken anders; achte auf den Klang deines Ziels.

Die meisten Unterbrechungen stoppen auch einen normalen Angriff mitten im Schlag:
Der Treffer kommt nie an und der Schlag beginnt von vorn. Ein Gegner, der noch zu
seinem Ziel läuft, hat nichts zu unterbrechen. Eine Unterbrechung, auf deren Karte
„einen Skill“ oder „einen Zauber“ steht, lässt einen normalen Angriff in Ruhe.

Manche ![Haltung](../../../apps/web/public/icons/skill-type/stance.svg) **Haltungen**, etwa Mantra of Concentration, stoppen eine Unterbrechung gegen
dich. Keine davon stoppt einen Niederwurf.

**Am Boden** kannst du kurz weder laufen noch angreifen noch einen Skill nutzen,
außer einem ![Schrei](../../../apps/web/public/icons/skill-type/shout.svg) **Schrei** oder einer Haltung, und ein laufendes Wirken schlägt fehl.

## Zustände, Verhexungen und Verzauberungen

**Zustände** schaden dir, bis sie auslaufen oder entfernt werden:

| Zustand                                                                                         | Was er tut                                           |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| ![Blutung](../../../apps/web/public/icons/status/bleeding.svg) **Blutung**                      | zieht Leben ab                                       |
| ![Brennen](../../../apps/web/public/icons/status/burning.svg) **Brennen**                       | zieht schnell Leben ab                               |
| ![Vergiftung](../../../apps/web/public/icons/status/poison.svg) **Vergiftung**                  | zieht Leben ab                                       |
| ![Krankheit](../../../apps/web/public/icons/status/disease.svg) **Krankheit**                   | zieht Leben ab und steckt jeden neben dir an         |
| ![Verkrüppelt](../../../apps/web/public/icons/status/crippled.svg) **Verkrüppelt**              | du läufst halb so schnell                            |
| ![Blindheit](../../../apps/web/public/icons/status/blind.svg) **Blindheit**                     | die meisten deiner Angriffe verfehlen                |
| ![Schwäche](../../../apps/web/public/icons/status/weakness.svg) **Schwäche**                    | deine Waffentreffer sind viel schwächer              |
| ![Rissige Rüstung](../../../apps/web/public/icons/status/cracked-armor.svg) **Rissige Rüstung** | weniger Rüstung                                      |
| ![Tiefe Wunde](../../../apps/web/public/icons/status/deep-wound.svg) **Tiefe Wunde**            | weniger maximales Leben, und Heilung wirkt schwächer |
| ![Benommen](../../../apps/web/public/icons/status/dazed.svg) **Benommen**                       | Zauber wirken langsam; jeder Angriff unterbricht sie |

![Verhexung](../../../apps/web/public/icons/skill-type/hex.svg) **Verhexungen** wirken Gegner auf dich, ![Verzauberung](../../../apps/web/public/icons/skill-type/enchantment.svg) **Verzauberungen** du selbst oder deine
Verbündeten. Jede wird durch ihre eigene Art von Skill entfernt. Manche
Verzauberungen werden **aufrechterhalten**: Sie halten, bis du sie beendest, und
kosten solange einen Energie-Pip. Doppelklicke auf ihr Symbol, um eine zu beenden.

Ein paar Skills funktionieren nicht, solange du verzaubert bist, und wieder, wenn
du es nicht mehr bist. Ein Skill, der für deine „nächsten N Angriffe“ gilt, zählt
jeden Angriff: Ein Fehlschlag oder ein Block verbraucht genauso einen wie ein
Treffer.

## Rüstung und Schaden

![Krieger](../../../apps/web/public/icons/profession/warrior.svg) **Krieger** und ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** tragen die meiste Rüstung, ![Waldläufer](../../../apps/web/public/icons/profession/ranger.svg) **Waldläufer**, ![Assassine](../../../apps/web/public/icons/profession/assassin.svg) **Assassine** und ![Derwisch](../../../apps/web/public/icons/profession/dervish.svg) **Derwisch**
weniger, Zauberwirker am wenigsten. Rüstung verringert Waffen-, Element-, Chaos-
und Dunkelschaden. Heiliger Schaden, Schattenschaden und typloser Schaden,
Lebensentzug und Lebensraub ignorieren sie. Nur Waffentreffer können kritisch
sein. Manche Verzauberungen machen ihren Träger immun gegen kritische Treffer.

## Tod, Wiederbelebung und Moral

In den meisten Modi bleiben Tote liegen, bis ein Verbündeter sie mit einem Skill
**wiederbelebt**, etwa Resurrection Signet, das jeder nehmen kann. Manche Modi
holen die Toten in Wellen oder von selbst zurück; siehe [Modi](modes.md).

Solange du tot bist, zählt eine Zeile unter der Anzeigetafel herunter,
bis du zurück bist, oder sagt dir, dass du auf eine Wiederbelebung
warten musst. Das Gruppenfenster zeigt den Countdown neben jedem toten
Verbündeten.

Jeder Tod kostet dich 15 % **Moral**, bis -60 %: Dein maximales Leben und deine
Energie schrumpfen mit. Jeder Gegner, den dein Team tötet, bringt 2 % zurück, bis 0. In einer Gildenschlacht hebt das Halten des Flaggenstands sie darüber hinaus,
bis +10 %.
`;export{e as default};
//# sourceMappingURL=combat-basics-ClPALADD.js.map