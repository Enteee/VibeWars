var e=`# Grundlæggende kamp

## Liv og energi

Du starter med 480 **Liv** og 20 **Energi**, og din rustning lægger energi
oveni: intet for en Warrior, 5 for en Ranger, en Assassin eller en Dervish,
10 for alle andre. En stav giver 10 mere, mens du holder den. En Dervish' rustning giver også 25 Liv. Runer og moral
ændrer begge. Evner koster energi, og den kommer langsomt tilbage af sig selv.
![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warriors** og ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragons** får den langsomst tilbage, ![Ranger](../../../apps/web/public/icons/profession/ranger.svg) **Rangers** lidt hurtigere,
alle andre hurtigst.

Pilene på dine bjælker er **pips**: hver af dem er liv eller energi, der
kommer tilbage eller drænes væk, lidt hvert sekund. ![Bleeding](../../../apps/web/public/icons/status/bleeding.svg) **Bleeding**, ![Burning](../../../apps/web/public/icons/status/burning.svg) **Burning** og
![Poison](../../../apps/web/public/icons/status/poison.svg) **Poison** dræner liv; Regeneration og helbredende besværgelser giver liv.
Er du ude af kampen i 5 sekunder, begynder dit liv at komme tilbage af
sig selv, hurtigere jo længere du bliver ude.

## Adrenalin

![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warriors**, ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragons** og andre har evner, der koster **adrenalin** i stedet
for energi. Hver af disse evner lades op for sig: hvert våbenslag, du
lander, giver hver af dem et hak, og det samme gør det at tage et hårdt
slag. Bruger du én, tømmes den, og de andre mister et hak. Er du ude af
kampen i 25 sekunder, tømmes de alle.

## At bruge en evne

En evne kan tage et øjeblik at **kaste**, og skal derefter have tid til
**genopladning**, før du kan bruge den igen. Er dit mål uden for
rækkevidde, går du først hen til det. At bevæge sig, eller Esc,
annullerer et kast: energien er brugt, men evnen genoplades ikke. Efter
enhver evne med kastetid, undtagen en ![Angrebsevne](../../../apps/web/public/icons/skill-type/attack.svg) **angrebsevne**, er der en kort pause,
hvor du ikke kan handle.

En evne, du trykker på, mens du bruger en anden, eller i den pause, sættes
i **kø**: den kommer bagefter, og dens plads pulserer, indtil den gør. Kun
én kan vente; trykker du på en anden, erstatter den den første. At
bevæge sig, Esc, en afbrydelse eller at blive væltet fjerner den.

![Råb](../../../apps/web/public/icons/skill-type/shout.svg) **Råb** og ![Kampstilling](../../../apps/web/public/icons/skill-type/stance.svg) **kampstillinger** sættes aldrig i kø: de udløses med det samme,
også mens du kaster en anden evne, i den pause, eller når du er væltet.
Kastet fortsætter. Brugt sådan får de dig ikke til at gå hen til målet:
uden for rækkevidde afvises de.

## Afbrydelser og at blive væltet

En **afbrydelse** stopper en fjendes evne, mens fjenden kaster den.
Fjendens energi er brugt, og evnen genoplades; nogle afbrydelser låser
også evnen et stykke tid. Afbryder du for tidligt eller for sent, sker
der ingenting.

Hver professions kast har sin egen lyd; lyt efter dit måls.

De fleste afbrydelser stopper også et almindeligt angreb midt i svinget:
det slag lander aldrig, og svinget starter forfra. En fjende, der stadig
går hen mod sit mål, har intet at afbryde. En afbrydelse, hvis kort siger
"en evne" eller "en besværgelse", lader et almindeligt angreb være.

Nogle ![Kampstilling](../../../apps/web/public/icons/skill-type/stance.svg) **kampstillinger**, såsom Mantra of Concentration, stopper en
afbrydelse rettet mod dig. Ingen af dem stopper at blive væltet.

**Væltet** kan du hverken bevæge dig, angribe eller bruge en evne et
øjeblik, undtagen et ![Råb](../../../apps/web/public/icons/skill-type/shout.svg) **råb** eller en kampstilling, og et igangværende kast
mislykkes.

## Tilstande, forbandelser og fortryllelser

**Tilstande** skader dig, indtil de løber ud eller fjernes:

| Tilstand                                                                                    | Hvad den gør                                                         |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| ![Bleeding](../../../apps/web/public/icons/status/bleeding.svg) **Bleeding**                | dræner liv                                                           |
| ![Burning](../../../apps/web/public/icons/status/burning.svg) **Burning**                   | dræner liv hurtigt                                                   |
| ![Poison](../../../apps/web/public/icons/status/poison.svg) **Poison**                      | dræner liv                                                           |
| ![Disease](../../../apps/web/public/icons/status/disease.svg) **Disease**                   | dræner liv og spreder sig til samme slags krop lige ved siden af dig |
| ![Crippled](../../../apps/web/public/icons/status/crippled.svg) **Crippled**                | du bevæger dig med halv fart                                         |
| ![Blind](../../../apps/web/public/icons/status/blind.svg) **Blind**                         | de fleste af dine angreb rammer ved siden af                         |
| ![Weakness](../../../apps/web/public/icons/status/weakness.svg) **Weakness**                | dit våben rammer meget svagere                                       |
| ![Cracked Armor](../../../apps/web/public/icons/status/cracked-armor.svg) **Cracked Armor** | mindre rustning                                                      |
| ![Deep Wound](../../../apps/web/public/icons/status/deep-wound.svg) **Deep Wound**          | mindre maksimalt liv, og helbredelse virker dårligere                |
| ![Dazed](../../../apps/web/public/icons/status/dazed.svg) **Dazed**                         | besværgelser kastes langsomt; ethvert angreb afbryder dem            |

Tjenere (undtagen Kødgolemen), genfærd og ånder bløder ikke, bliver ikke forgiftet og får ikke sygdom, og ånder får ingen forbandelse og ingen tilstand undtagen **Burning**.

![Forbandelse](../../../apps/web/public/icons/skill-type/hex.svg) **Forbandelser** kastes på dig af fjender; ![Fortryllelse](../../../apps/web/public/icons/skill-type/enchantment.svg) **fortryllelser** af dig selv
eller dine allierede. Hver fjernes af sin egen slags evne. Nogle
fortryllelser er **vedligeholdte**: de varer, indtil du afslutter dem, og
koster et energi-pip, mens de kører. Dobbeltklik på ikonet, eller fokuser
det og tryk på Enter eller Delete, for at afslutte en.

Nogle få evner holder op med at virke, mens du er fortryllet, og virker
igen, når du ikke er det længere. En evne, der varer i dine "næste N
angreb", tæller hvert angreb, så en forbier eller en blokering bruger ét
lige så sikkert som et træf.

## Rustning og skade

![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warriors** og ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragons** bærer mest rustning; ![Ranger](../../../apps/web/public/icons/profession/ranger.svg) **Rangers**, ![Assassin](../../../apps/web/public/icons/profession/assassin.svg) **Assassins** og
![Dervish](../../../apps/web/public/icons/profession/dervish.svg) **Dervishes** mindre; besværgere mindst. Rustning gør våben-, elementar-,
kaos- og mørkeskade mindre. Hellig skade, skyggeskade og typeløs skade,
livdræn og livstjæling ignorerer den. Kun våbenslag kan være kritiske.
Nogle fortryllelser gør deres bærer immun over for kritiske træf.

## Død, genoplivning og moral

I de fleste spiltilstande bliver de døde liggende, indtil en allieret
**genopliver** dem med en evne, såsom Resurrection Signet, som alle kan
tage med. Nogle spiltilstande bringer de døde tilbage i bølger eller af
sig selv; se [Spiltilstande](modes.md).

Mens du er død, tæller en linje under pointtavlen ned til du er tilbage,
eller beder dig vente på at blive genoplivet. Gruppevinduet viser
nedtællingen ved hver død allieret.

Hver død koster dig 15 % **moral**, ned til -60 %: dit maksimale liv og
din maksimale energi skrumper med den. Hver fjende, dit hold dræber,
vinder 2 % tilbage, op til 0. I en Laugskamp løfter det at holde
flagstanden den over det, op til +10 %.
`;export{e as default};
//# sourceMappingURL=combat-basics-Ddk4M1Cs.js.map