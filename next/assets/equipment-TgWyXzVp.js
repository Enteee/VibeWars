var e=`# Vybavení

Část **Vybavení** editoru buildů obsahuje tvoje zbraně a brnění. Zbraně a věci do druhé ruky přetáhni z knihovny vpravo, nebo je vybav kliknutím. Brnění se vybírá na figuríně, viz níže.

## Sady zbraní

Neseš až **čtyři sady zbraní**, každou se zbraní a, pokud zbraň nechá ruku volnou, s věcí do druhé ruky, například štítem nebo fokusem. Sada 1 je ta, se kterou začínáš; ostatní mohou zůstat prázdné.

V zápase přepínáš sady klávesami **1 až 4** (**F1 až F4** v klasických klávesách). Výměna počká na dokončení probíhajícího sesílání nebo máchnutí; pohyb nebo Esc vymění okamžitě. Nemá žádnou prodlevu. Tvoje útoky, dovednosti vyžadující určitou zbraň a tvoje maximální energie se řídí sadou v ruce.

Zbraň vyžaduje hodnost 9 ve svém atributu: pod ní zasahuje za třetinu svého poškození a editor to řekne červeně. Meč je vždy Swordsmanship, ale hůl, hůlka, štít nebo fokus se dělá pro atribut, který si zvolíš: klikni na příslušnou ruku na figuríně (**6** pro zbraň, **7** pro věc do druhé ruky) a jeden vyber.

## Vylepšení zbraní

Každá zbraň a věc do druhé ruky má pozice pro vylepšení: **předponu**, **příponu** a **nápis**. Vyber je kliknutím na ruku na figuríně nebo na její řádek vedle; každé říká, co dělá. Hůlka, štít a fokus nemají předponu; holé ruce také ne. Vylepšení má vždy svou nejlepší hodnotu a každá sada zbraní má svá vlastní, takže výměnou sad se vymění i jejich vylepšení: maximální zdraví a energie se mění se sadou v ruce. Výměna zbraně ponechá vylepšení, která na ni stále pasují, a řekne ti, která zahodila.

| Vylepšení                 | Pozice   | Pasuje na                               | Účinek                                    |
| ------------------------- | -------- | --------------------------------------- | ----------------------------------------- |
| Defensive                 | Předpona | Hůl                                     | Brnění +5                                 |
| Hale                      | Předpona | Hůl                                     | +30 zdraví                                |
| Insightful                | Předpona | Hůl                                     | Energie +5                                |
| of Defense                | Přípona  | jakákoli bojová zbraň, Hůl              | Brnění +5                                 |
| of Fortitude              | Přípona  | jakákoli bojová zbraň, Hůl, Štít, Fokus | +30 zdraví                                |
| of Shelter                | Přípona  | jakákoli bojová zbraň, Hůl              | Brnění +7 (proti fyzickému poškození)     |
| of Warding                | Přípona  | jakákoli bojová zbraň, Hůl              | Brnění +7 (proti elementálnímu poškození) |
| "Cast Out the Unclean"    | Nápis    | Štít, Fokus                             | Zkracuje Disease na tobě o 20 %           |
| "Fear Cuts Deeper"        | Nápis    | Štít, Fokus                             | Zkracuje Bleeding na tobě o 20 %          |
| "I Can See Clearly Now"   | Nápis    | Štít, Fokus                             | Zkracuje Blinded na tobě o 20 %           |
| "I have the power!"       | Nápis    | jakákoli bojová zbraň                   | Energie +5                                |
| "Leaf on the Wind"        | Nápis    | Štít, Fokus                             | Brnění +10 (proti chladu)                 |
| "Like a Rolling Stone"    | Nápis    | Štít, Fokus                             | Brnění +10 (proti zemi)                   |
| "Live for Today"          | Nápis    | Fokus                                   | Energie +15, regenerace energie -1        |
| "Not the face!"           | Nápis    | Štít, Fokus                             | Brnění +10 (proti drtivému poškození)     |
| "Only the Strong Survive" | Nápis    | Štít, Fokus                             | Zkracuje Weakness na tobě o 20 %          |
| "Pure of Heart"           | Nápis    | Štít, Fokus                             | Zkracuje Poison na tobě o 20 %            |
| "Riders on the Storm"     | Nápis    | Štít, Fokus                             | Brnění +10 (proti blesku)                 |
| "Seize the Day"           | Nápis    | Hůl, Hůlka                              | Energie +15, regenerace energie -1        |
| "Sleep Now in the Fire"   | Nápis    | Štít, Fokus                             | Brnění +10 (proti ohni)                   |
| "Soundness of Mind"       | Nápis    | Štít, Fokus                             | Zkracuje Dazed na tobě o 20 %             |
| "Strength of Body"        | Nápis    | Štít, Fokus                             | Zkracuje Deep Wound na tobě o 20 %        |
| "Swift as the Wind"       | Nápis    | Štít, Fokus                             | Zkracuje Crippled na tobě o 20 %          |
| "The Riddle of Steel"     | Nápis    | Štít, Fokus                             | Brnění +10 (proti sečnému poškození)      |
| "Through Thick and Thin"  | Nápis    | Štít, Fokus                             | Brnění +10 (proti bodnému poškození)      |

### Bojové předpony při zásahu

| Předpona                     | Pasuje na                    | Co dělá při zásahu                                              |
| ---------------------------- | ---------------------------- | --------------------------------------------------------------- |
| Vampiric                     | jakákoli bojová zbraň        | ukradne 3 zdraví (5 u kladiva, kosy, luků); -1 regen zdraví     |
| Zealous                      | jakákoli bojová zbraň        | získá 1 energii; -1 regen energie                               |
| Sundering                    | jakákoli bojová zbraň        | 20% šance na +20 % průrazu brnění                               |
| Furious                      | bojové, kromě luků           | 10% šance na dvojnásobný adrenalin                              |
| Barbed, Crippling, Poisonous | bojové, kromě kladiva        | Bleeding, Crippled, Poison, které způsobíš, trvají o 33 % déle  |
| Cruel                        | bojové, kromě luků           | Deep Wound, který způsobíš, trvá o 33 % déle                    |
| Heavy                        | sekera, kladivo, kosa, oštěp | Weakness, který způsobíš, trvá o 33 % déle                      |
| Silencing                    | dýky, oštěp, luky            | Dazed, který způsobíš, trvá o 33 % déle                         |
| Ebon, Fiery, Icy, Shocking   | jakákoli bojová zbraň        | její poškození se změní na zemní, ohnivé, chladné nebo bleskové |

"Při zásahu" znamená zásah útokem nebo útočnou dovedností, který dopadl: zablokovaný nebo minutý neudělá nic. Prodlouženým stavem se rozumí stav, který způsobí tvoje útočná dovednost.

### Vylepšení závislá na tvém stavu

Vylepšení závislá na tvém stavu platí jen, dokud stav trvá. "Nad" nebo "pod polovinou zdraví" je přesně tak: na přesné polovině neplatí ani jedno. Když skončí zvýšené maximum, zdraví nebo energie nad novým maximem se ztratí.

| Vylepšení                                          | Pozice, pasuje na         | Co dělá                                            |
| -------------------------------------------------- | ------------------------- | -------------------------------------------------- |
| "Strength and Honor"                               | nápis, bojová             | +15 % poškození zbraní nad polovinou zdraví        |
| "Guided by Fate", "Dance with Death"               | nápis, bojová             | +15 % poškození zbraní pod očarováním, v postoji   |
| "Too Much Information"                             | nápis, bojová             | +15 % poškození zbraní proti prokletému nepříteli  |
| "Vengeance is Mine"                                | nápis, bojová             | +20 % poškození zbraní pod polovinou zdraví        |
| "Don't Fear the Reaper"                            | nápis, bojová             | +20 % poškození zbraní, když jsi prokletý          |
| "To the Pain!"                                     | nápis, bojová             | +15 % poškození zbraní; -10 brnění při útoku       |
| "Brawn over Brains"                                | nápis, bojová             | +15 % poškození zbraní; -5 energie                 |
| "Hale and Hearty", "Have Faith"                    | nápis, jakákoli zbraň     | +5 energie nad polovinou zdraví, pod očarováním    |
| "Don't call it a comeback!", "I am Sorrow."        | nápis, jakákoli zbraň     | +7 energie pod polovinou zdraví, když jsi prokletý |
| of Devotion, of Endurance                          | přípona, hůl, štít, fokus | +45 zdraví pod očarováním, v postoji               |
| of Valor                                           | přípona, hůl, štít, fokus | +60 zdraví, když jsi prokletý                      |
| "Luck of the Draw"                                 | nápis, štít nebo fokus    | 20% šance, že fyzický zásah udělí o 5 méně         |
| "Sheltered by Faith", "Run For Your Life!"         | nápis, štít nebo fokus    | fyzické zásahy o 2 méně pod očarováním, v postoji  |
| "Nothing to Fear"                                  | nápis, štít nebo fokus    | fyzické zásahy o 3 méně, když jsi prokletý         |
| "Hail to the King", "Faith is My Shield"           | nápis, fokus              | +5 brnění nad polovinou zdraví, pod očarováním     |
| "Might makes Right", "Knowing is Half the Battle." | nápis, fokus              | +5 brnění při útoku, při sesílání kouzla           |
| "Man for All Seasons", "Survival of the Fittest"   | nápis, fokus              | +5 brnění proti elementálnímu, fyzickému poškození |
| "Ignorance is Bliss", "Life is Pain"               | nápis, fokus              | +5 brnění; -5 energie, -20 zdraví                  |
| "Down But Not Out", "Be Just and Fear Not"         | nápis, fokus              | +10 brnění pod polovinou zdraví, když jsi prokletý |

Poškození zbraní je vlastní hod zbraně: bonusové poškození útočné dovednosti se nezvyšuje.

### Vylepšení pro sesilatele

Vylepšení pro sesilatele působí jen na kouzla, každé vlastní šancí, když nějaké použiješ. "Atribut předmětu" je atribut, pro který je hůl, hůlka nebo fokus udělaná. Dvě vylepšení na poloviční hodnotu, která se spustí obě, stále polovinu uplatní jen jednou.

| Vylepšení                   | Pozice, pasuje na        | Co dělá                                                  |
| --------------------------- | ------------------------ | -------------------------------------------------------- |
| Adept                       | předpona, hůl            | 20% šance na poloviční sesílání kouzel atributu předmětu |
| Swift                       | předpona, hůl            | 10% šance na poloviční sesílání libovolného kouzla       |
| of Aptitude                 | přípona, fokus           | 20% šance na poloviční sesílání kouzel atributu předmětu |
| of Swiftness                | přípona, fokus           | 10% šance na poloviční sesílání libovolného kouzla       |
| "Aptitude not Attitude"     | nápis, hůl nebo hůlka    | 20% šance na poloviční sesílání kouzel atributu předmětu |
| "Don't think twice"         | nápis, hůl nebo hůlka    | 10% šance na poloviční sesílání libovolného kouzla       |
| of Memory                   | přípona, hůlka           | 20% šance na poloviční obnovu kouzel atributu předmětu   |
| of Quickening               | přípona, hůlka           | 10% šance na poloviční obnovu libovolného kouzla         |
| "Let the Memory Live Again" | nápis, hůl nebo hůlka    | 10% šance na poloviční obnovu libovolného kouzla         |
| "Forget Me Not"             | nápis, fokus             | 20% šance na poloviční obnovu kouzel atributu předmětu   |
| "Serenity Now"              | nápis, fokus             | 10% šance na poloviční obnovu libovolného kouzla         |
| of Mastery                  | přípona, hůl             | 20% šance, že atribut předmětu je pro kouzlo +1          |
| "Master of My Domain"       | nápis, štít nebo fokus   | 20% šance, že atribut předmětu je pro kouzlo +1          |
| of Enchanting               | přípona, bojová nebo hůl | očarování, která sešleš, trvají o 20 % déle              |

## Brnění

Brnění má pět kusů: hlava, hruď, ruce, nohy a chodidla. Každý kus má dvě pozice na vylepšení:

- **insignii**, malý bonus na daném kusu: například víc brnění proti fyzickému poškození nebo při útoku;
- **runu**.

Tvoje **pokrývka hlavy** přidá +1 k jednomu atributu, který si zvolíš.

V editoru je brnění figurína. Klikni na očíslovaný kus nebo na jeho řádek vedle a vyber jeho insignii a runu; každá volba říká, co na tomto kusu dělá. **Použít insignie na všechny (5)** dá vybranou insignii na každý kus. Figurína ukazuje insignii a runu každého kusu a drží zbraně sady, kterou si prohlížíš, s jejich vylepšeními.

## Runy

| Runa                                   | Co dává                                   |
| -------------------------------------- | ----------------------------------------- |
| Menší runa atributu                    | +1 k atributu                             |
| Větší runa atributu                    | +2 k atributu, -35 zdraví                 |
| Nejvyšší runa atributu                 | +3 k atributu, -75 zdraví                 |
| Vigor                                  | víc zdraví (+30, +41 nebo +50)            |
| Vitae                                  | +10 zdraví                                |
| Attunement                             | víc energie (+3, +6 nebo +9)              |
| Clarity, Purity, Recovery, Restoration | dva stavy vyprší každý o 20 % dříve       |
| Absorption (Warrior)                   | méně fyzického poškození z každého zásahu |

Runu kusu vybíráš na stejném místě jako jeho insignii: klikni na kus na figuríně.

Editor všechno sečte za tebe: zdraví, energii, brnění a poškození, jak je má tvoje první sada zbraní.
`;export{e as default};
//# sourceMappingURL=equipment-TgWyXzVp.js.map