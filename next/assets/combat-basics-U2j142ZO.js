var e=`# Základy boje

## Zdraví a energie

Začínáš s 500 **zdraví** a 20 **energie** a zbroj ti energii přidává: Válečníkovi nic, Hraničáři, Zabijákovi nebo Dervišovi 5, všem ostatním 10. Hůl přidá dalších 10, dokud ji držíš. Runy a morálka mění obojí. Dovednosti stojí energii a ta se sama pomalu vrací. ![Válečník](../../../apps/web/public/icons/profession/warrior.svg) **Válečník** a ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** ji získávají nejpomaleji, ![Hraničář](../../../apps/web/public/icons/profession/ranger.svg) **Hraničář** o něco rychleji, všichni ostatní nejrychleji.

Šipky na tvých ukazatelích jsou **pipy**: každá znamená zdraví nebo energii, která se každou sekundu trochu vrací nebo ubývá. ![Krvácení](../../../apps/web/public/icons/status/bleeding.svg) **Krvácení**, ![Hoření](../../../apps/web/public/icons/status/burning.svg) **Hoření** a ![Otrava](../../../apps/web/public/icons/status/poison.svg) **Otrava** ubírají zdraví; Regeneration a léčivá kouzla ho přidávají. Když jsi 5 sekund mimo boj, začne se ti zdraví vracet samo, tím rychleji, čím déle mimo boj zůstaneš.

## Adrenalin

![Válečník](../../../apps/web/public/icons/profession/warrior.svg) **Válečník**, ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** a další mají dovednosti, které místo energie stojí **adrenalin**. Každá taková dovednost se nabíjí sama: každý zásah zbraní dá každé z nich jeden stupeň, stejně jako když schytáš velký zásah. Použití jedné ji vyprázdní a ostatním vezme jeden stupeň. Po 25 sekundách mimo boj se vyprázdní všechny.

## Používání dovednosti

Dovednost může chvíli trvat **seslat** a pak potřebuje čas na **obnovu**, než ji půjde použít znovu. Pokud je cíl mimo dosah, nejdřív k němu dojdeš. Pohyb nebo Esc sesílání zruší: energie je pryč, ale dovednost se neobnovuje. Po každé dovednosti s dobou sesílání, kromě ![Útočná dovednost](../../../apps/web/public/icons/skill-type/attack.svg) **útočné dovednosti**, následuje krátká pauza, ve které nemůžeš jednat.

Dovednost stisknutá během používání jiné nebo během té pauzy se **zařadí do fronty**: přijde na řadu jako další a její pozice do té doby pulzuje. Čekat může jen jedna; stisknutí jiné ji nahradí. Pohyb, Esc, přerušení nebo sražení ji zahodí.

![Pokřik](../../../apps/web/public/icons/skill-type/shout.svg) **Pokřiky** a ![Postoj](../../../apps/web/public/icons/skill-type/stance.svg) **postoje** se nikdy neřadí do fronty: spustí se okamžitě, i když sesíláš jinou dovednost, během té pauzy nebo když ležíš sražený. Sesílání pokračuje dál. Takto použité tě k cíli nedovedou: mimo dosah jsou odmítnuté.

## Přerušení a sražení

**Přerušení** zastaví dovednost nepřítele během jejího sesílání. Jeho energie je utracená a dovednost se obnovuje; některá přerušení dovednost navíc na chvíli zablokují. Přerušíš-li příliš brzy nebo příliš pozdě, nestane se nic.

Sesílání každé profese má vlastní zvuk; poslouchej zvuk svého cíle.

Většina přerušení zastaví i obyčejný útok uprostřed máchnutí: rána nedopadne a máchnutí začíná znovu. Nepřítel, který k cíli teprve jde, nemá co přerušit. Přerušení, jehož karta říká "a skill" nebo "a spell", obyčejný útok nechá být.

Některé ![Postoj](../../../apps/web/public/icons/skill-type/stance.svg) **postoje**, například Mantra of Concentration, zastaví přerušení mířené na tebe. Žádný z nich nezastaví sražení.

Když jsi **sražený**, chvíli se nemůžeš hýbat, útočit ani použít dovednost, s výjimkou ![Pokřik](../../../apps/web/public/icons/skill-type/shout.svg) **pokřiku** nebo postoje, a probíhající sesílání selže.

## Stavy, prokletí a očarování

**Stavy** ti škodí, dokud nevyprší nebo je někdo neodstraní:

| Stav                                                                                                | Co dělá                                               |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| ![Krvácení](../../../apps/web/public/icons/status/bleeding.svg) **Krvácení**                        | ubírá zdraví                                          |
| ![Hoření](../../../apps/web/public/icons/status/burning.svg) **Hoření**                             | rychle ubírá zdraví                                   |
| ![Otrava](../../../apps/web/public/icons/status/poison.svg) **Otrava**                              | ubírá zdraví                                          |
| ![Nemoc](../../../apps/web/public/icons/status/disease.svg) **Nemoc**                               | ubírá zdraví a šíří se na stejný druh těla vedle tebe |
| ![Ochromení](../../../apps/web/public/icons/status/crippled.svg) **Ochromení**                      | pohybuješ se poloviční rychlostí                      |
| ![Slepota](../../../apps/web/public/icons/status/blind.svg) **Slepota**                             | většina tvých útoků mine                              |
| ![Slabost](../../../apps/web/public/icons/status/weakness.svg) **Slabost**                          | tvoje zbraň zasahuje mnohem slaběji                   |
| ![Popraskané brnění](../../../apps/web/public/icons/status/cracked-armor.svg) **Popraskané brnění** | méně brnění                                           |
| ![Hluboká rána](../../../apps/web/public/icons/status/deep-wound.svg) **Hluboká rána**              | méně maximálního zdraví a léčení funguje méně         |
| ![Omámení](../../../apps/web/public/icons/status/dazed.svg) **Omámení**                             | kouzla se sesílají pomalu; každý útok je přeruší      |

Přisluhovači (kromě Masového golema), přízraky a duchové nekrvácejí, neotráví se ani neonemocní a duchové nedostanou žádné prokletí ani stav kromě **Hoření**.

![Prokletí](../../../apps/web/public/icons/skill-type/hex.svg) **Prokletí** na tebe sesílají nepřátelé, ![Očarování](../../../apps/web/public/icons/skill-type/enchantment.svg) **očarování** ty sám nebo tvoji spojenci. Každé odstraňuje vlastní druh dovedností. Některá očarování jsou **udržovaná**: trvají, dokud je neukončíš, a za jejich běhu stojí jeden pip energie. Ukončíš ho dvojklikem na jeho ikonu.

Několik dovedností přestane fungovat, když jsi pod očarováním, a začne znovu, jakmile nejsi. Dovednost trvající na "dalších N útoků" počítá každý útok, takže minutí nebo blok spotřebuje jeden útok stejně jako zásah.

## Brnění a poškození

![Válečník](../../../apps/web/public/icons/profession/warrior.svg) **Válečník** a ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** nosí nejvíc brnění; ![Hraničář](../../../apps/web/public/icons/profession/ranger.svg) **Hraničář**, ![Zabiják](../../../apps/web/public/icons/profession/assassin.svg) **Zabiják** a ![Derviš](../../../apps/web/public/icons/profession/dervish.svg) **Derviš** méně; sesilatelé nejméně. Brnění snižuje poškození zbraněmi, elementální, chaos a temné poškození. Svaté a stínové poškození, poškození bez typu, odsávání zdraví a kradení života ho ignorují. Kritické mohou být jen zásahy zbraní. Některá očarování činí svého nositele imunním vůči kritickým zásahům.

## Smrt, vzkříšení a morálka

Ve většině režimů mrtví zůstanou ležet, dokud je spojenec **neoživí** dovedností, například Resurrection Signet, kterou si může vzít kdokoli. Některé režimy vrací mrtvé ve vlnách nebo samy od sebe; viz [Režimy](modes.md).

Když jsi mrtvý, řádek pod skóre odpočítává do tvého návratu, nebo ti
řekne, ať počkáš na oživení. Okno družiny ukazuje odpočet u každého
mrtvého spojence.

Každá smrt tě stojí 15 % **morálky**, až na -60 %: spolu s ní se snižuje tvoje maximální zdraví a energie. Každý nepřítel, kterého tvůj tým zabije, z ní 2 % vrátí, až po 0. V Bitvě cechů ji držení stojanu vlajky zvedá i výš, až na +10 %.
`;export{e as default};
//# sourceMappingURL=combat-basics-U2j142ZO.js.map