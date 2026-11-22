var e=`# Abilități și builduri

Un **build** este ce aduce un personaj într-o luptă: două clase, opt abilități
și punctele de atribut din spatele lor. Deschide unul cu **Editează** din meniul
principal sau cu **Personaj nou**.

## Clase

Sunt zece: ![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warrior**, ![Ranger](../../../apps/web/public/icons/profession/ranger.svg) **Ranger**, ![Monk](../../../apps/web/public/icons/profession/monk.svg) **Monk**, ![Necromancer](../../../apps/web/public/icons/profession/necromancer.svg) **Necromancer**, ![Mesmer](../../../apps/web/public/icons/profession/mesmer.svg) **Mesmer**, ![Elementalist](../../../apps/web/public/icons/profession/elementalist.svg) **Elementalist**, ![Assassin](../../../apps/web/public/icons/profession/assassin.svg) **Assassin**,
![Ritualist](../../../apps/web/public/icons/profession/ritualist.svg) **Ritualist**, ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** și ![Dervish](../../../apps/web/public/icons/profession/dervish.svg) **Dervish**. Clasa ta **principală** este ceea ce ești:
abilitățile ei și **atributul ei principal** (marcat cu ★), pe care îl primește
doar o clasă principală. Clasa **secundară** îți împrumută abilitățile ei, dar nu
și atributul principal.

## Bara de abilități

Bara are **opt locuri**. Pe o bară încape o singură abilitate de **elită** (chenar
auriu): dacă echipezi a doua, o înlocuiește pe prima. Apasă **×** pe un loc ca
să-l golești.

![Farmec](../../../apps/web/public/icons/skill-type/enchantment.svg) **Farmecele fulger** (![Dervish](../../../apps/web/public/icons/profession/dervish.svg) **Dervish**) sunt instantanee: folosirea unuia îți păstrează
lovitura și pasul, așa că le poți strecura între lovituri. Fiecare oprește
celelalte farmece fulger pentru 1 secundă.

![Formă](../../../apps/web/public/icons/skill-type/form.svg) **Formele** (cei cinci Avatari Dervish: Balthazar, Dwayna, Grenth, Lyssa și
Melandru) te schimbă pentru mai mult de un minut. O formă nu este un farmec, așa
că nimeni nu ți-o poate elimina, și poți fi într-o singură formă odată. Folosirea
uneia o dezactivează pentru 45 de secunde. Când se termină o formă, te oprești
din ce făceai: atacul, mersul și orice abilitate pe care o activai. Apasă din nou
o tastă de mișcare ca să mergi mai departe.

**Unele trageri îți dezactivează celelalte atacuri.** Focused Shot și Needling
Shot zboară mai repede decât ar trebui o săgeată, dar fiecare care nimerește îți
oprește celelalte ![Abilitate de atac](../../../apps/web/public/icons/skill-type/attack.svg) **abilități de atac** pentru câteva secunde. ![Vrajă](../../../apps/web/public/icons/skill-type/spell.svg) **Vrăjile** nu sunt
afectate.

## Atribute

Ai **200 de puncte** de cheltuit. Fiecare rang al unui atribut costă mai mult
decât cel dinainte, până la rangul 12; rândul arată cât costă următorul.
Doisprezece, doisprezece și trei le cheltuiesc pe toate. Runele și coiful pot
adăuga încă până la patru ranguri în plus; vezi [Echipament](equipment.md).
Creșterea atributului folosit de o abilitate o face mai puternică: numerele care
cresc odată cu atributul apar cu verde și îngroșat, la rangurile tale actuale,
inclusiv rune și coif.

Într-o luptă, rangurile tale se pot schimba o vreme. ![Weakness](../../../apps/web/public/icons/status/weakness.svg) **Weakness** scade câte unul din
fiecare. Unele ![Blestem](../../../apps/web/public/icons/skill-type/hex.svg) **blesteme** setează atributele unui inamic la 0, iar Master of Magic
le setează pe ale tale elementale la 13: un rang setat astfel are prioritate și
față de rune, și față de Weakness. Signet of Illusions permite următoarelor tale
![Vrajă](../../../apps/web/public/icons/skill-type/spell.svg) **vrăji** de alte atribute să-ți folosească rangul de Illusion Magic. Unele abilități
îți cresc atributele pentru un timp sau pentru următoarele vrăji, cum fac Glyph
of Elemental Power și Ritual Lord, chiar și pe unul lăsat la 0; un rang setat,
ca al lui Master of Magic, depășește o astfel de creștere.

## Ecouri

![Ecou](../../../apps/web/public/icons/skill-type/echo.svg) **Ecourile** unui ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** sunt efecte benefice lungi asupra unui aliat. Un
**refren** se reînnoiește la toată durata, iar un **final** își face efectul, de
fiecare dată când o ![Incantație](../../../apps/web/public/icons/skill-type/chant.svg) **incantație** sau un ![Strigăt](../../../apps/web/public/icons/skill-type/shout.svg) **strigăt** se termină pe acel aliat. O
incantație sau un strigăt reaplicat înainte să se termine nu s-a terminat. Nimic
nu elimină un ecou: se termină când expiră sau când moare purtătorul. Majoritatea
nu pot ținti un spirit.

## Abilități care devin altă abilitate

Unele abilități ![Mesmer](../../../apps/web/public/icons/profession/mesmer.svg) **Mesmer** pun altă abilitate pe locul lor pentru o vreme.
![Arcane Echo](../../../apps/web/public/icons/status/arcane-echo.svg) **Arcane Echo** și ![Echo](../../../apps/web/public/icons/status/echo.svg) **Echo** copiază următoarea abilitate pe care o folosești. **Inspired
Enchantment** și **Inspired Hex** devin abilitatea care a lansat ![Farmec](../../../apps/web/public/icons/skill-type/enchantment.svg) **farmecul** sau
![Blestem](../../../apps/web/public/icons/skill-type/hex.svg) **blestemul** eliminat, pentru 20 de secunde. **Arcane Thievery** devine ![Vrajă](../../../apps/web/public/icons/skill-type/spell.svg) **vraja** pe care
a dezactivat-o la inamic, cât timp durează dezactivarea. Copia are reîncărcarea ei.
Când se termină, abilitatea originală revine și își începe reîncărcarea, iar o
lansare a copiei aflată încă în curs eșuează. Un efect pus de un spirit sau de alt
efect nu poate fi copiat, deși eliminarea lui îți dă în continuare Energia.

## Fântâni și glife

![Fântână](../../../apps/web/public/icons/skill-type/well.svg) **Fântânile** unui ![Necromancer](../../../apps/web/public/icons/profession/necromancer.svg) **Necromancer** exploatează cel mai apropiat cadavru. Dacă nu e
niciunul aproape, o fântână sacrifică în schimb 66% din Viața ta și apare unde
stai.

![Glifă](../../../apps/web/public/icons/skill-type/glyph.svg) **Glifele** unui ![Elementalist](../../../apps/web/public/icons/profession/elementalist.svg) **Elementalist** îți schimbă următoarea ![Vrajă](../../../apps/web/public/icons/skill-type/spell.svg) **vrajă**: nu poate fi
întreruptă, se lansează instantaneu, se reîncarcă imediat sau costă mai puțin. O
glifă nouă o înlocuiește pe cea pe care o aveai.

## Intervenții

O abilitate care răspunde „data viitoare când daunele îți scad Viața sub N%”
răspunde la orice lovitură sau furt de viață care te lasă în viață și sub limită,
chiar dacă erai deja sub ea înainte de lovitură, și niciodată la viața pe care o
sacrifici sau o pierzi prin degenerare. Protecția contra daunelor fatale, ca
![Judge's Intervention](../../../apps/web/public/icons/status/judges-intervention.svg) **Judge's Intervention**, anulează toată lovitura mortală: nicio daună, nicio moarte.
![Faithful Intervention](../../../apps/web/public/icons/status/faithful-intervention.svg) **Faithful Intervention** și ![Illusion of Weakness](../../../apps/web/public/icons/status/illusion-of-weakness.svg) **Illusion of Weakness** nu au durată: țin până când daunele,
o eliminare sau moartea le pun capăt și te vindecă pe parcurs.

## Biblioteca

Biblioteca de abilități listează fiecare abilitate pe care o pot folosi cele două
clase ale tale, grupate pe atribut. Caută în nume și text lângă butonul **Filtre**.
Filtre deschide o fereastră în care alegi tipuri de abilități sau **Doar elită**
ca să restrângi lista; **Gata**, Esc sau un clic în afară o închide. Butonul
numără ce e activ (**Filtre · 2**), iar fiecare filtru apare lângă el ca o
etichetă: dă clic pe o etichetă ca să oprești acel filtru sau pe **șterge** ca să
le oprești pe toate. Abilitățile altor clase așteaptă, strânse, la **Alte clase**.

Grupurile de atribute pornesc strânse: dă clic pe numele unui grup ca să-l
deschizi. O căutare sau un filtru deschide fiecare grup în care găsește ceva.

Lângă editor, **Teren de antrenament** te lasă să-ți încerci bara pe ținte de
exercițiu înainte de un meci. Jurnalul lui arată fiecare abilitate folosită de
tine sau de un bot, adrenalina pe care o câștigi și o abilitate care nu a avut
efect, cu ceea ce aștepta. Unele ținte se mișcă: în **Moving targets** una merge
în buclă, una fuge de tine și una te urmărește. Contorul lui numără daunele și
vindecările spiritelor, slujitorilor și animalului tău ca fiind ale tale.

## Vrăji de obiect

![Vrajă de obiect](../../../apps/web/public/icons/skill-type/item-spell.svg) **Vrăjile de obiect** ale unui ![Ritualist](../../../apps/web/public/icons/profession/ritualist.svg) **Ritualist** îți pun în mâini **cenușa** unui spirit:
un bonus cât timp o ții și un **efect de cădere** când se scapă. Cade când expiră,
când mori, când apeși **Lasă cenușa** deasupra barei de Viață, lansezi altă vrajă
de obiect, faci un shadow step, schimbi armele sau ridici un steag ori o relicvă.
Cât timp o ții, ai mâinile ocupate: fără atacuri și fără ![Abilitate de atac](../../../apps/web/public/icons/skill-type/attack.svg) **abilități de atac**, dar
mergi cu viteză deplină și poți lansa ![Vrajă](../../../apps/web/public/icons/skill-type/spell.svg) **vrăji**. Nimic nu elimină cenușa; orice sfârșit
înseamnă o cădere.

## Shadow step

Un **shadow step** te mută imediat, fără să mergi între. Majoritatea te duc la
țintă; unele te readuc când se termină în locul din care le-ai lansat, cum fac
Shadow of Haste și Shadow Walk. ![Recall](../../../apps/web/public/icons/status/recall.svg) **Recall** te duce la aliatul lui doar când se
termină și îți dezactivează toate abilitățile pentru 3 secunde. **Swap** te face
să schimbi locul cu un spirit sau un slujitor din tabăra ta.

## Trimiterea buildurilor

În meniul **⋯** al editorului, **Trimite** îți dă buildul ca un rând de text, iar
**Trimite ca cod GW1** ca un cod de șablon GW1. Apasă **Copiază** și trimite-l.

Ca să încarci unul, alege **Încarcă cod GW1** din **⋯**, lipește codul și apasă
**Încarcă**. Dacă nu se poate încărca, îți spune de ce sub câmp. Ca scurtătură,
poți lipi un cod oriunde în editor, cu excepția unui câmp de text. Ambele tipuri
de cod funcționează în ambele feluri. O abilitate GW1 pe care VibeWars nu o are
încă ajunge ca un loc gol. Buildul e al tău după ce apeși **Salvează**.

**Salvează** îți păstrează buildul și te duce înapoi de unde ai venit. **Esc**
iese fără să salveze și întreabă mai întâi dacă ai schimbat ceva. **Trimite**,
**Încarcă cod GW1**, **Duplică** și **Șterge** sunt în **⋯**.

Un cod de echipă se încarcă în schimb în **Constructor de echipe**: lipește-l
oriunde acolo, sau deschide un build de echipă și folosește **⋯** →
**Încarcă echipa** al lui.

## Builduri de echipă

Un **build de echipă** este o echipă cu personaje proprii, făcută în **Constructor
de echipe** și ținută separat de personajele tale. Fiecare este o carte acolo și
numai acolo: **Build de echipă nou** creează unul, un cod de echipă lipit acolo încarcă unul
partajat cu tine, iar un clic pe o carte sau pe **Editează** o deschide. Propui unul în
[Lobby-ul de echipă](modes.md#lobby-de-echipă).

Fiecare build de echipă are o mărime, 2v2, 4v4 sau 8v8 (nu există builduri de
echipă 1v1): **Mărime echipă** din bara laterală. Constructor de echipe listează
buildurile de echipă de mărimea aleasă acolo, iar **Build de echipă nou** creează
unul de acea mărime. Mărimea unui build de echipă e fixă: editorul o arată
blocată, iar ca să joci altă mărime faci alt build de echipă. O echipă lipită își
păstrează mărimea, iar bara laterală trece la ea.

Un build de echipă are mereu atâția membri câți spune mărimea: unul nou începe cu
un personaj gol pe fiecare loc. Nu adaugi și nu elimini niciodată un membru, ci
înlocuiești unul. Fiecare rând arată personajul membrului cu armele pe care le
ține, un punct pentru fiecare set de arme când are mai multe, Viața și Energia
maximă și cele opt abilități; trage un rând de ⠿ ca să reordonezi. Ține **Shift** când plasezi un rând pe alt membru
ca să-i copiezi în schimb tot build-ul pe acel membru; rândul tras rămâne cum era.
Panoul din
dreapta este biblioteca din Constructor de personaje, cu o filă **Personajele
mele** înainte de **Abilități** și **Echipament**. La **Personajele mele**, trage
unul dintre personajele tale peste un membru ca să faci din acel membru o copie a
lui. O copie aparține echipei: dacă o schimbi pe ea sau personajul din care a
provenit, celălalt rămâne cum era. La **Abilități**, biblioteca arată abilitățile
membrului pe care ai dat clic ultima dată; trage una pe locul oricărui membru ca
s-o echipezi acolo. Pe bara acelui membru, o abilitate deja prezentă se mută pe
loc. O plasare pe care un membru nu o poate primi, o abilitate a altei clase sau
una deja pe bara altui membru, e marcată cu un loc punctat și motivul, și nu face
nimic. Trage o abilitate aflată deja pe bara unui membru pe orice loc ca s-o muți
acolo, schimbând locul cu ce găsește; ține **Shift** când o plasezi pe alt membru
ca s-o copiezi în schimb. O bară tot ține o singură elită și nicio abilitate de
două ori, așa că o plasare care ar încălca asta e refuzată la fel. Abilitățile
fiecărui membru apar ca pictograme; ține cursorul pe una ca să vezi detaliile, dă
clic ca să găsești fiecare copie din echipă. **▼** al unui membru îl deschide pe
loc (**▲** îl închide), sub rândul lui: clasele, numele, rangurile de atribut,
bara de abilități și echipamentul se schimbă chiar acolo. Ca în Constructor de
personaje, dă clic pe unul dintre locurile barei și **Echipează** pune o abilitate
pe acel loc; dacă nu e ales niciunul, merge pe primul gol. **Echipament** conține
armele și mâinile secundare ale membrului deschis și există doar cât timp e unul
deschis: dă clic pe una ca s-o echipezi sau trage-o peste mâinile lui. Un singur
membru e deschis odată; **Esc** îl închide. O clasă nouă renunță la abilitățile
și rangurile pe care nu le poate folosi, cu un **Anulează**. Apasă numele unui
membru sau **Deschide în ecranul Personaj** ca să-l editezi în editorul de build;
**Salvează** de acolo îl pune înapoi în echipă, iar **Salvează** al echipei păstrează
totul și te duce înapoi la Constructor de echipe. **Esc** iese fără să salveze și
întreabă mai întâi. **Trimite**, **Încarcă echipa**, **Duplică** și **Șterge** ale
echipei sunt în **⋯**. Acolo, **Încarcă echipa** deschide echipa încărcată în
locul acesteia. Poți salva o echipă oricând, cu tot cu probleme, dar doar o echipă fără
probleme poate fi propusă într-un Lobby de echipă: o carte spune **Nu se poate
juca** și motivul, iar o echipă fără nume apare ca **Echipă fără nume**. Primul
tău start generează o echipă gata făcută la mărimea aleasă, 4v4 dacă nu ai
schimbat-o, marcată **Aleator**: **Altul** de pe ea o înlocuiește cu alta, iar
**Clonează** îți dă o copie de editat.
`;export{e as default};
//# sourceMappingURL=skills-and-builds-DDi7TlrN.js.map