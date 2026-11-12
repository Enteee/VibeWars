var e=`# Boti

**Bot** je hráč, ktorého za teba hrá hra. V lobby, ktoré hostíš, hrajú boti
každé miesto, ktoré nikto nezaberie, takže si môžeš zacvičiť alebo hrať s menším
počtom priateľov.

## Kto hrá za bota

Botov nikto nepridáva: lobby uvádza len svojich ľudí. Keď sa
[tímové lobby](modes.md#tímové-lobby) skončí, každá strana hrá tímový build,
ktorý si vybrala, a každú z jeho postáv, ktorú si nikto nezabral, hrá bot,
pod menom tej postavy. Strana, na ktorej nikto nie je, hrá náhodný
prednastavený tím, samí boti. Kto počas tímového lobby odíde, nechá svoju
postavu botovi.

V lobby a v tímovom lobby vyzerá bot ako ktokoľvek iný. V
zápase má na menovke, v rámiku cieľa, v okne družiny
a v súhrne zápasu označenie **BOT**.

Boti sú vytvorení na jeden zápas: keď sa skončí, lobby opäť uvádza svojich
ľudí a boti ďalšieho zápasu sa vytvoria nanovo.

## Ako boti bojujú

Bot hrá rolu, ktorú mu dáva jeho build. Ten so zbraňou na blízko je
**predný rad**: priblíži sa a útočí na svoj cieľ. Ten s dvoma alebo viacerými
liečeniami alebo ochranami, ktoré môže zoslať na spojenca, je **liečiteľ**: stojí
za najviac zraneným spojencom, ďalej od nepriateľov. Keď sa dvaja alebo viacerí
nepriatelia sústredia na jedného spojenca, liečiteľ naňho dá ochranu skôr, než
zásah dopadne. Každý iný bot je **na diaľku**: drží sa tam, kam dosiahne každý
jeho útok, a zastaví sa a bojuje s nepriateľom, ktorý príde príliš blízko. Boti
na diaľku a liečitelia ustupujú tam, kam dosiahne menej nepriateľov, a stĺpy
používajú ako kryt. Tím sa obráti proti každému nepriateľovi v dosahu, ktorý
klesne pod 60 % zdravia, aby ho dorazil. V Kráľovi kopca, kým tvoj tím nedrží
oltár, má ešte pred tým prednosť Prízračný hrdina druhého tímu na oltári.
Bot, ktorý sa dostane ďaleko pred svoj tím, počká na ostatných, kým pôjde
ďalej.

Keď nie je nablízku žiadny nepriateľ, bot prehodí páku, ktorá otvorí kratšiu cestu k nepriateľom. Dvaja boti tiež zbúrajú múr, ktorý skrýva oveľa kratšiu cestu, a bijú doň svojimi zbraňami.

Útočiaci boti si šetria svoje veľké zásahy, útočné schopnosti a poškodzujúce
kúzla a spúšťajú ich spoločne na cieľ tímu, takže poškodenie dopadne naraz,
namiesto aby prichádzalo po troškách, ktoré liečiteľ stihne vyliečiť: najpomalšie
kúzlo ide prvé, rýchlejšie o toľko neskôr, o koľko je rýchlejšie. Medzitým ďalej
sekajú a zosielajú svoje kliatby a neduhy. Bot čaká na spoluhráčov najviac štyri
sekundy a vôbec nečaká, keď má dorážať nepriateľa pod
30 % zdravia. Keď je cieľ pod ochranným očarovaním, ako
Protective Spirit alebo Aegis, bot so strhnutím očarovania, ako Strip
Enchantment, ho najprv strhne a ostatní kvôli tomu zadržia zásahy.

Ťažko zranený bot, ktorý prehráva svoj boj, ustúpi za svojho liečiteľa alebo
do svojej základne a oddychuje mimo dosahu, kým nezíska väčšinu zdravia späť.

Bot oživí padnutého spojenca, len keď nepriatelia nie sú priamo pri
tele, keď pri ňom stojí viac jeho vlastného tímu než ich, a nikdy,
kým blízky nepriateľ zameriava samotného bota.

Boti sa vyhnú asi polovici mierených striel, ako je
Fireball alebo šíp útočnej schopnosti, takže zastavenie alebo otočenie na nich
funguje rovnako ako na teba.

Boti obchádzajú horiacu zem a iné škodlivé miesta, keď cesta okolo nie je o
veľa dlhšia, a z takého miesta vystúpia, keď v ňom stoja.

Bot s prerušením si ho šetrí na zosielania, na ktorých záleží: najprv
oživenie alebo Prízračný hrdina, ktorý si nárokuje oltár, potom liečenie alebo
ochrana, elitná schopnosť alebo veľký
zásah, ako je útočná schopnosť alebo poškodzujúce kúzlo. Všetko ostatné
a obyčajný úder zbraňou nechá prejsť. Rovnako ako hráč netrafí asi jedno
z každých štyroch takých zosielaní.

Bot potrebuje ľudskú chvíľku, zlomok sekundy, aby zareagoval na
to, čo sa deje, takže rýchle prerušenie alebo neskorý úhyb ho môžu poraziť.

V boji troch tímov bojujú boti vždy s jedným nepriateľským tímom
naraz: s tým, ktorý na nich útočí, alebo, kým neútočí nikto, s najviac zraneným
tímom v dosahu. Zostávajú pri ňom, kým na nich iný nepošle zjavne viac
hráčov, a nevrhajú sa na čerstvý tím, kým na nich iný
útočí. Cieľ, ktorý určil ich tím, má prednosť, nech je v ktoromkoľvek
tíme. Počítajú sa len hráči: prízrak alebo stráže tímu stojace nablízku
neobrátia botov proti tomu tímu.

## Náhodná aréna

Náhodná aréna nemá botov: každé miesto je skutočný hráč a čakáš,
kým ich bude vo fronte dosť.
`;export{e as default};
//# sourceMappingURL=bots-yZW_5MIk.js.map