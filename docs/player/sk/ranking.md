# Hodnotenie

## Čo je hodnotené

Každý zápas z frontu bez botov je hodnotený: Náhodná aréna a Tímová
aréna. Vlastná hra, Cvičisko a každý zápas s botom sú nehodnotené.
Nemá to žiadny prepínač ani samostatný front. Hodnotený zápas nikdy
nedoplní prázdne miesto botom.

## Tvoje hodnotenie

Tvoje hodnotenie patrí tvojmu kľúču hráča, tomu, ktorý si ukladá tento
prehliadač. Všetky postavy, ktoré na ňom hráš, majú jedno spoločné
hodnotenie.

Hodnotené fronty spájajú hráčov s podobným hodnotením a delia ich do
tímov s podobným priemerným hodnotením. Hľadanie začína v rozmedzí 100
bodov od tvojho hodnotenia a za každú sekundu čakania sa rozšíri o 10
bodov, až na 600, takže nikto nečaká večne. Počas čakania front ukazuje
tvoje hodnotenie.

Tvojich prvých 10 hodnotených zápasov je predbežných: front píše
**Predbežné (3/10 zápasov)** a zatiaľ nemáš poradie. Potom hlavná
ponuka ukazuje tvoje poradie. Hodnotenie chátra: každý deň bez
hodnoteného zápasu ho robí menej istým a rebríček zoraďuje podľa
opatrnej hodnoty, takže keď prestaneš hrať, tvoje poradie počas týždňov
klesne.

Keď má rebríček 20 zavedených hráčov, hodnotený zápas sa počíta, len ak
je v ňom aspoň jeden zavedený hráč (10 alebo viac hodnotených zápasov):
zápas len medzi novými hráčmi je nehodnotený. Zahraj si so zavedeným
hráčom a tvoje zápasy sa počítajú.

Tlačidlo **Rebríček** v hornej lište ukazuje najlepších 100 podľa
poradia, mena a hodnotenia, s tvojím riadkom zvýrazneným.

Hodnosť hrdinu (★) nie je toto hodnotenie: pochádza zo slávy, pozri
[Výstup hrdinov](modes.md#výstup-hrdinov).

## Začiatok zápasu

Keď sa nájde hodnotený zápas, všetci ho potvrdia do 15 sekúnd a
obrazovka ukazuje **Potvrdzovanie hodnoteného zápasu…**. Ak niekto
nepotvrdí, zápas sa zruší a všetci sú späť vo fronte.

## Koniec zápasu

Na konci všetci podpíšu výsledok do 30 sekúnd. Nepodpísanie sa počíta
ako odchod a odchod z hodnoteného zápasu sa počíta ako prehra, aj pre
hostiteľa. Tlačidlo odchodu to hovorí. Výsledok sa počíta, len ak ho
podpísala viac než polovica miest.

## Čo sa zverejňuje

Potvrdenka zápasu ide na verejné Nostr relaye. Obsahuje verejný kľúč a
meno postavy každého hráča (hráč bez postavy je uvedený ako starter) a
kto hral s kým. Môže ju čítať ktokoľvek a nedá sa vziať späť.
Nehodnotené zápasy nezverejňujú nič.

## Kedy sa aktualizuje

Tvoje hodnotenie sa zmení do hodiny a s ním aj rebríček.
