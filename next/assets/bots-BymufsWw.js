var e=`# Boti

**Bot** je hráč, za kterého hraje hra. V lobby, kterou hostuješ, hrají boti každé místo, které nikdo neobsadil, takže si můžeš zatrénovat nebo hrát s menším počtem přátel.

## Kdo hraje za bota

Boty nikdo nepřidává: lobby uvádí jen své lidi. Když [Týmové lobby](modes.md#týmové-lobby) skončí, každá strana hraje Týmový build, který si vybrala, a každou jeho postavu, kterou si nikdo nezabral, hraje bot pod jménem té postavy. Strana, na které nikdo není, hraje náhodný přednastavený tým samých botů. Kdo během Týmového lobby odejde, přenechá svou postavu botovi.

V lobby a Týmovém lobby vypadá bot jako kdokoli jiný. V zápase má na jmenovce, v rámečku cíle, v okně skupiny a v souhrnu zápasu značku **BOT**.

Boti jsou vytvoření na jeden zápas: jakmile skončí, lobby zase uvádí své lidi a boti dalšího zápasu se vytvoří znovu.

## Jak boti bojují

Bot hraje roli, kterou mu dává jeho build. Ten se zbraní na blízko je **v první linii**: přiblíží se a útočí na svůj cíl. Ten se dvěma nebo více léčeními nebo ochranami, které může seslat na spojence, je **léčitel**: stojí za nejvíc zraněným spojencem, daleko od nepřátel. Když se dva nebo více nepřátel soustředí na jednoho spojence, léčitel na něj dá ochranu dřív, než zásah dopadne. Každý další bot je **na dálku**: drží se tam, kam dosáhnou všechny jeho útoky, a stojí a bojuje s nepřítelem, který se přiblíží příliš. Boti na dálku a léčitelé přecházejí tam, kam na ně dosáhne méně nepřátel, a sloupy využívají jako krytí. Tým se obrátí na každého nepřítele v dosahu, který klesne pod 60 % zdraví, aby ho dorazil. V Králi kopce, když tvůj tým nedrží oltář, má přednost i před tím Přízračný hrdina druhého týmu na oltáři. V týmu botů bot, který se dostane daleko před svůj tým, počká na ostatní, než půjde dál. Boti ve tvém týmu místo toho zůstávají u tebe: ti v první linii o krok před tebou, ti na dálku vedle tebe, léčitelé za tebou, a jdou tam, kam jdeš ty. Jakmile už nějakou dobu nečinně stojíš, hrají dál tak, jak by hrál tým botů.
Dokud jsi aktivní, bot, kterého boj odtáhne daleko od tebe, se k tobě vrátí, pokud není těžce zraněný nebo u něj nestojí nepřítel.
Bot v první linii se obrátí proti nepříteli, který útočí na léčitele nebo sesilatele jeho týmu, pokud se právě nechystá dorazit svůj vlastní cíl.
Bot s plošným kouzlem ho sešle tam, kde stojí tři nebo více nepřátel pohromadě, pokud tým zrovna nedoráží nepřítele nebo nesleduje ohlášený cíl.
Bot s dovedností, která mrzačí nebo zpomaluje, ji použije na nepřítele po svém boku nebo na toho, kdo napadá léčitele či kouzelníky týmu, dřív než na cíl týmu.

Proti týmu s plošnými skilly se boti na dálku a léčitelé drží od sebe, aby jeden výbuch nezasáhl dva z nich. Krytí kvůli tomu nikdy neopustí.

Bot na dálku nebo léčitel, ke kterému se nepřítel dostane příliš blízko, nejprve ustoupí k nejbližšímu spojenci v první linii, je-li dost blízko, a bojuje tam. Zpomalený útočník na blízko, třeba zmrzačený, nestačí, takže před ním bot místo toho mezi výstřely couvá.

Bot pod prokletím, které trestá útočení nebo sesílání kouzel, jako Empathy nebo Backfire, s tím přestane, dokud prokletí neskončí.

Lučištníci a kopiníci zaujmou vyvýšené místo, když je to bezpečné.
Bot, na kterého se zaměří dva nepřátelé nebo který má méně než polovinu zdraví a rychle ho ztrácí, se jim až na tři sekundy schová z dohledu: za zeď, pod plošinu nebo na vyvýšené místo.
Když není žádný nepřítel poblíž, bot přehodí páku, která otevře kratší cestu k nepřátelům. Dva boti také probourají zeď, která skrývá mnohem kratší cestu, a bijí do ní svými zbraněmi.

Boti způsobující poškození si drží své velké zásahy, útočné dovednosti a poškozující kouzla, a pálí je společně na cíl týmu, aby poškození dopadlo najednou a nesypalo se postupně, aby ho léčitel stihl napravit: nejpomalejší kouzlo jde první, rychlejší o tolik později, o kolik je rychlejší. Mezitím dál máchají a sesílají svá prokletí a stavy. Bot čeká na spoluhráče nejvýše čtyři sekundy a vůbec nečeká, když dorazí nepřítele pod 30 % zdraví. Když je cíl pod ochranným očarováním, jako Protective Spirit nebo Aegis, sundá ho nejdřív bot se schopností odstraňovat očarování, například Strip Enchantment, a ostatní kvůli tomu své zásahy pozdrží.

Těžce zraněný bot, který prohrává svůj boj, ustoupí za svého léčitele nebo do své základny a odpočívá mimo dosah, dokud nemá zpátky většinu zdraví.

Bot oživí padlého spojence, jen když nepřátelé nejsou přímo na těle, poblíž stojí víc členů jeho týmu než těch jejich a nikdy když nepřítel poblíž zaměřuje samotného bota.

Boti uhýbají asi polovině dovedností letících na ně, jako je Fireball nebo šíp útočné dovednosti, takže zastavení nebo otočení na ně funguje stejně jako na tebe.

Boti obcházejí hořící zem a jiná škodlivá místa, když cesta kolem není o moc
delší, a z takového místa vystoupí, když v něm stojí.
Vystoupí také ze škodlivé oblasti nepřítele, jako je studna, ochrana proti nim nebo bouře, a bojují z jejího okraje.

Bot s přerušením si ho schovává na sesílání, na kterých záleží: nejdřív oživení nebo Přízračného hrdinu nárokujícího si oltář, pak léčení nebo ochranu, elitní dovednost nebo velký zásah, jako útočnou dovednost nebo poškozující kouzlo. Všechno ostatní a obyčejný úder zbraní nechá projít. Stejně jako hráč mine asi jedno ze čtyř takových sesílání.

Botovi trvá lidský okamžik, zlomek sekundy, než na událost zareaguje, takže ho rychlé přerušení nebo pozdní úskok může přelstít.

Když nikdo z tvého týmu nemá nahlášený cíl, jeden z tvých botů nahlásí nepřítele, na kterého se tvoji boti soustředí, stejně jako bys to udělal ty: vidíš značku a jméno bota, takže se můžeš přidat. Nahlášení od bota jen ukazuje, kam boti míří; i tak dál chrání spoluhráče a dorazí umírajícího nepřítele. Tvé nahlášení vždy vyhrává: všichni boti v týmu se soustředí na tvůj cíl, žádný bot tvé nahlášení nenahradí a boti nahlásí znovu až tehdy, když je nahlášený cíl mrtvý nebo pryč.

V boji tří týmů bojují boti vždy s jedním nepřátelským týmem: s tím, který na ně útočí, nebo, když nikdo neútočí, s nejvíc zraněným týmem v dosahu. Na tom týmu zůstávají, dokud jiný nepošle zjevně víc hráčů proti nim, a nevrhají se na čerstvý tým, když na ně útočí jiný. Cíl nahlášený jejich týmem má přednost, ať je na kterémkoli týmu. Počítají se jen hráči: duch nebo stráže týmu stojící poblíž boty na ten tým neobrátí.

## Náhodná aréna

Náhodná aréna nemá boty: každé místo je skutečný hráč a čekáš, dokud se jich nezařadí do fronty dost.
`;export{e as default};
//# sourceMappingURL=bots-BymufsWw.js.map